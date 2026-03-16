/** Simple sliding-window rate limiter per WebSocket connection */

const MSG_LIMIT = 60;       // max messages per window
const WINDOW_MS = 5_000;    // 5-second window

interface RateLimitState {
  timestamps: number[];
}

const clients = new WeakMap<object, RateLimitState>();

/**
 * Returns true if the message should be allowed, false if rate-limited.
 * Pass the WebSocket object (or any stable per-connection object) as key.
 */
export function allowMessage(wsKey: object): boolean {
  const now = Date.now();
  let state = clients.get(wsKey);
  if (!state) {
    state = { timestamps: [] };
    clients.set(wsKey, state);
  }

  // Drop timestamps outside the window
  const cutoff = now - WINDOW_MS;
  while (state.timestamps.length > 0 && state.timestamps[0] <= cutoff) {
    state.timestamps.shift();
  }

  if (state.timestamps.length >= MSG_LIMIT) {
    return false;
  }

  state.timestamps.push(now);
  return true;
}
