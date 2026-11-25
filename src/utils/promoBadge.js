// Shared promo-badge parsing so every vertical's browse mapper (Food, Grocery, Floral,
// Catering, Shop, …) surfaces seller-created promotions the same way — instead of the logic
// living only inside Food.jsx's mapFoodVendor. Backends expose the same fields per vendor:
//   - discount_badge / promo_badge / offer_title : a human badge ("20% OFF for VIPs")
//   - eligible_offers : [{ promotion_id, offer_title, ... }] the buyer can tap-to-apply.
// The raw promo *code* is intentionally NOT included on public browse payloads (it would let a
// signed-out caller harvest codes); it's resolved at apply time via the rate-limited
// /discounts/validate using promotion_id. A raw code is not a badge, so we filter those out too.

/** True when a label is a bare promo code token rather than human badge copy. */
export function looksLikePromoCode(label) {
	const s = String(label || "").trim();
	if (!s) return false;
	// Real badges include "OFF" / em dash copy; raw codes are compact tokens like VIP129WN4.
	if (/\bOFF\b/i.test(s) || s.includes("—") || s.includes(" - ")) return false;
	return /^[A-Z0-9]{6,20}$/i.test(s);
}

/**
 * Extract the buyer-facing promo badge + tap-to-apply offers from a vendor/store object.
 * Returns { promo: string|null, eligibleOffers: Array }. Safe on any shape — absent fields
 * simply yield null / [] so it degrades gracefully where a backend doesn't provide them.
 */
export function parseVendorPromo(v) {
	const rawPromo = v?.discount_badge ?? v?.promo_badge ?? v?.offer_title ?? null;
	const promo = looksLikePromoCode(rawPromo) ? null : rawPromo;
	const eligibleOffers = (Array.isArray(v?.eligible_offers) ? v.eligible_offers : [])
		.filter((o) => o?.offer_title && !looksLikePromoCode(o.offer_title));
	return { promo, eligibleOffers };
}
