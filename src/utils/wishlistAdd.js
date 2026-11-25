import { mediaUrl } from './mediaUrl.js';
import { addWishlistItem } from '../api/wishlist.js';

/** Resolve product variation id or booking listing id for wishlist matching. */
export function wishlistRefId(item, kind = 'product') {
  if (kind === 'booking') {
    const id = item?.listingId ?? item?.booking_listing_id ?? item?.id ?? null;
    return id == null || id === '' ? null : Number(id);
  }
  const id = item?.variation_id ?? item?.variationId ?? null;
  return id == null || id === '' ? null : Number(id);
}

export function wishlistMembershipKey(itemType, itemRefId) {
  if (itemType == null || itemRefId == null || Number.isNaN(Number(itemRefId))) return null;
  return `${String(itemType)}:${Number(itemRefId)}`;
}

/** Only persist real media URLs on wishlist rows (not CSS gradients). */
export function wishlistImageUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (/^linear-gradient/i.test(raw.trim())) return null;
  const resolved = mediaUrl(raw);
  if (!resolved || typeof resolved !== 'string') return null;
  if (/^(https?:|data:|blob:)/i.test(resolved) || resolved.startsWith('//')) return resolved;
  if (resolved.startsWith('/uploads') || resolved.includes('/uploads/')) return resolved;
  return null;
}

/**
 * Build POST /wishlist body from a shop product (requires variation_id).
 * @returns {{ ok: true, payload } | { ok: false, error: string }}
 */
export function buildProductWishlistPayload(item) {
  const variationId = item?.variation_id ?? item?.variationId ?? null;
  if (variationId == null || variationId === '') {
    return { ok: false, error: 'This product can’t be wishlisted yet (missing variation).' };
  }
  const price = Number(item?.price ?? item?.origPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'This product needs a valid price to add to your wishlist.' };
  }
  const title = String(item?.name || item?.title || '').trim();
  if (!title) return { ok: false, error: 'Product name is required.' };

  return {
    ok: true,
    payload: {
      item_type: 'product',
      item_ref_id: Number(variationId),
      title: title.slice(0, 500),
      description: item?.description ? String(item.description).slice(0, 1000) : null,
      image_url: wishlistImageUrl(item?.imageUrl || item?.image_url || item?.thumb || item?.cover),
      price,
    },
  };
}

/**
 * Build POST /wishlist body from a booking listing (Decor service / package).
 * @returns {{ ok: true, payload } | { ok: false, error: string }}
 */
export function buildBookingWishlistPayload(item) {
  const listingId = item?.listingId ?? item?.booking_listing_id ?? item?.id ?? null;
  if (listingId == null || listingId === '') {
    return { ok: false, error: 'This listing can’t be wishlisted yet.' };
  }
  const price = Number(item?.price ?? item?.perDay);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'This listing needs a valid price to add to your wishlist.' };
  }
  const title = String(item?.name || item?.title || '').trim();
  if (!title) return { ok: false, error: 'Listing name is required.' };

  return {
    ok: true,
    payload: {
      item_type: 'booking',
      item_ref_id: Number(listingId),
      title: title.slice(0, 500),
      description: item?.category ? String(item.category) : null,
      image_url: wishlistImageUrl(item?.image || item?.image_url || item?.thumb),
      price,
    },
  };
}

/** Call API; normalizes error messages (incl. 20-item cap). */
export async function addItemToWishlist(payload) {
  try {
    const res = await addWishlistItem(payload);
    return { ok: true, item: res?.data ?? res };
  } catch (err) {
    const msg =
      err?.response?.data?.error
      || err?.response?.data?.message
      || err?.message
      || 'Couldn’t add to wishlist.';
    return { ok: false, error: msg };
  }
}
