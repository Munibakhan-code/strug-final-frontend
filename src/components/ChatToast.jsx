import React from "react";
import { Avatar } from "./SafeImage.jsx";

export function ChatToast({ toast, onDismiss, onOpen }) {
  if (!toast) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-live="polite"
      aria-atomic="true"
      onClick={() => onOpen(toast)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(toast);
      }}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 200,
        width: "min(340px, calc(100vw - 32px))",
        // Neutral floating-panel chrome (rule 1) — same role as the sidebar rail/floating
        // buttons that use --color-surface-glass, so the gradient re-themes with the app.
        background: "linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 12px 40px var(--color-shadow)",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        cursor: "pointer",
        animation: "chatToastIn 0.22s ease both",
      }}
    >
      {/* Board #457: a purged sender photo used to paint the broken-image icon; Avatar falls back
          to the sender's initial on the same green disc. */}
      <Avatar
        url={toast.pic}
        initials={toast.title?.[0] ?? "M"}
        size={40}
        // The disc stays green under the photo (the img covers it), so a failed photo falls back to
        // the initial on exactly the same green circle rather than an empty transparent one.
        style={{ background: "#059669", fontWeight: 800, fontSize: 16 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            marginBottom: 2,
          }}
        >
          {toast.title}
        </p>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {toast.body}
        </p>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 10,
            color: "#60a5fa",
            marginTop: 6,
          }}
        >
          Tap to open chat
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          color: "var(--color-text-secondary)",
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
