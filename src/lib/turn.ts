/**
 * Cloudflare Realtime TURN credential generation.
 *
 * Requires env vars:
 *   CLOUDFLARE_TURN_KEY_ID    — TURN key ID from Cloudflare dashboard
 *   CLOUDFLARE_TURN_API_TOKEN — API token with TURN permissions
 *
 * Credentials are cached and refreshed before expiry.
 */

const TURN_KEY_ID = process.env.CLOUDFLARE_TURN_KEY_ID;
const TURN_API_TOKEN = process.env.CLOUDFLARE_TURN_API_TOKEN;

// Startup log
console.log(
  `[turn] CLOUDFLARE_TURN_KEY_ID: ${TURN_KEY_ID ? "set" : "NOT SET"}, CLOUDFLARE_TURN_API_TOKEN: ${TURN_API_TOKEN ? "set" : "NOT SET"}`
);

/** Credential TTL in seconds (6 hours) */
const CREDENTIAL_TTL = 21_600;

/** Refresh credentials 30 minutes before expiry */
const REFRESH_BUFFER_MS = 30 * 60 * 1000;

interface TurnCredentials {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

interface CachedCredentials {
  data: TurnCredentials;
  expiresAt: number;
}

let cached: CachedCredentials | null = null;
let lastError: string | null = null;

/** Default STUN-only config when TURN is not configured */
const STUN_ONLY: TurnCredentials = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function isTurnConfigured(): boolean {
  return !!TURN_KEY_ID && !!TURN_API_TOKEN;
}

export async function getTurnCredentials(): Promise<TurnCredentials> {
  if (!TURN_KEY_ID || !TURN_API_TOKEN) {
    return STUN_ONLY;
  }

  // Return cached credentials if still fresh
  if (cached && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
    console.log("[turn] returning cached credentials");
    return cached.data;
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TURN_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[turn] credential request failed: ${res.status} — ${text}`);
      lastError = `HTTP ${res.status}`;
      return cached?.data ?? STUN_ONLY;
    }

    const body = await res.json();
    const { username, credential } = body as {
      username: string;
      credential: string;
    };
    console.log("[turn] fresh credentials obtained successfully");
    lastError = null;

    const data: TurnCredentials = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          urls: [
            "turn:turn.cloudflare.com:3478?transport=udp",
            "turn:turn.cloudflare.com:3478?transport=tcp",
            "turns:turn.cloudflare.com:5349?transport=tcp",
          ],
          username,
          credential,
        },
      ],
    };

    cached = {
      data,
      expiresAt: Date.now() + CREDENTIAL_TTL * 1000,
    };

    return data;
  } catch (err) {
    console.error("[turn] credential fetch error:", err);
    lastError = String(err);
    return cached?.data ?? STUN_ONLY;
  }
}

export function getTurnStatus() {
  return {
    configured: isTurnConfigured(),
    credentialsFetched: cached !== null,
    cachedExpiresAt: cached ? new Date(cached.expiresAt).toISOString() : null,
    error: lastError,
  };
}
