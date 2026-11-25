import i18n from '../i18n/index.js';
import React, { useEffect, useRef, useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { Skel } from "../components/skeletons.jsx";
import { AddressAutocomplete } from "../components/shared.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import LiveTrackingMap from "../components/LiveTrackingMap.jsx";
import SmoothMarker from "../components/SmoothMarker.jsx";
import { connectSocket } from "../api/socket";
import { uploadTownHallMedia } from "../api/townhall";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { CardInput } from "../components/BookingPayment.jsx";
import {
  getWorkCategories, quoteWorkJob, createWorkJob, submitWorkJob, getWorkJob, cancelWorkJob,
  tipWorkJob, reviewWorkJob, createWalletTopupIntent, confirmWalletTopup, getNearbyWorkers,
  directOfferWorkJob, markWorkerNoShow, employerCancelJob,
} from "../api/ondemandwork.js";
import { openContextChat } from "../api/chat.js";
import { workCategoryLabel } from "../utils/workCategoryLabel.js";
import { MapContainer, TileLayer, Marker, Tooltip, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SafeImage } from "../components/SafeImage.jsx";
import { LeafletMapControls, FitLeafletBounds } from "../components/LeafletMapControls.jsx";
import { fitLeafletMap } from "../utils/leafletFit.js";
import { fetchRouteMeta } from "../utils/route.js";
import { useDistanceUnit, formatDistance, formatDuration } from "../utils/units.js";
import DistanceUnitToggle from "../components/DistanceUnitToggle.jsx";
import { getUser } from "../store/auth.js";
import { avatarDivIcon, avatarUrlOf, nameOf, initialOf } from "../utils/mapAvatar.js";
import { formatWorkerRate, workerHasCreatorPrice, creatorPriceDefaults } from "../utils/workRates.js";
import { peekWorkHirePreset } from "../utils/workHirePreset.js";
import { matchWorkLeaves } from "../utils/workCategoryMatch.js";
import { BOOK_ARTIST_RADIUS_KM } from "../utils/bookArtistCategories.js";
import { styleFor, workIconKey, workIconCandidates } from "../utils/workCategoryIcon.js";
import { WorkCategoryIcon } from "../components/WorkCategoryIcon.jsx";

const EMPTY_ROUTE_META = { path: [], durationMin: null, distanceKm: null, source: null, status: null };

const money = (n) => "$" + Number(n ?? 0).toFixed(2);
const ACCENT = "#6366f1";
function fmtDuration(t, h) {
  if (h == null) return "";
  if (!Number.isInteger(h)) return t("ondemand.hire.durationHoursDecimal", { hours: h.toFixed(1) });
  return h === 1 ? t("ondemand.hire.durationHour", { count: 1 }) : t("ondemand.hire.durationHours", { count: h });
}

const DEFAULT_IN_SHOP = new Set(["salon-spa", "automotive-roadside"]);

// Shown in place of the map when we have no position. Providers are matched by proximity, so
// without coordinates there is nothing to query — say so plainly (and why) and offer a retry,
// rather than rendering an empty map that reads as "no providers exist near you".
function LocationPrompt({ message, onRetry, t }) {
  return (
    // Fills the same slot as NearbyWorkersMap below and stays dark for the same reason as its
    // map tiles — this placeholder sits where the (always-dark) map renders once we have a
    // position, so it doesn't switch with the page theme either.
    <div style={{ width: "100%", height: "100%", background: "linear-gradient(160deg, #0d0f1a 0%, #111827 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "16px 24px", textAlign: "center" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
        {message || t("ondemand.hire.enableLocation", { defaultValue: "Enable location to see nearby workers" })}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "7px 18px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      >
        {t("common.tryAgain", { defaultValue: "Try again" })}
      </button>
    </div>
  );
}

// Map: hirer's position + nearby worker profiles + the road route to the chosen work address.
// On-demand works like rideshare, except you travel to the workplace — so we draw the road
// route from the rider to the work address, with live ETA/distance (km ⇄ mi) + map controls.
function NearbyWorkersMap({ userGeo, workers = [], color, addr, fill = false, height, isMobile, t }) {
  const mapRef = useRef(null);
  const [distUnit, setDistUnit] = useDistanceUnit();
  const [route, setRoute] = useState([]);
  const [routeMeta, setRouteMeta] = useState(EMPTY_ROUTE_META);

  const uLat = userGeo?.lat, uLng = userGeo?.lng;
  const aLat = addr?.lat, aLng = addr?.lng;
  useEffect(() => {
    if (uLat == null || uLng == null || aLat == null || aLng == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear a stale route when the address is removed
      setRoute([]); setRouteMeta(EMPTY_ROUTE_META); return undefined;
    }
    let cancelled = false;
    fetchRouteMeta([uLat, uLng], [aLat, aLng], (meta) => {
      if (cancelled) return;
      setRoute(meta.source === "fallback" ? [] : (meta.path || []));
      setRouteMeta(meta);
    });
    return () => { cancelled = true; };
  }, [uLat, uLng, aLat, aLng]);

  if (!userGeo) return null;
  const addrPt = addr && addr.lat != null && addr.lng != null ? [addr.lat, addr.lng] : null;
  const me = getUser();
  const userIcon = avatarDivIcon(avatarUrlOf(me), "#3b82f6", 40, { pulse: true, initial: initialOf(nameOf(me)) });
  // Work location — a neutral briefcase destination pin (no worker is assigned until after booking).
  const addrIcon = L.divIcon({ className: "", html: `<div style="position:relative;width:0;height:0">
      <span style="position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;background:${color};animation:strugPulse 1.6s ease-out infinite"></span>
      <span style="position:absolute;left:-13px;top:-13px;width:26px;height:26px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
      </span>
    </div>`, iconSize: [0, 0], iconAnchor: [0, 0] });
  const addrIsHere = addrPt && Math.abs(userGeo.lat - addrPt[0]) < 0.0004 && Math.abs(userGeo.lng - addrPt[1]) < 0.0004;
  const durationLabel = routeMeta.durationMin != null ? formatDuration(routeMeta.durationMin) : null;
  const distanceLabel = routeMeta.distanceKm != null ? formatDistance(routeMeta.distanceKm, distUnit) : null;
  const hasRoute = routeMeta.source && routeMeta.source !== "fallback" && (durationLabel || distanceLabel);
  const userPt = [userGeo.lat, userGeo.lng];
  const workerPts = workers.map((w) => [w.lat, w.lng]).filter((p) => p[0] != null && p[1] != null);
  const recenter = () => fitLeafletMap(mapRef.current, [userPt, addrPt, ...workerPts]);
  return (
    // The map itself (dark CartoDB basemap tiles) and its floating overlay chrome below stay dark
    // in both themes — the tiles don't retheme, so overlays on top of them must stay dark for
    // legibility, same reasoning as Hub.jsx's photo-scrim treatment and Quotes.jsx's QuoteAreaMap.
    <div style={{ width: "100%", height: fill ? "100%" : (height || (isMobile ? 200 : 260)), minHeight: fill ? 300 : undefined, borderRadius: fill ? 0 : (height ? 0 : 16), overflow: "hidden", border: height ? "none" : (fill ? "none" : `1px solid ${color}33`), position: "relative" }}>
      <style>{`@keyframes strugPulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(3.4);opacity:0}}`}</style>
      <MapContainer ref={mapRef} center={addrPt || userPt} zoom={13} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#0b1220", weight: 8, opacity: 0.55 }} />}
        {route.length > 1 && <Polyline positions={route} pathOptions={{ color, weight: 4.5, opacity: 0.95 }} />}
        {!addrIsHere && (
          <Marker position={userPt} icon={userIcon}>
            <Tooltip direction="top" offset={[0, -8]}>{t ? t("ondemand.hire.youAreHere", { defaultValue: "You are here" }) : "You are here"}</Tooltip>
          </Marker>
        )}
        {addrPt && (
          <Marker position={addrPt} icon={addrIcon}>
            <Tooltip direction="top" offset={[0, -10]}>{t ? t("ondemand.hire.workLocation", { defaultValue: "Work location" }) : "Work location"}</Tooltip>
          </Marker>
        )}
        {workers.map((w) => (
          // `photo` is the documented field, but /workers/nearby has historically sourced it from
          // the wrong table (the video-channel row, which most providers don't have) and returned
          // null. Fall back to the standard profile-image fields so the real photo shows as soon
          // as the endpoint reads from vertical_profile/social_profile; initials until then.
          <SmoothMarker key={w.id} position={[w.lat, w.lng]} durationMs={1200} icon={avatarDivIcon(w.photo || avatarUrlOf(w), color, 34, { initial: w.initial || initialOf(nameOf(w)) })}>
            <Tooltip direction="top" offset={[0, -18]}>
              {nameOf(w) || (w.initial || "?")}
            </Tooltip>
          </SmoothMarker>
        ))}
        <FitLeafletBounds points={[userPt, addrPt]} />
      </MapContainer>
      <LeafletMapControls mapRef={mapRef} onRecenter={recenter} />
      {addrPt && (addrIsHere || hasRoute) && (
        <div style={{ position: "absolute", bottom: 12, left: 10, display: "flex", gap: 8, zIndex: 1000, flexWrap: "wrap", alignItems: "center", maxWidth: "calc(100% - 60px)" }}>
          {addrIsHere ? (
            <div style={{ background: "rgba(10,10,20,0.9)", backdropFilter: "blur(8px)", border: `1px solid ${color}55`, borderRadius: 20, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{t ? t("ondemand.hire.atYourLocation", { defaultValue: "At your location" }) : "At your location"}</span>
            </div>
          ) : (
            <>
              {durationLabel && (
                <div style={{ background: "rgba(10,10,20,0.9)", backdropFilter: "blur(8px)", border: "1px solid rgba(37,99,235,0.5)", borderRadius: 20, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#dbeafe" }}>{durationLabel}</span>
                </div>
              )}
              {distanceLabel && (
                <div style={{ background: "rgba(10,10,20,0.9)", backdropFilter: "blur(8px)", border: `1px solid ${color}66`, borderRadius: 20, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{distanceLabel}</span>
                </div>
              )}
              {distanceLabel && <DistanceUnitToggle unit={distUnit} onChange={setDistUnit} />}
            </>
          )}
        </div>
      )}
      <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(10,10,20,0.85)", backdropFilter: "blur(8px)", border: `1px solid ${color}40`, borderRadius: 20, padding: "5px 12px", zIndex: 1000 }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: workers.length > 0 ? color : "rgba(255,255,255,0.55)" }}>
          {t && (workers.length > 0 ? t("ondemand.hire.providersAvailableNearby", { count: workers.length }) : t("ondemand.hire.noProvidersNearby"))}
        </span>
      </div>
    </div>
  );
}

// Clickable worker profile circles — a column beside the desktop map, or a scrollable row
// inside the mobile sheet (#432: mobile had no worker list and so no way to send a direct
// offer at all; `horizontal` is that same list laid out for a phone).
function WorkerProfileSidebar({ workers, color, onSelectWorker, horizontal = false, t }) {
  const [hovered, setHovered] = useState(null);

  if (horizontal) {
    // Nothing to show and nothing to explain — the sheet is short on a phone, so stay out of
    // the way until a category is picked and workers actually load.
    if (workers.length === 0) return null;
    return (
      <div style={{ margin: "0 -16px 18px", padding: "0 16px" }}>
        <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
          {t("ondemand.hire.nearbyCount", { count: workers.length })}
        </p>
        <div style={{ display: "flex", gap: 14, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
          {workers.map((w) => (
            <button
              key={w.id}
              onClick={() => onSelectWorker(w)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, width: 62, WebkitTapHighlightColor: "transparent" }}
            >
              {/* #457: a 404'd photo now falls back to the same initials disc as "no photo". */}
              <SafeImage
                src={w.photo}
                alt=""
                style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: `2px solid ${color}` }}
                fallback={
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${color}22`, border: `2px solid ${color}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color }}>{w.initial || "?"}</span>
                  </div>
                }
              />
              {/* Name */}
              <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, marginTop: 4, display: "block" }}>
                {nameOf(w) || (w.initial || "?")}
              </span>
              {w.rating != null && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>{"★"} {Number(w.rating).toFixed(1)}</span>
              )}
              {w.dist_km != null && (
                <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{w.dist_km} km</span>
              )}
              {formatWorkerRate(w) && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color, fontWeight: 700 }}>{formatWorkerRate(w)}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised" style={{ width: 188, flexShrink: 0, overflowY: "auto", borderRight: workers.length ? `1px solid var(--color-border-subtle)` : "none", display: "flex", flexDirection: "column", gap: 0, padding: "16px 0" }}>
      {workers.length === 0 ? (
        <div style={{ padding: "20px 12px", textAlign: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${color}22`, border: `1px solid ${color}44`, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, lineHeight: 1.4, margin: 0 }}>Select a category to see available workers</p>
        </div>
      ) : (
        <>
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 12px 10px", margin: 0 }}>
            {t("ondemand.hire.nearbyCount", { count: workers.length })}
          </p>
          {workers.map((w) => (
            <button
              key={w.id}
              onClick={() => onSelectWorker(w)}
              onMouseEnter={() => setHovered(w.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px", background: hovered === w.id ? `${color}18` : "transparent", border: "none", borderBottom: "1px solid var(--color-border-subtle)", cursor: "pointer", transition: "background 0.15s", width: "100%" }}
            >
              {/* Avatar — #457: a 404'd photo falls back to the initials disc, not a broken-image icon. */}
              <SafeImage
                src={w.photo}
                alt=""
                style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: `2px solid ${hovered === w.id ? color : "var(--color-border)"}`, transition: "border-color 0.15s" }}
                fallback={
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${color}22`, border: `2px solid ${hovered === w.id ? color : `${color}55`}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "border-color 0.15s" }}>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: color }}>{w.initial || "?"}</span>
                  </div>
                }
              />
              {/* Name — idle color is tokenized (not a fixed white) because the row's idle
                  background is "transparent" over this sidebar's now-tokenized surface, which is
                  near-white in light theme; a hardcoded "#fff" here would disappear. */}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: hovered === w.id ? color : "var(--color-text-secondary)", fontWeight: 600, marginTop: 4, display: "block" }}>
                {nameOf(w) || (w.initial || "?")}
              </span>
              {/* Rating + distance */}
              {w.rating != null && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>{"★"} {Number(w.rating).toFixed(1)}</span>
              )}
              {w.dist_km != null && (
                <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{w.dist_km} km</span>
              )}
              {formatWorkerRate(w) && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color, fontWeight: 700 }}>{formatWorkerRate(w)}</span>
              )}
              {hovered === w.id && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: color, fontWeight: 600 }}>Send Offer</span>
              )}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// Modal for sending a direct offer to a specific worker
function DirectOfferModal({
  worker, leaf, macro, color, minStart,
  start, setStart, end, setEnd,
  address, setAddress, coords, setCoords,
  instructions, setInstructions,
  photos, setPhotos,
  priceType, setPriceType, price, setPrice, quote,
  durationHours, serviceMode, setServiceMode,
  busy, setBusy,
  onClose, onSent,
  stripe, elements, t,
  resolveLeafFromWorker,
  catalogBooking = false,
}) {
  const [err, setErr] = useState(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const uid = useId(); // label/field associations for the booking form
  const effectiveLeaf = (typeof resolveLeafFromWorker === "function" ? resolveLeafFromWorker(worker) : null) || leaf || worker?.category || null;
  const hasCreator = workerHasCreatorPrice(worker);
  const defaults = creatorPriceDefaults(worker);
  const [selectedPackageId, setSelectedPackageId] = useState(defaults.packageId);
  const [useWorkerRate, setUseWorkerRate] = useState(!!defaults.useWorkerRate || !!defaults.packageId);

  const applyEndFromHours = (hours) => {
    if (!setEnd || !(Number(hours) > 0)) return;
    const base = start ? new Date(start) : new Date(Date.now() + 31 * 60 * 1000);
    if (Number.isNaN(base.getTime())) return;
    const endDt = new Date(base.getTime() + Number(hours) * 3600000);
    // datetime-local value in local timezone
    const pad = (n) => String(n).padStart(2, "0");
    const local = `${endDt.getFullYear()}-${pad(endDt.getMonth() + 1)}-${pad(endDt.getDate())}T${pad(endDt.getHours())}:${pad(endDt.getMinutes())}`;
    setEnd(local);
    if (!start) {
      const startPad = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
      setStart?.(startPad);
    }
  };

  useEffect(() => {
    const d = creatorPriceDefaults(worker);
    setSelectedPackageId(d.packageId);
    setUseWorkerRate(!!d.useWorkerRate || !!d.packageId);
    if (d.price) {
      setPriceType(d.priceType);
      setPrice(d.price);
    }
    if (d.durationHours) applyEndFromHours(d.durationHours);
  }, [worker?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const packages = Array.isArray(worker?.packages) ? worker.packages.filter((p) => Number(p?.price) > 0) : [];

  // When start changes and a package is selected, keep end aligned to package duration.
  useEffect(() => {
    if (!selectedPackageId || !start) return;
    const pkg = packages.find((p) => p.worker_package_id === selectedPackageId);
    if (pkg?.duration_hours) applyEndFromHours(pkg.duration_hours);
  }, [start, selectedPackageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPackage = (pkg) => {
    setSelectedPackageId(pkg.worker_package_id);
    setUseWorkerRate(true);
    setPriceType("flat");
    setPrice(String(pkg.price));
    applyEndFromHours(pkg.duration_hours);
  };

  const applyBaseRate = () => {
    setSelectedPackageId(null);
    const d = creatorPriceDefaults({ ...worker, packages: [] });
    setUseWorkerRate(!!d.useWorkerRate);
    if (d.price) {
      setPriceType(d.priceType);
      setPrice(d.price);
    }
  };

  const submit = async () => {
    if (!effectiveLeaf?.work_category_id) { setErr(t("ondemand.hire.selectWorkerTypeFirst", { defaultValue: "Please select a worker type from the category first." })); return; }
    if (!start) { setErr("Please set a start date/time."); return; }
    if (!end || !durationHours) { setErr("Please set an end date/time."); return; }
    if (durationHours < 1) { setErr("Shift must be at least 1 hour."); return; }
    if (new Date(start).getTime() < Date.now() + 30 * 60 * 1000) { setErr("Start time must be at least 30 minutes from now."); return; }
    if (!coords.lat) { setErr("Please enter a work location."); return; }
    if (!price || Number(price) <= 0) { setErr(hasCreator ? "Select a rate or package." : "Please set your offer price."); return; }
    setErr(null);
    setLocalBusy(true);
    setBusy(true);
    try {
      let photoUrls = [];
      if (photos.length) {
        for (const f of photos.slice(0, 5)) {
          try { const r = await uploadTownHallMedia(f); if (r?.url) photoUrls.push(r.url); } catch { /* skip */ }
        }
      }
      const payload = {
        worker_profile_id: worker.id,
        category_id: effectiveLeaf.work_category_id,
        title: effectiveLeaf.name,
        instructions: instructions || null,
        service_mode: serviceMode,
        scheduled_start: new Date(start).toISOString(),
        scheduled_end: new Date(end).toISOString(),
        price_type: priceType,
        hirer_set_price: priceType === "flat" ? Number(price) : undefined,
        hourly_rate: priceType === "hourly" ? Number(price) : undefined,
        location_lat: coords.lat,
        location_long: coords.lng,
        address,
        photos: photoUrls,
      };
      if (selectedPackageId) payload.worker_package_id = selectedPackageId;
      else if (useWorkerRate && hasCreator) payload.use_worker_rate = true;
      if (catalogBooking) payload.catalog_booking = true;
      const result = await directOfferWorkJob(payload);
      onSent(result.work_job_id, nameOf(worker) || worker.initial || "?");
    } catch (e) {
      if (e?.response?.status === 402) setErr(e?.response?.data?.message || "Insufficient wallet balance.");
      else if (e?.response?.status === 409) setErr("This worker is no longer available. Try another.");
      else setErr(e?.response?.data?.message || e?.message || "Could not send offer. Please try again.");
    }
    setLocalBusy(false);
    setBusy(false);
  };

  const input = { width: "100%", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 13px", color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const label = { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 5px", display: "block" };

  return (
    // The fixed-overlay scrim stays dark in both themes — it's dimming the page behind a modal,
    // not a themed surface (same call as full-screen modal backdrops elsewhere in the app, e.g.
    // Quotes.jsx's provider-detail modal).
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-raised" style={{ width: "min(90vw, 520px)", maxHeight: "88vh", overflowY: "auto", borderRadius: 20, border: `1px solid ${color}44`, boxShadow: `0 24px 80px -20px ${color}44`, padding: "24px 24px 28px", animation: "fadeUp 0.25s ease both" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          {/* #457: a 404'd photo falls back to the initials disc, not a broken-image icon. */}
          <SafeImage
            src={worker.photo}
            alt=""
            style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: `2px solid ${color}` }}
            fallback={
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${color}22`, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color }}>{worker.initial || "?"}</span>
              </div>
            }
          />
          <div>
            <p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 14, textTransform: "uppercase", margin: "0 0 2px" }}>
              {t("ondemand.hire.sendDirectOffer", { defaultValue: "Send Direct Offer" })}
            </p>
            <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, textTransform: "uppercase", margin: "0 0 2px" }}>
              {nameOf(worker) || (worker.initial || "?")}
            </p>
            {worker.rating != null && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f59e0b", margin: 0 }}>{"★"} {Number(worker.rating).toFixed(1)}{worker.dist_km != null ? ` · ${worker.dist_km} km away` : ""}</p>}
          </div>
          <button onClick={onClose} className="text-text-secondary" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {!effectiveLeaf?.work_category_id && (
          <div className="text-text-secondary" style={{ background: `${color}15`, border: `1px solid ${color}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
            {t("ondemand.hire.selectWorkerTypeFirst", { defaultValue: "Select a worker type in the category list first, then click a worker to send a targeted offer." })}
          </div>
        )}
        {effectiveLeaf?.name && (
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 12px" }}>
            {t("ondemand.hire.bookingAs", { defaultValue: "Booking as" })}: <strong className="text-text-primary">{effectiveLeaf.name}</strong>
          </p>
        )}

        {/* Service mode toggle for reversed-map categories */}
        {DEFAULT_IN_SHOP.has(macro?.slug) && (
          <div style={{ marginBottom: 14 }}>
            <label id={`${uid}-mode`} style={label}>How it works</label>
            <div role="group" aria-labelledby={`${uid}-mode`} style={{ display: "flex", gap: 8 }}>
              {[{ k: "mobile", t: t("ondemand.hire.theyComeToYou") }, { k: "in_shop", t: t("ondemand.hire.youGoToThem") }].map((m) => (
                // Idle text is conditional, not a fixed "#fff" — the idle background is a themed
                // surface tint (near-white in light theme), so fixed white text would vanish there.
                <button key={m.k} onClick={() => setServiceMode(m.k)} style={{ flex: 1, background: serviceMode === m.k ? color : "var(--color-surface)", border: `1px solid ${serviceMode === m.k ? color : "var(--color-border)"}`, borderRadius: 10, padding: "9px 0", color: serviceMode === m.k ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{m.t}</button>
              ))}
            </div>
          </div>
        )}

        {/* Schedule */}
        <div style={{ display: "flex", gap: 10, marginBottom: durationHours ? 6 : 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor={`${uid}-start`} style={label}>{t("ondemand.hire.starts")}</label>
            {/* colorScheme stays "dark" regardless of theme — matches the established pattern for
                native date/time inputs across the app: the browser's own picker chrome isn't retheme'd. */}
            <input id={`${uid}-start`} type="datetime-local" min={minStart} value={start} onChange={(e) => { setStart(e.target.value); if (end && new Date(end) <= new Date(e.target.value)) setEnd(""); }} style={{ ...input, colorScheme: "dark" }} />
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor={`${uid}-end`} style={label}>{t("ondemand.hire.ends")}</label>
            <input id={`${uid}-end`} type="datetime-local" min={start || minStart} value={end} onChange={(e) => setEnd(e.target.value)} style={{ ...input, colorScheme: "dark" }} />
          </div>
        </div>
        {durationHours != null && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color, margin: "0 0 14px", fontWeight: 600 }}>{t("ondemand.hire.duration", { duration: fmtDuration(t, durationHours) })}</p>}

        {/* Location */}
        <label htmlFor={`${uid}-location`} style={label}>{serviceMode === "in_shop" ? t("ondemand.hire.locationInShop") : t("ondemand.hire.workLocation")}</label>
        <div style={{ marginBottom: 14 }}>
          <AddressAutocomplete inputId={`${uid}-location`} value={address} onChange={(addr, lat, lng) => { setAddress(addr); if (lat != null) setCoords({ lat, lng }); }} placeholder={serviceMode === "in_shop" ? t("ondemand.hire.placeholderArea") : t("ondemand.hire.placeholderWorkAddress")} useLocation wrapStyle={{ width: "100%" }} inputStyle={{ ...input, textAlign: "left" }} />
        </div>

        {/* Instructions */}
        <label htmlFor={`${uid}-instructions`} style={label}>{t("ondemand.hire.instructionsLabel")}</label>
        <textarea id={`${uid}-instructions`} value={instructions} onChange={(e) => { if (e.target.value.length <= 2000) setInstructions(e.target.value); }} rows={2} placeholder={t("ondemand.hire.instructionsPlaceholder")} style={{ ...input, textAlign: "left", resize: "vertical", marginBottom: 14 }} />

        {/* Photos */}
        <label htmlFor={`${uid}-photos`} style={label}>{t("ondemand.hire.photosLabel")}</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
          {photos.map((f, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
              {/* Remove button sits on top of an arbitrary user photo, not page chrome — stays a
                  fixed dark circle so the white "×" always reads regardless of the photo underneath. */}
              <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", cursor: "pointer", fontSize: 11 }}>×</button>
            </div>
          ))}
          {photos.length < 5 && (
            <>
              <label
                htmlFor={`${uid}-photos`}
                className="bg-surface text-text-secondary" style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  border: "1px dashed var(--color-border)",
                  cursor: "pointer",
                  fontSize: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                +
              </label>
              <input
                key={fileInputKey}
                id={`${uid}-photos`}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);

                  // Check if we're trying to add too many files
                  if (photos.length + files.length > 5) {
                    setErr(`You can select up to 5 photos total. You currently have ${photos.length} selected.`);
                    setFileInputKey(prev => prev + 1);
                    return;
                  }

                  // Validate file types
                  const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
                  if (invalidFiles.length > 0) {
                    setErr('Please select only image files (JPG, PNG, GIF, etc.)');
                    setFileInputKey(prev => prev + 1);
                    return;
                  }

                  // If validation passes, add the files and clear error
                  setErr(null);
                  setPhotos((p) => [...p, ...files]);
                  setFileInputKey(prev => prev + 1);
                }}
              />
            </>
          )}
        </div>

        {/* Price — creator catalog when available */}
        {hasCreator ? (
          <>
            <label style={label}>{t("ondemand.hire.providerRate", { defaultValue: "Provider rate" })}</label>
            {packages.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                {packages.map((pkg) => (
                  <button
                    key={pkg.worker_package_id}
                    type="button"
                    onClick={() => applyPackage(pkg)}
                    style={{
                      textAlign: "left",
                      background: selectedPackageId === pkg.worker_package_id ? `${color}22` : "var(--color-surface)",
                      border: `1px solid ${selectedPackageId === pkg.worker_package_id ? color : "var(--color-border)"}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                      cursor: "pointer",
                      color: "inherit",
                    }}
                  >
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>{pkg.name}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color, fontWeight: 700, marginTop: 2 }}>
                      ${Number(pkg.price).toFixed(0)} · {pkg.duration_hours}h
                    </div>
                  </button>
                ))}
              </div>
            )}
            {(Number(worker.hourly_rate) > 0 || Number(worker.flat_rate) > 0) && (
              <button
                type="button"
                onClick={applyBaseRate}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: !selectedPackageId && useWorkerRate ? `${color}22` : "var(--color-surface)",
                  border: `1px solid ${!selectedPackageId && useWorkerRate ? color : "var(--color-border)"}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: "pointer",
                  color: "inherit",
                  marginBottom: 10,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {formatWorkerRate({ ...worker, packages: [] }) || t("ondemand.hire.baseRate", { defaultValue: "Base rate" })}
              </button>
            )}
            {quote && (
              <div className="text-text-secondary" style={{ background: `${color}1a`, border: `1px solid ${color}55`, borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
                {t("ondemand.hire.quoteLineUser", { total: money(quote.total_charged) })}
              </div>
            )}
          </>
        ) : (
          <>
            <label htmlFor={`${uid}-price`} style={label}>{t("ondemand.hire.yourPrice")}</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {["flat", "hourly"].map((pt) => (
                <button key={pt} onClick={() => setPriceType(pt)} style={{ flex: 1, background: priceType === pt ? color : "var(--color-surface)", border: `1px solid ${priceType === pt ? color : "var(--color-border)"}`, borderRadius: 10, padding: "8px 0", color: priceType === pt ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{pt === "flat" ? t("ondemand.hire.flatTotal") : t("ondemand.hire.hourlyRate")}</button>
              ))}
            </div>
            <input id={`${uid}-price`} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={priceType === "hourly" ? t("ondemand.hire.placeholderHourly") : t("ondemand.hire.placeholderTotal")} style={{ ...input, marginBottom: 10, textAlign: "center" }} />
            {quote && (
              <div className="text-text-secondary" style={{ background: `${color}1a`, border: `1px solid ${color}55`, borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
                {t("ondemand.hire.quoteLineUser", { total: money(quote.total_charged) })}
              </div>
            )}
          </>
        )}

        {err && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", margin: "0 0 12px", textAlign: "center" }}>{err}</p>}

        {/* Disabled-state bg/text are both conditional — a disabled button falls back to a
            themed surface tint (near-white in light theme), so the label must not stay fixed white. */}
        <button onClick={submit} disabled={localBusy || !effectiveLeaf?.work_category_id} style={{ width: "100%", background: effectiveLeaf?.work_category_id ? color : "var(--color-surface)", border: "none", borderRadius: 12, padding: "13px 0", color: effectiveLeaf?.work_category_id ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: localBusy || !effectiveLeaf?.work_category_id ? "default" : "pointer", opacity: localBusy ? 0.7 : 1 }}>
          {localBusy
            ? t("ondemand.hire.sendingOffer", { defaultValue: "Sending Offer..." })
            : t("ondemand.hire.sendDirectOffer", { defaultValue: "Send Direct Offer" })}
        </button>
        <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center", margin: "8px 0 0" }}>
          {catalogBooking
            ? t("ondemand.hire.offerWindowCatalog", { defaultValue: "The artist has up to 48 hours to accept. Payment is held until they confirm." })
            : t("ondemand.hire.offerWindowInstant", { defaultValue: "Worker has 45 seconds to accept. Payment is held until they confirm." })}
        </p>
      </div>
    </div>
  );
}

export default function OnDemandHire({ presetCategory, onNavigate, userLocation }) {
  const { t } = useTranslation();
  const { searchPlaceholder } = usePageI18n("ondemand");
  const { isMobile } = useViewport();
  const uid = useId(); // label/field associations for the desktop booking form
  const loading = usePageLoad(450);
  const [dialog, { confirm, notify }] = useDialog();
  const stripe = useStripe();
  const elements = useElements();

  const [cats, setCats] = useState([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [catsError, setCatsError] = useState(null);
  const [step, setStep] = useState("browse");
  const [macro, setMacro] = useState(null);
  const [leaf, setLeaf] = useState(presetCategory || null);
  const [talentLeafSlugs, setTalentLeafSlugs] = useState([]);
  const [hireSource, setHireSource] = useState(null);
  const [hireRadiusKm, setHireRadiusKm] = useState(5);
  const catalogMode = hireSource === "bookartist";

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [instructions, setInstructions] = useState("");
  const [photos, setPhotos] = useState([]);
  const [priceType, setPriceType] = useState("flat");
  const [price, setPrice] = useState("");
  const [serviceMode, setServiceMode] = useState("mobile");
  const [directOfferWorkerName, setDirectOfferWorkerName] = useState("");
  const [declinedWorkerName, setDeclinedWorkerName] = useState("");
  const [quote, setQuote] = useState(null);
  const [err, setErr] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const [job, setJob] = useState(null);
  const [providerLoc, setProviderLoc] = useState(null);
  const [etaMin, setEtaMin] = useState(null);
  const [directOfferTimedOut, setDirectOfferTimedOut] = useState(false);
  const jobIdRef = useRef(null);

  const [tipSel, setTipSel] = useState(0);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [rewardDone, setRewardDone] = useState(false);
  const [rewardBusy, setRewardBusy] = useState(false);
  const [catQuery, setCatQuery] = useState("");
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false);
  const [noShowBusy, setNoShowBusy] = useState(false);
  const [replacementJob, setReplacementJob] = useState(null);
  const [isReplacementMode, setIsReplacementMode] = useState(false);
  const [showEmployerCancelConfirm, setShowEmployerCancelConfirm] = useState(false);
  const [employerCancelBusy, setEmployerCancelBusy] = useState(false);

  const [userGeo, setUserGeo] = useState(null);
  // Without a position we cannot query providers by proximity at all. This used to fail
  // SILENTLY (empty error callback, no timeout), so a denied/blocked location left userGeo null
  // and the nearby-workers fetch never ran — the category just looked like "nobody nearby".
  const [geoError, setGeoError] = useState(null);
  const [nearbyWorkers, setNearbyWorkers] = useState([]);
  const nearbyPollRef = useRef(null);

  // Desktop-only: direct offer to a specific worker
  const [directTarget, setDirectTarget] = useState(null);

  /** Resolve leaf category when hiring from macro browse (worker.category from nearby API). */
  const resolveLeafFromWorker = (w) => {
    const cat = w?.category;
    if (cat) {
      const match = (macro?.children || []).find(
        (c) => c.work_category_id === cat.work_category_id || c.slug === cat.slug,
      );
      if (match?.work_category_id) return match;
      if (cat.work_category_id) return cat;
    }
    if (leaf?.work_category_id) return leaf;
    return null;
  };
  const selectWorker = (w) => {
    const resolved = resolveLeafFromWorker(w);
    if (resolved?.work_category_id && resolved.work_category_id !== leaf?.work_category_id) {
      setLeaf(resolved);
    }
    setDirectTarget(w);
  };

  const requestLocation = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError(t("ondemand.hire.locationUnavailable", { defaultValue: "Location isn't available on this device, so we can't show providers near you." }));
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setUserGeo({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoError(null); },
      (err) => {
        setGeoError(err && err.code === 1
          ? t("ondemand.hire.locationBlocked", { defaultValue: "Location is blocked. Allow location access to see providers near you." })
          : t("ondemand.hire.locationFailed", { defaultValue: "Couldn't get your location. Check GPS/connection and try again." }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [t]);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  useEffect(() => {
    const lat = userLocation?.lat;
    const lng = userLocation?.lng ?? userLocation?.long;
    if (lat == null || lng == null) return;
    setUserGeo((g) => (g ? g : { lat, lng }));
  }, [userLocation?.lat, userLocation?.lng, userLocation?.long]);

  // Poll nearby / catalog workers when a macro is selected (browse, talent, or form steps)
  useEffect(() => {
    clearInterval(nearbyPollRef.current);
    if (!macro || !["browse", "form", "talent"].includes(step)) { setNearbyWorkers([]); return; }
    if (!userGeo && !catalogMode) { setNearbyWorkers([]); return; }
    const fetch = () => {
      let slugs = [];
      if (talentLeafSlugs.length) {
        slugs = talentLeafSlugs;
      } else if (step === 'browse' && !leaf && macro && macro.children && macro.children.length > 0) {
        slugs = macro.children.map(child => child.slug).filter(Boolean);
      } else if (leaf && leaf.slug) {
        slugs = [leaf.slug];
      }
      const params = { radius: catalogMode ? (hireRadiusKm || BOOK_ARTIST_RADIUS_KM) : 5, catalog: catalogMode };
      if (userGeo?.lat != null && userGeo?.lng != null) {
        params.lat = userGeo.lat;
        params.lng = userGeo.lng;
      }
      if (slugs.length > 0) {
        params.category_slug = slugs.join(',');
      }
      getNearbyWorkers(params)
        .then((w) => {
          setNearbyWorkers(w || []);
        })
        .catch(() => {
          setNearbyWorkers([]);
        });
    };
    fetch();
    nearbyPollRef.current = setInterval(fetch, 15000);
    return () => clearInterval(nearbyPollRef.current);
  }, [macro?.slug, leaf?.slug, talentLeafSlugs.join(","), userGeo?.lat, userGeo?.lng, step, catalogMode, hireRadiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCatsLoading(true);
    setCatsError(null);
    getWorkCategories()
      .then((c) => setCats(Array.isArray(c) ? c : []))
      .catch(() => {
        setCats([]);
        setCatsError(t("ondemand.hire.categoriesLoadFailed", { defaultValue: "Couldn't load service categories. Check your connection and try again." }));
      })
      .finally(() => setCatsLoading(false));
  }, [t]);
  useEffect(() => { if (presetCategory) { setLeaf(presetCategory); setStep("talent"); } }, [presetCategory]);

  useEffect(() => {
    if (!cats.length) return;
    const preset = peekWorkHirePreset();
    const macroSlug = preset?.macro;
    const leafSlugs = preset?.leafSlugs;
    if (!macroSlug && !(Array.isArray(leafSlugs) && leafSlugs.length)) return;

    const found = matchWorkLeaves(cats, { macroSlug, leafSlugs });
    const foundMacro = found.macro;
    const foundLeaf = found.leaf;

    if (preset?.source) setHireSource(preset.source);
    if (preset?.catalog && Number(preset.radius) > 0) setHireRadiusKm(Number(preset.radius));
    else if (preset?.source === "bookartist") setHireRadiusKm(BOOK_ARTIST_RADIUS_KM);
    if (found.leaves.length) setTalentLeafSlugs(found.leaves.map((l) => l.slug).filter(Boolean));
    else setTalentLeafSlugs([]);

    if (foundMacro) setMacro(foundMacro);
    if (foundLeaf) {
      setLeaf(foundLeaf);
      setServiceMode(DEFAULT_IN_SHOP.has(foundMacro?.slug) ? "in_shop" : "mobile");
      setStep("talent");
    } else if (foundMacro) {
      setStep("browse");
    }
  }, [cats]);  

  const minStart = (() => { const d = new Date(Date.now() + 31 * 60 * 1000); d.setSeconds(0, 0); return d.toISOString().slice(0, 16); })();

  const durationHours = (() => {
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return ms > 0 ? Math.round((ms / 3600000) * 100) / 100 : null;
  })();

  useEffect(() => {
    if (!price || Number(price) <= 0) { setQuote(null); return; }
    const timerId = setTimeout(() => {
      quoteWorkJob({ price_type: priceType, hirer_set_price: priceType === "flat" ? Number(price) : undefined, hourly_rate: priceType === "hourly" ? Number(price) : undefined, duration_hours: durationHours || 1, location_lat: coords.lat, location_long: coords.lng })
        .then(setQuote).catch(() => {});
    }, 400);
    return () => clearTimeout(timerId);
  }, [price, priceType, durationHours, coords.lat, coords.lng]);

  useEffect(() => {
    if (!jobIdRef.current) return;
    const id = jobIdRef.current;
    let stop = false;
    const apply = (j) => {
      if (stop || !j) return;
      setJob(j);
      // Only keep direct-offer UI state while the job is in "offered"
      if (j.status !== "offered") {
        setDirectOfferWorkerName("");
        setDeclinedWorkerName(""); // Also clear declined worker name when leaving offered status
      }
      // Don't override step if we're in replacement mode
      if (isReplacementMode) return;
      if (j.status === "no_match") { setStep("form"); notify({ title: i18n.t("ondemand.hire.notifyNoProviders"), message: i18n.t("ondemand.hire.notifyNoProvidersMsg") }); jobIdRef.current = null; }
      else if (["accepted", "worker_en_route", "in_progress"].includes(j.status)) setStep("tracking");
      else if (j.status === "completed") setStep("done");
      else if (j.status === "cancelled") { setStep("browse"); jobIdRef.current = null; }
    };
    const poll = () => getWorkJob(id).then(apply).catch(() => {});
    poll();
    const pollTimer = setInterval(poll, 4000);
    const s = connectSocket();
    const onAccepted = () => poll();
    const onStatus = () => poll();
    const onLocation = (d) => { if (d && d.lat != null) setProviderLoc({ lat: d.lat, lng: d.lng }); };
    const onDeclined = (data) => {
      // Prefer the direct-offer target name we already have; fall back to nearbyWorkers when possible.
      let workerName = directOfferWorkerName?.trim() ? directOfferWorkerName : t("ondemand.hire.unknownWorker");
      if (data && data.worker_profile_id != null) {
        const workerId = Number(data.worker_profile_id);
        const worker = nearbyWorkers.find((w) => Number(w.id) === workerId);
        if (worker) workerName = nameOf(worker) || worker.initial || "?";
      }
      setDeclinedWorkerName(workerName);
      setDirectOfferWorkerName(""); // Clear the worker name to prevent showing stale data
      setDirectOfferTimedOut(false); // Reset timeout state when we get a decline
      poll(); // Fetch the latest job state
    };
    const onTimeout = (data) => {
      // Worker timed out -> set the timeout state so we can show appropriate UI
      setDirectOfferTimedOut(true);
      // We don't need to poll here as the job state hasn't changed yet
    };
    s.on(`work-accepted-${id}`, onAccepted);
    s.on(`work-status-${id}`, onStatus);
    s.on(`work-location-${id}`, onLocation);
    s.on(`work-offer-declined-${id}`, onDeclined);
    s.on(`work-offer-timeout-${id}`, onTimeout);
    return () => {
      stop = true;
      clearInterval(pollTimer);
      s.off(`work-accepted-${id}`, onAccepted);
      s.off(`work-status-${id}`, onStatus);
      s.off(`work-location-${id}`, onLocation);
      s.off(`work-offer-declined-${id}`, onDeclined);
      s.off(`work-offer-timeout-${id}`, onTimeout);
    };
  }, [step, nearbyWorkers, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setMacro(null); setLeaf(null); setStart(""); setEnd(""); setAddress(""); setCoords({ lat: null, lng: null });
    setInstructions(""); setPhotos([]); setPrice(""); setQuote(null); setJob(null);
    setProviderLoc(null); setEtaMin(null); jobIdRef.current = null;
    setTipSel(0); setRating(0); setComment(""); setRewardDone(false);
    setServiceMode("mobile"); setCatQuery(""); setDirectTarget(null);
    setDirectOfferWorkerName(""); setDeclinedWorkerName("");
    setIsReplacementMode(false);
    setReplacementJob(null);
  };

  const payShortfallByCard = async (required, balance) => {
    if (!stripe || !elements) throw new Error(t("ondemand.hire.paymentUnavailable"));
    const card = elements.getElement(CardElement);
    if (!card) throw new Error(t("ondemand.hire.enterCardDetails"));
    const amount = Math.max(Math.round((Number(required) - Number(balance)) * 100) / 100, 1);
    const { clientSecret, paymentIntentId } = await createWalletTopupIntent(amount);
    const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
    if (result.error) throw new Error(result.error.message || t("ondemand.hire.cardDeclined"));
    await confirmWalletTopup(paymentIntentId);
  };

  const submit = async () => {
    if (!leaf) return;
    if (!start) return notify({ title: t("ondemand.hire.notifyAddStart"), message: t("ondemand.hire.notifyAddStartMsg") });
    if (!end || !durationHours) return notify({ title: t("ondemand.hire.notifyAddEnd"), message: t("ondemand.hire.notifyAddEndMsg") });
    if (durationHours < 1) return notify({ title: t("ondemand.hire.notifyTooShort"), message: t("ondemand.hire.notifyTooShortMsg") });
    if (new Date(start).getTime() < Date.now() + 30 * 60 * 1000) {
      return notify({ title: t("ondemand.hire.notifyStartTooSoon"), message: t("ondemand.hire.notifyStartTooSoonMsg") });
    }
    if (!coords.lat) return notify({ title: t("ondemand.hire.notifyAddLocation"), message: t("ondemand.hire.notifyAddLocationMsg") });
    if (!price || Number(price) <= 0) return notify({ title: t("ondemand.hire.notifySetPrice"), message: priceType === "hourly" ? t("ondemand.hire.notifySetPriceHourly") : t("ondemand.hire.notifySetPriceFlat") });
    setBusy(true);
    try {
      let photoUrls = [];
      if (photos.length) { for (const f of photos.slice(0, 5)) { try { const r = await uploadTownHallMedia(f); if (r?.url) photoUrls.push(r.url); } catch { /* skip */ } } }
      const created = await createWorkJob({
        category_id: leaf.work_category_id, title: leaf.name, instructions: instructions || null,
        service_mode: serviceMode,
        scheduled_start: new Date(start).toISOString(), scheduled_end: new Date(end).toISOString(),
        price_type: priceType,
        hirer_set_price: priceType === "flat" ? Number(price) : undefined,
        hourly_rate: priceType === "hourly" ? Number(price) : undefined,
        location_lat: coords.lat, location_long: coords.lng, address, photos: photoUrls,
      });
      jobIdRef.current = created.work_job_id;
      setJob(created);
      setIsReplacementMode(false);
      setReplacementJob(null);
      try {
        await submitWorkJob(created.work_job_id);
      } catch (err) {
        if (err?.response?.status === 402) {
          const { required, balance } = err.response.data || {};
          await payShortfallByCard(Number(required) || Number(quote?.total_charged) || Number(price), Number(balance) || 0);
          await submitWorkJob(created.work_job_id);
        } else {
          throw err;
        }
      }
      setStep("searching");
    } catch (e) {
      if (e?.response?.status === 503) notify({ title: t("ondemand.hire.notifyNoProviders"), message: t("ondemand.hire.notifyNoProvidersArea") });
      else if (e?.response?.status === 402) notify({ title: t("ondemand.hire.notifyPaymentFailed"), message: e?.response?.data?.message || t("ondemand.hire.notifyTryAgain") });
      else if (e?.response?.data?.errors?.length) notify({ title: t("ondemand.hire.notifyCheckBooking"), message: e.response.data.errors.join(" ") });
      else notify({ title: t("ondemand.hire.notifyCouldntBook"), message: e?.response?.data?.message || e?.message || t("ondemand.hire.notifyTryAgain") });
    }
    setBusy(false);
  };

  const submitReward = async () => {
    if (!job) return;
    setRewardBusy(true);
    try {
      if (tipSel > 0) await tipWorkJob(job.work_job_id, tipSel);
      if (rating > 0) await reviewWorkJob(job.work_job_id, rating, comment || undefined);
      setRewardDone(true);
    } catch (e) {
      notify({ title: t("ondemand.hire.notifyCouldntSubmit"), message: e?.response?.data?.message || t("ondemand.hire.notifyTryAgain") });
    }
    setRewardBusy(false);
  };

  const handleNoShow = async () => {
    if (!job) return;
    setNoShowBusy(true);
    try {
      const result = await markWorkerNoShow(job.work_job_id);
      setReplacementJob(result.replacement_job);
      setShowNoShowConfirm(false);
      setIsReplacementMode(true);
      // Show replacement options directly without notification
      setStep("replacement");
    } catch (e) {
      const errorMessage = e?.response?.data?.message || e?.message || e?.toString() || t("ondemand.hire.notifyTryAgain");
      notify({ title: t("ondemand.hire.noShowFailed"), message: errorMessage });
      setShowNoShowConfirm(false);
    }
    setNoShowBusy(false);
  };

  const handleCancelJobNoShow = async () => {
    if (!job) return;
    try {
      await cancelWorkJob(job.work_job_id, "Worker No Show");
      notify({ title: t("ondemand.hire.jobCancelled"), message: t("ondemand.hire.jobCancelledMessage") });
      resetForm();
      setStep("browse");
      setReplacementJob(null);
      setIsReplacementMode(false);
    } catch (e) {
      const errorMessage = e?.response?.data?.message || e?.message || t("ondemand.hire.notifyTryAgain");
      notify({ title: t("ondemand.hire.cancelFailed"), message: errorMessage });
    }
  };

  const handleEmployerCancel = async () => {
    if (!job) return;
    setEmployerCancelBusy(true);
    try {
      await employerCancelJob(job.work_job_id, "Cancelled by employer");
      notify({ title: t("ondemand.hire.jobCancelled"), message: t("ondemand.hire.employerCancelMessage") });
      setShowEmployerCancelConfirm(false);
      resetForm();
      setStep("browse");
    } catch (e) {
      const errorMessage = e?.response?.data?.message || e?.message || t("ondemand.hire.notifyTryAgain");
      notify({ title: t("ondemand.hire.cancelFailed"), message: errorMessage });
      setShowEmployerCancelConfirm(false);
    }
    setEmployerCancelBusy(false);
  };

  const handleFindReplacement = () => {
    if (!job) return;
    // Check if this was a direct offer job
    const wasDirectOffer = job.direct_offer_worker_id != null || directOfferWorkerName;
    
    // Pre-fill form with original job details for both flows
    // Convert ISO strings to datetime-local input format (local timezone)
    const formatDateForInput = (isoString) => {
      if (!isoString) return "";
      const date = new Date(isoString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    setStart(formatDateForInput(job.scheduled_start));
    setEnd(formatDateForInput(job.scheduled_end));
    setAddress(job.address || "");
    setCoords({ lat: job.location_lat, lng: job.location_long });
    setInstructions(job.instructions || "");
    setPhotos([]);
    setPriceType(job.price_type || "flat");
    setPrice(job.hirer_set_price || job.hourly_rate || "");
    setServiceMode(job.service_mode || "mobile");
    setReplacementJob(job);
    
    if (wasDirectOffer) {
      // For direct offers, show the worker list for selection
      setStep("browse");
      notify({ title: t("ondemand.hire.selectWorkerForReplacement"), message: t("ondemand.hire.selectWorkerForReplacementMessage") });
    } else {
      // For regular hire on demand, go directly to form
      setStep("form");
      notify({ title: t("ondemand.hire.reviewJobDetails"), message: t("ondemand.hire.reviewJobDetailsMessage") });
    }
  };

  // Shared styles
  const macroColor = macro ? styleFor(macro.slug).color : ACCENT;
  const filteredMacros = catQuery.trim()
    ? cats.filter((m) => workCategoryLabel(t, m).toLowerCase().includes(catQuery.trim().toLowerCase()))
    : cats;
  const card = { background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 18, padding: 22 };
  const labelSt = { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 6px", display: "block", textAlign: "center" };
  const inputSt = { width: "100%", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 13px", color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box", textAlign: "center" };
  const H = (s) => ({ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-primary)", ...s });

  // These step views close over this component's state, so they have to be declared here — but
  // they must be CALLED, e.g. `{BrowseContent()}`, never rendered as `<BrowseContent />`.
  // Rendering them as elements makes their type a brand-new function object on every render, so
  // React sees a different component type, unmounts the whole subtree and mounts a fresh one.
  // That destroyed the search input's DOM node on each keystroke: it lost focus and Android
  // closed the keyboard after a single letter (#412). Calling them inlines their JSX into this
  // component's tree, where the input stays a stable host element and keeps focus.
  const BackButton = ({ onClick, children }) => (
    // Hover text uses the accent color, not fixed "#fff" — the hover background is only a 13%
    // accent tint (`${macroColor}22`), so on a light-theme surface that tint stays pale and
    // white text wouldn't read against it.
    <button onClick={onClick} className="bg-surface border border-border text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${macroColor}22`; e.currentTarget.style.borderColor = macroColor; e.currentTarget.style.color = macroColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-surface)"; e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      {children}
    </button>
  );

  // The shareable content for each flow step (used in both mobile sheet and desktop center)
  const BrowseContent = () => (
    !macro ? (
      <>
        <div className="bg-surface border border-border" style={{ maxWidth: 420, margin: "0 auto 14px", display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "10px 14px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(4,1fr)" : "repeat(auto-fill,minmax(132px,1fr))", gap: isMobile ? 12 : 22, justifyItems: "center" }}>
          {filteredMacros.map((m, i) => {
            const s = styleFor(m.slug);
            return (
              <button key={m.work_category_id} className="odc-circle" onClick={() => setMacro(m)} style={{ animation: `fadeUp 0.3s ease ${i * 25}ms both`, width: "100%" }}>
                <div className="odc-circle-disc" style={{ width: isMobile ? 66 : 112, height: isMobile ? 66 : 112, fontSize: isMobile ? 28 : 44, background: `${s.color}22`, border: `2px solid ${s.color}55`, boxShadow: `0 4px 14px ${s.color}22`, overflow: "hidden", padding: 0 }}>
                  <WorkCategoryIcon slug={m.slug} alt="" />
                </div>
                <span className="odc-circle-label" style={{ fontSize: isMobile ? 10 : 13 }}>{workCategoryLabel(t, m)}</span>
              </button>
            );
          })}
        </div>
        {catsLoading && (
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginTop: 16 }}>
            {t("common.loading", { defaultValue: "Loading…" })}
          </p>
        )}
        {!catsLoading && catsError && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 0 10px" }}>{catsError}</p>
            <button
              type="button"
              onClick={() => {
                setCatsLoading(true);
                setCatsError(null);
                getWorkCategories()
                  .then((c) => setCats(Array.isArray(c) ? c : []))
                  .catch(() => {
                    setCats([]);
                    setCatsError(t("ondemand.hire.categoriesLoadFailed", { defaultValue: "Couldn't load service categories. Check your connection and try again." }));
                  })
                  .finally(() => setCatsLoading(false));
              }}
              className="border border-border text-text-primary"
              style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, background: "transparent", borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}
            >
              {t("common.tryAgain", { defaultValue: "Try again" })}
            </button>
          </div>
        )}
        {!catsLoading && !catsError && filteredMacros.length === 0 && (
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginTop: 16 }}>
            {catQuery.trim()
              ? t("common.noResults")
              : t("ondemand.hire.noCategories", { defaultValue: "No service categories yet. Ask admin to seed Work categories." })}
          </p>
        )}
      </>
    ) : (
      <div>
        <div style={{ marginBottom: 14 }}><BackButton onClick={() => catalogMode && onNavigate ? onNavigate("bookartist") : setMacro(null)}>{catalogMode ? t("ondemand.hire.backToBookArtist", { defaultValue: "Back to Book Artist" }) : t("ondemand.hire.allCategories")}</BackButton></div>
        <p style={H({ fontSize: isMobile ? 17 : 20, margin: "0 0 12px", color: macroColor })}>{styleFor(macro.slug).icon} {workCategoryLabel(t, macro)}</p>
        {/* No map strip here on mobile — the mobile layout already pins a live map above the
            sheet, so rendering one inside the sheet showed the same map twice. */}
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{t("ondemand.hire.selectService")}</p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3,1fr)" : "repeat(auto-fill,minmax(124px,1fr))", gap: isMobile ? 12 : 22, justifyItems: "center" }}>
          {(macro.children || []).map((c, i) => (
            <button key={c.work_category_id} className="odc-circle" onClick={() => { setLeaf(c); setServiceMode(DEFAULT_IN_SHOP.has(macro.slug) ? "in_shop" : "mobile"); setStep("talent"); }} style={{ animation: `fadeUp 0.25s ease ${i * 25}ms both`, width: "100%" }}>
              <div className="odc-circle-disc" style={{ width: isMobile ? 62 : 104, height: isMobile ? 62 : 104, fontSize: isMobile ? 22 : 40, background: `${macroColor}22`, border: `2px solid ${macroColor}55`, boxShadow: `0 4px 14px ${macroColor}22`, overflow: "hidden", padding: 0 }}>
                {/* #427: this rendered the MACRO's emoji, so every service in a category looked
                    identical on desktop — the per-service artwork from #426 only ever reached the
                    mobile grid. */}
                <WorkCategoryIcon
                  slug={workIconKey(macro.slug, c.slug)}
                  fallbacks={workIconCandidates(macro.slug, c.slug).slice(1)}
                  alt={workCategoryLabel(t, c)}
                />
              </div>
              <span className="odc-circle-label" style={{ fontSize: isMobile ? 10 : 12 }}>{workCategoryLabel(t, c)}</span>
            </button>
          ))}
        </div>
      </div>
    )
  );

  const TalentContent = () => leaf && (
    <div>
      <div style={{ marginBottom: 14 }}><BackButton onClick={() => {
        if (catalogMode && onNavigate) { onNavigate("bookartist"); return; }
        setLeaf(null); setTalentLeafSlugs([]); setStep("browse");
      }}>{catalogMode ? t("ondemand.hire.backToBookArtist", { defaultValue: "Back to Book Artist" }) : t("ondemand.hire.changeCategory")}</BackButton></div>
      <p style={H({ fontSize: isMobile ? 17 : 20, margin: "0 0 8px", color: macroColor })}>
        {styleFor(macro?.slug).icon}{" "}
        {t("ondemand.hire.browseTalent", {
          name: workCategoryLabel(t, leaf),
          defaultValue: `Browse ${workCategoryLabel(t, leaf)}`,
        })}
      </p>
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 16px", textAlign: "center" }}>
        {catalogMode
          ? t("ondemand.hire.browseTalentHintCatalog", { defaultValue: "Book at their listed rate or package — they do not need to be online right now." })
          : t("ondemand.hire.browseTalentHint", { defaultValue: "Pick a provider at their rate, or post a job for anyone available." })}
      </p>

      {/* Location prompt already fills the map slot above — don't duplicate it here. */}
      {!userGeo && !catalogMode ? (
        <div className="border border-border bg-surface" style={{ borderRadius: 16, padding: 20, marginBottom: 16, textAlign: "center" }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 0 12px", lineHeight: 1.45 }}>
            {geoError || t("ondemand.hire.enableLocation", { defaultValue: "Enable location to see nearby workers" })}
          </p>
          <button
            type="button"
            onClick={requestLocation}
            style={{ background: macroColor, border: "none", borderRadius: 12, padding: "12px 18px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}
          >
            {t("ondemand.hire.allowLocation", { defaultValue: "Allow location" })}
          </button>
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>
            {t("ondemand.hire.orPostWithoutLocation", { defaultValue: "Or post an open job below without browsing nearby providers." })}
          </p>
        </div>
      ) : nearbyWorkers.length === 0 ? (
        <div className="border border-border bg-surface" style={{ borderRadius: 16, padding: 20, marginBottom: 16, textAlign: "center" }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 0 12px" }}>
            {catalogMode
              ? t("ondemand.hire.noTalentCatalog", { defaultValue: "No artists have listed this service yet. Post an open job, or check back soon." })
              : t("ondemand.hire.noTalentNearby", { defaultValue: "No providers online nearby for this category right now." })}
          </p>
          <button type="button" onClick={() => setStep("form")} style={{ background: macroColor, border: "none", borderRadius: 12, padding: "12px 18px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            {t("ondemand.hire.postOpenJob", { defaultValue: "Post an open job" })}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, textAlign: "left" }}>
          {nearbyWorkers.map((w) => {
            const rate = formatWorkerRate(w);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => selectWorker(w)}
                className="border border-border bg-surface"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: 14,
                  padding: "12px 14px",
                  cursor: "pointer",
                  color: "inherit",
                  width: "100%",
                  textAlign: "left",
                }}
              >
                <SafeImage
                  src={w.photo}
                  alt=""
                  style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: `2px solid ${macroColor}`, flexShrink: 0 }}
                  fallback={
                    <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${macroColor}22`, border: `2px solid ${macroColor}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: macroColor }}>{w.initial || "?"}</span>
                    </div>
                  }
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700 }}>
                    {nameOf(w) || w.initial || "?"}
                  </div>
                  <div className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 2 }}>
                    {w.rating != null ? `★ ${Number(w.rating).toFixed(1)}` : t("ondemand.hire.newProvider", { defaultValue: "New" })}
                    {w.dist_km != null ? ` · ${w.dist_km} km` : ""}
                    {` · ${w.is_available
                      ? t("ondemand.hire.artistOnline", { defaultValue: "Online now" })
                      : t("ondemand.hire.artistBookAhead", { defaultValue: "Book ahead" })}`}
                  </div>
                  {(w.packages || []).length > 0 && (
                    <div className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 4 }}>
                      {(w.packages || []).slice(0, 2).map((p) => p.name).join(" · ")}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 800, color: macroColor }}>
                    {rate || t("ondemand.hire.rateOnRequest", { defaultValue: "Ask" })}
                  </div>
                  <div className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 2 }}>
                    {t("ondemand.hire.bookThem", { defaultValue: "Book" })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setStep("form")}
        className="border border-border text-text-primary"
        style={{ width: "100%", background: "transparent", borderRadius: 12, padding: "12px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
      >
        {t("ondemand.hire.orAutoMatch", { defaultValue: "Or post a job — match any available provider" })}
      </button>
    </div>
  );

  const FormContent = () => leaf && (
    <div className="odc-maincard" style={{ ...card, "--c": macroColor, borderColor: `${macroColor}44` }}>
      <div style={{ marginBottom: 14 }}><BackButton onClick={() => setStep("talent")}>{t("ondemand.hire.backToTalent", { defaultValue: "Back to providers" })}</BackButton></div>
      <p style={H({ fontSize: isMobile ? 17 : 20, margin: "0 0 16px", color: macroColor })}>{styleFor(macro?.slug).icon} {t("ondemand.hire.bookService", { name: workCategoryLabel(t, leaf) })}</p>

      {DEFAULT_IN_SHOP.has(macro?.slug) && (
        <>
          <label id={`${uid}-d-mode`} style={labelSt}>{t("ondemand.hire.howItWorks")}</label>
          <div role="group" aria-labelledby={`${uid}-d-mode`} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[{ k: "mobile", t: t("ondemand.hire.theyComeToYou") }, { k: "in_shop", t: t("ondemand.hire.youGoToThem") }].map((m) => (
              // Idle text is conditional (not fixed "#fff") — idle bg is a themed surface tint,
              // near-white in light theme, so fixed white text would vanish there.
              <button key={m.k} onClick={() => setServiceMode(m.k)} style={{ flex: 1, background: serviceMode === m.k ? macroColor : "var(--color-surface)", border: `1px solid ${serviceMode === m.k ? macroColor : "var(--color-border)"}`, borderRadius: 10, padding: "9px 0", color: serviceMode === m.k ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{m.t}</button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, marginBottom: durationHours ? 8 : 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor={`${uid}-d-start`} style={labelSt}>{t("ondemand.hire.starts")}</label>
          {/* colorScheme stays "dark" — see the comment on the matching input in DirectOfferModal above. */}
          <input id={`${uid}-d-start`} type="datetime-local" min={minStart} value={start} onChange={(e) => { setStart(e.target.value); if (end && new Date(end) <= new Date(e.target.value)) setEnd(""); }} style={{ ...inputSt, colorScheme: "dark" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor={`${uid}-d-end`} style={labelSt}>{t("ondemand.hire.ends")}</label>
          <input id={`${uid}-d-end`} type="datetime-local" min={start || minStart} value={end} onChange={(e) => setEnd(e.target.value)} style={{ ...inputSt, colorScheme: "dark" }} />
        </div>
      </div>
      {durationHours != null && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: macroColor, margin: "0 0 16px", fontWeight: 600 }}>{t("ondemand.hire.duration", { duration: fmtDuration(t, durationHours) })}</p>
      )}

      <label htmlFor={`${uid}-d-location`} style={labelSt}>{serviceMode === "in_shop" ? t("ondemand.hire.locationInShop") : t("ondemand.hire.workLocation")}</label>
      <div style={{ marginBottom: 16 }}>
        <AddressAutocomplete inputId={`${uid}-d-location`} value={address} onChange={(addr, lat, lng) => { setAddress(addr); if (lat != null) setCoords({ lat, lng }); }} placeholder={serviceMode === "in_shop" ? t("ondemand.hire.placeholderArea") : t("ondemand.hire.placeholderWorkAddress")} useLocation wrapStyle={{ width: "100%" }} inputStyle={{ ...inputSt, textAlign: "left" }} />
      </div>

      <label htmlFor={`${uid}-d-instructions`} style={labelSt}>{t("ondemand.hire.instructionsLabel")}</label>
      <textarea id={`${uid}-d-instructions`} value={instructions} onChange={(e) => { if (e.target.value.length <= 2000) setInstructions(e.target.value); }} rows={3} placeholder={t("ondemand.hire.instructionsPlaceholder")} style={{ ...inputSt, textAlign: "left", resize: "vertical", marginBottom: 16 }} />

      <label htmlFor={`${uid}-d-photos`} style={labelSt}>{t("ondemand.hire.photosLabel")}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center", justifyContent: "center" }}>
        {photos.map((f, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={URL.createObjectURL(f)} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} />
            {/* Remove button sits on top of an arbitrary user photo, not page chrome — stays a
                fixed dark circle so the white "×" always reads regardless of the photo underneath. */}
            <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", cursor: "pointer", fontSize: 12 }}>×</button>
          </div>
        ))}
        {photos.length < 5 && (
          <>
            <label
              htmlFor={`${uid}-d-photos`}
              className="bg-surface text-text-secondary" style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                border: "1px dashed var(--color-border)",
                cursor: "pointer",
                fontSize: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              +
            </label>
            <input
              key={fileInputKey}
              id={`${uid}-d-photos`}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);

                // Check if we're trying to add too many files
                if (photos.length + files.length > 5) {
                  setErr(`You can select up to 5 photos total. You currently have ${photos.length} selected.`);
                  setFileInputKey(prev => prev + 1);
                  return;
                }

                // Validate file types
                const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
                if (invalidFiles.length > 0) {
                  setErr('Please select only image files (JPG, PNG, GIF, etc.)');
                  setFileInputKey(prev => prev + 1);
                  return;
                }

                // If validation passes, add the files and clear error
                setErr(null);
                setPhotos((p) => [...p, ...files]);
                setFileInputKey(prev => prev + 1);
              }}
            />
          </>
        )}
      </div>

      {err && <p style={{color: '#f87171', textAlign: 'center'}}>{err}</p>}

      <label htmlFor={`${uid}-d-price`} style={labelSt}>{t("ondemand.hire.yourPrice")}</label>
      <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 8px", textAlign: "center" }}>
        {t("ondemand.hire.openJobPriceHint", { defaultValue: "Open job — offer a price any available provider can accept. To book someone at their listed rate, pick them from the list instead." })}
      </p>
      {(() => {
        const rated = (nearbyWorkers || []).map((w) => formatWorkerRate(w)).filter(Boolean);
        if (!rated.length) return null;
        return (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: macroColor, margin: "0 0 10px", fontWeight: 600, textAlign: "center" }}>
            {t("ondemand.hire.nearbyRatesHint", { defaultValue: "Nearby listed rates" })}: {rated.slice(0, 3).join(" · ")}
          </p>
        );
      })()}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {["flat", "hourly"].map((pt) => (
          // Idle text is conditional (not fixed "#fff") — see the matching toggle in DirectOfferModal above.
          <button key={pt} onClick={() => setPriceType(pt)} style={{ flex: 1, background: priceType === pt ? macroColor : "var(--color-surface)", border: `1px solid ${priceType === pt ? macroColor : "var(--color-border)"}`, borderRadius: 10, padding: "9px 0", color: priceType === pt ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{pt === "flat" ? t("ondemand.hire.flatTotal") : t("ondemand.hire.hourlyRate")}</button>
        ))}
      </div>
      <input id={`${uid}-d-price`} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={priceType === "hourly" ? t("ondemand.hire.placeholderHourly") : t("ondemand.hire.placeholderTotal")} style={{ ...inputSt, marginBottom: 10 }} />
      {quote && (
        <div className="text-text-secondary" style={{ background: `${macroColor}1a`, border: `1px solid ${macroColor}55`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
          {t("ondemand.hire.quoteLineUser", { total: money(quote.total_charged) })}
        </div>
      )}

      <label id={`${uid}-d-pay`} style={labelSt}>{t("ondemand.hire.paymentMethod")}</label>
      <div role="group" aria-labelledby={`${uid}-d-pay`} style={{ marginBottom: 8, textAlign: "left" }}>
        <CardInput />
      </div>
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 16px", textAlign: "center" }}>
        {t("ondemand.hire.chargeWhenFound")}
      </p>
      <button onClick={submit} disabled={busy} style={{ width: "100%", background: macroColor, border: "none", borderRadius: 12, padding: "13px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>{busy ? t("ondemand.hire.booking") : t("ondemand.hire.findProvider")}</button>
    </div>
  );

  const handleDismissSearch = async () => {
    // While the job is still SEARCHING, cancel it server-side before severing tracking:
    // that path refunds, and it stops a worker being dispatched to a search the hirer
    // has walked away from.
    //
    // A direct offer (status 'offered') is deliberately NOT cancelled here. Closing this
    // panel is the normal thing to do for a catalog offer that stays open up to 48 hours.
    // The offer expires on its own and the timeout path refunds with the same
    // direct_offer_refund key as an explicit cancel. directOfferWorkerName covers the
    // race before the first poll has set job.status.
    const jobId = jobIdRef.current;
    const isDirectOffer = job?.status === "offered" || Boolean(directOfferWorkerName);
    if (jobId && !isDirectOffer) {
      try { await cancelWorkJob(jobId, "hirer dismissed"); } catch { /* best-effort; noop */ }
    }
    setStep("form");
    jobIdRef.current = null;
    setDirectOfferWorkerName("");
    setDeclinedWorkerName("");
    setDirectOfferTimedOut(false);
  };

  const SearchingContent = () => {
    const isDirectOffer = job && job.status === 'offered';
    return (
      <div style={{ ...card, maxWidth: 520, margin: "0 auto", padding: "44px 24px", position: "relative" }}>
        <button type="button" aria-label={t("common.close", { defaultValue: "Close" })} onClick={handleDismissSearch} style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <div style={{ width: 18, height: 2, backgroundColor: macroColor, transform: "rotate(45deg)" }} />
          <div style={{ width: 18, height: 2, backgroundColor: macroColor, transform: "rotate(-45deg)", marginTop: -2 }} />
        </button>
        {isDirectOffer ? (
          <>
            {directOfferTimedOut ? (
              <>
                <p style={H({ fontSize: 22, margin: "0 0 6px" })}>{t("ondemand.hire.workerNoResponseTitle")}</p>
                <p className="text-text-secondary" style={{ fontSize: 14, margin: "0 0 20px" }}>{t("ondemand.hire.workerNoResponseMessage")}</p>
                <button onClick={handleDismissSearch} style={{ width: "100%", background: macroColor, border: "none", borderRadius: 12, padding: "13px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  {t("ondemand.hire.bookAnother")}
                </button>
              </>
            ) : (
              <>
                {declinedWorkerName && declinedWorkerName !== t("ondemand.hire.unknownWorker") ? (
                  <p style={H({ fontSize: 22, margin: "0 0 6px" })}>{t("ondemand.hire.workerDeclined", { workerName: declinedWorkerName })}</p>
                ) : (
                  <>
                    {declinedWorkerName && declinedWorkerName === t("ondemand.hire.unknownWorker") ? (
                      <p style={H({ fontSize: 22, margin: "0 0 6px" })}>{t("ondemand.hire.offerDeclined")}</p>
                    ) : (
                      <>
                        {directOfferWorkerName && directOfferWorkerName.trim() !== '' ? (
                          <p style={H({ fontSize: 22, margin: "0 0 6px" })}>{t("ondemand.hire.directOfferSent", { workerName: directOfferWorkerName })}</p>
                        ) : (
                          <p style={H({ fontSize: 22, margin: "0 0 6px" })}>{t("ondemand.hire.directOfferWaiting")}</p>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <p style={H({ fontSize: 22, margin: "0 0 6px" })}>{t("ondemand.hire.finding", { name: workCategoryLabel(t, leaf) })}</p>
            <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0 }}>{t("ondemand.hire.searchingHint")}</p>
          </>
        )}
      </div>
    );
  };

  const TrackingContent = () => job && (
    <div style={{ ...card, maxWidth: 560, margin: "0 auto", border: `1px solid ${macroColor}66` }}>
      <span style={{ display: "inline-block", background: "rgba(5,150,105,0.18)", border: "1px solid #059669", borderRadius: 999, padding: "4px 14px", color: "#34d399", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
        {job.service_mode === "in_shop"
          ? (job.status === "accepted" ? t("ondemand.hire.statusProviderConfirmedHead") : job.status === "in_progress" ? t("ondemand.hire.statusServiceInProgress") : t("ondemand.hire.statusProviderReady"))
          : (job.status === "accepted" ? t("ondemand.hire.statusProviderConfirmed") : job.status === "worker_en_route" ? t("ondemand.hire.statusOnTheWay") : t("ondemand.hire.statusWorkInProgress"))}
      </span>
      <p style={H({ fontSize: 22, margin: "0 0 4px" })}>{workCategoryLabel(t, leaf) || job.title}</p>
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{job.address} · {job.scheduled_start ? new Date(job.scheduled_start).toLocaleString() : ""}</p>
      {job.service_mode !== "in_shop" && (job.location_lat != null || coords.lat != null) && (
        <>
          <LiveTrackingMap live={providerLoc} destination={{ lat: job.location_lat ?? coords.lat, lng: job.location_long ?? coords.lng }} accent={macroColor} height={isMobile ? 200 : 240} onEta={setEtaMin} liveAvatar={avatarUrlOf(job.worker ?? job.provider ?? { profile_pic_url: job.worker_profile_pic_url ?? job.provider_profile_pic_url })} liveName={nameOf(job.worker ?? job.provider ?? { name: job.worker_name ?? job.provider_name })} />
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: providerLoc && etaMin != null && job.status === "worker_en_route" ? macroColor : "var(--color-text-secondary)", fontWeight: providerLoc && etaMin != null && job.status === "worker_en_route" ? 700 : 400, margin: "8px 0 0" }}>
            {providerLoc ? (etaMin != null && job.status === "worker_en_route" ? t("ondemand.hire.etaAway", { count: etaMin, defaultValue: `Arriving in about ${etaMin} min` }) : t("ondemand.hire.liveLocation")) : t("ondemand.hire.mapUpdatesLive")}
          </p>
        </>
      )}
      {job.service_mode === "in_shop" && job.provider_location && (
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${job.provider_location.lat},${job.provider_location.lng}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, background: macroColor, borderRadius: 999, padding: "9px 18px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>{t("ondemand.hire.navigateToProvider")}</a>
      )}
      {job.instructions && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "10px auto 0", lineHeight: 1.6, maxWidth: 440 }}>{job.instructions}</p>}
      <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "14px 0 0" }}>{t("ondemand.hire.total")} <strong style={{ color: macroColor }}>{money(job.hirer_set_price)}</strong></p>
      {job.work_job_id && ["accepted", "worker_en_route", "in_progress"].includes(job.status) && (
        <button type="button" onClick={() => openContextChat("ondemand", job.work_job_id).catch(() => {})} className="bg-surface text-text-primary" style={{ marginTop: 14, width: "100%", border: `1px solid ${macroColor}55`, borderRadius: 12, padding: "11px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          {t("ondemand.hire.openProviderChat")}
        </button>
      )}
      {["accepted", "worker_en_route"].includes(job.status) && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="button" onClick={() => setShowEmployerCancelConfirm(true)} className="bg-surface border border-border text-text-primary" style={{ flex: 1, borderRadius: 12, padding: "11px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            {t("ondemand.hire.cancelJob")}
          </button>
          <button type="button" onClick={() => setShowNoShowConfirm(true)} style={{ flex: 1, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "11px 0", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            {t("ondemand.hire.workerDidNotArrive")}
          </button>
        </div>
      )}
    </div>
  );

  const DoneContent = () => job && (
    <div style={{ ...card, maxWidth: 520, margin: "0 auto", padding: "34px 24px" }}>
      <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(5,150,105,0.18)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 28, color: "#34d399" }}>✓</div>
      <p style={H({ fontSize: 24, margin: "0 0 6px" })}>{t("ondemand.hire.jobComplete")}</p>
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0 }}>{workCategoryLabel(t, leaf) || job.title} · {money(job.hirer_set_price)}</p>
      {rewardDone ? (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#34d399", margin: "18px 0 0" }}>{t("ondemand.hire.thanksTipRating")}</p>
      ) : (
        <>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "20px 0 8px" }}>{t("ondemand.hire.addTip")} <span className="text-text-muted">{t("ondemand.hire.tipToProvider")}</span></p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {[0.10, 0.15, 0.20].map((p) => {
              const amt = Math.round((Number(job.hirer_set_price) || 0) * p * 100) / 100;
              const sel = tipSel === amt && amt > 0;
              // Idle text is conditional (not fixed "#fff") — idle bg is a themed surface tint,
              // near-white in light theme, so fixed white text would vanish there.
              return <button key={p} onClick={() => setTipSel(sel ? 0 : amt)} style={{ background: sel ? "#059669" : "var(--color-surface)", border: `1px solid ${sel ? "#059669" : "var(--color-border)"}`, borderRadius: 999, padding: "8px 16px", color: sel ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer" }}>{Math.round(p * 100)}% · {money(amt)}</button>;
            })}
            <input type="number" min="0" placeholder={t("ondemand.hire.customTipPlaceholder")} onChange={(e) => setTipSel(Number(e.target.value) || 0)} className="bg-surface border border-border text-text-primary" style={{ width: 90, borderRadius: 999, padding: "8px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", textAlign: "center" }} />
          </div>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "20px 0 8px" }}>{t("ondemand.hire.rateProvider")}</p>
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 30, lineHeight: 1, color: n <= rating ? "#f59e0b" : "var(--color-text-muted)", padding: 0 }}>★</button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder={t("ondemand.hire.commentPlaceholder")} className="bg-surface border border-border text-text-primary" style={{ width: "100%", marginTop: 12, borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical", textAlign: "left" }} />
          {/* Idle text is conditional (not fixed "#fff") — same reasoning as the tip chips above. */}
          <button onClick={submitReward} disabled={rewardBusy || (tipSel <= 0 && rating <= 0)} style={{ width: "100%", marginTop: 14, background: (tipSel > 0 || rating > 0) ? "#059669" : "var(--color-surface)", border: "none", borderRadius: 12, padding: "12px 0", color: (tipSel > 0 || rating > 0) ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: (rewardBusy || (tipSel <= 0 && rating <= 0)) ? "default" : "pointer", opacity: rewardBusy ? 0.7 : 1 }}>{rewardBusy ? t("ondemand.hire.sending") : t("ondemand.hire.submitTipRating")}</button>
        </>
      )}
      <button onClick={() => { resetForm(); setStep("browse"); }} className="text-text-muted" style={{ marginTop: 16, background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer" }}>{rewardDone ? t("ondemand.hire.bookAnother") : t("ondemand.hire.skip")}</button>
    </div>
  );

  const ReplacementContent = () => (
    <div style={{ ...card, maxWidth: 520, margin: "0 auto", padding: "34px 24px" }}>
      <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(239,68,68,0.18)", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 28, color: "#f87171" }}>!</div>
      <p style={H({ fontSize: 24, margin: "0 0 6px" })}>{t("ondemand.hire.workerNoShowTitle")}</p>
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 0 20px" }}>{t("ondemand.hire.workerNoShowMessage")}</p>
      <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
        <button onClick={handleFindReplacement} style={{ width: "100%", background: macroColor, border: "none", borderRadius: 12, padding: "13px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          {t("ondemand.hire.findReplacement")}
        </button>
        {/* Border-only button — background stays "transparent" (shows the modal card's own
            surface), so its text must follow the themed primary color, not a fixed "#fff". */}
        <button onClick={handleCancelJobNoShow} className="border border-border text-text-primary" style={{ width: "100%", background: "transparent", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
          {t("ondemand.hire.cancelJob")}
        </button>
      </div>
    </div>
  );

  const PageTitle = ({ size }) => (
    <h1 style={H({ fontSize: size || (isMobile ? 21 : 28), margin: "0 0 8px", textAlign: "center" })}>
      {catalogMode
        ? t("ondemand.hire.pageTitleBookArtist", { defaultValue: "Book an Artist" })
        : t("ondemand.hire.pageTitle")}
    </h1>
  );
  const PageSubtitle = () => (
    <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 15, margin: "0 auto 16px", maxWidth: 540, lineHeight: 1.5, textAlign: "center" }}>
      {catalogMode
        ? t("ondemand.hire.subtitleBookArtist", { defaultValue: "Artists set their own rates and packages. Pick someone to book, or post an open job." })
        : t("ondemand.hire.subtitle")}
    </p>
  );

  const styleBlock = (
    <style>{`
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      .odc-chip{ display:inline-flex; align-items:center; gap:10px; background:var(--color-surface); border:1px solid var(--color-border); color:var(--color-text-secondary); border-radius:14px; padding:13px 20px; font-family:'DM Sans',sans-serif; font-size:15px; font-weight:600; cursor:pointer; transition:all .18s ease; }
      .odc-chip .odc-ico{ font-size:20px; width:26px; height:26px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; filter:grayscale(1) opacity(.6); transition:filter .18s ease; }
      .odc-chip:hover{ background:var(--c); border-color:var(--c); color:#fff; transform:translateY(-3px); box-shadow:0 10px 24px -8px var(--c); }
      .odc-chip:hover .odc-ico{ filter:none; }
      .odc-maincard{ transition:all .18s ease; }
      .odc-maincard:hover{ border-color:var(--c); box-shadow:0 12px 30px -12px var(--c); }
      .odc-circle{ display:flex; flex-direction:column; align-items:center; gap:7px; background:none; border:none; cursor:pointer; padding:0; -webkit-tap-highlight-color:transparent; min-width:0; }
      .odc-circle-disc{ width:66px; height:66px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:28px; flex-shrink:0; overflow:hidden; transition:transform .15s ease, box-shadow .15s ease; }
      .odc-circle:active .odc-circle-disc{ transform:scale(0.91); }
      /* #425: the label was pinned to max-width:72px inside a ~100px grid cell and used
         word-break:break-word, which splits words down the middle — that reads as text being
         cut off. Let it use the full cell and only break a word when the word itself cannot
         fit. The macro grid is auto-fit too, so on a 320px phone it drops from 4 columns to 3
         rather than squeezing a 71px word ("Entertainment") into a 66px box. */
      .odc-circle-label{ font-family:'DM Sans',sans-serif; font-size:10px; font-weight:600; color:var(--color-text-secondary); text-align:center; line-height:1.3; width:100%; overflow-wrap:break-word; hyphens:auto; }
    `}</style>
  );

  // ── Mobile circle-grid browse (reference: "Available Service" layout) ──
  if (loading) {
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px 60px" : "24px 24px 64px 108px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <Skel w={260} h={30} r={8} />
          <div style={{ height: 18 }} />
          <Skel w="100%" h={320} r={18} />
        </div>
      </div>
    );
  }

  // ── MOBILE: map at top + scrollable service panel below ──
  if (isMobile) {
    const mapColor = macro ? macroColor : ACCENT;
    const mapH = step === "browse" ? "40vh" : "26vh";
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {styleBlock}
        {dialog}

        {/* Map — fixed height at top */}
        <div style={{ height: mapH, minHeight: step === "browse" ? 190 : 120, flexShrink: 0 }}>
          {userGeo ? (
            <NearbyWorkersMap userGeo={userGeo} workers={nearbyWorkers} color={mapColor} addr={coords} fill isMobile t={t} />
          ) : (
            <LocationPrompt message={geoError} onRetry={requestLocation} t={t} />
          )}
        </div>

        {/* Content card — slides up over map edge */}
        <div className="bg-bg" style={{
          flex: 1, overflowY: "auto", borderRadius: "20px 20px 0 0", marginTop: -16, position: "relative", zIndex: 1,
          boxShadow: "0 -6px 20px var(--color-shadow)", borderTop: "1px solid var(--color-border-subtle)",
          // #455 ("mobile information is cut off for on demand"): 110px cleared the 62px nav bar but
          // NOT the floating Messages button, which occupies bottom 78→132. So the last row of
          // categories — and the second line of a wrapping label like "Security & Surveillance" —
          // stayed permanently underneath it with nowhere to scroll to. Clear both.
          WebkitOverflowScrolling: "touch", padding: "10px 16px 150px",
        }}>
          <div className="bg-border" style={{ width: 40, height: 4, borderRadius: 2, margin: "4px auto 18px" }} />

          {step === "browse" && (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {PageTitle({ size: 20 })}
                  {PageSubtitle()}
                </div>
              </div>
              <WorkerProfileSidebar
                workers={nearbyWorkers}
                color={macroColor}
                onSelectWorker={selectWorker}
                horizontal
                t={t}
              />
              {BrowseContent()}
            </>
          )}
          {step === "talent" && TalentContent()}
          {step === "form" && FormContent()}
          {step === "searching" && SearchingContent()}
          {step === "tracking" && TrackingContent()}
          {step === "done" && DoneContent()}
          {step === "replacement" && ReplacementContent()}
        </div>

        {/* #432: the direct-offer flow existed only in the desktop tree, so a phone could see
            no workers and had no way to hire a specific one. */}
        {directTarget && (
          <DirectOfferModal
            worker={directTarget}
            leaf={leaf}
            macro={macro}
            color={macroColor}
            minStart={minStart}
            start={start} setStart={setStart}
            end={end} setEnd={setEnd}
            address={address} setAddress={setAddress}
            coords={coords} setCoords={setCoords}
            instructions={instructions} setInstructions={setInstructions}
            photos={photos} setPhotos={setPhotos}
            priceType={priceType} setPriceType={setPriceType}
            price={price} setPrice={setPrice}
            quote={quote}
            durationHours={durationHours}
            serviceMode={serviceMode} setServiceMode={setServiceMode}
            busy={busy} setBusy={setBusy}
            onClose={() => setDirectTarget(null)}
            onSent={(jobId, workerName) => { setDirectTarget(null); jobIdRef.current = jobId; setStep("searching"); setDirectOfferWorkerName(workerName); }}
            stripe={stripe}
            elements={elements}
            t={t}
            resolveLeafFromWorker={resolveLeafFromWorker}
            catalogBooking={catalogMode || directTarget?.is_available === false}
          />
        )}

        {/* No-show confirmation modal */}
        {showNoShowConfirm && (
          // Backdrop scrim stays dark in both themes — dimming the page behind a modal, not a
          // themed surface (same call as DirectOfferModal's backdrop above).
          <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget && !noShowBusy) setShowNoShowConfirm(false); }}>
            <div className="bg-surface-raised border border-border" style={{ width: "100%", maxWidth: 420, borderRadius: 22, padding: "34px 30px 28px", boxShadow: "0 24px 70px var(--color-shadow)", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, margin: "0 auto 18px", borderRadius: "50%", background: "#ef44441f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, lineHeight: 1 }}>!</div>
              </div>
              <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.01em", margin: "0 0 8px" }}>
                {t("ondemand.hire.workerDidNotArrive")}
              </p>
              <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5, margin: "0 0 26px" }}>
                {t("ondemand.hire.noShowConfirmMessage")}
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
                {/* Border-only button — bg stays "transparent" (shows the card's own surface), so
                    text follows the themed primary color, not a fixed "#fff". */}
                <button onClick={() => !noShowBusy && setShowNoShowConfirm(false)} disabled={noShowBusy} className="border border-border text-text-primary" style={{ flex: 1, padding: "13px 0", background: "transparent", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: noShowBusy ? "default" : "pointer" }}>
                  {t("common.cancel")}
                </button>
                <button onClick={handleNoShow} disabled={noShowBusy} style={{ flex: 1, padding: "13px 0", background: noShowBusy ? "#ef4444cc" : "#ef4444", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: noShowBusy ? "default" : "pointer", opacity: noShowBusy ? 0.85 : 1 }}>
                  {noShowBusy ? t("dialog.working") : t("ondemand.hire.markNoShow")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Employer cancel confirmation modal */}
        {showEmployerCancelConfirm && (
          // Backdrop scrim stays dark in both themes — dimming the page behind a modal, not a
          // themed surface (same call as DirectOfferModal's backdrop above).
          <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget && !employerCancelBusy) setShowEmployerCancelConfirm(false); }}>
            <div className="bg-surface-raised border border-border" style={{ width: "100%", maxWidth: 420, borderRadius: 22, padding: "34px 30px 28px", boxShadow: "0 24px 70px var(--color-shadow)", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, margin: "0 auto 18px", borderRadius: "50%", background: "#f59e0b1f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", border: "2px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b", fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, lineHeight: 1 }}>!</div>
              </div>
              <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.01em", margin: "0 0 8px" }}>
                {t("ondemand.hire.cancelJob")}
              </p>
              <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5, margin: "0 0 26px" }}>
                {t("ondemand.hire.employerCancelConfirmMessage")}
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
                {/* Border-only button — bg stays "transparent" (shows the card's own surface), so
                    text follows the themed primary color, not a fixed "#fff". */}
                <button onClick={() => !employerCancelBusy && setShowEmployerCancelConfirm(false)} disabled={employerCancelBusy} className="border border-border text-text-primary" style={{ flex: 1, padding: "13px 0", background: "transparent", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: employerCancelBusy ? "default" : "pointer" }}>
                  {t("common.cancel")}
                </button>
                <button onClick={handleEmployerCancel} disabled={employerCancelBusy} style={{ flex: 1, padding: "13px 0", background: employerCancelBusy ? "#f59e0bcc" : "#f59e0b", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: employerCancelBusy ? "default" : "pointer", opacity: employerCancelBusy ? 0.85 : 1 }}>
                  {employerCancelBusy ? t("dialog.working") : t("ondemand.hire.confirmCancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP: 3-column layout ──
  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden", paddingLeft: 108 }}>
      {styleBlock}
      {dialog}

      {/* Left worker sidebar */}
      <WorkerProfileSidebar
        workers={nearbyWorkers}
        color={macroColor}
        onSelectWorker={selectWorker}
        t={t}
      />

      {/* Center column: sticky map header + scrollable form */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {/* Sticky map */}
        <div style={{ flexShrink: 0, height: "38vh", minHeight: 220 }}>
          {userGeo ? (
            <NearbyWorkersMap userGeo={userGeo} workers={nearbyWorkers} color={macroColor} addr={coords} fill t={t} />
          ) : (
            <LocationPrompt message={geoError} onRetry={requestLocation} t={t} />
          )}
        </div>

        {/* Scrollable form area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 40px 80px" }}>
          {/* #427: on desktop/laptop the category grid was boxed into this 600px column, so on a
              1440px screen it used ~600px and left 840px (58%) of the width empty — which is why
              the icons read as tiny. While BROWSING categories, widen the column so the grid can
              actually fill the screen. The booking form (step === "form") stays narrow, where a
              600px column is the right measure for a form. */}
          <div style={{ maxWidth: !isMobile && step === "browse" ? 1180 : 600, margin: "0 auto", width: "100%", textAlign: "center", transition: "max-width .2s ease" }}>
            {PageTitle({ size: 28 })}
            {PageSubtitle()}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            </div>

            {/* Desktop: hint to use sidebars when category is active */}
            {macro && step === "browse" && nearbyWorkers.length > 0 && (
              <div className="text-text-secondary" style={{ background: `${macroColor}12`, border: `1px solid ${macroColor}33`, borderRadius: 12, padding: "10px 16px", marginBottom: 18, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                <strong style={{ color: macroColor }}>{nearbyWorkers.length} workers</strong> available nearby — click a profile on the left or right to send a direct offer, or select a worker type below to auto-match.
              </div>
            )}

            {step === "browse" && BrowseContent()}
            {step === "talent" && TalentContent()}
            {step === "form" && FormContent()}
            {step === "searching" && SearchingContent()}
            {step === "tracking" && TrackingContent()}
            {step === "done" && DoneContent()}
            {step === "replacement" && ReplacementContent()}
          </div>
        </div>
      </div>

      {/* Right worker sidebar */}
      <WorkerProfileSidebar
        workers={nearbyWorkers}
        color={macroColor}
        onSelectWorker={selectWorker}
        t={t}
      />

      {/* Direct offer modal */}
      {directTarget && (
        <DirectOfferModal
          worker={directTarget}
          leaf={leaf}
          macro={macro}
          color={macroColor}
          minStart={minStart}
          start={start} setStart={setStart}
          end={end} setEnd={setEnd}
          address={address} setAddress={setAddress}
          coords={coords} setCoords={setCoords}
          instructions={instructions} setInstructions={setInstructions}
          photos={photos} setPhotos={setPhotos}
          priceType={priceType} setPriceType={setPriceType}
          price={price} setPrice={setPrice}
          quote={quote}
          durationHours={durationHours}
          serviceMode={serviceMode} setServiceMode={setServiceMode}
          busy={busy} setBusy={setBusy}
          onClose={() => setDirectTarget(null)}
          onSent={(jobId, workerName) => { setDirectTarget(null); jobIdRef.current = jobId; setStep("searching"); setDirectOfferWorkerName(workerName); }}
          stripe={stripe}
          elements={elements}
          t={t}
          resolveLeafFromWorker={resolveLeafFromWorker}
          catalogBooking={catalogMode || directTarget?.is_available === false}
        />
      )}

      {/* No-show confirmation modal */}
      {showNoShowConfirm && (
        // Backdrop scrim stays dark in both themes — dimming the page behind a modal, not a
        // themed surface (same call as DirectOfferModal's backdrop above).
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget && !noShowBusy) setShowNoShowConfirm(false); }}>
          <div className="bg-surface-raised border border-border" style={{ width: "100%", maxWidth: 420, borderRadius: 22, padding: "34px 30px 28px", boxShadow: "0 24px 70px var(--color-shadow)", textAlign: "center" }}>
            <div style={{ width: 72, height: 72, margin: "0 auto 18px", borderRadius: "50%", background: "#ef44441f", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, lineHeight: 1 }}>!</div>
            </div>
            <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.01em", margin: "0 0 8px" }}>
              {t("ondemand.hire.workerDidNotArrive")}
            </p>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5, margin: "0 0 26px" }}>
              {t("ondemand.hire.noShowConfirmMessage")}
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
              {/* Border-only button — bg stays "transparent" (shows the card's own surface), so
                  text follows the themed primary color, not a fixed "#fff". */}
              <button onClick={() => !noShowBusy && setShowNoShowConfirm(false)} disabled={noShowBusy} className="border border-border text-text-primary" style={{ flex: 1, padding: "13px 0", background: "transparent", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: noShowBusy ? "default" : "pointer" }}>
                {t("common.cancel")}
              </button>
              <button onClick={handleNoShow} disabled={noShowBusy} style={{ flex: 1, padding: "13px 0", background: noShowBusy ? "#ef4444cc" : "#ef4444", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: noShowBusy ? "default" : "pointer", opacity: noShowBusy ? 0.85 : 1 }}>
                {noShowBusy ? t("dialog.working") : t("ondemand.hire.markNoShow")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employer cancel confirmation modal */}
      {showEmployerCancelConfirm && (
        // Backdrop scrim stays dark in both themes — dimming the page behind a modal, not a
        // themed surface (same call as DirectOfferModal's backdrop above).
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget && !employerCancelBusy) setShowEmployerCancelConfirm(false); }}>
          <div className="bg-surface-raised border border-border" style={{ width: "100%", maxWidth: 420, borderRadius: 22, padding: "34px 30px 28px", boxShadow: "0 24px 70px var(--color-shadow)", textAlign: "center" }}>
            <div style={{ width: 72, height: 72, margin: "0 auto 18px", borderRadius: "50%", background: "#f59e0b1f", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", border: "2px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b", fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, lineHeight: 1 }}>!</div>
            </div>
            <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.01em", margin: "0 0 8px" }}>
              {t("ondemand.hire.cancelJob")}
            </p>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5, margin: "0 0 26px" }}>
              {t("ondemand.hire.employerCancelConfirmMessage")}
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
              {/* Border-only button — bg stays "transparent" (shows the card's own surface), so
                  text follows the themed primary color, not a fixed "#fff". */}
              <button onClick={() => !employerCancelBusy && setShowEmployerCancelConfirm(false)} disabled={employerCancelBusy} className="border border-border text-text-primary" style={{ flex: 1, padding: "13px 0", background: "transparent", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: employerCancelBusy ? "default" : "pointer" }}>
                {t("common.cancel")}
              </button>
              <button onClick={handleEmployerCancel} disabled={employerCancelBusy} style={{ flex: 1, padding: "13px 0", background: employerCancelBusy ? "#f59e0bcc" : "#f59e0b", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: employerCancelBusy ? "default" : "pointer", opacity: employerCancelBusy ? 0.85 : 1 }}>
                {employerCancelBusy ? t("dialog.working") : t("ondemand.hire.confirmCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
