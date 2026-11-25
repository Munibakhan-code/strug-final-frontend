import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  runSavedSearchAlerts,
  updateSavedSearch,
} from "../api/realestate.js";
import { isAuthenticated } from "../store/auth";

function filtersEqual(a, b) {
  try {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  } catch {
    return false;
  }
}

function labelFromFilters(filters = {}, fallback = "Saved search") {
  const bits = [];
  if (filters.q) bits.push(String(filters.q).trim());
  if (filters.city) bits.push(String(filters.city).trim());
  if (filters.type) bits.push(String(filters.type));
  if (filters.beds) bits.push(`${filters.beds}+ beds`);
  if (filters.max_price) bits.push(`≤ $${Number(filters.max_price).toLocaleString()}`);
  if (filters.min_price) bits.push(`≥ $${Number(filters.min_price).toLocaleString()}`);
  return bits.length ? bits.join(" · ") : fallback;
}

/**
 * Save-search + alert controls for Construct / Real Estate browse.
 *
 * props:
 *  - vertical: 'preconstruct' | 'realestate'
 *  - filters: object stored on the server
 *  - canSave: whether current filters are worth saving
 *  - onApply(filters): restore filters into the page
 *  - accent: optional color
 */
export default function PropertySavedSearches({
  vertical,
  filters,
  canSave = false,
  onApply,
  accent = "#2563eb",
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3200);
  };

  const load = useCallback(() => {
    if (!isAuthenticated()) {
      setRows([]);
      return;
    }
    getSavedSearches({ vertical })
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setRows(Array.isArray(list) ? list : []);
      })
      .catch(() => setRows([]));
  }, [vertical]);

  useEffect(() => { load(); }, [load]);

  const alreadySaved = rows.some((r) => filtersEqual(r.filters, filters));

  async function handleSave() {
    if (!isAuthenticated()) {
      flash(t("savedSearch.signIn", { defaultValue: "Sign in to save searches and get alerts." }), false);
      return;
    }
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const name = labelFromFilters(filters).slice(0, 120);
      const res = await createSavedSearch({
        name,
        vertical,
        filters,
        alert_enabled: true,
      });
      const row = res?.data ?? res;
      if (row) setRows((prev) => [row, ...prev.filter((r) => r.saved_search_id !== row.saved_search_id)]);
      flash(t("savedSearch.saved", { defaultValue: "Search saved — alerts on for new matches." }));
    } catch (e) {
      flash(e?.response?.data?.message || t("savedSearch.saveFailed", { defaultValue: "Could not save search." }), false);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAlert(row) {
    if (busy) return;
    setBusy(true);
    const next = !row.alert_enabled;
    setRows((prev) => prev.map((r) => (r.saved_search_id === row.saved_search_id ? { ...r, alert_enabled: next } : r)));
    try {
      await updateSavedSearch(row.saved_search_id, { alert_enabled: next });
      flash(next
        ? t("savedSearch.alertsOn", { defaultValue: "Alerts on" })
        : t("savedSearch.alertsOff", { defaultValue: "Alerts off" }));
    } catch {
      setRows((prev) => prev.map((r) => (r.saved_search_id === row.saved_search_id ? { ...r, alert_enabled: row.alert_enabled } : r)));
      flash(t("savedSearch.updateFailed", { defaultValue: "Could not update alert." }), false);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id) {
    if (busy) return;
    setBusy(true);
    const prev = rows;
    setRows((list) => list.filter((r) => r.saved_search_id !== id));
    try {
      await deleteSavedSearch(id);
    } catch {
      setRows(prev);
      flash(t("savedSearch.deleteFailed", { defaultValue: "Could not delete." }), false);
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckNow() {
    if (!isAuthenticated() || busy) return;
    setBusy(true);
    try {
      const res = await runSavedSearchAlerts();
      const data = res?.data ?? res;
      const n = Number(data?.notified) || 0;
      flash(n > 0
        ? t("savedSearch.checkFound", { count: n, defaultValue: `Found ${n} new match alert(s). Check notifications.` })
        : t("savedSearch.checkNone", { defaultValue: "No new matches since your last check." }));
    } catch {
      flash(t("savedSearch.checkFailed", { defaultValue: "Could not check for new matches." }), false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ width: "min(720px, 100%)", margin: "10px auto 0" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        {canSave && (
          <button
            type="button"
            disabled={busy || alreadySaved}
            onClick={handleSave}
            title={alreadySaved
              ? t("savedSearch.alreadySaved", { defaultValue: "This search is already saved" })
              : t("savedSearch.saveTitle", { defaultValue: "Save this search and get alerts for new matches" })}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 18, cursor: busy || alreadySaved ? "default" : "pointer",
              // Settled "already saved" state uses a neutral (theme-flipping) chip; fixed
              // white text/border on it was invisible in light theme.
              background: alreadySaved ? "var(--color-surface-raised)" : `${accent}22`,
              border: `1px solid ${alreadySaved ? "var(--color-border)" : `${accent}55`}`,
              color: alreadySaved ? "var(--color-text-muted)" : "#93c5fd",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700,
            }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill={alreadySaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {alreadySaved
              ? t("savedSearch.savedLabel", { defaultValue: "Saved" })
              : t("savedSearch.saveWithAlerts", { defaultValue: "Save search + alerts" })}
          </button>
        )}
        {rows.some((r) => r.alert_enabled) && (
          <button
            type="button"
            disabled={busy}
            onClick={handleCheckNow}
            className="bg-surface-raised border border-border text-text-secondary"
            style={{
              padding: "7px 12px", borderRadius: 18, cursor: busy ? "default" : "pointer",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
            }}
          >
            {t("savedSearch.checkNow", { defaultValue: "Check for new matches" })}
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
          <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("savedSearch.heading", { defaultValue: "Saved searches" })}
          </span>
          {rows.map((s) => (
            <span
              key={s.saved_search_id}
              className="bg-surface-raised border border-border"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                borderRadius: 18, padding: "4px 6px 4px 12px",
              }}
            >
              <button
                type="button"
                onClick={() => onApply?.(s.filters || {})}
                className="text-text-primary"
                style={{
                  background: "none", border: "none",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
                  maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={s.name || labelFromFilters(s.filters)}
              >
                {s.name || labelFromFilters(s.filters)}
              </button>
              <button
                type="button"
                onClick={() => handleToggleAlert(s)}
                title={s.alert_enabled
                  ? t("savedSearch.alertsOn", { defaultValue: "Alerts on" })
                  : t("savedSearch.alertsOff", { defaultValue: "Alerts off" })}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex",
                  color: s.alert_enabled ? accent : "var(--color-text-muted)",
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill={s.alert_enabled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handleRemove(s.saved_search_id)}
                className="text-text-muted"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                aria-label={t("common.delete", { defaultValue: "Delete" })}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {msg && (
        <p style={{
          margin: "8px 0 0", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 12,
          color: msg.ok ? "#34d399" : "#f87171",
        }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

/** Build a compact filters object for Real Estate browse state. */
export function buildRealEstateSearchFilters({ query, filterBeds, filterMaxPrice, filterType, activeCategory, categories }) {
  const filters = {};
  const q = String(query || "").trim();
  if (q) filters.q = q;
  if (filterBeds > 0) filters.beds = filterBeds;
  if (filterMaxPrice > 0) filters.max_price = filterMaxPrice;
  if (filterType && filterType !== "All types") filters.type = filterType;
  if (activeCategory && activeCategory !== "all") {
    filters.category = activeCategory;
    const cat = (categories || []).find((c) => c.id === activeCategory);
    if (cat?.match) filters.listing_status = cat.match;
  }
  return filters;
}

/** Build filters object for Construct browse state. */
export function buildPreconstructSearchFilters({ query, priceFilter, activeCategory, categories, priceDefs }) {
  const filters = {};
  const q = String(query || "").trim();
  if (q) filters.q = q;
  if (activeCategory && activeCategory !== "all") {
    filters.category = activeCategory;
    const cat = (categories || []).find((c) => c.id === activeCategory);
    if (cat?.match) filters.type = cat.match;
  }
  if (priceFilter && priceFilter !== "any") {
    filters.price_filter = priceFilter;
    const def = (priceDefs || []).find((p) => p.id === priceFilter);
    if (def?.min != null) filters.min_price = def.min;
    if (def?.max != null) filters.max_price = def.max;
  }
  return filters;
}
