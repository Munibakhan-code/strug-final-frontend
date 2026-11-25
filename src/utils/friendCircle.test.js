import { describe, it, expect } from 'vitest';
import {
	DRAWER_CIRCLE_LANE_CAP,
	friendActivityAttribution,
	groupFriendActivityLanes,
	formatFriendNameList,
	friendActivityToVideo,
} from './friendCircle.js';

describe('friendCircle', () => {
	it('builds attribution for liked and watched with real relative time', () => {
		expect(friendActivityAttribution({
			watching_now: true,
			friend_count: 1,
			friends: [{ display_name: 'Sara', action: 'watching', at: Date.now() - 60_000 }],
		})).toMatch(/^Sara watched this · 1 minute ago$/);
		expect(friendActivityAttribution({
			friend_count: 1,
			friends: [{ display_name: 'Jamal', action: 'liked', at: Date.now() - 2 * 86_400_000 }],
		})).toMatch(/^Jamal liked this · 2 days ago$/);
		expect(friendActivityAttribution({
			friend_count: 2,
			friends: [
				{ display_name: 'Bilal', action: 'watched', at: Date.now() - 2 * 86_400_000 },
				{ display_name: 'Sara', action: 'watched' },
			],
		})).toMatch(/^Bilal \+1 watched this · 2 days ago$/);
		expect(friendActivityAttribution({
			friend_count: 1,
			friends: [{ name: 'Ayesha', action: 'liked', at: Date.now() - 3 * 60 * 60 * 1000 }],
		})).toMatch(/^Ayesha liked this · 3 hours ago$/);
	});

	it('groups liked and watched; omits live watching from lanes', () => {
		const lanes = groupFriendActivityLanes([
			{ video_id: 1, watching_now: true, friends: [{ action: 'watching' }] },
			{ video_id: 2, friends: [{ action: 'liked' }] },
			{ video_id: 3, friends: [{ action: 'watched' }] },
		]);
		expect(lanes.watchingNow).toHaveLength(0);
		expect(lanes.liked).toHaveLength(1);
		expect(lanes.watched).toHaveLength(1);
	});

	it('caps each circle lane', () => {
		const liked = Array.from({ length: DRAWER_CIRCLE_LANE_CAP + 3 }, (_, i) => ({
			video_id: 100 + i,
			friends: [{ action: 'liked' }],
		}));
		const lanes = groupFriendActivityLanes([
			{ video_id: 1, watching_now: true, friends: [{ action: 'watching' }] },
			{ video_id: 2, watching_now: true, friends: [{ action: 'watching' }] },
			...liked,
			{ video_id: 7, friends: [{ action: 'watched' }] },
		]);
		expect(lanes.watchingNow).toHaveLength(0);
		expect(lanes.liked).toHaveLength(DRAWER_CIRCLE_LANE_CAP);
		expect(lanes.watched).toHaveLength(1);
	});

	// The API ranks by how many friends engaged before it looks at time, which reads as shuffled in
	// a drawer: this morning's watch belongs above last week's.
	it('orders each lane by the most recent friend action', () => {
		const lanes = groupFriendActivityLanes([
			{ video_id: 1, friends: [{ action: 'watched', at: '2026-08-01T10:00:00Z' }] },
			{ video_id: 2, friends: [{ action: 'watched', at: '2026-08-20T10:00:00Z' }] },
			{ video_id: 3, friends: [{ action: 'watched', at: '2026-08-10T10:00:00Z' }, { action: 'watched', at: '2026-08-25T10:00:00Z' }] },
			{ video_id: 4, friends: [{ action: 'liked', at: '2026-07-01T10:00:00Z' }] },
			{ video_id: 5, friends: [{ action: 'liked', at: '2026-08-28T10:00:00Z' }] },
		]);
		expect(lanes.watched.map((r) => r.video_id)).toEqual([3, 2, 1]);
		expect(lanes.liked.map((r) => r.video_id)).toEqual([5, 4]);
	});

	// A payload with no timestamps must keep every row rather than sorting them away.
	it('keeps rows that carry no timestamp', () => {
		const lanes = groupFriendActivityLanes([
			{ video_id: 1, friends: [{ action: 'watched' }] },
			{ video_id: 2, friends: [{ action: 'watched', at: '2026-08-20T10:00:00Z' }] },
		]);
		expect(lanes.watched.map((r) => r.video_id)).toEqual([2, 1]);
	});

	it('maps activity rows to selectVideo payloads', () => {
		expect(friendActivityToVideo({ video_id: 9, title: 'T', channel: { display_name: 'Nine' } })).toMatchObject({
			id: 9,
			title: 'T',
			channel: 'Nine',
		});
	});

	it('formats friend name lists for overlap copy', () => {
		expect(formatFriendNameList([{ display_name: 'A' }, { display_name: 'B' }])).toBe('A and B');
	});
});
