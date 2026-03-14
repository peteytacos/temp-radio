"use client";

interface Props {
  roomId: string;
  isConnected: boolean;
  isSpeaking: boolean;
  speakingColor?: string;
  participantCount: number;
  roomClosed: boolean;
  onPTTStart: () => void;
  onPTTEnd: () => void;
  children: React.ReactNode;
}

export default function RadioShell({
  roomId,
  isConnected,
  isSpeaking,
  speakingColor,
  participantCount,
  roomClosed,
  onPTTStart,
  onPTTEnd,
  children,
}: Props) {
  return (
    <div className="w-full max-w-[480px] mx-auto relative select-none">
      <img
        src="/radio.jpg"
        alt="Temp Radio"
        className="w-full h-auto block"
        draggable={false}
      />

      {/* ===== GREEN SCREEN OVERLAY ===== */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: "21.5%",
          left: "9%",
          width: "82%",
          height: "25.5%",
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

          {/* Transmitting border pulse */}
          {isSpeaking && (
            <div
              className="absolute inset-0 pointer-events-none animate-pulse"
              style={{
                border: `2px solid ${speakingColor ?? "#265327"}`,
                opacity: 0.6,
              }}
            />
          )}

          <div className="relative z-10 h-full flex flex-col p-[5%]">
            {children}
          </div>
        </div>
      </div>

      {/* ===== POWER LED ===== */}
      <div className="absolute" style={{ top: "48.5%", left: "12%" }}>
        <div
          className="w-2 h-2 rounded-full transition-all duration-300"
          style={{
            backgroundColor: isConnected
              ? "#4ade80"
              : "rgba(74, 222, 128, 0.3)",
            boxShadow: isConnected
              ? "0 0 8px rgba(74, 222, 128, 0.8)"
              : "none",
          }}
        />
      </div>

      {/* ===== STATUS TEXT ===== */}
      <div
        className="absolute"
        style={{ top: "48%", left: "16%", width: "68%" }}
      >
        <span
          className="tracking-wider uppercase"
          style={{
            fontSize: "clamp(7px, 1.6vw, 10px)",
            fontFamily: "var(--font-mono)",
            color: isSpeaking ? "#c53030" : "#7a8a6a",
          }}
        >
          {roomClosed
            ? "STATION CLOSED"
            : isSpeaking
              ? "TRANSMITTING"
              : isConnected
                ? "STANDBY"
                : "CONNECTING..."}
        </span>
      </div>

      {/* ===== PTT BUTTON OVERLAY ===== */}
      {!roomClosed && (
        <button
          className="absolute focus:outline-none"
          style={{
            top: "59%",
            left: "64%",
            width: "22%",
            height: "11%",
            background: isSpeaking
              ? "rgba(197, 48, 48, 0.15)"
              : "transparent",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
          onMouseDown={onPTTStart}
          onMouseUp={onPTTEnd}
          onMouseLeave={onPTTEnd}
          onTouchStart={(e) => {
            e.preventDefault();
            onPTTStart();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            onPTTEnd();
          }}
          onTouchCancel={onPTTEnd}
          aria-label="Push to talk"
        />
      )}
    </div>
  );
}
