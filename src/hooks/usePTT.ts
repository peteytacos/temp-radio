"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { AUDIO_MIME_TYPE, TIMESLICE_MS, FFT_SIZE } from "@/lib/audio-config";

export function usePTT(
  audioCtx: AudioContext | null,
  send: (data: ArrayBuffer | string) => void,
  isConnected: boolean
) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const squelchRef = useRef<HTMLAudioElement | null>(null);
  const isSpeakingRef = useRef(false);

  // Preload squelch sound
  useEffect(() => {
    const audio = new Audio("/squelch.wav");
    audio.load();
    squelchRef.current = audio;
  }, []);

  const playSquelch = useCallback(() => {
    if (!squelchRef.current) return;
    const clone = squelchRef.current.cloneNode() as HTMLAudioElement;
    clone.play().catch(() => {});
  }, []);

  const startPTT = useCallback(async () => {
    if (isSpeakingRef.current || !isConnected || !audioCtx) return;

    // Resume AudioContext without await to preserve user gesture chain for getUserMedia
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    playSquelch();

    // Acquire mic on first press, reuse after
    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const source = audioCtx.createMediaStreamSource(streamRef.current);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        return;
      }
    }

    // Signal speaking start
    send(JSON.stringify({ type: "speaking_start" }));

    // Start recording
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: AUDIO_MIME_TYPE,
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        event.data.arrayBuffer().then((buf) => send(buf));
      }
    };

    recorder.start(TIMESLICE_MS);
    isSpeakingRef.current = true;
    setIsSpeaking(true);
  }, [isConnected, audioCtx, send, playSquelch]);

  const stopPTT = useCallback(() => {
    if (!isSpeakingRef.current) return;

    isSpeakingRef.current = false;
    setIsSpeaking(false);

    const recorder = recorderRef.current;
    recorderRef.current = null;

    playSquelch();

    if (recorder?.state === "recording") {
      // Wait for the final dataavailable to fire before signaling stop
      recorder.onstop = () => {
        send(JSON.stringify({ type: "speaking_stop" }));
      };
      recorder.stop();
    } else {
      send(JSON.stringify({ type: "speaking_stop" }));
    }
  }, [send, playSquelch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    isSpeaking,
    localAnalyser: analyserRef,
    startPTT,
    stopPTT,
  };
}
