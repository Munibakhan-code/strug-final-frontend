import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useViewport } from "../hooks/useViewport.js";
import { DatingIcon, FoodIcon, RideshareIcon, ReservationsIcon } from "../components/icons.jsx";
import { SafeImage } from "../components/SafeImage.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import {
  getDatingMe,
  updateDatingProfile,
  uploadDatingPhoto,
  getDatingDiscover,
  getDatingCrossedPaths,
  getDatingLikesYou,
  createDatingSwipe,
  updateDatingCrossedPathSettings,
  recordDatingCrossedPathEvent,
  getDatingMatches,
  openDatingMatchChat,
  unmatchDatingMatch,
  blockDatingMatch,
  joinBlindDatingQueue,
  getBlindDatingSession,
  requestBlindDatingReveal,
  openBlindDatingChat,
  endBlindDatingSession,
  reportBlindDatingSession,
  leaveBlindDatingQueue,
  getWorthItPlans,
  getMyWorthItPlans,
  getWorthItAddOnVendors,
  createWorthItPlan,
  publishWorthItPlan,
  cancelWorthItPlan,
  sendWorthItInterest,
  inviteToWorthItPlan,
  confirmWorthItInterest,
  linkWorthItRide,
  updateWorthItAddOnPreferences,
  respondWorthItInvite,
  getWorthItVendorAddOns,
  createWorthItAddOnPaymentIntent,
  confirmWorthItAddOnPayment,
  respondWorthItAddOnVendor,
  submitWorthItAddOnDeliveryProof,
  getDatingSafetyHistory,
  reportDatingEntity,
  getDatingBlockedAccounts,
  unblockDatingAccount,
} from "../api/dating.js";
import { createReservation, getBookableRestaurants, getReservationAvailability } from "../api/reservation.js";
import { cancelRide, createRideRequest } from "../api/rideshare.js";
import { mediaUrl } from "../utils/mediaUrl.js";

const HEAD = "'Barlow Condensed', sans-serif";
const BODY = "'DM Sans', sans-serif";
const ACCENT = "#e11d48";
const AGE_GATE_KEY = "strug_dating_age_gate";
const MODE_KEY = "strug_dating_mode";

const MODES = [
  { id: "standard", label: "Standard Date", title: "Standard dating", subtitle: "Profile discovery with swipe matching, preferences, compatibility reasons, and privacy controls." },
  { id: "blind", label: "Blind Date", title: "Blind love", subtitle: "Anonymous queue-based conversations first. Reveal only when both people feel safe." },
  { id: "worth", label: "Worth it", title: "Worth it dates", subtitle: "Create a restaurant date, publish it, invite people, review interest, and confirm one guest." },
  { id: "true", label: "True Love Mode", title: "True love mode", subtitle: "Consent-based compatibility using Strug behavior signals across food, media, lifestyle, and interests." },
];
const VALID_MODES = new Set(MODES.map((m) => m.id));
const VALID_AGE_GATES = new Set(["unset", "adult", "blocked"]);
const SAFETY_RAILS = [
  { title: "Organizer approval", body: "No one is automatically added to a date. The organizer always confirms." },
  { title: "Private details", body: "Exact booking, ride, and personal details are hidden until both sides confirm." },
  { title: "Anonymous first", body: "Blind chat stays anonymous until mutual reveal." },
  { title: "Public meetups", body: "Public restaurant or cafe dates only for Worth It MVP." },
  { title: "No-show history", body: "Reports, no-show history, and cancellation windows are stored for safety review." },
];
const TRUE_SIGNALS = [
  { id: "food", label: "Food taste", value: "Cuisine, coffee, dietary style", tone: "#f97316", primaryKey: "food", primaryLabel: "Food preferences", primaryPlaceholder: "coffee, sushi, halal, spicy food", secondaryKey: "diet", secondaryLabel: "Dietary notes", secondaryPlaceholder: "vegetarian, no pork, gluten free" },
  { id: "videos", label: "Videos", value: "Creators, topics, watch style", tone: "#7c3aed", primaryKey: "videos", primaryLabel: "Video interests", primaryPlaceholder: "food reels, sports clips, documentaries", secondaryKey: "creators", secondaryLabel: "Creators or topics", secondaryPlaceholder: "travel creators, wellness, comedy" },
  { id: "shopping", label: "Shopping", value: "Style, gifting, buying habits", tone: "#ec4899", primaryKey: "shopping", primaryLabel: "Shopping preferences", primaryPlaceholder: "minimal fashion, tech, gifts, local brands", secondaryKey: "shopping_style", secondaryLabel: "Style notes", secondaryPlaceholder: "budget-aware, premium, practical" },
  { id: "rides", label: "Rides", value: "Mobility and commute rhythm", tone: "#06b6d4", primaryKey: "rides", primaryLabel: "Ride preferences", primaryPlaceholder: "short trips, evening rides, transit-friendly", secondaryKey: "mobility", secondaryLabel: "Mobility notes", secondaryPlaceholder: "near downtown, prefers rideshare, walks often" },
  { id: "events", label: "Events", value: "Date ideas and activities", tone: "#eab308", primaryKey: "events", primaryLabel: "Event interests", primaryPlaceholder: "coffee tastings, concerts, comedy, sports", secondaryKey: "date_ideas", secondaryLabel: "Date ideas", secondaryPlaceholder: "quiet cafe, dinner, gallery, live music" },
  { id: "music", label: "Music", value: "Artists, genres, listening taste", tone: "#8b5cf6", primaryKey: "music", primaryLabel: "Music taste", primaryPlaceholder: "afrobeats, jazz, qawwali, podcasts", secondaryKey: "artists", secondaryLabel: "Artists or genres", secondaryPlaceholder: "Drake, Coke Studio, amapiano" },
  { id: "lifestyle", label: "Lifestyle", value: "Availability, routines, activity windows", tone: "#10b981", primaryKey: "availability", primaryLabel: "Availability", primaryPlaceholder: "weekday evenings, weekends", secondaryKey: "lifestyle", secondaryLabel: "Lifestyle signals", secondaryPlaceholder: "gym, early mornings, late dinners" },
];
const TRUE_SIGNAL_DEFAULTS = Object.fromEntries(TRUE_SIGNALS.map((signal) => [signal.id, false]));
const SENSITIVE_SIGNAL_LABELS = ["ethnicity", "race", "income", "religion", "health", "biometrics", "immigration status"];
const TRUE_REVIEW_FACTORS = [
  {
    id: "ethnicity",
    label: "Ethnicity context",
    group: "Legal review only",
    status: "locked",
    tone: "#38bdf8",
    description: "Protected or sensitive identity context is tracked only for fairness review. It is not used to rank, exclude, or target profiles.",
    prompt: "Notes for legal/product review only. Do not enter exact targeting rules.",
  },
  {
    id: "income",
    label: "Income levels",
    group: "Legal review only",
    status: "locked",
    tone: "#f59e0b",
    description: "Income can create discriminatory outcomes. Keep this disabled for matching unless legal review explicitly approves a safe product use.",
    prompt: "Capture approved affordability concerns, not income-based profile filtering.",
  },
  {
    id: "age",
    label: "Age compatibility",
    group: "Adult-only guardrail",
    status: "guarded",
    tone: "#22c55e",
    description: "Age is allowed only inside the existing 18+ gate and user-selected adult preferences.",
    prompt: "Example: 25-35, similar life stage, adult-only preferences.",
  },
  {
    id: "life_goals",
    label: "Life goals",
    group: "Consent-based signal",
    status: "usable",
    tone: "#8b5cf6",
    description: "Goals can improve compatibility when users explicitly provide them and the reason is explainable.",
    prompt: "Example: long-term relationship, family-oriented, career-focused, relocation open.",
  },
];
const TRUE_REVIEW_DEFAULTS = Object.fromEntries(TRUE_REVIEW_FACTORS.map((factor) => [factor.id, false]));
const STANDARD_FILTERS = [
  { id: "nearby", label: "Distance", body: "Inside your selected radius" },
  { id: "age", label: "Age", body: "Only show your selected age range" },
  { id: "intentional", label: "Intentional", body: "Bio or prompts completed" },
  { id: "food_match", label: "Food match", body: "Shared cuisine signals" },
  { id: "active_today", label: "Active today", body: "Recently active profiles" },
];
const STANDARD_FILTER_DEFAULTS = {
  nearby: false,
  age: false,
  intentional: false,
  food_match: false,
  active_today: false,
  distance_km: 25,
  age_min: 18,
  age_max: 45,
};
const CROSSED_PATH_DEFAULTS = {
  enabled: false,
  distance_km: 10,
  age_min: 18,
  age_max: 99,
  hide_from_followers: true,
  hide_from_following: true,
  hide_from_contacts: true,
  hide_from_networks: false,
  incognito: false,
};
const DATING_UNAVAILABLE_MESSAGE = "Dating is temporarily unavailable. Please try again shortly.";
const CROSSED_PATH_UNAVAILABLE_MESSAGE = "Crossed Paths is temporarily unavailable. Please try again shortly.";
const emptyCrossedPaths = (patch = {}) => ({
  settings: CROSSED_PATH_DEFAULTS,
  candidates: [],
  unavailable: false,
  message: "",
  ...patch,
});
const safeDatingFeatureMessage = (message, fallback = DATING_UNAVAILABLE_MESSAGE) => {
  const text = String(message || "").trim();
  if (!text) return fallback;
  if (/deleteMany|Cannot read properties|Prisma|prisma\.|P20\d{2}|invocation/i.test(text)) return fallback;
  return text;
};
const WORTH_ADD_ONS = [
  { id: "ride", label: "Ride", icon: "Ride" },
  { id: "flowers", label: "Flowers", icon: "Floral" },
  { id: "gift", label: "Gift", icon: "Gift" },
  { id: "dessert", label: "Dessert", icon: "Dessert" },
  { id: "event_ticket", label: "Event ticket", icon: "Ticket" },
];
const WORTH_SCHEDULED_ADD_ONS = new Set(["flowers", "gift", "dessert", "event_ticket"]);
const PROFILE_INTENTS = ["Long-term", "Intentional dating", "Dinner dates", "Coffee first", "Friendship first"];
const SAFETY_REASONS = ["Fake profile", "Harassment", "Unsafe date plan", "Underage concern", "Spam", "Other"];
const DATING_PRIVACY_DEFAULTS = {
  hide_from_followers: true,
  hide_from_following: true,
  hide_from_contacts: true,
  private_mode: true,
};
const ADULT_CONFIRM_MESSAGE = "Please confirm you are 18+ to use Dating.";
const isAdultGateMessage = (message) => /18|adult|age|birthdate|dating profile requires adult/i.test(String(message || ""));
const apiErrorMessage = (err, fallback = "Request failed") => {
  const body = err?.response?.data;
  const message = typeof body === "string" ? body : body?.message || body?.error;
  if (message && !/^request failed with status code/i.test(message)) return message;
  if (err?.response?.status === 401) return "Please sign in again to continue.";
  if (err?.response?.status === 403) return "You do not have access to this Dating action yet. Please confirm your age and try again.";
  return safeDatingFeatureMessage(err?.message && !/^request failed with status code/i.test(err.message) ? err.message : fallback, fallback);
};
const datingPrivacySettings = (profile) => ({
  ...DATING_PRIVACY_DEFAULTS,
  ...(profile?.dating_privacy_settings || profile?.lifestyle_signals?.privacy_settings || {}),
});

const buildWorthItAddOns = (items, rules = {}, paymentSplit = "50") => items.map((item) => {
  const itemRules = rules[item.id] || {};
  const paymentOwner = itemRules.payment_owner || (paymentSplit === "100" ? "host" : paymentSplit === "guest" ? "guest" : "split");
  if (item.id === "ride") {
    return {
      id: item.id,
      label: item.label,
      type: "scheduled_ride",
      sync_with_date: true,
      status: "pending",
      payment_owner: paymentOwner,
      pickup_privacy: "exact_pickup_after_guest_confirmation",
      pickup_visibility: "private_to_guest_driver_platform",
      organizer_visibility: "linked_only",
      address_shared_with_organizer: false,
      live_location_shared_with_organizer: false,
      privacy_notice: "The confirmed guest enters pickup privately after confirmation. The organizer never sees the exact pickup address, route, or live location.",
    };
  }
  const scheduled = WORTH_SCHEDULED_ADD_ONS.has(item.id);
  const payload = {
    id: item.id,
    label: item.label,
    type: scheduled ? "scheduled_date_add_on" : "date_add_on",
    sync_with_date: scheduled,
    status: scheduled ? "pending" : "requested",
    payment_owner: paymentOwner,
  };
  if (scheduled) {
    if (itemRules.marketplace_source && itemRules.marketplace_ref_id) {
      payload.marketplace_source = itemRules.marketplace_source;
      payload.marketplace_ref_id = Number(itemRules.marketplace_ref_id);
      payload.vendor_name = itemRules.vendor_name || null;
      payload.vendor_type = itemRules.vendor_type || null;
      payload.vendor_image_url = itemRules.vendor_image_url || null;
    }
    payload.recipient_rule = itemRules.recipient_rule || "venue";
    payload.delivery_destination = "date_venue";
    payload.delivery_window_minutes_before = Number(itemRules.delivery_window_minutes_before || 45);
    payload.budget_cap = itemRules.budget_cap ? Number(itemRules.budget_cap) : null;
    payload.payment_status = "authorization_pending";
    payload.vendor_status = "pending_guest_confirmation";
    payload.delivery_proof_required = true;
    payload.surprise_to_guest = Boolean(itemRules.surprise_to_guest);
    payload.vendor_refund_policy = {
      policy_source: "selected_vendor_default",
      label: `${item.label} vendor policy`,
      refundable_before_window: true,
      partial_after_window: item.id !== "event_ticket",
    };
  }
  return payload;
});

const todayValue = () => new Date().toISOString().slice(0, 10);
const adultCutoffValue = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
};
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const TIME_OPTIONS = Array.from({ length: 36 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});
const isAdultBirthdate = (value) => {
  if (!value) return false;
  const dob = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return false;
  return dob <= new Date(`${adultCutoffValue()}T00:00:00Z`);
};
function parseDateValue(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month: month - 1, day };
}
function isoDateValue(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function formatPickerDate(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return "Select date";
  return `${MONTH_LABELS[parsed.month]} ${parsed.day}, ${parsed.year}`;
}
function formatPickerTime(value) {
  if (!value) return "Select time";
  const [hourRaw, minute = "00"] = String(value).split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 || 12;
  return `${twelve}:${minute.padStart(2, "0")} ${suffix}`;
}
function worthRidePickupIso(plan) {
  const date = String(plan?.date || "").slice(0, 10);
  const time = String(plan?.time || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const pickup = new Date(`${date}T${time}:00`);
  if (Number.isNaN(pickup.getTime())) return null;
  pickup.setMinutes(pickup.getMinutes() - 45);
  return pickup.getTime() > Date.now() ? pickup.toISOString() : null;
}
const readStored = (key, fallback, allowed) => {
  try {
    const value = localStorage.getItem(key);
    return allowed.has(value) ? value : fallback;
  } catch {
    return fallback;
  }
};
const writeStored = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
};
const removeStored = (key) => {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
};
const normalizeBudgetInput = (value) => {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  return `${whole.slice(0, 5)}${rest.length ? `.${rest.join("").slice(0, 2)}` : ""}`;
};
const budgetNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 10000);
};
const dataOf = (payload, fallback = null) => payload?.data ?? payload ?? fallback;
const personName = (p) => p?.display_name || p?.name || "Strug member";
const personAge = (p) => {
  const explicit = Number(p?.age);
  if (Number.isFinite(explicit) && explicit >= 18 && explicit < 120) return Math.floor(explicit);
  const raw = p?.birthdate || p?.dob || p?.date_of_birth;
  if (!raw) return null;
  const dob = new Date(`${String(raw).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 18 && age < 120 ? age : null;
};
const profileUserId = (p) => Number(p?.user_id || p?.user?.user_id || p?.organizer_id || p?.recipient_id || p?.actor_id || 0) || null;
const listFromText = (value, limit = 8) => String(value || "").split(/[,\n]/).map((v) => v.trim()).filter(Boolean).slice(0, limit);
const textFromList = (value) => Array.isArray(value) ? value.filter(Boolean).join(", ") : "";
const photoList = (value, limit = 8) => {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
  return listFromText(value, limit);
};
const signalText = (profile, key) => textFromList(profile?.lifestyle_signals?.[key]);
const signalValue = (profile, key, fallback = "") => profile?.lifestyle_signals?.[key] || fallback;
const trueLoveControls = (profile) => ({
  ...TRUE_SIGNAL_DEFAULTS,
  ...(profile?.true_love_controls || {}),
  ...(profile?.lifestyle_signals?.true_love_controls || {}),
});
const trueLoveReviewControls = (profile) => ({
  ...TRUE_REVIEW_DEFAULTS,
  ...(profile?.lifestyle_signals?.true_love_review_controls || {}),
});
const trueLoveReviewNotes = (profile) => profile?.lifestyle_signals?.true_love_review_notes || {};
const emergencyContactText = (profile, field) => profile?.lifestyle_signals?.emergency_contact?.[field] || "";
const checkInText = (profile) => {
  const minutes = Number(profile?.lifestyle_signals?.check_in_minutes);
  return Number.isFinite(minutes) && minutes > 0 ? String(minutes) : "60";
};
const profileCompletion = (profile) => {
  const checks = [
    profile?.display_name,
    profile?.bio,
    profile?.birthdate,
    profile?.location_label,
    Array.isArray(profile?.photos) && profile.photos.length,
    Array.isArray(profile?.prompts) && profile.prompts.length,
    profile?.lifestyle_signals?.food?.length,
    profile?.lifestyle_signals?.music?.length,
    profile?.interested_in?.length,
    profile?.lifestyle_signals?.availability?.length,
    profile?.lifestyle_signals?.dating_intent,
    profile?.lifestyle_signals?.safety_preferences?.length || profile?.lifestyle_signals?.emergency_contact,
    profile?.age_verified_at,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};
const compatibilityReasons = (viewer, candidate) => {
  if (Array.isArray(candidate?.match_reasons) && candidate.match_reasons.length) return candidate.match_reasons.slice(0, 4);
  const reasons = [];
  if (candidate?.distance_km != null) reasons.push(`${candidate.distance_km} km away`);
  if (candidate?.bio || candidate?.prompts?.length) reasons.push("Intentional profile");
  const ownSignals = viewer?.lifestyle_signals || {};
  const candidateSignals = candidate?.lifestyle_signals || {};
  ["food", "music", "lifestyle"].forEach((key) => {
    const own = new Set(Array.isArray(ownSignals[key]) ? ownSignals[key].map((v) => String(v).toLowerCase()) : []);
    const matched = Array.isArray(candidateSignals[key]) && candidateSignals[key].some((v) => own.has(String(v).toLowerCase()));
    if (matched) reasons.push(`${key[0].toUpperCase()}${key.slice(1)} match`);
  });
  return reasons.slice(0, 4);
};
const compatibilityExplanations = (candidate) => (
  Array.isArray(candidate?.match_explanations)
    ? candidate.match_explanations.filter((item) => item?.title || item?.detail).slice(0, 3)
    : []
);
const compatibilityScore = (candidate) => {
  const score = Number(candidate?.compatibility_score);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
};
const trueLoveFeedback = (profile) => ({
  saved_ids: [],
  hidden_ids: [],
  context_requested_ids: [],
  energy: "balanced",
  ...(profile?.lifestyle_signals?.true_love_feedback || {}),
});
const trueLoveSignalOverlap = (viewer, candidate, keys = ["food", "music", "lifestyle", "availability"]) => {
  const ownSignals = viewer?.lifestyle_signals || {};
  const candidateSignals = candidate?.lifestyle_signals || {};
  return keys.reduce((count, key) => {
    const own = new Set(Array.isArray(ownSignals[key]) ? ownSignals[key].map((v) => String(v).toLowerCase()) : []);
    const matched = Array.isArray(candidateSignals[key]) && candidateSignals[key].some((v) => own.has(String(v).toLowerCase()));
    return count + (matched ? 1 : 0);
  }, 0);
};
const trueLoveMatchGroups = (matches = [], viewer = null, energy = "balanced") => {
  const used = new Set();
  const scored = [...matches].map((item) => ({
    item,
    score: compatibilityScore(item) ?? 50,
    overlap: trueLoveSignalOverlap(viewer, item),
    foodOverlap: trueLoveSignalOverlap(viewer, item, ["food"]),
    routineOverlap: trueLoveSignalOverlap(viewer, item, ["lifestyle", "availability"]),
  }));
  const sorter = (a, b) => {
    if (energy === "food") return (b.foodOverlap - a.foodOverlap) || (b.score - a.score);
    if (energy === "routine") return (b.routineOverlap - a.routineOverlap) || (b.score - a.score);
    if (energy === "different") return (a.overlap - b.overlap) || (b.score - a.score);
    return (b.score - a.score) || (b.overlap - a.overlap);
  };
  const ranked = scored.sort(sorter).map(({ item }) => item);
  const take = (items, limit = 4) => {
    const selected = [];
    items.forEach((item) => {
      const id = profileUserId(item);
      const key = String(id || "");
      if (!key || used.has(key) || selected.length >= limit) return;
      used.add(key);
      selected.push(item);
    });
    return selected;
  };
  const strong = take(ranked.filter((item) => (compatibilityScore(item) ?? 0) >= 72), 4);
  const freshSignals = take(ranked.filter((item) => item?.active_today || item?.last_active_at || item?.updated_at || compatibilityExplanations(item).length), 4);
  const routines = take(ranked.filter((item) => trueLoveSignalOverlap(viewer, item, ["lifestyle", "availability"]) > 0), 4);
  const foodDate = take(ranked.filter((item) => trueLoveSignalOverlap(viewer, item, ["food"]) > 0), 4);
  const growing = take(ranked.filter((item) => {
    const score = compatibilityScore(item) ?? 0;
    return score >= 55 || item?.active_today || item?.last_active_at || item?.updated_at;
  }), 4);
  const exploring = take(ranked, 6);
  return [
    {
      id: "strong",
      title: "Best aligned right now",
      subtitle: "People with the clearest safe-signal overlap right now.",
      tone: "#ec4899",
      items: strong,
    },
    {
      id: "fresh",
      title: "New compatibility signals",
      subtitle: "People whose profile or behavior recently created new match context.",
      tone: "#8b5cf6",
      items: freshSignals,
    },
    {
      id: "routine",
      title: "People with shared routines",
      subtitle: "Availability, lifestyle, and rhythm overlap without exposing exact locations.",
      tone: "#10b981",
      items: routines,
    },
    {
      id: "food",
      title: "Food/date style matches",
      subtitle: "Shared tastes that can turn into low-pressure food or cafe plans.",
      tone: "#f97316",
      items: foodDate,
    },
    {
      id: "growing",
      title: "Growing compatibility",
      subtitle: "Matches that may improve as your behavior, timing, and preferences change.",
      tone: "#38bdf8",
      items: growing,
    },
    {
      id: "explore",
      title: "Different but interesting",
      subtitle: "Good options that keep choice open instead of forcing one answer.",
      tone: "#facc15",
      items: exploring,
    },
  ].filter((group) => group.items.length);
};

function navigate(onNavigate, navId) {
  if (typeof onNavigate === "function") return onNavigate(navId);
  if (typeof window !== "undefined") window.location.assign(navId === "home" ? "/" : `/${navId}`);
}

function openMainMessages(onNavigate, channelId = null) {
  if (channelId != null && typeof window !== "undefined") window.__openChatChannelId = Number(channelId);
  navigate(onNavigate, "messages");
}

function rememberReturnTo(key, value) {
  if (typeof window !== "undefined") window[key] = value;
}

function openDatingProfile(onNavigate, target) {
  const targetId = profileUserId(target);
  if (!targetId || typeof window === "undefined") return;
  rememberReturnTo("__datingReturnMode", "standard");
  window.__profileTargetId = targetId;
  window.__profileVertical = "dating";
  navigate(onNavigate, "profile");
}

function isObviousTestContent(value) {
  return /test|playwright|faker|seed|demo/i.test(String(value || ""));
}

function useAsyncAction() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = useCallback(async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      const serverMessage = apiErrorMessage(err, "");
      if (status === 403 && isAdultGateMessage(serverMessage)) setNotice(serverMessage || ADULT_CONFIRM_MESSAGE);
      else setError(serverMessage || "Request failed");
      return null;
    } finally {
      setBusy("");
    }
  }, []);
  return { busy, error, notice, run, setError, setNotice };
}

function BackButton({ onClick, label = "Dating home" }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      {label}
    </button>
  );
}

function ModeBar({ mode, setMode, isMobile }) {
  return (
    <div className="dating-mode-tabs" role="tablist" aria-label="Dating modes" style={{ display: "flex", gap: 6, padding: 5, borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", overflowX: "auto", maxWidth: "100%" }}>
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button key={m.id} type="button" role="tab" aria-selected={active} onClick={() => setMode(m.id)} style={{ border: "none", borderRadius: 999, padding: isMobile ? "9px 12px" : "10px 16px", background: active ? "#fff" : "transparent", color: active ? "#111217" : "rgba(255,255,255,0.72)", fontFamily: BODY, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", cursor: "pointer", boxShadow: active ? "0 10px 28px rgba(225,29,72,0.28)" : "none" }}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function InfoCard({ title, body, icon, tone = ACCENT }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: `${tone}1f`, color: tone, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontFamily: BODY, fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{title}</p>
      <p style={{ fontFamily: BODY, fontSize: 12.5, color: "rgba(255,255,255,0.56)", lineHeight: 1.5, margin: 0 }}>{body}</p>
    </div>
  );
}

function datingProfileDraft(profile, options = {}) {
  const setupDone = profile?.lifestyle_signals?.dating_setup_completed === true;
  const startBlank = options.blankUntilSetup && !setupDone;
  if (startBlank) {
    return {
      display_name: "",
      bio: "",
      gender: "",
      interested_in: "",
      location_label: "",
      radius_km: String(profile?.radius_km || 25),
      photos: [],
      prompts: "",
      food: "",
      music: "",
      lifestyle: "",
      availability: "",
      dating_intent: "",
      safety_preferences: "",
      emergency_name: "",
      emergency_phone: "",
      check_in_minutes: checkInText(profile),
      is_discoverable: false,
    };
  }
  return {
    display_name: profile?.display_name || "",
    bio: profile?.bio || "",
    gender: profile?.gender || "",
    interested_in: textFromList(profile?.interested_in),
    location_label: profile?.location_label || "",
    radius_km: String(profile?.radius_km || 25),
    photos: photoList(profile?.photos),
    prompts: textFromList(profile?.prompts),
    food: signalText(profile, "food"),
    music: signalText(profile, "music"),
    lifestyle: signalText(profile, "lifestyle"),
    availability: signalText(profile, "availability"),
    dating_intent: signalValue(profile, "dating_intent"),
    safety_preferences: signalText(profile, "safety_preferences"),
    emergency_name: emergencyContactText(profile, "name"),
    emergency_phone: emergencyContactText(profile, "phone"),
    check_in_minutes: checkInText(profile),
    is_discoverable: profile?.is_discoverable === true,
  };
}

function datingDraftSetupChecks(draft) {
  const photos = photoList(draft?.photos, 8);
  return [
    { id: "name", label: "Dating display name", done: String(draft?.display_name || "").trim().length >= 2 },
    { id: "photos", label: "At least one profile photo", done: photos.length > 0 },
    { id: "intent", label: "Dating intent or open-to preference", done: listFromText(draft?.interested_in, 10).length > 0 || String(draft?.dating_intent || "").trim().length > 0 },
    { id: "area", label: "Dating area", done: String(draft?.location_label || "").trim().length >= 2 },
  ];
}

function datingProfileSetupChecks(profile) {
  const signals = profile?.lifestyle_signals || {};
  return datingDraftSetupChecks({
    display_name: profile?.display_name,
    photos: profile?.photos,
    interested_in: textFromList(profile?.interested_in),
    dating_intent: signals.dating_intent,
    location_label: profile?.location_label,
  });
}

function isDatingSetupComplete(profile) {
  return profile?.lifestyle_signals?.dating_setup_completed === true;
}

function datingProfileKey(profile) {
  return JSON.stringify([
    profile?.display_name,
    profile?.bio,
    profile?.gender,
    profile?.interested_in,
    profile?.location_label,
    profile?.radius_km,
    profile?.photos,
    profile?.prompts,
    profile?.preference_signals,
    profile?.emergency_contact,
    profile?.check_in_minutes,
    profile?.is_discoverable,
  ]);
}

function ProfileSetupPanel({ profile, refreshProfile, onboarding = false, blankUntilSetup = false, onComplete }) {
  const { busy, error, run } = useAsyncAction();
  const [draft, setDraft] = useState(() => datingProfileDraft(profile, { blankUntilSetup }));
  const [formError, setFormError] = useState("");
  const photoInputRef = useRef(null);
  const [setupStep, setSetupStep] = useState(0);

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleIntent = (intent) => setDraft((current) => {
    const selected = new Set(listFromText(current.interested_in, 10));
    if (selected.has(intent)) selected.delete(intent);
    else selected.add(intent);
    return { ...current, interested_in: Array.from(selected).join(", ") };
  });
  const importExistingProfile = () => {
    setFormError("");
    setDraft({ ...datingProfileDraft(profile), is_discoverable: false });
  };
  const save = () => run("profile-save", async () => {
    setFormError("");
    const checks = datingDraftSetupChecks(draft);
    if (onboarding && checks.some((item) => !item.done)) {
      setFormError(`Complete: ${checks.filter((item) => !item.done).map((item) => item.label).join(", ")}.`);
      return null;
    }
    const radius = Math.max(1, Math.min(Number(draft.radius_km) || 25, 100));
    const photos = photoList(draft.photos, 8);
    await updateDatingProfile({
      display_name: draft.display_name,
      bio: draft.bio,
      gender: draft.gender,
      interested_in: listFromText(draft.interested_in, 10),
      location_label: draft.location_label,
      radius_km: radius,
      photos,
      prompts: listFromText(draft.prompts, 8),
      lifestyle_signals: {
        ...(profile?.lifestyle_signals || {}),
        food: listFromText(draft.food, 12),
        music: listFromText(draft.music, 12),
        lifestyle: listFromText(draft.lifestyle, 12),
        availability: listFromText(draft.availability, 12),
        dating_intent: draft.dating_intent,
        safety_preferences: listFromText(draft.safety_preferences, 12),
        emergency_contact: {
          name: draft.emergency_name?.trim() || "",
          phone: draft.emergency_phone?.trim() || "",
        },
        check_in_minutes: Math.max(15, Math.min(Number(draft.check_in_minutes) || 60, 240)),
        dating_setup_completed: onboarding ? true : profile?.lifestyle_signals?.dating_setup_completed === true,
      },
      is_discoverable: draft.is_discoverable,
    });
    await refreshProfile();
    await onComplete?.();
  });
  const skipSetup = () => run("profile-skip", async () => {
    setFormError("");
    await updateDatingProfile({
      adult_confirmed: true,
      lifestyle_signals: {
        ...(profile?.lifestyle_signals || {}),
        dating_setup_completed: true,
      },
      is_discoverable: false,
    });
    await refreshProfile();
    await onComplete?.();
  });
  const photos = photoList(draft.photos, 8);
  const uploadPhotos = (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file?.type?.startsWith("image/"));
    event.target.value = "";
    if (!files.length) return;
    const remainingSlots = Math.max(0, 8 - photos.length);
    const selected = files.slice(0, remainingSlots);
    if (!selected.length) return;
    run("profile-photo-upload", async () => {
      const uploaded = [];
      for (const file of selected) {
        const result = await uploadDatingPhoto(file);
        const url = result?.url || result?.data?.url;
        if (url) uploaded.push(url);
      }
      if (uploaded.length) {
        setDraft((current) => ({ ...current, photos: [...photoList(current.photos, 8), ...uploaded].slice(0, 8) }));
      }
    });
  };
  const removePhoto = (index) => setDraft((current) => ({
    ...current,
    photos: photoList(current.photos, 8).filter((_, photoIndex) => photoIndex !== index),
  }));
  const completion = onboarding ? Math.round((datingDraftSetupChecks(draft).filter((item) => item.done).length / datingDraftSetupChecks(draft).length) * 100) : profileCompletion(profile);
  const setupChecks = datingDraftSetupChecks(draft);
  const setupSteps = [
    { title: "Basics", body: "Name, intent, and a short intro." },
    { title: "Photos & area", body: "Add profile photos and your dating area." },
    { title: "Preferences", body: "Taste, safety, and visibility controls." },
  ];
  const nextSetupStep = () => {
    setFormError("");
    if (setupStep === 0 && (!setupChecks.find((item) => item.id === "name")?.done || !setupChecks.find((item) => item.id === "intent")?.done)) {
      setFormError("Add your display name and dating intent before continuing.");
      return;
    }
    if (setupStep === 1 && (!setupChecks.find((item) => item.id === "photos")?.done || !setupChecks.find((item) => item.id === "area")?.done)) {
      setFormError("Add at least one profile photo and your dating area before continuing.");
      return;
    }
    setSetupStep((step) => Math.min(step + 1, setupSteps.length - 1));
  };

  return (
    <div className="dating-profile-setup-panel" style={panel("rgba(255,255,255,0.045)", "rgba(255,255,255,0.1)")}>
      <div className="dating-profile-setup-head" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <p style={eyebrow()}>{onboarding ? "Private setup" : "Profile setup"}</p>
          <p style={sectionTitle(28)}>{onboarding ? "Create your Dating profile" : "Make your dating card stronger"}</p>
          <p style={mutedText(13)}>{onboarding ? "Dating is separate from your main Strug profile. You choose what to add, and you stay hidden until you turn visibility on." : "Photos, intent, prompts, and taste signals improve discovery and explainable recommendations."}</p>
        </div>
      </div>
      {onboarding && (
        <div className="dating-setup-progress-card" style={{ marginTop: 18, padding: 16, borderRadius: 18, border: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(135deg, rgba(225,29,72,0.09), rgba(255,255,255,0.035))" }}>
          <div className="dating-setup-progress-head" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontFamily: BODY, fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.58)", letterSpacing: 1.6, textTransform: "uppercase", margin: 0 }}>Setup progress</p>
              <p style={{ fontFamily: BODY, fontSize: 13, color: "rgba(255,255,255,0.68)", margin: "5px 0 0" }}>{setupChecks.filter((item) => item.done).length} of {setupChecks.length} required steps complete</p>
            </div>
            <button type="button" onClick={importExistingProfile} style={{ ...chipBtn(false), justifyContent: "center" }}>Use existing Strug info</button>
          </div>
          <div aria-label={`Dating profile setup ${completion}% complete`} style={{ position: "relative", height: 10, borderRadius: 999, background: "rgba(255,255,255,0.09)", overflow: "hidden", marginTop: 16 }}>
            <div style={{ width: `${completion}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${ACCENT}, #fb7185)`, boxShadow: "0 0 22px rgba(225,29,72,0.42)", transition: "width 220ms ease" }} />
          </div>
          <div className="dating-setup-step-tabs" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginTop: 12 }}>
            {setupSteps.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setSetupStep(index)}
                aria-current={setupStep === index ? "step" : undefined}
                style={{ textAlign: "left", borderRadius: 14, border: `1px solid ${setupStep === index ? "rgba(225,29,72,0.52)" : "rgba(255,255,255,0.1)"}`, background: setupStep === index ? "rgba(225,29,72,0.12)" : "rgba(255,255,255,0.035)", padding: 12, cursor: "pointer", color: "#fff" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", flex: "0 0 auto", border: `1px solid ${index < setupStep ? "rgba(34,197,94,0.5)" : setupStep === index ? "rgba(225,29,72,0.5)" : "rgba(255,255,255,0.16)"}`, background: index < setupStep ? "rgba(34,197,94,0.18)" : setupStep === index ? "rgba(225,29,72,0.2)" : "rgba(255,255,255,0.06)", color: index < setupStep ? "#86efac" : "#fff", fontFamily: BODY, fontSize: 11, fontWeight: 900 }}>{index < setupStep ? "✓" : index + 1}</span>
                  <span>
                    <span style={{ display: "block", fontFamily: BODY, fontSize: 12.5, color: "#fff", fontWeight: 900 }}>{item.title}</span>
                    <span style={{ display: "block", fontFamily: BODY, fontSize: 11.5, color: "rgba(255,255,255,0.58)", marginTop: 2 }}>{item.body}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="dating-setup-checks" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {setupChecks.map((item, index) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", flex: "0 0 auto", border: `1px solid ${item.done ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.16)"}`, background: item.done ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.06)", color: item.done ? "#86efac" : "rgba(255,255,255,0.6)", fontFamily: BODY, fontSize: 10, fontWeight: 900 }}>{item.done ? "✓" : index + 1}</span>
                <span style={{ fontFamily: BODY, fontSize: 11.5, color: item.done ? "#fff" : "rgba(255,255,255,0.62)", fontWeight: 800 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {(!onboarding || setupStep === 0) && (
        <>
          <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginTop: 18 }}>
            <label style={fieldWrap()}><span style={fieldLabel()}>Display name</span><input style={inputStyle()} value={draft.display_name} onChange={(e) => update("display_name", e.target.value)} maxLength={100} /></label>
            <label style={fieldWrap()}><span style={fieldLabel()}>Gender</span><input style={inputStyle()} value={draft.gender} onChange={(e) => update("gender", e.target.value)} maxLength={40} /></label>
            <label style={fieldWrap()}><span style={fieldLabel()}>Open to</span><input style={inputStyle()} value={draft.interested_in} onChange={(e) => update("interested_in", e.target.value)} placeholder="Long-term, coffee first" /></label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {PROFILE_INTENTS.map((intent) => {
              const active = listFromText(draft.interested_in, 10).includes(intent);
              return <button key={intent} type="button" aria-pressed={active} onClick={() => toggleIntent(intent)} style={chipBtn(active)}>{intent}</button>;
            })}
          </div>
          <label style={{ ...fieldWrap(), marginTop: 12 }}><span style={fieldLabel()}>Bio</span><textarea style={{ ...inputStyle(), minHeight: 78, resize: "vertical" }} value={draft.bio} onChange={(e) => update("bio", e.target.value)} maxLength={1200} placeholder="What should someone know before matching?" /></label>
        </>
      )}
      {(!onboarding || setupStep === 1) && (
        <div className="dating-field-grid dating-photo-area-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 18 }}>
        <div style={fieldWrap()}>
          <span style={fieldLabel()}>Profile photos</span>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={uploadPhotos}
            style={{ display: "none" }}
          />
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, padding: 12, background: "rgba(255,255,255,0.035)" }}>
            <div className="dating-photo-upload-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(74px,1fr))", gap: 10 }}>
              {photos.map((url, index) => (
                <div key={`${url}-${index}`} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 16, overflow: "hidden", border: index === 0 ? `2px solid ${ACCENT}` : "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)" }}>
                  <SafeImage
                    src={mediaUrl(url)}
                    alt={`Dating profile photo ${index + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    fallback={<div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.52)" }}><DatingIcon s={20} /></div>}
                  />
                  {index === 0 && <span style={{ position: "absolute", left: 7, bottom: 7, padding: "4px 7px", borderRadius: 999, background: "rgba(0,0,0,0.62)", color: "#fff", fontFamily: BODY, fontSize: 10, fontWeight: 900 }}>Main</span>}
                  <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => removePhoto(index)} style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.22)", background: "rgba(0,0,0,0.68)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 15, lineHeight: 1 }}>x</button>
                </div>
              ))}
              {photos.length < 8 && (
                <button
                  type="button"
                  disabled={busy === "profile-photo-upload"}
                  onClick={() => photoInputRef.current?.click()}
                  style={{ aspectRatio: "1 / 1", borderRadius: 16, border: "1px dashed rgba(255,255,255,0.28)", background: "rgba(225,29,72,0.08)", color: "#fff", cursor: busy === "profile-photo-upload" ? "wait" : "pointer", display: "grid", placeItems: "center", fontFamily: BODY, fontWeight: 900, minHeight: 74 }}
                >
                  {busy === "profile-photo-upload" ? "..." : "+"}
                </button>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <p style={{ ...mutedText(12), margin: 0 }}>{photos.length}/8 uploaded. First photo appears on profile cards.</p>
              <button type="button" disabled={busy === "profile-photo-upload" || photos.length >= 8} onClick={() => photoInputRef.current?.click()} style={chipBtn(false)}>{busy === "profile-photo-upload" ? "Uploading..." : "Upload photos"}</button>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={fieldWrap()}><span style={fieldLabel()}>Dating area</span><input style={inputStyle()} value={draft.location_label} onChange={(e) => update("location_label", e.target.value)} maxLength={160} placeholder="City or neighborhood" /></label>
          <label style={fieldWrap()}><span style={fieldLabel()}>Radius km</span><input style={inputStyle()} inputMode="numeric" value={draft.radius_km} onChange={(e) => update("radius_km", e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
          <label style={fieldWrap()}><span style={fieldLabel()}>Prompts</span><textarea style={{ ...inputStyle(), minHeight: 82, resize: "vertical" }} value={draft.prompts} onChange={(e) => update("prompts", e.target.value)} placeholder="Best first date..., Green flag..." /></label>
        </div>
      </div>
      )}
      {(!onboarding || setupStep === 2) && (
        <>
          <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 18 }}>
            <label style={fieldWrap()}><span style={fieldLabel()}>Food taste</span><input style={inputStyle()} value={draft.food} onChange={(e) => update("food", e.target.value)} placeholder="coffee, sushi, halal" /></label>
            <label style={fieldWrap()}><span style={fieldLabel()}>Music/media</span><input style={inputStyle()} value={draft.music} onChange={(e) => update("music", e.target.value)} placeholder="afrobeats, podcasts" /></label>
            <label style={fieldWrap()}><span style={fieldLabel()}>Lifestyle</span><input style={inputStyle()} value={draft.lifestyle} onChange={(e) => update("lifestyle", e.target.value)} placeholder="gym, late nights" /></label>
          </div>
          <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
            <label style={fieldWrap()}><span style={fieldLabel()}>Availability</span><input style={inputStyle()} value={draft.availability} onChange={(e) => update("availability", e.target.value)} placeholder="weekday evenings, weekends" /></label>
            <label style={fieldWrap()}><span style={fieldLabel()}>Dating intent</span><input style={inputStyle()} value={draft.dating_intent} onChange={(e) => update("dating_intent", e.target.value)} placeholder="serious, casual, coffee first" /></label>
            <label style={fieldWrap()}><span style={fieldLabel()}>Safety preferences</span><input style={inputStyle()} value={draft.safety_preferences} onChange={(e) => update("safety_preferences", e.target.value)} placeholder="public dates, video first" /></label>
          </div>
          <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
            <label style={fieldWrap()}><span style={fieldLabel()}>Emergency contact</span><input style={inputStyle()} value={draft.emergency_name} onChange={(e) => update("emergency_name", e.target.value)} placeholder="Trusted contact name" /></label>
            <label style={fieldWrap()}><span style={fieldLabel()}>Contact phone</span><input style={inputStyle()} value={draft.emergency_phone} onChange={(e) => update("emergency_phone", e.target.value)} placeholder="+1..." /></label>
            <label style={fieldWrap()}><span style={fieldLabel()}>Check-in minutes</span><input style={inputStyle()} inputMode="numeric" value={draft.check_in_minutes} onChange={(e) => update("check_in_minutes", e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
          </div>
        </>
      )}
      <div className="dating-profile-setup-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        {(!onboarding || setupStep === 2) ? <button type="button" aria-pressed={draft.is_discoverable} onClick={() => update("is_discoverable", !draft.is_discoverable)} style={chipBtn(draft.is_discoverable)}>{draft.is_discoverable ? "Visible in Dating" : "Hidden from Dating"}</button> : <button type="button" disabled={busy} onClick={skipSetup} style={ghostBtn()}>{busy === "profile-skip" ? "Skipping..." : "Skip for now"}</button>}
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {onboarding && setupStep > 0 && <button type="button" onClick={() => setSetupStep((step) => Math.max(step - 1, 0))} style={ghostBtn()}>Back</button>}
          {onboarding && setupStep < setupSteps.length - 1
            ? <button type="button" onClick={nextSetupStep} style={primaryBtn(ACCENT)}>Continue</button>
            : <button type="button" disabled={busy} onClick={save} style={primaryBtn(onboarding ? ACCENT : "#7c3aed")}>{busy === "profile-save" ? "Saving..." : onboarding ? "Finish setup" : "Save profile"}</button>}
        </span>
      </div>
      {(formError || error) && <p style={errorText()}>{formError || error}</p>}
    </div>
  );
}

function DatingOnboardingFlow({ profile, refreshProfile, refreshDiscover, onComplete }) {
  return (
    <div className="dating-two-col" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.7fr) minmax(0, 1.3fr)", gap: 14 }}>
      <div style={panel("linear-gradient(160deg, rgba(225,29,72,0.14), rgba(124,58,237,0.08))", "rgba(225,29,72,0.18)")}>
        <div style={{ width: 52, height: 52, borderRadius: 18, display: "grid", placeItems: "center", background: `${ACCENT}22`, color: ACCENT, marginBottom: 16 }}><DatingIcon s={24} /></div>
        <p style={eyebrow()}>Step 2</p>
        <p style={sectionTitle(30)}>Register for Standard Dating</p>
        <p style={mutedText(14)}>You are age-confirmed. Now create a private Dating profile before any swipe cards load. Nothing is published to Social, and you decide whether other Dating users can see you.</p>
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {[
            ["Private by default", "Your main Strug profile is not automatically shown."],
            ["Separate Dating profile", "Choose Dating photos, prompts, intent, and area."],
            ["Visibility control", "Stay hidden or turn on discovery when ready."],
            ["Real profiles only", "Only eligible backend profiles appear after setup."],
          ].map(([title, body]) => (
            <div key={title} style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", padding: 12 }}>
              <p style={{ fontFamily: BODY, color: "#fff", fontWeight: 900, fontSize: 13, margin: 0 }}>{title}</p>
              <p style={{ ...mutedText(12), marginTop: 4 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
      <ProfileSetupPanel
        key={`onboarding-${datingProfileKey(profile)}`}
        profile={profile}
        refreshProfile={refreshProfile}
        onboarding
        blankUntilSetup
        onComplete={async () => {
          await refreshDiscover?.();
          onComplete?.();
        }}
      />
    </div>
  );
}

function DatingSetupPrompt({ onOpen }) {
  return (
    <div style={{ ...panel("linear-gradient(160deg, rgba(225,29,72,0.13), rgba(124,58,237,0.08))", "rgba(225,29,72,0.2)"), textAlign: "center", padding: 28 }}>
      <div style={{ width: 58, height: 58, borderRadius: 20, display: "grid", placeItems: "center", background: `${ACCENT}22`, color: ACCENT, margin: "0 auto 16px" }}><DatingIcon s={26} /></div>
      <p style={eyebrow()}>Private setup required</p>
      <p style={{ ...sectionTitle(32), marginBottom: 8 }}>Create your Dating profile</p>
      <p style={{ ...mutedText(14), maxWidth: 620, margin: "0 auto" }}>
        Your main Strug profile is not automatically used. Complete a separate Dating profile in a private pop-up before swipe cards appear.
      </p>
      <button type="button" onClick={onOpen} style={{ ...primaryBtn(), marginTop: 18 }}>Create profile</button>
    </div>
  );
}

function SafetyCenter({ selectedUserId, selectedReportTarget, profile, myWorth, onNavigate, onClose, onReported }) {
  const { busy, error, run } = useAsyncAction();
  const [reason, setReason] = useState(selectedReportTarget?.reason || "Harassment");
  const [details, setDetails] = useState(selectedReportTarget?.details || "");
  const [history, setHistory] = useState({ report_count: 0, no_show_count: 0, reports: [] });
  const [notice, setNotice] = useState("");
  const [blockedAccounts, setBlockedAccounts] = useState([]);
  const [privacyDraft, setPrivacyDraft] = useState(() => datingPrivacySettings(profile));
  const emergency = profile?.lifestyle_signals?.emergency_contact || {};
  const checkInMinutes = Number(profile?.lifestyle_signals?.check_in_minutes) || 60;
  const reportTargetId = selectedReportTarget?.user_id || selectedUserId || null;
  const nextPlan = useMemo(() => {
    const plans = [
      ...(myWorth?.organized || []),
      ...(myWorth?.interested || []).map((item) => item.plan).filter(Boolean),
      ...(myWorth?.invites || []).map((item) => item.plan).filter(Boolean),
    ];
    return plans
      .filter((plan) => plan?.date && plan.status !== "cancelled")
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
  }, [myWorth]);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([getDatingSafetyHistory(), getDatingBlockedAccounts()])
      .then(([historyResult, blockedResult]) => {
        if (!alive) return;
        if (historyResult.status === "fulfilled") setHistory(dataOf(historyResult.value, { report_count: 0, no_show_count: 0, reports: [] }));
        if (blockedResult.status === "fulfilled") setBlockedAccounts(dataOf(blockedResult.value, []));
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setReason(selectedReportTarget?.reason || "Harassment");
    setDetails(selectedReportTarget?.details || "");
  }, [selectedReportTarget]);

  useEffect(() => {
    setPrivacyDraft(datingPrivacySettings(profile));
  }, [profile]);

  const report = () => run("report", async () => {
    await reportDatingEntity({
      reported_user_id: reportTargetId || undefined,
      entity_type: selectedReportTarget?.entity_type || (reportTargetId ? "dating_profile" : "dating"),
      entity_id: selectedReportTarget?.entity_id,
      reason,
      details,
    });
    setDetails("");
    setHistory(dataOf(await getDatingSafetyHistory(), history));
    await onReported?.();
    setNotice("Report sent to moderation.");
  });
  const sharePlan = () => run("share-plan", async () => {
    if (!nextPlan) throw new Error("No active date plan to share yet.");
    const text = [
      "Strug date plan",
      `${nextPlan.restaurant_name || "Venue"} on ${new Date(nextPlan.date).toLocaleDateString()} at ${nextPlan.time || "TBD"}`,
      `Status: ${nextPlan.status || "planned"}`,
      nextPlan.restaurant_address ? `Address: ${nextPlan.restaurant_address}` : "Exact location is hidden until confirmation.",
    ].join("\n");
    if (navigator.share) await navigator.share({ title: "Strug date plan", text });
    else {
      await navigator.clipboard?.writeText(text);
      setNotice("Date plan copied.");
    }
  });
  const saveCheckIn = () => {
    const key = nextPlan?.dating_date_plan_id ? `strug_dating_checkin_${nextPlan.dating_date_plan_id}` : "strug_dating_checkin_default";
    writeStored(key, JSON.stringify({ minutes: checkInMinutes, created_at: new Date().toISOString() }));
    setNotice(`Check-in reminder set for every ${checkInMinutes} minutes.`);
  };
  const togglePrivacy = (key) => run(`privacy-${key}`, async () => {
    const next = { ...privacyDraft, [key]: !privacyDraft[key] };
    setPrivacyDraft(next);
    await updateDatingProfile({
      adult_confirmed: true,
      lifestyle_signals: {
        ...(profile?.lifestyle_signals || {}),
        privacy_settings: next,
      },
    });
    setNotice("Privacy controls saved.");
  });
  const refreshBlocked = () => run("blocked-refresh", async () => {
    setBlockedAccounts(dataOf(await getDatingBlockedAccounts(), []));
  });
  const unblockAccount = (account) => run(`unblock-${account.user_id}`, async () => {
    await unblockDatingAccount(account.user_id);
    setBlockedAccounts((items) => items.filter((item) => String(item.user_id) !== String(account.user_id)));
    setNotice(`${account.display_name || "Account"} was unblocked.`);
  });
  return (
    <div className="dating-safety-center" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 42, height: 42, borderRadius: 14, display: "grid", placeItems: "center", background: `${ACCENT}1f`, color: ACCENT }}><ReservationsIcon s={18} /></span>
          <span><p style={{ ...sectionTitle(28), margin: 0 }}>Date safer</p><p style={{ ...mutedText(12), marginTop: 3 }}>Safety tools and reporting</p></span>
        </span>
        <button type="button" onClick={onClose} aria-label="Close safety tools" style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontFamily: BODY, fontSize: 18, fontWeight: 900 }}>×</button>
      </div>
      <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
        {["Dating is hidden from Social followers and people you follow by default", "A block applies across Strug, including Dating, Social, messages, and Worth It plans", "Approximate location before confirmation", "Confirm before exact booking details are shared", "Report unsafe behavior or no-show concerns"].map((item) => <div key={item} style={railRow()}><span style={{ color: ACCENT }}>•</span><span style={mutedText(12)}>{item}</span></div>)}
      </div>
      <div style={{ ...miniTile(), marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
          <span>
            <p style={eyebrow()}>Privacy controls</p>
            <p style={{ fontFamily: BODY, color: "#fff", fontSize: 14, fontWeight: 900, marginTop: 7 }}>Dating stays separate from Social</p>
          </span>
          <span style={{ ...tagStyle(), color: "#86efac", borderColor: "rgba(34,197,94,0.34)", background: "rgba(34,197,94,0.1)" }}>Private by default</span>
        </div>
        {[
          ["hide_from_followers", "Hide me from followers"],
          ["hide_from_following", "Hide me from people I follow"],
          ["hide_from_contacts", "Hide me from contacts"],
          ["private_mode", "Incognito Dating mode"],
        ].map(([key, label]) => (
          <button key={key} type="button" disabled={busy} onClick={() => togglePrivacy(key)} aria-pressed={Boolean(privacyDraft[key])} style={{ ...privacyRowStyle(Boolean(privacyDraft[key])), marginTop: 8 }}>
            <span>{label}</span>
            <span>{privacyDraft[key] ? "On" : "Off"}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 14 }}>
        <div style={miniTile()}>
          <p style={eyebrow()}>Emergency contact</p>
          <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, marginTop: 8 }}>{emergency.name || "Not set"}</p>
          <p style={mutedText(12)}>{emergency.phone || "Add this in your Dating profile."}</p>
        </div>
        <div style={miniTile()}>
          <p style={eyebrow()}>Safety history</p>
          <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, marginTop: 8 }}>{history.report_count || 0} reports · {history.no_show_count || 0} no-shows</p>
          <p style={mutedText(12)}>Visible to safety review only.</p>
        </div>
        <div style={miniTile()}>
          <p style={eyebrow()}>Blocked profiles</p>
          <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, marginTop: 8 }}>{blockedAccounts.length ? `${blockedAccounts.length} blocked account${blockedAccounts.length === 1 ? "" : "s"}` : "None currently"}</p>
          <p style={mutedText(12)}>Manage people you blocked across Dating and Social.</p>
        </div>
      </div>
      <div style={{ ...miniTile(), marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <span><p style={eyebrow()}>Blocked accounts</p><p style={mutedText(12)}>Unblock only when you are sure.</p></span>
          <button type="button" disabled={busy} onClick={refreshBlocked} style={{ ...ghostBtn(), minHeight: 34, padding: "8px 11px" }}>{busy === "blocked-refresh" ? "Refreshing..." : "Refresh"}</button>
        </div>
        {blockedAccounts.slice(0, 8).map((account) => {
          const userId = account.user_id;
          return (
            <div key={userId || account.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <span style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center", background: "rgba(255,255,255,0.08)", color: ACCENT, flex: "0 0 auto" }}>
                  {account.profile_pic_url ? <SafeImage src={account.profile_pic_url} alt={account.display_name || account.name || "Blocked account"} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <DatingIcon s={16} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.display_name || account.name || "Blocked account"}</span>
                  <span style={{ display: "block", ...mutedText(11) }}>{account.blocked_at ? `Blocked ${new Date(account.blocked_at).toLocaleDateString()}` : account.source || "Dating block"}</span>
                </span>
              </span>
              {userId ? <button type="button" disabled={busy} onClick={() => unblockAccount(account)} style={{ ...ghostBtn(), minHeight: 32, padding: "7px 10px" }}>Unblock</button> : null}
            </div>
          );
        })}
        {!blockedAccounts.length && <p style={mutedText(12)}>No blocked accounts to show.</p>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button type="button" disabled={busy} onClick={sharePlan} style={ghostBtn()}>Share date plan</button>
        <button type="button" onClick={saveCheckIn} style={ghostBtn()}>Set check-in</button>
      </div>
      {notice && <p style={{ ...mutedText(12), color: "#86efac" }}>{notice}</p>}
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {selectedReportTarget?.name && (
          <div style={{ ...miniTile(), borderColor: "rgba(225,29,72,0.28)", background: "rgba(225,29,72,0.08)" }}>
            <p style={eyebrow()}>Reporting</p>
            <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, marginTop: 8 }}>{selectedReportTarget.name}</p>
            <p style={mutedText(12)}>Choose the accurate reason before sending this to moderation.</p>
          </div>
        )}
        <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle()}>{SAFETY_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} style={{ ...inputStyle(), minHeight: 84, resize: "vertical" }} placeholder="Add report details" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={report} style={primaryBtn()}>{busy === "report" ? "Sending..." : "Submit report"}</button>
          <button type="button" onClick={() => openMainMessages(onNavigate)} style={ghostBtn()}>Open messages</button>
        </div>
      </div>
      {error && <p style={errorText()}>{error}</p>}
    </div>
  );
}

function BlindMode({ blindState, refreshBlind, onNavigate }) {
  const { busy, error, run } = useAsyncAction();
  const session = blindState?.session;
  const queue = blindState?.queue;
  const queued = Boolean(queue || session);
  const revealed = session?.status === "revealed";
  const revealStatus = session?.reveal_status || {};
  const queuedPrefs = queue?.boundaries?.preferences;
  const queuedIcebreakers = queue?.boundaries?.icebreakers;
  const [preferences, setPreferences] = useState({
    age_min: 18,
    age_max: 35,
    distance_km: 25,
    language: "Any",
    intent: "Intentional dating",
    vibe: "Easy conversation",
    reveal_after_messages: 6,
    reveal_after_minutes: 10,
  });
  const [icebreakers, setIcebreakers] = useState([
    "What kind of evening are you hoping for?",
    "What food would you never say no to?",
    "What is an underrated green flag?",
  ]);
  const [reportReason, setReportReason] = useState("Unsafe or uncomfortable behavior");
  const [reportDetails, setReportDetails] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const intentOptions = ["Intentional dating", "Coffee first", "Dinner date", "Long-term", "Friendship first"];
  const vibeOptions = ["Easy conversation", "Playful", "Deep questions", "Food-focused", "Quiet and respectful"];
  const distanceOptions = [10, 25, 50];
  const revealReady = Boolean(session && revealStatus.can_request_reveal && !revealed);
  const roomStatus = revealed ? "Mutual reveal complete" : session ? "Anonymous match ready" : queue ? "Waiting for one person" : "Ready when you are";
  const roomSubcopy = session
    ? "Start with the prompts below. Reveal only unlocks after enough time or messages."
    : queue
      ? "You are in the queue. We will keep this room private until a compatible person joins."
      : "Set your preferences, then join the queue to start one anonymous chat.";

  const updatePreference = (key, value) => setPreferences((current) => {
    const numericKeys = new Set(["age_min", "age_max", "distance_km", "reveal_after_messages", "reveal_after_minutes"]);
    if (!numericKeys.has(key)) return { ...current, [key]: value };
    const clean = value.replace(/\D/g, "").slice(0, 3);
    return { ...current, [key]: clean };
  });
  const updateIcebreaker = (index, value) => setIcebreakers((current) => current.map((item, i) => (i === index ? value.slice(0, 140) : item)));
  const normalizedPreferences = () => {
    const minAge = Math.max(18, Math.min(Number(preferences.age_min) || 18, 99));
    const maxAge = Math.max(minAge, Math.min(Number(preferences.age_max) || 45, 99));
    return {
      ...preferences,
      age_min: minAge,
      age_max: maxAge,
      distance_km: Math.max(1, Math.min(Number(preferences.distance_km) || 25, 100)),
      reveal_after_messages: Math.max(2, Math.min(Number(preferences.reveal_after_messages) || 6, 50)),
      reveal_after_minutes: Math.max(1, Math.min(Number(preferences.reveal_after_minutes) || 10, 120)),
    };
  };

  const join = () => run("blind-join", async () => {
    const nextPreferences = normalizedPreferences();
    const nextIcebreakers = icebreakers.map((item) => item.trim()).filter(Boolean).slice(0, 3);
    await joinBlindDatingQueue({
      preferences: nextPreferences,
      icebreakers: nextIcebreakers,
      boundaries: { public_place: true, anonymous_first: true, preferences: nextPreferences, icebreakers: nextIcebreakers },
    });
    await refreshBlind();
  });
  const leave = () => run("blind-leave", async () => {
    await leaveBlindDatingQueue();
    await refreshBlind();
  });
  const reveal = () => run("blind-reveal", async () => {
    if (!session?.dating_blind_session_id) return;
    await requestBlindDatingReveal(session.dating_blind_session_id);
    await refreshBlind();
  });
  const openChat = () => run("blind-chat", async () => {
    if (!session?.dating_blind_session_id) return;
    const payload = await openBlindDatingChat(session.dating_blind_session_id);
    const channelId = dataOf(payload)?.channel_id;
    openMainMessages(onNavigate, channelId);
  });
  const endChat = () => run("blind-end", async () => {
    if (!session?.dating_blind_session_id) return;
    await endBlindDatingSession(session.dating_blind_session_id, { reason: "Ended by participant" });
    await refreshBlind();
  });
  const reportChat = () => run("blind-report", async () => {
    if (!session?.dating_blind_session_id) return;
    await reportBlindDatingSession(session.dating_blind_session_id, { reason: reportReason, details: reportDetails });
    setReportDetails("");
    setReportOpen(false);
    await refreshBlind();
  });

  return (
    <>
      <div className="dating-two-col dating-blind-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(320px,0.85fr)", gap: 18, alignItems: "start" }}>
        <div style={panel("linear-gradient(145deg, rgba(225,29,72,0.18), rgba(20,20,28,0.96))", "rgba(225,29,72,0.24)")}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <p style={sectionTitle()}>Anonymous first</p>
              <p style={{ ...mutedText(14), maxWidth: 680 }}>Choose who you want to meet, set the tone, then enter one private queue. Photos and profiles stay hidden until both people request reveal.</p>
            </div>
            <span style={{ ...tagStyle(), background: queued ? "rgba(34,197,94,0.18)" : "rgba(225,29,72,0.15)", color: queued ? "#86efac" : "#fecdd3", padding: "8px 11px" }}>{session ? "In chat" : queue ? "Queued" : "Not queued"}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 10, marginTop: 18 }}>
            {[
              ["01", "Set your match window", `${preferences.age_min}-${preferences.age_max} yrs · ${preferences.distance_km} km`],
              ["02", "Pick the vibe", preferences.vibe || "Any conversation style"],
              ["03", "Reveal stays mutual", `${preferences.reveal_after_messages} messages or ${preferences.reveal_after_minutes} min`],
            ].map(([num, title, body]) => (
              <div key={title} style={softStep()}>
                <span style={stepNumber()}>{num}</span>
                <div>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13.5, fontWeight: 900, margin: 0 }}>{title}</p>
                  <p style={{ ...mutedText(12), marginTop: 3 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={sectionBlock()}>
            <div style={sectionHeaderRow()}>
              <div>
                <p style={eyebrow()}>Match preferences</p>
                <p style={{ ...mutedText(12), marginTop: 3 }}>These only affect queue matching. They are not shown to the other person.</p>
              </div>
              {queuedPrefs && <span style={{ ...tagStyle(), color: "#86efac", background: "rgba(34,197,94,0.15)" }}>Saved</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginTop: 12 }}>
              <label style={fieldWrap()}><span style={fieldLabel()}>Min age</span><input disabled={queued} style={inputStyle(queued)} inputMode="numeric" value={preferences.age_min} onChange={(e) => updatePreference("age_min", e.target.value)} /></label>
              <label style={fieldWrap()}><span style={fieldLabel()}>Max age</span><input disabled={queued} style={inputStyle(queued)} inputMode="numeric" value={preferences.age_max} onChange={(e) => updatePreference("age_max", e.target.value)} /></label>
              <label style={fieldWrap()}><span style={fieldLabel()}>Distance km</span><input disabled={queued} style={inputStyle(queued)} inputMode="numeric" value={preferences.distance_km} onChange={(e) => updatePreference("distance_km", e.target.value)} /></label>
              <label style={fieldWrap()}><span style={fieldLabel()}>Language</span><select disabled={queued} value={preferences.language} onChange={(e) => updatePreference("language", e.target.value)} style={inputStyle(queued)}><option>Any</option><option>English</option><option>Urdu</option><option>Hindi</option><option>Punjabi</option><option>Arabic</option><option>French</option></select></label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {distanceOptions.map((km) => <button key={km} type="button" disabled={queued} aria-pressed={Number(preferences.distance_km) === km} onClick={() => updatePreference("distance_km", String(km))} style={choiceChip(Number(preferences.distance_km) === km, queued)}>{km} km</button>)}
            </div>
          </div>

          <div style={sectionBlock()}>
            <p style={eyebrow()}>Intent and vibe</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 12 }}>
              <div>
                <span style={fieldLabel()}>Intent</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {intentOptions.map((item) => <button key={item} type="button" disabled={queued} aria-pressed={preferences.intent === item} onClick={() => updatePreference("intent", item)} style={choiceChip(preferences.intent === item, queued)}>{item}</button>)}
                </div>
              </div>
              <div>
                <span style={fieldLabel()}>Conversation vibe</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {vibeOptions.map((item) => <button key={item} type="button" disabled={queued} aria-pressed={preferences.vibe === item} onClick={() => updatePreference("vibe", item)} style={choiceChip(preferences.vibe === item, queued)}>{item}</button>)}
                </div>
              </div>
            </div>
          </div>

          <div style={sectionBlock()}>
            <div style={sectionHeaderRow()}>
              <div>
                <p style={eyebrow()}>Reveal rules</p>
                <p style={{ ...mutedText(12), marginTop: 3 }}>Reveal stays locked until one threshold is met. Both people still need to approve.</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
              <label style={fieldWrap()}><span style={fieldLabel()}>Messages first</span><input disabled={queued} style={inputStyle(queued)} inputMode="numeric" value={preferences.reveal_after_messages} onChange={(e) => updatePreference("reveal_after_messages", e.target.value)} /></label>
              <label style={fieldWrap()}><span style={fieldLabel()}>Or minutes</span><input disabled={queued} style={inputStyle(queued)} inputMode="numeric" value={preferences.reveal_after_minutes} onChange={(e) => updatePreference("reveal_after_minutes", e.target.value)} /></label>
            </div>
          </div>

          <div style={sectionBlock()}>
            <div style={sectionHeaderRow()}>
              <div>
                <p style={eyebrow()}>Icebreakers</p>
                <p style={{ ...mutedText(12), marginTop: 3 }}>Pick three prompts that feel easy to answer anonymously.</p>
              </div>
            </div>
            <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
              {(queuedIcebreakers || icebreakers).map((q, i) => (
                <label key={i} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
                  <span style={icebreakerNumber()}>{i + 1}</span>
                  <input disabled={queued} style={inputStyle(queued)} value={q} onChange={(e) => updateIcebreaker(i, e.target.value)} maxLength={140} />
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18, alignItems: "center" }}>
            <button type="button" onClick={join} disabled={busy || session || queue} style={{ ...primaryBtn(), minWidth: 180, opacity: session || queue ? 0.58 : 1 }}>{session ? "Session active" : queue ? "Waiting in queue" : "Join blind queue"}</button>
            {queue && <button type="button" onClick={leave} disabled={busy} style={ghostBtn()}>Leave queue</button>}
            <p style={{ ...mutedText(12), margin: 0 }}>{session ? "Your room is active." : queue ? "You can leave the queue any time before a match." : "One active blind chat at a time keeps the queue clean."}</p>
          </div>
          {error && <p style={errorText()}>{error}</p>}
        </div>

        <div className="dating-sticky-panel" style={{ ...panel(), position: "sticky", top: 14 }}>
          <p style={eyebrow()}>Anonymous room</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <div style={anonymousAvatar()}>{session ? "1:1" : "?"}</div>
            <div>
              <p style={{ fontFamily: BODY, color: "#fff", fontSize: 15, fontWeight: 900, margin: 0 }}>{roomStatus}</p>
              <p style={{ ...mutedText(12), marginTop: 3 }}>{roomSubcopy}</p>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            {(session?.icebreakers || queuedIcebreakers || icebreakers).map((q) => <div key={q} style={questionTile()}>{q}</div>)}
          </div>

          {session ? (
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              <div style={revealMeter()}>
                <div style={sectionHeaderRow()}>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, margin: 0 }}>Reveal unlock</p>
                  <span style={{ ...tagStyle(), background: revealReady ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.06)", color: revealReady ? "#86efac" : "rgba(255,255,255,0.62)" }}>{revealReady ? "Ready" : "Locked"}</span>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  <ProgressLine label="Messages" value={revealStatus.message_count || 0} max={revealStatus.min_messages || 6} />
                  <ProgressLine label="Minutes" value={revealStatus.elapsed_minutes || 0} max={revealStatus.min_minutes || 10} />
                </div>
              </div>
              <button type="button" onClick={openChat} disabled={busy} style={primaryBtn("#7c3aed")}>Open anonymous chat</button>
              <button type="button" onClick={reveal} disabled={!revealReady || busy} style={{ ...primaryBtn(), opacity: revealReady ? 1 : 0.48 }}>{revealed ? "Revealed" : "Request reveal"}</button>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
                <button type="button" onClick={endChat} disabled={busy} style={ghostBtn()}>End chat</button>
                <button type="button" onClick={() => setReportOpen((open) => !open)} disabled={busy} aria-expanded={reportOpen} style={{ ...ghostBtn(), borderColor: "rgba(248,113,113,0.28)", color: "#fecaca" }}>{reportOpen ? "Close report" : "Report"}</button>
              </div>
              {reportOpen && (
                <div style={reportDetailsBox()}>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, margin: 0 }}>Report this blind chat</p>
                  <p style={{ ...mutedText(12), marginTop: 3 }}>Reports close the anonymous room and send the details to safety review.</p>
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} style={inputStyle()}>
                      {["Unsafe or uncomfortable behavior", "Harassment", "Spam or fake profile", "No-show concern", "Other safety concern"].map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <textarea value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} style={{ ...inputStyle(), minHeight: 70, resize: "vertical" }} placeholder="Optional report details" maxLength={2000} />
                    <button type="button" onClick={reportChat} disabled={busy} style={dangerBtn()}>{busy === "blind-report" ? "Submitting..." : "Submit report"}</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...revealMeter(), marginTop: 16 }}>
              <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, margin: 0 }}>Next step</p>
              <p style={{ ...mutedText(12), marginTop: 4 }}>{queue ? "Stay here while we look for a compatible blind match." : "Join the blind queue to open a private anonymous room."}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ProgressLine({ label, value, max }) {
  const safeMax = Math.max(Number(max) || 1, 1);
  const pct = Math.max(0, Math.min((Number(value) || 0) / safeMax, 1)) * 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: BODY, color: "rgba(255,255,255,0.62)", fontSize: 11, fontWeight: 900 }}>
        <span>{label}</span>
        <span>{Math.min(Number(value) || 0, safeMax)}/{safeMax}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: pct >= 100 ? "#22c55e" : ACCENT, transition: "width 180ms ease" }} />
      </div>
    </div>
  );
}

function ThemedDatePicker({ value, min, onChange, error }) {
  const [open, setOpen] = useState(false);
  const parsed = parseDateValue(value);
  const parsedYear = parsed?.year;
  const parsedMonth = parsed?.month;
  const minParsed = parseDateValue(min) || parseDateValue(todayValue());
  const [viewYear, setViewYear] = useState(parsedYear || minParsed?.year || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedMonth ?? minParsed?.month ?? 0);
  const wrapRef = useRef(null);
  const startYear = minParsed?.year || new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, index) => startYear + index);
  const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const minIso = min || todayValue();

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const keyClose = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", keyClose);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", keyClose);
    };
  }, [open]);

  useEffect(() => {
    if (parsedYear == null || parsedMonth == null) return;
    setViewYear(parsedYear);
    setViewMonth(parsedMonth);
  }, [parsedYear, parsedMonth]);

  const shiftMonth = (delta) => {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    const nextYear = next.getUTCFullYear();
    if (nextYear < startYear || nextYear > startYear + 3) return;
    setViewYear(nextYear);
    setViewMonth(next.getUTCMonth());
  };
  const choose = (day) => {
    const iso = isoDateValue(viewYear, viewMonth, day);
    if (iso < minIso) return;
    onChange(iso);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((next) => !next)} aria-haspopup="dialog" aria-expanded={open} style={pickerButtonStyle(error, Boolean(value))}>
        <span>{formatPickerDate(value)}</span>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={error ? "#fb7185" : "rgba(255,255,255,0.82)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {open && (
        <div role="dialog" aria-label="Choose date" style={pickerPopoverStyle()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" style={pickerNavBtn()}>‹</button>
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <select value={viewMonth} onChange={(event) => setViewMonth(Number(event.target.value))} style={pickerSelectStyle()}>
                {MONTH_LABELS.map((month, index) => <option key={month} value={index}>{month}</option>)}
              </select>
              <select value={viewYear} onChange={(event) => setViewYear(Number(event.target.value))} style={{ ...pickerSelectStyle(), flex: "0 0 92px" }}>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" style={pickerNavBtn()}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {WEEKDAY_LABELS.map((day, index) => <div key={`${day}-${index}`} style={pickerWeekdayStyle()}>{day}</div>)}
            {Array.from({ length: firstDay }).map((_, index) => <div key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const iso = isoDateValue(viewYear, viewMonth, day);
              const active = iso === value;
              const disabled = iso < minIso;
              return (
                <button key={iso} type="button" disabled={disabled} onClick={() => choose(day)} style={pickerDayStyle(active, disabled)}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemedTimePicker({ value, options = TIME_OPTIONS, loading = false, disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const rows = Array.isArray(options) && options.length ? options : TIME_OPTIONS;
  const isDisabled = disabled || loading || !rows.length;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const keyClose = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", keyClose);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", keyClose);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" disabled={isDisabled} onClick={() => setOpen((next) => !next)} aria-haspopup="listbox" aria-expanded={open} style={pickerButtonStyle(false, Boolean(value), isDisabled)}>
        <span>{loading ? "Loading slots..." : isDisabled ? "No slots available" : formatPickerTime(value)}</span>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      {open && !isDisabled && (
        <div role="listbox" aria-label="Choose time" style={{ ...pickerPopoverStyle(), maxHeight: 284, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {rows.map((slot) => {
              const active = slot === value;
              return (
                <button key={slot} type="button" role="option" aria-selected={active} onClick={() => { onChange(slot); setOpen(false); }} style={pickerTimeStyle(active)}>
                  {formatPickerTime(slot)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StandardMode({ profile, profiles, matches, likesYou, filters, setFilters, crossedPaths, refreshDiscover, refreshCrossedPaths, updateCrossedPaths, recordCrossedPath, onNavigate, onAfterBlock, onReportUser, isMobile = false }) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState("discover");
  const [refreshing, setRefreshing] = useState(false);
  const [blockDialog, setBlockDialog] = useState(null);
  const [crossedStatus, setCrossedStatus] = useState("");
  const [drag, setDrag] = useState({ active: false, startX: 0, deltaX: 0 });
  const [photoIndex, setPhotoIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const card = profiles[index] || null;
  const activeFilterCount = Object.entries(filters).filter(([, value]) => value === true).length;
  const reasons = compatibilityReasons(profile, card);
  const explanations = compatibilityExplanations(card);
  const completion = profileCompletion(profile);
  const cardPhotos = Array.isArray(card?.photos) ? card.photos.filter(Boolean) : [];
  const activePhoto = cardPhotos[Math.min(photoIndex, Math.max(cardPhotos.length - 1, 0))] || "";
  const cardAge = personAge(card);
  const crossedUnavailable = Boolean(crossedPaths?.unavailable);
  const crossedMessage = crossedStatus || crossedPaths?.message || "";
  const crossedSettings = { ...CROSSED_PATH_DEFAULTS, ...(crossedPaths?.settings || {}) };
  const crossedProfiles = Array.isArray(crossedPaths?.candidates) ? crossedPaths.candidates : [];
  const dragX = drag.active ? drag.deltaX : 0;
  const dragIntent = Math.abs(dragX) > 34 ? (dragX > 0 ? "like" : "pass") : "";

  useEffect(() => {
    setIndex(0);
    setPhotoIndex(0);
    setDrag({ active: false, startX: 0, deltaX: 0 });
  }, [profiles, filters]);

  useEffect(() => {
    setPhotoIndex(0);
    setDetailsOpen(false);
  }, [card?.user_id]);

  const showPreviousPhoto = () => {
    if (cardPhotos.length < 2) return;
    setPhotoIndex((current) => (current - 1 + cardPhotos.length) % cardPhotos.length);
  };
  const showNextPhoto = () => {
    if (cardPhotos.length < 2) return;
    setPhotoIndex((current) => (current + 1) % cardPhotos.length);
  };

  const toggleFilter = (id) => {
    setFilters((current) => ({ ...current, [id]: !current[id] }));
  };
  const updateFilterValue = (id, value) => {
    setFilters((current) => ({
      ...current,
      [id]: value,
      ...(id === "distance_km" ? { nearby: true } : {}),
      ...(["age_min", "age_max"].includes(id) ? { age: true } : {}),
    }));
  };

  const clearFilters = () => setFilters(STANDARD_FILTER_DEFAULTS);
  const refreshProfiles = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([refreshDiscover?.(), refreshCrossedPaths?.()]);
    } finally {
      setRefreshing(false);
    }
  };
  const saveCrossedSettings = (patch) => run("crossed-settings", async () => {
    if (!updateCrossedPaths) return;
    setCrossedStatus("");
    await updateCrossedPaths({ ...crossedSettings, ...patch });
  });
  const updateNearbyArea = () => run("crossed-record", async () => {
    if (!recordCrossedPath) return;
    setCrossedStatus("");
    if (crossedUnavailable) {
      setCrossedStatus(crossedPaths?.message || CROSSED_PATH_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!navigator?.geolocation) {
      setCrossedStatus("Location services are unavailable in this browser.");
      return;
    }
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 });
    });
    try {
      await recordCrossedPath({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setCrossedStatus("Nearby area updated. Eligible crossed paths will appear after the privacy delay.");
    } catch (err) {
      setCrossedStatus(apiErrorMessage(err, CROSSED_PATH_UNAVAILABLE_MESSAGE));
    }
  });
  const crossedInterest = (target) => run(`crossed-interest-${profileUserId(target)}`, async () => {
    const targetId = profileUserId(target);
    if (!targetId) return;
    await createDatingSwipe({ target_user_id: targetId, action: "like", mode: "standard" });
    await Promise.allSettled([refreshDiscover?.(), refreshCrossedPaths?.()]);
  });
  const crossedHide = (target) => run(`crossed-hide-${profileUserId(target)}`, async () => {
    const targetId = profileUserId(target);
    if (!targetId) return;
    await createDatingSwipe({ target_user_id: targetId, action: "pass", mode: "standard" });
    await refreshCrossedPaths?.();
  });

  const swipe = (action) => run(`swipe-${action}`, async () => {
    if (!card?.user_id) return;
    setDrag({ active: false, startX: 0, deltaX: 0 });
    const payload = await createDatingSwipe({ target_user_id: card.user_id, action, mode: "standard" });
    setIndex((v) => v + 1);
    if (payload?.data?.match) await refreshDiscover();
  });
  const beginDrag = (event) => {
    if (!card || busy || event.target?.closest?.("button,a,input,textarea,select")) return;
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    setDrag({ active: true, startX: event.clientX, deltaX: 0 });
  };
  const moveDrag = (event) => {
    if (!drag.active) return;
    const nextX = Math.max(-160, Math.min(160, event.clientX - drag.startX));
    if (Math.abs(nextX) > 8) event.preventDefault();
    setDrag((current) => ({ ...current, deltaX: nextX }));
  };
  const endDrag = () => {
    if (!drag.active) return;
    const finalX = drag.deltaX;
    setDrag({ active: false, startX: 0, deltaX: 0 });
    if (finalX > 96) swipe("like");
    if (finalX < -96) swipe("pass");
  };
  const respondToLike = (row, action) => run(`likes-you-${action}-${row.swipe_id}`, async () => {
    const targetId = row?.profile?.user_id;
    if (!targetId) return;
    await createDatingSwipe({ target_user_id: targetId, action, mode: "standard" });
    await refreshDiscover();
  });
  const finishBlock = async (target, source) => {
    if (onAfterBlock) await onAfterBlock({ ...target, source });
    else await refreshDiscover();
  };
  const blockProfile = (target, key = "profile", source = "Standard Dating") => run(`block-profile-${key}`, async () => {
    const targetId = profileUserId(target);
    if (!targetId) return;
    await createDatingSwipe({ target_user_id: targetId, action: "block", mode: "standard" });
    if (card?.user_id === targetId) setIndex((v) => v + 1);
    await finishBlock(target, source);
    setBlockDialog(null);
  });
  const openChat = (match) => run(`chat-${match.dating_match_id}`, async () => {
    const payload = await openDatingMatchChat(match.dating_match_id);
    const channelId = dataOf(payload)?.channel_id;
    openMainMessages(onNavigate, channelId);
  });
  const unmatch = (match) => run(`unmatch-${match.dating_match_id}`, async () => {
    await unmatchDatingMatch(match.dating_match_id);
    await refreshDiscover();
  });
  const blockMatch = (match, other) => run(`block-${match.dating_match_id}`, async () => {
    await blockDatingMatch(match.dating_match_id);
    try { delete window.__openChatChannelId; } catch { /* ignore */ }
    await finishBlock(other || match.other_user || match.peer || match, "Match controls");
    setBlockDialog(null);
  });
  const requestBlock = (target, action, source = "Dating") => {
    const targetId = profileUserId(target);
    if (!targetId) return;
    setBlockDialog({
      name: personName(target),
      source,
      onConfirm: action,
    });
  };
  const reportMatch = (match, other) => {
    onReportUser?.({
      user_id: profileUserId(other),
      name: personName(other),
      entity_type: "dating_match",
      entity_id: match.dating_match_id,
      reason: "Harassment",
      details: "",
    });
  };
  const openCardDetails = (event) => {
    event.stopPropagation();
    if (isMobile) {
      setDetailsOpen(true);
      return;
    }
    openDatingProfile(onNavigate, card);
  };

  return (
    <>
      <div className="dating-standard-grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px,380px) minmax(0,1fr)", gap: 18 }}>
        <div
          className={`dating-swipe-card ${card ? "dating-swipe-card-profile" : "dating-swipe-card-empty"}`}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: card ? 430 : 360,
            minHeight: card ? 560 : 320,
            aspectRatio: card ? "9 / 14.2" : "4 / 3.6",
            alignSelf: "start",
            borderRadius: 28,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "#151720",
            boxShadow: "0 24px 80px rgba(0,0,0,0.36)",
            cursor: card && !busy ? (drag.active ? "grabbing" : "grab") : "default",
            touchAction: "pan-y",
            transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
            transition: drag.active ? "none" : "transform 180ms ease",
          }}
        >
        {card ? activePhoto ? (
          <>
            <SafeImage src={mediaUrl(activePhoto)} alt={`${personName(card)} dating profile`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {cardPhotos.length > 1 && (
              <div style={{ position: "absolute", top: 12, left: "50%", zIndex: 2, display: "flex", gap: 5, transform: "translateX(-50%)" }} aria-label="Profile photos">
                {cardPhotos.slice(0, 5).map((photo, dotIndex) => (
                  <button
                    key={`${photo}-${dotIndex}`}
                    type="button"
                    aria-label={`Show photo ${dotIndex + 1}`}
                    onClick={(event) => { event.stopPropagation(); setPhotoIndex(dotIndex); }}
                    style={{ width: dotIndex === Math.min(photoIndex, 4) ? 20 : 7, height: 5, padding: 0, border: "none", borderRadius: 999, background: dotIndex === Math.min(photoIndex, 4) ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.36)", boxShadow: dotIndex === Math.min(photoIndex, 4) ? "0 0 12px rgba(255,255,255,0.22)" : "none", cursor: "pointer" }}
                  />
                ))}
              </div>
            )}
            {cardPhotos.length > 1 && (
              <>
                <button type="button" aria-label="Previous photo" onClick={(event) => { event.stopPropagation(); showPreviousPhoto(); }} style={{ position: "absolute", inset: "58px auto 150px 0", zIndex: 2, width: "34%", border: "none", background: "transparent", color: "transparent", cursor: "pointer" }}>Previous</button>
                <button type="button" aria-label="Next photo" onClick={(event) => { event.stopPropagation(); showNextPhoto(); }} style={{ position: "absolute", inset: "58px 0 150px auto", zIndex: 2, width: "34%", border: "none", background: "transparent", color: "transparent", cursor: "pointer" }}>Next</button>
              </>
            )}
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "linear-gradient(145deg, rgba(225,29,72,0.22), rgba(124,58,237,0.12), rgba(15,23,42,0.92))" }}>
            <div style={{ width: 92, height: 92, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.74)" }}>
              <DatingIcon s={42} />
            </div>
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, textAlign: "center", background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(15,23,42,0.86))" }}>
            <div>
              <div style={{ width: 68, height: 68, borderRadius: "50%", display: "grid", placeItems: "center", margin: "0 auto 14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.74)" }}>
                <DatingIcon s={30} />
              </div>
              <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 26, fontWeight: 900, margin: 0, textTransform: "uppercase" }}>No profiles available</p>
              <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.62)", fontSize: 13, lineHeight: 1.55, margin: "8px auto 0", maxWidth: 250 }}>{activeFilterCount ? "Clear filters or refresh when more eligible real profiles are available." : "New real dating profiles will appear here after eligible users opt in."}</p>
            </div>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(3,4,8,0.98), rgba(3,4,8,0.72) 19%, rgba(3,4,8,0.08) 58%, rgba(3,4,8,0.2))" }} />
        {card && (
          <>
            <button
              type="button"
              aria-label={`Show ${personName(card)} profile details`}
              title="Show profile details"
              onClick={openCardDetails}
              style={{ position: "absolute", top: 16, right: 16, zIndex: 2, width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(9,10,15,0.68)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", backdropFilter: "blur(12px)" }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg>
            </button>
            <div aria-hidden="true" style={{ position: "absolute", top: 18, left: 18, zIndex: 2, opacity: dragIntent ? 1 : 0, transform: `rotate(${dragIntent === "like" ? -8 : 8}deg)`, borderRadius: 14, padding: "8px 12px", border: `2px solid ${dragIntent === "like" ? "#22c55e" : "#fb7185"}`, color: dragIntent === "like" ? "#bbf7d0" : "#fecdd3", background: "rgba(9,10,15,0.72)", fontFamily: HEAD, fontSize: 28, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", transition: "opacity 120ms ease" }}>
              {dragIntent === "like" ? "Like" : "Pass"}
            </div>
          </>
        )}
        <div className="dating-swipe-content" style={{ position: "absolute", left: 18, right: 18, bottom: 18 }}>
          {card && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 999, background: "rgba(255,255,255,0.92)", color: "#111217", fontFamily: BODY, fontSize: 12, fontWeight: 950, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: card.active_today ? "#22c55e" : "rgba(17,18,23,0.32)" }} />
              {card.active_today ? "Active" : "Dating profile"}
            </div>
          )}
          {card && (
            <p style={{ fontFamily: BODY, color: "#fff", fontSize: 36, lineHeight: 1.02, fontWeight: 950, margin: 0, letterSpacing: "-0.02em", textShadow: "0 2px 18px rgba(0,0,0,0.46)" }}>
              {personName(card)} {cardAge ? <span style={{ fontWeight: 650 }}>{cardAge}</span> : null}
              {card.is_verified && <span aria-label="Verified" title="Verified" style={{ display: "inline-grid", placeItems: "center", width: 24, height: 24, marginLeft: 8, borderRadius: "50%", background: "#fff", color: "#111217", verticalAlign: "middle" }}><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5" /></svg></span>}
            </p>
          )}
          {card && (
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 10 }}>
              {card.distance_km != null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: BODY, color: "#fff", fontSize: 14, fontWeight: 900 }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                  {Number(card.distance_km).toFixed(Number(card.distance_km) < 10 ? 1 : 0)} km away
                </span>
              )}
              {card.location_label && <span style={{ ...tagStyle(), background: "rgba(0,0,0,0.36)", color: "rgba(255,255,255,0.86)" }}>{card.location_label}</span>}
            </div>
          )}
          {card?.bio && <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 1.45, margin: "10px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.bio}</p>}
          {Array.isArray(card?.prompts) && card.prompts.length > 0 && (
            <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
              {card.prompts.slice(0, 2).map((prompt) => <div key={prompt} style={questionTile()}>{prompt}</div>)}
            </div>
          )}
          {(compatibilityScore(card) != null || reasons.length > 0) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {compatibilityScore(card) != null && <span style={{ ...tagStyle(), background: "rgba(34,197,94,0.16)", color: "#bbf7d0" }}>{compatibilityScore(card)}% compatible</span>}
              {reasons.map((reason) => <span key={reason} style={tagStyle()}>{reason}</span>)}
            </div>
          )}
          {explanations.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {explanations.map((item) => (
                <div key={`${item.signal || item.title}-${item.detail}`} style={{ borderRadius: 12, padding: "8px 10px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 11.5, fontWeight: 950, margin: 0 }}>{item.title || "Why this match?"}</p>
                  {item.detail && <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.62)", fontSize: 11, lineHeight: 1.4, margin: "3px 0 0" }}>{item.detail}</p>}
                </div>
              ))}
            </div>
          )}
          {card && (
            <div className="dating-swipe-actions" style={{ display: "flex", gap: 12, marginTop: 18, alignItems: "center", justifyContent: "center", padding: "10px 8px", borderRadius: 999, background: "rgba(3,4,8,0.56)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(14px)" }}>
              <button type="button" aria-label="Pass profile" disabled={busy} onClick={() => swipe("pass")} style={circleBtn("rgba(0,0,0,0.7)", "#fff")}>×</button>
              <button type="button" aria-label="Super like profile" disabled={busy} onClick={() => swipe("super_like")} style={circleBtn("linear-gradient(135deg,#7c3aed,#2563eb)", "#fff")}>★</button>
              <button type="button" aria-label="Like profile" disabled={busy} onClick={() => swipe("like")} style={circleBtn(ACCENT, "#fff")}>♥</button>
              <button type="button" aria-label="Block profile" disabled={busy} onClick={() => requestBlock(card, () => blockProfile(card, card?.user_id || "deck", "Standard deck"), "Standard deck")} style={circleBtn("rgba(225,29,72,0.22)", "#fecdd3")}>!</button>
            </div>
          )}
        </div>
        {card && (
          <div
            className={`dating-profile-sheet ${detailsOpen ? "is-open" : ""}`}
            role="dialog"
            aria-modal="false"
            aria-label={`${personName(card)} profile details`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="dating-profile-sheet-grip" aria-hidden="true" />
            <div className="dating-profile-sheet-head">
              <div>
                <p style={{ fontFamily: BODY, color: "#fff", fontSize: 25, lineHeight: 1.05, fontWeight: 950, margin: 0 }}>
                  {personName(card)} {cardAge ? <span style={{ fontWeight: 650 }}>{cardAge}</span> : null}
                </p>
                <p style={{ ...mutedText(12), marginTop: 6 }}>
                  {card.distance_km != null ? `${Number(card.distance_km).toFixed(Number(card.distance_km) < 10 ? 1 : 0)} km away` : "Distance private"}
                  {card.location_label ? ` · ${card.location_label}` : ""}
                </p>
              </div>
              <button type="button" aria-label="Close profile details" onClick={() => setDetailsOpen(false)} style={circleBtn("rgba(255,255,255,0.08)", "#fff")}>×</button>
            </div>
            {card.bio && (
              <section>
                <p style={eyebrow()}>About</p>
                <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.78)", fontSize: 13.5, lineHeight: 1.55, margin: "6px 0 0" }}>{card.bio}</p>
              </section>
            )}
            {Array.isArray(card.prompts) && card.prompts.length > 0 && (
              <section style={{ marginTop: 14 }}>
                <p style={eyebrow()}>Prompts</p>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {card.prompts.slice(0, 4).map((prompt) => <div key={prompt} style={questionTile()}>{prompt}</div>)}
                </div>
              </section>
            )}
            {(compatibilityScore(card) != null || reasons.length > 0 || explanations.length > 0) && (
              <section style={{ marginTop: 14 }}>
                <p style={eyebrow()}>Why this profile</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
                  {compatibilityScore(card) != null && <span style={{ ...tagStyle(), background: "rgba(34,197,94,0.16)", color: "#bbf7d0" }}>{compatibilityScore(card)}% compatible</span>}
                  {reasons.map((reason) => <span key={reason} style={tagStyle()}>{reason}</span>)}
                </div>
                {explanations.length > 0 && (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {explanations.slice(0, 4).map((item) => (
                      <div key={`${item.signal || item.title}-${item.detail}`} style={{ borderRadius: 14, padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <p style={{ fontFamily: BODY, color: "#fff", fontSize: 12.5, fontWeight: 950, margin: 0 }}>{item.title || "Match signal"}</p>
                        {item.detail && <p style={{ ...mutedText(12), marginTop: 4 }}>{item.detail}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {cardPhotos.length > 1 && (
              <section style={{ marginTop: 14 }}>
                <p style={eyebrow()}>Photos</p>
                <div className="dating-profile-sheet-photos">
                  {cardPhotos.slice(0, 6).map((photo, itemIndex) => (
                    <button key={`${photo}-${itemIndex}`} type="button" aria-label={`Show photo ${itemIndex + 1}`} onClick={() => { setPhotoIndex(itemIndex); setDetailsOpen(false); }} style={{ border: "none", padding: 0, background: "transparent", cursor: "pointer" }}>
                      <SafeImage src={mediaUrl(photo)} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 14, border: itemIndex === photoIndex ? `2px solid ${ACCENT}` : "1px solid rgba(255,255,255,0.12)" }} />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div className="dating-profile-sheet-actions">
              <button type="button" disabled={busy} onClick={() => { setDetailsOpen(false); swipe("pass"); }} style={ghostBtn()}>Pass</button>
              <button type="button" disabled={busy} onClick={() => { setDetailsOpen(false); swipe("super_like"); }} style={ghostBtn()}>Super like</button>
              <button type="button" disabled={busy} onClick={() => { setDetailsOpen(false); swipe("like"); }} style={primaryBtn()}>Like</button>
            </div>
          </div>
        )}
        </div>
        <div className="dating-standard-side">
          <div className="dating-compact-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 14 }}>
            <InfoCard title="Profile completeness" body={`${completion}% complete. More prompts, photos, and food preferences improve recommendations.`} icon={<DatingIcon s={18} />} tone="#7c3aed" />
            <InfoCard title="Likes you" body={likesYou.length ? `${likesYou.length} profile${likesYou.length === 1 ? "" : "s"} waiting for your response.` : "No pending likes yet."} icon={<DatingIcon s={18} />} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              ["discover", "Discover"],
              ["likes", `Likes you (${likesYou.length})`],
              ["matches", `Matches (${matches.length})`],
            ].map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} style={chipBtn(view === id)}>{label}</button>)}
          </div>
          {view === "discover" && (
            <>
              <div style={panel()}>
                <div style={sectionHeaderRow()}>
                  <div>
                    <p style={eyebrow()}>Filters</p>
                    <p style={mutedText(12)}>These update the backend query, so the deck only shows eligible profiles.</p>
                  </div>
                  {activeFilterCount > 0 && <button type="button" onClick={clearFilters} style={ghostBtn()}>Clear ({activeFilterCount})</button>}
                </div>
                <div className="dating-filter-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 12 }}>
                  {STANDARD_FILTERS.map((filter) => {
                    const selected = Boolean(filters[filter.id]);
                    return (
                      <button key={filter.id} type="button" aria-pressed={selected} onClick={() => toggleFilter(filter.id)} style={{ ...miniTile(), textAlign: "left", cursor: "pointer", background: selected ? "rgba(225,29,72,0.16)" : "rgba(0,0,0,0.2)", border: `1px solid ${selected ? "rgba(225,29,72,0.48)" : "rgba(255,255,255,0.08)"}` }}>
                        <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 800, margin: 0 }}>{filter.label}</p>
                        <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 5 }}>{filter.body}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 12 }}>
                  <label style={fieldWrap()}><span style={fieldLabel()}>Distance km</span><input style={inputStyle()} inputMode="numeric" value={filters.distance_km} onChange={(e) => updateFilterValue("distance_km", e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
                  <label style={fieldWrap()}><span style={fieldLabel()}>Min age</span><input style={inputStyle()} inputMode="numeric" value={filters.age_min} onChange={(e) => updateFilterValue("age_min", e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
                  <label style={fieldWrap()}><span style={fieldLabel()}>Max age</span><input style={inputStyle()} inputMode="numeric" value={filters.age_max} onChange={(e) => updateFilterValue("age_max", e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
                <button type="button" onClick={refreshProfiles} disabled={Boolean(busy) || refreshing} style={{ ...ghostBtn(), minWidth: 156 }}>
                  {refreshing && <span aria-hidden="true" style={tinySpinner()} />}
                  {refreshing ? "Refreshing..." : "Refresh profiles"}
                </button>
              </div>
              <div className="dating-crossed-panel" style={panel()}>
                <div className="dating-crossed-header" style={sectionHeaderRow()}>
                  <div>
                    <p style={eyebrow()}>Crossed paths</p>
                    <p style={mutedText(12)}>Opt-in approximate nearby encounters. No exact pins, live routes, exact timestamps, or chat before mutual interest.</p>
                  </div>
                  <span className="dating-crossed-count" style={{ ...tagStyle(), background: crossedSettings.enabled ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.08)", color: crossedSettings.enabled ? "#bbf7d0" : "rgba(255,255,255,0.7)" }}>
                    {crossedSettings.enabled ? `${crossedProfiles.length} delayed match${crossedProfiles.length === 1 ? "" : "es"}` : "Off"}
                  </span>
                </div>
                <div className="dating-crossed-controls" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
                  <button type="button" className="dating-crossed-control" aria-pressed={crossedSettings.enabled} disabled={Boolean(busy)} onClick={() => saveCrossedSettings({ enabled: !crossedSettings.enabled })} style={{ ...miniTile(), cursor: "pointer", textAlign: "left", borderColor: crossedSettings.enabled ? "rgba(34,197,94,0.38)" : "rgba(255,255,255,0.1)", background: crossedSettings.enabled ? "rgba(34,197,94,0.1)" : "rgba(0,0,0,0.2)" }}>
                    <span style={{ display: "block", fontFamily: BODY, color: "#fff", fontWeight: 950, fontSize: 13 }}>{crossedSettings.enabled ? "Crossed Paths is on" : "Turn on Crossed Paths"}</span>
                    <span style={{ display: "block", fontFamily: BODY, color: "rgba(255,255,255,0.52)", fontSize: 12, marginTop: 4 }}>Requires both people to opt in.</span>
                  </button>
                  <button type="button" className="dating-crossed-control" aria-pressed={crossedSettings.incognito} disabled={Boolean(busy) || !crossedSettings.enabled} onClick={() => saveCrossedSettings({ incognito: !crossedSettings.incognito })} style={{ ...miniTile(), cursor: crossedSettings.enabled ? "pointer" : "not-allowed", opacity: crossedSettings.enabled ? 1 : 0.55, textAlign: "left", borderColor: crossedSettings.incognito ? "rgba(225,29,72,0.46)" : "rgba(255,255,255,0.1)", background: crossedSettings.incognito ? "rgba(225,29,72,0.12)" : "rgba(0,0,0,0.2)" }}>
                    <span style={{ display: "block", fontFamily: BODY, color: "#fff", fontWeight: 950, fontSize: 13 }}>Incognito</span>
                    <span style={{ display: "block", fontFamily: BODY, color: "rgba(255,255,255,0.52)", fontSize: 12, marginTop: 4 }}>Hide me from crossed-path discovery.</span>
                  </button>
                  <button type="button" className="dating-crossed-update" disabled={Boolean(busy) || crossedUnavailable || !crossedSettings.enabled || crossedSettings.incognito} onClick={updateNearbyArea} style={{ ...primaryBtn(), opacity: crossedSettings.enabled && !crossedSettings.incognito && !crossedUnavailable ? 1 : 0.55 }}>
                    {busy === "crossed-record" && <span aria-hidden="true" style={tinySpinner()} />}
                    Update nearby area
                  </button>
                </div>
                {crossedMessage && (
                  <p role="status" style={{ ...mutedText(12), color: crossedMessage.toLowerCase().includes("updated") ? "#86efac" : "#fca5a5", marginTop: 10 }}>
                    {crossedMessage}
                  </p>
                )}
                <div className="dating-crossed-map" aria-label="Privacy-safe crossed paths area map" style={{ marginTop: 12, minHeight: 230, borderRadius: 22, border: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(135deg, rgba(244,239,225,0.1), rgba(15,23,42,0.18)), radial-gradient(circle at 50% 46%, rgba(225,29,72,0.22), transparent 13%), radial-gradient(circle at 25% 34%, rgba(37,99,235,0.15), transparent 15%), radial-gradient(circle at 75% 58%, rgba(34,197,94,0.13), transparent 16%), #111318", position: "relative", overflow: "hidden" }}>
                  <svg aria-hidden="true" viewBox="0 0 720 260" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.6 }}>
                    <path d="M-40 72 C120 30 210 102 360 72 C520 40 610 86 760 58" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="18" strokeLinecap="round" />
                    <path d="M-20 184 C150 124 250 208 400 168 C530 134 612 188 744 142" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="16" strokeLinecap="round" />
                    <path d="M105 -20 C135 72 156 146 130 300" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="14" strokeLinecap="round" />
                    <path d="M595 -20 C560 78 540 160 570 300" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="14" strokeLinecap="round" />
                    <path d="M80 130 C230 96 450 92 640 118" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="8 9" />
                  </svg>
                  <div style={{ position: "absolute", left: "50%", top: "48%", width: 18, height: 18, transform: "translate(-50%,-50%)", borderRadius: "50%", background: ACCENT, boxShadow: `0 0 0 14px ${ACCENT}22, 0 0 70px ${ACCENT}55` }} />
                  <div style={{ position: "absolute", left: 18, right: 18, bottom: 16, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 22, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>Approximate area only</p>
                      <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.58)", fontSize: 12.5, lineHeight: 1.5, margin: "4px 0 0" }}>{crossedUnavailable ? "Backend storage needs to be available before Strug can record privacy-safe area buckets." : crossedSettings.enabled ? "People appear after the privacy delay if both sides are eligible." : "Enable Crossed Paths before Strug records privacy-safe area buckets."}</p>
                    </div>
                    <span style={tagStyle()}>{crossedUnavailable ? "Unavailable" : crossedSettings.enabled ? "Delayed visibility" : "Opt-in required"}</span>
                  </div>
                  <div className="dating-crossed-sheet">
                    <span aria-hidden="true" className="dating-crossed-sheet-grip" />
                    <div className="dating-crossed-sheet-head">
                      <div>
                        <p style={{ fontFamily: BODY, color: "#fff", fontSize: 15, fontWeight: 950, margin: 0 }}>Crossed paths nearby</p>
                        <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.58)", fontSize: 12, lineHeight: 1.35, margin: "3px 0 0" }}>
                          {crossedSettings.enabled ? "Approximate area only" : "Turn on Crossed Paths"}
                        </p>
                      </div>
                      <span style={{ ...tagStyle(), flexShrink: 0 }}>{crossedProfiles.length} nearby</span>
                    </div>
                    {crossedProfiles.length > 0 ? (
                      <div className="dating-crossed-card-grid">
                        {crossedProfiles.slice(0, 4).map((item, i) => (
                          <button
                            key={`mobile-${item.crossed_path?.crossed_path_id || item.user_id || i}`}
                            type="button"
                            className="dating-crossed-card"
                            onClick={() => openDatingProfile(onNavigate, item)}
                            aria-label={`Open ${personName(item)} crossed path profile`}
                          >
                            {item.photos?.[0] ? (
                              <SafeImage src={mediaUrl(item.photos[0])} alt="" />
                            ) : (
                              <span className="dating-crossed-card-fallback"><DatingIcon s={24} /></span>
                            )}
                            <span className="dating-crossed-card-shade" />
                            <span className="dating-crossed-card-copy">
                              <span>{personName(item)}{personAge(item) ? `, ${personAge(item)}` : ""}</span>
                              <small>{item.crossed_path?.last_seen_label || item.crossed_path?.shared_area || "Nearby recently"}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.62)", fontSize: 12.5, lineHeight: 1.45, margin: 0 }}>
                        No eligible delayed crossed paths yet. Profiles appear here only after both sides opt in and the privacy delay has passed.
                      </p>
                    )}
                  </div>
                </div>
                {crossedProfiles.length > 0 && (
                  <div className="dating-crossed-list" style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    {crossedProfiles.slice(0, 3).map((item) => (
                      <div key={item.crossed_path?.crossed_path_id || item.user_id} style={{ ...miniTile(), display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 12 }}>
                        <button type="button" onClick={() => openDatingProfile(onNavigate, item)} style={{ background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                          <span style={{ display: "block", fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900 }}>{personName(item)}</span>
                          <span style={{ display: "block", fontFamily: BODY, color: "rgba(255,255,255,0.52)", fontSize: 12, marginTop: 3 }}>{item.crossed_path?.label || "You were both in the same area recently"} · {item.crossed_path?.shared_area || "Approximate area"}</span>
                        </button>
                        <span style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button type="button" disabled={busy} onClick={() => crossedInterest(item)} style={{ ...primaryBtn(), padding: "9px 12px" }}>Interest</button>
                          <button type="button" disabled={busy} onClick={() => crossedHide(item)} style={{ ...ghostBtn(), padding: "9px 12px" }}>Hide</button>
                          <button type="button" disabled={busy} onClick={() => requestBlock(item, () => blockProfile(item, item.user_id, "Crossed paths"), "Crossed paths")} style={{ ...dangerBtn(), padding: "9px 12px" }}>Block</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!crossedProfiles.length && (
                  <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.54)", fontSize: 12.5, lineHeight: 1.55, margin: "12px 0 0" }}>
                    {crossedSettings.enabled ? "No eligible delayed crossed paths yet. Strug only shows people after both sides opt in and the privacy delay has passed." : "This is off by default. Turn it on only if you want privacy-safe crossed-path discovery."}
                  </p>
                )}
              </div>
            </>
          )}
          {view === "likes" && (
            <div style={{ display: "grid", gap: 10 }}>
              {likesYou.length ? likesYou.map((row) => (
                <div key={row.swipe_id || row.profile?.user_id} style={miniTile()}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 42, height: 42, borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "grid", placeItems: "center", color: "#fff" }}>
                      {row.profile?.photos?.[0] ? <SafeImage src={mediaUrl(row.profile.photos[0])} alt={personName(row.profile)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <DatingIcon s={20} />}
                    </div>
                    <div>
                      <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, margin: 0 }}>{personName(row.profile)}</p>
                      <p style={mutedText(12)}>{row.action === "super_like" ? "Sent priority interest" : "Liked your profile"}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button type="button" disabled={busy} onClick={() => respondToLike(row, "like")} style={primaryBtn()}>Like back</button>
                    <button type="button" disabled={busy} onClick={() => respondToLike(row, "pass")} style={ghostBtn()}>Pass</button>
                    <button type="button" disabled={busy} onClick={() => requestBlock(row.profile, () => blockProfile(row.profile, row.swipe_id || row.profile?.user_id, "Likes you"), "Likes you")} style={dangerBtn()}>Block profile</button>
                  </div>
                </div>
              )) : <p style={mutedText(13)}>No real pending likes are available yet.</p>}
            </div>
          )}
          {view === "matches" && (
            <>
              <InfoCard title="Matches" body={matches.length ? `${matches.length} active match${matches.length === 1 ? "" : "es"} ready for chat.` : "Like someone who already liked you to create a match."} icon={<DatingIcon s={18} />} />
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {matches.slice(0, 8).map((match) => {
                  const other = match.other_user || match.peer || match;
                  return (
                    <div key={match.dating_match_id || other?.user_id || personName(other)} style={miniTile()}>
                      <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, margin: 0 }}>{personName(other)}</p>
                      <p style={mutedText(12)}>Mutual match · {match.mode || "standard"}</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <button type="button" disabled={busy} onClick={() => openChat(match)} style={ghostBtn()}>Open chat</button>
                        <button type="button" disabled={busy} onClick={() => reportMatch(match, other)} style={ghostBtn()}>Report</button>
                        <button type="button" disabled={busy} onClick={() => unmatch(match)} style={ghostBtn()}>Unmatch</button>
                        <button type="button" disabled={busy} onClick={() => requestBlock(other, () => blockMatch(match, other), "Match controls")} style={dangerBtn()}>Block</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {error && <p style={errorText()}>{error}</p>}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(blockDialog)}
        title="Block on Strug?"
        message={`This person will not be able to find, message, invite, match, follow, or interact with you across Strug.`}
        confirmLabel="Block on Strug"
        cancelLabel="Cancel"
        danger
        busy={String(busy || "").startsWith("block") || String(busy || "").includes("block")}
        onConfirm={() => blockDialog?.onConfirm?.()}
        onCancel={() => setBlockDialog(null)}
      />
    </>
  );
}

function WorthItMode({ onNavigate, profile, plans, mine, discoverProfiles, refreshWorth, onAfterBlock, onReportSafety }) {
  const { busy, error, run } = useAsyncAction();
  const stripe = useStripe();
  const elements = useElements();
  const [blockDialog, setBlockDialog] = useState(null);
  const [split, setSplit] = useState("50");
  const [addOns, setAddOns] = useState([]);
  const [addOnRules, setAddOnRules] = useState({});
  const [addOnVendorOptions, setAddOnVendorOptions] = useState({});
  const [addOnVendorLoading, setAddOnVendorLoading] = useState({});
  const [budget, setBudget] = useState("80");
  const [venue, setVenue] = useState("");
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [slots, setSlots] = useState([]);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [slotLoading, setSlotLoading] = useState(false);
  const [date, setDate] = useState(todayValue());
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [menuIntent, setMenuIntent] = useState([]);
  const [guestMenuText, setGuestMenuText] = useState("");
  const [guestRidePickupArea, setGuestRidePickupArea] = useState("");
  const [guestRidePickupWindow, setGuestRidePickupWindow] = useState("");
  const [rideForms, setRideForms] = useState({});
  const [addOnPreferenceForms, setAddOnPreferenceForms] = useState({});
  const [vendorAddOns, setVendorAddOns] = useState([]);
  const [vendorAddOnLoading, setVendorAddOnLoading] = useState(false);
  const [replacementNotes, setReplacementNotes] = useState({});
  const [proofFiles, setProofFiles] = useState({});
  const [proofSignatures, setProofSignatures] = useState({});
  const [proofNotes, setProofNotes] = useState({});
  const [deposit, setDeposit] = useState("20");
  const [cancelWindow, setCancelWindow] = useState("24");
  const [attendanceScore, setAttendanceScore] = useState("80");
  const [inviteUserId, setInviteUserId] = useState("");
  const cleanBudget = budgetNumber(budget);
  const minDate = todayValue();
  const dateIsPast = Boolean(date && date < minDate);
  const selectedRestaurant = restaurants.find((item) => String(item.vendor_id) === String(restaurantId)) || null;
  const selectedAddOns = WORTH_ADD_ONS.filter((item) => addOns.includes(item.id));
  const selectedMarketplaceAddOnIds = useMemo(() => addOns.filter((id) => WORTH_SCHEDULED_ADD_ONS.has(id)), [addOns]);
  const selectedMarketplaceAddOnKey = selectedMarketplaceAddOnIds.join("|");
  const addOnMarketplaceLoading = selectedMarketplaceAddOnIds.some((id) => addOnVendorLoading[id]);
  const canPublish = (selectedRestaurant || venue.trim().length >= 2) && date && time && !dateIsPast && cleanBudget > 0;
  const missingMarketplaceAddOn = selectedAddOns.find((item) => WORTH_SCHEDULED_ADD_ONS.has(item.id) && !addOnRules[item.id]?.marketplace_ref_id);
  const canSubmitWorthPlan = canPublish && !addOnMarketplaceLoading && !missingMarketplaceAddOn;
  const organized = mine?.organized || [];
  const invites = mine?.invites || [];
  const interested = mine?.interested || [];
  const currentUserId = profile?.user_id;
  const loadVendorAddOns = useCallback(async () => {
    setVendorAddOnLoading(true);
    try {
      const payload = await getWorthItVendorAddOns();
      const rows = dataOf(payload, []);
      const cleanRows = Array.isArray(rows)
        ? rows.filter((row) => !isObviousTestContent([row?.plan?.restaurant_name, row?.add_on?.vendor_name, row?.add_on?.label].join(" ")))
        : [];
      setVendorAddOns(cleanRows);
    } catch {
      setVendorAddOns([]);
    } finally {
      setVendorAddOnLoading(false);
    }
  }, []);
  const refreshWorthSurfaces = useCallback(async () => {
    await refreshWorth();
    await loadVendorAddOns();
  }, [loadVendorAddOns, refreshWorth]);

  useEffect(() => {
    let alive = true;
    async function loadRestaurants() {
      setRestaurantLoading(true);
      try {
        const payload = await getBookableRestaurants();
        const rows = dataOf(payload, []).filter((item) => !isObviousTestContent([item?.vendor_name, item?.location, item?.description].join(" ")));
        if (alive) setRestaurants(rows);
      } catch {
        if (alive) setRestaurants([]);
      } finally {
        if (alive) setRestaurantLoading(false);
      }
    }
    loadRestaurants();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    loadVendorAddOns();
  }, [loadVendorAddOns]);

  useEffect(() => {
    if (!restaurantId || !date) return undefined;
    let alive = true;
    async function loadSlots() {
      setSlotLoading(true);
      try {
        const payload = await getReservationAvailability({ vendor_id: restaurantId, date, party_size: 2 });
        const nextSlots = dataOf(payload, {})?.slots || [];
        if (alive) {
          setSlots(Array.isArray(nextSlots) ? nextSlots : []);
          if (time && Array.isArray(nextSlots) && !nextSlots.includes(time)) setTime("");
        }
      } catch {
        if (alive) setSlots([]);
      } finally {
        if (alive) setSlotLoading(false);
      }
    }
    loadSlots();
    return () => { alive = false; };
  }, [restaurantId, date, time]);

  useEffect(() => {
    if (!selectedMarketplaceAddOnIds.length) return undefined;
    let alive = true;
    selectedMarketplaceAddOnIds.forEach((id) => {
      if (addOnVendorOptions[id]?.loaded || addOnVendorLoading[id]) return;
      setAddOnVendorLoading((current) => ({ ...current, [id]: true }));
      getWorthItAddOnVendors({ type: id, limit: 24 })
        .then((payload) => {
          const rows = dataOf(payload, []);
          const cleanRows = Array.isArray(rows)
            ? rows.filter((item) => !isObviousTestContent([item?.name, item?.seller_name, item?.location, item?.type].join(" ")))
            : [];
          if (alive) setAddOnVendorOptions((current) => ({ ...current, [id]: { loaded: true, rows: cleanRows } }));
        })
        .catch(() => {
          if (alive) setAddOnVendorOptions((current) => ({ ...current, [id]: { loaded: true, rows: [] } }));
        })
        .finally(() => {
          if (alive) setAddOnVendorLoading((current) => ({ ...current, [id]: false }));
        });
    });
    return () => { alive = false; };
  }, [selectedMarketplaceAddOnKey]);

  const selectRestaurant = (id) => {
    setRestaurantId(id);
    if (!id) setSlots([]);
    const picked = restaurants.find((item) => String(item.vendor_id) === String(id));
    if (picked) setVenue(picked.vendor_name || "");
    setTime("");
  };
  const toggleMenuItem = (item) => {
    setMenuIntent((current) => {
      const exists = current.some((row) => String(row.id) === String(item.id));
      if (exists) return current.filter((row) => String(row.id) !== String(item.id));
      return [...current, { id: item.id, name: item.name, price: item.price, category: item.category }].slice(0, 8);
    });
  };
  const toggleAddOn = (id) => {
    setAddOns((current) => {
      if (!current.includes(id)) return [...current, id];
      setAddOnRules((rules) => {
        const next = { ...rules };
        delete next[id];
        return next;
      });
      return current.filter((item) => item !== id);
    });
  };
  const updateAddOnRule = (id, patch) => {
    setAddOnRules((current) => ({ ...current, [id]: { ...(current[id] || {}), ...patch } }));
  };

  const createPlan = (publish = true) => run("worth-create", async () => {
    if (!canPublish) throw new Error("Add venue, future date, time, and budget first.");
    if (addOnMarketplaceLoading) throw new Error("Live add-on providers are still loading.");
    const missingMarketplace = missingMarketplaceAddOn;
    if (missingMarketplace) throw new Error(`Choose a live ${missingMarketplace.label.toLowerCase()} provider or remove that add-on.`);
    let reservationId = null;
    if (publish && selectedRestaurant?.vendor_id) {
      const reservationPayload = await createReservation({
        vendor_id: selectedRestaurant.vendor_id,
        date,
        time,
        party_size: 2,
        special_notes: [
          "Worth It date plan",
          note,
          menuIntent.length ? `Menu intent: ${menuIntent.map((item) => item.name).join(", ")}` : "",
          selectedAddOns.length ? `Add-ons requested: ${selectedAddOns.map((item) => item.label).join(", ")}` : "",
        ].filter(Boolean).join("\n"),
      });
      reservationId = dataOf(reservationPayload)?.reservation_id ?? null;
      if (!reservationId) throw new Error("Restaurant reservation could not be confirmed.");
    }
    await createWorthItPlan({
      vendor_id: selectedRestaurant?.vendor_id,
      restaurant_name: selectedRestaurant?.vendor_name || venue,
      restaurant_address: selectedRestaurant?.location,
      booking_id: reservationId,
      lat: selectedRestaurant?.lat,
      lng: selectedRestaurant?.long,
      date,
      time,
      budget_amount: cleanBudget,
      payment_split: split,
      deposit_amount: budgetNumber(deposit),
      cancellation_window_hours: Math.max(1, Math.min(Number(cancelWindow) || 24, 168)),
      attendance_score_required: Math.max(0, Math.min(Number(attendanceScore) || 80, 100)),
      host_note: note,
      menu_intent: menuIntent,
      add_ons: buildWorthItAddOns(selectedAddOns, addOnRules, split),
      includes_ride: addOns.includes("ride"),
      includes_flowers: addOns.includes("flowers"),
      publish,
      safety_rules: SAFETY_RAILS.map((rail) => rail.body),
    });
    setVenue("");
    setNote("");
    setMenuIntent([]);
    setAddOnRules({});
    await refreshWorthSurfaces();
  });
  const sendInterest = (plan) => run(`interest-${plan.dating_date_plan_id}`, async () => {
    const preferences = listFromText(guestMenuText, 6).map((item) => ({ type: "menu", note: item }));
    if (plan.includes_ride && guestRidePickupArea.trim()) {
      preferences.push({
        type: "ride_pickup_area",
        note: guestRidePickupArea.trim(),
        privacy: "approximate_until_confirmed",
      });
    }
    if (plan.includes_ride && guestRidePickupWindow.trim()) {
      preferences.push({
        type: "ride_pickup_window",
        note: guestRidePickupWindow.trim(),
        privacy: "preference_only_until_confirmed",
      });
    }
    await sendWorthItInterest(plan.dating_date_plan_id, {
      message: guestMenuText || "I am interested in joining this date.",
      budget_amount: plan.budget_amount,
      menu_preferences: preferences,
    });
    setGuestMenuText("");
    setGuestRidePickupArea("");
    setGuestRidePickupWindow("");
    await refreshWorthSurfaces();
  });
  const updateRideForm = (planId, patch) => {
    setRideForms((current) => ({ ...current, [planId]: { ...(current[planId] || {}), ...patch } }));
  };
  const scheduleDateRide = (plan) => run(`worth-ride-${plan.dating_date_plan_id}`, async () => {
    const form = rideForms[plan.dating_date_plan_id] || {};
    const pickupAddress = String(form.pickup_address || "").trim();
    const dropAddress = String(plan.restaurant_address || plan.vendor?.location || plan.restaurant_name || "").trim();
    const scheduledAt = worthRidePickupIso(plan);
    if (!pickupAddress) throw new Error("Add your pickup address after the date is confirmed.");
    if (!dropAddress) throw new Error("The restaurant address is required before scheduling a ride.");
    if (!scheduledAt) throw new Error("The date plan needs a valid future date and time before scheduling a ride.");
    const ridePayload = await createRideRequest({
      pickup_address: pickupAddress,
      drop_address: dropAddress,
      ...(plan.lat != null && plan.lng != null ? { drop_lat: plan.lat, drop_long: plan.lng } : {}),
      vehicle_type: form.vehicle_type || "economy",
      scheduled_at: scheduledAt,
      purpose: "dating_worth_it",
      dating_date_plan_id: plan.dating_date_plan_id,
    });
    const ride = dataOf(ridePayload) || ridePayload?.ride || ridePayload;
    const rideId = ride?.ride_request_id || ride?.data?.ride_request_id;
    if (!rideId) throw new Error("Ride was created but could not be linked to this date plan.");
    try {
      await linkWorthItRide(plan.dating_date_plan_id, {
        ride_request_id: rideId,
        share_status_with_organizer: form.share_status_with_organizer === true,
      });
    } catch (err) {
      await cancelRide(rideId).catch(() => null);
      throw err;
    }
    updateRideForm(plan.dating_date_plan_id, { pickup_address: "", share_status_with_organizer: false });
    await refreshWorthSurfaces();
  });
  const updateAddOnPreference = (planId, addOnId, patch) => {
    setAddOnPreferenceForms((current) => ({
      ...current,
      [planId]: {
        ...(current[planId] || {}),
        [addOnId]: {
          ...((current[planId] || {})[addOnId] || {}),
          ...patch,
        },
      },
    }));
  };
  const saveAddOnPreferences = (plan) => run(`worth-add-on-prefs-${plan.dating_date_plan_id}`, async () => {
    const form = addOnPreferenceForms[plan.dating_date_plan_id] || {};
    const addOnsForApproval = (Array.isArray(plan?.add_ons) ? plan.add_ons : []).filter((item) => item?.type === "scheduled_date_add_on");
    if (!addOnsForApproval.length) throw new Error("This date plan has no add-ons to approve.");
    const preferences = addOnsForApproval.map((item) => ({
      id: item.id,
      approved: true,
      ...(item.guest_preferences || {}),
      ...(form[item.id] || {}),
    }));
    await updateWorthItAddOnPreferences(plan.dating_date_plan_id, { preferences });
    await refreshWorthSurfaces();
  });
  const reportPlanSafety = (plan, target) => {
    const targetUserId = profileUserId(target);
    onReportSafety?.({
      user_id: targetUserId || undefined,
      name: targetUserId ? personName(target) : (plan.restaurant_name || "Worth It date"),
      entity_type: "dating_date_plan",
      entity_id: plan.dating_date_plan_id,
      reason: "Safety concern",
      details: "",
    });
  };
  const inviteUser = (plan) => run(`invite-${plan.dating_date_plan_id}`, async () => {
    const recipient = Number(inviteUserId);
    if (!recipient) throw new Error("Select or enter a user ID to invite.");
    await inviteToWorthItPlan(plan.dating_date_plan_id, { recipient_user_id: recipient, note: "Would you like to join this Worth It date?" });
    setInviteUserId("");
    await refreshWorthSurfaces();
  });
  const confirmInterest = (interest) => run(`confirm-${interest.dating_date_interest_id}`, async () => {
    await confirmWorthItInterest(interest.dating_date_interest_id);
    await refreshWorthSurfaces();
  });
  const respondInvite = (invite, status) => run(`invite-response-${invite.dating_date_invite_id}`, async () => {
    await respondWorthItInvite(invite.dating_date_invite_id, { status, message: status === "accepted" ? "I am interested in joining this date." : "" });
    await refreshWorthSurfaces();
  });
  const blockWorthProfile = (target, key = "worth", source = "Worth It") => run(`worth-block-${key}`, async () => {
    const targetId = profileUserId(target);
    if (!targetId) return;
    await createDatingSwipe({ target_user_id: targetId, action: "block", mode: "standard" });
    if (onAfterBlock) await onAfterBlock({ ...target, source });
    else await refreshWorthSurfaces();
    setBlockDialog(null);
  });
  const requestWorthBlock = (target, key, source = "Worth It") => {
    if (!profileUserId(target)) return;
    setBlockDialog({
      name: personName(target),
      onConfirm: () => blockWorthProfile(target, key, source),
    });
  };
  const authorizeAddOn = (plan, addOn) => run(`worth-add-on-pay-${plan.dating_date_plan_id}-${addOn.id}`, async () => {
    if (!stripe || !elements) throw new Error("Payment is still loading. Try again in a moment.");
    const card = elements.getElement(CardElement);
    if (!card) throw new Error("Card details are required before authorizing this add-on.");
    const payload = await createWorthItAddOnPaymentIntent(plan.dating_date_plan_id, addOn.id);
    const intent = dataOf(payload) || payload;
    if (!intent?.client_secret) throw new Error("Payment authorization could not be started.");
    const result = await stripe.confirmCardPayment(intent.client_secret, { payment_method: { card } });
    if (result.error) throw new Error(result.error.message || "Payment authorization failed.");
    await confirmWorthItAddOnPayment(plan.dating_date_plan_id, addOn.id, { payment_intent_id: result.paymentIntent.id });
    await refreshWorthSurfaces();
  });
  const respondAddOnVendor = (row, action, extra = {}) => run(`worth-add-on-vendor-${row.plan.dating_date_plan_id}-${row.add_on.id}-${action}`, async () => {
    await respondWorthItAddOnVendor(row.plan.dating_date_plan_id, row.add_on.id, { action, ...extra });
    if (action === "replacement") {
      const key = `${row.plan.dating_date_plan_id}:${row.add_on.id}`;
      setReplacementNotes((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
    await refreshWorthSurfaces();
  });
  const submitAddOnProof = (row) => run(`worth-add-on-proof-${row.plan.dating_date_plan_id}-${row.add_on.id}`, async () => {
    const key = `${row.plan.dating_date_plan_id}:${row.add_on.id}`;
    const file = proofFiles[key];
    const signatureName = String(proofSignatures[key] || "").trim();
    const note = String(proofNotes[key] || "").trim();
    if (!file && !signatureName && !note) throw new Error("Add a proof photo, signature, or delivery note.");
    let proofUrl = "";
    if (file) {
      const uploaded = await uploadDatingPhoto(file);
      const uploadedData = dataOf(uploaded) || uploaded;
      proofUrl = uploadedData?.url || uploadedData?.image_url || uploadedData?.photo_url || uploadedData?.secure_url || "";
      if (!proofUrl) throw new Error("Proof photo upload failed. Try again or add a delivery signature.");
    }
    await submitWorthItAddOnDeliveryProof(row.plan.dating_date_plan_id, row.add_on.id, { proof_url: proofUrl, signature_name: signatureName, note });
    setProofFiles((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setProofSignatures((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setProofNotes((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    await refreshWorthSurfaces();
  });

  return (
    <>
      <div className="dating-two-col dating-worth-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(300px,420px)", gap: 18 }}>
        <div style={panel()}>
        <p style={sectionTitle()}>Create a date plan</p>
        <p style={mutedText(13)}>Create the restaurant/date plan, publish it to eligible users, invite specific users, then choose exactly one person to confirm.</p>
        <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginTop: 18 }}>
          <label style={fieldWrap()}>
            <span style={fieldLabel()}>Bookable restaurant</span>
            <select style={inputStyle()} value={restaurantId} onChange={(e) => selectRestaurant(e.target.value)}>
              <option value="">{restaurantLoading ? "Loading restaurants..." : "Select from live restaurants"}</option>
              {restaurants.map((item) => <option key={item.vendor_id} value={item.vendor_id}>{item.vendor_name}</option>)}
            </select>
          </label>
          <label style={fieldWrap()}><span style={fieldLabel()}>Restaurant or cafe</span><input style={inputStyle(Boolean(selectedRestaurant))} disabled={Boolean(selectedRestaurant)} value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={80} placeholder="Restaurant, cafe, or venue name" /></label>
          <label style={fieldWrap()}><span style={fieldLabel()}>Date</span><ThemedDatePicker value={date} min={minDate} onChange={setDate} error={dateIsPast} /></label>
          <label style={fieldWrap()}>
            <span style={fieldLabel()}>Time</span>
            <ThemedTimePicker
              value={time}
              options={restaurantId ? slots : TIME_OPTIONS}
              loading={slotLoading}
              disabled={Boolean(restaurantId && !slots.length)}
              onChange={setTime}
            />
          </label>
          <label style={fieldWrap()}><span style={fieldLabel()}>Guest budget</span><input style={inputStyle()} inputMode="decimal" value={budget} onChange={(e) => setBudget(normalizeBudgetInput(e.target.value))} /></label>
          <label style={fieldWrap()}><span style={fieldLabel()}>Deposit</span><input style={inputStyle()} inputMode="decimal" value={deposit} onChange={(e) => setDeposit(normalizeBudgetInput(e.target.value))} /></label>
          <label style={fieldWrap()}><span style={fieldLabel()}>Cancel window hrs</span><input style={inputStyle()} inputMode="numeric" value={cancelWindow} onChange={(e) => setCancelWindow(e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
          <label style={fieldWrap()}><span style={fieldLabel()}>Attendance score</span><input style={inputStyle()} inputMode="numeric" value={attendanceScore} onChange={(e) => setAttendanceScore(e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
        </div>
        <label style={{ ...fieldWrap(), marginTop: 12 }}><span style={fieldLabel()}>Host note</span><textarea style={{ ...inputStyle(), minHeight: 72, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you planning to order, pay, or include?" /></label>
        <div id="worth-it-menu-intent" style={sectionBlock()}>
          <div style={sectionHeaderRow()}>
            <div>
              <p style={eyebrow()}>Menu intent</p>
              <p style={mutedText(12)}>{selectedRestaurant ? "Select items from the live restaurant menu before publishing." : "Select a live restaurant to browse menu items for the date plan."}</p>
            </div>
            <span style={tagStyle()}>{menuIntent.length} selected</span>
          </div>
          {selectedRestaurant?.menu?.length > 0 ? (
            <div className="dating-menu-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 10 }}>
              {selectedRestaurant.menu.slice(0, 8).map((item) => {
                const active = menuIntent.some((row) => String(row.id) === String(item.id));
                return <button key={item.id} type="button" aria-pressed={active} onClick={() => toggleMenuItem(item)} style={{ ...miniTile(), textAlign: "left", cursor: "pointer", borderColor: active ? "rgba(249,115,22,0.54)" : "rgba(255,255,255,0.08)", background: active ? "rgba(249,115,22,0.14)" : "rgba(0,0,0,0.2)" }}><span style={{ fontFamily: BODY, color: "#fff", fontSize: 12, fontWeight: 900 }}>{item.name}</span><p style={mutedText(11)}>{item.price != null ? `$${Number(item.price).toFixed(2)}` : item.category || "Menu"}</p></button>;
              })}
            </div>
          ) : (
            <div style={{ ...miniTile(), marginTop: 10 }}>
              <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, margin: 0 }}>{selectedRestaurant ? "No menu items available" : "No restaurant selected"}</p>
              <p style={mutedText(12)}>{selectedRestaurant ? "You can still publish with a host note and budget." : "Choose a bookable restaurant above, then come back here to pick food preferences."}</p>
            </div>
          )}
        </div>
        <div className="dating-chip-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          {["100", "50", "guest"].map((v) => <button key={v} type="button" aria-pressed={split === v} onClick={() => setSplit(v)} style={chipBtn(split === v)}>{v === "100" ? "I pay 100%" : v === "50" ? "Split 50/50" : "Guest pays own"}</button>)}
        </div>
        <div style={sectionBlock()}>
          <p style={eyebrow()}>Optional add-ons</p>
          <p style={{ ...mutedText(12), marginTop: 4 }}>
            Flowers, gifts, dessert, and tickets sync to the date venue after guest confirmation. Ride setup unlocks only after the guest privately adds pickup details.
          </p>
          <div className="dating-chip-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {WORTH_ADD_ONS.map((item) => <button key={item.id} type="button" aria-pressed={addOns.includes(item.id)} onClick={() => toggleAddOn(item.id)} style={chipBtn(addOns.includes(item.id))}>{item.label}</button>)}
          </div>
          {selectedAddOns.some((item) => WORTH_SCHEDULED_ADD_ONS.has(item.id)) && (
            <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
              {selectedAddOns.filter((item) => WORTH_SCHEDULED_ADD_ONS.has(item.id)).map((item) => {
                const rules = addOnRules[item.id] || {};
                const marketplaceRows = addOnVendorOptions[item.id]?.rows || [];
                const marketplaceValue = rules.marketplace_source && rules.marketplace_ref_id ? `${rules.marketplace_source}:${rules.marketplace_ref_id}` : "";
                return (
                  <div key={item.id} style={miniTile()}>
                    <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, margin: 0 }}>{item.label}</p>
                    <label style={{ ...fieldWrap(), marginTop: 8 }}>
                      <span style={fieldLabel()}>Live provider</span>
                      <select
                        style={inputStyle()}
                        value={marketplaceValue}
                        disabled={Boolean(addOnVendorLoading[item.id])}
                        onChange={(e) => {
                          const [source, refId] = e.target.value.split(":");
                          const selected = marketplaceRows.find((row) => row.source === source && String(row.ref_id) === String(refId));
                          updateAddOnRule(item.id, selected ? {
                            marketplace_source: selected.source,
                            marketplace_ref_id: selected.ref_id,
                            vendor_name: selected.name,
                            vendor_type: selected.type,
                            vendor_image_url: selected.image_url,
                          } : {
                            marketplace_source: "",
                            marketplace_ref_id: "",
                            vendor_name: "",
                            vendor_type: "",
                            vendor_image_url: "",
                          });
                        }}
                      >
                        <option value="">{addOnVendorLoading[item.id] ? "Loading live providers..." : marketplaceRows.length ? `Choose ${item.label.toLowerCase()} provider` : "No live providers available"}</option>
                        {marketplaceRows.map((row) => (
                          <option key={row.id} value={`${row.source}:${row.ref_id}`}>
                            {row.name}{row.type ? ` · ${row.type}` : ""}{row.price != null ? ` · $${Number(row.price).toFixed(2)}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ ...fieldWrap(), marginTop: 8 }}>
                      <span style={fieldLabel()}>Deliver to</span>
                      <select style={inputStyle()} value={rules.recipient_rule || "venue"} onChange={(e) => updateAddOnRule(item.id, { recipient_rule: e.target.value })}>
                        <option value="venue">Restaurant / venue</option>
                        <option value="organizer">Organizer</option>
                        <option value="guest">Guest, only with consent</option>
                      </select>
                    </label>
                    <label style={{ ...fieldWrap(), marginTop: 8 }}>
                      <span style={fieldLabel()}>Payment</span>
                      <select style={inputStyle()} value={rules.payment_owner || (split === "100" ? "host" : split === "guest" ? "guest" : "split")} onChange={(e) => updateAddOnRule(item.id, { payment_owner: e.target.value })}>
                        <option value="host">Host pays</option>
                        <option value="split">Split</option>
                        <option value="guest">Guest pays</option>
                      </select>
                    </label>
                    <label style={{ ...fieldWrap(), marginTop: 8 }}>
                      <span style={fieldLabel()}>Window before date</span>
                      <select style={inputStyle()} value={rules.delivery_window_minutes_before || 45} onChange={(e) => updateAddOnRule(item.id, { delivery_window_minutes_before: Number(e.target.value) })}>
                        <option value={30}>30 minutes</option>
                        <option value={45}>45 minutes</option>
                        <option value={60}>60 minutes</option>
                      </select>
                    </label>
                    <label style={{ ...fieldWrap(), marginTop: 8 }}>
                      <span style={fieldLabel()}>Budget cap</span>
                      <input style={inputStyle()} type="number" min="0" step="1" value={rules.budget_cap || ""} onChange={(e) => updateAddOnRule(item.id, { budget_cap: e.target.value })} placeholder="Optional" />
                    </label>
                    <button type="button" aria-pressed={Boolean(rules.surprise_to_guest)} onClick={() => updateAddOnRule(item.id, { surprise_to_guest: !rules.surprise_to_guest })} style={{ ...chipBtn(Boolean(rules.surprise_to_guest)), marginTop: 8 }}>
                      Surprise for guest
                    </button>
                    {rules.vendor_name && <p style={{ ...mutedText(11), marginTop: 8 }}>Selected: {rules.vendor_name}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="dating-compact-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 16 }}>
          <InfoCard title="No-show protection" body={`Deposit ${budgetNumber(deposit).toFixed(2)} · cancel ${cancelWindow || 24}h before · attendance ${attendanceScore || 80}%+`} icon={<ReservationsIcon s={18} />} tone="#f97316" />
          <InfoCard title="Payment split" body={split === "100" ? "Host pays full bill." : split === "50" ? "Host and guest split 50/50." : "Guest pays their own bill."} icon={<FoodIcon s={18} />} tone="#22c55e" />
        </div>
        <div className="dating-action-row" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <button type="button" onClick={() => createPlan(true)} disabled={!canSubmitWorthPlan || busy} style={{ ...primaryBtn("#f97316"), opacity: canSubmitWorthPlan ? 1 : 0.5 }}>Publish date</button>
          <button type="button" onClick={() => createPlan(false)} disabled={!canSubmitWorthPlan || busy} style={{ ...ghostBtn(), opacity: canSubmitWorthPlan ? 1 : 0.5 }}>Save draft</button>
          {missingMarketplaceAddOn && <span style={{ ...tagStyle(), alignSelf: "center", background: "rgba(244,63,94,0.12)", color: "#fecdd3" }}>Choose a live {missingMarketplaceAddOn.label.toLowerCase()} provider</span>}
          {addOnMarketplaceLoading && <span style={{ ...tagStyle(), alignSelf: "center" }}>Loading add-on providers</span>}
          <button type="button" onClick={() => { rememberReturnTo("__reservationReturnTo", "dating"); navigate(onNavigate, "reservations"); }} style={ghostBtn()}><ReservationsIcon s={16} /> Book restaurant</button>
          {addOns.includes("ride") && <span style={{ ...tagStyle(), alignSelf: "center", background: "rgba(59,130,246,0.12)", color: "#bfdbfe" }}><RideshareIcon s={14} /> Ride setup unlocks after guest confirmation</span>}
          <button type="button" onClick={() => {
            if (selectedRestaurant?.menu?.length) {
              document.getElementById("worth-it-menu-intent")?.scrollIntoView({ behavior: "smooth", block: "center" });
              return;
            }
            rememberReturnTo("__foodReturnTo", "dating");
            navigate(onNavigate, "food");
          }} style={ghostBtn()}><FoodIcon s={16} /> {selectedRestaurant?.menu?.length ? "Select menu items" : "Browse full menu"}</button>
        </div>
        {error && <p style={errorText()}>{error}</p>}
        </div>
        <div style={panel("rgba(249,115,22,0.16)", "rgba(249,115,22,0.24)")}>
        <p style={eyebrow()}>Date marketplace</p>
        <p style={sectionTitle(30)}>Open Worth It dates</p>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label style={fieldWrap()}><span style={fieldLabel()}>Your menu preferences</span><textarea style={{ ...inputStyle(), minHeight: 72, resize: "vertical" }} value={guestMenuText} onChange={(e) => setGuestMenuText(e.target.value)} placeholder="What would you likely order? Dietary preferences? Budget notes?" /></label>
          <label style={fieldWrap()}>
            <span style={fieldLabel()}>Pickup area for ride dates</span>
            <input
              style={inputStyle()}
              value={guestRidePickupArea}
              onChange={(e) => setGuestRidePickupArea(e.target.value)}
              maxLength={140}
              placeholder="Optional approximate area, exact pickup after confirmation"
            />
          </label>
          <label style={fieldWrap()}>
            <span style={fieldLabel()}>Preferred pickup window</span>
            <input
              style={inputStyle()}
              value={guestRidePickupWindow}
              onChange={(e) => setGuestRidePickupWindow(e.target.value)}
              maxLength={140}
              placeholder="Optional, e.g. 30-45 minutes before reservation"
            />
          </label>
          {plans.length ? plans.slice(0, 4).map((plan) => <DatePlanCard key={plan.dating_date_plan_id} plan={plan} actionLabel="Send interest" onAction={() => sendInterest(plan)} dangerLabel="Block organizer" busy={busy} onDanger={() => requestWorthBlock(plan.organizer || { user_id: plan.organizer_id }, `plan-${plan.dating_date_plan_id}`, "Worth It marketplace")} />) : <p style={mutedText(13)}>No public Worth It dates available yet.</p>}
        </div>
        </div>
        <div className="dating-plan-grid" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        {organized.map((plan) => (
          <div key={plan.dating_date_plan_id} style={panel()}>
            <DatePlanCard
              plan={plan}
              safetyLabel={plan.status !== "cancelled" && plan.confirmed_guest_id ? "Report safety issue" : undefined}
              onSafety={() => {
                const confirmedInterest = (plan.interests || []).find((interest) => Number(interest.user_id) === Number(plan.confirmed_guest_id));
                reportPlanSafety(plan, confirmedInterest?.user || { user_id: plan.confirmed_guest_id });
              }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {plan.status === "draft" && <button type="button" disabled={busy} onClick={() => run(`publish-${plan.dating_date_plan_id}`, async () => { await publishWorthItPlan(plan.dating_date_plan_id); await refreshWorthSurfaces(); })} style={{ ...primaryBtn(), opacity: busy ? 0.65 : 1 }}>Publish</button>}
              {plan.status !== "cancelled" && <button type="button" disabled={busy} onClick={() => run(`cancel-${plan.dating_date_plan_id}`, async () => { await cancelWorthItPlan(plan.dating_date_plan_id); await refreshWorthSurfaces(); })} style={{ ...ghostBtn(), opacity: busy ? 0.65 : 1 }}>Cancel</button>}
            </div>
            <div className="dating-inline-form" style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input style={inputStyle()} value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value.replace(/\D/g, ""))} placeholder={`Invite user ID${discoverProfiles[0]?.user_id ? `, e.g. ${discoverProfiles[0].user_id}` : ""}`} />
              <button type="button" disabled={!inviteUserId || plan.status !== "published" || busy} onClick={() => inviteUser(plan)} style={{ ...primaryBtn("#7c3aed"), opacity: inviteUserId && plan.status === "published" ? 1 : 0.5 }}>Invite</button>
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {(plan.interests || []).length ? plan.interests.map((interest) => (
                <div key={interest.dating_date_interest_id} style={miniTile()}>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900 }}>{personName(interest.user)} · {interest.status}</p>
                  <p style={mutedText(12)}>{interest.message || "Interested in this date."}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {interest.status === "interested" && <button type="button" onClick={() => confirmInterest(interest)} style={primaryBtn("#22c55e")}>Confirm guest</button>}
                    <button type="button" disabled={busy} onClick={() => requestWorthBlock(interest.user || { user_id: interest.user_id }, `interest-${interest.dating_date_interest_id}`, "Worth It interest")} style={dangerBtn()}>Block profile</button>
                  </div>
                </div>
              )) : <p style={mutedText(12)}>No guest interests yet.</p>}
            </div>
            <WorthItRidePanel
              plan={plan}
              currentUserId={currentUserId}
              form={rideForms[plan.dating_date_plan_id] || {}}
              busy={busy}
              onChange={(patch) => updateRideForm(plan.dating_date_plan_id, patch)}
              onSchedule={() => scheduleDateRide(plan)}
            />
          </div>
        ))}
        {interested.map((row) => (
          row?.plan ? (
            <div key={`interested-${row.dating_date_interest_id}`} style={panel()}>
              <p style={eyebrow()}>Your Worth It interest</p>
              <DatePlanCard
                plan={row.plan}
                safetyLabel={row.plan.status !== "cancelled" ? "Report safety issue" : undefined}
                onSafety={() => reportPlanSafety(row.plan, row.plan.organizer || { user_id: row.plan.organizer_id })}
              />
              <p style={{ ...mutedText(12), marginTop: 10 }}>{row.status === "confirmed" ? "You are confirmed. If a ride is included, add your exact pickup privately below." : "Waiting for the organizer to confirm one guest."}</p>
              <WorthItAddOnPreferencesPanel
                plan={row.plan}
                form={addOnPreferenceForms[row.plan.dating_date_plan_id] || {}}
                busy={busy}
                onChange={(addOnId, patch) => updateAddOnPreference(row.plan.dating_date_plan_id, addOnId, patch)}
                onSave={() => saveAddOnPreferences(row.plan)}
              />
              <WorthItRidePanel
                plan={row.plan}
                currentUserId={currentUserId}
                form={rideForms[row.plan.dating_date_plan_id] || {}}
                busy={busy}
                onChange={(patch) => updateRideForm(row.plan.dating_date_plan_id, patch)}
                onSchedule={() => scheduleDateRide(row.plan)}
              />
            </div>
          ) : null
        ))}
        <div style={panel()}>
          <p style={eyebrow()}>Your invitations</p>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {invites.length ? invites.map((invite) => (
              <div key={invite.dating_date_invite_id} style={miniTile()}>
                <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900 }}>{invite.plan?.restaurant_name || "Worth It date"} · {invite.status}</p>
                <p style={mutedText(12)}>{invite.plan?.date ? `${new Date(invite.plan.date).toLocaleDateString()} at ${invite.plan.time}` : "Date details available after confirmation."}</p>
                {invite.status === "sent" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button type="button" disabled={busy} onClick={() => respondInvite(invite, "accepted")} style={primaryBtn("#22c55e")}>Accept invite</button>
                    <button type="button" disabled={busy} onClick={() => respondInvite(invite, "declined")} style={ghostBtn()}>Decline</button>
                  </div>
                )}
                <button type="button" disabled={busy} onClick={() => requestWorthBlock(invite.plan?.organizer || { user_id: invite.plan?.organizer_id }, `invite-${invite.dating_date_invite_id}`, "Worth It invitation")} style={{ ...dangerBtn(), marginTop: 10 }}>Block organizer</button>
              </div>
            )) : <p style={mutedText(12)}>No Worth It invitations yet.</p>}
          </div>
        </div>
        <div style={panel()}>
          <p style={eyebrow()}>Your interests</p>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {interested.length ? interested.map((interest) => (
              <div key={interest.dating_date_interest_id} style={miniTile()}>
                <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900 }}>{interest.plan?.restaurant_name || "Worth It date"} · {interest.status}</p>
                <p style={mutedText(12)}>{interest.plan?.date ? `${new Date(interest.plan.date).toLocaleDateString()} at ${interest.plan.time}` : "Date details pending."}</p>
                <button type="button" disabled={busy} onClick={() => requestWorthBlock(interest.plan?.organizer || { user_id: interest.plan?.organizer_id }, `sent-interest-${interest.dating_date_interest_id}`, "Worth It sent interest")} style={{ ...dangerBtn(), marginTop: 10 }}>Block organizer</button>
              </div>
            )) : <p style={mutedText(12)}>No sent interests yet.</p>}
          </div>
        </div>
        <WorthItPaymentPanel
          organized={organized}
          interested={interested}
          currentUserId={currentUserId}
          busy={busy}
          onAuthorize={authorizeAddOn}
        />
        <WorthItVendorFulfillmentPanel
          rows={vendorAddOns}
          loading={vendorAddOnLoading}
          busy={busy}
          replacementNotes={replacementNotes}
          setReplacementNotes={setReplacementNotes}
          proofFiles={proofFiles}
          setProofFiles={setProofFiles}
          proofSignatures={proofSignatures}
          setProofSignatures={setProofSignatures}
          proofNotes={proofNotes}
          setProofNotes={setProofNotes}
          onVendorAction={respondAddOnVendor}
          onProof={submitAddOnProof}
        />
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(blockDialog)}
        title="Block on Strug?"
        message={`This person will not be able to find, message, invite, match, follow, or interact with you across Strug.`}
        confirmLabel="Block on Strug"
        cancelLabel="Cancel"
        danger
        busy={String(busy || "").includes("block")}
        onConfirm={() => blockDialog?.onConfirm?.()}
        onCancel={() => setBlockDialog(null)}
      />
    </>
  );
}

function TrueLoveMode({ profile, refreshProfile, onAfterBlock }) {
  const { busy, error, run, setError } = useAsyncAction();
  const [activeSignalId, setActiveSignalId] = useState("food");
  const [showSignalEditor, setShowSignalEditor] = useState(false);
  const [blockDialog, setBlockDialog] = useState(null);
  const [activeReviewId, setActiveReviewId] = useState("life_goals");
  const [showReviewEditor, setShowReviewEditor] = useState(false);
  const [reviewDraft, setReviewDraft] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [contextCandidate, setContextCandidate] = useState(null);
  const [trueMatches, setTrueMatches] = useState([]);
  const [trueLoading, setTrueLoading] = useState(false);
  const activeSignal = TRUE_SIGNALS.find((signal) => signal.id === activeSignalId) || TRUE_SIGNALS[0];
  const activeReviewFactor = TRUE_REVIEW_FACTORS.find((factor) => factor.id === activeReviewId) || TRUE_REVIEW_FACTORS[0];
  const signalSummary = (signal) => {
    if (signal.primaryKey === "prompts") {
      return textFromList(profile?.prompts) || signal.value;
    }
    return signalText(profile, signal.primaryKey) || signal.value;
  };
  const signalItems = (signal) => {
    const primary = signal.primaryKey === "prompts" ? profile?.prompts : profile?.lifestyle_signals?.[signal.primaryKey];
    const secondary = profile?.lifestyle_signals?.[signal.secondaryKey];
    return [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])].filter(Boolean).slice(0, 4);
  };
  const [signalDraft, setSignalDraft] = useState({ primary: "", secondary: "" });
  const optIn = Boolean(profile?.true_love_opt_in);
  const controls = useMemo(() => trueLoveControls(profile), [profile]);
  const reviewControls = useMemo(() => trueLoveReviewControls(profile), [profile]);
  const reviewNotes = useMemo(() => trueLoveReviewNotes(profile), [profile]);
  const feedback = useMemo(() => trueLoveFeedback(profile), [profile]);
  const savedIds = useMemo(() => (Array.isArray(feedback.saved_ids) ? feedback.saved_ids.map(String) : []), [feedback.saved_ids]);
  const hiddenIds = useMemo(() => (Array.isArray(feedback.hidden_ids) ? feedback.hidden_ids.map(String) : []), [feedback.hidden_ids]);
  const contextRequestedIds = useMemo(() => (Array.isArray(feedback.context_requested_ids) ? feedback.context_requested_ids.map(String) : []), [feedback.context_requested_ids]);
  const energyMode = feedback.energy || "balanced";
  const hasAnyEnabledSignal = Object.values(controls).some(Boolean);
  const enabledSignalCount = TRUE_SIGNALS.filter((signal) => controls[signal.id]).length;
  const activeSignalCount = optIn ? enabledSignalCount : 0;
  const filledSignalCount = TRUE_SIGNALS.filter((signal) => signalItems(signal).length).length;
  const reviewedFactorCount = TRUE_REVIEW_FACTORS.filter((factor) => listFromText(reviewNotes[factor.id]).length).length;
  const lockedFactorCount = TRUE_REVIEW_FACTORS.filter((factor) => factor.status === "locked").length;
  const readinessScore = Math.round(((optIn ? 1 : 0) + (enabledSignalCount ? 1 : 0) + (filledSignalCount ? 1 : 0)) / 3 * 100);
  const reviewPostureScore = Math.round(((optIn ? 1 : 0) + (enabledSignalCount ? 1 : 0) + (filledSignalCount ? 1 : 0) + (reviewedFactorCount ? 1 : 0)) / 4 * 100);
  const visibleTrueMatches = useMemo(() => trueMatches.filter((candidate) => !hiddenIds.includes(String(profileUserId(candidate)))), [hiddenIds, trueMatches]);
  const matchGroups = useMemo(() => trueLoveMatchGroups(visibleTrueMatches, profile, energyMode), [energyMode, profile, visibleTrueMatches]);
  const comparedMatches = useMemo(() => visibleTrueMatches.filter((candidate) => compareIds.includes(String(profileUserId(candidate)))), [compareIds, visibleTrueMatches]);
  const activeItems = signalItems(activeSignal);
  const setupSteps = [
    { label: "Consent", body: optIn ? "True Love is active" : "Turn on when ready", done: optIn },
    { label: "Signals", body: `${enabledSignalCount} selected`, done: enabledSignalCount > 0 },
    { label: "Details", body: `${filledSignalCount} filled`, done: filledSignalCount > 0 },
  ];

  const fetchTrueLoveMatches = useCallback(async () => {
    if (!optIn || !hasAnyEnabledSignal) {
      setTrueMatches([]);
      return;
    }
    setTrueLoading(true);
    setError("");
    try {
      const payload = await getDatingDiscover({ mode: "true-love", limit: 6 });
      setTrueMatches(dataOf(payload, []).filter((p) => !isObviousTestContent([p?.display_name, p?.name, p?.bio].join(" "))));
    } catch (err) {
      setTrueMatches([]);
      setError(apiErrorMessage(err, "Could not load True Love recommendations."));
    } finally {
      setTrueLoading(false);
    }
  }, [hasAnyEnabledSignal, optIn, setError]);

  useEffect(() => {
    if (activeSignal.primaryKey === "prompts") {
      setSignalDraft({
        primary: textFromList(profile?.prompts),
        secondary: signalText(profile, activeSignal.secondaryKey),
      });
      return;
    }
    setSignalDraft({
      primary: signalText(profile, activeSignal.primaryKey),
      secondary: signalText(profile, activeSignal.secondaryKey),
    });
  }, [activeSignal.primaryKey, activeSignal.secondaryKey, profile]);

  useEffect(() => {
    fetchTrueLoveMatches();
  }, [fetchTrueLoveMatches]);

  useEffect(() => {
    setReviewDraft(textFromList(reviewNotes[activeReviewId]));
  }, [activeReviewId, reviewNotes]);

  const toggleTrueLove = () => run("true-love", async () => {
    const nextOptIn = !optIn;
    await updateDatingProfile({
      true_love_opt_in: nextOptIn,
      adult_confirmed: true,
      lifestyle_signals: {
        ...(profile?.lifestyle_signals || {}),
        true_love_controls: controls,
      },
    });
    await refreshProfile();
  });
  const toggleSignalControl = (signalId) => run(`true-signal-toggle-${signalId}`, async () => {
    await updateDatingProfile({
      adult_confirmed: true,
      lifestyle_signals: {
        ...(profile?.lifestyle_signals || {}),
        true_love_controls: {
          ...controls,
          [signalId]: !controls[signalId],
        },
      },
    });
    await refreshProfile();
  });
  const saveSignal = () => run(`true-signal-${activeSignal.id}`, async () => {
    const nextSignals = {
      ...(profile?.lifestyle_signals || {}),
      true_love_controls: controls,
      [activeSignal.secondaryKey]: listFromText(signalDraft.secondary, 12),
    };
    const payload = {
      lifestyle_signals: nextSignals,
      adult_confirmed: true,
    };
    if (activeSignal.primaryKey === "prompts") {
      payload.prompts = listFromText(signalDraft.primary, 8);
    } else {
      nextSignals[activeSignal.primaryKey] = listFromText(signalDraft.primary, 12);
    }
    await updateDatingProfile(payload);
    await refreshProfile();
    setShowSignalEditor(false);
  });
  const openSignalEditor = (signalId) => {
    setActiveSignalId(signalId);
    setShowSignalEditor(true);
  };
  const toggleReviewFactor = (factor) => run(`review-factor-${factor.id}`, async () => {
    if (factor.status === "locked") {
      setActiveReviewId(factor.id);
      setShowReviewEditor(true);
      return;
    }
    await updateDatingProfile({
      adult_confirmed: true,
      lifestyle_signals: {
        ...(profile?.lifestyle_signals || {}),
        true_love_controls: controls,
        true_love_review_controls: {
          ...reviewControls,
          [factor.id]: !reviewControls[factor.id],
        },
      },
    });
    await refreshProfile();
  });
  const openReviewEditor = (factorId) => {
    setActiveReviewId(factorId);
    setShowReviewEditor(true);
  };
  const saveReviewFactor = () => run(`review-save-${activeReviewFactor.id}`, async () => {
    await updateDatingProfile({
      adult_confirmed: true,
      lifestyle_signals: {
        ...(profile?.lifestyle_signals || {}),
        true_love_controls: controls,
        true_love_review_controls: reviewControls,
        true_love_review_notes: {
          ...reviewNotes,
          [activeReviewFactor.id]: listFromText(reviewDraft, 10),
        },
      },
    });
    await refreshProfile();
    setShowReviewEditor(false);
  });
  const sendTrueLoveInterest = (candidate, action = "like") => run(`true-love-interest-${profileUserId(candidate) || "profile"}-${action}`, async () => {
    const targetId = profileUserId(candidate);
    if (!targetId) return;
    await createDatingSwipe({ target_user_id: targetId, action, mode: "true-love" });
    await fetchTrueLoveMatches();
  });
  const persistTrueLoveFeedback = (patch) => updateDatingProfile({
    adult_confirmed: true,
    lifestyle_signals: {
      ...(profile?.lifestyle_signals || {}),
      true_love_controls: controls,
      true_love_review_controls: reviewControls,
      true_love_review_notes: reviewNotes,
      true_love_feedback: {
        ...feedback,
        ...patch,
      },
    },
  });
  const saveTrueLoveProfile = (candidate) => run(`true-love-save-${profileUserId(candidate) || "profile"}`, async () => {
    const targetId = profileUserId(candidate);
    if (!targetId) return;
    const target = String(targetId);
    const nextSaved = savedIds.includes(target) ? savedIds.filter((id) => id !== target) : [...savedIds, target];
    await persistTrueLoveFeedback({ saved_ids: nextSaved });
    await refreshProfile();
  });
  const hideTrueLoveProfile = (candidate) => run(`true-love-hide-${profileUserId(candidate) || "profile"}`, async () => {
    const targetId = profileUserId(candidate);
    if (!targetId) return;
    const target = String(targetId);
    if (!hiddenIds.includes(target)) await persistTrueLoveFeedback({ hidden_ids: [...hiddenIds, target] });
    await createDatingSwipe({ target_user_id: targetId, action: "pass", mode: "true-love" });
    setCompareIds((ids) => ids.filter((id) => id !== target));
    setTrueMatches((matches) => matches.filter((item) => String(profileUserId(item) || "") !== target));
    await refreshProfile();
    await fetchTrueLoveMatches();
  });
  const requestMoreContext = (candidate) => run(`true-love-context-${profileUserId(candidate) || "profile"}`, async () => {
    const targetId = profileUserId(candidate);
    if (!targetId) return;
    const target = String(targetId);
    if (!contextRequestedIds.includes(target)) await persistTrueLoveFeedback({ context_requested_ids: [...contextRequestedIds, target] });
    await refreshProfile();
    setContextCandidate(candidate);
  });
  const showDifferentEnergy = () => run("true-love-energy", async () => {
    const order = ["balanced", "food", "routine", "different"];
    const next = order[(order.indexOf(energyMode) + 1) % order.length] || "balanced";
    await persistTrueLoveFeedback({ energy: next });
    await refreshProfile();
  });
  const toggleCompare = (candidate) => {
    const targetId = profileUserId(candidate);
    if (!targetId) return;
    const target = String(targetId);
    setCompareIds((ids) => ids.includes(target) ? ids.filter((id) => id !== target) : [...ids, target].slice(-3));
  };
  const blockTrueLoveProfile = (candidate) => run(`true-love-block-${profileUserId(candidate) || "profile"}`, async () => {
    const targetId = profileUserId(candidate);
    if (!targetId) return;
    const target = String(targetId);
    await createDatingSwipe({ target_user_id: targetId, action: "block", mode: "standard" });
    if (!hiddenIds.includes(target)) await persistTrueLoveFeedback({ hidden_ids: [...hiddenIds, target] });
    setCompareIds((ids) => ids.filter((id) => id !== target));
    setTrueMatches((matches) => matches.filter((item) => String(profileUserId(item) || "") !== target));
    if (onAfterBlock) await onAfterBlock({ ...candidate, source: "True Love" });
    else {
      await refreshProfile();
      await fetchTrueLoveMatches();
    }
    setBlockDialog(null);
  });
  const requestTrueLoveBlock = (candidate) => {
    if (!profileUserId(candidate)) return;
    setBlockDialog({
      name: personName(candidate),
      onConfirm: () => blockTrueLoveProfile(candidate),
    });
  };

  return (
    <>
      <div className="dating-two-col dating-true-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(300px,380px)", gap: 18, alignItems: "start" }}>
        <div style={{ ...panel(), padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 24, background: "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(225,29,72,0.08) 45%, rgba(9,10,15,0))", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <p style={eyebrow()}>Consent-based matching</p>
                <p style={sectionTitle(36)}>True Love profile intelligence</p>
                <p style={{ ...mutedText(14), maxWidth: 720, marginTop: 8 }}>
                  Fully opt in before Strug uses deeper compatibility signals. You choose which safe categories can help matching: food, videos, shopping, rides, events, music, and lifestyle.
                </p>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "8px 12px", background: optIn ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.06)", border: `1px solid ${optIn ? "rgba(16,185,129,0.32)" : "rgba(255,255,255,0.1)"}`, color: optIn ? "#86efac" : "rgba(255,255,255,0.68)", fontFamily: BODY, fontSize: 12, fontWeight: 900 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: optIn ? "#22c55e" : "rgba(255,255,255,0.28)" }} />
                {optIn ? "Enabled" : "Off"}
              </span>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            <button
              type="button"
              aria-pressed={optIn}
              disabled={busy}
              onClick={toggleTrueLove}
              style={{
                width: "100%",
                minHeight: 78,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                textAlign: "left",
                borderRadius: 18,
                padding: "16px 18px",
                cursor: busy ? "default" : "pointer",
                border: `1px solid ${optIn ? "rgba(16,185,129,0.42)" : "rgba(124,58,237,0.38)"}`,
                background: optIn ? "rgba(16,185,129,0.11)" : "rgba(124,58,237,0.13)",
                boxShadow: optIn ? "0 16px 46px rgba(16,185,129,0.08)" : "0 16px 46px rgba(124,58,237,0.1)",
                color: "#fff",
              }}
            >
              <span>
                <span style={{ display: "block", fontFamily: BODY, fontSize: 15, fontWeight: 950 }}>{optIn ? "True Love Mode is active" : "Activate True Love Mode"}</span>
                <span style={{ display: "block", fontFamily: BODY, fontSize: 12.5, color: "rgba(255,255,255,0.58)", marginTop: 4 }}>{optIn ? `${activeSignalCount} signal${activeSignalCount === 1 ? "" : "s"} active. Tap to pause deep compatibility matching.` : `${enabledSignalCount} signal${enabledSignalCount === 1 ? "" : "s"} ready. Turn on the mode when you want Strug to use them.`}</span>
              </span>
              <span style={{ width: 52, height: 30, borderRadius: 999, padding: 3, boxSizing: "border-box", background: optIn ? "#22c55e" : "rgba(255,255,255,0.14)", flexShrink: 0 }}>
                <span style={{ display: "block", width: 24, height: 24, borderRadius: "50%", background: "#fff", transform: optIn ? "translateX(22px)" : "translateX(0)", transition: "transform 0.18s ease" }} />
              </span>
            </button>

            <div className="dating-compact-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 14 }}>
              {setupSteps.map((step, index) => (
                <div key={step.label} style={{ borderRadius: 16, padding: 13, background: step.done ? "rgba(16,185,129,0.09)" : "rgba(255,255,255,0.04)", border: `1px solid ${step.done ? "rgba(16,185,129,0.24)" : "rgba(255,255,255,0.08)"}`, display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: step.done ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.06)", color: step.done ? "#86efac" : "rgba(255,255,255,0.62)", fontFamily: BODY, fontSize: 11, fontWeight: 950 }}>{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <span style={{ display: "block", fontFamily: BODY, color: "#fff", fontSize: 12.5, fontWeight: 950 }}>{step.label}</span>
                    <span style={{ display: "block", fontFamily: BODY, color: "rgba(255,255,255,0.56)", fontSize: 11.5, marginTop: 2 }}>{step.body}</span>
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 20 }}>
              <div>
                <p style={{ fontFamily: BODY, color: "#fff", fontSize: 15, fontWeight: 950, margin: 0 }}>Choose what Strug can use</p>
                <p style={{ ...mutedText(12), marginTop: 5 }}>Turn on only the categories you are comfortable with. Add details where you want better match reasons.</p>
              </div>
              <span style={{ borderRadius: 999, padding: "7px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.68)", fontFamily: BODY, fontSize: 11, fontWeight: 900 }}>
                {activeSignalCount}/{TRUE_SIGNALS.length} active · {filledSignalCount} filled
              </span>
            </div>

            <div className="dating-true-signal-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, marginTop: 14 }}>
              {TRUE_SIGNALS.map((s, index) => {
                const controlOn = Boolean(controls[s.id]);
                const activeForMatching = optIn && controlOn;
                const items = signalItems(s);
                return (
                <div
                  key={s.label}
                  style={{ textAlign: "left", borderRadius: 16, padding: 12, background: activeForMatching ? `linear-gradient(135deg, ${s.tone}18, rgba(255,255,255,0.035))` : "rgba(255,255,255,0.035)", border: `1px solid ${activeSignalId === s.id ? `${s.tone}aa` : controlOn ? `${s.tone}42` : "rgba(255,255,255,0.08)"}`, color: "#fff", boxShadow: activeSignalId === s.id ? `0 10px 28px ${s.tone}12` : "none", outline: activeSignalId === s.id ? `1px solid ${s.tone}24` : "none", outlineOffset: 2, display: "grid", gap: 10 }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      <span style={{ width: 32, height: 32, borderRadius: 12, display: "grid", placeItems: "center", background: `${s.tone}20`, color: s.tone, fontFamily: BODY, fontWeight: 950, fontSize: 12, flexShrink: 0 }}>{String(index + 1).padStart(2, "0")}</span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13.5, fontWeight: 950, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</p>
                        <p style={{ fontFamily: BODY, color: items.length ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.46)", fontSize: 10.5, fontWeight: 850, margin: "2px 0 0", textTransform: "uppercase", letterSpacing: 0 }}>{items.length ? "Details saved" : "Needs details"}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-pressed={controlOn}
                      aria-label={`${controlOn ? "Disable" : "Enable"} ${s.label}`}
                      disabled={busy}
                      onClick={() => toggleSignalControl(s.id)}
                      style={{ minWidth: 66, height: 30, borderRadius: 999, padding: "3px 5px 3px 9px", border: `1px solid ${controlOn ? `${s.tone}88` : "rgba(255,255,255,0.14)"}`, background: controlOn ? `${s.tone}22` : "rgba(255,255,255,0.055)", color: controlOn ? "#fff" : "rgba(255,255,255,0.56)", cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontFamily: BODY, fontSize: 10.5, fontWeight: 950, flexShrink: 0 }}
                    >
                      {controlOn ? "On" : "Off"}
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: controlOn ? s.tone : "rgba(255,255,255,0.18)", display: "block", boxShadow: controlOn ? `0 0 0 3px ${s.tone}20` : "none" }} />
                    </button>
                  </div>
                  <div>
                    <p style={{ ...mutedText(11.5), marginTop: 0, minHeight: 18 }}>{signalSummary(s)}</p>
                    <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.075)", overflow: "hidden", marginTop: 8 }}>
                      {items.length > 0 && <div style={{ width: "100%", height: "100%", borderRadius: 999, background: controlOn ? s.tone : "rgba(255,255,255,0.22)" }} />}
                    </div>
                  </div>
                  {items.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {items.slice(0, 3).map((item) => <span key={item} style={{ ...tagStyle(), background: `${s.tone}1f`, color: "#fff" }}>{item}</span>)}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                    <button type="button" onClick={() => openSignalEditor(s.id)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 30, borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.055)", padding: "0 10px", fontFamily: BODY, fontSize: 11.5, color: "#fff", fontWeight: 950, cursor: "pointer" }}>Edit <span aria-hidden="true">→</span></button>
                    <span style={{ fontFamily: BODY, fontSize: 11, color: activeForMatching ? "#86efac" : controlOn ? "rgba(255,255,255,0.66)" : "rgba(255,255,255,0.42)", fontWeight: 850 }}>{activeForMatching ? "Used in matches" : controlOn ? "Saved until mode is on" : "Not used"}</span>
                  </div>
                </div>
                );
              })}
            </div>
            <div style={{ marginTop: 18, borderRadius: 18, padding: 14, background: "linear-gradient(135deg, rgba(124,58,237,0.08), rgba(255,255,255,0.025))", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 13, alignItems: "center" }}>
                <div aria-hidden="true" style={{ width: 54, height: 54, borderRadius: "50%", background: `conic-gradient(#7c3aed 0 ${reviewPostureScore}%, rgba(255,255,255,0.08) ${reviewPostureScore}% 100%)`, display: "grid", placeItems: "center", boxShadow: "inset 0 0 0 8px rgba(14,15,20,0.98)" }}>
                  <span style={{ fontFamily: BODY, color: "#fff", fontSize: 11, fontWeight: 950 }}>{reviewPostureScore}%</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontFamily: BODY, color: "#fff", fontSize: 14, fontWeight: 950, margin: 0 }}>Compatibility controls</p>
                      <p style={{ ...mutedText(11.5), marginTop: 3 }}>Safe signals are usable. Ethnicity and income stay review-only.</p>
                    </div>
                    <span style={{ borderRadius: 999, padding: "6px 9px", background: "rgba(225,29,72,0.12)", border: "1px solid rgba(225,29,72,0.24)", color: "#fecdd3", fontFamily: BODY, fontSize: 10.5, fontWeight: 950 }}>
                      0 sensitive filters active
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 9, marginTop: 11 }}>
                    {[
                      ["Signals", Math.round((activeSignalCount / TRUE_SIGNALS.length) * 100), "#10b981"],
                      ["Details", Math.round((reviewedFactorCount / TRUE_REVIEW_FACTORS.length) * 100), "#38bdf8"],
                      ["Review-only", Math.round((lockedFactorCount / TRUE_REVIEW_FACTORS.length) * 100), "#f97316"],
                    ].map(([label, percent, color]) => (
                      <div key={label} style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontFamily: BODY, color: "rgba(255,255,255,0.62)", fontSize: 10, fontWeight: 850 }}>{label}</span>
                          <span style={{ fontFamily: BODY, color, fontSize: 10, fontWeight: 950 }}>{percent}%</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.075)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(4, percent)}%`, height: "100%", borderRadius: 999, background: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {TRUE_REVIEW_FACTORS.map((factor) => {
                  const notes = listFromText(reviewNotes[factor.id], 2);
                  const canUseForMatching = factor.status !== "locked" && reviewControls[factor.id];
                  return (
                    <div
                      key={factor.id}
                      style={{ borderRadius: 999, border: `1px solid ${canUseForMatching ? `${factor.tone}66` : factor.status === "locked" ? "rgba(249,115,22,0.24)" : "rgba(255,255,255,0.1)"}`, background: canUseForMatching ? `${factor.tone}18` : "rgba(255,255,255,0.045)", padding: "5px", display: "inline-flex", alignItems: "center", gap: 5, color: "#fff", fontFamily: BODY, fontSize: 11.5, fontWeight: 900 }}
                    >
                      <button
                        type="button"
                        onClick={() => openReviewEditor(factor.id)}
                        style={{ border: 0, background: "transparent", padding: "3px 4px", display: "inline-flex", alignItems: "center", gap: 7, color: "#fff", fontFamily: BODY, fontSize: 11.5, fontWeight: 900, cursor: "pointer" }}
                      >
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: factor.tone }} />
                        {factor.label}
                        {notes.length > 0 && <span style={{ color: "rgba(255,255,255,0.5)" }}>· {notes.length}</span>}
                      </button>
                      {factor.status === "locked" ? (
                        <span style={{ borderRadius: 999, padding: "5px 8px", background: "rgba(249,115,22,0.12)", color: "#fdba74", fontFamily: BODY, fontSize: 10.5, fontWeight: 950 }}>Review only</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleReviewFactor(factor)}
                          aria-pressed={canUseForMatching}
                          style={{ border: `1px solid ${canUseForMatching ? `${factor.tone}66` : "rgba(255,255,255,0.1)"}`, background: canUseForMatching ? `${factor.tone}22` : "rgba(255,255,255,0.055)", color: canUseForMatching ? "#fff" : "rgba(255,255,255,0.58)", borderRadius: 999, padding: "5px 8px", fontFamily: BODY, fontSize: 10.5, fontWeight: 950, cursor: busy ? "default" : "pointer" }}
                        >
                          {canUseForMatching ? "On" : "Off"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: 22, borderRadius: 18, padding: 16, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <p style={eyebrow()}>Fluid compatibility</p>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 15, fontWeight: 950, margin: "5px 0 0" }}>Multiple meaningful matches</p>
                  <p style={{ ...mutedText(12), marginTop: 5 }}>Compatibility changes with new interactions, preferences, and safe behavior signals. No one is presented as the only answer.</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button type="button" onClick={showDifferentEnergy} disabled={busy || trueLoading || !optIn || !hasAnyEnabledSignal} style={ghostBtn()}>
                    {busy === "true-love-energy" && <span aria-hidden="true" style={tinySpinner()} />}
                    {energyMode === "balanced" ? "Show different energy" : `Energy: ${energyMode}`}
                  </button>
                  <button type="button" onClick={fetchTrueLoveMatches} disabled={busy || trueLoading || !optIn || !hasAnyEnabledSignal} style={ghostBtn()}>
                    {trueLoading && <span aria-hidden="true" style={tinySpinner()} />}
                    {trueLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>
              {!optIn ? (
                <p style={{ ...mutedText(13), marginTop: 14 }}>Turn on True Love Mode to see compatibility recommendations.</p>
              ) : !hasAnyEnabledSignal ? (
                <p style={{ ...mutedText(13), marginTop: 14 }}>Enable at least one signal card to start matching.</p>
              ) : trueLoading ? (
                <p style={{ ...mutedText(13), marginTop: 14 }}>Loading safe recommendations...</p>
              ) : matchGroups.length ? (
                <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                    {[
                      ["Choices", visibleTrueMatches.length, "#ec4899"],
                      ["Live signals", activeSignalCount, "#10b981"],
                      ["Current lens", energyMode === "balanced" ? "Balanced" : energyMode, "#8b5cf6"],
                    ].map(([label, value, color]) => (
                      <div key={label} style={{ borderRadius: 14, padding: 12, background: `${color}10`, border: `1px solid ${color}2b` }}>
                        <p style={{ fontFamily: HEAD, color, fontSize: 22, fontWeight: 900, margin: 0 }}>{value}</p>
                        <p style={{ ...mutedText(11), marginTop: 2 }}>{label}</p>
                      </div>
                    ))}
                  </div>
                  {comparedMatches.length > 0 && (
                    <div style={{ borderRadius: 16, padding: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <div>
                          <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13.5, fontWeight: 950, margin: 0 }}>Compare options</p>
                          <p style={{ ...mutedText(11.5), marginTop: 3 }}>Compare up to three people without treating one as the only answer.</p>
                        </div>
                        <button type="button" onClick={() => setCompareIds([])} style={{ ...ghostBtn(), minHeight: 34, padding: "8px 11px" }}>Clear</button>
                      </div>
                      <div className="dating-compact-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginTop: 10 }}>
                        {comparedMatches.map((candidate) => {
                          const score = compatibilityScore(candidate);
                          const reasons = compatibilityReasons(profile, candidate);
                          return (
                            <div key={`compare-${profileUserId(candidate)}`} style={{ borderRadius: 12, padding: 10, background: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.08)" }}>
                              <p style={{ fontFamily: BODY, color: "#fff", fontSize: 12.5, fontWeight: 950, margin: 0 }}>{personName(candidate)}</p>
                              <p style={{ ...mutedText(11), marginTop: 2 }}>{score != null ? `${score}% alignment` : "Alignment pending"}</p>
                              <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.075)", overflow: "hidden", marginTop: 7 }}>
                                {score != null && <div style={{ width: `${Math.max(4, score)}%`, height: "100%", background: "#ec4899" }} />}
                              </div>
                              <p style={{ ...mutedText(11), marginTop: 7 }}>{reasons[0] || "More context can be requested."}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {matchGroups.map((group) => (
                    <div key={group.id} style={{ borderRadius: 16, padding: 12, background: "rgba(0,0,0,0.16)", border: `1px solid ${group.tone}2b` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13.5, fontWeight: 950, margin: 0 }}>{group.title}</p>
                          <p style={{ ...mutedText(11.5), marginTop: 3 }}>{group.subtitle}</p>
                        </div>
                        <span style={{ ...tagStyle(), background: `${group.tone}18`, color: "#fff" }}>{group.items.length} options</span>
                      </div>
                      <div className="dating-compact-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 10 }}>
                        {group.items.map((candidate) => {
                          const reasons = compatibilityReasons(profile, candidate);
                          const explanations = compatibilityExplanations(candidate);
                          const score = compatibilityScore(candidate);
                          const targetId = String(profileUserId(candidate) || "");
                          const isSaved = savedIds.includes(targetId);
                          const isCompared = compareIds.includes(targetId);
                          const askedContext = contextRequestedIds.includes(targetId);
                          return (
                            <div key={`${group.id}-${targetId || personName(candidate)}`} style={{ ...miniTile(), borderColor: `${group.tone}26` }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <div style={{ width: 46, height: 46, borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 }}>
                                  {candidate.photos?.[0] ? <SafeImage src={mediaUrl(candidate.photos[0])} alt={personName(candidate)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <DatingIcon s={22} />}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{personName(candidate)}</p>
                                  <p style={mutedText(12)}>{score != null ? `${score}% alignment` : "Alignment pending"}</p>
                                </div>
                              </div>
                              <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.075)", overflow: "hidden", marginTop: 10 }}>
                                {score != null && <div style={{ width: `${Math.max(4, score)}%`, height: "100%", borderRadius: 999, background: group.tone }} />}
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                                {reasons.slice(0, 3).map((reason) => <span key={reason} style={tagStyle()}>{reason}</span>)}
                              </div>
                              {explanations[0]?.detail && <p style={{ ...mutedText(12), marginTop: 10 }}>{explanations[0].detail}</p>}
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                                <button type="button" disabled={busy} onClick={() => sendTrueLoveInterest(candidate, "like")} style={primaryBtn()}>Explore</button>
                                <button type="button" disabled={busy} onClick={() => sendTrueLoveInterest(candidate, "super_like")} style={ghostBtn()}>Priority interest</button>
                                <button type="button" disabled={busy} onClick={() => toggleCompare(candidate)} style={ghostBtn()}>{isCompared ? "Compared" : "Compare"}</button>
                                <button type="button" disabled={busy} onClick={() => saveTrueLoveProfile(candidate)} style={ghostBtn()}>{isSaved ? "Saved" : "Save"}</button>
                                <button type="button" disabled={busy} onClick={() => requestMoreContext(candidate)} style={ghostBtn()}>{askedContext ? "Context requested" : "Request context"}</button>
                                <button type="button" disabled={busy} onClick={() => hideTrueLoveProfile(candidate)} style={ghostBtn()}>Hide</button>
                                <button type="button" disabled={busy} onClick={() => requestTrueLoveBlock(candidate)} style={dangerBtn()}>Block profile</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ ...mutedText(13), marginTop: 14 }}>No compatible profiles are available yet. Try enabling more safe signals or refresh later.</p>
              )}
            </div>
            {error && <p style={errorText()}>{error}</p>}
          </div>
        </div>

        <div className="dating-sticky-panel" style={{ ...panel(), position: "sticky", top: 16 }}>
          <p style={eyebrow()}>Privacy dashboard</p>
          <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 28, fontWeight: 900, textTransform: "uppercase", margin: "8px 0 6px" }}>You control every signal</p>
          <p style={mutedText(13)}>No hidden categories. No exact location. True Love only uses a safe category when both people allowed it.</p>
          <div className="dating-compact-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 18 }}>
            <div style={{ borderRadius: 16, padding: 14, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.24)" }}>
              <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 28, fontWeight: 900, margin: 0 }}>{activeSignalCount}</p>
              <p style={{ ...mutedText(11.5), marginTop: 2 }}>active now</p>
            </div>
            <div style={{ borderRadius: 16, padding: 14, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.24)" }}>
              <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 28, fontWeight: 900, margin: 0 }}>{enabledSignalCount}</p>
              <p style={{ ...mutedText(11.5), marginTop: 2 }}>ready signals</p>
            </div>
            <div style={{ borderRadius: 16, padding: 14, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.24)" }}>
              <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 28, fontWeight: 900, margin: 0 }}>{reviewedFactorCount}</p>
              <p style={{ ...mutedText(11.5), marginTop: 2 }}>reviewed factors</p>
            </div>
            <div style={{ borderRadius: 16, padding: 14, background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.24)" }}>
              <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 28, fontWeight: 900, margin: 0 }}>0</p>
              <p style={{ ...mutedText(11.5), marginTop: 2 }}>sensitive filters</p>
            </div>
          </div>
          <div style={{ borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginTop: 12 }}>
            <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>Feedback loop</p>
            <p style={{ ...mutedText(12), marginTop: 6 }}>Likes, hides, saved profiles, context requests, date plans, profile edits, and blocks are saved as feedback signals for future ranking.</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              <span style={tagStyle()}>{savedIds.length} saved</span>
              <span style={tagStyle()}>{hiddenIds.length} hidden</span>
              <span style={tagStyle()}>{contextRequestedIds.length} context requests</span>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontFamily: BODY, fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.62)" }}>
              <span>Readiness</span>
              <span>{readinessScore}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 7 }}>
              <div style={{ height: "100%", width: `${readinessScore}%`, borderRadius: 999, background: "linear-gradient(90deg,#e11d48,#7c3aed,#10b981)" }} />
            </div>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {[
              ["Opt-in first", optIn ? "True Love Mode is active for this account." : "Signals are saved, but matching is paused until you activate the mode."],
              ["Mutual consent", "A match reason appears only if both profiles enabled that same signal."],
              ["Explainable results", "Recommendations show plain-language reasons instead of hidden scoring."],
              ["Approximate location", "Exact location is not exposed through True Love matching."],
            ].map(([title, body]) => (
              <div key={title} style={{ borderRadius: 14, padding: 13, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>{title}</p>
                <p style={{ ...mutedText(12), marginTop: 5 }}>{body}</p>
              </div>
            ))}
            <div style={{ borderRadius: 14, padding: 14, background: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.24)" }}>
              <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>Sensitive categories are disabled</p>
              <p style={{ ...mutedText(12), marginTop: 6 }}>True Love Mode will not use {SENSITIVE_SIGNAL_LABELS.join(", ")} or similar categories for filtering unless legal review and explicit approval happen first.</p>
            </div>
          </div>
        </div>
      </div>
      {showSignalEditor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${activeSignal.label}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowSignalEditor(false);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 238, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)", display: "grid", placeItems: "center", padding: 18 }}
        >
          <div style={{ width: "min(720px, 100%)", maxHeight: "86vh", overflowY: "auto", borderRadius: 24, border: `1px solid ${activeSignal.tone}45`, background: "linear-gradient(160deg, rgba(22,13,20,0.98), rgba(9,10,15,0.98))", boxShadow: "0 28px 90px rgba(0,0,0,0.62)" }}>
            <div style={{ padding: 18, borderBottom: "1px solid rgba(255,255,255,0.08)", background: `linear-gradient(135deg, ${activeSignal.tone}1f, rgba(255,255,255,0.02))`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <p style={eyebrow()}>{activeSignal.label}</p>
                <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 30, fontWeight: 900, textTransform: "uppercase", margin: "5px 0 0" }}>Edit match signal</p>
                <p style={{ ...mutedText(12), marginTop: 5 }}>Use short comma-separated values. These are private and only power explainable recommendations when True Love Mode is enabled.</p>
              </div>
              <button type="button" onClick={() => setShowSignalEditor(false)} aria-label="Close signal editor" style={{ width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontFamily: BODY, fontSize: 18, fontWeight: 900 }}>×</button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                <span style={{ borderRadius: 999, padding: "7px 10px", background: `${activeSignal.tone}1f`, color: activeSignal.tone, fontFamily: BODY, fontSize: 11, fontWeight: 950 }}>{activeItems.length ? `${activeItems.length} saved` : "Private signal"}</span>
                <span style={{ fontFamily: BODY, color: "rgba(255,255,255,0.54)", fontSize: 12, fontWeight: 800 }}>Saved values appear on the card after save.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                <label style={fieldWrap()}>
                  <span style={fieldLabel()}>{activeSignal.primaryLabel}</span>
                  <textarea
                    value={signalDraft.primary}
                    onChange={(event) => setSignalDraft((current) => ({ ...current, primary: event.target.value }))}
                    placeholder={activeSignal.primaryPlaceholder}
                    style={{ ...inputStyle(), minHeight: 120, resize: "vertical" }}
                  />
                </label>
                <label style={fieldWrap()}>
                  <span style={fieldLabel()}>{activeSignal.secondaryLabel}</span>
                  <textarea
                    value={signalDraft.secondary}
                    onChange={(event) => setSignalDraft((current) => ({ ...current, secondary: event.target.value }))}
                    placeholder={activeSignal.secondaryPlaceholder}
                    style={{ ...inputStyle(), minHeight: 120, resize: "vertical" }}
                  />
                </label>
              </div>
              {(signalDraft.primary || signalDraft.secondary) && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  {[...listFromText(signalDraft.primary, 6), ...listFromText(signalDraft.secondary, 6)].slice(0, 8).map((item) => (
                    <span key={item} style={{ ...tagStyle(), background: `${activeSignal.tone}22`, color: "#fff" }}>{item}</span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <button type="button" onClick={() => setSignalDraft({ primary: "", secondary: "" })} disabled={busy} style={ghostBtn()}>Clear fields</button>
                <button type="button" onClick={saveSignal} disabled={busy} style={primaryBtn(activeSignal.tone)}>{busy === `true-signal-${activeSignal.id}` ? "Saving..." : `Save ${activeSignal.label}`}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showReviewEditor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${activeReviewFactor.label}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowReviewEditor(false);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 239, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)", display: "grid", placeItems: "center", padding: 18 }}
        >
          <div style={{ width: "min(680px, 100%)", maxHeight: "86vh", overflowY: "auto", borderRadius: 24, border: `1px solid ${activeReviewFactor.tone}45`, background: "linear-gradient(160deg, rgba(18,14,22,0.98), rgba(9,10,15,0.98))", boxShadow: "0 28px 90px rgba(0,0,0,0.62)" }}>
            <div style={{ padding: 18, borderBottom: "1px solid rgba(255,255,255,0.08)", background: `linear-gradient(135deg, ${activeReviewFactor.tone}1f, rgba(255,255,255,0.02))`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <p style={eyebrow()}>{activeReviewFactor.group}</p>
                <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 30, fontWeight: 900, textTransform: "uppercase", margin: "5px 0 0" }}>{activeReviewFactor.label}</p>
                <p style={{ ...mutedText(12), marginTop: 5 }}>{activeReviewFactor.description}</p>
              </div>
              <button type="button" onClick={() => setShowReviewEditor(false)} aria-label="Close factor editor" style={{ width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontFamily: BODY, fontSize: 18, fontWeight: 900 }}>×</button>
            </div>
            <div style={{ padding: 18 }}>
              {activeReviewFactor.status === "locked" ? (
                <div style={{ borderRadius: 16, padding: 14, background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.28)", marginBottom: 14 }}>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>Review-only factor</p>
                  <p style={{ ...mutedText(12), marginTop: 6 }}>These notes are for product/legal fairness review. They are not used to match, rank, exclude, or target dating profiles.</p>
                </div>
              ) : (
                <div style={{ borderRadius: 16, padding: 14, background: `${activeReviewFactor.tone}12`, border: `1px solid ${activeReviewFactor.tone}32`, marginBottom: 14 }}>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>Consent-based factor</p>
                  <p style={{ ...mutedText(12), marginTop: 6 }}>This can support "Why this match?" only when the user opted in and entered the context themselves.</p>
                </div>
              )}
              <label style={fieldWrap()}>
                <span style={fieldLabel()}>Notes</span>
                <textarea
                  value={reviewDraft}
                  onChange={(event) => setReviewDraft(event.target.value)}
                  placeholder={activeReviewFactor.prompt}
                  style={{ ...inputStyle(), minHeight: 150, resize: "vertical" }}
                />
              </label>
              {reviewDraft && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  {listFromText(reviewDraft, 8).map((item) => (
                    <span key={item} style={{ ...tagStyle(), background: `${activeReviewFactor.tone}22`, color: "#fff" }}>{item}</span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <button type="button" onClick={() => setReviewDraft("")} disabled={busy} style={ghostBtn()}>Clear</button>
                <button type="button" onClick={saveReviewFactor} disabled={busy} style={primaryBtn(activeReviewFactor.tone)}>{busy === `review-save-${activeReviewFactor.id}` ? "Saving..." : "Save review notes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {contextCandidate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Compatibility context for ${personName(contextCandidate)}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setContextCandidate(null);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)", display: "grid", placeItems: "center", padding: 18 }}
        >
          <div style={{ width: "min(620px, 100%)", maxHeight: "86vh", overflowY: "auto", borderRadius: 24, border: "1px solid rgba(236,72,153,0.34)", background: "linear-gradient(160deg, rgba(24,13,24,0.98), rgba(9,10,15,0.98))", boxShadow: "0 28px 90px rgba(0,0,0,0.62)" }}>
            <div style={{ padding: 18, borderBottom: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg, rgba(236,72,153,0.18), rgba(124,58,237,0.08))", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <p style={eyebrow()}>More context requested</p>
                <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 30, fontWeight: 900, textTransform: "uppercase", margin: "5px 0 0" }}>{personName(contextCandidate)}</p>
                <p style={{ ...mutedText(12), marginTop: 5 }}>This saves your interest in deeper context and keeps recommendations explainable without exposing sensitive data.</p>
              </div>
              <button type="button" onClick={() => setContextCandidate(null)} aria-label="Close context request" style={{ width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontFamily: BODY, fontSize: 18, fontWeight: 900 }}>×</button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  ["Current alignment", compatibilityScore(contextCandidate) != null ? `${compatibilityScore(contextCandidate)}%` : "Available"],
                  ["Shared reasons", compatibilityReasons(profile, contextCandidate).join(", ") || "Not enough shared context yet"],
                  ["Next signal", "More interactions, profile edits, likes, passes, and plans can shift this recommendation."],
                ].map(([label, value]) => (
                  <div key={label} style={{ borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.56)", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0, margin: 0 }}>{label}</p>
                    <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 850, lineHeight: 1.5, margin: "5px 0 0" }}>{value}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <button type="button" onClick={() => toggleCompare(contextCandidate)} style={ghostBtn()}>Add to compare</button>
                <button type="button" onClick={() => setContextCandidate(null)} style={primaryBtn()}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(blockDialog)}
        title="Block on Strug?"
        message={`This person will not be able to find, message, invite, match, follow, or interact with you across Strug.`}
        confirmLabel="Block on Strug"
        cancelLabel="Cancel"
        danger
        busy={String(busy || "").includes("block")}
        onConfirm={() => blockDialog?.onConfirm?.()}
        onCancel={() => setBlockDialog(null)}
      />
    </>
  );
}

function worthAddOnStatusLabel(item) {
  const status = String(item?.status || "").replace(/_/g, " ");
  if (item?.type === "scheduled_ride") {
    if (item.status === "confirmed") return "pickup setup unlocked";
    if (item.status === "cancelled") return "cancelled";
    return "after guest confirmation";
  }
  if (item?.type === "scheduled_date_add_on") {
    if (item.payment_status === "authorization_pending") return "payment needed";
    if (item.payment_status === "partially_authorized") return "partial payment authorized";
    if (item.payment_status === "authorized") return "payment authorized";
    if (item.payment_status === "captured") return "payment captured";
    if (item.status === "confirmed") return "vendor confirmed";
    if (item.status === "preparing") return "preparing";
    if (item.status === "out_for_delivery") return "out for delivery";
    if (item.status === "delivered") return "delivered";
    if (item.status === "replacement_suggested") return "replacement suggested";
    if (item.vendor_status === "fallback_pending_vendor_acceptance") return "fallback vendor pending";
    if (item.vendor_status === "rejected_no_fallback") return "vendor declined";
    if (item.status === "scheduled") return item.scheduled_for ? `scheduled ${new Date(item.scheduled_for).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "scheduled";
    if (item.status === "pending") return `pending · ${Number(item.delivery_window_minutes_before || 45)} min before`;
    if (item.status === "cancelled") return "cancelled";
    return `${Number(item.delivery_window_minutes_before || 45)} min before`;
  }
  return status || "";
}

function worthItAuths(addOn) {
  return Array.isArray(addOn?.payment_authorizations) ? addOn.payment_authorizations : [];
}

function worthItPaymentShare(addOn, plan, userId) {
  const amount = Math.round(budgetNumber(addOn?.budget_cap) * 100);
  const viewerId = Number(userId);
  if (!amount || !viewerId) return null;
  const organizerId = Number(plan?.organizer_id);
  const guestId = Number(plan?.confirmed_guest_id);
  if (addOn?.payment_owner === "host") return organizerId === viewerId ? { amount_cents: amount, label: "Host pays" } : null;
  if (addOn?.payment_owner === "guest") return guestId === viewerId ? { amount_cents: amount, label: "Guest pays" } : null;
  if (![organizerId, guestId].includes(viewerId)) return null;
  const hostShare = Math.ceil(amount / 2);
  return { amount_cents: viewerId === organizerId ? hostShare : amount - hostShare, label: "Split payment" };
}

function worthItAddOnNeedsPayment(addOn, plan, userId) {
  if (addOn?.type !== "scheduled_date_add_on") return null;
  if (plan?.status !== "confirmed") return null;
  if (["cancelled", "delivered"].includes(addOn.status)) return null;
  const share = worthItPaymentShare(addOn, plan, userId);
  if (!share) return null;
  const auth = worthItAuths(addOn).find((row) => (
    Number(row?.payer_user_id) === Number(userId)
    && Number(row?.amount_cents) === Number(share.amount_cents)
    && ["authorized", "captured"].includes(row?.status)
  ));
  return auth ? null : share;
}

function worthItParticipantPaymentItems(organized = [], interested = [], userId) {
  const byId = new Map();
  [...organized, ...interested.map((row) => row?.plan).filter(Boolean)].forEach((plan) => {
    if (plan?.dating_date_plan_id) byId.set(plan.dating_date_plan_id, plan);
  });
  const items = [];
  byId.forEach((plan) => {
    (Array.isArray(plan.add_ons) ? plan.add_ons : []).forEach((addOn) => {
      const share = worthItAddOnNeedsPayment(addOn, plan, userId);
      if (share) items.push({ plan, addOn, share });
    });
  });
  return items;
}

function moneyFromCents(cents, currency = "CAD") {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function WorthItPaymentPanel({ organized, interested, currentUserId, busy, onAuthorize }) {
  const items = worthItParticipantPaymentItems(organized, interested, currentUserId);
  if (!items.length) return null;
  return (
    <div style={{ ...panel("rgba(34,197,94,0.12)", "rgba(34,197,94,0.22)"), gridColumn: "1 / -1" }}>
      <div style={sectionHeaderRow()}>
        <div>
          <p style={eyebrow()}>Add-on payment authorizations</p>
          <p style={sectionTitle(28)}>Authorize before vendor scheduling</p>
          <p style={{ ...mutedText(12), marginTop: 5 }}>A hold is placed after guest confirmation. It is captured only when the selected vendor accepts the add-on order.</p>
        </div>
        <span style={{ ...tagStyle(), color: "#bbf7d0", background: "rgba(34,197,94,0.14)" }}>{items.length} pending</span>
      </div>
      <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.22)", padding: 12, marginTop: 14 }}>
        <CardElement
          options={{
            style: {
              base: {
                color: "#fff",
                fontFamily: BODY,
                fontSize: "15px",
                "::placeholder": { color: "rgba(255,255,255,0.42)" },
              },
              invalid: { color: "#fb7185" },
            },
          }}
        />
      </div>
      <div className="dating-compact-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10, marginTop: 12 }}>
        {items.map(({ plan, addOn, share }) => (
          <div key={`${plan.dating_date_plan_id}-${addOn.id}`} style={miniTile()}>
            <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>{addOn.label || addOn.id}</p>
            <p style={{ ...mutedText(12), marginTop: 4 }}>{plan.restaurant_name || "Worth It date"} · {share.label}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <span style={tagStyle()}>{moneyFromCents(share.amount_cents, plan.currency || "CAD")}</span>
              <span style={tagStyle()}>{addOn.vendor_name || "Selected vendor"}</span>
            </div>
            <button type="button" disabled={busy} onClick={() => onAuthorize(plan, addOn)} style={{ ...primaryBtn("#22c55e"), marginTop: 10, width: "100%" }}>
              {busy === `worth-add-on-pay-${plan.dating_date_plan_id}-${addOn.id}` ? "Authorizing..." : "Authorize hold"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorthItVendorFulfillmentPanel({ rows, loading, busy, replacementNotes, setReplacementNotes, proofFiles, setProofFiles, proofSignatures, setProofSignatures, proofNotes, setProofNotes, onVendorAction, onProof }) {
  if (!loading && !rows.length) return null;
  return (
    <div style={{ ...panel("rgba(59,130,246,0.12)", "rgba(59,130,246,0.22)"), gridColumn: "1 / -1" }}>
      <div style={sectionHeaderRow()}>
        <div>
          <p style={eyebrow()}>Vendor fulfillment</p>
          <p style={sectionTitle(28)}>Manage assigned date add-ons</p>
          <p style={{ ...mutedText(12), marginTop: 5 }}>Accept, decline, suggest replacements, update delivery status, and submit delivery proof for real assigned orders.</p>
        </div>
        <span style={{ ...tagStyle(), color: "#bfdbfe", background: "rgba(59,130,246,0.14)" }}>{loading ? "Loading" : `${rows.length} assigned`}</span>
      </div>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {rows.map((row) => {
          const plan = row.plan || {};
          const addOn = row.add_on || {};
          const key = `${plan.dating_date_plan_id}:${addOn.id}`;
          const isBusy = String(busy || "").includes(`worth-add-on-vendor-${plan.dating_date_plan_id}-${addOn.id}`)
            || String(busy || "").includes(`worth-add-on-proof-${plan.dating_date_plan_id}-${addOn.id}`);
          const paymentReady = ["authorized", "captured", "authorization_not_required"].includes(addOn.payment_status);
          const preferencesReady = addOn.guest_preference_status === "approved";
          const canAccept = paymentReady && preferencesReady && ["scheduled", "pending_vendor_acceptance", "fallback_pending_vendor_acceptance"].includes(addOn.status || addOn.vendor_status);
          const canUpdateFulfillment = ["confirmed", "preparing", "out_for_delivery"].includes(addOn.status);
          const proofReady = canUpdateFulfillment && Boolean(proofFiles[key] || String(proofSignatures[key] || "").trim() || String(proofNotes[key] || "").trim());
          return (
            <div key={key} style={miniTile()}>
              <div style={sectionHeaderRow()}>
                <div>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 14, fontWeight: 950, margin: 0 }}>{addOn.label || addOn.id}</p>
                  <p style={{ ...mutedText(12), marginTop: 4 }}>
                    {plan.restaurant_name || "Worth It date"} · {plan.date ? new Date(plan.date).toLocaleDateString() : "Date pending"} {plan.time || ""}
                  </p>
                </div>
                <span style={tagStyle()}>{worthAddOnStatusLabel(addOn) || addOn.vendor_status || "pending"}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <span style={tagStyle()}>{preferencesReady ? "Guest approved" : "Awaiting guest approval"}</span>
                <span style={tagStyle()}>{paymentReady ? "Payment ready" : "Payment hold needed"}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button type="button" disabled={isBusy || !canAccept} onClick={() => onVendorAction(row, "accept")} style={{ ...primaryBtn("#22c55e"), opacity: canAccept ? 1 : 0.55 }}>Accept</button>
                <button type="button" disabled={isBusy} onClick={() => onVendorAction(row, "reject")} style={dangerBtn()}>Decline</button>
                <button type="button" disabled={isBusy || !canUpdateFulfillment} onClick={() => onVendorAction(row, "preparing")} style={{ ...ghostBtn(), opacity: canUpdateFulfillment ? 1 : 0.55 }}>Preparing</button>
                <button type="button" disabled={isBusy || !canUpdateFulfillment} onClick={() => onVendorAction(row, "out_for_delivery")} style={{ ...ghostBtn(), opacity: canUpdateFulfillment ? 1 : 0.55 }}>Out for delivery</button>
              </div>
              <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "end", marginTop: 12 }}>
                <label style={fieldWrap()}>
                  <span style={fieldLabel()}>Replacement suggestion</span>
                  <input
                    style={inputStyle()}
                    value={replacementNotes[key] || ""}
                    onChange={(event) => setReplacementNotes((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder="Suggest a replacement if unavailable"
                  />
                </label>
                <button
                  type="button"
                  disabled={isBusy || !String(replacementNotes[key] || "").trim()}
                  onClick={() => onVendorAction(row, "replacement", { note: replacementNotes[key], replacement_title: replacementNotes[key] })}
                  style={{ ...ghostBtn(), opacity: String(replacementNotes[key] || "").trim() ? 1 : 0.55 }}
                >
                  Suggest
                </button>
              </div>
              <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, alignItems: "end", marginTop: 12 }}>
                <label style={fieldWrap()}>
                  <span style={fieldLabel()}>Proof photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = Array.from(event.target.files || []).find((item) => item?.type?.startsWith("image/"));
                      event.target.value = "";
                      setProofFiles((current) => ({ ...current, [key]: file || null }));
                    }}
                    style={inputStyle()}
                  />
                </label>
                <label style={fieldWrap()}>
                  <span style={fieldLabel()}>Signature name</span>
                  <input
                    style={inputStyle()}
                    value={proofSignatures[key] || ""}
                    onChange={(event) => setProofSignatures((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder="Name of recipient or venue staff"
                  />
                </label>
                <label style={fieldWrap()}>
                  <span style={fieldLabel()}>Delivery note</span>
                  <input
                    style={inputStyle()}
                    value={proofNotes[key] || ""}
                    onChange={(event) => setProofNotes((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder="Delivered to host stand..."
                  />
                </label>
                <button type="button" disabled={isBusy || !proofReady} onClick={() => onProof(row)} style={{ ...primaryBtn("#60a5fa"), opacity: proofReady ? 1 : 0.55 }}>Submit proof</button>
              </div>
              {addOn.fallback_history?.length > 0 && <p style={{ ...mutedText(11), marginTop: 8 }}>Fallback attempts: {addOn.fallback_history.length}</p>}
            </div>
          );
        })}
        {!rows.length && loading && <p style={mutedText(12)}>Loading assigned add-ons...</p>}
      </div>
    </div>
  );
}

function worthAddOnRefundLabel(item) {
  const policy = item?.refund_policy || {};
  return policy.label || (policy.status ? String(policy.status).replace(/_/g, " ") : "");
}

function timelineStatusColor(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("cancel")) return "#fb7185";
  if (value.includes("pause") || value.includes("review")) return "#f97316";
  if (value.includes("complete") || value.includes("confirm") || value.includes("schedule")) return "#22c55e";
  return "#60a5fa";
}

function timelineTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function WorthItTimeline({ plan }) {
  const rows = Array.isArray(plan?.timeline) ? plan.timeline : [];
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 14, borderRadius: 16, padding: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.035)" }}>
      <div style={sectionHeaderRow()}>
        <p style={{ ...fieldLabel(), margin: 0 }}>Date timeline</p>
        <span style={{ ...tagStyle(), color: "#bfdbfe", background: "rgba(37,99,235,0.14)" }}>Live plan</span>
      </div>
      <div style={{ display: "grid", gap: 0, marginTop: 10 }}>
        {rows.slice(0, 10).map((row, index) => {
          const color = timelineStatusColor(row.status);
          const policy = row.refund_policy?.label || row.refund_policy?.vendor_policy_label || "";
          return (
            <div key={row.key || `${row.title}-${row.status}-${index}`} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: 10 }}>
              <div style={{ display: "grid", justifyItems: "center" }}>
                <span style={{ width: 12, height: 12, borderRadius: 99, background: color, boxShadow: `0 0 0 5px ${color}22`, marginTop: 4 }} />
                {index < Math.min(rows.length, 10) - 1 && <span style={{ width: 1, minHeight: 38, background: "rgba(255,255,255,0.12)", marginTop: 6 }} />}
              </div>
              <div style={{ paddingBottom: index < Math.min(rows.length, 10) - 1 ? 12 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, minWidth: 0, margin: 0 }}>{row.title}</p>
                  <span style={{ ...tagStyle(), padding: "5px 8px", fontSize: 10 }}>{String(row.status || "planned").replace(/_/g, " ")}</span>
                </div>
                {row.description && <p style={{ ...mutedText(11), marginTop: 4 }}>{row.description}</p>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: row.provider || row.venue || policy || row.at ? 7 : 0 }}>
                  {row.at && <span style={tagStyle()}>{timelineTimeLabel(row.at)}</span>}
                  {row.venue && <span style={tagStyle()}>{row.venue}</span>}
                  {row.provider && <span style={tagStyle()}>{row.provider}</span>}
                  {policy && <span style={tagStyle()}>{policy}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorthItAddOnPreferencesPanel({ plan, form, busy, onChange, onSave }) {
  const addOns = (Array.isArray(plan?.add_ons) ? plan.add_ons : []).filter((item) => item?.type === "scheduled_date_add_on");
  if (plan?.status !== "confirmed" || !addOns.length) return null;
  return (
    <div style={{ ...miniTile(), marginTop: 12, borderColor: "rgba(236,72,153,0.24)", background: "rgba(236,72,153,0.08)" }}>
      <div style={sectionHeaderRow()}>
        <div>
          <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>Add-on preferences</p>
          <p style={{ ...mutedText(12), marginTop: 4 }}>Approve or adjust flowers, gifts, and desserts without sharing a private address.</p>
        </div>
        <span style={{ ...tagStyle(), color: "#fbcfe8", background: "rgba(236,72,153,0.14)" }}>Guest controlled</span>
      </div>
      <div className="dating-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 12 }}>
        {addOns.map((item) => {
          const values = { ...(item.guest_preferences || {}), ...(form?.[item.id] || {}) };
          return (
            <div key={item.id} style={{ ...miniTile(), background: "rgba(255,255,255,0.035)" }}>
              <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900, margin: 0 }}>{item.label || item.id}</p>
              <p style={{ ...mutedText(11), marginTop: 3 }}>{item.vendor_name || "Selected provider"} · {worthAddOnRefundLabel(item) || "Policy pending"}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <span style={{ ...tagStyle(), color: item.guest_preference_status === "approved" ? "#bbf7d0" : "#fbcfe8", background: item.guest_preference_status === "approved" ? "rgba(34,197,94,0.12)" : "rgba(236,72,153,0.12)" }}>
                  {item.guest_preference_status === "approved" ? "Approved" : "Needs guest approval"}
                </span>
                <span style={tagStyle()}>Deliver to venue</span>
              </div>
              {item.id === "flowers" && <input style={{ ...inputStyle(), marginTop: 8 }} value={values.flower_preference || ""} onChange={(e) => onChange(item.id, { flower_preference: e.target.value })} placeholder="Flower preference" />}
              {item.id === "dessert" && <input style={{ ...inputStyle(), marginTop: 8 }} value={values.dessert_choice || ""} onChange={(e) => onChange(item.id, { dessert_choice: e.target.value })} placeholder="Dessert choice" />}
              {item.id === "gift" && <input style={{ ...inputStyle(), marginTop: 8 }} value={values.gift_size || ""} onChange={(e) => onChange(item.id, { gift_size: e.target.value })} placeholder="Gift size" />}
              <input style={{ ...inputStyle(), marginTop: 8 }} value={values.allergy_note || ""} onChange={(e) => onChange(item.id, { allergy_note: e.target.value })} placeholder="Allergy or safety note" />
              <input style={{ ...inputStyle(), marginTop: 8 }} value={values.note || ""} onChange={(e) => onChange(item.id, { note: e.target.value })} placeholder="Preference note" />
            </div>
          );
        })}
      </div>
      <button type="button" disabled={busy} onClick={onSave} style={{ ...primaryBtn("#ec4899"), marginTop: 12 }}>Approve / save preferences</button>
    </div>
  );
}

function DatePlanCard({ plan, actionLabel, onAction, dangerLabel, onDanger, safetyLabel, onSafety, busy = false }) {
  const addOns = Array.isArray(plan.add_ons) ? plan.add_ons : [];
  const menu = Array.isArray(plan.menu_intent) ? plan.menu_intent : [];
  return (
    <div className="dating-date-plan-card" style={miniTile()}>
      <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 24, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>{plan.restaurant_name}</p>
      <p style={mutedText(12)}>{new Date(plan.date).toLocaleDateString()} at {plan.time} · {plan.payment_split === "100" ? "Host pays" : plan.payment_split === "50" ? "Split 50/50" : "Guest pays own"} · ${Number(plan.budget_amount || 0).toFixed(2)}</p>
      {plan.host_note && <p style={mutedText(12)}>{plan.host_note}</p>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {addOns.map((item) => {
          const status = worthAddOnStatusLabel(item);
          const refund = worthAddOnRefundLabel(item);
          const provider = item.vendor_name ? ` · ${item.vendor_name}` : "";
          return <span key={item.id || item.label} style={tagStyle()}>{item.label || item.id}{provider}{status ? ` · ${status}` : ""}{refund ? ` · ${refund}` : ""}</span>;
        })}
        {!addOns.length && plan.includes_ride && <span style={tagStyle()}>Ride</span>}
        {!addOns.length && plan.includes_flowers && <span style={tagStyle()}>Flowers</span>}
        {menu.slice(0, 3).map((item) => <span key={item.id || item.name} style={tagStyle()}>{item.name || item.note}</span>)}
        {plan.deposit_amount != null && <span style={tagStyle()}>${Number(plan.deposit_amount || 0).toFixed(2)} deposit</span>}
        {plan.cancellation_window_hours != null && <span style={tagStyle()}>{plan.cancellation_window_hours}h cancel window</span>}
        <span style={tagStyle()}>{plan.status}</span>
      </div>
      <WorthItTimeline plan={plan} />
      {(actionLabel || dangerLabel || safetyLabel) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {actionLabel && <button type="button" disabled={busy} onClick={onAction} style={primaryBtn()}>{actionLabel}</button>}
          {dangerLabel && <button type="button" disabled={busy} onClick={onDanger} style={dangerBtn()}>{dangerLabel}</button>}
          {safetyLabel && <button type="button" disabled={busy} onClick={onSafety} style={{ ...ghostBtn(), borderColor: "rgba(225,29,72,0.28)", background: "rgba(225,29,72,0.08)" }}>{safetyLabel}</button>}
        </div>
      )}
    </div>
  );
}

function WorthItRidePanel({ plan, currentUserId, form, busy, onChange, onSchedule }) {
  if (!plan?.includes_ride) return null;
  const isConfirmed = plan.status === "confirmed" && plan.confirmed_guest_id;
  const isGuest = Number(plan.confirmed_guest_id) === Number(currentUserId);
  const isOrganizer = Number(plan.organizer_id) === Number(currentUserId);
  const rideSummary = plan.ride_summary || null;
  const rideLinked = Boolean(plan.ride_request_id || plan.ride_linked || rideSummary?.ride_request_id || rideSummary?.status || rideSummary?.scheduled_at);
  const sharedWithOrganizer = plan.ride_status_shared_with_organizer === true;
  const pickupIso = worthRidePickupIso(plan);
  const pickupLabel = pickupIso ? new Date(pickupIso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Date time unavailable";
  const rideStatusLabel = rideSummary?.status ? String(rideSummary.status).replace(/_/g, " ") : null;
  const scheduledLabel = rideSummary?.scheduled_at
    ? new Date(rideSummary.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const safeNotice = rideSummary?.privacy_notice || "Pickup address, route, and live location are private to the rider, driver, and platform operations.";

  return (
    <div style={{ ...miniTile(), marginTop: 12, borderColor: rideLinked ? "rgba(34,197,94,0.24)" : "rgba(59,130,246,0.22)", background: rideLinked ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.08)" }}>
      <div style={sectionHeaderRow()}>
        <div>
          <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>Ride coordination</p>
          <p style={{ ...mutedText(12), marginTop: 4 }}>
            {rideLinked
              ? "A private scheduled ride is linked to this date."
              : isConfirmed
                ? "Exact pickup is collected only after confirmation."
                : "Ride setup unlocks after the organizer confirms a guest."}
          </p>
        </div>
        <span style={{ ...tagStyle(), background: rideLinked ? "rgba(34,197,94,0.16)" : "rgba(59,130,246,0.14)", color: rideLinked ? "#bbf7d0" : "#bfdbfe" }}>
          {rideLinked ? "Scheduled" : isConfirmed ? "Ready" : "Locked"}
        </span>
      </div>
      {rideLinked && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <p style={{ ...mutedText(12), margin: 0 }}>
            {isGuest && (plan.ride_request_id || rideSummary?.ride_request_id)
              ? `Ride ID #${plan.ride_request_id || rideSummary.ride_request_id}. Exact pickup, live route, driver map, and address stay private to the rider, driver, and platform operations.`
              : "A private scheduled ride is linked. Exact pickup, live route, driver map, and address stay private to the rider, driver, and platform operations."}
          </p>
          {isOrganizer && !sharedWithOrganizer && (
            <p style={{ ...mutedText(12), margin: 0 }}>The guest has not shared ride status with you. You will only see that the ride is linked.</p>
          )}
          {rideSummary && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {rideStatusLabel && <span style={tagStyle()}>Status: {rideStatusLabel}</span>}
              {scheduledLabel && <span style={tagStyle()}>Scheduled: {scheduledLabel}</span>}
              {isOrganizer && <span style={tagStyle()}>Limited status only</span>}
            </div>
          )}
          <p style={{ ...mutedText(12), margin: 0 }}>{safeNotice}</p>
        </div>
      )}
      {!rideLinked && isOrganizer && (
        <div style={{ ...miniTile(), marginTop: 10, background: "rgba(15,23,42,0.42)" }}>
          <p style={{ fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 950, margin: 0 }}>Private pickup pending</p>
          <p style={{ ...mutedText(12), marginTop: 4 }}>The confirmed guest will add pickup inside their ride setup. You will not see their pickup address, route, or live location.</p>
        </div>
      )}
      {!rideLinked && isGuest && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div style={{ ...miniTile(), borderColor: "rgba(34,197,94,0.24)", background: "rgba(34,197,94,0.08)" }}>
            <p style={{ fontFamily: BODY, color: "#dcfce7", fontSize: 13, fontWeight: 950, margin: 0 }}>Your pickup stays private</p>
            <p style={{ ...mutedText(12), marginTop: 4 }}>This address is used only to book your ride. Your date or payer can see limited ride timing only if you allow it, never the exact pickup, route, or live location.</p>
          </div>
          <label style={fieldWrap()}>
            <span style={fieldLabel()}>Private pickup address</span>
            <input
              style={inputStyle()}
              value={form.pickup_address || ""}
              onChange={(event) => onChange({ pickup_address: event.target.value })}
              maxLength={240}
              placeholder="Only the ride system and driver can use this"
            />
          </label>
          <label style={fieldWrap()}>
            <span style={fieldLabel()}>Ride type</span>
            <select style={inputStyle()} value={form.vehicle_type || "economy"} onChange={(event) => onChange({ vehicle_type: event.target.value })}>
              <option value="economy">Economy</option>
              <option value="comfort">Comfort</option>
              <option value="premium">Premium</option>
              <option value="suv">SUV</option>
            </select>
          </label>
          <label style={{ ...miniTile(), display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.share_status_with_organizer === true}
              onChange={(event) => onChange({ share_status_with_organizer: event.target.checked })}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: "#e11d48" }}
            />
            <span>
              <span style={{ display: "block", fontFamily: BODY, color: "#fff", fontSize: 13, fontWeight: 900 }}>Share limited ride status with organizer</span>
              <span style={{ ...mutedText(12), display: "block", marginTop: 3 }}>They can see status/ride timing only. Your exact pickup, live location, route, and address stay hidden.</span>
            </span>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={tagStyle()}>Pickup around {pickupLabel}</span>
            <button type="button" disabled={busy || !form.pickup_address} onClick={onSchedule} style={{ ...primaryBtn("#2563eb"), opacity: form.pickup_address ? 1 : 0.55 }}>
              {String(busy || "").startsWith("worth-ride") ? "Scheduling..." : "Schedule date ride"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DatingPage({ onNavigate }) {
  const { isMobile } = useViewport();
  const [mode, setModeState] = useState("standard");
  const [ageGate, setAgeGate] = useState(() => readStored(AGE_GATE_KEY, "unset", new Set(["unset", "adult", "blocked"])));
  const [serverAdult, setServerAdult] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showSafetyTools, setShowSafetyTools] = useState(false);
  const [safetyTarget, setSafetyTarget] = useState(null);
  const [actionNotice, setActionNotice] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [matches, setMatches] = useState([]);
  const [likesYou, setLikesYou] = useState([]);
  const [crossedPaths, setCrossedPaths] = useState(() => emptyCrossedPaths());
  const [standardFilters, setStandardFilters] = useState(STANDARD_FILTER_DEFAULTS);
  const [birthdateError, setBirthdateError] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [blindState, setBlindState] = useState({});
  const [worthPlans, setWorthPlans] = useState([]);
  const [myWorth, setMyWorth] = useState({ organized: [], interested: [], invites: [] });
  const { busy, error, notice, run, setError, setNotice } = useAsyncAction();
  const active = useMemo(() => MODES.find((m) => m.id === mode) || MODES[0], [mode]);
  const setMode = (nextMode) => {
    const safe = VALID_MODES.has(nextMode) ? nextMode : "standard";
    writeStored(MODE_KEY, safe);
    setModeState(safe);
  };

  const refreshProfile = useCallback(async () => {
    const payload = await getDatingMe();
    const data = dataOf(payload, {});
    setProfile(data);
    if (data?.birthdate) setBirthdate(String(data.birthdate).slice(0, 10));
    if (payload?.adult) {
      setServerAdult(true);
      writeStored(AGE_GATE_KEY, "adult");
      setAgeGate("adult");
    } else if (readStored(AGE_GATE_KEY, "unset", VALID_AGE_GATES) === "adult") {
      setServerAdult(false);
      removeStored(AGE_GATE_KEY);
      setAgeGate("unset");
    } else {
      setServerAdult(false);
    }
  }, []);
  const refreshDiscover = useCallback(async () => {
    const filters = Object.entries(standardFilters)
      .filter(([key, enabled]) => typeof enabled === "boolean" && enabled && key !== "age")
      .map(([key]) => key)
      .join(",");
    const params = {
      mode: "standard",
      filters,
      ...(standardFilters.nearby ? { distance_km: standardFilters.distance_km } : {}),
      ...(standardFilters.age ? { age_min: standardFilters.age_min, age_max: standardFilters.age_max } : {}),
    };
    const [discoverPayload, matchesPayload, likesPayload] = await Promise.all([getDatingDiscover(params), getDatingMatches(), getDatingLikesYou({ mode: "standard" })]);
    setProfiles(dataOf(discoverPayload, []).filter((p) => !isObviousTestContent([p?.display_name, p?.name, p?.bio].join(" "))));
    setMatches(dataOf(matchesPayload, []).filter((m) => !isObviousTestContent([m?.display_name, m?.name, m?.bio, m?.peer?.display_name, m?.peer?.name].join(" "))));
    setLikesYou(dataOf(likesPayload, []).filter((row) => !isObviousTestContent([row?.profile?.display_name, row?.profile?.name, row?.profile?.bio].join(" "))));
  }, [standardFilters]);
  const refreshCrossedPaths = useCallback(async () => {
    try {
      const payload = await getDatingCrossedPaths();
      const data = dataOf(payload, { settings: CROSSED_PATH_DEFAULTS, candidates: [] });
      setCrossedPaths(emptyCrossedPaths({
        settings: { ...CROSSED_PATH_DEFAULTS, ...(data?.settings || {}) },
        candidates: (data?.candidates || []).filter((p) => !isObviousTestContent([p?.display_name, p?.name, p?.bio].join(" "))),
        unavailable: Boolean(data?.unavailable),
        message: data?.unavailable ? safeDatingFeatureMessage(data?.message, CROSSED_PATH_UNAVAILABLE_MESSAGE) : "",
      }));
    } catch (err) {
      setCrossedPaths((current) => emptyCrossedPaths({
        settings: { ...CROSSED_PATH_DEFAULTS, ...(current?.settings || {}) },
        unavailable: true,
        message: apiErrorMessage(err, CROSSED_PATH_UNAVAILABLE_MESSAGE),
      }));
    }
  }, []);
  const updateCrossedPaths = useCallback(async (settings) => {
    const payload = await updateDatingCrossedPathSettings(settings);
    const data = dataOf(payload, {});
    setCrossedPaths((current) => ({ ...current, unavailable: false, message: "", settings: { ...CROSSED_PATH_DEFAULTS, ...(data?.settings || settings || {}) } }));
    await refreshCrossedPaths();
  }, [refreshCrossedPaths]);
  const recordCrossedPath = useCallback(async (event) => {
    await recordDatingCrossedPathEvent(event);
    await refreshCrossedPaths();
  }, [refreshCrossedPaths]);
  const refreshBlind = useCallback(async () => {
    setBlindState(dataOf(await getBlindDatingSession(), {}));
  }, []);
  const refreshWorth = useCallback(async () => {
    const [plansPayload, myPayload] = await Promise.all([getWorthItPlans(), getMyWorthItPlans()]);
    setWorthPlans(dataOf(plansPayload, []).filter((plan) => !isObviousTestContent([plan?.restaurant_name, plan?.host_note].join(" "))));
    const mine = dataOf(myPayload, { organized: [], interested: [], invites: [] });
    setMyWorth({
      organized: (mine?.organized || []).filter((plan) => !isObviousTestContent([plan?.restaurant_name, plan?.host_note].join(" "))),
      interested: (mine?.interested || []).filter((interest) => !isObviousTestContent([interest?.plan?.restaurant_name, interest?.plan?.host_note].join(" "))),
      invites: (mine?.invites || []).filter((invite) => !isObviousTestContent([invite?.plan?.restaurant_name, invite?.plan?.host_note].join(" "))),
    });
  }, []);
  const handleAfterBlock = useCallback(async (target) => {
    try { delete window.__openChatChannelId; } catch { /* ignore */ }
    setActionNotice(`${personName(target)} has been blocked across Dating surfaces.`);
    await Promise.allSettled([refreshDiscover(), refreshCrossedPaths(), refreshBlind(), refreshWorth(), refreshProfile()]);
  }, [refreshBlind, refreshCrossedPaths, refreshDiscover, refreshProfile, refreshWorth]);
  const openSafetyReport = useCallback((target) => {
    setSafetyTarget(target || null);
    setShowSafetyTools(true);
  }, []);
  const refreshAll = useCallback(async () => {
    let payload;
    setAvailabilityMessage("");
    try {
      payload = await getDatingMe();
    } catch (err) {
      setProfile(null);
      setServerAdult(false);
      if (readStored(AGE_GATE_KEY, "unset", VALID_AGE_GATES) === "adult") removeStored(AGE_GATE_KEY);
      setAgeGate("unset");
      setProfiles([]);
      setMatches([]);
      setLikesYou([]);
      setCrossedPaths(emptyCrossedPaths());
      setBlindState({});
      setWorthPlans([]);
      setMyWorth({ organized: [], interested: [], invites: [] });
      setAvailabilityMessage("");
      return null;
    }
    const data = dataOf(payload, {});
    setProfile(data);
    if (data?.birthdate) setBirthdate(String(data.birthdate).slice(0, 10));
    const adult = Boolean(payload?.adult);
    setServerAdult(adult);
    if (adult) {
      setNotice("");
      writeStored(AGE_GATE_KEY, "adult");
      setAgeGate("adult");
      await Promise.allSettled([
        ...(isDatingSetupComplete(data) ? [refreshDiscover()] : []),
        refreshCrossedPaths(),
        refreshBlind(),
        refreshWorth(),
      ]);
    } else {
      if (!adult && readStored(AGE_GATE_KEY, "unset", VALID_AGE_GATES) === "adult") removeStored(AGE_GATE_KEY);
      if (adult) writeStored(AGE_GATE_KEY, "adult");
      setAgeGate(adult ? "adult" : "unset");
      setProfiles([]);
      setMatches([]);
      setCrossedPaths(emptyCrossedPaths());
      setBlindState({});
      setWorthPlans([]);
      setMyWorth({ organized: [], interested: [], invites: [] });
    }
  }, [refreshBlind, refreshCrossedPaths, refreshDiscover, refreshWorth, setNotice]);

  useEffect(() => {
    run("load", refreshAll);
  }, [refreshAll, run]);

  const confirmAdult = () => run("age", async () => {
    setNotice("");
    setAvailabilityMessage("");
    if (!birthdate) {
      setBirthdateError("Please enter your date of birth to continue.");
      return null;
    }
    setBirthdateError("");
    if (!isAdultBirthdate(birthdate)) {
      blockUnderage();
      setBirthdateError("Dating is restricted to users 18 or older.");
      return null;
    }
    let payload;
    try {
      payload = await updateDatingProfile({ birthdate, adult_confirmed: true, is_discoverable: false });
    } catch (err) {
      const serverMessage = apiErrorMessage(err, "Could not verify your age. Please try again.");
      if (err?.response?.status === 403 && isAdultGateMessage(serverMessage)) {
        setBirthdateError(serverMessage || "Dating is restricted to users 18 or older.");
      } else {
        setBirthdateError(serverMessage);
      }
      return null;
    }
    const adult = Boolean(payload?.adult);
    setProfile(dataOf(payload));
    setServerAdult(adult);
    if (!adult) {
      removeStored(AGE_GATE_KEY);
      setAgeGate("unset");
      setNotice(ADULT_CONFIRM_MESSAGE);
      return null;
    }
    setNotice("");
    setAvailabilityMessage("");
    writeStored(AGE_GATE_KEY, "adult");
    setAgeGate("adult");
    const nextProfile = dataOf(payload);
    await Promise.allSettled([
      ...(isDatingSetupComplete(nextProfile) ? [refreshDiscover()] : []),
      refreshCrossedPaths(),
      refreshBlind(),
      refreshWorth(),
    ]);
  });
  const blockUnderage = () => {
    writeStored(AGE_GATE_KEY, "blocked");
    setServerAdult(false);
    setAgeGate("blocked");
  };
  const activeMode = active.id;
  const canEnterDating = ageGate === "adult" && serverAdult;
  const standardSetupComplete = isDatingSetupComplete(profile);
  const backToDatingHome = () => setMode("standard");

  useEffect(() => {
    if (canEnterDating && activeMode === "standard" && !standardSetupComplete) {
      setShowProfileSetup(true);
    }
  }, [activeMode, canEnterDating, standardSetupComplete]);

  return (
    <div className="dating-root" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#090a0f" }}>
      <div className="dating-page-pad" style={{ paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 24, paddingBottom: 24 }}>
        <div style={{ maxWidth: 1220, margin: "0 auto" }}>
          <section className="dating-hero" style={{ marginTop: 18, borderRadius: 24, overflow: "hidden", border: "1px solid rgba(255,255,255,0.09)", background: "linear-gradient(135deg, rgba(225,29,72,0.22), rgba(124,58,237,0.13) 42%, rgba(9,10,15,0.94))", position: "relative" }}>
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 15% 18%, rgba(225,29,72,0.32), transparent 34%), radial-gradient(circle at 72% 22%, rgba(124,58,237,0.28), transparent 32%), linear-gradient(120deg, rgba(255,255,255,0.04), rgba(255,255,255,0))" }} />
            <div aria-hidden="true" style={{ position: "absolute", right: -70, bottom: -90, width: 260, height: 260, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "inset 0 0 80px rgba(225,29,72,0.12)" }} />
            <div style={{ position: "relative", padding: isMobile ? 20 : 30 }}>
              <div className="dating-hero-layout" style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 18, flexDirection: isMobile ? "column" : "row" }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "7px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: BODY, fontSize: 12, fontWeight: 900, marginBottom: 14 }}><DatingIcon s={16} /> Strug Dating</div>
                  <h1 className="dating-hero-title" style={{ fontFamily: HEAD, color: "#fff", fontSize: isMobile ? 46 : 68, lineHeight: 0.9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.03em", margin: 0 }}>Date with context</h1>
                  <p className="dating-hero-copy" style={{ fontFamily: BODY, color: "rgba(255,255,255,0.66)", fontSize: 15, lineHeight: 1.6, maxWidth: 680, marginTop: 14 }}>Dating now supports profile discovery, blind queue, Worth It date publishing, direct invites, guest interest, organizer confirmation, and True Love opt-in. Dating is restricted to adults 18+.</p>
                </div>
                {canEnterDating && (
                  <div className="dating-hero-controls" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                    <ModeBar mode={mode} setMode={setMode} isMobile={isMobile} />
                    <button
                      type="button"
                      onClick={() => setShowProfileEditor(true)}
                      aria-label="Edit dating profile"
                      title="Edit dating profile"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "linear-gradient(135deg, rgba(225,29,72,0.92), rgba(124,58,237,0.78))",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        boxShadow: "0 18px 45px rgba(225,29,72,0.22)",
                        position: "relative",
                      }}
                    >
                      <DatingIcon s={22} />
                      <span style={{ position: "absolute", right: -4, bottom: -4, minWidth: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", padding: "0 5px", background: "#090a0f", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontFamily: BODY, fontSize: 9, fontWeight: 950 }}>{profileCompletion(profile)}%</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
          {canEnterDating && error && <p style={errorText()}>{error}</p>}
          {!canEnterDating ? (
            <section style={{ marginTop: 18, display: "grid", placeItems: "center" }}>
              <div style={{ width: "100%", maxWidth: 720, background: ageGate === "blocked" ? "rgba(127,29,29,0.18)" : "rgba(255,255,255,0.04)", border: `1px solid ${ageGate === "blocked" ? "rgba(248,113,113,0.28)" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: isMobile ? 20 : 28, textAlign: "center" }}>
                  <div style={{ width: 54, height: 54, borderRadius: 18, display: "grid", placeItems: "center", margin: "0 auto 16px", background: ageGate === "blocked" ? "rgba(248,113,113,0.16)" : `${ACCENT}22`, color: ageGate === "blocked" ? "#fca5a5" : ACCENT }}><DatingIcon s={26} /></div>
                  <p style={{ fontFamily: HEAD, color: "#fff", fontSize: isMobile ? 30 : 38, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>{ageGate === "blocked" ? "Dating is adult-only" : "Confirm your age"}</p>
                  <p style={{ fontFamily: BODY, color: "rgba(255,255,255,0.62)", fontSize: 14, lineHeight: 1.6, maxWidth: 560, margin: "10px auto 0" }}>{ageGate === "blocked" ? "You cannot access Strug Dating unless you are 18 or older. Other Strug sections remain available." : "Strug Dating is only available to users who are 18 years old or older. Enter your date of birth before continuing."}</p>
                  {ageGate !== "blocked" && (
                    <label style={{ display: "block", maxWidth: 320, margin: "18px auto 0", textAlign: "left", fontFamily: BODY, color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: 900 }}>
                      Date of birth
                      <input
                        type="date"
                        value={birthdate}
                        max={adultCutoffValue()}
                        onChange={(event) => { setBirthdate(event.target.value); setBirthdateError(""); setAvailabilityMessage(""); setError(""); }}
                        style={{ width: "100%", marginTop: 8, borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "12px 14px", fontFamily: BODY, fontSize: 14, outline: "none", colorScheme: "dark" }}
                      />
                      {birthdateError && <span role="alert" style={{ display: "block", marginTop: 8, color: "#fca5a5", fontWeight: 800, lineHeight: 1.5 }}>{birthdateError}</span>}
                      {availabilityMessage && <span role="status" style={{ display: "block", marginTop: 8, color: "#fca5a5", fontWeight: 800, lineHeight: 1.5 }}>{availabilityMessage}</span>}
                      <span style={{ display: "block", marginTop: 8, color: "rgba(255,255,255,0.46)", fontWeight: 700, lineHeight: 1.5 }}>Used only to confirm adult access for Dating.</span>
                    </label>
                  )}
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                    {ageGate === "blocked" ? (
                      <>
                        <button type="button" onClick={() => navigate(onNavigate, "home")} style={primaryBtn("#2563eb")}>Go home</button>
                        <button type="button" onClick={() => { removeStored(AGE_GATE_KEY); setServerAdult(false); setAgeGate("unset"); setError(""); }} style={ghostBtn()}>Review age choice</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={busy} onClick={confirmAdult} style={primaryBtn()}>Verify age and enter</button>
                        <button type="button" onClick={blockUnderage} style={ghostBtn()}>I am under 18</button>
                      </>
                    )}
                  </div>
              </div>
            </section>
          ) : (
            <>
              <section className={`dating-content-section dating-content-${activeMode}`} style={{ marginTop: 18, marginBottom: 18 }}>
                <div>
                  <div className="dating-section-heading" style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <BackButton onClick={activeMode === "standard" ? () => navigate(onNavigate, "home") : backToDatingHome} label={activeMode === "standard" ? "Home" : "Dating home"} />
                      </div>
                      <p className="dating-active-title" style={{ fontFamily: HEAD, color: "#fff", fontSize: 32, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>{active.title}</p>
                      <p className="dating-active-subtitle" style={{ fontFamily: BODY, color: "rgba(255,255,255,0.54)", fontSize: 13, marginTop: 4 }}>{active.subtitle}</p>
                    </div>
                    <button type="button" onClick={() => { setSafetyTarget(null); setShowSafetyTools(true); }} style={{ ...ghostBtn(), padding: "10px 13px", borderColor: "rgba(225,29,72,0.32)", background: "rgba(225,29,72,0.1)" }}>
                      <ReservationsIcon s={15} /> Date safer
                    </button>
                  </div>
                  <div className="dating-mode-wrap">
                    {activeMode === "blind" && <BlindMode blindState={blindState} refreshBlind={refreshBlind} onNavigate={onNavigate} />}
                    {activeMode === "standard" && (
                      standardSetupComplete
                        ? <StandardMode profile={profile} profiles={profiles} matches={matches} likesYou={likesYou} filters={standardFilters} setFilters={setStandardFilters} crossedPaths={crossedPaths} refreshDiscover={refreshDiscover} refreshCrossedPaths={refreshCrossedPaths} updateCrossedPaths={updateCrossedPaths} recordCrossedPath={recordCrossedPath} onNavigate={onNavigate} onAfterBlock={handleAfterBlock} onReportUser={openSafetyReport} isMobile={isMobile} />
                        : <DatingSetupPrompt onOpen={() => setShowProfileSetup(true)} />
                    )}
                    {activeMode === "worth" && <WorthItMode onNavigate={onNavigate} profile={profile} plans={worthPlans} mine={myWorth} discoverProfiles={profiles} refreshWorth={refreshWorth} onAfterBlock={handleAfterBlock} onReportSafety={openSafetyReport} />}
                    {activeMode === "true" && <TrueLoveMode profile={profile} refreshProfile={refreshProfile} onAfterBlock={handleAfterBlock} />}
                  </div>
                </div>
              </section>
              <section style={{ marginTop: 22 }}>
                <p style={{ fontFamily: HEAD, color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Shared safety rails</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
                  {SAFETY_RAILS.map((rail, i) => <InfoCard key={rail.title} title={rail.title} body={rail.body} icon={<ReservationsIcon s={18} />} tone={i % 2 ? "#7c3aed" : ACCENT} />)}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(notice)}
        title="Age confirmation required"
        message={notice}
        confirmLabel="OK"
        alertOnly
        danger
        onConfirm={() => setNotice("")}
        onCancel={() => setNotice("")}
      />
      <ConfirmDialog
        open={Boolean(actionNotice)}
        title="Dating updated"
        message={actionNotice}
        confirmLabel="OK"
        alertOnly
        danger={false}
        onConfirm={() => setActionNotice("")}
        onCancel={() => setActionNotice("")}
      />
      {showProfileSetup && !standardSetupComplete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create Dating profile"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowProfileSetup(false);
          }}
          className="dating-profile-modal"
          style={{ position: "fixed", inset: 0, zIndex: 242, background: "rgba(0,0,0,0.74)", backdropFilter: "blur(14px)", display: "grid", placeItems: "center", padding: isMobile ? 10 : 18 }}
        >
          <div className="dating-profile-modal-card" style={{ width: "min(1120px, 100%)", maxHeight: isMobile ? "94vh" : "88vh", overflowY: "auto", borderRadius: isMobile ? 18 : 24, border: "1px solid rgba(225,29,72,0.22)", background: "linear-gradient(160deg, rgba(27,14,22,0.98), rgba(9,10,15,0.98))", boxShadow: "0 28px 90px rgba(0,0,0,0.68)" }}>
            <div className="dating-profile-modal-head" style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: isMobile ? "13px 14px" : "16px 18px", background: "rgba(9,10,15,0.92)", borderBottom: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: `${ACCENT}22`, color: ACCENT }}>
                  <DatingIcon s={20} />
                </div>
                <div>
                  <p style={{ fontFamily: HEAD, color: "#fff", fontSize: isMobile ? 20 : 24, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>Create Dating profile</p>
                  <p style={{ ...mutedText(12), marginTop: 2 }}>Private setup before Standard Dating is visible.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowProfileSetup(false)} aria-label="Close dating profile setup" style={{ width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontFamily: BODY, fontSize: 18, fontWeight: 900 }}>×</button>
            </div>
            <div style={{ padding: isMobile ? 12 : 18 }}>
              <DatingOnboardingFlow
                profile={profile}
                refreshProfile={refreshProfile}
                refreshDiscover={refreshDiscover}
                onComplete={() => setShowProfileSetup(false)}
              />
            </div>
          </div>
        </div>
      )}
      {showProfileEditor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit dating profile"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowProfileEditor(false);
          }}
          className="dating-profile-modal"
          style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)", display: "grid", placeItems: "center", padding: 18 }}
        >
          <div className="dating-profile-modal-card" style={{ width: "min(980px, 100%)", maxHeight: "88vh", overflowY: "auto", borderRadius: 24, border: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(160deg, rgba(27,14,22,0.98), rgba(9,10,15,0.98))", boxShadow: "0 28px 90px rgba(0,0,0,0.62)" }}>
            <div className="dating-profile-modal-head" style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 18px", background: "rgba(9,10,15,0.9)", borderBottom: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: `${ACCENT}22`, color: ACCENT }}>
                  <DatingIcon s={20} />
                </div>
                <div>
                  <p style={{ fontFamily: HEAD, color: "#fff", fontSize: 24, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>Dating profile</p>
                  <p style={{ ...mutedText(12), marginTop: 2 }}>Update how you appear in Dating.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowProfileEditor(false)} aria-label="Close dating profile editor" style={{ width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontFamily: BODY, fontSize: 18, fontWeight: 900 }}>×</button>
            </div>
            <div style={{ padding: 18 }}>
              <ProfileSetupPanel key={datingProfileKey(profile)} profile={profile} refreshProfile={refreshProfile} />
            </div>
          </div>
        </div>
      )}
      {showSafetyTools && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Date safer tools"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowSafetyTools(false);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 235, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center", padding: 18 }}
        >
          <div style={{ width: "min(520px, 100%)", maxHeight: "86vh", overflowY: "auto", borderRadius: 22, border: "1px solid rgba(225,29,72,0.22)", background: "linear-gradient(160deg, rgba(31,13,20,0.98), rgba(9,10,15,0.98))", boxShadow: "0 28px 90px rgba(0,0,0,0.62)" }}>
            <SafetyCenter selectedUserId={safetyTarget?.user_id || profiles[0]?.user_id || matches[0]?.other_user?.user_id} selectedReportTarget={safetyTarget} profile={profile} myWorth={myWorth} onNavigate={onNavigate} onClose={() => { setShowSafetyTools(false); setSafetyTarget(null); }} onReported={refreshWorth} />
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .dating-root {
          overflow-x: hidden;
        }

        .dating-root *,
        .dating-root *::before,
        .dating-root *::after {
          box-sizing: border-box;
        }

        .dating-root img {
          max-width: 100%;
        }

        .dating-mode-tabs {
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .dating-mode-tabs::-webkit-scrollbar {
          display: none;
        }

        .dating-crossed-sheet {
          display: none;
        }

        .dating-profile-sheet {
          display: none;
        }

        @media (max-width: 900px) {
          .dating-mode-wrap > div,
          .dating-two-col,
          .dating-standard-grid,
          .dating-worth-grid,
          .dating-true-grid {
            grid-template-columns: 1fr !important;
          }

          .dating-sticky-panel {
            position: relative !important;
            top: auto !important;
          }

          .dating-swipe-card {
            justify-self: center;
            max-width: min(420px, 100%) !important;
          }

          .dating-swipe-card-profile {
            height: min(72vh, 660px) !important;
            min-height: 520px !important;
            aspect-ratio: auto !important;
          }

          .dating-mode-wrap,
          .dating-standard-side,
          .dating-sticky-panel,
          .dating-swipe-card,
          .dating-date-plan-card,
          .dating-root label,
          .dating-root input,
          .dating-root select,
          .dating-root textarea,
          .dating-root button {
            min-width: 0;
          }
        }

        @media (max-width: 640px) {
          .dating-page-pad {
            padding: 8px 10px 104px !important;
          }

          .dating-hero {
            margin: 0 -10px 8px !important;
            border-radius: 0 0 22px 22px !important;
          }

          .dating-hero > div:last-child {
            padding: 12px 12px 14px !important;
          }

          .dating-hero-title {
            font-size: 30px !important;
            line-height: 0.92 !important;
            max-width: 260px;
          }

          .dating-hero-copy {
            display: none !important;
          }

          .dating-hero-controls {
            position: sticky;
            top: 6px;
            z-index: 20;
            width: 100%;
            gap: 8px !important;
            padding: 6px;
            border-radius: 18px;
            background: rgba(9,10,15,0.78);
            border: 1px solid rgba(255,255,255,0.08);
            backdrop-filter: blur(18px);
            box-shadow: 0 18px 42px rgba(0,0,0,0.22);
          }

          .dating-mode-tabs {
            width: calc(100% - 54px);
            border-radius: 16px !important;
            padding: 4px !important;
            gap: 4px !important;
            scroll-snap-type: x mandatory;
            overflow-x: auto;
            justify-content: flex-start !important;
          }

          .dating-mode-tabs button {
            min-height: 40px;
            flex: 0 0 auto;
            scroll-snap-align: start;
            white-space: nowrap;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .dating-content-section {
            padding-top: 6px !important;
            margin-top: 6px !important;
          }

          .dating-section-heading {
            align-items: center !important;
            margin-bottom: 8px !important;
          }

          .dating-section-heading > div {
            min-width: 0;
            flex: 1 1 auto;
          }

          .dating-section-heading > button {
            width: auto;
            min-height: 38px;
            padding: 8px 11px !important;
            margin-left: auto;
          }

          .dating-content-standard .dating-active-title,
          .dating-content-standard .dating-active-subtitle {
            display: none !important;
          }

          .dating-mode-wrap {
            margin-left: -2px;
            margin-right: -2px;
            width: calc(100% + 4px);
          }

          .dating-standard-grid,
          .dating-two-col,
          .dating-worth-grid,
          .dating-true-grid {
            gap: 12px !important;
            width: 100%;
          }

          .dating-standard-grid {
            display: flex !important;
            flex-direction: column !important;
            align-items: center;
            min-height: auto !important;
          }

          .dating-swipe-card {
            width: min(100%, 430px) !important;
            min-height: 0 !important;
            height: clamp(430px, calc(100dvh - 230px), 620px) !important;
            aspect-ratio: auto !important;
            border-radius: 26px !important;
          }

          .dating-swipe-card-profile {
            width: min(100%, 430px) !important;
            height: min(650px, max(470px, calc(100dvh - 146px))) !important;
            min-height: 0 !important;
            aspect-ratio: auto !important;
            border-radius: 30px !important;
            box-shadow: 0 28px 90px rgba(0,0,0,0.54) !important;
            touch-action: pan-y;
          }

          .dating-swipe-card-empty {
            height: min(440px, max(280px, calc(100dvh - 300px))) !important;
            min-height: 0 !important;
            aspect-ratio: auto !important;
          }

          .dating-swipe-content {
            left: 14px !important;
            right: 14px !important;
            bottom: max(12px, env(safe-area-inset-bottom)) !important;
            max-height: calc(100% - 72px);
            overflow-y: auto;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
          }

          .dating-swipe-content > p:first-of-type {
            font-size: 34px !important;
            line-height: 1.05 !important;
          }

          .dating-swipe-actions {
            display: flex !important;
            justify-content: space-between !important;
            gap: 10px !important;
            align-items: center;
            margin-top: 14px !important;
            padding: 8px !important;
            background: rgba(0,0,0,0.68) !important;
          }

          .dating-swipe-actions button {
            min-height: 58px;
            width: 58px !important;
            height: 58px !important;
            padding: 0 !important;
          }

          .dating-profile-sheet {
            display: block;
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 8;
            max-height: 72%;
            overflow-y: auto;
            padding: 12px 14px calc(16px + env(safe-area-inset-bottom));
            border-radius: 30px 30px 0 0;
            border: 1px solid rgba(255,255,255,0.12);
            border-bottom: none;
            background: rgba(6,7,12,0.96);
            box-shadow: 0 -26px 70px rgba(0,0,0,0.58);
            backdrop-filter: blur(18px);
            -webkit-overflow-scrolling: touch;
            transform: translateY(100%);
            opacity: 0;
            pointer-events: none;
            transition: transform 220ms ease, opacity 220ms ease;
          }

          .dating-profile-sheet.is-open {
            transform: translateY(0);
            opacity: 1;
            pointer-events: auto;
          }

          .dating-profile-sheet-grip {
            width: 44px;
            height: 4px;
            border-radius: 999px;
            background: rgba(255,255,255,0.36);
            margin: 0 auto 12px;
          }

          .dating-profile-sheet-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 14px;
          }

          .dating-profile-sheet-head button {
            width: 40px !important;
            height: 40px !important;
            min-height: 40px !important;
            flex: 0 0 auto;
          }

          .dating-profile-sheet-photos {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin-top: 8px;
          }

          .dating-profile-sheet-actions {
            position: sticky;
            bottom: 0;
            display: grid;
            grid-template-columns: 0.9fr 1fr 1fr;
            gap: 8px;
            margin: 16px -2px 0;
            padding-top: 10px;
            background: linear-gradient(180deg, transparent, rgba(6,7,12,0.98) 28%);
          }

          .dating-profile-sheet-actions button {
            width: 100%;
            min-height: 46px;
            padding: 10px 8px !important;
          }

          .dating-standard-side {
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: 100%;
            align-self: stretch;
          }

          .dating-standard-side > .dating-compact-grid {
            display: none !important;
          }

          .dating-standard-side > div,
          .dating-worth-grid > div,
          .dating-true-grid > div {
            width: 100% !important;
            max-width: 100% !important;
          }

          .dating-compact-grid,
          .dating-filter-grid,
          .dating-field-grid,
          .dating-menu-grid,
          .dating-plan-grid,
          .dating-true-signal-grid {
            grid-template-columns: 1fr !important;
          }

          .dating-filter-grid > *,
          .dating-field-grid > *,
          .dating-menu-grid > *,
          .dating-plan-grid > *,
          .dating-true-signal-grid > *,
          .dating-photo-area-grid > *,
          .dating-photo-upload-grid > * {
            min-width: 0 !important;
          }

          .dating-chip-row,
          .dating-action-row {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }

          .dating-chip-row button,
          .dating-action-row button,
          .dating-inline-form button,
          .dating-date-plan-card button {
            width: 100%;
          }

          .dating-inline-form {
            display: grid !important;
            grid-template-columns: 1fr !important;
          }

          .dating-date-plan-card {
            padding: 12px !important;
            border-radius: 14px !important;
            overflow: hidden;
          }

          .dating-date-plan-card > p:first-child {
            font-size: 20px !important;
            line-height: 1.05 !important;
            word-break: break-word;
          }

          .dating-date-plan-card [style*="grid-template-columns"],
          .dating-date-plan-card [style*="display: grid"],
          .dating-date-plan-card [style*="display:grid"] {
            grid-template-columns: 1fr !important;
          }

          .dating-date-plan-card [style*="display: flex"],
          .dating-date-plan-card [style*="display:flex"] {
            flex-wrap: wrap !important;
          }

          .dating-date-plan-card input,
          .dating-date-plan-card textarea,
          .dating-date-plan-card select {
            width: 100% !important;
          }

          .dating-date-plan-card button {
            min-width: 0 !important;
          }

          .dating-true-signal-grid > div {
            padding: 12px !important;
            min-height: auto !important;
          }

          .dating-true-signal-grid > div > div:first-child {
            align-items: flex-start !important;
            gap: 10px !important;
          }

          .dating-true-signal-grid button[aria-pressed] {
            min-width: 62px !important;
          }

          .dating-true-grid [style*="grid-template-columns"],
          .dating-worth-grid [style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }

          .dating-true-grid [style*="position: sticky"],
          .dating-worth-grid [style*="position: sticky"] {
            position: relative !important;
            top: auto !important;
          }

          .dating-blind-grid [style*="repeat(auto-fit"] {
            grid-template-columns: 1fr !important;
          }

          .dating-sticky-panel {
            border-radius: 16px !important;
            padding: 16px !important;
          }

          .dating-root input,
          .dating-root textarea,
          .dating-root select,
          .dating-root button {
            font-size: 16px;
          }

          .dating-root button {
            min-height: 44px;
            touch-action: manipulation;
          }

          .dating-root textarea {
            min-height: 72px;
          }

          .dating-root select {
            color-scheme: dark;
          }

          .dating-root [style*="font-size: 68px"],
          .dating-root [style*="font-size: 46px"] {
            font-size: 38px !important;
            line-height: 0.95 !important;
          }

          .dating-root [style*="font-size: 38px"],
          .dating-root [style*="font-size: 34px"],
          .dating-root [style*="font-size: 32px"],
          .dating-root [style*="font-size: 30px"] {
            line-height: 1.05 !important;
          }

          .dating-root [style*="grid-template-columns: repeat(3"],
          .dating-root [style*="grid-template-columns: repeat(2"] {
            grid-template-columns: 1fr !important;
          }

          .dating-safety-center [style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }

          .dating-safety-center [style*="justify-content: space-between"] {
            align-items: flex-start !important;
          }

          .dating-root [role="dialog"] {
            padding: 10px !important;
            place-items: end center !important;
          }

          .dating-root [role="dialog"] > div {
            width: 100% !important;
            max-height: 88dvh !important;
            border-radius: 22px 22px 0 0 !important;
            overflow-y: auto !important;
          }

          .dating-profile-modal {
            align-items: end !important;
            padding: 8px 8px 0 !important;
          }

          .dating-profile-modal-card {
            max-height: 92dvh !important;
            border-radius: 24px 24px 0 0 !important;
            width: 100% !important;
          }

          .dating-profile-modal-head {
            padding: 12px 12px !important;
            align-items: flex-start !important;
          }

          .dating-profile-modal-head > div:first-child {
            min-width: 0;
          }

          .dating-profile-modal-head p:first-of-type {
            font-size: 19px !important;
            line-height: 1 !important;
          }

          .dating-profile-modal-head p:nth-of-type(2) {
            display: none;
          }

          .dating-profile-setup-panel {
            padding: 14px !important;
            border-radius: 18px !important;
          }

          .dating-profile-setup-head p:nth-child(2) {
            font-size: 24px !important;
            line-height: 1.02 !important;
          }

          .dating-setup-progress-card {
            padding: 12px !important;
            border-radius: 16px !important;
          }

          .dating-setup-progress-head {
            display: grid !important;
            grid-template-columns: 1fr !important;
          }

          .dating-setup-progress-head button {
            width: 100%;
          }

          .dating-setup-step-tabs {
            display: flex !important;
            overflow-x: auto;
            gap: 8px !important;
            padding-bottom: 2px;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
          }

          .dating-setup-step-tabs > button {
            flex: 0 0 min(78vw, 240px);
            scroll-snap-align: start;
            min-height: 76px;
          }

          .dating-setup-checks {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }

          .dating-setup-checks > div {
            padding: 8px 9px;
            border-radius: 12px;
            background: rgba(255,255,255,0.035);
            border: 1px solid rgba(255,255,255,0.07);
          }

          .dating-field-grid,
          .dating-photo-area-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }

          .dating-photo-upload-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .dating-profile-setup-footer {
            display: grid !important;
            grid-template-columns: 1fr !important;
            align-items: stretch !important;
          }

          .dating-profile-setup-footer > button,
          .dating-profile-setup-footer > span,
          .dating-profile-setup-footer > span > button {
            width: 100%;
          }

          .dating-profile-setup-footer > span {
            display: grid !important;
            grid-template-columns: 1fr !important;
            justify-content: stretch !important;
          }

          .dating-profile-setup-panel [style*="display: flex"],
          .dating-profile-modal-card [style*="display: flex"] {
            flex-wrap: wrap !important;
          }

          .dating-profile-modal-card [style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }

          .dating-profile-modal-card button {
            min-width: 0 !important;
          }

          .dating-safety-center {
            padding: 14px !important;
          }

          .dating-safety-center > div:first-child {
            align-items: center !important;
          }

          .dating-safety-center > div:first-child p:first-child {
            font-size: 24px !important;
          }

          .dating-root [role="dialog"] input,
          .dating-root [role="dialog"] textarea,
          .dating-root [role="dialog"] select {
            width: 100% !important;
          }

          .dating-root [role="dialog"] [style*="display: flex"] {
            flex-wrap: wrap;
          }

          .dating-root [role="dialog"] button {
            flex: 1 1 auto;
          }

          .dating-root [style*="overflowX: auto"],
          .dating-root [style*="overflow-x: auto"] {
            -webkit-overflow-scrolling: touch;
          }

          .dating-crossed-panel {
            padding: 14px !important;
            border-radius: 24px !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          .dating-crossed-header {
            display: grid !important;
            gap: 10px !important;
            align-items: start !important;
          }

          .dating-crossed-count {
            justify-self: start;
          }

          .dating-crossed-controls {
            grid-template-columns: 1fr !important;
          }

          .dating-crossed-control,
          .dating-crossed-update {
            min-height: 72px;
            width: 100%;
            border-radius: 20px !important;
          }

          .dating-crossed-map {
            min-height: min(620px, 78dvh) !important;
            border-radius: 34px !important;
            margin-top: 14px !important;
            background:
              linear-gradient(180deg, rgba(245,240,229,0.14), rgba(10,11,16,0.94) 58%),
              radial-gradient(circle at 50% 25%, rgba(244,239,225,0.22), transparent 20%),
              radial-gradient(circle at 48% 45%, rgba(225,29,72,0.24), transparent 14%),
              radial-gradient(circle at 24% 32%, rgba(37,99,235,0.18), transparent 18%),
              radial-gradient(circle at 76% 42%, rgba(34,197,94,0.14), transparent 20%),
              #111318 !important;
          }

          .dating-crossed-map > div[style*="bottom: 16px"] {
            top: 18px !important;
            bottom: auto !important;
            align-items: flex-start !important;
          }

          .dating-crossed-map > div[style*="bottom: 16px"] span {
            display: none !important;
          }

          .dating-crossed-map > div[style*="bottom: 16px"] p:first-child {
            max-width: 260px;
            font-size: 34px !important;
            line-height: 0.95 !important;
          }

          .dating-crossed-map > div[style*="bottom: 16px"] p:nth-child(2) {
            max-width: 260px;
            font-size: 13px !important;
          }

          .dating-crossed-sheet {
            display: block;
            position: absolute;
            left: 10px;
            right: 10px;
            bottom: 10px;
            max-height: 58%;
            overflow-y: auto;
            border-radius: 30px 30px 26px 26px;
            padding: 16px 13px 14px;
            background: rgba(3,4,8,0.94);
            border: 1px solid rgba(255,255,255,0.12);
            box-shadow: 0 -20px 60px rgba(0,0,0,0.42);
            backdrop-filter: blur(16px);
            -webkit-overflow-scrolling: touch;
          }

          .dating-crossed-sheet-grip {
            display: block;
            width: 44px;
            height: 4px;
            border-radius: 999px;
            background: rgba(255,255,255,0.34);
            margin: 0 auto 13px;
          }

          .dating-crossed-sheet-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 12px;
          }

          .dating-crossed-card-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .dating-crossed-card {
            position: relative;
            display: block;
            min-height: 150px;
            padding: 0;
            overflow: hidden;
            border-radius: 18px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.06);
            cursor: pointer;
            text-align: left;
          }

          .dating-crossed-card img,
          .dating-crossed-card-fallback {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .dating-crossed-card-fallback {
            display: grid;
            place-items: center;
            color: rgba(255,255,255,0.72);
            background: linear-gradient(145deg, rgba(31,41,55,0.92), rgba(9,10,15,0.98));
          }

          .dating-crossed-card-shade {
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.82));
          }

          .dating-crossed-card-copy {
            position: absolute;
            left: 10px;
            right: 10px;
            bottom: 10px;
            display: grid;
            gap: 2px;
            color: #fff;
            font-family: ${BODY};
            font-weight: 950;
            font-size: 13px;
            text-shadow: 0 2px 10px rgba(0,0,0,0.55);
          }

          .dating-crossed-card-copy small {
            color: rgba(255,255,255,0.72);
            font-size: 10.5px;
            font-weight: 800;
          }

          .dating-crossed-list {
            display: none !important;
          }

          .dating-root table,
          .dating-root thead,
          .dating-root tbody,
          .dating-root tr,
          .dating-root td,
          .dating-root th {
            max-width: 100%;
          }

          .dating-root [style*="minmax(300px"],
          .dating-root [style*="minmax(320px"],
          .dating-root [style*="minmax(340px"],
          .dating-root [style*="minmax(360px"] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .dating-mode-tabs button {
            font-size: 11.5px !important;
            min-height: 38px;
          }

          .dating-hero-title {
            font-size: 29px !important;
          }

          .dating-hero-copy {
            max-width: 100% !important;
          }

          .dating-swipe-content > p:first-of-type {
            font-size: 31px !important;
          }

          .dating-swipe-card-profile {
            height: min(620px, max(450px, calc(100dvh - 132px))) !important;
          }

          .dating-swipe-card-empty {
            height: clamp(300px, calc(100dvh - 320px), 430px) !important;
          }

          .dating-root h1,
          .dating-root h2,
          .dating-root h3,
          .dating-root p {
            max-width: 100%;
          }

          .dating-crossed-map {
            min-height: min(570px, 74dvh) !important;
            border-radius: 28px !important;
          }

          .dating-crossed-map > div[style*="bottom: 16px"] p:first-child {
            font-size: 29px !important;
          }

          .dating-crossed-card {
            min-height: 132px;
          }

          .dating-photo-upload-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .dating-crossed-sheet {
            left: 8px;
            right: 8px;
            bottom: 8px;
            max-height: 62%;
            border-radius: 28px 28px 24px 24px;
          }

          .dating-crossed-card-grid {
            gap: 8px;
          }

          .dating-profile-sheet-photos {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 380px) {
          .dating-hero-title {
            font-size: 27px !important;
          }

          .dating-swipe-card {
            width: 100% !important;
            height: clamp(400px, calc(100dvh - 210px), 590px) !important;
            min-height: 0 !important;
          }

          .dating-swipe-card-profile {
            min-height: 0 !important;
            height: min(590px, max(430px, calc(100dvh - 124px))) !important;
          }

          .dating-swipe-card-empty {
            height: clamp(280px, calc(100dvh - 330px), 400px) !important;
            min-height: 0 !important;
          }

          .dating-swipe-actions {
            gap: 8px !important;
          }

          .dating-profile-sheet {
            max-height: 76%;
            border-radius: 26px 26px 0 0;
          }

          .dating-profile-sheet-actions {
            grid-template-columns: 1fr;
          }

          .dating-swipe-actions button,
          .dating-swipe-actions button:first-child,
          .dating-swipe-actions button:nth-child(3),
          .dating-swipe-actions button:nth-child(4) {
            min-height: 46px;
            height: 46px !important;
            width: 46px !important;
          }

          .dating-crossed-card-grid,
          .dating-profile-sheet-photos {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function panel(bg = "rgba(255,255,255,0.035)", border = "rgba(255,255,255,0.08)") {
  return { background: bg.startsWith("linear") ? bg : `linear-gradient(150deg, ${bg}, rgba(255,255,255,0.03))`, border: `1px solid ${border}`, borderRadius: 18, padding: 20 };
}
function primaryBtn(bg = ACCENT) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: bg, border: "none", borderRadius: 12, color: "#fff", fontFamily: BODY, fontSize: 13, fontWeight: 900, padding: "12px 18px", cursor: "pointer" }; }
function ghostBtn() { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontFamily: BODY, fontSize: 13, fontWeight: 800, padding: "12px 16px", cursor: "pointer" }; }
function dangerBtn() { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(225,29,72,0.14)", border: "1px solid rgba(225,29,72,0.36)", borderRadius: 12, color: "#fecdd3", fontFamily: BODY, fontSize: 13, fontWeight: 900, padding: "12px 16px", cursor: "pointer" }; }
function circleBtn(bg, color) { return { width: 56, height: 56, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.14)", background: bg, color, fontFamily: BODY, fontSize: 24, lineHeight: 1, fontWeight: 950, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: bg === ACCENT ? "0 12px 30px rgba(225,29,72,0.35)" : "none" }; }
function chipBtn(active) { return { border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.1)"}`, borderRadius: 999, background: active ? `${ACCENT}22` : "rgba(255,255,255,0.04)", color: active ? "#fff" : "rgba(255,255,255,0.62)", fontFamily: BODY, fontSize: 12, fontWeight: 800, padding: "9px 13px", cursor: "pointer" }; }
function privacyRowStyle(active) { return { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 14, border: `1px solid ${active ? "rgba(34,197,94,0.34)" : "rgba(255,255,255,0.1)"}`, background: active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.045)", color: active ? "#bbf7d0" : "rgba(255,255,255,0.72)", padding: "11px 12px", fontFamily: BODY, fontSize: 12, fontWeight: 900, cursor: "pointer", textAlign: "left" }; }
function fieldWrap() { return { display: "block" }; }
function fieldLabel() { return { display: "block", fontFamily: BODY, color: "rgba(255,255,255,0.52)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }; }
function inputStyle(disabled = false) { return { width: "100%", boxSizing: "border-box", background: disabled ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: disabled ? "rgba(255,255,255,0.48)" : "#fff", fontFamily: BODY, fontSize: 14, padding: "12px 13px", outline: "none", cursor: disabled ? "not-allowed" : "text", opacity: disabled ? 0.72 : 1 }; }
function pickerButtonStyle(error = false, hasValue = false, disabled = false) { return { width: "100%", minHeight: 48, boxSizing: "border-box", padding: "12px 14px", background: disabled ? "rgba(255,255,255,0.035)" : "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.035))", border: `1px solid ${error ? "#fb7185" : "rgba(255,255,255,0.12)"}`, boxShadow: error ? "0 0 0 3px rgba(244,63,94,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.06)", borderRadius: 12, color: disabled ? "rgba(255,255,255,0.38)" : hasValue ? "#fff" : "rgba(255,255,255,0.48)", fontFamily: BODY, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", opacity: disabled ? 0.72 : 1 }; }
function pickerPopoverStyle() { return { position: "absolute", zIndex: 90, top: "calc(100% + 10px)", left: 0, width: "min(340px, 92vw)", background: "linear-gradient(160deg, rgba(36,18,25,0.98), rgba(13,13,18,0.98))", border: "1px solid rgba(244,63,94,0.28)", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)", padding: 14 }; }
function pickerNavBtn() { return { width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontFamily: BODY, fontSize: 18, fontWeight: 900 }; }
function pickerSelectStyle() { return { flex: 1, minWidth: 0, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", padding: "8px 10px", fontFamily: BODY, fontWeight: 900, colorScheme: "dark", outline: "none" }; }
function pickerWeekdayStyle() { return { textAlign: "center", color: "rgba(255,255,255,0.42)", fontFamily: BODY, fontSize: 11, fontWeight: 900, padding: "4px 0" }; }
function pickerDayStyle(active = false, disabled = false) { return { aspectRatio: "1 / 1", borderRadius: 12, border: active ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.07)", background: active ? "linear-gradient(135deg, #f43f5e, #be123c)" : "rgba(255,255,255,0.045)", color: disabled ? "rgba(255,255,255,0.2)" : "#fff", fontFamily: BODY, fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1 }; }
function pickerTimeStyle(active = false) { return { minHeight: 42, borderRadius: 12, border: active ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.08)", background: active ? "linear-gradient(135deg, #f43f5e, #be123c)" : "rgba(255,255,255,0.05)", color: "#fff", fontFamily: BODY, fontSize: 12, fontWeight: 900, cursor: "pointer" }; }
function tinySpinner() { return { width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.26)", borderTopColor: "#fff", display: "inline-block", animation: "spin 0.8s linear infinite" }; }
function sectionTitle(size = 32) { return { fontFamily: HEAD, color: "#fff", fontSize: size, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }; }
function mutedText(size = 13) { return { fontFamily: BODY, color: "rgba(255,255,255,0.58)", fontSize: size, lineHeight: 1.55, marginTop: 6 }; }
function errorText() { return { fontFamily: BODY, color: "#fca5a5", fontSize: 12.5, lineHeight: 1.5, marginTop: 12 }; }
function miniTile() { return { borderRadius: 12, padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)" }; }
function eyebrow() { return { fontFamily: BODY, color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }; }
function anonymousAvatar() { return { width: 46, height: 46, borderRadius: "50%", background: "linear-gradient(135deg,#2f3344,#12131a)", border: "1px solid rgba(255,255,255,0.12)", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.55)", fontFamily: HEAD, fontSize: 20, fontWeight: 900 }; }
function questionTile() { return { padding: "11px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 8, fontFamily: BODY, color: "rgba(255,255,255,0.66)", fontSize: 12.5 }; }
function softStep() { return { display: "flex", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }; }
function stepNumber() { return { width: 34, height: 34, borderRadius: 12, background: "rgba(225,29,72,0.17)", color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: HEAD, fontSize: 20, fontWeight: 900, flexShrink: 0 }; }
function sectionBlock() { return { marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }; }
function sectionHeaderRow() { return { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }; }
function choiceChip(active = false, disabled = false) { return { border: `1px solid ${active ? "rgba(225,29,72,0.7)" : "rgba(255,255,255,0.1)"}`, background: active ? "rgba(225,29,72,0.2)" : "rgba(255,255,255,0.055)", color: disabled ? "rgba(255,255,255,0.45)" : active ? "#fff" : "rgba(255,255,255,0.72)", borderRadius: 999, padding: "8px 11px", fontFamily: BODY, fontSize: 12, fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.7 : 1 }; }
function icebreakerNumber() { return { width: 34, height: 34, borderRadius: 12, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: BODY, color: "#fff", fontSize: 12, fontWeight: 900 }; }
function revealMeter() { return { borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }; }
function reportDetailsBox() { return { borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.08)" }; }
function profileBadge() { return { display: "inline-flex", padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.68)", fontFamily: BODY, fontSize: 11, fontWeight: 900, marginBottom: 10 }; }
function tagStyle() { return { borderRadius: 999, padding: "5px 8px", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontFamily: BODY, fontSize: 11, fontWeight: 800 }; }
function railRow() { return { display: "flex", alignItems: "center", gap: 10, padding: 12, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }; }

export default DatingPage;
