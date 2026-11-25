import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { filterVendors, getFoodItems } from '../api/food';
import { useViewport } from "../hooks/useViewport.js";
import { GroceriesIcon, SearchIcon } from "../components/icons.jsx";
import { Skel } from "../components/skeletons.jsx";
import { LeoButton, AddressAutocomplete } from "../components/shared.jsx";
import { FoodCheckoutPage, FoodTrackingPage } from "./Food.jsx";
import { CartPage as FoodCartPage } from "../components/shared-shopping/SharedShopping.jsx";
import { SafeImage } from "../components/SafeImage.jsx";
import { saveAddress } from "../api/user";
import { getUser } from "../store/auth";
import { getLocationItem, setLocationItem } from "../utils/userLocation.js";
import { SHOP_TEST_NAME_PATTERN } from "../utils/shopMappers.js";
import { parseVendorPromo } from "../utils/promoBadge.js";

const GROCERY_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "category-fruits", labelKey: "groceries.categoryFruits", color: "#f59e0b", match: "Fruits" },
	{ id: "category-vegetables", labelKey: "groceries.categoryVegetables", color: "#059669", match: "Vegetables" },
	{ id: "category-dairy", labelKey: "groceries.categoryDairy", color: "#0891b2", match: "Dairy" },
	{ id: "category-meat", labelKey: "groceries.categoryMeat", color: "#dc2626", match: "Meat" },
	{ id: "category-bakery", labelKey: "groceries.categoryBakery", color: "#d97706", match: "Bakery" },
	{ id: "category-snacks", labelKey: "groceries.categorySnacks", color: "#7c3aed", match: "Snacks" },
	{ id: "category-drinks", labelKey: "groceries.categoryDrinks", color: "#2563eb", match: "Drinks" },
	{ id: "category-frozen", labelKey: "groceries.categoryFrozen", color: "#06b6d4", match: "Frozen" },
];

const GROCERY_ITEM_IMAGES = {
	Fruits: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=700&q=80",
	Vegetables: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=700&q=80",
	Dairy: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=700&q=80",
	Meat: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=700&q=80",
	Bakery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80",
	Snacks: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=700&q=80",
	Drinks: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=700&q=80",
	Frozen: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=700&q=80",
	General: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=700&q=80",
};

function getItemStockStatus(item) {
	if (!item) return { status: "in", count: null };
	if (item.stockStatus) return { status: item.stockStatus, count: item.stockCount ?? null };
	if (item.inStock === false || item.is_available === false) return { status: "out", count: 0 };
	const rawCount = item.stockCount ?? item.stock_qty ?? item.stock_quantity ?? item.inventory_quantity ?? item.quantity_available ?? item.quantity ?? null;
	const count = rawCount == null || rawCount === "" ? null : Number(rawCount);
	if (Number.isFinite(count)) {
		if (count <= 0) return { status: "out", count };
		if (count <= 3) return { status: "low", count };
	}
	return { status: "in", count: Number.isFinite(count) ? count : null };
}

function isLightHex(hex) {
	const clean = String(hex || "").replace("#", "");
	if (clean.length !== 6) return false;
	const r = parseInt(clean.slice(0, 2), 16);
	const g = parseInt(clean.slice(2, 4), 16);
	const b = parseInt(clean.slice(4, 6), 16);
	return (r * 299 + g * 587 + b * 114) / 1000 > 170;
}

function getDistance(lat1, lon1, lat2, lon2) {
	if ([lat1, lon1, lat2, lon2].some(v => v == null || !Number.isFinite(Number(v)))) return null;
	const R = 6371; // Radius of the earth in km
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLon = (lon2 - lon1) * Math.PI / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

const groceryShell = (isMobile) => ({
	flex: 1,
	display: "flex",
	flexDirection: "column",
	overflowY: "auto",
	paddingLeft: isMobile ? 14 : 108,
	paddingRight: isMobile ? 14 : 48,
	paddingBottom: isMobile ? 18 : 0,
});

const groceryPanel = {
	boxShadow: "0 16px 46px var(--color-shadow)",
};
// NOTE: groceryPanel previously also set background/border (var(--color-surface) /
// 1px solid var(--color-border)); those are now applied via className "bg-surface border
// border-border" at each spread call-site below, since a shared style object can't carry
// a className.

const groceryMetric = (label, value, accent = "#2563eb") => (
	<div style={{ minWidth: 0 }}>
		<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{label}</p>
		<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 800, color: value === i18n.t("common.free") ? accent : "var(--color-text-primary)", margin: "2px 0 0" }}>{value}</p>
	</div>
);

function GroceryBackButton({ onClick, children = i18n.t("common.back"), style, ariaLabel }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={ariaLabel || (typeof children === "string" ? children : i18n.t("common.back"))}
			className="border border-border bg-surface-raised text-text-secondary"
			style={{
				borderRadius: 8,
				cursor: "pointer",
				fontFamily: "'DM Sans', sans-serif",
				fontSize: 13,
				fontWeight: 800,
				display: "inline-flex",
				alignItems: "center",
				gap: 7,
				padding: "9px 11px",
				backdropFilter: "blur(12px)",
				...style,
			}}
			onMouseEnter={e => {
				e.currentTarget.style.background = "var(--color-border)";
				e.currentTarget.style.color = "var(--color-text-primary)";
			}}
			onMouseLeave={e => {
				e.currentTarget.style.background = style?.background || "var(--color-surface-raised)";
				e.currentTarget.style.color = style?.color || "var(--color-text-secondary)";
			}}
		>
			<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
			<span>{children}</span>
		</button>
	);
}

function GroceryModeToggle({ mode, setMode, isMobile }) {
	const choose = (id) => {
		setMode(id);
		if (id === "seller") window.__nav?.("sd-groceries");
	};
	return (
		<div className="bg-surface-glass border border-border" style={{
			position: isMobile ? "static" : "absolute",
			top: isMobile ? "auto" : 14,
			right: isMobile ? "auto" : 14,
			zIndex: 5,
			alignSelf: isMobile ? "flex-start" : "auto",
			display: "inline-grid",
			gridTemplateColumns: "1fr 1fr",
			gap: 3,
			padding: 3,
			borderRadius: 999,
			// Floating glass pill over the panel's decorative gradient — surface-glass is
			// near-opaque white in light theme, so the inactive tab label below must use a
			// token that flips with it (was a fixed white-alpha, invisible on a light pill).
			boxShadow: "0 10px 28px var(--color-shadow)",
			backdropFilter: "blur(14px)",
		}}>
			{[
				["purchaser", i18n.t("groceries.buyer")],
				["seller", i18n.t("groceries.seller")],
			].map(([id, label]) => {
				const active = mode === id;
				return (
					<button key={id} type="button" onClick={() => choose(id)} style={{
						border: "none",
						borderRadius: 999,
						background: active ? "#fff" : "transparent",
						color: active ? "#101016" : "var(--color-text-secondary)",
						fontFamily: "'DM Sans', sans-serif",
						fontSize: 11,
						fontWeight: 850,
						padding: "7px 10px",
						cursor: "pointer",
						whiteSpace: "nowrap",
					}}>
						{label}
					</button>
				);
			})}
		</div>
	);
}

function GroceryEntryPanel({ isMobile, locationConfirmed, deliveryAddr, locationInput, setLocationInput, onLocationConfirm }) {
	return (
		<div className="bg-surface border border-border" style={{ ...groceryPanel, borderRadius: 8, padding: isMobile ? 14 : 16, marginTop: 14, position: "relative", overflow: "visible" }}>
			{/* Recessed "well" nested inside the panel — uses --color-bg (page background) rather
				than a surface token so it reads as a groove below the card in both themes. */}
			<div className="bg-bg border border-border" style={{ borderRadius: 8, padding: isMobile ? 12 : 14, overflow: "visible", position: "relative", zIndex: 3 }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
						<div>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 850, color: "#22c55e", letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{i18n.t("groceries.locationStep")}</p>
							<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 27 : 31, lineHeight: 0.95, fontWeight: 850, letterSpacing: "0.04em", textTransform: "uppercase", margin: "5px 0 0" }}>{i18n.t("groceries.chooseDeliveryLocation")}</h2>
						</div>
						{locationConfirmed && (
							<span style={{ borderRadius: 999, border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.12)", color: "#bbf7d0", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 850, padding: "6px 9px", whiteSpace: "nowrap" }}>{i18n.t("groceries.ready")}</span>
						)}
					</div>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.45, margin: "0 0 12px" }}>
						{locationConfirmed ? i18n.t("groceries.storesSortedFor", { location: deliveryAddr.split(",")[0] }) : i18n.t("groceries.selectLocationFirst")}
					</p>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) auto", gap: 10, alignItems: "center", overflow: "visible" }}>
						<AddressAutocomplete
							value={locationInput}
							useLocation
							wrapStyle={{ width: "100%", minWidth: 0 }}
							onChange={(val, lat, lng) => {
								setLocationInput(val);
								if (lat != null && lng != null) onLocationConfirm(val, lat, lng);
							}}
							onEnter={(val) => onLocationConfirm(val)}
							placeholder={i18n.t("groceries.enterDeliveryAddress")}
							inputStyle={{ width: "100%", background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", outline: "none", color: "var(--color-text-primary)", fontSize: 15, fontFamily: "'DM Sans', sans-serif", padding: "13px 14px", borderRadius: 8, boxSizing: "border-box" }}
						/>
						<button type="button" onClick={() => onLocationConfirm(locationInput)} style={{ border: "none", background: "#2563eb", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 850, padding: "13px 16px", cursor: "pointer", whiteSpace: "nowrap", minHeight: 46 }}>
							{locationInput ? i18n.t("groceries.useLocation") : i18n.t("groceries.setLocation")}
						</button>
					</div>
				</div>
		</div>
	);
}

function GroceryLocationConfirmModal({ address, onConfirm, onChange }) {
	return (
		// Modal backdrop stays a fixed dark scrim regardless of theme (standard dimming
		// convention for full-screen overlays) — only the dialog panel itself is tokenized.
		<div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }}>
			<div className="border border-border bg-surface" style={{ width: "100%", maxWidth: 430, borderRadius: 12, boxShadow: "0 24px 80px var(--color-shadow)", padding: 20 }}>
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 850, color: "#22c55e", letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 8px" }}>{i18n.t("groceries.confirmLocation")}</p>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, lineHeight: 0.95, fontWeight: 850, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{i18n.t("groceries.useThisDeliveryAddress")}</h2>
				<div className="bg-surface-raised border border-border" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, padding: 12, borderRadius: 8 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.45, margin: 0, wordBreak: "break-word" }}>{address}</p>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
					<button type="button" onClick={onChange} className="border border-border bg-surface-raised text-text-secondary" style={{ borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 850, padding: "12px 14px", cursor: "pointer" }}>{i18n.t("groceries.changeLocation")}</button>
					<button type="button" onClick={onConfirm} style={{ border: "none", background: "#2563eb", borderRadius: 8, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 900, padding: "12px 14px", cursor: "pointer" }}>{i18n.t("groceries.confirmLocationAction")}</button>
				</div>
			</div>
		</div>
	);
}

function GroceryStoreCard({ store, delay = 0, onOpen, isMobile }) {
	const [hov, setHov] = useState(false);
	const cover = store.img;
	const unavailable = i18n.t("food.distanceUnavailable", { defaultValue: "Unavailable" });
	const deliveryLabel = store.fee == null ? unavailable : store.fee === 0 ? i18n.t("common.free") : `$${store.fee.toFixed(2)}`;
	const minimumLabel = store.minOrder == null ? unavailable : `$${store.minOrder}`;
	const distanceLabel = store.dist == null ? unavailable : i18n.t("groceries.kmAway", { distance: store.dist.toFixed(1) });
	return (
		<button
			type="button"
			onClick={onOpen}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			className="bg-surface"
			style={{
				border: "1px solid var(--color-border)",
				borderRadius: 8,
				padding: 0,
				cursor: "pointer",
				overflow: "hidden",
				textAlign: "left",
				boxShadow: hov ? "0 18px 50px var(--color-shadow)" : "0 8px 24px var(--color-shadow)",
				transform: hov ? "translateY(-3px)" : "none",
				transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
				borderColor: hov ? "rgba(37,99,235,0.5)" : "var(--color-border)",
				animation: `fadeUp 0.3s ease ${delay}ms both`,
			}}
		>
			{/* Cover photo area — placeholder gradient + bottom scrim stay dark regardless of
				theme so the white name/rating/delivery text overlaid on it stays legible. */}
			<div style={{ height: isMobile ? 132 : 154, position: "relative", overflow: "hidden", background: "linear-gradient(135deg,#121926,#101016 55%,#14211c)" }}>
				{cover ? (
					<SafeImage loading="lazy" decoding="async" src={cover} alt={store.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} fallback={<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.32)" }}><GroceriesIcon s={44} /></div>} />
				) : (
					<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.32)" }}>
						<GroceriesIcon s={44} />
					</div>
				)}
				<div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.72))" }} />
				{store.promo && (
					<div style={{ position: "absolute", top: 12, left: 12, maxWidth: "calc(100% - 24px)", background: "#2563eb", borderRadius: 6, padding: "3px 10px" }}>
						<span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{store.promo}</span>
					</div>
				)}
				<div style={{ position: "absolute", left: 12, right: 12, bottom: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
					<div style={{ minWidth: 0 }}>
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, lineHeight: 1.15, fontWeight: 850, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{store.name}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.68)", margin: "4px 0 0" }}>{store.delivery || unavailable}</p>
						</div>
						{store.rating != null && (
							<div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.58)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 8px" }}>
								<svg width={11} height={11} viewBox="0 0 24 24" fill="#f59e0b"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800, color: "#fff" }}>{store.rating}</span>
							</div>
						)}
					</div>
				</div>
				<div style={{ padding: 14 }}>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
						{groceryMetric(i18n.t("groceries.arrival"), store.eta || unavailable)}
						{groceryMetric(i18n.t("groceries.delivery"), deliveryLabel)}
						{groceryMetric(i18n.t("groceries.minimum"), minimumLabel)}
					</div>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border-subtle)" }}>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{distanceLabel}</span>
					<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6 }}>
						{i18n.t("groceries.shopNow")}
						<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</span>
				</div>
			</div>
		</button>
	);
}

function GroceryItemCard({ item, qty = 0, onAdd, onInc, onDec }) {
	const [hov, setHov] = useState(false);
	const cover = item.img || item.image_url || item.photo_url || GROCERY_ITEM_IMAGES[item.category] || GROCERY_ITEM_IMAGES.General;
	const stock = getItemStockStatus(item);
	const isOut = stock.status === "out";
	const isLow = stock.status === "low";
	const maxQty = Number.isFinite(stock.count) && stock.count > 0 ? stock.count : null;
	const maxReached = maxQty != null && qty >= maxQty;
	const addTextColor = isLightHex(item.accent) ? "#101016" : "#fff";
	return (
		<div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
			className="bg-surface"
			style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${isOut ? "rgba(248,113,113,0.28)" : hov ? "rgba(37,99,235,0.42)" : "var(--color-border)"}`, transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s", transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? "0 14px 34px var(--color-shadow)" : "0 8px 20px var(--color-shadow)", display: "flex", flexDirection: "column", minHeight: 242, opacity: isOut ? 0.76 : 1 }}>
			{/* Image/icon placeholder area — dark backdrop + scrim stay fixed regardless of
				theme so the white category badge and item icon overlaid on it stay legible. */}
			<div style={{ height: 128, background: `linear-gradient(135deg, #111827 0%, ${item.accent}22 100%)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
				{cover ? (
					<SafeImage loading="lazy" decoding="async" src={cover} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: hov ? "scale(1.04)" : "scale(1)", transition: "transform 0.22s ease", opacity: 0.92 }} fallback={<svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={item.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.64 }}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>} />
				) : (
					<svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={item.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.64 }}>
						<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
					</svg>
				)}
				<div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.38))" }} />
				<div style={{ position: "absolute", left: 10, top: 10, borderRadius: 999, padding: "4px 8px", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.68)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.category}</div>
				{(isLow || isOut) && (
					<div style={{ position: "absolute", right: 10, top: 10, borderRadius: 999, padding: "4px 8px", background: isOut ? "rgba(127,29,29,0.82)" : "rgba(146,64,14,0.84)", border: `1px solid ${isOut ? "rgba(248,113,113,0.32)" : "rgba(251,191,36,0.32)"}`, fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 900, color: isOut ? "#fecaca" : "#fde68a", textTransform: "uppercase", letterSpacing: "0.04em" }}>
						{isOut ? i18n.t("groceries.outOfStock") : i18n.t("groceries.lowStock")}
					</div>
				)}
				{isOut && (
					<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
						<span style={{ fontSize: 11, fontWeight: 900, color: "#fecaca", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.05em", textTransform: "uppercase" }}>{i18n.t("groceries.outOfStock")}</span>
					</div>
				)}
			</div>
			<div style={{ padding: "12px 13px 13px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12 }}>
				<div>
					<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 800, fontFamily: "'DM Sans', sans-serif", marginBottom: 4, lineHeight: 1.25 }}>{item.name}</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{item.unit}</p>
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<span className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>${item.price.toFixed(2)}</span>
					{!isOut ? (
						qty === 0 ? (
							<button onClick={onAdd} style={{ background: item.accent, border: "none", borderRadius: 999, minWidth: 76, padding: "8px 14px", fontSize: 12, fontWeight: 800, color: addTextColor, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", boxShadow: "0 8px 18px rgba(37,99,235,0.28)" }}>{i18n.t("catering.add")}</button>
						) : (
							// Stepper pill background is a translucent brand-blue tint, so it renders
							// pale in light theme instead of dark — fixed white text/icon fills here
							// would go near-invisible, so they use --color-text-primary (flips to
							// near-black in light) and --color-border (flips to a dark neutral) instead.
							<div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(37,99,235,0.16)", border: "1px solid rgba(37,99,235,0.32)", borderRadius: 999, padding: "5px 8px" }}>
								<button onClick={onDec} className="bg-border text-text-primary" style={{ border: "none", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 0, width: 22, height: 22, borderRadius: "50%" }}>−</button>
								<span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Sans', sans-serif", minWidth: 14, textAlign: "center" }}>{qty}</span>
								<button onClick={maxReached ? undefined : onInc} disabled={maxReached} title={maxReached ? i18n.t("groceries.maxQuantityReached") : i18n.t("groceries.addOneMore")} style={{ background: maxReached ? "var(--color-border)" : "#2563eb", border: "none", color: maxReached ? "var(--color-text-muted)" : "#fff", fontSize: 16, cursor: maxReached ? "default" : "pointer", lineHeight: 1, padding: 0, width: 22, height: 22, borderRadius: "50%" }}>+</button>
							</div>
						)
					) : (
						<span style={{ borderRadius: 999, padding: "7px 10px", background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.24)", color: "#fecaca", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 850 }}>{i18n.t("groceries.unavailable")}</span>
					)}
				</div>
			</div>
		</div>
	);
}

function GroceriesPage() {
	const { t, landingTitle } = usePageI18n("groceries");
	const categories = useI18nCategoryList(GROCERY_CATEGORY_DEFS);
	const groceryCategories = useMemo(() => categories.map(cat => ({
		...cat,
		img: cat.match ? (GROCERY_ITEM_IMAGES[cat.match] || GROCERY_ITEM_IMAGES.General) : GROCERY_ITEM_IMAGES.General,
	})), [categories]);
	const { isMobile } = useViewport();
	const hasSavedLocation = () => {
		if (getLocationItem('strug_user_address')) return true;
		try {
			const loc = getLocationItem('strug_user_location');
			if (loc) {
				const parsed = JSON.parse(loc);
				if (parsed?.address) return true;
			}
		} catch {}
		return !!getUser()?.saved_address;
	};
	const [deliveryAddr, setDeliveryAddr] = useState(() => {
		const saved = getLocationItem('strug_user_address');
		if (saved) return saved;
		try {
			const loc = getLocationItem('strug_user_location');
			if (loc) { const p = JSON.parse(loc); if (p.address) return p.address; }
		} catch {}
		return getUser()?.saved_address || "";
	});
	const [addressSet, setAddressSet] = useState(() => {
		const saved = getLocationItem('strug_user_address');
		if (saved) return true;
		try {
			const loc = getLocationItem('strug_user_location');
			if (loc) { const p = JSON.parse(loc); if (p.address) return true; }
		} catch {}
		return !!(getUser()?.saved_address);
	});
	const [locationConfirmed, setLocationConfirmed] = useState(false);
	const [showLocationConfirm, setShowLocationConfirm] = useState(() => hasSavedLocation());
	useEffect(() => {
		if (!addressSet) {
			const saved = getUser()?.saved_address;
			if (saved) { setDeliveryAddr(saved); setAddressSet(true); setShowLocationConfirm(true); }
		}
	}, []);
	const [showAddrEdit, setShowAddrEdit] = useState(false);
	const [addrInput, setAddrInput] = useState("");
	const [locationInput, setLocationInput] = useState(deliveryAddr);
	const [registrationMode, setRegistrationMode] = useState("purchaser");
	useEffect(() => {
		if (deliveryAddr) setLocationInput(deliveryAddr);
	}, [deliveryAddr]);
	const [sortBy, setSortBy] = useState("recommended");
	const [storeQuery, setStoreQuery] = useState("");
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [activeStore, setActiveStore] = useState(null);
	const [cart, setCart] = useState([]); // [{ ...item, qty, lineId }]
	const [grocView, setGrocView] = useState("stores"); // stores | browse | cart | checkout | tracking
	const [groceryOrder, setGroceryOrder] = useState(null);
	const [groceryDeliveryMode, setGroceryDeliveryMode] = useState("delivery");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [grocView]);
	const [groceryStores, setGroceryStores] = useState([]);
	const [groceryItems, setGroceryItems] = useState([]);
	const [storesLoading, setStoresLoading] = useState(true);
	const [itemsLoading, setItemsLoading] = useState(false);
	useEffect(() => {
		if (!locationConfirmed) {
			setGroceryStores([]);
			setStoresLoading(false);
			return;
		}
		const lat = getLocationItem('strug_user_lat');
		const lng = getLocationItem('strug_user_lng');
		setStoresLoading(true);
			filterVendors({ type: "Grocery", lat, lng }).then(r => {
				const list = Array.isArray(r) ? r : (r?.data ?? []);
				const mapped = list.filter(v => !SHOP_TEST_NAME_PATTERN.test(String(v.vendor_name || ""))).map(v => ({
					id: v.vendor_id,
					name: v.vendor_name || "Store",
					eta: null,
					rating: Number.isFinite(Number(v.rating)) ? Number(v.rating) : null,
					reviews: Number.isFinite(Number(v.review_count ?? v.reviews_count)) ? Number(v.review_count ?? v.reviews_count) : null,
					fee: Number.isFinite(Number(v.delivery_fee)) ? Number(v.delivery_fee) : null,
					color: "#1e1035", accent: "#2563eb",
					minOrder: Number.isFinite(Number(v.min_order_value)) ? Number(v.min_order_value) : null,
					lat: v.lat,
					lng: v.long,
					owner_id: v.owner_id,
					vendor_type_id: v.vendor_type_id,
					// Seller-created Opportunities promo badge (same parsing as Food browse).
					promo: parseVendorPromo(v).promo,
					// Storefront hero image prefers the dedicated wide banner (#332), then the
				// cover, then the logo (BUG #330: uploaded covers weren't reaching the storefront).
				img: v.banner_url ?? v.cover_url ?? v.logo_url ?? null,
			}));
			setGroceryStores(mapped);
		}).catch(() => setGroceryStores([])).finally(() => setStoresLoading(false));
	}, [locationConfirmed, deliveryAddr]);

	const shopsWithDist = useMemo(() => {
		const savedLat = getLocationItem('strug_user_lat');
		const savedLng = getLocationItem('strug_user_lng');
		let userLat = savedLat != null ? parseFloat(savedLat) : null;
		let userLng = savedLng != null ? parseFloat(savedLng) : null;
			if (!Number.isFinite(userLat)) userLat = null;
			if (!Number.isFinite(userLng)) userLng = null;
			if (userLat === null || userLng === null) {
				const userLocStr = getLocationItem('strug_user_location');
				const userLoc = userLocStr ? JSON.parse(userLocStr) : null;
				userLat = Number.isFinite(Number(userLoc?.lat)) ? Number(userLoc.lat) : null;
				userLng = Number.isFinite(Number(userLoc?.lng)) ? Number(userLoc.lng) : null;
			}

			return groceryStores.map(v => {
				const lat = Number.isFinite(Number(v.lat)) ? Number(v.lat) : null;
				const lng = Number.isFinite(Number(v.lng)) ? Number(v.lng) : null;
				const dist = getDistance(userLat, userLng, lat, lng);
				const eta = dist == null ? null : 15 + Math.round(dist * 6);
				return {
					...v,
					lat,
					lng,
					dist,
					eta: eta == null ? null : `${eta} min`,
					etaNum: eta,
					delivery: eta == null || dist == null ? null : `${eta - 3}–${eta + 5} min (${dist.toFixed(1)} km)`,
				};
			});
	}, [groceryStores, deliveryAddr]);

	const filteredShops = useMemo(() => {
		return shopsWithDist.filter(s =>
			!storeQuery || s.name.toLowerCase().includes(storeQuery.toLowerCase())
		);
	}, [shopsWithDist, storeQuery]);

	const sortedShops = useMemo(() => {
		let list = [...filteredShops];
		if (sortBy === "distance") {
			list.sort((a, b) => (a.dist ?? Number.POSITIVE_INFINITY) - (b.dist ?? Number.POSITIVE_INFINITY));
		} else if (sortBy === "rating") {
			list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
		} else if (sortBy === "speed") {
			list.sort((a, b) => (a.etaNum ?? Number.POSITIVE_INFINITY) - (b.etaNum ?? Number.POSITIVE_INFINITY));
		}
		return list;
	}, [filteredShops, sortBy]);

	useEffect(() => {
		if (!activeStore) { setGroceryItems([]); return; }
			setItemsLoading(true);
			getFoodItems({ vendor_id: activeStore }).then(r => {
				const list = Array.isArray(r) ? r : (r?.data ?? []);
				const mapped = list.filter(item => !SHOP_TEST_NAME_PATTERN.test(String(item.name ?? item.item_name ?? ""))).map(item => {
				const stock = getItemStockStatus(item);
				const category = (item.food_category?.name ?? item.item_category?.category_name) || "General";
				return {
					id: item.food_item_id ?? item.item_id,
					name: (item.name ?? item.item_name) || "Item",
					category,
					price: Number(item.price) || 0,
					unit: item.unit || "each",
					store: activeStore,
					color: "#1e1035", accent: "#2563eb",
					img: item.image_url ?? item.image ?? item.photo_url ?? item.cover_url ?? GROCERY_ITEM_IMAGES[category] ?? GROCERY_ITEM_IMAGES.General,
					stockStatus: stock.status,
					stockCount: stock.count,
					inStock: stock.status !== "out",
				};
			});
			setGroceryItems(mapped);
		}).catch(() => setGroceryItems([])).finally(() => setItemsLoading(false));
	}, [activeStore]);
	const grocCatScrollRef = useRef(null);
	const [grocCatScrollState, setGrocCatScrollState] = useState({ atStart: true, atEnd: true });
	useLayoutEffect(() => {
		const el = grocCatScrollRef.current;
		if (!el) return;
		const update = () => setGrocCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [grocView]);

	const confirmGroceryAddress = (addr, lat, lng) => {
		const clean = String(addr || "").trim();
		if (!clean) return;
		setDeliveryAddr(clean);
		setLocationInput(clean);
		setAddressSet(true);
		setLocationConfirmed(true);
		setShowLocationConfirm(false);
		setGrocView("stores");
		try {
			setLocationItem('strug_user_address', clean);
			if (lat != null) setLocationItem('strug_user_lat', String(lat));
			if (lng != null) setLocationItem('strug_user_lng', String(lng));
		} catch {}
		saveAddress({ saved_address: clean }).catch(() => {});
	};

	if (grocView === "cart") return <FoodCartPage cart={cart} setCart={setCart} onBack={() => setGrocView("browse")} onCheckout={() => setGrocView("checkout")} backLabel={i18n.t("groceries.backToStore")} emptyLabel={t("browseShop")} vertical="grocery" />;
	const currentStore = shopsWithDist.find(s => s.id === activeStore);
	if (grocView === "checkout") return <FoodCheckoutPage
		cart={cart}
		onBack={() => setGrocView("cart")}
		onPlaceOrder={(orderId, mode) => {
			setGroceryOrder({ id: orderId ? `GRC-${orderId}` : null, serverOrderId: orderId ?? null, status: "pending" });
			if (mode) setGroceryDeliveryMode(mode);
			setGrocView("tracking");
			saveAddress({ saved_address: deliveryAddr }).catch(() => {});
		}}
		restaurant={currentStore}
		vendorTypeId={currentStore?.vendor_type_id}
		deliveryAddr={deliveryAddr}
		vertical="groceries"
		itemSource="food"
	/>;
	if (grocView === "tracking") return <FoodTrackingPage
		restaurant={currentStore || { name: t("title") }}
		orderId={groceryOrder?.serverOrderId}
		deliveryMode={groceryDeliveryMode}
		merchantType="store"
		onDone={() => { setCart([]); setGroceryOrder(null); setGrocView("stores"); }}
		onBack={() => setGrocView("stores")}
	/>;

	function getQty(id) { const e = cart.find(c => c.id === id); return e ? e.qty : 0; }
	function canAddMore(item) {
		const stock = getItemStockStatus(item);
		return !(Number.isFinite(stock.count) && stock.count > 0 && item.qty >= stock.count);
	}
	function addItem(item) { setCart(p => { const e = p.find(c => c.id === item.id); if (e) return p.map(c => c.id === item.id && canAddMore(c) ? { ...c, qty: c.qty + 1 } : c); return [...p, { ...item, qty: 1, lineId: Date.now(), gradient: `linear-gradient(135deg, ${item.color}, ${item.accent}55)`, extras: [] }]; }); }
	function incItem(id) { setCart(p => p.map(c => c.id === id && canAddMore(c) ? { ...c, qty: c.qty + 1 } : c)); }
	function decItem(id) { setCart(p => p.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c).filter(c => c.qty > 0)); }

	const cartCount = cart.reduce((s, i) => s + i.qty, 0);
	const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
	const goBackToHome = () => {
		if (typeof window !== "undefined" && window.__nav) window.__nav("home");
		else if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
	};
	

	// ── Stores listing ──────────────────────────────────────────────────────
	if (grocView === "stores") return (
		<div style={groceryShell(isMobile)}>
			{showLocationConfirm && deliveryAddr && (
				<GroceryLocationConfirmModal
					address={deliveryAddr}
					onConfirm={() => confirmGroceryAddress(deliveryAddr)}
					onChange={() => {
						setShowLocationConfirm(false);
						setLocationConfirmed(false);
						setLocationInput(deliveryAddr);
					}}
				/>
			)}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1180, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: isMobile ? "18px 0 18px" : "26px 0 22px", animation: "fadeUp 0.3s ease both" }}>
					<GroceryBackButton onClick={goBackToHome} style={{ marginBottom: 12 }}>Back to home</GroceryBackButton>
					<div className="bg-surface border border-border" style={{ ...groceryPanel, borderRadius: 8, padding: isMobile ? 16 : 22, position: "relative", overflow: "visible" }}>
						<div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(37,99,235,0.16), rgba(5,150,105,0.08) 46%, rgba(0,0,0,0))", pointerEvents: "none" }} />
						<GroceryModeToggle mode={registrationMode} setMode={setRegistrationMode} isMobile={isMobile} />
						<div style={{ position: "relative", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.08fr) minmax(340px, 0.72fr)", gap: isMobile ? 18 : 28, alignItems: "center" }}>
							<div>
								<div className="border border-border bg-surface-raised" style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "6px 10px", marginBottom: 12 }}>
									<span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 4px rgba(34,197,94,0.12)" }} />
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800 }}>{i18n.t("groceries.deliveryBadge")}</span>
								</div>
								<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 850, fontSize: isMobile ? 36 : 54, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0, lineHeight: 0.92 }}>{landingTitle}</h1>
								<p className="text-text-secondary" style={{ fontSize: isMobile ? 14 : 15, fontFamily: "'DM Sans', sans-serif", margin: "10px 0 0", maxWidth: 520, lineHeight: 1.55 }}>{i18n.t("groceries.storeIntro")}</p>
							</div>
							<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
								{[
									[i18n.t("groceries.metricFast"), i18n.t("groceries.metricFastValue")],
									[i18n.t("groceries.metricFresh"), i18n.t("groceries.metricFreshValue")],
									[i18n.t("groceries.metricLocal"), locationConfirmed ? i18n.t("groceries.storeCount", { count: groceryStores.length }) : i18n.t("groceries.setLocation")],
								].map(([label, value]) => (
									// Recessed "well" tile — uses --color-bg like the entry-panel groove above.
									<div key={label} className="bg-bg border border-border" style={{ borderRadius: 8, padding: "12px 10px" }}>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{label}</p>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 850, margin: "5px 0 0" }}>{value}</p>
									</div>
								))}
							</div>
						</div>
					</div>

					{!locationConfirmed && (
						<GroceryEntryPanel
							isMobile={isMobile}
							locationConfirmed={locationConfirmed}
							deliveryAddr={deliveryAddr}
							locationInput={locationInput}
							setLocationInput={setLocationInput}
							onLocationConfirm={confirmGroceryAddress}
						/>
					)}

					{/* Delivery address bar — see/change where stores are sourced from */}
					{locationConfirmed && <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 10, marginTop: 14, position: "relative", flexDirection: isMobile ? "column" : "row" }}>
						<div className="bg-surface border border-border" style={{ ...groceryPanel, display: "flex", alignItems: "center", gap: 10, borderRadius: 8, padding: "10px 12px", minWidth: 0, cursor: "pointer", transition: "border-color 0.15s", flex: 1 }}
							onClick={() => { setShowAddrEdit(v => !v); setAddrInput(deliveryAddr); }}
							onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(37,99,235,0.45)"}
							onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
							<div style={{ minWidth: 0 }}>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: 0 }}>{addressSet ? i18n.t("groceries.deliveringTo") : i18n.t("groceries.browsingRegisteredStores")}</p>
								<span className="text-text-primary" style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deliveryAddr || i18n.t("groceries.setDeliveryLocation")}</span>
							</div>
							<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
						</div>
						<div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
							<button onClick={() => { setShowAddrEdit(true); setAddrInput(deliveryAddr); }} className="border border-border bg-surface-raised text-text-secondary" style={{ borderRadius: 8, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flex: isMobile ? 1 : "initial" }}>{addressSet ? i18n.t("food.landing.changeAddress") : i18n.t("groceries.setLocation")}</button>
							{/* Translucent brand-blue tint over a white card renders pale in light theme,
								so the fixed white label uses --color-text-primary to stay readable. */}
							{!isMobile && <button onClick={() => window.__nav?.("orders")} className="text-text-primary" style={{ border: "1px solid rgba(37,99,235,0.28)", background: "rgba(37,99,235,0.14)", borderRadius: 8, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{i18n.t("groceries.myOrders")}</button>}
						</div>
						{showAddrEdit && (
							<div className="bg-surface border border-border" style={{ position: "absolute", top: "calc(100% + 6px)", left: isMobile ? 0 : 0, width: isMobile ? "100%" : 440, maxWidth: "100%", borderRadius: 8, zIndex: 30, boxShadow: "0 12px 40px var(--color-shadow)", overflow: "visible", touchAction: "manipulation" }} onClick={e => e.stopPropagation()}>
								<AddressAutocomplete value={addrInput} useLocation wrapStyle={{ width: "100%" }}
									onChange={(val, lat, lng) => {
										setAddrInput(val);
										if (lat != null && lng != null) {
											confirmGroceryAddress(val, lat, lng);
											setShowAddrEdit(false);
										}
									}}
									onEnter={(val) => {
										if (!val.trim()) return;
										confirmGroceryAddress(val);
										setShowAddrEdit(false);
									}}
									placeholder={i18n.t("food.landing.enterNewAddress")}
									inputStyle={{ width: "100%", background: "none", border: "none", outline: "none", color: "var(--color-text-primary)", fontSize: 16, fontFamily: "'DM Sans', sans-serif", padding: "14px 16px", boxSizing: "border-box" }} />
							</div>
						)}
					</div>}
				</div>
				{!locationConfirmed ? null : storesLoading ? (
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, paddingBottom: 24 }}>
						{[...Array(6)].map((_,i) => <Skel key={i} h={238} r={8} />)}
					</div>
				) : groceryStores.length === 0 ? (
					<div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeUp 0.3s ease both" }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>{i18n.t("groceries.noStoresArea")}</p>
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("catering.tryDifferentAddress")}</p>
					</div>
				) : (
					<>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 1fr) auto", alignItems: "center", gap: 12, margin: "0 0 18px" }}>
							<div className="bg-surface border border-border" style={{ ...groceryPanel, borderRadius: 8, display: "flex", alignItems: "center", padding: "12px 14px", gap: 12 }}>
								<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={18} /></div>
								<input value={storeQuery} onChange={e => setStoreQuery(e.target.value)} placeholder={i18n.t("groceries.searchStores")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb", minWidth: 0 }} />
							</div>

							<div style={{ display: "flex", justifyContent: isMobile ? "flex-start" : "flex-end", gap: 8, overflowX: "auto", scrollbarWidth: "none", paddingBottom: isMobile ? 2 : 0 }}>
								{[{ id: "recommended", label: i18n.t("floral.sortRecommended") }, { id: "distance", label: i18n.t("floral.sortNearest") }, { id: "rating", label: i18n.t("floral.sortTopRated") }, { id: "speed", label: i18n.t("floral.sortFastest") }].map(opt => (
									// Active state background is a translucent brand-blue tint (pale in
									// light theme), so the active label uses --color-text-primary rather
									// than a fixed white to stay readable in both themes.
									<button key={opt.id} onClick={() => setSortBy(opt.id)} className={sortBy === opt.id ? "text-text-primary" : "text-text-secondary"} style={{
										display: "flex", alignItems: "center", gap: 6,
										padding: "9px 12px",
										borderRadius: 8,
										background: sortBy === opt.id ? "rgba(37, 99, 235, 0.16)" : "var(--color-surface-raised)",
										border: `1px solid ${sortBy === opt.id ? "rgba(37, 99, 235, 0.4)" : "var(--color-border)"}`,
										fontSize: 12,
										fontWeight: 800,
										fontFamily: "'DM Sans', sans-serif",
										cursor: "pointer",
										transition: "all 0.15s",
										whiteSpace: "nowrap",
										flexShrink: 0,
									}}>
										<span>{opt.label}</span>
									</button>
								))}
							</div>
						</div>

						{sortedShops.length === 0 ? (
							<div style={{ textAlign: "center", padding: "40px 20px", animation: "fadeUp 0.3s ease both" }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>{i18n.t("groceries.noStoresMatch")}</p>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("catering.tryDifferentSearch")}</p>
							</div>
						) : (
							<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, animation: "fadeUp 0.35s ease 60ms both", paddingBottom: 24 }}>
								{sortedShops.map((store, i) => {
									return (
										<GroceryStoreCard key={store.id} store={store} delay={i * 45} isMobile={isMobile} onOpen={() => { setActiveStore(store.id); setActiveCategory("all"); setQuery(""); setGrocView("browse"); }} />
									);
								})}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);

	// ── Browse store items ───────────────────────────────────────────────────
	const filtered = groceryItems.filter(item => {
		const matchCat = matchesCategory(activeCategory, item.category, categories);
		const matchStore = item.store === activeStore;
		const matchQ = !query || item.name.toLowerCase().includes(query.toLowerCase());
		return matchCat && matchStore && matchQ;
	});

	return (
		<div style={groceryShell(isMobile)}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 1180, margin: "0 auto", width: "100%" }}>
				<div style={{ padding: isMobile ? "16px 0 16px" : "24px 0 18px", animation: "fadeUp 0.3s ease both" }}>
					<div className="bg-surface border border-border" style={{ ...groceryPanel, borderRadius: 8, overflow: "hidden", position: "relative" }}>
						{/* Store hero photo — placeholder gradient + scrim stay dark regardless of
							theme so the white title/chips/back-button overlaid on it stay legible. */}
						<div style={{ height: isMobile ? 148 : 190, position: "relative", background: "linear-gradient(135deg,#101827,#121116 55%,#15251d)" }}>
							{currentStore?.img && <SafeImage src={currentStore.img} alt={currentStore.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.82 }} fallback={null} />}
							<div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.74))" }} />
							<GroceryBackButton
								onClick={() => setGrocView("stores")}
								ariaLabel={i18n.t("groceries.backToStores")}
								style={{ position: "absolute", top: 14, left: 14, background: "rgba(0,0,0,0.42)", color: "#fff", zIndex: 2 }}
							>
								Stores
							</GroceryBackButton>
							{cartCount > 0 && (
								<button onClick={() => setGrocView("cart")} style={{ position: "absolute", top: 14, right: 14, height: 36, borderRadius: 8, display: "flex", alignItems: "center", gap: 8, justifyContent: "center", background: "#2563eb", border: "none", color: "#fff", cursor: "pointer", padding: "0 12px", boxShadow: "0 4px 20px rgba(37,99,235,0.45)" }}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
									<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 850 }}>{cartCount}</span>
								</button>
							)}
							<div style={{ position: "absolute", left: 18, right: 18, bottom: 18 }}>
								<h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 850, fontSize: isMobile ? 36 : 48, color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase", margin: 0, lineHeight: 0.95 }}>{currentStore?.name ?? i18n.t("groceries.title")}</h1>
								{currentStore && (
									<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
											{[
												currentStore.eta,
												currentStore.fee == null ? null : currentStore.fee === 0 ? i18n.t("groceries.freeDelivery") : i18n.t("groceries.deliveryFee", { fee: `$${currentStore.fee.toFixed(2)}` }),
												currentStore.minOrder == null ? null : i18n.t("groceries.minimumAmount", { amount: `$${currentStore.minOrder}` }),
												currentStore.dist == null ? null : i18n.t("groceries.kmDistance", { distance: currentStore.dist.toFixed(1) }),
											].filter(Boolean).map(bit => (
											<span key={bit} style={{ borderRadius: 999, background: "rgba(0,0,0,0.38)", border: "1px solid rgba(255,255,255,0.1)", padding: "5px 9px", fontSize: 12, fontWeight: 800, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{bit}</span>
										))}
									</div>
								)}
							</div>
						</div>
						<div style={{ padding: isMobile ? 12 : 14, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(280px,1fr) auto", gap: 12, alignItems: "center" }}>
							<div className="bg-surface-raised border border-border" style={{ display: "flex", alignItems: "center", padding: "12px 14px", gap: 12, borderRadius: 8 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("groceries.searchStoreItems", { store: currentStore?.name ?? "" })} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb", minWidth: 0 }} />
							</div>
							<div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "space-between" : "flex-end", gap: 12 }}>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("groceries.itemsCount", { count: filtered.length })}</span>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("groceries.deliveryTo", { address: deliveryAddr ? deliveryAddr.split(",")[0] : i18n.t("groceries.you") })}</span>
							</div>
						</div>
					</div>
				</div>
				{/* Category filter with arrows */}
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18, animation: "fadeUp 0.35s ease 60ms both" }}>
					<button
						onClick={() => grocCatScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
						className={grocCatScrollState.atStart ? "bg-surface-raised text-text-muted" : "bg-border text-text-primary"}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, border: `1px solid ${grocCatScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"}`, cursor: grocCatScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && grocCatScrollState.atStart && grocCatScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && grocCatScrollState.atStart && grocCatScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={grocCatScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && grocCatScrollState.atStart && grocCatScrollState.atEnd) ? "center" : "flex-start" }}>
						{groceryCategories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					<button
						onClick={() => grocCatScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: grocCatScrollState.atEnd ? "var(--color-surface-raised)" : "#2563eb", border: `1px solid ${grocCatScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: grocCatScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: grocCatScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && grocCatScrollState.atStart && grocCatScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && grocCatScrollState.atStart && grocCatScrollState.atEnd) ? "none" : "auto", transition: "transform 0.12s, background 0.2s", boxShadow: grocCatScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				{/* Items grid */}
				<div style={{ marginBottom: cartCount > 0 ? 80 : 32, animation: "fadeUp 0.4s ease 150ms both" }}>
					{itemsLoading ? (
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
							{[...Array(10)].map((_,i) => <Skel key={i} h={242} r={8} />)}
						</div>
					) : filtered.length > 0 ? (
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(180px, 1fr))", gap: isMobile ? 10 : 14 }}>
							{filtered.map(item => <GroceryItemCard key={item.id} item={item} qty={getQty(item.id)} onAdd={() => addItem(item)} onInc={() => incItem(item.id)} onDec={() => decItem(item.id)} />)}
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.4, paddingTop: 60 }}>
							<GroceriesIcon s={40} />
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("groceries.noItemsFound")}</p>
						</div>
					)}
				</div>
				{/* Floating cart bar */}
				{cartCount > 0 && (
					<div style={{ position: "sticky", bottom: isMobile ? 78 : 16, zIndex: 55 }}>
						<button onClick={() => setGrocView("cart")} style={{ width: "100%", background: "#2563eb", border: "none", borderRadius: 14, padding: "15px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
							<div style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{cartCount}</span>
							</div>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#fff" }}>{i18n.t("shop.viewCart")}</span>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#fff" }}>${cartTotal.toFixed(2)}</span>
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

export { GroceriesPage };
