import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// A fake socket that records handlers so the test can fire an incoming event.
const handlers = {};
const fakeSocket = {
  on: (ev, fn) => { handlers[ev] = fn; },
  off: (ev) => { delete handlers[ev]; },
};

vi.mock("../api/socket", () => ({
  connectSocket: () => fakeSocket,
  getSocket: () => fakeSocket,
  registerSocialProfileRoom: () => {},
}));
vi.mock("../store/auth", () => ({ getUser: () => ({ user_id: 7, profile_id: 1 }) }));

import { useTransactionalToast } from "./useTransactionalToast.js";

const foodOrder = {
  notification_id: 1, vertical: "food", type: "order.placed", urgency: "ambient",
  title: "New food order", body: "Order from Sam", entity_type: "food_order", entity_id: 55, action_url: "sd-food",
};
const bookingReq = {
  notification_id: 3, vertical: "booking", type: "booking.requested", urgency: "ambient",
  title: "New booking request", entity_type: "booking", entity_id: 3, action_url: "orders",
};
// Actionable offers are owned by the claim card (useIncomingOffers), NOT this hook.
const rideOffer = {
  notification_id: 2, vertical: "rideshare", type: "ride.offer", urgency: "actionable",
  title: "Incoming ride request", entity_type: "ride_request", entity_id: 9, action_url: "sd-drive",
};

beforeEach(() => { for (const k in handlers) delete handlers[k]; });

describe("useTransactionalToast", () => {
  it("pops a seller inbound-receipt (order.placed) from notification:new", () => {
    const { result } = renderHook(() => useTransactionalToast(true));
    act(() => handlers["notification:new"](foodOrder));
    expect(result.current.toast).toBeTruthy();
    expect(result.current.toast.title).toBe("New food order");
    expect(result.current.toast.nav).toBe("sd-food");
  });

  it("pops a host inbound-receipt (booking.requested)", () => {
    const { result } = renderHook(() => useTransactionalToast(true));
    act(() => handlers["notification:new"](bookingReq));
    expect(result.current.toast?.title).toBe("New booking request");
  });

  it("does NOT pop actionable offers (the claim card owns those)", () => {
    const { result } = renderHook(() => useTransactionalToast(true));
    act(() => handlers["notification:new"](rideOffer));
    expect(result.current.toast).toBeNull();
  });

  it("pops the courier availability broadcast (no unified twin)", () => {
    const { result } = renderHook(() => useTransactionalToast(true));
    act(() => handlers["courier-order-available"]({ order_id: 4 }));
    expect(result.current.toast?.title).toBe("Delivery available");
  });

  it("de-dupes the same entity arriving twice in the window", () => {
    const { result } = renderHook(() => useTransactionalToast(true));
    act(() => handlers["notification:new"](foodOrder));
    expect(result.current.toast).toBeTruthy();
    act(() => result.current.dismiss());
    act(() => handlers["notification:new"]({ ...foodOrder })); // same entity_id → suppressed
    expect(result.current.toast).toBeNull();
  });

  it("raises a popup from the strug:txn-toast window bus", () => {
    const { result } = renderHook(() => useTransactionalToast(true));
    act(() => window.dispatchEvent(new CustomEvent("strug:txn-toast", { detail: { title: "Custom", body: "hi", nav: "home" } })));
    expect(result.current.toast?.title).toBe("Custom");
  });

  it("binds no listeners until auth is ready", () => {
    renderHook(() => useTransactionalToast(false));
    expect(handlers["notification:new"]).toBeUndefined();
  });
});
