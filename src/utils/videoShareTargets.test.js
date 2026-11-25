import { describe, expect, it } from 'vitest';
import {
  buildVideoSharePayload,
  filterShareTargets,
  formatVideoShareMessage,
  mapConversationsToShareTargets,
  resolveVideoShareFromMessage,
} from './videoShareTargets.js';

describe('mapConversationsToShareTargets', () => {
  it('maps DM conversations with other_user', () => {
    const rows = mapConversationsToShareTargets([
      {
        channel_id: 10,
        other_user: { user_id: 5, name: 'Ada', profile_pic_url: 'https://x/a.png' },
      },
      { channel_id: 10, other_user: { user_id: 5, name: 'Ada' } },
      { channel_id: 11, channel_name: 'Group Chat' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ channelId: 10, userId: 5, name: 'Ada', initials: 'AD' });
    expect(rows[1].name).toBe('Group Chat');
  });

  it('respects limit', () => {
    const rows = mapConversationsToShareTargets(
      Array.from({ length: 5 }, (_, i) => ({ channel_id: i + 1, channel_name: `C${i}` })),
      { limit: 2 },
    );
    expect(rows).toHaveLength(2);
  });
});

describe('formatVideoShareMessage', () => {
  it('joins title and url', () => {
    expect(formatVideoShareMessage({ title: 'Hello', shareUrl: 'https://app.strug.ca/v/1' }))
      .toBe('Hello\nhttps://app.strug.ca/v/1');
  });

  it('returns url only when title missing', () => {
    expect(formatVideoShareMessage({ shareUrl: 'https://x' })).toBe('https://x');
  });
});

describe('buildVideoSharePayload', () => {
  it('includes share metadata with thumb', () => {
    const p = buildVideoSharePayload({
      video: { id: 11, title: 'Clip', thumbnail_url: 'https://cdn/t.jpg' },
      shareUrl: 'https://app.staging.strug.ca/v/11',
    });
    expect(p.content).toContain('Clip');
    expect(p.metadata.share).toMatchObject({
      kind: 'video',
      url: 'https://app.staging.strug.ca/v/11',
      title: 'Clip',
      thumb: 'https://cdn/t.jpg',
      video_id: 11,
    });
  });
});

describe('resolveVideoShareFromMessage', () => {
  it('prefers metadata.share', () => {
    const s = resolveVideoShareFromMessage({
      text: 'ignore',
      metadata: { share: { kind: 'video', url: 'https://app.strug.ca/v/9', title: 'T', thumb: 'https://x/t.png' } },
    });
    expect(s).toMatchObject({ url: 'https://app.strug.ca/v/9', title: 'T', thumb: 'https://x/t.png' });
  });

  it('parses bare staging watch urls', () => {
    const s = resolveVideoShareFromMessage(
      { text: 'https://app.staging.strug.ca/v/11' },
      { origin: 'https://app.staging.strug.ca' },
    );
    expect(s?.url).toBe('https://app.staging.strug.ca/v/11');
  });
});

describe('filterShareTargets', () => {
  it('filters by name', () => {
    const t = [{ name: 'Ada' }, { name: 'Bob' }];
    expect(filterShareTargets(t, 'ad')).toEqual([{ name: 'Ada' }]);
  });
});
