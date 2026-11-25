/**
 * WHIP (WebRTC-HTTP Ingestion Protocol) publisher for one-tap live.
 * ICE gathering completes before the SDP offer is posted so MediaMTX (non-trickle) can answer.
 */

export function waitIceGatheringComplete(pc, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!pc || pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const done = () => {
      try { pc.removeEventListener('icegatheringstatechange', onChange); } catch { /* */ }
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

export function liveCameraConstraints({ facing = 'user' } = {}) {
  const mode = facing === 'environment' ? 'environment' : 'user';
  return {
    video: {
      facingMode: { ideal: mode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: { echoCancellation: true, noiseSuppression: true },
  };
}

/** Subscribe to ICE/DTLS connection state. Returns an unsubscribe function. */
export function subscribeConnectionState(pc, onState) {
  if (!pc || typeof onState !== 'function' || typeof pc.addEventListener !== 'function') {
    return () => {};
  }
  const onChange = () => onState(pc.connectionState);
  pc.addEventListener('connectionstatechange', onChange);
  return () => {
    try { pc.removeEventListener('connectionstatechange', onChange); } catch { /* */ }
  };
}

/**
 * Swap camera/screen tracks on an existing WHIP peer connection without a re-offer.
 * Kinds present on `stream` replace matching senders; kinds we don't have (e.g. screen
 * share with no audio) keep the existing sender so the mic stays live.
 */
export async function replacePublishTracks(pc, stream) {
  if (!pc || typeof pc.getSenders !== 'function') {
    throw new Error('Peer connection cannot replace tracks');
  }
  if (!stream || typeof stream.getTracks !== 'function') {
    throw new Error('stream is required');
  }
  const senders = pc.getSenders();
  for (const track of stream.getTracks()) {
    const sender = senders.find((s) => s.track && s.track.kind === track.kind);
    if (!sender || typeof sender.replaceTrack !== 'function') {
      throw new Error(`No ${track.kind} sender to replace`);
    }
    await sender.replaceTrack(track);
  }
}

/**
 * @param {object} opts
 * @param {MediaStream} opts.stream
 * @param {(sdp: string) => Promise<string>} opts.postOffer  returns SDP answer
 * @param {typeof RTCPeerConnection} [opts.PeerConnection]
 * @param {RTCConfiguration} [opts.rtcConfig]
 * @param {(state: RTCPeerConnectionState) => void} [opts.onConnectionState]
 */
export async function startWhipPublish({
  stream,
  postOffer,
  PeerConnection,
  rtcConfig,
  onConnectionState,
} = {}) {
  if (!stream || typeof postOffer !== 'function') {
    throw new Error('stream and postOffer are required');
  }
  const PC = PeerConnection || (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
  if (!PC) throw new Error('WebRTC is not available in this browser');

  const pc = new PC(rtcConfig || { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const unsubConnection = subscribeConnectionState(pc, onConnectionState);
  for (const track of stream.getTracks()) {
    pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceGatheringComplete(pc);
  const localSdp = pc.localDescription?.sdp;
  if (!localSdp) {
    unsubConnection();
    try { pc.close(); } catch { /* */ }
    throw new Error('Could not build a WebRTC offer');
  }

  let answerSdp;
  try {
    answerSdp = await postOffer(localSdp);
  } catch (err) {
    unsubConnection();
    try { pc.close(); } catch { /* */ }
    throw err;
  }
  if (!answerSdp || typeof answerSdp !== 'string') {
    unsubConnection();
    try { pc.close(); } catch { /* */ }
    throw new Error('Media server returned an empty answer');
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  return {
    pc,
    stop() {
      unsubConnection();
      try { pc.close(); } catch { /* */ }
    },
  };
}
