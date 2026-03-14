import next from "next";
import { createServer } from "http";
import { parse } from "url";
import { WebSocketServer, WebSocket } from "ws";
import {
  getRoom,
  addParticipant,
  removeParticipant,
  closeRoom,
} from "./src/lib/rooms";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url!, true);
    const match = pathname?.match(/^\/ws\/([a-z0-9]+)$/);

    if (!match) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const roomId = match[1];
      const token = query.token as string | undefined;
      wss.emit("connection", ws, roomId, token);
    });
  });

  wss.on(
    "connection",
    (ws: WebSocket, roomId: string, token?: string) => {
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

      // Build current participant list for welcome message
      const participantList = Array.from(room.participants.values()).map(
        (p) => ({ id: p.id, color: p.color })
      );

      // Send welcome to new participant
      ws.send(
        JSON.stringify({
          type: "welcome",
          id: participant.id,
          color: participant.color,
          isCreator: participant.isCreator,
          participants: participantList,
        })
      );

      // Notify everyone else
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

      ws.on("message", (data: Buffer | string) => {
        if (typeof data === "string") {
          try {
            const msg = JSON.parse(data);
            if (msg.type === "speaking_start") {
              room.initSegments.delete(participant.id);
              broadcastToRoom(
                roomId,
                { type: "speaking_start", id: participant.id },
                participant.id
              );
            } else if (msg.type === "speaking_stop") {
              broadcastToRoom(
                roomId,
                { type: "speaking_stop", id: participant.id },
                participant.id
              );
            }
          } catch {
            // Invalid JSON, ignore
          }
        } else {
          // Binary audio data
          const buf = Buffer.from(data);

          // Cache init segment (first chunk per speaking session)
          if (!room.initSegments.has(participant.id)) {
            room.initSegments.set(participant.id, buf);
          }

          // Prepend speaker ID byte and relay to all others
          const tagged = Buffer.alloc(1 + buf.length);
          tagged[0] = participant.id;
          buf.copy(tagged, 1);

          for (const [id, p] of room.participants) {
            if (id !== participant.id && p.ws.readyState === WebSocket.OPEN) {
              p.ws.send(tagged);
            }
          }
        }
      });

      ws.on("close", () => {
        const { wasCreator, count } = removeParticipant(
          roomId,
          participant.id
        );

        if (wasCreator) {
          closeRoom(roomId);
        } else {
          broadcastToRoom(roomId, {
            type: "participant_left",
            id: participant.id,
            count,
          });
        }
      });
    }
  );

  function broadcastToRoom(
    roomId: string,
    msg: object,
    excludeId?: number
  ) {
    const room = getRoom(roomId);
    if (!room) return;
    const payload = JSON.stringify(msg);
    for (const [id, p] of room.participants) {
      if (id !== excludeId && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(payload);
      }
    }
  }

  // Ping all clients every 30s
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
  }, 30_000);

  const PORT = parseInt(process.env.PORT || "3000");
  server.listen(PORT, () => {
    console.log(`📻 Temp Radio running on http://localhost:${PORT}`);
  });
});
