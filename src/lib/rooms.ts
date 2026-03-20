import { nanoid } from "nanoid";
import { getColor } from "./colors";

export const MAX_PARTICIPANTS_PER_ROOM = 16;

export interface Participant {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any;
  id: number;
  color: string;
  isCreator: boolean;
  rejoinToken: string;
  /** True if this participant authenticated with the room password */
  hasAuth: boolean;
}

export interface Room {
  id: string;
  creatorToken: string;
  participants: Map<number, Participant>;
  nextParticipantId: number;
  createdAt: number;
  closed: boolean;
  /** If set, new joiners must provide this password */
  password: string | null;
  /** Maps rejoinToken → saved color for participants who left */
  rejoinTokens: Map<string, { color: string }>;
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
    password: null,
    rejoinTokens: new Map(),
  };
  rooms.set(id, room);
  return room;
}

/**
 * Get an existing room, or auto-create it if it doesn't exist.
 * Rooms are persistent channels — they're always joinable by URL.
 */
export function getOrCreateRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    room = createRoom(id, "");
  }
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function addParticipant(
  roomId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  token?: string,
  rejoinToken?: string
): Participant | null {
  const room = rooms.get(roomId);
  if (!room || room.closed) return null;

  if (room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) return null;

  // Check if rejoining — restore color if rejoin token matches
  let color: string;
  if (rejoinToken && room.rejoinTokens.has(rejoinToken)) {
    color = room.rejoinTokens.get(rejoinToken)!.color;
    room.rejoinTokens.delete(rejoinToken);
  } else {
    const id = room.nextParticipantId; // use current ID for color
    color = getColor(id);
  }

  const id = room.nextParticipantId++;
  const isCreator = !!token && token === room.creatorToken;
  const newRejoinToken = nanoid(16);

  const participant: Participant = {
    ws,
    id,
    color,
    isCreator,
    rejoinToken: newRejoinToken,
    hasAuth: false,
  };
  room.participants.set(id, participant);
  return participant;
}

export function removeParticipant(
  roomId: string,
  participantId: number
): { count: number } {
  const room = rooms.get(roomId);
  if (!room) return { count: 0 };

  const participant = room.participants.get(participantId);
  if (participant) {
    // Save rejoin token → color mapping so they can rejoin with same color
    room.rejoinTokens.set(participant.rejoinToken, { color: participant.color });
  }
  room.participants.delete(participantId);

  return { count: room.participants.size };
}

export function setRoomPassword(roomId: string, password: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.password = password;
  return true;
}

export function removeRoomPassword(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.password = null;
  return true;
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
