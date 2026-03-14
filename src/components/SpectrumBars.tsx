"use client";

import { useRef, useEffect } from "react";

interface Props {
  analyser: React.RefObject<AnalyserNode | null>;
  isActive: boolean;
}

export default function SpectrumBars({ analyser, isActive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const barCount = 16;

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      const w = canvas!.width;
      const h = canvas!.height;

      ctx.fillStyle = "#0a2a0a";
      ctx.fillRect(0, 0, w, h);

      // Draw grid
      ctx.strokeStyle = "rgba(0, 255, 0, 0.08)";
      ctx.lineWidth = 0.5;
      for (let y = 0; y < h; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (!analyser.current || !isActive) {
        // Draw empty bars
        const barWidth = (w / barCount) - 2;
        for (let i = 0; i < barCount; i++) {
          ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
          ctx.fillRect(i * (barWidth + 2), h - 3, barWidth, 3);
        }
        return;
      }

      const node = analyser.current;
      const dataArray = new Uint8Array(node.frequencyBinCount);
      node.getByteFrequencyData(dataArray);

      const barWidth = (w / barCount) - 2;
      const step = Math.floor(dataArray.length / barCount);

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[i * step + j];
        }
        const avg = sum / step;
        const barHeight = (avg / 255) * h;

        // Green gradient based on height
        const intensity = avg / 255;
        if (intensity > 0.8) {
          ctx.fillStyle = "#ffff00";
        } else if (intensity > 0.6) {
          ctx.fillStyle = "#66ff66";
        } else {
          ctx.fillStyle = "#00cc00";
        }

        ctx.shadowColor = "#00ff00";
        ctx.shadowBlur = 4;
        ctx.fillRect(i * (barWidth + 2), h - barHeight, barWidth, barHeight);
        ctx.shadowBlur = 0;
      }
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [analyser, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={100}
      className="w-full h-full rounded-sm"
    />
  );
}
