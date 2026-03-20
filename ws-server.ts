// Standalone WebSocket + API server for development
// Runs alongside `next dev` on a separate port
import { nanoid } from "nanoid";
import {
  createRoom,
  getRoom,
  getOrCreateRoom,
  addParticipant,
  removeParticipant,
  setRoomPassword,
  removeRoomPassword,
} from "./src/lib/rooms";
import { generateRoomId } from "./src/lib/room";
import { allowMessage } from "./src/lib/rate-limit";
import { allowRoomCreation } from "./src/lib/api-rate-limit";
import { getTurnCredentials, getTurnStatus } from "./src/lib/turn";
import { validateMessage } from "./src/lib/validate-message";
import type { ServerWebSocket } from "bun";

interface WSData {
  roomId: string;
  token?: string;
  password?: string;
  rejoinToken?: string;
  participantId?: number;
  lastPong: number;
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

const PING_INTERVAL = 15_000;
const PONG_TIMEOUT = 30_000;

/** Track all open WebSockets for heartbeat */
const allSockets = new Set<ServerWebSocket<WSData>>();

const server = Bun.serve<WSData>({
  port: PORT,

  async fetch(req, server) {
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
      const password = url.searchParams.get("password") || undefined;
      const rejoinToken = url.searchParams.get("rejoinToken") || undefined;
      const ok = server.upgrade(req, { data: { roomId, token, password, rejoinToken, lastPong: Date.now() } });
      if (ok) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // API: create room
    if (url.pathname === "/api/create-room" && req.method === "POST") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || server.requestIP(req)?.address
        || "unknown";
      if (!allowRoomCreation(ip)) {
        return Response.json(
          { error: "Too many rooms created" },
          { status: 429, headers: corsHeaders }
        );
      }
      const id = generateRoomId();
      const token = nanoid(16);
      createRoom(id, token);
      return Response.json(
        { roomId: id, url: `/r/${id}`, token },
        { headers: corsHeaders }
      );
    }

    // API: get TURN credentials
    if (url.pathname === "/api/turn-credentials" && req.method === "GET") {
      const creds = await getTurnCredentials();
      return Response.json(creds, { headers: corsHeaders });
    }

    // API: TURN diagnostic status
    if (url.pathname === "/api/turn-status" && req.method === "GET") {
      return Response.json(getTurnStatus(), { headers: corsHeaders });
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws: ServerWebSocket<WSData>) {
      ws.data.lastPong = Date.now();
      allSockets.add(ws);

      const { roomId, token, password, rejoinToken } = ws.data;

      // Rooms are persistent channels — auto-create if needed
      const room = getOrCreateRoom(roomId);

      // Check password if room is locked
      if (room.password) {
        if (!password || password !== room.password) {
          safeSend(ws, JSON.stringify({
            type: room.password && !password ? "password_required" : "password_rejected",
          }));
          allSockets.delete(ws);
          ws.close(4010, "Password required");
          return;
        }
      }

      // Detect duplicate tabs: close any existing connection with the same token
      if (token) {
        for (const [, p] of room.participants) {
          if (p.isCreator && token === room.creatorToken && p.ws !== ws) {
            try { p.ws.close(4008, "Duplicate tab"); } catch { /* ignore */ }
          }
        }
      }

      const participant = addParticipant(roomId, ws, token, rejoinToken);
      if (!participant) {
        // Room full or closed
        safeSend(ws, JSON.stringify({ type: "room_full" }));
        ws.close(4003, "Room full");
        return;
      }

      // Mark as authenticated if they provided the correct password
      if (room.password && password === room.password) {
        participant.hasAuth = true;
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
          rejoinToken: participant.rejoinToken,
          hasPassword: !!room.password,
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
        case "set_password": {
          setRoomPassword(roomId, msg.password);
          // Mark the setter as authenticated
          const setter = room.participants.get(participantId);
          if (setter) setter.hasAuth = true;
          broadcastToRoom(roomId, { type: "password_set" });
          break;
        }
        case "remove_password": {
          const remover = room.participants.get(participantId);
          if (!remover?.hasAuth) break; // only authenticated participants can remove
          removeRoomPassword(roomId);
          // Clear hasAuth for all participants since there's no password anymore
          for (const [, p] of room.participants) {
            p.hasAuth = false;
          }
          broadcastToRoom(roomId, { type: "password_removed" });
          break;
        }
      }
    },

    pong(ws: ServerWebSocket<WSData>) {
      ws.data.lastPong = Date.now();
    },

    close(ws: ServerWebSocket<WSData>) {
      allSockets.delete(ws);
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

// Heartbeat: ping all clients, evict dead connections
setInterval(() => {
  const now = Date.now();
  for (const ws of allSockets) {
    if (now - ws.data.lastPong > PONG_TIMEOUT) {
      console.log(`[heartbeat] evicting dead connection (participant ${ws.data.participantId})`);
      allSockets.delete(ws);
      try { ws.close(4001, "Pong timeout"); } catch { /* already closed */ }
      continue;
    }
    try { ws.ping(); } catch { /* ignore */ }
  }
}, PING_INTERVAL);

console.log(`📻 WS server running on http://localhost:${server.port}`);
