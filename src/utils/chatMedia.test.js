import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server.js';
import {
  resolveChatMediaDisplayUrl,
  isAzureBlobUrl,
  getChatMediaDisplayUrlSync,
  resolveChatMediaDisplayUrlAsync,
} from './chatMedia.js';

const AZURE_URL = (name) =>
  `https://ststrugstaginguploads.blob.core.windows.net/chat-media/chat/1/${name}.jpg`;

describe('resolveChatMediaDisplayUrl', () => {
  it('passes through non-http values untouched', () => {
    expect(resolveChatMediaDisplayUrl('blob:local-preview')).toBe('blob:local-preview');
  });

  it('trims an http(s) url', () => {
    expect(resolveChatMediaDisplayUrl('  https://example.com/a.jpg  ')).toBe('https://example.com/a.jpg');
  });
});

describe('isAzureBlobUrl', () => {
  it('detects the blob storage host', () => {
    expect(isAzureBlobUrl(AZURE_URL('sync-a'))).toBe(true);
  });

  it('rejects other hosts and invalid input', () => {
    expect(isAzureBlobUrl('https://example.com/a.jpg')).toBe(false);
    expect(isAzureBlobUrl(null)).toBe(false);
  });
});

describe('getChatMediaDisplayUrlSync', () => {
  it('resolves a non-Azure url synchronously', () => {
    expect(getChatMediaDisplayUrlSync('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });

  it('returns null for an unsigned Azure blob url — callers must wait, never use the raw url', () => {
    expect(getChatMediaDisplayUrlSync(AZURE_URL('sync-b'))).toBeNull();
  });

  it('returns the cached signed url synchronously once it has been resolved once', async () => {
    const url = AZURE_URL('sync-c');
    server.use(http.get('*/chat-media/sign', () =>
      HttpResponse.json({ signed_url: `${url}?sig=abc`, expires_in_seconds: 3600 })));

    expect(getChatMediaDisplayUrlSync(url)).toBeNull();
    await resolveChatMediaDisplayUrlAsync(url);
    expect(getChatMediaDisplayUrlSync(url)).toBe(`${url}?sig=abc`);
  });
});

describe('resolveChatMediaDisplayUrlAsync', () => {
  it('dedupes concurrent sign requests for the same url into one network call', async () => {
    const url = AZURE_URL('dedupe');
    let hits = 0;
    server.use(http.get('*/chat-media/sign', () => {
      hits += 1;
      return HttpResponse.json({ signed_url: `${url}?sig=once`, expires_in_seconds: 3600 });
    }));

    const [a, b] = await Promise.all([
      resolveChatMediaDisplayUrlAsync(url),
      resolveChatMediaDisplayUrlAsync(url),
    ]);

    expect(a).toBe(`${url}?sig=once`);
    expect(b).toBe(`${url}?sig=once`);
    expect(hits).toBe(1);
  });

  it('falls back to the raw url if signing fails', async () => {
    const url = AZURE_URL('fail');
    server.use(http.get('*/chat-media/sign', () => HttpResponse.error()));
    await expect(resolveChatMediaDisplayUrlAsync(url)).resolves.toBe(url);
  });
});
