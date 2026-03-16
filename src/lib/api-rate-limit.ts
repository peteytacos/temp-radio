/** IP-based rate limiter for HTTP API endpoints */

const ROOM_CREATE_LIMIT = 10;    // max rooms per window
const WINDOW_MS = 60_000;        // 1-minute window

interface Entry {
  count: number;
  windowStart: number;
}

const ipCounts = new Map<string, Entry>();

// Periodically purge expired entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounts) {
    if (now - entry.windowStart > WINDOW_MS) {
      ipCounts.delete(ip);
    }
  }
}, 30_000);

/**
 * Returns true if the request should be allowed.
 * Pass the client IP address.
 */
export function allowRoomCreation(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    ipCounts.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= ROOM_CREATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}
