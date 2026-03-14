# WebRTC Audio Rewrite

**Date:** 2026-03-14
**Status:** Draft

## Problem

The current audio pipeline uses MediaRecorder → WebSocket binary relay → MediaSource/SourceBuffer. iOS Safari does not reliably support `audio/webm;codecs=opus` in MediaSource API, making audio playback broken on iPhone. This codec incompatibility cannot be fixed with timing or autoplay workarounds.

## Solution

Replace the entire audio pipeline with WebRTC peer-to-peer audio. The Bun WebSocket server becomes a signaling-only server. Audio flows directly between browsers with codec negotiation handled automatically by WebRTC.

## Architecture

### Signaling Flow

1. User joins room → WebSocket connects to Bun server (unchanged)
2. Server assigns participant ID, broadcasts join (unchanged)
3. New peer creates RTCPeerConnection for each existing peer
4. Peers exchange SDP offers/answers and ICE candidates through the WebSocket
5. Audio streams flow peer-to-peer — server not involved in audio

### PTT Model

- Each peer's audio track starts with `track.enabled = false` (muted)
- PTT press: `track.enabled = true` + send `speaking_start` via WebSocket
- PTT release: `track.enabled = false` + send `speaking_stop` via WebSocket
- No MediaRecorder, no MediaSource, no codec negotiation needed client-side

### ICE Configuration

```javascript
{ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
```

Free public STUN server. No TURN server for now — works for most residential and mobile networks. Can add TURN later if connection failures are reported.

## New Components

### `useWebRTC.ts` Hook

Core new hook managing all peer connections for a room.

**State:**
- `Map<number, RTCPeerConnection>` — one connection per remote participant
- `Map<number, AnalyserNode>` — one analyser per remote participant (for waveform)
- Local `MediaStream` with audio track (acquired during activation)

**Peer Connection Lifecycle:**

When a new participant joins (we are the existing peer):
1. Create RTCPeerConnection with STUN config
2. Add local audio track (muted) to the connection
3. Create SDP offer
4. Send offer via WebSocket signaling (`rtc_offer` message)
5. Wait for answer
6. Exchange ICE candidates

When we join and see existing participants (we are the new peer):
1. Wait for offers from existing peers (they initiate)
2. Create RTCPeerConnection for each offer
3. Add local audio track (muted)
4. Create SDP answer
5. Send answer via WebSocket signaling (`rtc_answer` message)
6. Exchange ICE candidates

On remote track received (`ontrack` event):
1. Create `MediaStreamSource` from remote stream
2. Connect to `AnalyserNode` for waveform visualization
3. Connect to `audioCtx.destination` for playback

On participant leave:
1. Close RTCPeerConnection
2. Clean up AnalyserNode
3. Remove from maps

**Exports:**
- `localTrack: MediaStreamTrack | null` — for PTT mute/unmute
- `remoteAnalysers: Map<number, AnalyserNode>` — for waveform rendering

### Signaling Messages

Three new WebSocket message types:

```typescript
// Client → Server → Target peer
{ type: "rtc_offer", targetId: number, sdp: string }
{ type: "rtc_answer", targetId: number, sdp: string }
{ type: "rtc_ice", targetId: number, candidate: RTCIceCandidateInit }
```

Server reads `targetId` and forwards the message to that specific participant with the sender's ID attached:

```typescript
// Server → Target peer
{ type: "rtc_offer", fromId: number, sdp: string }
{ type: "rtc_answer", fromId: number, sdp: string }
{ type: "rtc_ice", fromId: number, candidate: RTCIceCandidateInit }
```

### Simplified `usePTT.ts`

Dramatically simplified — no MediaRecorder, no binary sends:

```typescript
function usePTT(audioCtx, send, isConnected, localTrack) {
  // startPTT: play squelch, track.enabled = true, send speaking_start
  // stopPTT: play squelch, track.enabled = false, send speaking_stop
  // Returns: isSpeaking, localAnalyser
}
```

Squelch sound continues using AudioBuffer approach (already working well).

### Waveform Visualization

No changes to `WaveformCanvas`. Data sources change:
- Local: AnalyserNode from local mic stream (same as now)
- Remote: AnalyserNode from WebRTC remote stream (replaces SpeakerPlayback analyser)

Both produce identical frequency data arrays — rendering code unchanged.

## Server Changes

### `server.ts` and `ws-server.ts`

**Remove:**
- Binary audio relay (the `else` branch in the message handler)
- `initSegments` map from Room type
- Binary data tagging/broadcasting

**Add:**
- Handle `rtc_offer`, `rtc_answer`, `rtc_ice` message types
- For each: read `targetId`, find that participant's WebSocket, forward with `fromId` attached

**Keep unchanged:**
- Room creation API
- WebSocket upgrade
- `welcome`, `participant_joined`, `participant_left` messages
- `speaking_start`, `speaking_stop` relay (used for UI state)
- `room_closed` handling

### Room Model Changes

```typescript
interface Room {
  id: string;
  creatorToken: string;
  participants: Map<number, Participant>;
  nextParticipantId: number;
  // REMOVED: initSegments: Map<number, Buffer>
  createdAt: number;
  closed: boolean;
}
```

## Files Deleted

- `src/lib/speaker-playback.ts` — entirely replaced by WebRTC remote streams

## Files Modified

- `src/hooks/usePTT.ts` — simplified, no MediaRecorder
- `src/hooks/useRoom.ts` — manages peer connections instead of playback pipelines
- `src/lib/audio-config.ts` — remove `AUDIO_MIME_TYPE`, `TIMESLICE_MS`, `BUFFER_TRIM_SECONDS` (keep `FFT_SIZE`)
- `src/lib/ws-protocol.ts` — add RTC signaling message types
- `src/app/r/[roomId]/page.tsx` — wire up new hooks
- `server.ts` — signaling relay, remove binary audio
- `ws-server.ts` — same changes as server.ts

## Files Created

- `src/hooks/useWebRTC.ts` — core WebRTC peer connection management

## What Stays the Same

- Room creation flow and URLs
- RadioShell UI, green screen, activation gate
- Waveform rendering (WaveformCanvas)
- Share/copy/new radio buttons
- WebSocket for signaling + speaking state
- Squelch sound (AudioBuffer approach)
- Build number display
- OG metadata

## Edge Cases

- **Participant joins mid-conversation:** Peer connections established, but they only hear audio from next PTT press (no buffered audio — acceptable for walkie-talkie)
- **Network partition:** RTCPeerConnection has `onconnectionstatechange` — can detect "failed" state and show UI feedback
- **Mic denied during activation:** App still works for listening, PTT is disabled
- **Multiple tabs:** Each tab gets its own peer connections — works independently
