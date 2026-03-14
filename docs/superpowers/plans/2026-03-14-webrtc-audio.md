# WebRTC Audio Rewrite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MediaRecorder/MediaSource audio pipeline with WebRTC peer-to-peer audio to fix iOS Safari compatibility.

**Architecture:** Bun WebSocket server becomes signaling-only (SDP + ICE relay). Audio flows directly between browsers via RTCPeerConnection. PTT toggles `track.enabled` instead of starting/stopping MediaRecorder.

**Tech Stack:** WebRTC (RTCPeerConnection), Web Audio API (AnalyserNode for waveforms), Bun WebSocket (signaling), React hooks

---

## Chunk 1: Server + Protocol Changes

### Task 1: Update protocol types

**Files:**
- Modify: `src/lib/ws-protocol.ts`

- [ ] **Step 1: Rewrite ws-protocol.ts with RTC signaling types**

```typescript
// Server → Client
export type ServerMessage =
  | { type: "welcome"; id: number; color: string; isCreator: boolean; participants: Array<{ id: number; color: string }> }
  | { type: "participant_joined"; id: number; color: string; count: number }
  | { type: "participant_left"; id: number; count: number }
  | { type: "speaking_start"; id: number }
  | { type: "speaking_stop"; id: number }
  | { type: "room_closed" }
  | { type: "rtc_offer"; fromId: number; sdp: string }
  | { type: "rtc_answer"; fromId: number; sdp: string }
  | { type: "rtc_ice"; fromId: number; candidate: RTCIceCandidateInit };

// Client → Server
export type ClientMessage =
  | { type: "speaking_start" }
  | { type: "speaking_stop" }
  | { type: "rtc_offer"; targetId: number; sdp: string }
  | { type: "rtc_answer"; targetId: number; sdp: string }
  | { type: "rtc_ice"; targetId: number; candidate: RTCIceCandidateInit };
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors

### Task 2: Update Room model

**Files:**
- Modify: `src/lib/rooms.ts`

- [ ] **Step 1: Remove initSegments from Room interface and all references**

In `src/lib/rooms.ts`:
- Remove `initSegments: Map<number, Buffer>` from `Room` interface (line 16)
- Remove `initSegments: new Map()` from `createRoom` (line 29)
- Remove `room.initSegments.delete(participantId)` from `removeParticipant` (line 69)

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors in server.ts and ws-server.ts (they reference initSegments — fixed in next task)

### Task 3: Update server signaling

**Files:**
- Modify: `server.ts`
- Modify: `ws-server.ts`

Both files get the same changes to their `message` handler. The `open` and `close` handlers are unchanged.

- [ ] **Step 1: Add sendToParticipant helper function**

Add this function right after `broadcastToRoom` in both `server.ts` and `ws-server.ts`:

```typescript
function sendToParticipant(roomId: string, targetId: number, msg: object) {
  const room = getRoom(roomId);
  if (!room) return;
  const participant = room.participants.get(targetId);
  if (participant && participant.ws.readyState === 1) {
    participant.ws.send(JSON.stringify(msg));
  }
}
```

- [ ] **Step 2: Replace the message handler in server.ts**

Replace the entire `message` function body in `server.ts`:

```typescript
message(ws: ServerWebSocket<WSData>, data: string | Buffer) {
  const { roomId, participantId } = ws.data;
  if (participantId === undefined) return;

  const room = getRoom(roomId);
  if (!room) return;

  if (typeof data !== "string") return; // No binary data in WebRTC mode

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
```

- [ ] **Step 3: Apply the same message handler changes to ws-server.ts**

Same replacement as Step 2 for `ws-server.ts`.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors (rooms.ts initSegments removed, servers updated)

- [ ] **Step 5: Commit server + protocol changes**

```bash
git add src/lib/ws-protocol.ts src/lib/rooms.ts server.ts ws-server.ts
git commit -m "feat: WebRTC signaling — add RTC message relay, remove binary audio"
```

---

## Chunk 2: Client-Side WebRTC

### Task 4: Clean up audio-config.ts

**Files:**
- Modify: `src/lib/audio-config.ts`

- [ ] **Step 1: Remove MediaRecorder constants, keep FFT_SIZE**

Replace entire file contents:

```typescript
export const FFT_SIZE = 256;
```

### Task 5: Create useWebRTC hook

**Files:**
- Create: `src/hooks/useWebRTC.ts`

This is the core new file. It manages all RTCPeerConnections for a room.

- [ ] **Step 1: Create the useWebRTC hook**

Create `src/hooks/useWebRTC.ts`:

```typescript
"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

interface PeerState {
  pc: RTCPeerConnection;
  analyser: AnalyserNode | null;
}

export function useWebRTC(
  audioCtx: AudioContext | null,
  micStream: MediaStream | null,
  myId: number | null,
  participants: Map<number, string>,
  send: (data: string) => void,
  isConnected: boolean
) {
  const peersRef = useRef<Map<number, PeerState>>(new Map());
  const audioCtxRef = useRef(audioCtx);
  audioCtxRef.current = audioCtx;
  const micStreamRef = useRef(micStream);
  micStreamRef.current = micStream;
  const sendRef = useRef(send);
  sendRef.current = send;
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const [remoteAnalysers, setRemoteAnalysers] = useState<
    Map<number, AnalyserNode>
  >(new Map());

  const localTrackRef = useRef<MediaStreamTrack | null>(null);

  // Keep local track ref in sync with mic stream
  useEffect(() => {
    if (micStream) {
      localTrackRef.current = micStream.getAudioTracks()[0] || null;
      if (localTrackRef.current) {
        localTrackRef.current.enabled = false; // Start muted
      }
    }
  }, [micStream]);

  const createPeerConnection = useCallback(
    (remoteId: number): PeerState => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local audio track (muted) to the connection
      if (micStreamRef.current) {
        for (const track of micStreamRef.current.getAudioTracks()) {
          pc.addTrack(track, micStreamRef.current);
        }
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendRef.current(
            JSON.stringify({
              type: "rtc_ice",
              targetId: remoteId,
              candidate: event.candidate.toJSON(),
            })
          );
        }
      };

      // Handle incoming remote audio track
      pc.ontrack = (event) => {
        if (!audioCtxRef.current) return;
        const remoteStream = event.streams[0];
        if (!remoteStream) return;

        const source = audioCtxRef.current.createMediaStreamSource(remoteStream);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        source.connect(analyser);
        analyser.connect(audioCtxRef.current.destination);

        const state = peersRef.current.get(remoteId);
        if (state) {
          state.analyser = analyser;
        }

        setRemoteAnalysers((prev) => new Map(prev).set(remoteId, analyser));
      };

      const state: PeerState = { pc, analyser: null };
      peersRef.current.set(remoteId, state);
      return state;
    },
    []
  );

  const destroyPeer = useCallback((remoteId: number) => {
    const state = peersRef.current.get(remoteId);
    if (state) {
      state.pc.close();
      peersRef.current.delete(remoteId);
      setRemoteAnalysers((prev) => {
        const next = new Map(prev);
        next.delete(remoteId);
        return next;
      });
    }
  }, []);

  // Initiate connection to a remote peer (we send the offer)
  const connectToPeer = useCallback(
    async (remoteId: number) => {
      const { pc } = createPeerConnection(remoteId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendRef.current(
        JSON.stringify({
          type: "rtc_offer",
          targetId: remoteId,
          sdp: offer.sdp,
        })
      );
    },
    [createPeerConnection]
  );

  // Handle incoming RTC offer (we send back an answer)
  const handleOffer = useCallback(
    async (fromId: number, sdp: string) => {
      // Destroy existing connection if any
      destroyPeer(fromId);

      const { pc } = createPeerConnection(fromId);
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendRef.current(
        JSON.stringify({
          type: "rtc_answer",
          targetId: fromId,
          sdp: answer.sdp,
        })
      );
    },
    [createPeerConnection, destroyPeer]
  );

  // Handle incoming RTC answer
  const handleAnswer = useCallback(async (fromId: number, sdp: string) => {
    const state = peersRef.current.get(fromId);
    if (state) {
      await state.pc.setRemoteDescription({ type: "answer", sdp });
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(
    async (fromId: number, candidate: RTCIceCandidateInit) => {
      const state = peersRef.current.get(fromId);
      if (state) {
        await state.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    },
    []
  );

  // Clean up a specific peer when they leave
  const handleParticipantLeft = useCallback(
    (id: number) => {
      destroyPeer(id);
    },
    [destroyPeer]
  );

  // When we first join, connect to all existing participants
  const handleWelcome = useCallback(
    (myId: number, existingParticipants: Array<{ id: number }>) => {
      for (const p of existingParticipants) {
        if (p.id !== myId) {
          connectToPeer(p.id);
        }
      }
    },
    [connectToPeer]
  );

  // Cleanup all peer connections on unmount
  useEffect(() => {
    return () => {
      for (const [, state] of peersRef.current) {
        state.pc.close();
      }
      peersRef.current.clear();
    };
  }, []);

  return {
    localTrack: localTrackRef,
    remoteAnalysers,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantLeft,
    handleWelcome,
    connectToPeer,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors

### Task 6: Rewrite usePTT

**Files:**
- Modify: `src/hooks/usePTT.ts`

- [ ] **Step 1: Replace usePTT with WebRTC-based version**

Replace entire file:

```typescript
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

export function usePTT(
  audioCtx: AudioContext | null,
  send: (data: string) => void,
  isConnected: boolean,
  localTrack: React.RefObject<MediaStreamTrack | null>,
  micStream: MediaStream | null
) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const squelchBufferRef = useRef<AudioBuffer | null>(null);
  const isSpeakingRef = useRef(false);

  // Pre-decode squelch sound into AudioBuffer for instant playback
  useEffect(() => {
    if (!audioCtx) return;
    fetch("/squelch.wav")
      .then((res) => res.arrayBuffer())
      .then((buf) => audioCtx.decodeAudioData(buf))
      .then((decoded) => {
        squelchBufferRef.current = decoded;
      })
      .catch(() => {});
  }, [audioCtx]);

  // Set up analyser for local waveform visualization (once per stream)
  useEffect(() => {
    if (!audioCtx || !micStream || analyserRef.current) return;
    const source = audioCtx.createMediaStreamSource(micStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    source.connect(analyser);
    analyserRef.current = analyser;
  }, [audioCtx, micStream]);

  const playSquelch = useCallback(() => {
    if (!squelchBufferRef.current || !audioCtx) return;
    const source = audioCtx.createBufferSource();
    source.buffer = squelchBufferRef.current;
    source.connect(audioCtx.destination);
    source.start();
  }, [audioCtx]);

  const startPTT = useCallback(() => {
    if (isSpeakingRef.current || !isConnected || !localTrack.current) return;

    if (audioCtx?.state === "suspended") {
      audioCtx.resume();
    }

    playSquelch();

    localTrack.current.enabled = true;
    send(JSON.stringify({ type: "speaking_start" }));

    isSpeakingRef.current = true;
    setIsSpeaking(true);
  }, [isConnected, audioCtx, send, playSquelch, localTrack]);

  const stopPTT = useCallback(() => {
    if (!isSpeakingRef.current) return;

    isSpeakingRef.current = false;
    setIsSpeaking(false);

    if (localTrack.current) {
      localTrack.current.enabled = false;
    }

    playSquelch();
    send(JSON.stringify({ type: "speaking_stop" }));
  }, [send, playSquelch, localTrack]);

  return {
    isSpeaking,
    localAnalyser: analyserRef,
    startPTT,
    stopPTT,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors in page.tsx (usePTT signature changed — fixed in Task 8)

### Task 7: Rewrite useRoom

**Files:**
- Modify: `src/hooks/useRoom.ts`

- [ ] **Step 1: Replace useRoom — remove SpeakerPlayback, add WebRTC signaling**

Replace entire file:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { useWebRTC } from "./useWebRTC";
import type { ServerMessage } from "@/lib/ws-protocol";

export function useRoom(
  roomId: string,
  token: string | undefined,
  audioCtx: AudioContext | null,
  micStream: MediaStream | null,
  ready: boolean = true
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
  const [roomClosed, setRoomClosed] = useState(false);

  const wsUrl = !ready || roomClosed
    ? null
    : `/ws/${roomId}${token ? `?token=${token}` : ""}`;

  const { send, state } = useWebSocket(wsUrl, {
    onMessage: (event) => {
      if (typeof event.data !== "string") return;
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
          webrtc.handleWelcome(msg.id, msg.participants);
          break;

        case "participant_joined":
          setParticipants((prev) =>
            new Map(prev).set(msg.id, msg.color)
          );
          setParticipantCount(msg.count);
          // Existing peers initiate connection to the new joiner
          webrtc.connectToPeer(msg.id);
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
          webrtc.handleParticipantLeft(msg.id);
          setParticipantCount(msg.count);
          break;

        case "speaking_start":
          setActiveSpeakers((prev) => new Set(prev).add(msg.id));
          break;

        case "speaking_stop":
          setActiveSpeakers((prev) => {
            const next = new Set(prev);
            next.delete(msg.id);
            return next;
          });
          break;

        case "rtc_offer":
          webrtc.handleOffer(msg.fromId, msg.sdp);
          break;

        case "rtc_answer":
          webrtc.handleAnswer(msg.fromId, msg.sdp);
          break;

        case "rtc_ice":
          webrtc.handleIceCandidate(msg.fromId, msg.candidate);
          break;

        case "room_closed":
          setRoomClosed(true);
          break;
      }
    },
    onClose: (event) => {
      if (event.code === 4004) {
        setRoomClosed(true);
      }
    },
  });

  const sendString = useCallback(
    (data: string) => send(data),
    [send]
  );

  const webrtc = useWebRTC(
    audioCtx,
    micStream,
    myId,
    participants,
    sendString,
    state === "open"
  );

  return {
    myId,
    myColor,
    isCreator,
    participants,
    participantCount,
    activeSpeakers,
    speakerAnalysers: webrtc.remoteAnalysers,
    roomClosed,
    isConnected: state === "open",
    send: sendString,
    localTrack: webrtc.localTrack,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors in page.tsx (useRoom signature changed — fixed in next task)

- [ ] **Step 3: Commit client hooks**

```bash
git add src/lib/audio-config.ts src/hooks/useWebRTC.ts src/hooks/usePTT.ts src/hooks/useRoom.ts
git commit -m "feat: WebRTC client hooks — useWebRTC, simplified usePTT, updated useRoom"
```

---

## Chunk 3: Wire Up + Cleanup

### Task 8: Update page.tsx

**Files:**
- Modify: `src/app/r/[roomId]/page.tsx`

- [ ] **Step 1: Update page to wire up new hook signatures**

Key changes:
- `useRoom` now takes `micStream` parameter
- `usePTT` now takes `localTrack` ref and `micStream` instead of `ArrayBuffer | string` send
- Remove `micStreamRef` from page (useRoom handles it)

Replace the hook wiring section (lines 38-56) with:

```typescript
const activate = useCallback(async () => {
  const ctx = new AudioContext();
  audioCtxRef.current = ctx;
  if (ctx.state === "suspended") ctx.resume();

  // Request mic permission during activation (user gesture)
  try {
    micStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
  } catch {
    // Continue without mic — user can still listen
  }

  setActivated(true);
}, []);

const room = useRoom(roomId, tokenReady ? token : undefined, audioCtxRef.current, micStreamRef.current, tokenReady);
const ptt = usePTT(audioCtxRef.current, room.send, room.isConnected, room.localTrack, micStreamRef.current);
```

- [ ] **Step 2: Verify full build compiles**

Run: `npx tsc --noEmit`
Expected: no errors

### Task 9: Delete speaker-playback.ts

**Files:**
- Delete: `src/lib/speaker-playback.ts`

- [ ] **Step 1: Delete the file**

```bash
rm src/lib/speaker-playback.ts
```

- [ ] **Step 2: Verify no remaining imports**

Run: `npx tsc --noEmit`
Expected: no errors (useRoom.ts no longer imports SpeakerPlayback)

### Task 10: Build, bump, commit, push

- [ ] **Step 1: Run full Next.js build**

Run: `bun run build`
Expected: build succeeds with no errors

- [ ] **Step 2: Test locally with dev server**

Run `bun run dev` in one terminal, `bun ws-server.ts` in another.
Open two browser tabs to the same room. Verify:
- Both tabs connect (participant count shows 2)
- PTT on tab 1 → squelch plays, waveform shows on tab 2
- PTT on tab 2 → squelch plays, waveform shows on tab 1
- Audio is heard in both directions

- [ ] **Step 3: Bump build number and commit**

```bash
echo $(($(cat BUILD_NUMBER) + 1)) > BUILD_NUMBER
git add -A
git commit -m "feat: WebRTC audio — replace MediaRecorder/MediaSource with peer-to-peer

Fixes iOS Safari compatibility. Audio now flows directly between
browsers via RTCPeerConnection instead of through the server.
PTT toggles track.enabled instead of starting/stopping MediaRecorder.
Server is signaling-only (SDP + ICE relay, no binary audio)."
```

- [ ] **Step 4: Push**

```bash
git push origin HEAD:claude/temp-radio-app-bi6WT
```
