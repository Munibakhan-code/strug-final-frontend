// Global incoming-offer state (Epic 10 — the claim card).
//
// This is the piece that answers the actual complaint: "there's no way a driver knows a ride is
// coming unless they're sitting on the dashboard." A claimable offer (ride/work/courier/delivery)
// now surfaces a claim card ANYWHERE in the app, driven by the unified `notification:new` event
// that services/notify.js emits.
//
// What counts as claimable is `isClaimableOffer()` in utils/claimableOffer.js — NOT urgency alone.
// Everything this hook rejects is shown by useTransactionalToast instead.
//
// Self-contained by design — it does NOT reach into SellerDashboards. Rideshare offers can be
// accepted/declined inline (the backend derives the driver profile from the token, so the card
// needs only the ride id). Other verticals show the offer with a "View" deep-link to their
// dashboard, where the full accept flow already lives.
//
// Suppressed on the offer's own dashboard: if the driver is already looking at sd-drive, that
// page shows its own IncomingRideCard, so the global card would be a duplicate.

import { useState, useEffect, useRef, useCallback } from 'react';
import { connectSocket, getSocket } from '../api/socket';
import { getAuthUserId } from '../store/auth';
import { acceptRide, declineRide } from '../api/rideshare';
import { isClaimableOffer, isInlineAcceptableRide } from '../utils/claimableOffer.js';

// Verticals whose offers are time-boxed claims. Anything else that arrives as `actionable`
// still shows the card (as a View/Dismiss), but these are the ones we expect.
const OFFER_ACTION_URL = {
  rideshare: 'sd-drive',
  courier: 'sd-courier',
  work: 'sd-work',
  ecommerce: 'sd-ecommerce',
};

function offerFromNotification(n) {
  const data = n.data || {};
  const expiresAt = n.expires_at || data.expires_at || null;
  return {
    // Keyed on entity_type too: `rideshare:3` alone collided across entities, so a card for one
    // rideshare entity silently suppressed a genuine ride offer numbered the same (add() dedupes
    // on this key).
    key: `${n.vertical}:${n.entity_type || '?'}:${n.entity_id ?? data.request_id ?? data.order_id ?? n.notification_id}`,
    notificationId: n.notification_id ?? null,
    vertical: n.vertical,
    // Only ever a real ride_request id. Deriving this from a bare entity_id is what let an SOS
    // incident id be passed to accept/decline as though it were a ride.
    rideId: isInlineAcceptableRide(n)
      ? Number(n.entity_id ?? data.request_id) || null
      : null,
    title: n.title || 'Incoming offer',
    from: data.pickup_location ?? data.pickup_address ?? null,
    to: data.dropoff_location ?? data.deliver_location ?? data.deliver_address ?? null,
    fare: data.driver_payout ?? data.payout ?? data.delivery_fee ?? null,
    distance: data.distance ?? null,
    eta: data.eta ?? null,
    pickupEta: data.pickup_eta ?? null,
    expiresAt,
    offerTimeoutSec: data.offer_timeout_sec ?? 120,
    actionUrl: n.action_url || OFFER_ACTION_URL[n.vertical] || null,
  };
}

export function useIncomingOffers(authReady, { activeNav, navigateTo } = {}) {
  const [offers, setOffers] = useState([]); // FIFO; the card shows offers[0]
  const [busy, setBusy] = useState(null);   // key currently accepting/declining
  const [error, setError] = useState(null);
  const expiryTimers = useRef(new Map());

  const remove = useCallback((key) => {
    setOffers((prev) => prev.filter((o) => o.key !== key));
    const t = expiryTimers.current.get(key);
    if (t) { clearTimeout(t); expiryTimers.current.delete(key); }
  }, []);

  const add = useCallback((offer) => {
    setOffers((prev) => (prev.some((o) => o.key === offer.key) ? prev : [...prev, offer]));
    // Auto-expire when the server's offer window closes (offer moves to the next driver).
    if (offer.expiresAt && !expiryTimers.current.has(offer.key)) {
      const ms = new Date(offer.expiresAt).getTime() - Date.now();
      if (ms > 0 && ms < 10 * 60 * 1000) {
        expiryTimers.current.set(offer.key, setTimeout(() => remove(offer.key), ms));
      }
    }
  }, [remove]);

  useEffect(() => {
    if (!authReady) return undefined;
    const uid = getAuthUserId();
    if (uid == null) return undefined;

    const socket = connectSocket();
    const onNotif = (n) => {
      // Claimability, not urgency — see utils/claimableOffer.js. Everything this rejects is
      // picked up by useTransactionalToast, so nothing goes silent and nothing double-surfaces.
      if (!isClaimableOffer(n)) return;
      add(offerFromNotification(n));
    };
    socket.on('notification:new', onNotif);
    return () => { getSocket()?.off('notification:new', onNotif); };
  }, [authReady, add]);

  // Clear stale expiry timers on unmount.
  useEffect(() => () => { expiryTimers.current.forEach(clearTimeout); expiryTimers.current.clear(); }, []);

  const current = offers[0] || null;

  // Suppress on the offer's own dashboard — that page renders its own card.
  const suppressed = current && current.actionUrl && activeNav === current.actionUrl;

  const accept = useCallback(async (offer) => {
    setError(null);
    // Only rideshare offers carry an id: offerFromNotification sets rideId solely via
    // isInlineAcceptableRide, which requires vertical === 'rideshare'. Courier and work
    // offers have no inline claim, so send the user to the page that does have one.
    const id = offer.vertical === 'rideshare' ? offer.rideId : null;
    if (!id) {
      if (offer.actionUrl) navigateTo?.(offer.actionUrl);
      remove(offer.key);
      return;
    }
    setBusy(offer.key);
    try {
      await acceptRide(id);
      remove(offer.key);
      if (offer.actionUrl) navigateTo?.(offer.actionUrl);
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not accept — it may have expired.');
      setTimeout(() => { setError(null); remove(offer.key); }, 2500);
      throw e;
    } finally {
      setBusy(null);
    }
  }, [navigateTo, remove]);

  const decline = useCallback(async (offer) => {
    remove(offer.key);
    // Same as accept: only rideshare has an inline id to decline against.
    const id = offer.vertical === 'rideshare' ? offer.rideId : null;
    if (!id) return;
    try {
      await declineRide(id);
    } catch { /* offer already gone */ }
  }, [remove]);

  const view = useCallback((offer) => {
    if (offer.actionUrl) navigateTo?.(offer.actionUrl);
    remove(offer.key);
  }, [navigateTo, remove]);

  return {
    offer: suppressed ? null : current,
    busy,
    error,
    accept,
    decline,
    view,
  };
}
