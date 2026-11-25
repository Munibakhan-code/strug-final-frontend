// Which `notification:new` events are genuinely CLAIMABLE offers.
//
// Why this exists: the claim card (useIncomingOffers) and the transactional toast
// (useTransactionalToast) used to split the unified notification stream on `urgency` alone —
// claim card took every 'actionable', toast took the rest. But the backend uses 'actionable' to
// mean "the user should look at this" (payment failed, a document was rejected, an SOS was
// received), not "the user can claim this". So non-offers rendered as Accept/Decline cards.
//
// On the rideshare vertical that was destructive rather than merely wrong: the card derives its
// ride id from `entity_id`, so an SOS incident #3 produced a card whose Decline fired
// PUT /ride-request/3/decline against an unrelated ride that merely shared the number.
//
// Splitting on claimability instead keeps the "never double-surface" guarantee — every
// notification still lands in exactly one of the two surfaces — while sending the rest to the
// toast, where an informational message belongs.
//
// Add to this map only when a vertical genuinely has a time-boxed claim whose entity id is the
// thing the accept/decline call takes.
export const CLAIMABLE_ENTITY_TYPES = {
  rideshare: ['ride_request'],   // utils/ride-dispatch.js — the only inline accept/decline path
  work: ['work_job', 'service_order'], // utils/work-notify.js 'offer', routes/service-order-routes.js
  ecommerce: ['product_listing'],      // routes/wedding-routes.js try-on requests
  courier: ['courier_order'],
};

/**
 * True only for notifications the claim card should own.
 * Everything else (including 'actionable' informational events) belongs to the toast.
 */
export function isClaimableOffer(n) {
  if (!n || n.urgency !== 'actionable') return false;
  const allowed = CLAIMABLE_ENTITY_TYPES[n.vertical];
  if (!allowed) return false;
  return Boolean(n.entity_type) && allowed.includes(n.entity_type);
}

/**
 * True when the card may call acceptRide/declineRide with this notification's entity id.
 * Narrower than isClaimableOffer on purpose — a wrong id here cancels a real ride.
 */
export function isInlineAcceptableRide(n) {
  return isClaimableOffer(n) && n.vertical === 'rideshare' && n.entity_type === 'ride_request';
}
