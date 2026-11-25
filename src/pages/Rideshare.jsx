import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePageI18n } from "../hooks/usePageI18n.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { Skel, SkeletonHeading } from "../components/skeletons.jsx";
import { AddressAutocomplete, Tooltip } from "../components/shared.jsx";
import { connectSocket, joinTripRoom, leaveTripRoom } from "../api/socket";
import { liveEtaLabel } from "../utils/geo.js";
import { loadGoogleMaps } from "../utils/googleMaps.js";
import { fetchRouteMeta } from "../utils/route.js";
import { formatCoords, geocodeAddressFallback, reverseGeocodeCoords } from "../utils/locationSearch.js";
import { useDistanceUnit, formatDistance, formatDuration } from "../utils/units.js";
import DistanceUnitToggle from "../components/DistanceUnitToggle.jsx";
import SmoothMarker from "../components/SmoothMarker.jsx";
import { createRideRequest, confirmRidePayment, getDriverAvailability, getFareEstimates, getRideRequest, rateRide, cancelRide, getNearbyRides, mapRideReceiptFromServer, parseRideRequestResponse, isSystemNoDriverReason, parseNearbyDrivers } from "../api/rideshare";
import { getAddresses } from "../api/user";
import RideBookingPanel from "../components/rideshare/RideBookingPanel.jsx";
import RideMatchingPanel from "../components/rideshare/RideMatchingPanel.jsx";
import RidePickupPanel from "../components/rideshare/RidePickupPanel.jsx";
import RideCompletionPanel from "../components/rideshare/RideCompletionPanel.jsx";
import { buildRideOptions, canApplyRideTransition, chooseRideOption, getNearbySupply, getPickupConfidence, getPickupRange, validateCustomRideOffer, validateRideSchedule } from "../utils/rideshareRiderExperience.js";
import { useRideScheduleValidation } from "../hooks/useRideScheduleValidation.js";
import { trackRideEvent } from "../api/rideshareAnalytics.js";

function FitBounds({ points }) {
	const map = useMap();
	const key = points.filter(Boolean).map(p => p.join(",")).join("|");
	useEffect(() => {
		const pts = points.filter(Boolean);
		if (!pts.length) return;
		if (pts.length === 1) { map.setView(pts[0], 14, { animate: true }); return; }
		map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 15, animate: true });
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps
	return null;
}

const NO_DRIVER_MSG = "No drivers are online right now. Please try again when a driver is available.";

function rideScheduleError(validation) {
	if (validation?.valid !== false) return null;
	if (validation.reason === "schedule_incomplete") return "Choose a schedule date and time before paying.";
	if (validation.reason === "schedule_past") return "Choose a future time for your ride before paying.";
	return "Enter a valid schedule date and time before paying.";
}

function parseNoDriverApiError(err) {
	const data = err?.response?.data;
	if (err?.response?.status === 503 || data?.error === "no_driver_available") {
		return data?.message ?? NO_DRIVER_MSG;
	}
	return null;
}

function parseBookingApiError(err) {
	const noDriver = parseNoDriverApiError(err);
	if (noDriver) return noDriver;
	const status = err?.response?.status;
	const apiMsg = err?.response?.data?.message ?? err?.response?.data?.error;
	if (status === 401 || status === 403) return "Your session expired. Please log in again.";
	if (status === 400) return apiMsg ?? "Invalid payment amount. Check your fare and try again.";
	if (status === 409) return apiMsg ?? "You already have a ride in progress.";
	if (status === 500) return apiMsg ?? "Server error booking ride. Ensure backend DB is migrated.";
	return apiMsg ?? err?.message ?? "Failed to book ride. Please try again.";
}

function buildRideCancelledMessage(data) {
	if (data?.message) return data.message;
	const isPassenger = data?.reason === "cancelled_by_passenger";
	const isNoDriver = isSystemNoDriverReason(data?.reason);
	const base = isPassenger
		? "Your ride was cancelled."
		: isNoDriver
			? "No drivers were available. Your ride has been cancelled."
			: "Your ride request was cancelled.";
	if (data?.refund_amount != null) {
		// Derive the % from the actual fee/paid split so copy tracks the backend rate.
		const feePct = data?.paid_amount > 0
			? Math.round((Number(data.cancel_fee) / Number(data.paid_amount)) * 100)
			: 30;
		const feeNote = data?.cancel_fee > 0
			? ` A ${feePct}% cancellation fee ($${Number(data.cancel_fee).toFixed(2)}) was applied.`
			: "";
		return `${base}${feeNote} $${Number(data.refund_amount).toFixed(2)} refunded to your wallet or card.`;
	}
	if (data?.refund) return `${base} Your payment has been refunded.`;
	return base;
}
import { openContextChat } from "../api/chat";
import { getUser } from "../store/auth";

const RIDESHARE_ACTIVE_KEY = "strug_rideshare_active_v1";
const RIDESHARE_ANALYTICS_KEYS = "strug_rideshare_analytics_v1";
const MAX_RIDESHARE_ANALYTICS_KEYS = 256;
const rideshareAnalyticsMemoryKeys = new Set();
const rideshareAnalyticsInFlight = new Map();
const SESSION_DEDUPED_RIDE_EVENTS = new Set([
	"matching_started", "matching_expanded", "matching_delayed", "matched", "no_driver",
	"cancelled", "driver_arrived", "pickup_verified", "ride_started", "ride_completed",
]);
/** Active rides only — completed trips should not reopen the map on return. */
const RESTORABLE_MAP_STATUSES = new Set(["pending", "accepted", "ongoing"]);

function saveRideshareSession(session) {
	try { sessionStorage.setItem(RIDESHARE_ACTIVE_KEY, JSON.stringify(session)); } catch { /* quota / private mode */ }
}

function loadRideshareSession() {
	try {
		const raw = sessionStorage.getItem(RIDESHARE_ACTIVE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function clearRideshareSession() {
	try { sessionStorage.removeItem(RIDESHARE_ACTIVE_KEY); } catch { /* ignore */ }
}

function rideAnalyticsKey(event, rideRequestId) {
	const user = getUser();
	const userKey = Number(user?.user_id ?? user?.id) || "session";
	return `${userKey}:${event}:${Number(rideRequestId)}`;
}

function hasDeliveredRideAnalyticsKey(key) {
	try {
		const parsed = JSON.parse(sessionStorage.getItem(RIDESHARE_ANALYTICS_KEYS) || "[]");
		const keys = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(-MAX_RIDESHARE_ANALYTICS_KEYS) : [];
		return keys.includes(key);
	} catch {
		return rideshareAnalyticsMemoryKeys.has(key);
	}
}

function rememberDeliveredRideAnalyticsKey(key) {
	rideshareAnalyticsMemoryKeys.add(key);
	while (rideshareAnalyticsMemoryKeys.size > MAX_RIDESHARE_ANALYTICS_KEYS) {
		rideshareAnalyticsMemoryKeys.delete(rideshareAnalyticsMemoryKeys.values().next().value);
	}
}

function persistDeliveredRideAnalyticsKey(key) {
	rememberDeliveredRideAnalyticsKey(key);
	try {
		const parsed = JSON.parse(sessionStorage.getItem(RIDESHARE_ANALYTICS_KEYS) || "[]");
		const keys = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(-MAX_RIDESHARE_ANALYTICS_KEYS) : [];
		sessionStorage.setItem(RIDESHARE_ANALYTICS_KEYS, JSON.stringify([...keys, key].slice(-MAX_RIDESHARE_ANALYTICS_KEYS)));
	} catch { /* bounded memory remains authoritative while storage is unavailable */ }
}

function deliverRideLifecycleAnalytics(event, rideRequestId, metadata) {
	const key = rideAnalyticsKey(event, rideRequestId);
	if (hasDeliveredRideAnalyticsKey(key)) return Promise.resolve(true);
	if (rideshareAnalyticsInFlight.has(key)) return rideshareAnalyticsInFlight.get(key);
	const attempt = Promise.resolve()
		.then(() => trackRideEvent(event, metadata))
		.then((delivered) => {
			if (delivered === true) persistDeliveredRideAnalyticsKey(key);
			return delivered === true;
		})
		.catch(() => false)
		.finally(() => rideshareAnalyticsInFlight.delete(key));
	rideshareAnalyticsInFlight.set(key, attempt);
	return attempt;
}
import { createPaypalOrder, capturePaypalOrder, createStripeIntent } from "../api/payment";
import { getWalletBalance } from "../api/user";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import PriceChangeModal from "../components/pricing/PriceChangeModal.jsx";

function getRideVehicleTypes(t) {
	return [
		{ id: "economy",    label: t("rideshare.economy"),    seats: 4, price: 12.50, desc: t("rideshare.economyDesc"),    gradient: "linear-gradient(135deg, #0d2238, #071627)", accent: "#2563eb" },
		{ id: "comfort",    label: t("rideshare.comfort"),    seats: 4, price: 18.75, desc: t("rideshare.comfortDesc"),    gradient: "linear-gradient(135deg, #1a2a0d, #0e1a07)", accent: "#059669" },
		{ id: "premium",    label: t("rideshare.premium"),    seats: 4, price: 24.50, desc: t("rideshare.premiumDesc"),    gradient: "linear-gradient(135deg, #2a1a0d, #1a0f07)", accent: "#d97706" },
		{ id: "suv",        label: t("rideshare.suv"),        seats: 6, price: 28.00, desc: t("rideshare.suvDesc"),        gradient: "linear-gradient(135deg, #1a0d2a, #100718)", accent: "#7c3aed" },
		{ id: "xl",         label: t("rideshare.xl"),         seats: 7, price: 34.00, desc: t("rideshare.xlDesc"),         gradient: "linear-gradient(135deg, #1f1205, #120b03)", accent: "#ea580c" },
		{ id: "accessible", label: t("rideshare.accessible"), seats: 4, price: 14.00, desc: t("rideshare.accessibleDesc"), gradient: "linear-gradient(135deg, #05201a, #031510)", accent: "#0d9488" },
	];
}

function driverFromAcceptedRide(ride) {
	const trip = resolveRideTrip(ride);
	const dp = trip?.driver_profile;
	const vehicle = Array.isArray(dp?.vehicle) ? dp.vehicle[0] : dp?.vehicle;
	if (!dp) return null;
	return {
		id: dp.driver_profile_id ?? 1,
		name: dp.user?.name ?? null,
		rating: dp.rating ?? null,
		vehicle: vehicle?.vehicle_types?.name ?? vehicle?.model ?? null,
		plate: vehicle?.plate_number ?? null,
		eta: null,
		accent: "#2563eb",
	};
}

function driverFromSocketPayload(data) {
	const d = data?.driver;
	if (!d) return null;
	return {
		id: d.id ?? 1,
		name: d.name ?? null,
		rating: d.rating ?? null,
		vehicle: d.vehicle_type ?? null,
		plate: d.plate ?? null,
		eta: d.eta ?? "En route",
		accent: "#2563eb",
	};
}

function mergeDriverDetails(previous, incoming) {
	if (!incoming) return previous;
	if (!previous || previous.id !== incoming.id) return incoming;
	return Object.fromEntries(Object.entries({ ...previous, ...incoming }).map(([key, value]) => [key, value ?? previous[key]]));
}

function resolveRideTrip(ride) {
	const trips = Array.isArray(ride?.active_trip)
		? ride.active_trip
		: ride?.active_trip
			? [ride.active_trip]
			: [];
	return trips.find((t) => !t?.ended_at) ?? trips[0] ?? null;
}

function formatPaymentMethodLabel(method) {
	const m = (method || "").toLowerCase();
	if (m === "card") return "Credit / Debit Card";
	if (m === "wallet") return "Strug Wallet";
	if (m === "cash") return "Cash";
	if (m === "paypal") return "PayPal";
	return method || "—";
}

function buildTripReceiptFromRide(ride, requestId, pickupFallback, dropoffFallback) {
	const trip = resolveRideTrip(ride);
	const dp = trip?.driver_profile;
	const vehicle = Array.isArray(dp?.vehicle) ? dp.vehicle[0] : dp?.vehicle;
	const totalRaw = trip?.total_fare ?? ride?.offered_fare ?? ride?.estimated_fare;
	const total = totalRaw != null && !Number.isNaN(parseFloat(totalRaw)) ? parseFloat(totalRaw) : null;
	const endedAt = trip?.ended_at ? new Date(trip.ended_at) : null;
	const distanceKm =
		trip?.actual_distance_km != null && !Number.isNaN(parseFloat(trip.actual_distance_km))
			? parseFloat(trip.actual_distance_km)
			: null;

	return {
		rideId: requestId ?? ride?.ride_request_id ?? null,
		tripId: trip?.trip_id ?? null,
		completedAtLabel: endedAt
			? endedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
			: null,
		pickup: ride?.pickup_address || pickupFallback || "Pickup",
		dropoff: ride?.drop_address || dropoffFallback || "Dropoff",
		driverName: dp?.user?.name ?? null,
		vehicleType:
			ride?.vehicle_types?.name ??
			vehicle?.vehicle_types?.name ??
			vehicle?.model ??
			null,
		distanceKm,
		total,
		currency: "CAD",
		paymentMethod: formatPaymentMethodLabel(trip?.payment_method),
	};
}

function rideTrackingSnapshot(ride) {
	if (!ride) return null;
	const trip = resolveRideTrip(ride);
	const driver = driverFromAcceptedRide(ride);
	const tripId = trip?.trip_id != null ? Number(trip.trip_id) : null;
	const rideOtp = trip?.otp_code != null ? String(trip.otp_code) : null;
	const alreadyRated = !!trip?.ride_rating;
	const driverArrivedAt = trip?.driver_arrived_at ?? trip?.driverArrivedAt ?? ride?.driver_arrived_at ?? null;

	if (ride.status === "accepted") {
		return { trackingStep: "matched", matchedDriver: driver, tripId, rideOtp, alreadyRated, driverArrivedAt };
	}
	if (ride.status === "ongoing") {
		return { trackingStep: "inride", matchedDriver: driver, tripId, rideOtp, alreadyRated, driverArrivedAt };
	}
	if (ride.status === "completed") {
		return { trackingStep: "done", matchedDriver: driver, tripId, rideOtp, alreadyRated };
	}
	if (ride.status === "cancelled") {
		const reason = ride.cancellation_reason;
		const isNoDriver = isSystemNoDriverReason(reason);
		return {
			trackingStep: isNoDriver ? "no_driver" : "cancelled",
			matchedDriver: null,
			tripId: null,
			rideOtp: null,
			alreadyRated: false,
		};
	}
	return { trackingStep: "searching", matchedDriver: driver, tripId, rideOtp };
}

// A top-down car pointing "north" (nose up) so a heading rotation aims it along travel —
// the moving-car marker used for the live driver, à la maps navigation. Shared by the
// Leaflet live-trip map (via divIcon) and the Google preview map (via a data-URI image).
// Colors here are fixed (not theme tokens): this icon sits on top of the map tile layer,
// which doesn't change with app theme, so it needs permanent, map-legible contrast — same
// reasoning as the hero photo scrim in Hub.jsx.
const CAR_SHAPES = (body) => `
	<rect x="6" y="8" width="3.2" height="5" rx="1.6" fill="#141414"/><rect x="22.8" y="8" width="3.2" height="5" rx="1.6" fill="#141414"/>
	<rect x="6" y="19" width="3.2" height="5" rx="1.6" fill="#141414"/><rect x="22.8" y="19" width="3.2" height="5" rx="1.6" fill="#141414"/>
	<rect x="8" y="3.5" width="16" height="25" rx="6" fill="${body}" stroke="#fff" stroke-width="1.6"/>
	<path d="M11 9 h10 l-1.4 4.2 h-7.2 z" fill="#0b1220" opacity="0.78"/>
	<rect x="11.6" y="20.4" width="8.8" height="4" rx="1.6" fill="#0b1220" opacity="0.6"/>`;
// `deg` bakes a heading rotation into the SVG itself (0 = nose up / north), so the Google
// preview map — whose image markers can't be rotated via CSS — can still face its cars.
const CAR_SVG = (body = "#f59e0b", deg = 0) => `<svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(${deg} 16 16)">${CAR_SHAPES(body)}</g></svg>`;
const CAR_DATA_URI = (body = "#f59e0b", deg = 0) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CAR_SVG(body, deg))}`;

function RideshareMapView({ pickup, dropoff, selectedVehicle, requestId, onBack, onTripCompleted, onNoDriver, onNavigate }) {
	const { t } = usePageI18n("rideshare");
	const { isMobile } = useViewport();
	const [matchedDriver, setMatchedDriver] = useState(null);
	const [trackingStep, setTrackingStep] = useState(() => requestId ? "hydrating" : "searching");
	const lifecycleStepRef = useRef(requestId ? "hydrating" : "searching");
	const lifecycleTimestampRef = useRef(0);
	const socketLifecycleEpochRef = useRef(0);
	const apiRequestSequenceRef = useRef(0);
	const apiAppliedSequenceRef = useRef(0);
	const [hydrationError, setHydrationError] = useState(null);
	const [hydrationAttempt, setHydrationAttempt] = useState(0);

	const [noDriverMessage, setNoDriverMessage] = useState(
		() => i18n.t("rideshare.noDriverFallbackDefault"),
	);
	const [cancelledMessage, setCancelledMessage] = useState(
		() => i18n.t("rideshare.rideCancelledDefault"),
	);
	const [showCancelModal, setShowCancelModal] = useState(false);
	const cancelTriggerRef = useRef(null);
	const cancelDialogRef = useRef(null);
	const cancelInitialFocusRef = useRef(null);
	const cancelLoadingRef = useRef(false);
	const [tripId, setTripId] = useState(null);
	const [rideOtp, setRideOtp] = useState(null);
	const [showOtpModal, setShowOtpModal] = useState(false);
	const otpTriggerRef = useRef(null);
	const otpDialogRef = useRef(null);
	const otpInitialFocusRef = useRef(null);
	const [rating, setRating] = React.useState(0);
	const [ratingComment, setRatingComment] = React.useState("");
	const [ratingTags, setRatingTags] = React.useState([]);
	const [rated, setRated] = React.useState(false);
	const [ratingSubmitting, setRatingSubmitting] = React.useState(false);
	const [ratingError, setRatingError] = React.useState(null);
	const [cancelLoading, setCancelLoading] = React.useState(false);
	cancelLoadingRef.current = cancelLoading;
	const [cancelError, setCancelError] = React.useState(null);
	const [tripReceipt, setTripReceipt] = React.useState(null);
	const tripCompletedNotified = useRef(false);
	const [pickupCoords, setPickupCoords] = useState(null);
	const [dropoffCoords, setDropoffCoords] = useState(null);
	const [driverCoords, setDriverCoords] = useState(null);
	const driverCoordsRef = useRef(null);
	const [driverLocationUpdatedAt, setDriverLocationUpdatedAt] = useState(null);
	const driverLocationTimestampMs = useRef(0);
	const [driverArrivedAt, setDriverArrivedAt] = useState(null);
	const driverArrivedAtRef = useRef(null);
	const matchingStartedAt = useRef(Date.now());
	const analyticsKeysRef = useRef(new Set());
	const trackOnce = useCallback((event, metadata = {}, key = `${event}:${requestId ?? "none"}`) => {
		if (SESSION_DEDUPED_RIDE_EVENTS.has(event) && requestId) {
			void deliverRideLifecycleAnalytics(event, requestId, metadata);
			return;
		}
		if (analyticsKeysRef.current.has(key)) return;
		analyticsKeysRef.current.add(key);
		void trackRideEvent(event, metadata);
	}, [requestId]);
	const [socketConnected, setSocketConnected] = useState(true);
	const lastSocketGpsAt = useRef(0);
	const [routeBase, setRouteBase] = useState([]);
	const [routeDriver, setRouteDriver] = useState([]);
	const lastDriverRoutePt = useRef(null);
	const updateDriverLocation = useCallback((latValue, lngValue, explicit) => {
		const lat = Number(latValue);
		const lng = Number(lngValue);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
		const explicitMs = explicit ? new Date(explicit).getTime() : 0;
		const prev = driverCoordsRef.current;
		const moved = !prev || prev[0] !== lat || prev[1] !== lng;
		if (Number.isFinite(explicitMs) && explicitMs > 0) {
			if (explicitMs <= driverLocationTimestampMs.current) return false;
			driverLocationTimestampMs.current = explicitMs;
			setDriverLocationUpdatedAt(explicit);
		} else {
			if (!moved) return false;
			const receivedAt = Math.max(driverLocationTimestampMs.current, Date.now());
			driverLocationTimestampMs.current = receivedAt;
			setDriverLocationUpdatedAt(receivedAt);
		}
		driverCoordsRef.current = [lat, lng];
		setDriverCoords([lat, lng]);
		return true;
	}, []);
	const advanceLifecycle = useCallback((next) => {
		if (!canApplyRideTransition(lifecycleStepRef.current, next)) return false;
		lifecycleStepRef.current = next;
		setTrackingStep(next);
		return true;
	}, []);

	useEffect(() => {
		if (!requestId) return;
		const event = {
			searching: "matching_started", matched: "matched", inride: "ride_started",
			done: "ride_completed", no_driver: "no_driver", cancelled: "cancelled",
		}[trackingStep];
		if (event) trackOnce(event, { ride_request_id: requestId, ...(event === "matching_started" && selectedVehicle ? { vehicle_type: selectedVehicle } : {}) });
	}, [trackingStep, requestId, selectedVehicle, trackOnce]);

	useEffect(() => {
		if (trackingStep !== "searching" || !requestId) return undefined;
		const elapsed = Date.now() - matchingStartedAt.current;
		const timers = [
			["matching_expanded", "expanding", 20_000],
			["matching_delayed", "delayed", 45_000],
		].map(([event, phase, threshold]) => setTimeout(() => {
			trackOnce(event, { ride_request_id: requestId, matching_phase: phase, elapsed_ms: threshold });
		}, Math.max(0, threshold - elapsed)));
		return () => timers.forEach(clearTimeout);
	}, [trackingStep, requestId, trackOnce]);

	useEffect(() => {
		if (driverArrivedAt && requestId) trackOnce("driver_arrived", { ride_request_id: requestId });
	}, [driverArrivedAt, requestId, trackOnce]);

	useEffect(() => {
		let cancelled = false;
		const geocode = async (addr, setter) => {
			if (!addr) { setter(null); return; }
			const fallback = async () => {
				const loc = await geocodeAddressFallback(addr).catch(() => null);
				if (!cancelled) setter(loc ? [loc.lat, loc.lng] : null);
			};
			const maps = await loadGoogleMaps();
			if (!maps?.Geocoder) {
				await fallback();
				return;
			}
			new maps.Geocoder().geocode({ address: addr }, async (results, status) => {
				if (status === 'OK' && results[0]) {
					const loc = results[0].geometry.location;
					if (!cancelled) setter([loc.lat(), loc.lng()]);
				} else {
					await fallback();
				}
			});
		};
		geocode(pickup, setPickupCoords);
		geocode(dropoff, setDropoffCoords);
		return () => { cancelled = true; };
	}, [pickup, dropoff]);

	// Base route: pickup → dropoff (gray dashed guide)
	useEffect(() => {
		if (!pickupCoords || !dropoffCoords) { setRouteBase([]); return; }
		let cancelled = false;
		fetchRouteMeta(pickupCoords, dropoffCoords, (meta) => {
			// Draw any real road route (Google or OSRM); only the straight-line fallback is dropped.
			if (!cancelled) setRouteBase(meta.source === "fallback" ? [] : meta.path);
		});
		return () => { cancelled = true; };
	}, [pickupCoords?.join(), dropoffCoords?.join()]); // eslint-disable-line react-hooks/exhaustive-deps

	// Driver route: driver → active target (recalculates every ~80m of movement)
	useEffect(() => {
		if (!driverCoords || (trackingStep !== "matched" && trackingStep !== "inride")) { setRouteDriver([]); return; }
		const target = trackingStep === "inride" ? dropoffCoords : pickupCoords;
		if (!target) { setRouteDriver([]); return; }
		const prev = lastDriverRoutePt.current;
		if (prev && Math.abs(driverCoords[0] - prev[0]) < 0.0008 && Math.abs(driverCoords[1] - prev[1]) < 0.0008) return;
		lastDriverRoutePt.current = driverCoords;
		let cancelled = false;
		fetchRouteMeta(driverCoords, target, (meta) => {
			if (!cancelled) setRouteDriver(meta.source === "fallback" ? [] : meta.path);
		});
		return () => { cancelled = true; };
	}, [driverCoords, trackingStep, pickupCoords, dropoffCoords]);  

	// Track socket connectivity — faster API poll when disconnected during live trip
	useEffect(() => {
		const s = connectSocket();
		const onConnect = () => setSocketConnected(true);
		const onDisconnect = () => setSocketConnected(false);
		setSocketConnected(s.connected);
		s.on("connect", onConnect);
		s.on("disconnect", onDisconnect);
		return () => {
			s.off("connect", onConnect);
			s.off("disconnect", onDisconnect);
		};
	}, []);

	const etaTargetCoords = useMemo(() => {
		if (trackingStep === "inride") return dropoffCoords;
		if (trackingStep === "matched") return pickupCoords;
		return null;
	}, [trackingStep, pickupCoords, dropoffCoords]);

	const liveEtaDisplay = useMemo(() => {
		if (!driverCoords || !etaTargetCoords) return null;
		return liveEtaLabel(driverCoords, etaTargetCoords);
	}, [driverCoords, etaTargetCoords]);

	const displayEta = liveEtaDisplay ?? matchedDriver?.eta ?? "—";

	useEffect(() => {
		if (!requestId) return;
		const s = connectSocket();
		const eventName = `ride-accepted-${Number(requestId)}`;
		const handler = (data) => {
			if (!advanceLifecycle("matched")) return;
			socketLifecycleEpochRef.current += 1;
			const driver = driverFromSocketPayload(data);
			if (driver) setMatchedDriver((previous) => mergeDriverDetails(previous, driver));
			if (data?.trip_id != null) setTripId(Number(data.trip_id));
			if (data?.otp) setRideOtp(String(data.otp));
			const arrivedAt = data?.driver_arrived_at ?? data?.driverArrivedAt;
			const arrivedMs = arrivedAt ? new Date(arrivedAt).getTime() : 0;
			const currentArrivedMs = driverArrivedAtRef.current ? new Date(driverArrivedAtRef.current).getTime() : 0;
			if (Number.isFinite(arrivedMs) && arrivedMs > currentArrivedMs) {
				driverArrivedAtRef.current = arrivedAt;
				setDriverArrivedAt(arrivedAt);
			}
			setHydrationError(null);
		};
		const resubscribe = () => {
			s.off(eventName, handler);
			s.on(eventName, handler);
		};
		s.on(eventName, handler);
		s.on("connect", resubscribe);
		return () => {
			s.off(eventName, handler);
			s.off("connect", resubscribe);
		};
	}, [requestId, advanceLifecycle]);

	useEffect(() => {
		if (!requestId) return;
		const s = connectSocket();
		const startedEvent = `trip-started-${Number(requestId)}`;
		const completedEvent = `ride-completed-${Number(requestId)}`;
		const onStarted = () => {
			if (!advanceLifecycle("inride")) return;
			socketLifecycleEpochRef.current += 1;
			setShowOtpModal(false);
		};
		const onCompleted = (data) => {
			if (!advanceLifecycle("done")) return;
			socketLifecycleEpochRef.current += 1;
			if (data?.receipt) setTripReceipt(mapRideReceiptFromServer(data.receipt, { pickup, dropoff }));
			setShowOtpModal(false);
			if (!tripCompletedNotified.current) {
				tripCompletedNotified.current = true;
				onTripCompleted?.();
			}
		};
		s.on(startedEvent, onStarted);
		s.on(completedEvent, onCompleted);
		return () => {
			s.off(startedEvent, onStarted);
			s.off(completedEvent, onCompleted);
		};
	}, [requestId, onTripCompleted, advanceLifecycle, pickup, dropoff]);

	// Trip room: live driver GPS (no simulated movement)
	useEffect(() => {
		if (!tripId || trackingStep === "searching" || trackingStep === "done" || trackingStep === "no_driver" || trackingStep === "cancelled") {
			return undefined;
		}
		const tid = Number(tripId);
		joinTripRoom(tid);
		const s = connectSocket();
		const onLocation = (data) => {
			if (data?.trip_id != null && Number(data.trip_id) !== tid) return;
			const lat = Number(data?.lat);
			const lng = Number(data?.lng ?? data?.long);
			const explicit = data?.location_updated_at ?? data?.updated_at ?? data?.updatedAt;
			if (updateDriverLocation(lat, lng, explicit)) lastSocketGpsAt.current = Date.now();
		};
		const onTripEnded = (data) => {
			if (data?.trip_id != null && Number(data.trip_id) !== tid) return;
			driverCoordsRef.current = null;
			setDriverCoords(null);
			leaveTripRoom(tid);
		};
		const resubscribe = () => {
			joinTripRoom(tid);
			s.off("driver-location-updated", onLocation);
			s.off("trip-ended", onTripEnded);
			s.on("driver-location-updated", onLocation);
			s.on("trip-ended", onTripEnded);
		};
		s.on("driver-location-updated", onLocation);
		s.on("trip-ended", onTripEnded);
		s.on("connect", resubscribe);
		return () => {
			s.off("driver-location-updated", onLocation);
			s.off("trip-ended", onTripEnded);
			s.off("connect", resubscribe);
			leaveTripRoom(tid);
		};
	}, [tripId, trackingStep, updateDriverLocation]);

	useEffect(() => {
		if (trackingStep === "done" || trackingStep === "no_driver" || trackingStep === "cancelled" || trackingStep === "searching") {
			driverCoordsRef.current = null;
			setDriverCoords(null);
		}
	}, [trackingStep]);

	useEffect(() => {
		if (!requestId) return;
		const uid = getUser()?.user_id ?? getUser()?.id;
		if (!uid) return;
		const s = connectSocket();
		const handler = (data) => {
			if (data?.ride_request_id != null && Number(data.ride_request_id) !== Number(requestId)) return;
			const next = isSystemNoDriverReason(data?.reason) ? "no_driver" : "cancelled";
			if (!advanceLifecycle(next)) return;
			socketLifecycleEpochRef.current += 1;
			setMatchedDriver(null);
			setShowOtpModal(false);
			setShowCancelModal(false);
			const msg = buildRideCancelledMessage(data);
			if (data?.reason === "cancelled_by_passenger") {
				setCancelledMessage(msg);
			} else if (isSystemNoDriverReason(data?.reason)) {
				setNoDriverMessage(msg);
				onNoDriver?.();
			} else {
				setCancelledMessage(msg);
			}
		};
		s.on(`ride-cancelled-${uid}`, handler);
		return () => s.off(`ride-cancelled-${uid}`, handler);
	}, [requestId, onNoDriver, advanceLifecycle]);

	const applyRideSnapshot = useCallback((ride, serverReceipt, cancellation, ordering) => {
		const snap = rideTrackingSnapshot(ride);
		if (!snap) return;
		if (ordering?.socketEpoch != null && ordering.socketEpoch !== socketLifecycleEpochRef.current) return;
		if (ordering?.requestSequence != null && ordering.requestSequence < apiAppliedSequenceRef.current) return;
		const lifecycleRaw = ride?.status_updated_at ?? ride?.updated_at ?? ride?.statusUpdatedAt;
		const lifecycleMs = lifecycleRaw ? new Date(lifecycleRaw).getTime() : 0;
		if (snap.trackingStep !== lifecycleStepRef.current && Number.isFinite(lifecycleMs) && lifecycleMs > 0 && lifecycleTimestampRef.current > 0 && lifecycleMs <= lifecycleTimestampRef.current) return;
		if (!canApplyRideTransition(lifecycleStepRef.current, snap.trackingStep)) return;
		if (ordering?.requestSequence != null) apiAppliedSequenceRef.current = ordering.requestSequence;
		lifecycleStepRef.current = snap.trackingStep;
		if (Number.isFinite(lifecycleMs) && lifecycleMs > lifecycleTimestampRef.current) lifecycleTimestampRef.current = lifecycleMs;
		if (snap.matchedDriver) {
			setMatchedDriver((previous) => mergeDriverDetails(previous, snap.matchedDriver));
		}
		if (snap.tripId != null) setTripId((prev) => (prev === snap.tripId ? prev : snap.tripId));
		const trip = resolveRideTrip(ride);
		if (ride.pickup_lat != null && ride.pickup_long != null) {
			const pLat = Number(ride.pickup_lat);
			const pLng = Number(ride.pickup_long);
			if (!Number.isNaN(pLat) && !Number.isNaN(pLng)) {
				setPickupCoords((prev) => prev ?? [pLat, pLng]);
			}
		}
		if (ride.drop_lat != null && ride.drop_long != null) {
			const dLat = Number(ride.drop_lat);
			const dLng = Number(ride.drop_long);
			if (!Number.isNaN(dLat) && !Number.isNaN(dLng)) {
				setDropoffCoords((prev) => prev ?? [dLat, dLng]);
			}
		}
		const seedLat = trip?.driver_profile?.current_lat;
		const seedLng = trip?.driver_profile?.current_long;
		if (
			seedLat != null &&
			seedLng != null &&
			!Number.isNaN(Number(seedLat)) &&
			!Number.isNaN(Number(seedLng)) &&
			(snap.trackingStep === "matched" || snap.trackingStep === "inride")
		) {
			const explicit = trip?.driver_profile?.location_updated_at ?? trip?.driver_profile?.updated_at ?? trip?.location_updated_at;
			updateDriverLocation(seedLat, seedLng, explicit);
		}
		if (snap.rideOtp != null) setRideOtp((prev) => (prev === snap.rideOtp ? prev : snap.rideOtp));
		if (snap.driverArrivedAt) {
			const incomingArrivalMs = new Date(snap.driverArrivedAt).getTime();
			const currentArrivalMs = driverArrivedAtRef.current ? new Date(driverArrivedAtRef.current).getTime() : 0;
			if (Number.isFinite(incomingArrivalMs) && incomingArrivalMs > currentArrivalMs) {
				driverArrivedAtRef.current = snap.driverArrivedAt;
				setDriverArrivedAt(snap.driverArrivedAt);
			}
		}
		if (snap.alreadyRated) setRated(true);
		if (snap.trackingStep === "inride" || snap.trackingStep === "done") setShowOtpModal(false);
		if (ride.status === "cancelled" && cancellation?.message) {
			const isNoDriver = cancellation?.is_no_driver ?? isSystemNoDriverReason(ride?.cancellation_reason);
			if (isNoDriver) setNoDriverMessage(cancellation.message);
			else setCancelledMessage(cancellation.message);
		}
		setTrackingStep((prev) => (prev === snap.trackingStep ? prev : snap.trackingStep));
		if (snap.trackingStep === "done") {
			const canonical = serverReceipt ?? ride?.receipt ?? null;
			const incomingReceipt = canonical
				? mapRideReceiptFromServer(canonical, { pickup, dropoff })
				: buildTripReceiptFromRide(ride, requestId, pickup, dropoff);
			setTripReceipt((previous) => {
				if (!previous) return incomingReceipt;
				if (!canonical) return previous;
				return Object.fromEntries(Object.entries({ ...previous, ...incomingReceipt }).map(([key, value]) => [key, value ?? previous[key]]));
			});
			if (!tripCompletedNotified.current) {
				tripCompletedNotified.current = true;
				onTripCompleted?.();
			}
		}
		if (snap.trackingStep === "no_driver") {
			onNoDriver?.();
		}
	}, [onTripCompleted, onNoDriver, requestId, pickup, dropoff, updateDriverLocation]);

	const submitRating = async () => {
		if (!tripId || rating < 1 || ratingSubmitting) return;
		setRatingSubmitting(true);
		setRatingError(null);
		try {
			const review = [...ratingTags, ratingComment.trim()].filter(Boolean).join(" · ");
			await rateRide({
				trip_id: tripId,
				rating,
				...(review ? { review } : {}),
			});
			setRated(true);
			trackOnce("rating_submitted", { ride_request_id: requestId });
		} catch (err) {
			const msg =
				err?.response?.data?.message ??
				err?.response?.data?.error ??
				err?.message ??
				"Could not submit rating. Please try again.";
			if (/already submitted/i.test(msg)) {
				setRated(true);
			} else {
				setRatingError(msg);
			}
		} finally {
			setRatingSubmitting(false);
		}
	};

	// Re-hydrate from API on mount (e.g. returning from Messages after accept/start)
	useEffect(() => {
		if (!requestId) return;
		let cancelled = false;
		(async () => {
			const ordering = { socketEpoch: socketLifecycleEpochRef.current, requestSequence: ++apiRequestSequenceRef.current };
			try {
				const raw = await getRideRequest(requestId);
				const { ride, receipt, cancellation } = parseRideRequestResponse(raw);
				if (!cancelled && ride) applyRideSnapshot(ride, receipt, cancellation, ordering);
			} catch { if (!cancelled && lifecycleStepRef.current === "hydrating") { setHydrationError("Could not load trip details."); lifecycleStepRef.current = "hydration_error"; setTrackingStep("hydration_error"); } }
		})();
		return () => { cancelled = true; };
	}, [requestId, applyRideSnapshot, hydrationAttempt]);

	// Poll fallback for trip state + driver GPS (faster when socket disconnected)
	useEffect(() => {
		if (!requestId || showOtpModal || showCancelModal || trackingStep === "hydrating" || trackingStep === "hydration_error" || trackingStep === "no_driver" || trackingStep === "cancelled") return;
		const liveTracking = trackingStep === "matched" || trackingStep === "inride";
		const staleSocketGps =
			liveTracking &&
			lastSocketGpsAt.current > 0 &&
			Date.now() - lastSocketGpsAt.current > 12000;
		const needsFastPoll = liveTracking && (!socketConnected || staleSocketGps);
		let cancelled = false;
		const poll = async () => {
			const ordering = { socketEpoch: socketLifecycleEpochRef.current, requestSequence: ++apiRequestSequenceRef.current };
			try {
				const raw = await getRideRequest(requestId);
				const { ride, receipt, cancellation } = parseRideRequestResponse(raw);
				if (cancelled || !ride) return;
				applyRideSnapshot(ride, receipt, cancellation, ordering);
			} catch { /* best-effort */ }
		};
		poll();
		const pollMs = needsFastPoll ? 3000 : liveTracking ? 6000 : 4000;
		const pollId = setInterval(poll, pollMs);
		return () => {
			cancelled = true;
			clearInterval(pollId);
		};
	}, [requestId, showOtpModal, showCancelModal, trackingStep, applyRideSnapshot, socketConnected]);

	// Lock page scroll while OTP / cancel overlay is open
	useEffect(() => {
		if (!showOtpModal && !showCancelModal) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = prev; };
	}, [showOtpModal, showCancelModal]);

	const stepLabel = {
		searching: t("rideshare.trackingSearching"),
		matched:   t("rideshare.trackingMatched", { name: matchedDriver?.name ?? t("rideshare.yourDriverDefault") }),
		inride:    t("rideshare.trackingInRide"),
		done:      t("rideshare.trackingDone"),
		no_driver: t("rideshare.trackingNoDriver"),
		cancelled: t("rideshare.trackingCancelled", { defaultValue: "Ride cancelled" }),
	}[trackingStep];

	const stepColor = {
		searching: "#2563eb",
		matched:   "#059669",
		inride:    "#2563eb",
		done:      "#059669",
		no_driver: "#ef4444",
		cancelled: "#f59e0b",
	}[trackingStep];

	const canLeaveToBooking = trackingStep === "done" || trackingStep === "no_driver" || trackingStep === "cancelled";
	const canCancelRide = trackingStep === "searching" || trackingStep === "matched";
	const openCancelModal = (event) => {
		cancelTriggerRef.current = event?.currentTarget ?? null;
		setCancelError(null);
		setShowCancelModal(true);
	};
	const dismissCancelModal = () => {
		setShowCancelModal(false);
		setCancelError(null);
		queueMicrotask(() => cancelTriggerRef.current?.focus());
	};
	const openOtpModal = (event) => {
		otpTriggerRef.current = event?.currentTarget ?? null;
		setShowOtpModal(true);
	};
	const dismissOtpModal = () => {
		setShowOtpModal(false);
		queueMicrotask(() => otpTriggerRef.current?.focus());
	};

	useEffect(() => {
		if (!showCancelModal) return undefined;
		const onKeyDown = (event) => {
			if (event.key === "Escape" && !cancelLoadingRef.current) {
				event.preventDefault();
				dismissCancelModal();
				return;
			}
			if (event.key !== "Tab") return;
			const controls = [...(cancelDialogRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
			if (!controls.length) {
				event.preventDefault();
				cancelDialogRef.current?.focus();
				return;
			}
			const first = controls[0];
			const last = controls[controls.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [showCancelModal]);

	useEffect(() => {
		if (!showCancelModal) return;
		if (cancelLoading) cancelDialogRef.current?.focus();
		else cancelInitialFocusRef.current?.focus();
	}, [showCancelModal, cancelLoading]);

	useEffect(() => {
		if (!showOtpModal) return undefined;
		otpInitialFocusRef.current?.focus();
		const onKeyDown = (event) => {
			if (event.key === "Escape") { event.preventDefault(); dismissOtpModal(); return; }
			if (event.key !== "Tab") return;
			const controls = [...(otpDialogRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
			if (!controls.length) return;
			const first = controls[0];
			const last = controls[controls.length - 1];
			if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
				event.preventDefault();
				(event.shiftKey ? last : first).focus();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [showOtpModal]);

	const confirmCancelRide = async () => {
		if (!requestId || cancelLoading) return;
		setCancelLoading(true);
		setCancelError(null);
		try {
			const res = await cancelRide(requestId);
			if (!advanceLifecycle("cancelled")) return;
			setCancelledMessage(res?.message ?? buildRideCancelledMessage({
				reason: "cancelled_by_passenger",
				refund: res?.refund?.refunded,
				refund_amount: res?.refund?.amount,
				cancel_fee: res?.refund?.cancel_fee,
				paid_amount: res?.refund?.paid_amount,
			}));
			setMatchedDriver(null);
			setShowOtpModal(false);
			setShowCancelModal(false);
		} catch (err) {
			setCancelError(err?.response?.data?.message ?? "Could not cancel ride. Please try again.");
		} finally {
			setCancelLoading(false);
		}
	};

	const changeRide = async () => {
		if (!requestId || cancelLoading || trackingStep !== "searching") return;
		setCancelLoading(true);
		setCancelError(null);
		try {
			await cancelRide(requestId);
			if (!advanceLifecycle("cancelled")) return;
			clearRideshareSession();
			onBack?.();
		} catch (err) {
			setCancelError(err?.response?.data?.message ?? "Could not change this ride. Please try again.");
		} finally {
			setCancelLoading(false);
		}
	};

	const lifecyclePanel = trackingStep === "searching" ? (
		<RideMatchingPanel
			startedAt={matchingStartedAt.current}
			onContinue={() => setCancelError(null)}
			onChangeRide={changeRide}
			onCancel={openCancelModal}
			busy={cancelLoading}
			error={cancelError}
		/>
	) : trackingStep === "matched" || trackingStep === "inride" ? (
		<RidePickupPanel
			driverName={matchedDriver?.name}
			driverRating={matchedDriver?.rating}
			vehicleModel={matchedDriver?.vehicle}
			vehiclePlate={matchedDriver?.plate}
			etaLabel={displayEta}
			locationUpdatedAt={driverLocationUpdatedAt}
			arrived={Boolean(driverArrivedAt)}
			stage={trackingStep === "matched" ? "accepted" : "ongoing"}
			rideOtp={rideOtp}
			onShowOtp={openOtpModal}
			onMessage={requestId ? () => openContextChat("rideshare", requestId).catch(() => {}) : undefined}
		/>
	) : trackingStep === "hydrating" ? <p role="status">Loading trip details…</p>
	: trackingStep === "hydration_error" ? <div role="alert"><p>{hydrationError}</p><button type="button" onClick={() => { lifecycleStepRef.current = "hydrating"; setTrackingStep("hydrating"); setHydrationAttempt((value) => value + 1); }}>Retry</button></div>
	: trackingStep === "done" ? (
		<RideCompletionPanel
			receipt={tripReceipt}
			rating={rating}
			onRatingChange={setRating}
			selectedTags={ratingTags}
			onToggleTag={(tag) => setRatingTags((tags) => tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag])}
			comment={ratingComment}
			onCommentChange={setRatingComment}
			submitting={ratingSubmitting}
			error={ratingError}
			rated={rated}
			onSubmit={submitRating}
			onRebook={() => { trackOnce("book_again", { ride_request_id: requestId }); clearRideshareSession(); onBack?.(); }}
			onReport={typeof onNavigate === "function" ? () => onNavigate("help") : undefined}
			onViewHistory={typeof onNavigate === "function" ? () => onNavigate("orders") : undefined}
		/>
	) : null;

	const cancelRidePanel = canCancelRide ? (
		<div style={{ marginBottom: 12 }}>
			<button
				type="button"
				onClick={openCancelModal}
				disabled={cancelLoading}
				style={{
					width: "100%",
					minHeight: 44,
					padding: "10px 0",
					background: "rgba(239,68,68,0.12)",
					border: "1px solid rgba(239,68,68,0.35)",
					borderRadius: 10,
					color: "#f87171",
					fontFamily: "'DM Sans', sans-serif",
					fontWeight: 700,
					fontSize: 13,
					cursor: cancelLoading ? "wait" : "pointer",
					opacity: cancelLoading ? 0.7 : 1,
				}}
			>
				{cancelLoading ? "Cancelling…" : "Cancel Ride"}
			</button>
			{cancelError && !showCancelModal && (
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#f87171", marginTop: 8, lineHeight: 1.45 }}>
					{cancelError}
				</p>
			)}
		</div>
	) : null;

	const noDriverCard = trackingStep === "no_driver" ? (
		<div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 14, padding: "16px", textAlign: "center", animation: "fadeUp 0.3s ease both" }}>
			<div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ef444420", border: "1.5px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
				<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
			</div>
			<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#f87171", letterSpacing: "0.04em", marginBottom: 6 }}>{i18n.t("rideshare.noDriverAvailable")}</p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 14, lineHeight: 1.45 }}>{noDriverMessage}</p>
			<button onClick={onBack} style={{ width: "100%", minHeight: 44, padding: "10px 0", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{i18n.t("rideshare.tryAgain")}</button>
		</div>
	) : null;

	const cancelledCard = trackingStep === "cancelled" ? (
		<div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 14, padding: "16px", textAlign: "center", animation: "fadeUp 0.3s ease both" }}>
			<div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f59e0b20", border: "1.5px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
				<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
			</div>
			<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fbbf24", letterSpacing: "0.04em", marginBottom: 6 }}>{i18n.t("rideshare.rideCancelledTitle")}</p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 14, lineHeight: 1.45 }}>{cancelledMessage}</p>
			<button onClick={onBack} style={{ width: "100%", minHeight: 44, padding: "10px 0", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Book Again</button>
		</div>
	) : null;

	const cancelConfirmCopy = trackingStep === "matched"
		? {
			title: "Cancel this ride?",
			body: "A driver has already accepted. A 30% cancellation fee applies and you'll receive a 70% refund to your wallet or card.",
		}
		: {
			title: "Cancel this ride?",
			body: "You'll receive a full refund if you've already paid.",
		};

	const cancelModal = showCancelModal && typeof document !== "undefined"
		? createPortal(
			<div
				role="dialog"
				ref={cancelDialogRef}
				tabIndex={-1}
				aria-modal="true"
				aria-labelledby="cancel-ride-title"
				style={{
					position: "fixed",
					inset: 0,
					background: "rgba(0,0,0,0.72)",
					zIndex: 100000,
					display: "flex",
					alignItems: isMobile ? "flex-end" : "center",
					justifyContent: "center",
					padding: isMobile ? "0 0 0 0" : 20,
					isolation: "isolate",
				}}
				onMouseDown={() => !cancelLoading && dismissCancelModal()}
			>
				<div
					className="bg-surface"
					style={{
						border: "1px solid rgba(239,68,68,0.25)",
						borderRadius: isMobile ? "20px 20px 0 0" : 20,
						padding: isMobile ? "22px 20px 28px" : 28,
						width: "100%",
						maxWidth: 400,
						boxShadow: "0 24px 64px var(--color-shadow)",
						animation: "fadeUp 0.2s ease both",
					}}
					onMouseDown={(e) => e.stopPropagation()}
				>
					{isMobile && (
						<div className="bg-border" style={{ width: 36, height: 4, borderRadius: 2, margin: "0 auto 16px" }} />
					)}
					<h3 id="cancel-ride-title" className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>
						{cancelConfirmCopy.title}
					</h3>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: cancelError ? 10 : 20, lineHeight: 1.5 }}>
						{cancelConfirmCopy.body}
					</p>
					{cancelError && (
						<p role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 16, lineHeight: 1.45 }}>{cancelError}</p>
					)}
					<div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10 }}>
						<button
							ref={cancelInitialFocusRef}
							type="button"
							onClick={dismissCancelModal}
							disabled={cancelLoading}
							className="bg-surface-raised border border-border text-text-primary"
							style={{ flex: 1, minHeight: 44, padding: "12px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: cancelLoading ? "default" : "pointer" }}
						>
							Keep Ride
						</button>
						<button
							type="button"
							onClick={confirmCancelRide}
							disabled={cancelLoading}
							style={{ flex: 1, minHeight: 44, padding: "12px 0", background: cancelLoading ? "rgba(239,68,68,0.5)" : "#dc2626", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: cancelLoading ? "wait" : "pointer" }}
						>
							{cancelLoading ? "Cancelling…" : "Yes, Cancel Ride"}
						</button>
					</div>
				</div>
			</div>,
			document.body,
		)
		: null;

	const showTripCode = rideOtp && (trackingStep === "matched" || trackingStep === "inride");
	const otpModal = showOtpModal && rideOtp && showTripCode ? (
		<div ref={otpDialogRef} role="dialog" aria-modal="true" aria-labelledby="trip-code-title" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 45, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 20, pointerEvents: "auto" }} onClick={dismissOtpModal}>
			<div className="bg-surface" style={{ border: "1px solid rgba(245,158,11,0.3)", borderRadius: 16, padding: "20px 22px", width: "100%", maxWidth: 340, marginBottom: 8, boxShadow: "0 12px 40px var(--color-shadow)", animation: "fadeUp 0.2s ease both" }} onClick={(e) => e.stopPropagation()}>
				<p id="trip-code-title" className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{i18n.t("rideshare.tripVerificationCode")}</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>
					Your driver uses this code to start the trip. You usually don&apos;t need to share it — it&apos;s shown on their dashboard.
				</p>
				<div style={{ letterSpacing: "0.3em", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, color: "#fbbf24", marginBottom: 12 }}>{rideOtp}</div>
				<button ref={otpInitialFocusRef} type="button" onClick={dismissOtpModal} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", minHeight: 44, padding: "9px 0", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{i18n.t("common.close")}</button>
			</div>
		</div>
	) : null;

	// Memoized so markers aren't handed a brand-new icon object on every render
	// (these are static and were being reallocated each GPS ping).
	const blueIcon = useMemo(() => L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 0 10px #2563eb80"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), []);
	const greenIcon = useMemo(() => L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#059669;border:2.5px solid #fff;box-shadow:0 0 10px #05966980"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), []);
	const driverIcon = useMemo(() => L.divIcon({ className: '', html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))">${CAR_SVG("#f59e0b")}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }), []);

	const mapCenter = driverCoords ?? (pickupCoords && dropoffCoords
		? [(pickupCoords[0] + dropoffCoords[0]) / 2, (pickupCoords[1] + dropoffCoords[1]) / 2]
		: pickupCoords ?? [40.7128, -74.006]);

	// A plain element, NOT a nested component. Rendering it as <MapTiles /> created
	// a new component *type* every render, so React unmounted + remounted the whole
	// Leaflet subtree (tile layer, polylines, markers) on each GPS ping (~1/sec
	// during a trip) — re-downloading tiles and churning the DOM until the mobile
	// tab ran out of memory and crashed (#365). As an element, these children
	// reconcile in place and only their changed props update.
	const mapTiles = (
		<>
			<TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
			{routeBase.length > 1 && <Polyline positions={routeBase} pathOptions={{ color: "rgba(255,255,255,0.18)", weight: 3, dashArray: "6 10" }} />}
			{routeDriver.length > 1 && <Polyline positions={routeDriver} pathOptions={{ color: "#f59e0b", weight: 4, opacity: 0.9 }} />}
			{pickupCoords && <Marker position={pickupCoords} icon={blueIcon} />}
			{dropoffCoords && <Marker position={dropoffCoords} icon={greenIcon} />}
			{driverCoords && (trackingStep === "matched" || trackingStep === "inride") && (
				<SmoothMarker position={driverCoords} icon={driverIcon} rotate durationMs={900} />
			)}
			<FitBounds points={[driverCoords, pickupCoords, dropoffCoords]} />
		</>
	);

	// ── Mobile: full-screen map + bottom sheet panel ──
	if (isMobile) {
		return (
			<>
			<div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0, width: "100%", isolation: "isolate", animation: "fadeUp 0.3s ease both" }}>

				{/* Map — full screen (z-index below trip panel) */}
				<div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 1 }}>
					<MapContainer center={mapCenter} zoom={13} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
						{mapTiles}
					</MapContainer>
					{/* Status badge — floats directly on the Leaflet tile layer, which renders CARTO's
					    "dark_all" tiles regardless of app theme, so this chrome stays a fixed dark
					    pill (like Hub.jsx's hero-photo scrim) rather than following the theme. */}
					<div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(8,10,20,0.85)", backdropFilter: "blur(12px)", border: `1px solid ${stepColor}40`, borderRadius: 24, padding: "8px 20px", display: "flex", alignItems: "center", gap: 8, zIndex: 1000 }}>
						{trackingStep === "searching"
							? <div style={{ width: 10, height: 10, borderRadius: "50%", background: stepColor, animation: "pulse 1s infinite" }} />
							: <div style={{ width: 8, height: 8, borderRadius: "50%", background: stepColor }} />
						}
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#fff" }}>{stepLabel}</span>
					</div>
				</div>

				{/* Back — floats on the map like the status badge above, same fixed-dark reasoning.
				    Only while searching or after trip ends (not during active ride). */}
				{canLeaveToBooking && <button onClick={onBack} style={{ position: "absolute", top: 16, left: 16, zIndex: 1001, minHeight: 44, minWidth: 44, background: "rgba(8,10,20,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, color: "rgba(255,255,255,0.8)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: "8px 14px" }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("common.back")}
				</button>}

				{/* Bottom sheet panel — above Leaflet panes (400–1000). Unlike the map-overlay chrome
				    above, this hosts the (themed) RideMatchingPanel/RidePickupPanel/RideCompletionPanel,
				    so it follows the theme too via --color-surface-glass (translucent + backdrop-blur,
				    same role as the sidebar rail / floating buttons). */}
				<div className="bg-surface-glass" style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 1000, backdropFilter: "blur(20px)", borderTop: "1px solid var(--color-border)", borderRadius: "20px 20px 0 0", padding: "12px 20px 36px", maxHeight: "52%", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
					{/* Drag handle */}
					<div className="bg-border" style={{ width: 36, height: 4, borderRadius: 2, margin: "0 auto 16px" }} />

					{/* Trip summary — active ride only; receipt replaces this when done */}
					{["searching", "matched", "inride"].includes(trackingStep) && (
					<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>{i18n.t("rideshare.yourTrip")}</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
								<div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", flexShrink: 0, marginTop: 3 }} />
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{pickup || "Current location"}</span>
							</div>
							<div className="bg-border" style={{ marginLeft: 3, width: 2, height: 12 }} />
							<div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
								<div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", flexShrink: 0, marginTop: 3 }} />
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{dropoff || "Destination"}</span>
							</div>
						</div>
					</div>
					)}

					{lifecyclePanel}

					{trackingStep !== "searching" && cancelRidePanel}

					{noDriverCard}
					{cancelledCard}
				</div>
			</div>
			{otpModal}
			{cancelModal}
			</>
		);
	}

	// ── Desktop/Tablet: side-by-side layout ──
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", animation: "fadeUp 0.3s ease both" }}>
			<div style={{ flex: 1, display: "flex", gap: 24, paddingLeft: 128, paddingRight: 48, paddingTop: 28, paddingBottom: 24, overflow: "hidden" }}>
				{/* Map */}
				<div style={{ flex: 1, borderRadius: 20, overflow: "hidden", position: "relative", minHeight: 400 }}>
					<MapContainer center={mapCenter} zoom={13} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
						{mapTiles}
					</MapContainer>
					{/* Status overlay */}
					<div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(8,10,20,0.85)", backdropFilter: "blur(12px)", border: `1px solid ${stepColor}40`, borderRadius: 24, padding: "8px 20px", display: "flex", alignItems: "center", gap: 8, zIndex: 1000 }}>
						{trackingStep === "searching"
							? <div style={{ width: 10, height: 10, borderRadius: "50%", background: stepColor, animation: "pulse 1s infinite" }} />
							: <div style={{ width: 8, height: 8, borderRadius: "50%", background: stepColor }} />
						}
						<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#fff" }}>{stepLabel}</span>
					</div>
				</div>

				{/* Right panel — a normal side column beside the map (not overlaid on it), so unlike
				    the map-canvas status badge/back-button above, this follows the theme. */}
				<div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", maxHeight: "100%" }}>
					{canLeaveToBooking && (
						<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0, alignSelf: "flex-start" }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							{i18n.t("common.back")}
						</button>
					)}
					{["searching", "matched", "inride"].includes(trackingStep) && (
					<div className="bg-surface border border-border-subtle" style={{ borderRadius: 16, padding: "18px 20px" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>{i18n.t("rideshare.yourTrip")}</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
							<div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
								<div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", flexShrink: 0, marginTop: 4 }} />
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{pickup || "Current location"}</span>
							</div>
							<div className="bg-border" style={{ marginLeft: 3, width: 2, height: 14 }} />
							<div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
								<div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", flexShrink: 0, marginTop: 4 }} />
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{dropoff || "Destination"}</span>
							</div>
						</div>
					</div>
					)}
					{lifecyclePanel}
					{trackingStep !== "searching" && cancelRidePanel}
					{noDriverCard}
					{cancelledCard}
				</div>
			</div>
			{otpModal}
			{cancelModal}
		</div>
	);
}

function RidesharePaymentView({ pickup, dropoff, stops = [], selectedType, priceMode, userPrice, fareEstimate, routeMeta, referralCode, timing, scheduleDate, scheduleTime, scheduleValidation, onBack, onConfirm, onRouteMetaChange }) {
	const { t } = usePageI18n("rideshare");
	const { isMobile } = useViewport();
	const rideVehicleTypes = React.useMemo(() => getRideVehicleTypes(t), [t]);
	const bookingIdempotencyKey = React.useRef(
		typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: `bk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	const paypalHoldRideId = React.useRef(null);
	const paymentHoldRideId = React.useRef(null);
	const vt = rideVehicleTypes.find(v => v.id === selectedType);
	const currentScheduleValidation = useRideScheduleValidation(timing, scheduleDate, scheduleTime);
	const validatedSchedule = scheduleValidation?.valid === false ? scheduleValidation : currentScheduleValidation;
	const scheduleError = rideScheduleError(validatedSchedule);
	const customOffer = validateCustomRideOffer(userPrice);
	const customOfferNumber = customOffer.amount;
	const customOfferValid = customOffer.valid;
	const standardFareNumber = Number(fareEstimate?.total);
	const standardFareValid = fareEstimate?.total != null && Number.isFinite(standardFareNumber) && standardFareNumber > 0;
	const canonicalAmount = priceMode === "setprice"
		? (customOfferValid ? customOfferNumber : NaN)
		: (standardFareValid ? Math.round((standardFareNumber + Number.EPSILON) * 100) / 100 : NaN);
	const amountValid = Number.isFinite(canonicalAmount)
		&& canonicalAmount >= (priceMode === "setprice" ? 1 : 0.5);
	const total = amountValid ? canonicalAmount.toFixed(2) : null;
	const cleanedStops = stops.filter((stop) => String(stop?.address || "").trim());

	const buildRideHoldPayload = (freshSchedule, quoteIdOverride) => ({
		pickup_address: pickup,
		drop_address: dropoff,
		vehicle_type: selectedType,
		offered_price: priceMode === "setprice" && amountValid ? canonicalAmount : undefined,
		estimated_fare: amountValid ? canonicalAmount : undefined,
		quote_id: priceMode === "setprice" ? undefined : (quoteIdOverride ?? fareEstimate?.quote_id),
		stops: cleanedStops.map((stop, index) => ({ ...stop, sequence: index + 1 })),
		scheduled_at: freshSchedule.scheduledAt ?? undefined,
		referral_code: referralCode || undefined,
		await_payment: true,
	});

	const extractRideId = (data) =>
		data?.data?.ride_request_id ?? data?.ride_request_id ?? data?.id ?? data?.request_id ?? null;

	// "Lock the price, disclose the change": if the fare drifted since the estimate was shown,
	// the server returns 409 quote_expired with a fresh quote instead of silently booking a
	// different number. Ask the rider to confirm the new price, then retry once with it.
	const [priceChange, setPriceChange] = useState(null);
	const requestFreshQuoteConfirm = (oldAmount, newAmount) =>
		new Promise((resolve) => setPriceChange({ oldAmount, newAmount, resolve }));

	const createPaymentHold = async (quoteIdOverride) => {
		try {
			if (paymentHoldRideId.current) return paymentHoldRideId.current;
			const freshSchedule = validateRideSchedule({ timing, scheduleDate, scheduleTime });
			if (!freshSchedule.valid) throw new Error(rideScheduleError(freshSchedule));
			const availRes = await getDriverAvailability();
			const avail = availRes?.data ?? availRes;
			if (!avail?.available) {
				throw new Error(avail?.message ?? NO_DRIVER_MSG);
			}
			const data = await createRideRequest(buildRideHoldPayload(freshSchedule, quoteIdOverride));
			const rideId = extractRideId(data);
			if (!rideId) throw new Error("Could not create ride before payment.");
			paymentHoldRideId.current = rideId;
			return rideId;
		} catch (err) {
			if (priceMode !== "setprice" && err?.response?.status === 409 && err?.response?.data?.error === "quote_expired") {
				const fresh = err.response.data.fresh_quote;
				const proceed = await requestFreshQuoteConfirm(canonicalAmount, fresh?.amount);
				if (proceed && fresh?.quote_id) return createPaymentHold(fresh.quote_id);
				throw new Error("Booking cancelled — the price changed.");
			}
			const noDriver = parseNoDriverApiError(err);
			if (noDriver) throw new Error(noDriver);
			const msg = err?.response?.data?.message ?? err?.message;
			if (err?.response?.status === 409) {
				throw new Error(msg || "You already have a ride in progress.");
			}
			throw err;
		}
	};

	const finishPaidBooking = async (rideId, paymentBody) => {
		await confirmRidePayment(rideId, { ...paymentBody, amount: canonicalAmount });
		onConfirm(rideId);
	};
	// Set-your-own-price is all-inclusive (no extra service fee on top — per product spec)
	const tripFare = fareEstimate?.trip_fare != null
		? parseFloat(fareEstimate.trip_fare)
		: (fareEstimate?.base_fare != null ? parseFloat(fareEstimate.base_fare) : null);
	const serviceFee = priceMode === "setprice"
		? 0
		: (fareEstimate?.service_fee != null ? parseFloat(fareEstimate.service_fee) : null);
	const priceInvalid = priceMode === "setprice"
		? !customOfferValid || !amountValid
		: !amountValid;
	const [payMethod, setPayMethod] = useState("card");
	const [payRsError, setPayRsError] = useState(null);
	const [isConfirming, setIsConfirming] = useState(false);
	const [walletBalance, setWalletBalance] = useState(null);
	const [driversAvailable, setDriversAvailable] = useState(null);
	const [driverAvailMsg, setDriverAvailMsg] = useState(null);
	const stripe = useStripe();
	const elements = useElements();

	useEffect(() => {
		getWalletBalance().then(d => {
			setWalletBalance(d?.balance != null ? parseFloat(d.balance) : 0);
		}).catch(() => setWalletBalance(0));
	}, []);

	useEffect(() => {
		let cancelled = false;
		const checkDrivers = async () => {
			try {
				const res = await getDriverAvailability();
				const data = res?.data ?? res;
				if (cancelled) return;
				setDriversAvailable(!!data?.available);
				setDriverAvailMsg(data?.message ?? null);
			} catch {
				if (!cancelled) {
					setDriversAvailable(false);
					setDriverAvailMsg("Could not verify driver availability. Please try again in a moment.");
				}
			}
		};
		checkDrivers();
		const pollId = setInterval(checkDrivers, 15000);
		return () => {
			cancelled = true;
			clearInterval(pollId);
		};
	}, []);

	const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--color-border-subtle)" };
	const labelS = { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-secondary)" };
	const valS = { fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" };
	// Show ETA/distance from any real route provider (Google or OSRM) — not just Google.
	const [distUnit] = useDistanceUnit();
	const routeDistanceKm = cleanedStops.length && fareEstimate?.dist_km != null ? fareEstimate.dist_km : routeMeta?.distanceKm;
	const routeDurationMin = cleanedStops.length && fareEstimate?.duration_min != null ? fareEstimate.duration_min : routeMeta?.durationMin;
	const hasRouteStats = (
		(cleanedStops.length && fareEstimate?.route_source) ||
		(routeMeta?.source && routeMeta.source !== "fallback")
	) && (routeDistanceKm != null || routeDurationMin != null);
	const timingLabel = timing === "schedule" && validatedSchedule.valid && validatedSchedule.scheduledAt
		? new Date(validatedSchedule.scheduledAt).toLocaleString()
		: timing === "schedule" ? "Scheduled time unavailable" : "Ride now";

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: isMobile ? "hidden" : "auto", minHeight: 0, position: isMobile ? "relative" : "static" }}>
			{isMobile && (
				<div style={{ position: "absolute", inset: 0, zIndex: 1, isolation: "isolate" }}>
					<NearbyDriversMap userLocation={null} pickup={pickup} dropoff={dropoff} fill onRouteMetaChange={onRouteMetaChange} />
				</div>
			)}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, ...(isMobile ? { position: "absolute", bottom: 0, left: 0, right: 0, top: "40%", zIndex: 2, transform: "translateZ(0)", background: "var(--color-bg)", borderRadius: "22px 22px 0 0", boxShadow: "0 -10px 40px var(--color-shadow)", borderTop: "1px solid var(--color-border-subtle)", overflowY: "auto", WebkitOverflowScrolling: "touch" } : {}) }}>
				{isMobile && <div className="bg-border" style={{ width: 42, height: 4, borderRadius: 2, margin: "10px auto 6px" }} />}
				<div style={{ padding: "28px 0 40px", animation: "fadeUp 0.3s ease both", maxWidth: 720, margin: "0 auto", width: "100%" }}>
					<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 14, padding: 0 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						{i18n.t("common.back")}
					</button>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px, 3vw, 36px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4, textAlign: "center" }}>Review &amp; Pay</h1>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 24, textAlign: "center" }}>{i18n.t("rideshare.confirmBeforeDriver")}</p>

					{scheduleError && <p role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginBottom: 16 }}>{scheduleError}</p>}
					{driversAvailable === false && (
						<div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#f87171", marginBottom: 4 }}>{i18n.t("rideshare.noDriversOnline")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, lineHeight: 1.45 }}>
								{driverAvailMsg ?? NO_DRIVER_MSG}
							</p>
						</div>
					)}

					{/* Ride summary */}
					<section aria-label="Route summary" className="bg-surface border border-border" style={{ borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Route summary</p>
						<div style={rowStyle}>
							<span style={labelS}>{i18n.t("rideshare.from")}</span>
							<span style={{ ...valS, maxWidth: 240, textAlign: "right", wordBreak: "break-word" }}>{pickup}</span>
						</div>
						<div style={rowStyle}>
							<span style={labelS}>{t("rideshare.to")}</span>
							<span style={{ ...valS, maxWidth: 240, textAlign: "right", wordBreak: "break-word" }}>{dropoff}</span>
						</div>
						{cleanedStops.map((stop, index) => (
							<div key={stop.sequence ?? index} style={rowStyle}>
								<span style={labelS}>Stop {index + 1}</span>
								<span style={{ ...valS, maxWidth: 240, textAlign: "right", wordBreak: "break-word" }}>{stop.address}</span>
							</div>
						))}
						{hasRouteStats && routeDistanceKm != null && (
							<div style={{ ...rowStyle, borderBottom: routeDurationMin != null ? rowStyle.borderBottom : "none" }}>
								<span style={labelS}>{i18n.t("rideshare.distance")}</span>
								<span style={valS}>{formatDistance(routeDistanceKm, distUnit)}</span>
							</div>
						)}
						{hasRouteStats && routeDurationMin != null && (
							<div style={{ ...rowStyle, borderBottom: "none" }}>
								<span style={labelS}>{i18n.t("rideshare.eta")}</span>
								<span style={valS}>{formatDuration(routeDurationMin)}</span>
							</div>
						)}
					</section>

					<section aria-label="Ride and authorization" className="bg-surface border border-border" style={{ borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Ride and authorization</p>
						<div style={rowStyle}><span style={labelS}>Vehicle class</span><span style={valS}>{vt?.label ?? selectedType}</span></div>
						<div style={{ ...rowStyle, borderBottom: "none" }}><span style={labelS}>Amount authorized</span><span style={valS}>{total ? `$${total}` : "Unavailable"}</span></div>
					</section>

					<section aria-label="Timing summary" className="bg-surface border border-border" style={{ borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
						<p style={{ ...labelS, margin: 0 }}>Timing</p><p style={{ ...valS, margin: "6px 0 0" }}>{timingLabel}</p>
					</section>

					{/* Price breakdown */}
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>{i18n.t("rideshare.priceBreakdown")}</p>
						<div style={rowStyle}>
							<span style={labelS}>{priceMode === "setprice" ? t("rideshare.yourOfferAllInclusive") : t("rideshare.tripFare")}</span>
							<span style={valS}>{total ? `$${priceMode === "setprice" ? total : (Number.isFinite(tripFare) ? tripFare.toFixed(2) : total)}` : "Unavailable"}</span>
						</div>
						{priceMode !== "setprice" && serviceFee != null && (
						<div style={rowStyle}>
							<span style={labelS}>{i18n.t("rideshare.serviceFee")}</span>
							<span style={valS}>${parseFloat(serviceFee).toFixed(2)}</span>
						</div>
						)}
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700 }}>{i18n.t("rideshare.total")}</span>
							<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, color: "#60a5fa" }}>{total ? `$${total}` : "Unavailable"}</span>
						</div>
					</div>

					{/* Payment method */}
					<fieldset style={{ margin: "0 0 28px", padding: 0, border: 0 }}>
						<legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Payment method</legend>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{i18n.t("rideshare.paymentMethod")}</p>
						{[
							{ id: "card",   label: t("rideshare.payCreditCard"), sub: t("rideshare.payCardSub"),  icon: "💳" },
							{ id: "wallet", label: t("rideshare.payStrugWallet"), sub: walletBalance != null ? t("rideshare.payWalletBalance", { amount: walletBalance.toFixed(2) }) : t("rideshare.payWalletLoading"), icon: "👝" },
							// PayPal hidden for rideshare until server-side capture verification exists
							// (backend rejects rideshare PayPal at create-order). Card + wallet only.
						].map(m => (
							<label key={m.id}
								style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", background: payMethod === m.id ? "rgba(37,99,235,0.1)" : "var(--color-surface)", border: `1px solid ${payMethod === m.id ? "rgba(37,99,235,0.45)" : "var(--color-border-subtle)"}`, borderRadius: 12, marginBottom: 8, cursor: "pointer", transition: "all 0.2s" }}>
								<input type="radio" name="rideshare-payment-method" value={m.id} checked={payMethod === m.id} onChange={() => { setPayMethod(m.id); setPayRsError(null); }} />
								<span style={{ fontSize: 20 }}>{m.icon}</span>
								<div style={{ flex: 1 }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{m.label}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{m.sub}</p>
								</div>
							</label>
						))}
						<p style={{ ...labelS, margin: "10px 0 0", lineHeight: 1.5 }}>PayPal is temporarily unavailable for rideshare. Please use card or wallet.</p>
							{payMethod === "card" && (
								// Kept permanently dark, like the CardElement box in RideCompletionPanel.jsx:
								// Stripe's iframe reads its text color from this JS options object, which can't
								// resolve var(--color-*) custom properties, so box + white text must stay a
								// fixed matched pair regardless of theme.
								<div style={{ border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, padding: "13px 14px", marginTop: 4, background: "rgba(255,255,255,0.03)" }}>
									<CardElement options={{ style: { base: { color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", "::placeholder": { color: "rgba(255,255,255,0.3)" } }, invalid: { color: "#f87171" } } }} />
								</div>
							)}
						</fieldset>

					<section aria-label="Cancellation terms" className="bg-surface border border-border" style={{ borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
						<p style={{ ...valS, margin: "0 0 6px" }}>Cancellation terms</p>
						<p style={{ ...labelS, margin: 0, lineHeight: 1.5 }}>Full refund before a driver accepts. After a driver match, the current policy applies a 30% fee and provides a 70% refund.</p>
					</section>

						{referralCode ? (
						<div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
							<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("rideshare.referralCode")}</span>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#60a5fa" }}>{referralCode}</span>
						</div>
					) : null}

					{priceInvalid && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 10 }}>
							{priceMode === "setprice"
								? "Enter an offer of at least $1.00 with no more than 2 decimal places."
								: "Live fare is unavailable. Return to booking to refresh the estimate."}
						</p>
					)}
					{payRsError && <p role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 10 }}>{payRsError}</p>}
					{payMethod === "paypal" ? (
						!import.meta.env.VITE_PAYPAL_CLIENT_ID ? (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171" }}>
								PayPal is not configured. Add VITE_PAYPAL_CLIENT_ID (sandbox Client ID) to the frontend .env and restart the dev server.
							</p>
						) : (
						<PayPalButtons
							disabled={priceInvalid}
							style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay", height: 44 }}
							createOrder={async () => {
								try {
									if (priceInvalid) {
										throw new Error("Invalid fare amount. Go back and fix your price before paying.");
									}
									const availRes = await getDriverAvailability();
									const avail = availRes?.data ?? availRes;
									if (!avail?.available) {
										setPayRsError(avail?.message ?? NO_DRIVER_MSG);
										throw new Error("no_driver");
									}
									const rideId = await createPaymentHold();
									paypalHoldRideId.current = rideId;
									const { id } = await createPaypalOrder(canonicalAmount, {
										ride_request_id: rideId,
										purpose: "rideshare",
									});
									if (!id) throw new Error("PayPal order was not created.");
									return id;
								} catch (err) {
									setPayRsError(parseBookingApiError(err));
									throw err;
								}
							}}
							onApprove={async (data) => {
								setPayRsError(null);
								try {
									await capturePaypalOrder(data.orderID);
									const rideId = paypalHoldRideId.current;
									if (!rideId) throw new Error("Ride hold expired. Please try again.");
									await finishPaidBooking(rideId, {
										payment_method: "paypal",
										paypal_order_id: data.orderID,
									});
								} catch (err) {
									setPayRsError(parseBookingApiError(err));
								}
							}}
							onError={(err) => {
								console.error("PayPal button error:", err);
								setPayRsError((prev) => prev || "PayPal payment failed. Use a Sandbox buyer account if testing locally.");
							}}
							onCancel={() => setPayRsError("PayPal checkout was cancelled.")}
						/>
						)
					) : (
						<button
							disabled={isConfirming || priceInvalid || !validatedSchedule.valid || driversAvailable === false || (payMethod === "card" && !stripe)}
							onClick={async () => {
								setIsConfirming(true);
								setPayRsError(null);
								try {
									if (priceInvalid) {
										setPayRsError(priceMode === "setprice"
											? "Enter an offer of at least $1.00 before paying."
											: "Invalid fare amount. Please go back and try Recommended Price.");
										setIsConfirming(false);
										return;
									}
									const availRes = await getDriverAvailability();
									const avail = availRes?.data ?? availRes;
									if (!avail?.available) {
										setPayRsError(avail?.message ?? NO_DRIVER_MSG);
										setDriversAvailable(false);
										setDriverAvailMsg(avail?.message ?? NO_DRIVER_MSG);
										setIsConfirming(false);
										return;
									}
									if (payMethod === "wallet") {
										if (walletBalance == null) { setPayRsError("Wallet balance is still loading. Please wait."); setIsConfirming(false); return; }
										if (walletBalance < canonicalAmount) { setPayRsError(`Insufficient balance. Your wallet has $${walletBalance.toFixed(2)} but $${total} is required.`); setIsConfirming(false); return; }
									}
									const rideId = await createPaymentHold();
									if (payMethod === "card") {
										if (!stripe || !elements) throw new Error("Stripe not loaded.");
										const { clientSecret, paymentIntentId } = await createStripeIntent(canonicalAmount, {
											ride_request_id: rideId,
											idempotency_key: bookingIdempotencyKey.current,
											purpose: "rideshare",
										});
										const result = await stripe.confirmCardPayment(clientSecret, {
											payment_method: { card: elements.getElement(CardElement) },
										});
										if (result.error) { setPayRsError(result.error.message); setIsConfirming(false); return; }
										const piId = result.paymentIntent?.id ?? paymentIntentId;
										await finishPaidBooking(rideId, {
											payment_method: "card",
											payment_intent_id: piId,
										});
									} else if (payMethod === "wallet") {
										await finishPaidBooking(rideId, { payment_method: "wallet" });
									}
								} catch (err) {
									setPayRsError(parseBookingApiError(err));
								} finally { setIsConfirming(false); }
							}}
							style={{ width: "100%", padding: "15px", background: driversAvailable === false ? "rgba(37,99,235,0.45)" : "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: isConfirming || driversAvailable === false ? "not-allowed" : "pointer", opacity: isConfirming || driversAvailable === false ? 0.7 : 1, transition: "background 0.2s, transform 0.12s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
							onMouseEnter={e => { if (!isConfirming) { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
							onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "translateY(0)"; }}>
							{isConfirming ? t("rideshare.payProcessing") : total ? `Pay $${total} and find drivers` : "Amount unavailable"}
							{!isConfirming && <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>}
						</button>
					)}
				</div>
			</div>
			{priceChange && (
				<PriceChangeModal
					oldAmount={priceChange.oldAmount}
					newAmount={priceChange.newAmount}
					reason="The fare changed since it was last quoted."
					onConfirm={() => { priceChange.resolve(true); setPriceChange(null); }}
					onCancel={() => { priceChange.resolve(false); setPriceChange(null); }}
				/>
			)}
		</div>
	);
}

// Landing-screen map: shows nearby online drivers gliding around the rider's
// location *before* they book — the "there are cars near you" reassurance.
// Booking-screen map (Uber's first screen, in Strug's own style): shows the rider's
// location + live nearby drivers, and as soon as a pickup/dropoff is typed it geocodes
// them, drops markers and draws the route. `fill` makes it grow to its container (the
// sticky right column on desktop); otherwise it renders as a compact banner (mobile).
// Fallback map centre when we have no rider location yet (geolocation denied/blocked/pending).
// Keeps the map visible instead of blank; an overlay makes clear it's not the rider's real spot.
const DEFAULT_MAP_CENTER = [43.6532, -79.3832]; // Toronto
const EMPTY_ROUTE_META = { durationMin: null, distanceKm: null, source: null, status: null };

const GOOGLE_MAP_DARK_STYLES = [
	{ elementType: "geometry", stylers: [{ color: "#10131c" }] },
	{ elementType: "labels.text.fill", stylers: [{ color: "#d7dce8" }] },
	{ elementType: "labels.text.stroke", stylers: [{ color: "#10131c" }] },
	{ featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2a3142" }] },
	{ featureType: "poi", stylers: [{ visibility: "off" }] },
	{ featureType: "road", elementType: "geometry", stylers: [{ color: "#242b3a" }] },
	{ featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
	{ featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2d3b55" }] },
	{ featureType: "transit", stylers: [{ visibility: "off" }] },
	{ featureType: "water", elementType: "geometry", stylers: [{ color: "#07111f" }] },
];

function normalizeRouteMeta(meta) {
	return {
		durationMin: meta?.durationMin ?? null,
		distanceKm: meta?.distanceKm ?? null,
		source: meta?.source ?? null,
		status: meta?.status ?? null,
	};
}

function routeMetaKey(meta) {
	const m = normalizeRouteMeta(meta);
	return `${m.durationMin ?? ""}|${m.distanceKm ?? ""}|${m.source ?? ""}|${m.status ?? ""}`;
}

function RouteMetricPills({ routeMeta, style }) {
	const [unit, setUnit] = useDistanceUnit();
	// Guard with `!= null` first — Number(null) is 0 and reads as finite, which used to
	// show a bogus "0 min / 0.00 km" whenever the route meta was empty.
	const durationMin = routeMeta?.durationMin != null && Number.isFinite(Number(routeMeta.durationMin)) ? Number(routeMeta.durationMin) : null;
	const duration = durationMin != null ? formatDuration(durationMin) : null;
	const distance = routeMeta?.distanceKm != null && Number.isFinite(Number(routeMeta.distanceKm)) ? formatDistance(routeMeta.distanceKm, unit) : null;
	if (duration == null && !distance) return null;
	return (
		<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", ...style }}>
			{duration != null && (
				<div style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.32)", borderRadius: 10, padding: "8px 11px", display: "flex", alignItems: "center", gap: 7 }}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#dbeafe" }}>
						{i18n.t("rideshare.eta")}: {duration}
					</span>
				</div>
			)}
			{distance && (
				<div style={{ background: "rgba(5,150,105,0.12)", border: "1px solid rgba(5,150,105,0.32)", borderRadius: 10, padding: "8px 11px", display: "flex", alignItems: "center", gap: 7 }}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#d1fae5" }}>
						{i18n.t("rideshare.distance")}: {distance}
					</span>
				</div>
			)}
			{distance && <DistanceUnitToggle unit={unit} onChange={setUnit} />}
		</div>
	);
}

function toGoogleLatLng(point) {
	return { lat: Number(point[0]), lng: Number(point[1]) };
}

// Fixed dark regardless of theme: floats directly on the Google map, which is always styled
// dark via GOOGLE_MAP_DARK_STYLES above (same reasoning as the Leaflet map-overlay chrome).
const MAP_CTRL_BTN = {
	width: 44,
	height: 44,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	background: "rgba(13,16,26,0.9)",
	backdropFilter: "blur(8px)",
	border: "1px solid rgba(255,255,255,0.14)",
	borderRadius: 9,
	color: "#e6ebf5",
	cursor: "pointer",
	padding: 0,
	lineHeight: 0,
	boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
};

export function GoogleRidePreviewMap({ maps, center, locating, pickupCoords, dropoffCoords, userPt, driverPts = [], route = [], routeMeta }) {
	const containerRef = useRef(null);
	const mapRef = useRef(null);
	const markersRef = useRef([]);
	const pulseMarkersRef = useRef([]);
	const routeLinesRef = useRef([]);
	const fitViewRef = useRef(() => {});
	const centerKey = center?.join(",");
	const pickupKey = pickupCoords?.join(",");
	const dropoffKey = dropoffCoords?.join(",");
	const userKey = userPt?.join(",");
	const driverKey = driverPts.map((d) => `${d.id}:${d.pt.join(",")}`).join("|");
	// Cheap route identity — hashing the endpoints + length instead of joining every
	// point (an OSRM route can be 2000+ points; joining it on each render was wasteful).
	const routeKey = route.length ? `${route.length}:${route[0].join(",")}:${route[route.length - 1].join(",")}` : "";

	useEffect(() => {
		if (!maps?.Map || !containerRef.current || mapRef.current) return;
		mapRef.current = new maps.Map(containerRef.current, {
			center: toGoogleLatLng(center),
			zoom: locating ? 11 : 14,
			disableDefaultUI: true,
			clickableIcons: false,
			gestureHandling: "greedy",
			backgroundColor: "#0a0a0e",
			styles: GOOGLE_MAP_DARK_STYLES,
		});
	}, [maps, centerKey, locating]); // eslint-disable-line react-hooks/exhaustive-deps

	// Frame the whole trip. Prefer the full route geometry so the curved road path is
	// centred (not just the two endpoints, which left the route running off-screen).
	useEffect(() => {
		const map = mapRef.current;
		if (!maps?.LatLngBounds || !map) return undefined;
		const endpoints = [pickupCoords ?? userPt, dropoffCoords, ...driverPts.map((d) => d.pt)].filter(Boolean);
		const fit = () => {
			const boundsPts = route.length > 1 ? route : endpoints;
			if (boundsPts.length > 1) {
				const bounds = new maps.LatLngBounds();
				boundsPts.forEach((pt) => bounds.extend(toGoogleLatLng(pt)));
				endpoints.forEach((pt) => bounds.extend(toGoogleLatLng(pt)));
				map.fitBounds(bounds, { top: 60, right: 48, bottom: 68, left: 48 });
				maps.event.addListenerOnce(map, "bounds_changed", () => {
					if (map.getZoom() > 15) map.setZoom(15);
				});
			} else {
				map.setCenter(toGoogleLatLng(endpoints[0] ?? center));
				map.setZoom(locating ? 11 : 14);
			}
		};
		fitViewRef.current = fit;
		fit();
		return undefined;
	}, [maps, centerKey, pickupKey, dropoffKey, userKey, driverKey, routeKey, locating]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		const map = mapRef.current;
		if (!maps?.Marker || !map) return undefined;
		markersRef.current.forEach((marker) => marker.setMap(null));
		markersRef.current = [];
		pulseMarkersRef.current = [];
		const pinIcon = (color, scale = 8) => ({
			path: maps.SymbolPath.CIRCLE,
			scale,
			fillColor: color,
			fillOpacity: 1,
			strokeColor: "#fff",
			strokeWeight: 2.6,
		});
		const carIconFor = (heading) => ({
			url: CAR_DATA_URI("#f59e0b", heading || 0),
			scaledSize: new maps.Size(26, 26),
			anchor: new maps.Point(13, 13),
		});
		const addMarker = (pt, title, icon, zIndex) => {
			markersRef.current.push(new maps.Marker({ map, position: toGoogleLatLng(pt), title, icon, zIndex }));
		};
		// A pulsing halo: an expanding, fading ring animated in the pulse effect below.
		const addPulse = (pt, color) => {
			const marker = new maps.Marker({
				map,
				position: toGoogleLatLng(pt),
				clickable: false,
				zIndex: 5,
				icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 0.35, strokeColor: color, strokeOpacity: 0.5, strokeWeight: 1 },
			});
			markersRef.current.push(marker);
			pulseMarkersRef.current.push({ marker, color });
		};
		if (pickupCoords) {
			addPulse(pickupCoords, "#2563eb");
			addMarker(pickupCoords, "Pickup", pinIcon("#2563eb"), 30);
		} else if (userPt) {
			addPulse(userPt, "#38bdf8");
			addMarker(userPt, "Your location", pinIcon("#ffffff", 6), 20);
		}
		if (dropoffCoords) {
			addPulse(dropoffCoords, "#059669");
			addMarker(dropoffCoords, "Destination", pinIcon("#059669"), 30);
		}
		driverPts.forEach((driver) => addMarker(driver.pt, "Nearby driver", carIconFor(driver.heading), 10));
		return () => {
			markersRef.current.forEach((marker) => marker.setMap(null));
			markersRef.current = [];
			pulseMarkersRef.current = [];
		};
	}, [maps, pickupKey, dropoffKey, userKey, driverKey]); // eslint-disable-line react-hooks/exhaustive-deps

	// Animate the halo rings: expand + fade on a ~1.6s loop for a live "pulsing" pin.
	useEffect(() => {
		if (!maps?.SymbolPath) return undefined;
		let raf;
		const PERIOD = 1600;
		const tick = (now) => {
			const t = (now % PERIOD) / PERIOD; // 0 → 1
			pulseMarkersRef.current.forEach(({ marker, color }) => {
				marker.setIcon({
					path: maps.SymbolPath.CIRCLE,
					scale: 8 + t * 20,
					fillColor: color,
					fillOpacity: 0.3 * (1 - t),
					strokeColor: color,
					strokeOpacity: 0.55 * (1 - t),
					strokeWeight: 1.5,
				});
			});
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [maps]);

	// Draw the route as a cased line: a dark wider under-stroke for depth, then the
	// accent line on top. A dashed grey guide is used for the straight-line fallback.
	useEffect(() => {
		const map = mapRef.current;
		if (!maps?.Polyline || !map) return undefined;
		routeLinesRef.current.forEach((line) => line.setMap(null));
		routeLinesRef.current = [];
		if (route.length < 2) return undefined;
		const path = route.map(toGoogleLatLng);
		const isFallback = routeMeta?.source === "fallback";
		if (isFallback) {
			routeLinesRef.current.push(new maps.Polyline({
				map, path, strokeColor: "#64748b", strokeOpacity: 0, strokeWeight: 4,
				icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, scale: 3 }, offset: "0", repeat: "14px" }],
			}));
		} else {
			routeLinesRef.current.push(new maps.Polyline({ map, path, strokeColor: "#0b1220", strokeOpacity: 0.55, strokeWeight: 9, zIndex: 1 }));
			routeLinesRef.current.push(new maps.Polyline({ map, path, strokeColor: "#3b82f6", strokeOpacity: 0.98, strokeWeight: 5, zIndex: 2 }));
		}
		return () => {
			routeLinesRef.current.forEach((line) => line.setMap(null));
			routeLinesRef.current = [];
		};
	}, [maps, routeKey, routeMeta?.source]); // eslint-disable-line react-hooks/exhaustive-deps

	const zoomBy = (delta) => {
		const map = mapRef.current;
		if (map) map.setZoom((map.getZoom() ?? 13) + delta);
	};

	return (
		<>
			<div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
			<div style={{ position: "absolute", right: 10, bottom: 12, display: "flex", flexDirection: "column", gap: 7, zIndex: 1000 }}>
				<Tooltip text={i18n.t("rideshare.recenterMap")}><button type="button" aria-label={i18n.t("rideshare.recenterMap")} style={MAP_CTRL_BTN} onClick={() => fitViewRef.current()}>
					<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
				</button></Tooltip>
				<Tooltip text={i18n.t("rideshare.zoomIn")}><button type="button" aria-label={i18n.t("rideshare.zoomIn")} style={MAP_CTRL_BTN} onClick={() => zoomBy(1)}>
					<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
				</button></Tooltip>
				<Tooltip text={i18n.t("rideshare.zoomOut")}><button type="button" aria-label={i18n.t("rideshare.zoomOut")} style={MAP_CTRL_BTN} onClick={() => zoomBy(-1)}>
					<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14"/></svg>
				</button></Tooltip>
			</div>
		</>
	);
}

function NearbyDriversMap({ userLocation, pickup, dropoff, fill = false, onRouteMetaChange, onSupplyChange }) {
	const { isMobile } = useViewport();
	const [distUnit] = useDistanceUnit();
	const [drivers, setDrivers] = useState([]);
	const [availabilityKnown, setAvailabilityKnown] = useState(false);
	const [pickupCoords, setPickupCoords] = useState(null);
	const [dropoffCoords, setDropoffCoords] = useState(null);
	const [route, setRoute] = useState([]);
	const [routeMeta, setRouteMeta] = useState(EMPTY_ROUTE_META);
	const [mapsApi, setMapsApi] = useState(null);
	// Self-resolved geolocation fallback: if the app-level prompt was denied/missed/timed out,
	// `userLocation` is null and the map used to stay blank until a pickup was typed (bug #99).
	// Ask here too so the map can centre on the rider on its own.
	const [geoCoords, setGeoCoords] = useState(null);
	const lat = userLocation?.lat ?? geoCoords?.lat;
	const lng = userLocation?.long ?? geoCoords?.long;

	useEffect(() => {
		let cancelled = false;
		loadGoogleMaps().then((maps) => {
			if (!cancelled) setMapsApi(maps);
		});
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		if (userLocation?.lat != null || !navigator.geolocation) return;
		navigator.geolocation.getCurrentPosition(
			(pos) => setGeoCoords({ lat: pos.coords.latitude, long: pos.coords.longitude }),
			() => {},
			{ timeout: 8000, maximumAge: 300000 },
		);
	}, [userLocation?.lat]);

	// Poll live nearby drivers around the rider
	useEffect(() => {
		if (lat == null || lng == null) return undefined;
		let stop = false;
		const load = () => getNearbyRides({ lat, long: lng, radius: 6 })
			.then((d) => { if (!stop) { setDrivers(parseNearbyDrivers(d)); setAvailabilityKnown(true); } })
			.catch(() => { if (!stop) { setDrivers([]); setAvailabilityKnown(false); } });
		load();
		const id = setInterval(load, 15000);
		return () => { stop = true; clearInterval(id); };
	}, [lat, lng]);

	const nearbySupply = getNearbySupply(drivers, availabilityKnown);
	useEffect(() => {
		onSupplyChange?.(nearbySupply);
	}, [onSupplyChange, nearbySupply.nearbyCount, nearbySupply.nearestDistanceKm, nearbySupply.availabilityKnown]); // eslint-disable-line react-hooks/exhaustive-deps

	// Mirror the form: geocode the typed pickup / dropoff into map coords
	useEffect(() => {
		let cancelled = false;
		const geocode = async (addr, setter) => {
			if (!addr) { setter(null); return; }
			const fallback = async () => {
				const loc = await geocodeAddressFallback(addr).catch(() => null);
				if (!cancelled) setter(loc ? [loc.lat, loc.lng] : null);
			};
			const maps = await loadGoogleMaps();
			if (!maps?.Geocoder) {
				await fallback();
				return;
			}
			new maps.Geocoder().geocode({ address: addr }, async (results, status) => {
				if (status === "OK" && results[0]) {
					const loc = results[0].geometry.location;
					if (!cancelled) setter([loc.lat(), loc.lng()]);
				} else {
					await fallback();
				}
			});
		};
		geocode(pickup, setPickupCoords);
		geocode(dropoff, setDropoffCoords);
		return () => { cancelled = true; };
	}, [pickup, dropoff]);

	// Draw the pickup → dropoff route (real road path) + capture ETA & distance
	useEffect(() => {
		if (!pickupCoords || !dropoffCoords) {
			setRoute([]);
			setRouteMeta(EMPTY_ROUTE_META);
			return;
		}
		let cancelled = false;
		fetchRouteMeta(pickupCoords, dropoffCoords, (meta) => {
			if (cancelled) return;
			setRoute(meta.path);
			setRouteMeta(normalizeRouteMeta(meta));
		});
		return () => { cancelled = true; };
	}, [pickupCoords?.join(), dropoffCoords?.join()]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		// Second arg carries the coords this component already geocoded (via Google or the
		// non-Google fallback) so callers with a server-side fare/route call can send them
		// straight through instead of re-geocoding the address string server-side.
		onRouteMetaChange?.(routeMeta, { pickupCoords, dropoffCoords });
	}, [onRouteMetaChange, routeMeta, pickupCoords, dropoffCoords]);

	const userPt = (lat != null && lng != null) ? [lat, lng] : null;
	const originPt = pickupCoords ?? userPt;
	// Never blank the map (bug #99): if we have no real location yet, centre on a default and
	// overlay a prompt, so riders always see the map + nearby-driver count up front.
	const center = originPt ?? DEFAULT_MAP_CENTER;
	const locating = !originPt;

	const driverPts = drivers
		.map((d) => {
			const dl = Number(d.current_lat ?? d.lat);
			const dn = Number(d.current_long ?? d.lng ?? d.long);
			return Number.isFinite(dl) && Number.isFinite(dn)
				? { id: d.driver_profile_id ?? d.id ?? `${dl},${dn}`, pt: [dl, dn] }
				: null;
		})
		.filter(Boolean);
	const count = driverPts.length;
	const userIcon = L.divIcon({ className: "", html: '<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2.5px solid #2563eb;box-shadow:0 0 0 4px #2563eb33"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
	const pickupIcon = L.divIcon({ className: "", html: '<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 0 10px #2563eb80"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
	const dropoffIcon = L.divIcon({ className: "", html: '<div style="width:14px;height:14px;border-radius:50%;background:#059669;border:2.5px solid #fff;box-shadow:0 0 10px #05966980"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
	const carIcon = L.divIcon({ className: "", html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))">${CAR_SVG("#f59e0b")}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

	return (
		// The map surface + all badges overlaid on it (below) stay fixed-dark regardless of
		// theme — same reasoning as RideshareMapView's map chrome. Only the framing border
		// (the seam between this box and the surrounding themed page) follows the theme.
		<div className="border border-border" style={{ position: "relative", width: "100%", height: fill ? "100%" : (isMobile ? 200 : 260), minHeight: fill ? 460 : undefined, borderRadius: 16, overflow: "hidden", marginBottom: fill ? 0 : 16 }}>
			{mapsApi?.Map ? (
				<GoogleRidePreviewMap
					maps={mapsApi}
					center={center}
					locating={locating}
					pickupCoords={pickupCoords}
					dropoffCoords={dropoffCoords}
					userPt={userPt}
					driverPts={driverPts}
					route={route}
					routeMeta={routeMeta}
				/>
			) : (
				<MapContainer center={center} zoom={locating ? 11 : 14} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
					<TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
					{pickupCoords && dropoffCoords && route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.85 }} />}
					{pickupCoords
						? <Marker position={pickupCoords} icon={pickupIcon} />
						: (userPt && <Marker position={userPt} icon={userIcon} />)}
					{dropoffCoords && <Marker position={dropoffCoords} icon={dropoffIcon} />}
					{driverPts.map((d) => (
						<SmoothMarker key={d.id} position={d.pt} icon={carIcon} rotate durationMs={1100} />
					))}
					{!locating && <FitBounds points={[originPt, dropoffCoords, ...driverPts.map((d) => d.pt)]} />}
				</MapContainer>
			)}
			{/* Top-right: nearby drivers badge */}
			<div style={{ position: "absolute", top: 10, right: 10, background: "rgba(10,10,20,0.85)", backdropFilter: "blur(8px)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 20, padding: "5px 12px", zIndex: 1000 }}>
				<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: locating ? "rgba(255,255,255,0.55)" : (count > 0 ? "#fbbf24" : "rgba(255,255,255,0.4)") }}>
					{locating ? "Finding drivers near you…" : (count > 0 ? `${count} driver${count === 1 ? "" : "s"} nearby` : "No drivers online right now")}
				</span>
			</div>
			{/* Bottom-left: ETA + distance pill — only shown when we have a real route */}
			{pickupCoords && dropoffCoords && (routeMeta.durationMin != null || routeMeta.distanceKm != null) && (
				<div style={{ position: "absolute", bottom: 10, left: 10, display: "flex", gap: 8, zIndex: 1000, flexWrap: "wrap" }}>
					{routeMeta.durationMin != null && (
						<div style={{ background: "rgba(10,10,20,0.90)", backdropFilter: "blur(8px)", border: "1px solid rgba(37,99,235,0.5)", borderRadius: 20, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5 }}>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>{formatDuration(routeMeta.durationMin)}</span>
						</div>
					)}
					{routeMeta.distanceKm != null && (
						<div style={{ background: "rgba(10,10,20,0.90)", backdropFilter: "blur(8px)", border: "1px solid rgba(5,150,105,0.5)", borderRadius: 20, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5 }}>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#34d399" }}>{formatDistance(routeMeta.distanceKm, distUnit)}</span>
						</div>
					)}
				</div>
			)}
			{locating && (
				<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,10,20,0.45)", zIndex: 900, pointerEvents: "none", padding: 16 }}>
					<div style={{ background: "rgba(13,13,20,0.92)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 16px", maxWidth: 280, textAlign: "center" }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#fff", margin: "0 0 4px" }}>Turn on location to see drivers near you</p>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)", margin: 0 }}>Or just enter your pickup address to get started.</p>
					</div>
				</div>
			)}
		</div>
	);
}

function RidesharePage({ userLocation, onNavigate }) {
	const { t, landingTitle } = usePageI18n("rideshare");
	const rideVehicleTypes = React.useMemo(() => getRideVehicleTypes(t), [t]);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [rsView, setRsView] = useState("landing"); // landing | payment | map
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [rsView]);
	const [rideshareReturnTo] = useState(() => {
		if (typeof window === "undefined") return null;
		return window.__rideshareReturnTo === "dating" ? "dating" : null;
	});
	const [pickup, setPickup] = useState("");
	const [dropoff, setDropoff] = useState("");
	const [rideStops, setRideStops] = useState([]);
	const [savedPlaces, setSavedPlaces] = useState([]);
	useEffect(() => {
		let cancelled = false;
		getAddresses().then((res) => {
			if (cancelled) return;
			const list = Array.isArray(res) ? res : (res?.data ?? []);
			setSavedPlaces(Array.isArray(list) ? list : []);
		}).catch(() => {});
		return () => { cancelled = true; };
	}, []);
	const analyticsKeysRef = useRef(new Set());
	const fareRequestSequenceRef = useRef(0);
	const trackOnce = useCallback((event, metadata = {}, key = event) => {
		if (analyticsKeysRef.current.has(key)) return;
		analyticsKeysRef.current.add(key);
		void trackRideEvent(event, metadata);
	}, []);
	useEffect(() => { trackOnce("page_viewed"); }, [trackOnce]);
	useEffect(() => {
		if (pickup && dropoff) trackOnce("route_started");
	}, [pickup, dropoff, trackOnce]);

	// Reverse-geocode userLocation into a human-readable pickup address on mount
	useEffect(() => {
		if (userLocation?.lat == null || userLocation?.long == null) return;
		let cancelled = false;
		const fallback = async () => {
			const label = await reverseGeocodeCoords(userLocation.lat, userLocation.long);
			if (!cancelled) setPickup(label || formatCoords(userLocation.lat, userLocation.long));
		};
		loadGoogleMaps().then((maps) => {
			if (!maps?.Geocoder) {
				fallback();
				return;
			}
			new maps.Geocoder().geocode(
				{ location: { lat: userLocation.lat, lng: userLocation.long } },
				async (results, status) => {
					if (cancelled) return;
					if (status === "OK" && results[0]) setPickup(results[0].formatted_address);
					else await fallback();
				}
			);
		});
		return () => { cancelled = true; };
	}, [userLocation?.lat, userLocation?.long]);
	const [rideReqId, setRideReqId] = useState(null);
	const [timing, setTiming] = useState("now");
	const [scheduleDate, setScheduleDate] = useState("");
	const [scheduleTime, setScheduleTime] = useState("");
	const [selectedType, setSelectedType] = useState("economy");
	const userSelectedType = useRef(false);
	const [referralCode, setReferralCode] = useState("");
	const [priceMode, setPriceMode] = useState("standard"); // "setprice" | "standard"
	const [userPrice, setUserPrice] = useState("");
	const [fareEstimatesByType, setFareEstimatesByType] = useState(null);
	const [fareStatus, setFareStatus] = useState("idle");
	const fareEstimate = fareEstimatesByType?.[selectedType] ?? null;
	const [routePreviewMeta, setRoutePreviewMeta] = useState(EMPTY_ROUTE_META);
	// [lat, lng] pairs the map already geocoded for pickup/dropoff — threaded through to the
	// fare-estimates call so the backend can skip re-geocoding (and isn't stuck 422ing whenever
	// the Google geocoder is unavailable/rate-limited/misconfigured).
	const [pickupLatLng, setPickupLatLng] = useState(null);
	const [dropoffLatLng, setDropoffLatLng] = useState(null);
	const [supply, setSupply] = useState({ nearbyCount: 0, nearestDistanceKm: null, availabilityKnown: false });
	const bookingPanelRef = useRef(null);
	const [rideCancelledMsg, setRideCancelledMsg] = useState("");
	const [tripFinished, setTripFinished] = useState(false);

	const handleRouteMetaChange = useCallback((meta, coords) => {
		const next = normalizeRouteMeta(meta);
		setRoutePreviewMeta((prev) => (routeMetaKey(prev) === routeMetaKey(next) ? prev : next));
		if (coords) {
			setPickupLatLng(coords.pickupCoords ?? null);
			setDropoffLatLng(coords.dropoffCoords ?? null);
		}
	}, []);
	const handleSupplyChange = useCallback((next) => {
		setSupply((previous) => (
			previous.nearbyCount === next.nearbyCount
			&& previous.nearestDistanceKm === next.nearestDistanceKm
			&& previous.availabilityKnown === next.availabilityKnown
				? previous : next
		));
	}, []);
	const pickupRange = useMemo(() => getPickupRange({ nearestDistanceKm: supply.nearestDistanceKm }), [supply.nearestDistanceKm]);
	const rideOptions = useMemo(
		() => buildRideOptions(rideVehicleTypes, fareEstimatesByType, pickupRange),
		[rideVehicleTypes, fareEstimatesByType, pickupRange],
	);
	useEffect(() => {
		const nextType = chooseRideOption(rideOptions, selectedType, userSelectedType.current);
		if (nextType !== selectedType) setSelectedType(nextType);
	}, [rideOptions, selectedType]);
	const selectRideType = useCallback((type) => {
		userSelectedType.current = true;
		setSelectedType(type);
		trackOnce("vehicle_selected", { vehicle_type: type }, `vehicle_selected:${type}`);
	}, [trackOnce]);
	const routeResolved = Boolean(pickup && dropoff)
		&& ["OK", "SUCCESS"].includes(String(routePreviewMeta.status || "").toUpperCase())
		&& Number(routePreviewMeta.distanceKm) > 0
		&& Number(routePreviewMeta.durationMin) > 0;
	const pickupConfidence = useMemo(() => getPickupConfidence({
		routeResolved,
		availabilityKnown: supply.availabilityKnown,
		nearbyCount: supply.nearbyCount,
	}), [routeResolved, supply.availabilityKnown, supply.nearbyCount]);
	useEffect(() => {
		if (routeResolved) trackOnce("route_resolved", { route_resolved: true });
	}, [routeResolved, trackOnce]);
	useEffect(() => {
		const level = pickupConfidence?.level;
		if (level) trackOnce("pickup_confidence_shown", { confidence: level }, `pickup_confidence_shown:${level}`);
	}, [pickupConfidence, trackOnce]);
	const scheduleValidation = useRideScheduleValidation(timing, scheduleDate, scheduleTime);
	const confirmPickup = useCallback(() => {
		trackOnce("pickup_adjusted", { confidence: pickupConfidence?.level });
		bookingPanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
		bookingPanelRef.current?.querySelector?.('[aria-label="Pickup"]')?.focus();
	}, [pickupConfidence, trackOnce]);
	const confirmBooking = useCallback(async () => {
		const freshSchedule = validateRideSchedule({ timing, scheduleDate, scheduleTime });
		if (!freshSchedule.valid) {
			setRideCancelledMsg(rideScheduleError(freshSchedule));
			setTimeout(() => setRideCancelledMsg(""), 8000);
			return;
		}
		try {
			const response = await getDriverAvailability();
			const availability = response?.data ?? response;
			if (!availability?.available) {
				setRideCancelledMsg(availability?.message ?? NO_DRIVER_MSG);
				setTimeout(() => setRideCancelledMsg(""), 8000);
				return;
			}
		} catch {
			setRideCancelledMsg("Could not verify driver availability. Check your connection and try again.");
			setTimeout(() => setRideCancelledMsg(""), 8000);
			return;
		}
		trackOnce("confirmation_started", { vehicle_type: selectedType, price_mode: priceMode });
		setRsView("payment");
	}, [timing, scheduleDate, scheduleTime, selectedType, priceMode, trackOnce]);

	const markTripCompleted = () => {
		clearRideshareSession();
		setTripFinished(true);
	};

	// Restore active ride map after leaving for Messages (or remounting rideshare nav)
	useEffect(() => {
		const session = loadRideshareSession();
		if (!session?.rideReqId) return;
		let cancelled = false;
		(async () => {
			try {
				const raw = await getRideRequest(session.rideReqId);
				const ride = raw?.data ?? raw;
				if (cancelled || !ride) return;
				if (RESTORABLE_MAP_STATUSES.has(ride.status)) {
					if (session.pickup) setPickup(session.pickup);
					if (session.dropoff) setDropoff(session.dropoff);
					if (session.selectedType) {
						userSelectedType.current = true;
						setSelectedType(session.selectedType);
					}
					setRideReqId(session.rideReqId);
					setTripFinished(false);
					setRsView("map");
				} else {
					clearRideshareSession();
				}
			} catch {
				clearRideshareSession();
			}
		})();
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		if (rsView !== "map" || !rideReqId || tripFinished) return;
		saveRideshareSession({
			rideReqId,
			pickup,
			dropoff,
			selectedType,
		});
	}, [rsView, rideReqId, pickup, dropoff, selectedType, tripFinished]);

	const leaveMapView = () => {
		clearRideshareSession();
		setTripFinished(false);
		setRideReqId(null);
		setRsView("landing");
	};

	const handlePageBack = useCallback(() => {
		const target = rideshareReturnTo || "home";
		if (typeof window !== "undefined") window.__rideshareReturnTo = null;
		if (typeof onNavigate === "function") onNavigate(target);
		else if (typeof window !== "undefined" && window.__nav) window.__nav(target);
	}, [onNavigate, rideshareReturnTo]);

	// Listen for server-side ride timeout/cancellation (landing only — map view handles its own UI)
	useEffect(() => {
		if (rsView === "map") return;
		const uid = getUser()?.user_id ?? getUser()?.id;
		if (!uid) return;
		const s = connectSocket();
		const handler = (data) => {
			setRideCancelledMsg(buildRideCancelledMessage(data));
			setTimeout(() => setRideCancelledMsg(""), 8000);
		};
		s.on(`ride-cancelled-${uid}`, handler);
		return () => s.off(`ride-cancelled-${uid}`, handler);
	}, [rsView]);

	useEffect(() => {
		if (!pickup || !dropoff) setRoutePreviewMeta(EMPTY_ROUTE_META);
	}, [pickup, dropoff]);

	useEffect(() => {
		const requestSequence = ++fareRequestSequenceRef.current;
		if (!pickup || !dropoff || priceMode === "setprice") {
			setFareEstimatesByType(null);
			setFareStatus("idle");
			return () => {
				if (fareRequestSequenceRef.current === requestSequence) fareRequestSequenceRef.current += 1;
			};
		}
		setFareEstimatesByType(null);
		setFareStatus("pending");
		const timer = setTimeout(async () => {
			try {
				// Send the coords the map already geocoded so the backend doesn't have to
				// re-geocode (and doesn't 422 whenever Google's geocoder is down/misconfigured).
				const result = await getFareEstimates(pickup, dropoff, {
					pickup_lat: pickupLatLng?.[0], pickup_long: pickupLatLng?.[1],
					drop_lat: dropoffLatLng?.[0], drop_long: dropoffLatLng?.[1],
				}, rideStops.filter((stop) => String(stop?.address || "").trim()));
				if (fareRequestSequenceRef.current !== requestSequence) return;
				setFareEstimatesByType(result?.successful && result?.estimates ? result.estimates : null);
				setFareStatus(result?.successful && result?.estimates ? "success" : "error");
			} catch {
				if (fareRequestSequenceRef.current !== requestSequence) return;
				setFareEstimatesByType(null);
				setFareStatus("error");
			}
		}, 600);
		return () => {
			clearTimeout(timer);
			if (fareRequestSequenceRef.current === requestSequence) fareRequestSequenceRef.current += 1;
		};
	}, [pickup, dropoff, priceMode, pickupLatLng?.join(), dropoffLatLng?.join(), JSON.stringify(rideStops)]); // eslint-disable-line react-hooks/exhaustive-deps

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto" }}>
			<div style={{ paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32 }}>
				<div style={{ padding: "28px 0 24px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
					<SkeletonHeading />
					<div className="bg-surface border border-border" style={{ marginTop: 28, marginBottom: 16, borderRadius: 16, padding: "20px 22px" }}>
						<Skel w={50} h={10} r={4} style={{ marginBottom: 14 }} />
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<Skel h={40} r={10} />
							<Skel h={40} r={10} />
						</div>
					</div>
					<div className="bg-surface border border-border" style={{ marginBottom: 16, borderRadius: 16, padding: "20px 22px" }}>
						<Skel w={50} h={10} r={4} style={{ marginBottom: 14 }} />
						<div style={{ display: "flex", gap: 8 }}>
							<Skel h={40} r={10} style={{ flex: 1 }} />
							<Skel h={40} r={10} style={{ flex: 1 }} />
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

	if (rsView === "payment") {
		return <RidesharePaymentView pickup={pickup} dropoff={dropoff} stops={rideStops} selectedType={selectedType} priceMode={priceMode} userPrice={userPrice} fareEstimate={fareEstimate} routeMeta={routePreviewMeta} referralCode={referralCode} timing={timing} scheduleDate={scheduleDate} scheduleTime={scheduleTime} scheduleValidation={scheduleValidation} onBack={() => setRsView("landing")} onRouteMetaChange={handleRouteMetaChange} onConfirm={(rideId) => {
			trackOnce("confirmation_completed", { ride_request_id: rideId, vehicle_type: selectedType, price_mode: priceMode });
			setRideReqId(rideId);
			setTripFinished(false);
			setRsView("map");
		}} />;
	}
	if (rsView === "map") {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
			<RideshareMapView
				pickup={pickup}
				dropoff={dropoff}
				selectedVehicle={selectedType}
				requestId={rideReqId}
				onBack={leaveMapView}
				onTripCompleted={markTripCompleted}
				onNoDriver={clearRideshareSession}
				onNavigate={onNavigate}
			/>
			</div>
		);
	}

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: isMobile ? "hidden" : "auto" }}>
			{rideCancelledMsg && (
				<div className="bg-surface-raised" style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "14px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: "#f87171", zIndex: 90, maxWidth: "90vw", textAlign: "center", animation: "fadeUp 0.2s ease both" }}>
					{rideCancelledMsg}
				</div>
			)}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, paddingLeft: isMobile ? 0 : 108, paddingRight: isMobile ? 0 : 32 }}>
				<div style={isMobile
					? { position: "relative", flex: 1, minHeight: 0, width: "100%" }
					: { padding: "28px 0 24px", animation: "fadeUp 0.3s ease both", width: "100%" }}>
						{!isMobile && (
							<>
								<button type="button" onClick={handlePageBack} className="text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, marginBottom: 16, padding: 0 }}>
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
									{rideshareReturnTo === "dating" ? "Back to Dating" : i18n.t("common.back")}
								</button>
								<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 28, textAlign: "center" }}>{landingTitle}</h1>
							</>
						)}

					{/* Mobile: full-bleed live map sits behind the booking sheet. Our take on a
					    map-first ride screen — Strug's dark map + a bottom sheet, not a copy. */}
					{isMobile && (
						<div role="region" aria-label="Nearby drivers map" style={{ position: "absolute", inset: 0, zIndex: 1, isolation: "isolate" }}>
							<NearbyDriversMap userLocation={userLocation} pickup={pickup} dropoff={dropoff} fill onRouteMetaChange={handleRouteMetaChange} onSupplyChange={handleSupplyChange} />
						</div>
					)}

					{/* Desktop: two-column grid. Mobile: bottom sheet overlaying the map.
					    zIndex + translateZ promote the sheet to its own compositing layer so it
					    paints above Leaflet's GPU-composited tile layer (a sibling map would
					    otherwise bleed over it). */}
					<div role={isMobile ? "region" : undefined} aria-label={isMobile ? "Ride booking sheet" : undefined} style={isMobile
						? { position: "absolute", left: 0, right: 0, bottom: 0, top: "37%", zIndex: 2, transform: "translateZ(0)", background: "var(--color-bg)", borderRadius: "22px 22px 0 0", boxShadow: "0 -10px 40px var(--color-shadow)", borderTop: "1px solid var(--color-border-subtle)", overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 16px 28px" }
						: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 28, alignItems: "start" }}>
						{/* Mobile sheet: grab handle + compact title */}
						{isMobile && <div className="bg-border" style={{ width: 42, height: 4, borderRadius: 2, margin: "6px auto 14px" }} />}
							{isMobile && (
								<>
									<button type="button" onClick={handlePageBack} className="text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, marginBottom: 10, padding: 0 }}>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
										{rideshareReturnTo === "dating" ? "Back to Dating" : i18n.t("common.back")}
									</button>
									<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 23, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 16px", textAlign: "center" }}>{landingTitle}</h1>
								</>
							)}

						{/* Booking form — the sole column on mobile, the left column on desktop */}
						<div ref={bookingPanelRef} role={!isMobile ? "region" : undefined} aria-label={!isMobile ? "Ride booking panel" : undefined} style={isMobile ? undefined : { width: "100%" }}>
							<RideBookingPanel
								pickup={pickup} dropoff={dropoff} setPickup={setPickup} setDropoff={setDropoff}
								stops={rideStops} setStops={setRideStops}
								savedPlaces={savedPlaces}
								routeMeta={routePreviewMeta} confidence={pickupConfidence} onConfirmPickup={confirmPickup}
								timing={timing} setTiming={setTiming} scheduleDate={scheduleDate} setScheduleDate={setScheduleDate}
								scheduleTime={scheduleTime} setScheduleTime={setScheduleTime} scheduleValidation={scheduleValidation} options={rideOptions}
								selectedId={selectedType} onSelect={selectRideType} priceMode={priceMode} setPriceMode={setPriceMode}
								userPrice={userPrice} setUserPrice={setUserPrice} referralCode={referralCode}
								setReferralCode={setReferralCode} onConfirm={confirmBooking} fareStatus={fareStatus}
							/>
							{referralCode && (
								<p className="text-text-secondary" style={{ margin: "10px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Referral code: <strong>{referralCode}</strong></p>
							)}
						</div>

						{/* Right column — live nearby-drivers map, sticky beside the form */}
						{!isMobile && (
							<div role="region" aria-label="Nearby drivers map" style={{ position: "sticky", top: 20, height: "calc(100vh - 150px)", minHeight: 460 }}>
								<NearbyDriversMap userLocation={userLocation} pickup={pickup} dropoff={dropoff} fill onRouteMetaChange={handleRouteMetaChange} onSupplyChange={handleSupplyChange} />
							</div>
						)}
					</div>{/* /grid */}
				</div>
			</div>
		</div>
	);
}

export { RidesharePage, RideshareMapView, RidesharePaymentView };
