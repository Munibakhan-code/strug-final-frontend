/**
 * Shop seller-dashboard helpers (Phase 5).
 * Keep overview/order/product mapping out of the giant SellerDashboards.jsx file.
 */

import { PLATFORM_FEE } from './regionConfig.js';

/** Vertical product types that belong to other commerce dashboards, not Shop. */
export const SHOP_SELLER_EXCLUDED_TYPES =
  /^(secondhand|wedding|decor|digitalproducts|books|discounts)$/i;

export function normalizeProductTypeName(name) {
  return String(name ?? '').replace(/\s+/g, '').toLowerCase();
}

/** Seller product list: keep Shop + custom categories; drop other verticals. */
export function isShopSellerListing(listing) {
  const typeName = listing?.product_type?.product_type_name ?? '';
  return !SHOP_SELLER_EXCLUDED_TYPES.test(normalizeProductTypeName(typeName));
}

export function filterListingsForShopSeller(listings) {
  return (Array.isArray(listings) ? listings : []).filter(isShopSellerListing);
}

/** Platform keeps ~21%; seller overview shows net. */
export const SHOP_SELLER_NET_RATE = 0.79;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Mirror backend vendorNetOf — ledger credits use this, not the 21% shop estimate. */
export function foodVendorNetOf(order) {
  const pct = Number(PLATFORM_FEE) > 0 ? Number(PLATFORM_FEE) : 0.08;
  const fee = parseFloat(order?.platform_fee);
  if (Number.isFinite(fee) && fee > 0) {
    return round2(fee / pct);
  }
  const total = parseFloat(order?.total_amount ?? order?.total ?? 0) || 0;
  const delivery = parseFloat(order?.delivery_fee ?? 0) || 0;
  const tip = parseFloat(order?.tip_amount ?? 0) || 0;
  return round2(Math.max(0, total - delivery - tip));
}

export function sellerNetFromOrderTotal(total) {
  const n = parseFloat(total);
  if (!Number.isFinite(n)) return 0;
  return n * SHOP_SELLER_NET_RATE;
}

function compactStatus(status) {
  return String(status || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const SELLER_EARNED_STATUSES = new Set([
  'picked up',
  'pickedup',
  'delivered',
  'completed',
  'fulfilled',
  'paid',
]);

const SELLER_NO_PAYOUT_STATUSES = new Set([
  'rejected',
  'cancelled',
  'canceled',
  'declined',
  'refunded',
  'no show',
]);

const SELLER_PENDING_STATUSES = new Set([
  'pending',
  'preparing',
  'ready for pickup',
  'ready',
  'confirmed',
  'shipped',
  'accepted',
  'in progress',
  'requested',
  'awaiting host',
  'processing',
]);

/** available = settled, pending = in progress, none = cancelled/rejected. */
export function sellerPayoutBucket(status) {
  const s = compactStatus(status);
  if (SELLER_NO_PAYOUT_STATUSES.has(s)) return 'none';
  if (SELLER_EARNED_STATUSES.has(s)) return 'available';
  if (SELLER_PENDING_STATUSES.has(s)) return 'pending';
  return 'pending';
}

/**
 * Gross used for the 21% seller-net estimate.
 * Never parse a formatted `amount` string (A$ / grouping would double-fee or mangle).
 */
export function sellerOrderGross(order) {
  const storedNet = parseFloat(order?.seller_net ?? order?.vendor_net ?? order?.net);
  if (order?.total == null && Number.isFinite(storedNet)) {
    return storedNet / SHOP_SELLER_NET_RATE;
  }
  const n = parseFloat(order?.total);
  return Number.isFinite(n) ? n : 0;
}

/** Prefer a backend-computed seller net when present. */
export function sellerOrderNet(order) {
  const storedNet = parseFloat(order?.seller_net ?? order?.vendor_net ?? order?.net);
  if (Number.isFinite(storedNet)) return storedNet;
  if (
    order?.platform_fee != null
    || order?.food_order_id != null
    || (Array.isArray(order?.food_order_items) && order.food_order_items.length > 0)
  ) {
    return foodVendorNetOf(order);
  }
  if (typeof order?.amount === 'number' && Number.isFinite(order.amount)) return order.amount;
  return sellerNetFromOrderTotal(sellerOrderGross(order));
}

export function sellerWalletTotalsFromOrders(orders = []) {
  let available = 0;
  let pending = 0;
  for (const o of orders) {
    const bucket = sellerPayoutBucket(o?.status ?? o?.rawStatus);
    const net = sellerOrderNet(o);
    if (bucket === 'available') available += net;
    else if (bucket === 'pending') pending += net;
  }
  return { available, pending, lifetime: available };
}

/** Prefer settle/fulfillment date when mapped; else created_at. */
export function orderEarningsDate(order) {
  const raw = order?.delivered_at ?? order?.created_at ?? order?.date ?? 0;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayWeekStart(d) {
  const x = startOfLocalDay(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  return x;
}

function formatWeekRangeLabel(start, endExclusive, locale = 'en') {
  const endInclusive = new Date(endExclusive);
  endInclusive.setDate(endInclusive.getDate() - 1);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(locale, opts)}–${endInclusive.toLocaleDateString(locale, opts)}`;
}

/**
 * Build chart buckets for Daily (last 7 days) / Weekly (last 4 Mon–Sun) / Monthly (last 6 months).
 * Each bucket: { start, end, label } where end is exclusive.
 */
export function earningsPeriodBuckets(timeframe, now = new Date(), locale = 'en') {
  if (timeframe === 'Weekly') {
    return [...Array(4)].map((_, i) => {
      const anchor = new Date(now);
      anchor.setDate(anchor.getDate() - (3 - i) * 7);
      const weekStart = mondayWeekStart(anchor);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return {
        start: weekStart,
        end: weekEnd,
        label: formatWeekRangeLabel(weekStart, weekEnd, locale),
      };
    });
  }
  if (timeframe === 'Monthly') {
    return [...Array(6)].map((_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return {
        start,
        end,
        label: start.toLocaleDateString(locale, { month: 'short' }),
      };
    });
  }
  // Daily — last 7 local calendar days
  return [...Array(7)].map((_, i) => {
    const start = startOfLocalDay(now);
    start.setDate(start.getDate() - (6 - i));
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return {
      start,
      end,
      label: start.toLocaleDateString(locale, { weekday: 'short' }),
    };
  });
}

/** Overall [start, end) covering all buckets for the active timeframe. */
export function earningsExportWindow(timeframe, now = new Date()) {
  const buckets = earningsPeriodBuckets(timeframe, now);
  if (!buckets.length) return { start: new Date(0), end: now };
  return { start: buckets[0].start, end: buckets[buckets.length - 1].end };
}

export function filterOrdersInPeriod(orders = [], start, end, { earnedOnly = true } = {}) {
  return (Array.isArray(orders) ? orders : []).filter((o) => {
    const od = orderEarningsDate(o);
    if (!(od >= start && od < end)) return false;
    if (earnedOnly && sellerPayoutBucket(o?.status ?? o?.rawStatus) !== 'available') return false;
    return true;
  });
}

export function buildEarningsDataPoints(orders = [], timeframe, now = new Date(), locale = 'en') {
  return earningsPeriodBuckets(timeframe, now, locale).map(({ start, end, label }) => ({
    label,
    start,
    end,
    val: filterOrdersInPeriod(orders, start, end, { earnedOnly: true })
      .reduce((s, o) => s + sellerOrderNet(o), 0),
  }));
}

export function earningsSummaryFromOrders(orders = [], periodNet = 0) {
  let completedCount = 0;
  let lifetimeNet = 0;
  for (const o of orders) {
    if (sellerPayoutBucket(o?.status ?? o?.rawStatus) !== 'available') continue;
    completedCount += 1;
    lifetimeNet += sellerOrderNet(o);
  }
  return {
    completedCount,
    allOrdersCount: Array.isArray(orders) ? orders.length : 0,
    lifetimeNet,
    periodNet: Number(periodNet) || 0,
  };
}

/** Food-item subtotal when line items exist; else vendor subtotal; else buyer grand total. */
export function foodOrderSellerGross(order) {
  const items = order?.food_order_items;
  if (Array.isArray(items) && items.length) {
    const sum = items.reduce((s, it) => {
      const line = parseFloat(it.line_total ?? it.subtotal);
      if (Number.isFinite(line) && line > 0) return s + line;
      const price = parseFloat(it.food_item?.price ?? it.price ?? it.unit_price ?? it.total ?? 0);
      const qty = Number(it.qty ?? it.quantity ?? 1) || 1;
      return s + (Number.isFinite(price) ? price * qty : 0);
    }, 0);
    if (sum > 0) return sum;
  }
  const sub = parseFloat(order?.subtotal ?? order?.item_subtotal ?? order?.vendor_subtotal);
  if (Number.isFinite(sub) && sub > 0) return sub;
  const n = parseFloat(order?.total_amount ?? order?.total ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Map product_order.status → seller dashboard label (Confirm/Ship/Fulfill buttons).
 * Paid orders with no status default to Pending so Confirm is available.
 */
export function mapProductOrderStatusLabel(order) {
  const raw = order?.status;
  if (raw) {
    return String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
  }
  return 'Pending';
}

/** Parse store_profile.prep_time JSON (return/shipping policies). */
export function parseStorePrepTime(prepTime) {
  if (!prepTime) return { returnPolicy: '', shippingInfo: '', description: '' };
  if (typeof prepTime !== 'string') {
    return {
      returnPolicy: prepTime.returnPolicy || '',
      shippingInfo: prepTime.shippingInfo || '',
      description: prepTime.description || '',
    };
  }
  try {
    const parsed = JSON.parse(prepTime);
    if (parsed && typeof parsed === 'object') {
      return {
        returnPolicy: parsed.returnPolicy || '',
        shippingInfo: parsed.shippingInfo || '',
        description: parsed.description || '',
      };
    }
  } catch {
    return { returnPolicy: '', shippingInfo: '', description: prepTime };
  }
  return { returnPolicy: '', shippingInfo: '', description: '' };
}

/**
 * Build prep_time JSON for policies only (bio lives on store_profile.bio).
 * Truncates to maxLen so PUT /store_profile validation (255) does not 400.
 */
export function buildStorePrepTime({ returnPolicy = '', shippingInfo = '' } = {}, maxLen = 255) {
  const payload = {
    returnPolicy: String(returnPolicy || '').trim(),
    shippingInfo: String(shippingInfo || '').trim(),
  };
  let json = JSON.stringify(payload);
  if (json.length <= maxLen) return json;

  // Prefer keeping return policy; shrink shipping first.
  const overhead = JSON.stringify({ returnPolicy: '', shippingInfo: '' }).length;
  const budget = Math.max(0, maxLen - overhead);
  const rp = payload.returnPolicy.slice(0, Math.min(payload.returnPolicy.length, Math.floor(budget * 0.6)));
  const si = payload.shippingInfo.slice(0, Math.max(0, budget - rp.length));
  json = JSON.stringify({ returnPolicy: rp, shippingInfo: si });
  return json.length <= maxLen ? json : json.slice(0, maxLen);
}

/** Pull overview KPIs from analytics API shape (or fall back to local orders). */
export function overviewStatsFromAnalytics(analytics, orders = []) {
  const summary = analytics?.summary ?? analytics?.data?.summary ?? null;
  if (summary) {
    const revenue = Number(summary.net ?? summary.gross ?? summary.revenue);
    const orderCount = Number(summary.count ?? summary.orders ?? summary.order_count);
    return {
      revenue: Number.isFinite(revenue) ? revenue : null,
      orderCount: Number.isFinite(orderCount) ? orderCount : null,
    };
  }
  const revenue = orders.reduce((s, o) => s + sellerNetFromOrderTotal(o.total ?? 0), 0);
  return { revenue, orderCount: orders.length };
}
