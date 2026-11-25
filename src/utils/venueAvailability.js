/**
 * Venue event-day availability helpers (Phase 3).
 * Reuses Temp Stay set-building; conflict check is single-day (price_unit: event).
 */
import {
  buildUnavailableNightSet,
  toISODate,
} from './tempstayAvailability.js';

export { buildUnavailableNightSet, toISODate };

/** True when the chosen event date is blocked or already booked. */
export function eventDateConflicts(eventDate, unavailable) {
  const d = toISODate(eventDate);
  if (!d || !unavailable?.size) return false;
  return unavailable.has(d);
}

/** YYYY-MM-DD for date input min= (local calendar day). */
export function todayISODate(now = new Date()) {
  return toISODate(now);
}
