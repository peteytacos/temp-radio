"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useWebSocket } from "./useWebSocket";
import { useAudioAnalyser } from "./useAudioAnalyser";
import { AUDIO_MIME_TYPE, TIMESLICE_MS } from "@/lib/audio-config";
import type { WSMessage } from "@/lib/ws-protocol";

type BroadcasterState = "idle" | "connecting" | "live" | "error" | "closed";

export function useBroadcaster(roomId: string, token: string) {
  const [state, setState] = useState<BroadcasterState>("idle");
  const [listenerCount, setListenerCount] = useState(0);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const { analyser, createAnalyser, vuLevel, cleanup: cleanupAnalyser } = useAudioAnalyser();

  const { send, close: closeWs } = useWebSocket(wsUrl, {
    onMessage: (event) => {
      if (typeof event.data === "string") {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === "listeners") {
          setListenerCount(msg.count);
        } else if (msg.type === "room_closed") {
          setState("closed");
        }
      }
    },
    onClose: () => {
      if (state === "live") {
        // WS closed while live — just go back to idle (room persists)
        stopRecording();
        setState("idle");
      }
    },
  });

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cleanupAnalyser();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setWsUrl(null);
  }, [cleanupAnalyser]);

  const goLive = useCallback(async () => {
    try {
      setState("connecting");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = createAnalyser(audioCtx);
      source.connect(analyserNode);

      setWsUrl(`/ws/${roomId}?role=broadcaster&token=${token}`);
      setState("live");

      // Small delay to ensure WS is connected before starting recorder
      await new Promise((r) => setTimeout(r, 300));

      const recorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME_TYPE });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          event.data.arrayBuffer().then((buf) => send(buf));
        }
      };

      recorder.start(TIMESLICE_MS);
    } catch (err) {
      console.error("Failed to go live:", err);
      setState("error");
    }
  }, [roomId, token, send, createAnalyser]);

  const endBroadcast = useCallback(() => {
    stopRecording();
    closeWs();
    setState("idle");
  }, [closeWs, stopRecording]);

  const closeSession = useCallback(async () => {
    stopRecording();
    closeWs();
    try {
      await fetch("/api/close-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, token }),
      });
    } catch {
      // Best effort
    }
    setState("closed");
  }, [roomId, token, closeWs, stopRecording]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
      cleanupAnalyser();
    };
  }, [cleanupAnalyser]);

  return {
    state,
    goLive,
    endBroadcast,
    closeSession,
    analyser,
    vuLevel,
    listenerCount,
  };
}
