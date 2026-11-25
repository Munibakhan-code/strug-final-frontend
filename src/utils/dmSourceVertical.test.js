/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { normalizeDmSourceVertical } from './dmSourceVertical.js';

describe('normalizeDmSourceVertical', () => {
	it('accepts allowed slugs', () => {
		expect(normalizeDmSourceVertical('Social')).toBe('social');
		expect(normalizeDmSourceVertical('medical')).toBe('medical');
	});

	it('rejects unknown values', () => {
		expect(normalizeDmSourceVertical('')).toBeNull();
		expect(normalizeDmSourceVertical('bogus')).toBeNull();
	});
});
