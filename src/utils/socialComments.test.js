/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { commentAuthorName, commentAvatarUrl, commentTime, parseCommentListPayload, isCommentMutationOk } from './socialComments.js';

// A social_comments row exactly as GET /social-comment/:post_id returns it.
const row = {
  comment_id: 5,
  text: 'nice',
  timestamp: '2026-07-01T12:00:00Z',
  social_profile: {
    handle: 'codezero',
    display_name: 'Codezero',
    profile_pic_url: 'https://cdn/avatar.avif',
    is_verified: false,
  },
};

describe('social comment mapping', () => {
  it('names the author from display_name', () => {
    expect(commentAuthorName(row)).toBe('Codezero');
  });

  it('falls back to the handle when the profile has no display_name', () => {
    expect(commentAuthorName({ social_profile: { handle: 'codezero' } })).toBe('codezero');
  });

  it('does not render a real author as the generic fallback', () => {
    expect(commentAuthorName(row)).not.toBe('User');
  });

  it('reads the time from `timestamp`, not `created_at`', () => {
    // The regression: reading created_at made every comment read "just now".
    expect(commentTime(row)).not.toBe('just now');
    expect(commentTime({ timestamp: null })).toBe('just now');
  });

  it('exposes the author avatar', () => {
    expect(commentAvatarUrl(row)).toBe('https://cdn/avatar.avif');
    expect(commentAvatarUrl({})).toBeNull();
  });
});

describe('parseCommentListPayload', () => {
  it('accepts a bare array (no successful flag)', () => {
    expect(parseCommentListPayload([row])).toEqual([row]);
  });

  it('reads .data or .comments and treats missing payload as empty', () => {
    expect(parseCommentListPayload({ data: [row] })).toEqual([row]);
    expect(parseCommentListPayload({ comments: [row] })).toEqual([row]);
    expect(parseCommentListPayload({ successful: true })).toEqual([]);
    expect(parseCommentListPayload(null)).toEqual([]);
  });
});

describe('isCommentMutationOk', () => {
  it('treats a created comment without successful as ok', () => {
    expect(isCommentMutationOk({ comment_id: 9, text: 'hi' })).toBe(true);
    expect(isCommentMutationOk({ successful: true, data: row })).toBe(true);
  });

  it('rejects explicit failure and empty bodies', () => {
    expect(isCommentMutationOk({ successful: false, data: row })).toBe(false);
    expect(isCommentMutationOk(null)).toBe(false);
    expect(isCommentMutationOk({})).toBe(false);
  });
});
