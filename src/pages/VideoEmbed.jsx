import { useEffect, useState } from 'react';
import { getVideo } from '../api/videos.js';
import { loadHls, shouldUseHlsJs } from '../utils/livePlayback.js';
import { hlsPlayerConfig } from '../utils/hlsPlayback.js';
import StrugVideoWatermark from '../components/StrugVideoWatermark.jsx';

/**
 * Minimal player for third-party / off-site embedding (YouTube embed pattern).
 * Route: /embed/v/:id — no app chrome. Corner Strug mark links to the full watch page.
 */
function watchPath(v) {
  const num = v?.video_id ?? v?.id;
  const pid = v?.public_id;
  if (!pid) return num != null ? `/v/${num}` : '/videos';
  return v?.slug ? `/v/${pid}-${v.slug}` : `/v/${pid}`;
}

export default function VideoEmbedPage({ videoId }) {
  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [videoEl, setVideoEl] = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setVideo(null);
    if (!videoId) {
      setError('missing');
      return undefined;
    }
    getVideo(videoId)
      .then((raw) => {
        if (!alive) return;
        if (!raw) setError('not_found');
        else setVideo(raw);
      })
      .catch(() => {
        if (alive) setError('not_found');
      });
    return () => { alive = false; };
  }, [videoId]);

  const src = video?.processed_video_url || video?.hls_url || null;
  const watchHref = video
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${watchPath(video)}`
    : '';

  useEffect(() => {
    if (!videoEl || !src) return undefined;
    let cancelled = false;
    let hlsInst = null;

    const playNatively = () => {
      videoEl.src = src;
      videoEl.play?.().catch(() => {});
    };

    if (src.includes('.m3u8')) {
      loadHls().then((Hls) => {
        if (cancelled || !videoEl) return;
        if (!shouldUseHlsJs(videoEl, Hls)) {
          playNatively();
          return;
        }
        hlsInst = new Hls(hlsPlayerConfig({ isMobile: true, startPosition: -1 }));
        hlsInst.loadSource(src);
        hlsInst.attachMedia(videoEl);
        videoEl.play?.().catch(() => {});
      }).catch(() => {
        if (!cancelled) playNatively();
      });
    } else {
      playNatively();
    }

    return () => {
      cancelled = true;
      hlsInst?.destroy();
    };
  }, [videoEl, src]);

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
        This video is unavailable.
      </div>
    );
  }

  if (!video || !src) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#2563eb', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <video
        ref={setVideoEl}
        playsInline
        controls
        controlsList="nodownload"
        poster={video.thumbnail_url || undefined}
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
      {/* YouTube-style: only on embeds — clickable mark opens the full Strug watch page */}
      <StrugVideoWatermark href={watchHref} size={20} style={{ bottom: 48, right: 12 }} />
    </div>
  );
}
