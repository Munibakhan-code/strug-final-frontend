// Reusable provider demand map (#326). Renders anonymized demand-density circles (never
// exact addresses — the backend snaps every point to a ~1km grid) over a theme-matched
// Leaflet basemap. Circle radius + colour scale with each cell's weight relative to the
// busiest cell. Self-fetches from GET /provider-opportunities/demand-map via the passed fetcher.
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { getDemandMap } from "../api/opportunities.js";
import { useTheme } from "../utils/theme.js";

const DEFAULT_CENTER = [43.6532, -79.3832]; // Toronto fallback when seller has no geo yet

// This map is shared by food sellers AND quote providers, so the copy can't say
// "restaurant" — a quote provider seeing restaurant wording reads as someone else's UI.
const BUSINESS_NOUN = {
	food: "restaurant",
	restaurant: "restaurant",
	restaurants: "restaurant",
	grocery: "store",
	groceries: "store",
	liquor: "liquor store",
	pharmacy: "pharmacy",
	catering: "catering business",
	floral: "flower shop",
	flowers: "flower shop",
	mealkit: "meal-kit business",
	meal_kit: "meal-kit business",
};

export function businessNounFor(vertical) {
	return BUSINESS_NOUN[String(vertical || "").trim().toLowerCase()] || "business";
}

function FitToCells({ cells, center }) {
	const map = useMap();
	const key = `${cells.map((c) => `${c.lat},${c.lng}`).join("|")}|${center?.lat},${center?.lng}`;
	useEffect(() => {
		if (cells.length > 1) {
			map.fitBounds(
				cells.map((c) => [c.lat, c.lng]),
				{ padding: [40, 40], maxZoom: 11 },
			);
			return;
		}
		if (cells.length === 1) {
			map.setView([cells[0].lat, cells[0].lng], 11);
			return;
		}
		if (center?.lat != null && center?.lng != null) {
			map.setView([center.lat, center.lng], 11);
		}
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps
	return null;
}

function MapShell({ height, children, overlay }) {
	return (
		<div className="border border-border" style={{ position: "relative", height, borderRadius: 16, overflow: "hidden" }}>
			{children}
			{overlay}
		</div>
	);
}

function EmptyOverlay({ title, body }) {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 500,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 8,
				textAlign: "center",
				padding: 24,
				// Theme-aware frosted panel — white-on-dark rgba used to vanish in light mode.
				background: "color-mix(in srgb, var(--color-bg) 72%, transparent)",
				pointerEvents: "none",
			}}
		>
			<svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
				<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
				<circle cx="12" cy="10" r="3" />
			</svg>
			<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }}>{title}</p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, maxWidth: 360, margin: 0, lineHeight: 1.45 }}>{body}</p>
		</div>
	);
}

export function DemandHeatMap({ vertical, height = 420, businessNoun }) {
	const noun = businessNoun || businessNounFor(vertical);
	const [theme] = useTheme();
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [errored, setErrored] = useState(false);

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setErrored(false);
		getDemandMap(vertical)
			.then((res) => {
				if (alive) setData(res?.data ?? res ?? null);
			})
			.catch(() => {
				if (alive) setErrored(true);
			})
			.finally(() => {
				if (alive) setLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [vertical]);

	const cells = useMemo(() => data?.cells ?? [], [data]);
	const { ownWeight, marketWeight } = useMemo(() => {
		let own = 0;
		let market = 0;
		for (const c of cells) {
			const w = Number(c.weight) || 0;
			if (c.own) own += w;
			else market += w;
		}
		return { ownWeight: own, marketWeight: market };
	}, [cells]);
	const center = data?.center || null;
	const maxWeight = data?.max_weight || 1;
	const mapCenter = useMemo(() => {
		if (cells[0]) return [cells[0].lat, cells[0].lng];
		if (center?.lat != null && center?.lng != null) return [center.lat, center.lng];
		return DEFAULT_CENTER;
	}, [cells, center]);

	const colorFor = (w) => {
		const t = Math.min(1, w / maxWeight);
		if (t > 0.66) return "#ef4444";
		if (t > 0.33) return "#f59e0b";
		return "#2563eb";
	};

	if (loading) {
		return (
			<div className="bg-surface border border-border" style={{ height, borderRadius: 16, overflow: "hidden", position: "relative" }} aria-busy="true" aria-label="Loading demand map">
				<div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 16 }} />
				<div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, zIndex: 1, pointerEvents: "none" }}>
					<div className="skel" style={{ width: 56, height: 56, borderRadius: "50%" }} />
					<div className="skel" style={{ width: 160, height: 12, borderRadius: 6 }} />
					<div className="skel" style={{ width: 110, height: 10, borderRadius: 6 }} />
				</div>
			</div>
		);
	}

	if (errored) {
		return (
			<div className="bg-surface border border-border" style={{ height, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 24 }}>
				<svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
					<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>Couldn't load demand data</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, maxWidth: 340 }}>Refresh and try again. If this keeps happening, check that you're signed in as a seller.</p>
			</div>
		);
	}

	const empty = !cells.length;
	const meta = data?.meta || {};
	const kNeed = data?.k_anonymity || 5;
	const emptyTitle = "No demand hotspots near you yet";
	const emptyBody = (() => {
		if (!center) {
			return `Add your ${noun} location (lat/long) so the map can focus on your area.`;
		}
		if ((meta.my_orders || 0) === 0 && (meta.orders_considered || 0) === 0) {
			return `No paid orders in the last 90 days yet. Once buyers order from your ${noun}, hotspots can appear.`;
		}
		if ((meta.my_orders || 0) === 0) {
			return `No paid orders found for your ${noun} yet. Confirm buyers ordered from this ${noun} (not another seller) and that payment completed.`;
		}
		if ((meta.my_distinct_buyers || 0) > 0 && (meta.my_distinct_buyers || 0) < kNeed) {
			return `Your ${noun} has ${meta.my_distinct_buyers} different buyer${meta.my_distinct_buyers === 1 ? "" : "s"} with paid orders. Circles appear at ${kNeed}+ different buyers for privacy.`;
		}
		if ((meta.points_with_geo || 0) === 0) {
			return "Orders exist, but no mappable buyer locations yet. Buyers should pick an address from suggestions, then place a paid order.";
		}
		if ((meta.points_in_radius || 0) === 0) {
			return `Buyers have coordinates, but none are near your ${noun} pin. Update your ${noun} lat/long and buyer addresses to the same city area.`;
		}
		return `Showing your area (~${data?.radius_km || 100} km). Hotspots appear once at least ${kNeed} different buyers order in the same area — locations are anonymized for privacy.`;
	})();

	return (
		<div>
			<MapShell
				height={height}
				overlay={empty ? <EmptyOverlay title={emptyTitle} body={emptyBody} /> : null}
			>
				<MapContainer key={`${mapCenter[0]}-${mapCenter[1]}-${empty}-${theme}`} center={mapCenter} zoom={empty ? 12 : 10} style={{ width: "100%", height: "100%" }} scrollWheelZoom attributionControl={false}>
					<TileLayer
						url={theme === "light"
							? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
							: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
					/>
					<FitToCells cells={cells} center={center} />
					{center?.lat != null && center?.lng != null && (
						<CircleMarker
							center={[center.lat, center.lng]}
							radius={7}
							pathOptions={{ color: "#fff", fillColor: "#2563eb", fillOpacity: 0.95, weight: 2 }}
						>
							<Tooltip>Your {noun}</Tooltip>
						</CircleMarker>
					)}
					{cells.map((c, i) => (
						<CircleMarker
							key={`${c.lat}-${c.lng}-${i}`}
							center={[c.lat, c.lng]}
							radius={8 + Math.round((c.weight / maxWeight) * 22)}
							pathOptions={{ color: colorFor(c.weight), fillColor: colorFor(c.weight), fillOpacity: c.own ? 0.18 : 0.35, weight: 1.5, ...(c.own ? { dashArray: "4 4" } : {}) }}
						>
							<Tooltip>
								{c.own
									? `${c.weight} of your own ${noun} customers (plotted at your location, not their addresses)`
									: `${c.weight} buyer${c.weight === 1 ? "" : "s"} in this area`}
							</Tooltip>
						</CircleMarker>
					))}
				</MapContainer>
			</MapShell>
			<div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
				<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
					{empty
						? `No hotspots yet · last ${data?.window_days ?? 90} days`
						: `${marketWeight} area buyer${marketWeight === 1 ? "" : "s"}${ownWeight ? ` · ${ownWeight} of your customers at your location` : ""} · last ${data.window_days} days`}
					{data?.radius_km ? ` · within ${data.radius_km} km` : ""}
				</span>
				{[["#2563eb", "Low"], ["#f59e0b", "Medium"], ["#ef4444", "High"]].map(([c, l]) => (
					<span key={l} className="text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
						<span style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />
						{l}
					</span>
				))}
				<span className="text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
					<span style={{ width: 10, height: 10, borderRadius: "50%", border: "1.5px dashed #ef4444", display: "inline-block", boxSizing: "border-box" }} />
					Your customers (at your pin)
				</span>
				<span className="text-text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
					<span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
					Buyers in the area
				</span>
			</div>
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "8px 0 0", lineHeight: 1.45, maxWidth: 640 }}>
				Privacy: area demand uses anonymized buyer delivery-address aggregates snapped to a ~4.4 km grid; circles appear only when {data?.k_anonymity ?? 5}+ different buyers share a cell. Exact addresses are never shown or returned by the API.
			</p>
			{/* Diagnostic counters are for us, not for sellers — dev builds only. */}
			{empty && import.meta.env.DEV && (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "8px 0 0", lineHeight: 1.45 }}>
					Debug: my orders {meta.my_orders ?? 0} · distinct buyers {meta.my_distinct_buyers ?? 0} · mapped {meta.points_with_geo ?? 0} · in area {meta.points_in_radius ?? 0}
				</p>
			)}
		</div>
	);
}
