import { WebSocket } from "ws";

export interface Room {
  id: string;
  broadcaster: WebSocket | null;
  broadcasterToken: string;
  listeners: Set<WebSocket>;
  initSegment: Buffer | null;
  createdAt: number;
}

const rooms = new Map<string, Room>();

export function createRoom(id: string, token: string): Room {
  const room: Room = {
    id,
    broadcaster: null,
    broadcasterToken: token,
    listeners: new Set(),
    initSegment: null,
    createdAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function destroyRoom(id: string) {
  const room = rooms.get(id);
  if (room) {
    for (const l of room.listeners) {
      l.close(4002, "Broadcaster disconnected");
    }
    rooms.delete(id);
  }
}

export function roomExists(id: string): boolean {
  return rooms.has(id);
}

// Cleanup stale rooms (created but broadcaster never connected) every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (!room.broadcaster && now - room.createdAt > 5 * 60 * 1000) {
      rooms.delete(id);
    }
  }
}, 60_000);
