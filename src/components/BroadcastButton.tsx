"use client";

interface Props {
  isLive: boolean;
  isConnecting: boolean;
  onGoLive: () => void;
  onEndBroadcast: () => void;
  onCloseSession: () => void;
}

export default function BroadcastButton({
  isLive,
  isConnecting,
  onGoLive,
  onEndBroadcast,
  onCloseSession,
}: Props) {
  return (
    <div className="flex gap-2">
      {isLive ? (
        <>
          <button
            onClick={onEndBroadcast}
            className="flex-1 py-2.5 px-4 bg-yellow-700/80 hover:bg-yellow-600/80 text-yellow-100
                       font-bold tracking-wider uppercase rounded border border-yellow-600/50
                       transition-all active:scale-[0.98]"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2.5vw, 13px)" }}
          >
            PAUSE
          </button>
          <button
            onClick={onCloseSession}
            className="flex-1 py-2.5 px-4 bg-red-800/80 hover:bg-red-700/80 text-red-100
                       font-bold tracking-wider uppercase rounded border border-red-600/50
                       transition-all active:scale-[0.98]"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2.5vw, 13px)" }}
          >
            CLOSE STATION
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onGoLive}
            disabled={isConnecting}
            className="flex-1 py-2.5 px-4 bg-green-700/80 hover:bg-green-600/80 disabled:bg-green-900/50
                       disabled:opacity-50 text-green-100 font-bold tracking-wider uppercase rounded
                       border border-green-500/50 transition-all active:scale-[0.98]
                       shadow-[0_0_15px_rgba(0,255,0,0.15)]"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2.5vw, 13px)" }}
          >
            {isConnecting ? "CONNECTING..." : "GO LIVE"}
          </button>
          <button
            onClick={onCloseSession}
            className="py-2.5 px-4 bg-red-900/50 hover:bg-red-800/60 text-red-300/80
                       font-bold tracking-wider uppercase rounded border border-red-800/40
                       transition-all active:scale-[0.98]"
            style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2.5vw, 13px)" }}
          >
            CLOSE
          </button>
        </>
      )}
    </div>
  );
}
