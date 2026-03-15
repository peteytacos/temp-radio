"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { FFT_SIZE } from "@/lib/audio-config";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface PeerState {
  pc: RTCPeerConnection;
  analyser: AnalyserNode | null;
  gain: GainNode | null;
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
      console.log(`[WebRTC] ontrack peer ${remoteId}: kind=${track?.kind} enabled=${track?.enabled} muted=${track?.muted} readyState=${track?.readyState}`);

      if (!stream) { console.warn("[WebRTC] No stream in ontrack"); return; }

      const connectAudio = () => {
        const ctx = audioCtxRef.current;
        if (!ctx) { console.warn("[WebRTC] No AudioContext when connecting audio"); return; }
        console.log(`[WebRTC] Connecting audio graph for peer ${remoteId}`);

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        const gain = ctx.createGain();
        gain.gain.value = 1; // DIAGNOSTIC: always audible to test audio graph

        source.connect(analyser);
        analyser.connect(gain);
        gain.connect(ctx.destination);

        const state = peersRef.current.get(remoteId);
        if (state) {
          state.analyser = analyser;
          state.gain = gain;
        }
        setRemoteAnalysers((prev) => new Map(prev).set(remoteId, analyser));
      };

      // Wait for track to unmute (receive actual data) before creating audio graph
      if (track.muted) {
        console.log(`[WebRTC] Track muted, waiting for unmute...`);
        track.addEventListener("unmute", () => {
          console.log(`[WebRTC] Track unmuted for peer ${remoteId}`);
          connectAudio();
        }, { once: true });
      } else {
        connectAudio();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${remoteId} connection state: ${pc.connectionState}`);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${remoteId} ICE state: ${pc.iceConnectionState}`);
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
    peersRef.current.set(remoteId, { pc, analyser: null, gain: null });

    const micTracks = micStreamRef.current?.getAudioTracks() || [];
    console.log(`[WebRTC] connectToPeer(${remoteId}) — offerer, mic tracks:`, micTracks.map(t => ({ enabled: t.enabled, muted: t.muted, readyState: t.readyState })));

    if (micStreamRef.current) {
      micTracks.forEach((t) => pc.addTrack(t, micStreamRef.current!));
    }

    setupIce(remoteId, pc);
    setupRemoteAudio(remoteId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log(`[WebRTC] Sending offer to ${remoteId}, transceivers:`, pc.getTransceivers().map(t => ({
      mid: t.mid,
      direction: t.direction,
      senderTrack: t.sender.track?.kind,
      receiverTrack: t.receiver.track?.kind,
    })));

    sendRef.current(JSON.stringify({
      type: "rtc_offer",
      targetId: remoteId,
      sdp: pc.localDescription!.sdp,
    }));
  }, [destroyPeer, setupIce, setupRemoteAudio]);

  const handleOffer = useCallback(async (fromId: number, sdp: string) => {
    destroyPeer(fromId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(fromId, { pc, analyser: null, gain: null });

    setupIce(fromId, pc);
    setupRemoteAudio(fromId, pc);

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));

    const micTracks = micStreamRef.current?.getAudioTracks() || [];
    console.log(`[WebRTC] handleOffer(${fromId}) — answerer, mic tracks:`, micTracks.map(t => ({ enabled: t.enabled, muted: t.muted, readyState: t.readyState })));

    if (micStreamRef.current) {
      micTracks.forEach((t) => pc.addTrack(t, micStreamRef.current!));
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    console.log(`[WebRTC] Sending answer to ${fromId}, transceivers:`, pc.getTransceivers().map(t => ({
      mid: t.mid,
      direction: t.direction,
      senderTrack: t.sender.track?.kind,
      receiverTrack: t.receiver.track?.kind,
    })));

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
      console.log(`[WebRTC] Answer set for ${fromId}, transceivers:`, state.pc.getTransceivers().map(t => ({
        mid: t.mid,
        direction: t.direction,
        senderTrack: t.sender.track?.kind,
        receiverTrack: t.receiver.track?.kind,
      })));
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

  useEffect(() => {
    return () => {
      for (const [, state] of peersRef.current) {
        state.pc.close();
      }
      peersRef.current.clear();
    };
  }, []);

  const setRemoteMuted = useCallback((remoteId: number, muted: boolean) => {
    const state = peersRef.current.get(remoteId);
    if (state?.gain) {
      state.gain.gain.value = muted ? 0 : 1;
    }
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
