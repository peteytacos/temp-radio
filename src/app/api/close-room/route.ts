import { getRoom, closeRoom } from "@/lib/rooms";

export async function POST(request: Request) {
  const { roomId, token } = await request.json();

  const room = getRoom(roomId);
  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.broadcasterToken !== token) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  closeRoom(roomId);
  return Response.json({ ok: true });
}
