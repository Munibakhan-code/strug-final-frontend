/**
 * Helpers for <input type="datetime-local"> values in the *local* timezone.
 * Using Date#toISOString().slice(0, 16) feeds UTC into a local control and shifts the time.
 */

/** @param {Date} [date] */
export function toDatetimeLocalValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

/**
 * Parse a datetime-local string as local wall time → epoch ms.
 * Empty / invalid → null.
 * @param {string} value
 */
export function fromDatetimeLocalValue(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Quick schedule presets relative to now (local).
 * @param {Date} [now]
 * @returns {{ id: string, label: string, at: number }[]}
 */
export function schedulePresets(now = new Date()) {
  const base = now instanceof Date ? now.getTime() : Date.now();
  const in15 = base + 15 * 60 * 1000;
  const in1h = base + 60 * 60 * 1000;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  let tomorrowAt = tomorrow.getTime();
  if (tomorrowAt <= base) {
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrowAt = tomorrow.getTime();
  }
  return [
    { id: "15m", label: "In 15 min", at: in15 },
    { id: "1h", label: "In 1 hour", at: in1h },
    { id: "tomorrow9", label: "Tomorrow 9:00", at: tomorrowAt },
  ];
}
