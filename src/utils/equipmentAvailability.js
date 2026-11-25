/**
 * Equipment day-rental availability (Phase 3).
 * Reuses stay-range helpers; multi-unit capacity only marks a night fully
 * unavailable when used copies >= capacity (host blocks always block).
 * Quote remains server authority for remaining inventory / guest quantity.
 */

import {
  buildUnavailableNightSet,
  expandDateRangeNights,
  stayRangeConflicts,
  toISODate,
} from './tempstayAvailability.js';

export { stayRangeConflicts, expandDateRangeNights, toISODate };

function resolveCapacity(capacity) {
  if (capacity == null || capacity === '') return 1;
  const n = Number(capacity);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function bookingQuantity(row) {
  if (row?.quantity == null || row.quantity === '') return 1;
  const n = Number(row.quantity);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Build unavailable night set for equipment.
 * @param {{ blocked?: Array, booked?: Array }|object} data availability payload
 * @param {{ capacity?: number|null }} [opts]
 */
export function buildEquipmentUnavailableNightSet(data, { capacity } = {}) {
  const cap = resolveCapacity(capacity);
  if (cap <= 1) return buildUnavailableNightSet(data);

  const payload = data?.data ?? data ?? {};
  const set = new Set();
  for (const row of payload.blocked || []) {
    if (row?.is_blocked && row.date) set.add(toISODate(row.date));
  }

  const usedByNight = new Map();
  for (const b of payload.booked || []) {
    const qty = bookingQuantity(b);
    const nights = expandDateRangeNights(b.start_date, b.end_date);
    for (const night of nights) {
      usedByNight.set(night, (usedByNight.get(night) || 0) + qty);
    }
  }
  for (const [night, used] of usedByNight) {
    if (used >= cap) set.add(night);
  }
  return set;
}
