import { describe, it, expect, vi } from 'vitest';
import { waitIceGatheringComplete, liveCameraConstraints, startWhipPublish, replacePublishTracks } from './whipPublish.js';

describe('waitIceGatheringComplete', () => {
  it('resolves immediately when gathering is already complete', async () => {
    await expect(waitIceGatheringComplete({ iceGatheringState: 'complete' })).resolves.toBeUndefined();
  });

  it('resolves on icegatheringstatechange', async () => {
    const listeners = [];
    const pc = {
      iceGatheringState: 'gathering',
      addEventListener: (_e, fn) => listeners.push(fn),
      removeEventListener: vi.fn(),
    };
    const p = waitIceGatheringComplete(pc, 5000);
    pc.iceGatheringState = 'complete';
    listeners[0]();
    await expect(p).resolves.toBeUndefined();
  });
});

describe('liveCameraConstraints', () => {
  it('defaults to the user-facing camera at 720p', () => {
    const c = liveCameraConstraints();
    expect(c.video.facingMode).toEqual({ ideal: 'user' });
    expect(c.video.width).toEqual({ ideal: 1280 });
    expect(c.audio.echoCancellation).toBe(true);
  });

  it('can request the environment camera', () => {
    expect(liveCameraConstraints({ facing: 'environment' }).video.facingMode).toEqual({ ideal: 'environment' });
  });
});

describe('startWhipPublish', () => {
  it('creates an offer, posts SDP, and applies the answer', async () => {
    const added = [];
    const pc = {
      iceGatheringState: 'complete',
      addTransceiver: (track, opts) => added.push({ track, opts }),
      createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' })),
      setLocalDescription: vi.fn(async () => {}),
      setRemoteDescription: vi.fn(async () => {}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
      localDescription: { sdp: 'offer-sdp' },
    };
    function PeerConnection() {
      return pc;
    }
    const stream = { getTracks: () => [{ kind: 'video' }, { kind: 'audio' }] };
    const postOffer = vi.fn(async () => 'answer-sdp');

    const handle = await startWhipPublish({ stream, postOffer, PeerConnection });
    expect(added).toHaveLength(2);
    expect(added[0].opts.direction).toBe('sendonly');
    expect(postOffer).toHaveBeenCalledWith('offer-sdp');
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer-sdp' });
    handle.stop();
    expect(pc.close).toHaveBeenCalled();
  });

  it('notifies onconnectionstatechange after the answer is applied', async () => {
    const listeners = {};
    const pc = {
      iceGatheringState: 'complete',
      connectionState: 'connecting',
      addTransceiver: vi.fn(),
      createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' })),
      setLocalDescription: vi.fn(async () => {}),
      setRemoteDescription: vi.fn(async () => {}),
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
      removeEventListener: vi.fn(),
      close: vi.fn(),
      localDescription: { sdp: 'offer-sdp' },
    };
    function PeerConnection() { return pc; }
    const onConnectionState = vi.fn();
    await startWhipPublish({
      stream: { getTracks: () => [{ kind: 'video' }] },
      postOffer: async () => 'answer-sdp',
      PeerConnection,
      onConnectionState,
    });
    pc.connectionState = 'failed';
    listeners.connectionstatechange();
    expect(onConnectionState).toHaveBeenCalledWith('failed');
  });

  it('rejects without a stream or postOffer', async () => {
    await expect(startWhipPublish({ stream: null, postOffer: async () => '' })).rejects.toThrow(/required/);
  });
});

describe('replacePublishTracks', () => {
  it('replaceTrack()s matching senders and leaves other kinds alone', async () => {
    const videoReplace = vi.fn(async () => {});
    const audioReplace = vi.fn(async () => {});
    const pc = {
      getSenders: () => [
        { track: { kind: 'video', id: 'old-v' }, replaceTrack: videoReplace },
        { track: { kind: 'audio', id: 'old-a' }, replaceTrack: audioReplace },
      ],
    };
    const newVideo = { kind: 'video', id: 'new-v' };
    await replacePublishTracks(pc, { getTracks: () => [newVideo] });
    expect(videoReplace).toHaveBeenCalledWith(newVideo);
    expect(audioReplace).not.toHaveBeenCalled();
  });

  it('throws when there is no sender for a track kind', async () => {
    const pc = { getSenders: () => [] };
    await expect(replacePublishTracks(pc, { getTracks: () => [{ kind: 'video' }] }))
      .rejects.toThrow(/No video sender/);
  });
});
