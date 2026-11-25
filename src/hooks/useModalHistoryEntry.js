import { useCallback, useEffect, useRef } from 'react';

/**
 * Gives an in-page modal its own browser-history entry.
 *
 * Android/browser Back dismisses the top modal before navigation leaves the page. Explicit
 * dismissals consume the same entry, so the user never needs a second, apparently empty Back.
 */
export function useModalHistoryEntry(open, onClose, { key = 'modal', canClose = true } = {}) {
  const markerRef = useRef(null);
  const closeRef = useRef(onClose);
  const canCloseRef = useRef(canClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { canCloseRef.current = canClose; }, [canClose]);

  useEffect(() => {
    const onPopState = () => {
      const marker = markerRef.current;
      if (!marker) return;
      if (!canCloseRef.current) {
        window.history.pushState({ ...(window.history.state ?? {}), __strugModal: marker }, '', window.location.href);
        return;
      }
      markerRef.current = null;
      // A dirty form can defer dismissal while asking the user to save/discard.
      // Keep its history entry so another Back cannot navigate away underneath it.
      if (closeRef.current?.() === false) {
        markerRef.current = marker;
        window.history.pushState({ ...(window.history.state ?? {}), __strugModal: marker }, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (open && !markerRef.current) {
      const marker = `${key}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      markerRef.current = marker;
      window.history.pushState({ ...(window.history.state ?? {}), __strugModal: marker }, '', window.location.href);
      return;
    }

    // A successful action may close its modal directly. Consume its same-URL history entry without
    // invoking onClose again when the resulting popstate arrives.
    if (!open && markerRef.current) {
      const marker = markerRef.current;
      markerRef.current = null;
      if (window.history.state?.__strugModal === marker) window.history.back();
    }
  }, [open, key]);

  return useCallback((force = false) => {
    if (!force && !canCloseRef.current) return false;
    const marker = markerRef.current;
    if (marker && window.history.state?.__strugModal === marker) {
      window.history.back();
    } else {
      markerRef.current = null;
      closeRef.current?.();
    }
    return true;
  }, []);
}
