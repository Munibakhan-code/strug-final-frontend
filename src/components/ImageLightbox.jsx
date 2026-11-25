import React from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

// Generic full-screen image viewer (bug board #185). Unlike ChatImageLightbox it does NOT
// run chat-media SAS resolution — callers pass already-displayable URLs (booking listing
// photos, storefront images, etc.). Optional prev/next arrows when `images` is provided.
export function ImageLightbox({ url, images, index = 0, onClose, onIndexChange }) {
  const list = Array.isArray(images) && images.length ? images : (url ? [url] : []);
  const [idx, setIdx] = React.useState(index);
  React.useEffect(() => { setIdx(index); }, [index, url]);

  const go = React.useCallback((delta) => {
    if (list.length < 2) return;
    setIdx((prev) => {
      const next = (prev + delta + list.length) % list.length;
      onIndexChange?.(next);
      return next;
    });
  }, [list.length, onIndexChange]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const trapRef = useFocusTrap(list.length > 0);
  if (!list.length) return null;
  const current = list[Math.min(idx, list.length - 1)];

  const navBtn = (side, delta, glyph) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); go(delta); }}
      aria-label={delta < 0 ? 'Previous' : 'Next'}
      style={{ position: 'absolute', [side]: 16, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >{glyph}</button>
  );

  return (
    // Fullscreen lightbox scrim — same treatment as ChatImageLightbox.jsx/Feed.jsx's
    // StoryViewer. Stays dark regardless of theme: the surface underneath is always the
    // photo itself, never the page background, so there is nothing here to theme.
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      tabIndex={-1}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 22, cursor: 'pointer', zIndex: 1 }}
      >×</button>
      {list.length > 1 && navBtn('left', -1, '‹')}
      <img
        src={current}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 'min(94vw, 1100px)', maxHeight: 'min(90vh, 1000px)', borderRadius: 12, objectFit: 'contain' }}
      />
      {list.length > 1 && navBtn('right', 1, '›')}
      {list.length > 1 && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: "'DM Sans', sans-serif", background: 'rgba(0,0,0,0.4)', padding: '4px 12px', borderRadius: 20 }}>
          {idx + 1} / {list.length}
        </div>
      )}
    </div>
  );
}

export default ImageLightbox;
