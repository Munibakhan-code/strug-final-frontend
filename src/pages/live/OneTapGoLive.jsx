import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canUseGetUserMedia, stopMediaStream } from '../../utils/inAppCamera.js';
import { liveCameraConstraints, startWhipPublish, replacePublishTracks } from '../../utils/whipPublish.js';
import { publishLiveWhip, stopLiveWhip } from '../../api/live.js';

const font = "'DM Sans', sans-serif";

/**
 * One-tap camera (or screen) publish into the active live session via WHIP.
 * Local preview is the camera feed — not HLS — so the creator sees themselves with no delay.
 */
export default function OneTapGoLive({
  sessionId,
  autoStart = false,
  source = 'camera',
  videoRef,
  onPublishingChange,
  onSourceChange,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [liveSource, setLiveSource] = useState(source === 'screen' ? 'screen' : 'camera');
  const [error, setError] = useState('');
  const [facing, setFacing] = useState('user');
  const streamRef = useRef(null);
  const whipRef = useRef(null);
  const sessionIdRef = useRef(sessionId);
  const publishingRef = useRef(false);
  const tearingDownRef = useRef(false);
  const aliveRef = useRef(true);
  const captureGen = useRef(0);
  const videoElRef = useRef(videoRef);
  const onPublishingChangeRef = useRef(onPublishingChange);
  const onSourceChangeRef = useRef(onSourceChange);

  sessionIdRef.current = sessionId;
  videoElRef.current = videoRef;
  onPublishingChangeRef.current = onPublishingChange;
  onSourceChangeRef.current = onSourceChange;

  const setPub = (on) => {
    publishingRef.current = on;
    setPublishing(on);
    onPublishingChangeRef.current?.(on);
  };

  const setSource = (kind) => {
    setLiveSource(kind);
    onSourceChangeRef.current?.(kind);
  };

  const attachPreview = (stream) => {
    const el = videoElRef.current?.current;
    if (!el) return;
    el.srcObject = stream;
    el.muted = true;
    el.play?.().catch(() => {});
  };

  const teardown = async ({ notifyServer = true } = {}) => {
    captureGen.current += 1;
    const sid = sessionIdRef.current;
    const wasPublishing = publishingRef.current;
    whipRef.current?.stop?.();
    whipRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    const el = videoElRef.current?.current;
    if (el) el.srcObject = null;
    if (notifyServer && sid && wasPublishing) {
      try { await stopLiveWhip(sid); } catch { /* session may already be ended */ }
    }
    setPub(false);
    setLiveSource('camera');
    onSourceChangeRef.current?.('camera');
  };

  const captureStream = async (kind, nextFacing) => {
    if (kind === 'screen') {
      return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    }
    return navigator.mediaDevices.getUserMedia(liveCameraConstraints({ facing: nextFacing }));
  };

  const bindEnded = (stream) => {
    const gen = captureGen.current;
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (captureGen.current !== gen) return;
      void teardown({ notifyServer: true });
    });
  };

  const go = async (kind = 'camera', nextFacing = facing) => {
    if (!sessionIdRef.current || busy || disabled) return;
    if (kind !== 'screen' && !canUseGetUserMedia()) {
      setError(t('sellerDash.common.cameraUnavailable', {
        defaultValue: 'This browser cannot access the camera. Use OBS, or open Strug on HTTPS.',
      }));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (publishingRef.current && whipRef.current?.pc) {
        const nextStream = await captureStream(kind, nextFacing);
        if (!aliveRef.current) {
          stopMediaStream(nextStream);
          return;
        }
        try {
          await replacePublishTracks(whipRef.current.pc, nextStream);
        } catch (swapErr) {
          stopMediaStream(nextStream);
          throw swapErr;
        }
        captureGen.current += 1;
        const previous = streamRef.current;
        streamRef.current = nextStream;
        attachPreview(nextStream);
        bindEnded(nextStream);
        stopMediaStream(previous);
        setSource(kind);
      } else {
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        const stream = await captureStream(kind, nextFacing);
        if (!aliveRef.current) {
          stopMediaStream(stream);
          return;
        }
        streamRef.current = stream;
        attachPreview(stream);
        const handle = await startWhipPublish({
          stream,
          postOffer: async (sdp) => {
            const res = await publishLiveWhip(sessionIdRef.current, sdp);
            const answer = res?.sdp;
            if (!answer) throw new Error('No SDP answer');
            return answer;
          },
          onConnectionState: (state) => {
            if (!publishingRef.current || tearingDownRef.current) return;
            if (state === 'failed') {
              setError(t('sellerDash.common.liveConnectionFailed', {
                defaultValue: 'Could not reach the live server. Try again, or use OBS.',
              }));
              void teardown({ notifyServer: true });
            } else if (state === 'disconnected') {
              setError(t('sellerDash.common.liveConnectionDropped', {
                defaultValue: 'Live connection dropped.',
              }));
            } else if (state === 'connected') {
              setError('');
            }
          },
        });
        if (!aliveRef.current) {
          handle.stop();
          stopMediaStream(stream);
          return;
        }
        whipRef.current = handle;
        captureGen.current += 1;
        setSource(kind);
        setPub(true);
        bindEnded(stream);
      }
    } catch (e) {
      if (!publishingRef.current) {
        stopMediaStream(streamRef.current);
        streamRef.current = null;
      }
      const msg = e?.response?.data?.message || e?.message || t('sellerDash.common.cameraPublishFailed', {
        defaultValue: 'Could not start camera publish',
      });
      if (/NotAllowedError|Permission/i.test(String(e?.name || msg))) {
        setError(t('sellerDash.common.cameraPermissionDenied', {
          defaultValue: 'Camera or microphone permission was denied.',
        }));
      } else {
        setError(msg);
      }
      if (!publishingRef.current) setPub(false);
    } finally {
      setBusy(false);
    }
  };

  // Always release the camera/mic on unmount (End stream, client-side nav, etc.).
  useEffect(() => () => {
    aliveRef.current = false;
    tearingDownRef.current = true;
    captureGen.current += 1;
    const sid = sessionIdRef.current;
    const wasPublishing = publishingRef.current;
    whipRef.current?.stop?.();
    whipRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    const el = videoElRef.current?.current;
    if (el) el.srcObject = null;
    publishingRef.current = false;
    if (sid && wasPublishing) {
      stopLiveWhip(sid).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!autoStart || !sessionId) return undefined;
    let cancelled = false;
    go(source === 'screen' ? 'screen' : 'camera').then(() => {
      if (cancelled) void teardown({ notifyServer: true });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, sessionId, source]);

  useEffect(() => {
    if (sessionId) return undefined;
    void teardown({ notifyServer: false });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const flip = () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    if (publishing && liveSource !== 'screen') void go('camera', next);
  };

  const cameraLive = publishing && liveSource !== 'screen';
  const screenLive = publishing && liveSource === 'screen';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          disabled={busy || disabled || !sessionId || cameraLive}
          onClick={() => go('camera')}
          style={btnStyle(cameraLive)}
        >
          {busy && !publishing
            ? t('sellerDash.common.connecting', { defaultValue: 'Connecting…' })
            : cameraLive
              ? t('sellerDash.common.cameraLive', { defaultValue: 'Camera live' })
              : t('sellerDash.common.goLiveFromCamera', { defaultValue: 'Go live from camera' })}
        </button>
        {typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia && (
          <button
            type="button"
            disabled={busy || disabled || !sessionId || screenLive}
            onClick={() => go('screen')}
            style={btnStyle(screenLive)}
          >
            {screenLive
              ? t('sellerDash.common.screenLive', { defaultValue: 'Screen live' })
              : t('sellerDash.common.shareScreen', { defaultValue: 'Share screen' })}
          </button>
        )}
        {cameraLive && (
          <button type="button" disabled={busy} onClick={flip} style={btnStyle(false)}>
            {t('common.flipCamera', { defaultValue: 'Flip camera' })}
          </button>
        )}
        {publishing && (
          <button
            type="button"
            disabled={busy}
            onClick={() => teardown({ notifyServer: true })}
            style={btnStyle(true)}
          >
            {t('sellerDash.common.stopCamera', { defaultValue: 'Stop' })}
          </button>
        )}
      </div>
      {error ? (
        <p style={{ margin: 0, fontFamily: font, fontSize: 12, color: '#f87171' }}>{error}</p>
      ) : null}
      <p style={{ margin: 0, fontFamily: font, fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
        {t('sellerDash.common.oneTapCameraHint', {
          defaultValue: 'Phone and laptop camera publish straight to your stream — no OBS. Allow camera + mic when asked.',
        })}
      </p>
    </div>
  );
}

function btnStyle(active) {
  return {
    border: 'none',
    borderRadius: 10,
    padding: '10px 14px',
    fontFamily: font,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    background: active ? '#dc2626' : 'var(--color-surface-raised)',
    color: active ? '#fff' : 'var(--color-text-primary)',
    borderWidth: active ? 0 : 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  };
}
