// #334 Community Spaces — client-side WebRTC audio mesh.
//
// Each participant opens a peer connection to every other participant (mesh), which
// is fine for small rooms. The socket layer only relays signaling. Uses the
// "perfect negotiation" pattern so simultaneous offers in a mesh don't deadlock.
// Speakers publish their mic; listeners open recv-only transceivers so they still
// hear speakers. Promotion to speaker renegotiates automatically via addTrack.

import { connectSocket } from './socket';

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function createSpaceRTC({ spaceId, onRemoteStream, onRemoteGone, onMic, onError }) {
  const socket = connectSocket();
  let selfId = null;
  let localStream = null;
  let speaking = false;
  let muted = false;
  const peers = new Map(); // remoteSocketId -> { pc, polite, makingOffer, ignoreOffer }

  const emitSignal = (to, data) => socket.emit('space_signal', { space_id: spaceId, to, data });

  function removePeer(remoteId) {
    const peer = peers.get(remoteId);
    if (!peer) return;
    try { peer.pc.close(); } catch { /* ignore */ }
    peers.delete(remoteId);
    onRemoteGone?.(remoteId);
  }

  function ensurePeer(remoteId) {
    const found = peers.get(remoteId);
    if (found) return found;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    // Deterministic tie-break: exactly one side of each pair is "polite" and yields on glare.
    const peer = { pc, polite: String(selfId) > String(remoteId), makingOffer: false, ignoreOffer: false };
    peers.set(remoteId, peer);

    if (localStream && speaking) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = ({ candidate }) => { if (candidate) emitSignal(remoteId, { candidate }); };
    pc.ontrack = (event) => onRemoteStream?.(remoteId, event.streams[0]);
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        // Only drop on hard failure; 'disconnected' can recover, so leave it to ICE restart-free retry.
        if (pc.connectionState !== 'disconnected') removePeer(remoteId);
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        emitSignal(remoteId, { description: pc.localDescription });
      } catch (err) {
        onError?.(err);
      } finally {
        peer.makingOffer = false;
      }
    };
    return peer;
  }

  async function handleSignal({ from, data }) {
    if (!from || !data) return;
    const peer = ensurePeer(from);
    const { pc } = peer;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          emitSignal(from, { description: pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      onError?.(err);
    }
  }

  const onPeerJoined = ({ socket_id }) => { if (socket_id) ensurePeer(socket_id); };
  const onPeerLeft = ({ socket_id }) => { if (socket_id) removePeer(socket_id); };
  const onSignal = (payload) => handleSignal(payload);
  const onMicEvent = (payload) => onMic?.(payload);

  async function acquireMic() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    applyMuted();
    return localStream;
  }
  function applyMuted() {
    if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }

  return {
    async join(canSpeak) {
      speaking = Boolean(canSpeak);
      if (speaking) {
        try { await acquireMic(); } catch (err) { onError?.(err); speaking = false; }
      }
      socket.on('space-peer-joined', onPeerJoined);
      socket.on('space-peer-left', onPeerLeft);
      socket.on('space-signal', onSignal);
      socket.on('space-mic', onMicEvent);

      const ack = await new Promise((resolve) => socket.emit('join_space', { space_id: spaceId }, resolve));
      if (ack?.ok === false) { onError?.(new Error(ack.message || 'Failed to join space audio')); return; }
      selfId = ack?.self_socket_id ?? null;

      // We're the newcomer: connect to each existing peer. Adding a track (speaker) or a
      // recv-only transceiver (listener) both trigger onnegotiationneeded → we offer.
      (ack?.peers || []).forEach((p) => {
        const { pc } = ensurePeer(p.socket_id);
        if (!speaking) { try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch { /* ignore */ } }
      });
    },

    async promoteToSpeaker() {
      if (speaking) return;
      try { await acquireMic(); } catch (err) { onError?.(err); return; }
      speaking = true;
      peers.forEach(({ pc }) => localStream.getTracks().forEach((t) => pc.addTrack(t, localStream)));
    },

    setMuted(next) {
      muted = Boolean(next);
      applyMuted();
      socket.emit('space_mic', { space_id: spaceId, muted });
    },

    isMuted: () => muted,
    isSpeaking: () => speaking,

    leave() {
      try { socket.emit('leave_space', { space_id: spaceId }); } catch { /* ignore */ }
      socket.off('space-peer-joined', onPeerJoined);
      socket.off('space-peer-left', onPeerLeft);
      socket.off('space-signal', onSignal);
      socket.off('space-mic', onMicEvent);
      Array.from(peers.keys()).forEach(removePeer);
      if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
    },
  };
}
