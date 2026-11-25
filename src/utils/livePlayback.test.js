import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('hls.js', () => ({ default: class { static isSupported() { return true; } } }));

import { browserSupportsNativeHls, isSafariOrIOS, shouldUseHlsJs, shouldUseNativeHls, liveQualityOptions, isHlsPlaybackUrl } from './livePlayback.js';

const IPHONE_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const video = { canPlayType: () => 'maybe' };
// hls.js is a lazy chunk, so callers hand the constructor to the gate rather than it importing one.
const Hls = { isSupported: () => true };

function setNav({ userAgent, platform, maxTouchPoints = 1, chrome = undefined }) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent });
  Object.defineProperty(navigator, 'platform', { configurable: true, value: platform });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints });
  // Real Chrome always exposes window.chrome, including in device mode. Real iOS Safari never
  // does. Leaving it out made the DevTools case indistinguishable from an actual iPhone.
  if (chrome === undefined) delete window.chrome;
  else window.chrome = chrome;
}

const orig = {
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
};

afterEach(() => {
  setNav(orig);
});

describe('liveQualityOptions', () => {
  it('uses only levels present in the parsed manifest', () => {
    expect(liveQualityOptions([{ height: 360 }, { height: 720 }, { bitrate: 1600000 }])).toEqual([
      { index: 0, label: '360p' },
      { index: 1, label: '720p' },
      { index: 2, label: '1600 kbps' },
    ]);
  });

  it('does not invent resolution options for a single source', () => {
    expect(liveQualityOptions([{ height: 0 }])).toEqual([{ index: 0, label: 'Source' }]);
    expect(liveQualityOptions(null)).toEqual([]);
  });
});

describe('isHlsPlaybackUrl', () => {
  it('recognizes playlists and public playback redirects', () => {
    expect(isHlsPlaybackUrl('/live-session/play/play_123')).toBe(true);
    expect(isHlsPlaybackUrl('/api/live-session/play/play_123?token=abc')).toBe(true);
    expect(isHlsPlaybackUrl('https://live.strug.ca/hls/test/index.m3u8#live')).toBe(true);
    expect(isHlsPlaybackUrl('/video/file.mp4')).toBe(false);
    expect(isHlsPlaybackUrl('/video/file.mp4?next=.m3u8')).toBe(false);
  });
});

describe('shouldUseHlsJs', () => {
  it('returns false without a video element', () => {
    expect(shouldUseHlsJs(null, Hls)).toBe(false);
  });

  it('uses hls.js when Chrome DevTools spoofs an iPhone UA on Win32', () => {
    setNav({ userAgent: IPHONE_SAFARI_UA, platform: 'Win32', chrome: {} });
    expect(isSafariOrIOS()).toBe(false);
    expect(shouldUseHlsJs({ canPlayType: () => '' }, Hls)).toBe(true);
  });

  it('uses native HLS on a real iPhone', () => {
    setNav({ userAgent: IPHONE_SAFARI_UA, platform: 'iPhone' });
    expect(isSafariOrIOS()).toBe(true);
    expect(shouldUseNativeHls(video)).toBe(true);
    expect(shouldUseHlsJs(video, Hls)).toBe(false);
  });

  it('still detects a real iPhone when navigator.platform is masked', () => {
    // Lockdown Mode, hardened builds and some in-app WKWebViews report platform as ''.
    // Getting this wrong hands hls.js an MSE path WebKit does not implement: black video.
    setNav({ userAgent: IPHONE_SAFARI_UA, platform: '' });
    expect(isSafariOrIOS()).toBe(true);
    expect(shouldUseHlsJs(video, Hls)).toBe(false);
  });

  it('still uses hls.js on desktop Chrome that cannot play HLS natively', () => {
    const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
    setNav({ userAgent: CHROME_UA, platform: 'Win32', chrome: {} });
    expect(isSafariOrIOS()).toBe(false);
    expect(shouldUseNativeHls({ canPlayType: () => '' })).toBe(false);
    expect(shouldUseHlsJs({ canPlayType: () => '' }, Hls)).toBe(true);
  });

  it('detects native HLS from media capability without relying on user-agent labels', () => {
    expect(browserSupportsNativeHls({ createElement: () => video })).toBe(true);
    expect(browserSupportsNativeHls({ createElement: () => ({ canPlayType: () => '' }) })).toBe(false);
  });
});
