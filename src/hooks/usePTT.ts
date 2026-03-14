"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

export function usePTT(
  audioCtx: AudioContext | null,
  send: (data: string) => void,
  isConnected: boolean,
  gainNode: React.RefObject<GainNode | null>,
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

  // Set up analyser for local waveform visualization (once per stream)
  useEffect(() => {
    if (!audioCtx || !micStream || analyserRef.current) return;
    const source = audioCtx.createMediaStreamSource(micStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    source.connect(analyser);
    analyserRef.current = analyser;
  }, [audioCtx, micStream]);

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
    if (isSpeakingRef.current || !isConnected || !gainNode.current) return;

    if (audioCtx?.state === "suspended") {
      audioCtx.resume();
    }

    playSquelch();

    gainNode.current.gain.value = 1;
    send(JSON.stringify({ type: "speaking_start" }));

    isSpeakingRef.current = true;
    setIsSpeaking(true);
  }, [isConnected, audioCtx, send, playSquelch, gainNode]);

  const stopPTT = useCallback(() => {
    if (!isSpeakingRef.current) return;

    isSpeakingRef.current = false;
    setIsSpeaking(false);

    if (gainNode.current) {
      gainNode.current.gain.value = 0;
    }

    playSquelch();
    send(JSON.stringify({ type: "speaking_stop" }));
  }, [send, playSquelch, gainNode]);

  return {
    isSpeaking,
    localAnalyser: analyserRef,
    startPTT,
    stopPTT,
  };
}
