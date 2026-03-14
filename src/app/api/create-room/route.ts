import { generateRoomId } from "@/lib/room";
import { createRoom } from "@/lib/rooms";
import { nanoid } from "nanoid";

export async function POST() {
  const id = generateRoomId();
  const token = nanoid(16);
  createRoom(id, token);
  return Response.json({ roomId: id, url: `/r/${id}`, token });
}
