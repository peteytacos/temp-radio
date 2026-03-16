import { nanoid } from "nanoid";
import {
  createRoom,
  getRoom,
  addParticipant,
  removeParticipant,
  closeRoom,
} from "./src/lib/rooms";
import { generateRoomId } from "./src/lib/room";
import { allowMessage } from "./src/lib/rate-limit";
import { allowRoomCreation } from "./src/lib/api-rate-limit";
import { validateMessage } from "./src/lib/validate-message";
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
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || server.requestIP(req)?.address
        || "unknown";
      if (!allowRoomCreation(ip)) {
        return Response.json({ error: "Too many rooms created" }, { status: 429 });
      }
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

      // Detect duplicate tabs: close any existing connection with the same token
      if (token) {
        for (const [, p] of room.participants) {
          if (p.isCreator && token === room.creatorToken && p.ws !== ws) {
            try { p.ws.close(4008, "Duplicate tab"); } catch { /* ignore */ }
          }
        }
      }

      const participant = addParticipant(roomId, ws, token);
      if (!participant) {
        // Room full or closed
        safeSend(ws, JSON.stringify({ type: "room_full" }));
        ws.close(4003, "Room full");
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

      // Rate limit
      if (!allowMessage(ws)) {
        ws.close(4029, "Rate limited");
        return;
      }

      const participantIds = new Set(room.participants.keys());
      const msg = validateMessage(data, participantIds, participantId);
      if (!msg) return;

      switch (msg.type) {
        case "speaking_start":
        case "speaking_stop":
          broadcastToRoom(
            roomId,
            { type: msg.type, id: participantId },
            participantId
          );
          break;
        case "rtc_offer":
        case "rtc_answer":
          sendToParticipant(roomId, msg.targetId, {
            type: msg.type,
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
    },

    close(ws: ServerWebSocket<WSData>) {
      const { roomId, participantId } = ws.data;
      if (participantId === undefined) return;

      const { wasCreator, count } = removeParticipant(roomId, participantId);
      if (wasCreator) {
        closeRoom(roomId);
      } else {
        broadcastToRoom(roomId, {
          type: "participant_left",
          id: participantId,
          count,
        });
      }
    },
  },
});

console.log(`📻 Squelch running on http://localhost:${server.port}`);
