"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

export function usePTT(
  audioCtx: AudioContext | null,
  send: (data: string) => void,
  isConnected: boolean,
  micStream: MediaStream | null
) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const squelchBufferRef = useRef<AudioBuffer | null>(null);
  const isSpeakingRef = useRef(false);

  // Pre-decode squelch sound into AudioBuffer for instant playback
  useEffect(() => {
    if (!audioCtx) return;
    fetch("/squelch.wav")
      .then((res) => res.arrayBuffer())
      .then((buf) => audioCtx.decodeAudioData(buf))
      .then((decoded) => {
        squelchBufferRef.current = decoded;
      })
      .catch(() => {});
  }, [audioCtx]);

  // DIAGNOSTIC: Local waveform disabled to test if createMediaStreamSource
  // interferes with WebRTC on iOS. Will re-enable once audio works.

  const playSquelch = useCallback(() => {
    if (!squelchBufferRef.current || !audioCtx) return;
    const source = audioCtx.createBufferSource();
    source.buffer = squelchBufferRef.current;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.3;
    source.connect(gain);
    gain.connect(audioCtx.destination);
    source.start();
  }, [audioCtx]);

  const startPTT = useCallback(() => {
    if (isSpeakingRef.current || !isConnected) return;

    if (audioCtx?.state === "suspended") {
      audioCtx.resume();
    }

    playSquelch();
    send(JSON.stringify({ type: "speaking_start" }));

    isSpeakingRef.current = true;
    setIsSpeaking(true);
  }, [isConnected, audioCtx, send, playSquelch]);

  const stopPTT = useCallback(() => {
    if (!isSpeakingRef.current) return;

    isSpeakingRef.current = false;
    setIsSpeaking(false);

    playSquelch();
    send(JSON.stringify({ type: "speaking_stop" }));
  }, [send, playSquelch]);

  return {
    isSpeaking,
    localAnalyser: analyserRef,
    startPTT,
    stopPTT,
  };
}
