"use client";

import { useState, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { useWebRTC } from "./useWebRTC";
import type { ServerMessage } from "@/lib/ws-protocol";

export function useRoom(
  roomId: string,
  token: string | undefined,
  audioCtx: AudioContext | null,
  micStream: MediaStream | null,
  ready: boolean = true
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

  const wsUrl = !ready || roomClosed || roomFull
    ? null
    : `/ws/${roomId}${token ? `?token=${token}` : ""}`;

  const { send, state } = useWebSocket(wsUrl, {
    onMessage: (event) => {
      if (typeof event.data !== "string") return;
      const msg: ServerMessage = JSON.parse(event.data);

      switch (msg.type) {
        case "welcome":
          setMyId(msg.id);
          setMyColor(msg.color);
          setIsCreator(msg.isCreator);
          setParticipants(
            new Map(msg.participants.map((p) => [p.id, p.color]))
          );
          setParticipantCount(msg.participants.length);
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
          webrtc.connectToPeer(msg.id);
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

        case "room_closed":
          setRoomClosed(true);
          break;

        case "room_full":
          setRoomFull(true);
          break;
      }
    },
    onClose: (event) => {
      if (event.code === 4004) {
        setRoomClosed(true);
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
    sendString
  );

  return {
    myId,
    myColor,
    isCreator,
    participants,
    participantCount,
    activeSpeakers,
    speakerAnalysers: webrtc.remoteAnalysers,
    roomClosed,
    roomFull,
    isConnected: state === "open",
    send: sendString,
  };
}
