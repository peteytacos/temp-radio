"use client";

import { useRef, useCallback, useState } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

export function useAudioAnalyser() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [vuLevel, setVuLevel] = useState(0);
  const animFrameRef = useRef<number>(0);

  const createAnalyser = useCallback((audioCtx: AudioContext) => {
    audioCtxRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      setVuLevel(sum / dataArray.length / 255);
      animFrameRef.current = requestAnimationFrame(tick);
    }
    tick();

    return analyser;
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    audioCtxRef.current = null;
    setVuLevel(0);
  }, []);

  return { analyser: analyserRef, createAnalyser, vuLevel, cleanup };
}
