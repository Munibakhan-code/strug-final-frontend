/**
 * Browse-grid availability for a single event date (Phase 5 follow-on).
 */
import { buildUnavailableNightSet, eventDateConflicts } from './venueAvailability.js';

export function venueAvailableOnDate(unavailableDays, eventDate) {
  if (!eventDate) return true;
  const blocked = unavailableDays instanceof Set ? unavailableDays : buildUnavailableNightSet(unavailableDays);
  return !eventDateConflicts(eventDate, blocked);
}

/** Build id → availability entry from parallel availability API responses. */
export function indexVenueAvailability(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.id) continue;
    if (row.ok === false || row.payload == null) {
      map.set(String(row.id), { ok: false });
      continue;
    }
    map.set(String(row.id), { ok: true, blocked: buildUnavailableNightSet(row.payload) });
  }
  return map;
}

/** Browse filter: only exclude when we successfully loaded and the date is blocked. */
export function venuePassesBrowseDateFilter(entry, eventDate) {
  if (!eventDate) return true;
  if (!entry?.ok) return true;
  return venueAvailableOnDate(entry.blocked, eventDate);
}
