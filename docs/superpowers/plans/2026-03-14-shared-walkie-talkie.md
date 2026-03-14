# Shared Walkie-Talkie Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Temp Radio from one-broadcaster-to-many-listeners into a shared walkie-talkie channel where every participant can hold-to-talk and hear everyone simultaneously, with per-user colored waveforms.

**Architecture:** WebSocket relay server assigns each participant an ID and color. Clients send audio chunks when holding PTT; server prepends sender ID byte and relays to all other participants. Each client maintains per-speaker playback pipelines with AnalyserNodes for colored waveform rendering on a shared canvas.

**Tech Stack:** Next.js 16, React 19, WebSocket (ws), MediaRecorder/MediaSource APIs, Web Audio API, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-03-14-shared-walkie-talkie-design.md`

---

## File Structure

### New Files
- `src/lib/colors.ts` — Participant color palette and lookup
- `src/lib/speaker-playback.ts` — Per-speaker audio playback pipeline class
- `src/hooks/useRoom.ts` — WebSocket connection, state, audio receive
- `src/hooks/usePTT.ts` — Hold-to-talk, mic management, squelch
- `src/components/WaveformCanvas.tsx` — Multi-speaker waveform renderer

### Rewrite
- `src/lib/ws-protocol.ts` — New message types for participant model
- `src/lib/rooms.ts` — New Room interface with participants map
- `server.ts` — Participant model, binary tagging, creator tracking
- `src/components/RadioShell.tsx` — radio.jpg base, green screen (#7ce580/#265327), PTT overlay
- `src/app/page.tsx` — Redirect-only, no UI
- `src/app/r/[roomId]/page.tsx` — Single participant view with activation gate

### Remove
- `src/hooks/useBroadcaster.ts`
- `src/hooks/useListener.ts`
- `src/components/BroadcastButton.tsx`
- `src/components/TuneInGate.tsx`
- `src/components/ShareLink.tsx`
- `src/components/VUMeter.tsx`
- `src/components/SpectrumBars.tsx`
- `src/components/StatusBar.tsx`
- `src/components/LiveIndicator.tsx`
- `src/components/ListenerCount.tsx`
- `src/components/WaveformVisualiser.tsx`
- `src/app/api/close-room/route.ts`

### Keep As-Is
- `src/hooks/useWebSocket.ts` — Used by useRoom
- `src/lib/audio-config.ts` — MIME type, timeslice, FFT constants
- `src/lib/room.ts` — generateRoomId()
- `src/app/api/create-room/route.ts` — Still creates rooms with tokens

### Modify
- `src/app/globals.css` — Update color variables
- `src/styles/radio-theme.ts` — Update to new palette

---

## Chunk 1: Server Foundation

### Task 1: Protocol Types

**Files:**
- Rewrite: `src/lib/ws-protocol.ts`

- [ ] **Step 1: Rewrite ws-protocol.ts with new message types**

```ts
// Server → Client
export type ServerMessage =
  | { type: "welcome"; id: number; color: string; isCreator: boolean; participants: Array<{ id: number; color: string }> }
  | { type: "participant_joined"; id: number; color: string; count: number }
  | { type: "participant_left"; id: number; count: number }
  | { type: "speaking_start"; id: number }
  | { type: "speaking_stop"; id: number }
  | { type: "room_closed" };

// Client → Server
export type ClientMessage =
  | { type: "speaking_start" }
  | { type: "speaking_stop" };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ws-protocol.ts
git commit -m "feat: rewrite WS protocol types for participant model"
```

### Task 2: Color Palette

**Files:**
- Create: `src/lib/colors.ts`

- [ ] **Step 1: Create colors.ts**

```ts
export const PARTICIPANT_COLORS = [
  "#265327", // dark green
  "#1a3a8a", // blue
  "#8a1a3a", // crimson
  "#6b3fa0", // purple
  "#b85c00", // amber
  "#0a7a7a", // teal
  "#c43c8a", // magenta
  "#4a6b00", // olive
];

export function getColor(index: number): string {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/colors.ts
git commit -m "feat: add participant color palette"
```

### Task 3: Room Model

**Files:**
- Rewrite: `src/lib/rooms.ts`

- [ ] **Step 1: Rewrite rooms.ts with participant-based model**

```ts
import { WebSocket } from "ws";
import { getColor } from "./colors";

export interface Participant {
  ws: WebSocket;
  id: number;
  color: string;
  isCreator: boolean;
}

export interface Room {
  id: string;
  creatorToken: string;
  participants: Map<number, Participant>;
  nextParticipantId: number;
  initSegments: Map<number, Buffer>; // speaker ID → latest init segment
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
    initSegments: new Map(),
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
  ws: WebSocket,
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
  room.initSegments.delete(participantId);

  return { wasCreator, count: room.participants.size };
}

export function closeRoom(id: string) {
  const room = rooms.get(id);
  if (room) {
    room.closed = true;
    for (const [, p] of room.participants) {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify({ type: "room_closed" }));
        p.ws.close(4002, "Room closed");
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/rooms.ts
git commit -m "feat: rewrite room model with participants map"
```

### Task 4: Server WebSocket Handler

**Files:**
- Rewrite: `server.ts`

- [ ] **Step 1: Rewrite server.ts for participant model**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add server.ts
git commit -m "feat: rewrite server for multi-participant relay model"
```

### Task 5: API Routes

**Files:**
- Keep: `src/app/api/create-room/route.ts` (no changes needed — still creates room with token)
- Remove: `src/app/api/close-room/route.ts` (room closes on creator WS disconnect)

- [ ] **Step 1: Delete close-room API route**

```bash
rm src/app/api/close-room/route.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A src/app/api/close-room/
git commit -m "feat: remove close-room API (rooms close on creator disconnect)"
```

---

## Chunk 2: Client Hooks

### Task 6: Speaker Playback Pipeline

**Files:**
- Create: `src/lib/speaker-playback.ts`

This class manages the Audio → MediaSource → SourceBuffer → AnalyserNode pipeline for a single remote speaker's PTT session.

- [ ] **Step 1: Create speaker-playback.ts**

```ts
import { AUDIO_MIME_TYPE } from "./audio-config";

export class SpeakerPlayback {
  audio: HTMLAudioElement;
  analyser: AnalyserNode;
  private mediaSource: MediaSource;
  private sourceBuffer: SourceBuffer | null = null;
  private queue: ArrayBuffer[] = [];
  private destroyed = false;

  constructor(audioCtx: AudioContext) {
    this.audio = new Audio();
    this.mediaSource = new MediaSource();
    this.audio.src = URL.createObjectURL(this.mediaSource);

    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    const source = audioCtx.createMediaElementSource(this.audio);
    source.connect(this.analyser);
    this.analyser.connect(audioCtx.destination);

    this.mediaSource.addEventListener("sourceopen", () => {
      if (this.destroyed) return;
      try {
        this.sourceBuffer = this.mediaSource.addSourceBuffer(AUDIO_MIME_TYPE);
        this.sourceBuffer.addEventListener("updateend", () => this.flush());
        this.flush();
      } catch (e) {
        console.error("Failed to create SourceBuffer:", e);
      }
    });

    this.audio.play().catch(() => {});
  }

  appendChunk(data: ArrayBuffer) {
    if (this.destroyed) return;
    this.queue.push(data);
    this.flush();
  }

  private flush() {
    if (!this.sourceBuffer || this.sourceBuffer.updating || this.queue.length === 0) {
      return;
    }
    const chunk = this.queue.shift()!;
    try {
      this.sourceBuffer.appendBuffer(chunk);
    } catch {
      this.queue.unshift(chunk);
    }

    // Trim old buffered data
    try {
      if (this.sourceBuffer.buffered.length > 0) {
        const end = this.sourceBuffer.buffered.end(
          this.sourceBuffer.buffered.length - 1
        );
        if (end > 10) this.sourceBuffer.remove(0, end - 5);
      }
    } catch {
      // Ignore trim errors
    }
  }

  destroy() {
    this.destroyed = true;
    this.audio.pause();
    this.audio.src = "";
    if (this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // Ignore
      }
    }
    this.queue = [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/speaker-playback.ts
git commit -m "feat: add SpeakerPlayback class for per-speaker audio pipeline"
```

### Task 7: useRoom Hook

**Files:**
- Create: `src/hooks/useRoom.ts`

This hook manages the WebSocket connection, participant state, and per-speaker audio playback pipelines.

- [ ] **Step 1: Create useRoom.ts**

```ts
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useWebSocket } from "./useWebSocket";
import { SpeakerPlayback } from "@/lib/speaker-playback";
import type { ServerMessage } from "@/lib/ws-protocol";

interface ParticipantInfo {
  id: number;
  color: string;
}

export function useRoom(
  roomId: string,
  token: string | undefined,
  audioCtx: AudioContext | null
) {
  const [myId, setMyId] = useState<number | null>(null);
  const [myColor, setMyColor] = useState("#265327");
  const [isCreator, setIsCreator] = useState(false);
  const [participants, setParticipants] = useState<Map<number, string>>(
    new Map()
  );
  const [participantCount, setParticipantCount] = useState(0);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<number>>(
    new Set()
  );
  const [speakerAnalysers, setSpeakerAnalysers] = useState<
    Map<number, AnalyserNode>
  >(new Map());
  const [roomClosed, setRoomClosed] = useState(false);

  const pipelinesRef = useRef<Map<number, SpeakerPlayback>>(new Map());
  const audioCtxRef = useRef(audioCtx);
  audioCtxRef.current = audioCtx;

  const wsUrl = roomClosed
    ? null
    : `/ws/${roomId}${token ? `?token=${token}` : ""}`;

  const destroyPipeline = useCallback((speakerId: number) => {
    const pipeline = pipelinesRef.current.get(speakerId);
    if (pipeline) {
      pipeline.destroy();
      pipelinesRef.current.delete(speakerId);
      setSpeakerAnalysers((prev) => {
        const next = new Map(prev);
        next.delete(speakerId);
        return next;
      });
    }
  }, []);

  const createPipeline = useCallback(
    (speakerId: number) => {
      if (!audioCtxRef.current) return;

      // Destroy existing pipeline for this speaker if any
      destroyPipeline(speakerId);

      const pipeline = new SpeakerPlayback(audioCtxRef.current);
      pipelinesRef.current.set(speakerId, pipeline);
      setSpeakerAnalysers((prev) =>
        new Map(prev).set(speakerId, pipeline.analyser)
      );
    },
    [destroyPipeline]
  );

  const { send, close } = useWebSocket(wsUrl, {
    onMessage: (event) => {
      if (typeof event.data === "string") {
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "welcome":
            setMyId(msg.id);
            setMyColor(msg.color);
            setIsCreator(msg.isCreator);
            setParticipants(
              new Map(msg.participants.map((p) => [p.id, p.color]))
            );
            setParticipantCount(msg.participants.length);
            break;

          case "participant_joined":
            setParticipants((prev) =>
              new Map(prev).set(msg.id, msg.color)
            );
            setParticipantCount(msg.count);
            break;

          case "participant_left":
            setParticipants((prev) => {
              const next = new Map(prev);
              next.delete(msg.id);
              return next;
            });
            setActiveSpeakers((prev) => {
              const next = new Set(prev);
              next.delete(msg.id);
              return next;
            });
            destroyPipeline(msg.id);
            setParticipantCount(msg.count);
            break;

          case "speaking_start":
            setActiveSpeakers((prev) => new Set(prev).add(msg.id));
            createPipeline(msg.id);
            break;

          case "speaking_stop":
            setActiveSpeakers((prev) => {
              const next = new Set(prev);
              next.delete(msg.id);
              return next;
            });
            // Let pipeline drain, then destroy after a short delay
            setTimeout(() => destroyPipeline(msg.id), 500);
            break;

          case "room_closed":
            setRoomClosed(true);
            break;
        }
      } else {
        // Binary audio data: first byte is speaker ID, rest is audio
        const buf = event.data as ArrayBuffer;
        const view = new Uint8Array(buf);
        const speakerId = view[0];
        const audioData = buf.slice(1);

        const pipeline = pipelinesRef.current.get(speakerId);
        if (pipeline) {
          pipeline.appendChunk(audioData);
        }
      }
    },
    onClose: (event) => {
      if (event.code === 4004) {
        setRoomClosed(true);
      }
    },
  });

  // Cleanup all pipelines on unmount
  useEffect(() => {
    return () => {
      for (const [, pipeline] of pipelinesRef.current) {
        pipeline.destroy();
      }
      pipelinesRef.current.clear();
    };
  }, []);

  return {
    myId,
    myColor,
    isCreator,
    participants,
    participantCount,
    activeSpeakers,
    speakerAnalysers,
    roomClosed,
    isConnected: !roomClosed && wsUrl !== null,
    send,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useRoom.ts
git commit -m "feat: add useRoom hook for participant WS connection and audio playback"
```

### Task 8: usePTT Hook

**Files:**
- Create: `src/hooks/usePTT.ts`

Manages hold-to-talk: mic acquisition (persisted), MediaRecorder start/stop per press, squelch sound playback.

- [ ] **Step 1: Create usePTT.ts**

```ts
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { AUDIO_MIME_TYPE, TIMESLICE_MS, FFT_SIZE } from "@/lib/audio-config";

export function usePTT(
  audioCtx: AudioContext | null,
  send: (data: ArrayBuffer | string) => void,
  isConnected: boolean
) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const squelchRef = useRef<HTMLAudioElement | null>(null);
  const isSpeakingRef = useRef(false);

  // Preload squelch sound
  useEffect(() => {
    const audio = new Audio("/squelch.wav");
    audio.load();
    squelchRef.current = audio;
  }, []);

  const playSquelch = useCallback(() => {
    if (!squelchRef.current) return;
    const clone = squelchRef.current.cloneNode() as HTMLAudioElement;
    clone.play().catch(() => {});
  }, []);

  const startPTT = useCallback(async () => {
    if (isSpeakingRef.current || !isConnected || !audioCtx) return;

    playSquelch();

    // Acquire mic on first press, reuse after
    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const source = audioCtx.createMediaStreamSource(streamRef.current);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        return;
      }
    }

    // Signal speaking start
    send(JSON.stringify({ type: "speaking_start" }));

    // Start recording
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: AUDIO_MIME_TYPE,
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        event.data.arrayBuffer().then((buf) => send(buf));
      }
    };

    recorder.start(TIMESLICE_MS);
    isSpeakingRef.current = true;
    setIsSpeaking(true);
  }, [isConnected, audioCtx, send, playSquelch]);

  const stopPTT = useCallback(() => {
    if (!isSpeakingRef.current) return;

    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    send(JSON.stringify({ type: "speaking_stop" }));
    playSquelch();

    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, [send, playSquelch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    isSpeaking,
    localAnalyser: analyserRef,
    startPTT,
    stopPTT,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePTT.ts
git commit -m "feat: add usePTT hook for hold-to-talk with squelch"
```

---

## Chunk 3: UI & Pages

### Task 9: WaveformCanvas Component

**Files:**
- Create: `src/components/WaveformCanvas.tsx`

Renders multiple speaker waveforms overlaid on a single canvas, each in their assigned color.

- [ ] **Step 1: Create WaveformCanvas.tsx**

```tsx
"use client";

import { useRef, useEffect } from "react";

export interface WaveformSource {
  id: number;
  analyser: AnalyserNode;
  color: string;
  active: boolean;
}

interface Props {
  sources: WaveformSource[];
}

export default function WaveformCanvas({ sources }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourcesRef = useRef<WaveformSource[]>(sources);
  const animRef = useRef<number>(0);

  sourcesRef.current = sources;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      const w = canvas!.width;
      const h = canvas!.height;
      const currentSources = sourcesRef.current;

      // Background (slightly darker than screen green for inset look)
      ctx.fillStyle = "#5fb861";
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "rgba(38, 83, 39, 0.12)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (currentSources.length === 0) {
        // Flat line when no sources
        ctx.strokeStyle = "rgba(38, 83, 39, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        return;
      }

      // Draw each speaker's waveform
      for (const source of currentSources) {
        const bufferLength = source.analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        source.analyser.getByteTimeDomainData(dataArray);

        ctx.save();
        ctx.strokeStyle = source.color;
        ctx.lineWidth = source.active ? 2.5 : 1;
        ctx.globalAlpha = source.active ? 1 : 0.3;

        if (source.active) {
          ctx.shadowColor = source.color;
          ctx.shadowBlur = 6;
        }

        ctx.beginPath();
        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * h) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }

        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={140}
      className="w-full h-full rounded-sm"
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/WaveformCanvas.tsx
git commit -m "feat: add multi-speaker WaveformCanvas component"
```

### Task 10: RadioShell Component

**Files:**
- Rewrite: `src/components/RadioShell.tsx`

Radio image base with green screen overlay, PTT button overlay with visual feedback, power LED, status text.

- [ ] **Step 1: Rewrite RadioShell.tsx**

```tsx
"use client";

interface Props {
  roomId: string;
  isConnected: boolean;
  isSpeaking: boolean;
  speakingColor?: string;
  participantCount: number;
  roomClosed: boolean;
  onPTTStart: () => void;
  onPTTEnd: () => void;
  children: React.ReactNode;
}

export default function RadioShell({
  roomId,
  isConnected,
  isSpeaking,
  speakingColor,
  participantCount,
  roomClosed,
  onPTTStart,
  onPTTEnd,
  children,
}: Props) {
  return (
    <div className="w-full max-w-[480px] mx-auto relative select-none">
      <img
        src="/radio.jpg"
        alt="Temp Radio"
        className="w-full h-auto block"
        draggable={false}
      />

      {/* ===== GREEN SCREEN OVERLAY ===== */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: "21.5%",
          left: "9%",
          width: "82%",
          height: "25.5%",
        }}
      >
        <div
          className="w-full h-full relative"
          style={{ backgroundColor: "#7ce580" }}
        >
          {/* Scanline overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.03,
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)",
            }}
          />

          {/* Transmitting border pulse */}
          {isSpeaking && (
            <div
              className="absolute inset-0 pointer-events-none animate-pulse"
              style={{
                border: `2px solid ${speakingColor ?? "#265327"}`,
                opacity: 0.6,
              }}
            />
          )}

          <div className="relative z-10 h-full flex flex-col p-[5%]">
            {children}
          </div>
        </div>
      </div>

      {/* ===== POWER LED ===== */}
      <div className="absolute" style={{ top: "48.5%", left: "12%" }}>
        <div
          className="w-2 h-2 rounded-full transition-all duration-300"
          style={{
            backgroundColor: isConnected
              ? "#4ade80"
              : "rgba(74, 222, 128, 0.3)",
            boxShadow: isConnected
              ? "0 0 8px rgba(74, 222, 128, 0.8)"
              : "none",
          }}
        />
      </div>

      {/* ===== STATUS TEXT ===== */}
      <div
        className="absolute"
        style={{ top: "48%", left: "16%", width: "68%" }}
      >
        <span
          className="tracking-wider uppercase"
          style={{
            fontSize: "clamp(7px, 1.6vw, 10px)",
            fontFamily: "var(--font-mono)",
            color: isSpeaking ? "#c53030" : "#7a8a6a",
          }}
        >
          {roomClosed
            ? "STATION CLOSED"
            : isSpeaking
              ? "TRANSMITTING"
              : isConnected
                ? "STANDBY"
                : "CONNECTING..."}
        </span>
      </div>

      {/* ===== PTT BUTTON OVERLAY ===== */}
      {!roomClosed && (
        <button
          className="absolute focus:outline-none"
          style={{
            top: "59%",
            left: "64%",
            width: "22%",
            height: "11%",
            background: isSpeaking
              ? "rgba(197, 48, 48, 0.15)"
              : "transparent",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
          onMouseDown={onPTTStart}
          onMouseUp={onPTTEnd}
          onMouseLeave={onPTTEnd}
          onTouchStart={(e) => {
            e.preventDefault();
            onPTTStart();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            onPTTEnd();
          }}
          onTouchCancel={onPTTEnd}
          aria-label="Push to talk"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RadioShell.tsx
git commit -m "feat: rewrite RadioShell with radio.jpg, green screen, PTT overlay"
```

### Task 11: Room Page

**Files:**
- Rewrite: `src/app/r/[roomId]/page.tsx`

Single participant view. Shows activation gate on first load (required for browser audio policy), then the full radio UI with waveform canvas and controls.

- [ ] **Step 1: Rewrite room page**

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import RadioShell from "@/components/RadioShell";
import WaveformCanvas, { type WaveformSource } from "@/components/WaveformCanvas";
import { useRoom } from "@/hooks/useRoom";
import { usePTT } from "@/hooks/usePTT";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const router = useRouter();

  const [token, setToken] = useState<string | undefined>(undefined);
  const [activated, setActivated] = useState(false);
  const [copied, setCopied] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Read token from sessionStorage (client-only)
  useEffect(() => {
    const stored = sessionStorage.getItem(`temp-radio-token-${roomId}`);
    if (stored) setToken(stored);
  }, [roomId]);

  const activate = useCallback(() => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();
    setActivated(true);
  }, []);

  const room = useRoom(roomId, token, audioCtxRef.current);
  const ptt = usePTT(audioCtxRef.current, room.send, room.isConnected);

  // Build waveform sources for canvas
  const waveformSources = useMemo(() => {
    const sources: WaveformSource[] = [];

    // Local user's waveform (visible after first PTT press)
    if (ptt.localAnalyser.current && room.myId !== null) {
      sources.push({
        id: room.myId,
        analyser: ptt.localAnalyser.current,
        color: room.myColor,
        active: ptt.isSpeaking,
      });
    }

    // Remote speakers
    for (const [id, analyser] of room.speakerAnalysers) {
      sources.push({
        id,
        analyser,
        color: room.participants.get(id) ?? "#265327",
        active: room.activeSpeakers.has(id),
      });
    }

    return sources;
  }, [
    room.myId,
    room.myColor,
    room.speakerAnalysers,
    room.activeSpeakers,
    room.participants,
    ptt.isSpeaking,
    ptt.localAnalyser,
  ]);

  const handleCopy = useCallback(async () => {
    const url = `${window.location.origin}/r/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/r/${roomId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Temp Radio", url });
      } catch {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  }, [roomId, handleCopy]);

  const handleNewRadio = useCallback(() => {
    router.push("/");
  }, [router]);

  const noopPTT = useCallback(() => {}, []);

  // ===== ACTIVATION GATE =====
  if (!activated) {
    return (
      <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center p-4">
        <RadioShell
          roomId={roomId}
          isConnected={false}
          isSpeaking={false}
          participantCount={0}
          roomClosed={false}
          onPTTStart={noopPTT}
          onPTTEnd={noopPTT}
        >
          <div
            className="flex-1 flex flex-col items-center justify-center cursor-pointer"
            onClick={activate}
          >
            <div
              className="text-center font-bold tracking-[0.2em] uppercase animate-pulse"
              style={{
                color: "#265327",
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(10px, 2.5vw, 16px)",
              }}
            >
              TAP TO ACTIVATE
            </div>
            <div
              className="text-center mt-2 tracking-[0.1em] uppercase"
              style={{
                color: "rgba(38, 83, 39, 0.5)",
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(7px, 1.6vw, 10px)",
              }}
            >
              Hold the yellow button to talk
            </div>
          </div>
        </RadioShell>
      </div>
    );
  }

  // ===== ROOM CLOSED =====
  if (room.roomClosed) {
    return (
      <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center p-4">
        <RadioShell
          roomId={roomId}
          isConnected={false}
          isSpeaking={false}
          participantCount={0}
          roomClosed={true}
          onPTTStart={noopPTT}
          onPTTEnd={noopPTT}
        >
          <div className="flex-1 flex flex-col items-center justify-center">
            <div
              className="font-bold tracking-[0.2em] uppercase"
              style={{
                color: "#265327",
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(10px, 2.5vw, 16px)",
              }}
            >
              STATION CLOSED
            </div>
            <div
              className="mt-2 tracking-[0.1em] uppercase"
              style={{
                color: "rgba(38, 83, 39, 0.5)",
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(7px, 1.6vw, 10px)",
              }}
            >
              The host has left
            </div>
          </div>
          <div className="flex gap-1.5 mt-[2%]">
            <button
              onClick={handleNewRadio}
              className="px-2 py-1 rounded transition-colors"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(6px, 1.4vw, 9px)",
                color: "#265327",
                backgroundColor: "rgba(38, 83, 39, 0.1)",
                border: "1px solid rgba(38, 83, 39, 0.2)",
              }}
            >
              NEW RADIO
            </button>
          </div>
        </RadioShell>
      </div>
    );
  }

  // ===== ACTIVE ROOM =====
  return (
    <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center p-4">
      <RadioShell
        roomId={roomId}
        isConnected={room.isConnected}
        isSpeaking={ptt.isSpeaking}
        speakingColor={room.myColor}
        participantCount={room.participantCount}
        roomClosed={false}
        onPTTStart={ptt.startPTT}
        onPTTEnd={ptt.stopPTT}
      >
        {/* Header */}
        <div
          className="text-center font-bold tracking-[0.12em] py-[1.5%] rounded-sm mb-[2%]"
          style={{
            fontSize: "clamp(7px, 2vw, 12px)",
            fontFamily: "var(--font-mono)",
            color: "#265327",
            border: "1px solid rgba(38, 83, 39, 0.25)",
          }}
        >
          TEMP RADIO COMMS UNIT
        </div>

        {/* Waveform */}
        <div
          className="flex-1 rounded-sm overflow-hidden min-h-0"
          style={{ border: "1px solid rgba(38, 83, 39, 0.25)" }}
        >
          <WaveformCanvas sources={waveformSources} />
        </div>

        {/* Info row */}
        <div
          className="flex justify-between items-center mt-[2%]"
          style={{
            color: "#265327",
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(7px, 1.6vw, 11px)",
          }}
        >
          <div
            className="font-bold rounded-sm px-[3%] py-[1%]"
            style={{ border: "1px solid rgba(38, 83, 39, 0.25)" }}
          >
            CH {roomId.toUpperCase()}
          </div>
          <div className="flex items-center gap-1">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span>{room.participantCount}</span>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex gap-1.5 mt-[2%]">
          <button
            onClick={handleNewRadio}
            className="px-2 py-1 rounded transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(6px, 1.4vw, 9px)",
              color: "#265327",
              backgroundColor: "rgba(38, 83, 39, 0.1)",
              border: "1px solid rgba(38, 83, 39, 0.2)",
            }}
          >
            NEW RADIO
          </button>
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(6px, 1.4vw, 9px)",
              color: "#265327",
              backgroundColor: "rgba(38, 83, 39, 0.1)",
              border: "1px solid rgba(38, 83, 39, 0.2)",
            }}
          >
            {copied ? "COPIED!" : "COPY"}
          </button>
          <button
            onClick={handleShare}
            className="px-2 py-1 rounded transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(6px, 1.4vw, 9px)",
              color: "#265327",
              backgroundColor: "rgba(38, 83, 39, 0.1)",
              border: "1px solid rgba(38, 83, 39, 0.2)",
            }}
          >
            SHARE
          </button>
        </div>
      </RadioShell>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/r/\\[roomId\\]/page.tsx
git commit -m "feat: rewrite room page with activation gate and participant UI"
```

### Task 12: Home Page Redirect

**Files:**
- Rewrite: `src/app/page.tsx`

No UI — just creates a room and redirects.

- [ ] **Step 1: Rewrite home page**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function HomePage() {
  const router = useRouter();
  const creating = useRef(false);

  useEffect(() => {
    if (creating.current) return;
    creating.current = true;

    fetch("/api/create-room", { method: "POST" })
      .then((res) => res.json())
      .then(({ roomId, token }) => {
        sessionStorage.setItem(`temp-radio-token-${roomId}`, token);
        router.replace(`/r/${roomId}`);
      });
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0a06] flex items-center justify-center">
      <div
        className="text-xs tracking-[0.3em] uppercase animate-pulse"
        style={{ fontFamily: "var(--font-mono)", color: "rgba(124, 229, 128, 0.4)" }}
      >
        Creating station...
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: home page auto-creates room and redirects"
```

### Task 13: Cleanup & Styles

**Files:**
- Remove: old components and hooks
- Modify: `src/app/globals.css`, `src/styles/radio-theme.ts`

- [ ] **Step 1: Remove deprecated files**

```bash
rm src/hooks/useBroadcaster.ts \
   src/hooks/useListener.ts \
   src/hooks/useAudioAnalyser.ts \
   src/components/BroadcastButton.tsx \
   src/components/TuneInGate.tsx \
   src/components/ShareLink.tsx \
   src/components/VUMeter.tsx \
   src/components/SpectrumBars.tsx \
   src/components/StatusBar.tsx \
   src/components/LiveIndicator.tsx \
   src/components/ListenerCount.tsx \
   src/components/WaveformVisualiser.tsx
```

- [ ] **Step 2: Update globals.css**

Replace `--foreground: #4ade80;` with `--foreground: #7ce580;`

- [ ] **Step 3: Update radio-theme.ts**

```ts
export const theme = {
  screenBg: "#7ce580",
  primary: "#265327",
  primaryDim: "rgba(38, 83, 39, 0.5)",
  primaryFaint: "rgba(38, 83, 39, 0.25)",
  darkBg: "#0a0a06",
  red: "#c53030",
};
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated components, update color theme"
```

### Task 14: Verify Build

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run Next.js build**

```bash
npm run build
```

Fix any build errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors"
```
