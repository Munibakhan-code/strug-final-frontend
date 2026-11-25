// Shared Event (v1) — the one "event" a customer is planning across Venues /
// Catering / Floral. Backed by the existing event_plan table (Event Concierge),
// this module just tracks which plan is active on this device and keeps its
// shared date / city / guests in sync with whatever page the customer is on.
//
// It is deliberately tiny: a localStorage pointer to the active plan id, an
// in-memory copy of the plan, and a pub/sub so the pill + the three vertical
// pages re-render together. No Redux, matching src/store/auth.js.

import { useSyncExternalStore, useCallback } from 'react';
import { getEventPlan, updateEventPlan, createEventPlan } from '../api/eventConcierge.js';
import { isAuthenticated } from './auth.js';

const ACTIVE_KEY = 'strug_event_active_plan';

let state = {
  planId: readActiveId(),
  plan: null,
  loading: false,
};
const listeners = new Set();

function readActiveId() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeActiveId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, String(id));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* private mode — non-fatal */ }
}

function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return state;
}

/** ISO timestamp (noon-UTC) -> YYYY-MM-DD for <input type="date">. */
export function planDateInput(plan) {
  const v = plan?.event_date;
  if (!v) return '';
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

export function getActivePlanId() {
  return state.planId;
}

/** Load (or reload) the active plan from the server. Safe to call repeatedly. */
export async function refreshActivePlan() {
  const id = state.planId;
  if (!id || !isAuthenticated()) {
    if (state.plan) setState({ plan: null });
    return null;
  }
  setState({ loading: true });
  try {
    const plan = await getEventPlan(id);
    setState({ plan: plan ?? null, loading: false });
    return plan ?? null;
  } catch (err) {
    // 403/404 → the pointer is stale (deleted plan, different account). Drop it.
    const status = err?.response?.status;
    if (status === 403 || status === 404) {
      writeActiveId(null);
      setState({ planId: null, plan: null, loading: false });
    } else {
      setState({ loading: false });
    }
    return null;
  }
}

export function setActivePlan(planOrId) {
  const id = typeof planOrId === 'object' ? planOrId?.event_plan_id : Number(planOrId);
  if (!id) return;
  writeActiveId(id);
  setState({
    planId: id,
    plan: typeof planOrId === 'object' && planOrId?.event_plan_id ? planOrId : null,
  });
  if (!(typeof planOrId === 'object' && planOrId?.needs)) refreshActivePlan();
}

export function clearActivePlan() {
  writeActiveId(null);
  setState({ planId: null, plan: null });
}

/**
 * Create a lightweight shared event (occasion "dinner" seeds exactly
 * venue + catering + floral needs) and make it active.
 */
export async function startSharedEvent({ title, occasion = 'dinner', date, city, guests } = {}) {
  const plan = await createEventPlan({
    title: (title && title.trim()) || 'My event',
    occasion,
    event_date: date || undefined,
    city: city || undefined,
    guests: guests != null && guests !== '' ? Number(guests) : undefined,
    seed_needs: true,
  });
  if (plan?.event_plan_id) setActivePlan(plan);
  return plan;
}

// Debounced write-back so dragging a guest stepper doesn't spam the API.
let saveTimer = null;
let pendingPatch = {};

function flushPatch() {
  const id = state.planId;
  const body = pendingPatch;
  pendingPatch = {};
  saveTimer = null;
  if (!id || !Object.keys(body).length) return;
  updateEventPlan(id, body).catch(() => { /* best-effort; local copy already updated */ });
}

/**
 * Update shared fields. Accepts { date, city, guests } (friendly names) and/or
 * raw event_plan columns. Optimistically patches the local copy, then debounces
 * the PATCH.
 */
export function patchSharedFields(fields = {}) {
  if (!state.planId) return;
  const body = {};
  if ('date' in fields) body.event_date = fields.date || null;
  if ('city' in fields) body.city = fields.city || null;
  if ('guests' in fields) body.guests = fields.guests != null && fields.guests !== '' ? Number(fields.guests) : null;
  for (const k of ['event_date', 'city', 'guests', 'title', 'notes', 'occasion']) {
    if (k in fields) body[k] = fields[k];
  }
  if (!Object.keys(body).length) return;

  if (state.plan) setState({ plan: { ...state.plan, ...body } });
  pendingPatch = { ...pendingPatch, ...body };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPatch, 600);
}

/** React hook: the active shared event + helpers. */
export function useEventPlan() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    planId: snap.planId,
    plan: snap.plan,
    loading: snap.loading,
    hasActiveEvent: !!snap.planId,
    dateInput: planDateInput(snap.plan),
    city: snap.plan?.city ?? '',
    guests: snap.plan?.guests ?? null,
    refresh: refreshActivePlan,
    patch: patchSharedFields,
    setActivePlan,
    clearActivePlan,
    startSharedEvent,
  };
}

/**
 * Convenience for a vertical page: current shared date/guests/city plus a setter
 * that writes straight back to the plan (no-op when there is no active event).
 */
export function useSharedEventFields() {
  const { hasActiveEvent, dateInput, city, guests, patch } = useEventPlan();
  const setDate = useCallback((d) => patch({ date: d }), [patch]);
  const setCity = useCallback((c) => patch({ city: c }), [patch]);
  const setGuests = useCallback((g) => patch({ guests: g }), [patch]);
  return { hasActiveEvent, date: dateInput, city, guests, setDate, setCity, setGuests };
}
