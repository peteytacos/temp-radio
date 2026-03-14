"use client";

import { RefObject } from "react";
import WaveformVisualiser from "./WaveformVisualiser";
import LiveIndicator from "./LiveIndicator";
import ListenerCount from "./ListenerCount";

interface Props {
  roomId: string;
  isLive: boolean;
  isBroadcasterOnline: boolean;
  analyser: RefObject<AnalyserNode | null>;
  vuLevel: number;
  listenerCount: number;
  statusText?: string;
  children?: React.ReactNode;
}

export default function RadioShell({
  roomId,
  isLive,
  isBroadcasterOnline,
  analyser,
  vuLevel,
  listenerCount,
  statusText = "STANDBY",
  children,
}: Props) {
  // Derive a frequency and channel from the roomId for display
  const freq =
    roomId === "------"
      ? "--.-"
      : (parseInt(roomId.slice(0, 2), 36) % 200 + 800) / 10;
  const ch =
    roomId === "------"
      ? "--"
      : String((parseInt(roomId.slice(-2), 36) % 99) + 1).padStart(2, "0");

  return (
    <div className="w-full max-w-[480px] mx-auto relative select-none">
      {/* The actual radio image as the base */}
      <img
        src="/radio.png"
        alt="Temp Radio"
        className="w-full h-auto block"
        draggable={false}
      />

      {/* ===== GREEN LCD OVERLAY AREA =====
          This is positioned over the green screen area of the radio image.
          Coordinates are percentage-based relative to the image dimensions.
          Adjust these values if the image changes. */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: "21.5%",
          left: "9%",
          width: "82%",
          height: "25.5%",
        }}
      >
        {/* Green LCD background with slight transparency to blend with image */}
        <div
          className="w-full h-full relative"
          style={{
            background: "linear-gradient(180deg, rgba(20,55,20,0.92) 0%, rgba(10,35,10,0.95) 50%, rgba(8,25,8,0.95) 100%)",
          }}
        >
          {/* Scanline overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.6) 2px, rgba(0,0,0,0.6) 4px)",
            }}
          />

          <div className="relative z-10 h-full flex flex-col p-[5%]">
            {/* Header */}
            <div
              className="text-center text-green-400 font-bold tracking-[0.12em] py-[2%] border border-green-700/40 rounded-sm mb-[3%]"
              style={{
                fontSize: "clamp(8px, 2.2vw, 13px)",
                fontFamily: "var(--font-mono)",
                textShadow: "0 0 8px rgba(0,255,0,0.5)",
              }}
            >
              TEMP RADIO COMMS UNIT
            </div>

            {/* Main content: waveform left, info right */}
            <div className="flex-1 flex gap-[3%] min-h-0">
              {/* Waveform area */}
              <div className="flex-1 border border-green-800/40 rounded-sm overflow-hidden relative">
                <WaveformVisualiser analyser={analyser} isActive={isLive} />
              </div>

              {/* Right info panel */}
              <div className="flex flex-col justify-between" style={{ width: "38%" }}>
                {/* Frequency */}
                <div className="text-right">
                  <span
                    className="text-green-400/50 block"
                    style={{ fontSize: "clamp(6px, 1.5vw, 9px)", fontFamily: "var(--font-mono)" }}
                  >
                    FM
                  </span>
                  <span
                    className="text-green-300 font-bold leading-none block"
                    style={{
                      fontSize: "clamp(18px, 5vw, 32px)",
                      fontFamily: "var(--font-mono)",
                      textShadow: "0 0 12px rgba(0,255,0,0.6)",
                    }}
                  >
                    {freq}
                  </span>
                  <span
                    className="text-green-400/50"
                    style={{ fontSize: "clamp(6px, 1.5vw, 9px)", fontFamily: "var(--font-mono)" }}
                  >
                    MHz
                  </span>
                </div>

                {/* Callsign */}
                <div>
                  <span
                    className="text-green-400/50 block"
                    style={{ fontSize: "clamp(5px, 1.2vw, 8px)", fontFamily: "var(--font-mono)" }}
                  >
                    CALLSIGN
                  </span>
                  <span
                    className="text-green-400 font-bold"
                    style={{
                      fontSize: "clamp(8px, 2vw, 12px)",
                      fontFamily: "var(--font-mono)",
                      textShadow: "0 0 6px rgba(0,255,0,0.4)",
                    }}
                  >
                    {roomId === "------" ? "------" : roomId.toUpperCase()}
                  </span>
                </div>

                {/* Status badge */}
                <div
                  className="border border-green-700/40 rounded-sm px-[6%] py-[4%] text-center"
                  style={{
                    background: isBroadcasterOnline ? "rgba(0,255,0,0.08)" : "transparent",
                  }}
                >
                  <span
                    className={`font-bold tracking-wider leading-tight block whitespace-pre-line ${
                      isBroadcasterOnline ? "text-green-400" : "text-green-700"
                    }`}
                    style={{
                      fontSize: "clamp(6px, 1.4vw, 9px)",
                      fontFamily: "var(--font-mono)",
                      textShadow: isBroadcasterOnline ? "0 0 6px rgba(0,255,0,0.5)" : "none",
                    }}
                  >
                    {isBroadcasterOnline ? "WAVEFORM\nACTIVE" : "WAVEFORM\nINACTIVE"}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom row */}
            <div className="flex justify-between items-center mt-[2%]">
              <div className="border border-green-700/40 rounded-sm px-[3%] py-[1%]">
                <span
                  className="text-green-400 font-bold"
                  style={{
                    fontSize: "clamp(8px, 1.8vw, 12px)",
                    fontFamily: "var(--font-mono)",
                    textShadow: "0 0 6px rgba(0,255,0,0.4)",
                  }}
                >
                  CH {ch}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <LiveIndicator isLive={isLive} />
                {listenerCount > 0 && <ListenerCount count={listenerCount} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== PRESE/VOLUME indicator LED =====
          The green dot next to PRESE/VOLUME text */}
      <div
        className="absolute"
        style={{ top: "48.5%", left: "12%" }}
      >
        <div
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            isBroadcasterOnline
              ? "bg-green-400 shadow-[0_0_8px_rgba(0,255,0,0.8)]"
              : "bg-green-900/60"
          }`}
        />
      </div>

      {/* ===== STATUS TEXT below the LCD =====
          Overlays the "PRESE/VOLUME" label area */}
      <div
        className="absolute"
        style={{
          top: "48%",
          left: "16%",
          width: "68%",
        }}
      >
        <span
          className="text-[#7a8a6a] tracking-wider uppercase"
          style={{
            fontSize: "clamp(7px, 1.6vw, 10px)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {statusText}
        </span>
      </div>

      {/* ===== CONTROLS OVERLAY =====
          Below the screen, over the dial/button area.
          This is where action buttons and share links appear. */}
      <div
        className="absolute"
        style={{
          top: "54%",
          left: "6%",
          width: "88%",
          height: "28%",
        }}
      >
        <div className="w-full h-full flex flex-col justify-center px-[2%] gap-2">
          {children}
        </div>
      </div>
    </div>
  );
}
