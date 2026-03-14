"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

interface PeerState {
  pc: RTCPeerConnection;
  analyser: AnalyserNode | null;
}

export function useWebRTC(
  audioCtx: AudioContext | null,
  micStream: MediaStream | null,
  myId: number | null,
  participants: Map<number, string>,
  send: (data: string) => void,
  isConnected: boolean
) {
  const peersRef = useRef<Map<number, PeerState>>(new Map());
  const audioCtxRef = useRef(audioCtx);
  audioCtxRef.current = audioCtx;
  const micStreamRef = useRef(micStream);
  micStreamRef.current = micStream;
  const sendRef = useRef(send);
  sendRef.current = send;
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const [remoteAnalysers, setRemoteAnalysers] = useState<
    Map<number, AnalyserNode>
  >(new Map());

  const localTrackRef = useRef<MediaStreamTrack | null>(null);

  // Keep local track ref in sync with mic stream
  useEffect(() => {
    if (micStream) {
      localTrackRef.current = micStream.getAudioTracks()[0] || null;
      if (localTrackRef.current) {
        localTrackRef.current.enabled = false; // Start muted
      }
    }
  }, [micStream]);

  const createPeerConnection = useCallback(
    (remoteId: number): PeerState => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local audio track (muted) to the connection
      if (micStreamRef.current) {
        for (const track of micStreamRef.current.getAudioTracks()) {
          pc.addTrack(track, micStreamRef.current);
        }
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendRef.current(
            JSON.stringify({
              type: "rtc_ice",
              targetId: remoteId,
              candidate: event.candidate.toJSON(),
            })
          );
        }
      };

      // Handle incoming remote audio track
      pc.ontrack = (event) => {
        if (!audioCtxRef.current) return;
        const remoteStream = event.streams[0];
        if (!remoteStream) return;

        const source = audioCtxRef.current.createMediaStreamSource(remoteStream);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        source.connect(analyser);
        analyser.connect(audioCtxRef.current.destination);

        const state = peersRef.current.get(remoteId);
        if (state) {
          state.analyser = analyser;
        }

        setRemoteAnalysers((prev) => new Map(prev).set(remoteId, analyser));
      };

      const state: PeerState = { pc, analyser: null };
      peersRef.current.set(remoteId, state);
      return state;
    },
    []
  );

  const destroyPeer = useCallback((remoteId: number) => {
    const state = peersRef.current.get(remoteId);
    if (state) {
      state.pc.close();
      peersRef.current.delete(remoteId);
      setRemoteAnalysers((prev) => {
        const next = new Map(prev);
        next.delete(remoteId);
        return next;
      });
    }
  }, []);

  // Initiate connection to a remote peer (we send the offer)
  const connectToPeer = useCallback(
    async (remoteId: number) => {
      const { pc } = createPeerConnection(remoteId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendRef.current(
        JSON.stringify({
          type: "rtc_offer",
          targetId: remoteId,
          sdp: offer.sdp,
        })
      );
    },
    [createPeerConnection]
  );

  // Handle incoming RTC offer (we send back an answer)
  const handleOffer = useCallback(
    async (fromId: number, sdp: string) => {
      // Destroy existing connection if any
      destroyPeer(fromId);

      const { pc } = createPeerConnection(fromId);
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendRef.current(
        JSON.stringify({
          type: "rtc_answer",
          targetId: fromId,
          sdp: answer.sdp,
        })
      );
    },
    [createPeerConnection, destroyPeer]
  );

  // Handle incoming RTC answer
  const handleAnswer = useCallback(async (fromId: number, sdp: string) => {
    const state = peersRef.current.get(fromId);
    if (state) {
      await state.pc.setRemoteDescription({ type: "answer", sdp });
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(
    async (fromId: number, candidate: RTCIceCandidateInit) => {
      const state = peersRef.current.get(fromId);
      if (state) {
        await state.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    },
    []
  );

  // Clean up a specific peer when they leave
  const handleParticipantLeft = useCallback(
    (id: number) => {
      destroyPeer(id);
    },
    [destroyPeer]
  );

  // When we first join, connect to all existing participants
  const handleWelcome = useCallback(
    (myId: number, existingParticipants: Array<{ id: number }>) => {
      for (const p of existingParticipants) {
        if (p.id !== myId) {
          connectToPeer(p.id);
        }
      }
    },
    [connectToPeer]
  );

  // Cleanup all peer connections on unmount
  useEffect(() => {
    return () => {
      for (const [, state] of peersRef.current) {
        state.pc.close();
      }
      peersRef.current.clear();
    };
  }, []);

  return {
    localTrack: localTrackRef,
    remoteAnalysers,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantLeft,
    handleWelcome,
    connectToPeer,
  };
}
