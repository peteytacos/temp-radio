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
  const sendRef = useRef(send);
  sendRef.current = send;

  const [remoteAnalysers, setRemoteAnalysers] = useState<
    Map<number, AnalyserNode>
  >(new Map());

  // Process mic through a GainNode for PTT muting (avoids iOS track.enabled issues)
  const gainRef = useRef<GainNode | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!audioCtx || !micStream) return;

    const source = audioCtx.createMediaStreamSource(micStream);
    const gain = audioCtx.createGain();
    gain.gain.value = 0; // Start muted
    const dest = audioCtx.createMediaStreamDestination();

    source.connect(gain);
    gain.connect(dest);

    gainRef.current = gain;
    processedStreamRef.current = dest.stream;
  }, [audioCtx, micStream]);

  const createPeerConnection = useCallback(
    (remoteId: number): PeerState => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add processed (gain-controlled) audio track to the connection
      const stream = processedStreamRef.current;
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          pc.addTrack(track, stream);
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
    gainNode: gainRef,
    remoteAnalysers,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantLeft,
    connectToPeer,
  };
}
