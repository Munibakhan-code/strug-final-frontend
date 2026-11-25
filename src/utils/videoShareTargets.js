/**
 * Helpers for Videos "Share on Strug" (send watch link into existing chats).
 */

/**
 * Normalize getMyConversations() rows into share-picker targets.
 * Prefers DMs with an other_user; falls back to channel name for groups.
 */
export function mapConversationsToShareTargets(conversations, { limit = 24 } = {}) {
  const list = Array.isArray(conversations) ? conversations : [];
  const out = [];
  const seen = new Set();

  for (const c of list) {
    const channelId = c?.channel_id ?? c?.id ?? null;
    if (channelId == null) continue;
    const key = String(channelId);
    if (seen.has(key)) continue;
    seen.add(key);

    const other = c.other_user || c.peer || c.otherUser || null;
    const name =
      other?.name ||
      other?.display_name ||
      other?.username ||
      c.channel_name ||
      c.name ||
      c.title ||
      'Chat';
    const userId = other?.user_id ?? other?.id ?? null;
    const avatarUrl = other?.profile_pic_url || other?.avatar_url || c.avatar_url || null;
    const initials = String(name).trim().slice(0, 2).toUpperCase() || '?';

    out.push({
      channelId: Number(channelId) || channelId,
      userId: userId != null ? Number(userId) || userId : null,
      name: String(name),
      initials,
      avatarUrl,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Message body for an in-app video share. */
export function formatVideoShareMessage({ title, shareUrl } = {}) {
  const url = String(shareUrl || '').trim();
  const t = String(title || '').trim();
  if (!url) return '';
  if (!t) return url;
  return `${t}\n${url}`;
}

const VIDEO_PATH_RE = /\/v\/[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)?/i;
const VIDEO_URL_RE = /https?:\/\/[^\s]+\/v\/[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)?(?:\?[^\s]*)?/i;

/** Payload for chat sendMessage — text body + share metadata for a rich bubble. */
export function buildVideoSharePayload({ video, shareUrl } = {}) {
  const url = String(shareUrl || '').trim();
  const title = String(video?.title || '').trim();
  const thumbRaw = video?.thumbnail_url || video?.thumb || null;
  const thumb = typeof thumbRaw === 'string' && thumbRaw.startsWith('http') ? thumbRaw : null;
  const videoId = video?.video_id ?? video?.videoId ?? video?.id ?? null;
  const content = formatVideoShareMessage({ title, shareUrl: url });
  const metadata = {
    share: {
      kind: 'video',
      url,
      title: title || null,
      thumb,
      video_id: videoId,
    },
  };
  return { content, metadata };
}

/**
 * Resolve a video-share card from message metadata or a bare Strug /v/ URL in text
 * (so older plain-link shares still render as a preview).
 */
export function resolveVideoShareFromMessage(msg, { origin } = {}) {
  const meta = msg?.metadata?.share;
  if (meta?.kind === 'video' && meta.url) {
    return {
      kind: 'video',
      url: String(meta.url),
      title: meta.title ? String(meta.title) : null,
      thumb: meta.thumb && String(meta.thumb).startsWith('http') ? String(meta.thumb) : null,
      video_id: meta.video_id ?? null,
    };
  }

  const text = String(msg?.text ?? msg?.content ?? '').trim();
  if (!text) return null;

  const urlMatch = text.match(VIDEO_URL_RE);
  let url = urlMatch ? urlMatch[0].replace(/[),.;]+$/, '') : null;
  if (!url) {
    const pathMatch = text.match(VIDEO_PATH_RE);
    if (pathMatch) {
      const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
      if (!base) return null;
      url = `${base}${pathMatch[0]}`;
    }
  }
  if (!url) return null;

  const titleLine = text
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l && !VIDEO_URL_RE.test(l) && !VIDEO_PATH_RE.test(l));

  return {
    kind: 'video',
    url,
    title: titleLine || null,
    thumb: null,
    video_id: null,
  };
}

/** Open a shared Strug watch URL inside the app when possible. */
export function openSharedVideoUrl(url) {
  const href = String(url || '').trim();
  if (!href) return;
  try {
    const u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://app.strug.ca');
    const sameOrigin = typeof window !== 'undefined' && u.origin === window.location.origin;
    if (sameOrigin && VIDEO_PATH_RE.test(u.pathname)) {
      window.history.pushState({ nav: 'videos' }, '', `${u.pathname}${u.search}${u.hash}`);
      if (typeof window.__nav === 'function') window.__nav('videos');
      else window.location.assign(u.href);
      return;
    }
  } catch {
    /* fall through */
  }
  if (typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}

export function filterShareTargets(targets, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return Array.isArray(targets) ? targets : [];
  return (targets || []).filter((t) => String(t.name || '').toLowerCase().includes(q));
}
