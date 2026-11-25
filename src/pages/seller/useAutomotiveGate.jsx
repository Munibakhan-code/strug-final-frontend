import React from "react";
import { getSellerPortalStatus } from "../../api/analytics";
import { createServiceProviderProfile } from "../../api/medical";
import { getUser } from "../../store/auth.js";
import i18n from "../../i18n/index.js";

function sdCommon(key, opts) {
  return i18n.t(`sellerDash.common.${key}`, opts);
}

// Automotive's real registration record lives in a seller-portal-backed table
// (see GET /seller-portals/me/status, service_type "sd-automotive") rather than
// a persisted user flag — "is_mechanic" isn't a real DB column, so checking it
// alone would silently revert to false on every token refresh/reload even though
// the user already has a real appointment_service_providers row. Mirrors the
// portalKey branch of the shared useProviderGate (src/pages/SellerDashboards.jsx)
// that this hook was split out of.
const FLAG_KEY = "is_mechanic";
const PORTAL_KEY = "sd-automotive";

export function useAutomotiveGate({ color = "#f97316" } = {}) {
  const [status, setStatus] = React.useState("checking");
  const [profileChecked, setProfileChecked] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getSellerPortalStatus();
        if (cancelled) return;
        if (res?.data?.statuses?.[PORTAL_KEY]) {
          setStatus("active");
        } else {
          setStatus(getUser()?.[FLAG_KEY] === true ? "active" : "none");
        }
      } catch {
        if (!cancelled) setStatus(getUser()?.[FLAG_KEY] === true ? "active" : "none");
      } finally {
        if (!cancelled) setProfileChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "active") return null;

  if (!profileChecked || status === "checking") {
    return (
      <div className="bg-bg" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  async function handleApply() {
    setLoading(true);
    const u = getUser();
    const uid = u?.user_id ?? u?.id;
    try {
      await createServiceProviderProfile({
        service_provider_user_id: uid,
        company_name: u?.name || u?.username || "My Business",
        service_type: PORTAL_KEY,
      });
    } catch {
      // Row may already exist (race with another tab) — the portal-status recheck
      // on next load is authoritative either way, so unlock optimistically now.
    }
    setStatus("active");
    setLoading(false);
  }

  const title = sdCommon("becomeMechanic");
  const description = sdCommon("mechanicGateDesc");
  const applyLabel = sdCommon("applyAsProvider");
  const icon = (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 6.34L4.93 4.93" />
    </svg>
  );
  const perks = [
    sdCommon("gatePerkDashboard", { defaultValue: "Your own dashboard for listings, orders, and payouts" }),
    sdCommon("gatePerkPayouts", { defaultValue: "Track performance and get paid" }),
    sdCommon("gatePerkInstant", { defaultValue: "Instant approval, no waiting" }),
  ];

  const sparkPts = [[0, 72], [30, 68], [60, 62], [90, 55], [120, 60], [150, 44], [180, 38], [210, 46], [240, 28], [270, 20], [300, 10]];
  const sparkD = sparkPts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const fillD = `${sparkD} L300,80 L0,80 Z`;

  const previewStats = [
    { label: "Views", value: "2.4K", delta: "+18%", c: color },
    { label: "Watch Time", value: "143h", delta: "+9%", c: "#22c55e" },
    { label: "Subscribers", value: "84", delta: "+5", c: "#a78bfa" },
    { label: "Revenue", value: "$312", delta: "+22%", c: "#f59e0b" },
  ];
  const previewRows = [
    { title: "Top post · Aug", v: "1.2K", c: "342" },
    { title: "Second post", v: "890", c: "201" },
    { title: "Third post", v: "521", c: "98" },
  ];

  return (
    <div className="bg-bg" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <div className="border border-border" style={{ width: "min(940px, 100%)", display: "flex", gap: 0, borderRadius: 24, overflow: "hidden", boxShadow: "0 32px 80px -24px var(--color-shadow)", animation: "fadeUp 0.4s ease both" }}>

        {/* LEFT: CTA panel */}
        <div style={{ flex: "0 0 400px", minWidth: 0, background: "linear-gradient(160deg, var(--color-surface) 0%, var(--color-bg) 100%)", padding: "44px 40px 40px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -80, left: -60, width: 300, height: 220, borderRadius: "50%", background: `radial-gradient(circle, ${color}2a, transparent 70%)`, pointerEvents: "none" }} />

          <div style={{ position: "relative", width: 64, height: 64, borderRadius: 18, background: `${color}1f`, border: `1px solid ${color}55`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 28px -8px ${color}66`, marginBottom: 24 }}>
            {icon}
          </div>

          <div style={{ position: "relative" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: color, marginBottom: 8 }}>Provider Programme</p>
            <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: 1.05, marginBottom: 14 }}>{title}</h2>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, lineHeight: 1.7, marginBottom: 28 }}>
              {description}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 32 }}>
              {perks.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ marginTop: 1, width: 20, height: 20, flexShrink: 0, borderRadius: "50%", background: `${color}1f`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }}>{b}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleApply}
              disabled={loading}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={{ width: "100%", padding: "14px 28px", background: color, border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1, transform: hover && !loading ? "translateY(-2px)" : "none", boxShadow: hover && !loading ? `0 14px 30px -8px ${color}aa` : `0 6px 18px -8px ${color}66`, transition: "transform 0.2s, box-shadow 0.25s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {loading ? sdCommon("registering") : applyLabel}
              {!loading && <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>}
            </button>
            <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, marginTop: 12, textAlign: "center" }}>
              {sdCommon("gateFreeNote", { defaultValue: "Free to join · no commitment" })}
            </p>
          </div>
        </div>

        {/* RIGHT: dashboard preview panel */}
        <div className="bg-bg" style={{ flex: 1, minWidth: 0, padding: "28px 28px 24px", display: "flex", flexDirection: "column", gap: 20, position: "relative", overflow: "hidden" }}>
          <div className="bg-surface-raised border border-border" style={{ position: "absolute", top: 16, right: 16, borderRadius: 8, padding: "3px 10px", backdropFilter: "blur(6px)", zIndex: 2 }}>
            <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Dashboard preview</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {previewStats.map((s, i) => (
              <div key={i} className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "14px 14px 12px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${s.c}88, transparent)` }} />
                <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, marginBottom: 6, fontWeight: 500 }}>{s.label}</p>
                <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, lineHeight: 1, marginBottom: 4 }}>{s.value}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: s.c, fontWeight: 600 }}>{s.delta}</p>
              </div>
            ))}
          </div>

          <div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 14, padding: "16px 18px 12px", flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>Performance over time</p>
              <div style={{ display: "flex", gap: 6 }}>
                {["Views", "Likes", "Subs"].map((l, i) => (
                  <span key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: i === 0 ? color : "var(--color-text-muted)", fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: i === 0 ? `${color}18` : "transparent", border: i === 0 ? `1px solid ${color}33` : "1px solid transparent" }}>{l}</span>
                ))}
              </div>
            </div>
            <svg viewBox="0 0 300 80" preserveAspectRatio="none" style={{ width: "100%", height: 80, display: "block" }}>
              <defs>
                <linearGradient id={`gGate${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={fillD} fill={`url(#gGate${color.replace("#", "")})`} />
              <path d={sparkD} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 14, padding: "14px 16px" }}>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Top performing</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {previewRows.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 22, borderRadius: 5, background: `${color}${i === 0 ? "33" : "18"}`, flexShrink: 0 }} />
                  <span className="text-text-secondary" style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: color, fontWeight: 600 }}>{r.v}</span>
                  <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{r.c}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, var(--color-bg) 0%, transparent 14%, transparent 86%, var(--color-bg) 100%)", pointerEvents: "none" }} />
        </div>

      </div>
    </div>
  );
}
