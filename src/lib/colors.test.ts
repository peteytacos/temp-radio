import { describe, it, expect } from "vitest";
import { getColor, PARTICIPANT_COLORS } from "./colors";

describe("colors", () => {
  it("returns first color for index 0", () => {
    expect(getColor(0)).toBe(PARTICIPANT_COLORS[0]);
  });

  it("returns sequential colors for sequential indices", () => {
    for (let i = 0; i < PARTICIPANT_COLORS.length; i++) {
      expect(getColor(i)).toBe(PARTICIPANT_COLORS[i]);
    }
  });

  it("wraps around when index exceeds palette length", () => {
    expect(getColor(PARTICIPANT_COLORS.length)).toBe(PARTICIPANT_COLORS[0]);
    expect(getColor(PARTICIPANT_COLORS.length + 1)).toBe(
      PARTICIPANT_COLORS[1]
    );
  });

  it("all colors are valid hex strings", () => {
    for (const color of PARTICIPANT_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("all colors are unique", () => {
    const unique = new Set(PARTICIPANT_COLORS);
    expect(unique.size).toBe(PARTICIPANT_COLORS.length);
  });
});
