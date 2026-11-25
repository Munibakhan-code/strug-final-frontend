/**
 * Link reservation listings → Food vendor menus.
 * Guest Menu tab reads attributes.food_vendor_id then loads that vendor's food items.
 */

import { findVendorTypeIdByName, getMyVendor, getVendor, getFoodItems } from "../api/food.js";
import { getBookingListing, updateBookingListing } from "../api/booking.js";
import { fmtMoney } from "./regionConfig.js";

export function extractFoodVendorId(payload) {
  const v = payload?.data ?? payload;
  if (!v || typeof v !== "object") return null;
  const id = v.food_vendor_id ?? v.vendor_id ?? v.id;
  if (id == null || id === "") return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

export function foodVendorIdFromListingAttributes(attributes) {
  const a = attributes && typeof attributes === "object" ? attributes : {};
  return extractFoodVendorId({
    food_vendor_id: a.food_vendor_id ?? a.vendor_id ?? null,
  });
}

/** Resolve the signed-in user's Restaurant food vendor id (host-only). */
export async function resolveMyRestaurantVendorId() {
  try {
    const typeId = await findVendorTypeIdByName("Restaurant");
    if (typeId != null) {
      const data = await getMyVendor({ vendor_type_id: typeId });
      const id = extractFoodVendorId(data);
      if (id != null) return id;
    }
  } catch { /* try unscoped */ }
  try {
    const data = await getMyVendor();
    return extractFoodVendorId(data);
  } catch {
    return null;
  }
}

/**
 * Ensure attributes include food_vendor_id when the host has a restaurant vendor.
 * Returns a new attributes object (does not mutate).
 */
export async function withReservationFoodVendorLink(attributes = {}) {
  const attrs = attributes && typeof attributes === "object" ? { ...attributes } : {};
  if (foodVendorIdFromListingAttributes(attrs) != null) return attrs;
  const vendorId = await resolveMyRestaurantVendorId();
  if (vendorId != null) attrs.food_vendor_id = vendorId;
  return attrs;
}

/** Persist food_vendor_id onto an existing booking listing (merge attributes). */
export async function backfillListingFoodVendorId(listingId, vendorId) {
  if (listingId == null || vendorId == null) return false;
  try {
    const res = await getBookingListing(listingId);
    const listing = res?.data ?? res;
    if (!listing) return false;
    const attrs = {
      ...(typeof listing.attributes === "object" && listing.attributes ? listing.attributes : {}),
    };
    if (foodVendorIdFromListingAttributes(attrs) != null) return false;
    attrs.food_vendor_id = vendorId;
    await updateBookingListing(listingId, { attributes: attrs });
    return true;
  } catch {
    return false;
  }
}

/** Map food_item rows → reservation Menu tab sections. */
export function foodItemsToMenuSections(items, formatMoney = fmtMoney) {
  const byCat = {};
  for (const item of items) {
    if (item?.is_available === false) continue;
    const cat = item.food_category?.name ?? item.category ?? "Menu";
    if (!byCat[cat]) byCat[cat] = [];
    const name = item.name ?? item.item_name ?? "Item";
    const price = Number(item.price);
    byCat[cat].push(
      Number.isFinite(price) && price > 0 ? `${name} — ${formatMoney(price)}` : name,
    );
  }
  return Object.entries(byCat).map(([section, sectionItems]) => ({
    section,
    items: sectionItems,
  }));
}

export function formatVendorHours(vendor) {
  const v = vendor?.data ?? vendor;
  if (!v || typeof v !== "object") return null;
  if (typeof v.hours === "string" && v.hours.trim()) return v.hours.trim();
  if (v.opening_hours && v.closing_hours) {
    return `${v.opening_hours} – ${v.closing_hours}`;
  }
  return null;
}

export function vendorPriceLevel(vendor) {
  const v = vendor?.data ?? vendor;
  if (!v || typeof v !== "object") return null;
  const level = v.price_level ?? v.price_range ?? v.priceLevel;
  if (level == null || level === "") return null;
  return String(level);
}

/**
 * Load menu sections (+ optional vendor profile) for a reservation listing.
 * Prefers embedded attributes.menu; else food_vendor_id → vendor food_item / food items API.
 */
export async function loadReservationMenu({
  embeddedMenu,
  foodVendorId,
  ownerUserId,
  currentUserId,
  listingId,
}) {
  if (Array.isArray(embeddedMenu) && embeddedMenu.length > 0) {
    return { menu: embeddedMenu, vendor: null, foodVendorId: foodVendorId ?? null };
  }

  let vendorId = foodVendorId != null && foodVendorId !== "" ? Number(foodVendorId) : null;
  if (!Number.isFinite(vendorId)) vendorId = null;

  // Host viewing own listing without a link yet — resolve + backfill.
  if (
    vendorId == null
    && currentUserId != null
    && ownerUserId != null
    && String(currentUserId) === String(ownerUserId)
  ) {
    vendorId = await resolveMyRestaurantVendorId();
    if (vendorId != null && listingId != null) {
      await backfillListingFoodVendorId(listingId, vendorId);
    }
  }

  if (vendorId == null) {
    return { menu: [], vendor: null, foodVendorId: null };
  }

  let vendor = null;
  try {
    vendor = await getVendor(vendorId);
  } catch {
    vendor = null;
  }

  const vendorBody = vendor?.data ?? vendor;
  const embeddedItems = Array.isArray(vendorBody?.food_item) ? vendorBody.food_item : [];
  if (embeddedItems.length > 0) {
    return {
      menu: foodItemsToMenuSections(embeddedItems),
      vendor: vendorBody,
      foodVendorId: vendorId,
    };
  }

  try {
    const data = await getFoodItems({ vendor_id: vendorId });
    const items = Array.isArray(data) ? data : (data?.data ?? []);
    return {
      menu: foodItemsToMenuSections(items),
      vendor: vendorBody,
      foodVendorId: vendorId,
    };
  } catch {
    return { menu: [], vendor: vendorBody, foodVendorId: vendorId };
  }
}
