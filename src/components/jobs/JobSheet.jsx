/**
 * JobSheet — portal modal for Jobs seeker/employer.
 * Single scroll surface, body scroll lock, Escape + focus trap.
 * Desktop: centered dialog or right drawer. Mobile: bottom sheet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { JOBS_HEAD } from "./jobsLayout.js";

const EXIT_MS = 200;

const KEYFRAMES = `
@keyframes jobSheetFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes jobSheetFadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes jobSheetDialogIn {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes jobSheetDialogOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(8px) scale(0.98); }
}
@keyframes jobSheetBottomIn {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes jobSheetBottomOut {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); }
}
@keyframes jobSheetDrawerIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes jobSheetDrawerOut {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}
`;

let injected = false;
function useJobSheetKeyframes() {
  useEffect(() => {
    if (injected || typeof document === "undefined") return;
    injected = true;
    const el = document.createElement("style");
    el.setAttribute("data-job-sheet", "");
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
  }, []);
}

/**
 * @param {object} props
 * @param {boolean} props.isMobile
 * @param {() => void} props.onClose
 * @param {string} [props.title]
 * @param {React.ReactNode} [props.headerRight]
 * @param {React.ReactNode} [props.footer] sticky footer (CTAs)
 * @param {'dialog'|'drawer'} [props.variant] dialog=centered; drawer=right on desktop / sheet on mobile
 * @param {number} [props.maxWidth] dialog max width (default 640)
 * @param {string} [props.labelledBy]
 * @param {React.ReactNode | ((close: Function) => React.ReactNode)} props.children
 */
export function JobSheet({
  isMobile,
  onClose,
  title,
  headerRight,
  footer,
  variant = "dialog",
  maxWidth = 640,
  labelledBy = "Jobs dialog",
  children,
}) {
  useJobSheetKeyframes();
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);
  const trapRef = useFocusTrap(true);
  const useDrawer = variant === "drawer" && !isMobile;
  const useSheet = isMobile;

  const requestClose = useCallback((after) => {
    setClosing((already) => {
      if (already) return already;
      timerRef.current = setTimeout(() => {
        onClose?.();
        if (typeof after === "function") after();
      }, EXIT_MS);
      return true;
    });
  }, [onClose]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // Lock page scroll while open (Jobs page + App shell).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const backdropAnim = closing ? "jobSheetFadeOut 0.18s ease both" : "jobSheetFadeIn 0.16s ease both";
  let panelAnim;
  if (useSheet) {
    panelAnim = closing
      ? "jobSheetBottomOut 0.2s cubic-bezier(0.4, 0, 1, 1) both"
      : "jobSheetBottomIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both";
  } else if (useDrawer) {
    panelAnim = closing
      ? "jobSheetDrawerOut 0.2s cubic-bezier(0.4, 0, 1, 1) both"
      : "jobSheetDrawerIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both";
  } else {
    panelAnim = closing
      ? "jobSheetDialogOut 0.18s cubic-bezier(0.4, 0, 1, 1) both"
      : "jobSheetDialogIn 0.24s cubic-bezier(0.22, 1, 0.36, 1) both";
  }

  const panel = useSheet
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 320,
        width: "100%",
        maxHeight: "92vh",
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid var(--color-border)",
        borderRadius: "20px 20px 0 0",
        boxShadow: "0 -16px 48px var(--color-shadow)",
        animation: panelAnim,
        overflow: "hidden",
      }
    : useDrawer
      ? {
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 320,
          width: "min(440px, 100vw)",
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-16px 0 48px var(--color-shadow)",
          animation: panelAnim,
          overflow: "hidden",
        }
      : {
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 320,
          width: `min(${maxWidth}px, calc(100vw - 32px))`,
          maxHeight: "min(88vh, calc(100vh - 32px))",
          display: "flex",
          flexDirection: "column",
          borderRadius: 18,
          border: "1px solid var(--color-border)",
          boxShadow: "0 28px 64px var(--color-shadow)",
          animation: panelAnim,
          overflow: "hidden",
        };

  // Dialog animation uses transform; keep centering via left/top + translate in keyframes alternative:
  // For dialog, animation keyframes override transform — use a wrapper for centering.
  const dialogCentered = !useSheet && !useDrawer;

  const node = (
    <>
      <div
        onClick={() => requestClose()}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(8,9,13,0.58)",
          backdropFilter: "blur(8px) saturate(140%)",
          WebkitBackdropFilter: "blur(8px) saturate(140%)",
          zIndex: 319,
          animation: backdropAnim,
        }}
      />
      {dialogCentered ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 320,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            pointerEvents: "none",
          }}
        >
          <div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label={labelledBy}
            className="styled-scrollbar bg-surface text-text-primary"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...panel,
              position: "relative",
              left: "auto",
              top: "auto",
              transform: "none",
              pointerEvents: "auto",
              width: `min(${maxWidth}px, calc(100vw - 32px))`,
              maxHeight: "min(88vh, calc(100vh - 32px))",
            }}
          >
            <SheetChrome
              isMobile={false}
              title={title}
              headerRight={headerRight}
              onClose={() => requestClose()}
              footer={footer}
            >
              {typeof children === "function" ? children(requestClose) : children}
            </SheetChrome>
          </div>
        </div>
      ) : (
        <div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-label={labelledBy}
          className="styled-scrollbar bg-surface text-text-primary"
          onClick={(e) => e.stopPropagation()}
          style={panel}
        >
          <SheetChrome
            isMobile={useSheet}
            title={title}
            headerRight={headerRight}
            onClose={() => requestClose()}
            footer={footer}
          >
            {typeof children === "function" ? children(requestClose) : children}
          </SheetChrome>
        </div>
      )}
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function SheetChrome({ isMobile, title, headerRight, onClose, footer, children }) {
  return (
    <>
      {isMobile && (
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0", flexShrink: 0 }}>
          <div className="bg-text-muted" style={{ width: 36, height: 4, borderRadius: 2 }} />
        </div>
      )}
      {(title || headerRight) && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            padding: isMobile ? "12px 18px 10px" : "18px 22px 12px",
            flexShrink: 0,
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <p
            className="text-text-primary"
            style={{
              fontFamily: JOBS_HEAD,
              fontWeight: 800,
              fontSize: isMobile ? 17 : 18,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              margin: 0,
              lineHeight: 1.25,
              minWidth: 0,
              flex: 1,
            }}
          >
            {title}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                padding: 6,
                display: "inline-flex",
                lineHeight: 0,
              }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      <div
        className="styled-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: isMobile ? "14px 18px" : "16px 22px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {children}
      </div>
      {footer && (
        <div
          style={{
            flexShrink: 0,
            padding: isMobile ? "12px 18px calc(14px + env(safe-area-inset-bottom))" : "14px 22px 18px",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-surface)",
          }}
        >
          {footer}
        </div>
      )}
    </>
  );
}
