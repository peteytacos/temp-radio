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
    <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center p-4">
      <div className="relative z-10">
        <RadioShell
          roomId="------"
          isLive={false}
          isBroadcasterOnline={false}
          analyser={dummyAnalyser}
          vuLevel={0}
          listenerCount={0}
          statusText="NO STATION"
        >
          <div className="text-center space-y-3">
            <p
              className="text-green-400/40 tracking-[0.15em] uppercase leading-relaxed"
              style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 1.8vw, 11px)" }}
            >
              Broadcast your voice. Share a link.<br />
              Close when you&apos;re done.
            </p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-3 px-6 font-bold tracking-[0.2em] uppercase
                         transition-all active:scale-[0.98] disabled:opacity-50 rounded
                         border border-green-600/40 text-green-400
                         hover:border-green-500/60 hover:bg-green-900/20"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(10px, 2.5vw, 14px)",
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
