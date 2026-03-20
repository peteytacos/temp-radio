/**
 * Validates incoming WebSocket messages from clients.
 * Returns the validated message or null if invalid.
 */

interface SpeakingMsg {
  type: "speaking_start" | "speaking_stop";
}

interface RtcOfferMsg {
  type: "rtc_offer";
  targetId: number;
  sdp: string;
}

interface RtcAnswerMsg {
  type: "rtc_answer";
  targetId: number;
  sdp: string;
}

interface RtcIceMsg {
  type: "rtc_ice";
  targetId: number;
  candidate: Record<string, unknown>;
}

interface SetPasswordMsg {
  type: "set_password";
  password: string;
}

interface RemovePasswordMsg {
  type: "remove_password";
}

export type ValidClientMessage =
  | SpeakingMsg
  | RtcOfferMsg
  | RtcAnswerMsg
  | RtcIceMsg
  | SetPasswordMsg
  | RemovePasswordMsg;

/** Max SDP size (64 KB — typical offers are ~2-4 KB) */
const MAX_SDP_LENGTH = 65_536;

/** Max raw message size (128 KB) */
const MAX_MESSAGE_LENGTH = 131_072;

/** Max password length */
const MAX_PASSWORD_LENGTH = 128;

export function validateMessage(
  raw: string,
  roomParticipantIds: Set<number>,
  senderId: number
): ValidClientMessage | null {
  if (raw.length > MAX_MESSAGE_LENGTH) return null;

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof msg !== "object" || msg === null) return null;

  switch (msg.type) {
    case "speaking_start":
    case "speaking_stop":
      return { type: msg.type };

    case "rtc_offer":
    case "rtc_answer": {
      const targetId = msg.targetId;
      const sdp = msg.sdp;
      if (typeof targetId !== "number" || !Number.isInteger(targetId)) return null;
      if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > MAX_SDP_LENGTH) return null;
      // Can't send to yourself
      if (targetId === senderId) return null;
      // Target must be in the room
      if (!roomParticipantIds.has(targetId)) return null;
      return { type: msg.type, targetId, sdp };
    }

    case "rtc_ice": {
      const targetId = msg.targetId;
      const candidate = msg.candidate;
      if (typeof targetId !== "number" || !Number.isInteger(targetId)) return null;
      if (typeof candidate !== "object" || candidate === null) return null;
      if (targetId === senderId) return null;
      if (!roomParticipantIds.has(targetId)) return null;
      return { type: "rtc_ice", targetId, candidate: candidate as Record<string, unknown> };
    }

    case "set_password": {
      const password = msg.password;
      if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return null;
      return { type: "set_password", password };
    }

    case "remove_password":
      return { type: "remove_password" };

    default:
      return null;
  }
}
