"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import RadioShell from "@/components/RadioShell";

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const dummyAnalyser = useRef<AnalyserNode | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/create-room", { method: "POST" });
      const { roomId, token } = await res.json();
      sessionStorage.setItem(`temp-radio-token-${roomId}`, token);
      router.push(`/r/${roomId}`);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Noise texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />

      <div className="relative z-10">
        <RadioShell
          roomId="------"
          isLive={false}
          analyser={dummyAnalyser}
          vuLevel={0}
          listenerCount={0}
          frequency="--.-"
          statusText="NO STATION"
        >
          <div className="text-center space-y-4 py-2">
            <p
              className="text-green-400/40 text-[10px] tracking-[0.2em] uppercase leading-relaxed"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Broadcast your voice. Share a link.<br />
              Gone when you&apos;re done.
            </p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-3 px-6 font-bold text-sm tracking-[0.2em] uppercase
                         transition-all active:scale-[0.98] disabled:opacity-50 rounded
                         border border-green-600/40 text-green-400
                         hover:border-green-500/60 hover:bg-green-900/20"
              style={{
                fontFamily: "var(--font-mono)",
                background: "linear-gradient(145deg, rgba(0,60,0,0.3), rgba(0,30,0,0.3))",
                boxShadow: "0 0 20px rgba(0, 255, 0, 0.1)",
              }}
            >
              {creating ? "Creating..." : "Create a Station"}
            </button>
          </div>
        </RadioShell>
      </div>
    </div>
  );
}
