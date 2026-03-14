"use client";

interface Props {
  onTuneIn: () => void;
}

export default function TuneInGate({ onTuneIn }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      <div className="text-green-400/60 text-xs uppercase tracking-[0.3em]" style={{ fontFamily: "var(--font-mono)" }}>
        Signal Detected
      </div>
      <button
        onClick={onTuneIn}
        className="group relative w-24 h-24 rounded-full bg-gradient-to-b from-[#4a4a3a] to-[#2a2a1a]
                   border-4 border-[#5a5a4a] shadow-[0_0_30px_rgba(0,255,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.1)]
                   hover:shadow-[0_0_40px_rgba(0,255,0,0.4)] transition-all active:scale-95"
      >
        <div className="absolute inset-2 rounded-full bg-gradient-to-b from-[#3a3a2a] to-[#1a1a0a]
                        flex items-center justify-center">
          <svg
            className="w-8 h-8 text-green-400 group-hover:text-green-300 transition-colors"
            fill="currentColor" viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </button>
      <div className="text-green-400 text-sm font-bold tracking-[0.2em] uppercase" style={{ fontFamily: "var(--font-mono)" }}>
        Tap to Tune In
      </div>
    </div>
  );
}
