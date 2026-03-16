import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { allowMessage } from "./rate-limit";

describe("allowMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first message from a new connection", () => {
    const ws = {};
    expect(allowMessage(ws)).toBe(true);
  });

  it("allows up to 60 messages within 5 seconds", () => {
    const ws = {};
    for (let i = 0; i < 60; i++) {
      expect(allowMessage(ws)).toBe(true);
    }
  });

  it("rejects the 61st message within 5 seconds", () => {
    const ws = {};
    for (let i = 0; i < 60; i++) {
      allowMessage(ws);
    }
    expect(allowMessage(ws)).toBe(false);
  });

  it("allows messages again after the window expires", () => {
    const ws = {};
    for (let i = 0; i < 60; i++) {
      allowMessage(ws);
    }
    expect(allowMessage(ws)).toBe(false);

    // Advance past the 5-second window
    vi.advanceTimersByTime(5001);

    expect(allowMessage(ws)).toBe(true);
  });

  it("tracks separate connections independently", () => {
    const ws1 = {};
    const ws2 = {};

    for (let i = 0; i < 60; i++) {
      allowMessage(ws1);
    }
    expect(allowMessage(ws1)).toBe(false);

    // ws2 should still be allowed
    expect(allowMessage(ws2)).toBe(true);
  });

  it("slides window correctly — old messages expire individually", () => {
    const ws = {};

    // Send 30 messages at t=0
    for (let i = 0; i < 30; i++) {
      allowMessage(ws);
    }

    // Advance 3 seconds, send 30 more
    vi.advanceTimersByTime(3000);
    for (let i = 0; i < 30; i++) {
      allowMessage(ws);
    }

    // Now at 60 messages total, should be blocked
    expect(allowMessage(ws)).toBe(false);

    // Advance 2.1 seconds — first 30 messages are now >5s old
    vi.advanceTimersByTime(2100);

    // Should be allowed again since old messages expired
    expect(allowMessage(ws)).toBe(true);
  });
});
