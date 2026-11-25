import React, { useEffect, useState, useCallback, useId, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { AddressAutocomplete } from "../components/shared.jsx";
import { getUser } from "../store/auth";
import { getLocationItem, setLocationItem } from "../utils/userLocation.js";
import {
  getQuoteCategories,
  createQuoteRequest,
  previewMatchingProviders,
  getMyQuoteRequests,
  getQuoteRequestHistory,
  getQuoteRequest,
  cancelQuoteRequest,
  getQuoteAvailability,
  bookAppointment,
  confirmAppointment,
  cancelAppointment,
  closeDeal,
  reviewQuoteDeal,
  contactProvider,
} from "../api/quotes.js";
import { SaveButton } from "../components/SaveButton.jsx";
import { MapPinIcon } from "../components/icons.jsx";
import {
  peekPropertyFinancing,
  savePropertyFinancing,
  clearPropertyFinancing,
  preferredCategorySlug,
  buildFinancingFormPrefill,
  financingNotes,
  continuePropertyFinancingToInsurance,
} from "../utils/propertyFinancing.js";
import {
  isPastRequest,
  isRenewable,
  flattenLeaves,
  decodeHtmlEntities,
  normalizeFormData,
  fieldEmpty,
  schemaOptions,
} from "../utils/quoteFormData.js";
import {
  validateMortgageFormClient,
  downPaymentHint,
} from "../utils/mortgageValidation.js";

const VERTICAL_ACCENT = {
  insurance: "#0ea5e9",
  mortgage: "#14b8a6",
};

// ── shared inline styles ─────────────────────────────────────────────────────
const card = { background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 16, padding: "18px 20px", color: "var(--color-text-primary)" };
const label = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6, fontFamily: "'DM Sans'" };
// colorScheme stays "dark" regardless of theme — matches the established pattern for native
// inputs across the app: browser picker/option chrome isn't retheme'd. <option> theming below
// comes from the global `select option { background: var(--color-surface-raised); ... }`
// fallback in index.css (see the removed Bug #81 `opt` object below).
const input = { width: "100%", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "11px 14px", color: "var(--color-text-primary)", fontFamily: "'DM Sans'", fontSize: 14, outline: "none", boxSizing: "border-box", colorScheme: "dark" };
// Bug #81 previously forced a hardcoded dark `opt` style on every <option> (black-on-white on
// Windows/Edge otherwise). That's now handled theme-aware by the global `select option` rule in
// index.css, so the per-option inline style was removed rather than tokenized.
const btn = (accent, disabled) => ({
  padding: "12px 18px",
  background: disabled ? "var(--color-surface-raised)" : accent,
  border: "none",
  borderRadius: 12,
  // Contrast fix: the disabled background becomes a near-white raised surface in light theme, so
  // a fixed white label would vanish there — use the theme-aware primary text color instead. The
  // enabled state's background is always the saturated accent color, so fixed white text there
  // stays correct in both themes.
  color: disabled ? "var(--color-text-primary)" : "#fff",
  fontFamily: "'DM Sans'",
  fontSize: 14,
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
});
const ghostBtn = { padding: "10px 16px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 12, color: "var(--color-text-primary)", fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const h1 = { fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: "clamp(28px,3.2vw,42px)", color: "var(--color-text-primary)", letterSpacing: "0.12em", textTransform: "uppercase", margin: 0, lineHeight: 1.15 };
const pill = (c) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${c}22`, color: c, border: `1px solid ${c}55` });

function fmtMoney(q) { return q.amount != null ? `${q.currency || "CAD"} ${Number(q.amount).toLocaleString()}` : "—"; }
function fmtDate(d) { if (!d) return ""; try { return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); } catch { return d; } }
function statusLabel(t, status) { return t(`quotes.status.${status}`, { defaultValue: status }); }
function providerInitial(p) { return (p?.business_name || "?").trim().slice(0, 1).toUpperCase() || "?"; }

function RenewBanner({ t, accent, renewables, slice, onPick, onSeeAll, busy }) {
  if (!renewables?.length) return null;
  const count = renewables.length;
  return (
    <div style={{ ...card, borderColor: `${accent}66`, background: `linear-gradient(120deg, ${accent}18, var(--color-surface-raised))`, marginBottom: onSeeAll ? 4 : 0 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        {t("quotes.renew.bannerTitle", { defaultValue: "Time to renew?" })}
      </div>
      <p className="text-text-secondary" style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.45 }}>
        {t("quotes.renew.bannerMessage", {
          count,
          defaultValue: count === 1
            ? "A closed policy from ~10+ months ago is ready to re-request with one click."
            : `${count} closed policies from ~10+ months ago are ready to re-request.`,
        })}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {renewables.slice(0, slice).map((r) => (
          <button key={r.quote_request_id} type="button" disabled={busy} onClick={() => onPick(r)} style={btn(accent, busy)}>
            {t("quotes.renew.renewNow", { defaultValue: "Renew now" })}
            {r.quote_category?.name ? ` · ${r.quote_category.name}` : ""}
          </button>
        ))}
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} style={ghostBtn}>
            {t("quotes.renew.seeAllInHistory", { defaultValue: "See all in History" })}
          </button>
        )}
      </div>
    </div>
  );
}

// Keeps a Leaflet map sized correctly inside a flex/route-transitioned container (it renders
// grey tiles until invalidateSize runs) and re-centres when the user's location changes.
function InvalidateSize({ center }) {
  const map = useMap();
  const lat = center?.lat, lng = center?.lng;
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize();
      if (lat != null && lng != null) map.setView([lat, lng], map.getZoom() || 12);
    }, 80);
    return () => clearTimeout(t);
  }, [map, lat, lng]);
  useEffect(() => {
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [map]);
  return null;
}

// Map of the requester's area with matched providers shown around it. Quote providers have
// no stored coordinates (they're matched by city, not lat/lng), so — like on-demand's
// privacy fuzz — we scatter their pins in a ring around the set address. The count, not the
// exact position, is the signal: "N providers serve your area".
function QuoteAreaMap({ userGeo, accent, addressLabel, providers = [], onSelect, t }) {
  const center = userGeo || { lat: 43.6532, lng: -79.3832 }; // default: Toronto
  // The map itself (dark CartoDB basemap tiles) and its floating overlay chrome below stay dark
  // in both themes — the tiles don't retheme, so overlays on top of them must stay dark for
  // legibility, same reasoning as Hub.jsx's photo-scrim treatment.
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 220, position: "relative", background: "#0d0f1a", overflow: "hidden", isolation: "isolate" }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={12}
        style={{ width: "100%", height: "100%", zIndex: 0 }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <InvalidateSize center={center} />
        <CircleMarker center={[center.lat, center.lng]} radius={9} pathOptions={{ color: accent, fillColor: accent, fillOpacity: 0.9, weight: 2 }} />
        {providers.slice(0, 12).map((p, i) => {
          const angle = (i / Math.max(Math.min(providers.length, 12), 1)) * Math.PI * 2;
          const r = 0.012 + (i % 3) * 0.005;
          const lat = center.lat + Math.cos(angle) * r;
          const lng = center.lng + Math.sin(angle) * r;
          return (
            <Marker
              key={p.quote_provider_id}
              position={[lat, lng]}
              eventHandlers={onSelect ? { click: () => onSelect(p) } : undefined}
              icon={L.divIcon({
                className: "quote-provider-pin",
                html: `<div style="width:32px;height:32px;border-radius:50%;background:${accent}dd;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.45)">${providerInitial(p)}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
              })}
            >
              {p.business_name ? <Tooltip direction="top" offset={[0, -16]}>{p.business_name}</Tooltip> : null}
            </Marker>
          );
        })}
      </MapContainer>
      <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(10,10,20,0.85)", border: `1px solid ${accent}40`, borderRadius: 20, padding: "5px 12px", zIndex: 1000 }}>
        <span style={{ fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 700, color: providers.length ? accent : "rgba(255,255,255,0.55)" }}>
          {providers.length > 0
            ? t("quotes.map.providersNearby", { count: providers.length, defaultValue: `${providers.length} providers nearby` })
            : t("quotes.map.setArea", { defaultValue: "Set category + city to find providers" })}
        </span>
      </div>
      {addressLabel && (
        <div style={{ position: "absolute", left: 12, bottom: 12, right: 12, display: "flex", alignItems: "center", gap: 6, background: "rgba(10,12,20,0.88)", border: `1px solid ${accent}44`, borderRadius: 10, padding: "8px 12px", fontFamily: "'DM Sans'", fontSize: 12, color: "rgba(255,255,255,0.8)", zIndex: 1000, pointerEvents: "none" }}>
          <span style={{ color: accent, flexShrink: 0, display: "flex" }}><MapPinIcon s={14} /></span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addressLabel}</span>
        </div>
      )}
    </div>
  );
}

// Clickable provider profile circles — a column beside the desktop map, or a scrollable row
// on mobile. Mirrors on-demand's WorkerProfileSidebar. Clicking opens the provider preview.
function ProviderSidebar({ providers, accent, horizontal = false, onSelect, t }) {
  const [hovered, setHovered] = useState(null);

  if (horizontal) {
    if (!providers?.length) return null;
    return (
      <div style={{ margin: "0 0 8px", padding: "0 4px" }}>
        <p className="text-text-muted" style={{ fontFamily: "'DM Sans'", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
          {t("quotes.sidebar.inYourArea", { count: providers.length, defaultValue: `${providers.length} in your area` })}
        </p>
        <div style={{ display: "flex", gap: 14, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
          {providers.map((p) => (
            <div key={p.quote_provider_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, width: 72, position: "relative" }}>
              <SaveButton
                entityType="quote_provider"
                entityId={p.quote_provider_id}
                meta={{
                  title: p.business_name || "Provider",
                  sub: p.provider_type || "agent",
                  price: p.rating != null ? `★ ${Number(p.rating).toFixed(1)}` : "",
                  accent,
                }}
                size={22}
                style={{ position: "absolute", top: -2, right: -2, zIndex: 2 }}
              />
              <button onClick={() => onSelect?.(p)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, cursor: "pointer", width: "100%" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${accent}22`, border: `2px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 20, color: accent }}>{providerInitial(p)}</span>
                </div>
                <span className="text-text-primary" style={{ fontFamily: "'DM Sans'", fontSize: 11, textAlign: "center", lineHeight: 1.2, maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.business_name || t("quotes.detail.providerFallback")}</span>
                {p.rating != null && <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>★ {Number(p.rating).toFixed(1)}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface" style={{ width: 188, flexShrink: 0, overflowY: "auto", borderRight: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", padding: "16px 0" }}>
      {!providers?.length ? (
        <div style={{ padding: "20px 12px", textAlign: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${accent}22`, border: `1px solid ${accent}44`, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans'", fontSize: 11, lineHeight: 1.4, margin: 0 }}>
            {t("quotes.sidebar.empty", { defaultValue: "Pick a category + city to see providers" })}
          </p>
        </div>
      ) : (
        <>
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans'", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 12px 10px", margin: 0 }}>
            {t("quotes.sidebar.nearby", { count: providers.length, defaultValue: `${providers.length} nearby` })}
          </p>
          {providers.map((p) => (
            <button
              key={p.quote_provider_id}
              onClick={() => onSelect?.(p)}
              onMouseEnter={() => setHovered(p.quote_provider_id)}
              onMouseLeave={() => setHovered(null)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px", background: hovered === p.quote_provider_id ? `${accent}18` : "transparent", border: "none", borderBottom: "1px solid var(--color-border-subtle)", width: "100%", boxSizing: "border-box", cursor: "pointer", transition: "background 0.15s", position: "relative" }}
            >
              <SaveButton
                entityType="quote_provider"
                entityId={p.quote_provider_id}
                meta={{
                  title: p.business_name || "Provider",
                  sub: p.provider_type || "agent",
                  price: p.rating != null ? `★ ${Number(p.rating).toFixed(1)}` : "",
                  accent,
                }}
                size={26}
                style={{ position: "absolute", top: 6, right: 6, zIndex: 2 }}
              />
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${accent}22`, border: `2px solid ${hovered === p.quote_provider_id ? accent : `${accent}55`}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 20, color: accent }}>{providerInitial(p)}</span>
              </div>
              <div className="text-text-primary" style={{ fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 700, textAlign: "center", lineHeight: 1.25 }}>{p.business_name || t("quotes.detail.providerFallback")}</div>
              <div className="text-text-secondary" style={{ fontSize: 10, textTransform: "capitalize" }}>{p.provider_type || "agent"}</div>
              {p.rating != null && <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>★ {Number(p.rating).toFixed(1)}</div>}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// Lightweight provider preview. There's no direct-offer in quotes (submitting the request
// notifies every matched provider), so this is informational: it explains how to reach them.
function ProviderInfoModal({ provider, accent, onClose, t }) {
  if (!provider) return null;
  const meta = {
    title: provider.business_name || "Provider",
    sub: [provider.provider_type, provider.rating != null ? `★ ${Number(provider.rating).toFixed(1)}` : null].filter(Boolean).join(" · "),
    price: provider.rating != null ? `★ ${Number(provider.rating).toFixed(1)}` : "",
    accent,
  };
  return (
    // The fixed-overlay scrim stays dark in both themes — it's dimming the page behind a modal,
    // not a themed surface (same call as full-screen modal backdrops elsewhere in the app).
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-raised" style={{ width: "min(94vw, 420px)", borderRadius: 20, border: `1px solid ${accent}44`, boxShadow: `0 24px 80px -20px ${accent}44`, padding: "24px 22px 26px", position: "relative" }}>
        <SaveButton
          entityType="quote_provider"
          entityId={provider.quote_provider_id}
          meta={meta}
          size={36}
          style={{ position: "absolute", top: 16, right: 44 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${accent}22`, border: `2px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 24, color: accent }}>{providerInitial(provider)}</span>
          </div>
          <div style={{ minWidth: 0, paddingRight: 40 }}>
            <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 20, textTransform: "uppercase", margin: "0 0 2px" }}>{provider.business_name || t("quotes.detail.providerFallback")}</p>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans'", fontSize: 12, margin: 0, textTransform: "capitalize" }}>
              {provider.provider_type || "agent"}{provider.rating != null ? ` · ★ ${Number(provider.rating).toFixed(1)}` : ""}
              {provider.license_no ? ` · ${t("quotes.provider.licensed", { defaultValue: "Licensed" })}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-text-secondary" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        {provider.bio && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans'", fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>{provider.bio}</p>}
        <div className="text-text-secondary" style={{ background: `${accent}15`, border: `1px solid ${accent}44`, borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans'", fontSize: 13 }}>
          {t("quotes.provider.howToReach", { defaultValue: "Fill in the form and submit your request — this provider and others in your area will be able to send you a quote." })}
        </div>
      </div>
    </div>
  );
}

export default function QuotesPage({ vertical = "insurance" }) {
  const { t } = useTranslation();
  const uid = useId();
  const accent = VERTICAL_ACCENT[vertical] || VERTICAL_ACCENT.insurance;
  const vKey = VERTICAL_ACCENT[vertical] ? vertical : "insurance";
  const badge = t(`quotes.${vKey}.badge`);
  const title = t(`quotes.${vKey}.title`);
  const blurb = t(`quotes.${vKey}.blurb`);
  const { isMobile } = useViewport();
  const loading = usePageLoad(450);
  const [dialog, { notify, confirm }] = useDialog();
  const me = getUser();

  const [tab, setTab] = useState("new"); // new | mine | history
  const [cats, setCats] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Canada");
  const [creditNo, setCreditNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myReqs, setMyReqs] = useState([]);
  const [historyReqs, setHistoryReqs] = useState([]);
  const [detail, setDetail] = useState(null); // active request detail
  const [countryHint, setCountryHint] = useState(null); // e.g. providers exist under a different country

  // Discovery: live provider preview + map location.
  const [matchedProviders, setMatchedProviders] = useState([]);
  const [userGeo, setUserGeo] = useState(null);
  const [addressLabel, setAddressLabel] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(null);
  // Property → Mortgage → Insurance funnel context (from Construct / Real Estate).
  const [propertyCtx, setPropertyCtx] = useState(null);
  const handoffAppliedRef = useRef(null);
  const [reRequestHint, setReRequestHint] = useState(null); // title of source request when pre-filling
  const [reRequestBusy, setReRequestBusy] = useState(false);
  const leaves = useMemo(() => flattenLeaves(cats), [cats]);
  const renewables = useMemo(() => historyReqs.filter(isRenewable), [historyReqs]);

  const loadCats = useCallback(() => { getQuoteCategories(vertical).then(setCats).catch(() => {}); }, [vertical]);
  const loadMine = useCallback(() => {
    getMyQuoteRequests().then((rows) => setMyReqs((rows || []).filter((r) => r.vertical === vertical))).catch(() => {});
  }, [vertical]);
  const loadHistory = useCallback(() => {
    getQuoteRequestHistory().then((rows) => setHistoryReqs((rows || []).filter((r) => r.vertical === vertical))).catch(() => setHistoryReqs([]));
  }, [vertical]);

  useEffect(() => {
    loadCats(); loadMine(); loadHistory();
    setSelectedCat(null); setDetail(null); setTab("new"); setMatchedProviders([]); setReRequestHint(null);
    handoffAppliedRef.current = null;
    const ctx = peekPropertyFinancing();
    if (!ctx) {
      setPropertyCtx(null);
      return;
    }
    // Keep context on mortgage for purchase journeys (incl. after submit → insurance step)
    // so the "Continue to insurance" CTA still works. Rentals skip mortgage entirely.
    if (vertical === "mortgage" && !ctx.isRental) setPropertyCtx(ctx);
    else if (vertical === "insurance") setPropertyCtx(ctx);
    else setPropertyCtx(null);
  }, [loadCats, loadMine, loadHistory, vertical]);

  // Auto-pick category + prefill form when property handoff is present.
  useEffect(() => {
    if (!propertyCtx || !leaves.length) return;
    // Only auto-open the form for the active funnel step (don't reopen mortgage after advance).
    if (propertyCtx.step !== vertical) return;
    const slug = preferredCategorySlug(vertical, propertyCtx);
    if (!slug) return;
    const applyKey = `${vertical}:${propertyCtx.property_id || propertyCtx.name}:${slug}`;
    if (handoffAppliedRef.current === applyKey) return;
    const cat = leaves.find((c) => c.slug === slug);
    if (!cat) return;
    handoffAppliedRef.current = applyKey;
    setSelectedCat(cat);
    setForm(buildFinancingFormPrefill(cat, propertyCtx));
    // Prefer a short city token — never dump the full address into City.
    const cityVal = String(propertyCtx.city || "").split(",")[0].trim();
    if (cityVal) setCity(cityVal);
    if (propertyCtx.country) setCountry(propertyCtx.country);
    // Single clean address line (sanitized handoff already dedupes).
    const addr = String(propertyCtx.addressLabel || propertyCtx.address || "").trim();
    if (addr) setAddressLabel(addr);
    const lat = Number(propertyCtx.lat);
    const lng = Number(propertyCtx.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setUserGeo({ lat, lng });
      try {
        setLocationItem("strug_user_lat", String(lat));
        setLocationItem("strug_user_lng", String(lng));
      } catch { /* ignore */ }
    }
    setTab("new");
  }, [propertyCtx, leaves, vertical]);

  // Seed the map from a previously-used location. No geolocation prompt here —
  // asking on mount is premature (review feedback); we wait for explicit intent below.
  useEffect(() => {
    const lat = parseFloat(getLocationItem("strug_user_lat") || "");
    const lng = parseFloat(getLocationItem("strug_user_lng") || "");
    if (Number.isFinite(lat) && Number.isFinite(lng)) setUserGeo({ lat, lng });
  }, []);

  // Ask the browser for location only once the user has expressed intent by picking a
  // category and a city, and only if we don't already have coordinates.
  const geoAskedRef = useRef(false);
  useEffect(() => {
    if (!selectedCat?.quote_category_id || !city.trim()) return;
    if (userGeo || geoAskedRef.current || !navigator.geolocation) return;
    geoAskedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [selectedCat?.quote_category_id, city, userGeo]);

  // Live provider preview when a category + city are set (same matching as submit). Debounced
  // so typing a city doesn't hammer the endpoint. If country filters everyone out, probe
  // without country and surface the countries providers actually serve (common Canada-default miss).
  useEffect(() => {
    if (!selectedCat?.quote_category_id || !city.trim()) {
      setMatchedProviders([]);
      setCountryHint(null);
      return undefined;
    }
    const handle = setTimeout(async () => {
      const category_id = selectedCat.quote_category_id;
      const cityVal = city.trim();
      const countryVal = country.trim() || undefined;
      try {
        const rows = await previewMatchingProviders({ category_id, city: cityVal, country: countryVal });
        const list = Array.isArray(rows) ? rows : [];
        setMatchedProviders(list);
        if (list.length || !countryVal) {
          setCountryHint(null);
          return;
        }
        const loose = await previewMatchingProviders({ category_id, city: cityVal });
        const looseList = Array.isArray(loose) ? loose : [];
        if (!looseList.length) {
          setCountryHint(null);
          return;
        }
        const countries = [...new Set(
          looseList.flatMap((p) => (p.quote_provider_city || [])
            .filter((c) => (c.city || "").toLowerCase() === cityVal.toLowerCase())
            .map((c) => c.country)
            .filter(Boolean)),
        )];
        setCountryHint({
          count: looseList.length,
          countries: countries.length ? countries : ["(check Coverage on the provider dashboard)"],
        });
      } catch {
        setMatchedProviders([]);
        setCountryHint(null);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [selectedCat?.quote_category_id, city, country]);

  function pickCategory(cat) {
    setSelectedCat(cat);
    setForm(propertyCtx ? buildFinancingFormPrefill(cat, propertyCtx) : {});
    setFieldErrors({});
    setReRequestHint(null);
  }

  // One-click renewal / re-request: open New request with the past row's data pre-filled.
  // History/detail embed quote_category.form_schema so renewal survives a retired category
  // without another categories round-trip. Fall back to live leaves, then a non-live fetch.
  async function reRequestFrom(row) {
    if (reRequestBusy) return;
    if (!row?.quote_request_id && !row?.category_id) return;
    setReRequestBusy(true);
    try {
      let source = row;
      // List rows should already include form_data; fetch detail if somehow missing.
      if (source.form_data == null && source.quote_request_id) {
        try { source = await getQuoteRequest(source.quote_request_id); }
        catch {
          notify({
            title: t("quotes.renew.loadFailedTitle", { defaultValue: "Couldn't load request" }),
            message: t("quotes.renew.loadFailedMessage", { defaultValue: "Try again from History." }),
            alertOnly: true,
          });
          return;
        }
      }
      const catId = Number(source.category_id);
      const embeddedQc = source.quote_category;
      const embeddedSchema = Array.isArray(embeddedQc?.form_schema) ? embeddedQc.form_schema : null;

      let cat = null;
      if (embeddedSchema && Number.isFinite(catId)) {
        // Prefer the schema the BE already hydrated onto history/detail (works even when
        // the category was later deactivated and filtered out of /quote-categories).
        cat = {
          quote_category_id: Number(embeddedQc.quote_category_id) || catId,
          name: embeddedQc.name || source.title || "",
          slug: embeddedQc.slug || null,
          vertical: embeddedQc.vertical || vertical,
          form_schema: embeddedSchema,
        };
      } else {
        cat = leaves.find((c) => Number(c.quote_category_id) === catId) || null;
        if (!cat && Number.isFinite(catId)) {
          try {
            const all = await getQuoteCategories(vertical, { live: false });
            cat = flattenLeaves(all).find((c) => Number(c.quote_category_id) === catId) || null;
          } catch { /* ignore */ }
        }
      }
      if (!cat) {
        notify({
          title: t("quotes.renew.categoryMissingTitle", { defaultValue: "Category unavailable" }),
          message: t("quotes.renew.categoryMissingMessage", { defaultValue: "That category is no longer available. Start a new request instead." }),
          alertOnly: true,
        });
        return;
      }
      const schema = Array.isArray(cat.form_schema) ? cat.form_schema : [];
      setSelectedCat({ ...cat, form_schema: schema });
      setForm(normalizeFormData(source.form_data, schema));
      setCity(source.city || "");
      setCountry(source.country || "Canada");
      setCreditNo(source.credit_number || "");
      setAddressLabel([source.city, source.country].filter(Boolean).join(", "));
      setReRequestHint(source.title || cat.name || "");
      setDetail(null);
      setSelectedProvider(null);
      setTab("new");
    } finally {
      setReRequestBusy(false);
    }
  }

  function applyAddressParts(val) {
    // "123 King St, Toronto, ON, Canada" → city Toronto, country Canada
    // "Islamabad, Islamabad Capital Territory, Pakistan" → city Islamabad, country Pakistan
    const parts = String(val || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    if (parts.length >= 2) {
      setCountry(parts[parts.length - 1]);
      setCity(parts.length >= 3 ? parts[parts.length - 3] : parts[0]);
    } else {
      setCity(parts[0]);
    }
  }

  async function submitRequest() {
    if (!selectedCat) return;
    if (!city.trim()) {
      notify({ title: t("quotes.notify.cityRequiredTitle"), message: t("quotes.notify.cityRequiredMessage"), alertOnly: true });
      return;
    }
    if (!country.trim()) {
      notify({
        title: t("quotes.notify.countryRequiredTitle", { defaultValue: "Country required" }),
        message: t("quotes.notify.countryRequiredMessage", { defaultValue: "Enter the country so providers in the right region can see your request." }),
        alertOnly: true,
      });
      return;
    }

    const schema = Array.isArray(selectedCat.form_schema) ? selectedCat.form_schema : [];
    let nextErrors = {};
    let blockMessage = null;

    if (vertical === "mortgage" || String(selectedCat.slug || "").startsWith("mortgage-")) {
      const check = validateMortgageFormClient(selectedCat, form, { country: country.trim() });
      nextErrors = check.fieldErrors;
      if (!check.ok) blockMessage = check.message;
    } else {
      const missing = schema.filter((f) => f.required && fieldEmpty(form[f.key])).map((f) => f.label);
      if (missing.length) {
        for (const f of schema) {
          if (f.required && fieldEmpty(form[f.key])) nextErrors[f.key] = "Required";
        }
        blockMessage = t("quotes.notify.missingFieldsMessage", { fields: missing.join(", ") });
      }
      for (const f of schema) {
        if (f.type !== "number" || fieldEmpty(form[f.key])) continue;
        const n = Number(String(form[f.key]).replace(/,/g, ""));
        if (!Number.isFinite(n)) nextErrors[f.key] = "Enter a valid number";
        else if (n < 0) nextErrors[f.key] = "Cannot be negative";
      }
      if (!blockMessage && Object.keys(nextErrors).length) {
        blockMessage = Object.values(nextErrors)[0];
      }
    }

    setFieldErrors(nextErrors);
    if (blockMessage || Object.keys(nextErrors).length) {
      notify({
        title: t("quotes.notify.missingFieldsTitle"),
        message: blockMessage || t("quotes.notify.missingFieldsMessage", { fields: Object.keys(nextErrors).join(", ") }),
        alertOnly: true,
      });
      return;
    }

    setSubmitting(true);
    try {
      const notes = financingNotes(propertyCtx) || undefined;
      const res = await createQuoteRequest({
        category_id: selectedCat.quote_category_id,
        city: city.trim(),
        country: country.trim(),
        form_data: form,
        credit_number: creditNo || undefined,
        notes,
        title: propertyCtx?.name
          ? `${selectedCat.name} — ${propertyCtx.name}`.slice(0, 200)
          : undefined,
      });
      setSelectedCat(null); setForm({}); setFieldErrors({}); setCreditNo(""); setReRequestHint(null); setAddressLabel("");
      // Keep journey alive so mortgage → insurance can continue after submit.
      if (propertyCtx && vertical === "mortgage") {
        const next = { ...propertyCtx, step: "insurance", mortgage_request_id: res.quote_request_id };
        savePropertyFinancing(next);
        setPropertyCtx(next);
      }
      loadMine();
      loadHistory();
      if (res.warning === "no_providers_in_area") {
        notify({ title: t("quotes.notify.requestSentTitle"), message: t("quotes.notify.noProvidersMessage"), alertOnly: true });
      } else {
        notify({
          title: t("quotes.notify.requestSentTitle"),
          message: t("quotes.notify.matchedProvidersMessage", { count: res.matched_provider_count, city: res.city }),
          alertOnly: true,
        });
      }
      openDetail(res.quote_request_id, "mine");
    } catch (e) {
      const apiErrors = e?.response?.data?.errors;
      if (Array.isArray(apiErrors) && apiErrors.length) {
        const mapped = {};
        for (const err of apiErrors) {
          if (err?.key) mapped[err.key] = err.message || "Invalid";
        }
        setFieldErrors(mapped);
      }
      notify({ title: t("quotes.notify.sendFailedTitle"), message: e?.response?.data?.message || t("quotes.notify.sendFailedMessage"), alertOnly: true });
    } finally { setSubmitting(false); }
  }

  async function openDetail(id, stayOnTab) {
    const nextTab = stayOnTab || (tab === "history" ? "history" : "mine");
    setTab(nextTab);
    try { setDetail(await getQuoteRequest(id)); } catch { setDetail(null); }
  }
  async function refreshDetail() {
    if (!detail) return;
    try {
      const next = await getQuoteRequest(detail.quote_request_id);
      setDetail(next);
      // Cancel / close moves the request into History — keep the detail open there.
      if (isPastRequest(next) && tab === "mine") setTab("history");
    } catch { /* */ }
    loadMine();
    loadHistory();
  }

  async function onContact(quote) {
    try {
      const opts = {};
      if (quote?.quote_id) opts.quote_id = quote.quote_id;
      else if (quote?.quote_provider?.quote_provider_id) opts.provider_id = quote.quote_provider.quote_provider_id;
      const ch = await contactProvider(detail.quote_request_id, "", opts);
      if (ch?.channel_id) { window.__openChatChannelId = ch.channel_id; window.__nav?.("messages"); }
    } catch (e) {
      notify({ title: t("quotes.notify.chatFailedTitle"), message: e?.response?.data?.message || t("quotes.notify.chatFailedMessage"), alertOnly: true });
    }
  }

  async function onCancelRequest() {
    if (!(await confirm({
      title: t("quotes.confirm.cancelRequestTitle"),
      message: t("quotes.confirm.cancelRequestMessage"),
      confirmLabel: t("quotes.confirm.cancelRequestLabel"),
      cancelLabel: t("quotes.confirm.keepLabel"),
      danger: true,
    }))) return;
    try { await cancelQuoteRequest(detail.quote_request_id); refreshDetail(); } catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); }
  }

  const pad = { paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, paddingTop: 20, paddingBottom: 24 };
  const myRequestsLabel = myReqs.length
    ? t("quotes.myRequestsWithCount", { count: myReqs.length })
    : t("quotes.myRequests");
  const historyLabel = historyReqs.length
    ? t("quotes.historyWithCount", { count: historyReqs.length, defaultValue: `History (${historyReqs.length})` })
    : t("quotes.history", { defaultValue: "History" });

  const tabBar = (active) => (
    <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", marginBottom: active === "new" ? 0 : 18, marginTop: active === "new" ? 16 : 0, flexWrap: "wrap" }}>
      <button onClick={() => { setTab("new"); setSelectedCat(null); setDetail(null); setReRequestHint(null); }} style={active === "new" ? btn(accent) : ghostBtn}>{t("quotes.newRequest")}</button>
      <button onClick={() => { setTab("mine"); setDetail(null); loadMine(); }} style={active === "mine" ? btn(accent) : ghostBtn}>{myRequestsLabel}</button>
      <button onClick={() => { setTab("history"); setDetail(null); loadHistory(); }} style={active === "history" ? btn(accent) : ghostBtn}>{historyLabel}</button>
    </div>
  );

  if (!me) return <div className="text-text-primary" style={pad}><h1 style={h1}>{title}</h1><p className="text-text-secondary">{t("quotes.signInRequired")}</p></div>;

  if (loading) {
    return (
      <div className="text-text-primary" style={pad}>
        <div className="skel" style={{ width: 260, height: 36, borderRadius: 8, marginBottom: 18 }} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel" style={{ height: 92, borderRadius: 14 }} />)}
        </div>
      </div>
    );
  }

  // ── "My requests" / detail: focused single-column layout (no map) ──
  if (tab === "mine" || tab === "history") {
    const isHistory = tab === "history";
    const list = isHistory ? historyReqs : myReqs;
    return (
      <div className="scroll-area text-text-primary" style={{ ...pad, flex: 1, overflowY: "auto", background: `radial-gradient(900px 460px at 50% -120px, ${accent}26, transparent 70%)` }}>
        {dialog}
        {tabBar(tab)}
        {propertyCtx && !detail && (
          <PropertyFinancingBanner
            ctx={propertyCtx}
            vertical={vertical}
            accent={accent}
            onDismiss={() => { clearPropertyFinancing(); setPropertyCtx(null); handoffAppliedRef.current = null; }}
            onContinueInsurance={vertical === "mortgage" ? () => continuePropertyFinancingToInsurance() : null}
            t={t}
          />
        )}
        {!detail ? (
          !list.length ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: "45vh", gap: 14 }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, fontSize: 34, background: `${accent}26`, border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>{vertical === "insurance" ? "🛡️" : "🏠"}</div>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 28, textTransform: "uppercase" }}>
                {isHistory
                  ? t("quotes.noHistoryYet", { defaultValue: "No past requests yet" })
                  : t("quotes.noRequestsYet")}
              </div>
              <p className="text-text-secondary" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 420, margin: 0 }}>
                {isHistory
                  ? t("quotes.noHistoryHint", { defaultValue: "Closed, cancelled, and expired requests will show up here." })
                  : t("quotes.noRequestsHint")}
              </p>
              {!isHistory && <button onClick={() => { setTab("new"); setSelectedCat(null); }} style={btn(accent)}>{t("quotes.newRequest")}</button>}
            </div>
          ) : (
            <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 12 }}>
              {isHistory && (
                <RenewBanner t={t} accent={accent} renewables={renewables} slice={3} onPick={reRequestFrom} busy={reRequestBusy} />
              )}
              {isHistory && (
                <p className="text-text-secondary" style={{ margin: "0 0 4px", fontSize: 13, textAlign: "center", lineHeight: 1.45 }}>
                  {t("quotes.historyBlurb", { defaultValue: "Closed, cancelled, and expired requests. Re-request any of them without retyping." })}
                </p>
              )}
              {list.map((r) => {
                const renew = isRenewable(r);
                return (
                  <div key={r.quote_request_id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => openDetail(r.quote_request_id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "inherit", flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div>
                      <div className="text-text-secondary" style={{ fontSize: 12, marginTop: 4 }}>{r.city} · {r.quote_category?.name}</div>
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ textAlign: "right" }}>
                        <span style={pill(accent)}>{statusLabel(t, r.status)}</span>
                        <div className="text-text-secondary" style={{ fontSize: 12, marginTop: 6 }}>{t("quotes.quoteCount", { count: r.quote_count || 0 })}</div>
                      </div>
                      {isHistory && (
                        <button type="button" disabled={reRequestBusy} onClick={() => reRequestFrom(r)} style={renew ? btn(accent, reRequestBusy) : { ...ghostBtn, opacity: reRequestBusy ? 0.6 : 1, cursor: reRequestBusy ? "not-allowed" : "pointer" }}>
                          {renew
                            ? t("quotes.renew.renewNow", { defaultValue: "Renew now" })
                            : t("quotes.renew.requestAgain", { defaultValue: "Request again" })}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <RequestDetail
            detail={detail}
            accent={accent}
            isMobile={isMobile}
            fromHistory={isHistory || isPastRequest(detail)}
            onBack={() => setDetail(null)}
            onContact={onContact}
            onCancelRequest={onCancelRequest}
            onChanged={refreshDetail}
            onReRequest={isPastRequest(detail) ? () => reRequestFrom(detail) : undefined}
            reRequestBusy={reRequestBusy}
            notify={notify}
            confirm={confirm}
            propertyCtx={propertyCtx}
            vertical={vertical}
            onContinueInsurance={() => continuePropertyFinancingToInsurance()}
          />
        )}
      </div>
    );
  }

  // ── "New request": on-demand-style discovery (category → form) with map + provider rails ──
  const formBody = (
    <>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ display: "inline-block", padding: "5px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accent, background: `${accent}1f`, border: `1px solid ${accent}55`, fontFamily: "'DM Sans'", marginBottom: 14 }}>
          {vertical === "insurance" ? `🛡️ ${badge}` : `🏠 ${badge}`}
        </div>
        <h1 style={{ ...h1, fontSize: isMobile ? 28 : 34, backgroundImage: `linear-gradient(100deg, #fff 30%, ${accent})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{title}</h1>
        <p className="text-text-secondary" style={{ maxWidth: 520, margin: "10px auto 0", fontSize: 14, lineHeight: 1.6 }}>{blurb}</p>
        {tabBar("new")}
      </div>

      {propertyCtx && (
        <PropertyFinancingBanner
          ctx={propertyCtx}
          vertical={vertical}
          accent={accent}
          onDismiss={() => { clearPropertyFinancing(); setPropertyCtx(null); handoffAppliedRef.current = null; }}
          onContinueInsurance={vertical === "mortgage" ? () => continuePropertyFinancingToInsurance() : null}
          t={t}
        />
      )}

      {!selectedCat && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560, margin: "0 auto", ["--accent"]: accent }}>
          <RenewBanner
            t={t}
            accent={accent}
            renewables={renewables}
            slice={2}
            onPick={reRequestFrom}
            busy={reRequestBusy}
            onSeeAll={() => { setTab("history"); setDetail(null); loadHistory(); }}
          />
          <div style={{ ...label, textAlign: "center", color: accent, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>{t("quotes.pickCategory")}</div>
          {leaves.map((c) => (
            <button key={c.quote_category_id} onClick={() => pickCategory(c)} style={{ ...card, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 14, border: `1px solid ${accent}33`, background: `linear-gradient(120deg, ${accent}12, rgba(255,255,255,0.05))` }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, background: `${accent}26`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{vertical === "insurance" ? "🛡️" : "🏠"}</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</span>
              <span style={{ marginLeft: "auto", color: accent, fontSize: 20, fontWeight: 700 }}>›</span>
            </button>
          ))}
          {!leaves.length && <p className="text-text-secondary" style={{ textAlign: "center" }}>{t("quotes.noCategories")}</p>}
        </div>
      )}

      {selectedCat && (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <button onClick={() => { setSelectedCat(null); setReRequestHint(null); }} style={{ ...ghostBtn, marginBottom: 12 }}>{t("quotes.back")}</button>
          {reRequestHint && (
            <div className="text-text-secondary" style={{ background: `${accent}14`, border: `1px solid ${accent}44`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontFamily: "'DM Sans'", fontSize: 13, lineHeight: 1.45 }}>
              {t("quotes.renew.prefillHint", {
                title: reRequestHint,
                defaultValue: `Pre-filled from “${reRequestHint}”. Review the details, then send to providers.`,
              })}
            </div>
          )}
          {matchedProviders.length > 0 && (
            <div className="text-text-secondary" style={{ background: `${accent}12`, border: `1px solid ${accent}33`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontFamily: "'DM Sans'", fontSize: 13 }}>
              <strong style={{ color: accent }}>{t("quotes.providersCount", { count: matchedProviders.length, defaultValue: `${matchedProviders.length} providers` })}</strong>{" "}
              {t("quotes.providersInAreaHint", { city: city || t("quotes.yourArea", { defaultValue: "your area" }), defaultValue: `in ${city || "your area"} — they appear on the left and right. Submit to send your request and compare quotes.` })}
            </div>
          )}
          <div style={{ ...card }}>
            <h2 style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: isMobile ? "center" : "left" }}>{selectedCat.name}</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={label} htmlFor={`${uid}-addr`}>{t("quotes.addressOrCity", { defaultValue: "Address / city" })} *</label>
                <AddressAutocomplete
                  inputId={`${uid}-addr`}
                  value={addressLabel}
                  useLocation
                  wrapStyle={{ width: "100%" }}
                  onChange={(val, lat, lng) => {
                    setAddressLabel(val);
                    applyAddressParts(val);
                    if (lat != null && lng != null) {
                      setUserGeo({ lat: Number(lat), lng: Number(lng) });
                      try {
                        setLocationItem("strug_user_lat", String(lat));
                        setLocationItem("strug_user_lng", String(lng));
                      } catch { /* ignore quota */ }
                    }
                  }}
                  placeholder={t("quotes.cityPlaceholder")}
                  inputStyle={{ ...input, minHeight: 48, lineHeight: "22px", fontWeight: 600, border: "1.5px solid rgba(255,255,255,0.18)" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div><label style={label} htmlFor={`${uid}-city`}>{t("quotes.city")} *</label><input id={`${uid}-city`} style={input} value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("quotes.cityPlaceholder")} /></div>
                <div><label style={label} htmlFor={`${uid}-country`}>{t("quotes.country")} *</label><input id={`${uid}-country`} style={input} value={country} onChange={(e) => setCountry(e.target.value)} /></div>
              </div>
              {countryHint && (
                <div className="text-text-secondary" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 12, padding: "10px 14px", fontFamily: "'DM Sans'", fontSize: 13, lineHeight: 1.45 }}>
                  {t("quotes.countryMismatchHint", {
                    count: countryHint.count,
                    countries: countryHint.countries.join(", "),
                    defaultValue: `${countryHint.count} provider(s) serve this city under ${countryHint.countries.join(", ")} — change Country to match, or they won't see your request.`,
                  })}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {countryHint.countries.filter((c) => c && !c.startsWith("(")).map((c) => (
                      <button key={c} type="button" onClick={() => setCountry(c)} style={{ ...ghostBtn, borderColor: "rgba(245,158,11,0.45)", color: "#fbbf24" }}>
                        {t("quotes.useCountry", { country: c, defaultValue: `Use ${c}` })}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(Array.isArray(selectedCat.form_schema) ? selectedCat.form_schema : []).map((f) => {
                const required = !!(f.required || (selectedCat.slug === "mortgage-new-purchase" && f.key === "amortization_years"));
                const err = fieldErrors[f.key];
                const dpHint = f.key === "down_payment"
                  ? downPaymentHint(form.property_price, form.down_payment, country)
                  : null;
                return (
                <div key={f.key}>
                  <label style={label} htmlFor={`${uid}-f-${f.key}`}>{f.label}{required ? " *" : ""}</label>
                  {f.type === "select" ? (() => {
                    const fieldVal = form[f.key] != null ? decodeHtmlEntities(String(form[f.key])) : "";
                    const opts = schemaOptions(f);
                    const orphan = fieldVal && !opts.includes(fieldVal);
                    return (
                      <select
                        id={`${uid}-f-${f.key}`}
                        style={{ ...input, borderColor: err ? "rgba(248,113,113,0.7)" : undefined }}
                        value={fieldVal}
                        onChange={(e) => {
                          setForm((s) => ({ ...s, [f.key]: e.target.value }));
                          setFieldErrors((prev) => { const n = { ...prev }; delete n[f.key]; return n; });
                        }}
                      >
                        <option value="">{t("quotes.select")}</option>
                        {orphan && <option value={fieldVal}>{fieldVal}</option>}
                        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    );
                  })() : (
                    <input
                      id={`${uid}-f-${f.key}`}
                      style={{ ...input, borderColor: err ? "rgba(248,113,113,0.7)" : undefined }}
                      type={f.type === "number" ? "number" : "text"}
                      min={f.type === "number" ? "0" : undefined}
                      step={f.type === "number" ? "any" : undefined}
                      value={form[f.key] ?? ""}
                      onChange={(e) => {
                        setForm((s) => ({ ...s, [f.key]: e.target.value }));
                        setFieldErrors((prev) => { const n = { ...prev }; delete n[f.key]; return n; });
                      }}
                    />
                  )}
                  {err && <p style={{ fontSize: 12, color: "#f87171", margin: "6px 0 0" }}>{err}</p>}
                  {!err && dpHint && <p className="text-text-secondary" style={{ fontSize: 11, margin: "6px 0 0", lineHeight: 1.4 }}>{dpHint}</p>}
                </div>
                );
              })}
              <div>
                <label style={label} htmlFor={`${uid}-credit`}>{t("quotes.creditRef")}</label>
                <input id={`${uid}-credit`} style={input} value={creditNo} onChange={(e) => setCreditNo(e.target.value)} placeholder={t("quotes.creditPlaceholder")} />
                <p className="text-text-secondary" style={{ fontSize: 11, margin: "6px 0 0" }}>{t("quotes.creditHint")}</p>
                <p className="text-text-muted" style={{ fontSize: 11, margin: "8px 0 0", lineHeight: 1.4 }}>
                  {t("quotes.privacyNote", {
                    defaultValue: "Sensitive details (credit reference, income range, credit score range) are shared only with matched providers for this request and retained while the request is active.",
                  })}
                </p>
              </div>
              <button disabled={submitting} onClick={submitRequest} style={btn(accent, submitting)}>{submitting ? t("quotes.sending") : t("quotes.sendToProviders")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const mapPanel = (
    <QuoteAreaMap userGeo={userGeo} accent={accent} addressLabel={addressLabel || city} providers={matchedProviders} onSelect={setSelectedProvider} t={t} />
  );

  // ── MOBILE: map + provider strip live inside the scroll area so they move with content ──
  if (isMobile) {
    return (
      <div className="text-text-primary" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {dialog}
        <div className="scroll-area" style={{ flex: 1, overflowY: "auto", padding: "0 16px 90px" }}>
          <div style={{ height: selectedCat ? "26vh" : "34vh", minHeight: selectedCat ? 180 : 230, margin: "0 -16px 16px", overflow: "hidden", position: "relative" }}>
            {mapPanel}
          </div>
          {selectedCat && matchedProviders.length > 0 && (
            <ProviderSidebar providers={matchedProviders} accent={accent} horizontal onSelect={setSelectedProvider} t={t} />
          )}
          {formBody}
        </div>
        <ProviderInfoModal provider={selectedProvider} accent={accent} onClose={() => setSelectedProvider(null)} t={t} />
      </div>
    );
  }

  // ── DESKTOP: 3 columns — providers | map + form | providers ──
  return (
    <div className="text-text-primary" style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden", paddingLeft: 108 }}>
      {dialog}
      <ProviderSidebar providers={matchedProviders} accent={accent} onSelect={setSelectedProvider} t={t} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        <div className="scroll-area" style={{ flex: 1, overflowY: "auto", padding: "0 40px 80px", background: `radial-gradient(700px 320px at 50% -80px, ${accent}18, transparent 70%)` }}>
          <div style={{ height: "38vh", minHeight: 220, margin: "0 -40px 24px", overflow: "hidden", position: "relative" }}>
            {mapPanel}
          </div>
          {formBody}
        </div>
      </div>
      <ProviderSidebar providers={matchedProviders} accent={accent} onSelect={setSelectedProvider} t={t} />
      <ProviderInfoModal provider={selectedProvider} accent={accent} onClose={() => setSelectedProvider(null)} t={t} />
    </div>
  );
}

// ── Property funnel banner (Construct / Real Estate → quotes) ────────────────
function PropertyFinancingBanner({ ctx, vertical, accent, onDismiss, onContinueInsurance, t }) {
  if (!ctx) return null;
  const price = ctx.price != null ? `$${Number(ctx.price).toLocaleString()}` : null;
  const stepMortgageDone = vertical === "insurance" || ctx.step === "insurance" || ctx.mortgage_request_id;
  return (
    <div style={{ maxWidth: 560, margin: "0 auto 18px", background: `linear-gradient(120deg, ${accent}18, rgba(255,255,255,0.05))`, border: `1px solid ${accent}44`, borderRadius: 14, padding: "14px 16px", textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: accent, marginBottom: 6, fontFamily: "'DM Sans'" }}>
            {t("financing.linkedProperty", { defaultValue: "Linked property" })}
          </div>
          <div className="text-text-primary" style={{ fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.name}</div>
          <div className="text-text-secondary" style={{ fontSize: 12, marginTop: 4, fontFamily: "'DM Sans'" }}>
            {[ctx.city, ctx.province, price].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button type="button" onClick={onDismiss} style={{ ...ghostBtn, padding: "6px 10px", fontSize: 11, flexShrink: 0 }} aria-label={t("common.dismiss", { defaultValue: "Dismiss" })}>
          {t("financing.clearLink", { defaultValue: "Clear" })}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <JourneyChip done label={t("financing.stepProperty", { defaultValue: "Property" })} />
        <span className="text-text-muted">→</span>
        <JourneyChip done={stepMortgageDone} active={vertical === "mortgage"} color="#14b8a6" label={t("financing.stepMortgage", { defaultValue: "Mortgage" })} />
        <span className="text-text-muted">→</span>
        <JourneyChip done={false} active={vertical === "insurance"} color="#0ea5e9" label={t("financing.stepInsurance", { defaultValue: "Insurance" })} />
      </div>
      {vertical === "mortgage" && onContinueInsurance && (
        <button type="button" onClick={onContinueInsurance} style={{ ...ghostBtn, marginTop: 12, borderColor: "#0ea5e955", color: "#0ea5e9", width: "100%" }}>
          {t("financing.skipToInsurance", { defaultValue: "Skip ahead to home insurance →" })}
        </button>
      )}
      <p className="text-text-secondary" style={{ margin: "10px 0 0", fontSize: 12, fontFamily: "'DM Sans'", lineHeight: 1.45 }}>
        {vertical === "mortgage"
          ? t("financing.prefillMortgageHint", { defaultValue: "We pre-filled New Purchase with this property’s price and location. Adjust anything, then send to lenders." })
          : t("financing.prefillInsuranceHint", { defaultValue: "We pre-filled Home Insurance with this property’s value and city. Send to providers to compare." })}
      </p>
    </div>
  );
}

function JourneyChip({ label, color = "#2563eb", active, done }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999,
      fontFamily: "'DM Sans'", fontSize: 11, fontWeight: 700,
      background: done || active ? `${color}22` : "rgba(255,255,255,0.06)",
      color: done || active ? color : "rgba(255,255,255,0.4)",
      border: `1px solid ${done || active ? `${color}55` : "rgba(255,255,255,0.1)"}`,
    }}>
      {done ? "✓ " : ""}{label}
    </span>
  );
}

// ── Request detail (compare quotes, book, manage appointment, close, review) ─
function RequestDetail({ detail, accent, isMobile, fromHistory, onBack, onContact, onCancelRequest, onChanged, onReRequest, reRequestBusy, notify, confirm, propertyCtx, vertical, onContinueInsurance }) {
  const { t } = useTranslation();
  const uid = useId();
  const [bookingQuote, setBookingQuote] = useState(null);
  const [slots, setSlots] = useState([]);
  const [chosenSlot, setChosenSlot] = useState(null);
  const [proposeTime, setProposeTime] = useState("");
  const [meetingType, setMeetingType] = useState("video");
  const [busy, setBusy] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const quotes = detail.quote || [];
  const activeQuotes = quotes.filter((q) => !["withdrawn", "closed", "revised"].includes(q.status));
  const appt = (detail.quote_appointment || []).filter((a) => a.status !== "cancelled").slice(-1)[0];
  const isClosed = detail.status === "deal_closed";
  const canManage = ["quoted", "appointment_set"].includes(detail.status);
  const myReview = detail.my_review || null;
  const selectedQuote = quotes.find((q) => q.quote_id === detail.selected_quote_id) || quotes.find((q) => q.status === "selected");
  const bestAmount = activeQuotes.reduce((min, q) => (q.amount != null && (min == null || q.amount < min) ? q.amount : min), null);
  const renew = isRenewable(detail);

  // Collect detail keys across quotes for the comparison matrix.
  const detailKeys = useMemo(() => {
    const keys = new Set();
    (detail.quote || []).forEach((q) => {
      if (["withdrawn", "closed", "revised"].includes(q.status)) return;
      if (q.details && typeof q.details === "object") Object.keys(q.details).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }, [detail.quote]);

  async function startBooking(q) {
    setBookingQuote(q); setChosenSlot(null); setProposeTime(""); setSlots([]);
    try { setSlots(await getQuoteAvailability(detail.quote_request_id, q.quote_id)); } catch { /* */ }
  }
  async function doBook() {
    if (!chosenSlot && !proposeTime) {
      notify({ title: t("quotes.notify.pickTimeTitle"), message: t("quotes.notify.pickTimeMessage"), alertOnly: true });
      return;
    }
    setBusy(true);
    try {
      await bookAppointment(detail.quote_request_id, { quote_id: bookingQuote.quote_id, availability_id: chosenSlot || undefined, scheduled_at: chosenSlot ? undefined : new Date(proposeTime).toISOString(), meeting_type: meetingType });
      setBookingQuote(null); onChanged();
    } catch (e) { notify({ title: t("quotes.notify.bookFailedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); } finally { setBusy(false); }
  }
  async function act(fn, okMsg) {
    setBusy(true);
    try { await fn(); if (okMsg) notify({ title: okMsg, message: "", alertOnly: true }); onChanged(); }
    catch (e) { notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true }); } finally { setBusy(false); }
  }
  async function submitReview() {
    if (!(reviewRating >= 1 && reviewRating <= 5)) {
      notify({ title: t("quotes.review.ratingRequired", { defaultValue: "Pick a rating" }), message: t("quotes.review.ratingRequiredMsg", { defaultValue: "Please choose 1–5 stars." }), alertOnly: true });
      return;
    }
    setReviewBusy(true);
    try {
      await reviewQuoteDeal(detail.quote_request_id, { rating: reviewRating, comment: reviewComment || undefined });
      notify({ title: t("quotes.review.thanks", { defaultValue: "Thanks for your review" }), message: "", alertOnly: true });
      onChanged();
    } catch (e) {
      notify({ title: t("quotes.notify.failedTitle"), message: e?.response?.data?.message || "", alertOnly: true });
    } finally { setReviewBusy(false); }
  }

  const backLabel = fromHistory
    ? t("quotes.backToHistory", { defaultValue: "← History" })
    : t("quotes.backToMine");

  return (
    <div style={{ maxWidth: compareMode ? 1100 : 820, margin: "0 auto", transition: "max-width 0.2s ease" }}>
      <button onClick={onBack} style={{ ...ghostBtn, marginBottom: 16 }}>{backLabel}</button>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 24, margin: 0, textTransform: "uppercase" }}>{detail.title}</h2>
            <div className="text-text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{detail.city}{detail.country ? `, ${detail.country}` : ""} · {detail.quote_category?.name}</div>
          </div>
          <span style={pill(accent)}>{statusLabel(t, detail.status)}</span>
        </div>
        {["open", "quoted"].includes(detail.status) && (
          <button onClick={onCancelRequest} style={{ ...ghostBtn, marginTop: 14, color: "#f87171", borderColor: "#f8717155" }}>{t("quotes.detail.cancelRequest")}</button>
        )}
        {onReRequest && (
          <div style={{ marginTop: 14 }}>
            {renew && (
              <p className="text-text-secondary" style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.45 }}>
                {t("quotes.renew.detailHint", { defaultValue: "This deal closed ~10+ months ago — renew with the same details in one click." })}
              </p>
            )}
            <button type="button" disabled={reRequestBusy} onClick={onReRequest} style={renew ? btn(accent, reRequestBusy) : { ...ghostBtn, opacity: reRequestBusy ? 0.6 : 1, cursor: reRequestBusy ? "not-allowed" : "pointer" }}>
              {renew
                ? t("quotes.renew.renewNow", { defaultValue: "Renew now" })
                : t("quotes.renew.requestAgain", { defaultValue: "Request again" })}
            </button>
          </div>
        )}
      </div>

      {vertical === "mortgage" && propertyCtx && onContinueInsurance && (
        <div style={{ ...card, marginBottom: 16, borderColor: "#0ea5e955", background: "linear-gradient(120deg, rgba(14,165,233,0.14), rgba(255,255,255,0.04))" }}>
          <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 800, fontSize: 20, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            {t("financing.nextStepTitle", { defaultValue: "Next: protect the home" })}
          </div>
          <p className="text-text-secondary" style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.5, fontFamily: "'DM Sans'" }}>
            {t("financing.nextStepBody", {
              name: propertyCtx.name,
              defaultValue: `While lenders respond, get home insurance quotes for ${propertyCtx.name} — city and value stay filled in.`,
            })}
          </p>
          <button type="button" onClick={onContinueInsurance} style={btn("#0ea5e9")}>
            {t("financing.nextStepCta", { defaultValue: "Continue to insurance quotes →" })}
          </button>
        </div>
      )}

      {isPastRequest(detail) && detail.form_data && typeof detail.form_data === "object" && !Array.isArray(detail.form_data) && Object.keys(detail.form_data).length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{t("quotes.renew.savedDetails", { defaultValue: "Saved details" })}</div>
          <div className="text-text-secondary" style={{ display: "grid", gap: 6, fontSize: 13 }}>
            {Object.entries(detail.form_data).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span className="text-text-muted" style={{ textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
                <span className="text-text-primary" style={{ fontWeight: 600 }}>{v == null || v === "" ? "—" : decodeHtmlEntities(String(v))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {appt && (
        <div style={{ ...card, marginBottom: 16, borderColor: `${accent}55` }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("quotes.detail.appointment")} · {appt.status}</div>
          <div className="text-text-secondary" style={{ fontSize: 13 }}>{fmtDate(appt.scheduled_at)}{appt.meeting_type ? ` · ${appt.meeting_type}` : ""}</div>
          {!isClosed && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {appt.status === "proposed" && <button disabled={busy} onClick={() => act(() => confirmAppointment(detail.quote_request_id), t("quotes.notify.confirmedTitle"))} style={btn(accent, busy)}>{t("quotes.detail.confirmTime")}</button>}
              <button disabled={busy} onClick={() => act(() => closeDeal(detail.quote_request_id), t("quotes.notify.dealClosedTitle"))} style={btn("#16a34a", busy)}>{t("quotes.detail.markDealDone")}</button>
              <button disabled={busy} onClick={async () => { if (await confirm({ title: t("quotes.confirm.cancelAppointmentTitle"), message: t("quotes.confirm.cancelAppointmentMessage"), confirmLabel: t("quotes.confirm.cancelItLabel"), cancelLabel: t("quotes.confirm.keepLabel"), danger: true })) act(() => cancelAppointment(detail.quote_request_id)); }} style={ghostBtn}>{t("quotes.detail.cancelAppointment")}</button>
            </div>
          )}
        </div>
      )}

      {/* Review the selected provider after deal close */}
      {isClosed && selectedQuote && (
        <div style={{ ...card, marginBottom: 16, borderColor: myReview ? "rgba(255,255,255,0.1)" : `${accent}55` }}>
          {myReview ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("quotes.review.yourReview", { defaultValue: "Your review" })}</div>
              <div style={{ color: "#f59e0b", fontSize: 18, letterSpacing: 2 }}>{"★".repeat(Math.round(myReview.rating))}{"☆".repeat(5 - Math.round(myReview.rating))}</div>
              {myReview.comment && <p className="text-text-secondary" style={{ fontSize: 13, margin: "8px 0 0" }}>{myReview.comment}</p>}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{t("quotes.review.rateProvider", { defaultValue: "Rate your provider" })}</div>
              <p className="text-text-secondary" style={{ fontSize: 13, margin: "0 0 12px" }}>
                {selectedQuote.quote_provider?.business_name || t("quotes.detail.providerFallback")}
              </p>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setReviewRating(n)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 28, lineHeight: 1, color: n <= reviewRating ? "#f59e0b" : "rgba(255,255,255,0.2)", padding: 0 }}>★</button>
                ))}
              </div>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value.slice(0, 500))}
                rows={2}
                placeholder={t("quotes.review.commentPlaceholder", { defaultValue: "Optional comment…" })}
                style={{ ...input, resize: "vertical", marginBottom: 12, textAlign: "left" }}
              />
              <button disabled={reviewBusy || !reviewRating} onClick={submitReview} style={btn(accent, reviewBusy || !reviewRating)}>
                {reviewBusy ? t("quotes.review.sending", { defaultValue: "Sending…" }) : t("quotes.review.submit", { defaultValue: "Submit review" })}
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ ...label, fontSize: 13, margin: 0 }}>{t("quotes.detail.quotesHeading", { count: quotes.length })}</div>
        {activeQuotes.length >= 2 && (
          <button onClick={() => setCompareMode((v) => !v)} style={compareMode ? btn(accent) : ghostBtn}>
            {compareMode
              ? t("quotes.compare.hide", { defaultValue: "Hide comparison" })
              : t("quotes.compare.show", { defaultValue: "Compare side-by-side" })}
          </button>
        )}
      </div>

      {/* Side-by-side comparison matrix */}
      {compareMode && activeQuotes.length >= 2 && (
        <div style={{ ...card, marginBottom: 16, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 520 : 640, fontFamily: "'DM Sans'", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="bg-surface-raised text-text-muted" style={{ textAlign: "left", padding: "14px 16px", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)", position: "sticky", left: 0 }}>
                  {t("quotes.compare.feature", { defaultValue: "Feature" })}
                </th>
                {activeQuotes.map((q) => (
                  <th key={q.quote_id} className="text-text-primary" style={{ textAlign: "center", padding: "14px 12px", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.08)", minWidth: 140, background: q.status === "selected" ? `${accent}18` : "transparent" }}>
                    <div>{q.quote_provider?.business_name || t("quotes.detail.providerFallback")}</div>
                    {q.quote_provider?.rating != null && <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, marginTop: 4 }}>★ {Number(q.quote_provider.rating).toFixed(1)}</div>}
                    {q.status === "selected" && <div style={{ ...pill(accent), marginTop: 6 }}>{t("quotes.detail.selected")}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="bg-surface-raised text-text-secondary" style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", left: 0 }}>{t("quotes.compare.price", { defaultValue: "Price" })}</td>
                {activeQuotes.map((q) => {
                  const isBest = bestAmount != null && q.amount === bestAmount;
                  return (
                    <td key={q.quote_id} style={{ padding: "12px 12px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 800, fontSize: 16, color: isBest ? accent : "#fff" }}>
                      {fmtMoney(q)}
                      {isBest && <div style={{ fontSize: 10, fontWeight: 700, color: accent, marginTop: 2 }}>{t("quotes.compare.bestValue", { defaultValue: "Best value" })}</div>}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="bg-surface-raised text-text-secondary" style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", left: 0 }}>{t("quotes.compare.type", { defaultValue: "Type" })}</td>
                {activeQuotes.map((q) => (
                  <td key={q.quote_id} className="text-text-secondary" style={{ padding: "12px 12px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", textTransform: "capitalize" }}>
                    {q.quote_provider?.provider_type || "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="bg-surface-raised text-text-secondary" style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", left: 0 }}>{t("quotes.compare.validUntil", { defaultValue: "Valid until" })}</td>
                {activeQuotes.map((q) => (
                  <td key={q.quote_id} className="text-text-secondary" style={{ padding: "12px 12px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 12 }}>
                    {q.valid_until ? fmtDate(q.valid_until) : "—"}
                  </td>
                ))}
              </tr>
              {detailKeys.map((key) => (
                <tr key={key}>
                  <td className="bg-surface-raised text-text-secondary" style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", left: 0, textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</td>
                  {activeQuotes.map((q) => (
                    <td key={q.quote_id} className="text-text-secondary" style={{ padding: "12px 12px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {q.details?.[key] != null ? String(q.details[key]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="bg-surface-raised text-text-secondary" style={{ padding: "12px 16px", position: "sticky", left: 0 }}>{t("quotes.compare.note", { defaultValue: "Note" })}</td>
                {activeQuotes.map((q) => (
                  <td key={q.quote_id} className="text-text-secondary" style={{ padding: "12px 12px", textAlign: "center", fontSize: 12, maxWidth: 160 }}>
                    {q.note || "—"}
                  </td>
                ))}
              </tr>
              {!isClosed && canManage && !appt && (
                <tr>
                  <td className="bg-surface-raised text-text-secondary" style={{ padding: "14px 16px", position: "sticky", left: 0 }}>{t("quotes.compare.action", { defaultValue: "Action" })}</td>
                  {activeQuotes.map((q) => (
                    <td key={q.quote_id} style={{ padding: "14px 12px", textAlign: "center" }}>
                      <button onClick={() => { setCompareMode(false); startBooking(q); }} style={{ ...btn(accent), padding: "8px 12px", fontSize: 12 }}>{t("quotes.detail.selectAndBook")}</button>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {!quotes.length && <p className="text-text-secondary">{t("quotes.detail.noQuotesYet")}</p>}
        {quotes.map((q) => {
          const dead = ["withdrawn", "closed", "revised"].includes(q.status);
          const isBest = !dead && bestAmount != null && q.amount === bestAmount && activeQuotes.length >= 2;
          return (
            <div key={q.quote_id} style={{ ...card, opacity: dead ? 0.5 : 1, borderColor: q.status === "selected" ? `${accent}88` : isBest ? `${accent}44` : "rgba(255,255,255,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{q.quote_provider?.business_name || t("quotes.detail.providerFallback")} <span className="text-text-secondary" style={{ fontSize: 11 }}>· {q.quote_provider?.provider_type}</span></div>
                    {q.quote_provider?.rating != null && <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>★ {Number(q.quote_provider.rating).toFixed(1)}</span>}
                    {q.quote_provider?.license_no && <span style={pill(accent)}>{t("quotes.provider.licensed", { defaultValue: "Licensed" })}</span>}
                    {isBest && <span style={pill("#22c55e")}>{t("quotes.compare.bestValue", { defaultValue: "Best value" })}</span>}
                    {q.quote_provider?.quote_provider_id && (
                      <SaveButton
                        entityType="quote_provider"
                        entityId={q.quote_provider.quote_provider_id}
                        meta={{
                          title: q.quote_provider.business_name || "Provider",
                          sub: q.quote_provider.provider_type || "agent",
                          price: fmtMoney(q),
                          accent,
                        }}
                        size={28}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: accent, marginTop: 4 }}>{fmtMoney(q)}</div>
                  {q.note && <div className="text-text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{q.note}</div>}
                  {q.details && typeof q.details === "object" && (
                    <div className="text-text-secondary" style={{ fontSize: 12, marginTop: 6 }}>{Object.entries(q.details).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
                  )}
                  {q.valid_until && <div className="text-text-secondary" style={{ fontSize: 11, marginTop: 6 }}>{t("quotes.detail.validUntil", { date: fmtDate(q.valid_until) })}</div>}
                  {q.status === "selected" && <span style={{ ...pill(accent), marginTop: 8 }}>{t("quotes.detail.selected")}</span>}
                </div>
                {!dead && !isClosed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {canManage && !appt && <button onClick={() => startBooking(q)} style={btn(accent)}>{t("quotes.detail.selectAndBook")}</button>}
                    <button onClick={() => onContact(q)} style={ghostBtn}>{t("quotes.detail.requestMoreInfo")}</button>
                  </div>
                )}
              </div>

              {bookingQuote?.quote_id === q.quote_id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ ...label }}>{t("quotes.detail.pickAvailableTime")}</div>
                  {slots.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {slots.map((s) => (
                        <button key={s.quote_provider_availability_id} onClick={() => { setChosenSlot(s.quote_provider_availability_id); setProposeTime(""); }} style={chosenSlot === s.quote_provider_availability_id ? btn(accent) : ghostBtn}>{fmtDate(s.slot_start)}</button>
                      ))}
                    </div>
                  ) : <p className="text-text-secondary" style={{ fontSize: 12 }}>{t("quotes.detail.noPublishedSlots")}</p>}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div><label style={label} htmlFor={`${uid}-propose`}>{t("quotes.detail.proposeTime")}</label><input id={`${uid}-propose`} style={input} type="datetime-local" value={proposeTime} onChange={(e) => { setProposeTime(e.target.value); setChosenSlot(null); }} /></div>
                    <div><label style={label} htmlFor={`${uid}-meeting`}>{t("quotes.detail.meetingType")}</label><select id={`${uid}-meeting`} style={input} value={meetingType} onChange={(e) => setMeetingType(e.target.value)}><option value="video">{t("quotes.detail.meetingVideo")}</option><option value="phone">{t("quotes.detail.meetingPhone")}</option><option value="in_person">{t("quotes.detail.meetingInPerson")}</option></select></div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={busy} onClick={doBook} style={btn(accent, busy)}>{busy ? t("quotes.detail.booking") : t("quotes.detail.bookAppointment")}</button>
                    <button onClick={() => setBookingQuote(null)} style={ghostBtn}>{t("quotes.detail.cancel")}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { QuotesPage };
