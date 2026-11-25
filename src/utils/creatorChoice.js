/** Map Creator's Choice API rows into shelf / drawer shapes. */

/**
 * Show "Recommend to subscribers" when the viewer owns a channel and the video
 * belongs to someone else (BE rejects self-picks).
 */
export function canRecommendVideoToSubscribers(video, myChannelId) {
  if (myChannelId == null || !video || typeof video !== 'object') return false;
  const myId = Number(myChannelId);
  if (!Number.isFinite(myId) || myId <= 0) return false;
  const videoId = Number(video.videoId ?? video.video_id ?? video.id);
  if (!Number.isFinite(videoId) || videoId <= 0) return false;
  const ownerId = Number(
    video.channel_id
      ?? video.channelId
      ?? (typeof video.channel === 'object' ? video.channel?.channel_id ?? video.channel?.channelId : null),
  );
  if (!Number.isFinite(ownerId) || ownerId <= 0) return false;
  return ownerId !== myId;
}

/** Recommend another creator's channel (not your own). */
export function canRecommendChannelToSubscribers(targetChannelId, myChannelId) {
  if (myChannelId == null || targetChannelId == null) return false;
  const myId = Number(myChannelId);
  const targetId = Number(targetChannelId);
  if (!Number.isFinite(myId) || myId <= 0) return false;
  if (!Number.isFinite(targetId) || targetId <= 0) return false;
  return targetId !== myId;
}

export function listCreatorChoicePicks(resp) {
  if (Array.isArray(resp)) return resp;
  const d = resp?.data;
  if (Array.isArray(d)) return d;
  return resp?.items ?? d?.items ?? [];
}

/**
 * @param {object} pick raw API pick row
 * @param {(v: object) => object} mapVideo maps a nested video into VideoCard shape
 */
export function mapCreatorChoicePick(pick, mapVideo) {
  if (!pick || typeof pick !== 'object') return null;

  const recommender = pick.recommender
    ? {
      channelId: pick.recommender.channel_id,
      name: pick.recommender.display_name ?? 'Creator',
      handle: pick.recommender.handle ?? '',
      profile_pic_url: pick.recommender.profile_pic_url ?? null,
    }
    : null;

  if (pick.pick_type === 'video' && pick.video) {
    const mapped = mapVideo(pick.video);
    if (!mapped?.id && !mapped?.videoId) return null;
    return {
      kind: 'video',
      pickId: pick.pick_id,
      note: pick.note ?? null,
      recommender,
      video: mapped,
    };
  }

  if (pick.pick_type === 'channel' && pick.channel) {
    const ch = pick.channel;
    if (ch.channel_id == null) return null;
    return {
      kind: 'channel',
      pickId: pick.pick_id,
      note: pick.note ?? null,
      recommender,
      channel: {
        channelId: ch.channel_id,
        name: ch.display_name ?? 'Channel',
        handle: ch.handle ?? '',
        profile_pic_url: ch.profile_pic_url ?? null,
        banner_url: ch.banner_url ?? null,
        subscribers: ch.subscriber_count ?? 0,
        videoCount: ch.video_count ?? 0,
        avatar: (ch.display_name ?? 'C')[0].toUpperCase(),
      },
    };
  }

  return null;
}

export function mapCreatorChoiceShelf(resp, mapVideo) {
  return listCreatorChoicePicks(resp)
    .map((pick) => mapCreatorChoicePick(pick, mapVideo))
    .filter(Boolean);
}

/** Video picks only — horizontal shelf uses VideoCard. */
export function creatorChoiceVideoShelfItems(items) {
  return items.filter((item) => item.kind === 'video').map((item) => item.video);
}
