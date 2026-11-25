let hlsCtorPromise;
export function loadHls() {
  if (!hlsCtorPromise) {
    hlsCtorPromise = import('hls.js').then((m) => m.default).catch((error) => {
      hlsCtorPromise = undefined;
      throw error;
    });
  }
  return hlsCtorPromise;
}

const LOCAL_HLS_ORIGINS = ['http://127.0.0.1:8888', 'http://localhost:8888'];
const PROD_HLS_ORIGINS = ['https://live.strug.ca/hls', 'http://live.strug.ca/hls'];
/** Local API origins that serve `/live-session/play/` — rewrite to Vite `/api` proxy in DEV. */
const LOCAL_API_ORIGINS = ['http://127.0.0.1:5000', 'http://localhost:5000'];

/** Rewrite MediaMTX / API playback URLs for local development (Vite proxies). */
export function rewriteLivePlaybackUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (!import.meta.env.DEV) return url;

  for (const origin of LOCAL_API_ORIGINS) {
    if (url.startsWith(`${origin}/live-session/play/`)) {
      return `/api${url.slice(origin.length)}`;
    }
  }
  if (url.startsWith('/live-session/play/')) {
    return `/api${url}`;
  }

  for (const origin of LOCAL_HLS_ORIGINS) {
    if (url.startsWith(origin)) {
      return `/hls${url.slice(origin.length)}`;
    }
  }
  // Stale sessions saved while pointed at production still carry live.strug.ca URLs.
  for (const origin of PROD_HLS_ORIGINS) {
    if (url.startsWith(origin)) {
      return `/hls${url.slice(origin.length)}`;
    }
  }
  return url;
}

export function isSafariOrIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  // Real iPhone/iPad/iPod — not Chrome DevTools spoofing an iPhone UA on Win32/MacIntel.
  // Device-mode still reports the host platform, so hls.js (and quality rungs) keep working there.
  const chromium = /Chrom(e|ium)|CriOS|EdgA?|OPR/.test(ua) || (typeof window !== 'undefined' && !!window.chrome);
  // navigator.platform is deprecated and comes back empty or masked in Lockdown Mode, some
  // in-app WKWebViews and privacy-hardened builds. Falling back to the UA there matters: on a
  // real iPhone hls.js drives an MSE path WebKit does not support, and the video is black.
  // Chromium is still excluded, so DevTools device-mode keeps getting hls.js as intended.
  const realIOS = /iP(hone|od|ad)/.test(platform) || (/iP(hone|od|ad)/.test(ua) && !chromium);
  const iPadOS = platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1 && !chromium;
  const safariDesktop = /Safari\//.test(ua) && !/Chrom(e|ium)|Android|CriOS|FxiOS|EdgA?|OPR/.test(ua) && !/iP(hone|od|ad)/.test(ua);
  return realIOS || iPadOS || safariDesktop;
}



/** Native HLS should receive its source immediately, without waiting for the hls.js chunk. */
export function shouldUseNativeHls(videoEl) {
  return Boolean(videoEl?.canPlayType?.('application/vnd.apple.mpegurl'));
}

export function browserSupportsNativeHls(doc = typeof document !== 'undefined' ? document : null) {
  return Boolean(doc?.createElement) && shouldUseNativeHls(doc.createElement('video'));
}

/** Prefer native HLS on real Safari/iOS (hls.js MSE is a black screen there). Use hls.js elsewhere,
 *  including Chrome's phone emulator, which sends an iPhone UA but is still Chromium.
 *  `Hls` is passed in rather than imported so the module stays lazy — callers hand over the
 *  constructor from loadHls(). No constructor means the chunk has not resolved yet, so play native. */
export function shouldUseHlsJs(videoEl, Hls) {
  if (!videoEl || !Hls) return false;
  if (shouldUseNativeHls(videoEl)) return false;
  return Hls.isSupported();
}

/** Live-tuned hls.js instance (low latency + size-capped levels). */
export function createLiveHls(Hls, options = {}) {
  return new Hls({
    enableWorker: true,
    lowLatencyMode: true,
    capLevelToPlayerSize: true,
    ...options,
  });
}

/** Build controls from the renditions actually advertised by the manifest. */
export function liveQualityOptions(levels) {
  if (!Array.isArray(levels)) return [];
  return levels.map((level, index) => ({
    index,
    label: Number.isFinite(level?.height) && level.height > 0
      ? `${level.height}p`
      : (level?.name || (Number.isFinite(level?.bitrate) && level.bitrate > 0
        ? `${Math.round(level.bitrate / 1000)} kbps`
        : 'Source')),
  }));
}

export function isHlsPlaybackUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const path = new URL(url, 'https://strug.invalid').pathname;
    return /\.m3u8$/i.test(path) || /\/live-session\/play\/[^/]+\/?$/i.test(path);
  } catch {
    return false;
  }
}
