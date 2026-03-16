import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  getRoom,
  addParticipant,
  removeParticipant,
  closeRoom,
} from "./rooms";
import { validateMessage } from "./validate-message";

/**
 * Integration tests that simulate the server's WebSocket message flow
 * using the actual rooms + validation modules together.
 */

let roomId: string;
let roomNum = 0;

function mockWs() {
  const sent: string[] = [];
  return {
    readyState: 1,
    send(data: string) { sent.push(data); },
    close(code?: number) { this.readyState = 3; this._closeCode = code; },
    _sent: sent,
    _closeCode: undefined as number | undefined,
  };
}

function safeSend(
  ws: { readyState: number; send: (data: string) => void },
  payload: string
) {
  try {
    if (ws.readyState === 1) ws.send(payload);
  } catch { /* ignore */ }
}

function broadcastToRoom(rId: string, msg: object, excludeId?: number) {
  const room = getRoom(rId);
  if (!room) return;
  const payload = JSON.stringify(msg);
  for (const [id, p] of room.participants) {
    if (id !== excludeId) safeSend(p.ws, payload);
  }
}

function sendToParticipant(rId: string, targetId: number, msg: object) {
  const room = getRoom(rId);
  if (!room) return;
  const participant = room.participants.get(targetId);
  if (participant) safeSend(participant.ws, JSON.stringify(msg));
}

beforeEach(() => {
  roomId = `integ${roomNum++}`;
  createRoom(roomId, "creator-token");
});

describe("server integration: join flow", () => {
  it("welcome includes all current participants", () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    const p1 = addParticipant(roomId, ws1, "creator-token")!;
    const p2 = addParticipant(roomId, ws2)!;

    const room = getRoom(roomId)!;
    const participantList = Array.from(room.participants.values()).map(
      (p) => ({ id: p.id, color: p.color })
    );

    expect(participantList).toHaveLength(2);
    expect(participantList[0].id).toBe(p1.id);
    expect(participantList[1].id).toBe(p2.id);
  });

  it("participant_joined broadcasts to existing members only", () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    addParticipant(roomId, ws1);
    const p2 = addParticipant(roomId, ws2)!;

    // Simulate broadcast that server does on join
    broadcastToRoom(
      roomId,
      { type: "participant_joined", id: p2.id, color: p2.color, count: 2 },
      p2.id
    );

    // ws1 (existing) gets the broadcast, ws2 (new joiner) doesn't
    expect(ws1._sent).toHaveLength(1);
    const msg = JSON.parse(ws1._sent[0]);
    expect(msg.type).toBe("participant_joined");
    expect(msg.id).toBe(p2.id);

    // ws2 was excluded
    expect(ws2._sent).toHaveLength(0);
  });
});

describe("server integration: message routing", () => {
  it("speaking_start broadcasts to all except sender", () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    const ws3 = mockWs();
    const p1 = addParticipant(roomId, ws1)!;
    addParticipant(roomId, ws2);
    addParticipant(roomId, ws3);

    const room = getRoom(roomId)!;
    const ids = new Set(room.participants.keys());
    const validated = validateMessage(
      JSON.stringify({ type: "speaking_start" }),
      ids,
      p1.id
    );
    expect(validated).not.toBeNull();

    broadcastToRoom(
      roomId,
      { type: "speaking_start", id: p1.id },
      p1.id
    );

    // Sender doesn't receive, others do
    expect(ws1._sent).toHaveLength(0);
    expect(ws2._sent).toHaveLength(1);
    expect(ws3._sent).toHaveLength(1);
  });

  it("rtc_offer is sent only to target", () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    const ws3 = mockWs();
    const p1 = addParticipant(roomId, ws1)!;
    const p2 = addParticipant(roomId, ws2)!;
    addParticipant(roomId, ws3);

    const room = getRoom(roomId)!;
    const ids = new Set(room.participants.keys());
    const validated = validateMessage(
      JSON.stringify({ type: "rtc_offer", targetId: p2.id, sdp: "v=0..." }),
      ids,
      p1.id
    );
    expect(validated).not.toBeNull();

    sendToParticipant(roomId, p2.id, {
      type: "rtc_offer",
      fromId: p1.id,
      sdp: "v=0...",
    });

    expect(ws1._sent).toHaveLength(0); // sender
    expect(ws2._sent).toHaveLength(1); // target
    expect(ws3._sent).toHaveLength(0); // bystander

    const msg = JSON.parse(ws2._sent[0]);
    expect(msg.type).toBe("rtc_offer");
    expect(msg.fromId).toBe(p1.id);
  });

  it("validates and rejects spoofed targetId", () => {
    const ws1 = mockWs();
    addParticipant(roomId, ws1);

    const room = getRoom(roomId)!;
    const ids = new Set(room.participants.keys());
    const validated = validateMessage(
      JSON.stringify({ type: "rtc_offer", targetId: 999, sdp: "v=0..." }),
      ids,
      0
    );
    expect(validated).toBeNull();
  });
});

describe("server integration: leave flow", () => {
  it("participant_left broadcasts when non-creator leaves", () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    addParticipant(roomId, ws1, "creator-token");
    const p2 = addParticipant(roomId, ws2)!;

    const { wasCreator, count } = removeParticipant(roomId, p2.id);
    expect(wasCreator).toBe(false);
    expect(count).toBe(1);

    broadcastToRoom(roomId, {
      type: "participant_left",
      id: p2.id,
      count,
    });

    expect(ws1._sent).toHaveLength(1);
    const msg = JSON.parse(ws1._sent[0]);
    expect(msg.type).toBe("participant_left");
    expect(msg.id).toBe(p2.id);
  });

  it("room closes when creator leaves", () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    const p1 = addParticipant(roomId, ws1, "creator-token")!;
    addParticipant(roomId, ws2);

    const { wasCreator } = removeParticipant(roomId, p1.id);
    expect(wasCreator).toBe(true);

    // Server would call closeRoom here
    closeRoom(roomId);

    // Room should no longer exist
    expect(getRoom(roomId)).toBeUndefined();
    // ws2 should have received room_closed
    expect(ws2._sent).toContain(JSON.stringify({ type: "room_closed" }));
  });
});

describe("server integration: edge cases", () => {
  it("broadcast to empty room is a no-op", () => {
    const emptyId = `empty${roomNum++}`;
    createRoom(emptyId, "tok");
    expect(() =>
      broadcastToRoom(emptyId, { type: "speaking_start", id: 0 })
    ).not.toThrow();
  });

  it("send to non-existent participant is a no-op", () => {
    expect(() =>
      sendToParticipant(roomId, 999, { type: "rtc_offer" })
    ).not.toThrow();
  });

  it("send to non-existent room is a no-op", () => {
    expect(() =>
      sendToParticipant("nonexistent", 0, { type: "rtc_offer" })
    ).not.toThrow();
  });

  it("broadcast skips closed websockets without error", () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    ws1.readyState = 3; // CLOSED
    addParticipant(roomId, ws1);
    addParticipant(roomId, ws2);

    broadcastToRoom(roomId, { type: "speaking_start", id: 0 });

    expect(ws1._sent).toHaveLength(0);
    expect(ws2._sent).toHaveLength(1);
  });

  it("participant limit prevents joining full room", () => {
    const fullId = `full${roomNum++}`;
    createRoom(fullId, "tok");

    for (let i = 0; i < 16; i++) {
      expect(addParticipant(fullId, mockWs())).not.toBeNull();
    }

    expect(addParticipant(fullId, mockWs())).toBeNull();
  });
});
