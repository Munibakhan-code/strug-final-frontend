import React, { useEffect, useState, useCallback, useId } from "react";
import { useTranslation } from "react-i18next";
import { useViewport } from "../hooks/useViewport.js";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { DemandHeatMap } from "../components/DemandHeatMap.jsx";
import { Skel } from "../components/skeletons.jsx";
import { getUser } from "../store/auth";
import { FolderIcon, StarIcon } from "../components/icons.jsx";
import {
  getMyProvider, saveMyProvider, setProviderActive,
  addProviderCity, removeProviderCity, addProviderCategory, removeProviderCategory,
  getProviderInbox, getProviderPipeline, getProviderProspects, getProviderReviews, getProviderRequest, sendQuote, withdrawQuote,
  getMyAvailability, addAvailability, removeAvailability,
  getQuoteCategories, contactProvider,
} from "../api/quotes.js";
import { decodeHtmlEntities } from "../utils/quoteFormData.js";

const VERTICAL_ACCENT = { insurance: "#0ea5e9", mortgage: "#14b8a6" };
const PROVIDER_TYPES = ["bank", "agent", "broker"];

const card = { background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 16, padding: "18px 20px", color: "var(--color-text-primary)" };
const label = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6, fontFamily: "'DM Sans'" };
// colorScheme stays "dark" regardless of theme — matches the established pattern for native
// date/time inputs across the app: browser picker/option chrome isn't retheme'd. This shared
// object also backs the <select> elements below, whose <option> theming instead comes from the
// global `select option { background: var(--color-surface-raised); ... }` fallback in index.css
// (see the removed Bug #81 `opt` object below).
const input = { width: "100%", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "11px 14px", color: "var(--color-text-primary)", fontFamily: "'DM Sans'", fontSize: 14, outline: "none", boxSizing: "border-box", colorScheme: "dark" };
// Bug #81 previously forced a hardcoded dark `opt` style on every <option> (black-on-white on
// Windows/Edge otherwise). That's now handled theme-aware by the global `select option` rule in
// index.css, so the per-option inline style was removed rather than tokenized.
const btn = (a, d) => ({
  padding: "11px 16px",
  background: d ? "var(--color-surface-raised)" : a,
  border: "none",
  borderRadius: 12,
  // Contrast fix: the disabled state's background becomes a near-white raised surface in light
  // theme, so a fixed white label would vanish — use the theme-aware primary text color there.
  // The active/enabled state's background is always the saturated accent color, so fixed white
  // text stays correct in both themes.
  color: d ? "var(--color-text-primary)" : "#fff",
  fontFamily: "'DM Sans'",
  fontSize: 14,
  fontWeight: 700,
  cursor: d ? "not-allowed" : "pointer",
  whiteSpace: "nowrap",
});
const ghostBtn = { padding: "9px 14px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 12, color: "var(--color-text-primary)", fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
const h1 = { fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: "clamp(22px,3vw,34px)", color: "var(--color-text-primary)", letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 };
const pill = (c) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${c}22`, color: c, border: `1px solid ${c}55` });
const chip = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text-primary)" };

function useFmtDate() {
  const { i18n } = useTranslation();
  return (d) => {
    if (!d) return "";
    try { return new Date(d).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }); } catch { return d; }
  };
}

function useProviderMeta(vertical) {
  const { t } = useTranslation();
  const vKey = VERTICAL_ACCENT[vertical] ? vertical : "insurance";
  return {
    title: t(`quotes.provider.${vKey}.title`),
    accent: VERTICAL_ACCENT[vKey],
    back: vKey,
    backLabel: t(`quotes.provider.${vKey}.backLabel`),
  };
}

/* ── Shared shimmer placeholders ─────────────────────────────────────────── */

function InboxSkeleton() {
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 800, margin: "0 auto" }} aria-busy="true" aria-label="Loading inbox">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skel w={`${58 + (i % 3) * 10}%`} h={15} r={6} style={{ marginBottom: 10 }} />
            <Skel w={`${40 + (i % 2) * 12}%`} h={11} r={6} />
          </div>
          <Skel w={64} h={24} r={999} />
        </div>
      ))}
    </div>
  );
}

function AvailabilitySkeleton() {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }} aria-busy="true" aria-label="Loading availability">
      <div style={{ ...card, marginBottom: 16 }}>
        <Skel w={160} h={14} r={6} style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}><Skel w={90} h={11} r={5} style={{ marginBottom: 8 }} /><Skel h={42} r={10} /></div>
          <Skel w={96} h={42} r={12} />
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Skel w={`${45 + i * 8}%`} h={14} r={6} />
            <Skel w={72} h={32} r={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CoverageSkeleton() {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720, margin: "0 auto" }} aria-busy="true" aria-label="Loading coverage">
      <div style={card}>
        <Skel w={140} h={14} r={6} style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {[72, 96, 64, 88].map((w, i) => <Skel key={i} w={w} h={30} r={999} />)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Skel style={{ flex: "1 1 120px" }} h={42} r={10} />
          <Skel style={{ flex: "1 1 100px" }} h={42} r={10} />
          <Skel w={72} h={42} r={12} />
        </div>
      </div>
      <div style={card}>
        <Skel w={160} h={14} r={6} style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[88, 110, 76, 94, 102, 70, 120, 84].map((w, i) => <Skel key={i} w={w} h={30} r={999} />)}
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }} aria-busy="true" aria-label="Loading profile">
      <div style={card}>
        <Skel w={180} h={18} r={6} style={{ marginBottom: 8 }} />
        <Skel w="85%" h={12} r={6} style={{ marginBottom: 18 }} />
        <div style={{ display: "grid", gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skel w={100} h={11} r={5} style={{ marginBottom: 8 }} />
              <Skel h={42} r={10} />
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Skel w={80} h={11} r={5} style={{ marginBottom: 8 }} /><Skel h={42} r={10} /></div>
            <div><Skel w={80} h={11} r={5} style={{ marginBottom: 8 }} /><Skel h={42} r={10} /></div>
          </div>
          <Skel w={120} h={42} r={12} />
        </div>
      </div>
    </div>
  );
}

function ProspectsSkeleton({ isMobile }) {
  return (
    <div style={{ animation: "fadeUp 0.25s ease both" }} aria-busy="true" aria-label="Loading prospects">
      <Skel w={220} h={20} r={6} style={{ marginBottom: 8 }} />
      <Skel w={isMobile ? "100%" : 420} h={12} r={6} style={{ marginBottom: 16 }} />
      <div className="skel" style={{ height: isMobile ? 300 : 420, borderRadius: 16, marginBottom: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ ...card, minHeight: 200 }}>
            <Skel w="55%" h={14} r={6} style={{ marginBottom: 8 }} />
            <Skel w="90%" h={11} r={6} style={{ marginBottom: 6 }} />
            <Skel w="70%" h={11} r={6} style={{ marginBottom: 18 }} />
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Skel w={34} h={34} r={17} />
                <div style={{ flex: 1 }}><Skel w="60%" h={9} r={5} style={{ marginBottom: 6 }} /><Skel w="40%" h={8} r={5} /></div>
                <Skel w={64} h={24} r={999} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PageSkeleton({ pad, isMobile }) {
  return (
    <div style={pad} aria-busy="true" aria-label="Loading dashboard">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <Skel w={100} h={36} r={12} />
        <Skel w={110} h={24} r={999} />
      </div>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <Skel w={180} h={28} r={999} style={{ margin: "0 auto 14px" }} />
        <Skel w={isMobile ? 200 : 280} h={32} r={8} style={{ margin: "0 auto" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
        {[72, 88, 100, 84, 70].map((w, i) => <Skel key={i} w={w} h={40} r={12} />)}
      </div>
      <InboxSkeleton />
    </div>
  );
}

export default function QuoteProviderDashboard({ vertical = "insurance", onNavigate }) {
  const { t } = useTranslation();
  const meta = useProviderMeta(vertical);
  const accent = meta.accent;
  const { isMobile } = useViewport();
  const [dialog, { notify, confirm }] = useDialog();
  const me = getUser();

  const [provider, setProvider] = useState(undefined);
  const [tab, setTab] = useState("pipeline");
  const [inboxFocusId, setInboxFocusId] = useState(null);
  const pad = {
    paddingLeft: isMobile ? 14 : 108,
    paddingRight: isMobile ? 14 : 32,
    paddingTop: isMobile ? 14 : 20,
    paddingBottom: 24,
    color: "var(--color-text-primary)",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "100%",
  };

  const loadProvider = useCallback(() => { getMyProvider(vertical).then((p) => setProvider(p || null)).catch(() => setProvider(null)); }, [vertical]);
  useEffect(() => { setProvider(undefined); loadProvider(); }, [loadProvider, vertical]);

  const tabs = [
    ["pipeline", t("quotes.provider.tabs.pipeline", { defaultValue: "Pipeline" })],
    ["inbox", t("quotes.provider.tabs.inbox")],
    ["prospects", t("quotes.provider.tabs.prospects", { defaultValue: "Prospects" })],
    ["reviews", t("quotes.provider.tabs.reviews", { defaultValue: "Reviews" })],
    ["availability", t("quotes.provider.tabs.availability")],
    ["coverage", t("quotes.provider.tabs.coverage", { defaultValue: "Coverage" })],
    ["profile", t("quotes.provider.tabs.profile", { defaultValue: "Profile" })],
  ];

  if (!me) return <div style={pad}><h1 style={h1}>{meta.title}</h1><p className="text-text-secondary">{t("quotes.signInRequired")}</p></div>;

  if (provider === undefined) {
    return <PageSkeleton pad={pad} isMobile={isMobile} />;
  }

  return (
    <div className="scroll-area" style={{ ...pad, flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", background: `radial-gradient(900px 460px at 50% -120px, ${accent}26, transparent 70%)` }}>
      {dialog}
      <style>{`
        .qpd-inbox-card{transition:border-color .15s ease,background .15s ease,transform .12s ease,box-shadow .15s ease}
        .qpd-inbox-card:hover{border-color:var(--accent)!important;background:var(--color-border)!important;transform:translateY(-2px);box-shadow:0 8px 24px -12px var(--accent-glow)}
        .qpd-tabs{display:flex;gap:8px;margin-bottom:20px;justify-content:center;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px 2px 6px;max-width:100%}
        .qpd-tabs::-webkit-scrollbar{display:none}
        .qpd-tabs > button{flex:0 0 auto}
        @media (min-width: 720px){ .qpd-tabs{flex-wrap:wrap} }
        .qpd-pipe{display:flex;gap:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;scrollbar-width:thin}
        .qpd-pipe-col{flex:0 0 min(280px,82vw);display:flex;flex-direction:column;min-height:320px;max-height:min(70vh,640px);border-radius:16px;border:1px solid var(--color-border);background:var(--color-surface-raised)}
        @media (min-width: 1100px){ .qpd-pipe{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:visible} .qpd-pipe-col{flex:none;max-width:none;width:auto} }
        .qpd-pipe-card{transition:transform .12s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease}
        .qpd-pipe-card:hover{transform:translateY(-2px);border-color:var(--accent)!important;background:var(--color-border)!important;box-shadow:0 10px 28px -14px var(--accent-glow)}
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {onNavigate && <button type="button" onClick={() => onNavigate(meta.back)} style={ghostBtn}>← {meta.backLabel}</button>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          {provider && (
            <span style={pill(provider.is_active ? "#16a34a" : "#9ca3af")}>{provider.is_active ? t("quotes.provider.statusActive") : t("quotes.provider.statusPaused")}</span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 20, paddingTop: 4 }}>
        <div style={{ display: "inline-block", padding: "5px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accent, background: `${accent}1f`, border: `1px solid ${accent}55`, fontFamily: "'DM Sans'", marginBottom: 14 }}>
          {vertical === "insurance" ? `🛡️ ${t("quotes.provider.insurance.badge", { defaultValue: "Insurance Dashboard" })}` : `🏠 ${t("quotes.provider.mortgage.badge", { defaultValue: "Mortgage Dashboard" })}`}
        </div>
        {/* Gradient headline blends from the theme's primary text color into the vertical's accent —
            not a --color-shimmer token since this is a static two-stop blend, not an animated sweep. */}
        <h1 style={{ ...h1, margin: 0, backgroundImage: `linear-gradient(100deg, var(--color-text-primary) 30%, ${accent})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{meta.title}</h1>
      </div>

      {provider === null ? (
        <Onboarding vertical={vertical} accent={accent} notify={notify} onDone={loadProvider} />
      ) : (
        <>
          <div className="qpd-tabs" role="tablist" aria-label="Provider dashboard sections">
            {tabs.map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                style={tab === id ? btn(accent) : ghostBtn}
              >
                {lbl}
              </button>
            ))}
          </div>
          {tab === "pipeline" && <Pipeline vertical={vertical} accent={accent} isMobile={isMobile} notify={notify} confirm={confirm} onNavigate={onNavigate} />}
          {tab === "inbox" && (
            <Inbox
              vertical={vertical}
              accent={accent}
              isMobile={isMobile}
              notify={notify}
              confirm={confirm}
              onNavigate={onNavigate}
              focusId={inboxFocusId}
              onFocusConsumed={() => setInboxFocusId(null)}
            />
          )}
          {tab === "prospects" && (
            <Prospects
              vertical={vertical}
              accent={accent}
              isMobile={isMobile}
              t={t}
              onOpenLead={(id) => { setInboxFocusId(id); setTab("inbox"); }}
            />
          )}
          {tab === "reviews" && <Reviews vertical={vertical} accent={accent} isMobile={isMobile} />}
          {tab === "availability" && <Availability vertical={vertical} accent={accent} isMobile={isMobile} notify={notify} confirm={confirm} />}
          {tab === "coverage" && <Coverage vertical={vertical} accent={accent} provider={provider} isMobile={isMobile} notify={notify} confirm={confirm} onChanged={loadProvider} />}
          {tab === "profile" && <Profile vertical={vertical} accent={accent} provider={provider} isMobile={isMobile} notify={notify} onChanged={loadProvider} />}
        </>
      )}
    </div>
  );
}

/*
 * #325 — Prospects tab for insurance/mortgage providers. Live anonymised demand
 * heat-map plus soft lead lists derived from quote activity in the provider's
 * cities/categories (switching shoppers + recently expired / renewal-window deals).
 */
function Prospects({ vertical, accent, isMobile, t, onOpenLead }) {
  const isMortgage = vertical === "mortgage";
  const fmtDate = useFmtDate();
  const [mapReady, setMapReady] = useState(false);
  const [lists, setLists] = useState(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMapReady(true));
    return () => cancelAnimationFrame(id);
  }, [vertical]);

  useEffect(() => {
    setLists(null);
    getProviderProspects(vertical)
      .then((d) => setLists({
        switching: Array.isArray(d?.switching) ? d.switching : [],
        renewing: Array.isArray(d?.renewing) ? d.renewing : [],
      }))
      .catch(() => setLists({ switching: [], renewing: [] }));
  }, [vertical]);

  const signalLabel = (signal) => {
    const map = {
      comparing: t("quotes.provider.prospects.signalComparing", { defaultValue: "Comparing quotes" }),
      your_quote_pending: t("quotes.provider.prospects.signalYours", { defaultValue: "Awaiting customer" }),
      new_shopper: t("quotes.provider.prospects.signalNew", { defaultValue: "New shopper" }),
      expired_search: t("quotes.provider.prospects.signalExpired", { defaultValue: "Search expired" }),
      renewal_window: t("quotes.provider.prospects.signalRenewal", { defaultValue: "Renewal window" }),
    };
    return map[signal] || signal;
  };

  const columns = [
    {
      key: "renewing",
      title: isMortgage ? t("quotes.provider.prospects.renewing", { defaultValue: "Renewing soon" }) : t("quotes.provider.prospects.expiring", { defaultValue: "Policy ending soon" }),
      blurb: isMortgage
        ? t("quotes.provider.prospects.renewingBlurb", { defaultValue: "Homeowners whose term is up for renewal. Reach out before they re-sign." })
        : t("quotes.provider.prospects.expiringBlurb", { defaultValue: "Customers whose cover is about to lapse. Send a quote before they renew elsewhere." }),
      items: lists?.renewing || [],
    },
    {
      key: "switching",
      title: t("quotes.provider.prospects.switching", { defaultValue: "Open to switching" }),
      blurb: t("quotes.provider.prospects.switchingBlurb", { defaultValue: "People actively comparing options who haven't committed yet. Reach them with a competitive offer." }),
      items: lists?.switching || [],
    },
  ];

  if (!mapReady) return <ProspectsSkeleton isMobile={isMobile} />;

  return (
    <div style={{ animation: "fadeUp 0.25s ease both" }}>
      <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(18px, 4vw, 20px)", letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 4px" }}>
        {t("quotes.provider.prospects.heading", { defaultValue: "Prospects near you" })}
      </p>
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans'", fontSize: 13, margin: "0 0 16px", maxWidth: 640, lineHeight: 1.5 }}>
        {t("quotes.provider.prospects.sub", { defaultValue: "Anonymised demand for cover in your area. Individual profiles will appear as we add lead data." })}
      </p>

      <DemandHeatMap vertical={vertical} height={isMobile ? 280 : 420} />

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginTop: 18 }}>
        {columns.map((c) => (
            <div key={c.key} className="border border-border bg-surface-raised" style={{ position: "relative", borderRadius: 16, padding: isMobile ? 14 : 18, overflow: "hidden", minHeight: 200 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                <p className="text-text-primary" style={{ fontFamily: "'DM Sans'", fontWeight: 700, fontSize: 15, margin: 0 }}>{c.title}</p>
                <span style={pill(accent)}>{lists ? c.items.length : "…"}</span>
              </div>
              <p className="text-text-secondary" style={{ fontFamily: "'DM Sans'", fontSize: 12.5, margin: "0 0 14px", lineHeight: 1.5 }}>{c.blurb}</p>

              {lists === null ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="skel" style={{ width: 34, height: 34, borderRadius: "50%" }} />
                      <div style={{ flex: 1 }}>
                        <div className="skel" style={{ width: "55%", height: 9, borderRadius: 5, marginBottom: 6 }} />
                        <div className="skel" style={{ width: "35%", height: 8, borderRadius: 5 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !c.items.length ? (
                <p className="text-text-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
                  {t("quotes.provider.prospects.emptyColumn", { defaultValue: "No leads in this column yet. Keep your coverage cities and categories up to date." })}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                  {c.items.map((item) => (
                    <button
                      key={`${c.key}-${item.quote_request_id}`}
                      type="button"
                      onClick={() => onOpenLead?.(item.quote_request_id)}
                      className="border border-border bg-surface-raised text-text-primary" style={{
                        textAlign: "left",
                        cursor: "pointer",
                        borderRadius: 12,
                        padding: "11px 12px",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.35, wordBreak: "break-word" }}>{item.title || t("quotes.provider.prospects.anonLead", { defaultValue: "Anonymous lead" })}</div>
                        <span style={{ ...pill(accent), flexShrink: 0 }}>{signalLabel(item.signal)}</span>
                      </div>
                      <div className="text-text-secondary" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.4 }}>
                        {item.city}{item.country ? `, ${item.country}` : ""} · {item.category || "—"}
                      </div>
                      <div className="text-text-muted" style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8, fontSize: 11 }}>
                        <span>{fmtDate(item.updated_at || item.created_at)}</span>
                        <span>{t("quotes.quoteCount", { count: item.quote_count || 0, defaultValue: `${item.quote_count || 0} quotes` })}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
        ))}
      </div>
    </div>
  );
}

function ReviewsSkeleton({ isMobile }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }} aria-busy="true" aria-label="Loading reviews">
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[0, 1, 2].map((i) => <Skel key={i} h={72} r={14} />)}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {[0, 1, 2].map((i) => <Skel key={i} h={96} r={14} />)}
      </div>
    </div>
  );
}

function Reviews({ vertical, accent, isMobile }) {
  const { t } = useTranslation();
  const fmtDate = useFmtDate();
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    setData(null);
    getProviderReviews(vertical)
      .then((d) => setData({
        rating: d?.rating ?? null,
        count: Number(d?.count) || 0,
        reviews: Array.isArray(d?.reviews) ? d.reviews : [],
      }))
      .catch(() => setData({ rating: null, count: 0, reviews: [] }));
  }, [vertical]);
  useEffect(() => { load(); }, [load]);

  if (data === null) return <ReviewsSkeleton isMobile={isMobile} />;

  const stars = (n, size = 16) => {
    const filled = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }} aria-label={`${filled} of 5 stars`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{ color: "#f59e0b", opacity: i < filled ? 1 : 0.28, display: "inline-flex" }}>
            <StarIcon s={size} />
          </span>
        ))}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%", animation: "fadeUp 0.25s ease both" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(18px, 4vw, 22px)", letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 4px" }}>
            {t("quotes.provider.reviews.heading", { defaultValue: "Your reviews" })}
          </p>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans'", fontSize: 13, margin: 0, maxWidth: 520, lineHeight: 1.45 }}>
            {t("quotes.provider.reviews.sub", { defaultValue: "Ratings customers leave after a closed deal. These also show on your public quote cards." })}
          </p>
        </div>
        <button type="button" onClick={load} style={ghostBtn}>{t("quotes.provider.reviews.refresh", { defaultValue: "Refresh" })}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ ...card, padding: isMobile ? "12px 14px" : "14px 16px" }}>
          <div className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            {t("quotes.provider.reviews.avgLabel", { defaultValue: "Average rating" })}
          </div>
          <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 28, color: "#f59e0b", lineHeight: 1 }}>
            {data.rating != null ? Number(data.rating).toFixed(1) : "—"}
          </div>
        </div>
        <div style={{ ...card, padding: isMobile ? "12px 14px" : "14px 16px" }}>
          <div className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            {t("quotes.provider.reviews.countLabel", { defaultValue: "Total reviews" })}
          </div>
          <div className="text-text-primary" style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 28, lineHeight: 1 }}>{data.count}</div>
        </div>
        <div style={{ ...card, padding: isMobile ? "12px 14px" : "14px 16px" }}>
          <div className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            {t("quotes.provider.reviews.starsLabel", { defaultValue: "Stars" })}
          </div>
          <div style={{ lineHeight: 1.2 }}>
            {stars(data.rating != null ? data.rating : 0, 20)}
          </div>
        </div>
      </div>

      {!data.reviews.length ? (
        <div style={{ ...card, textAlign: "center", padding: "28px 18px" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("quotes.provider.reviews.emptyTitle", { defaultValue: "No reviews yet" })}</div>
          <p className="text-text-secondary" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, maxWidth: 420, marginInline: "auto" }}>
            {t("quotes.provider.reviews.emptyBody", { defaultValue: "When a customer closes a deal and rates you, their feedback will appear here." })}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {data.reviews.map((r) => (
            <div key={r.quote_review_id} style={{ ...card, padding: isMobile ? "14px" : "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, wordBreak: "break-word" }}>{r.title || r.category || t("quotes.provider.reviews.dealFallback", { defaultValue: "Closed deal" })}</div>
                  <div className="text-text-secondary" style={{ fontSize: 12, marginTop: 4 }}>
                    {[r.city, r.country].filter(Boolean).join(", ") || "—"}
                    {r.category ? ` · ${r.category}` : ""}
                  </div>
                </div>
                <span style={{ ...pill(accent), flexShrink: 0 }}>{fmtDate(r.created_at)}</span>
              </div>
              <div style={{ marginTop: 10 }}>{stars(r.rating, 16)}</div>
              {r.comment ? (
                <p className="text-text-primary" style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.comment}</p>
              ) : (
                <p className="text-text-muted" style={{ margin: "8px 0 0", fontSize: 12.5, fontStyle: "italic" }}>
                  {t("quotes.provider.reviews.noComment", { defaultValue: "No written comment" })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Onboarding({ vertical, accent, notify, onDone }) {
  const { t } = useTranslation();
  const { isMobile } = useViewport();
  const uid = useId();
  const [f, setF] = useState({ provider_type: "broker", business_name: "", contact_email: "", contact_phone: "", license_no: "", country: "Canada", bio: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save() {
    if (!f.business_name.trim()) { notify({ title: t("quotes.provider.onboarding.nameRequiredTitle"), message: t("quotes.provider.onboarding.nameRequiredMessage"), alertOnly: true }); return; }
    setBusy(true);
    try {
      await saveMyProvider({ ...f, vertical });
      notify({ title: t("quotes.provider.onboarding.setupTitle"), message: t("quotes.provider.onboarding.setupMessage"), alertOnly: true });
      onDone();
    } catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); } finally { setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", width: "100%" }}>
      <div style={{ ...card, padding: isMobile ? "16px 14px" : "18px 20px" }}>
        <h2 style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: "clamp(18px, 5vw, 22px)", margin: "0 0 4px", textTransform: "uppercase" }}>{t("quotes.provider.onboarding.title")}</h2>
        <p className="text-text-secondary" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>{t("quotes.provider.onboarding.blurb")}</p>
        <div style={{ display: "grid", gap: 14 }}>
          <div><label style={label} htmlFor={`${uid}-business`}>{t("quotes.provider.onboarding.businessName")}</label><input id={`${uid}-business`} style={input} value={f.business_name} onChange={set("business_name")} /></div>
          <div>
            <label style={label} htmlFor={`${uid}-type`}>{t("quotes.provider.onboarding.providerType")}</label>
            <select id={`${uid}-type`} style={input} value={f.provider_type} onChange={set("provider_type")}>
              {PROVIDER_TYPES.map((type) => <option key={type} value={type}>{t(`quotes.provider.types.${type}`)}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div><label style={label} htmlFor={`${uid}-email`}>{t("quotes.provider.onboarding.contactEmail")}</label><input id={`${uid}-email`} style={input} value={f.contact_email} onChange={set("contact_email")} /></div>
            <div><label style={label} htmlFor={`${uid}-phone`}>{t("quotes.provider.onboarding.contactPhone")}</label><input id={`${uid}-phone`} style={input} value={f.contact_phone} onChange={set("contact_phone")} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div><label style={label} htmlFor={`${uid}-license`}>{t("quotes.provider.onboarding.licenseNo")}</label><input id={`${uid}-license`} style={input} value={f.license_no} onChange={set("license_no")} /></div>
            <div><label style={label} htmlFor={`${uid}-country`}>{t("quotes.provider.onboarding.country")}</label><input id={`${uid}-country`} style={input} value={f.country} onChange={set("country")} /></div>
          </div>
          <div><label style={label} htmlFor={`${uid}-about`}>{t("quotes.provider.onboarding.about")}</label><input id={`${uid}-about`} style={input} value={f.bio} onChange={set("bio")} /></div>
          <button type="button" disabled={busy} onClick={save} style={{ ...btn(accent, busy), width: isMobile ? "100%" : "auto" }}>{busy ? t("quotes.provider.onboarding.saving") : t("quotes.provider.onboarding.register")}</button>
        </div>
      </div>
    </div>
  );
}

function PipelineSkeleton({ isMobile }) {
  return (
    <div aria-busy="true" aria-label="Loading pipeline">
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {[0, 1, 2, 3].map((i) => <Skel key={i} h={64} r={14} />)}
      </div>
      <div className="qpd-pipe">
        {[0, 1, 2, 3].map((col) => (
          <div key={col} className="qpd-pipe-col" style={{ padding: 12 }}>
            <Skel w="55%" h={14} r={6} style={{ marginBottom: 12 }} />
            {[0, 1, 2].map((j) => <Skel key={j} h={88} r={12} style={{ marginBottom: 10 }} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function pipelineStage(r) {
  if (r.status === "deal_closed") return "closed";
  if (r.status === "appointment_set") return "appointment";
  if (r.my_quote) return "quoted";
  return "new";
}

function Pipeline({ vertical, accent, isMobile, notify, confirm, onNavigate }) {
  const { t } = useTranslation();
  const fmtDate = useFmtDate();
  const [items, setItems] = useState(null);
  const [active, setActive] = useState(null);

  const load = useCallback(() => {
    setItems(null);
    getProviderPipeline(vertical)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]));
  }, [vertical]);
  useEffect(() => { load(); }, [load]);

  async function open(id) {
    try { setActive(await getProviderRequest(vertical, id)); } catch { /* */ }
  }

  if (active) {
    return (
      <RequestPanel
        req={active}
        vertical={vertical}
        accent={accent}
        isMobile={isMobile}
        notify={notify}
        confirm={confirm}
        onNavigate={onNavigate}
        onBack={() => { setActive(null); load(); }}
        onChanged={() => open(active.quote_request_id)}
      />
    );
  }

  if (items === null) return <PipelineSkeleton isMobile={isMobile} />;

  const columns = [
    {
      id: "new",
      title: t("quotes.provider.pipeline.new", { defaultValue: "New leads" }),
      hint: t("quotes.provider.pipeline.newHint", { defaultValue: "Awaiting your quote" }),
      color: "#f59e0b",
      items: items.filter((r) => pipelineStage(r) === "new"),
    },
    {
      id: "quoted",
      title: t("quotes.provider.pipeline.quoted", { defaultValue: "Quoted" }),
      hint: t("quotes.provider.pipeline.quotedHint", { defaultValue: "Waiting on the customer" }),
      color: accent,
      items: items.filter((r) => pipelineStage(r) === "quoted"),
    },
    {
      id: "appointment",
      title: t("quotes.provider.pipeline.appointment", { defaultValue: "Appointment" }),
      hint: t("quotes.provider.pipeline.appointmentHint", { defaultValue: "Meeting booked" }),
      color: "#a78bfa",
      items: items.filter((r) => pipelineStage(r) === "appointment"),
    },
    {
      id: "closed",
      title: t("quotes.provider.pipeline.closed", { defaultValue: "Closed" }),
      hint: t("quotes.provider.pipeline.closedHint", { defaultValue: "Won & finished deals" }),
      color: "#22c55e",
      items: items.filter((r) => pipelineStage(r) === "closed"),
    },
  ];

  const total = items.length;
  const won = items.filter((r) => r.is_winner).length;
  const closedN = columns[3].items.length;
  const winPct = closedN > 0 ? Math.round((won / closedN) * 100) : null;

  return (
    <div style={{ animation: "fadeUp 0.25s ease both", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(18px, 4vw, 22px)", letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 4px" }}>
            {t("quotes.provider.pipeline.heading", { defaultValue: "Deal pipeline" })}
          </p>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans'", fontSize: 13, margin: 0, maxWidth: 520, lineHeight: 1.45 }}>
            {t("quotes.provider.pipeline.sub", { defaultValue: "Track every lead from first match to closed deal — like a mini CRM for your quotes." })}
          </p>
        </div>
        <button type="button" onClick={load} style={ghostBtn}>{t("quotes.provider.pipeline.refresh", { defaultValue: "Refresh" })}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { label: t("quotes.provider.pipeline.statTotal", { defaultValue: "In pipeline" }), value: total },
          { label: t("quotes.provider.pipeline.statNew", { defaultValue: "Need quote" }), value: columns[0].items.length, color: "#f59e0b" },
          { label: t("quotes.provider.pipeline.statAppt", { defaultValue: "Appointments" }), value: columns[2].items.length, color: "#a78bfa" },
          { label: t("quotes.provider.pipeline.statWin", { defaultValue: "Win rate" }), value: winPct == null ? "—" : `${winPct}%`, color: "#22c55e" },
        ].map((s) => (
          <div key={s.label} style={{ ...card, padding: isMobile ? "12px 14px" : "14px 16px" }}>
            <div className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 28, color: s.color || "var(--color-text-primary)", lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {!total && (
        <div style={{ ...card, textAlign: "center", padding: "28px 18px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, color: accent }}><FolderIcon s={28} /></div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("quotes.provider.pipeline.emptyTitle", { defaultValue: "Pipeline is empty" })}</div>
          <p className="text-text-secondary" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, maxWidth: 420, marginInline: "auto" }}>
            {t("quotes.provider.pipeline.emptyBody", { defaultValue: "When customers request quotes in your cities and categories, they’ll land in New leads. Send a quote to move them across the board." })}
          </p>
        </div>
      )}

      <div className="qpd-pipe">
        {columns.map((col) => (
          <div key={col.id} className="qpd-pipe-col">
            <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, boxShadow: `0 0 10px ${col.color}88`, flexShrink: 0 }} />
                  <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "'DM Sans'" }}>{col.title}</span>
                </div>
                <div className="text-text-muted" style={{ fontSize: 11, marginTop: 3, paddingLeft: 16 }}>{col.hint}</div>
              </div>
              <span style={{ ...pill(col.color), flexShrink: 0 }}>{col.items.length}</span>
            </div>
            <div style={{ padding: 10, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {!col.items.length && (
                <div className="text-text-muted" style={{ border: "1px dashed var(--color-border)", borderRadius: 12, padding: "18px 12px", textAlign: "center", fontSize: 12 }}>
                  {t("quotes.provider.pipeline.columnEmpty", { defaultValue: "No deals here" })}
                </div>
              )}
              {col.items.map((r) => {
                const amt = r.my_quote?.amount;
                return (
                  <button
                    key={r.quote_request_id}
                    type="button"
                    className="qpd-pipe-card border border-border bg-surface-raised text-text-primary"
                    onClick={() => open(r.quote_request_id)}
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      borderRadius: 12,
                      padding: "12px 12px",
                      width: "100%",
                      boxSizing: "border-box",
                      ["--accent"]: accent,
                      ["--accent-glow"]: `${accent}66`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.35, wordBreak: "break-word" }}>{r.title}</div>
                      {r.is_winner && <span style={pill("#22c55e")}>{t("quotes.provider.pipeline.won", { defaultValue: "Won" })}</span>}
                      {col.id === "closed" && !r.is_winner && <span style={pill("#9ca3af")}>{t("quotes.provider.pipeline.lost", { defaultValue: "Closed" })}</span>}
                    </div>
                    <div className="text-text-secondary" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.4 }}>
                      {r.city} · {r.quote_category?.name || "—"}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <span className="text-text-muted" style={{ fontSize: 11 }}>{fmtDate(r.appointment?.scheduled_at || r.updated_at || r.created_at)}</span>
                      {amt != null ? (
                        <span style={{ fontWeight: 800, fontSize: 13, color: accent }}>CAD {Number(amt).toLocaleString()}</span>
                      ) : col.id === "new" ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>{t("quotes.provider.inbox.new")}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Inbox({ vertical, accent, isMobile, notify, confirm, onNavigate, focusId, onFocusConsumed }) {
  const { t } = useTranslation();
  const fmtDate = useFmtDate();
  const [items, setItems] = useState(null);
  const [active, setActive] = useState(null);

  const load = useCallback(() => {
    setItems(null);
    getProviderInbox(vertical)
      .then((r) => setItems(r || []))
      .catch(() => setItems([]));
  }, [vertical]);
  useEffect(() => { load(); }, [load]);

  async function open(id) {
    try { setActive(await getProviderRequest(vertical, id)); } catch { /* */ }
  }

  useEffect(() => {
    if (!focusId) return;
    open(focusId).finally(() => onFocusConsumed?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  if (active) return <RequestPanel req={active} vertical={vertical} accent={accent} isMobile={isMobile} notify={notify} confirm={confirm} onNavigate={onNavigate} onBack={() => { setActive(null); load(); }} onChanged={() => open(active.quote_request_id)} />;

  if (items === null) return <InboxSkeleton />;

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 800, margin: "0 auto", width: "100%", animation: "fadeUp 0.25s ease both" }}>
      {!items.length && <p className="text-text-secondary" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{t("quotes.provider.inbox.empty")}</p>}
      {items.map((r) => (
        <button
          key={r.quote_request_id}
          type="button"
          className="qpd-inbox-card"
          onClick={() => open(r.quote_request_id)}
          style={{
            ...card,
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
            width: "100%",
            boxSizing: "border-box",
            ["--accent"]: accent,
            ["--accent-glow"]: `${accent}66`,
          }}
        >
          <div style={{ minWidth: 0, width: "100%" }}>
            <div style={{ fontWeight: 700, fontSize: 15, wordBreak: "break-word" }}>{r.title}</div>
            <div className="text-text-secondary" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{r.city} · {r.quote_category?.name} · {fmtDate(r.created_at)}</div>
          </div>
          {r.my_quote ? <span style={pill(accent)}>{t("quotes.provider.inbox.quoted")}</span> : <span style={pill("#f59e0b")}>{t("quotes.provider.inbox.new")}</span>}
        </button>
      ))}
    </div>
  );
}

function RequestPanel({ req, vertical, accent, isMobile, notify, confirm, onNavigate, onBack, onChanged }) {
  const { t } = useTranslation();
  const uid = useId();
  const mine = req.my_quote;
  const isMortgage = vertical === "mortgage" || req.vertical === "mortgage";
  const [amount, setAmount] = useState(mine?.amount ?? "");
  const [note, setNote] = useState(mine?.note ?? "");
  const [validUntil, setValidUntil] = useState(mine?.valid_until ? new Date(mine.valid_until).toISOString().split("T")[0] : "");
  const [term, setTerm] = useState(mine?.details?.term ?? "");
  const [coverage, setCoverage] = useState(mine?.details?.coverage ?? "");
  const [rate, setRate] = useState(mine?.details?.rate ?? "");
  const [amortization, setAmortization] = useState(mine?.details?.amortization_years ?? "");
  const [paymentFrequency, setPaymentFrequency] = useState(mine?.details?.payment_frequency ?? "");
  const [conditions, setConditions] = useState(mine?.details?.conditions ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (amount === "" || Number(amount) < 0) {
      notify({
        title: t("quotes.provider.request.amountRequiredTitle"),
        message: isMortgage
          ? t("quotes.provider.request.mortgageAmountRequiredMessage", { defaultValue: "Enter the quoted monthly payment or loan amount (CAD)." })
          : t("quotes.provider.request.amountRequiredMessage"),
        alertOnly: true,
      });
      return;
    }
    if (isMortgage && rate !== "" && (Number.isNaN(Number(rate)) || Number(rate) < 0)) {
      notify({ title: t("quotes.notify.failedTitle"), message: t("quotes.provider.request.rateInvalid", { defaultValue: "Rate must be a non-negative number." }), alertOnly: true });
      return;
    }
    const details = {};
    if (isMortgage) {
      if (rate !== "") details.rate = String(rate);
      if (term) details.term = term;
      if (amortization) details.amortization_years = String(amortization);
      if (paymentFrequency) details.payment_frequency = paymentFrequency;
      if (conditions) details.conditions = conditions;
    } else {
      if (term) details.term = term;
      if (coverage) details.coverage = coverage;
    }
    setBusy(true);
    try {
      await sendQuote(req.quote_request_id, {
        amount: Number(amount),
        note: note || undefined,
        valid_until: validUntil ? new Date(validUntil).toISOString() : undefined,
        details: Object.keys(details).length ? details : undefined,
      });
      notify({ title: mine ? t("quotes.provider.request.revisedTitle") : t("quotes.provider.request.sentTitle"), message: t("quotes.provider.request.customerNotified"), alertOnly: true });
      onChanged();
    } catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); } finally { setBusy(false); }
  }
  async function onWithdraw() {
    if (!(await confirm({ title: t("quotes.provider.request.withdrawTitle"), message: t("quotes.provider.request.withdrawMessage"), confirmLabel: t("quotes.provider.request.withdrawLabel"), cancelLabel: t("quotes.confirm.keepLabel"), danger: true }))) return;
    try { await withdrawQuote(mine.quote_id); onChanged(); } catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); }
  }
  async function onContact() {
    try { const ch = await contactProvider(req.quote_request_id, ""); if (ch?.channel_id) { window.__openChatChannelId = ch.channel_id; (onNavigate || window.__nav)?.("messages"); } }
    catch (e) { notify({ title: t("quotes.provider.request.chatFailedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); }
  }

  const fd = req.form_data && typeof req.form_data === "object" ? req.form_data : {};
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", width: "100%", animation: "fadeUp 0.2s ease both" }}>
      <button type="button" onClick={onBack} style={{ ...ghostBtn, marginBottom: 16 }}>{t("quotes.provider.inbox.back")}</button>
      <div style={{ ...card, marginBottom: 16, padding: isMobile ? "16px 14px" : "18px 20px" }}>
        <h2 style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: "clamp(18px, 5vw, 22px)", margin: 0, textTransform: "uppercase", wordBreak: "break-word" }}>{req.title}</h2>
        <div className="text-text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{req.city}{req.country ? `, ${req.country}` : ""} · {req.quote_category?.name}</div>
        {!!Object.keys(fd).length && (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            {Object.entries(fd).map(([k, v]) => (
              <div key={k} style={{ fontSize: 13, wordBreak: "break-word" }}><span className="text-text-secondary">{k.replace(/_/g, " ")}: </span><span className="text-text-primary">{v == null || v === "" ? "—" : decodeHtmlEntities(String(v))}</span></div>
            ))}
          </div>
        )}
        {req.credit_number && <div className="text-text-secondary" style={{ marginTop: 10, fontSize: 12 }}>{t("quotes.provider.request.creditRef", { ref: req.credit_number })}</div>}
        <button type="button" onClick={onContact} style={{ ...ghostBtn, marginTop: 14, width: isMobile ? "100%" : "auto" }}>{t("quotes.provider.request.requestMoreInfo")}</button>
      </div>

      <div style={{ ...card, padding: isMobile ? "16px 14px" : "18px 20px" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{mine ? t("quotes.provider.request.reviseHeading") : t("quotes.provider.request.sendHeading")}</div>
        <div style={{ display: "grid", gap: 12 }}>
          {isMortgage ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label} htmlFor={`${uid}-amount`}>{t("quotes.provider.request.mortgageAmountLabel", { defaultValue: "Monthly payment / loan amount (CAD) *" })}</label>
                  <input id={`${uid}-amount`} style={input} type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <label style={label} htmlFor={`${uid}-rate`}>{t("quotes.provider.request.rateLabel", { defaultValue: "Interest rate (%)" })}</label>
                  <input id={`${uid}-rate`} style={input} type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={t("quotes.provider.request.ratePlaceholder", { defaultValue: "e.g. 4.79" })} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label} htmlFor={`${uid}-term`}>{t("quotes.provider.request.mortgageTermLabel", { defaultValue: "Term" })}</label>
                  <input id={`${uid}-term`} style={input} value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("quotes.provider.request.mortgageTermPlaceholder", { defaultValue: "e.g. 5 yr fixed" })} />
                </div>
                <div>
                  <label style={label} htmlFor={`${uid}-amort`}>{t("quotes.provider.request.amortizationLabel", { defaultValue: "Amortization (years)" })}</label>
                  <input id={`${uid}-amort`} style={input} type="number" min="1" max="40" step="1" value={amortization} onChange={(e) => setAmortization(e.target.value)} placeholder="25" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label} htmlFor={`${uid}-freq`}>{t("quotes.provider.request.paymentFrequencyLabel", { defaultValue: "Payment frequency" })}</label>
                  <select id={`${uid}-freq`} style={input} value={paymentFrequency} onChange={(e) => setPaymentFrequency(e.target.value)}>
                    <option value="">{t("quotes.select", { defaultValue: "Select…" })}</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Bi-weekly">Bi-weekly</option>
                    <option value="Accelerated bi-weekly">Accelerated bi-weekly</option>
                    <option value="Weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label style={label} htmlFor={`${uid}-valid`}>{t("quotes.provider.request.validUntil")}</label>
                  <input id={`${uid}-valid`} style={input} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={label} htmlFor={`${uid}-conditions`}>{t("quotes.provider.request.conditionsLabel", { defaultValue: "Conditions" })}</label>
                <input id={`${uid}-conditions`} style={input} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder={t("quotes.provider.request.conditionsPlaceholder", { defaultValue: "e.g. subject to appraisal, income verification" })} />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div><label style={label} htmlFor={`${uid}-amount`}>{t("quotes.provider.request.amountLabel")}</label><input id={`${uid}-amount`} style={input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div><label style={label} htmlFor={`${uid}-valid`}>{t("quotes.provider.request.validUntil")}</label><input id={`${uid}-valid`} style={input} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div><label style={label} htmlFor={`${uid}-term`}>{t("quotes.provider.request.termLabel")}</label><input id={`${uid}-term`} style={input} value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("quotes.provider.request.termPlaceholder")} /></div>
                <div><label style={label} htmlFor={`${uid}-coverage`}>{t("quotes.provider.request.coverageLabel")}</label><input id={`${uid}-coverage`} style={input} value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder={t("quotes.provider.request.coveragePlaceholder")} /></div>
              </div>
            </>
          )}
          <div><label style={label} htmlFor={`${uid}-note`}>{t("quotes.provider.request.noteLabel")}</label><input id={`${uid}-note`} style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("quotes.provider.request.notePlaceholder")} /></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={busy} onClick={submit} style={{ ...btn(accent, busy), flex: isMobile ? "1 1 100%" : "0 0 auto" }}>{busy ? t("quotes.provider.request.sending") : mine ? t("quotes.provider.request.sendRevised") : t("quotes.provider.request.sendQuote")}</button>
            {mine && <button type="button" onClick={onWithdraw} style={{ ...ghostBtn, color: "#f87171", borderColor: "#f8717155", flex: isMobile ? "1 1 100%" : "0 0 auto" }}>{t("quotes.provider.request.withdraw")}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Availability({ vertical, accent, isMobile, notify, confirm }) {
  const { t } = useTranslation();
  const uid = useId();
  const fmtDate = useFmtDate();
  const [slots, setSlots] = useState(null);
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setSlots(null);
    getMyAvailability(vertical)
      .then((s) => setSlots(s || []))
      .catch(() => setSlots([]));
  }, [vertical]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!start) { notify({ title: t("quotes.notify.pickTimeTitle"), message: t("quotes.notify.pickTimeMessage"), alertOnly: true }); return; }
    setBusy(true);
    try { await addAvailability(vertical, new Date(start).toISOString()); setStart(""); load(); }
    catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); } finally { setBusy(false); }
  }
  async function del(s) {
    if (s.is_booked) { notify({ title: t("quotes.provider.availability.bookedTitle"), message: t("quotes.provider.availability.bookedMessage"), alertOnly: true }); return; }
    if (!(await confirm({ title: t("quotes.provider.availability.removeSlotTitle"), message: fmtDate(s.slot_start), confirmLabel: t("quotes.provider.availability.removeLabel"), cancelLabel: t("quotes.confirm.keepLabel"), danger: true }))) return;
    try { await removeAvailability(vertical, s.quote_provider_availability_id); load(); } catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); }
  }

  if (slots === null) return <AvailabilitySkeleton />;

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", width: "100%", animation: "fadeUp 0.25s ease both" }}>
      <div style={{ ...card, marginBottom: 16, padding: isMobile ? "16px 14px" : "18px 20px" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{t("quotes.provider.availability.addSlotTitle")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}><label style={label} htmlFor={`${uid}-start`}>{t("quotes.provider.availability.startTime")}</label><input id={`${uid}-start`} style={input} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <button type="button" disabled={busy} onClick={add} style={{ ...btn(accent, busy), width: isMobile ? "100%" : "auto" }}>{t("quotes.provider.availability.addSlot")}</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {!slots.length && <p className="text-text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{t("quotes.provider.availability.empty")}</p>}
        {slots.map((s) => (
          <div key={s.quote_provider_availability_id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: isMobile ? "14px" : "18px 20px" }}>
            <span style={{ fontSize: 14, wordBreak: "break-word" }}>{fmtDate(s.slot_start)}</span>
            {s.is_booked ? <span style={pill(accent)}>{t("quotes.provider.availability.booked")}</span> : <button type="button" onClick={() => del(s)} style={{ ...ghostBtn, color: "#f87171", borderColor: "#f8717155" }}>{t("quotes.provider.availability.removeLabel")}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Coverage({ vertical, accent, provider, isMobile, notify, confirm, onChanged }) {
  const { t } = useTranslation();
  const [cities, setCities] = useState(provider.cities || []);
  const [cats, setCats] = useState(provider.categories || []);
  const [allLeaves, setAllLeaves] = useState(null);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState(provider.country || "Canada");

  useEffect(() => {
    setCities(provider.cities || []);
    setCats(provider.categories || []);
    setCountry(provider.country || "Canada");
  }, [provider]);

  useEffect(() => {
    setAllLeaves(null);
    getQuoteCategories(vertical)
      .then((m) => setAllLeaves((m || []).flatMap((x) => x.children || [])))
      .catch(() => setAllLeaves([]));
  }, [vertical]);

  async function addCity() {
    if (!city.trim()) return;
    try { const r = await addProviderCity(vertical, city.trim(), country.trim()); setCities(r.cities || []); setCity(""); }
    catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); }
  }
  async function delCity(id) { try { await removeProviderCity(vertical, id); setCities((c) => c.filter((x) => x.quote_provider_city_id !== id)); } catch { /* */ } }
  async function addCat(id) { try { const r = await addProviderCategory(vertical, id); setCats(r.categories || []); } catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); } }
  async function delCat(id) { try { await removeProviderCategory(vertical, id); setCats((c) => c.filter((x) => x.quote_category_id !== id)); } catch { /* */ } }
  async function toggleActive() {
    if (!provider.is_active) {
      try { await setProviderActive(vertical, true); onChanged(); notify({ title: t("quotes.provider.coverage.nowAcceptingTitle"), message: "", alertOnly: true }); } catch { /* */ }
      return;
    }
    if (!(await confirm({ title: t("quotes.provider.coverage.pauseConfirmTitle", { defaultValue: "Pause new requests?" }), message: t("quotes.provider.coverage.pauseConfirmMessage", { defaultValue: "You won't receive new quote requests until you resume." }), confirmLabel: t("quotes.provider.coverage.pauseRequests"), cancelLabel: t("quotes.confirm.keepLabel"), danger: false }))) return;
    try {
      await setProviderActive(vertical, false);
      onChanged();
      notify({ title: t("quotes.provider.coverage.pausedTitle"), message: "", alertOnly: true });
    } catch { /* */ }
  }

  if (allLeaves === null) return <CoverageSkeleton />;

  const myCatIds = new Set(cats.map((c) => c.quote_category_id));
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720, margin: "0 auto", width: "100%", animation: "fadeUp 0.25s ease both" }}>
      <div style={{ ...card, padding: isMobile ? "16px 14px" : "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ fontWeight: 700, minWidth: 0, wordBreak: "break-word" }}>
            {provider.business_name}{" "}
            <span className="text-text-secondary" style={{ fontSize: 12 }}>· {t(`quotes.provider.types.${provider.provider_type}`, { defaultValue: provider.provider_type })}</span>
          </div>
          <button type="button" onClick={toggleActive} style={{ ...ghostBtn, width: isMobile ? "100%" : "auto" }}>{provider.is_active ? t("quotes.provider.coverage.pauseRequests") : t("quotes.provider.coverage.resumeRequests")}</button>
        </div>
      </div>

      <div style={{ ...card, padding: isMobile ? "16px 14px" : "18px 20px" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{t("quotes.provider.coverage.citiesTitle")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {cities.map((c) => <span key={c.quote_provider_city_id} style={chip}>{c.city}{c.country ? `, ${c.country}` : ""} <button type="button" onClick={() => delCity(c.quote_provider_city_id)} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }} aria-label={`Remove ${c.city}`}>×</button></span>)}
          {!cities.length && <span className="text-text-secondary" style={{ fontSize: 13 }}>{t("quotes.provider.coverage.citiesEmpty")}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input style={{ ...input, flex: "1 1 120px", minWidth: 0 }} value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("quotes.provider.coverage.cityPlaceholder")} />
          <input style={{ ...input, flex: "1 1 100px", minWidth: 0 }} value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t("quotes.provider.coverage.countryPlaceholder")} />
          <button type="button" onClick={addCity} style={{ ...btn(accent), width: isMobile ? "100%" : "auto" }}>{t("quotes.provider.coverage.add")}</button>
        </div>
      </div>

      <div style={{ ...card, padding: isMobile ? "16px 14px" : "18px 20px" }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{t("quotes.provider.coverage.categoriesTitle")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {allLeaves.map((l) => {
            const on = myCatIds.has(l.quote_category_id);
            return <button key={l.quote_category_id} type="button" onClick={() => (on ? delCat(l.quote_category_id) : addCat(l.quote_category_id))} style={on ? { ...chip, background: `${accent}22`, borderColor: `${accent}55`, color: accent, cursor: "pointer" } : { ...chip, cursor: "pointer" }}>{on ? "✓ " : "+ "}{l.name}</button>;
          })}
          {!allLeaves.length && <span className="text-text-secondary" style={{ fontSize: 13 }}>{t("quotes.provider.coverage.categoriesEmpty", { defaultValue: "No categories available yet." })}</span>}
        </div>
      </div>
    </div>
  );
}

function Profile({ vertical, accent, provider, isMobile, notify, onChanged }) {
  const { t } = useTranslation();
  const uid = useId();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    provider_type: provider.provider_type || "broker",
    business_name: provider.business_name || "",
    contact_email: provider.contact_email || "",
    contact_phone: provider.contact_phone || "",
    license_no: provider.license_no || "",
    country: provider.country || "Canada",
    bio: provider.bio || "",
  });

  useEffect(() => {
    setReady(false);
    setF({
      provider_type: provider.provider_type || "broker",
      business_name: provider.business_name || "",
      contact_email: provider.contact_email || "",
      contact_phone: provider.contact_phone || "",
      license_no: provider.license_no || "",
      country: provider.country || "Canada",
      bio: provider.bio || "",
    });
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [provider]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!f.business_name.trim()) {
      notify({ title: t("quotes.provider.onboarding.nameRequiredTitle"), message: t("quotes.provider.onboarding.nameRequiredMessage"), alertOnly: true });
      return;
    }
    setBusy(true);
    try {
      await saveMyProvider({ ...f, vertical });
      notify({
        title: t("quotes.provider.profile.savedTitle", { defaultValue: "Profile updated" }),
        message: t("quotes.provider.profile.savedMessage", { defaultValue: "Your provider details were saved." }),
        alertOnly: true,
      });
      onChanged();
    } catch (e) {
      notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true });
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <ProfileSkeleton />;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", width: "100%", animation: "fadeUp 0.25s ease both" }}>
      <div style={{ ...card, padding: isMobile ? "16px 14px" : "18px 20px" }}>
        <h2 style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: "clamp(18px, 5vw, 22px)", margin: "0 0 4px", textTransform: "uppercase" }}>
          {t("quotes.provider.profile.heading", { defaultValue: "Your provider profile" })}
        </h2>
        <p className="text-text-secondary" style={{ fontSize: 13, marginTop: 0, marginBottom: 16, lineHeight: 1.45 }}>
          {t("quotes.provider.profile.blurb", { defaultValue: "This is what customers see when you send a quote. Keep contact details current." })}
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          <div><label style={label} htmlFor={`${uid}-business`}>{t("quotes.provider.onboarding.businessName")}</label><input id={`${uid}-business`} style={input} value={f.business_name} onChange={set("business_name")} /></div>
          <div>
            <label style={label} htmlFor={`${uid}-type`}>{t("quotes.provider.onboarding.providerType")}</label>
            <select id={`${uid}-type`} style={input} value={f.provider_type} onChange={set("provider_type")}>
              {PROVIDER_TYPES.map((type) => <option key={type} value={type}>{t(`quotes.provider.types.${type}`)}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div><label style={label} htmlFor={`${uid}-email`}>{t("quotes.provider.onboarding.contactEmail")}</label><input id={`${uid}-email`} style={input} value={f.contact_email} onChange={set("contact_email")} /></div>
            <div><label style={label} htmlFor={`${uid}-phone`}>{t("quotes.provider.onboarding.contactPhone")}</label><input id={`${uid}-phone`} style={input} value={f.contact_phone} onChange={set("contact_phone")} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div><label style={label} htmlFor={`${uid}-license`}>{t("quotes.provider.onboarding.licenseNo")}</label><input id={`${uid}-license`} style={input} value={f.license_no} onChange={set("license_no")} /></div>
            <div><label style={label} htmlFor={`${uid}-country`}>{t("quotes.provider.onboarding.country")}</label><input id={`${uid}-country`} style={input} value={f.country} onChange={set("country")} /></div>
          </div>
          <div><label style={label} htmlFor={`${uid}-about`}>{t("quotes.provider.onboarding.about")}</label><input id={`${uid}-about`} style={input} value={f.bio} onChange={set("bio")} /></div>
          <button type="button" disabled={busy} onClick={save} style={{ ...btn(accent, busy), width: isMobile ? "100%" : "auto" }}>
            {busy ? t("quotes.provider.profile.saving", { defaultValue: "Saving…" }) : t("quotes.provider.profile.save", { defaultValue: "Save profile" })}
          </button>
        </div>
      </div>
    </div>
  );
}

export { QuoteProviderDashboard };
