import next from "next";
import { createServer } from "http";
import { parse } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { getRoom, disconnectBroadcaster } from "./src/lib/rooms";

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
      const role = query.role as string;
      const token = query.token as string | undefined;
      wss.emit("connection", ws, roomId, role, token);
    });
  });

  wss.on("connection", (ws: WebSocket, roomId: string, role: string, token?: string) => {
    const room = getRoom(roomId);

    if (!room || room.closed) {
      ws.close(4004, "Room not found");
      return;
    }

    if (role === "broadcaster") {
      if (room.broadcaster) {
        ws.close(4001, "Broadcaster slot occupied");
        return;
      }

      if (token !== room.broadcasterToken) {
        ws.close(4003, "Invalid token");
        return;
      }

      room.broadcaster = ws;
      let isFirstChunk = true;

      // Tell everyone broadcaster is live
      broadcastToRoom(roomId, { type: "status", broadcasting: true });

      ws.on("message", (data: Buffer) => {
        if (isFirstChunk) {
          room.initSegment = Buffer.from(data);
          isFirstChunk = false;
        }

        for (const listener of room.listeners) {
          if (listener.readyState === WebSocket.OPEN) {
            listener.send(data);
          }
        }
      });

      ws.on("close", () => {
        // Broadcaster disconnected — room stays alive, just mark offline
        disconnectBroadcaster(roomId);
        broadcastListenerCount(roomId);
      });

    } else {
      // Listener
      room.listeners.add(ws);

      ws.send(JSON.stringify({
        type: "status",
        broadcasting: room.broadcaster !== null,
      }));

      // Send cached init segment so late joiners can decode
      if (room.initSegment && room.broadcaster && ws.readyState === WebSocket.OPEN) {
        ws.send(room.initSegment);
      }

      broadcastListenerCount(roomId);

      ws.on("close", () => {
        room.listeners.delete(ws);
        const currentRoom = getRoom(roomId);
        if (currentRoom) broadcastListenerCount(roomId);
      });
    }
  });

  function broadcastToRoom(roomId: string, msg: object) {
    const room = getRoom(roomId);
    if (!room) return;
    const payload = JSON.stringify(msg);
    for (const l of room.listeners) {
      if (l.readyState === WebSocket.OPEN) l.send(payload);
    }
    if (room.broadcaster?.readyState === WebSocket.OPEN) {
      room.broadcaster.send(payload);
    }
  }

  function broadcastListenerCount(roomId: string) {
    const room = getRoom(roomId);
    if (!room) return;
    broadcastToRoom(roomId, { type: "listeners", count: room.listeners.size });
  }

  // Ping all clients every 30s to keep connections alive
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30_000);

  const PORT = parseInt(process.env.PORT || "3000");
  server.listen(PORT, () => {
    console.log(`📻 Temp Radio running on http://localhost:${PORT}`);
  });
});
