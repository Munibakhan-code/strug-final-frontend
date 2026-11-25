import { describe, it, expect } from 'vitest';
import { isHomeFeedVideo, unwrapHomeFeedResponse } from './homeFeed.js';

describe('homeFeed', () => {
	it('filters non-video rows from home-feed payloads', () => {
		expect(isHomeFeedVideo({ content_type: 'post', id: 1 })).toBe(false);
		expect(isHomeFeedVideo({ content_type: 'video', video_id: 9 })).toBe(true);
	});

	it('unwraps cursor and cold_start from the API envelope', () => {
		const out = unwrapHomeFeedResponse({
			data: {
				items: [{ content_type: 'video', video_id: 1 }, { content_type: 'post', id: 2 }],
				next_cursor: 24,
				cold_start: true,
			},
		});
		expect(out.items).toHaveLength(1);
		expect(out.nextCursor).toBe(24);
		expect(out.coldStart).toBe(true);
	});
});
