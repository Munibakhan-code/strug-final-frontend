import React, { useEffect, useRef } from "react";
import { hlsPlayerConfig, resumeStartPosition } from "../utils/hlsPlayback.js";
import { loadHls, shouldUseHlsJs, shouldUseNativeHls } from "../utils/livePlayback.js";

// A <video> that can actually play the platform's HLS (.m3u8) sources.
//
// #438 / bug #87: a plain <video src="....m3u8"> only works in Safari, which has native HLS.
// Chrome, Edge and Firefox cannot decode HLS natively — they show a permanent black frame and
// never load. The reel card in Feed.jsx already knew this and used hls.js, but MediaPostModal —
// the view you get when you CLICK a video on Social — did not, so clicking a video was a black
// screen there, which is a big part of "videos on social take a long time to load and play".
//
// Everything else (poster, controls, autoPlay, muted, style, …) passes straight through to the
// underlying <video>, so this is a drop-in replacement.
export default function HlsVideo({ src, startTime = 0, isMobile = false, onVideoEl, ...videoProps }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return undefined;

    const isHls = src.includes(".m3u8");
    let cancelled = false;

    // Native playback: hand the URL to the element and restore the resume position once
    // metadata lands. iOS and Safari MUST come through here — they have native HLS, and
    // driving such an element through hls.js leaves it black and silent.
    const playNatively = () => {
      el.src = src;
      const startPosition = resumeStartPosition(startTime);
      if (startPosition > 0) {
        const seek = () => {
          const t = resumeStartPosition(startTime, el.duration);
          if (t > 0) el.currentTime = t;
        };
        if (el.readyState >= 1) seek();
        else el.addEventListener("loadedmetadata", seek, { once: true });
      }
    };

    if (isHls) {
      if (shouldUseNativeHls(el)) {
        playNatively();
        return () => { cancelled = true; };
      }
      // hls.js is loaded on demand so it stays out of the eager bundle (vendor-hls chunk).
      // shouldUseHlsJs needs the module to ask isSupported(), so the gate can only run once
      // the import resolves — which is why this is not a plain synchronous branch.
      loadHls()
        .then((Hls) => {
          if (cancelled || !el.isConnected) return;
          if (!shouldUseHlsJs(el, Hls)) {
            playNatively();
            return;
          }
          const startPosition = resumeStartPosition(startTime);
          const hls = new Hls(hlsPlayerConfig({ isMobile, startPosition }));
          hlsRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(el);
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else {
              // Unrecoverable: fall back to letting the browser try the URL itself. On Safari
              // that still plays; elsewhere it at least surfaces a real media error instead of
              // hanging on a black frame.
              try { hls.destroy(); } catch { /* noop */ }
              hlsRef.current = null;
              el.src = src;
            }
          });
        })
        .catch(() => {
          // Chunk failed to load (offline, cache miss on a stale deploy). Better to let the
          // browser attempt the manifest than to leave a dead element.
          if (!cancelled && el.isConnected) playNatively();
        });
    } else {
      playNatively();
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch { /* noop */ }
        hlsRef.current = null;
      }
    };
  }, [src, startTime, isMobile]);

  // No src attribute — the effect above owns it (setting both would make the browser fetch the
  // raw manifest itself and race hls.js's MediaSource). onVideoEl (optional) hands the underlying
  // <video> element to the caller so it can seek/play it (used by the global mini-player).
  return <video ref={(el) => { videoRef.current = el; onVideoEl?.(el); }} {...videoProps} />;
}
