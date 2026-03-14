"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

interface PeerState {
  pc: RTCPeerConnection;
  analyser: AnalyserNode | null;
  gainNode: GainNode | null;
}

export function useWebRTC(
  audioCtx: AudioContext | null,
  micStream: MediaStream | null,
  send: (data: string) => void
) {
  const peersRef = useRef<Map<number, PeerState>>(new Map());
  const audioCtxRef = useRef(audioCtx);
  audioCtxRef.current = audioCtx;
  const micStreamRef = useRef(micStream);
  micStreamRef.current = micStream;
  const sendRef = useRef(send);
  sendRef.current = send;

  const [remoteAnalysers, setRemoteAnalysers] = useState<
    Map<number, AnalyserNode>
  >(new Map());

  const createPeerConnection = useCallback(
    (remoteId: number): PeerState => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add raw mic track directly — no processing, no toggling
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

      let peerGain: GainNode | null = null;

      // Handle incoming remote audio track
      pc.ontrack = (event) => {
        if (!audioCtxRef.current) return;
        const remoteStream = event.streams[0];
        if (!remoteStream) return;

        const source = audioCtxRef.current.createMediaStreamSource(remoteStream);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = FFT_SIZE;

        // Receive-side gain: starts muted, unmuted by speaking_start
        const gain = audioCtxRef.current.createGain();
        gain.gain.value = 0;

        source.connect(analyser);
        source.connect(gain);
        gain.connect(audioCtxRef.current.destination);

        peerGain = gain;
        const state = peersRef.current.get(remoteId);
        if (state) {
          state.analyser = analyser;
          state.gainNode = gain;
        }

        setRemoteAnalysers((prev) => new Map(prev).set(remoteId, analyser));
      };

      const state: PeerState = { pc, analyser: null, gainNode: null };
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

  const handleOffer = useCallback(
    async (fromId: number, sdp: string) => {
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

  const handleAnswer = useCallback(async (fromId: number, sdp: string) => {
    const state = peersRef.current.get(fromId);
    if (state) {
      await state.pc.setRemoteDescription({ type: "answer", sdp });
    }
  }, []);

  const handleIceCandidate = useCallback(
    async (fromId: number, candidate: RTCIceCandidateInit) => {
      const state = peersRef.current.get(fromId);
      if (state) {
        await state.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    },
    []
  );

  // Receiver-side muting: unmute when speaking, mute when not
  const setRemoteMuted = useCallback((remoteId: number, muted: boolean) => {
    const state = peersRef.current.get(remoteId);
    if (state?.gainNode) {
      state.gainNode.gain.value = muted ? 0 : 1;
    }
  }, []);

  const handleParticipantLeft = useCallback(
    (id: number) => {
      destroyPeer(id);
    },
    [destroyPeer]
  );

  useEffect(() => {
    return () => {
      for (const [, state] of peersRef.current) {
        state.pc.close();
      }
      peersRef.current.clear();
    };
  }, []);

  return {
    remoteAnalysers,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantLeft,
    connectToPeer,
    setRemoteMuted,
  };
}
