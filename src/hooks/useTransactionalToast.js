import { useEffect, useRef, useCallback } from "react";
import { getUser } from "../store/auth";
import { connectSocket, getSocket, registerSocialProfileRoom } from "../api/socket";
import { useToastQueue } from './useToastQueue.js';
import { normalizeToastEvent } from '../utils/notificationToast.js';
import { isClaimableOffer } from '../utils/claimableOffer.js';

/*
 * #371 / #354 — Global popup notifications for transactional / gig events.
 *
 * Division of labour with useIncomingOffers (Epic 10):
 *   - useIncomingOffers owns CLAIMABLE offers (ride / work / courier / delivery requests) — it
 *     renders the full accept/decline/view *claim card* anywhere in the app.
 *   - THIS hook owns the lighter "you received something" popup for everything else: ambient
 *     inbound receipts a seller/host needs to notice (a food vendor getting an order, a host
 *     getting a booking request), the 'actionable' notifications that aren't claims (a failed
 *     payment, a rejected driver document, an SOS acknowledgement), and the courier availability
 *     broadcasts that never go through notify(). So the two never double-surface the same event.
 *
 * The split is `isClaimableOffer()` (utils/claimableOffer.js), applied here and there. It used to
 * be urgency alone, which mis-routed every actionable non-offer into the claim card.
 *
 * Source of truth is the UNIFIED `notification:new` socket event that every backend notify()
 * call emits. A couple of
 * legacy per-user/broadcast courier events have no notify() twin, so they're listened for
 * directly here or couriers would lose their popup. De-dupe keys are tied to the underlying
 * entity so an event arriving via two channels collapses to one popup.
 *
 * It also listens for a `strug:txn-toast` window event so any page can raise the same popup
 * (and so it can be exercised in isolation).
 */

// Fallback SPA nav target per vertical, used only when a notification omits action_url.
const VERTICAL_NAV = {
  rideshare: "rideshare", courier: "ondemand", food: "sd-food", ecommerce: "sd-ecommerce",
  work: "sd-work", quotes: "sd-work", booking: "orders",
};

// Stable de-dupe key tied to the underlying entity, so the same event arriving via BOTH the
// unified `notification:new` and a legacy per-user emit collapses to one popup.
function entityKey(vertical, entityType, entityId) {
  if (entityType && entityId != null) return `${vertical || "?"}:${entityType}:${entityId}`;
  return null;
}

// Legacy courier events with NO unified notify() twin — kept so couriers don't lose their popup.
// (courier-order = a delivery assigned to this courier; courier-order-available = an open
// delivery in the pool. Neither goes through notify(), so neither reaches the claim card.)
const PER_USER_EVENTS = [
  { suffix: "courier-order", title: "New delivery", body: "A delivery has been assigned to you.", nav: "ondemand", vertical: "courier", entityType: "courier_order", idKey: "order_id" },
];
const BROADCAST_EVENTS = [
  { event: "courier-order-available", title: "Delivery available", body: "A new delivery is available to accept.", nav: "ondemand" },
];

// `authReady` = AppInner's `authBooted`. See useChatPush for why a one-shot getUser() in a
// mount effect silently disables this hook for the whole session on a hard reload.
export function useTransactionalToast(authReady, { externalChatToast = null, onOpenChat = null, fallbackAccent } = {}) {
  const queue = useToastQueue();
  const recentRef = useRef(new Set());

  const dismiss = useCallback((key) => {
    const target = key ?? queue.visible[0]?.key;
    if (target) queue.dismiss(target);
  }, [queue.dismiss, queue.visible]);

  const show = useCallback((payload) => {
    if (!payload?.title) return;
    // de-dupe bursts of the same event within a short window
    const key = payload.key ?? `${payload.title}-${payload.body ?? ""}`;
    if (recentRef.current.has(key)) return;
    recentRef.current.add(key);
    setTimeout(() => recentRef.current.delete(key), 4000);

    queue.enqueue(payload.theme ? payload : normalizeToastEvent(payload, { fallbackAccent }));
  }, [queue.enqueue, fallbackAccent]);

  const open = useCallback((nav) => {
    const active = queue.visible.find((item) => item.nav === nav);
    if (active) dismiss(active.key);
    if (nav && typeof window !== "undefined" && window.__nav) window.__nav(nav);
  }, [dismiss, queue.visible]);

  const act = useCallback(async (toast, action) => {
    if (!action?.run) {
      if (action?.nav) open(action.nav);
      return;
    }
    queue.setActionState(toast.key, 'working', null);
    try {
      await action.run();
      dismiss(toast.key);
    } catch (error) {
      queue.setActionState(toast.key, 'error', error?.response?.data?.message || error?.message || 'Action failed. Please try again.');
    }
  }, [dismiss, open, queue.setActionState]);

  useEffect(() => {
    if (!externalChatToast?.title) return;
    const normalized = normalizeToastEvent(externalChatToast, { source: 'chat', fallbackAccent });
    show({
      ...normalized,
      actions: [{ id: 'open-message', label: 'Open Message', run: () => onOpenChat?.(externalChatToast) }],
    });
  }, [externalChatToast, fallbackAccent, onOpenChat, show]);

  useEffect(() => {
    if (!authReady) return undefined;
    const user = getUser();
    if (!user) return undefined;

    connectSocket();
    if (user.profile_id) registerSocialProfileRoom(user.profile_id);

    const uid = user.user_id ?? user.id;
    const socket = getSocket();
    const bound = [];

    // 1) Unified pipeline — popup the ambient seller/host inbound-receipt notifications the
    // actionable claim card doesn't handle. This is what fires on whatever page the user is on
    // (e.g. a vendor mid-video getting a food order).
    if (socket) {
      const onUnified = (n) => {
        // Mirror of useIncomingOffers' filter — the two split on CLAIMABILITY, not urgency, so
        // an 'actionable' notification that isn't a claimable offer (a failed payment, a rejected
        // document, an SOS acknowledgement) surfaces here instead of going silent.
        if (!n || isClaimableOffer(n)) return;
        const amount = n?.data?.total ?? n?.data?.amount ?? n?.data?.fare ?? null;
        const extra = amount != null ? ` · $${amount}` : "";
        show(normalizeToastEvent({
          title: n.title,
          body: `${n.body || "You have a new order."}${extra}`,
          nav: n.action_url || VERTICAL_NAV[n.vertical] || null,
          key: entityKey(n.vertical, n.entity_type, n.entity_id) || `${n.title}-${n.notification_id ?? Date.now()}`,
          vertical: n.vertical,
          variant: n.variant,
        }, { fallbackAccent }));
      };
      socket.on("notification:new", onUnified);
      bound.push(["notification:new", onUnified]);
    }

    // 2) Legacy courier events without a unified twin.
    const bindLegacy = (cfg) => (data) => {
      const id = (cfg.idKey && data?.[cfg.idKey]) ?? data?.id ?? data?.order_id ?? null;
      const amount = data?.total ?? data?.amount ?? data?.fare ?? null;
      const extra = amount != null ? ` · $${amount}` : "";
      show(normalizeToastEvent({
        title: cfg.title,
        body: `${cfg.body}${extra}`,
        nav: cfg.nav,
        key: entityKey(cfg.vertical, cfg.entityType, id) || `${cfg.title}-${id ?? Date.now()}`,
        vertical: cfg.vertical || 'courier',
      }, { source: 'legacy', fallbackAccent }));
    };

    if (socket && uid != null) {
      PER_USER_EVENTS.forEach((cfg) => {
        const event = `${cfg.suffix}-${uid}`;
        const handler = bindLegacy(cfg);
        socket.on(event, handler);
        bound.push([event, handler]);
      });
    }
    if (socket) {
      BROADCAST_EVENTS.forEach((cfg) => {
        const handler = bindLegacy(cfg);
        socket.on(cfg.event, handler);
        bound.push([cfg.event, handler]);
      });
    }

    // window event bus — lets any page raise the same popup
    const onWindowToast = (e) => {
      const d = e.detail || {};
      show(normalizeToastEvent(d, { source: 'window', fallbackAccent }));
    };
    window.addEventListener("strug:txn-toast", onWindowToast);

    return () => {
      if (socket) bound.forEach(([event, handler]) => socket.off(event, handler));
      window.removeEventListener("strug:txn-toast", onWindowToast);
    };
  }, [show, authReady, fallbackAccent]);

  return { toast: queue.visible[0] ?? null, toasts: queue.visible, dismiss, open, act, push: show, replace: queue.replace };
}
