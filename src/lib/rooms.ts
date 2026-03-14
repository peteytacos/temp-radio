import { WebSocket } from "ws";

export interface Room {
  id: string;
  broadcaster: WebSocket | null;
  broadcasterToken: string;
  listeners: Set<WebSocket>;
  initSegment: Buffer | null;
  createdAt: number;
  closed: boolean;
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
    closed: false,
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function closeRoom(id: string) {
  const room = rooms.get(id);
  if (room) {
    room.closed = true;
    for (const l of room.listeners) {
      if (l.readyState === WebSocket.OPEN) {
        l.send(JSON.stringify({ type: "room_closed" }));
      }
      l.close(4002, "Room closed by creator");
    }
    if (room.broadcaster?.readyState === WebSocket.OPEN) {
      room.broadcaster.close(4002, "Room closed by creator");
    }
    rooms.delete(id);
  }
}

export function disconnectBroadcaster(id: string) {
  const room = rooms.get(id);
  if (room) {
    room.broadcaster = null;
    // Don't destroy the room — it persists until explicitly closed.
    // Notify listeners that broadcaster went offline.
    for (const l of room.listeners) {
      if (l.readyState === WebSocket.OPEN) {
        l.send(JSON.stringify({ type: "status", broadcasting: false }));
      }
    }
  }
}

export function roomExists(id: string): boolean {
  return rooms.has(id);
}

// Only clean up rooms that were created but NEVER had a broadcaster connect
// (abandoned room creation). Active rooms persist indefinitely.
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (!room.broadcaster && !room.initSegment && now - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(id);
    }
  }
}, 60_000);
