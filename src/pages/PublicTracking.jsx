import React, { useEffect, useMemo, useState } from "react";
import LiveTrackingMap from "../components/LiveTrackingMap.jsx";
import { getPublicCourierTracking } from "../api/courier.js";

// No-login tracking link for a courier delivery (see routes/courier-order-routes.js
// GET /courier-order/track/:token). Rendered standalone, before any auth gating —
// same pattern as ResetPassword.jsx — since whoever opens this link may not have
// (or need) a Strug account at all. Polls instead of using a socket: the backend's
// socket layer requires an authenticated connection, so a lightweight poll is the
// v1 tradeoff (see plan) rather than extending socket auth for one anonymous case.
const STEPS = [
	{ key: "pending", label: "Finding a courier" },
	{ key: "accepted", label: "Courier on the way" },
	{ key: "picked_up", label: "Package picked up" },
	{ key: "delivered", label: "Delivered" },
];

const POLL_MS = 4000;

export default function PublicTracking() {
	const token = useMemo(() => {
		const match = window.location.pathname.match(/\/track\/([^/?#]+)/);
		return match ? match[1] : null;
	}, []);

	const [data, setData] = useState(null);
	const [error, setError] = useState(token ? null : "No tracking link provided.");
	const [loading, setLoading] = useState(!!token);

	useEffect(() => {
		if (!token) return undefined;
		let stopped = false;
		const poll = () => {
			getPublicCourierTracking(token)
				.then((res) => { if (!stopped) { setData(res); setError(null); setLoading(false); } })
				.catch((err) => {
					if (stopped) return;
					setError(err?.response?.data?.error || "This tracking link isn't available.");
					setLoading(false);
				});
		};
		poll();
		const isTerminal = data?.status === "delivered" || data?.status === "cancelled";
		const id = isTerminal ? null : setInterval(poll, POLL_MS);
		return () => { stopped = true; if (id) clearInterval(id); };
	}, [token, data?.status]);

	const activeIdx = data ? Math.max(0, STEPS.findIndex((s) => s.key === data.status)) : 0;
	const heading = data?.status === "picked_up"
		? (data?.dropoff_lat != null && data?.dropoff_lng != null ? { lat: data.dropoff_lat, lng: data.dropoff_lng } : null)
		: (data?.pickup_lat != null && data?.pickup_lng != null ? { lat: data.pickup_lat, lng: data.pickup_lng } : null);
	const live = data?.lat != null && data?.lng != null ? { lat: data.lat, lng: data.lng } : null;

	return (
		<div className="bg-bg" style={{ minHeight: "100vh", display: "flex", justifyContent: "center", padding: "40px 16px" }}>
			<div style={{ width: "100%", maxWidth: 480 }}>
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
					Strug Courier · Live tracking
				</p>

				{loading && (
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif" }}>Loading…</p>
				)}

				{!loading && error && (
					<div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "16px 18px" }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#f87171", margin: 0 }}>{error}</p>
					</div>
				)}

				{!loading && !error && data && (
					<>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(26px,5vw,36px)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
							{STEPS[activeIdx]?.label}
						</h1>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>
							{data.driver_first_name ? `${data.driver_first_name} is on this delivery` : "Waiting for a courier to accept"}
							{data.eta_min != null && (
								<> · <span style={{ color: "#60a5fa", fontWeight: 700 }}>
									{data.status === "picked_up" ? `${data.eta_min} min to drop-off` : `${data.eta_min} min to pickup`}
								</span></>
							)}
						</p>

						{live && heading && (
							<div style={{ marginBottom: 16 }}>
								<LiveTrackingMap live={live} destination={heading} accent="#0ea5e9" height={240} />
							</div>
						)}

						<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
							{STEPS.map((st, i) => {
								const done = i < activeIdx;
								const current = i === activeIdx;
								const color = done ? "#16a34a" : current ? "#2563eb" : "var(--color-text-muted)";
								return (
									<div key={st.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0" }}>
										<div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, border: `2px solid ${color}`, background: done ? "#16a34a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
											{done ? <span style={{ color: "#fff", fontSize: 13 }}>✓</span> : current ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} /> : null}
										</div>
										<span className={done || current ? "text-text-primary" : "text-text-secondary"} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: current ? 700 : 500 }}>{st.label}</span>
									</div>
								);
							})}
						</div>

						<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "18px 22px" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
								<div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{data.pickup_location}</span>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669", flexShrink: 0 }} />
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{data.dropoff_location}</span>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
