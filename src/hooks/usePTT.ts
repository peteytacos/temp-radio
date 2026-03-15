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

  // Set up analyser for local waveform visualization (once per stream)
  // Uses a cloned stream so it doesn't interfere with WebRTC on iOS
  useEffect(() => {
    if (!audioCtx || !micStream || analyserRef.current) return;
    const clone = micStream.clone();
    // Keep clone's track enabled so analyser always has data (original track toggles for WebRTC)
    clone.getAudioTracks().forEach((t) => { t.enabled = true; });
    const source = audioCtx.createMediaStreamSource(clone);
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
    if (isSpeakingRef.current || !isConnected) return;

    if (audioCtx?.state === "suspended") {
      audioCtx.resume();
    }

    // Unmute mic track so WebRTC sends audio
    if (micStream) {
      micStream.getAudioTracks().forEach((t) => { t.enabled = true; });
    }

    playSquelch();
    send(JSON.stringify({ type: "speaking_start" }));

    isSpeakingRef.current = true;
    setIsSpeaking(true);
  }, [isConnected, audioCtx, send, playSquelch, micStream]);

  const stopPTT = useCallback(() => {
    if (!isSpeakingRef.current) return;

    isSpeakingRef.current = false;
    setIsSpeaking(false);

    // Mute mic track so WebRTC stops sending audio
    if (micStream) {
      micStream.getAudioTracks().forEach((t) => { t.enabled = false; });
    }

    playSquelch();
    send(JSON.stringify({ type: "speaking_stop" }));
  }, [send, playSquelch, micStream]);

  return {
    isSpeaking,
    localAnalyser: analyserRef,
    startPTT,
    stopPTT,
  };
}
