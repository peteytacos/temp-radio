"use client";

interface Props {
  isLive: boolean;
  isConnecting: boolean;
  onGoLive: () => void;
  onEnd: () => void;
}

export default function BroadcastButton({ isLive, isConnecting, onGoLive, onEnd }: Props) {
  if (isLive) {
    return (
      <button
        onClick={onEnd}
        className="w-full py-3 px-6 bg-red-600 hover:bg-red-700 text-white font-bold
                   tracking-wider uppercase text-sm rounded border border-red-500
                   transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(255,0,0,0.3)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        END BROADCAST
      </button>
    );
  }

  return (
    <button
      onClick={onGoLive}
      disabled={isConnecting}
      className="w-full py-3 px-6 bg-green-600 hover:bg-green-500 disabled:bg-green-800
                 disabled:opacity-50 text-white font-bold tracking-wider uppercase text-sm
                 rounded border border-green-500 transition-all active:scale-[0.98]
                 shadow-[0_0_20px_rgba(0,255,0,0.2)]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {isConnecting ? "CONNECTING..." : "GO LIVE"}
    </button>
  );
}
