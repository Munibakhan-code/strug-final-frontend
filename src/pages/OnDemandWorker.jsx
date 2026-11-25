import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import i18n from "../i18n/index.js";
import { useTranslation } from "react-i18next";
import { useViewport } from "../hooks/useViewport.js";
import { useTheme } from "../utils/theme.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { Skel } from "../components/skeletons.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import CancelJobDialog from "../components/CancelJobDialog.jsx";
import { getUser } from "../store/auth";
import { connectSocket } from "../api/socket";
import {
  getWorkCategories, getWorkerMe, setWorkerAvailability, addWorkerService, updateWorkerService, removeWorkerService,
  addWorkerPackage, removeWorkerPackage,
  getWorkerOffers, acceptWorkOffer, declineWorkOffer, getWorkerJobs,
  workerJobEnRoute, workerJobStart, workerJobEnd, getWorkerEarnings,
  workerCancelJob as workerCancelJobAPI,
  getWorkerReliability, getWorkerReviews,
} from "../api/ondemandwork.js";
import { workCategoryLabel } from "../utils/workCategoryLabel.js";
import { formatWorkerRate } from "../utils/workRates.js";
import { SellerAnalyticsPanel } from "../components/sellerAnalytics.jsx";
import { getWorkerAnalytics } from "../api/analytics.js";
import { SellerWalletTab, SellerEditProfileTab } from "../components/shared.jsx";
import { getWalletBalance, getWalletTransactions } from "../api/user.js";
import { styleFor as workMacroStyleFor, workIconKey, workIconCandidates } from "../utils/workCategoryIcon.js";
import { WorkCategoryIcon } from "../components/WorkCategoryIcon.jsx";

function sdCommon(key, opts) {
  return i18n.t(`sellerDash.common.${key}`, opts);
}

const ACTIVE_STATUSES = ["accepted", "worker_en_route", "in_progress"];
const money = (n) => "$" + Number(n ?? 0).toFixed(2);

function offerCategoryLabel(t, o) {
  return workCategoryLabel(t, { slug: o.category_slug ?? o.work_category_slug, name: o.category });
}

function workJobStatusLabel(t, status) {
  const map = {
    accepted: "ondemand.worker.jobStatusAccepted",
    worker_en_route: "ondemand.worker.jobStatusWorkerEnRoute",
    in_progress: "ondemand.worker.jobStatusInProgress",
    completed: "ondemand.worker.jobStatusCompleted",
    cancelled: "ondemand.worker.jobStatusCancelled",
  };
  return map[status] ? t(map[status]) : String(status || "").replace(/_/g, " ");
}

function workJobStatusColor(status) {
  const colorMap = {
    accepted: "#3b82f6",
    worker_en_route: "#f59e0b",
    in_progress: "#8b5cf6",
    completed: "#10b981",
    cancelled: "#ef4444",
  };
  return colorMap[status] || "var(--color-text-secondary)";
}

// Groups + glyphs for the nav, mirroring how ProviderTopNav (components/shared.jsx)
// buckets every other provider dashboard's tabs into Manage/Money/Account clusters —
// Analytics/Wallet ride under "Money" and Edit Profile under "Account" there too.
const WORKER_NAV_GROUPS = [
  { name: "Manage", items: ["dashboard", "services", "jobs", "reviews"] },
  { name: "Money", items: ["analytics", "wallet"] },
  { name: "Account", items: ["profile"] },
];
const WORKER_NAV_GLYPH = { dashboard: "grid", services: "briefcase", jobs: "briefcase", reviews: "star", analytics: "bars", wallet: "wallet", profile: "user" };

function WorkerNavIcon({ id, size = 14 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (WORKER_NAV_GLYPH[id]) {
    case "grid": return (<svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
    case "bars": return (<svg {...p}><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>);
    case "briefcase": return (<svg {...p}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>);
    case "wallet": return (<svg {...p}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></svg>);
    case "user": return (<svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
    case "star": return (<svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>);
    default: return null;
  }
}

// Filled/outline 5-star row for a review rating (1-5). Rounds to the nearest whole
// star rather than rendering partial fills — review ratings here are always integers.
function StarRow({ rating = 0, size = 14 }) {
  const full = Math.round(rating);
  return (
    <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= full ? "#f59e0b" : "none"} stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

// Grouped glass-pill nav bar matching ProviderTopNav's Band B (components/shared.jsx),
// the pattern every other provider dashboard uses for its tab bar. Reimplemented
// locally rather than importing ProviderTopNav because that component bundles its
// own gradient header, and this page keeps its own header (dynamic back-nav target).
function WorkerNavTabs({ tabs, active, onTab, accentColor, isLight }) {
  const navRef = useRef(null);
  const animRef = useRef(false);
  const lastRef = useRef(null);
  const [glider, setGlider] = useState(null);

  const place = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const btn = nav.querySelector(`[data-worker-tab="${active}"]`);
    if (!btn) return;
    const nr = nav.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const next = { x: r.left - nr.left + nav.scrollLeft, y: r.top - nr.top, w: r.width, h: r.height };
    const prev = lastRef.current;
    if (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 && Math.abs(prev.w - next.w) < 0.5 && Math.abs(prev.h - next.h) < 0.5) return;
    lastRef.current = next;
    setGlider({ ...next, animate: animRef.current });
  }, [active]);

  useLayoutEffect(() => { place(); animRef.current = true; }, [place]);
  useEffect(() => {
    const onResize = () => { animRef.current = false; place(); animRef.current = true; };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [place]);

  return (
    <div style={{ marginBottom: 16, width: "100%", boxSizing: "border-box", minWidth: 0 }}>
      {/* seller-tab-scroll (global rule in App.jsx) hides the scrollbar while keeping the
          bar swipeable — same pattern as ProviderTopNav's Band B (components/shared.jsx) —
          so the tab row scrolls on mobile instead of clipping "Reviews" off the edge. */}
      <div ref={navRef} className="seller-tab-scroll bg-surface border border-border" style={{
        position: "relative", display: "flex", alignItems: "stretch",
        width: "100%", maxWidth: "100%", minWidth: 0,
        borderRadius: 15, padding: "9px 14px",
        overflowX: "auto", overflowY: "hidden",
        scrollbarWidth: "none", msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch", touchAction: "pan-x", overscrollBehaviorX: "contain",
      }}>
        {glider && (
          <span aria-hidden style={{
            position: "absolute", left: 0, top: 0, zIndex: 1, pointerEvents: "none",
            width: glider.w, height: glider.h, transform: `translate(${glider.x}px, ${glider.y}px)`,
            transition: glider.animate ? "transform .42s cubic-bezier(.34,1.35,.5,1), width .42s cubic-bezier(.34,1.35,.5,1), height .42s cubic-bezier(.34,1.35,.5,1)" : "none",
            borderRadius: 11, overflow: "hidden",
            background: `linear-gradient(135deg, ${accentColor}${isLight ? "8c" : "5c"}, ${accentColor}${isLight ? "50" : "2b"})`,
            border: `1px solid ${accentColor}${isLight ? "a0" : "70"}`,
            boxShadow: `0 4px 12px -6px ${accentColor}${isLight ? "80" : "52"}, inset 0 1px 0 rgba(255,255,255,0.22)`,
          }}>
            <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(180deg, rgba(255,255,255,0.14), transparent)", borderRadius: "11px 11px 40px 40px" }} />
          </span>
        )}
        {WORKER_NAV_GROUPS.map((grp, gi) => (
          <React.Fragment key={grp.name}>
            {gi > 0 && <span aria-hidden className="bg-border-subtle" style={{ width: 1, alignSelf: "stretch", borderRadius: 1, margin: "2px 12px", flexShrink: 0 }} />}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, flexShrink: 0 }}>
              <div className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center" }}>
                {grp.name}
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {grp.items.map((id) => {
                  const tab = tabs.find((x) => x.id === id);
                  if (!tab) return null;
                  const on = active === id;
                  return (
                    <button
                      key={id}
                      data-worker-tab={id}
                      onClick={() => onTab(id)}
                      className={on ? "text-white" : "text-text-secondary"}
                      style={{
                        position: "relative", zIndex: 2, flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 13px", borderRadius: 11, border: "none", background: "transparent", cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: on ? 700 : 600,
                        letterSpacing: "0.01em", whiteSpace: "nowrap", transition: "color 0.28s",
                      }}
                    >
                      <span className={on ? "text-white" : "text-text-secondary"} style={{ display: "flex", flexShrink: 0, transition: "color 0.28s" }}>
                        <WorkerNavIcon id={id} />
                      </span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </React.Fragment>
        ))}
        <div aria-hidden style={{ flexShrink: 0, width: 4 }} />
      </div>
    </div>
  );
}

// On-Demand Worker dashboard (rideshare-driver-style): go online, receive nearby job
// offers in your categories, accept/decline, then drive the job en route → start → end.
export default function OnDemandWorker({ config = {}, onNavigate }) {
  const { t } = useTranslation();
const accent = config.color || "#2563eb";
  const { isMobile } = useViewport();
  const [theme] = useTheme();
  const loading = usePageLoad(450);
  const me = getUser();
  const uid = me?.user_id ?? me?.id ?? me?.profile_id;
  const [dialog, { notify }] = useDialog();

  const [profile, setProfile] = useState(null);          // worker_profile + categories
  const [offers, setOffers] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [earnings, setEarnings] = useState({ total_earned: 0, completed_jobs: 0, cancelled_jobs: 0 });
  const [reliabilityScore, setReliabilityScore] = useState(0); // reliability score (0-100)
  const [reviews, setReviews] = useState({ average_rating: null, review_count: 0, reviews: [] });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [picker, setPicker] = useState(null);            // {macros:[...]} when open
  const [busy, setBusy] = useState(false);
  const [addingService, setAddingService] = useState(false); // guards against overlapping add-service requests
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState("dashboard");          // "dashboard" | "analytics" | "jobs" | "wallet" | "profile"
  // The worker wallet is the same flat strug_wallet balance used by every other
  // provider vertical (e.g. the mechanic dashboard) — a payout lands the moment a
  // job completes, so there's no pending/available split to surface here.
  const fetchWorkerWallet = useCallback(
    () => getWalletBalance().then((res) => {
      const bal = Number(res?.balance) || 0;
      return { available_balance: bal, pending_balance: 0, total_earned: bal };
    }),
    []
  );
  const fetchWorkerWalletTx = useCallback(() => getWalletTransactions(), []);
  const [searchTerm, setSearchTerm] = useState("");     // For filtering services in picker
  const [allJobs, setAllJobs] = useState([]);          // All jobs for the jobs tab
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobStatusFilter, setJobStatusFilter] = useState(""); // Job status filter
  const [jobServiceFilter, setJobServiceFilter] = useState(""); // Job service filter
  const [jobDateFrom, setJobDateFrom] = useState(""); // Date range start
  const [jobDateTo, setJobDateTo] = useState(""); // Date range end
  const [selectedJob, setSelectedJob] = useState(null); // Selected job for modal
  const [jobsPagination, setJobsPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 }); // Pagination state

  // Cancel job dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  // Rate / package editor for a leaf service (add or edit)
  const [rateDraft, setRateDraft] = useState(null); // { categoryId, name, price_type, hourly_rate, flat_rate, isNew }
  const [pkgDraft, setPkgDraft] = useState({ name: "", price: "", duration_hours: "4" });
  const [rateBusy, setRateBusy] = useState(false);

  const coordsRef = useRef(null);

  // One worker identity, one online status — a single cached key for persistence
  const onlineKey = "worker_online";
  const [available, setAvailable] = useState(
    () => localStorage.getItem(onlineKey) === "true",
  );

  // ── data loaders ──
  const refreshProfile = useCallback(async () => {
    try { 
      const p = await getWorkerMe(); 
      setProfile(p); 
      // Server is source of truth — do not re-promote online from stale localStorage
      if (p && typeof p.is_available === "boolean") {
        setAvailable(p.is_available === true);
        localStorage.setItem(onlineKey, String(p.is_available === true));
      }
    } catch { /* noop */ }
  }, [onlineKey]);
  const refreshOffers = useCallback(async () => {
    try { setOffers(await getWorkerOffers() || []); } catch { /* noop */ }
  }, []);
  const refreshActive = useCallback(async () => {
    try {
      // /workers/me/jobs is paginated: { data, total, page, … } — never treat the envelope as an array.
      const response = await getWorkerJobs({ limit: 50 }) || {};
      const jobs = Array.isArray(response) ? response : (response.data || []);
      setActiveJob(jobs.find((j) => ACTIVE_STATUSES.includes(j.status)) || null);
    } catch { /* noop */ }
  }, []);
  const refreshEarnings = useCallback(async () => {
    try { setEarnings(await getWorkerEarnings() || { total_earned: 0, completed_jobs: 0, cancelled_jobs: 0 }); } catch { /* noop */ }
  }, []);
  const refreshReliability = useCallback(async () => {
    try {
      const data = await getWorkerReliability();
      setReliabilityScore(data?.reliability_score ?? 0);
    } catch { /* noop */ }
  }, []);
  const refreshReviews = useCallback(async () => {
    setReviewsLoading(true);
    try { setReviews(await getWorkerReviews() || { average_rating: null, review_count: 0, reviews: [] }); } catch { /* noop */ }
    setReviewsLoading(false);
  }, []);
  const refreshAllJobs = useCallback(async (page = 1) => {
    setJobsLoading(true);
    try {
      const params = { page, limit: 10 };
      if (jobStatusFilter) params.status = jobStatusFilter;
      if (jobServiceFilter) params.category_id = jobServiceFilter;
      if (jobDateFrom) params.date_from = jobDateFrom;
      if (jobDateTo) params.date_to = jobDateTo;
      const response = await getWorkerJobs(params) || { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      setAllJobs(response.data || []);
      setJobsPagination({ page: response.page || 1, limit: response.limit || 10, total: response.total || 0, totalPages: response.totalPages || 0 });
    } catch (e) { console.error('Error fetching jobs:', e); }
    setJobsLoading(false);
  }, [jobStatusFilter, jobServiceFilter, jobDateFrom, jobDateTo]);

  useEffect(() => { refreshProfile(); refreshActive(); refreshEarnings(); refreshReliability(); }, [refreshProfile, refreshActive, refreshEarnings, refreshReliability]);
  useEffect(() => { if (view === "jobs") refreshAllJobs(1); }, [view, refreshAllJobs]);
  useEffect(() => { if (view === "reviews") refreshReviews(); }, [view, refreshReviews]);
  useEffect(() => { if (view === "jobs") refreshAllJobs(1); }, [jobStatusFilter, jobServiceFilter, jobDateFrom, jobDateTo]);

  // ── real-time: push offers in + a 1s tick for countdowns ──
  useEffect(() => {
    if (!uid) return;
    const s = connectSocket();
    const onOffer = () => refreshOffers();
    s.on(`work-offer-${uid}`, onOffer);
    return () => { s.off(`work-offer-${uid}`, onOffer); };
  }, [uid, refreshOffers]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll offers while online with no active job (fallback if a socket event is missed).
  useEffect(() => {
    if (!available || activeJob) { setOffers([]); return; }
    refreshOffers();
    const t = setInterval(refreshOffers, 5000);
    return () => clearInterval(t);
  }, [available, activeJob, refreshOffers]);

  // Stream GPS to the hirer while en route / on the job.
  useEffect(() => {
    if (!activeJob || !["worker_en_route", "in_progress"].includes(activeJob.status)) return;
    if (!navigator.geolocation) return;
    const send = () => navigator.geolocation.getCurrentPosition(
      (pos) => { const s = connectSocket(); s.emit("work-location", { work_job_id: activeJob.work_job_id, lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => {}, { enableHighAccuracy: true, maximumAge: 8000 },
    );
    send();
    const t = setInterval(send, 10000);
    return () => clearInterval(t);
  }, [activeJob]);

  // ── actions ──
  const getCoords = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null), { enableHighAccuracy: true, maximumAge: 10000 },
    );
  });

  const toggleAvailable = async () => {
    setBusy(true);
    try {
      if (!available) {
        if (!(profile?.categories?.length)) {
          notify({ title: t("ondemand.worker.notifyAddServiceFirst"), message: t("ondemand.worker.notifyAddServiceFirstMsg") });
          setBusy(false); return;
        }
        const c = await getCoords();
        coordsRef.current = c;
        await setWorkerAvailability(true, c?.lat, c?.lng);
        setAvailable(true);
        localStorage.setItem(onlineKey, "true");
      } else {
        await setWorkerAvailability(false);
        setAvailable(false); setOffers([]);
        localStorage.setItem(onlineKey, "false");
      }
    } catch { notify({ title: t("ondemand.worker.notifyUpdateStatus"), message: i18n.t("ondemand.hire.notifyTryAgain") }); }
    setBusy(false);
  };

  const openPicker = async () => {
    try { setPicker({ macros: await getWorkCategories() || [] }); } catch { notify({ title: t("ondemand.worker.notifyLoadCategories"), message: t("ondemand.hire.notifyTryAgain") }); }
  };
  const beginAddService = (category) => {
    setPicker(null);
    setRateDraft({
      categoryId: category.work_category_id,
      name: category.name,
      slug: category.slug,
      price_type: "hourly",
      hourly_rate: "",
      flat_rate: "",
      isNew: true,
    });
    setPkgDraft({ name: "", price: "", duration_hours: "4" });
  };
  const beginEditService = (c) => {
    setRateDraft({
      categoryId: c.work_category_id,
      name: c.name,
      slug: c.slug,
      price_type: c.price_type === "flat" ? "flat" : "hourly",
      hourly_rate: c.hourly_rate != null ? String(c.hourly_rate) : "",
      flat_rate: c.flat_rate != null ? String(c.flat_rate) : "",
      isNew: false,
      packages: c.packages || [],
    });
    setPkgDraft({ name: "", price: "", duration_hours: "4" });
  };
  const saveServiceRates = async () => {
    if (!rateDraft) return;
    const price_type = rateDraft.price_type === "flat" ? "flat" : "hourly";
    const hourly_rate = rateDraft.hourly_rate !== "" ? Number(rateDraft.hourly_rate) : null;
    const flat_rate = rateDraft.flat_rate !== "" ? Number(rateDraft.flat_rate) : null;
    if (price_type === "hourly" && !(hourly_rate > 0) && !(flat_rate > 0)) {
      notify({ title: t("ondemand.worker.notifySetRate", { defaultValue: "Set your rate" }), message: t("ondemand.worker.notifySetRateMsg", { defaultValue: "Add an hourly or flat rate so clients can book you." }) });
      return;
    }
    if (price_type === "flat" && !(flat_rate > 0) && !(hourly_rate > 0)) {
      notify({ title: t("ondemand.worker.notifySetRate", { defaultValue: "Set your rate" }), message: t("ondemand.worker.notifySetRateMsg", { defaultValue: "Add an hourly or flat rate so clients can book you." }) });
      return;
    }
    setRateBusy(true);
    try {
      if (rateDraft.isNew) {
        await addWorkerService(rateDraft.categoryId, { price_type, hourly_rate, flat_rate });
      } else {
        await updateWorkerService(rateDraft.categoryId, { price_type, hourly_rate, flat_rate });
      }
      const me = await getWorkerMe();
      setProfile(me);
      if (me && typeof me.is_available === "boolean") {
        setAvailable(me.is_available === true);
        localStorage.setItem(onlineKey, String(me.is_available === true));
      }
      const updated = me?.categories?.find((x) => x.work_category_id === rateDraft.categoryId);
      // Keep editor open after first save so packages can be added immediately.
      setRateDraft((d) => d && ({
        ...d,
        isNew: false,
        price_type,
        hourly_rate: hourly_rate != null ? String(hourly_rate) : "",
        flat_rate: flat_rate != null ? String(flat_rate) : "",
        packages: updated?.packages || [],
      }));
    } catch {
      notify({ title: t("ondemand.worker.notifyAddService"), message: t("ondemand.hire.notifyTryAgain") });
    }
    setRateBusy(false);
  };
  const savePackage = async () => {
    if (!rateDraft || rateDraft.isNew) {
      notify({ title: t("ondemand.worker.notifySaveServiceFirst", { defaultValue: "Save service first" }), message: t("ondemand.worker.notifySaveServiceFirstMsg", { defaultValue: "Save your rate, then add packages." }) });
      return;
    }
    const name = pkgDraft.name.trim();
    const price = Number(pkgDraft.price);
    const duration_hours = Number(pkgDraft.duration_hours);
    if (!name || !(price > 0) || !(duration_hours > 0)) {
      notify({ title: t("ondemand.worker.notifyPackageInvalid", { defaultValue: "Invalid package" }), message: t("ondemand.worker.notifyPackageInvalidMsg", { defaultValue: "Enter a name, price, and duration." }) });
      return;
    }
    setRateBusy(true);
    try {
      await addWorkerPackage(rateDraft.categoryId, { name, price, duration_hours });
      await refreshProfile();
      setPkgDraft({ name: "", price: "", duration_hours: "4" });
      const updated = (await getWorkerMe())?.categories?.find((x) => x.work_category_id === rateDraft.categoryId);
      if (updated) setRateDraft((d) => d && ({ ...d, packages: updated.packages || [] }));
    } catch {
      notify({ title: t("ondemand.worker.notifyPackageFailed", { defaultValue: "Couldn't add package" }), message: t("ondemand.hire.notifyTryAgain") });
    }
    setRateBusy(false);
  };
  const deletePackage = async (packageId) => {
    setRateBusy(true);
    try {
      await removeWorkerPackage(packageId);
      await refreshProfile();
      setRateDraft((d) => d && ({ ...d, packages: (d.packages || []).filter((p) => p.worker_package_id !== packageId) }));
    } catch { /* noop */ }
    setRateBusy(false);
  };
  const removeService = async (categoryId) => {
    try { await removeWorkerService(categoryId); await refreshProfile(); } catch { /* noop */ }
  };

  const accept = async (jobId) => {
    setBusy(true);
    try { await acceptWorkOffer(jobId); setOffers([]); await refreshActive(); }
    catch (e) { notify({ title: t("ondemand.worker.notifyAccept"), message: e?.response?.data?.message || t("ondemand.worker.notifyOfferGone") }); await refreshOffers(); }
    setBusy(false);
  };
  const decline = async (jobId) => { try { await declineWorkOffer(jobId); setOffers((o) => o.filter((x) => x.work_job_id !== jobId)); } catch { /* noop */ } };

  const cancelWorkerJob = async (jobId, reason) => {
    setCancelBusy(true);
    try {
      await workerCancelJobAPI(jobId, reason);
      // Optimistically clear the active job; the socket or a refetch will confirm.
      setActiveJob(null);
      // Refresh earnings and reliability to get updated cancelled jobs count and score
      await refreshEarnings();
      await refreshReliability();
      return true;
    } catch (err) {
      notify({ title: t("ondemand.worker.cancelJobFailed"), message: err?.response?.data?.message || t("ondemand.hire.notifyTryAgain") });
      return false;
    } finally {
      setCancelBusy(false);
    }
  };

  const handleConfirmCancel = async (reason) => {
    if (reason.trim() === "") return;
    const succeeded = await cancelWorkerJob(activeJob.work_job_id, reason);
    if (succeeded) {
      notify({ title: t("ondemand.worker.cancelJobSuccess"), message: t("ondemand.worker.jobCancelled") });
      setCancelDialogOpen(false);
    }
    // error already shown inside cancelWorkerJob
  };

  const handleCancelCancel = () => {
    setCancelDialogOpen(false);
  };

  const advance = async (fn, label) => {
    setBusy(true);
    try { await fn(activeJob.work_job_id); await refreshActive(); if (label === "end") { await refreshEarnings(); } }
    catch (e) { notify({ title: t("ondemand.worker.notifyUpdate"), message: e?.response?.data?.message || t("ondemand.hire.notifyTryAgain") }); }
    setBusy(false);
  };

  const outerPad = { paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 24, paddingTop: 20, paddingBottom: 24 };
  const card = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 16, padding: 18 };
  const H = (s) => ({ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-primary)", ...s });

  if (loading) {
    return <div style={{ ...outerPad }}><Skel w={220} h={28} r={8} /><div style={{ height: 16 }} /><Skel w="100%" h={120} r={16} /><div style={{ height: 12 }} /><Skel w="100%" h={160} r={16} /></div>;
  }

  return (
    // The app shell renders each page as a flex child of an `overflow: hidden` column,
    // so the page must own its own vertical scroll. The old `minHeight: 100vh` (with no
    // overflow) let the analytics view grow past the viewport and get clipped — the
    // "Jobs by category / Top categories" panels fell off the bottom (#323).
    <div style={{ ...outerPad, flex: 1, minHeight: 0, overflowY: "auto", boxSizing: "border-box" }}>
      {dialog}
        {/* Cancel Job Dialog */}
        <CancelJobDialog
          open={cancelDialogOpen}
          title={t("ondemand.worker.cancelJobTitle")}
          confirmLabel={t("ondemand.worker.cancelJobConfirm")}
          cancelLabel={t("common.cancel")}
          busy={cancelBusy}
          onConfirm={handleConfirmCancel}
          onCancel={handleCancelCancel}
        />
      {/* Header — gradient banner matching the SellerDashHeader look every other
          provider dashboard uses (see components/shared.jsx), kept local here since
          this page's back-nav target is dynamic (config.backNav: "bookartist" | "ondemand")
          and SellerHubBack hardcodes a "provider" hub link. */}
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: 18,
        background: `linear-gradient(135deg, ${accent}26 0%, var(--color-surface) 62%, var(--color-bg) 100%)`,
        border: `1px solid ${accent}33`,
        padding: isMobile ? "20px 16px" : "24px 32px",
        marginBottom: 18,
      }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% -10%, ${accent}26, transparent 62%)` }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          {config.backNav && (
            <button onClick={() => {
              if (config.backNav === "bookartist") {
                try { delete window.__navReturn; } catch { window.__navReturn = null; }
                try { window.dispatchEvent(new CustomEvent("strug:nav-return")); } catch { /* ignore */ }
              }
              onNavigate?.(config.backNav);
            }} className="text-secondary" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0, marginBottom: 12 }}>← {config.backLabel || t("ondemand.worker.back")}</button>
          )}
          {/* On mobile the toggle is pulled out of flow into the top-right corner (mirroring
              the back link's top-left placement) — inline next to the title, it used to wrap
              onto its own centered row below the subtitle instead of reading as part of the header. */}
          {isMobile && (
            <button onClick={toggleAvailable} disabled={busy} style={{ position: "absolute", top: 0, right: 0, display: "flex", alignItems: "center", gap: 8, background: available ? "#059669" : "var(--color-surface-raised)", border: `1px solid ${available ? "#059669" : "var(--color-border)"}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer", color: available ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: available ? "#fff" : "var(--color-text-muted)" }} />
              {available ? t("ondemand.worker.online") : t("ondemand.worker.offline")}
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 220, textAlign: "center" }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: accent, fontFamily: "'Barlow Condensed', sans-serif", margin: "0 0 4px" }}>{i18n.t("shared.sellerPortal")}</p>
              <h1 style={H({ fontSize: isMobile ? 24 : 30, margin: 0 })}>{config.title || t("ondemand.worker.title")}</h1>
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "4px 0 0" }}>{t("ondemand.worker.subtitle")}</p>
            </div>
            {/* Bell + availability toggle — desktop only; mobile renders its own corner-pinned copy above. */}
            {!isMobile && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                {/* "available" (online) is always a solid brand-green fill — safe with fixed white text/dot.
                    The idle/offline state is a neutral surface fill, so its text/dot must NOT be fixed white
                    (it would vanish against a light-theme neutral surface); use text-secondary/muted tokens. */}
                <button onClick={toggleAvailable} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 10, background: available ? "#059669" : "var(--color-surface-raised)", border: `1px solid ${available ? "#059669" : "var(--color-border)"}`, borderRadius: 999, padding: "10px 18px", cursor: "pointer", color: available ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: available ? "#fff" : "var(--color-text-muted)" }} />
                  {available ? t("ondemand.worker.online") : t("ondemand.worker.offline")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View toggle: live dashboard vs analytics deep-dive vs jobs — grouped
          glass-pill nav matching every other provider dashboard's tab bar. */}
      <WorkerNavTabs
        tabs={[
          { id: "dashboard", label: t("ondemand.worker.tabDashboard", { defaultValue: "Dashboard" }) },
          { id: "services", label: sdCommon("tabServices", { defaultValue: "Services" }) },
          { id: "analytics", label: t("ondemand.worker.tabAnalytics", { defaultValue: "Analytics" }) },
          { id: "jobs", label: t("ondemand.worker.tabJobs", { defaultValue: "Jobs" }) },
          { id: "reviews", label: t("ondemand.worker.tabReviews", { defaultValue: "Reviews" }) },
          { id: "wallet", label: sdCommon("tabWallet", { defaultValue: "Wallet" }) },
          { id: "profile", label: sdCommon("tabEditProfile", { defaultValue: "Edit Profile" }) },
        ]}
        active={view}
        onTab={setView}
        accentColor={accent}
        isLight={theme === "light"}
      />

      {view === "analytics" ? (
        <SellerAnalyticsPanel
          accentColor={accent}
          isMobile={isMobile}
          fetchOverview={getWorkerAnalytics}
          countLabel="Jobs"
          netLabel="Your earnings"
          topTitle="Top categories"
          breakdownTitle="Jobs by category"
          emptyHint="Your job earnings and performance will appear here once you complete gigs."
        />
      ) : view === "jobs" ? (
        <>
          {/* Filters */}
          <div style={{ ...card, marginBottom: 16 }}>
            <p style={H({ fontSize: 16, margin: "0 0 12px" })}>{t("ondemand.worker.filterJobs", { defaultValue: "Filter Jobs" })}</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {/* Status filter */}
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "block", marginBottom: 4 }}>{t("ondemand.worker.status", { defaultValue: "Status" })}</label>
                <select
                  value={jobStatusFilter}
                  onChange={(e) => setJobStatusFilter(e.target.value)}
                  className="bg-surface-raised border border-border text-primary"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
                >
                  <option value="">{t("ondemand.worker.allStatuses", { defaultValue: "All Statuses" })}</option>
                  <option value="accepted">{t("ondemand.worker.jobStatusAccepted", { defaultValue: "Accepted" })}</option>
                  <option value="worker_en_route">{t("ondemand.worker.jobStatusWorkerEnRoute", { defaultValue: "En Route" })}</option>
                  <option value="in_progress">{t("ondemand.worker.jobStatusInProgress", { defaultValue: "In Progress" })}</option>
                  <option value="completed">{t("ondemand.worker.jobStatusCompleted", { defaultValue: "Completed" })}</option>
                  <option value="cancelled">{t("ondemand.worker.jobStatusCancelled", { defaultValue: "Cancelled" })}</option>
                </select>
              </div>
              {/* Service filter */}
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "block", marginBottom: 4 }}>{t("ondemand.worker.service", { defaultValue: "Service" })}</label>
                <select
                  value={jobServiceFilter}
                  onChange={(e) => setJobServiceFilter(e.target.value)}
                  className="bg-surface-raised border border-border text-primary"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
                >
                  <option value="">{t("ondemand.worker.allServices", { defaultValue: "All Services" })}</option>
                  {profile?.categories?.map((c) => (
                    <option key={c.work_category_id} value={String(c.work_category_id)}>{workCategoryLabel(t, c)}</option>
                  ))}
                </select>
              </div>
              {/* Date from filter */}
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "block", marginBottom: 4 }}>{t("ondemand.worker.dateFrom", { defaultValue: "Date From" })}</label>
                <input
                  type="datetime-local"
                  value={jobDateFrom}
                  onChange={(e) => setJobDateFrom(e.target.value)}
                  className="bg-surface-raised border border-border text-primary"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
                />
              </div>
              {/* Date to filter */}
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, display: "block", marginBottom: 4 }}>{t("ondemand.worker.dateTo", { defaultValue: "Date To" })}</label>
                <input
                  type="datetime-local"
                  value={jobDateTo}
                  onChange={(e) => setJobDateTo(e.target.value)}
                  className="bg-surface-raised border border-border text-primary"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
                />
              </div>
              {/* Clear filters */}
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button
                  onClick={() => { setJobStatusFilter(""); setJobServiceFilter(""); setJobDateFrom(""); setJobDateTo(""); }}
                  className="bg-surface-raised border border-border text-secondary"
                  style={{ padding: "8px 16px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer" }}
                >
                  {t("ondemand.worker.clearFilters", { defaultValue: "Clear" })}
                </button>
              </div>
            </div>
          </div>

          {/* Jobs list */}
          <div style={{ ...card }}>
            <p style={H({ fontSize: 16, margin: "0 0 12px" })}>{t("ondemand.worker.allJobs", { defaultValue: "All Jobs" })}</p>
            {jobsLoading ? (
              <div style={{ textAlign: "center", padding: "24px" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${accent}`, borderTopColor: "transparent", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : (() => {
              if (allJobs.length === 0) {
                return (
                  <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0, textAlign: "center", padding: "24px 0" }}>
                    {t("ondemand.worker.noJobsFound", { defaultValue: "No jobs found" })}
                  </p>
                );
              }

              return allJobs.map((job) => (
                <div key={job.work_job_id} className="border border-border" style={{ borderRadius: 14, padding: 14, marginBottom: 10, cursor: "pointer" }} onClick={() => setSelectedJob(job)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ background: `${workJobStatusColor(job.status)}22`, border: `1px solid ${workJobStatusColor(job.status)}44`, borderRadius: 999, padding: "4px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: workJobStatusColor(job.status), whiteSpace: "nowrap", display: "inline-block", marginBottom: 4 }}>{workJobStatusLabel(t, job.status)}</span>
                      <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: accent, margin: "4px 0 0" }}>{money(job.worker_payout)}</p>
                      <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, margin: "8px 0 2px" }}>{workCategoryLabel(t, job.work_category) || job.title}</p>
                      <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "2px 0 0" }}>{job.address || "—"} · {job.scheduled_start ? new Date(job.scheduled_start).toLocaleString() : new Date(job.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  {job.instructions && <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "8px 0 0", lineHeight: 1.55 }}>{job.instructions}</p>}
                </div>
              ));
            })()}

          {/* Pagination */}
          {jobsPagination.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => refreshAllJobs(jobsPagination.page - 1)}
                disabled={jobsPagination.page === 1 || jobsLoading}
                className={`border border-border ${jobsPagination.page === 1 ? "bg-surface text-muted" : "bg-surface-raised text-secondary"}`}
                style={{ padding: "8px 16px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: jobsPagination.page === 1 ? "default" : "pointer" }}
              >
                {t("ondemand.worker.previous", { defaultValue: "Previous" })}
              </button>
              <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                {t("ondemand.worker.pageInfo", { defaultValue: "Page {{page}} of {{totalPages}}", page: jobsPagination.page, totalPages: jobsPagination.totalPages })}
              </span>
              <button
                onClick={() => refreshAllJobs(jobsPagination.page + 1)}
                disabled={jobsPagination.page === jobsPagination.totalPages || jobsLoading}
                className={`border border-border ${jobsPagination.page === jobsPagination.totalPages ? "bg-surface text-muted" : "bg-surface-raised text-secondary"}`}
                style={{ padding: "8px 16px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: jobsPagination.page === jobsPagination.totalPages ? "default" : "pointer" }}
              >
                {t("ondemand.worker.next", { defaultValue: "Next" })}
              </button>
            </div>
          )}
          </div>
        </>
      ) : view === "services" ? (
        <div style={{ ...card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={H({ fontSize: 16, margin: 0 })}>{t("ondemand.worker.myServices")}</p>
            <button onClick={openPicker} style={{ background: accent, border: "none", borderRadius: 999, padding: "6px 14px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t("ondemand.worker.addService")}</button>
          </div>
          <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 12px", lineHeight: 1.45 }}>
            {t("ondemand.worker.ratesHint", { defaultValue: "Set your rates and packages — Book Artist clients browse these when hiring a DJ, photographer, and more." })}
          </p>
          {profile?.categories?.length ? (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {profile.categories.map((c) => {
                const rateLabel = formatWorkerRate(c);
                const macroSlug = (c.slug || "").split("--")[0];
                const macroColor = workMacroStyleFor(macroSlug).color;
                const macroLabel = workCategoryLabel(t, { slug: macroSlug });
                return (
                  <div key={c.work_category_id} className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: `${macroColor}22`, border: `1px solid ${macroColor}55`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                        <WorkCategoryIcon
                          slug={workIconKey(macroSlug, c.slug)}
                          fallbacks={workIconCandidates(macroSlug, c.slug).slice(1)}
                          alt={workCategoryLabel(t, c)}
                          round={false}
                        />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, margin: 0 }}>{workCategoryLabel(t, c)}</p>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#22c55e" }}>{t("ondemand.worker.active", { defaultValue: "Active" })}</span>
                        </span>
                      </div>
                    </div>

                    <div className="bg-border" style={{ height: 1, margin: "14px 0" }} />

                    <div style={{ display: "flex", gap: 16 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("ondemand.worker.rate", { defaultValue: "Rate" })}</p>
                        {rateLabel ? (
                          <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, margin: "4px 0 0" }}>{rateLabel}</p>
                        ) : (
                          <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: "4px 0 0" }}>{t("ondemand.worker.noRateSet", { defaultValue: "No rate set" })}</p>
                        )}
                      </div>
                      <div className="bg-border" style={{ width: 1 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("ondemand.worker.category", { defaultValue: "Category" })}</p>
                        <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, margin: "4px 0 0" }}>{macroLabel}</p>
                      </div>
                    </div>

                    {(c.packages || []).length > 0 && (
                      <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "12px 0 0" }}>
                        {(c.packages || []).map((p) => `${p.name} ($${Number(p.price).toFixed(0)})`).join(" · ")}
                      </p>
                    )}

                    <div style={{ display: "flex", gap: 10, marginTop: "auto", paddingTop: 14 }}>
                      <button type="button" onClick={() => beginEditService(c)} className="border border-border text-primary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", borderRadius: 10, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        {t("common.edit", { defaultValue: "Edit" })}
                      </button>
                      <button type="button" onClick={() => removeService(c.work_category_id)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", border: "1px solid #ef444455", color: "#ef4444", borderRadius: 10, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                        {t("common.delete", { defaultValue: "Delete" })}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{t("ondemand.worker.noServicesYet")}</p>
          )}
        </div>
      ) : view === "reviews" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div>
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{t("ondemand.worker.averageRating", { defaultValue: "Average Rating" })}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, color: accent, margin: 0 }}>{reviews.average_rating != null ? reviews.average_rating.toFixed(1) : "—"}</p>
                <StarRow rating={reviews.average_rating || 0} size={16} />
              </div>
            </div>
            <div className="bg-border" style={{ width: 1, alignSelf: "stretch" }} />
            <div>
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{t("ondemand.worker.totalReviews", { defaultValue: "Total Reviews" })}</p>
              <p className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, margin: "4px 0 0" }}>{reviews.review_count}</p>
            </div>
          </div>

          <div style={{ ...card }}>
            <p style={H({ fontSize: 16, margin: "0 0 12px" })}>{t("ondemand.worker.allReviews", { defaultValue: "All Reviews" })}</p>
            {reviewsLoading ? (
              <div style={{ textAlign: "center", padding: "24px" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${accent}`, borderTopColor: "transparent", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : reviews.reviews.length === 0 ? (
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0, textAlign: "center", padding: "24px 0" }}>
                {t("ondemand.worker.noReviewsYet", { defaultValue: "No reviews yet — they'll show up here once clients rate your completed jobs." })}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reviews.reviews.map((r) => (
                  <div key={r.work_review_id} className="bg-surface-raised border border-border" style={{ borderRadius: 14, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, margin: 0 }}>{r.job_title || r.category_name || t("ondemand.worker.serviceOrder", { defaultValue: "Service" })}</p>
                        <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "2px 0 0" }}>
                          {r.reviewer_name || t("ondemand.worker.aClient", { defaultValue: "A client" })} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                        </p>
                      </div>
                      <StarRow rating={r.rating} size={14} />
                    </div>
                    {r.comment && (
                      <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "8px 0 0", lineHeight: 1.5 }}>{r.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : view === "wallet" ? (
        <SellerWalletTab color={accent} fetchWallet={fetchWorkerWallet} fetchTransactions={fetchWorkerWalletTx} />
      ) : view === "profile" ? (
        <SellerEditProfileTab
          config={{
            profileFields: [
              [sdCommon("skillsSpecialties"), sdCommon("skillsSpecialtiesPlaceholder")],
              [sdCommon("serviceArea"), sdCommon("serviceAreaPlaceholderGta")],
              [sdCommon("yearsOfExperience"), sdCommon("yearsOfExperiencePlaceholder")],
            ],
          }}
          vertical="ondemandwork"
        />
      ) : (
      <>
      {/* Earnings */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ ...card, flex: 1, minWidth: 150 }}>
          <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{t("ondemand.worker.totalEarned", { defaultValue: "Total Earned" })}</p>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, color: accent, margin: "2px 0 0" }}>{money(earnings.total_earned)}</p>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 150 }}>
          <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{t("ondemand.worker.jobsCompleted", { defaultValue: "Jobs Completed" })}</p>
          <p className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, margin: "2px 0 0" }}>{earnings.completed_jobs}</p>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 150 }}>
          <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{t("ondemand.worker.jobsCancelled", { defaultValue: "Cancelled Jobs" })}</p>
          <p className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, margin: "2px 0 0" }}>{earnings.cancelled_jobs}</p>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 150 }}>
          <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{t("ondemand.worker.reliability", { defaultValue: "Reliability" })}</p>
          <p className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, margin: "2px 0 0" }}>{reliabilityScore} %</p>
        </div>
      </div>

      {/* Active job */}
      {activeJob ? (
        <div style={{ ...card, border: `1px solid ${accent}55`, marginBottom: 16 }}>
          <p style={H({ fontSize: 16, margin: "0 0 4px" })}>{t("ondemand.worker.currentJob")}</p>
          <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 700, margin: "6px 0 2px" }}>{workCategoryLabel(t, activeJob.work_category) || activeJob.title}</p>
          <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0 }}>{activeJob.address || "—"} · {activeJob.scheduled_start ? new Date(activeJob.scheduled_start).toLocaleString() : ""}</p>
          {activeJob.instructions && <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "8px 0 0", lineHeight: 1.6 }}>{activeJob.instructions}</p>}
          <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "10px 0 0" }}>{t("ondemand.worker.youEarn")} <strong style={{ color: accent }}>{money(activeJob.worker_payout)}</strong> <span className="text-secondary" style={{ fontSize: 12 }}>{t("ondemand.worker.afterFeesTax")}</span></p>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <span className="bg-surface-raised text-secondary" style={{ borderRadius: 999, padding: "6px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{t("ondemand.worker.status")} {workJobStatusLabel(t, activeJob.status)}</span>
            {activeJob.status === "accepted" && <button onClick={() => advance(workerJobEnRoute, "enroute")} disabled={busy} style={btn(accent)}>{t("ondemand.worker.onMyWay")}</button>}
            {activeJob.status === "worker_en_route" && <button onClick={() => advance(workerJobStart, "start")} disabled={busy} style={btn(accent)}>{t("ondemand.worker.startWork")}</button>}
            {activeJob.status === "in_progress" && <button onClick={() => advance(workerJobEnd, "end")} disabled={busy} style={btn("#059669")}>{t("ondemand.worker.endShift")}</button>}
            {/* Cancel job button for accepted or en route jobs. btn() defaults to fixed white
                text (safe for the accent/green fills above), but this button's fill is a neutral
                surface tint that goes light in light theme — so its text must be a token too,
                not the fixed near-white it had before (would've become invisible on a light chip). */}
            {(activeJob.status === "accepted" || activeJob.status === "worker_en_route") && (
              <button onClick={() => {
                setCancelDialogOpen(true);
              }} disabled={busy || cancelBusy} style={{ ...btn("var(--color-surface-raised)"), color: "var(--color-text-secondary)" }}>
                {t("ondemand.worker.cancelJob")}
              </button>
            )}
          </div>
        </div>
      ) : available ? (
        // Offer inbox
        <div style={{ ...card }}>
          <p style={H({ fontSize: 16, margin: "0 0 12px" })}>{t("ondemand.worker.jobOffers")}</p>
          {offers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", border: `3px solid ${accent}`, borderTopColor: "transparent", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0 }}>{t("ondemand.worker.waitingForJobs")}</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : offers.map((o) => {
            const remain = o.expires_at ? Math.max(0, Math.round((new Date(o.expires_at).getTime() - now) / 1000)) : null;
            return (
              <div key={o.work_job_id} className="border border-border" style={{ borderRadius: 14, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, margin: 0 }}>{offerCategoryLabel(t, o) || o.title}</p>
                    <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "2px 0 0" }}>{offerCategoryLabel(t, o)}{o.distance ? ` · ${t("ondemand.worker.distanceAway", { distance: o.distance })}` : ""}{o.scheduled_start ? ` · ${new Date(o.scheduled_start).toLocaleString()}` : ""}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: accent, margin: 0 }}>{money(o.worker_payout)}</p>
                    {remain != null && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: remain < 10 ? "#ef4444" : "var(--color-text-secondary)", margin: 0 }}>{t("ondemand.worker.secondsLeft", { count: remain })}</p>}
                  </div>
                </div>
                {o.instructions && <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "8px 0 0", lineHeight: 1.55 }}>{o.instructions}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button onClick={() => decline(o.work_job_id)} disabled={busy} style={{ ...btn("var(--color-surface-raised)"), flex: 1, color: "var(--color-text-secondary)" }}>{t("ondemand.worker.decline")}</button>
                  <button onClick={() => accept(o.work_job_id)} disabled={busy} style={{ ...btn("#059669"), flex: 2 }}>{t("ondemand.worker.accept")}</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...card, textAlign: "center", padding: "32px 18px" }}>
          <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: 0 }}>{t("ondemand.worker.offlineHint")}</p>
        </div>
      )}

      </>
      )}

      {/* Category picker */}
      {picker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) setPicker(null); }}>
          {/* Modal dim overlay above stays a hardcoded dark scrim in both themes (matches the
              established convention for full-screen modal backdrops elsewhere in this app),
              but the panel itself is themed. */}
          <div className="bg-surface border border-border" style={{ borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "80vh", overflow: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={H({ fontSize: 18, margin: 0 })}>{t("ondemand.worker.addServiceModal")}</p>
              <button onClick={() => setPicker(null)} className="text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <div style={{ marginBottom: 16, position: "relative" }}>
              <input
                type="text"
                placeholder={t("ondemand.worker.searchServices", { defaultValue: "Search services..." })}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-surface-raised border border-border text-primary"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                }}
              />
              <div className="text-muted" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>
                🔍
              </div>
            </div>
            {(() => {
              if (!picker.macros || !picker.macros.length) return [];

              const searchLower = searchTerm.toLowerCase().trim();

              // Filter macros and their children based on search term
              const filteredMacros = picker.macros
                .map(macro => {
                  // Check if macro name matches search
                  const macroMatches = searchLower === "" ||
                    macro.name.toLowerCase().startsWith(searchLower);

                  // Filter children that match search
                  const matchingChildren = searchLower === "" ?
                    (macro.children || []) :
                    (macro.children || []).filter(child =>
                      child.name.toLowerCase().startsWith(searchLower)
                    );

                  // Include macro if it matches or has matching children
                  if (macroMatches || matchingChildren.length > 0) {
                    return {
                      ...macro,
                      children: matchingChildren
                    };
                  }
                  return null;
                })
                .filter(Boolean); // Remove nulls (macros that don't match and have no matching children)

              return filteredMacros;
            })().map((m) => (
              <div key={m.work_category_id} style={{ marginBottom: 14 }}>
                <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, color: accent, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>{workCategoryLabel(t, m)}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(m.children || []).map((c) => {
                    const has = profile?.categories?.some((x) => x.work_category_id === c.work_category_id);
                    // "has" (already added) is a translucent brand-green tint — safe with the
                    // brand-green text. The idle state's fill is a neutral surface, so its
                    // text must be a token, not fixed white (was invisible-risk in light theme).
                    return (
                      <button key={c.work_category_id} disabled={has || addingService} onClick={() => beginAddService(c)} style={{ background: has ? "rgba(5,150,105,0.18)" : "var(--color-surface-raised)", border: `1px solid ${has ? "#059669" : "var(--color-border)"}`, borderRadius: 999, padding: "6px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: has ? "#34d399" : "var(--color-text-primary)", cursor: has || addingService ? "default" : "pointer", opacity: addingService && !has ? 0.6 : 1 }}>
                        {has ? "✓ " : "+ "}{workCategoryLabel(t, c)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rate / package editor */}
      {rateDraft && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 3100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget && !rateBusy) setRateDraft(null); }}>
          <div className="bg-surface border border-border" style={{ borderRadius: 18, width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={H({ fontSize: 18, margin: 0 })}>{rateDraft.isNew ? t("ondemand.worker.setYourRate", { defaultValue: "Set your rate" }) : t("ondemand.worker.editRate", { defaultValue: "Edit rate" })}</p>
              <button type="button" onClick={() => !rateBusy && setRateDraft(null)} className="text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>{workCategoryLabel(t, rateDraft)}</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["hourly", "flat"].map((pt) => (
                <button key={pt} type="button" onClick={() => setRateDraft((d) => ({ ...d, price_type: pt }))} style={{ flex: 1, background: rateDraft.price_type === pt ? accent : "var(--color-surface-raised)", border: `1px solid ${rateDraft.price_type === pt ? accent : "var(--color-border)"}`, borderRadius: 10, padding: "9px 0", color: rateDraft.price_type === pt ? "#fff" : "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {pt === "hourly" ? t("ondemand.hire.hourlyRate") : t("ondemand.hire.flatTotal")}
                </button>
              ))}
            </div>
            {rateDraft.price_type === "hourly" ? (
              <input type="number" min="0" value={rateDraft.hourly_rate} onChange={(e) => setRateDraft((d) => ({ ...d, hourly_rate: e.target.value }))} placeholder={t("ondemand.worker.hourlyPlaceholder", { defaultValue: "Hourly rate ($)" })} className="bg-surface-raised border border-border text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 12 }} />
            ) : (
              <input type="number" min="0" value={rateDraft.flat_rate} onChange={(e) => setRateDraft((d) => ({ ...d, flat_rate: e.target.value }))} placeholder={t("ondemand.worker.flatPlaceholder", { defaultValue: "Flat rate ($)" })} className="bg-surface-raised border border-border text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 12 }} />
            )}

            <button type="button" onClick={saveServiceRates} disabled={rateBusy} style={{ width: "100%", background: accent, border: "none", borderRadius: 12, padding: "12px 0", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: rateBusy ? "default" : "pointer", opacity: rateBusy ? 0.7 : 1, marginBottom: 10 }}>
              {rateBusy ? t("common.saving", { defaultValue: "Saving…" }) : t("ondemand.worker.saveRate", { defaultValue: "Save rate" })}
            </button>
            {!rateDraft.isNew && (
              <button type="button" onClick={() => setRateDraft(null)} className="border border-border text-primary" style={{ width: "100%", background: "transparent", borderRadius: 12, padding: "10px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 16 }}>
                {t("common.done", { defaultValue: "Done" })}
              </button>
            )}

            {!rateDraft.isNew && (
              <>
                <p style={H({ fontSize: 14, margin: "0 0 10px" })}>{t("ondemand.worker.packages", { defaultValue: "Packages" })}</p>
                {(rateDraft.packages || []).length === 0 ? (
                  <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 10px" }}>{t("ondemand.worker.noPackagesYet", { defaultValue: "Optional: add packages like “Wedding DJ — 4 hrs”." })}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {(rateDraft.packages || []).map((p) => (
                      <div key={p.worker_package_id} className="bg-surface-raised border border-border" style={{ borderRadius: 10, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{p.name} · ${Number(p.price).toFixed(0)} · {p.duration_hours}h</span>
                        <button type="button" onClick={() => deletePackage(p.worker_package_id)} className="text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <input value={pkgDraft.name} onChange={(e) => setPkgDraft((d) => ({ ...d, name: e.target.value }))} placeholder={t("ondemand.worker.packageName", { defaultValue: "Package name" })} className="bg-surface-raised border border-border text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input type="number" min="0" value={pkgDraft.price} onChange={(e) => setPkgDraft((d) => ({ ...d, price: e.target.value }))} placeholder="$" className="bg-surface-raised border border-border text-primary" style={{ flex: 1, borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} />
                  <input type="number" min="0" step="0.5" value={pkgDraft.duration_hours} onChange={(e) => setPkgDraft((d) => ({ ...d, duration_hours: e.target.value }))} placeholder="Hours" className="bg-surface-raised border border-border text-primary" style={{ flex: 1, borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }} />
                </div>
                <button type="button" onClick={savePackage} disabled={rateBusy} className="border border-border text-primary" style={{ width: "100%", background: "transparent", borderRadius: 12, padding: "11px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rateBusy ? "default" : "pointer" }}>
                  {t("ondemand.worker.addPackage", { defaultValue: "Add package" })}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedJob(null); }}>
          <div className="bg-surface border border-border" style={{ borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "80vh", overflow: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={H({ fontSize: 18, margin: 0 })}>{t("ondemand.worker.jobDetails", { defaultValue: "Job Details" })}</p>
              <button onClick={() => setSelectedJob(null)} className="text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>

            {/* Job info */}
            <div style={{ marginBottom: 16 }}>
              <p className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>{workCategoryLabel(t, selectedJob.work_category) || selectedJob.title}</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <span style={{ background: `${workJobStatusColor(selectedJob.status)}22`, border: `1px solid ${workJobStatusColor(selectedJob.status)}44`, borderRadius: 999, padding: "4px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: workJobStatusColor(selectedJob.status) }}>{workJobStatusLabel(t, selectedJob.status)}</span>
                <span className="bg-surface-raised text-secondary" style={{ borderRadius: 999, padding: "4px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{selectedJob.price_type === "flat" ? t("ondemand.worker.flatRate", { defaultValue: "Flat Rate" }) : t("ondemand.worker.hourlyRate", { defaultValue: "Hourly" })}</span>
              </div>
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "4px 0" }}>{selectedJob.address || "—"}</p>
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "4px 0" }}>
                {selectedJob.scheduled_start && <span>{t("ondemand.worker.scheduledStart", { defaultValue: "Start" })}: {new Date(selectedJob.scheduled_start).toLocaleString()}</span>}
                {selectedJob.scheduled_end && <span> · {t("ondemand.worker.scheduledEnd", { defaultValue: "End" })}: {new Date(selectedJob.scheduled_end).toLocaleString()}</span>}
              </p>
              {selectedJob.instructions && (
                <div className="bg-surface-raised" style={{ marginTop: 12, padding: 12, borderRadius: 8 }}>
                  <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 4px" }}>{t("ondemand.worker.instructions", { defaultValue: "Instructions" })}</p>
                  <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: 0, lineHeight: 1.5 }}>{selectedJob.instructions}</p>
                </div>
              )}
            </div>

            {/* Financial details */}
            <div className="bg-surface-raised" style={{ padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 8px" }}>{t("ondemand.worker.financialDetails", { defaultValue: "Financial Details" })}</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.hirerPrice", { defaultValue: "Hirer Price" })}</span>
                <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>{money(selectedJob.hirer_set_price)}</span>
              </div>
              {selectedJob.hourly_rate && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.hourlyRate", { defaultValue: "Hourly Rate" })}</span>
                  <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>{money(selectedJob.hourly_rate)}/hr</span>
                </div>
              )}
              {selectedJob.duration_hours && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.duration", { defaultValue: "Duration" })}</span>
                  <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>{selectedJob.duration_hours.toFixed(2)} hrs</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.platformFee", { defaultValue: "Platform Fee" })}</span>
                <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>{selectedJob.platform_fee_pct}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.tax", { defaultValue: "Tax" })}</span>
                <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>{money(selectedJob.tax_amount)}</span>
              </div>
              {selectedJob.tip_amount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.tip", { defaultValue: "Tip" })}</span>
                  <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>{money(selectedJob.tip_amount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
                <span className="text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>{t("ondemand.worker.youEarn", { defaultValue: "You Earn" })}</span>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 800, color: accent }}>{money(selectedJob.worker_payout)}</span>
              </div>
            </div>

            {/* Hirer info */}
            <div className="bg-surface-raised" style={{ padding: 12, borderRadius: 8 }}>
              <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 8px" }}>{t("ondemand.worker.hirerInfo", { defaultValue: "Hirer Information" })}</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.hirerId", { defaultValue: "Hirer ID" })}</span>
                <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14 }}>#{selectedJob.hirer_id}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.paymentMethod", { defaultValue: "Payment Method" })}</span>
                <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, textTransform: "capitalize" }}>{selectedJob.payment_method}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("ondemand.worker.serviceMode", { defaultValue: "Service Mode" })}</span>
                <span className="text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, textTransform: "capitalize" }}>{selectedJob.service_mode}</span>
              </div>
            </div>

            {selectedJob.cancellation_reason && (
              <div style={{ marginTop: 16, padding: 12, background: "rgba(239, 68, 68, 0.1)", borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                <p className="text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 4px" }}>{t("ondemand.worker.cancellationReason", { defaultValue: "Cancellation Reason" })}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#fca5a5", margin: 0 }}>{selectedJob.cancellation_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function btn(bg) {
    return { background: bg, border: "none", borderRadius: 999, padding: "9px 18px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 };
  }
}
