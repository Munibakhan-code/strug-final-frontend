// src/components/modalKit.jsx — shared glass surface + open/close transition for the
// app's hand-rolled (non-framer) modals: ConfirmDialog, CancelJobDialog, ReportModal,
// PriceChangeModal, ImageCropModal. Each of those used to pop in with a plain fade and
// vanish instantly on close (no exit animation) against a flat, opaque panel. This gives
// them all the same frosted-glass backdrop/panel and a matched fade+pop in both directions
// without duplicating the same style object five times.
import { useCallback, useEffect, useRef, useState } from "react";

// Must match the OUT keyframe durations below — the caller's real close handler (which
// unmounts the dialog) fires after this, so a mismatch either cuts the animation short or
// leaves a frozen frame on screen.
export const EXIT_MS = 190;

const KEYFRAMES = `
@keyframes glassBackdropIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes glassBackdropOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes glassPanelIn {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes glassPanelOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(6px) scale(0.96); }
}
`;

let injected = false;
function useGlassKeyframes() {
  useEffect(() => {
    if (injected || typeof document === "undefined") return;
    injected = true;
    const el = document.createElement("style");
    el.setAttribute("data-modal-kit", "");
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
  }, []);
}

/**
 * Defers a dialog's real dismiss/confirm handler by EXIT_MS so the panel can play an exit
 * animation instead of vanishing the instant the user clicks Cancel/Confirm/backdrop/Escape.
 * The caller keeps mounting the dialog off its own `open`/conditional-render state as before —
 * this only smooths the closing edge, since that state doesn't flip until `after()` runs.
 *
 *   const { closing, requestClose } = useClosingTransition();
 *   <button onClick={() => requestClose(() => onCancel?.())}>Cancel</button>
 *   style={glassPanelStyle(closing, { maxWidth: 420 })}
 */
export function useClosingTransition() {
  useGlassKeyframes();
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const requestClose = useCallback((after) => {
    setClosing((already) => {
      if (already) return already; // a second trigger mid-exit must not double-fire
      timerRef.current = setTimeout(() => {
        setClosing(false);
        after?.();
      }, EXIT_MS);
      return true;
    });
  }, []);

  return { closing, requestClose };
}

export function glassBackdropStyle(closing, overrides) {
  return {
    position: "fixed",
    inset: 0,
    background: "rgba(8,9,13,0.6)",
    backdropFilter: "blur(10px) saturate(140%)",
    WebkitBackdropFilter: "blur(10px) saturate(140%)",
    animation: closing ? "glassBackdropOut 0.16s ease both" : "glassBackdropIn 0.18s ease both",
    ...overrides,
  };
}

// Panels use the app's existing --color-surface-glass token (the same one the sidebar rail
// and floating chrome use) rather than a hardcoded dark rgba, so they re-theme for light mode
// instead of showing a near-black card on a light background. Pair with GLASS_PANEL_CLASS
// (or at least `border-border`) so the border re-themes too — box-shadow already does via
// var(--color-shadow).
export const GLASS_PANEL_CLASS = "bg-surface-glass border border-border";

export function glassPanelStyle(closing, overrides) {
  return {
    backdropFilter: "blur(24px) saturate(160%)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    boxShadow: "0 24px 70px var(--color-shadow), inset 0 1px 0 rgba(255,255,255,0.06)",
    animation: closing
      ? "glassPanelOut 0.18s cubic-bezier(0.4,0,1,1) both"
      : "glassPanelIn 0.24s cubic-bezier(0.34,1.4,0.64,1) both",
    ...overrides,
  };
}
