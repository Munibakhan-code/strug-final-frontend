import { describe, it, expect, afterEach, vi } from 'vitest';
import { mediaUrl, mediaUrls } from './mediaUrl.js';

// API_BASE resolves from VITE_API_BASE_URL at import time. The test config sets it to
// '/api' (see vite.config.js test.env), so that's the base for the eager import below.

describe('mediaUrl', () => {
  it('prefixes server upload paths with the API base', () => {
    expect(mediaUrl('/uploads/photos/1.jpg')).toBe('/api/uploads/photos/1.jpg');
    expect(mediaUrl('uploads/photos/1.jpg')).toBe('/api/uploads/photos/1.jpg');
  });

  it('leaves absolute / data / blob / protocol-relative URLs untouched', () => {
    expect(mediaUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(mediaUrl('http://x/a.jpg')).toBe('http://x/a.jpg');
    expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(mediaUrl('blob:abc')).toBe('blob:abc');
    expect(mediaUrl('//cdn.example.com/a.jpg')).toBe('//cdn.example.com/a.jpg');
  });

  it('passes through other relative paths and non-strings as-is', () => {
    expect(mediaUrl('/some/other/path')).toBe('/some/other/path');
    expect(mediaUrl('')).toBe('');
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeUndefined();
    expect(mediaUrl(42)).toBe(42);
  });
});

describe('mediaUrls', () => {
  it('maps an array and drops falsy entries', () => {
    expect(mediaUrls(['/uploads/a.jpg', '', null, 'https://x/b.jpg']))
      .toEqual(['/api/uploads/a.jpg', 'https://x/b.jpg']);
  });
  it('returns [] for a non-array', () => {
    expect(mediaUrls(null)).toEqual([]);
    expect(mediaUrls(undefined)).toEqual([]);
  });
});

describe('mediaUrl — env-driven base (import-time capture)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses a custom VITE_API_BASE_URL set before import, stripping a trailing slash', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/');
    const mod = await import('./mediaUrl.js');
    expect(mod.mediaUrl('/uploads/a.jpg')).toBe('https://api.example.com/uploads/a.jpg');
  });
});
