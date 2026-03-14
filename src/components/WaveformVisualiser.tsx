"use client";

import { useRef, useEffect } from "react";

interface Props {
  analyser: React.RefObject<AnalyserNode | null>;
  isActive: boolean;
}

export default function WaveformVisualiser({ analyser, isActive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      const w = canvas!.width;
      const h = canvas!.height;

      // Dark green background
      ctx.fillStyle = "#0a2a0a";
      ctx.fillRect(0, 0, w, h);

      // Draw grid lines
      ctx.strokeStyle = "rgba(0, 255, 0, 0.1)";
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

      if (!analyser.current || !isActive) {
        // Draw flat line when not active
        ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        return;
      }

      const node = analyser.current;
      const bufferLength = node.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      node.getByteTimeDomainData(dataArray);

      // Glow effect
      ctx.shadowColor = "#00ff00";
      ctx.shadowBlur = 8;

      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2.5;
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

      // Reset shadow
      ctx.shadowBlur = 0;
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [analyser, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={140}
      className="w-full h-full rounded-sm"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
