import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  getRoom,
  addParticipant,
  removeParticipant,
  closeRoom,
  roomExists,
  MAX_PARTICIPANTS_PER_ROOM,
} from "./rooms";

/** Minimal mock WebSocket */
function mockWs() {
  const sent: string[] = [];
  return {
    readyState: 1,
    send(data: string) {
      sent.push(data);
    },
    close() {
      this.readyState = 3;
    },
    _sent: sent,
  };
}

// Use unique room IDs per test to avoid cross-test pollution
let nextRoomNum = 0;
function uniqueRoomId() {
  return `test${nextRoomNum++}`;
}

describe("rooms", () => {
  describe("createRoom", () => {
    it("creates a room and makes it findable", () => {
      const id = uniqueRoomId();
      const room = createRoom(id, "tok123");
      expect(room.id).toBe(id);
      expect(room.creatorToken).toBe("tok123");
      expect(room.closed).toBe(false);
      expect(room.participants.size).toBe(0);
      expect(room.nextParticipantId).toBe(0);
      expect(getRoom(id)).toBe(room);
      expect(roomExists(id)).toBe(true);
    });
  });

  describe("getRoom", () => {
    it("returns undefined for non-existent room", () => {
      expect(getRoom("nonexistent")).toBeUndefined();
    });
  });

  describe("addParticipant", () => {
    it("adds a participant and assigns sequential IDs", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");

      const p0 = addParticipant(id, mockWs());
      expect(p0).not.toBeNull();
      expect(p0!.id).toBe(0);
      expect(p0!.isCreator).toBe(false);

      const p1 = addParticipant(id, mockWs());
      expect(p1).not.toBeNull();
      expect(p1!.id).toBe(1);
    });

    it("marks participant as creator when token matches", () => {
      const id = uniqueRoomId();
      createRoom(id, "secret");

      const p = addParticipant(id, mockWs(), "secret");
      expect(p).not.toBeNull();
      expect(p!.isCreator).toBe(true);
    });

    it("does not mark as creator with wrong token", () => {
      const id = uniqueRoomId();
      createRoom(id, "secret");

      const p = addParticipant(id, mockWs(), "wrong");
      expect(p).not.toBeNull();
      expect(p!.isCreator).toBe(false);
    });

    it("returns null for non-existent room", () => {
      expect(addParticipant("nope", mockWs())).toBeNull();
    });

    it("returns null for closed room", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");
      closeRoom(id);
      expect(addParticipant(id, mockWs())).toBeNull();
    });

    it("enforces participant limit", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");

      for (let i = 0; i < MAX_PARTICIPANTS_PER_ROOM; i++) {
        expect(addParticipant(id, mockWs())).not.toBeNull();
      }

      // 17th participant should be rejected
      expect(addParticipant(id, mockWs())).toBeNull();
    });

    it("assigns colors from the palette", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");

      const p0 = addParticipant(id, mockWs());
      const p1 = addParticipant(id, mockWs());
      expect(p0!.color).toBeTruthy();
      expect(p1!.color).toBeTruthy();
      expect(p0!.color).not.toBe(p1!.color);
    });
  });

  describe("removeParticipant", () => {
    it("removes a participant and returns correct count", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");
      addParticipant(id, mockWs());
      addParticipant(id, mockWs());

      const { wasCreator, count } = removeParticipant(id, 0);
      expect(wasCreator).toBe(false);
      expect(count).toBe(1);
      expect(getRoom(id)!.participants.size).toBe(1);
    });

    it("returns wasCreator=true when removing creator", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");
      addParticipant(id, mockWs(), "tok");

      const { wasCreator } = removeParticipant(id, 0);
      expect(wasCreator).toBe(true);
    });

    it("handles removal from non-existent room gracefully", () => {
      const { wasCreator, count } = removeParticipant("nope", 0);
      expect(wasCreator).toBe(false);
      expect(count).toBe(0);
    });

    it("handles removal of non-existent participant gracefully", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");
      const { wasCreator, count } = removeParticipant(id, 999);
      expect(wasCreator).toBe(false);
      expect(count).toBe(0);
    });
  });

  describe("closeRoom", () => {
    it("marks room as closed and removes from map", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");
      closeRoom(id);

      expect(roomExists(id)).toBe(false);
      // Can't add participants to closed/deleted room
      expect(addParticipant(id, mockWs())).toBeNull();
    });

    it("sends room_closed to all participants with open sockets", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");
      const ws1 = mockWs();
      const ws2 = mockWs();
      addParticipant(id, ws1);
      addParticipant(id, ws2);

      closeRoom(id);

      expect(ws1._sent).toContain(JSON.stringify({ type: "room_closed" }));
      expect(ws2._sent).toContain(JSON.stringify({ type: "room_closed" }));
    });

    it("skips sending to already-closed sockets", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");
      const ws1 = mockWs();
      ws1.readyState = 3; // CLOSED
      const ws2 = mockWs();
      addParticipant(id, ws1);
      addParticipant(id, ws2);

      closeRoom(id);

      expect(ws1._sent).toHaveLength(0);
      expect(ws2._sent).toHaveLength(1);
    });

    it("handles closing non-existent room gracefully", () => {
      expect(() => closeRoom("nonexistent")).not.toThrow();
    });
  });

  describe("roomExists", () => {
    it("returns false for non-existent rooms", () => {
      expect(roomExists("nope")).toBe(false);
    });

    it("returns true for existing rooms", () => {
      const id = uniqueRoomId();
      createRoom(id, "tok");
      expect(roomExists(id)).toBe(true);
    });
  });
});
