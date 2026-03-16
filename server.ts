import { nanoid } from "nanoid";
import {
  createRoom,
  getRoom,
  addParticipant,
  removeParticipant,
} from "./src/lib/rooms";
import { generateRoomId } from "./src/lib/room";
import type { ServerWebSocket } from "bun";
import { join } from "path";

interface WSData {
  roomId: string;
  token?: string;
  participantId?: number;
}

const STATIC_DIR = join(import.meta.dir, "out");
const PORT = parseInt(process.env.PORT || "3000");

function safeSend(ws: { readyState: number; send: (data: string) => void }, payload: string) {
  try {
    if (ws.readyState === 1) ws.send(payload);
  } catch {
    // Socket closed between check and send — ignore
  }
}

function broadcastToRoom(roomId: string, msg: object, excludeId?: number) {
  const room = getRoom(roomId);
  if (!room) return;
  const payload = JSON.stringify(msg);
  for (const [id, p] of room.participants) {
    if (id !== excludeId) safeSend(p.ws, payload);
  }
}

function sendToParticipant(roomId: string, targetId: number, msg: object) {
  const room = getRoom(roomId);
  if (!room) return;
  const participant = room.participants.get(targetId);
  if (participant) safeSend(participant.ws, JSON.stringify(msg));
}

const server = Bun.serve<WSData>({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);

    // --- WebSocket upgrade ---
    const wsMatch = url.pathname.match(/^\/ws\/([a-z0-9_-]+)$/);
    if (wsMatch) {
      const roomId = wsMatch[1];
      const token = url.searchParams.get("token") || undefined;
      const ok = server.upgrade(req, { data: { roomId, token } });
      if (ok) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // --- API: create room ---
    if (url.pathname === "/api/create-room" && req.method === "POST") {
      const id = generateRoomId();
      const token = nanoid(16);
      createRoom(id, token);
      return Response.json({ roomId: id, url: `/r/${id}`, token });
    }

    // --- Static file serving ---
    let pathname = url.pathname;

    // Serve index.html for root
    if (pathname === "/") pathname = "/index.html";

    // SPA fallback: /r/{anything} → /r/_.html (static export shell)
    if (pathname.startsWith("/r/") && !pathname.includes(".")) {
      pathname = "/r/_.html";
    }

    // Try exact file
    const file = Bun.file(join(STATIC_DIR, pathname));
    if (await file.exists()) return new Response(file);

    // Try with .html extension
    const htmlFile = Bun.file(join(STATIC_DIR, pathname + ".html"));
    if (await htmlFile.exists()) return new Response(htmlFile);

    // Try as directory index
    const indexFile = Bun.file(join(STATIC_DIR, pathname, "index.html"));
    if (await indexFile.exists()) return new Response(indexFile);

    // 404 fallback to index
    return new Response(Bun.file(join(STATIC_DIR, "index.html")));
  },

  websocket: {
    open(ws: ServerWebSocket<WSData>) {
      const { roomId, token } = ws.data;
      const room = getRoom(roomId);
      if (!room || room.closed) {
        ws.close(4004, "Room not found");
        return;
      }

      const participant = addParticipant(roomId, ws, token);
      if (!participant) {
        ws.close(4004, "Room not found");
        return;
      }

      ws.data.participantId = participant.id;

      const participantList = Array.from(room.participants.values()).map(
        (p) => ({ id: p.id, color: p.color })
      );

      ws.send(
        JSON.stringify({
          type: "welcome",
          id: participant.id,
          color: participant.color,
          isCreator: participant.isCreator,
          participants: participantList,
        })
      );

      broadcastToRoom(
        roomId,
        {
          type: "participant_joined",
          id: participant.id,
          color: participant.color,
          count: room.participants.size,
        },
        participant.id
      );
    },

    message(ws: ServerWebSocket<WSData>, data: string | Buffer) {
      const { roomId, participantId } = ws.data;
      if (participantId === undefined) return;

      const room = getRoom(roomId);
      if (!room) return;

      if (typeof data !== "string") return;

      try {
        const msg = JSON.parse(data);
        switch (msg.type) {
          case "speaking_start":
            broadcastToRoom(
              roomId,
              { type: "speaking_start", id: participantId },
              participantId
            );
            break;
          case "speaking_stop":
            broadcastToRoom(
              roomId,
              { type: "speaking_stop", id: participantId },
              participantId
            );
            break;
          case "rtc_offer":
            sendToParticipant(roomId, msg.targetId, {
              type: "rtc_offer",
              fromId: participantId,
              sdp: msg.sdp,
            });
            break;
          case "rtc_answer":
            sendToParticipant(roomId, msg.targetId, {
              type: "rtc_answer",
              fromId: participantId,
              sdp: msg.sdp,
            });
            break;
          case "rtc_ice":
            sendToParticipant(roomId, msg.targetId, {
              type: "rtc_ice",
              fromId: participantId,
              candidate: msg.candidate,
            });
            break;
        }
      } catch {
        // Invalid JSON
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      const { roomId, participantId } = ws.data;
      if (participantId === undefined) return;

      const { count } = removeParticipant(roomId, participantId);
      broadcastToRoom(roomId, {
        type: "participant_left",
        id: participantId,
        count,
      });
    },
  },
});

console.log(`📻 Squelch running on http://localhost:${server.port}`);
