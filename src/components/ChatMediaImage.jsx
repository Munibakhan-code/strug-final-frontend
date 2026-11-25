import React, { useLayoutEffect, useRef, useState } from 'react';
import { useChatMediaUrl } from '../hooks/useChatMediaUrl.js';

export function ChatMediaImage({ url, alt = 'Photo', onClick, onLoad, onFailed }) {
  const displayUrl = useChatMediaUrl(url);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef(null);

  useLayoutEffect(() => {
    if (!displayUrl) {
      setLoading(true);
      setFailed(false);
      return;
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setLoading(false);
      setFailed(false);
      onLoad?.();
    } else if (el && el.complete) {
      setLoading(false);
      setFailed(true);
      onFailed?.();
    } else {
      setLoading(true);
      setFailed(false);
    }
  }, [url, displayUrl, onLoad, onFailed]);

  if (!url) return null;

  if (failed) {
    return (
      <button
        type="button"
        onClick={() => {
          onClick?.(url);
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          minWidth: 140,
          padding: '16px 14px',
          // Neutral fallback card (rule 1), same role as ChatMediaFile's attachment card —
          // this is UI chrome for a failed load, not the image surface itself.
          background: 'var(--color-surface-raised)',
          border: '1px dashed var(--color-border)',
          borderRadius: 12,
          cursor: 'pointer',
        }}
      >
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" fill="#93c5fd" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#93c5fd', fontWeight: 600 }}>
          View photo
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        lineHeight: 0,
        maxWidth: '100%',
        minWidth: 120,
        minHeight: 100,
        borderRadius: 12,
        overflow: 'hidden',
        verticalAlign: 'top',
      }}
    >
      {/* Loading scrim + image placeholder bg stay dark regardless of theme (rule 3) — the
          surface underneath is the photo itself, never the page background, same rationale as
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
          }}
        >
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Loading…
          </span>
        </div>
      )}
      <img
        ref={imgRef}
        src={displayUrl}
        alt={alt}
        role="button"
        tabIndex={0}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        onClick={() => onClick?.(url)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick?.(url);
        }}
        onLoad={() => {
          setLoading(false);
          onLoad?.();
        }}
        onError={() => {
          setLoading(false);
          setFailed(true);
          onFailed?.();
        }}
        style={{
          maxWidth: '100%',
          maxHeight: 440,
          width: 'auto',
          height: 'auto',
          borderRadius: 12,
          display: 'block',
          cursor: onClick ? 'pointer' : 'default',
          objectFit: 'contain',
          background: 'rgba(0,0,0,0.15)',
          opacity: loading ? 0.3 : 1,
          transition: 'opacity 0.2s',
        }}
      />
    </div>
  );
}
