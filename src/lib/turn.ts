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
      console.error(`TURN credential request failed: ${res.status}`);
      return cached?.data ?? STUN_ONLY;
    }

    const body = await res.json();
    const { username, credential } = body as {
      username: string;
      credential: string;
    };

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
    console.error("TURN credential fetch error:", err);
    return cached?.data ?? STUN_ONLY;
  }
}
