import React, { useState, useEffect } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { Skel, SkeletonHeading } from "../components/skeletons.jsx";
import { AddressAutocomplete } from "../components/shared.jsx";
import RoutePreviewMap from "../components/RoutePreviewMap.jsx";
import LiveTrackingMap from "../components/LiveTrackingMap.jsx";
import { ensureCourierCustomer, createCourierOrder, getCourierFareEstimates, getNearbyCouriers, getCourierOrder } from "../api/courier.js";
import { connectSocket } from "../api/socket.js";
import { geocodeAddress } from "../utils/geocode.js";
import { isAuthenticated } from "../store/auth.js";

// #460: the per-vehicle and per-package `price` fields are GONE. They were hardcoded numbers the
// UI added together with no distance involved, which is how Courier came to quote a confident
// (and wrong) total before a pickup or drop-off existed. Pricing now comes from the route, via
// POST /courier-order/fare-estimates.
const COURIER_VEHICLE_TYPES = [
	{ id: "bike",  label: "Bike",  desc: "Fastest · Small packages",  eta: "10–20 min", gradient: "linear-gradient(135deg,#052e16,#16a34a)", accent: "#16a34a" },
	{ id: "car",   label: "Car",   desc: "Standard · Most packages",  eta: "15–30 min", gradient: "linear-gradient(135deg,#0c1a2e,#2563eb)", accent: "#2563eb" },
	{ id: "van",   label: "Van",   desc: "Large / heavy shipments",   eta: "20–40 min", gradient: "linear-gradient(135deg,#2a0a0a,#ef4444)", accent: "#ef4444" },
];

const PACKAGE_SIZES = [
	{ id: "envelope", label: "Envelope",   desc: "Documents, thin items" },
	{ id: "small",    label: "Small Box",  desc: "Up to 5 kg" },
	{ id: "large",    label: "Large Box",  desc: "Up to 20 kg" },
	{ id: "fragile",  label: "Fragile",    desc: "Glass / electronics" },
];

// Live nearby-courier count + markers, polled every 15s — mirrors Rideshare's
// "N drivers nearby" preview. `center` is { lat, lng } | null; passing null pauses polling
// and clears the list (e.g. once a courier has actually been assigned, "3 nearby" is noise).
function useNearbyCouriers(center) {
	const [nearby, setNearby] = useState([]);
	const [locating, setLocating] = useState(false);

	useEffect(() => {
		if (!center) return undefined;
		setLocating(true);
		let stop = false;
		const load = () => getNearbyCouriers({ lat: center.lat, long: center.lng, radius: 6 })
			.then((res) => { if (!stop) { setNearby(Array.isArray(res?.data) ? res.data : []); setLocating(false); } })
			.catch(() => { if (!stop) { setNearby([]); setLocating(false); } });
		load();
		const id = setInterval(load, 15000);
		return () => { stop = true; clearInterval(id); };
	}, [center?.lat, center?.lng]);

	// Ignore stale `nearby`/`locating` state once center goes null (e.g. a courier just got
	// assigned) rather than resetting it inside the effect above.
	const effectiveNearby = center ? nearby : [];
	const label = !center
		? null
		: locating
			? i18n.t("courier.findingCouriers", { defaultValue: "Finding couriers near you…" })
			: effectiveNearby.length > 0
				? i18n.t("courier.couriersNearby", { defaultValue: "{{n}} courier{{s}} nearby", n: effectiveNearby.length, s: effectiveNearby.length === 1 ? "" : "s" })
				: i18n.t("courier.noCouriersOnline", { defaultValue: "No couriers online right now" });

	return { nearby: effectiveNearby, label };
}

// Live order tracking — subscribes to the courier lifecycle sockets the backend
// emits to the customer's room (accepted -> picked_up -> delivered).
const COURIER_STEPS = [
	{ key: "pending",   label: "Finding a courier" },
	{ key: "accepted",  label: "Courier on the way" },
	{ key: "picked_up", label: "Package picked up" },
	{ key: "delivered", label: "Delivered" },
];

function CourierTrackingView({ order, pickup, dropoff, pickupCoords, dropoffCoords, price, onBack }) {
	const { isMobile } = useViewport();
	const orderId = order.courier_order_id ?? order.id;
	const [status, setStatus] = useState(order.status || "pending");
	// The courier's live GPS, relayed by the backend to this customer's own room. Null until the
	// order is claimed and the courier's first ping lands.
	const [courierPos, setCourierPos] = useState(null);
	const [etaMin, setEtaMin] = useState(null);

	useEffect(() => {
		if (!orderId) return;
		const s = connectSocket();
		const onAccepted = () => setStatus("accepted");
		const onPicked = () => setStatus("picked_up");
		const onDelivered = () => { setStatus("delivered"); setCourierPos(null); };
		// `status` rides along with the ping so the leg the courier is actually driving stays in
		// sync even if the lifecycle event and the location ping arrive out of order.
		const onLocation = (p) => {
			if (p?.lat == null || p?.lng == null) return;
			setCourierPos({ lat: Number(p.lat), lng: Number(p.lng) });
			if (p.status) setStatus((cur) => (cur === "delivered" ? cur : p.status));
		};
		const accEvt = `courier-accepted-${orderId}`;
		const pickEvt = `courier-picked-up-${orderId}`;
		const delEvt = `courier-delivered-${orderId}`;
		const locEvt = `courier-location-${orderId}`;
		s.on(accEvt, onAccepted);
		s.on(pickEvt, onPicked);
		s.on(delEvt, onDelivered);
		s.on(locEvt, onLocation);
		return () => { s.off(accEvt, onAccepted); s.off(pickEvt, onPicked); s.off(delEvt, onDelivered); s.off(locEvt, onLocation); };
	}, [orderId]);

	// Poll fallback (covers a dropped socket, backgrounded tab, or missed reconnect): the
	// lifecycle events above are the only way this view otherwise learns the order moved, so a
	// customer who missed one socket message would be stuck on a stale step forever.
	useEffect(() => {
		if (!orderId || status === "delivered") return undefined;
		let cancelled = false;
		const poll = () => {
			getCourierOrder(orderId)
				.then((o) => {
					if (cancelled || !o?.status) return;
					setStatus((cur) => (cur === "delivered" ? cur : o.status));
					if (o.status === "delivered") setCourierPos(null);
				})
				.catch(() => {});
		};
		const id = setInterval(poll, 5000);
		return () => { cancelled = true; clearInterval(id); };
	}, [orderId, status]);

	// AddressAutocomplete only hands back coordinates when the user picks a suggestion — someone who
	// typed an address and hit enter has none. Geocode the text as a fallback so the map still draws.
	const [geoPickup, setGeoPickup] = useState(null);
	const [geoDropoff, setGeoDropoff] = useState(null);
	useEffect(() => {
		if (pickupCoords || !pickup) return undefined;
		let cancelled = false;
		geocodeAddress(pickup).then((pt) => { if (!cancelled && pt) setGeoPickup(pt); });
		return () => { cancelled = true; };
	}, [pickup, pickupCoords]);
	useEffect(() => {
		if (dropoffCoords || !dropoff) return undefined;
		let cancelled = false;
		geocodeAddress(dropoff).then((pt) => { if (!cancelled && pt) setGeoDropoff(pt); });
		return () => { cancelled = true; };
	}, [dropoff, dropoffCoords]);

	const fromPt = pickupCoords ?? geoPickup;
	const toPt = dropoffCoords ?? geoDropoff;

	const activeIdx = Math.max(0, COURIER_STEPS.findIndex(st => st.key === status));

	// Before collection the courier is driving to the PICKUP; after it, to the DROP-OFF. Tracking the
	// wrong leg is the whole point of the map, so this switches with the lifecycle.
	const heading = status === "picked_up" ? toPt : fromPt;
	const isLive = (status === "accepted" || status === "picked_up") && !!courierPos && !!heading;

	// Nearby-courier count while still "Finding a courier" — once one is actually assigned
	// (isLive), showing "3 nearby" is noise, so the hook is only fed a center while pending.
	const { nearby: nearbyCouriers, label: nearbyLabel } = useNearbyCouriers(!isLive ? fromPt : null);

	const [linkCopied, setLinkCopied] = useState(false);
	const trackingToken = order.tracking_token;
	async function shareTrackingLink() {
		const url = `${window.location.origin}/track/${trackingToken}`;
		try {
			if (navigator.share) await navigator.share({ title: "Track my delivery", url });
			else { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }
		} catch { /* user cancelled the share sheet — not an error */ }
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32 }}>
			<div style={{ maxWidth: 620, width: "100%", margin: "0 auto", padding: "28px 0 40px" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
					<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						{i18n.t("courier.backToCourier", { defaultValue: "Back" })}
					</button>
					{trackingToken && (
						<button onClick={shareTrackingLink} style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 8, color: "#60a5fa", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, padding: "7px 12px", display: "flex", alignItems: "center", gap: 6 }}>
							<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>
							{linkCopied ? i18n.t("courier.linkCopied", { defaultValue: "Link copied" }) : i18n.t("courier.shareTracking", { defaultValue: "Share tracking link" })}
						</button>
					)}
				</div>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px,3vw,38px)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{COURIER_STEPS[activeIdx]?.label}</h1>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>
					{i18n.t("courier.orderRef", { defaultValue: "Order" })} #{orderId} · ${Number(price || order.price || 0)}
					{isLive && etaMin != null && (
						<> · <span style={{ color: "#60a5fa", fontWeight: 700 }}>
							{status === "picked_up"
								? i18n.t("courier.etaDropoff", { defaultValue: "{{n}} min to drop-off", n: etaMin })
								: i18n.t("courier.etaPickup", { defaultValue: "{{n}} min to pickup", n: etaMin })}
						</span></>
					)}
				</p>

				{/* Live courier position. Only once someone has actually claimed the order — a map with
				    nothing moving on it while we are still "finding a courier" is just noise. Falls back
				    to the static route preview until then, so the user can still see the trip. */}
				<div style={{ marginBottom: 16 }}>
					{isLive ? (
						<LiveTrackingMap
							live={courierPos}
							destination={heading}
							accent="#0ea5e9"
							height={isMobile ? 220 : 300}
							onEta={setEtaMin}
						/>
					) : (fromPt && toPt) ? (
						<RoutePreviewMap origin={fromPt} destination={toPt} accent="#0ea5e9" height={isMobile ? 200 : 260} nearbyPoints={nearbyCouriers} nearbyLabel={nearbyLabel} />
					) : null}
				</div>

				<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
					{COURIER_STEPS.map((st, i) => {
						const done = i < activeIdx;
						const current = i === activeIdx;
						const color = done ? "#16a34a" : current ? "#2563eb" : "var(--color-text-muted)";
						return (
							<div key={st.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0" }}>
								<div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, border: `2px solid ${color}`, background: done ? "#16a34a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
									{done ? <span style={{ color: "#fff", fontSize: 13 }}>✓</span> : current ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} /> : null}
								</div>
								{/* Step label sits on this card's own --color-surface (not an always-dark scrim), so
							    "done/current" must be a token too — hardcoded #fff here would go invisible on
							    the near-white card surface in light theme. */}
							<span className={done || current ? "text-text-primary" : "text-text-secondary"} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: current ? 700 : 500 }}>{st.label}</span>
							</div>
						);
					})}
				</div>

				<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "18px 22px" }}>
					<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
						<div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{pickup}</span>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						<div style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669", flexShrink: 0 }} />
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{dropoff}</span>
					</div>
				</div>
			</div>
		</div>
	);
}

// #460: the bubbles need a glyph. Inline SVG (no emoji, per the house icon convention).
function CourierVehicleIcon({ id }) {
	// stroke stays a fixed white, not a token — this icon only ever renders inside the vehicle
	// bubble's always-dark gradient background (see vt.gradient below), in both themes.
	const common = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
	if (id === "bike") return (
		<svg {...common}><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5 12 7l-2 4h4"/><path d="M12 7h3"/><path d="M5.5 17.5 10 11"/></svg>
	);
	if (id === "van") return (
		<svg {...common}><path d="M2 16V7a1 1 0 0 1 1-1h10v10"/><path d="M13 9h4l4 4v3h-2"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/><path d="M9 17.5h6"/></svg>
	);
	return (
		<svg {...common}><path d="M5 16h14"/><path d="M4 16v-3.2a2 2 0 0 1 .3-1L6.5 8A2 2 0 0 1 8.2 7h7.6a2 2 0 0 1 1.7 1l2.2 3.8a2 2 0 0 1 .3 1V16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/></svg>
	);
}

function CourierPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("courier");
const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [courView, setCourView] = useState("landing"); // landing | tracking
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [courView]);
	const [pickup, setPickup] = useState("");
	const [pickupCoords, setPickupCoords] = useState(null);
	const [dropoff, setDropoff] = useState("");
	const [dropoffCoords, setDropoffCoords] = useState(null);
	const [packageSize, setPackageSize] = useState("small");
	const [vehicleType, setVehicleType] = useState("bike");
	const [urgent, setUrgent] = useState(false);
	const [priceMode, setPriceMode] = useState("standard"); // "standard" | "setprice"
	const [userPrice, setUserPrice] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState(null);
	const [activeOrder, setActiveOrder] = useState(null);

	// Fallback center for the nearby-couriers preview before a pickup address is typed —
	// same "show me something useful immediately" pattern Rideshare uses.
	const [geoCoords, setGeoCoords] = useState(null);
	useEffect(() => {
		if (!navigator.geolocation) return;
		navigator.geolocation.getCurrentPosition(
			(pos) => setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
			() => { /* no permission / no fix — the map just stays hidden until pickup is typed */ },
			{ enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
		);
	}, []);
	const previewCenter = pickupCoords ?? geoCoords;
	const { nearby: nearbyCouriers, label: nearbyLabel } = useNearbyCouriers(previewCenter);

	// #460: the fare used to be (vehicle.price + package.price + urgent), three hardcoded numbers
	// with the DISTANCE nowhere in it — so Courier showed a confident total before the user had
	// entered a pickup or a drop-off, and the number was wrong anyway. Price the real route, the
	// same way Rideshare does. Nothing is quoted until there is a route to quote.
	const [fareEstimates, setFareEstimates] = useState(null);
	const [fareLoading, setFareLoading] = useState(false);
	const hasRoute = !!(pickup && dropoff);

	useEffect(() => {
		if (!hasRoute) { setFareEstimates(null); return undefined; }
		setFareLoading(true);
		const timer = setTimeout(async () => {
			try {
				const res = await getCourierFareEstimates(pickup, dropoff, packageSize, urgent);
				setFareEstimates(res?.successful && res?.estimates ? res.estimates : null);
			} catch {
				setFareEstimates(null);
			} finally {
				setFareLoading(false);
			}
		}, 600);
		return () => clearTimeout(timer);
	}, [pickup, dropoff, packageSize, urgent, hasRoute]);

	const fare = fareEstimates?.[vehicleType]?.total ?? null;
	const finalPrice = priceMode === "setprice" ? parseFloat(userPrice) : fare;

	async function requestCourier() {
		if (!(pickup && dropoff) || submitting) return;
		if (!isAuthenticated()) { window.location.href = import.meta.env.VITE_LOGIN_URL; return; }
		if (priceMode === "setprice" && (!finalPrice || finalPrice <= 0)) { setSubmitError(i18n.t("courier.enterPrice", { defaultValue: "Enter a price for your delivery." })); return; }
		setSubmitError(null);
		setSubmitting(true);
		try {
			// Resolve (or create) this user's courier_customer row, then create a real
			// order. With no provider attached it is broadcast to online couriers.
			const customer = await ensureCourierCustomer();
			const order = await createCourierOrder({
				customer_id: customer.customer_id,
				start_location_address: pickup,
				end_location_address: dropoff,
				start_location_lat: pickupCoords?.lat ?? null,
				start_location_long: pickupCoords?.lng ?? null,
				end_location_lat: dropoffCoords?.lat ?? null,
				end_location_long: dropoffCoords?.lng ?? null,
				status: "pending",
				price: finalPrice,
				payment_method: "card",
				package_size: packageSize,
				vehicle_type: vehicleType,
				urgent,
				// Locked-quote id from the fare-estimates call, so the server can verify
				// (and, for wallet payments, enforce) the price hasn't drifted since it
				// was quoted — see the backend's "lock the price, disclose the change" fix.
				quote_id: priceMode === "standard" ? fareEstimates?.[vehicleType]?.quote_id : undefined,
			});
			setActiveOrder(order);
			setCourView("tracking");
		} catch (err) {
			setSubmitError(err?.response?.data?.error || i18n.t("courier.requestFailed", { defaultValue: "Couldn't place your courier request. Please try again." }));
		}
		setSubmitting(false);
	}

	if (courView === "tracking" && activeOrder) {
		return <CourierTrackingView order={activeOrder} pickup={pickup} dropoff={dropoff} pickupCoords={pickupCoords} dropoffCoords={dropoffCoords} price={finalPrice} onBack={() => { setActiveOrder(null); setCourView("landing"); }} />;
	}

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32 }}>
			<div style={{ maxWidth: 760, width: "100%", margin: "0 auto" }}>
				<div style={{ padding: "28px 0 24px" }}>
					<SkeletonHeading />
					<div className="bg-surface border border-border" style={{ marginTop: 28, marginBottom: 16, borderRadius: 16, padding: "20px 22px" }}>
						<Skel w={50} h={10} r={4} style={{ marginBottom: 14 }} />
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<Skel h={40} r={10} />
							<Skel h={40} r={10} />
						</div>
					</div>
					<div className="bg-surface border border-border" style={{ marginBottom: 16, borderRadius: 16, padding: "20px 22px" }}>
						<Skel w={60} h={10} r={4} style={{ marginBottom: 14 }} />
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
							{[...Array(4)].map((_,i) => <Skel key={i} h={60} r={10} />)}
						</div>
					</div>
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px 22px" }}>
						<Skel w={80} h={10} r={4} style={{ marginBottom: 14 }} />
						<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
							{[...Array(3)].map((_,i) => <Skel key={i} h={56} r={12} />)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32 }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 760, width: "100%", margin: "0 auto" }}>
				<div style={{ padding: "28px 0 24px", animation: "fadeUp 0.3s ease both" }}>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase" , marginBottom: 28}}>{landingTitle}</h1>

					{/* Route */}
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>{i18n.t("rideshare.route")}</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", flexShrink: 0, boxShadow: "0 0 6px #2563eb80" }} />
								<AddressAutocomplete value={pickup} onChange={(val, lat, lng) => { setPickup(val); setPickupCoords(lat && lng ? { lat, lng } : null); }} placeholder={i18n.t("courier.pickupPlaceholder")} useLocation wrapStyle={{ flex: 1 }} inputStyle={{ width: "100%", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 14px", color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 16 : 14, outline: "none", caretColor: "#2563eb", boxSizing: "border-box" }} />
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669", flexShrink: 0, boxShadow: "0 0 6px #05966980" }} />
								<AddressAutocomplete value={dropoff} onChange={(val, lat, lng) => { setDropoff(val); setDropoffCoords(lat && lng ? { lat, lng } : null); }} placeholder={i18n.t("courier.deliveryPlaceholder")} wrapStyle={{ flex: 1 }} inputStyle={{ width: "100%", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 14px", color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 16 : 14, outline: "none", caretColor: "#2563eb", boxSizing: "border-box" }} />
							</div>
						</div>

						{/* #460 priced the real route but never showed it. The distance is what the fare is
						    built from, so put it on screen: the user can see the trip they are paying for
						    instead of being handed a number to trust. Shows as soon as there's a center to
						    draw from (pickup once typed, or the browser's own location before that) so the
						    nearby-couriers count is visible immediately, same as Rideshare's booking screen —
						    the route line itself still only appears once both ends are resolved. */}
						{previewCenter && (
							<div style={{ marginTop: 14, animation: "fadeUp 0.25s ease both" }}>
								<RoutePreviewMap
									origin={pickupCoords ?? geoCoords}
									destination={dropoffCoords}
									accent="#2563eb"
									height={isMobile ? 180 : 240}
									nearbyPoints={nearbyCouriers}
									nearbyLabel={nearbyLabel}
								/>
							</div>
						)}
					</div>

					{/* Package size */}
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>{t("courier.packageSize")}</p>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
							{PACKAGE_SIZES.map(ps => (
								<button key={ps.id} onClick={() => setPackageSize(ps.id)} style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${packageSize === ps.id ? "#2563eb" : "var(--color-border-subtle)"}`, background: packageSize === ps.id ? "#2563eb15" : "var(--color-surface)", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
									{/* This card used to end in a hardcoded "+$2 / +$4 / …" price line. #460 deleted the
									    hardcoded prices but left the <p> behind pointing at ps.desc, so every package
									    card rendered its own description twice. One description is enough. */}
									{/* Neither state (selected accent-tint or idle neutral) is reliably dark, so the
									    label needs a token — #fff would go invisible on the near-white idle card in
									    light theme. */}
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{ps.label}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{ps.desc}</p>
								</button>
							))}
						</div>
					</div>

					{/* Vehicle — #460: circular bubbles, matching the Rideshare / On-Demand category pattern.
					    This used to be a stack of wide rows each stamped with a hardcoded "+$6 / +$12 / +$22",
					    which is where the premature (and wrong) pricing came from. The price now comes from the
					    real route, and there simply isn't one to show until a pickup and drop-off exist. */}
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>{i18n.t("rideshare.vehicle")}</p>
						<div style={{ display: "grid", gridTemplateColumns: `repeat(${COURIER_VEHICLE_TYPES.length}, 1fr)`, gap: 12 }}>
							{COURIER_VEHICLE_TYPES.map(vt => {
								const selected = vehicleType === vt.id;
								const est = fareEstimates?.[vt.id];
								return (
									<button key={vt.id} onClick={() => setVehicleType(vt.id)} title={vt.desc}
										style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
										{/* vt.gradient is always a dark-to-accent gradient by design (bike/car/van each get
										    their own always-dark bubble), so the idle ring stays a fixed light rgba rather
										    than a token — tokenizing it would turn dark/invisible against the gradient in
										    light theme, where a neutral border flips to a dark tint. */}
										<div style={{
											width: 72, height: 72, borderRadius: "50%", background: vt.gradient,
											border: `2.5px solid ${selected ? vt.accent : "rgba(255,255,255,0.10)"}`,
											boxShadow: selected ? `0 0 0 4px ${vt.accent}22, 0 6px 20px ${vt.accent}55` : "none",
											display: "flex", alignItems: "center", justifyContent: "center",
											transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
											transform: selected ? "translateY(-2px)" : "none",
										}}>
											<CourierVehicleIcon id={vt.id} />
										</div>
										{/* This label sits on the card's --color-surface, not the always-dark bubble above,
										    so both states need tokens. */}
										<span className={selected ? "text-text-primary" : "text-text-secondary"} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{vt.label}</span>
										<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: selected ? vt.accent : "var(--color-text-secondary)", minHeight: 15 }}>
											{!hasRoute ? "—" : fareLoading ? "…" : est?.total != null ? `$${est.total.toFixed(2)}` : "—"}
										</span>
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>{vt.eta}</span>
									</button>
								);
							})}
						</div>
						{!hasRoute && (
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center", margin: "14px 0 0" }}>
								{i18n.t("courier.enterAddresses", { defaultValue: "Enter pickup & delivery addresses" })}
							</p>
						)}
					</div>

					{/* Urgent toggle */}
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "16px 22px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t("courier.urgentDelivery")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("courier.priorityDispatch")}</p>
						</div>
						<button onClick={() => setUrgent(u => !u)} style={{ width: 48, height: 26, borderRadius: 13, border: "none", background: urgent ? "#ef4444" : "var(--color-border)", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
							{/* Knob stays a fixed white circle — standard switch-thumb convention, visible against
							    both the accent-red "on" track and the token "off" track in either theme. */}
							<div style={{ position: "absolute", top: 3, left: urgent ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
						</button>
					</div>

					{/* Pricing mode */}
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px 22px", marginBottom: 24 }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>{i18n.t("rideshare.pricing")}</p>
						<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#60a5fa" }}>{hasRoute ? (fareLoading ? "…" : fare != null ? `$${fare.toFixed(2)}` : "—") : "—"}</p>
					</div>
						<div style={{ display: "flex", gap: 8, marginBottom: priceMode === "setprice" ? 14 : 0 }}>
							{[{ id: "standard", label: "Recommended Price" }, { id: "setprice", label: "Set Your Price" }].map(opt => (
								<button key={opt.id} onClick={() => setPriceMode(opt.id)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${priceMode === opt.id ? "#2563eb" : "var(--color-border-subtle)"}`, background: priceMode === opt.id ? "#2563eb15" : "var(--color-surface)", color: priceMode === opt.id ? "#2563eb" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
									{opt.label}
								</button>
							))}
						</div>
						{priceMode === "setprice" && (
							<div style={{ animation: "fadeUp 0.2s ease both" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>{i18n.t("courier.offerHint")}</p>
								<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22 }}>$</span>
									<input type="number" value={userPrice} onChange={e => setUserPrice(e.target.value)} placeholder="0.00" min="1" className="bg-surface-raised text-text-primary" style={{ flex: 1, border: "1px solid rgba(37,99,235,0.3)", borderRadius: 10, padding: "10px 14px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, outline: "none", caretColor: "#2563eb" }} />
								</div>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 8 }}>Recommended: {hasRoute && fare != null ? `$${fare.toFixed(2)}` : "—"} for this delivery</p>
							</div>
						)}
					</div>

					{/* CTA */}
					{submitError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#ef4444", marginBottom: 10 }}>{submitError}</p>}
					{/* Disabled state falls back to a neutral surface, so its text needs a token too — only
					    the enabled state is guaranteed to sit on the always-accent blue fill. */}
					<button onClick={requestCourier} disabled={!(pickup && dropoff) || submitting} style={{ width: "100%", background: (pickup && dropoff) ? "#2563eb" : "var(--color-surface-raised)", border: "none", borderRadius: 14, padding: "16px 0", color: (pickup && dropoff) ? "#fff" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, cursor: (pickup && dropoff) && !submitting ? "pointer" : "default", transition: "all 0.15s", marginBottom: 8 }}>
						{submitting
							? i18n.t("courier.requesting", { defaultValue: "Requesting…" })
							: !hasRoute
								? i18n.t("courier.enterAddresses", { defaultValue: "Enter pickup & delivery addresses" })
								// #460: only quote once the route has actually been priced.
								: priceMode === "setprice"
									? `${i18n.t("courier.requestCourier", { defaultValue: "Request Courier" })} · $${userPrice || "—"}`
									: fareLoading
										? i18n.t("rideshare.calculating")
										: fare != null
											? `${i18n.t("courier.requestCourier", { defaultValue: "Request Courier" })} · $${fare.toFixed(2)}`
											: i18n.t("courier.requestCourier", { defaultValue: "Request Courier" })}
					</button>
				</div>
			</div>
		</div>
	);
}

export { CourierPage };
