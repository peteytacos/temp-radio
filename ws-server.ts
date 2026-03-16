// Standalone WebSocket + API server for development
// Runs alongside `next dev` on a separate port
import { nanoid } from "nanoid";
import {
  createRoom,
  getRoom,
  addParticipant,
  removeParticipant,
} from "./src/lib/rooms";
import { generateRoomId } from "./src/lib/room";
import { allowMessage } from "./src/lib/rate-limit";
import type { ServerWebSocket } from "bun";

interface WSData {
  roomId: string;
  token?: string;
  participantId?: number;
}

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

const PORT = parseInt(process.env.WS_PORT || "3001");

const server = Bun.serve<WSData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // CORS for dev (Next.js on different port)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // WebSocket upgrade
    const wsMatch = url.pathname.match(/^\/ws\/([a-z0-9_-]+)$/);
    if (wsMatch) {
      const roomId = wsMatch[1];
      const token = url.searchParams.get("token") || undefined;
      const ok = server.upgrade(req, { data: { roomId, token } });
      if (ok) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // API: create room
    if (url.pathname === "/api/create-room" && req.method === "POST") {
      const id = generateRoomId();
      const token = nanoid(16);
      createRoom(id, token);
      return Response.json(
        { roomId: id, url: `/r/${id}`, token },
        { headers: corsHeaders }
      );
    }

    return new Response("Not found", { status: 404 });
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

console.log(`📻 WS server running on http://localhost:${server.port}`);
