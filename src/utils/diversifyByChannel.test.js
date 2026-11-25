import { describe, it, expect } from 'vitest';
import { diversifyByChannel } from './diversifyByChannel.js';

function v(id, channel_id, channel = `Ch${channel_id}`) {
	return { id, channel_id, channel };
}

describe('diversifyByChannel', () => {
	it('returns a copy for empty or single-item lists', () => {
		expect(diversifyByChannel([])).toEqual([]);
		expect(diversifyByChannel(null)).toEqual([]);
		const one = [v(1, 9)];
		expect(diversifyByChannel(one)).toEqual(one);
		expect(diversifyByChannel(one)).not.toBe(one);
	});

	it('round-robins so one channel cannot stack the top of the feed', () => {
		const pets = [v(1, 1), v(2, 1), v(3, 1), v(4, 1)];
		const other = [v(10, 2), v(20, 3), v(30, 4)];
		const out = diversifyByChannel([...pets, ...other]);
		expect(out.map((x) => x.id)).toEqual([1, 10, 20, 30, 2, 3, 4]);
		// First four slots are four different channels when enough exist.
		expect(new Set(out.slice(0, 4).map((x) => x.channel_id)).size).toBe(4);
	});

	it('keeps relative order within the same channel', () => {
		const out = diversifyByChannel([v(1, 1), v(2, 2), v(3, 1), v(4, 2)]);
		expect(out.map((x) => x.id)).toEqual([1, 2, 3, 4]);
	});
});
