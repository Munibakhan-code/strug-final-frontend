import { describe, it, expect } from 'vitest';
import {
  mapCreatorChoicePick,
  mapCreatorChoiceShelf,
  creatorChoiceVideoShelfItems,
  canRecommendVideoToSubscribers,
  canRecommendChannelToSubscribers,
} from './creatorChoice.js';

const mapVideo = (v) => ({
  id: v.video_id,
  videoId: v.video_id,
  title: v.title,
  channel: v.channel?.display_name ?? 'Creator',
});

describe('mapCreatorChoicePick', () => {
  it('maps video and channel picks with recommender', () => {
    expect(mapCreatorChoicePick({
      pick_id: 1,
      pick_type: 'video',
      note: 'Must watch',
      recommender: { channel_id: 9, display_name: 'Nine', handle: 'nine' },
      video: { video_id: 42, title: 'Clip', channel: { display_name: 'Friend' } },
    }, mapVideo)).toMatchObject({
      kind: 'video',
      pickId: 1,
      recommender: { channelId: 9, name: 'Nine' },
      video: { id: 42, title: 'Clip' },
    });

    expect(mapCreatorChoicePick({
      pick_id: 2,
      pick_type: 'channel',
      recommender: { channel_id: 9, display_name: 'Nine', handle: 'nine' },
      channel: { channel_id: 3, display_name: 'Pal', handle: 'pal' },
    }, mapVideo)).toMatchObject({
      kind: 'channel',
      channel: { channelId: 3, name: 'Pal' },
    });
  });

  it('returns null for incomplete rows', () => {
    expect(mapCreatorChoicePick({ pick_type: 'video' }, mapVideo)).toBeNull();
    expect(mapCreatorChoicePick({ pick_type: 'channel' }, mapVideo)).toBeNull();
  });
});

describe('mapCreatorChoiceShelf', () => {
  it('unwraps { data: [...] } and filters invalid rows', () => {
    const out = mapCreatorChoiceShelf({
      data: [
        { pick_id: 1, pick_type: 'video', video: { video_id: 1, title: 'A' } },
        { pick_id: 2, pick_type: 'video' },
      ],
    }, mapVideo);
    expect(out).toHaveLength(1);
    expect(out[0].video.id).toBe(1);
  });
});

describe('creatorChoiceVideoShelfItems', () => {
  it('keeps only video picks for the horizontal shelf', () => {
    const items = [
      { kind: 'video', video: { id: 1 } },
      { kind: 'channel', channel: { channelId: 2 } },
    ];
    expect(creatorChoiceVideoShelfItems(items)).toEqual([{ id: 1 }]);
  });
});

describe('canRecommendVideoToSubscribers', () => {
  it('allows another creator’s video when the viewer has a channel', () => {
    expect(canRecommendVideoToSubscribers({ id: 1, channel_id: 9 }, 42)).toBe(true);
    expect(canRecommendVideoToSubscribers({ videoId: 2, channel: { channel_id: 9 } }, 42)).toBe(true);
  });

  it('blocks own videos, missing ids, and viewers without a channel', () => {
    expect(canRecommendVideoToSubscribers({ id: 1, channel_id: 42 }, 42)).toBe(false);
    expect(canRecommendVideoToSubscribers({ id: 1, channel_id: 9 }, null)).toBe(false);
    expect(canRecommendVideoToSubscribers({ channel_id: 9 }, 42)).toBe(false);
    expect(canRecommendVideoToSubscribers({ id: 1 }, 42)).toBe(false);
  });
});

describe('canRecommendChannelToSubscribers', () => {
  it('allows another channel when the viewer has a channel', () => {
    expect(canRecommendChannelToSubscribers(9, 42)).toBe(true);
  });

  it('blocks own channel and missing ids', () => {
    expect(canRecommendChannelToSubscribers(42, 42)).toBe(false);
    expect(canRecommendChannelToSubscribers(9, null)).toBe(false);
    expect(canRecommendChannelToSubscribers(null, 42)).toBe(false);
  });
});
