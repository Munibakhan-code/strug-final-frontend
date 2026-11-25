// Shared Event (v1) — the event cart. Up to three lines (venue / catering /
// floral) that the customer assembles across the three pages and pays for in one
// checkout. Persisted per active plan in localStorage and mirrored to the plan on
// the server (package_json.cart) so it survives a reload or a device switch.

import { useSyncExternalStore } from 'react';
import { saveEventCart } from '../api/eventConcierge.js';
import { getActivePlanId } from './eventPlan.js';

export const EVENT_CART_CATEGORIES = ['venue', 'catering', 'floral'];

const KEY_PREFIX = 'strug_event_cart_';

let planKey = keyFor(getActivePlanId());
let cart = read(planKey);
const listeners = new Set();

function keyFor(planId) {
  return planId ? `${KEY_PREFIX}${planId}` : `${KEY_PREFIX}none`;
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode — non-fatal */ }
}

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  // Re-point at the current plan's cart if the active plan changed under us.
  const k = keyFor(getActivePlanId());
  if (k !== planKey) {
    planKey = k;
    cart = read(k);
  }
  return cart;
}

let mirrorTimer = null;
function mirror() {
  const planId = getActivePlanId();
  if (!planId) return;
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    mirrorTimer = null;
    saveEventCart(planId, cart).catch(() => { /* best-effort */ });
  }, 500);
}

function commit(next) {
  cart = next;
  write(planKey, cart);
  emit();
  mirror();
}

/** Add / replace one line. `line` is a small selection blob (see EventPlan checkout). */
export function setEventCartLine(category, line) {
  if (!EVENT_CART_CATEGORIES.includes(category)) return;
  commit({ ...cart, [category]: { ...line, category } });
}

export function removeEventCartLine(category) {
  if (!(category in cart)) return;
  const next = { ...cart };
  delete next[category];
  commit(next);
}

export function clearEventCart() {
  commit({});
}

/** Replace the whole cart (used when hydrating from the server plan). */
export function hydrateEventCart(serverCart) {
  if (!serverCart || typeof serverCart !== 'object') return;
  const next = {};
  for (const cat of EVENT_CART_CATEGORIES) {
    if (serverCart[cat]) next[cat] = { ...serverCart[cat], category: cat };
  }
  // Don't clobber a fuller local cart with an empty server payload.
  if (Object.keys(next).length >= Object.keys(cart).length) {
    cart = next;
    write(planKey, cart);
    emit();
  }
}

export function eventCartLines(c = cart) {
  return EVENT_CART_CATEGORIES.filter((cat) => c[cat]).map((cat) => ({ category: cat, ...c[cat] }));
}

export function eventCartTotal(c = cart) {
  return eventCartLines(c).reduce((sum, l) => sum + (Number(l.line_total) || 0), 0);
}

export function useEventCart() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const lines = eventCartLines(snap);
  return {
    cart: snap,
    lines,
    count: lines.length,
    total: eventCartTotal(snap),
    has: (cat) => !!snap[cat],
    setLine: setEventCartLine,
    removeLine: removeEventCartLine,
    clear: clearEventCart,
  };
}
