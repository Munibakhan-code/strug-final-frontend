import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Escape the dashboard's scroll/stacking context. Follow the visual viewport as
// mobile browser chrome or the keyboard changes the space available to the panel.
export default function CreatorModalViewport({ children, style, onClick }) {
  const ref = useRef(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      if (!ref.current) return;
      ref.current.style.height = `${viewport.height}px`;
      ref.current.style.top = `${viewport.offsetTop}px`;
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return createPortal(
    <div ref={ref} onClick={onClick} style={{
      ...style,
      position: 'fixed', inset: '0 0 auto', height: '100dvh', zIndex: 10000,
      boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      paddingTop: 'max(12px, env(safe-area-inset-top))',
      paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      paddingLeft: 'max(12px, env(safe-area-inset-left))',
      paddingRight: 'max(12px, env(safe-area-inset-right))',
    }}>{children}</div>,
    document.body,
  );
}
