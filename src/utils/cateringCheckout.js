/**
 * Catering checkout helpers shared with payment create-intent.
 * Commerce carts with item_source=food re-validate promos as vertical "food"
 * (see backend resolveCartPromoDiscount). Apply-promo must use the same vertical
 * or catering-scoped codes appear valid then fail at Stripe create.
 */

export const CATERING_PAYMENT_PROMO_VERTICAL = "food";

export function amountsDiffer(a, b, tol = 0.02) {
	if (b == null || !Number.isFinite(Number(b))) return false;
	if (!Number.isFinite(Number(a))) return true;
	return Math.abs(Number(b) - Number(a)) > tol;
}

/** Prefer server-authoritative charge when create-intent returns amount. */
export function resolveChargedTotal(displayTotal, serverAmount) {
	if (serverAmount == null || !Number.isFinite(Number(serverAmount))) {
		return Number(displayTotal) || 0;
	}
	return Number(serverAmount);
}
