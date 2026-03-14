"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function HomePage() {
  const router = useRouter();
  const creating = useRef(false);

  useEffect(() => {
    if (creating.current) return;
    creating.current = true;

    const apiBase = process.env.NEXT_PUBLIC_WS_PORT
      ? `http://${window.location.hostname}:${process.env.NEXT_PUBLIC_WS_PORT}`
      : "";
    fetch(`${apiBase}/api/create-room`, { method: "POST" })
      .then((res) => res.json())
      .then(({ roomId, token }) => {
        sessionStorage.setItem(`temp-radio-token-${roomId}`, token);
        router.replace(`/r/${roomId}`);
      });
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center">
      <div
        className="text-xs tracking-[0.3em] uppercase animate-pulse"
        style={{
          fontFamily: "var(--font-mono)",
          color: "rgba(124, 229, 128, 0.4)",
        }}
      >
        Tuning in...
      </div>
    </div>
  );
}
