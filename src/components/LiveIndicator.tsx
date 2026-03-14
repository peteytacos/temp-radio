"use client";

interface Props {
  isLive: boolean;
}

export default function LiveIndicator({ isLive }: Props) {
  if (!isLive) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
      </span>
      <span
        className="text-red-400 text-xs font-bold tracking-[0.2em] uppercase"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        LIVE
      </span>
    </div>
  );
}
