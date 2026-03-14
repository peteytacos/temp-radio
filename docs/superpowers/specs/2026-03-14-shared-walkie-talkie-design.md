# Shared Walkie-Talkie Redesign

## Overview

Transform Temp Radio from a one-broadcaster-to-many-listeners model into a shared walkie-talkie channel where every participant can both talk and listen. The radio image (`radio.jpg`) serves as the UI base, with all interface elements on the green screen (`#7ce580` bg, `#265327` primary) and the yellow button as a hold-to-talk (PTT) control.

## Room Lifecycle & Routing

- **`/`** — No UI. Creates a room via API, stores creator token in sessionStorage, redirects to `/r/{roomId}`.
- **`/r/{roomId}`** — The single page. All participants see the same radio UI.
- **Creator identification** — The first participant whose token matches the room's creator token. Persists across refresh via sessionStorage.
- **Room closes when creator disconnects** — Server detects creator's WebSocket close, sends `room_closed` to all, deletes the room.
- **Refresh** — Stays on same URL, reconnects to the same room.
- **"New Radio" button** — On the green screen, navigates to `/` to create a fresh room.

## WebSocket Protocol

### Connection

Single role: **participant**. No broadcaster/listener distinction. Connect via `/ws/{roomId}?token={token}` (token optional, only creator has one).

### Server-Assigned Identity

On connect, server assigns:
- **ID**: 1 byte (0-255)
- **Color**: From a preset palette
- **isCreator**: Boolean

### Messages: Server → Client

| Type | Payload | Purpose |
|------|---------|---------|
| `welcome` | `{ id, color, isCreator }` | Identity assignment on connect |
| `participant_joined` | `{ id, color, count }` | New user arrived |
| `participant_left` | `{ id, count }` | User disconnected |
| `speaking_start` | `{ id }` | User started PTT |
| `speaking_stop` | `{ id }` | User released PTT |
| `room_closed` | `{}` | Creator left, room destroyed |

### Messages: Client → Server

| Type | Purpose |
|------|---------|
| `speaking_start` | Client pressed PTT |
| `speaking_stop` | Client released PTT |

### Binary Audio

- **Client sends**: Raw MediaRecorder audio chunks (webm/opus)
- **Server relays**: Prepends 1-byte sender ID, sends to all other participants
- **Init segments**: Server caches each speaker's first chunk per PTT session for late-joiner decoding. Reset on each `speaking_start`.

## Client Audio Architecture

### Hold-to-Talk Flow

1. User presses yellow button (mousedown/touchstart)
2. Play `squelch.wav` (PTT-in)
3. Request mic permission (first time only — keep MediaStream alive for session)
4. Start MediaRecorder, send `{ type: "speaking_start" }` via WS
5. MediaRecorder sends audio chunks every 100ms → WS
6. User releases button (mouseup/touchend/touchcancel)
7. Stop MediaRecorder, send `{ type: "speaking_stop" }` via WS
8. Play `squelch.wav` (PTT-out)

### Mic Persistence

Mic stream acquired once on first PTT press, reused on subsequent presses. Only MediaRecorder starts/stops. Avoids repeated permission prompts and reduces latency.

### Receiving Audio

Each remote speaker gets their own playback pipeline:
- On `speaking_start` from remote user: Create Audio + MediaSource + SourceBuffer + AnalyserNode
- Route incoming binary chunks (matched by speaker ID prefix) to that speaker's SourceBuffer
- On `speaking_stop`: Let buffer drain, clean up
- On next `speaking_start` from same user: Fresh pipeline (new init segment)

### Per-Speaker Waveforms

Each speaker's AnalyserNode feeds waveform data to a shared canvas, drawn in their assigned color. Local user's waveform comes from their own mic's AnalyserNode.

## Green Screen UI

Background: `#7ce580`. Primary color: `#265327`.

```
┌─────────────────────────────────┐
│     TEMP RADIO COMMS UNIT       │  header
├─────────────────────────────────┤
│                                 │
│   [waveform canvas - full width]│  all speakers overlaid
│                                 │
├─────────────────────────────────┤
│ CH {roomId}           👤 3      │  info row
├─────────────────────────────────┤
│ [NEW RADIO] [COPY] [SHARE]      │  controls row
└─────────────────────────────────┘
```

### PTT Visual Feedback

- When holding the yellow button: status text below screen shows "TRANSMITTING", pulsing indicator on screen in user's color
- When idle: status text shows "STANDBY"
- Power LED lights up when connected to room

### Radio Body Overlays

- **Yellow button**: Invisible click target positioned over the button in the image. Handles mousedown/mouseup/touchstart/touchend for PTT.
- **Status text**: Below the screen, shows current state.
- **Power LED**: Small dot, lit when WebSocket is connected.

## Room Closed State

When creator disconnects:
- Server sends `room_closed` to all
- Green screen shows "STATION CLOSED" message
- PTT disabled
- Only control: NEW RADIO button

## Squelch Sound

`/public/squelch.wav` — played on PTT press (in) and PTT release (out). Preloaded on page load for instant playback.

## Color Palette

Preset palette for participant waveforms (high contrast on `#7ce580` background):

```
#265327  (dark green — first user)
#1a3a8a  (blue)
#8a1a3a  (crimson)
#6b3fa0  (purple)
#b85c00  (amber)
#0a7a7a  (teal)
#c43c8a  (magenta)
#4a6b00  (olive)
```

Colors assigned round-robin. With 8 colors, supports 8 visually distinct speakers. IDs beyond 8 wrap.

## Files to Change

### New/Rewrite
- `server.ts` — New participant model, binary tagging, creator tracking
- `src/lib/rooms.ts` — New Room interface (participants map, no broadcaster)
- `src/lib/ws-protocol.ts` — New message types
- `src/hooks/useRoom.ts` — Single hook replacing useBroadcaster + useListener
- `src/hooks/usePTT.ts` — Hold-to-talk logic with squelch
- `src/components/RadioShell.tsx` — New image (radio.jpg), new colors, PTT overlay
- `src/components/WaveformCanvas.tsx` — Multi-speaker waveform renderer
- `src/app/page.tsx` — Redirect-only, no UI
- `src/app/r/[roomId]/page.tsx` — Single participant view

### Remove/Deprecate
- `src/hooks/useBroadcaster.ts` — Replaced by useRoom
- `src/hooks/useListener.ts` — Replaced by useRoom
- `src/components/BroadcastButton.tsx` — Replaced by PTT overlay
- `src/components/TuneInGate.tsx` — No longer needed
- `src/components/ShareLink.tsx` — Inlined in controls row
- `src/components/VUMeter.tsx` — Replaced by multi-speaker waveform
- `src/components/SpectrumBars.tsx` — Not used
- `src/components/StatusBar.tsx` — Inlined

### Modify
- `src/components/LiveIndicator.tsx` — Update colors for new scheme
- `src/components/ListenerCount.tsx` — Rename to participant count, update colors
- `src/app/globals.css` — Update color variables
- `src/styles/radio-theme.ts` — New color values
- `src/lib/audio-config.ts` — No changes expected
- `src/app/api/create-room/route.ts` — Simplify (no broadcaster token needed? Or keep for creator ID)
- `src/app/api/close-room/route.ts` — May remove if room closes on disconnect
