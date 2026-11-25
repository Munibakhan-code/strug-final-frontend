// Tracks the last few verticals a user has browsed, for the home page's "Jump
// back in" row and the sidebar's pinned row. Both surfaces read this same
// list so pinning stays in sync everywhere instead of being two features.
const RECENT_KEY = "strug_recent_verticals";
const MAX_RECENTS = 4;

// Sidebar "Pinned" row can operate in one of two modes:
//   "recent" (default) — auto top-3 recently-visited verticals (legacy behavior)
//   "manual"           — user hand-picks up to MAX_PINS categories to pin
const PIN_MODE_KEY = "strug_pin_mode";
const MANUAL_PINS_KEY = "strug_manual_pins";
const MAX_PINS = 3;
const VALID_MODES = new Set(["recent", "manual"]);

// Account/utility pages aren't "categories" to jump back into, so visiting
// them never bumps the recent list.
const EXCLUDED_IDS = new Set([
  "home",
  "become",
  "provider",
  "admin",
  "ai",
  "refcodes",
  "wallet",
  "messages",
  "dashboard",
  "orders",
  "settings",
  "help",
  "dating",
]);

export function getRecentVerticals() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    const filtered = stored.filter((id) => !EXCLUDED_IDS.has(id));
    if (filtered.length !== stored.length) {
      localStorage.setItem(RECENT_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
}

// Records a visit and returns the updated list (most-recent-first, deduped,
// capped at MAX_RECENTS) so callers can setState directly with the result.
export function pushRecentVertical(id) {
  if (EXCLUDED_IDS.has(id)) return getRecentVerticals();
  const next = [id, ...getRecentVerticals().filter((x) => x !== id)].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — recents just won't persist */
  }
  return next;
}

// --- Pinned-row mode ---------------------------------------------------------

// Excluded (account/utility) ids are never pinnable and must not show a pin
// affordance in the sidebar.
export function isPinnable(id) {
  return !EXCLUDED_IDS.has(id);
}

export function getPinMode() {
  try {
    const stored = localStorage.getItem(PIN_MODE_KEY);
    return VALID_MODES.has(stored) ? stored : "recent";
  } catch {
    return "recent";
  }
}

export function setPinMode(mode) {
  const next = VALID_MODES.has(mode) ? mode : "recent";
  try {
    localStorage.setItem(PIN_MODE_KEY, next);
  } catch {
    /* quota / private mode — mode just won't persist */
  }
  return next;
}

// User-chosen pins (manual mode). Excluded ids can never be pinned, and we cap
// at MAX_PINS defensively in case the stored list was tampered with.
// `max` is the responsive cap the sidebar passes (2 on smaller screens, 3 on
// larger); it never exceeds MAX_PINS.
export function getManualPins(max = MAX_PINS) {
  try {
    const stored = JSON.parse(localStorage.getItem(MANUAL_PINS_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((id) => !EXCLUDED_IDS.has(id)).slice(0, Math.min(max, MAX_PINS));
  } catch {
    return [];
  }
}

// Adds a pin to the END (or removes it if already pinned), evicting the oldest
// once past `max`. Returns the new list so callers can setState directly.
export function toggleManualPin(id, max = MAX_PINS) {
  if (EXCLUDED_IDS.has(id)) return getManualPins(max);
  const cap = Math.min(max, MAX_PINS);
  const current = getManualPins(max);
  let next;
  if (current.includes(id)) {
    next = current.filter((x) => x !== id);
  } else {
    next = [...current, id].slice(-cap);
  }
  try {
    localStorage.setItem(MANUAL_PINS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — pins just won't persist */
  }
  return next;
}

// The single source the sidebar reads to decide what to show in the pinned row.
// `max` = the responsive cap (2 normally, 3 on larger screens).
export function getSidebarPinnedIds(max = MAX_PINS) {
  const cap = Math.min(max, MAX_PINS);
  if (getPinMode() === "manual") return getManualPins(cap);
  return getRecentVerticals().slice(0, cap);
}
