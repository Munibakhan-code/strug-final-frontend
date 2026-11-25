import React, { useState } from 'react';
import { useChatMediaUrl } from '../hooks/useChatMediaUrl.js';

export function ChatMediaVideo({ url, onLoad, poster }) {
  const displayUrl = useChatMediaUrl(url);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  if (!url) return null;

  if (failed) {
    return (
      <a
        href={displayUrl || url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 14px',
          borderRadius: 12,
          // Neutral fallback card (rule 1), same role as ChatMediaFile's attachment card —
          // this is UI chrome for a failed load, not the video surface itself.
          background: 'var(--color-surface-raised)',
          border: '1px dashed var(--color-border)',
          color: '#93c5fd',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Open video
      </a>
    );
  }

  return (
    <div style={{ position: 'relative', lineHeight: 0, maxWidth: 'min(72vw, 320px)' }}>
      {/* Loading scrim + video backdrop stay dark regardless of theme (rule 3) — the surface
          underneath is the video frame itself, never the page background, same rationale as
          Feed.jsx's StoryViewer. */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 12,
            minHeight: 120,
            zIndex: 1,
          }}
        >
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Loading video…
          </span>
        </div>
      )}
      <video
        src={displayUrl}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        onLoadedData={() => {
          setLoading(false);
          onLoad?.();
        }}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        style={{
          width: '100%',
          maxHeight: 340,
          borderRadius: 12,
          display: 'block',
          background: '#000',
          opacity: loading ? 0.35 : 1,
        }}
      />
    </div>
  );
}
