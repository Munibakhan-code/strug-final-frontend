import i18n from '../i18n/index.js';
import { timeAgo } from './time.js';

/**
 * social_comments row → comment card fields.
 *
 * The row carries its time as `timestamp` (not created_at), and the author comes from the
 * joined social_profile: `display_name` is the human name, `handle` is the @slug. Reading
 * created_at/user_name made every comment render as "User · just now".
 */

export function commentAuthorName(comment) {
  const p = comment?.social_profile;
  return p?.display_name || p?.handle || i18n.t('common.defaultUser');
}

export function commentAvatarUrl(comment) {
  return comment?.social_profile?.profile_pic_url ?? null;
}

export function commentTime(comment) {
  const at = comment?.timestamp ?? comment?.created_at;
  return at ? timeAgo(at) : i18n.t('common.justNow');
}

export function parseCommentListPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.comments)) return data.comments;
  return [];
}

export function isCommentMutationOk(data) {
  if (data == null) return false;
  if (data.successful === false) return false;
  if (data.successful === true) return true;
  return !!(data.data || data.comment_id || data.id);
}
