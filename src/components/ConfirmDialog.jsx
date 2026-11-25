import React, { useEffect, useState, useCallback } from "react";
import i18n from "../i18n/index.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useClosingTransition, glassBackdropStyle, glassPanelStyle, GLASS_PANEL_CLASS } from "./modalKit.jsx";

/**
 * Centered, in-app replacement for the native `window.confirm()` / `alert()`
 * dialogs (which the browser anchors to the top of the page). Renders a dark,
 * rounded card in the middle of the viewport — matching the platform's modal
 * styling. Supports a destructive confirm (Cancel + action) and a single-button
 * "notify" mode (`alertOnly`).
 *
 * Props:
 *   open         — whether the dialog is visible
 *   title        — bold heading
 *   message      — supporting copy (string or node)
 *   confirmLabel — primary button text (default "Delete")
 *   cancelLabel  — secondary button text (default "Cancel")
 *   danger       — style the primary button as destructive red (default true)
 *   alertOnly    — show only the primary button (acts as an "OK"/notice)
 *   busy         — disable buttons + show a working state on the primary action
 *   onConfirm    — primary action handler
 *   onCancel     — dismiss handler (overlay click / Cancel / Esc)
 */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  alertOnly = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  // Trap focus inside the dialog while open and restore it to the trigger on close.
  const trapRef = useFocusTrap(open);
  const { closing, requestClose } = useClosingTransition();

  // Esc to dismiss, Enter to confirm — standard dialog affordances.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape" && !busy) requestClose(() => onCancel?.());
      if (e.key === "Enter" && !busy) requestClose(() => onConfirm?.());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel, onConfirm, requestClose]);

  if (!open) return null;

  const accent = danger ? "#ef4444" : "#2563eb";
  const resolvedTitle = title ?? i18n.t("dialog.areYouSure");
  const resolvedConfirm = confirmLabel ?? i18n.t("common.delete");
  const resolvedCancel = cancelLabel ?? i18n.t("common.cancel");

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) requestClose(() => onCancel?.());
      }}
      style={glassBackdropStyle(closing, {
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      })}
    >
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        className={GLASS_PANEL_CLASS}
        style={glassPanelStyle(closing, {
          width: "100%",
          maxWidth: 420,
          borderRadius: 22,
          padding: "34px 30px 28px",
          textAlign: "center",
        })}
      >
        {/* Icon badge */}
        <div
          style={{
            width: 72,
            height: 72,
            margin: "0 auto 18px",
            borderRadius: "50%",
            background: `${accent}1f`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              border: `2px solid ${accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: accent,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 800,
              fontSize: 24,
              lineHeight: 1,
            }}
          >
            i
          </div>
        </div>

        <p
          className="text-text-primary"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: "0.01em",
            margin: "0 0 8px",
          }}
        >
          {resolvedTitle}
        </p>

        {message && (
          <p
            className="text-text-secondary"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              lineHeight: 1.5,
              margin: "0 0 26px",
            }}
          >
            {message}
          </p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: message ? 0 : 26 }}>
          {!alertOnly && (
            <button
              onClick={() => !busy && requestClose(() => onCancel?.())}
              disabled={busy}
              onMouseDown={(e) => !busy && (e.currentTarget.style.transform = "scale(0.97)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              className="border border-border text-text-primary"
              style={{
                flex: 1,
                padding: "13px 0",
                background: "transparent",
                borderRadius: 12,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 15,
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
                transition: "transform 0.12s ease, background 0.15s ease",
              }}
            >
              {resolvedCancel}
            </button>
          )}
          <button
            onClick={() => !busy && requestClose(() => onConfirm?.())}
            disabled={busy}
            onMouseDown={(e) => !busy && (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{
              flex: 1,
              padding: "13px 0",
              background: busy ? `${accent}cc` : accent,
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 15,
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.85 : 1,
              transition: "transform 0.12s ease, opacity 0.15s ease",
            }}
          >
            {busy ? i18n.t("dialog.working") : resolvedConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Promise-based dialog hook — a drop-in, centered replacement for native
 * `window.confirm()` / `alert()`. Returns `[dialogNode, { confirm, notify }]`.
 *
 *   const [dialog, { confirm, notify }] = useDialog();
 *   // …in JSX: {dialog}
 *
 *   if (!(await confirm({ title: "Delete this?", message: "…" }))) return;
 *   notify({ title: "Done", message: "Saved successfully." });
 *
 * `confirm(opts)` resolves to true/false; `notify(opts)` resolves when dismissed.
 */
function useDialog() {
  const [state, setState] = useState(null);

  const close = useCallback((result) => {
    setState((cur) => {
      if (cur?.resolve) cur.resolve(result);
      return null;
    });
  }, []);

  const confirm = useCallback(
    (opts = {}) =>
      new Promise((resolve) => {
        setState({
          alertOnly: false,
          danger: true,
          confirmLabel: i18n.t("common.delete"),
          cancelLabel: i18n.t("common.cancel"),
          title: i18n.t("dialog.areYouSure"),
          ...opts,
          resolve,
        });
      }),
    [],
  );

  const notify = useCallback(
    (opts = {}) =>
      new Promise((resolve) => {
        setState({
          alertOnly: true,
          danger: false,
          confirmLabel: i18n.t("dialog.ok"),
          title: i18n.t("dialog.notice"),
          ...opts,
          resolve,
        });
      }),
    [],
  );

  const node = (
    <ConfirmDialog
      open={!!state}
      title={state?.title}
      message={state?.message}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      danger={state?.danger}
      alertOnly={state?.alertOnly}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return [node, { confirm, notify }];
}

export { ConfirmDialog, useDialog };
export default ConfirmDialog;
