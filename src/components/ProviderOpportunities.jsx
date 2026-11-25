import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DemandHeatMap, businessNounFor } from "./DemandHeatMap.jsx";
import { createPromotion, getMyPromotions, updatePromotion } from "../api/discounts.js";
import {
  clearOpportunityAction,
  loadOpportunityActions,
  saveOpportunityAction,
} from "../api/opportunities.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useClosingTransition, glassBackdropStyle, glassPanelStyle, GLASS_PANEL_CLASS } from "./modalKit.jsx";

/*
 * #375 / #326 — Provider "Opportunities" section (MVP Option A).
 *
 * Customer segments from vertical analytics + anonymised demand map.
 * CTAs open an in-dashboard Create Offer sheet (food promotion), not List Discounts.
 * Acted status prefers live promotions from GET /discounts/promotions/mine so seller
 * UI matches buyer badges. Local storage only keeps Dismissed / optimistic Acted.
 */
const HEAD = "'Barlow Condensed', sans-serif";
const BODY = "'DM Sans', sans-serif";

const FOOD_FAMILY_VERTICALS = new Set([
  "food", "grocery", "groceries", "liquor", "pharmacy", "floral", "flowers",
  "catering", "mealkit", "meal_kit", "restaurant", "restaurants",
]);

function supportsSegmentTargeting(vertical) {
  const v = String(vertical || "").trim().toLowerCase();
  return FOOD_FAMILY_VERTICALS.has(v);
}

const SEGMENT_DEFS = [
  {
    key: "recent",
    label: "Recently bought",
    color: "#22d3ee",
    hint: "Bought in the last 30 days — send bundles or add-ons",
    cta: "Upsell offer",
    field: (c) => c.recent_buyers ?? c.active_customers,
    urgency: 2,
    suggestedPct: 10,
    codePrefix: "UPSELL",
    offerTitle: "Upsell for recent buyers",
    offerBlurb: "Reward recent customers with a small add-on or bundle discount.",
  },
  {
    key: "prospects",
    label: "Not bought yet",
    color: "#38bdf8",
    hint: "Active Strug users who have never placed a paid order with you",
    cta: "First-order offer",
    field: (c) => c.non_buyers,
    urgency: 4,
    suggestedPct: 15,
    codePrefix: "FIRST",
    offerTitle: "First-order offer",
    offerBlurb: "Convert users who have never ordered from you with a first-order discount.",
  },
  {
    key: "vip",
    label: "VIP customers",
    color: "#f59e0b",
    hint: "Top 10% by spend — reward loyalty",
    cta: "VIP reward",
    field: (c) => c.vip_customers,
    urgency: 3,
    suggestedPct: 12,
    codePrefix: "VIP",
    offerTitle: "VIP loyalty reward",
    offerBlurb: "Thank your top spenders with an exclusive loyalty discount.",
  },
  {
    key: "atrisk",
    label: "At-risk",
    color: "#fb923c",
    hint: "No order in 30–90 days — win them back",
    cta: "Win-back offer",
    field: (c) => c.lapsed_customers,
    urgency: 5,
    suggestedPct: 15,
    codePrefix: "WIN",
    offerTitle: "Win-back offer",
    offerBlurb: "Bring back customers who haven't ordered in 30–90 days.",
  },
  {
    key: "churned",
    label: "Churned",
    color: "#ef4444",
    hint: "No order in 90+ days — re-activate",
    cta: "Re-activate offer",
    field: (c) => c.churned_customers,
    urgency: 5,
    suggestedPct: 20,
    codePrefix: "BACK",
    offerTitle: "Re-activation offer",
    offerBlurb: "Re-engage customers with no order in 90+ days.",
  },
  {
    key: "oneshot",
    label: "One-and-done",
    color: "#a78bfa",
    hint: "Ordered once — turn into regulars",
    cta: "Second-order offer",
    field: (c) => c.one_and_done,
    urgency: 4,
    suggestedPct: 15,
    codePrefix: "AGAIN",
    offerTitle: "Second-order offer",
    offerBlurb: "Turn one-time buyers into regulars with a return incentive.",
  },
];

function fmt(n) {
  const v = Number(n || 0);
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

function genCode(prefix, pct) {
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${String(prefix || "OFFER").slice(0, 8)}${pct}${tail}`;
}

function defaultEndsAt() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function resolveStatus(action) {
  if (!action || !action.status) return "open";
  if (action.status === "dismissed") {
    if (action.until && new Date(action.until).getTime() > Date.now()) return "dismissed";
    return "open";
  }
  return action.status;
}

function normalizeSegmentKey(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  const aliases = {
    non_buyers: "prospects",
    first_order: "prospects",
    firstorder: "prospects",
    recent_buyers: "recent",
    active: "recent",
    upsell: "recent",
    lapsed: "atrisk",
    at_risk: "atrisk",
    one_and_done: "oneshot",
  };
  return aliases[s] || s;
}

function resolvePromoSegment(promo) {
  const fromField = normalizeSegmentKey(promo?.audience_segment);
  if (fromField) return fromField;
  const code = String(promo?.code || "").trim().toUpperCase();
  if (!code) return null;
  // Match Opportunities generators only (PREFIX + digit) — not WINTER25 / BACKTOSCHOOL.
  const m = /^(VIP|FIRST|UPSELL|WIN|BACK|AGAIN)(\d)/.exec(code);
  if (!m) return null;
  const prefix = m[1];
  if (prefix === "VIP") return "vip";
  if (prefix === "FIRST") return "prospects";
  if (prefix === "UPSELL") return "recent";
  if (prefix === "WIN") return "atrisk";
  if (prefix === "BACK") return "churned";
  if (prefix === "AGAIN") return "oneshot";
  return null;
}

function isLiveFoodPromotion(promo, vertical) {
  if (!promo) return false;
  const status = String(promo.status || "").toLowerCase();
  if (status !== "active") return false;
  const v = String(promo.vertical || "").toLowerCase();
  const want = String(vertical || "food").toLowerCase();
  if (v && v !== want && v !== "food") return false;
  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return false;
  if (promo.ends_at && new Date(promo.ends_at).getTime() < now) return false;
  return true;
}

/** Map audience_segment → newest live promotion (source of truth for buyer badges). */
function indexLivePromotionsBySegment(promos, vertical) {
  const map = {};
  const list = Array.isArray(promos) ? promos : [];
  for (const promo of list) {
    if (!isLiveFoodPromotion(promo, vertical)) continue;
    const key = resolvePromoSegment(promo);
    if (!key) continue;
    const prev = map[key];
    if (!prev || Number(promo.promotion_id || 0) > Number(prev.promotion_id || 0)) {
      map[key] = promo;
    }
  }
  return map;
}

function livePromoToAction(promo) {
  return {
    status: "acted",
    promotionId: promo.promotion_id,
    code: promo.code,
    pct: promo.discount_type === "percent" ? Number(promo.discount_value) : undefined,
    title: promo.title,
    at: promo.created_at || new Date().toISOString(),
    until: promo.ends_at || null,
    fromApi: true,
  };
}

function CreateOfferSheet({ open, segment, color, vertical, onClose, onCreated }) {
  const trapRef = useFocusTrap(open);
  const { closing, requestClose } = useClosingTransition();
  const [pct, setPct] = useState(15);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [endsAt, setEndsAt] = useState(defaultEndsAt());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !segment) return;
    setPct(segment.suggestedPct);
    setCode(genCode(segment.codePrefix, segment.suggestedPct));
    setTitle(segment.offerTitle);
    setEndsAt(defaultEndsAt());
    setError(null);
    setBusy(false);
  }, [open, segment]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape" && !busy) requestClose(() => onClose?.());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, requestClose]);

  // Lock page scroll while the sheet is open so the dialog stays in the viewport.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !segment) return null;

  async function handlePublish() {
    const cleanCode = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    const cleanTitle = String(title || "").trim();
    const pctNum = Math.max(1, Math.min(50, parseInt(pct, 10) || 0));
    if (!cleanCode || cleanCode.length < 3) {
      setError("Enter a promo code (at least 3 characters).");
      return;
    }
    if (!cleanTitle) {
      setError("Give this offer a short name.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: cleanTitle,
      code: cleanCode,
      description: `${segment.offerBlurb} Audience: ${segment.label} (${fmt(segment.value)}).`,
      kind: "coupon",
      discount_type: "percent",
      discount_value: pctNum,
      status: "active",
      scope: "seller",
      vertical: vertical || "food",
      audience_segment: segment.key,
      per_user_limit: 1,
      starts_at: new Date().toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    };
    try {
      const res = await createPromotion(payload);
      const promotionId = res?.promotion_id ?? res?.id ?? res?.data?.promotion_id ?? res?.data?.id ?? null;
      onCreated?.({
        key: segment.key,
        status: "acted",
        promotionId,
        code: cleanCode,
        pct: pctNum,
        title: cleanTitle,
        at: new Date().toISOString(),
        until: endsAt ? new Date(endsAt).toISOString() : null,
      });
      requestClose(() => onClose?.());
    } catch (err) {
      const msg =
        err?.response?.data?.detail
        || err?.response?.data?.message
        || err?.message
        || "Couldn't create this offer. Check the details and try again.";
      setError(typeof msg === "string" ? msg : "Couldn't create this offer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 10,
    padding: "10px 12px",
    fontFamily: BODY,
    fontSize: 13.5,
    outline: "none",
  };

  // Portal to body so dashboard overflow/transform doesn't trap position:fixed
  // (that was forcing sellers to scroll to find the sheet).
  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) requestClose(() => onClose?.());
      }}
      style={glassBackdropStyle(closing, {
        zIndex: 4000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
      })}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="opp-offer-title"
        className={GLASS_PANEL_CLASS}
        style={glassPanelStyle(closing, {
          width: "100%",
          maxWidth: 480,
          maxHeight: "min(640px, calc(100vh - 32px))",
          overflowY: "auto",
          borderRadius: 18,
          padding: "22px 20px 18px",
          margin: "auto",
        })}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: segment.color, marginTop: 6, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p id="opp-offer-title" className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>
              {segment.offerTitle}
            </p>
            <p className="text-text-secondary" style={{ fontFamily: BODY, fontSize: 12.5, margin: "4px 0 0", lineHeight: 1.45 }}>
              Targeting <strong className="text-text-primary">{segment.label}</strong> · {fmt(segment.value)} customers
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && requestClose(() => onClose?.())}
            className="text-text-muted"
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        <p className="text-text-secondary" style={{ fontFamily: BODY, fontSize: 12.5, margin: "0 0 16px", lineHeight: 1.45 }}>
          {segment.offerBlurb} This creates a promo code customers can apply at checkout.
        </p>

        <label className="text-text-secondary" style={{ display: "block", fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
          Offer name
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-surface-raised border border-border text-text-primary"
          style={{ ...fieldStyle, marginBottom: 12 }}
          disabled={busy}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label className="text-text-secondary" style={{ display: "block", fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
              Discount %
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="bg-surface-raised border border-border text-text-primary"
              style={fieldStyle}
              disabled={busy}
            />
          </div>
          <div>
            <label className="text-text-secondary" style={{ display: "block", fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
              Promo code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="bg-surface-raised border border-border text-text-primary"
              style={{ ...fieldStyle, fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}
              disabled={busy}
            />
          </div>
        </div>

        <label className="text-text-secondary" style={{ display: "block", fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
          Ends
        </label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className="bg-surface-raised border border-border text-text-primary"
          style={{ ...fieldStyle, marginBottom: 14 }}
          disabled={busy}
        />

        {error && (
          <p style={{ fontFamily: BODY, fontSize: 12.5, color: "#ef4444", margin: "0 0 12px", lineHeight: 1.4 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => !busy && requestClose(() => onClose?.())}
            className="bg-surface-raised border border-border text-text-secondary"
            style={{ flex: 1, borderRadius: 10, padding: "11px 0", fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            style={{
              flex: 1.4,
              borderRadius: 10,
              padding: "11px 0",
              fontFamily: BODY,
              fontSize: 13,
              fontWeight: 700,
              border: "none",
              background: color,
              color: "#fff",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.75 : 1,
            }}
            disabled={busy}
          >
            {busy ? "Publishing…" : "Publish offer"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ProviderOpportunities({ vertical, fetchAnalytics, color = "#2563eb" }) {
  const [fetched, setFetched] = useState(undefined); // undefined = loading, null = no data
  const [actions, setActions] = useState(() => loadOpportunityActions(vertical));
  const [liveBySegment, setLiveBySegment] = useState({});
  const [promoBusyKey, setPromoBusyKey] = useState(null);
  const [sheetSegment, setSheetSegment] = useState(null);
  // Keep dismissed panel open so Restore all / Restore segment stay easy to find.
  const [showDismissed, setShowDismissed] = useState(true);
  const [undo, setUndo] = useState(null); // { key, label, timer }
  const canFetch = typeof fetchAnalytics === "function";
  const customers = canFetch ? fetched : null;
  const segmentTargeting = supportsSegmentTargeting(vertical);

  const refreshLivePromotions = useCallback(async () => {
    try {
      const rows = await getMyPromotions();
      const list = Array.isArray(rows) ? rows : (rows?.data ?? []);
      setLiveBySegment(indexLivePromotionsBySegment(list, vertical));
    } catch {
      setLiveBySegment({});
    }
  }, [vertical]);

  useEffect(() => () => {
    if (undo?.timer) clearTimeout(undo.timer);
  }, [undo]);

  useEffect(() => {
    setActions(loadOpportunityActions(vertical));
    refreshLivePromotions();
  }, [vertical, refreshLivePromotions]);

  useEffect(() => {
    if (!canFetch) return undefined;
    let alive = true;
    Promise.resolve(fetchAnalytics())
      .then((res) => {
        if (!alive) return;
        const payload = res?.data ?? res ?? null;
        setFetched(payload?.customers ?? null);
      })
      .catch(() => { if (alive) setFetched(null); });
    return () => { alive = false; };
  }, [fetchAnalytics, canFetch]);

  const c = customers && typeof customers === "object" ? customers : {};
  const hasSignals = customers && ((c.total_customers ?? 0) > 0 || (c.non_buyers ?? 0) > 0);

  const segments = useMemo(() => {
    return SEGMENT_DEFS.map((def) => {
      const value = Number(def.field(c) || 0);
      const live = liveBySegment[def.key];
      const local = actions[def.key];
      // Live backend promo is source of truth (matches buyer badges). Local dismiss
      // only applies when there is no live offer for this segment.
      let action = local;
      let status = resolveStatus(local);
      if (live) {
        action = livePromoToAction(live);
        status = "acted";
      }
      const priority = value > 0 && status === "open" ? value * def.urgency : 0;
      return { ...def, value, status, action, priority, livePromo: live || null };
    }).sort((a, b) => {
      if (a.status !== b.status) {
        const order = { open: 0, acted: 1, dismissed: 2 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      }
      return b.priority - a.priority || b.value - a.value;
    });
  }, [c, actions, liveBySegment]);

  const openSegments = segments.filter((s) => s.status === "open" && s.value > 0);
  const actedSegments = segments.filter((s) => s.status === "acted");
  const dismissedSegments = segments.filter((s) => s.status === "dismissed");
  const emptyOpen = segments.filter((s) => s.status === "open" && !(s.value > 0));
  const topNext = openSegments.slice(0, 3);

  const overview = [
    { label: "Total customers", value: c.total_customers, color: "#94a3b8" },
    { label: "New", value: c.new_customers, color: "#4ade80" },
    { label: "Returning", value: c.returning_customers, color: "#2563eb" },
    { label: "Active", value: c.active_customers, color: "#22d3ee" },
    { label: "Not bought yet", value: c.non_buyers, color: "#38bdf8" },
  ];

  function markAction(key, action) {
    const next = saveOpportunityAction(vertical, key, action);
    setActions(next);
  }

  function dismissSegment(seg) {
    // Don't locally dismiss while a live promo still powers buyer badges —
    // seller must deactivate the offer first.
    if (seg.livePromo || seg.status === "acted") return;
    const until = new Date();
    until.setDate(until.getDate() + 7);
    markAction(seg.key, { status: "dismissed", until: until.toISOString(), at: new Date().toISOString() });
    setShowDismissed(true);
    if (undo?.timer) clearTimeout(undo.timer);
    const timer = setTimeout(() => setUndo(null), 8000);
    setUndo({ key: seg.key, label: seg.label, timer });
  }

  function reopenSegment(key) {
    const next = clearOpportunityAction(vertical, key);
    setActions(next);
    if (undo?.key === key) {
      if (undo.timer) clearTimeout(undo.timer);
      setUndo(null);
    }
  }

  async function deactivateOffer(seg) {
    const promotionId = seg.action?.promotionId ?? seg.livePromo?.promotion_id;
    if (!promotionId) {
      reopenSegment(seg.key);
      return;
    }
    setPromoBusyKey(seg.key);
    try {
      await updatePromotion(promotionId, { status: "disabled" });
      clearOpportunityAction(vertical, seg.key);
      setActions(loadOpportunityActions(vertical));
      await refreshLivePromotions();
    } catch {
      // Keep UI as-is; seller can retry.
    } finally {
      setPromoBusyKey(null);
    }
  }

  function restoreAllDismissed() {
    dismissedSegments.forEach((s) => {
      clearOpportunityAction(vertical, s.key);
    });
    setActions(loadOpportunityActions(vertical));
    if (undo?.timer) clearTimeout(undo.timer);
    setUndo(null);
  }

  return (
    <div style={{ animation: "fadeUp 0.25s ease both" }}>
      <p className="text-text-secondary" style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>Your customers</p>
      <p className="text-text-secondary" style={{ fontFamily: BODY, fontSize: 13, margin: "0 0 16px", maxWidth: 640 }}>
        Ranked growth actions for people who've bought from you — plus first-order opportunities.
        {segmentTargeting
          ? " Create a targeted offer without leaving this dashboard."
          : " Segment-targeted offers (VIP, first-order, win-back) are available on Food-family dashboards — use List Discounts for general shop coupons here."}
      </p>

      {!segmentTargeting && (
        <p className="text-text-muted" style={{ fontFamily: BODY, fontSize: 12, margin: "0 0 16px", maxWidth: 640, lineHeight: 1.5 }}>
          Audience-specific promotions are not supported for this vertical yet, so create-offer actions are hidden to avoid publishing offers that cannot be enforced at checkout.
        </p>
      )}

      {customers === undefined ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 26 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 92, borderRadius: 12 }} />)}
        </div>
      ) : !hasSignals ? (
        <div style={{ border: "1px dashed var(--color-border)", borderRadius: 14, padding: "22px 20px", marginBottom: 26, textAlign: "center" }}>
          <p className="text-text-secondary" style={{ fontFamily: BODY, fontSize: 13, margin: 0 }}>
            Customer segments will appear here as orders come in — you'll then be able to send targeted offers to recent buyers, first-time prospects, VIPs, at-risk and lapsed customers.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, marginBottom: 14 }}>
            {overview.map((s) => (
              <div key={s.label} className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span className="text-text-secondary" style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</span>
                </div>
                <span className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 26, lineHeight: 1 }}>{fmt(s.value)}</span>
              </div>
            ))}
          </div>

          {segmentTargeting && topNext.length > 0 && (
            <div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
              <p className="text-text-secondary" style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }}>
                Do this next
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topNext.map((s) => {
                  return (
                    <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      <span className="text-text-primary" style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700 }}>{s.label}</span>
                      <span className="text-text-secondary" style={{ fontFamily: BODY, fontSize: 12 }}>
                        {fmt(s.value)} customers
                      </span>
                      <button
                        type="button"
                        onClick={() => setSheetSegment(s)}
                        style={{ marginLeft: "auto", background: `${color}1f`, border: `1px solid ${color}66`, color, borderRadius: 8, padding: "6px 12px", fontFamily: BODY, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        {s.cta} →
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {segmentTargeting && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12, marginBottom: 16 }}>
            {[...openSegments, ...actedSegments].map((s) => {
              const isActed = s.status === "acted";
              return (
                <div key={s.key} className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, opacity: isActed ? 0.92 : 1 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      <span className="text-text-primary" style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700 }}>{s.label}</span>
                      {isActed && (
                        <span style={{ marginLeft: 4, fontFamily: BODY, fontSize: 10, fontWeight: 700, color: "#10b981", letterSpacing: "0.04em", textTransform: "uppercase" }}>Acted</span>
                      )}
                      <span className="text-text-primary" style={{ marginLeft: "auto", fontFamily: HEAD, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{fmt(s.value)}</span>
                    </div>
                    <p className="text-text-secondary" style={{ fontFamily: BODY, fontSize: 11.5, margin: 0, lineHeight: 1.45 }}>{s.hint}</p>
                    {isActed && s.action?.code && (
                      <p style={{ fontFamily: BODY, fontSize: 11.5, margin: "6px 0 0", color: "#10b981" }}>
                        Offer live · code <strong>{s.action.code}</strong>
                        {s.action.pct != null ? ` · ${s.action.pct}% off` : ""}
                        {s.livePromo ? " · visible to buyers" : ""}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: "auto", alignItems: "stretch" }}>
                    <button
                      type="button"
                      onClick={() => setSheetSegment(s)}
                      style={{ flex: 1, minWidth: 0, background: `${color}1f`, border: `1px solid ${color}66`, color, borderRadius: 10, padding: "8px 12px", fontFamily: BODY, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      {isActed ? "Create another →" : `${s.cta} →`}
                    </button>
                    {!isActed && (
                      <button
                        type="button"
                        onClick={() => dismissSegment(s)}
                        className="text-text-muted border border-border"
                        title="Hide for 7 days"
                        style={{ background: "var(--color-surface-raised)", borderRadius: 10, padding: "8px 10px", fontFamily: BODY, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                      >
                        Dismiss
                      </button>
                    )}
                    {isActed && (
                      <button
                        type="button"
                        onClick={() => deactivateOffer(s)}
                        disabled={promoBusyKey === s.key}
                        className="text-text-muted border border-border"
                        title="Disable this offer so buyers no longer see the badge"
                        style={{ background: "var(--color-surface-raised)", borderRadius: 10, padding: "8px 10px", fontFamily: BODY, fontSize: 11.5, fontWeight: 600, cursor: promoBusyKey === s.key ? "default" : "pointer", opacity: promoBusyKey === s.key ? 0.7 : 1 }}
                      >
                        {promoBusyKey === s.key ? "…" : "Deactivate"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}

          {segmentTargeting && dismissedSegments.length > 0 && (
            <div className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 16, borderColor: `${color}55` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: showDismissed ? 12 : 0 }}>
                <p className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
                  Dismissed ({dismissedSegments.length})
                </p>
                <button
                  type="button"
                  onClick={() => setShowDismissed((v) => !v)}
                  className="text-text-secondary"
                  style={{ background: "none", border: "none", padding: 0, fontFamily: BODY, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {showDismissed ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  onClick={restoreAllDismissed}
                  style={{ marginLeft: "auto", background: `${color}1f`, border: `1px solid ${color}66`, color, borderRadius: 8, padding: "6px 12px", fontFamily: BODY, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Restore all
                </button>
              </div>
              {showDismissed && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
                  {dismissedSegments.map((s) => (
                    <div key={s.key} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                        <span className="text-text-primary" style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700 }}>{s.label}</span>
                        <span className="text-text-muted" style={{ marginLeft: "auto", fontFamily: HEAD, fontWeight: 700, fontSize: 18 }}>{fmt(s.value)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => reopenSegment(s.key)}
                        style={{ background: color, border: "none", color: "#fff", borderRadius: 8, padding: "8px 0", width: "100%", fontFamily: BODY, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                      >
                        Restore segment
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {emptyOpen.length > 0 && (
            <p className="text-text-muted" style={{ fontFamily: BODY, fontSize: 12, margin: "0 0 18px" }}>
              Hidden empty segments: {emptyOpen.map((s) => s.label).join(", ")}.
            </p>
          )}
        </>
      )}

      {undo && createPortal(
        <div
          className="bg-surface-raised border border-border"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 4100,
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 12px 40px var(--color-shadow)",
            maxWidth: "min(440px, calc(100vw - 24px))",
          }}
        >
          <span className="text-text-primary" style={{ fontFamily: BODY, fontSize: 13 }}>
            Dismissed <strong>{undo.label}</strong>
          </span>
          <button
            type="button"
            onClick={() => reopenSegment(undo.key)}
            style={{ marginLeft: "auto", background: color, border: "none", color: "#fff", borderRadius: 8, padding: "7px 12px", fontFamily: BODY, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Undo
          </button>
        </div>,
        document.body,
      )}

      <p className="text-text-secondary" style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>Demand near you</p>
      <p className="text-text-secondary" style={{ fontFamily: BODY, fontSize: 13, margin: "0 0 16px", maxWidth: 640 }}>
        Anonymized buyer hotspots near your {businessNounFor(vertical)} — circles show density from delivery-address aggregates (k≥5, ~4.4 km grid), never exact addresses.
      </p>
      <DemandHeatMap vertical={vertical} />

      <CreateOfferSheet
        open={segmentTargeting && !!sheetSegment}
        segment={sheetSegment}
        color={color}
        vertical={vertical}
        onClose={() => setSheetSegment(null)}
        onCreated={(action) => {
          if (action?.key) markAction(action.key, action);
          refreshLivePromotions();
        }}
      />
    </div>
  );
}
