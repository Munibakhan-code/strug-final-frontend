import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

// A tap on mobile focuses the button before its onClick fires, which made onFocus
// pop this tooltip open at the same time as the menu the tap was opening — the
// fixed-position tooltip then rendered clipped/overlapping near the screen edge.
// Track whether the most recent focus came from a pointer (tap/click) vs the
// keyboard so we only auto-show on real keyboard navigation.
let lastInteractionWasPointer = false;
if (typeof window !== "undefined" && !window.__struggTooltipPointerTracking) {
  window.__struggTooltipPointerTracking = true;
  document.addEventListener("pointerdown", () => { lastInteractionWasPointer = true; }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Tab") lastInteractionWasPointer = false; }, true);
}

export function Tooltip({ text, shortcut, placement = "top", delay = 80, children, disabled }) {
  const [coords, setCoords] = useState(null);
  const anchorRef = useRef(null);
  const bubbleRef = useRef(null);
  const timerRef = useRef(null);
  const tooltipId = React.useId();

  const compute = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const vh = window.innerHeight;
    let p = placement;
    if (p === "top" && r.top < 44) p = "bottom";
    else if (p === "bottom" && vh - r.bottom < 44) p = "top";
    else if (p === "right" && window.innerWidth - r.right < 170) p = "left";
    else if (p === "left" && r.left < 170) p = "right";
    let top, left, tx;
    if (p === "top") { top = r.top - gap; left = r.left + r.width / 2; tx = "translate(-50%, -100%)"; }
    else if (p === "bottom") { top = r.bottom + gap; left = r.left + r.width / 2; tx = "translate(-50%, 0)"; }
    else if (p === "left") { top = r.top + r.height / 2; left = r.left - gap; tx = "translate(-100%, -50%)"; }
    else { top = r.top + r.height / 2; left = r.right + gap; tx = "translate(0, -50%)"; }
    setCoords({ top, left, tx });
  };
  const open = ({ requireHover = false } = {}) => {
    if (disabled || !text) return;
    // Hover tooltips don't make sense on a touch-only device — there's no hover to
    // discover them with. This only gates the mouseenter path: keyboard focus should
    // still show the tooltip regardless of hover capability (accessibility).
    if (requireHover) {
      const hoverCapable = typeof window === "undefined" || !window.matchMedia
        ? true
        : window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      if (!hoverCapable) return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(compute, delay);
  };
  const close = () => { clearTimeout(timerRef.current); setCoords(null); };
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // The width used to center the bubble isn't known until it's actually rendered,
  // so a centered tooltip anchored near a screen edge on mobile could render partly
  // off-screen (text clipped by the viewport). Nudge it back in after measuring.
  useLayoutEffect(() => {
    if (!coords) return;
    const el = bubbleRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    let deltaX = 0;
    if (rect.left < margin) deltaX = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) deltaX = (window.innerWidth - margin) - rect.right;
    let deltaY = 0;
    if (rect.top < margin) deltaY = margin - rect.top;
    else if (rect.bottom > window.innerHeight - margin) deltaY = (window.innerHeight - margin) - rect.bottom;
    if (deltaX || deltaY) {
      el.style.transform = `${coords.tx} translate(${deltaX}px, ${deltaY}px)`;
    }
  }, [coords]);

  const child = React.Children.only(children);
  const existingDescribedBy = child.props["aria-describedby"];
  const describedBy = coords
    ? [existingDescribedBy, tooltipId].filter(Boolean).join(" ")
    : existingDescribedBy;
  const trigger = React.cloneElement(child, {
    ref: (node) => {
      anchorRef.current = node;
      const r = child.ref;
      if (typeof r === "function") r(node);
      else if (r) r.current = node;
    },
    onMouseEnter: (e) => { open({ requireHover: true }); child.props.onMouseEnter?.(e); },
    onMouseLeave: (e) => { close(); child.props.onMouseLeave?.(e); },
    onFocus: (e) => { if (!lastInteractionWasPointer) open(); child.props.onFocus?.(e); },
    onBlur: (e) => { close(); child.props.onBlur?.(e); },
    "aria-describedby": describedBy || undefined,
  });

  return (
    <>
      {trigger}
      {coords && createPortal(
        <div ref={bubbleRef} id={tooltipId} role="tooltip" style={{
          position: "fixed", top: coords.top, left: coords.left, transform: coords.tx,
          zIndex: 10000, pointerEvents: "none", display: "flex", alignItems: "center", gap: 7,
          whiteSpace: "nowrap", background: "rgba(20,20,28,0.72)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "6px 12px",
          boxShadow: "0 8px 26px rgba(0,0,0,0.5)", fontFamily: "'DM Sans', sans-serif",
          fontSize: 12.5, fontWeight: 600, color: "#fff", letterSpacing: "0.01em",
        }}>
          {text}
          {shortcut && <span style={{ padding: "1px 6px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.22)" }}>{shortcut}</span>}
        </div>,
        document.body
      )}
    </>
  );
}

export default Tooltip;
