import { useEffect, useRef, useState } from 'react';
import { rewriteLivePlaybackUrl, shouldUseHlsJs, shouldUseNativeHls, createLiveHls, loadHls, liveQualityOptions, isHlsPlaybackUrl } from '../../utils/livePlayback.js';
import { Tooltip } from '../../components/shared.jsx';
import i18n from '../../i18n/index.js';
import { useViewport } from '../../hooks/useViewport.js';
import { connectSocket } from '../../api/socket';
import { getUser } from '../../store/auth';
import { getPublicStreamer, getLiveSessions, getSessionChatReplay, recordVodView, createLiveClip, getStreamerVods, getGiftLeaderboard, deleteLiveChatMessage, timeoutChatUser, banChatUser } from '../../api/live';
import { mapApiSessionToStream, mapCategoryVod } from './liveMappers.js';
import { formatViewers, formatDuration, formatRelativeTime } from './liveFormatters.js';
import LiveCoinGifts from './LiveCoinGifts.jsx';
import LiveSubscribeButton from './LiveSubscribeButton.jsx';
import { toggleFollowByUserId, isFollowingByUserId } from '../../api/social';
import { Avatar } from '../../components/SafeImage.jsx';

const ACCENT = '#dc2626';
const ACCENT_LINK = '#2563eb';
// Theme tokens: these four are used throughout the page chrome (header, sidebar, chat
// panel, modals, metadata). The couple of spots that sit directly over the always-black
// video surface (playback-error overlay) intentionally use a hardcoded literal instead of
// these constants — see inline comment there.
const BORDER = 'var(--color-border)';
const TEXT = 'var(--color-text-primary)';
const MUTED = 'var(--color-text-secondary)';
const MUTED_DIM = 'var(--color-text-muted)';
const font = "'DM Sans', sans-serif";
const fontDisplay = "'Barlow Condensed', sans-serif";

function LiveBadge() {
  return (
    <span style={{ background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.06em' }}>
      LIVE
    </span>
  );
}

function LiveChannelsSidebar({ onWatch, collapsed, onToggle }) {
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      getLiveSessions()
        .then((res) => {
          if (!active) return;
          const rows = Array.isArray(res?.data) ? res.data : [];
          setChannels(rows.map(mapApiSessionToStream));
        })
        .catch(() => { if (active) setChannels([]); });
    };
    load();
    const id = setInterval(load, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <aside
      className="bg-surface"
      style={{
        width: collapsed ? 40 : 200,
        flexShrink: 0,
        borderRight: `1px solid ${BORDER}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, minHeight: 40 }}>
        {!collapsed && <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, fontFamily: font }}>Live Channels</span>}
        <button type="button" onClick={onToggle} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 14, padding: 2 }}>{collapsed ? '»' : '«'}</button>
      </div>
      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {channels.length === 0 && (
            <p style={{ padding: '6px 12px', fontSize: 11, color: MUTED_DIM, margin: 0 }}>No channels live</p>
          )}
          {channels.map((ch) => (
            <button
              key={ch.handle || ch.id}
              type="button"
              onClick={() => onWatch?.(ch)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: font,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-raised)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Avatar url={ch.profile_pic_url || ch.thumb} initials={ch.streamer} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.streamer}</div>
                <div style={{ fontSize: 10, color: MUTED_DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.category}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: MUTED, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }} />
                {formatViewers(ch.viewers)}
              </div>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function ActionBtn({ children, primary, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? ACCENT_LINK : 'var(--color-surface-raised)',
        border: primary ? 'none' : `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: '8px 14px',
        // primary bg is always the hardcoded accent blue, so its text stays fixed white;
        // the secondary bg is now themed, so its text must follow the theme too (was a
        // shared `color: TEXT` before — bug: '#fff' text would go invisible on the
        // near-white secondary surface in light theme).
        color: primary ? '#fff' : TEXT,
        fontFamily: font,
        fontWeight: 600,
        fontSize: 13,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

export default function LiveWatchPage({ mode = 'live', item, onBack, onWatch, onWatchVod, onOpenProfile, onClipCreated }) {
  const { isMobile } = useViewport();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followMsg, setFollowMsg] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [chat, setChat] = useState([]);
  const [vodChatAll, setVodChatAll] = useState([]);
  const [vodChatLoading, setVodChatLoading] = useState(false);
  const [vodViews, setVodViews] = useState(Number(item?.views) || 0);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState('');
  const [chatConnected, setChatConnected] = useState(false);
  const [liveViewers, setLiveViewers] = useState(item?.viewers ?? item?.live_viewers ?? 0);
  const [playbackError, setPlaybackError] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const [raidBanner, setRaidBanner] = useState(null);
  const [raidSeconds, setRaidSeconds] = useState(0);
  const [clipOpen, setClipOpen] = useState(false);
  const [clipDuration, setClipDuration] = useState(30);
  const [clipBusy, setClipBusy] = useState(false);
  const [clipMsg, setClipMsg] = useState('');
  const [liveMeta, setLiveMeta] = useState({ title: null, description: null, thumb: null });
  const [userMuted, setUserMuted] = useState(true);
  const [giftFlash, setGiftFlash] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [actionToast, setActionToast] = useState('');
  const [modMenuId, setModMenuId] = useState(null);
  const [canModerate, setCanModerate] = useState(false);
  // #253 viewer UX: theater mode (player fills the width — channels + chat collapse) and
  // picture-in-picture (pop the player into a floating window).
  const [theater, setTheater] = useState(false);
  const enterPiP = () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) { document.exitPictureInPicture().catch(() => {}); return; }
    if (v.requestPictureInPicture && document.pictureInPictureEnabled) v.requestPictureInPicture().catch(() => {});
  };
  // Same fixed-white-on-conditional-bg trap as ActionBtn: active state keeps its hardcoded
  // accent-blue bg + white text, but the idle state's bg is now a themed surface, so its
  // text/icon color must follow the theme too.
  const iconBtn = (active) => ({ background: active ? ACCENT_LINK : 'var(--color-surface-raised)', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#fff' : TEXT, cursor: 'pointer', flexShrink: 0 });
  const videoRef = useRef(null);
  const liveHlsRef = useRef(null);
  const [liveQuality, setLiveQuality] = useState(null);
  const chatScrollRef = useRef(null);
  const playbackRetry = useRef({ attempts: 0, timer: null });
  const myUserId = getUser()?.user_id ?? null;

  const isLive = mode === 'live';
  const isVod = mode === 'vod';
  const isClip = mode === 'clip';
  const stream = isLive ? item : null;
  const sessionId = stream?.session_id ?? stream?.id;
  const streamerId = stream?.streamer_id ?? item?.streamer_id ?? null;

  useEffect(() => {
    setLiveMeta({ title: null, description: null, thumb: null });
  }, [sessionId]);
  const poster = isLive
    ? (liveMeta.thumb || (typeof stream?.thumb === 'string' && stream.thumb.startsWith('url(') ? null : stream?.thumb))
    : item?.thumb;
  const videoUrl = isLive
    ? rewriteLivePlaybackUrl(stream?.url || '')
    : (item?.video_url || '');
  const quality = isLive && liveQuality?.url === videoUrl ? liveQuality : null;
  const changeLiveQuality = (event) => {
    const level = Number(event.target.value);
    const hls = liveHlsRef.current;
    if (!hls || (level !== -1 && !quality?.options.some(option => option.index === level))) return;
    hls.nextLevel = level;
    setLiveQuality(current => current?.url === videoUrl ? { ...current, selected: level } : current);
  };

  // Reset watch UI when switching streams (raid / channel change reuses this component).
  useEffect(() => {
    setChat([]);
    setLiveViewers(null);
    setStreamEnded(false);
    setRaidBanner(null);
    setRaidSeconds(0);
    setChatError('');
    setUserMuted(true);
    setGiftFlash(null);
    setLeaderboard([]);
  }, [sessionId]);

  // Live socket chat
  useEffect(() => {
    if (!isLive || !sessionId) return undefined;
    const sid = Number(sessionId);
    const socket = connectSocket();
    const join = () => {
      let presence_id = null;
      try {
        presence_id = localStorage.getItem('strug_live_presence');
        if (!presence_id) {
          presence_id = `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
          localStorage.setItem('strug_live_presence', presence_id);
        }
      } catch { /* private mode */ }
      socket.emit('join-stream', { session_id: sid, presence_id });
    };
    const onConnect = () => { setChatConnected(true); join(); };
    const onDisconnect = () => setChatConnected(false);
    const onChat = (msg) => {
      const mine = myUserId != null && msg.user_id === myUserId;
      if (mine && msg.is_moderator) setCanModerate(true);
      setChat((prev) => [...prev.slice(-49), {
        user: mine ? 'you' : (msg.username || 'Viewer'),
        user_id: msg.user_id ?? null,
        color: mine ? ACCENT_LINK : (msg.color || '#60a5fa'),
        text: msg.text,
        sub: !!msg.is_subscriber,
        mod: !!msg.is_moderator,
        streamer: !!msg.is_streamer,
        id: msg.id ?? `${Date.now()}-${Math.random()}`,
      }]);
    };
    const onChatDeleted = (payload) => {
      if (payload?.session_id != null && Number(payload.session_id) !== sid) return;
      if (payload?.message_id == null) return;
      setChat((prev) => prev.filter((m) => Number(m.id) !== Number(payload.message_id)));
    };
    const onCount = (payload) => {
      if (payload?.session_id != null && Number(payload.session_id) !== sid) return;
      if (typeof payload?.count === 'number') setLiveViewers(payload.count);
    };
    const onGift = (payload) => {
      if (payload?.session_id != null && Number(payload.session_id) !== sid) return;
      const meta = payload?.gift_meta || {};
      const who = payload?.sender?.username || payload?.sender?.name || 'Viewer';
      const label = meta.label || 'a gift';
      setChat((prev) => [...prev.slice(-49), {
        user: who,
        color: '#fbbf24',
        text: `sent ${label} (${payload.coins} coins)`,
        sub: false,
        id: `gift-${payload.gift_id ?? Date.now()}`,
      }]);
      setGiftFlash({ who, label });
      setTimeout(() => setGiftFlash((cur) => (cur?.who === who && cur?.label === label ? null : cur)), 2500);
    };
    const onStreamEnded = (payload) => {
      if (payload?.session_id != null && Number(payload.session_id) !== sid) return;
      setStreamEnded(true);
    };
    const onChatRejected = (payload) => {
      const text = payload?.reason || payload?.message || 'Message not sent';
      setChatError(text);
      setTimeout(() => setChatError(''), 3000);
    };
    const onRaid = (payload) => {
      if (payload?.from_session_id != null && Number(payload.from_session_id) !== Number(sessionId)) return;
      if (!payload?.target) return;
      setRaidBanner(payload);
      setRaidSeconds(Number(payload.countdown_sec) || 8);
    };
    const onMeta = (payload) => {
      if (!payload) return;
      if (payload.session_id != null && Number(payload.session_id) !== Number(sessionId)) return;
      setLiveMeta({
        title: payload.title ?? null,
        description: payload.description ?? null,
        thumb: payload.thumbnail_url ?? null,
      });
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('stream-chat', onChat);
    socket.on('stream-chat-rejected', onChatRejected);
    socket.on('live:chat-deleted', onChatDeleted);
    socket.on('viewer-count-updated', onCount);
    socket.on('live:gift', onGift);
    socket.on('stream-ended', onStreamEnded);
    socket.on('live:raid', onRaid);
    socket.on('metadata-updated', onMeta);
    if (socket.connected) { setChatConnected(true); join(); }
    return () => {
      socket.emit('leave-stream', { session_id: sid });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('stream-chat', onChat);
      socket.off('stream-chat-rejected', onChatRejected);
      socket.off('live:chat-deleted', onChatDeleted);
      socket.off('viewer-count-updated', onCount);
      socket.off('live:gift', onGift);
      socket.off('stream-ended', onStreamEnded);
      socket.off('live:raid', onRaid);
      socket.off('metadata-updated', onMeta);
    };
  }, [isLive, sessionId, myUserId]);

  // Gift leaderboard (optional — requires auth)
  useEffect(() => {
    if (!isLive || !stream?.streamer_id) {
      setLeaderboard([]);
      return undefined;
    }
    let cancelled = false;
    getGiftLeaderboard(stream.streamer_id, sessionId)
      .then((res) => {
        if (cancelled) return;
        const rows = res?.leaderboard ?? res?.data?.leaderboard ?? [];
        setLeaderboard(Array.isArray(rows) ? rows.slice(0, 5) : []);
      })
      .catch(() => { if (!cancelled) setLeaderboard([]); });
    return () => { cancelled = true; };
  }, [isLive, stream?.streamer_id, sessionId]);

  // Raid countdown → auto-open target stream
  useEffect(() => {
    if (!raidBanner || raidSeconds <= 0) return undefined;
    if (raidSeconds === 0) return undefined;
    const t = setTimeout(() => setRaidSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [raidBanner, raidSeconds]);

  useEffect(() => {
    if (!raidBanner || raidSeconds > 0) return;
    const t = raidBanner.target;
    setRaidBanner(null);
    onWatch?.({
      id: t.session_id,
      session_id: t.session_id,
      title: t.title,
      streamer: t.display_name,
      streamer_id: t.streamer_id,
      streamer_user_id: t.streamer_user_id,
      handle: t.handle,
      category: t.category,
      profile_pic_url: t.profile_pic_url,
      thumb: t.profile_pic_url,
      viewers: t.viewer_count ?? 0,
      live: true,
      url: rewriteLivePlaybackUrl(t.playback_url || ''),
      tags: [],
    });
  }, [raidBanner, raidSeconds, onWatch]);

  // VOD / clip: load the original broadcast chat and sync it to video currentTime.
  const replaySessionId = !isLive ? (item?.session_id ?? null) : null;
  useEffect(() => {
    if (isLive || !replaySessionId) {
      setVodChatAll([]);
      setChat([]);
      return undefined;
    }
    let cancelled = false;
    setVodChatLoading(true);
    setChat([]);
    getSessionChatReplay(replaySessionId)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data?.messages) ? res.data.messages : [];
        setVodChatAll(rows.map((m) => ({
          id: m.id,
          user: m.user,
          color: m.color,
          text: m.text,
          t: m.t,
          offset_sec: Number(m.offset_sec) || 0,
          sub: !!m.sub,
        })));
      })
      .catch(() => {
        if (!cancelled) setVodChatAll([]);
      })
      .finally(() => {
        if (!cancelled) setVodChatLoading(false);
      });
    return () => { cancelled = true; };
  }, [isLive, replaySessionId]);

  // Record a VOD/clip view once when the watch page opens.
  useEffect(() => {
    if (isLive) return undefined;
    const vodId = item?.vod_id ?? item?.id;
    if (!vodId || String(vodId).startsWith('dummy-')) return undefined;
    setVodViews(Number(item?.views) || 0);
    let cancelled = false;
    recordVodView(vodId)
      .then((res) => {
        if (cancelled) return;
        const next = res?.data?.views ?? res?.views;
        if (typeof next === 'number') setVodViews(next);
        else setVodViews((v) => v + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLive, item?.vod_id, item?.id, item?.views]);

  useEffect(() => {
    if (isLive) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    const sync = () => {
      const t = Number(video.currentTime) || 0;
      setChat(vodChatAll.filter((m) => m.offset_sec <= t + 0.25));
    };
    sync();
    video.addEventListener('timeupdate', sync);
    video.addEventListener('seeked', sync);
    video.addEventListener('play', sync);
    return () => {
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('seeked', sync);
      video.removeEventListener('play', sync);
    };
  }, [isLive, vodChatAll, videoUrl]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  // Video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return undefined;
    setPlaybackError(false);
    const isHls = isHlsPlaybackUrl(videoUrl);
    let hls;
    let cancelled = false;
    const retry = playbackRetry.current;
    retry.attempts = 0;
    const MAX_RETRY = 6;
    const scheduleReload = () => {
      if (cancelled || !hls) return;
      if (retry.attempts >= MAX_RETRY) { setPlaybackError(true); return; }
      const delay = Math.min(1000 * 2 ** retry.attempts, 8000);
      retry.attempts += 1;
      retry.timer = setTimeout(() => { try { hls.startLoad(); } catch { /* */ } }, delay);
    };
    if (isHls && shouldUseNativeHls(video)) {
      video.src = videoUrl;
      if (isLive) video.muted = true;
      video.onerror = () => { if (!cancelled) setPlaybackError(true); };
      if (isLive) setLiveQuality({ url: videoUrl, options: [], selected: -1, native: true });
    } else if (!isHls) {
      video.src = videoUrl;
      video.onerror = () => { if (!cancelled) setPlaybackError(true); };
      if (isLive) setLiveQuality({ url: videoUrl, options: [], selected: -1, source: true });
    } else loadHls().then((Hls) => {
      if (cancelled) return;
      if (isHls && shouldUseHlsJs(video, Hls)) {
        hls = createLiveHls(Hls);
        liveHlsRef.current = hls;
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          retry.attempts = 0;
          setPlaybackError(false);
          setLiveQuality({ url: videoUrl, options: liveQualityOptions(hls.levels), selected: -1 });
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) scheduleReload();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { try { hls.recoverMediaError(); } catch { setPlaybackError(true); } }
          else setPlaybackError(true);
        });
      } else {
        video.src = videoUrl;
        if (isLive) setLiveQuality({ url: videoUrl, options: [], selected: -1, source: true });
        if (isLive) video.muted = true;
        video.onerror = () => setPlaybackError(true);
      }
    }).catch(() => {
      if (cancelled) return;
      // Native HLS can still play if the optional hls.js chunk is unavailable.
      if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoUrl;
        setLiveQuality({ url: videoUrl, options: [], selected: -1, native: true });
      } else {
        setPlaybackError(true);
      }
    });
    return () => {
      cancelled = true;
      if (retry.timer) clearTimeout(retry.timer);
      if (hls) hls.destroy();
      if (liveHlsRef.current === hls) liveHlsRef.current = null;
      if (video) { video.onerror = null; video.removeAttribute('src'); video.load(); }
    };
  }, [videoUrl, isLive]);

  const watchFullVideo = async () => {
    const parent = item?.parent_vod || item?.parentVod;
    if (parent) {
      onWatchVod?.(parent);
      return;
    }
    if (!item?.handle || !item?.session_id || !onWatchVod) {
      setActionToast('Full video unavailable');
      setTimeout(() => setActionToast(''), 2000);
      return;
    }
    try {
      const res = await getStreamerVods(item.handle);
      const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const parentVod = rows.find((v) => !v.is_clip && Number(v.session_id) === Number(item.session_id));
      if (parentVod) onWatchVod(mapCategoryVod(parentVod));
      else {
        setActionToast('Full video unavailable');
        setTimeout(() => setActionToast(''), 2000);
      }
    } catch {
      setActionToast('Full video unavailable');
      setTimeout(() => setActionToast(''), 2000);
    }
  };

  const watchLiveFromClip = () => {
    if (!item?.handle) return;
    getPublicStreamer(item.handle)
      .then((res) => {
        const d = res?.data ?? res;
        if (!d?.is_live || !d?.live_session) {
          setActionToast('Channel is offline');
          setTimeout(() => setActionToast(''), 2000);
          return;
        }
        const st = d.streamer || {};
        const sess = d.live_session;
        onWatch?.({
          id: sess.session_id,
          session_id: sess.session_id,
          title: sess.title || `${item.streamer || st.display_name} — live`,
          streamer: st.display_name || item.streamer,
          streamer_id: st.streamer_id ?? null,
          streamer_user_id: st.user_id ?? st.streamer_user_id ?? null,
          handle: st.handle || item.handle,
          category: st.category || item.category,
          profile_pic_url: st.profile_pic_url || item.profile_pic_url,
          thumb: st.profile_pic_url || item.thumb,
          viewers: sess.viewer_count ?? item.live_viewers ?? 0,
          live: true,
          url: rewriteLivePlaybackUrl(sess.playback_url || ''),
          tags: [],
        });
      })
      .catch(() => {
        setActionToast('Could not open live stream');
        setTimeout(() => setActionToast(''), 2000);
      });
  };

  useEffect(() => {
    if (!isLive || !stream?.handle) return undefined;
    setStreamEnded(false);
    let active = true;
    const poll = () => {
      getPublicStreamer(stream.handle)
        .then((d) => { if (active && d && d.is_live === false) setStreamEnded(true); })
        .catch(() => {});
    };
    // Socket `stream-ended` is primary; this is a slow fallback if the socket drops.
    const id = setInterval(poll, 30_000);
    poll();
    return () => { active = false; clearInterval(id); };
  }, [isLive, stream?.handle]);

  const streamerUserId = isLive
    ? (stream?.streamer_user_id ?? null)
    : (item?.streamer_user_id ?? item?.user_id ?? null);
  const isOwnChannel = myUserId != null && streamerUserId != null && Number(myUserId) === Number(streamerUserId);

  useEffect(() => {
    setCanModerate(Boolean(isOwnChannel));
  }, [isOwnChannel, sessionId]);

  useEffect(() => {
    setFollowed(false);
    setFollowMsg('');
    if (!streamerUserId || !getUser() || isOwnChannel) return undefined;
    let cancelled = false;
    isFollowingByUserId(streamerUserId)
      .then((r) => { if (!cancelled) setFollowed(!!r?.following); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [streamerUserId, isOwnChannel]);

  const handleFollow = async () => {
    if (followBusy || isOwnChannel) return;
    if (!getUser()) {
      setFollowMsg('Log in to follow');
      setTimeout(() => setFollowMsg(''), 2500);
      return;
    }
    if (!streamerUserId) {
      setFollowMsg('Follow unavailable for this channel');
      setTimeout(() => setFollowMsg(''), 2500);
      return;
    }
    const next = !followed;
    setFollowed(next);
    setFollowBusy(true);
    setFollowMsg('');
    try {
      const res = await toggleFollowByUserId(streamerUserId);
      if (res?.action === 'followed') setFollowed(true);
      else if (res?.action === 'unfollowed') setFollowed(false);
      try { window.dispatchEvent(new CustomEvent('live:follow-changed')); } catch { /* */ }
    } catch (e) {
      setFollowed(!next);
      const msg = e?.response?.data?.message || 'Could not update follow';
      setFollowMsg(msg);
      setTimeout(() => setFollowMsg(''), 3500);
    } finally {
      setFollowBusy(false);
    }
  };

  const createClip = async () => {
    const vodId = item?.vod_id ?? item?.id;
    if (!vodId || !getUser()) {
      setClipMsg(getUser() ? 'Clip unavailable' : 'Log in to create a clip');
      return;
    }
    setClipBusy(true);
    setClipMsg('');
    try {
      const current = Math.floor(videoRef.current?.currentTime || 0);
      const start_sec = Math.max(0, current - clipDuration);
      const res = await createLiveClip({
        vod_id: Number(vodId),
        start_sec,
        duration_sec: clipDuration,
        title: `Clip of ${item?.title || 'broadcast'}`,
      });
      const clip = res?.data || res;
      setClipOpen(false);
      setClipMsg('Clip created!');
      setTimeout(() => setClipMsg(''), 2500);
      onClipCreated?.(clip);
    } catch (e) {
      setClipMsg(e?.response?.data?.message || 'Could not create clip');
    } finally {
      setClipBusy(false);
    }
  };

  const sendChat = () => {
    if (!chatInput.trim() || !isLive) return;
    if (!getUser()?.user_id) {
      setChatError('Log in to chat');
      setTimeout(() => setChatError(''), 2500);
      return;
    }
    const socket = connectSocket();
    socket.emit('stream-chat', { session_id: Number(sessionId), text: chatInput.trim().slice(0, 500) });
    setChatInput('');
  };

  const title = isLive ? (liveMeta.title || stream?.title) : item?.title;
  const liveDescription = isLive ? (liveMeta.description ?? stream?.description ?? '') : '';
  const streamer = isLive ? stream?.streamer : item?.streamer;
  const category = isLive ? stream?.category : item?.category;
  const profilePic = isLive
    ? stream?.profile_pic_url
    : item?.profile_pic_url ?? `https://i.pravatar.cc/64?u=${item?.handle || 'user'}`;

  const thumbBg = isLive && typeof stream?.thumb === 'string' && stream.thumb.startsWith('url(')
    ? stream.thumb
    : (poster ? `url(${poster}) center/cover` : 'linear-gradient(135deg,#0f172a,#2563eb)');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: font }}>
      {raidBanner && (
        <div
          className="bg-surface-glass"
          style={{
          position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 10001,
          // Floating glass toast over page content — matches --color-surface-glass almost
          // exactly (rgba(17,18,22,0.95)). Accent purple border/status color stays hardcoded.
          border: '1px solid rgba(145,70,255,0.5)', borderRadius: 14,
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, maxWidth: '92vw',
          boxShadow: '0 12px 40px var(--color-shadow)',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>
              Raiding {raidBanner.target?.display_name || 'another channel'}…
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Joining in {raidSeconds}s
            </div>
          </div>
          <ActionBtn primary onClick={() => { setRaidSeconds(0); }}>Go now</ActionBtn>
          <ActionBtn onClick={() => setRaidBanner(null)}>Cancel</ActionBtn>
        </div>
      )}
      {clipOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setClipOpen(false)}
          // Backdrop scrim stays a fixed dark dim regardless of theme (matches Hub.jsx's
          // modal-overlay pattern) — only the panel itself is themed below.
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-surface-raised" style={{ width: '100%', maxWidth: 380, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: TEXT }}>Create clip</h3>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
              Captures the last {clipDuration}s ending at the current playback position.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[15, 30, 45, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setClipDuration(d)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                    background: clipDuration === d ? ACCENT_LINK : 'var(--color-surface-raised)',
                    // selected state keeps fixed white on the hardcoded accent bg; unselected
                    // state's bg is now themed, so its text must follow (same trap as ActionBtn).
                    color: clipDuration === d ? '#fff' : TEXT, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: font,
                  }}
                >
                  {d}s
                </button>
              ))}
            </div>
            {clipMsg && <p style={{ fontSize: 12, color: clipMsg.includes('created') ? '#4ade80' : '#f87171', margin: '0 0 10px' }}>{clipMsg}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionBtn primary disabled={clipBusy} onClick={createClip}>{clipBusy ? 'Creating…' : 'Create clip'}</ActionBtn>
              <ActionBtn onClick={() => setClipOpen(false)}>Cancel</ActionBtn>
            </div>
          </div>
        </div>
      )}
      <div style={{ padding: isMobile ? '10px 16px' : '10px 48px 10px 108px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontFamily: font }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {!isMobile && (
          <button type="button" onClick={() => setTheater((v) => !v)} title={theater ? 'Exit theater mode' : 'Theater mode'} style={iconBtn(theater)}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M2 9h20"/></svg>
          </button>
        )}
        <Tooltip text="Picture in picture"><button type="button" onClick={enterPiP} aria-label="Picture in picture" style={iconBtn(false)}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="11" y="9" width="9" height="7" rx="1" fill="currentColor" stroke="none"/></svg>
        </button></Tooltip>
        <ActionBtn onClick={() => { navigator.clipboard?.writeText(window.location.href); setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); }}>
          {shareCopied ? 'Copied' : 'Share'}
        </ActionBtn>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', paddingLeft: isMobile ? 0 : 0 }}>
        {!isMobile && (
          <LiveChannelsSidebar collapsed={sidebarCollapsed || (theater && !isMobile)} onToggle={() => setSidebarCollapsed((c) => !c)} onWatch={onWatch} />
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minWidth: 0, overflow: isMobile ? 'auto' : 'hidden', position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: isMobile ? '12px 16px' : '12px 20px 12px 12px', paddingBottom: isMobile ? 24 : undefined }}>
            {/* Player + its docked overlays (LIVE badge, viewer count, stream-ended /
                play-icon placeholders) are always composited over the video surface, which
                is itself permanently black (see `background: '#000'`) — this whole block
                stays dark chrome in both themes by design, matching sibling live/ pages
                (LiveCategoryPage.jsx, LiveTwitchBrowse.jsx) that treat stream thumbnails
                and avatar-placeholder fills (#1e293b below) the same way. */}
            <div style={{ position: 'relative', width: '100%', paddingBottom: theater && !isMobile ? 0 : '56.25%', height: theater && !isMobile ? '78vh' : undefined, background: thumbBg, borderRadius: isMobile ? 8 : 0, overflow: 'hidden', flexShrink: 0 }}>
              {videoUrl ? (
                <video
                  ref={videoRef}
                  autoPlay={isLive}
                  muted={isLive ? userMuted : false}
                  controls
                  playsInline
                  poster={typeof poster === 'string' ? poster : undefined}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  </div>
                </div>
              )}
              {isLive && videoUrl && !playbackError && quality && (
                <label style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: 12 }}>
                  Quality
                  {quality.options.length > 1 ? (
                    <select aria-label="Live video quality" value={quality.selected} onChange={changeLiveQuality} style={{ minHeight: 36, color: '#fff', background: '#222', border: '1px solid #666', borderRadius: 4 }}>
                      <option value={-1}>Auto</option>
                      {quality.options.map(option => <option key={option.index} value={option.index}>{option.label}</option>)}
                    </select>
                  ) : <span>{quality.native ? 'Auto (device)' : (quality.options[0]?.label || 'Single source')}</span>}
                </label>
              )}
              {isLive && !streamEnded && (
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, pointerEvents: 'none' }}>
                  <LiveBadge />
                  <span style={{ background: 'rgba(0,0,0,0.65)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#fff' }}>{formatViewers(liveViewers)} viewers</span>
                </div>
              )}
              {isLive && userMuted && videoUrl && !streamEnded && !playbackError && (
                <button
                  type="button"
                  onClick={() => {
                    setUserMuted(false);
                    const v = videoRef.current;
                    if (v) { v.muted = false; v.play().catch(() => {}); }
                  }}
                  style={{
                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                    zIndex: 4, border: 'none', borderRadius: 999, cursor: 'pointer',
                    background: 'rgba(0,0,0,0.72)', color: '#fff',
                    padding: '10px 18px', fontFamily: font, fontWeight: 700, fontSize: 13,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  Tap for sound
                </button>
              )}
              {giftFlash && (
                <div
                  style={{
                    position: 'absolute', left: '50%', bottom: '22%', transform: 'translateX(-50%)',
                    zIndex: 5, pointerEvents: 'none',
                    background: 'rgba(251,191,36,0.95)', color: '#111',
                    borderRadius: 999, padding: '8px 16px',
                    fontFamily: font, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
                    animation: 'liveGiftFloat 2.4s ease-out forwards',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                  }}
                >
                  {giftFlash.who} sent {giftFlash.label}
                </div>
              )}
              {streamEnded && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
                  Stream ended
                </div>
              )}
              {playbackError && !streamEnded && (
                // Video-overlay chrome sits on a permanently black video surface (see
                // `background: '#000'` on the video element above), so its text stays a
                // fixed light color in both themes rather than using the now-themed MUTED.
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.45)', fontSize: 13, padding: 16, textAlign: 'center' }}>
                  {i18n.t('live.streamUnavailable', { defaultValue: 'Stream unavailable' })}
                </div>
              )}
            </div>

            {/* VOD metadata */}
            {isVod && (
              <div style={{ padding: '16px 0', borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{formatRelativeTime(item.created_at)}</p>
                <h1 style={{ margin: '0 0 8px', fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: TEXT, lineHeight: 1.25 }}>{item.title}</h1>
                {item?.description?.trim() ? (
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: MUTED, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.description}</p>
                ) : null}
                <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
                  <span style={{ color: ACCENT_LINK, cursor: 'pointer' }}>{item.category}</span>
                  {' · '}{formatViewers(vodViews)} views
                </p>
              </div>
            )}

            {/* Live title + description (YouTube-style under player) */}
            {isLive && (
              <div style={{ padding: '16px 0 0' }}>
                <h1 style={{ margin: '0 0 8px', fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: TEXT, lineHeight: 1.25 }}>{title}</h1>
                {liveDescription?.trim() ? (
                  <p style={{ margin: '0 0 4px', fontSize: 13, color: MUTED, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{liveDescription}</p>
                ) : null}
              </div>
            )}

            {/* Clip metadata */}
            {isClip && (
              <div style={{ padding: '16px 0', borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: TEXT }}>{formatRelativeTime(item.created_at)}</p>
                <h1 style={{ margin: '0 0 8px', fontFamily: fontDisplay, fontSize: 22, fontWeight: 800, color: TEXT }}>{item.title}</h1>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: MUTED }}>
                  <span style={{ color: ACCENT_LINK }}>{item.category}</span>
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: MUTED_DIM }}>
                  Clipped by <strong style={{ color: TEXT }}>{item.clipped_by}</strong> · {formatViewers(vodViews)} views
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <ActionBtn primary onClick={watchFullVideo}>Watch Full Video</ActionBtn>
                  <ActionBtn onClick={() => {
                    navigator.clipboard?.writeText(window.location.href);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 1500);
                  }}>
                    {shareCopied ? 'Copied' : 'Share'}
                  </ActionBtn>
                </div>
                {actionToast && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>{actionToast}</p>
                )}
              </div>
            )}

            {/* Streamer bar */}
            <div style={{ padding: '16px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
              <button
                type="button"
                onClick={() => onOpenProfile?.(isLive ? stream : { streamer, handle: item?.handle, category, profile_pic_url: profilePic })}
                style={{ width: 44, height: 44, borderRadius: isClip ? 8 : '50%', border: 'none', padding: 0, overflow: 'hidden', cursor: 'pointer', flexShrink: 0, background: '#1e293b' }}
              >
                <Avatar url={profilePic} initials={streamer} size={44} style={{ borderRadius: isClip ? 8 : '50%', background: '#1e293b' }} />
              </button>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{streamer}</span>
                  {(isLive || item?.is_live) && <LiveBadge />}
                  {isClip && item?.is_live && (
                    <span style={{ fontSize: 12, color: MUTED }}>with {formatViewers(item.live_viewers)} viewers</span>
                  )}
                </div>
                {isLive && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: ACCENT_LINK, cursor: 'pointer' }}>{category}</p>
                )}
                {isClip && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>{formatFollowers(item.followers)} followers</p>
                )}
                {isLive && Array.isArray(stream?.tags) && stream.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {stream.tags.map((tag) => (
                      <span key={tag} style={{ fontSize: 11, color: MUTED, background: 'var(--color-border-subtle)', borderRadius: 999, padding: '3px 8px' }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', position: 'relative' }}>
                {!isOwnChannel && (
                  <ActionBtn primary={!followed} onClick={handleFollow} disabled={followBusy}>
                    {followBusy ? '…' : followed ? 'Following ♥' : 'Follow ♥'}
                  </ActionBtn>
                )}
                {followMsg && (
                  <span
                    title={followMsg}
                    style={{
                      fontSize: 11,
                      color: '#f87171',
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {followMsg}
                  </span>
                )}
                {isLive && stream?.streamer_id && (
                  <LiveCoinGifts
                    streamerId={stream.streamer_id}
                    sessionId={sessionId}
                    streamerName={streamer}
                  />
                )}
                {isLive && stream?.streamer_id && (
                  <LiveSubscribeButton streamerId={stream.streamer_id} handle={stream?.handle} asActionBtn compact />
                )}
                {isVod && (item?.vod_id || item?.id) && getUser() && (
                  <ActionBtn onClick={() => { setClipOpen(true); setClipMsg(''); }}>Clip</ActionBtn>
                )}
                {clipMsg && !clipOpen && (
                  <span style={{ fontSize: 11, color: clipMsg.includes('created') ? '#4ade80' : '#f87171' }}>{clipMsg}</span>
                )}
                {(isClip && item?.is_live) && (
                  <ActionBtn primary onClick={watchLiveFromClip}>
                    Watch live
                  </ActionBtn>
                )}
              </div>
            </div>

            {isLive && (
              <div style={{ paddingBottom: 20 }}>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: MUTED_DIM }}>
                  <span>{formatViewers(liveViewers)} watching</span>
                </div>
                {leaderboard.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      Top gifters
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {leaderboard.map((row, i) => (
                        <div key={row.user_id ?? i} style={{ fontSize: 12, color: MUTED, display: 'flex', gap: 8 }}>
                          <span style={{ color: MUTED_DIM, width: 16 }}>{i + 1}.</span>
                          <span style={{ color: TEXT, fontWeight: 600, flex: 1 }}>{row.username}</span>
                          <span style={{ color: '#fbbf24' }}>{row.coins} coins</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat panel */}
          <aside
            className="bg-surface"
            style={isMobile ? {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '45%',
              height: '45%',
              zIndex: 30,
              display: theater ? 'none' : 'flex',
              flexDirection: 'column',
              background: 'color-mix(in srgb, var(--color-surface) 90%, transparent)',
              backdropFilter: 'blur(12px)',
              borderTop: `1px solid ${BORDER}`,
              borderRadius: '12px 12px 0 0',
              boxShadow: '0 -8px 28px var(--color-shadow)',
            } : {
              width: 340,
              flexShrink: 0,
              borderLeft: `1px solid ${BORDER}`,
              display: theater ? 'none' : 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 13, color: TEXT, fontFamily: fontDisplay, letterSpacing: '0.03em' }}>
              {isLive ? 'Stream Chat' : 'Chat on Videos'}
            </div>
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isLive && chat.length === 0 && (
                <p style={{ fontSize: 12, color: MUTED_DIM, margin: 0 }}>Welcome to the chat room!</p>
              )}
              {!isLive && vodChatLoading && (
                <p style={{ fontSize: 12, color: MUTED_DIM, margin: 0 }}>Loading chat replay…</p>
              )}
              {!isLive && !vodChatLoading && vodChatAll.length === 0 && (
                <p style={{ fontSize: 12, color: MUTED_DIM, margin: 0 }}>No chat was recorded for this broadcast.</p>
              )}
              {!isLive && !vodChatLoading && vodChatAll.length > 0 && chat.length === 0 && (
                <p style={{ fontSize: 12, color: MUTED_DIM, margin: 0 }}>Play the video to see chat replay.</p>
              )}
              {chat.map((msg, i) => (
                <div key={msg.id || i} style={{ fontSize: 13, lineHeight: 1.45, position: 'relative' }}>
                  {!isLive && <span style={{ color: MUTED_DIM, marginRight: 6 }}>{msg.t}</span>}
                  {msg.streamer && (
                    <span title="Streamer" style={{ background: ACCENT, color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, marginRight: 4, letterSpacing: '0.04em' }}>HOST</span>
                  )}
                  {msg.mod && !msg.streamer && (
                    <span title="Moderator" style={{ background: '#22c55e', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>MOD</span>
                  )}
                  {msg.sub && <span title="Subscriber" style={{ color: '#a970ff', marginRight: 4 }}>★</span>}
                  <span style={{ fontWeight: 700, color: msg.color || ACCENT_LINK }}>{msg.user}: </span>
                  <span style={{ color: MUTED }}>{msg.text}</span>
                  {isLive && canModerate && msg.user_id && Number(msg.user_id) !== Number(myUserId) && !msg.streamer && (
                    <span style={{ marginLeft: 6, position: 'relative', display: 'inline-block' }}>
                      <button
                        type="button"
                        aria-label="Moderate"
                        onClick={() => setModMenuId(modMenuId === msg.id ? null : msg.id)}
                        style={{ background: 'transparent', border: 'none', color: MUTED_DIM, cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
                      >
                        ···
                      </button>
                      {modMenuId === msg.id && (
                        <div className="bg-surface border border-border" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 5, borderRadius: 8, padding: 6, minWidth: 120, boxShadow: '0 8px 24px var(--color-shadow)' }}>
                          {msg.id != null && Number.isFinite(Number(msg.id)) && (
                            <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: TEXT, fontSize: 12, padding: '6px 8px', cursor: 'pointer', fontFamily: font }} onClick={async () => {
                              setModMenuId(null);
                              try {
                                await deleteLiveChatMessage(msg.id);
                                setChat((prev) => prev.filter((m) => Number(m.id) !== Number(msg.id)));
                              } catch {
                                setChatError('Could not delete message');
                              }
                            }}>Delete</button>
                          )}
                          {streamerId && (
                            <>
                              <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: TEXT, fontSize: 12, padding: '6px 8px', cursor: 'pointer', fontFamily: font }} onClick={async () => {
                                setModMenuId(null);
                                try {
                                  await timeoutChatUser({ target_user_id: msg.user_id, streamer_id: streamerId, duration_minutes: 10 });
                                  setActionToast(`Timed out ${msg.user}`);
                                  setTimeout(() => setActionToast(''), 2000);
                                } catch {
                                  setChatError('Could not timeout user');
                                }
                              }}>Timeout 10m</button>
                              <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#f87171', fontSize: 12, padding: '6px 8px', cursor: 'pointer', fontFamily: font }} onClick={async () => {
                                setModMenuId(null);
                                try {
                                  await banChatUser({ target_user_id: msg.user_id, streamer_id: streamerId, reason: 'Banned from chat' });
                                  setActionToast(`Banned ${msg.user}`);
                                  setTimeout(() => setActionToast(''), 2000);
                                } catch {
                                  setChatError('Could not ban user');
                                }
                              }}>Ban</button>
                            </>
                          )}
                        </div>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {isLive ? (
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                    placeholder="Send a message"
                    className="bg-surface-raised"
                    style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px', color: TEXT, fontSize: 13, fontFamily: font, outline: 'none' }}
                  />
                  <button type="button" onClick={sendChat} style={{ background: ACCENT_LINK, border: 'none', borderRadius: 8, padding: '9px 14px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: font }}>
                    Chat
                  </button>
                </div>
                {chatError && (
                  <p style={{ fontSize: 11, color: '#f87171', margin: '6px 0 0' }}>{chatError}</p>
                )}
                {!chatConnected && sessionId && (
                  <p style={{ fontSize: 10, color: MUTED_DIM, margin: '6px 0 0' }}>Connecting to chat…</p>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER}`, fontSize: 11, color: MUTED_DIM }}>
                Replay chat from the original broadcast
                {isVod && (item?.duration_sec || item?.duration_secs) && (
                  <span> · {formatDuration(item.duration_sec || item.duration_secs)} total</span>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
      <style>{`
        @keyframes liveGiftFloat {
          0% { opacity: 0; transform: translateX(-50%) translateY(12px); }
          15% { opacity: 1; transform: translateX(-50%) translateY(0); }
          70% { opacity: 1; transform: translateX(-50%) translateY(-18px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-36px); }
        }
      `}</style>
    </div>
  );
}

function formatFollowers(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}
