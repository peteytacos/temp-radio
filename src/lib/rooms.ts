import { getColor } from "./colors";

export interface Participant {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any;
  id: number;
  color: string;
  isCreator: boolean;
}

export interface Room {
  id: string;
  creatorToken: string;
  participants: Map<number, Participant>;
  nextParticipantId: number;
  createdAt: number;
  closed: boolean;
}

const rooms = new Map<string, Room>();

export function createRoom(id: string, token: string): Room {
  const room: Room = {
    id,
    creatorToken: token,
    participants: new Map(),
    nextParticipantId: 0,
    createdAt: Date.now(),
    closed: false,
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function addParticipant(
  roomId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  token?: string
): Participant | null {
  const room = rooms.get(roomId);
  if (!room || room.closed) return null;

  const id = room.nextParticipantId++;
  const color = getColor(id);
  const isCreator = !!token && token === room.creatorToken;

  const participant: Participant = { ws, id, color, isCreator };
  room.participants.set(id, participant);
  return participant;
}

export function removeParticipant(
  roomId: string,
  participantId: number
): { wasCreator: boolean; count: number } {
  const room = rooms.get(roomId);
  if (!room) return { wasCreator: false, count: 0 };

  const participant = room.participants.get(participantId);
  const wasCreator = participant?.isCreator ?? false;
  room.participants.delete(participantId);

  return { wasCreator, count: room.participants.size };
}

export function closeRoom(id: string) {
  const room = rooms.get(id);
  if (room) {
    room.closed = true;
    const payload = JSON.stringify({ type: "room_closed" });
    for (const [, p] of room.participants) {
      try {
        if (p.ws.readyState === 1) {
          p.ws.send(payload);
          p.ws.close(4002, "Room closed");
        }
      } catch {
        // Socket already closed — ignore
      }
    }
    rooms.delete(id);
  }
}

export function roomExists(id: string): boolean {
  return rooms.has(id);
}

// Clean up abandoned rooms (created but never joined within 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.participants.size === 0 && now - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(id);
    }
  }
}, 60_000);
