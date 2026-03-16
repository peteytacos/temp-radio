"use client";

import type { ConnectionDiagnostics } from "@/hooks/useWebRTC";

// Overlay positions derived from radio.jpg (1206×2622px)
// To recalibrate: measure pixel coords, divide by image dimensions
const IMG = { w: 1206, h: 2622 } as const;
const SCREEN = { top: 800, left: 245, right: 945, bottom: 1300 } as const;
const BUTTON = { top: 1625, left: 660, right: 940, bottom: 1945 } as const;
const LED = { x: 285, y: 1400 } as const;

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

interface Props {
  roomId: string;
  isConnected: boolean;
  isEnabled: boolean;
  isSpeaking: boolean;
  participantCount: number;
  roomClosed: boolean;
  diagnostics?: ConnectionDiagnostics;
  onActivate?: () => void;
  onPTTStart: () => void;
  onPTTEnd: () => void;
  children: React.ReactNode;
}

function formatDiagLine(d: ConnectionDiagnostics, isConnected: boolean): string {
  if (!isConnected) return "NO LINK";
  const type = d.connectionType === "relay" ? "RLY" : d.connectionType === "direct" ? "P2P" : "---";
  const ping = d.rttMs !== null ? `${d.rttMs}ms` : "--";
  const links = `${d.connectedPeers}/${d.totalPeers}`;
  const ice = d.iceState ? d.iceState.toUpperCase().slice(0, 4) : "--";
  return `${type}  PING:${ping}  LINKS:${links}  ICE:${ice}`;
}

export default function RadioShell({
  roomId,
  isConnected,
  isEnabled,
  isSpeaking,
  participantCount,
  roomClosed,
  diagnostics,
  onActivate,
  onPTTStart,
  onPTTEnd,
  children,
}: Props) {
  const diagLine = diagnostics ? formatDiagLine(diagnostics, isConnected) : null;
  return (
    <div className="w-full max-w-[480px] mx-auto relative select-none">
      <img
        src="/radio.jpg"
        alt="Squelch Radio"
        className="w-full h-auto block"
        draggable={false}
      />

      {/* ===== GREEN SCREEN OVERLAY ===== */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: pct(SCREEN.top, IMG.h),
          left: pct(SCREEN.left, IMG.w),
          width: pct(SCREEN.right - SCREEN.left, IMG.w),
          height: pct(SCREEN.bottom - SCREEN.top, IMG.h),
          borderRadius: "3%",
        }}
      >
        <div
          className="w-full h-full relative"
          style={{ backgroundColor: "#7ce580" }}
        >
          {/* Scanline overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.03,
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)",
            }}
          />

          <div className="relative z-10 h-full flex flex-col p-[5%]">
            {children}
          </div>

          {/* Build number */}
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: 2,
              right: "5%",
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(5px, 1vw, 7px)",
              color: "rgba(38, 83, 39, 0.5)",
              zIndex: 20,
              userSelect: "none",
            }}
          >
            build:{process.env.NEXT_PUBLIC_BUILD_NUMBER}
          </div>
        </div>
      </div>

      {/* ===== POWER LED ===== */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ top: pct(LED.y, IMG.h), left: pct(LED.x, IMG.w) }}
      >
        <div
          className="w-2 h-2 rounded-full transition-all duration-300"
          style={{
            backgroundColor: !isEnabled
              ? "#c53030"
              : isSpeaking
                ? "#4ade80"
                : "#d4a017",
            boxShadow: !isEnabled
              ? "0 0 8px rgba(197, 48, 48, 0.8)"
              : isSpeaking
                ? "0 0 8px rgba(74, 222, 128, 0.8)"
                : "0 0 8px rgba(212, 160, 23, 0.8)",
          }}
        />
      </div>

      {/* ===== STATUS TEXT (row 1 — next to LED) ===== */}
      <div
        className="absolute"
        style={{
          top: pct(LED.y, IMG.h),
          left: pct(LED.x + 40, IMG.w),
          width: pct(SCREEN.right - LED.x - 40, IMG.w),
          transform: "translateY(-60%)",
        }}
      >
        <span
          className="tracking-wider uppercase"
          style={{
            fontSize: "clamp(7px, 1.6vw, 10px)",
            fontFamily: "var(--font-mono)",
            color: !isEnabled ? "#c53030" : isSpeaking ? "#4ade80" : "#d4a017",
          }}
        >
          {roomClosed
            ? "STATION CLOSED"
            : isSpeaking
              ? "TRANSMITTING"
              : isEnabled
                ? "STANDBY"
                : "DISABLED"}
        </span>
      </div>

      {/* ===== DIAGNOSTICS (right-aligned under green screen) ===== */}
      {diagLine && (
        <div
          className="absolute"
          style={{
            top: pct(SCREEN.bottom + 45, IMG.h),
            right: pct(IMG.w - SCREEN.right + 35, IMG.w),
            textAlign: "right",
          }}
        >
          <span
            className="tracking-[0.12em] uppercase"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(5px, 1.2vw, 8px)",
              color: "rgba(212, 160, 23, 0.8)",
            }}
          >
            {diagLine}
          </span>
        </div>
      )}

      {/* ===== PTT BUTTON OVERLAY ===== */}
      <button
        className="absolute focus:outline-none"
        style={{
          top: pct(BUTTON.top, IMG.h),
          left: pct(BUTTON.left, IMG.w),
          width: pct(BUTTON.right - BUTTON.left, IMG.w),
          height: pct(BUTTON.bottom - BUTTON.top, IMG.h),
          background: isSpeaking
            ? "rgba(197, 48, 48, 0.15)"
            : "transparent",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
        }}
        onMouseDown={onActivate ?? onPTTStart}
        onMouseUp={onActivate ? undefined : onPTTEnd}
        onMouseLeave={onActivate ? undefined : onPTTEnd}
        onTouchStart={(e) => {
          e.preventDefault();
          (onActivate ?? onPTTStart)();
        }}
        onTouchEnd={
          onActivate
            ? undefined
            : (e) => {
                e.preventDefault();
                onPTTEnd();
              }
        }
        onTouchCancel={onActivate ? undefined : onPTTEnd}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={onActivate ? "Activate radio" : "Push to talk"}
      />
    </div>
  );
}
