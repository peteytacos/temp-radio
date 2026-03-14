"use client";

import { useRef, useEffect } from "react";

export interface WaveformSource {
  id: number;
  analyser: AnalyserNode;
  color: string;
  active: boolean;
}

interface Props {
  sources: WaveformSource[];
}

export default function WaveformCanvas({ sources }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourcesRef = useRef<WaveformSource[]>(sources);
  const animRef = useRef<number>(0);

  sourcesRef.current = sources;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      const w = canvas!.width;
      const h = canvas!.height;
      const currentSources = sourcesRef.current;

      // Background (slightly darker than screen green for inset look)
      ctx.fillStyle = "#5fb861";
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "rgba(38, 83, 39, 0.12)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (currentSources.length === 0) {
        // Flat line when no sources
        ctx.strokeStyle = "rgba(38, 83, 39, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        return;
      }

      // Draw each speaker's waveform
      for (const source of currentSources) {
        const bufferLength = source.analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        source.analyser.getByteTimeDomainData(dataArray);

        ctx.save();
        ctx.strokeStyle = source.color;
        ctx.lineWidth = source.active ? 2.5 : 1;
        ctx.globalAlpha = source.active ? 1 : 0.3;

        if (source.active) {
          ctx.shadowColor = source.color;
          ctx.shadowBlur = 6;
        }

        ctx.beginPath();
        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * h) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }

        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={140}
      className="w-full h-full rounded-sm"
    />
  );
}
