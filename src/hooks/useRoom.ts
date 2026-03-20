"use client";

import { useState, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { useWebRTC } from "./useWebRTC";
import type { ServerMessage } from "@/lib/ws-protocol";

export function useRoom(
  roomId: string,
  token: string | undefined,
  audioCtx: AudioContext | null,
  micStream: MediaStream | null,
  ready: boolean = true,
  rtcConfig: RTCConfiguration | null = null,
  password: string | undefined = undefined,
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
  const [roomFull, setRoomFull] = useState(false);
  const [passwordNeeded, setPasswordNeeded] = useState(false);
  const [passwordWrong, setPasswordWrong] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);

  // Read rejoin token once and cache in a ref so it doesn't change the
  // WS URL on every render (welcome stores a new token → re-render →
  // URL change → reconnect → infinite loop).
  const rejoinTokenRef = useRef<string | null>(
    typeof window !== "undefined"
      ? sessionStorage.getItem(`temp-radio-rejoin-${roomId}`)
      : null
  );

  // Build WS URL with all query params — stable between renders
  const buildWsUrl = () => {
    if (!ready || roomClosed || roomFull || passwordNeeded) return null;
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (password) params.set("password", password);
    if (rejoinTokenRef.current) params.set("rejoinToken", rejoinTokenRef.current);
    const qs = params.toString();
    return `/ws/${roomId}${qs ? `?${qs}` : ""}`;
  };

  const wsUrl = buildWsUrl();

  const { send, state } = useWebSocket(wsUrl, {
    onMessage: (event) => {
      if (typeof event.data !== "string") return;
      const msg: ServerMessage = JSON.parse(event.data);

      switch (msg.type) {
        case "welcome":
          setMyId(msg.id);
          setMyColor(msg.color);
          setIsCreator(msg.isCreator);
          setHasPassword(msg.hasPassword);
          setPasswordNeeded(false);
          setPasswordWrong(false);
          setParticipants(
            new Map(msg.participants.map((p) => [p.id, p.color]))
          );
          setParticipantCount(msg.participants.length);
          // Store rejoin token for future reconnects
          if (typeof window !== "undefined") {
            sessionStorage.setItem(
              `temp-radio-rejoin-${roomId}`,
              msg.rejoinToken
            );
          }
          // Destroy any stale peers from a previous connection, then
          // initiate WebRTC to every existing participant in the room.
          // This handles both first join and WS reconnection scenarios.
          webrtc.destroyAllPeers();
          for (const p of msg.participants) {
            if (p.id !== msg.id) {
              webrtc.connectToPeer(p.id);
            }
          }
          break;

        case "participant_joined":
          setParticipants((prev) =>
            new Map(prev).set(msg.id, msg.color)
          );
          setParticipantCount(msg.count);
          // Don't initiate here — the joining peer initiates from
          // its welcome handler. Initiating from both sides causes
          // signaling glare where both offers cross and both answers
          // arrive for already-destroyed peer connections.
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
          webrtc.setRemoteMuted(msg.id, false);
          break;

        case "speaking_stop":
          setActiveSpeakers((prev) => {
            const next = new Set(prev);
            next.delete(msg.id);
            return next;
          });
          webrtc.setRemoteMuted(msg.id, true);
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

        case "password_required":
          setPasswordNeeded(true);
          setPasswordWrong(false);
          break;

        case "password_rejected":
          setPasswordNeeded(true);
          setPasswordWrong(true);
          break;

        case "room_closed":
          setRoomClosed(true);
          break;

        case "room_full":
          setRoomFull(true);
          break;

        case "password_set":
          setHasPassword(true);
          break;

        case "password_removed":
          setHasPassword(false);
          break;
      }
    },
    onClose: (event) => {
      if (event.code === 4010) {
        // Password required or rejected — the message handler already
        // set the correct state from the message sent before close
        setPasswordNeeded(true);
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
    sendString,
    rtcConfig
  );

  return {
    myId,
    myColor,
    isCreator,
    participants,
    participantCount,
    activeSpeakers,
    speakerAnalysers: webrtc.remoteAnalysers,
    diagnostics: webrtc.diagnostics,
    roomClosed,
    roomFull,
    passwordNeeded,
    passwordWrong,
    hasPassword,
    relayWarning: webrtc.relayWarning,
    isConnected: state === "open",
    send: sendString,
  };
}
