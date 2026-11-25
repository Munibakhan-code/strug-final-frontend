import { describe, it, expect } from 'vitest';
import { stripVideoFileExtension, displayVideoTitle } from './videoTitle.js';

describe('stripVideoFileExtension', () => {
	it('drops a trailing video extension', () => {
		expect(stripVideoFileExtension('Essbee - Astabalanium [Epic Orchestra].mp4'))
			.toBe('Essbee - Astabalanium [Epic Orchestra]');
		expect(stripVideoFileExtension('clip.MOV')).toBe('clip');
		expect(stripVideoFileExtension('take.webm')).toBe('take');
	});

	it('leaves titles that are not filenames alone', () => {
		expect(stripVideoFileExtension('Lesson one')).toBe('Lesson one');
		expect(stripVideoFileExtension('How .mp4 encoding works')).toBe('How .mp4 encoding works');
	});

	it('returns empty for blank input', () => {
		expect(stripVideoFileExtension('')).toBe('');
		expect(stripVideoFileExtension('   ')).toBe('');
		expect(stripVideoFileExtension(null)).toBe('');
	});
});

describe('displayVideoTitle', () => {
	it('falls back when the raw title is empty', () => {
		expect(displayVideoTitle('', 'Untitled')).toBe('Untitled');
		expect(displayVideoTitle('.mp4', 'Untitled')).toBe('Untitled');
	});
});
