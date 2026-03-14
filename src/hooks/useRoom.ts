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

  const wsUrl = !ready || roomClosed
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
          break;

        case "speaking_stop":
          setActiveSpeakers((prev) => {
            const next = new Set(prev);
            next.delete(msg.id);
            return next;
          });
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
    isConnected: state === "open",
    send: sendString,
  };
}
