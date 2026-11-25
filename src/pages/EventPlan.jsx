// Shared Event (v1) — one date / guests / city, one cart, one checkout, one
// timeline across Venues / Catering / Floral. Reached via the hidden nav id
// "event-plan" (no sidebar entry), same pattern as "concierge".
//
// The three pieces still run on their own systems:
//   venue    → Booking Engine  (createBooking + booking PaymentIntent)
//   catering → Food/Commerce   (commerce Stripe intent + createFoodOrder)
//   floral   → Food/Commerce   (commerce Stripe intent + createFoodOrder)
// The checkout below fires them in sequence against one card entry, links each
// paid order to its event_need, and stops on the first failure (paid pieces stay).

import React, { useState, useEffect } from "react";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { isAuthenticated, getAuthUserId } from "../store/auth";
import { useStripe, useElements, CardNumberElement } from "@stripe/react-stripe-js";
import { CardInput, useBookingPayment } from "../components/BookingPayment.jsx";
import { createBooking, cancelBooking } from "../api/booking";
import { createStripeIntent } from "../api/payment";
import { createFoodOrder } from "../api/food";
import { linkEventOrder, getEventTimeline } from "../api/eventConcierge";
import { amountsDiffer, resolveChargedTotal } from "../utils/cateringCheckout.js";
import PriceChangeModal from "../components/pricing/PriceChangeModal.jsx";
import { useEventPlan, useSharedEventFields, planDateInput } from "../store/eventPlan.js";
import { useEventCart, hydrateEventCart, EVENT_CART_CATEGORIES } from "../store/eventCart.js";

const FONT = "'DM Sans', sans-serif";
const HEAD = "'Barlow Condensed', sans-serif";
const ACCENT = "#f97316";

const OCCASIONS = [
	{ id: "dinner", label: "Dinner party" },
	{ id: "birthday", label: "Birthday" },
	{ id: "wedding", label: "Wedding" },
	{ id: "corporate", label: "Corporate" },
	{ id: "baby", label: "Baby shower" },
	{ id: "other", label: "Other" },
];

const PIECE_META = {
	venue: { label: "Venue", nav: "venues" },
	catering: { label: "Catering", nav: "catering" },
	floral: { label: "Floral", nav: "floral" },
};

const STATUS_STYLE = {
	booked: { label: "Booked", color: "#22c55e" },
	pending: { label: "Pending", color: "#f59e0b" },
	unpaid: { label: "Unpaid", color: "#ef4444" },
	cancelled: { label: "Cancelled", color: "#ef4444" },
	unlinked: { label: "Not added", color: "var(--color-text-muted)" },
	processing: { label: "Processing…", color: "#60a5fa" },
	paid: { label: "Paid", color: "#22c55e" },
	failed: { label: "Failed", color: "#ef4444" },
};

function t(key, dflt, vars) {
	return i18n.t(`event.${key}`, { defaultValue: dflt, ...(vars || {}) });
}

function money(n) {
	const v = Number(n) || 0;
	return `$${v.toLocaleString(undefined, { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function goRebook(nav, returnLabel) {
	try {
		window.__navReturn = { id: "event-plan", label: returnLabel || t("backToEvent", "Back to event") };
	} catch { /* ignore */ }
	window.__nav?.(nav);
}

// ── Sign-in / empty states ─────────────────────────────────────────────────
function CenteredCard({ children }) {
	const { isMobile } = useViewport();
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 40, paddingBottom: 40 }}>
			<div style={{ maxWidth: 460, width: "100%" }}>{children}</div>
		</div>
	);
}

function StartEventCard() {
	const { startSharedEvent } = useEventPlan();
	const [occasion, setOccasion] = useState("dinner");
	const [title, setTitle] = useState("");
	const [date, setDate] = useState("");
	const [city, setCity] = useState("");
	const [guests, setGuests] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");

	const input = { width: "100%", boxSizing: "border-box", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 13px", fontFamily: FONT, fontSize: 13, color: "var(--color-text-primary)", outline: "none" };

	async function create() {
		if (busy) return;
		setBusy(true); setErr("");
		try {
			await startSharedEvent({ title, occasion, date, city, guests });
		} catch (e) {
			setErr(e?.response?.data?.error || t("createFailed", "Could not start the event. Please try again."));
			setBusy(false);
		}
	}

	return (
		<CenteredCard>
			<h1 className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 6, textAlign: "center" }}>{t("startTitle", "Plan one event")}</h1>
			<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, textAlign: "center", marginBottom: 24 }}>{t("startBody", "Book your venue, catering and flowers together — one date, one cart, one payment.")}</p>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
				{OCCASIONS.map((o) => (
					<button key={o.id} onClick={() => setOccasion(o.id)} style={{ padding: "7px 14px", borderRadius: 20, fontFamily: FONT, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${occasion === o.id ? ACCENT : "var(--color-border)"}`, background: occasion === o.id ? `${ACCENT}22` : "var(--color-surface-raised)", color: occasion === o.id ? ACCENT : "var(--color-text-secondary)" }}>{o.label}</button>
				))}
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
				<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("namePlaceholder", "Event name (optional)")} style={input} />
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
					<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, colorScheme: "dark" }} />
					<input type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder={t("guests", "Guests")} style={input} />
				</div>
				<input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("city", "City")} style={input} />
			</div>
			{err && <p style={{ fontFamily: FONT, fontSize: 12, color: "#ef4444", marginBottom: 10 }}>{err}</p>}
			<button onClick={create} disabled={busy} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: busy ? "rgba(249,115,22,0.5)" : ACCENT, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 15, cursor: busy ? "default" : "pointer" }}>
				{busy ? t("creating", "Starting…") : t("startCta", "Start planning")}
			</button>
		</CenteredCard>
	);
}

// ── Shared date / guests / city bar ────────────────────────────────────────
// Fully controlled by the plan in the store: patchSharedFields() optimistically
// updates the in-memory plan (and debounces the PATCH), so `plan` re-renders here
// with the new value — no local mirror state, no effects.
function SharedFieldsBar({ plan }) {
	const { setDate, setCity, setGuests } = useSharedEventFields();
	const date = planDateInput(plan);
	const city = plan?.city ?? "";
	const guests = plan?.guests ?? "";

	const cell = { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 130 };
	const label = { fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" };
	const input = { background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 9, padding: "9px 11px", fontFamily: FONT, fontSize: 13, color: "var(--color-text-primary)", outline: "none", width: "100%", boxSizing: "border-box" };

	return (
		<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
			<div style={cell}>
				<span className="text-text-secondary" style={label}>{t("date", "Date")}</span>
				<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, colorScheme: "dark" }} />
			</div>
			<div style={cell}>
				<span className="text-text-secondary" style={label}>{t("guests", "Guests")}</span>
				<input type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} style={input} />
			</div>
			<div style={cell}>
				<span className="text-text-secondary" style={label}>{t("city", "City")}</span>
				<input value={city} onChange={(e) => setCity(e.target.value)} style={input} />
			</div>
		</div>
	);
}

// ── Cart + checkout ───────────────────────────────────────────────────────
function EventCheckoutPanel({ plan, onDone }) {
	const stripe = useStripe();
	const elements = useElements();
	const payBooking = useBookingPayment();
	const { lines, total, removeLine, clear } = useEventCart();
	const [lineState, setLineState] = useState({}); // category -> { status, error }
	const [running, setRunning] = useState(false);
	const [banner, setBanner] = useState("");
	const [priceChange, setPriceChange] = useState(null);

	const date = planDateInput(plan);
	const guests = plan?.guests ?? null;
	const city = plan?.city ?? "";
	const ready = !!date && !!guests && !!city.trim() && lines.length > 0;

	function setLine(cat, patch) {
		setLineState((s) => ({ ...s, [cat]: { ...s[cat], ...patch } }));
	}

	function confirmPriceIfChanged(oldAmount, newAmount) {
		if (!amountsDiffer(oldAmount, newAmount)) return Promise.resolve(true);
		return new Promise((resolve) => setPriceChange({ oldAmount, newAmount: Number(newAmount), resolve }));
	}

	async function payVenue(line) {
		const res = await createBooking({
			booking_listing_id: line.listing_id,
			start_date: date,
			guests: Number(guests),
			notes: `Shared event: ${plan.title} · ${guests} guests`,
		});
		const booking = res?.data ?? res;
		const bookingId = booking?.booking_id;
		if (!bookingId) throw new Error(t("venueFailed", "Could not create the venue booking."));
		const pay = await payBooking(bookingId);
		if (!pay.ok) {
			if (pay.releaseBooking) { try { await cancelBooking(bookingId, "payment failed"); } catch { /* ignore */ } }
			throw new Error(pay.error || t("paymentFailed", "Payment failed."));
		}
		await linkEventOrder(plan.event_plan_id, { category: "venue", kind: "booking", ref_id: bookingId });
	}

	async function payFood(category, line) {
		const card = elements?.getElement(CardNumberElement);
		if (!stripe || !card) throw new Error(t("cardNotReady", "Card details are not ready."));
		const items = Array.isArray(line.items) && line.items.length
			? line.items.map((i) => ({
				food_item_id: Number(i.food_item_id ?? i.id),
				qty: Number(i.qty) || 1,
				modifier_option_ids: Array.isArray(i.modifier_option_ids) ? i.modifier_option_ids : [],
			}))
			: [];
		if (!items.length) throw new Error(t("noItems", "This piece has no items."));
		const { clientSecret, paymentIntentId, amount } = await createStripeIntent(Number(line.line_total) || 0, {
			purpose: "commerce",
			vertical: category,
			item_source: "food",
			items,
			seller_id: line.seller_id ?? line.vendor_id,
			shipping_mode: "delivery",
			shipping_address: city || undefined,
		});
		const ok = await confirmPriceIfChanged(Number(line.line_total) || 0, amount);
		if (!ok) throw new Error(t("priceDeclined", "Price change declined."));
		const charged = resolveChargedTotal(Number(line.line_total) || 0, amount);
		const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
		if (result.error) throw new Error(result.error.message);
		const piId = result.paymentIntent?.id ?? paymentIntentId ?? null;
		const order = await createFoodOrder({
			user_id: getAuthUserId(),
			vendor_id: line.vendor_id,
			order_status: "pending",
			total_amount: charged,
			delivery_fee: 0,
			deliver_location: city,
			fulfillment_mode: "delivery",
			vendor_type_id: category === "floral" ? 6 : 5,
			delivery_instructions: `Event: ${date} | Guests: ${guests}`,
			payment_method: "CARD",
			payment_intent_id: piId,
			items,
		});
		const orderId = order?.data?.food_order_id ?? order?.food_order_id;
		if (!orderId) throw new Error(t("orderFailed", "Order could not be saved."));
		await linkEventOrder(plan.event_plan_id, { category, kind: "food_order", ref_id: orderId });
	}

	async function run() {
		if (!ready || running) return;
		if (!isAuthenticated()) { setBanner(t("signInToPay", "Please sign in to pay.")); return; }
		setRunning(true); setBanner("");
		for (const line of lines) {
			if (lineState[line.category]?.status === "paid") continue;
			setLine(line.category, { status: "processing", error: null });
			try {
				if (line.category === "venue") await payVenue(line);
				else await payFood(line.category, line);
				setLine(line.category, { status: "paid", error: null });
			} catch (e) {
				setLine(line.category, { status: "failed", error: e?.message || String(e) });
				setRunning(false);
				setBanner(t("stoppedAt", "Stopped at {{piece}} — paid pieces are safe.", { piece: PIECE_META[line.category].label }));
				return;
			}
		}
		setRunning(false);
		clear();
		onDone?.();
	}

	if (!lines.length) {
		return (
			<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "22px 20px", textAlign: "center" }}>
				<p className="text-text-primary" style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t("emptyCart", "Your event cart is empty")}</p>
				<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, marginBottom: 16 }}>{t("emptyCartBody", "Add a venue, catering and flowers from their pages — they'll gather here for one checkout.")}</p>
				<div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
					{EVENT_CART_CATEGORIES.map((c) => (
						<button key={c} onClick={() => goRebook(PIECE_META[c].nav)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${ACCENT}55`, background: `${ACCENT}14`, color: ACCENT, fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("browse", "Browse {{piece}}", { piece: PIECE_META[c].label })}</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "18px 20px" }}>
			<p className="text-text-secondary" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>{t("yourEvent", "Your event cart")}</p>
			{lines.map((line) => {
				const st = lineState[line.category]?.status;
				const meta = STATUS_STYLE[st] || null;
				return (
					<div key={line.category} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
						<div style={{ minWidth: 0 }}>
							<p className="text-text-primary" style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{PIECE_META[line.category].label}</p>
							<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.title || "—"}</p>
							{meta && <p style={{ fontFamily: FONT, fontSize: 11, color: meta.color, marginTop: 3 }}>{meta.label}{lineState[line.category]?.error ? ` · ${lineState[line.category].error}` : ""}</p>}
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
							<span className="text-text-primary" style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>{money(line.line_total)}</span>
							{!running && st !== "paid" && (
								<button onClick={() => removeLine(line.category)} className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 11 }}>{t("remove", "Remove")}</button>
							)}
						</div>
					</div>
				);
			})}
			<div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 16px" }}>
				<span className="text-text-primary" style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700 }}>{t("total", "Total")}</span>
				<span style={{ fontFamily: HEAD, fontSize: 20, fontWeight: 800, color: ACCENT }}>{money(total)}</span>
			</div>

			<p className="text-text-secondary" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{t("payment", "Payment")}</p>
			<div style={{ marginBottom: 12 }}><CardInput /></div>
			<p className="text-text-muted" style={{ fontFamily: FONT, fontSize: 11, marginBottom: 12 }}>{t("chargeNote", "Each vendor is charged separately on this card, in one go.")}</p>

			{!ready && <p className="text-text-muted" style={{ fontFamily: FONT, fontSize: 11, marginBottom: 10 }}>{t("fillShared", "Set the event date, guests and city above to check out.")}</p>}
			{banner && <p style={{ fontFamily: FONT, fontSize: 12, color: "#f59e0b", marginBottom: 10 }}>{banner}</p>}

			<button onClick={run} disabled={!ready || running} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: (ready && !running) ? ACCENT : "var(--color-surface-raised)", color: (ready && !running) ? "#fff" : "var(--color-text-muted)", fontFamily: FONT, fontWeight: 700, fontSize: 15, cursor: (ready && !running) ? "pointer" : "default" }}>
				{running ? t("processing", "Processing…") : Object.values(lineState).some((l) => l?.status === "failed") ? t("retry", "Retry payment") : t("payCta", "Pay {{total}}", { total: money(total) })}
			</button>

			{priceChange && (
				<PriceChangeModal
					oldAmount={priceChange.oldAmount}
					newAmount={priceChange.newAmount}
					onConfirm={() => { priceChange.resolve(true); setPriceChange(null); }}
					onCancel={() => { priceChange.resolve(false); setPriceChange(null); }}
				/>
			)}
		</div>
	);
}

// ── Timeline ──────────────────────────────────────────────────────────────
function EventTimeline({ planId, refreshKey }) {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let alive = true;
		getEventTimeline(planId)
			.then((res) => { if (alive) { setData(res); setLoading(false); } })
			.catch(() => { if (alive) { setData(null); setLoading(false); } });
		return () => { alive = false; };
	}, [planId, refreshKey]);

	if (loading) return <p className="text-text-muted" style={{ fontFamily: FONT, fontSize: 13, marginTop: 20 }}>{i18n.t("common.loading", { defaultValue: "Loading…" })}</p>;
	if (!data) return null;

	return (
		<div style={{ marginTop: 28 }}>
			<p className="text-text-secondary" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>{t("timeline", "Event timeline")}</p>
			{data.hanging && (
				<div style={{ borderRadius: 12, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", padding: "12px 14px", marginBottom: 14 }}>
					<p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 2 }}>{t("hangingTitle", "One piece fell through")}</p>
					<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12 }}>{t("hangingBody", "A cancelled booking left the rest of your event without it. Re-book it below with your saved date and guest count.")}</p>
				</div>
			)}
			<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, overflow: "hidden" }}>
				{(data.pieces || []).map((p, i) => {
					const s = STATUS_STYLE[p.status] || STATUS_STYLE.unlinked;
					const meta = PIECE_META[p.category] || { label: p.category, nav: p.nav };
					const needsAction = p.status === "cancelled" || p.status === "unlinked";
					return (
						<div key={p.category} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 16px", borderTop: i ? "1px solid var(--color-border-subtle)" : "none" }}>
							<div style={{ minWidth: 0 }}>
								<p className="text-text-primary" style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{meta.label}</p>
								<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title || t("notBooked", "Not booked yet")}</p>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
								<span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: s.color, display: "inline-flex", alignItems: "center", gap: 6 }}>
									<span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, display: "inline-block" }} />
									{s.label}
								</span>
								{needsAction && (
									<button onClick={() => goRebook(meta.nav)} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${ACCENT}55`, background: `${ACCENT}14`, color: ACCENT, fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
										{p.status === "cancelled" ? t("rebook", "Re-book") : t("add", "Add")}
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ── Page ──────────────────────────────────────────────────────────────────
function EventPlanPage() {
	const { isMobile } = useViewport();
	const { plan, planId, loading, refresh, clearActivePlan } = useEventPlan();
	const [tick, setTick] = useState(0);

	useEffect(() => { window.dispatchEvent(new CustomEvent("strug:view-change")); }, []);
	useEffect(() => { if (planId) refresh(); }, [planId, refresh]);
	// Adopt a cart saved from another device (package_json.cart) into the local store.
	useEffect(() => { if (plan?.package_json?.cart) hydrateEventCart(plan.package_json.cart); }, [plan?.package_json?.cart]);

	if (!isAuthenticated()) {
		return (
			<CenteredCard>
				<h1 className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, textTransform: "uppercase", marginBottom: 8, textAlign: "center" }}>{t("signInTitle", "Sign in to plan your event")}</h1>
				<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, textAlign: "center" }}>{t("signInBody", "Your shared event keeps the date, guests and vendors in one place.")}</p>
			</CenteredCard>
		);
	}

	if (!planId) return <StartEventCard />;
	if (loading && !plan) return <CenteredCard><p className="text-text-muted" style={{ fontFamily: FONT, textAlign: "center" }}>{i18n.t("common.loading", { defaultValue: "Loading…" })}</p></CenteredCard>;
	if (!plan) return <StartEventCard />;

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingBottom: 32 }}>
			<div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: "24px 0 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
					<div>
						<h1 className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: "clamp(24px, 3vw, 34px)", letterSpacing: "0.03em", textTransform: "uppercase", margin: 0 }}>{plan.title || t("myEvent", "My event")}</h1>
						<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, marginTop: 4 }}>
							{(OCCASIONS.find((o) => o.id === plan.occasion)?.label) || plan.occasion}
							{plan.event_date ? ` · ${planDateInput(plan)}` : ""}
							{plan.city ? ` · ${plan.city}` : ""}
							{plan.guests ? ` · ${plan.guests} ${t("guestsShort", "guests")}` : ""}
						</p>
					</div>
					<button onClick={() => { if (window.confirm(t("clearConfirm", "Clear this event from this device? Your bookings are not cancelled."))) clearActivePlan(); }} className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12, flexShrink: 0 }}>{t("clear", "Clear")}</button>
				</div>

				<SharedFieldsBar plan={plan} />
				<EventCheckoutPanel plan={plan} onDone={() => { setTick((n) => n + 1); refresh(); }} />
				<EventTimeline planId={plan.event_plan_id} refreshKey={tick} />
			</div>
		</div>
	);
}

export { EventPlanPage };
