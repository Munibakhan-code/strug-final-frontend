const EVENT_VALUES = new Set([
  'page_viewed',
  'route_started',
  'route_resolved',
  'pickup_confidence_shown',
  'pickup_adjusted',
  'vehicle_selected',
  'confirmation_started',
  'confirmation_completed',
  'matching_started',
  'matching_expanded',
  'matching_delayed',
  'matched',
  'no_driver',
  'cancelled',
  'driver_arrived',
  'pickup_verified',
  'ride_started',
  'ride_completed',
  'rating_submitted',
  'book_again',
]);

const ANALYTICS_CATEGORY_VALUES = {
  vehicle_type: new Set(['economy', 'comfort', 'premium', 'suv', 'xl', 'accessible']),
  confidence: new Set(['high', 'medium', 'low', 'unknown']),
  matching_phase: new Set(['contacting', 'expanding', 'delayed']),
  payment_method: new Set(['card', 'wallet', 'cash', 'paypal']),
  price_mode: new Set(['standard', 'setprice']),
};

const DECIMAL_NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const POSITIVE_INTEGER = /^\d+$/;
const MAX_ANALYTICS_ELAPSED_MS = 24 * 60 * 60 * 1000;

function normalizedCategory(value, allowedValues) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  return allowedValues.has(normalized) ? normalized : null;
}

function normalizedRideRequestId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !POSITIVE_INTEGER.test(value)) return null;

  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

export function getPickupConfidence({
  routeResolved,
  availabilityKnown,
  nearbyCount = 0,
} = {}) {
  if (!availabilityKnown) {
    return { level: 'unknown', blocksBooking: false, reason: 'availability_unknown' };
  }
  if (!routeResolved) {
    return { level: 'low', blocksBooking: true, reason: 'route_unresolved' };
  }
  if (nearbyCount <= 0) {
    return { level: 'low', blocksBooking: true, reason: 'no_nearby_drivers' };
  }
  if (nearbyCount === 1) {
    return { level: 'medium', blocksBooking: false, reason: 'limited_supply' };
  }
  return { level: 'high', blocksBooking: false, reason: 'good_supply' };
}

export function getPickupRange({ nearestDistanceKm } = {}) {
  const isNumber = typeof nearestDistanceKm === 'number';
  const isDecimalString = typeof nearestDistanceKm === 'string'
    && DECIMAL_NUMBER.test(nearestDistanceKm);
  if (!isNumber && !isDecimalString) return null;

  const distance = isNumber ? nearestDistanceKm : Number(nearestDistanceKm);
  if (!Number.isFinite(distance) || distance < 0) return null;

  const min = Math.max(2, Math.ceil(distance * 2.5));
  return { min, max: min + 3 };
}

export function getMatchingPhase(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 20_000) return 'contacting';
  if (elapsedMs < 45_000) return 'expanding';
  return 'delayed';
}

export function isDriverLocationStale(updatedAt, now = Date.now()) {
  if (updatedAt == null || updatedAt === '') return true;

  const updatedAtMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return true;

  return now - updatedAtMs > 15_000;
}

const RIDE_STEP_RANK = { hydrating: 0, hydration_error: 0, searching: 1, matched: 2, inride: 3, done: 4 };
const TERMINAL_RIDE_STEPS = new Set(['done', 'cancelled', 'no_driver']);

export function canApplyRideTransition(current, next) {
  if (!next || current === next) return true;
  if (TERMINAL_RIDE_STEPS.has(current)) return false;
  if (TERMINAL_RIDE_STEPS.has(next)) return true;
  return (RIDE_STEP_RANK[next] ?? -1) >= (RIDE_STEP_RANK[current] ?? -1);
}

export function pickRecommendedVehicle(options) {
  if (!Array.isArray(options)) return null;

  let recommended = null;
  for (const option of options) {
    if (!option || !Number.isFinite(option.total)) continue;
    if (recommended === null || option.total < recommended.total) recommended = option;
  }
  return recommended;
}

export function buildRideOptions(catalog, estimatesByType, pickupRange) {
  if (!Array.isArray(catalog)) return [];
  const options = catalog.map((vehicle) => ({
    ...vehicle,
    total: Number.isFinite(estimatesByType?.[vehicle?.id]?.total)
      ? estimatesByType[vehicle.id].total
      : null,
    breakdown: estimatesByType?.[vehicle?.id] ?? null,
    pickupRange,
  }));
  const recommended = pickRecommendedVehicle(options);
  return options.map((option) => ({
    ...option,
    recommended: option.id === recommended?.id,
  }));
}

export function chooseRideOption(options, selectedId, userSelected = false) {
  const selected = Array.isArray(options)
    ? options.find((option) => option?.id === selectedId)
    : null;
  if (userSelected && Number.isFinite(selected?.total)) return selectedId;
  return pickRecommendedVehicle(options)?.id ?? selectedId;
}

export function getNearbySupply(drivers, availabilityKnown = false) {
  if (!availabilityKnown || !Array.isArray(drivers)) {
    return { nearbyCount: 0, nearestDistanceKm: null, availabilityKnown: false };
  }
  const nearestDistanceKm = drivers.reduce((nearest, driver) => {
    const distance = Number(driver?.distance_km);
    return Number.isFinite(distance) && (nearest == null || distance < nearest)
      ? distance
      : nearest;
  }, null);
  return { nearbyCount: drivers.length, nearestDistanceKm, availabilityKnown: true };
}

export function validateCustomRideOffer(value) {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return { valid: false, amount: null, reason: 'syntax' };
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 1) return { valid: false, amount: null, reason: 'minimum' };
  return { valid: true, amount, reason: null };
}

export function validateRideSchedule({ timing = 'now', scheduleDate = '', scheduleTime = '', now = Date.now() } = {}) {
  if (timing !== 'schedule') return { valid: true, scheduledAt: null, reason: null };
  if (!scheduleDate || !scheduleTime) return { valid: false, scheduledAt: null, reason: 'schedule_incomplete' };
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduleDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(scheduleTime);
  if (!dateMatch || !timeMatch) return { valid: false, scheduledAt: null, reason: 'schedule_invalid' };

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return { valid: false, scheduledAt: null, reason: 'schedule_invalid' };
  const scheduled = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    scheduled.getFullYear() !== year
    || scheduled.getMonth() !== month - 1
    || scheduled.getDate() !== day
    || scheduled.getHours() !== hour
    || scheduled.getMinutes() !== minute
  ) return { valid: false, scheduledAt: null, reason: 'schedule_invalid' };
  if (scheduled.getTime() <= Number(now)) return { valid: false, scheduledAt: null, reason: 'schedule_past' };
  return { valid: true, scheduledAt: `${scheduleDate}T${scheduleTime}`, reason: null };
}

export function buildRideAnalyticsPayload(event, metadata = {}) {
  const payload = {};
  const normalizedEvent = normalizedCategory(event, EVENT_VALUES);
  if (normalizedEvent !== null) payload.event = normalizedEvent;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return payload;

  const rideRequestId = normalizedRideRequestId(metadata.ride_request_id);
  if (rideRequestId !== null) payload.ride_request_id = rideRequestId;

  for (const [field, allowedValues] of Object.entries(ANALYTICS_CATEGORY_VALUES)) {
    const normalized = normalizedCategory(metadata[field], allowedValues);
    if (normalized !== null) payload[field] = normalized;
  }

  if (typeof metadata.route_resolved === 'boolean') {
    payload.route_resolved = metadata.route_resolved;
  }
  if (
    typeof metadata.elapsed_ms === 'number'
    && Number.isFinite(metadata.elapsed_ms)
    && metadata.elapsed_ms >= 0
    && metadata.elapsed_ms <= MAX_ANALYTICS_ELAPSED_MS
  ) payload.elapsed_ms = metadata.elapsed_ms;

  return payload;
}
