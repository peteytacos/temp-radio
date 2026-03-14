"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import RadioShell from "@/components/RadioShell";
import BroadcastButton from "@/components/BroadcastButton";
import ShareLink from "@/components/ShareLink";
import TuneInGate from "@/components/TuneInGate";
import { useBroadcaster } from "@/hooks/useBroadcaster";
import { useListener } from "@/hooks/useListener";

type Role = "broadcaster" | "listener" | null;

function BroadcasterView({ roomId, token }: { roomId: string; token: string }) {
  const { state, goLive, endBroadcast, analyser, vuLevel, listenerCount } = useBroadcaster(roomId, token);

  const statusText = state === "live"
    ? "BROADCASTING"
    : state === "connecting"
    ? "CONNECTING..."
    : "PRESS GO LIVE";

  return (
    <RadioShell
      roomId={roomId}
      isLive={state === "live"}
      analyser={analyser}
      vuLevel={vuLevel}
      listenerCount={listenerCount}
      statusText={statusText}
    >
      <ShareLink roomId={roomId} />
      <BroadcastButton
        isLive={state === "live"}
        isConnecting={state === "connecting"}
        onGoLive={goLive}
        onEnd={endBroadcast}
      />
    </RadioShell>
  );
}

function ListenerView({ roomId }: { roomId: string }) {
  const { state, tuneIn, analyser, vuLevel, listenerCount } = useListener(roomId);

  if (state === "ended") {
    return (
      <div className="text-center space-y-6 py-12">
        <div className="space-y-2">
          <div
            className="text-green-400/40 text-xs tracking-[0.3em] uppercase"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            — SIGNAL LOST —
          </div>
          <h2
            className="text-green-400 text-xl font-bold tracking-wider"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Station Went Offline
          </h2>
          <p className="text-green-400/50 text-sm" style={{ fontFamily: "var(--font-mono)" }}>
            The broadcaster has disconnected.
          </p>
        </div>
        <a
          href="/"
          className="inline-block px-6 py-3 bg-green-900/40 hover:bg-green-800/50
                     border border-green-700/50 rounded text-green-300 text-sm
                     uppercase tracking-wider transition-colors"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Create Your Own Station
        </a>
      </div>
    );
  }

  const statusText = state === "playing"
    ? "RECEIVING"
    : state === "tune_in_gate"
    ? "SIGNAL DETECTED"
    : state === "waiting"
    ? "AWAITING SIGNAL"
    : "CONNECTING...";

  return (
    <RadioShell
      roomId={roomId}
      isLive={state === "playing"}
      analyser={analyser}
      vuLevel={vuLevel}
      listenerCount={listenerCount}
      statusText={statusText}
    >
      {state === "tune_in_gate" && <TuneInGate onTuneIn={tuneIn} />}
      {state === "waiting" && (
        <div className="text-center py-6">
          <div
            className="text-green-400/40 text-xs tracking-[0.3em] uppercase animate-pulse"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Awaiting Signal...
          </div>
          <p className="text-green-400/30 text-[10px] mt-2" style={{ fontFamily: "var(--font-mono)" }}>
            The broadcaster hasn&apos;t gone live yet
          </p>
        </div>
      )}
      {state === "connecting" && (
        <div className="text-center py-6">
          <div
            className="text-green-400/40 text-xs tracking-[0.3em] uppercase animate-pulse"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Connecting...
          </div>
        </div>
      )}
    </RadioShell>
  );
}

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [role, setRole] = useState<Role>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if this user is the broadcaster (has token in sessionStorage)
    const stored = sessionStorage.getItem(`temp-radio-token-${roomId}`);
    if (stored) {
      setRole("broadcaster");
      setToken(stored);
    } else {
      setRole("listener");
    }
  }, [roomId]);

  if (!role) {
    return (
      <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center">
        <div className="text-green-400/40 text-xs tracking-[0.3em] uppercase animate-pulse" style={{ fontFamily: "var(--font-mono)" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center p-4">
      {/* Subtle noise texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />

      <div className="relative z-10">
        {role === "broadcaster" && token ? (
          <BroadcasterView roomId={roomId} token={token} />
        ) : (
          <ListenerView roomId={roomId} />
        )}
      </div>
    </div>
  );
}
