"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useWebSocket } from "./useWebSocket";
import { SpeakerPlayback } from "@/lib/speaker-playback";
import type { ServerMessage } from "@/lib/ws-protocol";

export function useRoom(
  roomId: string,
  token: string | undefined,
  audioCtx: AudioContext | null,
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
  const [speakerAnalysers, setSpeakerAnalysers] = useState<
    Map<number, AnalyserNode>
  >(new Map());
  const [roomClosed, setRoomClosed] = useState(false);

  const pipelinesRef = useRef<Map<number, SpeakerPlayback>>(new Map());
  const audioCtxRef = useRef(audioCtx);
  audioCtxRef.current = audioCtx;

  const wsUrl = !ready || roomClosed
    ? null
    : `/ws/${roomId}${token ? `?token=${token}` : ""}`;

  const destroyPipeline = useCallback((speakerId: number) => {
    const pipeline = pipelinesRef.current.get(speakerId);
    if (pipeline) {
      pipeline.destroy();
      pipelinesRef.current.delete(speakerId);
      setSpeakerAnalysers((prev) => {
        const next = new Map(prev);
        next.delete(speakerId);
        return next;
      });
    }
  }, []);

  const createPipeline = useCallback(
    (speakerId: number) => {
      if (!audioCtxRef.current) return;

      // Destroy existing pipeline for this speaker if any
      destroyPipeline(speakerId);

      const pipeline = new SpeakerPlayback(audioCtxRef.current);
      pipelinesRef.current.set(speakerId, pipeline);
      setSpeakerAnalysers((prev) =>
        new Map(prev).set(speakerId, pipeline.analyser)
      );
    },
    [destroyPipeline]
  );

  const { send, state } = useWebSocket(wsUrl, {
    onMessage: (event) => {
      if (typeof event.data === "string") {
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
            destroyPipeline(msg.id);
            setParticipantCount(msg.count);
            break;

          case "speaking_start":
            setActiveSpeakers((prev) => new Set(prev).add(msg.id));
            createPipeline(msg.id);
            break;

          case "speaking_stop": {
            setActiveSpeakers((prev) => {
              const next = new Set(prev);
              next.delete(msg.id);
              return next;
            });
            // Let pipeline finish playing all buffered audio, then destroy
            const stoppedPipeline = pipelinesRef.current.get(msg.id);
            if (stoppedPipeline) {
              stoppedPipeline.finish().then(() => {
                // Only destroy if this is still the same pipeline (not replaced by a new speaking session)
                if (pipelinesRef.current.get(msg.id) === stoppedPipeline) {
                  destroyPipeline(msg.id);
                }
              });
            }
            break;
          }

          case "room_closed":
            setRoomClosed(true);
            break;
        }
      } else {
        // Binary audio data: first byte is speaker ID, rest is audio
        const buf = event.data as ArrayBuffer;
        const view = new Uint8Array(buf);
        const speakerId = view[0];
        const audioData = buf.slice(1);

        const pipeline = pipelinesRef.current.get(speakerId);
        if (pipeline) {
          pipeline.appendChunk(audioData);
        }
      }
    },
    onClose: (event) => {
      if (event.code === 4004) {
        setRoomClosed(true);
      }
    },
  });

  // Cleanup all pipelines on unmount
  useEffect(() => {
    return () => {
      for (const [, pipeline] of pipelinesRef.current) {
        pipeline.destroy();
      }
      pipelinesRef.current.clear();
    };
  }, []);

  return {
    myId,
    myColor,
    isCreator,
    participants,
    participantCount,
    activeSpeakers,
    speakerAnalysers,
    roomClosed,
    isConnected: state === "open",
    send,
  };
}
