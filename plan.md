# Plan: Radio Rejoin & No-Expire-On-Creator-Leave

## Problem
1. When the creator leaves, the entire room is destroyed (`closeRoom()`) — all participants get kicked
2. Users who leave (intentionally or due to network issues) cannot rejoin — they get a new participant ID and lose their identity

## Changes

### 1. Server: Don't close room when creator leaves (`rooms.ts`, `ws-server.ts`, `server.ts`)

**`rooms.ts`** — `removeParticipant()`:
- Stop returning `wasCreator`. The creator leaving is now treated identically to any other participant leaving.
- Remove the `closeRoom()` export (or keep it but stop calling it from the close handler).

**`ws-server.ts` and `server.ts`** — `ws.close()` handler:
- Remove the `if (wasCreator) { closeRoom(roomId); }` branch
- Always broadcast `participant_left` regardless of who left
- The room lives on as long as it exists in memory (cleaned up by the existing 30-min-empty-room interval)

### 2. Server: Allow rejoin with a rejoin token (`rooms.ts`, `ws-server.ts`, `server.ts`)

**`rooms.ts`**:
- Add a `rejoinTokens: Map<string, { color: string }>` field to the `Room` interface to remember departed participants' colors
- On `addParticipant()`: accept an optional `rejoinToken` parameter. If provided and found in the room's `rejoinTokens` map, restore the participant's color (giving them visual continuity). Remove the token from the map after use.
- On `removeParticipant()`: generate a rejoin token (nanoid), store it in `rejoinTokens` with the participant's color, and return it

**`ws-server.ts` and `server.ts`** — `ws.close()` handler:
- Capture the `rejoinToken` returned by `removeParticipant()`
- Send a new `participant_left_with_rejoin` message (or include `rejoinToken` in existing `participant_left`) — but only to the *leaving* participant. Wait — the leaving participant's socket is closing, so we can't send to them.
- **Better approach**: The rejoin token is generated **at join time** and sent in the `welcome` message. The server pre-generates it and stores it on the participant record. When the participant disconnects, the token remains valid in `rejoinTokens`.

**Revised flow**:
- `addParticipant()` generates a `rejoinToken` (nanoid) and stores it on the `Participant` record
- The `welcome` message includes `rejoinToken`
- Client stores `rejoinToken` in `sessionStorage`
- On disconnect, `removeParticipant()` moves the participant's `{ color, rejoinToken }` into `room.rejoinTokens`
- On reconnect, client sends `rejoinToken` as a query param: `/ws/{roomId}?rejoinToken=xxx`
- `addParticipant()` checks if `rejoinToken` matches any entry in `room.rejoinTokens` → restores color

### 3. Protocol changes (`ws-protocol.ts`)

- Add `rejoinToken: string` to the `welcome` server message type

### 4. Client: Store and use rejoin token (`useRoom.ts`, `page.tsx`)

**`page.tsx`** (room page):
- Read `rejoinToken` from `sessionStorage` on mount (key: `temp-radio-rejoin-${roomId}`)
- Pass it to `useRoom`

**`useRoom.ts`**:
- Accept `rejoinToken` parameter
- Include it in the WebSocket URL: `/ws/{roomId}?rejoinToken=xxx` (alongside existing `token` param for creators)
- On receiving `welcome`, store the new `rejoinToken` in `sessionStorage`

### 5. Client: Remove "STATION CLOSED" dead-end for creator-left (`page.tsx`, `useRoom.ts`)

- The `room_closed` message type is no longer sent (since we don't close rooms on creator leave)
- Keep the `roomClosed` state for the case where a room genuinely doesn't exist (4004 code on connect), but the "STATION CLOSED / The host has left" UI can be updated to say "STATION NOT FOUND" or similar
- Remove 4002 from `PERMANENT_CLOSE_CODES` in `useWebSocket.ts` since it's no longer used (or keep for safety)

### 6. Cleanup considerations

- The existing 30-min cleanup for empty rooms still applies — rooms with 0 participants and older than 30 min get deleted
- `rejoinTokens` map should also be pruned: add a TTL (e.g., 30 min) per token, or clear them during the same cleanup interval
- The `closeRoom()` function can remain for admin/future use, but is no longer called from the disconnect handler

## Files to modify

| File | Changes |
|------|---------|
| `src/lib/rooms.ts` | Add `rejoinTokens` to Room, generate token in `addParticipant`, restore in `addParticipant`, move to `rejoinTokens` in `removeParticipant` |
| `src/lib/ws-protocol.ts` | Add `rejoinToken` to `welcome` message type |
| `ws-server.ts` | Remove creator-close logic, pass rejoinToken from URL to `addParticipant`, include rejoinToken in welcome |
| `server.ts` | Same changes as ws-server.ts |
| `src/hooks/useRoom.ts` | Accept/pass rejoinToken, store on welcome |
| `src/hooks/useWebSocket.ts` | Remove 4002 from permanent close codes (optional) |
| `src/app/r/[roomId]/page.tsx` | Read/pass rejoinToken from sessionStorage, update "STATION CLOSED" UI |
| `src/lib/rooms.test.ts` | Update tests for new behavior |
