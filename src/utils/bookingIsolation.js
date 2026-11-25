/**
 * Temp Stay / booking-host isolation helpers (Phase 1).
 * Prefer server-side ?vertical=; these helpers are belt-and-suspenders + unit-tested.
 */

/** Vertical profile key for a hosting-mode portal (not the legacy shared "hosting"). */
export function hostPortalProfileVertical(dashboardVertical) {
  const v = String(dashboardVertical || '').trim();
  if (!v || v === 'hosting') return 'tempstay';
  return v;
}

/** Guest deep-link / profile vertical for a Temp Stay listing host. */
export const TEMPSTAY_PROFILE_VERTICAL = 'tempstay';

/** Guest deep-link / profile vertical for a Vehicle rental host. */
export const VEHICLE_PROFILE_VERTICAL = 'vehicle';

/** Guest deep-link / profile vertical for a Venue host. */
export const VENUE_PROFILE_VERTICAL = 'venue';

/** Guest deep-link / profile vertical for an Equipment rental host. */
export const EQUIPMENT_PROFILE_VERTICAL = 'equipment';

/** Guest deep-link / profile vertical for an Event organiser. */
export const EVENT_PROFILE_VERTICAL = 'event';

/** Legacy profile key some hosts wrote before Phase 1 isolation. */
export const LEGACY_HOSTING_PROFILE_VERTICAL = 'hosting';

/**
 * Filter engine listing rows to one vertical (client-side fallback).
 */
export function filterRowsByVertical(rows, vertical) {
  const list = Array.isArray(rows) ? rows : [];
  if (!vertical) return list;
  return list.filter((row) => row?.vertical === vertical);
}
