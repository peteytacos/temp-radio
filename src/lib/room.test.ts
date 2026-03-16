import { describe, it, expect } from "vitest";
import { generateRoomId } from "./room";

describe("generateRoomId", () => {
  it("generates a 6-character string", () => {
    const id = generateRoomId();
    expect(id).toHaveLength(6);
  });

  it("uses only lowercase alphanumeric characters", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateRoomId();
      expect(id).toMatch(/^[a-z0-9]{6}$/);
    }
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRoomId());
    }
    // With 36^6 possible IDs, 100 should all be unique
    expect(ids.size).toBe(100);
  });
});
