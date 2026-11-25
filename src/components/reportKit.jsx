// src/components/reportKit.jsx — shared chrome for the two report modals.
//
// BugReportModal ("Report a problem") and MyReportsModal ("My reports") are two halves of one
// conversation, so they must look like one thing: same anchor, same panel, same controls. This
// file owns that shared surface so they can't drift apart.
//
// Anchor: on desktop the panel is pinned to the BOTTOM-RIGHT with a consistent 16px gutter and a
// height capped to the viewport, so it never floats mid-air or runs off the bottom of the screen.
// On mobile it's a bottom sheet. Both are scrollable inside, never scrolling the page behind.

import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

export const GUTTER = 16;
export const FIELD_HEIGHT = 46;

// Keyframes are injected once, module-level, so both modals share them without either owning them.
// Every visible surface has a matched IN/OUT pair — the modal fades + pops both when it opens and
// when it closes. The pop uses a gentle back-ease overshoot on the way in (defined in the animation
// shorthand below) and a quick clean recede on the way out, tuned to read as premium, not bouncy.
const KEYFRAMES = `
@keyframes reportPanelIn {
  from { opacity: 0; transform: translateY(8px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes reportPanelOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(6px) scale(0.94); }
}
@keyframes reportSheetIn {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes reportSheetOut {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); }
}
@keyframes reportFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes reportFadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes reportMenuIn {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes reportRowIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

let injected = false;
function useKeyframes() {
  useEffect(() => {
    if (injected || typeof document === "undefined") return;
    injected = true;
    const el = document.createElement("style");
    el.setAttribute("data-report-kit", "");
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
  }, []);
}

export const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--color-surface-raised)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: "12px 13px",
  color: "var(--color-text-primary)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14.5,
  outline: "none",
  transition: "border-color 0.15s, background 0.15s",
};

export const labelStyle = {
  display: "block",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: 7,
  letterSpacing: "0.01em",
};

// How long the exit animation runs. Must match the durations in the OUT animation shorthands
// below — the panel is unmounted after this, so a mismatch either cuts the animation short or
// leaves a frozen frame on screen.
const EXIT_MS = 190;

/**
 * The modal shell: backdrop + anchored panel + header.
 *
 * Fades + pops both IN and OUT. The parent conditionally renders this component, so an exit
 * animation needs the unmount deferred: a close request flips `closing`, which swaps every surface
 * to its OUT animation, and only after EXIT_MS do we call the real onClose (which unmounts us).
 *
 * `children` is a render function `(close) => node`: pass `close` (optionally `close(afterFn)`) to
 * any in-content dismiss button so it animates out too, instead of calling the parent's raw onClose
 * and vanishing instantly. Escape / backdrop / the ✕ all animate for free.
 */
export function ModalShell({ isMobile, onClose, title, headerRight, children, labelledBy = "Dialog", scrollClass = "styled-scrollbar" }) {
  useKeyframes();
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);

  const requestClose = useCallback((after) => {
    setClosing((already) => {
      if (already) return already; // a second trigger mid-exit must not double-fire onClose
      timerRef.current = setTimeout(() => {
        onClose?.();
        if (typeof after === "function") after();
      }, EXIT_MS);
      return true;
    });
  }, [onClose]);

  // Clear the pending unmount timer if we're torn down some other way (route change, parent state).
  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // Trap focus in the panel while open; restore it to the trigger on unmount.
  const trapRef = useFocusTrap(true);

  const backdropAnim = closing ? "reportFadeOut 0.18s ease both" : "reportFadeIn 0.16s ease both";
  const panelAnim = isMobile
    ? (closing ? "reportSheetOut 0.2s cubic-bezier(0.4, 0, 1, 1) both" : "reportSheetIn 0.26s cubic-bezier(0.22, 1, 0.36, 1) both")
    // cubic-bezier(0.34, 1.4, 0.64, 1) is a mild back-ease: it overshoots scale 1 slightly then
    // settles — that overshoot IS the pop. The OUT curve is a plain accelerate, no bounce.
    : (closing ? "reportPanelOut 0.18s cubic-bezier(0.4, 0, 1, 1) both" : "reportPanelIn 0.24s cubic-bezier(0.34, 1.4, 0.64, 1) both");

  const panel = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 210,
        width: "100%",
        maxHeight: "88vh",
        overflowY: "auto",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        borderTop: "1px solid var(--color-border)",
        borderRadius: "20px 20px 0 0",
        padding: "20px 18px calc(24px + env(safe-area-inset-bottom))",
        boxShadow: "0 -12px 40px var(--color-shadow), inset 0 1px 0 rgba(255,255,255,0.06)",
        animation: panelAnim,
      }
    : {
        // Pinned bottom-right with an even gutter on both edges. `maxHeight` is measured from the
        // same gutter at the top, so a tall panel stops short of the viewport edge and scrolls
        // internally rather than being cut off (which is what made it look like it was floating).
        position: "fixed",
        bottom: GUTTER,
        right: GUTTER,
        zIndex: 210,
        width: 384,
        maxWidth: `calc(100vw - ${GUTTER * 2}px)`,
        maxHeight: `calc(100vh - ${GUTTER * 2}px)`,
        overflowY: "auto",
        // The panel pops from its own bottom-right corner rather than its centre, so it reads as
        // emerging from where the trigger lives.
        transformOrigin: "bottom right",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        borderRadius: 18,
        padding: 22,
        boxShadow: "0 24px 64px var(--color-shadow), inset 0 1px 0 rgba(255,255,255,0.06)",
        animation: panelAnim,
      };

  return (
    <>
      <div
        onClick={() => requestClose()}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(8,9,13,0.55)",
          backdropFilter: "blur(8px) saturate(140%)",
          WebkitBackdropFilter: "blur(8px) saturate(140%)",
          zIndex: 209,
          animation: backdropAnim,
        }}
      />
      {/* `styled-scrollbar` re-enables the app's thin custom scrollbar — AppInner hides every
          scrollbar globally (`* { scrollbar-width: none }`), so without opting back in the panel
          scrolls invisibly. The class is a global rule in AppInner's <style>, available anywhere
          in the document. */}
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label={labelledBy} className={`${scrollClass} bg-surface-glass${isMobile ? "" : " border border-border"}`} style={panel}>
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "center", margin: "-4px 0 12px" }}>
            <div className="bg-text-muted" style={{ width: 36, height: 4, borderRadius: 2 }} />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
          <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>
            {title}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {headerRight}
            <button
              onClick={() => requestClose()}
              aria-label="Close"
              style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", padding: 4, display: "inline-flex", lineHeight: 0, transition: "color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
            >
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {typeof children === "function" ? children(requestClose) : children}
      </div>
    </>
  );
}

/**
 * Custom select. The native <select> could not be styled consistently — its dropdown list is drawn
 * by the OS, so the options rendered as a light-mode list on a dark panel (and on Windows ignored
 * the option background entirely). This renders the menu ourselves so it always matches the panel.
 *
 * Keeps native semantics that actually matter: keyboard (↑/↓/Enter/Escape), click-outside to close,
 * aria roles, and focus return to the trigger.
 */
export function CustomSelect({ value, options, onChange, accent = "#2563eb", ariaLabel }) {
  useKeyframes();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(0);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  const selectedIdx = Math.max(0, options.findIndex((o) => o.id === value));
  const selected = options[selectedIdx] ?? options[0];

  useEffect(() => {
    if (!open) return;
    setHover(selectedIdx);
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, selectedIdx]);

  const commit = (idx) => {
    const opt = options[idx];
    if (opt) onChange(opt.id);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHover((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHover((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); commit(hover); }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        style={{
          ...inputStyle,
          height: FIELD_HEIGHT,
          padding: "0 13px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: "pointer",
          textAlign: "left",
          borderColor: open ? `${accent}99` : "var(--color-border)",
          background: open ? "var(--color-border)" : "var(--color-surface-raised)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {selected?.color && (
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: selected.color, flex: "none" }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected?.label}</span>
        </span>
        <svg
          width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flex: "none", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s ease" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="styled-scrollbar bg-surface-raised border border-border"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 30,
            borderRadius: 12,
            padding: 5,
            boxShadow: "0 16px 36px var(--color-shadow)",
            animation: "reportMenuIn 0.14s cubic-bezier(0.22, 1, 0.36, 1) both",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {options.map((o, i) => {
            const isSel = o.id === value;
            const isHover = i === hover;
            return (
              <div
                key={o.id}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setHover(i)}
                onClick={() => commit(i)}
                className={isSel ? "text-text-primary" : "text-text-secondary"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  // isSel/isHover text and background were fixed to `#fff`/rgba(255,255,255,X) —
                  // fine when the dropdown was always dark, but once the panel background themes
                  // (var(--color-surface-raised) can now be near-white in light mode) white-on-white
                  // becomes unreadable. Token pair flips with the panel instead.
                  background: isHover ? "var(--color-border)" : "transparent",
                  transition: "background 0.12s",
                }}
              >
                {o.color && <span style={{ width: 7, height: 7, borderRadius: "50%", background: o.color, flex: "none" }} />}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                {isSel && (
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The public status board — where anyone can see what's been reported and what's shipping. */
export const PUBLIC_BOARD_URL = "https://strug.ca/bug-reports";

export function PublicBoardLink({ accent = "#2563eb" }) {
  return (
    <a
      href={PUBLIC_BOARD_URL}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12.5,
        color: "var(--color-text-secondary)",
        textDecoration: "none",
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
    >
      See the public board
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
    </a>
  );
}
