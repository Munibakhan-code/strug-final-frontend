import { describe, it, expect } from 'vitest';
import { watchedFeedShelves, WATCHED_SHELF_LIMIT } from './watchedFeedShelves.js';

const v = (id) => ({ id, title: `Video ${id}` });

describe('watchedFeedShelves', () => {
	it('returns no rails when history is empty', () => {
		expect(watchedFeedShelves([])).toEqual({ recent: [], more: [] });
		expect(watchedFeedShelves(null)).toEqual({ recent: [], more: [] });
		expect(watchedFeedShelves(undefined)).toEqual({ recent: [], more: [] });
	});

	it('drops rows with no video id rather than rendering a broken card', () => {
		expect(watchedFeedShelves([{ title: 'Ghost' }, null])).toEqual({ recent: [], more: [] });
	});

	it('keeps a single watched video on the recent rail only', () => {
		const one = [v(1)];
		expect(watchedFeedShelves(one)).toEqual({ recent: one, more: [] });
	});

	it('shows no lower rail when the upper rail already holds everything', () => {
		const list = Array.from({ length: WATCHED_SHELF_LIMIT }, (_, i) => v(i + 1));
		const { recent, more } = watchedFeedShelves(list, { shuffle: (a) => a });
		expect(recent).toHaveLength(WATCHED_SHELF_LIMIT);
		expect(more).toEqual([]);
	});

	it('never repeats a card the upper rail already showed', () => {
		const list = Array.from({ length: WATCHED_SHELF_LIMIT + 4 }, (_, i) => v(i + 1));
		const { recent, more } = watchedFeedShelves(list, { shuffle: (a) => a });
		const top = new Set(recent.map((x) => x.id));
		expect(more.map((x) => x.id).filter((id) => top.has(id))).toEqual([]);
		expect(more).toHaveLength(4);
	});

	it('keeps recent in API order and shuffles the lower rail', () => {
		const list = [v(1), v(2), v(3)];
		const reverse = (arr) => [...arr].reverse();
		expect(watchedFeedShelves(list, { shuffle: reverse, limit: 2 })).toEqual({
			recent: [v(1), v(2)],
			more: [v(3)],
		});
	});

	it('caps each rail so a long history does not dump the whole list', () => {
		const list = Array.from({ length: WATCHED_SHELF_LIMIT * 3 }, (_, i) => v(i + 1));
		const identity = (arr) => arr;
		const { recent, more } = watchedFeedShelves(list, { shuffle: identity });
		expect(recent).toHaveLength(WATCHED_SHELF_LIMIT);
		expect(more).toHaveLength(WATCHED_SHELF_LIMIT);
		expect(recent[0].id).toBe(1);
	});
});
