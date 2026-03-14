"use client";

import { useState, useCallback } from "react";

interface Props {
  roomId: string;
}

export default function ShareLink({ roomId }: Props) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/r/${roomId}`
    : `/r/${roomId}`;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  const share = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Tune in to my station on Temp Radio",
          url,
        });
      } catch {
        // User cancelled
      }
    } else {
      copy();
    }
  }, [url, copy]);

  return (
    <div className="space-y-2">
      <div className="text-green-400/60 text-[10px] uppercase tracking-widest" style={{ fontFamily: "var(--font-mono)" }}>
        Share This Station
      </div>
      <div className="flex items-center gap-2">
        <div
          className="flex-1 bg-black/40 border border-green-900/50 rounded px-3 py-2
                      text-green-300 text-xs truncate"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {url}
        </div>
        <button
          onClick={copy}
          className="px-3 py-2 bg-green-900/40 hover:bg-green-800/50 border border-green-700/50
                     rounded text-green-300 text-xs uppercase tracking-wider transition-colors"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {copied ? "COPIED!" : "COPY"}
        </button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            onClick={share}
            className="px-3 py-2 bg-green-900/40 hover:bg-green-800/50 border border-green-700/50
                       rounded text-green-300 text-xs uppercase tracking-wider transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            SHARE
          </button>
        )}
      </div>
    </div>
  );
}
