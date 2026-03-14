"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useWebSocket } from "./useWebSocket";
import { useAudioAnalyser } from "./useAudioAnalyser";
import { AUDIO_MIME_TYPE } from "@/lib/audio-config";
import type { WSMessage } from "@/lib/ws-protocol";

type ListenerState = "connecting" | "waiting" | "tune_in_gate" | "playing" | "offline" | "ended";

export function useListener(roomId: string) {
  const [state, setState] = useState<ListenerState>("connecting");
  const [listenerCount, setListenerCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);
  const { analyser, createAnalyser, vuLevel, cleanup: cleanupAnalyser } = useAudioAnalyser();

  const setupAudioPlayback = useCallback(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    audio.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener("sourceopen", () => {
      try {
        const sb = mediaSource.addSourceBuffer(AUDIO_MIME_TYPE);
        sourceBufferRef.current = sb;

        function appendNext() {
          if (queueRef.current.length > 0 && sb && !sb.updating) {
            const chunk = queueRef.current.shift()!;
            try {
              sb.appendBuffer(chunk);
            } catch {
              // Buffer might be full or source removed
            }
          }
        }

        sb.addEventListener("updateend", () => {
          appendNext();
          try {
            if (sb.buffered.length > 0) {
              const end = sb.buffered.end(sb.buffered.length - 1);
              if (end > 10) sb.remove(0, end - 5);
            }
          } catch {
            // Ignore trim errors
          }
        });

        appendNext();
      } catch {
        // SourceBuffer creation failed
      }
    });

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(audio);
    const analyserNode = createAnalyser(audioCtx);
    source.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    return { audio, audioCtx };
  }, [createAnalyser]);

  const { state: wsState } = useWebSocket(`/ws/${roomId}?role=listener`, {
    onMessage: (event) => {
      if (typeof event.data === "string") {
        const msg: WSMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "status":
            if (msg.broadcasting) {
              setState((prev) =>
                prev === "connecting" || prev === "waiting" || prev === "offline"
                  ? "tune_in_gate"
                  : prev
              );
            } else {
              setState((prev) =>
                prev === "playing" ? "offline" : prev === "connecting" ? "waiting" : prev
              );
            }
            break;
          case "listeners":
            setListenerCount(msg.count);
            break;
          case "room_closed":
            setState("ended");
            break;
        }
      } else {
        // Binary audio data
        queueRef.current.push(event.data as ArrayBuffer);
        const sb = sourceBufferRef.current;
        if (sb && !sb.updating && queueRef.current.length > 0) {
          const chunk = queueRef.current.shift()!;
          try {
            sb.appendBuffer(chunk);
          } catch {
            queueRef.current.unshift(chunk);
          }
        }
      }
    },
    onOpen: () => {
      setState("waiting");
    },
    onClose: (event) => {
      if (event.code === 4004) {
        setState("ended");
      }
    },
  });

  const tuneIn = useCallback(async () => {
    const { audio, audioCtx } = setupAudioPlayback();

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    try {
      await audio.play();
    } catch {
      // Play might fail initially if no data yet
    }

    setState("playing");
  }, [setupAudioPlayback]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (mediaSourceRef.current?.readyState === "open") {
        try {
          mediaSourceRef.current.endOfStream();
        } catch {
          // Ignore
        }
      }
      cleanupAnalyser();
    };
  }, [cleanupAnalyser]);

  return { state, tuneIn, analyser, vuLevel, listenerCount };
}
