import React, { useEffect, useState, useCallback } from "react";
import i18n from "../i18n/index.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useClosingTransition, glassBackdropStyle, glassPanelStyle, GLASS_PANEL_CLASS } from "./modalKit.jsx";

/**
 * Dialog for cancelling a job with a required reason.
 * Props:
 *   open         — whether the dialog is visible
 *   title        — bold heading
 *   confirmLabel — primary button text (default "Cancel Job")
 *   cancelLabel  — secondary button text (default "Cancel")
 *   busy         — disable buttons + show a working state on the primary action
 *   onConfirm    — primary action handler, receives the reason string
 *   onCancel     — dismiss handler (overlay click / Cancel / Esc)
 */
function CancelJobDialog({
  open,
  title,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}) {
  // Trap focus inside the dialog while open and restore it to the trigger on close.
  const trapRef = useFocusTrap(open);
  const { closing, requestClose } = useClosingTransition();

  const [reason, setReason] = useState("");

  // Reset reason when dialog opens
  useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  // Esc to dismiss, Enter to confirm (if reason not empty) — standard dialog affordances.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape" && !busy) requestClose(() => onCancel?.());
      if (e.key === "Enter" && !busy && reason.trim() !== "") {
        requestClose(() => onConfirm?.(reason));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel, onConfirm, reason, requestClose]);

  if (!open) return null;

  const resolvedTitle = title ?? i18n.t("ondemand.worker.cancelJobTitle");
  const resolvedConfirm = confirmLabel ?? i18n.t("ondemand.worker.cancelJobConfirm");
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
            background: "#ef44441f",
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
              border: "2px solid #ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444",
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

        <p
          className="text-text-secondary"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            lineHeight: 1.5,
            margin: "0 0 26px",
          }}
        >
          {i18n.t("ondemand.worker.cancelJobReasonPrompt")}
        </p>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={i18n.t("ondemand.worker.cancelJobReasonPlaceholder")}
          className="bg-bg border border-border text-text-primary"
          style={{
            width: "100%",
            minHeight: 80,
            padding: "10px 12px",
            borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            resize: "vertical",
          }}
        />

        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: "#fbbf24",
            margin: "12px 0 20px",
          }}
        >
          {i18n.t("ondemand.worker.cancelJobWarning")}
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
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
          <button
            onClick={() => !busy && reason.trim() !== "" && requestClose(() => onConfirm?.(reason))}
            disabled={busy || reason.trim() === ""}
            onMouseDown={(e) => !busy && reason.trim() !== "" && (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{
              flex: 1,
              padding: "13px 0",
              background: busy ? "#ef4444cc" : "#ef4444",
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 15,
              fontWeight: 700,
              cursor: (busy || reason.trim() === "") ? "default" : "pointer",
              opacity: (busy || reason.trim() === "") ? 0.85 : 1,
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

export default CancelJobDialog;