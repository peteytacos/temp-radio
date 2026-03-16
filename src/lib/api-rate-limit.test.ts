import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { allowRoomCreation } from "./api-rate-limit";

describe("allowRoomCreation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first room creation from an IP", () => {
    expect(allowRoomCreation("10.0.0.1")).toBe(true);
  });

  it("allows up to 10 room creations per minute", () => {
    const ip = "10.0.0.2";
    for (let i = 0; i < 10; i++) {
      expect(allowRoomCreation(ip)).toBe(true);
    }
  });

  it("rejects the 11th room creation within 1 minute", () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 10; i++) {
      allowRoomCreation(ip);
    }
    expect(allowRoomCreation(ip)).toBe(false);
  });

  it("allows room creation again after window expires", () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < 10; i++) {
      allowRoomCreation(ip);
    }
    expect(allowRoomCreation(ip)).toBe(false);

    // Advance past the 1-minute window
    vi.advanceTimersByTime(60_001);

    expect(allowRoomCreation(ip)).toBe(true);
  });

  it("tracks separate IPs independently", () => {
    const ip1 = "10.0.0.5";
    const ip2 = "10.0.0.6";

    for (let i = 0; i < 10; i++) {
      allowRoomCreation(ip1);
    }
    expect(allowRoomCreation(ip1)).toBe(false);

    // ip2 should still be allowed
    expect(allowRoomCreation(ip2)).toBe(true);
  });
});
