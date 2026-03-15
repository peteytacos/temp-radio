"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface PeerState {
  pc: RTCPeerConnection;
  analyser: AnalyserNode | null;
  audio: HTMLAudioElement | null;
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

  const setupRemoteAudio = useCallback((remoteId: number, pc: RTCPeerConnection) => {
    pc.ontrack = (event) => {
      const track = event.track;
      const stream = event.streams[0];
      if (!stream) return;

      const connectAudio = () => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        // Audio element for playback (works cross-browser with WebRTC)
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.volume = 0; // Start silent, unmuted by speaking_start
        audio.play().catch(() => {});

        // Cloned track for waveform analyser (createMediaStreamSource on clone works)
        const clonedStream = new MediaStream([stream.getAudioTracks()[0].clone()]);
        const source = ctx.createMediaStreamSource(clonedStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        source.connect(analyser);

        const state = peersRef.current.get(remoteId);
        if (state) {
          state.analyser = analyser;
          state.audio = audio;
        }
        setRemoteAnalysers((prev) => new Map(prev).set(remoteId, analyser));
      };

      if (track.muted) {
        track.addEventListener("unmute", connectAudio, { once: true });
      } else {
        connectAudio();
      }
    };
  }, []);

  const setupIce = useCallback((remoteId: number, pc: RTCPeerConnection) => {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendRef.current(JSON.stringify({
          type: "rtc_ice",
          targetId: remoteId,
          candidate: event.candidate.toJSON(),
        }));
      }
    };
  }, []);

  const destroyPeer = useCallback((remoteId: number) => {
    const state = peersRef.current.get(remoteId);
    if (state) {
      if (state.audio) {
        state.audio.pause();
        state.audio.srcObject = null;
      }
      state.pc.close();
      peersRef.current.delete(remoteId);
      setRemoteAnalysers((prev) => {
        const next = new Map(prev);
        next.delete(remoteId);
        return next;
      });
    }
  }, []);

  const connectToPeer = useCallback(async (remoteId: number) => {
    destroyPeer(remoteId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(remoteId, { pc, analyser: null, audio: null });

    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => pc.addTrack(t, micStreamRef.current!));
    }

    setupIce(remoteId, pc);
    setupRemoteAudio(remoteId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendRef.current(JSON.stringify({
      type: "rtc_offer",
      targetId: remoteId,
      sdp: pc.localDescription!.sdp,
    }));
  }, [destroyPeer, setupIce, setupRemoteAudio]);

  const handleOffer = useCallback(async (fromId: number, sdp: string) => {
    destroyPeer(fromId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(fromId, { pc, analyser: null, audio: null });

    setupIce(fromId, pc);
    setupRemoteAudio(fromId, pc);

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));

    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => pc.addTrack(t, micStreamRef.current!));
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendRef.current(JSON.stringify({
      type: "rtc_answer",
      targetId: fromId,
      sdp: pc.localDescription!.sdp,
    }));
  }, [destroyPeer, setupIce, setupRemoteAudio]);

  const handleAnswer = useCallback(async (fromId: number, sdp: string) => {
    const state = peersRef.current.get(fromId);
    if (state) {
      await state.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromId: number, candidate: RTCIceCandidateInit) => {
    const state = peersRef.current.get(fromId);
    if (state) {
      await state.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const handleParticipantLeft = useCallback((id: number) => {
    destroyPeer(id);
  }, [destroyPeer]);

  const setRemoteMuted = useCallback((remoteId: number, muted: boolean) => {
    const state = peersRef.current.get(remoteId);
    if (state?.audio) {
      state.audio.volume = muted ? 0 : 1;
    }
  }, []);

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
    connectToPeer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantLeft,
    setRemoteMuted,
  };
}
