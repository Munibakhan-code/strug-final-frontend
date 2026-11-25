// One report dialog for every reportable surface (Town Hall posts, videos, profiles).
//
// Previously each surface rolled its own: Town Hall shipped a hardcoded reason against the
// author's PROFILE (so the moderator never learned which post was reported), and the video
// player's dialog looked complete but every button just closed it. Both fed a moderation
// queue that could not be acted on. Keeping this in one place is what stops them drifting
// apart again.
import { useState } from "react";
import { createPortal } from "react-dom";
import { REPORT_REASONS, reportContent } from "../api/social";
import i18n from "../i18n";
import { useClosingTransition, glassBackdropStyle, glassPanelStyle, GLASS_PANEL_CLASS } from "./modalKit.jsx";

export default function ReportModal({ open, onClose, targetType, targetId, title, onSubmitted }) {
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { closing, requestClose } = useClosingTransition();

  if (!open) return null;

  const close = () => requestClose(() => {
    setReason(null); setDetail(""); setError(""); setBusy(false);
    onClose?.();
  });

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true); setError("");
    try {
      await reportContent(targetType, targetId, reason, detail.trim());
      close();
      onSubmitted?.();
    } catch (e) {
      // Keep the dialog open on failure — silently closing would look like it worked.
      setError(e?.response?.data?.message || i18n.t("social.reportFailed", "Could not submit the report. Please try again."));
      setBusy(false);
    }
  };

  return createPortal(
    <div
      onClick={close}
      style={glassBackdropStyle(closing, { zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 })}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || i18n.t("social.reportTitle", "Report content")}
        className={GLASS_PANEL_CLASS}
        style={glassPanelStyle(closing, { borderRadius: 16, padding: 26, width: "min(400px, 100%)", maxHeight: "85vh", overflowY: "auto" })}
      >
        <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, textTransform: "uppercase", margin: "0 0 4px" }}>
          {title || i18n.t("social.reportTitle", "Report content")}
        </h3>
        <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, margin: "0 0 16px" }}>
          {i18n.t("social.reportPrompt", "Tell us what's wrong so a moderator can review it.")}
        </p>

        {REPORT_REASONS.map((r) => {
          const active = reason === r;
          return (
            <button
              key={r}
              onClick={() => setReason(r)}
              aria-pressed={active}
              style={{
                display: "block", width: "100%", padding: "10px 14px", marginBottom: 6,
                background: active ? "rgba(96,165,250,0.16)" : "var(--color-surface-raised)",
                border: `1px solid ${active ? "rgba(96,165,250,0.5)" : "var(--color-border-subtle)"}`,
                borderRadius: 10, color: active ? "#93c5fd" : "var(--color-text-secondary)",
                fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", textAlign: "left",
              }}
            >
              {r}
            </button>
          );
        })}

        {reason === "Other" && (
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={i18n.t("social.reportDetail", "Briefly describe the problem")}
            className="bg-surface-raised border border-border text-text-primary"
            style={{
              width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 10,
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, resize: "vertical", outline: "none",
            }}
          />
        )}

        {error && (
          <div style={{ marginTop: 12, padding: "9px 12px", background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 9, color: "#fb7185", fontSize: 12.5, fontFamily: "'DM Sans', sans-serif" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            onClick={close}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            className="bg-surface-raised border border-border text-text-secondary"
            style={{ flex: 1, padding: "10px 14px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", transition: "transform 0.12s ease, background 0.15s ease" }}
          >
            {i18n.t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={submit}
            disabled={!reason || busy}
            onMouseDown={(e) => reason && !busy && (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{
              flex: 1, padding: "10px 14px",
              background: !reason || busy ? "var(--color-surface-raised)" : "rgba(244,63,94,0.16)",
              border: `1px solid ${!reason || busy ? "var(--color-border-subtle)" : "rgba(244,63,94,0.42)"}`,
              borderRadius: 10, color: !reason || busy ? "var(--color-text-muted)" : "#fb7185",
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
              cursor: !reason || busy ? "not-allowed" : "pointer",
              transition: "transform 0.12s ease, background 0.15s ease",
            }}
          >
            {busy ? i18n.t("common.sending", "Sending…") : i18n.t("social.submitReport", "Submit report")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
