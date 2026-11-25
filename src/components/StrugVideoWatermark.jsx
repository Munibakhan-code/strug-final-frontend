import React from 'react';
import { StrugLogo } from './icons.jsx';

/**
 * YouTube-style corner brand mark for players shown *outside* native Videos.
 * On youtube.com there is no logo watermark; on embeds, the mark is a link back to the watch page.
 *
 * Pass `href` (canonical /v/… URL) to make it clickable. Without href it is decorative only.
 */
export default function StrugVideoWatermark({
  href,
  size = 18,
  opacity = 0.88,
  style,
  className,
  onClick,
}) {
  const clickable = typeof href === 'string' && href.length > 0;
  const commonStyle = {
    position: 'absolute',
    right: 10,
    bottom: 10,
    zIndex: 6,
    pointerEvents: clickable ? 'auto' : 'none',
    opacity,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 8px',
    borderRadius: 6,
    background: 'rgba(0,0,0,0.45)',
    textDecoration: 'none',
    border: 'none',
    cursor: clickable ? 'pointer' : 'default',
    color: '#fff',
    ...style,
  };

  const inner = (
    <>
      <StrugLogo s={size} color="#EC2739" />
      <span
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: Math.max(11, Math.round(size * 0.58)),
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#fff',
          lineHeight: 1,
        }}
      >
        Strug
      </span>
    </>
  );

  if (clickable) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Watch on Strug"
        title="Watch on Strug"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        style={commonStyle}
      >
        {inner}
      </a>
    );
  }

  return (
    <div className={className} aria-hidden="true" style={commonStyle}>
      {inner}
    </div>
  );
}
