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
  /** Desired volume — tracks mute intent even before audio element exists */
  pendingVolume: number;
  /** Monotonic version to detect stale async operations */
  version: number;
}

export function useWebRTC(
  audioCtx: AudioContext | null,
  micStream: MediaStream | null,
  send: (data: string) => void
) {
  const peersRef = useRef<Map<number, PeerState>>(new Map());
  const peerVersionRef = useRef(0);
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

        const state = peersRef.current.get(remoteId);
        // Guard: peer was destroyed while we waited for unmute
        if (!state || state.pc !== pc) return;

        // Audio element for playback (works cross-browser with WebRTC)
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        // Apply any pending volume (speaking_start may have arrived before ontrack)
        audio.volume = state.pendingVolume;
        audio.play().catch(() => {});

        // Cloned track for waveform analyser (createMediaStreamSource on clone works)
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) return;
        const clonedStream = new MediaStream([audioTracks[0].clone()]);
        const source = ctx.createMediaStreamSource(clonedStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        source.connect(analyser);

        state.analyser = analyser;
        state.audio = audio;
        setRemoteAnalysers((prev) => new Map(prev).set(remoteId, analyser));
      };

      if (track.muted) {
        track.addEventListener("unmute", connectAudio, { once: true });
        // Re-check: track may have unmuted between the check and listener registration
        if (!track.muted) {
          track.removeEventListener("unmute", connectAudio);
          connectAudio();
        }
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
    const version = ++peerVersionRef.current;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(remoteId, { pc, analyser: null, audio: null, pendingVolume: 0, version });

    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => pc.addTrack(t, micStreamRef.current!));
    }

    setupIce(remoteId, pc);
    setupRemoteAudio(remoteId, pc);

    try {
      const offer = await pc.createOffer();
      // Guard: peer may have been replaced/destroyed during await
      const current = peersRef.current.get(remoteId);
      if (!current || current.version !== version) return;

      await pc.setLocalDescription(offer);
      const current2 = peersRef.current.get(remoteId);
      if (!current2 || current2.version !== version) return;

      sendRef.current(JSON.stringify({
        type: "rtc_offer",
        targetId: remoteId,
        sdp: pc.localDescription!.sdp,
      }));
    } catch {
      // Connection was closed or replaced — ignore
    }
  }, [destroyPeer, setupIce, setupRemoteAudio]);

  const handleOffer = useCallback(async (fromId: number, sdp: string) => {
    destroyPeer(fromId);
    const version = ++peerVersionRef.current;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(fromId, { pc, analyser: null, audio: null, pendingVolume: 0, version });

    setupIce(fromId, pc);
    setupRemoteAudio(fromId, pc);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
      const current = peersRef.current.get(fromId);
      if (!current || current.version !== version) return;

      if (micStreamRef.current) {
        micStreamRef.current.getAudioTracks().forEach((t) => pc.addTrack(t, micStreamRef.current!));
      }

      const answer = await pc.createAnswer();
      const current2 = peersRef.current.get(fromId);
      if (!current2 || current2.version !== version) return;

      await pc.setLocalDescription(answer);
      const current3 = peersRef.current.get(fromId);
      if (!current3 || current3.version !== version) return;

      sendRef.current(JSON.stringify({
        type: "rtc_answer",
        targetId: fromId,
        sdp: pc.localDescription!.sdp,
      }));
    } catch {
      // Connection was closed or replaced — ignore
    }
  }, [destroyPeer, setupIce, setupRemoteAudio]);

  const handleAnswer = useCallback(async (fromId: number, sdp: string) => {
    const state = peersRef.current.get(fromId);
    if (!state) return;
    try {
      await state.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
    } catch {
      // Connection was closed or replaced — ignore
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromId: number, candidate: RTCIceCandidateInit) => {
    const state = peersRef.current.get(fromId);
    if (!state) return;
    try {
      await state.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Connection was closed or replaced — ignore
    }
  }, []);

  const handleParticipantLeft = useCallback((id: number) => {
    destroyPeer(id);
  }, [destroyPeer]);

  const setRemoteMuted = useCallback((remoteId: number, muted: boolean) => {
    const state = peersRef.current.get(remoteId);
    if (!state) return;
    const vol = muted ? 0 : 1;
    // Store desired volume so it's applied when audio element is created
    state.pendingVolume = vol;
    if (state.audio) {
      state.audio.volume = vol;
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
