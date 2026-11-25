import { useEffect, useRef, useState } from 'react';
import CategoryPicker from './CategoryPicker.jsx';
import { rewriteLivePlaybackUrl, shouldUseHlsJs, shouldUseNativeHls, createLiveHls, loadHls, isHlsPlaybackUrl } from '../../utils/livePlayback.js';
import { connectSocket } from '../../api/socket';
import { getUser } from '../../store/auth';
import {
  getStreamManagerState,
  updateLiveSessionMetadata,
  updateChatSettings,
  uploadSessionThumbnail,
} from '../../api/live.js';
import OneTapGoLive from './OneTapGoLive.jsx';

const PURPLE = '#9146FF';
const BORDER = 'var(--color-border)';
const MUTED = 'var(--color-text-secondary)';
const font = "'DM Sans', sans-serif";

const CHAT_COLORS = ['#bf94ff', '#00c8b0', '#ff7b72', '#58a6ff', '#f778ba', '#8b949e', '#ffab70', '#79c0ff'];

function colorFor(key) {
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CHAT_COLORS[h % CHAT_COLORS.length];
}

/**
 * Streamer Stream Manager: live HLS preview, editable title/category, live chat,
 * OBS credentials, and End Stream — all synced to the active session / OBS publish state.
 */
export default function StreamerLiveConsole({
  activeSession,
  sessionIsLive,
  sessionStarting,
  viewerCount,
  liveCategories = [],
  goLiveCategory,
  setGoLiveCategory,
  streamTitle,
  setStreamTitle,
  streamDescription,
  setStreamDescription,
  sessionLoading,
  onEndStream,
  onRaid,
  copyToClipboard,
  copiedField,
  sdCommon,
  onSessionUpdated,
  goLiveMode = 'obs',
}) {
  const videoRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const chatScrollRef = useRef(null);
  const myUserId = getUser()?.user_id ?? null;

  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatConnected, setChatConnected] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [cameraPublishing, setCameraPublishing] = useState(false);
  const [liveSource, setLiveSource] = useState('camera');
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaMsg, setMetaMsg] = useState('');
  const [chatMode, setChatMode] = useState('PUBLIC');
  const [slowModeMs, setSlowModeMs] = useState(0);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbMsg, setThumbMsg] = useState('');
  const thumbInputRef = useRef(null);
  const playbackRetry = useRef({ attempts: 0, timer: null });

  const sessionId = activeSession?.session_id;
  const playbackUrl = rewriteLivePlaybackUrl(activeSession?.playback_url || '');
  const thumbPreview = activeSession?.thumbnail_url || null;

  // Seed title/description from restored session once.
  useEffect(() => {
    if (activeSession?.title && !streamTitle) {
      setStreamTitle(activeSession.title);
    }
    if (activeSession?.description != null && setStreamDescription && !streamDescription) {
      setStreamDescription(activeSession.description || '');
    }
  }, [activeSession?.session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load manager payload (recent chat + chat settings) when session appears.
  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    getStreamManagerState()
      .then((res) => {
        if (cancelled) return;
        const data = res?.data ?? res;
        const rows = Array.isArray(data?.recent_chat) ? data.recent_chat : [];
        setChat(rows.map((m) => ({
          id: m.message_id,
          user: m.username || `User ${m.user_id}`,
          color: colorFor(m.user_id ?? m.username),
          text: m.text,
          mine: myUserId != null && m.user_id === myUserId,
        })));
        if (data?.profile?.chat_mode) setChatMode(data.profile.chat_mode);
        if (typeof data?.profile?.slow_mode_ms === 'number') setSlowModeMs(data.profile.slow_mode_ms);
        if (data?.profile?.category && setGoLiveCategory) {
          setGoLiveCategory({
            categoryId: data.profile.category.category_id ?? null,
            categoryName: data.profile.category.category_name ?? '',
          });
        }
        if (data?.session?.title && setStreamTitle) {
          setStreamTitle(data.session.title);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, myUserId, setGoLiveCategory, setStreamTitle]);

  // Live chat socket (join own stream room).
  useEffect(() => {
    if (!sessionId) return undefined;
    const s = connectSocket();
    const join = () => s.emit('join-stream', { session_id: sessionId });
    const onConnect = () => { setChatConnected(true); join(); };
    const onDisconnect = () => setChatConnected(false);
    const onChat = (msg) => {
      const mine = myUserId != null && msg.user_id === myUserId;
      setChat((prev) => [...prev.slice(-79), {
        id: msg.id ?? `${Date.now()}-${Math.random()}`,
        user: mine ? 'You' : (msg.username || 'Viewer'),
        color: mine ? PURPLE : (msg.color || colorFor(msg.user_id ?? msg.username)),
        text: msg.text,
        mine,
        gift: false,
        sub: !!msg.is_subscriber,
        mod: !!msg.is_moderator,
        streamer: !!msg.is_streamer,
      }]);
    };
    const onGift = (payload) => {
      if (payload?.session_id != null && payload.session_id !== sessionId) return;
      const meta = payload?.gift_meta || {};
      const who = payload?.sender?.username || payload?.sender?.name || 'Viewer';
      setChat((prev) => [...prev.slice(-79), {
        id: `gift-${payload.gift_id ?? Date.now()}`,
        user: who,
        color: '#fbbf24',
        text: `sent ${meta.label || 'a gift'} (${payload.coins} coins)`,
        gift: true,
      }]);
    };
    const onMeta = (updated) => {
      if (updated?.title && setStreamTitle) setStreamTitle(updated.title);
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('stream-chat', onChat);
    s.on('live:gift', onGift);
    s.on('metadata-updated', onMeta);
    if (s.connected) { setChatConnected(true); join(); }
    return () => {
      s.emit('leave-stream', { session_id: sessionId });
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('stream-chat', onChat);
      s.off('live:gift', onGift);
      s.off('metadata-updated', onMeta);
    };
  }, [sessionId, myUserId, setStreamTitle]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  // HLS preview — only when LIVE via OBS (camera publishers already see a local preview).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sessionIsLive || !playbackUrl || cameraPublishing) {
      setPreviewError(false);
      return undefined;
    }
    setPreviewError(false);
    const isHls = isHlsPlaybackUrl(playbackUrl);
    let hls;
    let cancelled = false;
    const retry = playbackRetry.current;
    retry.attempts = 0;
    const MAX_RETRY = 6;
    const scheduleReload = () => {
      if (cancelled || !hls) return;
      if (retry.attempts >= MAX_RETRY) { setPreviewError(true); return; }
      const delay = Math.min(1000 * 2 ** retry.attempts, 8000);
      retry.attempts += 1;
      retry.timer = setTimeout(() => {
        if (cancelled || !hls) return;
        try { hls.startLoad(); } catch { /* destroyed mid-flight */ }
      }, delay);
    };
    if (isHls && shouldUseNativeHls(video)) {
      video.src = playbackUrl;
      video.play().catch(() => {});
      video.onerror = () => { if (!cancelled) setPreviewError(true); };
    } else loadHls().then((Hls) => {
      if (cancelled) return;
      if (isHls && shouldUseHlsJs(video, Hls)) {
        hls = createLiveHls(Hls);
        hls.loadSource(playbackUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          retry.attempts = 0;
          setPreviewError(false);
          if (!cancelled) video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data?.fatal || cancelled) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) scheduleReload();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError(); } catch { setPreviewError(true); }
          } else setPreviewError(true);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playbackUrl;
        video.play().catch(() => {});
        video.onerror = () => { if (!cancelled) setPreviewError(true); };
      } else {
        setPreviewError(true);
      }
    }).catch(() => { if (!cancelled) setPreviewError(true); });
    return () => {
      cancelled = true;
      if (retry.timer) { clearTimeout(retry.timer); retry.timer = null; }
      retry.attempts = 0;
      if (hls) {
        try { hls.destroy(); } catch { /* */ }
      }
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [sessionIsLive, playbackUrl, sessionId, cameraPublishing]);

  const saveMetadata = async () => {
    if (!sessionId || metaBusy) return;
    const title = (streamTitle || '').trim();
    if (!title) {
      setMetaMsg('Title is required.');
      return;
    }
    setMetaBusy(true);
    setMetaMsg('');
    try {
      const payload = { title };
      if (streamDescription != null) payload.description = String(streamDescription).slice(0, 1000);
      if (goLiveCategory?.categoryId) payload.category_id = Number(goLiveCategory.categoryId);
      else if (goLiveCategory?.categoryName?.trim()) payload.category_name = goLiveCategory.categoryName.trim();
      const r = await updateLiveSessionMetadata(sessionId, payload);
      const updated = r?.data;
      if (updated && onSessionUpdated) onSessionUpdated(updated);
      setMetaMsg('Saved — viewers see the update live.');
      setTimeout(() => setMetaMsg(''), 2500);
    } catch (e) {
      setMetaMsg(e?.response?.data?.message || 'Could not save changes.');
    } finally {
      setMetaBusy(false);
    }
  };

  const handleThumbFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !sessionId || thumbBusy) return;
    setThumbBusy(true);
    setThumbMsg('');
    try {
      const r = await uploadSessionThumbnail(sessionId, file);
      const updated = r?.data;
      if (updated && onSessionUpdated) onSessionUpdated(updated);
      setThumbMsg('Thumbnail updated.');
      setTimeout(() => setThumbMsg(''), 2500);
    } catch (err) {
      setThumbMsg(err?.response?.data?.message || 'Thumbnail upload failed.');
    } finally {
      setThumbBusy(false);
    }
  };

  const handleCaptureLiveFrame = async () => {
    if (!sessionId || thumbBusy) return;
    const video = videoRef.current;
    if (!video || !sessionIsLive) {
      setThumbMsg('Start streaming in OBS first, then capture a frame.');
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      setThumbMsg('Wait for the live preview to load, then try again.');
      return;
    }
    setThumbBusy(true);
    setThumbMsg('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) {
        setThumbMsg('Could not capture frame.');
        return;
      }
      const file = new File([blob], `session-${sessionId}-frame.jpg`, { type: 'image/jpeg' });
      const r = await uploadSessionThumbnail(sessionId, file);
      const updated = r?.data;
      if (updated && onSessionUpdated) onSessionUpdated(updated);
      setThumbMsg('Thumbnail updated.');
      setTimeout(() => setThumbMsg(''), 2500);
    } catch (err) {
      setThumbMsg(err?.response?.data?.message || 'Frame capture failed.');
    } finally {
      setThumbBusy(false);
    }
  };

  const saveChatSettings = async (nextMode, nextSlow) => {
    setSettingsBusy(true);
    try {
      await updateChatSettings({ chat_mode: nextMode, slow_mode_ms: nextSlow });
      setChatMode(nextMode);
      setSlowModeMs(nextSlow);
    } catch { /* ignore */ }
    setSettingsBusy(false);
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || !sessionId) return;
    const socket = connectSocket();
    socket.emit('stream-chat', { session_id: sessionId, text: text.slice(0, 500) });
    setChatInput('');
  };

  const inputStyle = {
    width: '100%',
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: '10px 14px',
    fontFamily: font,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };
  const inputClassName = 'bg-surface-raised text-text-primary';

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Status bar */}
      <div
        className="bg-surface"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          padding: '12px 16px',
          border: `1px solid ${sessionIsLive ? `${PURPLE}55` : 'rgba(251,191,36,0.35)'}`,
          borderRadius: 12,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: font,
            fontWeight: 700,
            fontSize: 14,
            color: sessionIsLive ? '#ef4444' : '#fbbf24',
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: sessionIsLive ? '#ef4444' : '#fbbf24',
              animation: 'pulseLive 1.5s ease-in-out infinite',
            }}
          />
          {sessionIsLive ? "You're live!" : 'Waiting for OBS…'}
        </span>
        <span style={{ fontFamily: font, fontSize: 13, color: MUTED }}>
          {sessionIsLive
            ? `${viewerCount} viewer${viewerCount === 1 ? '' : 's'} watching`
            : 'Connect OBS with the Server + Stream Key below'}
        </span>
        <span className="text-text-muted" style={{ marginLeft: 'auto', fontFamily: font, fontSize: 12 }}>
          Session #{sessionId}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.9fr)',
          gap: 16,
          alignItems: 'start',
        }}
        className="streamer-live-console-grid"
      >
        {/* Left: preview + controls + OBS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Live preview: a video monitor showing the raw HLS feed, so it stays dark in both
              themes (like Hub.jsx's dark-scrimmed hero photo) — it needs to read as a video
              player, not a themed panel. Intentionally NOT using the BORDER/MUTED tokens here. */}
          <div
            style={{
              background: '#0a0a0f',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                fontFamily: font,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              Live preview
            </div>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000' }}>
              <video
                ref={cameraVideoRef}
                muted
                autoPlay
                playsInline
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: liveSource === 'screen' ? 'none' : 'scaleX(-1)',
                  display: cameraPublishing ? 'block' : 'none',
                }}
              />
              {sessionIsLive && playbackUrl && !previewError && !cameraPublishing ? (
                <video
                  ref={videoRef}
                  muted
                  autoPlay
                  playsInline
                  controls
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : !cameraPublishing ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: 24,
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: 0, fontFamily: font, fontSize: 14, color: '#fff', fontWeight: 600 }}>
                    {sessionStarting
                      ? (goLiveMode === 'camera' ? 'Starting camera…' : 'Preview starts when OBS connects')
                      : previewError
                        ? 'Preview unavailable — check OBS is still streaming'
                        : 'No playback yet'}
                  </p>
                  <p style={{ margin: 0, fontFamily: font, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, maxWidth: 360 }}>
                    {sessionStarting && goLiveMode !== 'camera'
                      ? 'Paste Server + Stream Key into OBS → Settings → Stream (Custom), then Start Streaming. Or use Go live from camera below.'
                      : 'Your stream will appear here for you to monitor quality and framing.'}
                  </p>
                </div>
              ) : null}
            </div>
            <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}` }}>
              <OneTapGoLive
                sessionId={sessionId}
                autoStart={goLiveMode === 'camera'}
                videoRef={cameraVideoRef}
                onPublishingChange={setCameraPublishing}
                onSourceChange={setLiveSource}
                disabled={sessionLoading}
              />
            </div>
          </div>

          {/* Live controls */}
          <div
            className="bg-surface"
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <p
              style={{
                margin: '0 0 14px',
                fontFamily: font,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: MUTED,
              }}
            >
              Live controls
            </p>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', fontFamily: font, fontSize: 11, color: MUTED, marginBottom: 6 }}>
                Stream title
              </span>
              <input
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder="What are you streaming?"
                className={inputClassName}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', fontFamily: font, fontSize: 11, color: MUTED, marginBottom: 6 }}>
                Description
              </span>
              <textarea
                value={streamDescription || ''}
                onChange={(e) => setStreamDescription?.(e.target.value.slice(0, 1000))}
                placeholder="Tell viewers what this stream is about"
                rows={3}
                className={inputClassName}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ display: 'block', fontFamily: font, fontSize: 11, color: MUTED, marginBottom: 6 }}>
                Category
              </span>
              <CategoryPicker
                categories={liveCategories}
                value={goLiveCategory}
                onChange={setGoLiveCategory}
              />
            </label>
            <div style={{ marginBottom: 14 }}>
              <span style={{ display: 'block', fontFamily: font, fontSize: 11, color: MUTED, marginBottom: 6 }}>
                Thumbnail
              </span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div
                  style={{
                    width: 120,
                    height: 68,
                    borderRadius: 8,
                    background: thumbPreview
                      ? `url(${thumbPreview}) center/cover`
                      : 'linear-gradient(135deg,#0f172a,#2563eb)',
                    border: `1px solid ${BORDER}`,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <input ref={thumbInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleThumbFile} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      type="button"
                      disabled={thumbBusy}
                      onClick={() => thumbInputRef.current?.click()}
                      className="bg-surface-raised text-text-primary"
                      style={{
                        border: `1px solid ${BORDER}`,
                        borderRadius: 10,
                        padding: '8px 14px',
                        fontFamily: font,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: thumbBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {thumbBusy ? 'Uploading…' : 'Upload image'}
                    </button>
                    <button
                      type="button"
                      disabled={thumbBusy || !sessionIsLive}
                      onClick={() => void handleCaptureLiveFrame()}
                      title={sessionIsLive ? 'Capture current preview frame' : 'Available once OBS is live'}
                      className="bg-surface-raised text-text-primary"
                      style={{
                        border: `1px solid ${BORDER}`,
                        borderRadius: 10,
                        padding: '8px 14px',
                        fontFamily: font,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: thumbBusy || !sessionIsLive ? 'default' : 'pointer',
                        opacity: sessionIsLive ? 1 : 0.45,
                      }}
                    >
                      Use current frame
                    </button>
                  </div>
                  {thumbMsg && (
                    <p style={{ margin: '6px 0 0', fontFamily: font, fontSize: 11, color: thumbMsg.includes('updated') ? '#4ade80' : '#f87171' }}>
                      {thumbMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                onClick={saveMetadata}
                disabled={metaBusy}
                style={{
                  background: PURPLE,
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 18px',
                  color: '#fff',
                  fontFamily: font,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: metaBusy ? 'wait' : 'pointer',
                }}
              >
                {metaBusy ? 'Saving…' : 'Update live'}
              </button>
              {metaMsg && (
                <span style={{ fontFamily: font, fontSize: 12, color: metaMsg.includes('Saved') ? '#4ade80' : '#f87171' }}>
                  {metaMsg}
                </span>
              )}
            </div>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <p style={{ margin: '0 0 10px', fontFamily: font, fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Chat mode
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { id: 'PUBLIC', label: 'Everyone' },
                  { id: 'FOLLOWERS_ONLY', label: 'Followers' },
                  { id: 'SUBSCRIBERS_ONLY', label: 'Subs' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={settingsBusy}
                    onClick={() => saveChatSettings(opt.id, slowModeMs)}
                    style={{
                      background: chatMode === opt.id ? PURPLE : 'var(--color-surface-raised)',
                      border: `1px solid ${chatMode === opt.id ? PURPLE : BORDER}`,
                      borderRadius: 8,
                      padding: '7px 12px',
                      // Idle state's background is now a token that goes near-white in light
                      // theme, so fixed white text would vanish — only the active (solid
                      // PURPLE) state keeps hardcoded white.
                      color: chatMode === opt.id ? '#fff' : 'var(--color-text-secondary)',
                      fontFamily: font,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: font, fontSize: 12, color: MUTED }}>Slow mode</span>
                {[0, 3000, 10000].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    disabled={settingsBusy}
                    onClick={() => saveChatSettings(chatMode, ms)}
                    style={{
                      // Was a translucent PURPLE tint (rgba(145,70,255,0.35)) — that alpha-blends
                      // with whatever sits behind it, and once the idle background below became a
                      // token that goes near-white in light theme, the same math made the active
                      // tint wash out to a pale lavender with invisible white text. Solid PURPLE
                      // (matching the chat-mode buttons above) keeps contrast safe in both themes.
                      background: slowModeMs === ms ? PURPLE : 'var(--color-surface-raised)',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      padding: '6px 10px',
                      color: slowModeMs === ms ? '#fff' : 'var(--color-text-secondary)',
                      fontFamily: font,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {ms === 0 ? 'Off' : `${ms / 1000}s`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* OBS credentials */}
          <div
            className="bg-surface"
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: 18,
            }}
          >
            <p
              style={{
                margin: '0 0 12px',
                fontFamily: font,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: MUTED,
              }}
            >
              OBS credentials
            </p>
            {[
              { label: sdCommon?.('serverLabel') || 'Server', value: activeSession?.server_url },
              { label: sdCommon?.('streamKeyLabel') || 'Stream Key', value: activeSession?.stream_key },
            ].map((row) => (
              <div key={row.label} style={{ marginBottom: 10 }}>
                <span className="text-text-muted" style={{ fontFamily: font, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {row.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <code
                    // --color-bg reads as a recessed inset relative to this card's
                    // --color-surface in both themes, matching the original black-wash look.
                    className="bg-bg text-text-secondary"
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      wordBreak: 'break-all',
                    }}
                  >
                    {row.value ?? '—'}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard?.(row.label, row.value)}
                    disabled={!row.value}
                    className="bg-surface-raised text-text-secondary"
                    style={{
                      flexShrink: 0,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontFamily: font,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: row.value ? 'pointer' : 'default',
                    }}
                  >
                    {copiedField === row.label ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-text-muted" style={{ margin: '8px 0 0', fontFamily: font, fontSize: 11, lineHeight: 1.5 }}>
              OBS → Settings → Stream → Service: Custom. Same key stays valid while this session is live (including after page reload).
            </p>
            <button
              type="button"
              onClick={onEndStream}
              disabled={sessionLoading}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '13px',
                background: '#dc2626',
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontFamily: font,
                fontWeight: 700,
                fontSize: 14,
                cursor: sessionLoading ? 'wait' : 'pointer',
              }}
            >
              {sessionLoading
                ? (sdCommon?.('endingStream') || 'Ending…')
                : (sdCommon?.('endStream') || 'End Stream')}
            </button>
          </div>
        </div>

        {/* Right: live chat */}
        <aside
          className="bg-surface"
          style={{
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 420,
            maxHeight: 720,
            overflow: 'hidden',
          }}
        >
          <div
            className="text-text-primary"
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${BORDER}`,
              fontFamily: font,
              fontWeight: 700,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Stream chat</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: chatConnected ? '#4ade80' : MUTED }}>
              {chatConnected ? 'Connected' : 'Connecting…'}
            </span>
          </div>
          <div
            ref={chatScrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {chat.length === 0 && (
              <p style={{ margin: 0, fontFamily: font, fontSize: 12, color: MUTED }}>
                Chat from viewers appears here in real time.
              </p>
            )}
            {chat.map((msg) => (
              <div key={msg.id} style={{ fontFamily: font, fontSize: 13, lineHeight: 1.45 }}>
                {msg.streamer && (
                  <span title="Streamer" style={{ background: '#dc2626', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>HOST</span>
                )}
                {msg.mod && !msg.streamer && (
                  <span title="Moderator" style={{ background: '#22c55e', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>MOD</span>
                )}
                {msg.sub && <span title="Subscriber" style={{ color: '#a970ff', marginRight: 4 }}>★</span>}
                <span style={{ fontWeight: 700, color: msg.color || PURPLE }}>{msg.user}: </span>
                <span style={{ color: msg.gift ? '#fbbf24' : 'var(--color-text-secondary)' }}>{msg.text}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                placeholder="Send a message as host"
                className={inputClassName}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={sendChat}
                style={{
                  background: PURPLE,
                  border: 'none',
                  borderRadius: 10,
                  padding: '0 14px',
                  color: '#fff',
                  fontFamily: font,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Chat
              </button>
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .streamer-live-console-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
