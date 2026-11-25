import { describe, it, expect } from 'vitest';
import { buildMatchedChannels, channelMatchesQuery } from './videoSearch.js';

describe('channelMatchesQuery', () => {
  it('matches display name and handle fragments', () => {
    expect(channelMatchesQuery('fit', { display_name: 'FitWithMorgan', handle: 'fitwithmorgan' })).toBe(true);
    expect(channelMatchesQuery('morgan', { display_name: 'FitWithMorgan', handle: 'fitwithmorgan' })).toBe(true);
    expect(channelMatchesQuery('fitwithmorgan', { display_name: 'FitWithMorgan', handle: 'fitwithmorgan' })).toBe(true);
    expect(channelMatchesQuery('cooking', { display_name: 'FitWithMorgan', handle: 'fitwithmorgan' })).toBe(false);
  });
});

describe('buildMatchedChannels', () => {
  const video = (id, channel, extra = {}) => ({
    id,
    channel_id: extra.channel_id ?? 9,
    channel,
    handle: extra.handle ?? 'nine',
    profile_pic_url: extra.profile_pic_url ?? null,
    avatar: 'N',
  });

  it('uses suggest channels with channel_id for clickable rows', () => {
    const rows = buildMatchedChannels('fit', {
      searchResults: [video(1, 'FitWithMorgan', { channel_id: 9, handle: 'fitwithmorgan' })],
      searchChannels: [{ channel_id: 9, display_name: 'FitWithMorgan', handle: 'fitwithmorgan', profile_pic_url: null }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].channelObj.channel_id).toBe(9);
    expect(rows[0].videoCount).toBe(1);
  });

  it('dedupes the same creator from suggest and video hits', () => {
    const rows = buildMatchedChannels('fit', {
      searchResults: [video(1, 'FitWithMorgan', { channel_id: 9, handle: 'fitwithmorgan' })],
      searchChannels: [{ channel_id: 9, display_name: 'FitWithMorgan', handle: 'fitwithmorgan', profile_pic_url: null }],
      fallbackItems: [video(2, 'FitWithMorgan', { channel_id: 9 })],
    });
    expect(rows).toHaveLength(1);
  });

  it('skips unopenable rows with no channel_id and no handle', () => {
    const rows = buildMatchedChannels('creator', {
      searchResults: [{ id: 1, channel: 'Creator Only', channel_id: null, handle: null }],
      searchChannels: [],
    });
    expect(rows).toHaveLength(0);
  });

  it('falls back to home feed videos only when search returned none', () => {
    const rows = buildMatchedChannels('nine', {
      searchResults: [],
      searchChannels: [],
      fallbackItems: [video(3, 'Creator Nine', { channel_id: 9, handle: 'nine' })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Creator Nine');
  });
});
