/**
 * Orders & History / Account dashboard status bucketing.
 *
 * Food pickup ends at `picked_up` (rateable + seller KPI "completed").
 * Food delivery treats `picked_up` as in-transit until `delivered`.
 */

const COMPLETED = new Set([
  "completed",
  "delivered",
  "shipped",
  "done",
  "finished",
  "picked_up",
  "pickedup",
]);

const IN_PROGRESS = new Set([
  "pending",
  "in-progress",
  "in_progress",
  "processing",
  "accepted",
  "confirmed",
  "on_the_way",
  "arrived",
  "preparing",
  "ready_for_pickup",
  "ready",
  "dispatched",
  "out_for_delivery",
  "ongoing",
  // Booking-engine (mechanic/tempstay/etc.) statuses — awaiting the host's
  // response or already checked in, neither cancelled nor finished yet.
  "requested",
  "awaiting_host",
  "checked_in",
]);

const CANCELLED = new Set([
  "cancelled",
  "canceled",
  "declined",
  "rejected",
]);

export function normalizeOrderStatus(status) {
  return String(status ?? "")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isDeliveryFulfillment(deliveryMode) {
  const mode = String(deliveryMode ?? "").toLowerCase();
  return mode === "delivery" || mode === "ship_by_seller";
}

/**
 * @param {string} status
 * @param {{ deliveryMode?: string|null }} [opts]
 * @returns {"completed"|"in_progress"|"cancelled"|"other"}
 */
export function orderHistoryBucket(status, { deliveryMode } = {}) {
  const s = normalizeOrderStatus(status);
  if (CANCELLED.has(s)) return "cancelled";

  // Courier has the bag, but customer has not received it yet.
  if ((s === "picked_up" || s === "pickedup") && isDeliveryFulfillment(deliveryMode)) {
    return "in_progress";
  }

  if (COMPLETED.has(s)) return "completed";
  if (IN_PROGRESS.has(s)) return "in_progress";
  return "other";
}

export function isOrderHistoryCompleted(orderOrStatus, opts) {
  if (orderOrStatus && typeof orderOrStatus === "object") {
    return orderHistoryBucket(orderOrStatus.status, {
      deliveryMode: opts?.deliveryMode ?? orderOrStatus.deliveryMode,
    }) === "completed";
  }
  return orderHistoryBucket(orderOrStatus, opts) === "completed";
}

export function isOrderHistoryInProgress(orderOrStatus, opts) {
  if (orderOrStatus && typeof orderOrStatus === "object") {
    return orderHistoryBucket(orderOrStatus.status, {
      deliveryMode: opts?.deliveryMode ?? orderOrStatus.deliveryMode,
    }) === "in_progress";
  }
  return orderHistoryBucket(orderOrStatus, opts) === "in_progress";
}

export function isOrderHistoryCancelled(orderOrStatus) {
  const status =
    orderOrStatus && typeof orderOrStatus === "object"
      ? orderOrStatus.status
      : orderOrStatus;
  return orderHistoryBucket(status) === "cancelled";
}

export function summarizeOrderHistory(orders) {
  const list = Array.isArray(orders) ? orders : [];
  let completed = 0;
  let inProgress = 0;
  let cancelled = 0;
  for (const o of list) {
    const bucket = orderHistoryBucket(o?.status, { deliveryMode: o?.deliveryMode });
    if (bucket === "completed") completed += 1;
    else if (bucket === "in_progress") inProgress += 1;
    else if (bucket === "cancelled") cancelled += 1;
  }
  return {
    total: list.length,
    completed,
    inProgress,
    cancelled,
  };
}
