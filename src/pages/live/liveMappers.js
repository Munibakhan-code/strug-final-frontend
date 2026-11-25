import { rewriteLivePlaybackUrl } from '../../utils/livePlayback.js';

const FALLBACK_THUMB = 'https://ui-avatars.com/api/?background=0f172a&color=fff&size=256&name=S';

/** Map GET /live-session/live row → browse stream card shape. */
export function mapApiSessionToStream(row) {
  const thumb = row.thumbnail_url || row.profile_pic_url || row.category_icon_url || FALLBACK_THUMB;
  return {
    id: row.session_id,
    session_id: row.session_id,
    title: row.title || 'Live Stream',
    description: row.description || '',
    streamer: row.display_name || row.handle || 'Streamer',
    streamer_id: row.streamer_id ?? null,
    streamer_user_id: row.streamer_user_id ?? null,
    handle: row.handle,
    url: rewriteLivePlaybackUrl(row.playback_url),
    thumb,
    thumbnail_url: row.thumbnail_url || null,
    profile_pic_url: row.profile_pic_url || thumb,
    viewers: row.viewer_count ?? 0,
    viewer_count: row.viewer_count ?? 0,
    started_at: row.started_at ?? null,
    category: row.category ?? 'General',
    category_id: row.category_id ?? null,
    verified: row.verified ?? false,
    live: true,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

/** Map GET /live-session/categories/browse row → UI category shape. */
export function mapBrowseCategory(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  return {
    id: row.id ?? String(row.category_id),
    category_id: row.category_id,
    name: row.name ?? row.category_name,
    thumb: row.thumb ?? row.icon_url,
    icon_url: row.icon_url ?? row.thumb,
    tags,
    tagsLabel: tags.join(', '),
    viewers: row.viewers ?? row.live_viewers ?? 0,
    live_viewers: row.live_viewers ?? row.viewers ?? 0,
    live_channels: row.live_channels ?? 0,
    followers: row.followers ?? 0,
    description: row.description ?? '',
    featured: row.featured ?? false,
    isNew: row.isNew ?? false,
    banner: row.banner ?? null,
  };
}

/** Map category VOD API row → card shape. */
export function mapCategoryVod(row) {
  return {
    id: row.id ?? row.vod_id,
    vod_id: row.vod_id ?? row.id,
    session_id: row.session_id ?? null,
    title: row.title,
    description: row.description || '',
    streamer: row.streamer,
    streamer_user_id: row.streamer_user_id ?? row.user_id ?? null,
    handle: row.handle,
    profile_pic_url: row.profile_pic_url,
    category: row.category,
    thumb: row.thumb || row.thumbnail_url || row.profile_pic_url,
    thumbnail_url: row.thumbnail_url || row.thumb || null,
    duration: row.duration,
    duration_sec: row.duration_sec ?? null,
    views: row.views ?? 0,
    created_at: row.created_at,
    video_url: row.video_url,
  };
}

/** Map category clip API row → card shape. */
export function mapCategoryClip(row) {
  return {
    id: row.id ?? row.vod_id,
    vod_id: row.vod_id ?? row.id,
    session_id: row.session_id ?? null,
    title: row.title,
    streamer: row.streamer,
    streamer_user_id: row.streamer_user_id ?? row.user_id ?? null,
    handle: row.handle,
    profile_pic_url: row.profile_pic_url,
    category: row.category,
    thumb: row.thumb || row.thumbnail_url || row.profile_pic_url,
    duration: row.duration,
    duration_sec: row.duration_sec ?? null,
    views: row.views ?? 0,
    created_at: row.created_at,
    video_url: row.video_url,
    is_clip: true,
    clipped_by: row.clipped_by ?? null,
  };
}
