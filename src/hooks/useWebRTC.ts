"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

function buildRtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: turnUser ?? "",
      credential: turnCred ?? "",
    });
  }

  return { iceServers };
}

const RTC_CONFIG = buildRtcConfig();

/** How long to wait before attempting ICE restart after failure */
const ICE_RESTART_DELAY = 2_000;

interface PeerState {
  pc: RTCPeerConnection;
  analyser: AnalyserNode | null;
  /** MediaStreamAudioSourceNode feeding the analyser — kept for cleanup */
  sourceNode: MediaStreamAudioSourceNode | null;
  /** Cloned stream for analyser — kept so we can stop its tracks */
  clonedStream: MediaStream | null;
  audio: HTMLAudioElement | null;
  /** Desired volume — tracks mute intent even before audio element exists */
  pendingVolume: number;
  /** Monotonic version to detect stale async operations */
  version: number;
  /** Timer for ICE restart delay */
  iceRestartTimer: ReturnType<typeof setTimeout> | null;
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
        const sourceNode = ctx.createMediaStreamSource(clonedStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        sourceNode.connect(analyser);

        state.analyser = analyser;
        state.sourceNode = sourceNode;
        state.clonedStream = clonedStream;
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

  /** Clean up all resources held by a peer (audio, analyser, cloned streams) */
  const cleanupPeerResources = useCallback((state: PeerState) => {
    if (state.iceRestartTimer) {
      clearTimeout(state.iceRestartTimer);
      state.iceRestartTimer = null;
    }
    if (state.audio) {
      state.audio.pause();
      state.audio.srcObject = null;
      state.audio = null;
    }
    if (state.sourceNode) {
      state.sourceNode.disconnect();
      state.sourceNode = null;
    }
    if (state.clonedStream) {
      state.clonedStream.getTracks().forEach((t) => t.stop());
      state.clonedStream = null;
    }
    state.analyser = null;
  }, []);

  const destroyPeer = useCallback((remoteId: number) => {
    const state = peersRef.current.get(remoteId);
    if (state) {
      cleanupPeerResources(state);
      state.pc.close();
      peersRef.current.delete(remoteId);
      setRemoteAnalysers((prev) => {
        const next = new Map(prev);
        next.delete(remoteId);
        return next;
      });
    }
  }, [cleanupPeerResources]);

  const connectToPeer = useCallback(async (remoteId: number) => {
    destroyPeer(remoteId);
    const version = ++peerVersionRef.current;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerState: PeerState = {
      pc, analyser: null, sourceNode: null, clonedStream: null,
      audio: null, pendingVolume: 0, version, iceRestartTimer: null,
    };
    peersRef.current.set(remoteId, peerState);

    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => pc.addTrack(t, micStreamRef.current!));
    }

    setupIce(remoteId, pc);
    setupRemoteAudio(remoteId, pc);
    setupConnectionMonitor(remoteId, pc, version);

    try {
      const offer = await pc.createOffer();
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

  /** Monitor ICE connection state and attempt restart on failure */
  const setupConnectionMonitor = useCallback((remoteId: number, pc: RTCPeerConnection, version: number) => {
    pc.onconnectionstatechange = () => {
      const state = peersRef.current.get(remoteId);
      if (!state || state.version !== version) return;

      if (pc.connectionState === "failed") {
        // Attempt ICE restart after a short delay
        if (state.iceRestartTimer) clearTimeout(state.iceRestartTimer);
        state.iceRestartTimer = setTimeout(async () => {
          const current = peersRef.current.get(remoteId);
          if (!current || current.version !== version) return;
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            const check = peersRef.current.get(remoteId);
            if (!check || check.version !== version) return;

            await pc.setLocalDescription(offer);
            const check2 = peersRef.current.get(remoteId);
            if (!check2 || check2.version !== version) return;

            sendRef.current(JSON.stringify({
              type: "rtc_offer",
              targetId: remoteId,
              sdp: pc.localDescription!.sdp,
            }));
          } catch {
            // PC was closed — ignore
          }
        }, ICE_RESTART_DELAY);
      }
    };
  }, []);

  const handleOffer = useCallback(async (fromId: number, sdp: string) => {
    destroyPeer(fromId);
    const version = ++peerVersionRef.current;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerState: PeerState = {
      pc, analyser: null, sourceNode: null, clonedStream: null,
      audio: null, pendingVolume: 0, version, iceRestartTimer: null,
    };
    peersRef.current.set(fromId, peerState);

    setupIce(fromId, pc);
    setupRemoteAudio(fromId, pc);
    setupConnectionMonitor(fromId, pc, version);

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
  }, [destroyPeer, setupIce, setupRemoteAudio, setupConnectionMonitor]);

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

  const destroyAllPeers = useCallback(() => {
    for (const [id] of peersRef.current) {
      destroyPeer(id);
    }
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
        cleanupPeerResources(state);
        state.pc.close();
      }
      peersRef.current.clear();
    };
  }, [cleanupPeerResources]);

  return {
    remoteAnalysers,
    connectToPeer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantLeft,
    destroyAllPeers,
    setRemoteMuted,
  };
}
