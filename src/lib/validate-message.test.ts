import { describe, it, expect } from "vitest";
import { validateMessage } from "./validate-message";

const roomIds = new Set([0, 1, 2, 5]);
const senderId = 0;

describe("validateMessage", () => {
  // ========== Speaking messages ==========
  describe("speaking_start / speaking_stop", () => {
    it("accepts valid speaking_start", () => {
      const result = validateMessage(
        JSON.stringify({ type: "speaking_start" }),
        roomIds,
        senderId
      );
      expect(result).toEqual({ type: "speaking_start" });
    });

    it("accepts valid speaking_stop", () => {
      const result = validateMessage(
        JSON.stringify({ type: "speaking_stop" }),
        roomIds,
        senderId
      );
      expect(result).toEqual({ type: "speaking_stop" });
    });

    it("ignores extra fields on speaking messages", () => {
      const result = validateMessage(
        JSON.stringify({ type: "speaking_start", extra: "foo" }),
        roomIds,
        senderId
      );
      expect(result).toEqual({ type: "speaking_start" });
    });
  });

  // ========== RTC offer/answer ==========
  describe("rtc_offer / rtc_answer", () => {
    it("accepts valid rtc_offer", () => {
      const result = validateMessage(
        JSON.stringify({ type: "rtc_offer", targetId: 1, sdp: "v=0\r\n..." }),
        roomIds,
        senderId
      );
      expect(result).toEqual({
        type: "rtc_offer",
        targetId: 1,
        sdp: "v=0\r\n...",
      });
    });

    it("accepts valid rtc_answer", () => {
      const result = validateMessage(
        JSON.stringify({ type: "rtc_answer", targetId: 2, sdp: "v=0\r\n..." }),
        roomIds,
        senderId
      );
      expect(result).toEqual({
        type: "rtc_answer",
        targetId: 2,
        sdp: "v=0\r\n...",
      });
    });

    it("rejects offer with non-integer targetId", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", targetId: 1.5, sdp: "sdp" }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects offer with string targetId", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", targetId: "1", sdp: "sdp" }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects offer with empty sdp", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", targetId: 1, sdp: "" }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects offer with non-string sdp", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", targetId: 1, sdp: 123 }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects offer with oversized sdp (>64KB)", () => {
      const bigSdp = "x".repeat(65_537);
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", targetId: 1, sdp: bigSdp }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects offer targeting self", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", targetId: senderId, sdp: "sdp" }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects offer targeting non-existent participant", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", targetId: 999, sdp: "sdp" }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects offer missing targetId", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", sdp: "sdp" }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects offer missing sdp", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_offer", targetId: 1 }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });
  });

  // ========== RTC ICE ==========
  describe("rtc_ice", () => {
    it("accepts valid rtc_ice", () => {
      const candidate = {
        candidate: "candidate:1 1 UDP 2130706431 ...",
        sdpMid: "0",
        sdpMLineIndex: 0,
      };
      const result = validateMessage(
        JSON.stringify({ type: "rtc_ice", targetId: 1, candidate }),
        roomIds,
        senderId
      );
      expect(result).toEqual({ type: "rtc_ice", targetId: 1, candidate });
    });

    it("rejects ice with null candidate", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_ice", targetId: 1, candidate: null }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects ice with string candidate", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "rtc_ice", targetId: 1, candidate: "abc" }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects ice targeting self", () => {
      expect(
        validateMessage(
          JSON.stringify({
            type: "rtc_ice",
            targetId: senderId,
            candidate: {},
          }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects ice targeting non-existent participant", () => {
      expect(
        validateMessage(
          JSON.stringify({
            type: "rtc_ice",
            targetId: 999,
            candidate: {},
          }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });
  });

  // ========== Invalid inputs ==========
  describe("invalid inputs", () => {
    it("rejects invalid JSON", () => {
      expect(validateMessage("{bad json", roomIds, senderId)).toBeNull();
    });

    it("rejects non-object JSON (string)", () => {
      expect(validateMessage('"hello"', roomIds, senderId)).toBeNull();
    });

    it("rejects non-object JSON (number)", () => {
      expect(validateMessage("42", roomIds, senderId)).toBeNull();
    });

    it("rejects non-object JSON (array)", () => {
      expect(validateMessage("[1,2,3]", roomIds, senderId)).toBeNull();
    });

    it("rejects null JSON", () => {
      expect(validateMessage("null", roomIds, senderId)).toBeNull();
    });

    it("rejects unknown message type", () => {
      expect(
        validateMessage(
          JSON.stringify({ type: "unknown_type" }),
          roomIds,
          senderId
        )
      ).toBeNull();
    });

    it("rejects message without type", () => {
      expect(
        validateMessage(JSON.stringify({ foo: "bar" }), roomIds, senderId)
      ).toBeNull();
    });

    it("rejects oversized raw message (>128KB)", () => {
      const huge = JSON.stringify({
        type: "speaking_start",
        padding: "x".repeat(131_073),
      });
      expect(validateMessage(huge, roomIds, senderId)).toBeNull();
    });
  });
});
