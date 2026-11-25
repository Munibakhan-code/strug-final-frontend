import React from "react";
import { ConciergeIcon } from "./icons.jsx";

const ACCENT = "#f97316";
const FONT = "'DM Sans', sans-serif";

/**
 * Soft cross-link into Event Concierge (or the lightweight Shared Event, `to="event-plan"`)
 * from related verticals (Events, Wedding, Venues, Catering, Floral).
 */
export function ConciergeEntryBanner({ title, body, to = "concierge" }) {
  return (
    <button
      type="button"
      onClick={() => window.__nav?.(to)}
      style={{
        width: "100%",
        maxWidth: 680,
        margin: "0 auto 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 14,
        border: `1px solid ${ACCENT}40`,
        background: `linear-gradient(135deg, ${ACCENT}18 0%, rgba(255,255,255,0.03) 55%)`,
        cursor: "pointer",
        color: "inherit",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${ACCENT}22`,
          color: ACCENT,
        }}
      >
        <ConciergeIcon s={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
          {body}
        </div>
      </div>
      <span
        aria-hidden
        style={{
          fontFamily: FONT,
          fontSize: 18,
          color: ACCENT,
          flexShrink: 0,
          fontWeight: 700,
        }}
      >
        →
      </span>
    </button>
  );
}
