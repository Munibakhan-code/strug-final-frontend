import React, { useCallback, useEffect, useState } from "react";
import { useViewport } from "../hooks/useViewport.js";
import { isAuthenticated, getAuthUserId } from "../store/auth.js";
import {
  EventsIcon,
  VenuesIcon,
  DecorIcon,
  FloralIcon,
  CateringIcon,
  ConciergeIcon,
} from "../components/icons.jsx";
import { getBookings } from "../api/booking.js";
import { setWorkHirePreset } from "../utils/workHirePreset.js";
import { BOOK_ARTIST_MACRO, BOOK_ARTIST_RADIUS_KM, bookArtistLeavesForHint } from "../utils/bookArtistCategories.js";
import {
  listEventPlans,
  createEventPlan,
  getEventPlan,
  updateEventPlan,
  deleteEventPlan,
  addEventNeed,
  updateEventNeed,
  deleteEventNeed,
  addEventGuest,
  bulkAddEventGuests,
  updateEventGuest,
  deleteEventGuest,
  markGuestsInvited,
  sendGuestInviteEmail,
  getInvite,
  submitRsvp,
  getShareEvent,
  addRegistryItem,
  removeRegistryItem,
  contributeToRegistry,
  claimRegistryItem,
  addEventCollaborator,
  removeEventCollaborator,
} from "../api/eventConcierge.js";
import {
  EditPlanModal,
  EditGuestModal,
  EditNeedBudgetModal,
  CoPlannerModal,
  TimelineCard,
  useDialog,
} from "../components/EventConciergeHostModals.jsx";

const ACCENT = "#f97316";
const FONT = "'DM Sans', sans-serif";

const OCCASIONS = [
  { id: "birthday", label: "Birthday" },
  { id: "wedding", label: "Wedding" },
  { id: "corporate", label: "Corporate" },
  { id: "baby", label: "Baby shower" },
  { id: "dinner", label: "Dinner party" },
  { id: "other", label: "Other" },
];

const VIBES = [
  { id: "modern", label: "Modern clean" },
  { id: "garden", label: "Garden / outdoor" },
  { id: "luxury", label: "Luxury glam" },
  { id: "boho", label: "Boho warm" },
  { id: "minimal", label: "Minimal" },
];

const INVITE_THEMES = [
  {
    id: "elegant",
    label: "Elegant",
    bg: "linear-gradient(160deg, #1a1520 0%, #2d1f3d 50%, #1a1520 100%)",
    accent: "#e8d5b7",
    text: "#f5f0e8",
  },
  {
    id: "garden",
    label: "Garden",
    bg: "linear-gradient(160deg, #0f1f14 0%, #1a3324 50%, #0f1f14 100%)",
    accent: "#86efac",
    text: "#ecfdf5",
  },
  {
    id: "modern",
    label: "Modern",
    bg: "linear-gradient(160deg, #0c0c10 0%, #1e293b 50%, #0c0c10 100%)",
    accent: "#38bdf8",
    text: "#f1f5f9",
  },
  {
    id: "celebration",
    label: "Celebration",
    bg: "linear-gradient(160deg, #1c1008 0%, #3b1f0e 50%, #1c1008 100%)",
    accent: "#fb923c",
    text: "#fff7ed",
  },
];

const NEED_STATUS = [
  { id: "todo", label: "To do", color: "rgba(255,255,255,0.45)" },
  { id: "sourcing", label: "Sourcing", color: "#38bdf8" },
  { id: "booked", label: "Booked", color: "#a78bfa" },
  { id: "done", label: "Done", color: "#4ade80" },
  { id: "skipped", label: "Skipped", color: "rgba(255,255,255,0.3)" },
];

// Planning template — neutral category slots the host fills with real listings.
// No fabricated business names, prices, or ratings are presented as real vendors.
const CATALOG = {
  venue: { role: "Venue", hint: "Book a space that fits your guest count" },
  decor: { role: "Décor", hint: "Styling, rentals, setup & teardown" },
  catering: { role: "Catering", hint: "Food & drinks for your guests" },
  floral: { role: "Floral", hint: "Centerpieces & arrangements" },
};

const PACKAGE_KEYS = ["venue", "decor", "catering", "floral"];

const VERTICAL_META = {
  venue: { label: "Venue", icon: VenuesIcon, color: "#f97316", nav: "venues" },
  decor: { label: "Décor", icon: DecorIcon, color: "#a855f7", nav: "decor" },
  catering: { label: "Catering", icon: CateringIcon, color: "#ef4444", nav: "catering" },
  floral: { label: "Floral", icon: FloralIcon, color: "#ec4899", nav: "floral" },
};

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-CA")}`;
}

function themeOf(id) {
  return INVITE_THEMES.find((t) => t.id === id) || INVITE_THEMES[0];
}

function occasionLabel(id) {
  return OCCASIONS.find((o) => o.id === id)?.label || "Event";
}

function formatDate(d) {
  if (!d) return "Date TBD";
  try {
    return new Date(d).toLocaleDateString("en-CA", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(d);
  }
}

/** Calendar days from local today to date (negative = past). */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target - today) / 86400000);
}

function countdownLabel(days) {
  if (days == null) return "Date TBD";
  if (days < 0) {
    const n = Math.abs(days);
    return `${n} day${n === 1 ? "" : "s"} ago`;
  }
  if (days === 0) return "Today!";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
}

function toDateInputValue(d) {
  if (!d) return "";
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function openWhatsApp(text, phone) {
  const digits = phone ? String(phone).replace(/\D/g, "") : "";
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

function inviteMessageText(plan, guestName, link) {
  const who = guestName ? `Hi ${guestName},\n\n` : "";
  return `${who}You're invited to ${plan.title}!\n${formatDate(plan.event_date)}${plan.city ? ` · ${plan.city}` : ""}${plan.rsvp_deadline ? `\nPlease RSVP by ${formatDate(plan.rsvp_deadline)}` : ""}\n\nRSVP here:\n${link}${plan.invite_message ? `\n\n${plan.invite_message}` : ""}\n\nSee you there!`;
}

/** Parse paste/CSV: name | name,email | name,email,phone | Name <email> */
function parseGuestLines(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const angle = line.match(/^(.+?)\s*<([^>]+)>\s*$/);
    if (angle) {
      out.push({ name: angle[1].trim(), email: angle[2].trim(), phone: null });
      continue;
    }
    const parts = line.split(/[,\t;]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const name = parts[0];
    let email = null;
    let phone = null;
    for (let i = 1; i < parts.length; i += 1) {
      if (!email && /@/.test(parts[i])) email = parts[i];
      else if (!phone) phone = parts[i];
    }
    out.push({ name, email, phone });
  }
  return out.slice(0, 100);
}

function budgetStats(plan) {
  const budget = plan.budget != null ? Number(plan.budget) : 0;
  const needs = plan.needs || [];
  const allocated = needs.reduce((s, n) => s + (Number(n.target_budget) || 0), 0);
  const bookedSpend = needs
    .filter((n) => n.status === "booked" || n.status === "done")
    .reduce((s, n) => s + (Number(n.target_budget) || 0), 0);
  const packageTotal = Number(plan.package_json?.total) || 0;
  const planned = Math.max(allocated, packageTotal);
  const remaining = budget > 0 ? budget - bookedSpend : null;
  const pct = budget > 0 ? Math.min(100, Math.round((bookedSpend / budget) * 100)) : 0;
  return { budget, planned, bookedSpend, remaining, pct, over: budget > 0 && bookedSpend > budget };
}

function headcountStats(plan) {
  const list = plan.guest_list || [];
  const yes = list.filter((g) => g.status === "accepted").reduce((s, g) => s + 1 + (Number(g.plus_ones) || 0), 0);
  const maybe = list.filter((g) => g.status === "maybe").reduce((s, g) => s + 1 + (Number(g.plus_ones) || 0), 0);
  return { yes, maybe, expected: plan.guests != null ? Number(plan.guests) : null, listed: list.length };
}

function buildNextActions(plan, rsvp) {
  const actions = [];
  const openNeeds = (plan.needs || []).filter(
    (n) => n.status !== "booked" && n.status !== "done" && n.status !== "skipped"
      && n.linked_nav !== "registry" && n.category !== "gifts" && navForNeed(n),
  );
  // Prefer venue first
  openNeeds.sort((a, b) => {
    const rank = (n) => (n.category === "venue" || n.linked_nav === "venues" ? 0 : 1);
    return rank(a) - rank(b);
  });
  if (openNeeds.length) {
    const top = openNeeds.slice(0, 3);
    actions.push({
      id: "book-needs",
      title: `Book ${top[0].title}${openNeeds.length > 1 ? ` (+${openNeeds.length - 1} more)` : ""}`,
      body: "Still open on your checklist — book in Strug or mark done.",
      tab: "checklist",
      needId: top[0].event_need_id,
      kind: "book",
    });
  }
  if (!(plan.guest_list || []).length) {
    actions.push({
      id: "add-guests",
      title: "Add your guest list",
      body: "Paste names (and emails) so you can send personal invite links.",
      tab: "invites",
      kind: "nav",
    });
  } else if ((rsvp?.pending || 0) > 0) {
    actions.push({
      id: "send-invites",
      title: `Follow up ${rsvp.pending} pending RSVP${rsvp.pending === 1 ? "" : "s"}`,
      body: plan.rsvp_deadline
        ? `Deadline ${formatDate(plan.rsvp_deadline)} — share WhatsApp or email invites.`
        : "Copy, WhatsApp, or email personal invite links.",
      tab: "invites",
      kind: "nav",
    });
  }
  if (!plan.rsvp_deadline && (plan.guest_list || []).length) {
    actions.push({
      id: "set-deadline",
      title: "Set an RSVP deadline",
      body: "Guests see the date on invites; you’ll get a reminder on Overview.",
      tab: "invites",
      kind: "nav",
    });
  }
  if (!(plan.registry_items || []).length && ["wedding", "birthday", "baby", "other"].includes(plan.occasion)) {
    actions.push({
      id: "registry",
      title: "Add a contribution registry item",
      body: "Let guests pitch in toward gifts or event costs.",
      tab: "registry",
      kind: "nav",
    });
  }
  return actions.slice(0, 4);
}

function listingRows(res) {
  return Array.isArray(res) ? res : (res?.data ?? []);
}

function buildPackage(brief) {
  const guests = Number(brief.guests) || 0;
  const budget = Number(brief.budget) || 0;
  // A planning template of the categories to fill with real listings — not a
  // quote. No invented vendor names or prices; the host's own budget is the target.
  const items = PACKAGE_KEYS.map((key) => ({
    key,
    name: CATALOG[key].role,
    hint: CATALOG[key].hint,
  }));
  return { items, budget, guests };
}

function inviteUrl(token) {
  return `${window.location.origin}/invite/${token}`;
}

function shareUrl(token) {
  return `${window.location.origin}/event-share/${token}`;
}

const CHECKOUT_CTX_KEY = "strug_event_checkout_ctx";
const BOOK_QUEUE_KEY = "strug_event_book_queue";

/** Map planner need / package key → checkout surface */
const CHECKOUT_NAV = {
  venue: "venues",
  venues: "venues",
  decor: "decor",
  catering: "catering",
  cake: "catering",
  floral: "floral",
  flowers: "floral",
  dress: "wedding",
  wedding: "wedding",
  rental: "equipment",
  equipment: "equipment",
  staff: "ondemand",
  ondemand: "ondemand",
  photographer: "ondemand",
  videographer: "ondemand",
  dj: "ondemand",
  artists: "artists",
  custom: "ondemand",
};

function navForNeed(need) {
  // Legacy plans linked photo/video to Artist Corner (art sales) — route to Work instead
  const cat = String(need?.category || "").toLowerCase();
  if (cat === "photographer" || cat === "videographer" || cat === "dj") {
    return "ondemand";
  }
  if (need?.linked_nav && need.linked_nav !== "registry") {
    if (need.linked_nav === "artists" && /photo|video|dj|musician|entertain/i.test(String(need?.title || ""))) {
      return "ondemand";
    }
    return need.linked_nav;
  }
  return CHECKOUT_NAV[need?.category] || null;
}

function stashCheckoutCtx(ctx) {
  try {
    sessionStorage.setItem(CHECKOUT_CTX_KEY, JSON.stringify({ ...ctx, started_at: Date.now() }));
  } catch { /* ignore */ }
  window.__navReturn = { id: "concierge", label: "Back to Event Concierge" };
  try { window.dispatchEvent(new CustomEvent("strug:nav-return")); } catch { /* ignore */ }
}

function readCheckoutCtx() {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_CTX_KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    // Drop stale checkout context (older than 2h)
    if (ctx?.started_at && Date.now() - ctx.started_at > 2 * 60 * 60 * 1000) {
      clearCheckoutCtx();
      return null;
    }
    return ctx;
  } catch {
    return null;
  }
}

function clearCheckoutCtx() {
  try { sessionStorage.removeItem(CHECKOUT_CTX_KEY); } catch { /* ignore */ }
}

function writeBookQueue(queue) {
  try {
    if (!queue?.length) sessionStorage.removeItem(BOOK_QUEUE_KEY);
    else sessionStorage.setItem(BOOK_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* ignore */ }
}

function shiftBookQueue() {
  try {
    const raw = sessionStorage.getItem(BOOK_QUEUE_KEY);
    if (!raw) return null;
    const queue = JSON.parse(raw);
    if (!Array.isArray(queue) || !queue.length) {
      sessionStorage.removeItem(BOOK_QUEUE_KEY);
      return null;
    }
    const [next, ...rest] = queue;
    writeBookQueue(rest);
    return next;
  } catch {
    return null;
  }
}

function clearBookQueue() {
  try { sessionStorage.removeItem(BOOK_QUEUE_KEY); } catch { /* ignore */ }
}

/** Open a vertical for individual checkout; optionally deep-open a venue/décor listing. */
function startIndividualCheckout({ onNavigate, nav, listingId, ctx }) {
  if (!nav || typeof onNavigate !== "function") return false;
  stashCheckoutCtx({ ...ctx, nav, listingId: listingId || null });
  if (listingId && (nav === "venues" || nav === "decor")) {
    window.__pendingListingId = String(listingId);
    window.__pendingListingVertical = nav === "venues" ? "venue" : "decor";
  }
  if (nav === "decor") {
    window.__forceDecorSubNav = "services";
  }
  // Talent needs book through Work with category-first deep link
  if (nav === "ondemand") {
    const cat = String(ctx?.package_key || ctx?.category || ctx?.title || "").toLowerCase();
    const leafSlugs = /staff|ondemand|custom/.test(cat) ? [] : bookArtistLeavesForHint(cat);
    setWorkHirePreset({
      macro: BOOK_ARTIST_MACRO,
      leafSlugs,
      source: "bookartist",
      catalog: true,
      radius: BOOK_ARTIST_RADIUS_KM,
    });
  }
  // Catering / floral are shop browse — only seed when title looks like a real vendor name
  const q = String(ctx?.browse_query || ctx?.title || "").trim();
  const GENERIC = /^(cake|catering|floral|flowers|venue|décor|decor|rentals?|staff|dress|photographer|videographer)$/i;
  if ((nav === "catering" || nav === "floral") && q && !GENERIC.test(q) && q.length >= 3) {
    window.__pendingBrowseQuery = q.slice(0, 80);
  }
  onNavigate(nav);
  return true;
}

async function findRecentBookingMatch(ctx) {
  if (!isAuthenticated() || !ctx) return null;
  try {
    const res = await getBookings({ role: "guest" });
    const rows = listingRows(res);
    const since = Number(ctx.started_at) || 0;
    const listingId = ctx.listingId != null ? String(ctx.listingId) : null;
    const scored = rows
      .map((b) => {
        const created = new Date(b.created_at || b.updated_at || 0).getTime();
        let score = 0;
        if (listingId && String(b.booking_listing_id) === listingId) score += 100;
        if (since && created >= since - 5 * 60 * 1000) score += 50;
        else if (since && created >= since - 2 * 60 * 60 * 1000) score += 15;
        else if (!since && Date.now() - created < 2 * 60 * 60 * 1000) score += 8;
        const title = (b.booking_listing?.title || "").toLowerCase();
        const needle = String(ctx.title || "").toLowerCase().trim();
        if (needle && title) {
          if (title === needle) score += 35;
          else if (title.includes(needle.slice(0, Math.min(16, needle.length))) || needle.includes(title.slice(0, Math.min(16, title.length)))) score += 20;
        }
        const st = String(b.status || b.booking_status || "").toLowerCase();
        if (["confirmed", "paid", "completed", "active", "upcoming"].includes(st)) score += 8;
        return { b, score, created };
      })
      .filter((x) => x.score >= 20)
      .sort((a, b) => b.score - a.score || b.created - a.created);
    return scored[0]?.b || null;
  } catch {
    return null;
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function FieldLabel({ children }) {
  return (
    <label style={{ display: "block", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
      {children}
    </label>
  );
}

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: selected ? 700 : 500,
        color: selected ? "#fff" : "rgba(255,255,255,0.7)",
        background: selected ? ACCENT : "rgba(255,255,255,0.05)",
        border: selected ? `1px solid ${ACCENT}` : "1px solid rgba(255,255,255,0.12)",
        borderRadius: 999,
        padding: "8px 14px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function inputStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: FONT,
    fontSize: 14,
    color: "#fff",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 12,
    padding: "12px 14px",
    outline: "none",
    colorScheme: "dark",
  };
}

/** Dark-theme date field with a guaranteed-visible calendar affordance. */
function DateField({ value, onChange, min, style }) {
  const inputRef = React.useRef(null);
  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
      el.click();
    }
  };
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        type="date"
        className="ec-date-input"
        value={value}
        min={min}
        onChange={onChange}
        style={{
          ...inputStyle(),
          ...style,
          paddingRight: 44,
          colorScheme: "dark",
        }}
      />
      <button
        type="button"
        aria-label="Open calendar"
        onClick={openPicker}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 2,
          width: 32,
          height: 32,
          display: "grid",
          placeItems: "center",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 8,
          cursor: "pointer",
          padding: 0,
          color: "#fff",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="#fff" strokeWidth="2" />
          <path d="M3 10h18" stroke="#fff" strokeWidth="2" />
          <path d="M8 3v4M16 3v4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, style }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 700,
        color: "#fff",
        background: disabled ? "rgba(249,115,22,0.35)" : ACCENT,
        border: "none",
        borderRadius: 12,
        padding: "12px 18px",
        cursor: disabled ? "default" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, style, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: 600,
        color: "rgba(255,255,255,0.75)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        padding: "10px 14px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function ProgressBar({ pct, color = ACCENT }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, pct || 0)}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.3s" }} />
    </div>
  );
}

function InviteCard({ event, guestName, compact }) {
  const theme = themeOf(event?.invite_theme);
  return (
    <div
      style={{
        borderRadius: 20,
        background: theme.bg,
        border: `1px solid ${theme.accent}44`,
        padding: compact ? 20 : 32,
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 12,
          border: `1px solid ${theme.accent}33`,
          borderRadius: 14,
          pointerEvents: "none",
        }}
      />
      <div style={{ fontFamily: FONT, fontSize: 11, letterSpacing: 2, fontWeight: 700, color: theme.accent, marginBottom: 12 }}>
        YOU&apos;RE INVITED
      </div>
      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: compact ? 28 : 36, fontWeight: 700, color: theme.text, margin: "0 0 8px", letterSpacing: 0.5 }}>
        {event?.title}
      </h2>
      <p style={{ fontFamily: FONT, fontSize: 14, color: `${theme.text}cc`, margin: "0 0 16px" }}>
        {occasionLabel(event?.occasion)} · {formatDate(event?.event_date)}
        {event?.city ? ` · ${event.city}` : ""}
      </p>
      {guestName && (
        <p style={{ fontFamily: FONT, fontSize: 15, color: theme.accent, margin: "0 0 12px", fontWeight: 600 }}>
          Dear {guestName}
        </p>
      )}
      {event?.invite_message && (
        <p style={{ fontFamily: FONT, fontSize: 14, color: `${theme.text}bb`, margin: "0 auto", maxWidth: 360, lineHeight: 1.55, fontStyle: "italic" }}>
          “{event.invite_message}”
        </p>
      )}
      <p style={{ fontFamily: FONT, fontSize: 12, color: `${theme.text}66`, marginTop: 18 }}>
        Hosted by {event?.host_name || "your host"}
      </p>
    </div>
  );
}

function ContributeModal({ item, onClose, onDone, accessTokens }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const remaining = Math.max(0, (item.price || 0) - (item.total_contributed || 0));

  const submit = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) { setErr("Enter a valid amount"); return; }
    if (!isAuthenticated()) {
      setErr("Sign in required — contributions use your Strug wallet (same as wishlist).");
      try { sessionStorage.setItem("strug_return_to", window.location.pathname + window.location.search); } catch { /* ignore */ }
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await contributeToRegistry(item.registry_item_id, n, note || null, accessTokens || {});
      onDone?.();
      onClose?.();
    } catch (e) {
      setErr(e?.response?.data?.error || "Could not contribute");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 80, display: "grid", placeItems: "center", padding: 16 }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 400, background: "#121216", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Chip in</h3>
        <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 16px" }}>
          {item.title} · {money(remaining)} remaining — works like Strug wishlist gifts
        </p>
        <FieldLabel>Amount (CAD)</FieldLabel>
        <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle(), marginBottom: 12 }} placeholder={String(Math.min(50, remaining) || 25)} disabled={remaining <= 0} />
        <FieldLabel>Note (optional)</FieldLabel>
        <input value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle(), marginBottom: 16 }} placeholder="Congrats!" disabled={remaining <= 0} />
        {remaining <= 0 && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "0 0 10px" }}>This item is fully funded</p>}
        {err && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "0 0 10px" }}>{err}</p>}
        {!isAuthenticated() && remaining > 0 && (
          <GhostBtn
            onClick={() => {
              try { sessionStorage.setItem("strug_return_to", window.location.pathname + window.location.search); } catch { /* ignore */ }
              window.location.href = import.meta.env.VITE_LOGIN_URL ?? "https://strug.ca/en/login";
            }}
            style={{ width: "100%", marginBottom: 10, color: ACCENT, borderColor: "rgba(249,115,22,0.4)" }}
          >
            Sign in to contribute
          </GhostBtn>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <GhostBtn onClick={onClose} style={{ flex: 1 }}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy || !isAuthenticated() || remaining <= 0} style={{ flex: 1 }}>{busy ? "Sending…" : "Contribute"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/** In-app replacement for window.prompt when marking a need booked. */
function MarkBookedModal({ title, initialId = "", onClose, onConfirm }) {
  const [bookingId, setBookingId] = useState(initialId == null ? "" : String(initialId));
  const [busy, setBusy] = useState(false);
  const inputRef = React.useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm?.(bookingId.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 90, display: "grid", placeItems: "center", padding: 16 }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ec-mark-booked-title"
        style={{ width: "100%", maxWidth: 400, background: "#121216", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="ec-mark-booked-title" style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
          Mark as booked
        </h3>
        <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 16px", lineHeight: 1.45 }}>
          {title ? <><strong style={{ color: "#fff" }}>{title}</strong> — </> : null}
          Optionally link a booking / order ID, or leave blank and mark booked anyway.
        </p>
        <FieldLabel>Booking / order ID (optional)</FieldLabel>
        <input
          ref={inputRef}
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") onClose?.();
          }}
          style={{ ...inputStyle(), marginBottom: 16 }}
          placeholder="e.g. 1042"
        />
        <div style={{ display: "flex", gap: 8 }}>
          <GhostBtn onClick={onClose} style={{ flex: 1 }} disabled={busy}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy} style={{ flex: 1 }}>
            {busy ? "Saving…" : "Mark booked"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/** In-app replacement for window.prompt when setting a contribution goal. */
function FundGoalModal({ title, initialAmount = "200", onClose, onConfirm }) {
  const [amount, setAmount] = useState(String(initialAmount || "200"));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = React.useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, []);

  const submit = async () => {
    const price = parseFloat(amount);
    if (!price || price <= 0) {
      setErr("Enter a valid amount");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await onConfirm?.(price);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || "Could not save");
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 90, display: "grid", placeItems: "center", padding: 16 }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ width: "100%", maxWidth: 400, background: "#121216", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
          Contribution goal
        </h3>
        <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 16px", lineHeight: 1.45 }}>
          Goal for <strong style={{ color: "#fff" }}>{title}</strong> (CAD). Guests can pitch in like a wishlist.
        </p>
        <FieldLabel>Amount (CAD)</FieldLabel>
        <input
          ref={inputRef}
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setErr(""); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") onClose?.();
          }}
          style={{ ...inputStyle(), marginBottom: 12 }}
        />
        {err && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "0 0 10px" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <GhostBtn onClick={onClose} style={{ flex: 1 }} disabled={busy}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy} style={{ flex: 1 }}>
            {busy ? "Saving…" : "Add to registry"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function RegistryList({ items, isOwner, onRefresh, onNavigate, accessTokens, onConfirm }) {
  const [contributeItem, setContributeItem] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);

  const flashMsg = (text, ok = true) => {
    setMsg(text);
    setMsgOk(ok);
    setTimeout(() => setMsg(""), 3500);
  };

  if (!items?.length) {
    return (
      <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
        No contribution items yet. Add gifts or expenses guests can pitch in toward.
      </p>
    );
  }

  return (
    <div>
      {msg && <p style={{ fontFamily: FONT, fontSize: 12, color: msgOk ? "#4ade80" : "#fca5a5", marginBottom: 10 }}>{msg}</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => {
          const raised = item.total_contributed || 0;
          const funded = item.status === "funded" || item.progress_pct >= 100;
          return (
            <div key={item.registry_item_id} style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#fff" }}>{item.title}</div>
                  {item.description && <div style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{item.description}</div>}
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#fff" }}>{money(item.price)}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{money(raised)} raised</div>
                </div>
              </div>
              <ProgressBar pct={item.progress_pct} color={funded ? "#4ade80" : ACCENT} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {!funded && item.status === "active" && (
                  <PrimaryBtn onClick={() => setContributeItem(item)} style={{ padding: "8px 12px", fontSize: 12 }}>
                    Gift / Chip in
                  </PrimaryBtn>
                )}
                {isOwner && funded && item.status === "funded" && (
                  <PrimaryBtn
                    style={{ padding: "8px 12px", fontSize: 12, background: "#059669" }}
                    onClick={async () => {
                      try {
                        const res = await claimRegistryItem(item.registry_item_id);
                        flashMsg(`Claimed ${money(res.claimed_total)} to your wallet`, true);
                        onRefresh?.();
                      } catch (e) {
                        flashMsg(e?.response?.data?.error || "Claim failed", false);
                      }
                    }}
                  >
                    Claim to wallet
                  </PrimaryBtn>
                )}
                {isOwner && (
                  <GhostBtn
                    onClick={async () => {
                      const ok = onConfirm
                        ? await onConfirm({
                          title: "Remove registry item?",
                          message: "Guests will no longer see this contribution goal.",
                          confirmLabel: "Remove",
                          danger: true,
                        })
                        : true;
                      if (!ok) return;
                      try {
                        await removeRegistryItem(item.registry_item_id);
                        onRefresh?.();
                      } catch (e) {
                        flashMsg(e?.response?.data?.error || "Remove failed", false);
                      }
                    }}
                    style={{ padding: "8px 12px", fontSize: 12 }}
                  >
                    Remove
                  </GhostBtn>
                )}
                {item.item_type === "booking" && onNavigate && (
                  <GhostBtn
                    onClick={() => {
                      try { sessionStorage.setItem("strug_return_to", window.location.pathname + window.location.search); } catch { /* ignore */ }
                      onNavigate("venues");
                    }}
                    style={{ padding: "8px 12px", fontSize: 12 }}
                  >
                    Browse
                  </GhostBtn>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {contributeItem && (
        <ContributeModal
          item={contributeItem}
          accessTokens={accessTokens}
          onClose={() => setContributeItem(null)}
          onDone={() => {
            setContributeItem(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

function PublicInviteView({ token, onNavigate }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [rsvpErr, setRsvpErr] = useState("");
  const [rsvp, setRsvp] = useState("accepted");
  const [plusOnes, setPlusOnes] = useState(0);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInvite(token)
      .then((d) => {
        setData(d);
        if (d.guest?.status && ["accepted", "declined", "maybe"].includes(d.guest.status)) {
          setRsvp(d.guest.status);
          setPlusOnes(d.guest.plus_ones || 0);
          setNote(d.guest.rsvp_note || "");
          setSaved(true);
        }
      })
      .catch(() => setErr("Invitation not found"));
  }, [token]);

  if (err) {
    return <p style={{ fontFamily: FONT, color: "#fca5a5", padding: 40, textAlign: "center" }}>{err}</p>;
  }
  if (!data) {
    return <p style={{ fontFamily: FONT, color: "rgba(255,255,255,0.4)", padding: 40, textAlign: "center" }}>Loading invitation…</p>;
  }

  const submit = async () => {
    setBusy(true);
    setRsvpErr("");
    try {
      await submitRsvp(token, { status: rsvp, plus_ones: plusOnes, rsvp_note: note });
      setSaved(true);
    } catch (e) {
      setRsvpErr(e?.response?.data?.error || "RSVP failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <InviteCard event={data.event} guestName={data.guest?.name} />
      {data.event?.rsvp_deadline && (
        <p style={{
          fontFamily: FONT,
          fontSize: 13,
          color: daysUntil(data.event.rsvp_deadline) != null && daysUntil(data.event.rsvp_deadline) < 0
            ? "#fca5a5"
            : "rgba(255,255,255,0.55)",
          textAlign: "center",
          margin: "12px 0 0",
        }}>
          Please RSVP by {formatDate(data.event.rsvp_deadline)}
          {daysUntil(data.event.rsvp_deadline) != null && daysUntil(data.event.rsvp_deadline) < 0
            ? (data.event.allow_late_rsvp === false
              ? " (deadline passed — RSVPs are closed)"
              : " (deadline passed — you can still respond)")
            : ""}
        </p>
      )}
      <div style={{ marginTop: 24, borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", padding: 18 }}>
        <h3 style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: "#fff", margin: "0 0 14px" }}>RSVP</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {[
            { id: "accepted", label: "Yes, I'll be there" },
            { id: "maybe", label: "Maybe" },
            { id: "declined", label: "Can't make it" },
          ].map((o) => (
            <Chip key={o.id} selected={rsvp === o.id} onClick={() => { setRsvp(o.id); setSaved(false); setRsvpErr(""); }}>
              {o.label}
            </Chip>
          ))}
        </div>
        {rsvp !== "declined" && (
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>Plus-ones</FieldLabel>
            <input type="number" min={0} max={10} value={plusOnes} onChange={(e) => { setPlusOnes(Number(e.target.value)); setSaved(false); }} style={{ ...inputStyle(), maxWidth: 120 }} />
          </div>
        )}
        <FieldLabel>Note to host</FieldLabel>
        <input value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} style={{ ...inputStyle(), marginBottom: 14 }} placeholder="Looking forward to it!" />
        {rsvpErr && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "0 0 10px" }}>{rsvpErr}</p>}
        <PrimaryBtn onClick={submit} disabled={busy}>{busy ? "Saving…" : saved ? "Update RSVP" : "Send RSVP"}</PrimaryBtn>
        {saved && !rsvpErr && <p style={{ fontFamily: FONT, fontSize: 12, color: "#4ade80", marginTop: 10 }}>RSVP saved — thank you!</p>}
      </div>

      {data.registry_items?.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Contribute</h3>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 14px" }}>
            Pitch in toward gifts and event needs — same as a wishlist.
          </p>
          <RegistryList
            items={data.registry_items}
            isOwner={false}
            accessTokens={{ invite_token: token }}
            onRefresh={() => getInvite(token).then(setData)}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}

function PublicShareView({ shareToken, onNavigate }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    getShareEvent(shareToken)
      .then(setData)
      .catch(() => setErr("Event not found"));
  }, [shareToken]);

  if (err) {
    return <p style={{ fontFamily: FONT, color: "#fca5a5", padding: 40, textAlign: "center" }}>{err}</p>;
  }
  if (!data) {
    return <p style={{ fontFamily: FONT, color: "rgba(255,255,255,0.4)", padding: 40, textAlign: "center" }}>Loading…</p>;
  }

  const ev = data.event || {};
  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <InviteCard event={ev} />
      <div style={{ marginTop: 18, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: 16, background: "rgba(255,255,255,0.03)" }}>
        <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Day-of details</div>
        <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.5 }}>
          {formatDate(ev.event_date)}{ev.city ? ` · ${ev.city}` : ""}
          {ev.rsvp_deadline ? ` · RSVP by ${formatDate(ev.rsvp_deadline)}` : ""}
        </p>
        {ev.notes ? (
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{ev.notes}</p>
        ) : (
          <p style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "8px 0 0" }}>Host hasn’t added day-of notes yet.</p>
        )}
        {ev.invite_message && (
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "10px 0 0", fontStyle: "italic" }}>{ev.invite_message}</p>
        )}
      </div>
      {data.registry_items?.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Contribution registry</h3>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 14px" }}>
            Pitch in toward gifts and event needs.
          </p>
          <RegistryList
            items={data.registry_items}
            isOwner={false}
            accessTokens={{ share_token: shareToken }}
            onRefresh={() => getShareEvent(shareToken).then(setData)}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}

function CreateWizard({ onCreated, onCancel }) {
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState({
    title: "",
    occasion: "",
    date: "",
    rsvp_deadline: "",
    allow_late_rsvp: true,
    guests: "40",
    budget: "3000",
    city: "",
    vibe: "",
    invite_theme: "elegant",
    invite_message: "",
  });
  const [pkg, setPkg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (step !== 1) return undefined;
    let cancelled = false;
    (async () => {
      const built = await buildPackage(brief);
      if (cancelled) return;
      setPkg(built);
      setStep(2);
    })();
    return () => { cancelled = true; };
  }, [step, brief]);

  const ready = brief.occasion && brief.date && brief.guests && brief.budget && brief.city && brief.vibe;

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const plan = await createEventPlan({
        title: brief.title.trim() || `${occasionLabel(brief.occasion)} celebration`,
        occasion: brief.occasion,
        event_date: brief.date,
        rsvp_deadline: brief.rsvp_deadline || null,
        allow_late_rsvp: brief.allow_late_rsvp !== false,
        guests: Number(brief.guests),
        budget: Number(brief.budget),
        city: brief.city,
        vibe: brief.vibe,
        invite_theme: brief.invite_theme,
        invite_message: brief.invite_message || null,
        package_json: pkg,
        seed_needs: true,
      });
      onCreated(plan);
    } catch (e) {
      setErr(e?.response?.data?.error || "Could not create event — sign in and try again");
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (step === 2) {
      setPkg(null);
      setStep(0);
      return;
    }
    if (step === 1) {
      setStep(0);
      return;
    }
    onCancel();
  };

  return (
    <div>
      <GhostBtn onClick={goBack} style={{ marginBottom: 16 }}>
        {step === 2 ? "← Edit brief" : "← Back"}
      </GhostBtn>
      {step === 0 && (
        <div>
          <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Plan your event</h1>
          <p style={{ fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "0 0 22px", lineHeight: 1.5, maxWidth: 520 }}>
            One place for venue, cake, flowers, dress, rentals, staff, photo/video, invitations, RSVPs, and a gift registry guests can chip into.
          </p>
          <FieldLabel>Event name</FieldLabel>
          <input value={brief.title} onChange={(e) => setBrief((b) => ({ ...b, title: e.target.value }))} style={{ ...inputStyle(), marginBottom: 16 }} placeholder="Alex & Sam's Wedding" />
          <FieldLabel>Occasion</FieldLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {OCCASIONS.map((o) => (
              <Chip key={o.id} selected={brief.occasion === o.id} onClick={() => setBrief((b) => ({ ...b, occasion: o.id }))}>{o.label}</Chip>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div>
              <FieldLabel>Date</FieldLabel>
              <DateField
                value={brief.date}
                onChange={(e) => setBrief((b) => ({ ...b, date: e.target.value }))}
              />
            </div>
            <div>
              <FieldLabel>RSVP deadline (optional)</FieldLabel>
              <DateField
                value={brief.rsvp_deadline}
                onChange={(e) => setBrief((b) => ({ ...b, rsvp_deadline: e.target.value }))}
              />
            </div>
            <div>
              <FieldLabel>Guests</FieldLabel>
              <input type="number" min={5} value={brief.guests} onChange={(e) => setBrief((b) => ({ ...b, guests: e.target.value }))} style={inputStyle()} />
            </div>
            <div>
              <FieldLabel>Budget (CAD)</FieldLabel>
              <input type="number" min={200} value={brief.budget} onChange={(e) => setBrief((b) => ({ ...b, budget: e.target.value }))} style={inputStyle()} />
            </div>
            <div>
              <FieldLabel>City</FieldLabel>
              <input value={brief.city} onChange={(e) => setBrief((b) => ({ ...b, city: e.target.value }))} style={inputStyle()} placeholder="Toronto" />
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            <input
              type="checkbox"
              checked={brief.allow_late_rsvp !== false}
              onChange={(e) => setBrief((b) => ({ ...b, allow_late_rsvp: e.target.checked }))}
            />
            Allow late RSVPs after deadline
          </label>
          <FieldLabel>Vibe</FieldLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {VIBES.map((v) => (
              <Chip key={v.id} selected={brief.vibe === v.id} onClick={() => setBrief((b) => ({ ...b, vibe: v.id }))}>{v.label}</Chip>
            ))}
          </div>
          <FieldLabel>Invitation design</FieldLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
            {INVITE_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setBrief((b) => ({ ...b, invite_theme: t.id }))}
                style={{
                  borderRadius: 12,
                  border: brief.invite_theme === t.id ? `2px solid ${ACCENT}` : "1px solid rgba(255,255,255,0.12)",
                  background: t.bg,
                  padding: "16px 10px",
                  cursor: "pointer",
                  color: t.accent,
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <FieldLabel>Invite message (optional)</FieldLabel>
          <textarea
            value={brief.invite_message}
            onChange={(e) => setBrief((b) => ({ ...b, invite_message: e.target.value }))}
            rows={2}
            style={{ ...inputStyle(), marginBottom: 20, resize: "vertical" }}
            placeholder="We can't wait to celebrate with you…"
          />
          <PrimaryBtn disabled={!ready} onClick={() => setStep(1)}>Build checklist →</PrimaryBtn>
        </div>
      )}
      {step === 1 && (
        <div style={{ textAlign: "center", padding: "40px 12px" }}>
          <div style={{ color: ACCENT, marginBottom: 16 }}><EventsIcon s={36} /></div>
          <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, color: "#fff" }}>Building your planning template…</h2>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Venue · décor · catering · floral · needs list</p>
        </div>
      )}
      {step === 2 && pkg && (
        <div>
          <h2 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Planning template</h2>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 16px" }}>
            {pkg.budget ? `Target budget ${money(pkg.budget)} — ` : ""}fill each category with real listings from Strug.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 20 }}>
            {pkg.items.map((item) => {
              const meta = VERTICAL_META[item.key];
              return (
                <div key={item.key} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", padding: 12, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: meta.color, fontWeight: 700 }}>{meta.label}</div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>{item.hint}</div>
                </div>
              );
            })}
          </div>
          {err && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", marginBottom: 10 }}>{err}</p>}
          <PrimaryBtn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save event planner →"}</PrimaryBtn>
        </div>
      )}
    </div>
  );
}

function EventDetail({ planId, onBack, onNavigate }) {
  const [plan, setPlan] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [bulkNames, setBulkNames] = useState("");
  const [regTitle, setRegTitle] = useState("");
  const [regPrice, setRegPrice] = useState("");
  const [regDesc, setRegDesc] = useState("");
  const [needTitle, setNeedTitle] = useState("");
  const [toast, setToast] = useState("");
  const [checkoutPrompt, setCheckoutPrompt] = useState(null);
  const [markBookedModal, setMarkBookedModal] = useState(null);
  const [fundModal, setFundModal] = useState(null);
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [editGuest, setEditGuest] = useState(null);
  const [editNeedBudget, setEditNeedBudget] = useState(null);
  const [coPlannerOpen, setCoPlannerOpen] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [rsvpDeadline, setRsvpDeadline] = useState("");
  const [guestMenuId, setGuestMenuId] = useState(null);
  const checkoutHandledRef = React.useRef(null);
  const [dialog, { confirm }] = useDialog();
  const { isMobile } = useViewport();

  useEffect(() => {
    if (guestMenuId == null) return undefined;
    const close = () => setGuestMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [guestMenuId]);

  const refresh = useCallback(async () => {
    const p = await getEventPlan(planId);
    setPlan(p);
    if (p?.invite_message != null) setInviteMessage(p.invite_message || "");
    setRsvpDeadline(toDateInputValue(p?.rsvp_deadline));
    return p;
  }, [planId]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch(() => setErr("Could not load event"))
      .finally(() => setLoading(false));
  }, [refresh]);

  // After Book → vertical → return to Concierge: offer to mark that need booked (once per ctx)
  useEffect(() => {
    if (!plan) return;
    const ctx = readCheckoutCtx();
    if (!ctx) return;
    if (Number(ctx.event_plan_id) !== Number(plan.event_plan_id)) return;
    const ctxKey = `${ctx.event_plan_id}:${ctx.event_need_id}:${ctx.started_at}`;
    if (checkoutHandledRef.current === ctxKey) return;
    if (!ctx.event_need_id) {
      clearCheckoutCtx();
      return;
    }
    const need = (plan.needs || []).find((n) => n.event_need_id === ctx.event_need_id);
    if (!need || need.status === "booked" || need.status === "done") {
      clearCheckoutCtx();
      return;
    }
    checkoutHandledRef.current = ctxKey;
    let cancelled = false;
    setCheckoutPrompt({ needId: need.event_need_id, title: need.title || ctx.title || "Item", suggestedBookingId: null, detecting: true, nav: ctx.nav });
    setTab("checklist");
    findRecentBookingMatch(ctx).then((match) => {
      if (cancelled) return;
      setCheckoutPrompt({
        needId: need.event_need_id,
        title: need.title || ctx.title || "Item",
        suggestedBookingId: match?.booking_id || null,
        suggestedTitle: match?.booking_listing?.title || null,
        detecting: false,
        fromQueue: !!ctx.from_queue,
        nav: ctx.nav,
      });
    });
    return () => { cancelled = true; };
  }, [plan]);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  const continueBookQueue = useCallback(() => {
    const next = shiftBookQueue();
    if (!next) return false;
    flash(`Next up: ${next.title}`);
    startIndividualCheckout({
      onNavigate,
      nav: next.nav,
      listingId: next.listingId || null,
      ctx: {
        event_plan_id: next.event_plan_id,
        event_need_id: next.event_need_id,
        title: next.title,
        category: next.category || null,
        from_queue: true,
      },
    });
    return true;
  }, [onNavigate]);

  const markNeedBooked = async (needId, { bookingId, listingTitle, continueQueue = false } = {}) => {
    const payload = { mark_booked: true, status: "booked" };
    if (bookingId != null && String(bookingId).trim() !== "") {
      const n = parseInt(bookingId, 10);
      if (!Number.isNaN(n)) payload.booking_id = n;
      else payload.linked_listing_title = String(bookingId).trim().slice(0, 300);
    }
    if (listingTitle) payload.linked_listing_title = listingTitle;
    try {
      await updateEventNeed(needId, payload);
      clearCheckoutCtx();
      setCheckoutPrompt(null);
      await refresh();
      flash("Marked as booked");
      if (continueQueue) setTimeout(() => { continueBookQueue(); }, 400);
    } catch (e) {
      flash(e?.response?.data?.error || "Could not mark booked");
    }
  };

  const bookNeed = (need) => {
    clearBookQueue(); // single book must not resume an orphaned multi-queue
    const nav = navForNeed(need);
    if (!nav) {
      flash("No shop linked for this need yet");
      return;
    }
    const ok = startIndividualCheckout({
      onNavigate,
      nav,
      listingId: need.linked_listing_id || null,
      ctx: {
        event_plan_id: plan.event_plan_id,
        event_need_id: need.event_need_id,
        title: need.title,
        category: need.category || null,
        from_queue: false,
      },
    });
    if (!ok) flash("Could not open checkout");
  };

  const bookRemainingNeeds = (needsList) => {
    const queue = (needsList || [])
      .filter((n) => n.status !== "booked" && n.status !== "done" && n.status !== "skipped")
      .filter((n) => n.linked_nav !== "registry" && n.category !== "gifts")
      .map((n) => {
        const nav = navForNeed(n);
        if (!nav) return null;
        return {
          event_plan_id: plan.event_plan_id,
          event_need_id: n.event_need_id,
          title: n.title,
          category: n.category || null,
          nav,
          listingId: n.linked_listing_id || null,
        };
      })
      .filter(Boolean);
    if (!queue.length) {
      flash("Nothing left to book");
      return;
    }
    const [first, ...rest] = queue;
    writeBookQueue(rest);
    flash(rest.length ? `Booking 1 of ${queue.length}…` : "Opening checkout…");
    startIndividualCheckout({
      onNavigate,
      nav: first.nav,
      listingId: first.listingId,
      ctx: {
        event_plan_id: first.event_plan_id,
        event_need_id: first.event_need_id,
        title: first.title,
        from_queue: true,
      },
    });
  };

  const leaveDetail = () => {
    clearCheckoutCtx();
    clearBookQueue();
    onBack();
  };

  if (loading) return <p style={{ fontFamily: FONT, color: "rgba(255,255,255,0.4)" }}>Loading planner…</p>;
  if (err || !plan) return <p style={{ fontFamily: FONT, color: "#fca5a5" }}>{err || "Not found"}</p>;

  const needsDone = (plan.needs || []).filter((n) => n.status === "done" || n.status === "booked").length;
  const needsTotal = (plan.needs || []).length || 1;
  const rsvp = plan.rsvp_summary || { accepted: 0, declined: 0, maybe: 0, pending: 0 };
  const bookableNeeds = (plan.needs || []).filter((n) => navForNeed(n) && n.category !== "gifts" && n.linked_nav !== "registry");
  const daysLeft = daysUntil(plan.event_date);
  const deadlineDays = daysUntil(plan.rsvp_deadline);
  const budget = budgetStats(plan);
  const headcount = headcountStats(plan);
  const nextActions = buildNextActions(plan, rsvp);
  const deadlineUrgent = plan.rsvp_deadline && (rsvp.pending || 0) > 0 && deadlineDays != null && deadlineDays <= 7;
  const isOwner = plan.is_owner === true
    || (plan.is_owner == null && Number(plan.owner_id) === Number(getAuthUserId()));
  const collabDetails = plan.collaborator_details?.length
    ? plan.collaborator_details
    : (plan.collaborators || []).map((id) => ({ user_id: id, label: `User #${id}` }));

  const saveRsvpDeadline = async (value) => {
    try {
      await updateEventPlan(plan.event_plan_id, { rsvp_deadline: value || null });
      await refresh();
      flash(value ? "RSVP deadline saved" : "RSVP deadline cleared");
    } catch (e) {
      flash(e?.response?.data?.error || "Could not save deadline");
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "checklist", label: `Needs (${needsDone}/${needsTotal})` },
    { id: "invites", label: `Invites (${plan.guest_list?.length || 0})` },
    { id: "registry", label: `Registry (${plan.registry_items?.length || 0})` },
  ];

  return (
    <div>
      {dialog}
      {markBookedModal && (
        <MarkBookedModal
          title={markBookedModal.title}
          initialId={markBookedModal.initialId || ""}
          onClose={() => setMarkBookedModal(null)}
          onConfirm={async (bookingId) => {
            await markNeedBooked(markBookedModal.needId, {
              bookingId: bookingId || undefined,
              listingTitle: markBookedModal.listingTitle,
              continueQueue: !!markBookedModal.continueQueue,
            });
            setMarkBookedModal(null);
          }}
        />
      )}
      {fundModal?.need && (
        <FundGoalModal
          title={fundModal.need.title}
          initialAmount={String(fundModal.need.target_budget || 200)}
          onClose={() => setFundModal(null)}
          onConfirm={async (price) => {
            const need = fundModal.need;
            try {
              await addRegistryItem(plan.event_plan_id, {
                title: `${need.title} fund`,
                description: `Help cover ${need.title.toLowerCase()} for ${plan.title}`,
                price,
                item_type: "custom",
              });
              if (need.target_budget == null) {
                await updateEventNeed(need.event_need_id, {
                  target_budget: price,
                  status: need.status === "todo" ? "sourcing" : need.status,
                });
              }
              await refresh();
              setFundModal(null);
              setTab("registry");
              flash(`Added "${need.title} fund" to registry`);
            } catch (e) {
              flash(e?.response?.data?.error || "Could not add fund");
              throw e;
            }
          }}
        />
      )}
      {editPlanOpen && plan && (
        <EditPlanModal
          plan={plan}
          occasions={OCCASIONS}
          vibes={VIBES}
          onClose={() => setEditPlanOpen(false)}
          onSave={async (payload) => {
            await updateEventPlan(plan.event_plan_id, payload);
            await refresh();
            flash("Event updated");
          }}
        />
      )}
      {editGuest && (
        <EditGuestModal
          guest={editGuest}
          onClose={() => setEditGuest(null)}
          onSave={async (payload) => {
            await updateEventGuest(editGuest.event_guest_id, payload);
            await refresh();
            flash("Guest updated");
          }}
        />
      )}
      {editNeedBudget && (
        <EditNeedBudgetModal
          need={editNeedBudget}
          onClose={() => setEditNeedBudget(null)}
          onSave={async (amount) => {
            if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
              throw new Error("Enter a valid amount");
            }
            await updateEventNeed(editNeedBudget.event_need_id, { target_budget: amount });
            await refresh();
            flash("Need budget updated");
          }}
        />
      )}
      {coPlannerOpen && (
        <CoPlannerModal
          onClose={() => setCoPlannerOpen(false)}
          isOwner={isOwner}
          collaborators={collabDetails}
          onAdd={async (email) => {
            await addEventCollaborator(plan.event_plan_id, email);
            await refresh();
            flash("Co-planner added");
          }}
          onRemove={async (userId) => {
            await removeEventCollaborator(plan.event_plan_id, userId);
            await refresh();
            flash("Co-planner removed");
          }}
        />
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <GhostBtn onClick={leaveDetail}>← My events</GhostBtn>
        {toast && <span style={{ fontFamily: FONT, fontSize: 12, color: "#4ade80" }}>{toast}</span>}
      </div>

      {checkoutPrompt && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 14,
            border: "1px solid rgba(249,115,22,0.45)",
            background: "rgba(249,115,22,0.1)",
            padding: 14,
          }}
        >
          <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
            Back from checkout — {checkoutPrompt.title}
          </div>
          <p style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 12px" }}>
            {checkoutPrompt.detecting
              ? (checkoutPrompt.nav === "catering" || checkoutPrompt.nav === "floral"
                ? "Shop checkout done? Mark booked when your order is placed (auto-detect is for venue/décor bookings)."
                : "Checking for a recent booking…")
              : checkoutPrompt.suggestedBookingId
                ? `Detected booking #${checkoutPrompt.suggestedBookingId}${checkoutPrompt.suggestedTitle ? ` (${checkoutPrompt.suggestedTitle})` : ""}. Confirm to link it.`
                : "If you finished booking this item, mark it booked so your planner stays in sync."}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PrimaryBtn
              onClick={async () => {
                if (checkoutPrompt.suggestedBookingId) {
                  await markNeedBooked(checkoutPrompt.needId, {
                    bookingId: checkoutPrompt.suggestedBookingId,
                    listingTitle: checkoutPrompt.suggestedTitle,
                    continueQueue: !!checkoutPrompt.fromQueue,
                  });
                  return;
                }
                setMarkBookedModal({
                  needId: checkoutPrompt.needId,
                  title: checkoutPrompt.title,
                  initialId: "",
                  continueQueue: !!checkoutPrompt.fromQueue,
                });
              }}
            >
              {checkoutPrompt.suggestedBookingId ? "Confirm & mark booked" : "Mark booked"}
            </PrimaryBtn>
            {checkoutPrompt.suggestedBookingId && (
              <GhostBtn
                onClick={() => {
                  setMarkBookedModal({
                    needId: checkoutPrompt.needId,
                    title: checkoutPrompt.title,
                    initialId: String(checkoutPrompt.suggestedBookingId),
                    continueQueue: !!checkoutPrompt.fromQueue,
                    listingTitle: checkoutPrompt.suggestedTitle,
                  });
                }}
              >
                Edit ID
              </GhostBtn>
            )}
            <GhostBtn
              onClick={() => {
                clearCheckoutCtx();
                setCheckoutPrompt(null);
                if (checkoutPrompt.fromQueue) {
                  setTimeout(() => {
                    if (!continueBookQueue()) flash("OK — finish this one later");
                  }, 100);
                } else {
                  flash("OK — finish this one later");
                }
              }}
            >
              Skip / later
            </GhostBtn>
            <GhostBtn
              onClick={() => {
                clearCheckoutCtx();
                clearBookQueue();
                setCheckoutPrompt(null);
              }}
            >
              Stop queue
            </GhostBtn>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>{plan.title}</h1>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
            {occasionLabel(plan.occasion)} · {formatDate(plan.event_date)} · {plan.city || "City TBD"} · {plan.guests || "?"} guests
            {plan.status ? ` · ${plan.status}` : ""}
          </p>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 999,
                padding: "6px 12px",
                background: daysLeft != null && daysLeft <= 7 ? "rgba(249,115,22,0.18)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${daysLeft != null && daysLeft <= 7 ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: daysLeft != null && daysLeft <= 7 ? ACCENT : "#fff" }}>
                {countdownLabel(daysLeft)}
              </span>
              {plan.rsvp_deadline && (
                <span style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                  · RSVP by {formatDate(plan.rsvp_deadline)}
                </span>
              )}
            </div>
            <GhostBtn onClick={() => setEditPlanOpen(true)} style={{ fontSize: 12, padding: "6px 12px" }}>Edit event</GhostBtn>
            <GhostBtn onClick={() => setCoPlannerOpen(true)} style={{ fontSize: 12, padding: "6px 12px" }}>
              {isOwner ? "Co-planners" : "View co-planners"}
            </GhostBtn>
            {!isOwner && (
              <span style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)", alignSelf: "center" }}>
                Co-planner access
              </span>
            )}
          </div>
        </div>
        <InviteCard event={{ ...plan, host_name: "You" }} compact />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 12 }}>
        {tabs.map((t) => (
          <Chip key={t.id} selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gap: 14 }}>
          {deadlineUrgent && (
            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(249,115,22,0.5)",
                background: "rgba(249,115,22,0.12)",
                padding: 14,
              }}
            >
              <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                {deadlineDays < 0
                  ? `RSVP deadline passed · ${rsvp.pending} still awaiting`
                  : deadlineDays === 0
                    ? `RSVP deadline is today · ${rsvp.pending} awaiting`
                    : `${deadlineDays} day${deadlineDays === 1 ? "" : "s"} until RSVP deadline · ${rsvp.pending} awaiting`}
              </div>
              <p style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 10px" }}>
                Nudge guests on WhatsApp or email from the Invites tab.
              </p>
              <PrimaryBtn onClick={() => setTab("invites")} style={{ fontSize: 12, padding: "8px 14px" }}>
                Open invites
              </PrimaryBtn>
            </div>
          )}

          {nextActions.length > 0 && (
            <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: 16, background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Next up</div>
              <div style={{ display: "grid", gap: 10 }}>
                {nextActions.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff" }}>{a.title}</div>
                      <div style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{a.body}</div>
                    </div>
                    <PrimaryBtn
                      style={{ fontSize: 12, padding: "8px 12px" }}
                      onClick={() => {
                        if (a.kind === "book" && a.needId) {
                          const need = (plan.needs || []).find((n) => n.event_need_id === a.needId);
                          if (need) bookNeed(need);
                          else setTab("checklist");
                          return;
                        }
                        setTab(a.tab);
                      }}
                    >
                      {a.kind === "book" ? "Book" : "Go"}
                    </PrimaryBtn>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {[
              { label: "Countdown", value: countdownLabel(daysLeft) },
              { label: "RSVP yes", value: String(rsvp.accepted) },
              { label: "Awaiting", value: String(rsvp.pending) },
              { label: "Needs done", value: `${needsDone}/${plan.needs?.length || 0}` },
            ].map((s) => (
              <div key={s.label} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", padding: 14, background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{s.label}</div>
                <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, color: "#fff", marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
          </div>

          <TimelineCard plan={plan} onGo={setTab} />

          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: 16, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff" }}>Budget</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: budget.over ? "#fca5a5" : "rgba(255,255,255,0.5)" }}>
                {budget.budget > 0 ? `${money(budget.bookedSpend)} booked of ${money(budget.budget)}` : "Set a budget when you create / edit the event"}
              </div>
            </div>
            {budget.budget > 0 && (
              <>
                <ProgressBar pct={budget.pct} color={budget.over ? "#ef4444" : ACCENT} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 12 }}>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Booked / done</div>
                    <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#fff" }}>{money(budget.bookedSpend)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Planned (needs)</div>
                    <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#fff" }}>{money(budget.planned)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Remaining</div>
                    <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: budget.over ? "#fca5a5" : "#4ade80" }}>
                      {budget.remaining != null ? money(budget.remaining) : "—"}
                    </div>
                  </div>
                </div>
                <p style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "10px 0 0" }}>
                  Booked totals use each need’s target amount when marked booked. Add target budgets on Needs for accuracy.
                </p>
              </>
            )}
          </div>

          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: 16, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Guest headcount</div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
              <strong style={{ color: "#fff" }}>{headcount.yes}</strong> confirmed
              {headcount.maybe ? <> · <strong style={{ color: "#fff" }}>{headcount.maybe}</strong> maybe</> : null}
              {headcount.expected != null ? <> · planning for <strong style={{ color: "#fff" }}>{headcount.expected}</strong></> : null}
              {" "}· {headcount.listed} on list
            </div>
            {headcount.expected != null && headcount.yes > headcount.expected && (
              <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "8px 0 0" }}>
                Confirmed guests exceed your planned headcount — check venue capacity.
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PrimaryBtn onClick={() => setTab("checklist")} style={{ fontSize: 12, padding: "10px 14px" }}>Manage needs</PrimaryBtn>
            <PrimaryBtn onClick={() => setTab("invites")} style={{ fontSize: 12, padding: "10px 14px", background: "#7c3aed" }}>Invitations & RSVP</PrimaryBtn>
            <PrimaryBtn onClick={() => setTab("registry")} style={{ fontSize: 12, padding: "10px 14px", background: "#059669" }}>Gift / contribution registry</PrimaryBtn>
          </div>
          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: 16, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Share with guests</div>
            <p style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 0 10px" }}>
              Public page — invitation look + contribution registry (pitch in like a wishlist):
            </p>
            <code style={{ fontFamily: FONT, fontSize: 12, color: ACCENT, wordBreak: "break-all" }}>{shareUrl(plan.share_token)}</code>
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <GhostBtn
                onClick={async () => {
                  const ok = await copyText(shareUrl(plan.share_token));
                  flash(ok ? "Share link copied" : "Could not copy — select the link manually");
                }}
              >
                Copy share link
              </GhostBtn>
              <GhostBtn
                onClick={() => {
                  openWhatsApp(
                    `You're invited to ${plan.title}!\n${formatDate(plan.event_date)}${plan.city ? ` · ${plan.city}` : ""}\n\nDetails & registry:\n${shareUrl(plan.share_token)}`,
                  );
                }}
                style={{ color: "#25D366", borderColor: "rgba(37,211,102,0.35)" }}
              >
                WhatsApp share
              </GhostBtn>
              <GhostBtn
                onClick={() => {
                  window.open(shareUrl(plan.share_token), "_blank", "noopener,noreferrer");
                }}
              >
                Preview guest page
              </GhostBtn>
            </div>
          </div>
          {bookableNeeds.length > 0 && (
            <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: 16, background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Checkout</div>
              <p style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 0 12px" }}>
                Book each need in its Strug vertical, or run Book remaining to walk through them one after another.
              </p>
              <div style={{ marginBottom: 12 }}>
                <PrimaryBtn onClick={() => bookRemainingNeeds(bookableNeeds)} style={{ fontSize: 12, padding: "8px 14px" }}>
                  Book remaining ({bookableNeeds.filter((n) => n.status !== "booked" && n.status !== "done" && n.status !== "skipped").length})
                </PrimaryBtn>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {bookableNeeds.map((need) => {
                  const booked = need.status === "booked" || need.status === "done";
                  return (
                    <div key={need.event_need_id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#fff" }}>{need.title}</div>
                        <div style={{ fontFamily: FONT, fontSize: 11, color: booked ? "#4ade80" : "rgba(255,255,255,0.4)", textTransform: "capitalize" }}>
                          {need.status}{need.booking_id ? ` · booking #${need.booking_id}` : ""}{need.linked_listing_title ? ` · ${need.linked_listing_title}` : ""}
                          {need.target_budget != null ? ` · ${money(need.target_budget)}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {!booked && (
                          <PrimaryBtn onClick={() => bookNeed(need)} style={{ fontSize: 12, padding: "8px 12px" }}>
                            Book
                          </PrimaryBtn>
                        )}
                        {!booked && (
                          <GhostBtn
                            onClick={() => {
                              setMarkBookedModal({
                                needId: need.event_need_id,
                                title: need.title,
                              });
                            }}
                            style={{ fontSize: 12, padding: "8px 12px" }}
                          >
                            Mark booked
                          </GhostBtn>
                        )}
                        {booked && (
                          <GhostBtn onClick={() => bookNeed(need)} style={{ fontSize: 12, padding: "8px 12px" }}>
                            Open again
                          </GhostBtn>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {plan.package_json?.items && (
            <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: 16, background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Planning template</div>
              {plan.package_json.items.map((item) => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
                    {VERTICAL_META[item.key]?.label}
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{item.hint || "Add a real listing"}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {Object.values(VERTICAL_META).map((m) => (
                  <GhostBtn key={m.nav} onClick={() => onNavigate?.(m.nav)} style={{ fontSize: 12, padding: "8px 10px" }}>
                    Open {m.label}
                  </GhostBtn>
                ))}
              </div>
            </div>
          )}
          {isOwner && (
          <GhostBtn
            onClick={async () => {
              if (!(await confirm({
                title: "Cancel this event?",
                message: "Guests won’t be able to RSVP. You can still view it in your history as cancelled.",
                confirmLabel: "Cancel event",
                danger: true,
              }))) return;
              try {
                await deleteEventPlan(plan.event_plan_id);
                leaveDetail();
              } catch (e) {
                flash(e?.response?.data?.error || "Could not cancel event");
              }
            }}
            style={{ color: "#fca5a5", borderColor: "rgba(248,113,113,0.3)", alignSelf: "start" }}
          >
            Cancel event
          </GhostBtn>
          )}
        </div>
      )}

      {tab === "checklist" && (
        <div>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 14px" }}>
            Plan each need, then book individually on Strug (venue, catering, floral, etc.). Use Fund/chip-in when guests should contribute instead.
          </p>
          {bookableNeeds.some((n) => n.status !== "booked" && n.status !== "done") && (
            <div style={{ marginBottom: 14 }}>
              <PrimaryBtn onClick={() => bookRemainingNeeds(bookableNeeds)} style={{ fontSize: 12, padding: "8px 14px" }}>
                Book remaining
              </PrimaryBtn>
            </div>
          )}
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {(plan.needs || []).map((need) => {
              const st = NEED_STATUS.find((s) => s.id === need.status) || NEED_STATUS[0];
              const isRegistry = need.linked_nav === "registry" || need.category === "gifts";
              const nav = navForNeed(need);
              const booked = need.status === "booked" || need.status === "done";
              return (
                <div key={need.event_need_id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", padding: "12px 14px", background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#fff" }}>{need.title}</div>
                    <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "capitalize" }}>
                      {need.category}
                      {need.target_budget != null ? ` · budget ${money(need.target_budget)}` : ""}
                      {need.booking_id ? ` · booking #${need.booking_id}` : ""}
                      {need.linked_listing_title ? ` · ${need.linked_listing_title}` : ""}
                    </div>
                  </div>
                  <select
                    value={need.status}
                    onChange={async (e) => {
                      try {
                        await updateEventNeed(need.event_need_id, { status: e.target.value });
                        await refresh();
                      } catch (err) {
                        flash(err?.response?.data?.error || "Could not update status");
                      }
                    }}
                    style={{ ...inputStyle(), width: "auto", padding: "8px 10px", fontSize: 12, color: st.color }}
                  >
                    {NEED_STATUS.map((s) => (
                      <option key={s.id} value={s.id} style={{ color: "#111" }}>{s.label}</option>
                    ))}
                  </select>
                  {isRegistry ? (
                    <GhostBtn onClick={() => setTab("registry")} style={{ fontSize: 12, padding: "8px 10px", color: "#4ade80", borderColor: "rgba(74,222,128,0.35)" }}>
                      Open registry
                    </GhostBtn>
                  ) : nav ? (
                    <PrimaryBtn onClick={() => bookNeed(need)} style={{ fontSize: 12, padding: "8px 12px" }}>
                      {booked ? "Open shop" : "Book"}
                    </PrimaryBtn>
                  ) : null}
                  {!isRegistry && !booked && (
                    <GhostBtn
                      onClick={() => {
                        setMarkBookedModal({
                          needId: need.event_need_id,
                          title: need.title,
                        });
                      }}
                      style={{ fontSize: 12, padding: "8px 10px" }}
                    >
                      Mark booked
                    </GhostBtn>
                  )}
                  {!isRegistry && (
                    <GhostBtn
                      onClick={() => setEditNeedBudget(need)}
                      style={{ fontSize: 12, padding: "8px 10px" }}
                    >
                      Set budget
                    </GhostBtn>
                  )}
                  {!isRegistry && (
                    <GhostBtn
                      onClick={() => setFundModal({ need })}
                      style={{ fontSize: 12, padding: "8px 10px", color: ACCENT, borderColor: "rgba(249,115,22,0.4)" }}
                    >
                      Fund / chip-in
                    </GhostBtn>
                  )}
                  <GhostBtn
                    onClick={async () => {
                      if (!(await confirm({
                        title: `Remove “${need.title}”?`,
                        message: "This need will be deleted from your checklist.",
                        confirmLabel: "Remove",
                        danger: true,
                      }))) return;
                      try {
                        await deleteEventNeed(need.event_need_id);
                        await refresh();
                      } catch (e) {
                        flash(e?.response?.data?.error || "Could not delete need");
                      }
                    }}
                    style={{ fontSize: 12, padding: "8px 10px", color: "#fca5a5" }}
                  >
                    ×
                  </GhostBtn>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={needTitle} onChange={(e) => setNeedTitle(e.target.value)} placeholder="Add custom need…" style={{ ...inputStyle(), flex: 1, minWidth: 160 }} />
            <PrimaryBtn
              onClick={async () => {
                if (!needTitle.trim()) return;
                try {
                  await addEventNeed(plan.event_plan_id, {
                    title: needTitle.trim(),
                    category: "custom",
                    linked_nav: "ondemand",
                  });
                  setNeedTitle("");
                  await refresh();
                } catch (e) {
                  flash(e?.response?.data?.error || "Could not add need");
                }
              }}
            >
              Add need
            </PrimaryBtn>
          </div>
        </div>
      )}

      {tab === "invites" && (
        <div>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Pick a design, add guests, then share personal links. Each invite shows your card, RSVP, and the contribution registry guests can chip into.
          </p>
          <div style={{ marginBottom: 18 }}>
            <FieldLabel>Invitation design</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {INVITE_THEMES.map((t) => (
                <Chip
                  key={t.id}
                  selected={plan.invite_theme === t.id}
                  onClick={async () => {
                    try {
                      await updateEventPlan(plan.event_plan_id, { invite_theme: t.id });
                      await refresh();
                    } catch (e) {
                      flash(e?.response?.data?.error || "Could not update theme");
                    }
                  }}
                >
                  {t.label}
                </Chip>
              ))}
            </div>
            <FieldLabel>Invite message</FieldLabel>
            <textarea
              value={inviteMessage}
              rows={2}
              style={{ ...inputStyle(), marginBottom: 8, resize: "vertical" }}
              onChange={(e) => setInviteMessage(e.target.value)}
              onBlur={async () => {
                if (inviteMessage !== (plan.invite_message || "")) {
                  try {
                    await updateEventPlan(plan.event_plan_id, { invite_message: inviteMessage });
                    await refresh();
                    flash("Message saved");
                  } catch (e) {
                    flash(e?.response?.data?.error || "Could not save message");
                  }
                }
              }}
              placeholder="A short note on the invitation…"
            />
            <FieldLabel>RSVP deadline</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <DateField
                value={rsvpDeadline}
                onChange={(e) => setRsvpDeadline(e.target.value)}
                style={{ ...inputStyle(), maxWidth: 220, marginBottom: 0 }}
              />
              <PrimaryBtn
                style={{ fontSize: 12, padding: "8px 12px" }}
                onClick={() => saveRsvpDeadline(rsvpDeadline || null)}
              >
                Save deadline
              </PrimaryBtn>
              {plan.rsvp_deadline && (
                <GhostBtn style={{ fontSize: 12, padding: "8px 12px" }} onClick={() => { setRsvpDeadline(""); saveRsvpDeadline(null); }}>
                  Clear
                </GhostBtn>
              )}
            </div>
            <p style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 16px" }}>
              Shown on guest invites. Overview warns you when the deadline is within 7 days and RSVPs are still pending.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 16 }}>
            <div>
              <FieldLabel>Guest name</FieldLabel>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} style={inputStyle()} placeholder="Jordan Lee" />
            </div>
            <div>
              <FieldLabel>Email (optional)</FieldLabel>
              <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} style={inputStyle()} placeholder="jordan@email.com" />
            </div>
            <div>
              <FieldLabel>Phone (optional)</FieldLabel>
              <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} style={inputStyle()} placeholder="+1…" />
            </div>
          </div>
          <PrimaryBtn
            onClick={async () => {
              if (!guestName.trim()) {
                flash("Guest name required");
                return;
              }
              try {
                await addEventGuest(plan.event_plan_id, {
                  name: guestName.trim(),
                  email: guestEmail.trim() || null,
                  phone: guestPhone.trim() || null,
                });
                setGuestName("");
                setGuestEmail("");
                setGuestPhone("");
                await refresh();
                flash("Guest added");
              } catch (e) {
                flash(e?.response?.data?.error || "Could not add guest");
              }
            }}
            style={{ marginBottom: 16 }}
          >
            Add guest
          </PrimaryBtn>

          <FieldLabel>Bulk add (paste names — optional email / phone)</FieldLabel>
          <textarea
            value={bulkNames}
            onChange={(e) => setBulkNames(e.target.value)}
            rows={4}
            style={{ ...inputStyle(), marginBottom: 8, resize: "vertical" }}
            placeholder={"Alex\nSam, sam@email.com\nTaylor, taylor@email.com, +15551234567\nJordan Lee <jordan@email.com>"}
          />
          <GhostBtn
            onClick={async () => {
              const guests = parseGuestLines(bulkNames);
              if (!guests.length) return;
              try {
                const res = await bulkAddEventGuests(plan.event_plan_id, guests);
                setBulkNames("");
                await refresh();
                const added = res?.added ?? guests.length;
                const skipped = res?.skipped ?? 0;
                flash(skipped ? `Added ${added}, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : `Added ${added} guest${added === 1 ? "" : "s"}`);
              } catch (e) {
                flash(e?.response?.data?.error || "Could not add guests");
              }
            }}
            style={{ marginBottom: 18 }}
          >
            Add all
          </GhostBtn>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <PrimaryBtn
              onClick={async () => {
                try {
                  await markGuestsInvited(plan.event_plan_id);
                  await refresh();
                  flash("Marked pending guests as invited");
                } catch (e) {
                  flash(e?.response?.data?.error || "Could not mark invited");
                }
              }}
            >
              Mark all as invited
            </PrimaryBtn>
            <GhostBtn
              onClick={async () => {
                const withEmail = (plan.guest_list || []).filter((g) => g.email?.trim());
                if (!withEmail.length) {
                  flash("Add guest emails first");
                  return;
                }
                let sent = 0;
                let failed = 0;
                for (const g of withEmail) {
                  try {
                    await sendGuestInviteEmail(g.event_guest_id);
                    sent += 1;
                  } catch {
                    failed += 1;
                  }
                }
                await refresh();
                flash(failed ? `Sent ${sent}, ${failed} failed (use Email invite)` : `Sent ${sent} invite email${sent === 1 ? "" : "s"}`);
              }}
            >
              Send all emails
            </GhostBtn>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {(plan.guest_list || []).map((g) => {
              const link = inviteUrl(g.invite_token);
              const waText = inviteMessageText(plan, g.name, link);
              const mailSubject = encodeURIComponent(`You're invited: ${plan.title}`);
              const mailBody = encodeURIComponent(waText);
              return (
                <div key={g.event_guest_id} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", padding: 12, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#fff" }}>{g.name}</div>
                      <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "capitalize" }}>
                        {g.status}{g.plus_ones ? ` · +${g.plus_ones}` : ""}{g.email ? ` · ${g.email}` : ""}{g.phone ? ` · ${g.phone}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", position: "relative" }}>
                      <GhostBtn
                        style={{ fontSize: 11, padding: "6px 10px" }}
                        onClick={() => setEditGuest(g)}
                      >
                        Edit
                      </GhostBtn>
                      <GhostBtn
                        style={{ fontSize: 11, padding: "6px 10px" }}
                        onClick={async () => {
                          try {
                            const ok = await copyText(link);
                            await updateEventGuest(g.event_guest_id, { mark_invited: true });
                            await refresh();
                            flash(ok ? "Invite link copied" : "Invite marked — copy failed, use Preview");
                          } catch (e) {
                            flash(e?.response?.data?.error || "Could not copy invite");
                          }
                        }}
                      >
                        Copy invite
                      </GhostBtn>
                      <GhostBtn
                        style={{ fontSize: 11, padding: "6px 10px", color: "#25D366", borderColor: "rgba(37,211,102,0.35)" }}
                        onClick={async () => {
                          try {
                            await updateEventGuest(g.event_guest_id, { mark_invited: true });
                            await refresh();
                          } catch { /* still open WA */ }
                          openWhatsApp(waText, g.phone);
                        }}
                      >
                        WhatsApp
                      </GhostBtn>
                      {!isMobile && (
                        <>
                          <GhostBtn
                            style={{ fontSize: 11, padding: "6px 10px" }}
                            onClick={async () => {
                              try {
                                await updateEventGuest(g.event_guest_id, { mark_invited: true });
                                await refresh();
                                window.open(link, "_blank", "noopener,noreferrer");
                              } catch (e) {
                                flash(e?.response?.data?.error || "Could not open invite");
                              }
                            }}
                          >
                            Preview
                          </GhostBtn>
                          <a
                            href={g.email ? `mailto:${g.email}?subject=${mailSubject}&body=${mailBody}` : undefined}
                            onClick={async (e) => {
                              if (!g.email) {
                                e.preventDefault();
                                flash("Add an email on this guest first");
                                return;
                              }
                              try {
                                await updateEventGuest(g.event_guest_id, { mark_invited: true });
                              } catch { /* still allow mailto */ }
                            }}
                            style={{
                              fontFamily: FONT,
                              fontSize: 11,
                              fontWeight: 600,
                              color: g.email ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)",
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 12,
                              padding: "6px 10px",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              cursor: g.email ? "pointer" : "default",
                            }}
                          >
                            Mailto
                          </a>
                          <GhostBtn
                            style={{ fontSize: 11, padding: "6px 10px", color: g.email ? ACCENT : "rgba(255,255,255,0.35)", borderColor: g.email ? "rgba(249,115,22,0.35)" : undefined }}
                            onClick={async () => {
                              if (!g.email) {
                                flash("Add an email on this guest first");
                                return;
                              }
                              try {
                                await sendGuestInviteEmail(g.event_guest_id);
                                await refresh();
                                flash("Invite email sent");
                              } catch (e) {
                                flash(e?.response?.data?.error || "Email failed — try Mailto");
                              }
                            }}
                          >
                            Send email
                          </GhostBtn>
                        </>
                      )}
                      {isMobile && (
                        <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                          <GhostBtn
                            style={{ fontSize: 11, padding: "6px 10px" }}
                            onClick={() => setGuestMenuId(guestMenuId === g.event_guest_id ? null : g.event_guest_id)}
                          >
                            More
                          </GhostBtn>
                          {guestMenuId === g.event_guest_id && (
                            <div
                              style={{
                                position: "absolute",
                                right: 0,
                                top: "110%",
                                zIndex: 20,
                                minWidth: 150,
                                background: "#1a1a1f",
                                border: "1px solid rgba(255,255,255,0.14)",
                                borderRadius: 12,
                                padding: 6,
                                display: "grid",
                                gap: 4,
                                boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
                              }}
                            >
                              {[
                                {
                                  label: "Preview",
                                  run: async () => {
                                    await updateEventGuest(g.event_guest_id, { mark_invited: true });
                                    await refresh();
                                    window.open(link, "_blank", "noopener,noreferrer");
                                  },
                                },
                                {
                                  label: "Mailto",
                                  run: async () => {
                                    if (!g.email) { flash("Add an email on this guest first"); return; }
                                    try { await updateEventGuest(g.event_guest_id, { mark_invited: true }); } catch { /* ignore */ }
                                    window.location.href = `mailto:${g.email}?subject=${mailSubject}&body=${mailBody}`;
                                  },
                                },
                                {
                                  label: "Send email",
                                  run: async () => {
                                    if (!g.email) { flash("Add an email on this guest first"); return; }
                                    await sendGuestInviteEmail(g.event_guest_id);
                                    await refresh();
                                    flash("Invite email sent");
                                  },
                                },
                              ].map((action) => (
                                <button
                                  key={action.label}
                                  type="button"
                                  onClick={async () => {
                                    setGuestMenuId(null);
                                    try {
                                      await action.run();
                                    } catch (e) {
                                      flash(e?.response?.data?.error || `${action.label} failed`);
                                    }
                                  }}
                                  style={{
                                    fontFamily: FONT, fontSize: 12, fontWeight: 600, textAlign: "left",
                                    color: "#fff", background: "transparent", border: "none",
                                    padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                                  }}
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <GhostBtn
                        style={{ fontSize: 11, padding: "6px 10px", color: "#fca5a5" }}
                        onClick={async () => {
                          if (!(await confirm({
                            title: `Remove ${g.name}?`,
                            message: "Their invite link will stop working.",
                            confirmLabel: "Remove",
                            danger: true,
                          }))) return;
                          try {
                            await deleteEventGuest(g.event_guest_id);
                            await refresh();
                          } catch (e) {
                            flash(e?.response?.data?.error || "Could not remove guest");
                          }
                        }}
                      >
                        Remove
                      </GhostBtn>
                    </div>
                  </div>
                  {g.rsvp_note && (
                    <p style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "8px 0 0", fontStyle: "italic" }}>“{g.rsvp_note}”</p>
                  )}
                </div>
              );
            })}
            {!plan.guest_list?.length && (
              <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                No guests yet — add people, then share their personal invite (design + RSVP + contribution registry).
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "registry" && (
        <div>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 14px" }}>
            Contribution wishlist — guests pitch in from their wallet toward gifts or event costs (same model as Strug wishlist).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
            <input value={regTitle} onChange={(e) => setRegTitle(e.target.value)} placeholder="Item title (e.g. Cake fund)" style={inputStyle()} />
            <input type="number" min={1} value={regPrice} onChange={(e) => setRegPrice(e.target.value)} placeholder="Goal CAD" style={inputStyle()} />
          </div>
          <input value={regDesc} onChange={(e) => setRegDesc(e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle(), marginBottom: 10 }} />
          <PrimaryBtn
            style={{ marginBottom: 18 }}
            onClick={async () => {
              if (!regTitle.trim() || !regPrice) {
                flash("Title and goal amount required");
                return;
              }
              const price = Number(regPrice);
              if (!price || price <= 0) {
                flash("Enter a valid goal amount");
                return;
              }
              try {
                await addRegistryItem(plan.event_plan_id, {
                  title: regTitle.trim(),
                  price,
                  description: regDesc.trim() || null,
                  item_type: "custom",
                });
                setRegTitle("");
                setRegPrice("");
                setRegDesc("");
                await refresh();
                flash("Registry item added");
              } catch (e) {
                flash(e?.response?.data?.error || "Could not add registry item");
              }
            }}
          >
            Add registry item
          </PrimaryBtn>
          <RegistryList items={plan.registry_items} isOwner accessTokens={{ share_token: plan.share_token }} onRefresh={refresh} onNavigate={onNavigate} onConfirm={confirm} />
        </div>
      )}
    </div>
  );
}

export function EventConciergePage({ onNavigate }) {
  const { isMobile } = useViewport();
  const [view, setView] = useState("hub"); // hub | create | detail | invite | share
  const [plans, setPlans] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [inviteToken, setInviteToken] = useState(null);
  const [shareToken, setShareToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  const pad = isMobile ? 16 : 108;

  const detectDeepLink = useCallback(() => {
    const path = window.location.pathname || "";
    const inviteMatch = path.match(/^\/invite\/([^/]+)/i);
    const shareMatch = path.match(/^\/event-share\/([^/]+)/i);
    const planMatch = path.match(/^\/concierge\/(\d+)/i);
    if (inviteMatch?.[1]) {
      setInviteToken(inviteMatch[1]);
      setView("invite");
      return true;
    }
    if (shareMatch?.[1]) {
      setShareToken(shareMatch[1]);
      setView("share");
      return true;
    }
    if (planMatch?.[1] && isAuthenticated()) {
      setSelectedId(Number(planMatch[1]));
      setView("detail");
      return true;
    }
    return false;
  }, []);

  const loadPlans = useCallback(async () => {
    if (!isAuthenticated()) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadErr("");
    try {
      const list = await listEventPlans();
      setPlans(Array.isArray(list) ? list : []);
    } catch {
      setLoadErr("Could not load your events");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const goHub = () => {
      setView("hub");
      setInviteToken(null);
      setShareToken(null);
      setSelectedId(null);
      loadPlans();
    };

    const onConciergeOpen = () => {
      // Fired AFTER navigateTo pushState → path should be /concierge (not /invite/…)
      setInviteToken(null);
      setShareToken(null);
      const ctx = readCheckoutCtx();
      if (ctx?.event_plan_id && isAuthenticated()) {
        setSelectedId(Number(ctx.event_plan_id));
        setView("detail");
        return;
      }
      setSelectedId(null);
      setView("hub");
      loadPlans();
    };

    const onPop = () => {
      if (!detectDeepLink()) goHub();
    };

    window.addEventListener("popstate", onPop);
    window.addEventListener("strug:concierge-open", onConciergeOpen);

    if (detectDeepLink()) {
      setLoading(false);
      return () => {
        window.removeEventListener("popstate", onPop);
        window.removeEventListener("strug:concierge-open", onConciergeOpen);
      };
    }

    const ctx = readCheckoutCtx();
    if (ctx?.event_plan_id && isAuthenticated()) {
      setSelectedId(Number(ctx.event_plan_id));
      setView("detail");
      setLoading(false);
      return () => {
        window.removeEventListener("popstate", onPop);
        window.removeEventListener("strug:concierge-open", onConciergeOpen);
      };
    }

    loadPlans();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("strug:concierge-open", onConciergeOpen);
    };
  }, [detectDeepLink, loadPlans]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        paddingLeft: pad,
        paddingRight: isMobile ? 16 : 48,
        paddingTop: isMobile ? 16 : 28,
        paddingBottom: 80,
      }}
    >
      <style>{`
        /* Native glyph stays invisible; DateField shows a white calendar button instead */
        .ec-date-input::-webkit-calendar-picker-indicator {
          opacity: 0;
          pointer-events: none;
          width: 0;
          height: 0;
        }
        .ec-date-input::-webkit-datetime-edit,
        .ec-date-input::-webkit-datetime-edit-fields-wrapper,
        .ec-date-input::-webkit-datetime-edit-text,
        .ec-date-input::-webkit-datetime-edit-month-field,
        .ec-date-input::-webkit-datetime-edit-day-field,
        .ec-date-input::-webkit-datetime-edit-year-field {
          color: #fff;
        }
        .ec-date-input:focus {
          border-color: rgba(249, 115, 22, 0.55);
        }
      `}</style>
      <div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
        {view !== "invite" && view !== "share" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ color: ACCENT }}><EventsIcon s={22} /></div>
            <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: ACCENT, letterSpacing: 0.3 }}>
              EVENT CONCIERGE
            </span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Personal event planner</span>
          </div>
        )}

        {view === "invite" && inviteToken && <PublicInviteView token={inviteToken} onNavigate={onNavigate} />}
        {view === "share" && shareToken && <PublicShareView shareToken={shareToken} onNavigate={onNavigate} />}

        {view === "create" && (
          <CreateWizard
            onCancel={() => setView("hub")}
            onCreated={(plan) => {
              setSelectedId(plan.event_plan_id);
              setView("detail");
              loadPlans();
              try {
                window.history.pushState({ nav: "concierge" }, "", `/concierge/${plan.event_plan_id}`);
              } catch { /* ignore */ }
            }}
          />
        )}

        {view === "detail" && selectedId && (
          <EventDetail
            planId={selectedId}
            onBack={() => {
              setSelectedId(null);
              setView("hub");
              try { window.history.pushState({ nav: "concierge" }, "", "/concierge"); } catch { /* ignore */ }
              loadPlans();
            }}
            onNavigate={onNavigate}
          />
        )}

        {view === "hub" && (
          <div>
            <h1 style={{ fontFamily: FONT, fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: ACCENT, display: "inline-flex" }}><ConciergeIcon s={28} /></span>
              Your event planner
            </h1>
            <p style={{ fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "0 0 22px", maxWidth: 540, lineHeight: 1.5 }}>
              Manage venue, vendors, invitations & RSVPs, and a contribution registry — all in one place.
            </p>

            <PrimaryBtn
              onClick={() => {
                if (!isAuthenticated()) {
                  setLoadErr("Sign in to create an event");
                  return;
                }
                setView("create");
              }}
              style={{ marginBottom: 24 }}
            >
              + Plan a new event
            </PrimaryBtn>

            {loading && <p style={{ fontFamily: FONT, color: "rgba(255,255,255,0.4)" }}>Loading…</p>}
            {loadErr && <p style={{ fontFamily: FONT, color: "#fca5a5", marginBottom: 12 }}>{loadErr}</p>}

            {!loading && !plans.length && (
              <div style={{ borderRadius: 16, border: "1px dashed rgba(255,255,255,0.15)", padding: 28, textAlign: "center" }}>
                <p style={{ fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.45)", margin: 0 }}>
                  No events yet. Start with a wedding, birthday, or dinner — we&apos;ll seed a checklist for cake, flowers, venue, photo, and gifts.
                </p>
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              {plans.map((p) => (
                <button
                  key={p.event_plan_id}
                  type="button"
                  onClick={() => {
                    setSelectedId(p.event_plan_id);
                    setView("detail");
                    try { window.history.pushState({ nav: "concierge" }, "", `/concierge/${p.event_plan_id}`); } catch { /* ignore */ }
                  }}
                  style={{
                    textAlign: "left",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.03)",
                    padding: 16,
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {p.title}
                        {p.is_owner === false && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT, border: "1px solid rgba(249,115,22,0.4)", borderRadius: 999, padding: "2px 8px" }}>
                            Co-planner
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                        {occasionLabel(p.occasion)} · {formatDate(p.event_date)} · {p.city || "TBD"}
                      </div>
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      {p.need_count || 0} needs · {p.guest_count || 0} guests · {p.registry_count || 0} registry
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
