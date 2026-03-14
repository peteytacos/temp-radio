"use client";

import { RefObject } from "react";
import WaveformVisualiser from "./WaveformVisualiser";
import SpectrumBars from "./SpectrumBars";
import VUMeter from "./VUMeter";
import LiveIndicator from "./LiveIndicator";
import ListenerCount from "./ListenerCount";

interface Props {
  roomId: string;
  isLive: boolean;
  analyser: RefObject<AnalyserNode | null>;
  vuLevel: number;
  listenerCount: number;
  frequency?: string;
  channel?: string;
  statusText?: string;
  children?: React.ReactNode;
}

export default function RadioShell({
  roomId,
  isLive,
  analyser,
  vuLevel,
  listenerCount,
  frequency,
  channel,
  statusText = "STANDBY",
  children,
}: Props) {
  const freq = frequency || roomId.slice(0, 2) + "." + roomId.slice(2, 3);
  const ch = channel || parseInt(roomId.slice(-2), 36) % 99 + 1;

  return (
    <div className="w-full max-w-[420px] mx-auto">
      {/* Radio body - military/industrial look */}
      <div
        className="relative rounded-2xl p-1"
        style={{
          background: "linear-gradient(145deg, #5a5a4a 0%, #3a3a2a 20%, #2a2a1a 80%, #1a1a0a 100%)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.1)",
        }}
      >
        {/* Corner screws */}
        <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-gradient-to-br from-[#6a6a5a] to-[#3a3a2a] border border-[#2a2a1a] shadow-inner" />
        <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-gradient-to-br from-[#6a6a5a] to-[#3a3a2a] border border-[#2a2a1a] shadow-inner" />
        <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-gradient-to-br from-[#6a6a5a] to-[#3a3a2a] border border-[#2a2a1a] shadow-inner" />
        <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-gradient-to-br from-[#6a6a5a] to-[#3a3a2a] border border-[#2a2a1a] shadow-inner" />

        <div className="p-4 space-y-4">
          {/* Top knobs area */}
          <div className="flex justify-between items-center px-2">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#4a4a3a] to-[#1a1a0a] border-2 border-[#5a5a4a] shadow-lg" />
              <span className="text-[8px] text-[#8a8a7a] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                VFO/CH
              </span>
            </div>
            <div className="text-center">
              <div className="text-[#8a8a7a] text-[10px] tracking-[0.3em] uppercase" style={{ fontFamily: "var(--font-mono)" }}>
                AUDIO-SONIC
              </div>
              <div className="text-[#9a9a8a] text-lg font-bold tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                RS-100
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#4a4a3a] to-[#1a1a0a] border-2 border-[#5a5a4a] shadow-lg" />
              <span className="text-[8px] text-[#8a8a7a] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                VOL/SQL
              </span>
            </div>
          </div>

          {/* Label bar */}
          <div className="flex justify-between px-1">
            <span className="text-[9px] text-[#7a7a6a] tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
              TEMP RADIO
            </span>
            <span className="text-[9px] text-[#7a7a6a] tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
              TUNING/VOLUME
            </span>
          </div>

          {/* Main green LCD display area */}
          <div
            className="rounded-lg p-[3px] relative overflow-hidden"
            style={{
              background: "linear-gradient(145deg, #1a1a0a, #0a0a00)",
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8), 0 1px 1px rgba(255,255,255,0.05)",
            }}
          >
            <div
              className="rounded-md p-3 relative"
              style={{
                background: "linear-gradient(180deg, #1a3a1a 0%, #0d2a0d 50%, #0a1f0a 100%)",
                boxShadow: "inset 0 0 30px rgba(0, 255, 0, 0.05)",
              }}
            >
              {/* Scanline overlay */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.03] rounded-md"
                style={{
                  backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)",
                }}
              />

              {/* Header text */}
              <div
                className="text-center text-green-400 text-xs font-bold tracking-[0.15em] mb-2 py-1 border border-green-800/40 rounded-sm"
                style={{
                  fontFamily: "var(--font-mono)",
                  textShadow: "0 0 8px rgba(0, 255, 0, 0.5)",
                }}
              >
                TEMP RADIO COMMS UNIT
              </div>

              {/* Main display grid */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                {/* Left: Waveform */}
                <div className="border border-green-900/50 rounded-sm overflow-hidden" style={{ minHeight: "120px" }}>
                  <WaveformVisualiser analyser={analyser} isActive={isLive} />
                </div>

                {/* Right: Info panel */}
                <div className="flex flex-col gap-2 min-w-[100px]">
                  {/* Frequency display */}
                  <div className="text-right">
                    <span className="text-green-400/60 text-[9px] block" style={{ fontFamily: "var(--font-mono)" }}>FM</span>
                    <span
                      className="text-green-300 text-3xl font-bold leading-none"
                      style={{
                        fontFamily: "var(--font-mono)",
                        textShadow: "0 0 12px rgba(0, 255, 0, 0.6)",
                      }}
                    >
                      {freq}
                    </span>
                    <span className="text-green-400/60 text-[9px] ml-1" style={{ fontFamily: "var(--font-mono)" }}>MHz</span>
                  </div>

                  {/* Callsign */}
                  <div>
                    <span className="text-green-400/60 text-[8px] block" style={{ fontFamily: "var(--font-mono)" }}>CALLSIGN</span>
                    <span
                      className="text-green-400 text-xs font-bold"
                      style={{
                        fontFamily: "var(--font-mono)",
                        textShadow: "0 0 6px rgba(0, 255, 0, 0.4)",
                      }}
                    >
                      {roomId.toUpperCase()}
                    </span>
                  </div>

                  {/* Waveform status */}
                  <div
                    className="border border-green-800/40 rounded-sm px-2 py-1 text-center"
                    style={{
                      background: isLive ? "rgba(0, 255, 0, 0.08)" : "transparent",
                    }}
                  >
                    <span
                      className={`text-[9px] font-bold tracking-wider ${isLive ? "text-green-400" : "text-green-700"}`}
                      style={{
                        fontFamily: "var(--font-mono)",
                        textShadow: isLive ? "0 0 6px rgba(0, 255, 0, 0.5)" : "none",
                      }}
                    >
                      {isLive ? "WAVEFORM\nACTIVE" : "WAVEFORM\nINACTIVE"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom row: Channel + status */}
              <div className="flex justify-between items-center mt-2">
                <div className="border border-green-800/40 rounded-sm px-2 py-1">
                  <span
                    className="text-green-400 text-xs font-bold"
                    style={{
                      fontFamily: "var(--font-mono)",
                      textShadow: "0 0 6px rgba(0, 255, 0, 0.4)",
                    }}
                  >
                    CH {String(ch).padStart(2, "0")}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <LiveIndicator isLive={isLive} />
                  <ListenerCount count={listenerCount} />
                </div>
              </div>
            </div>
          </div>

          {/* Status label */}
          <div className="flex items-center gap-2 px-1">
            <div className={`w-2 h-2 rounded-full ${isLive ? "bg-green-400 shadow-[0_0_6px_rgba(0,255,0,0.6)]" : "bg-green-900"}`} />
            <span className="text-[9px] text-[#7a7a6a] tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
              {statusText}
            </span>
          </div>

          {/* Bottom controls area */}
          <div className="flex items-center gap-4 px-2">
            {/* VU / Spectrum area */}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <VUMeter level={vuLevel} />
                <div className="flex-1 h-16 border border-green-900/30 rounded-sm overflow-hidden">
                  <SpectrumBars analyser={analyser} isActive={isLive} />
                </div>
              </div>
            </div>
          </div>

          {/* Action area (buttons/share link) */}
          <div className="space-y-3 px-1">
            {children}
          </div>

          {/* Bottom label */}
          <div className="text-center pt-2">
            <span
              className="text-[#5a5a4a] text-[10px] tracking-[0.3em] uppercase"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              PUSH TO TALK / MENU
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
