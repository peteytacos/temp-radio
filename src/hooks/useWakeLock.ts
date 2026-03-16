"use client";

import { useEffect, useRef } from "react";

/**
 * Requests a screen wake lock to prevent the display from sleeping.
 * Automatically re-acquires on visibility change (required by the API).
 * Pass `enabled` to control when the lock is active.
 */
export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    async function acquire() {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Wake lock request failed (e.g. low battery, background tab)
      }
    }

    // Re-acquire when page becomes visible again (API releases on hide)
    function handleVisibility() {
      if (!document.hidden && enabled) {
        acquire();
      }
    }

    acquire();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [enabled]);
}
