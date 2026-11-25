/**
 * Property → Mortgage → Insurance funnel handoff.
 * Listing pages stash context; Quotes pages read it to prefill forms and continue the journey.
 */

import { canadianMinDownPayment } from "./mortgageValidation.js";

const STORAGE_KEY = "strug_property_financing";

const PROPERTY_TYPE_OPTIONS = ["Detached", "Semi-detached", "Townhouse", "Condo"];

function parseLocationParts(location) {
  const parts = String(location || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return { city: "", province: "", country: "Canada" };
  if (parts.length === 1) return { city: parts[0], province: "", country: "Canada" };
  // "Neighborhood, City, ON" or "City, ON, Canada"
  const last = parts[parts.length - 1];
  const looksCountry = /canada|usa|united states|pakistan|uk|united kingdom/i.test(last);
  const country = looksCountry ? last : "Canada";
  const province = looksCountry
    ? (parts.length >= 2 ? parts[parts.length - 2] : "")
    : last;
  // Prefer a short city token: if labeled "X District", keep first segment only.
  let city = looksCountry
    ? (parts.length >= 3 ? parts[parts.length - 3] : parts[0])
    : (parts.length >= 2 ? parts[parts.length - 2] : parts[0]);
  // If "city" accidentally contains a full address, re-parse it.
  if (city.includes(",")) {
    city = parseLocationParts(city).city;
  }
  return { city, province, country };
}

function cleanCity(raw, fallbackLocation) {
  const s = String(raw || "").trim();
  if (!s) return parseLocationParts(fallbackLocation).city;
  if (s.includes(",")) return parseLocationParts(s).city;
  return s;
}

function guessPropertyType(raw) {
  const s = String(raw || "").toLowerCase();
  if (/condo|apartment|apt/.test(s)) return "Condo";
  if (/town|row/.test(s)) return "Townhouse";
  if (/semi/.test(s)) return "Semi-detached";
  if (/detach|house|home|villa|bungalow/.test(s)) return "Detached";
  if (PROPERTY_TYPE_OPTIONS.includes(raw)) return raw;
  return "";
}

function num(v) {
  if (v == null || v === "") return null;
  // Prefer real numeric fields; ignore display labels like "Pricing coming soon"
  if (typeof v === "string" && !/[\d]/.test(v)) return null;
  // "From $750,000–$900,000" → take the first number group
  const m = String(v).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function uniqueJoin(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const s = String(p || "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    // Skip if this segment is already contained in a previous longer segment
    if (out.some((prev) => prev.toLowerCase().includes(key))) continue;
    seen.add(key);
    out.push(s);
  }
  return out.join(", ");
}

/**
 * Normalize a Construct project or Real Estate listing into financing context.
 */
export function buildPropertyFinancingContext(item, source = "realestate") {
  if (!item) return null;

  // Prefer numeric price fields over display strings like "From $50"
  const price =
    num(item.priceNum) ??
    (typeof item.price === "number" ? num(item.price) : null) ??
    num(item.price_min) ??
    num(item.estimated_value) ??
    (typeof item.price === "string" ? num(item.price) : null);

  const locSource = item.location || item.address || item.city || "";
  const locParts = parseLocationParts(locSource);
  const city = cleanCity(item.city, locSource) || locParts.city;
  const country = (item.country || locParts.country || "Canada").trim() || "Canada";
  const province = (item.province || locParts.province || "").trim();

  // Prefer a real street/site address; avoid stuffing city/country twice into the label.
  const rawAddress = String(
    item.address ||
    item.sales_center_address ||
    item.location ||
    "",
  ).trim();
  const address = rawAddress;
  const addressLabel = uniqueJoin([rawAddress || item.name, city, province, country]);

  const propertyType =
    guessPropertyType(item.property_type) ||
    guessPropertyType(item.category) ||
    guessPropertyType((item.tags || [])[0]) ||
    (source === "preconstruct" ? "Condo" : "");

  const sqft = num(item.sqft) ?? num(item.square_feet) ?? num(item.sqft_min) ?? null;
  const isRental =
    source === "realestate" &&
    (item._kind === "rental" || /rent/i.test(String(item.category || "")));

  return {
    property_id: item.id ?? item.property_id ?? null,
    name: item.name || item.property_name || "Property",
    source, // preconstruct | realestate
    isRental: !!isRental,
    price,
    down_payment: price != null ? canadianMinDownPayment(price) : null,
    property_type: propertyType,
    city,
    province,
    country,
    address,
    addressLabel,
    sqft,
    beds: item.beds ?? item.beds_min ?? null,
    baths: item.baths ?? item.baths_min ?? null,
    lat: item.lat ?? item.latitude ?? null,
    lng: item.lng ?? item.longitude ?? null,
    image: item.image || item.thumb || (Array.isArray(item.images) ? item.images[0] : null) || null,
    returnNav: source === "preconstruct" ? "preconstruct" : "realestate",
    step: isRental ? "insurance" : "mortgage",
    startedAt: Date.now(),
  };
}

export function savePropertyFinancing(ctx) {
  if (!ctx) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch { /* ignore quota */ }
  try {
    window.__propertyFinancing = ctx;
  } catch { /* noop */ }
}

/** Fix older/bad handoff payloads (duplicated address, city stuffed with full location). */
function sanitizeFinancingContext(ctx) {
  if (!ctx || typeof ctx !== "object") return null;
  const locSource = ctx.addressLabel || ctx.address || ctx.city || "";
  const locParts = parseLocationParts(locSource);
  const city = cleanCity(ctx.city, locSource) || locParts.city;
  const province = (ctx.province || locParts.province || "").trim();
  const country = (ctx.country || locParts.country || "Canada").trim() || "Canada";
  const address = uniqueJoin(
    String(ctx.address || "")
      .split(",")
      .map((s) => s.trim()),
  );
  // Prefer a single clean label; strip duplicated city/province/country segments.
  const addressLabel = uniqueJoin([address || ctx.name, city, province, country]);
  const price = num(ctx.price);
  return {
    ...ctx,
    city,
    province,
    country,
    address: address || city,
    addressLabel,
    price,
    down_payment: ctx.down_payment != null ? num(ctx.down_payment) : (price != null ? canadianMinDownPayment(price) : null),
  };
}

export function peekPropertyFinancing() {
  let rawCtx = null;
  try {
    if (window.__propertyFinancing) rawCtx = window.__propertyFinancing;
  } catch { /* noop */ }
  if (!rawCtx) {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      rawCtx = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const cleaned = sanitizeFinancingContext(rawCtx);
  if (cleaned && (cleaned.city !== rawCtx.city || cleaned.addressLabel !== rawCtx.addressLabel)) {
    savePropertyFinancing(cleaned);
  }
  return cleaned;
}

export function clearPropertyFinancing() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  try { delete window.__propertyFinancing; } catch { /* noop */ }
}

/**
 * Start the funnel from a listing. Defaults to mortgage (purchase) or insurance (rentals).
 */
export function startPropertyFinancing(item, source = "realestate", opts = {}) {
  const base = buildPropertyFinancingContext(item, source);
  if (!base) return;
  const step = opts.step || base.step || "mortgage";
  const ctx = { ...base, step, startedAt: Date.now() };
  savePropertyFinancing(ctx);
  window.__nav?.(step === "insurance" ? "insurance" : "mortgage");
}

/**
 * Advance an existing journey to insurance (keeps property context).
 */
export function continuePropertyFinancingToInsurance() {
  const prev = peekPropertyFinancing();
  if (!prev) {
    window.__nav?.("insurance");
    return;
  }
  const ctx = { ...prev, step: "insurance", advancedAt: Date.now() };
  savePropertyFinancing(ctx);
  window.__nav?.("insurance");
}

/**
 * Preferred leaf category slug for a Quotes vertical given handoff context.
 */
export function preferredCategorySlug(vertical, ctx) {
  if (vertical === "mortgage") return "mortgage-new-purchase";
  if (vertical === "insurance") {
    if (ctx?.isRental) return "renters-insurance";
    return "home-insurance";
  }
  return null;
}

/**
 * Map property context onto a category's form_schema keys.
 */
export function buildFinancingFormPrefill(category, ctx) {
  if (!ctx || !category) return {};
  const schema = Array.isArray(category.form_schema) ? category.form_schema : [];
  const keys = new Set(schema.map((f) => f.key));
  const out = {};

  const set = (key, value) => {
    if (!keys.has(key) || value == null || value === "") return;
    out[key] = String(value);
  };

  set("property_type", ctx.property_type);
  set("property_price", ctx.price);
  set("property_value", ctx.price);
  set("estimated_value", ctx.price);
  set("down_payment", ctx.down_payment);
  set("square_footage", ctx.sqft);
  set("coverage_amount", ctx.price);
  set("contents_value", ctx.price != null ? Math.round(ctx.price * 0.05) : null);

  return out;
}

export function financingNotes(ctx) {
  if (!ctx) return null;
  const bits = [
    `Property: ${ctx.name}`,
    ctx.property_id != null ? `ID #${ctx.property_id}` : null,
    ctx.address || ctx.city ? `Location: ${[ctx.address, ctx.city, ctx.province].filter(Boolean).join(", ")}` : null,
    ctx.price != null ? `Listed ~ $${Number(ctx.price).toLocaleString()} CAD` : null,
    ctx.source ? `Via Strug ${ctx.source === "preconstruct" ? "Construct" : "Real Estate"}` : null,
  ].filter(Boolean);
  return bits.join(" · ").slice(0, 500);
}
