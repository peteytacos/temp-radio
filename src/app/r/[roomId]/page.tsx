"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import RadioShell from "@/components/RadioShell";
import BroadcastButton from "@/components/BroadcastButton";
import ShareLink from "@/components/ShareLink";
import TuneInGate from "@/components/TuneInGate";
import { useBroadcaster } from "@/hooks/useBroadcaster";
import { useListener } from "@/hooks/useListener";

function BroadcasterView({ roomId, token }: { roomId: string; token: string }) {
  const router = useRouter();
  const {
    state,
    goLive,
    endBroadcast,
    closeSession,
    analyser,
    vuLevel,
    listenerCount,
  } = useBroadcaster(roomId, token);

  // Session was closed — redirect home
  useEffect(() => {
    if (state === "closed") {
      sessionStorage.removeItem(`temp-radio-token-${roomId}`);
      router.push("/");
    }
  }, [state, roomId, router]);

  const statusText =
    state === "live"
      ? "BROADCASTING"
      : state === "connecting"
        ? "CONNECTING..."
        : "READY";

  return (
    <RadioShell
      roomId={roomId}
      isLive={state === "live"}
      isBroadcasterOnline={state === "live"}
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
        onEndBroadcast={endBroadcast}
        onCloseSession={closeSession}
      />
    </RadioShell>
  );
}

function ListenerView({ roomId }: { roomId: string }) {
  const { state, tuneIn, analyser, vuLevel, listenerCount } = useListener(roomId);

  if (state === "ended") {
    return (
      <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center p-4">
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
              Station Closed
            </h2>
            <p
              className="text-green-400/50 text-sm"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              This station is no longer active.
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
      </div>
    );
  }

  const isPlaying = state === "playing";
  const isBroadcasterOnline = state === "playing" || state === "tune_in_gate";

  const statusText =
    state === "playing"
      ? "RECEIVING"
      : state === "tune_in_gate"
        ? "SIGNAL DETECTED"
        : state === "offline"
          ? "HOST OFFLINE"
          : state === "waiting"
            ? "AWAITING SIGNAL"
            : "CONNECTING...";

  return (
    <RadioShell
      roomId={roomId}
      isLive={isPlaying}
      isBroadcasterOnline={isBroadcasterOnline}
      analyser={analyser}
      vuLevel={vuLevel}
      listenerCount={listenerCount}
      statusText={statusText}
    >
      {state === "tune_in_gate" && <TuneInGate onTuneIn={tuneIn} />}
      {state === "waiting" && (
        <div className="text-center py-4">
          <div
            className="text-green-400/40 tracking-[0.3em] uppercase animate-pulse"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(9px, 2vw, 12px)" }}
          >
            Awaiting Signal...
          </div>
          <p
            className="text-green-400/25 mt-1"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 1.5vw, 10px)" }}
          >
            The host hasn&apos;t gone live yet
          </p>
        </div>
      )}
      {state === "offline" && (
        <div className="text-center py-4">
          <div
            className="text-yellow-400/60 tracking-[0.3em] uppercase"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(9px, 2vw, 12px)" }}
          >
            Host is offline
          </div>
          <p
            className="text-green-400/25 mt-1"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 1.5vw, 10px)" }}
          >
            Station is still open — waiting for them to return
          </p>
        </div>
      )}
      {state === "connecting" && (
        <div className="text-center py-4">
          <div
            className="text-green-400/40 tracking-[0.3em] uppercase animate-pulse"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(9px, 2vw, 12px)" }}
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
  const [role, setRole] = useState<"broadcaster" | "listener" | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
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
        <div
          className="text-green-400/40 text-xs tracking-[0.3em] uppercase animate-pulse"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center p-4">
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
