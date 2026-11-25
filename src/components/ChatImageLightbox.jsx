import React from 'react';
import { useChatMediaUrl } from '../hooks/useChatMediaUrl.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

export function ChatImageLightbox({ url, onClose }) {
  // Resolve to the signed URL here too — the caller passes the raw blob URL, and
  // private chat-media blobs 403 without a SAS. Hook runs before the early return.
  const displayUrl = useChatMediaUrl(url);
  const trapRef = useFocusTrap(!!url);
  if (!url) return null;

  return (
    // Fullscreen lightbox scrim — a fixed black backdrop over the photo, same treatment as
    // Feed.jsx's StoryViewer. It stays dark regardless of theme: the surface underneath is
    // always the photo itself, never the page background, so there is nothing here to theme.
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Close control floats over the fixed-dark scrim (never page chrome), so it stays
          light-on-dark regardless of theme too — same reasoning as Messages.jsx's
          message-actions trigger. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.1)',
          color: '#fff',
          fontSize: 22,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
      <img
        src={displayUrl}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(92vw, 900px)',
          maxHeight: 'min(88vh, 900px)',
          borderRadius: 12,
          objectFit: 'contain',
        }}
      />
    </div>
  );
}
