// Coordinate native media across page players, portals and the persistent mini-player.
// Capture is required because media play events do not bubble.
export function installMobilePlayback(doc = document, win = window) {
  const isMobile = () => typeof win.matchMedia === 'function'
    ? win.matchMedia('(max-width: 767px), (pointer: coarse)').matches
    : Number(win.innerWidth) < 768 || Number(win.navigator?.maxTouchPoints) > 0;
  const isContent = (el) => el instanceof win.HTMLMediaElement && !el.srcObject;
  const onPlay = (event) => {
    const current = event.target;
    if (!isMobile() || !isContent(current) || current.paused) return;
    for (const other of doc.querySelectorAll('video, audio')) {
      // Live call streams must not be interrupted by content playback.
      if (other !== current && isContent(other)) {
        if (!other.paused) other.pause();
        const replaced = typeof win.CustomEvent === 'function'
          ? new win.CustomEvent('strug:playback-replaced', { bubbles: true })
          : new win.Event('strug:playback-replaced', { bubbles: true });
        other.dispatchEvent(replaced);
      }
    }
  };
  doc.addEventListener('play', onPlay, true);
  return () => doc.removeEventListener('play', onPlay, true);
}
