import { describe, it, expect, beforeEach } from 'vitest';
import {
  BADGE_TABS,
  badgeLabel,
  circleRowMarkers,
  creatorChoiceRowMarkers,
  maxMarker,
  readSeenMarkers,
  subsRowMarkers,
  unseenCount,
  rowVideoId,
  watchedIdSet,
  withoutWatched,
  writeSeenMarker,
} from './videosDrawerBadges.js';

/** Minimal localStorage stand-in so the tests never touch the real one. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const atMs = (friend) => (friend?.at == null ? null : new Date(friend.at).getTime());

describe('videos drawer badges — row markers', () => {
  it('reads pick ids from Creator\u2019s Choice rows', () => {
    expect(creatorChoiceRowMarkers([{ pickId: 7 }, { pickId: 11 }])).toEqual([7, 11]);
  });

  it('reads video ids from subscription uploads, whatever the field is called', () => {
    expect(subsRowMarkers([{ id: 4 }, { video_id: 9 }, { videoId: 2 }])).toEqual([4, 9, 2]);
  });

  it('takes the newest friend timestamp per Circle row', () => {
    const rows = [
      { friends: [{ at: '2026-08-01T10:00:00Z' }, { at: '2026-08-03T10:00:00Z' }] },
      { friends: [{ at: '2026-07-01T10:00:00Z' }] },
    ];
    expect(circleRowMarkers(rows, atMs)).toEqual([
      new Date('2026-08-03T10:00:00Z').getTime(),
      new Date('2026-07-01T10:00:00Z').getTime(),
    ]);
  });

  // A payload with no timestamps must not be guessed at — that tab simply never badges.
  it('skips Circle rows with no usable timestamp', () => {
    expect(circleRowMarkers([{ friends: [{}] }, { friends: [] }, {}], atMs)).toEqual([]);
  });

  it('ignores junk instead of counting it', () => {
    expect(creatorChoiceRowMarkers([{ pickId: null }, { pickId: 'x' }, {}, null])).toEqual([]);
    expect(subsRowMarkers(undefined)).toEqual([]);
    expect(maxMarker([3, 'x', null, 12, -4])).toBe(12);
    expect(maxMarker([])).toBe(0);
  });
});

describe('videos drawer badges — already watched', () => {
  it('finds the video id whether the row wraps a video or is one', () => {
    expect(rowVideoId({ video: { video_id: 8 } })).toBe(8);
    expect(rowVideoId({ videoId: 5 })).toBe(5);
    // A Creator's Choice channel pick has no video to have watched.
    expect(rowVideoId({ pickId: 3, channel: { channelId: 1 } })).toBeNull();
  });

  it('drops watched rows and keeps the rest', () => {
    const rows = [{ video_id: 4 }, { video_id: 9 }, { pickId: 2 }];
    expect(withoutWatched(rows, new Set([9]))).toEqual([{ video_id: 4 }, { pickId: 2 }]);
    expect(withoutWatched(rows, new Set())).toEqual(rows);
  });

  it('builds the watched set from history plus ids played this session', () => {
    const set = watchedIdSet([{ id: 3 }, { video_id: 7 }, { id: null }], [7, 12, 'x']);
    expect([...set].sort((a, b) => a - b)).toEqual([3, 7, 12]);
  });

  // The count has to match the rows behind the tab: a watched row must not badge.
  it('stops counting a row once it is watched', () => {
    const rows = [{ video_id: 4 }, { video_id: 9 }];
    expect(unseenCount(subsRowMarkers(rows), 4)).toBe(1);
    expect(unseenCount(subsRowMarkers(withoutWatched(rows, new Set([9]))), 4)).toBe(0);
  });
});

describe('videos drawer badges — unseen count', () => {
  it('counts only rows above the marker last seen', () => {
    expect(unseenCount([12, 11, 9, 4], 9)).toBe(2);
  });

  // First visit on an account: everything is treated as seen, so the tabs open quiet and the
  // caller seeds the marker instead of dumping a pile of news on the viewer.
  it('stays at zero until the tab has been seeded', () => {
    expect(unseenCount([12, 11, 9], undefined)).toBe(0);
    expect(unseenCount([12, 11, 9], null)).toBe(0);
  });

  // A tab that was empty on the first visit is seeded at 0. That is still "seen", so the first row
  // ever to arrive is news — treating 0 as "never seeded" swallowed it for every new account.
  it('counts everything once an empty tab has been seeded at zero', () => {
    expect(unseenCount([12, 11, 9], 0)).toBe(3);
  });

  it('is zero once the newest row has been seen', () => {
    expect(unseenCount([12, 11], 12)).toBe(0);
  });

  it('formats the label, capping at 9+', () => {
    expect(badgeLabel(0)).toBe('');
    expect(badgeLabel(undefined)).toBe('');
    expect(badgeLabel(3)).toBe('3');
    expect(badgeLabel(9)).toBe('9');
    expect(badgeLabel(31)).toBe('9+');
  });
});

describe('videos drawer badges — seen markers', () => {
  let storage;
  beforeEach(() => { storage = fakeStorage(); });

  it('round-trips a marker per tab', () => {
    writeSeenMarker('u1', 'subs', 42, storage);
    writeSeenMarker('u1', 'circle', 1700, storage);
    expect(readSeenMarkers('u1', storage)).toEqual({ subs: 42, circle: 1700 });
  });

  // A shared browser must not show one viewer's unseen picks to the next person who signs in.
  it('keeps accounts apart', () => {
    writeSeenMarker('u1', 'subs', 42, storage);
    expect(readSeenMarkers('u2', storage)).toEqual({});
  });

  // A slow poll finishing after a click must not resurrect a badge the viewer just cleared.
  it('never moves a marker backwards', () => {
    writeSeenMarker('u1', 'subs', 42, storage);
    writeSeenMarker('u1', 'subs', 7, storage);
    expect(readSeenMarkers('u1', storage).subs).toBe(42);
  });

  // An empty tab has to record that it WAS seeded, or every poll re-seeds it and the first row to
  // turn up is marked as already seen.
  it('records a seeded-but-empty tab as zero', () => {
    writeSeenMarker('u1', 'subs', 0, storage);
    expect(readSeenMarkers('u1', storage)).toEqual({ subs: 0 });
    writeSeenMarker('u1', 'subs', 8, storage);
    expect(readSeenMarkers('u1', storage).subs).toBe(8);
  });

  // Storage is a mirror, not the source of truth: where it is blocked, a re-read reports "never
  // seeded" and the badge could never fire, so the caller's own markers are merged in.
  it('keeps the caller\'s markers when storage cannot be read back', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const next = writeSeenMarker('u1', 'subs', 9, blocked, { circle: 1700 });
    expect(next).toEqual({ circle: 1700, subs: 9 });
  });

  it('ignores tabs that carry no badge', () => {
    writeSeenMarker('u1', 'history', 99, storage);
    expect(readSeenMarkers('u1', storage)).toEqual({});
    expect(BADGE_TABS).not.toContain('history');
  });

  it('survives corrupt or missing storage', () => {
    const broken = fakeStorage({ 'strug_videos_drawer_seen_v1:u1': '{not json' });
    expect(readSeenMarkers('u1', broken)).toEqual({});
    expect(readSeenMarkers('u1', undefined)).toEqual({});
    expect(() => writeSeenMarker('u1', 'subs', 5, {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
    })).not.toThrow();
  });
});
