"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import RadioShell from "@/components/RadioShell";
import WaveformCanvas, {
  type WaveformSource,
} from "@/components/WaveformCanvas";
import { useRoom } from "@/hooks/useRoom";
import { usePTT } from "@/hooks/usePTT";

export default function RoomPage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string>("");

  // Parse roomId from URL directly (static export doesn't hydrate useParams correctly)
  useEffect(() => {
    const match = window.location.pathname.match(/^\/r\/([^/]+)$/);
    if (match) setRoomId(match[1]);
  }, []);

  const [token, setToken] = useState<string | undefined>(undefined);
  const [tokenReady, setTokenReady] = useState(false);
  const [activated, setActivated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [radioEnabled, setRadioEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Read token from sessionStorage once roomId is known
  useEffect(() => {
    if (!roomId) return;
    const stored = sessionStorage.getItem(`temp-radio-token-${roomId}`);
    if (stored) setToken(stored);
    setTokenReady(true);
  }, [roomId]);

  const activate = useCallback(() => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();
    setActivated(true);
  }, []);

  const room = useRoom(roomId, tokenReady ? token : undefined, audioCtxRef.current, tokenReady);
  const ptt = usePTT(audioCtxRef.current, room.send, room.isConnected);

  // Build waveform sources for canvas
  const waveformSources = useMemo(() => {
    const sources: WaveformSource[] = [];

    // Local user's waveform (visible after first PTT press)
    if (ptt.localAnalyser.current && room.myId !== null) {
      sources.push({
        id: room.myId,
        analyser: ptt.localAnalyser.current,
        color: room.myColor,
        active: ptt.isSpeaking,
      });
    }

    // Remote speakers
    for (const [id, analyser] of room.speakerAnalysers) {
      sources.push({
        id,
        analyser,
        color: room.participants.get(id) ?? "#265327",
        active: room.activeSpeakers.has(id),
      });
    }

    return sources;
  }, [
    room.myId,
    room.myColor,
    room.speakerAnalysers,
    room.activeSpeakers,
    room.participants,
    ptt.isSpeaking,
    ptt.localAnalyser,
  ]);

  const handleCopy = useCallback(async () => {
    const url = `${window.location.origin}/r/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/r/${roomId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Squelch", url });
      } catch {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  }, [roomId, handleCopy]);

  const handleNewRadio = useCallback(() => {
    router.push("/");
  }, [router]);

  const toggleRadio = useCallback(() => setRadioEnabled((v) => !v), []);
  const noopPTT = useCallback(() => {}, []);

  // ===== ACTIVATION GATE =====
  if (!activated) {
    return (
      <div className="h-dvh bg-[#0a0a06] flex items-center justify-center overflow-hidden">
        <RadioShell
          roomId={roomId}
          isConnected={false}
          isEnabled={false}
          isSpeaking={false}
          participantCount={0}
          roomClosed={false}
          onActivate={activate}
          onPTTStart={noopPTT}
          onPTTEnd={noopPTT}
        >
          <div
            className="flex-1 flex flex-col items-center justify-center cursor-pointer"
            onClick={activate}
          >
            <div
              className="text-center font-bold tracking-[0.2em] uppercase animate-pulse"
              style={{
                color: "#265327",
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(10px, 2.5vw, 16px)",
              }}
            >
              TAP TO ACTIVATE
            </div>
            <div
              className="text-center mt-2 tracking-[0.1em] uppercase"
              style={{
                color: "rgba(38, 83, 39, 0.5)",
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(7px, 1.6vw, 10px)",
              }}
            >
              Hold the yellow button to talk
            </div>
          </div>
        </RadioShell>
      </div>
    );
  }

  // ===== ROOM CLOSED =====
  if (room.roomClosed) {
    return (
      <div className="h-dvh bg-[#0a0a06] flex items-center justify-center overflow-hidden">
        <RadioShell
          roomId={roomId}
          isConnected={false}
          isEnabled={false}
          isSpeaking={false}
          participantCount={0}
          roomClosed={true}
          onPTTStart={noopPTT}
          onPTTEnd={noopPTT}
        >
          <div className="flex-1 flex flex-col items-center justify-center">
            <div
              className="font-bold tracking-[0.2em] uppercase"
              style={{
                color: "#265327",
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(10px, 2.5vw, 16px)",
              }}
            >
              STATION CLOSED
            </div>
            <div
              className="mt-2 tracking-[0.1em] uppercase"
              style={{
                color: "rgba(38, 83, 39, 0.5)",
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(7px, 1.6vw, 10px)",
              }}
            >
              The host has left
            </div>
          </div>
          <div className="flex gap-1.5 mt-[2%]">
            <button
              onClick={handleNewRadio}
              className="px-2 py-1 rounded transition-colors"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(6px, 1.4vw, 9px)",
                color: "#265327",
                backgroundColor: "rgba(38, 83, 39, 0.1)",
                border: "1px solid rgba(38, 83, 39, 0.2)",
              }}
            >
              NEW RADIO
            </button>
          </div>
        </RadioShell>
      </div>
    );
  }

  // ===== ACTIVE ROOM =====
  return (
    <div className="h-dvh bg-[#0a0a06] flex items-center justify-center overflow-hidden">
      <RadioShell
        roomId={roomId}
        isConnected={room.isConnected}
        isEnabled={radioEnabled}
        isSpeaking={ptt.isSpeaking}
        participantCount={room.participantCount}
        roomClosed={false}
        onPTTStart={radioEnabled ? ptt.startPTT : noopPTT}
        onPTTEnd={radioEnabled ? ptt.stopPTT : noopPTT}
      >
        {/* Header */}
        <div
          className="text-center font-bold tracking-[0.12em] py-[1.5%] rounded-sm mb-[2%]"
          style={{
            fontSize: "clamp(7px, 2vw, 12px)",
            fontFamily: "var(--font-mono)",
            color: "#265327",
            border: "1px solid rgba(38, 83, 39, 0.25)",
          }}
        >
          SQUELCH TEMP COMMS
        </div>

        {/* Waveform */}
        <div
          className="flex-1 rounded-sm overflow-hidden min-h-0"
          style={{ border: "1px solid rgba(38, 83, 39, 0.25)" }}
        >
          <WaveformCanvas sources={waveformSources} />
        </div>

        {/* Info row */}
        <div
          className="flex justify-between items-center mt-[2%]"
          style={{
            color: "#265327",
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(7px, 1.6vw, 11px)",
          }}
        >
          <div
            className="font-bold rounded-sm px-[3%] py-[1%]"
            style={{ border: "1px solid rgba(38, 83, 39, 0.25)" }}
          >
            CH {roomId.toUpperCase()}
          </div>
          <div className="flex items-center gap-1">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span>{room.participantCount}</span>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex gap-1.5 mt-[2%]">
          <button
            onClick={handleNewRadio}
            className="px-2 py-1 rounded transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(6px, 1.4vw, 9px)",
              color: "#265327",
              backgroundColor: "rgba(38, 83, 39, 0.1)",
              border: "1px solid rgba(38, 83, 39, 0.2)",
            }}
          >
            NEW RADIO
          </button>
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(6px, 1.4vw, 9px)",
              color: "#265327",
              backgroundColor: "rgba(38, 83, 39, 0.1)",
              border: "1px solid rgba(38, 83, 39, 0.2)",
            }}
          >
            {copied ? "COPIED!" : "COPY"}
          </button>
          <button
            onClick={handleShare}
            className="px-2 py-1 rounded transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(6px, 1.4vw, 9px)",
              color: "#265327",
              backgroundColor: "rgba(38, 83, 39, 0.1)",
              border: "1px solid rgba(38, 83, 39, 0.2)",
            }}
          >
            SHARE
          </button>
          <button
            onClick={toggleRadio}
            className="px-2 py-1 rounded transition-colors ml-auto"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(6px, 1.4vw, 9px)",
              color: radioEnabled ? "#265327" : "#c53030",
              backgroundColor: radioEnabled
                ? "rgba(38, 83, 39, 0.1)"
                : "rgba(197, 48, 48, 0.1)",
              border: radioEnabled
                ? "1px solid rgba(38, 83, 39, 0.2)"
                : "1px solid rgba(197, 48, 48, 0.2)",
            }}
          >
            {radioEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </RadioShell>
    </div>
  );
}
