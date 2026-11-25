import React, { useEffect, useMemo, useState } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { useMoney } from "../hooks/useMoney.js";
import { SearchIcon } from "../components/icons.jsx";
import { Skel } from "../components/skeletons.jsx";
import { LeoButton, HostListingCTA } from "../components/shared.jsx";
import { CartPage as FoodCartPage, CheckoutPage as FoodCheckoutPage, TrackingPage as FoodTrackingPage, VERTICAL_PRODUCT_TYPE, mapListingsToVerticalCatalog, mapVerticalProductToCartLine, pickCheckoutProductTypeId, createVerticalPlaceOrderHandler } from "../components/shared-shopping/SharedShopping.jsx";
import { useResolvedProductTypeId } from "../hooks/useResolvedProductTypeId.js";
import { getBookingListings, getListingAvailability, createBooking, getBookingQuote, cancelBooking } from "../api/booking";
import { CardInput, useBookingPayment } from "../components/BookingPayment.jsx";
import { bindCheckoutReferralCode } from "../api/user";
import { attachWeddingBookingToPlan } from "../api/eventConcierge.js";
import { isAuthenticated } from "../store/auth";
import { messageUser } from "../api/chat";
import client from "../api/client";
import AddToWishlistButton from "../components/wishlist/AddToWishlistButton.jsx";
import {
	localTodayISO,
	rangeOverlapsUnavailable,
	expandBookedToUnavailableSet,
	inclusiveEventDays,
	formatWeddingDate,
	weddingItemAllowsTryOn,
	resolveVendorRating,
	weddingPlaceholderThumb,
	weddingPageInset,
	weddingPageBottom,
	weddingCardGrid,
	weddingCategoryRow,
	weddingContentShell,
	WEDDING_ACCENT,
	WEDDING_ACCENT_SOFT,
} from "./weddingUtils.js";
import { ConciergeEntryBanner } from "../components/ConciergeEntryBanner.jsx";
import { useTheme } from "../utils/theme.js";
import { BASE_CURRENCY } from "../utils/regionConfig.js";

const PAGE_SIZE = 50;
const DATE_INPUT_SCHEME = (theme) => (theme === "light" ? "light" : "dark");
/** Listing charge currency fallback — platform baseline, not Canada-specific UI. */
const LISTING_CURRENCY = BASE_CURRENCY;
const ACTION_BTN = {
	background: "rgba(219,40,119,0.12)",
	border: "1px solid rgba(219,40,119,0.35)",
	borderRadius: 10,
	padding: "9px 12px",
	fontFamily: "'DM Sans', sans-serif",
	fontWeight: 600,
	fontSize: 12,
	color: WEDDING_ACCENT_SOFT,
	cursor: "pointer",
	whiteSpace: "nowrap",
};

const WEDDING_SHOP_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#db2877", match: null },
	{ id: "shop-dresses", labelKey: "wedding.shopDresses", color: "#7c3aed", match: "Dresses" },
	{ id: "shop-rings", labelKey: "wedding.shopRings", color: "#d97706", match: "Rings" },
	{ id: "shop-accessories", labelKey: "wedding.shopAccessories", color: "#0891b2", match: "Accessories" },
	{ id: "shop-decor", labelKey: "wedding.shopDecor", color: "#059669", match: "Decor" },
	{ id: "shop-stationery", labelKey: "wedding.shopStationery", color: "#65a30d", match: "Stationery" },
];

const WEDDING_VENDOR_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#db2877", match: null },
	{ id: "venue", labelKey: "wedding.vendorVenue", color: "#7c3aed", match: "Venue" },
	{ id: "florist", labelKey: "wedding.vendorFlorist", color: "#16a34a", match: "Florist" },
	{ id: "videography", labelKey: "wedding.vendorVideography", color: "#2563eb", match: "Videography" },
	{ id: "photography", labelKey: "wedding.vendorPhotography", color: "#0891b2", match: "Photography" },
	{ id: "catering", labelKey: "wedding.vendorCatering", color: "#ef4444", match: "Catering" },
	{ id: "rental", labelKey: "wedding.vendorRental", color: "#d97706", match: "Rental" },
];

function thumbStyle(thumb) {
	const t = thumb || weddingPlaceholderThumb();
	return typeof t === "string" && t.startsWith("http")
		? `url(${t}) center/cover no-repeat`
		: t;
}

function WeddingShopPage({ onBack, onOpenMyTryOns }) {
	const { isMobile, isTablet } = useViewport();
	const pageInset = weddingPageInset(isMobile, isTablet);
	const pageBottom = weddingPageBottom(isMobile);
	const { money } = useMoney();
	const [theme] = useTheme();
	const categories = useI18nCategoryList(WEDDING_SHOP_CATEGORY_DEFS);
	const [activeCat, setActiveCat] = useState("all");
	const [cart, setCart] = useState([]);
	const [shopView, setShopView] = useState("stores"); // stores | browse | cart | checkout | tracking
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [shopView]);
	const [selectedItem, setSelectedItem] = useState(null);
	const [tryOnOpen, setTryOnOpen] = useState(false);
	const [tryOnDate, setTryOnDate] = useState("");
	const [tryOnSent, setTryOnSent] = useState(false);
	const [tryOnBusy, setTryOnBusy] = useState(false);
	const [tryOnError, setTryOnError] = useState(null);
	const [shItems, setShItems] = useState([]);
	const [shShops, setShShops] = useState([]);
	const [activeShop, setActiveShop] = useState(null);
	const [query, setQuery] = useState("");
	const [placedOrderId, setPlacedOrderId] = useState(null);
	const [deliveryMode, setDeliveryMode] = useState("ship_by_seller");
	const [shopLoadError, setShopLoadError] = useState(false);
	const [shopLoading, setShopLoading] = useState(true);
	const [shopTotal, setShopTotal] = useState(0);
	const [shopOffset, setShopOffset] = useState(0);
	const [shopLoadingMore, setShopLoadingMore] = useState(false);
	const resolvedProductTypeId = useResolvedProductTypeId(VERTICAL_PRODUCT_TYPE.wedding);

	const mergeCatalog = React.useCallback((list, append) => {
		const { products, shops } = mapListingsToVerticalCatalog(list, {
			hideStoresWithoutCoords: false,
			excludeTestNames: true,
		});
		const mappedProducts = products.map((p) => ({
			...p,
			allowsTryOn: weddingItemAllowsTryOn(p.category),
			currency: p.currency || LISTING_CURRENCY,
		}));
		const mappedShops = shops.map((s) => ({
			...s,
			eta: s.delivery || s.eta || "—",
			accent: WEDDING_ACCENT,
			color: "var(--color-surface-raised)",
		}));
		if (append) {
			setShItems((prev) => {
				const ids = new Set(prev.map((p) => p.id));
				return [...prev, ...mappedProducts.filter((p) => !ids.has(p.id))];
			});
			setShShops((prev) => {
				const ids = new Set(prev.map((s) => s.id));
				return [...prev, ...mappedShops.filter((s) => !ids.has(s.id))];
			});
		} else {
			setShItems(mappedProducts);
			setShShops(mappedShops);
		}
	}, []);

	const loadShop = React.useCallback((offset = 0, append = false) => {
		if (append) setShopLoadingMore(true);
		else setShopLoading(true);
		return client.get("/wedding/products", { params: { limit: PAGE_SIZE, offset } })
			.then((res) => {
				const body = res?.data ?? res;
				const list = Array.isArray(body) ? body : (body?.data ?? []);
				const total = Number(body?.total);
				setShopTotal(Number.isFinite(total) ? total : list.length);
				setShopOffset(offset + list.length);
				mergeCatalog(list, append);
				setShopLoadError(false);
			})
			.catch(() => {
				if (!append) setShopLoadError(true);
			})
			.finally(() => {
				setShopLoading(false);
				setShopLoadingMore(false);
			});
	}, [mergeCatalog]);

	useEffect(() => { loadShop(0, false); }, [loadShop]);

	async function submitTryOn() {
		if (!tryOnDate || !selectedItem || tryOnBusy) return;
		if (tryOnDate < localTodayISO()) {
			setTryOnError(i18n.t("wedding.tryOnPastDate"));
			return;
		}
		if (!isAuthenticated()) {
			setTryOnError(i18n.t("events.loginToBook"));
			return;
		}
		setTryOnBusy(true);
		setTryOnError(null);
		try {
			await client.post('/wedding/try-on', {
				listing_id: selectedItem.id ?? selectedItem.listing_id,
				preferred_date: tryOnDate,
			});
			setTryOnSent(true);
		} catch (err) {
			setTryOnError(err?.response?.data?.error || i18n.t("wedding.tryOnFailed"));
		} finally {
			setTryOnBusy(false);
		}
	}

	const cartCount = cart.reduce((s, i) => s + i.qty, 0);

	function addToCart(item) {
		if (item?.isInStock === false) return;
		setCart(prev => {
			const line = mapVerticalProductToCartLine(item, 1);
			const e = prev.find(c => c.lineId === line.lineId);
			if (e) return prev.map(c => c.lineId === line.lineId ? { ...c, qty: c.qty + 1 } : c);
			return [...prev, line];
		});
	}

	const handlePlaceOrder = createVerticalPlaceOrderHandler({
		setOrderId: setPlacedOrderId,
		setDeliveryMode,
		setView: setShopView,
	});

	if (shopView === "cart") return <FoodCartPage cart={cart} setCart={setCart} onBack={() => setShopView("browse")} onCheckout={() => setShopView("checkout")} backLabel={i18n.t("wedding.backToShop")} emptyLabel={i18n.t("wedding.browseShop")} />;
	if (shopView === "checkout") {
		const cartSellerId = cart.find((c) => c.seller_id != null)?.seller_id ?? activeShop;
		const currentShop = shShops.find(s => s.id === cartSellerId || s.id === activeShop) || shShops[0];
		return (
			<FoodCheckoutPage
				cart={cart}
				onBack={() => setShopView("cart")}
				onPlaceOrder={handlePlaceOrder}
				restaurant={currentShop}
				sellerId={cartSellerId}
				productTypeId={pickCheckoutProductTypeId(cart, resolvedProductTypeId)}
				merchantType="seller"
				itemSource="product"
				vertical="wedding"
				shipOnly
			/>
		);
	}
	if (shopView === "tracking") {
		const currentShop = shShops.find(s => s.id === activeShop) || shShops[0];
		return (
			<FoodTrackingPage
				orderId={placedOrderId}
				deliveryMode={deliveryMode}
				restaurant={currentShop}
				merchantType="seller"
				onDone={() => { setCart([]); setPlacedOrderId(null); setShopView("stores"); }}
				onBack={() => setShopView("stores")}
			/>
		);
	}

	// ── Stores view ──
	if (shopView === "stores") {
		const sortedShops = shShops.filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()));
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", ...pageInset, overflowY: "auto", minHeight: 0 }}>
				<div style={{ ...weddingContentShell(1100), paddingBottom: pageBottom }}>
					<div style={{ padding: isMobile ? "12px 0 8px" : "20px 0" }}>
						<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0, marginBottom: 16 }}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
							{i18n.t("wedding.title")}
						</button>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 16, paddingInline: 4 }}>
							<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 22 : 26, margin: 0, textAlign: "center" }}>{i18n.t("wedding.shopTitle")}</h2>
							{isAuthenticated() && typeof onOpenMyTryOns === "function" && (
								<button type="button" onClick={onOpenMyTryOns} style={ACTION_BTN}>{i18n.t("wedding.myTryOns")}</button>
							)}
						</div>
						<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
							<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: isMobile ? "12px 14px" : "14px 18px", gap: 12 }}>
								<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={isMobile ? 18 : 20} /></div>
								<input value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("wedding.shopSearchPlaceholder")} className="text-text-primary" style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", fontSize: isMobile ? 15 : 16, fontFamily: "'DM Sans', sans-serif" }} />
							</div>
						</div>
					</div>

					{shopLoading ? (
						<div style={weddingCardGrid(isMobile ? 160 : 260, isMobile ? 12 : 20)}>
							{[0, 1, 2].map((k) => <Skel key={k} h={140} r={16} />)}
						</div>
					) : shopLoadError ? (
						<div style={{ textAlign: "center", padding: isMobile ? "40px 12px" : "60px 20px" }}>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#f87171", marginBottom: 12 }}>{i18n.t("wedding.loadError")}</p>
							<button type="button" onClick={() => loadShop(0, false)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("wedding.retryLoad")}</button>
						</div>
					) : sortedShops.length === 0 ? (
						<div style={{ textAlign: "center", padding: isMobile ? "40px 12px" : "60px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("wedding.noBoutiques")}</p>
						</div>
					) : (
						<div style={weddingCardGrid(isMobile ? 160 : 260, isMobile ? 12 : 20)}>
							{sortedShops.map((shop) => (
								<div key={shop.id} onClick={() => { setActiveShop(shop.id); setShopView("browse"); setQuery(""); }}
									className="border border-border-subtle bg-surface" style={{ borderRadius: 16, padding: isMobile ? 14 : 20, cursor: "pointer", transition: "all 0.2s", minWidth: 0 }}
									onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
									onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; }}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, minWidth: 0 }}>
										<div style={{ width: 44, height: 44, borderRadius: "50%", background: shop.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff", flexShrink: 0 }}>{shop.avatar}</div>
										<div style={{ minWidth: 0 }}>
											<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shop.name}</p>
											<p className="text-text-secondary" style={{ fontSize: 12 }}>{i18n.t("wedding.boutiqueLabel")}</p>
										</div>
									</div>
									<p className="text-text-secondary" style={{ fontSize: 12, marginBottom: 10 }}>{shop.eta}</p>
									{shop.rating != null ? (
										<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
											<span style={{ color: "#f59e0b", fontSize: 13 }}>★</span>
											<span className="text-text-primary" style={{ fontSize: 12, fontWeight: 600 }}>{shop.rating}</span>
											{shop.reviews != null && <span className="text-text-muted" style={{ fontSize: 11 }}>({shop.reviews})</span>}
										</div>
									) : (
										<p className="text-text-muted" style={{ fontSize: 12 }}>{i18n.t("wedding.noRatingsYet")}</p>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		);
	}

	const currentShop = shShops.find(s => Number(s.id) === Number(activeShop)) || shShops[0];
	const filtered = shItems.filter(item => {
		const matchShop = Number(item.seller_id) === Number(activeShop);
		const matchCat = matchesCategory(activeCat, item.category, categories);
		const matchQ = !query || item.name.toLowerCase().includes(query.toLowerCase());
		return matchShop && matchCat && matchQ;
	});

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, ...pageInset }}>
			<div style={weddingContentShell(1100)}>
			<div style={{ padding: isMobile ? "12px 0 0" : "20px 0 0" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, minWidth: 0 }}>
					<button onClick={() => { setShopView("stores"); setActiveShop(null); }} className="bg-surface text-text-secondary" style={{ width: 36, height: 36, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
						onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
						onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
						<svg width={7} height={12} viewBox="0 0 7 12" fill="none"><path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
					</button>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 20 : 26, flex: 1, textAlign: "center", margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentShop?.name ?? i18n.t("wedding.shopTitle")}</h2>
					<div style={{ width: 36, flexShrink: 0 }} aria-hidden />
				</div>
				<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
						<span className="text-text-secondary" style={{ fontSize: 13 }}>{currentShop?.eta}</span>
						{cartCount > 0 && (
							<button onClick={() => setShopView("cart")} style={{ background: WEDDING_ACCENT, border: "none", borderRadius: 20, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
								<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
								{i18n.t("shop.cartWithCount", { count: cartCount })}
							</button>
						)}
					</div>
					<div className="od-search-wrap" style={{ width: isMobile ? "100%" : 240, maxWidth: "100%" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "8px 12px", gap: 8 }}>
							<div className="text-text-secondary"><SearchIcon s={14} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={i18n.t("wedding.boutiqueSearchPlaceholder")} className="text-text-primary" style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
						</div>
					</div>
				</div>
				<div style={weddingCategoryRow(isMobile)}>
					{categories.map((c, i) => (
						<div key={c.id} style={{ flexShrink: 0 }}>
							<LeoButton cat={c} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} delay={i * 20} />
						</div>
					))}
				</div>
			</div>
			<div style={{ ...weddingCardGrid(isMobile ? 150 : 220, isMobile ? 12 : 18), paddingBottom: pageBottom }}>
				{filtered.length === 0 ? (
					<div className="text-text-secondary" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
						{i18n.t("wedding.noShopProducts")}
					</div>
				) : filtered.map((item, i) => (
					<div key={item.id} className="bg-surface border border-border" style={{ borderRadius: 16, overflow: "hidden", animation: `fadeUp 0.35s ease ${i * 40}ms both`, transition: "border-color 0.15s", minWidth: 0 }}
						onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
						onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}>
						<div style={{ height: isMobile ? 130 : 150, background: thumbStyle(item.thumb), position: "relative" }}>
							<div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", borderRadius: 6, padding: "3px 8px" }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{item.category}</span>
							</div>
						</div>
						<div style={{ padding: "12px 14px 14px" }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 4, lineHeight: 1.35 }}>{item.name}</p>
							<div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
								{item.rating != null ? (
									<>
										<span style={{ color: "#f59e0b", fontSize: 11 }}>★</span>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{item.rating}{item.reviews != null ? ` (${item.reviews})` : ""}</span>
									</>
								) : (
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("wedding.noRatingsYet")}</span>
								)}
							</div>
							<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-start", justifyContent: "space-between", gap: 8 }}>
								<span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18 }}>{money(item.price, item.currency || LISTING_CURRENCY)}</span>
								<div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
									<AddToWishlistButton item={item} kind="product" accent={WEDDING_ACCENT} compact />
									{item.allowsTryOn && (
										<button onClick={() => { setSelectedItem(item); setTryOnOpen(true); setTryOnSent(false); setTryOnError(null); setTryOnDate(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(219,40,119,0.4)", background: "rgba(219,40,119,0.08)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: WEDDING_ACCENT_SOFT, cursor: "pointer" }}>{i18n.t("wedding.tryOn")}</button>
									)}
									<button
										onClick={() => addToCart(item)}
										disabled={item.isInStock === false}
										style={{
											padding: "6px 12px",
											borderRadius: 8,
											border: "none",
											background: item.isInStock === false ? "var(--color-border)" : WEDDING_ACCENT,
											fontFamily: "'DM Sans', sans-serif",
											fontWeight: 700,
											fontSize: 11,
											color: item.isInStock === false ? "var(--color-text-muted)" : "#fff",
											cursor: item.isInStock === false ? "not-allowed" : "pointer",
											flex: isMobile ? 1 : undefined,
										}}
									>
										{item.isInStock === false ? i18n.t("wedding.soldOut") : i18n.t("shop.addToCart")}
									</button>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
			{shopOffset < shopTotal && (
				<div style={{ textAlign: "center", paddingBottom: pageBottom }}>
					<button type="button" disabled={shopLoadingMore} onClick={() => loadShop(shopOffset, true)}
						style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: shopLoadingMore ? "wait" : "pointer" }}>
						{shopLoadingMore ? "…" : i18n.t("common.loadMore")}
					</button>
				</div>
			)}
			{/* Try-on modal */}
			{tryOnOpen && selectedItem && (
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: isMobile ? 0 : 24 }}
					onClick={e => { if (e.target === e.currentTarget) { setTryOnOpen(false); setTryOnSent(false); setTryOnDate(""); } }}>
					<div className="bg-surface-raised border border-border" style={{ borderRadius: isMobile ? "20px 20px 0 0" : 20, padding: isMobile ? 20 : 28, width: isMobile ? "100%" : "min(400px,100%)", maxHeight: isMobile ? "90vh" : "auto", overflowY: "auto", boxSizing: "border-box" }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 8 }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 20 : 22, margin: 0 }}>{i18n.t("wedding.requestTryOn")}</h3>
							<button onClick={() => { setTryOnOpen(false); setTryOnSent(false); setTryOnDate(""); }} className="bg-border text-text-primary" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>×</button>
						</div>
						{tryOnSent ? (
							<div style={{ textAlign: "center", padding: "16px 0" }}>
								<div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#059669", marginBottom: 6 }}>{i18n.t("wedding.tryOnRequested")}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 14 }}>{i18n.t("wedding.tryOnConfirmHint", { date: tryOnDate })}</p>
								{typeof onOpenMyTryOns === "function" && (
									<button type="button" onClick={() => { setTryOnOpen(false); onOpenMyTryOns(); }} style={{ background: "rgba(219,40,119,0.12)", border: "1px solid rgba(219,40,119,0.35)", borderRadius: 10, padding: "10px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: WEDDING_ACCENT_SOFT, cursor: "pointer" }}>{i18n.t("wedding.viewMyTryOns")}</button>
								)}
							</div>
						) : (
							<>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>{selectedItem.name}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{i18n.t("wedding.preferredDate")}</p>
								<input type="date" value={tryOnDate} min={localTodayISO()} onChange={e => setTryOnDate(e.target.value)} className="bg-surface border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", colorScheme: DATE_INPUT_SCHEME(theme), marginBottom: 12 }} />
								{tryOnError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 12 }}>{tryOnError}</p>}
								<button onClick={submitTryOn} disabled={!tryOnDate || tryOnBusy} style={{ width: "100%", background: tryOnDate && !tryOnBusy ? WEDDING_ACCENT : "var(--color-border)", border: "none", borderRadius: 12, padding: "12px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: tryOnDate && !tryOnBusy ? "#fff" : "var(--color-text-muted)", cursor: tryOnDate && !tryOnBusy ? "pointer" : "default" }}>{tryOnBusy ? "…" : i18n.t("wedding.requestAppointment")}</button>
							</>
						)}
					</div>
				</div>
			)}
		</div>
		</div>
	);
}

function WeddingVendorDetail({ vendor, onBack, onBook }) {
	const { t } = usePageI18n("wedding");
	const { money } = useMoney();
	const { isMobile, isTablet } = useViewport();
	const pageInset = weddingPageInset(isMobile, isTablet);
	const pageBottom = weddingPageBottom(isMobile);
	const [theme] = useTheme();
	const loading = usePageLoad(150);
	const today = new Date();
	const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
	const [selDate, setSelDate] = useState(null);
	const [dateStr, setDateStr] = useState("");
	const [endDateStr, setEndDateStr] = useState("");
	const [selEndDate, setSelEndDate] = useState(null);
	const guestLimit = Number(vendor.maxAttendees || vendor.capacity) || null;
	const [guests, setGuests] = useState(guestLimit ? 1 : null);
	const [msgBusy, setMsgBusy] = useState(false);
	const [msgError, setMsgError] = useState(null);
	const [msgSent, setMsgSent] = useState(false);
	// Real availability: dates this vendor is already booked/blocked on, greyed out
	const [unavailable, setUnavailable] = useState(() => new Set());
	const hasListing = !!(vendor.listingId);
	const [availLoading, setAvailLoading] = useState(() => hasListing);
	const [availError, setAvailError] = useState(false);
	const fmt = (d) => formatWeddingDate(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" }, i18n.language);
	const currency = vendor.currency || LISTING_CURRENCY;

	const applyAvailability = React.useCallback((data) => {
		setUnavailable(expandBookedToUnavailableSet(data));
		setAvailLoading(false);
		setAvailError(false);
	}, []);

	useEffect(() => {
		// availLoading/availError are seeded from initial state (loading iff this vendor
		// has a real listing) so we avoid a synchronous setState in the effect body; the
		// then/catch below resolve the final state.
		if (!hasListing) return;
		let alive = true;
		getListingAvailability(vendor.listingId)
			.then(res => {
				const data = res?.data ?? res ?? {};
				if (alive) applyAvailability(data);
			})
			.catch(() => { if (alive) { setAvailError(true); setAvailLoading(false); } });
		return () => { alive = false; };
	}, [hasListing, vendor.listingId, applyAvailability]);

	const endBeforeStart = !!(dateStr && endDateStr && endDateStr < dateStr);
	const spanTaken = !!(dateStr && !endBeforeStart && rangeOverlapsUnavailable(dateStr, endDateStr || dateStr, unavailable));
	const canBook = !!selDate && !spanTaken && !endBeforeStart && !availLoading && !availError;
	const eventDays = dateStr ? inclusiveEventDays(dateStr, endDateStr || dateStr) : 1;

	function pickDate(str) {
		setDateStr(str);
		if (!str) { setSelDate(null); return; }
		const [y, m, d] = str.split("-").map(Number);
		setSelDate(new Date(y, m - 1, d, 12)); // local noon → stable YYYY-MM-DD on toISOString
		if (endDateStr && endDateStr < str) {
			setEndDateStr("");
			setSelEndDate(null);
		}
	}

	function pickEndDate(str) {
		setEndDateStr(str);
		if (!str) { setSelEndDate(null); return; }
		const [y, m, d] = str.split("-").map(Number);
		setSelEndDate(new Date(y, m - 1, d, 12));
	}

	function setGuestCount(raw) {
		if (!guestLimit) return;
		const n = Math.floor(Number(raw));
		if (!Number.isFinite(n)) return;
		setGuests(Math.max(1, Math.min(guestLimit, n)));
	}

	function handleBook() {
		if (!canBook) return;
		if (dateStr && dateStr < todayISO) return; // min= is UI-only; enforce no past dates
		onBook({ vendor, date: selDate, endDate: selEndDate, guests });
	}

	async function handleMessageVendor() {
		if (!vendor.hostId || msgBusy) return;
		if (!isAuthenticated()) {
			setMsgError(i18n.t("events.loginToBook"));
			return;
		}
		setMsgBusy(true);
		setMsgError(null);
		try {
			await messageUser(vendor.hostId, {
				initialMessage: i18n.t("wedding.messageVendorIntro", { name: vendor.name }),
				navigate: false,
				sourceVertical: "wedding",
			});
			setMsgSent(true);
		} catch {
			setMsgError(i18n.t("wedding.messageVendorFailed"));
		} finally {
			setMsgBusy(false);
		}
	}

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, ...pageInset }}>
			<div style={{ ...weddingContentShell(1060), paddingBottom: pageBottom }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={isMobile ? 180 : 260} r={18} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 24, flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
					<div style={{ flex: 2, minWidth: 0, width: isMobile ? "100%" : undefined }}>
						<Skel w={80} h={22} r={6} style={{ marginBottom: 12 }} />
						<Skel w="65%" h={32} r={8} style={{ marginBottom: 8 }} />
						<Skel w="45%" h={14} r={6} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={70} r={8} style={{ marginBottom: 20 }} />
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
							{[...Array(4)].map((_,i) => <Skel key={i} w="100%" h={22} r={6} />)}
						</div>
					</div>
					<div style={{ flex: 1, width: isMobile ? "100%" : undefined, maxWidth: isMobile ? "100%" : 320 }}>
						<Skel w="100%" h={280} r={18} />
					</div>
				</div>
			</div>
		</div>
	);

	const featureBits = [
		vendor.instantBook ? t("wedding.featureInstantBook") : t("wedding.featureHostConfirm"),
		(vendor.maxAttendees || vendor.capacity) ? t("wedding.featureCapacity", { count: vendor.maxAttendees || vendor.capacity }) : null,
		vendor.location ? t("wedding.featureLocation", { location: vendor.location }) : null,
		t("wedding.featureStartingPrice"),
	].filter(Boolean);

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, ...pageInset }}>
			<div style={{ ...weddingContentShell(1060), paddingBottom: pageBottom }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: isMobile ? 12 : 24, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{t("wedding.backToVendors")}
				</button>
				<div style={{ height: isMobile ? 180 : 260, borderRadius: isMobile ? 14 : 18, background: thumbStyle(vendor.thumb), overflow: "hidden", marginBottom: isMobile ? 18 : 28 }} />
			<div style={{ padding: "0" }}>
				<div style={{ display: "flex", gap: isMobile ? 18 : 32, flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
					{/* Booking card first on mobile so guests can book without scrolling past copy */}
					<div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined, maxWidth: isMobile ? "100%" : 320, order: isMobile ? 1 : 2 }}>
						<div className="bg-surface border border-border" style={{ borderRadius: 18, padding: isMobile ? "18px" : "22px" }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 22 : 26, marginBottom: 4 }}>{t("wedding.fromPrice", { price: money(vendor.price, currency) })}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 16 }}>{t("wedding.startingPriceHint")}</p>
							{(vendor.maxAttendees || vendor.capacity) && (
								<>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("wedding.estimatedGuests")}</p>
									<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
										<button aria-label={t("wedding.decreaseGuests")} onClick={() => setGuestCount((guests || 1) - 1)} className="border border-border bg-surface text-text-primary" style={{ width: 40, height: 40, borderRadius: "50%", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>−</button>
										<input
											type="number"
											min={1}
											max={guestLimit}
											value={guests ?? ""}
											onChange={(e) => setGuestCount(e.target.value)}
											aria-label={t("wedding.estimatedGuests")}
											className="bg-surface border border-border text-text-primary" style={{ width: 72, textAlign: "center", borderRadius: 8, padding: "8px 4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, outline: "none" }}
										/>
										<button aria-label={t("wedding.increaseGuests")} onClick={() => setGuestCount((guests || 1) + 1)} className="border border-border bg-surface text-text-primary" style={{ width: 40, height: 40, borderRadius: "50%", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
									</div>
									<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 16 }}>{t("wedding.guestsPriceNote")}</p>
								</>
							)}
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("wedding.preferredDate")}</p>
							<input
								type="date"
								value={dateStr}
								min={todayISO}
								disabled={availError}
								onChange={e => pickDate(e.target.value)}
								className="bg-surface text-text-primary" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${spanTaken && dateStr && unavailable.has(dateStr) ? "rgba(248,113,113,0.5)" : "var(--color-border)"}`, borderRadius: 10, padding: "12px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 16, outline: "none", colorScheme: DATE_INPUT_SCHEME(theme), marginBottom: 8 }} />
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("wedding.throughDateOptional")}</p>
							<input
								type="date"
								value={endDateStr}
								min={dateStr || todayISO}
								disabled={availError || !dateStr}
								onChange={e => pickEndDate(e.target.value)}
								className="bg-surface text-text-primary" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${(spanTaken || endBeforeStart) ? "rgba(248,113,113,0.5)" : "var(--color-border)"}`, borderRadius: 10, padding: "12px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 16, outline: "none", colorScheme: DATE_INPUT_SCHEME(theme), marginBottom: spanTaken || endBeforeStart ? 6 : 8 }} />
							{eventDays > 1 && !spanTaken && !endBeforeStart && selDate && (
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 8 }}>{t("wedding.multiDayPriceNote", { days: eventDays, price: money(vendor.price * eventDays, currency) })}</p>
							)}
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 8 }}>{t("wedding.feesPreviewNote")}</p>
							{availLoading ? (
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{t("wedding.checkingLiveAvailability")}</p>
							) : availError ? (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#fbbf24", marginBottom: 12 }}>{t("wedding.availabilityBlocked")}</p>
							) : endBeforeStart ? (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 12 }}>{t("wedding.endAfterStart")}</p>
							) : spanTaken ? (
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 12 }}>{t("wedding.vendorBookedInRange")}</p>
							) : selDate ? (
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>
									{fmt(selDate)}{selEndDate ? ` → ${fmt(selEndDate)}` : ""}
								</p>
							) : (
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{t("wedding.selectEventDate")}</p>
							)}
							{availError && (
								<button type="button" onClick={() => {
									setAvailLoading(true);
									setAvailError(false);
									getListingAvailability(vendor.listingId)
										.then(res => {
											const data = res?.data ?? res ?? {};
											applyAvailability(data);
										})
										.catch(() => { setAvailError(true); setAvailLoading(false); });
								}} className="bg-border border border-border text-text-primary" style={{ width: "100%", marginBottom: 10, borderRadius: 10, padding: "12px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
									{t("wedding.retryAvailability")}
								</button>
							)}
							<button onClick={handleBook} disabled={!canBook}
								style={{ width: "100%", background: WEDDING_ACCENT, border: "none", borderRadius: 12, padding: "14px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: canBook ? "pointer" : "not-allowed", opacity: canBook ? 1 : 0.5, transition: "all 0.2s" }}>
								{availLoading ? t("wedding.checkingAvailabilityBtn") : t("wedding.proceedPayment")}
							</button>
						</div>
					</div>
					<div style={{ flex: 2, minWidth: 0, width: isMobile ? "100%" : undefined, order: isMobile ? 2 : 1 }}>
						<span className="bg-surface border border-border text-text-secondary" style={{ display: "inline-block", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{vendor.type}</span>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 26 : 32, marginBottom: 8, lineHeight: 1.15, wordBreak: "break-word" }}>{vendor.name}</h1>
						<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
							{vendor.rating != null && (
								<div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#f59e0b" }}>★</span><span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{vendor.rating}</span>{vendor.reviews != null && <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>({vendor.reviews})</span>}</div>
							)}
							{vendor.location && <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{vendor.location}</span>}
							{(vendor.maxAttendees || vendor.capacity) && <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{t("wedding.upToGuests", { count: vendor.maxAttendees || vendor.capacity })}</span>}
						</div>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.75, marginBottom: 20 }}>
							{vendor.description || t("wedding.defaultVendorBlurb", { type: String(vendor.type || "vendor").toLowerCase() })}
						</p>
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
							{featureBits.map((f, i) => (
								<div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
									<span style={{ color: "#059669", fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{f}</span>
								</div>
							))}
						</div>
						{vendor.hostId && (
							<div style={{ marginBottom: 12 }}>
								<button type="button" onClick={handleMessageVendor} disabled={msgBusy || msgSent}
									style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(219,40,119,0.4)", background: "rgba(219,40,119,0.1)", color: WEDDING_ACCENT_SOFT, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: msgBusy || msgSent ? "default" : "pointer", width: isMobile ? "100%" : "auto" }}>
									{msgSent ? t("wedding.messageSent") : msgBusy ? "…" : t("wedding.messageVendor")}
								</button>
								{msgError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 8 }}>{msgError}</p>}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
		</div>
	);
}

function WeddingSummaryRow({ label, value, strong }) {
	const size = strong ? 14.5 : 13;
	return (
		<div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: strong ? 0 : 8, alignItems: "flex-start", minWidth: 0 }}>
			<span className={strong ? "text-text-primary" : "text-text-secondary"} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: size, fontWeight: strong ? 700 : 400, flexShrink: 0 }}>{label}</span>
			<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: size, fontWeight: strong ? 700 : 500, textAlign: "right", wordBreak: "break-word", minWidth: 0 }}>{value}</span>
		</div>
	);
}

function WeddingPayAlert({ tone, title, message }) {
	const accent = tone === "warn" ? "#fbbf24" : "#f87171";
	return (
		<div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: tone === "warn" ? "rgba(251,191,36,0.10)" : "rgba(248,113,113,0.10)", border: `1px solid ${tone === "warn" ? "rgba(251,191,36,0.32)" : "rgba(248,113,113,0.32)"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
			<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
				<circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
			</svg>
			<div>
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: accent, marginBottom: 2 }}>{title}</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.45 }}>{message}</p>
			</div>
		</div>
	);
}

function WeddingVendorPaymentPage({ info, onBack, onPaid }) {
	const { t } = usePageI18n("wedding");
	const { money: fmtMoney } = useMoney();
	const { isMobile, isTablet } = useViewport();
	const pageInset = weddingPageInset(isMobile, isTablet);
	const pageBottom = weddingPageBottom(isMobile);
	const payBooking = useBookingPayment();
	const [payProcessing, setPayProcessing] = useState(false);
	const [payError, setPayError] = useState(null);
	const [refCode, setRefCode] = useState("");
	const [refApplied, setRefApplied] = useState(false);
	const [refLoading, setRefLoading] = useState(false);
	const [refError, setRefError] = useState(null);
	// Full server quote (subtotal + each fee), so the price breakdown shown to the
	// guest is itemised rather than a single opaque total.
	const [quote, setQuote] = useState(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	// null while the date is bookable, otherwise { reason } from the booking engine.
	const [unavailable, setUnavailable] = useState(null);
	const [quoteFailed, setQuoteFailed] = useState(false);
	const currency = info.vendor.currency || LISTING_CURRENCY;
	const basePrice = info.vendor.price;
	const total = Number(quote?.total ?? basePrice);
	const subtotal = Number(quote?.subtotal ?? basePrice);
	const canBookListing = !!info.vendor.listingId;
	const money = (n) => fmtMoney(n, currency);
	// The quote endpoint also reports availability, so a taken date is surfaced
	// before the guest fills in a card rather than after they press Pay.
	useEffect(() => {
		if (!canBookListing) return undefined;
		let alive = true;
		setQuoteLoading(true);
		setPayError(null);
		setQuoteFailed(false);
		getBookingQuote({
			booking_listing_id: info.vendor.listingId,
			start_date: info.date.toISOString().slice(0, 10),
			...(info.endDate ? { end_date: info.endDate.toISOString().slice(0, 10) } : {}),
			guests: info.guests || 1,
		})
			.then((res) => {
				if (!alive) return;
				const q = res?.data ?? res;
				if (Number.isFinite(Number(q?.total))) setQuote(q);
				else setQuoteFailed(true);
				setUnavailable(q?.available === false ? { reason: q.reason || null } : null);
			})
			.catch(() => {
				if (!alive) return;
				setQuoteFailed(true);
				setUnavailable(null);
			})
			.finally(() => { if (alive) setQuoteLoading(false); });
		return () => { alive = false; };
	}, [canBookListing, info.vendor.listingId, info.date, info.endDate, info.guests]);

	// Book through the shared booking engine: create the booking (server prices it
	// from the listing), then pay that booking's own intent so the charge is tied
	// to a real booking row — not a rental_order against a non-existent listing id.
	async function handlePay() {
		setPayError(null);
		if (!canBookListing) { setPayError(t("wedding.listingUnavailable")); return; }
		if (!isAuthenticated()) { setPayError(t("events.loginToBook")); return; }
		if (quoteFailed) { setPayError(t("wedding.quoteUnavailable")); return; }
		setUnavailable(null);
		setPayProcessing(true);
		let bookingId = null;
		try {
			const res = await createBooking({
				booking_listing_id: info.vendor.listingId,
				start_date: info.date.toISOString().slice(0, 10),
				...(info.endDate ? { end_date: info.endDate.toISOString().slice(0, 10) } : {}),
				guests: info.guests || 1,
				notes: `Wedding booking — ${info.vendor.name}${info.guests ? ` · ${info.guests} guests` : ""}`,
			});
			const booking = res?.data ?? res;
			bookingId = booking?.booking_id ?? null;
			if (!bookingId) { setPayError(t("wedding.couldNotPlaceBooking")); setPayProcessing(false); return; }
			if (booking.total != null) setQuote((q) => ({ ...(q || {}), total: Number(booking.total) }));
			const pay = await payBooking(bookingId);
			if (!pay.ok) {
				if (pay.releaseBooking) {
					try { await cancelBooking(bookingId, "Payment failed before completion"); } catch { /* hold released best-effort */ }
				}
				setPayError(pay.error);
				setPayProcessing(false);
				return;
			}
			onPaid({ ...info, bookingId, chargedTotal: Number(booking.total ?? total) });
		} catch (err) {
			if (bookingId) {
				try { await cancelBooking(bookingId, "Checkout aborted"); } catch { /* best-effort */ }
			}
			const status = err?.response?.status;
			const message = err?.response?.data?.message;
			// 409 means the calendar rejected the date — that needs a new date, not
			// a payment retry, so it routes to the availability banner instead.
			if (status === 409) setUnavailable({ reason: message || null });
			else setPayError(message || t("wedding.couldNotCompleteBooking"));
			setPayProcessing(false);
		}
	}

	const serviceFee = Number(quote?.service_fee ?? 0);
	const cleaningFee = Number(quote?.cleaning_fee ?? 0);
	const deposit = Number(quote?.deposit ?? 0);

	const summaryCard = (
		<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("wedding.bookingSummary")}</p>
			<div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
				<div style={{ width: 46, height: 46, borderRadius: 10, background: thumbStyle(info.vendor.thumb), flexShrink: 0 }} />
				<div style={{ minWidth: 0 }}>
					<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.vendor.name}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{[info.vendor.type, info.vendor.location].filter(Boolean).join(" · ")}
					</p>
				</div>
			</div>
			<WeddingSummaryRow label={i18n.t("events.date")} value={formatWeddingDate(info.date, { month: "short", day: "numeric", year: "numeric" }, i18n.language)} />
			{info.endDate ? <WeddingSummaryRow label={i18n.t("wedding.throughDate")} value={formatWeddingDate(info.endDate, { month: "short", day: "numeric", year: "numeric" }, i18n.language)} /> : null}
			{info.guests ? <WeddingSummaryRow label={i18n.t("common.guests")} value={info.guests} /> : null}
			<div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 4 }}>
				<WeddingSummaryRow label={i18n.t("common.subtotal")} value={quoteLoading ? "…" : money(subtotal)} />
				{serviceFee > 0 && <WeddingSummaryRow label={i18n.t("common.serviceFee")} value={money(serviceFee)} />}
				{cleaningFee > 0 && <WeddingSummaryRow label={i18n.t("common.cleaningFee")} value={money(cleaningFee)} />}
				{deposit > 0 && <WeddingSummaryRow label={t("wedding.refundableDeposit")} value={money(deposit)} />}
			</div>
			<div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 8 }}>
				<WeddingSummaryRow strong label={i18n.t("common.total")} value={quoteLoading ? "…" : money(total)} />
			</div>
			{!quoteLoading && quote && (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 10 }}>{i18n.t("wedding.feesIncluded")}</p>
			)}
		</div>
	);

	return (
		<div style={{ flex: 1, overflowY: "auto", ...pageInset, paddingTop: isMobile ? 16 : 28, paddingBottom: pageBottom }}>
			<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: 0 }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				{t("wedding.backToVendor")}
			</button>
			<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 26 : 36, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: isMobile ? 16 : 24, lineHeight: 1.15 }}>{i18n.t("common.completeBooking")}</h1>
			<div style={{ maxWidth: 1040, width: "100%", display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateColumns: isMobile ? undefined : "minmax(0,1fr) minmax(260px, 360px)", gap: 24, alignItems: "start", margin: "0 auto" }}>
				{isMobile && summaryCard}
				<div style={{ minWidth: 0, width: "100%" }}>
				<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("tempstay.referralCode")}</p>
					<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
						<input value={refCode} onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }} placeholder={t("common.referralCodeOptional")}
							className="bg-surface border border-border text-text-primary" style={{ flex: 1, minWidth: 0, borderRadius: 9, padding: "12px", fontFamily: "'DM Sans', sans-serif", fontSize: 16, outline: "none", caretColor: "#2563eb", boxSizing: "border-box", width: "100%" }}
							onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"}
							onBlur={e => e.target.style.borderColor = "var(--color-border)"} />
						<button onClick={async () => { if (!refCode.trim() || refLoading || refApplied) return; setRefLoading(true); setRefError(null); try { await bindCheckoutReferralCode(refCode.trim()); setRefApplied(true); } catch (e) { setRefError(e?.response?.data?.message || t("events.invalidReferral")); } finally { setRefLoading(false); } }} style={{ padding: "12px 16px", background: refApplied ? "rgba(16,185,129,0.15)" : refCode.trim() ? "#2563eb" : "var(--color-border)", border: refApplied ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(37,99,235,0.3)", borderRadius: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: refApplied ? "#10b981" : "#2563eb", cursor: (!refCode.trim() || refLoading) ? "default" : "pointer", whiteSpace: "nowrap", width: isMobile ? "100%" : "auto" }}>{refLoading ? "…" : refApplied ? t("events.applied") : t("common.apply")}</button>
					</div>
					{refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 6 }}>{refError}</p>}
					{refApplied && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 6 }}>{t("wedding.referralAccountOnly")}</p>}
				</div>
				<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("rideshare.paymentMethod")}</p>
					{!canBookListing ? (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{t("wedding.listingUnavailable")}</p>
					) : unavailable ? (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{t("wedding.cardOnHoldUntilDate")}</p>
					) : (
						<CardInput style={{ marginTop: 4 }} />
					)}
				</div>
				{unavailable && <WeddingPayAlert tone="warn" title={t("wedding.dateUnavailableTitle")} message={unavailable.reason || t("wedding.dateNoLongerAvailable")} />}
				{quoteFailed && !unavailable && <WeddingPayAlert tone="error" title={t("wedding.paymentFailedTitle")} message={t("wedding.quoteUnavailable")} />}
				{payError && <WeddingPayAlert tone="error" title={t("wedding.paymentFailedTitle")} message={payError} />}
				{unavailable ? (
					<button onClick={onBack}
						style={{ width: "100%", padding: "14px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
						{t("wedding.pickAnotherDate")}
					</button>
				) : (
					<button onClick={handlePay} disabled={payProcessing || !canBookListing || quoteLoading || quoteFailed}
						style={{ width: "100%", padding: "14px", background: (payProcessing || !canBookListing || quoteLoading || quoteFailed) ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: (payProcessing || !canBookListing || quoteLoading || quoteFailed) ? "not-allowed" : "pointer" }}>
						{quoteLoading ? t("wedding.checkingAvailabilityBtn") : payProcessing ? t("wedding.processing") : `${t("wedding.payAction")} ${money(total)}`}
					</button>
				)}
				{canBookListing && !unavailable && (
					<div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
							<rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
						</svg>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5 }}>
							{info.vendor.instantBook ? t("wedding.instantBookNotice") : t("wedding.hostConfirmsNotice")}
						</p>
					</div>
				)}
				</div>
				{!isMobile && <div style={{ position: "sticky", top: 16 }}>{summaryCard}</div>}
			</div>
		</div>
	);
}

function WeddingConfirmPage({ info, onDone, onRate }) {
	const { isMobile, isTablet } = useViewport();
	const pageInset = weddingPageInset(isMobile, isTablet);
	const pageBottom = weddingPageBottom(isMobile);
	if (!info?.vendor || !info?.date) {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...pageInset, paddingTop: 40, paddingBottom: pageBottom }}>
				<button onClick={onDone} style={{ background: WEDDING_ACCENT, border: "none", borderRadius: 12, padding: "12px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer", width: isMobile ? "100%" : "auto", maxWidth: 360 }}>{i18n.t("common.done")}</button>
			</div>
		);
	}

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...pageInset, paddingTop: 40, paddingBottom: pageBottom, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, fontSize: 32 }}>✓</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 24 : 30, marginBottom: 10, paddingInline: 8 }}>{i18n.t("wedding.bookingConfirmed")}</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 15, marginBottom: 6, paddingInline: 8 }}><span className="text-text-primary" style={{ fontWeight: 600 }}>{info.vendor.name}</span> {info.vendor.instantBook ? i18n.t("wedding.instantBookConfirmed") : i18n.t("wedding.hostWillConfirm")}</p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 16, paddingInline: 8 }}>{i18n.t("wedding.requestedDate")}: {formatWeddingDate(info.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, i18n.language)}</p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20, maxWidth: 420, paddingInline: 8 }}>{i18n.t("wedding.ratingAfterEvent")}</p>
			<div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 420, paddingInline: 8 }}>
				{typeof onRate === "function" && isAuthenticated() && (
					<button type="button" onClick={onRate} style={{ background: "rgba(219,40,119,0.12)", border: "1px solid rgba(219,40,119,0.4)", borderRadius: 12, padding: "12px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: WEDDING_ACCENT_SOFT, cursor: "pointer", flex: isMobile ? "1 1 140px" : undefined }}>{i18n.t("wedding.rateVendor")}</button>
				)}
				<button onClick={onDone} style={{ background: WEDDING_ACCENT, border: "none", borderRadius: 12, padding: "12px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer", flex: isMobile ? "1 1 140px" : undefined }}>{i18n.t("common.done")}</button>
			</div>
		</div>
	);
}

function WeddingMyTryOnsPanel({ onBack }) {
	const { isMobile, isTablet } = useViewport();
	const pageInset = weddingPageInset(isMobile, isTablet);
	const pageBottom = weddingPageBottom(isMobile);
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		let alive = true;
		setLoading(true);
		client.get("/wedding/my-try-ons")
			.then((res) => {
				if (!alive) return;
				const body = res?.data ?? res;
				setRows(Array.isArray(body) ? body : (body?.data ?? []));
				setError(null);
			})
			.catch(() => { if (alive) setError(i18n.t("wedding.tryOnsLoadFailed")); })
			.finally(() => { if (alive) setLoading(false); });
		return () => { alive = false; };
	}, []);

	function statusLabel(status) {
		const s = String(status || "pending").toLowerCase();
		if (s === "accepted") return i18n.t("wedding.tryOnStatusAccepted");
		if (s === "declined") return i18n.t("wedding.tryOnStatusDeclined");
		return i18n.t("wedding.tryOnStatusPending");
	}

	function statusColor(status) {
		const s = String(status || "pending").toLowerCase();
		if (s === "accepted") return "#34d399";
		if (s === "declined") return "#f87171";
		return "#fbbf24";
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, ...pageInset, paddingTop: isMobile ? 16 : 28, paddingBottom: pageBottom }}>
			<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: 0 }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				{i18n.t("wedding.backToShop")}
			</button>
			<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 26 : 32, marginBottom: 8 }}>{i18n.t("wedding.myTryOnsTitle")}</h1>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{i18n.t("wedding.myTryOnsHint")}</p>
			{error && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginBottom: 12 }}>{error}</p>}
			{loading ? (
				<Skel w="100%" h={120} r={14} />
			) : rows.length === 0 ? (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{i18n.t("wedding.noTryOnsYet")}</p>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560, width: "100%" }}>
					{rows.map((r) => (
						<div key={r.try_on_id || r.notification_id} className="bg-surface border border-border" style={{ borderRadius: 14, padding: isMobile ? 14 : 16, minWidth: 0 }}>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 4, wordBreak: "break-word" }}>{r.product_name || i18n.t("wedding.tryOn")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>
								{r.preferred_date ? String(r.preferred_date).slice(0, 10) : "—"}
							</p>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: statusColor(r.status) }}>{statusLabel(r.status)}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function WeddingRateVendorsPanel({ onBack }) {
	const { isMobile, isTablet } = useViewport();
	const pageInset = weddingPageInset(isMobile, isTablet);
	const pageBottom = weddingPageBottom(isMobile);
	const [rows, setRows] = useState([]);
	const [awaitingCompletion, setAwaitingCompletion] = useState([]);
	const [closedBookings, setClosedBookings] = useState([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState(null);
	const [error, setError] = useState(null);
	const [drafts, setDrafts] = useState({});
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		let alive = true;
		setLoading(true);
		Promise.all([
			client.get("/wedding/rateable-bookings"),
			client.get("/wedding/my-bookings"),
		])
			.then(([rateRes, myRes]) => {
				if (!alive) return;
				const rateBody = rateRes?.data ?? rateRes;
				const myBody = myRes?.data ?? myRes;
				const rateable = Array.isArray(rateBody) ? rateBody : (rateBody?.data ?? []);
				const all = Array.isArray(myBody) ? myBody : (myBody?.data ?? []);
				setRows(rateable);
				setAwaitingCompletion(all.filter((b) => !b.rateable && !b.rated && (b.awaiting_host_completion || (!b.closed && b.payment_status === "paid"))));
				setClosedBookings(all.filter((b) => !b.rateable && !b.rated && (b.closed || ["cancelled", "declined"].includes(b.status) || b.payment_status === "unpaid" || b.payment_status === "failed")));
			})
			.catch(() => { if (alive) setError(i18n.t("wedding.ratingFailed")); })
			.finally(() => { if (alive) setLoading(false); });
		return () => { alive = false; };
	}, []);

	async function submitRating(bookingId) {
		const draft = drafts[bookingId] || {};
		const rating = Number(draft.rating);
		if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
			setError(i18n.t("wedding.ratingNeedsStars"));
			return;
		}
		setBusyId(bookingId);
		setError(null);
		try {
			await client.post("/wedding/vendor-ratings", {
				booking_id: bookingId,
				rating,
				comment: draft.comment || null,
			});
			setRows((prev) => prev.filter((r) => r.booking_id !== bookingId));
			setSubmitted(true);
		} catch (err) {
			setError(err?.response?.data?.error || i18n.t("wedding.ratingFailed"));
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, ...pageInset, paddingTop: isMobile ? 16 : 28, paddingBottom: pageBottom }}>
			<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: 0 }}>
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				{i18n.t("wedding.backToVendors")}
			</button>
			<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 26 : 32, marginBottom: 8 }}>{i18n.t("wedding.rateVendorTitle")}</h1>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>{i18n.t("wedding.ratingNeedsBooking")}</p>
			{error && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171", marginBottom: 12 }}>{error}</p>}
			{submitted && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#34d399", marginBottom: 12 }}>{i18n.t("wedding.ratingSubmitted")}</p>}
			{loading ? (
				<Skel w="100%" h={120} r={14} />
			) : (
				<>
					{rows.length === 0 ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 20 }}>
							{awaitingCompletion.length > 0 ? i18n.t("wedding.noRateableAwaitingHost") : i18n.t("wedding.noRateableBookings")}
						</p>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560, width: "100%", marginBottom: 28 }}>
							{rows.map((b) => (
								<div key={b.booking_id} className="bg-surface border border-border" style={{ borderRadius: 14, padding: isMobile ? 14 : 16, minWidth: 0 }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 4, wordBreak: "break-word" }}>{b.title}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{b.start_date ? String(b.start_date).slice(0, 10) : ""}{b.end_date ? ` → ${String(b.end_date).slice(0, 10)}` : ""}</p>
									<div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
										{[1, 2, 3, 4, 5].map((n) => (
											<button key={n} type="button" onClick={() => setDrafts((d) => ({ ...d, [b.booking_id]: { ...d[b.booking_id], rating: n } }))}
												style={{ background: "none", border: "none", fontSize: isMobile ? 28 : 22, cursor: "pointer", color: (drafts[b.booking_id]?.rating || 0) >= n ? "#f59e0b" : "var(--color-text-muted)", padding: 4, lineHeight: 1 }}>★</button>
										))}
									</div>
									<textarea
										value={drafts[b.booking_id]?.comment || ""}
										onChange={(e) => setDrafts((d) => ({ ...d, [b.booking_id]: { ...d[b.booking_id], comment: e.target.value } }))}
										placeholder={i18n.t("wedding.ratingCommentPlaceholder")}
										rows={2}
										className="bg-surface border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 16, outline: "none", marginBottom: 10, resize: "vertical" }}
									/>
									<button type="button" disabled={busyId === b.booking_id} onClick={() => submitRating(b.booking_id)}
										style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: WEDDING_ACCENT, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: busyId === b.booking_id ? "wait" : "pointer" }}>
										{busyId === b.booking_id ? "…" : i18n.t("wedding.submitRating")}
									</button>
								</div>
							))}
						</div>
					)}
					{awaitingCompletion.length > 0 && (
						<div style={{ maxWidth: 560, width: "100%", marginBottom: 24 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("wedding.awaitingCompletionTitle")}</p>
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								{awaitingCompletion.map((b) => (
									<div key={b.booking_id} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "12px 14px" }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, wordBreak: "break-word" }}>{b.title}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>
											{b.start_date ? String(b.start_date).slice(0, 10) : ""} · {String(b.status || "").replace(/_/g, " ")}
										</p>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 6 }}>{i18n.t("wedding.ratingAfterHostCompletes")}</p>
									</div>
								))}
							</div>
						</div>
					)}
					{closedBookings.length > 0 && (
						<div style={{ maxWidth: 560, width: "100%" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{i18n.t("wedding.closedBookingsTitle")}</p>
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								{closedBookings.map((b) => (
									<div key={b.booking_id} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "12px 14px" }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, wordBreak: "break-word" }}>{b.title}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>
											{b.start_date ? String(b.start_date).slice(0, 10) : ""} · {String(b.status || "").replace(/_/g, " ")}
											{b.payment_status ? ` · ${String(b.payment_status).replace(/_/g, " ")}` : ""}
										</p>
										<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 6 }}>{i18n.t("wedding.ratingNotAvailableClosed")}</p>
									</div>
								))}
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}

function WeddingPage() {
	const { t, landingTitle } = usePageI18n("wedding");
	const { money } = useMoney();
	const categories = useI18nCategoryList(WEDDING_VENDOR_CATEGORY_DEFS);
	const { isMobile, isTablet } = useViewport();
	const pageInset = weddingPageInset(isMobile, isTablet);
	const pageBottom = weddingPageBottom(isMobile);
	const [mainTab, setMainTab] = useState("vendors"); // "vendors" | "shop"
	const [activeCat, setActiveCat] = useState("all");
	const [vendorQuery, setVendorQuery] = useState("");
	const [wedView, setWedView] = useState("grid");
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [wedView]);
	const [selectedVendor, setSelectedVendor] = useState(null);
	const [bookingInfo, setBookingInfo] = useState(null);
	const [payInfo, setPayInfo] = useState(null);
	const [vendors, setVendors] = useState([]);
	const [vendorLoading, setVendorLoading] = useState(true);
	const [vendorLoadError, setVendorLoadError] = useState(false);
	const [vendorTotal, setVendorTotal] = useState(0);
	const [vendorOffset, setVendorOffset] = useState(0);
	const [vendorLoadingMore, setVendorLoadingMore] = useState(false);

	const mapVendor = React.useCallback((l) => {
		const a = l.attributes ?? {};
		const imgs = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
		const maxAttendees = a.max_attendees != null ? Number(a.max_attendees) : null;
		const { rating, reviews } = resolveVendorRating(l, a);
		return {
			id: l.booking_listing_id,
			listingId: l.booking_listing_id,
			hostId: l.owner_id ?? null,
			name: l.title || "Wedding Vendor",
			description: l.description || "",
			type: a.vendor_type || a.type || "Venue",
			capacity: maxAttendees,
			maxAttendees,
			price: Number(l.price) || 0,
			currency: l.currency || LISTING_CURRENCY,
			rating,
			reviews,
			location: l.location || "",
			instantBook: l.instant_book === true,
			featured: a.featured === true || a.featured === "true",
			thumb: imgs[0] || a.thumb || weddingPlaceholderThumb(),
		};
	}, []);

	const loadVendors = React.useCallback((offset = 0, append = false) => {
		if (append) setVendorLoadingMore(true);
		else setVendorLoading(true);
		return getBookingListings({ vertical: "wedding", limit: PAGE_SIZE, offset })
			.then((res) => {
				const arr = Array.isArray(res) ? res : (res?.data ?? []);
				const total = Number(res?.total);
				setVendorTotal(Number.isFinite(total) ? total : arr.length);
				setVendorOffset(offset + arr.length);
				const mapped = arr.map(mapVendor);
				if (append) {
					setVendors((prev) => {
						const ids = new Set(prev.map((v) => v.id));
						return [...prev, ...mapped.filter((v) => !ids.has(v.id))];
					});
				} else {
					setVendors(mapped);
				}
				setVendorLoadError(false);
			})
			.catch(() => {
				if (!append) {
					setVendors([]);
					setVendorLoadError(true);
				}
			})
			.finally(() => {
				setVendorLoading(false);
				setVendorLoadingMore(false);
			});
	}, [mapVendor]);

	useEffect(() => { loadVendors(0, false); }, [loadVendors]); // eslint-disable-line react-hooks/set-state-in-effect -- intentional mount fetch; callback also refreshes after HostListingCTA creates

	const filtered = useMemo(
		() => vendors
			.filter((v) => {
				if (!matchesCategory(activeCat, v.type, categories)) return false;
				const q = vendorQuery.trim().toLowerCase();
				if (!q) return true;
				return [v.name, v.location, v.type].some((s) => String(s || "").toLowerCase().includes(q));
			})
			.sort((a, b) => Number(!!b.featured) - Number(!!a.featured)),
		[activeCat, vendors, categories, vendorQuery]
	);

	if (mainTab === "shop") {
		return (
			<WeddingShopPage
				onBack={() => setMainTab("vendors")}
				onOpenMyTryOns={() => { setMainTab("vendors"); setWedView("my-try-ons"); }}
			/>
		);
	}
	if (wedView === "detail" && selectedVendor) return <WeddingVendorDetail vendor={selectedVendor} onBack={() => setWedView("grid")} onBook={info => { setPayInfo(info); setWedView("payment"); }} />;
	if (wedView === "payment" && payInfo) return <WeddingVendorPaymentPage info={payInfo} onBack={() => setWedView("detail")} onPaid={(paid) => {
		const id = paid?.bookingId;
		if (id && isAuthenticated()) {
			attachWeddingBookingToPlan(id).catch(() => { /* planner attach is best-effort */ });
		}
		setBookingInfo(paid || payInfo);
		setWedView("confirm");
	}} />;
	if (wedView === "confirm" && bookingInfo) {
		return (
			<WeddingConfirmPage
				info={bookingInfo}
				onRate={() => {
					setWedView("rate");
					setSelectedVendor(null);
					setBookingInfo(null);
					setPayInfo(null);
				}}
				onDone={() => {
					setWedView("grid");
					setSelectedVendor(null);
					setBookingInfo(null);
					setPayInfo(null);
				}}
			/>
		);
	}
	if (wedView === "rate") return <WeddingRateVendorsPanel onBack={() => setWedView("grid")} />;
	if (wedView === "my-try-ons") return <WeddingMyTryOnsPanel onBack={() => { setWedView("grid"); setMainTab("shop"); }} />;

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, ...pageInset }}>
			<div style={weddingContentShell(1100)}>
			<div style={{ padding: isMobile ? "16px 0 0" : "32px 0 0" }}>
				<div style={{ position: "relative", marginBottom: isMobile ? 16 : 20, textAlign: "center" }}>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px, 6vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6, paddingInline: isMobile ? 0 : (isAuthenticated() ? 180 : 0) }}>{landingTitle}</h2>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 14, lineHeight: 1.45, maxWidth: 640, margin: "0 auto", paddingInline: 4 }}>{t('wedding.subtitle')}</p>
					<div style={{ position: isMobile || isTablet ? "static" : "absolute", top: 0, right: 0, marginTop: isMobile || isTablet ? 14 : 0, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
						{isAuthenticated() && (
							<button type="button" onClick={() => setWedView("rate")} style={{ ...ACTION_BTN, flex: isMobile ? "1 1 auto" : undefined, textAlign: "center" }}>{i18n.t("wedding.rateVendor")}</button>
						)}
						{isAuthenticated() && (
							<button type="button" onClick={() => setWedView("my-try-ons")} style={{ ...ACTION_BTN, background: "rgba(219,40,119,0.08)", border: "1px solid rgba(219,40,119,0.28)", flex: isMobile ? "1 1 auto" : undefined, textAlign: "center" }}>{i18n.t("wedding.myTryOns")}</button>
						)}
						{isAuthenticated() ? (
							<div style={{ flex: isMobile ? "1 1 100%" : undefined, display: "flex", justifyContent: "center" }}>
								<HostListingCTA vertical="wedding" label={i18n.t("wedding.listServices")} onCreated={() => loadVendors(0, false)} />
							</div>
						) : (
							<button
								type="button"
								onClick={() => {
									window.location.href = import.meta.env.VITE_LOGIN_URL ?? "https://strug.ca/en/login";
								}}
								style={{ ...ACTION_BTN, background: "rgba(219,40,119,0.15)", padding: "10px 18px", flex: isMobile ? "1 1 auto" : undefined }}
							>
								{i18n.t("wedding.listServices")}
							</button>
						)}
					</div>
				</div>
				<ConciergeEntryBanner
					title={t("wedding.conciergeCtaTitle")}
					body={t("wedding.conciergeCtaBody")}
				/>
				{/* Main tabs: Vendors / Shop */}
				<div className="bg-surface" style={{ display: "flex", borderRadius: 12, padding: 4, gap: 4, width: isMobile ? "100%" : "fit-content", maxWidth: "100%", marginBottom: 20, marginLeft: "auto", marginRight: "auto", boxSizing: "border-box" }}>
					{[{ id: "vendors", label: i18n.t("wedding.vendors") }, { id: "shop", label: i18n.t("shop.title") }].map(tab => (
						<button key={tab.id} onClick={() => setMainTab(tab.id)} className={mainTab === tab.id ? "text-text-primary" : "text-text-secondary"} style={{ flex: isMobile ? 1 : undefined, padding: isMobile ? "10px 12px" : "7px 22px", borderRadius: 10, border: "none", cursor: "pointer", background: mainTab === tab.id ? "var(--color-surface-raised)" : "transparent", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, transition: "all 0.15s" }}>{tab.label}</button>
					))}
				</div>
				<div className="od-search-wrap" style={{ width: "min(560px, 100%)", margin: "0 auto 18px" }}>
					<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: isMobile ? "12px 14px" : "12px 16px", gap: 10 }}>
						<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={18} /></div>
						<input value={vendorQuery} onChange={(e) => setVendorQuery(e.target.value)} placeholder={i18n.t("wedding.searchPlaceholder")} className="text-text-primary" style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", fontSize: isMobile ? 15 : 15, fontFamily: "'DM Sans', sans-serif" }} />
					</div>
				</div>
				<div style={weddingCategoryRow(isMobile)}>
					{categories.map((c, i) => (
						<div key={c.id} style={{ flexShrink: 0 }}>
							<LeoButton cat={c} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} delay={i * 30} />
						</div>
					))}
				</div>
			</div>
			{vendorLoadError && (
				<div style={{ textAlign: "center", marginBottom: 16, paddingInline: 8 }}>
					<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#fbbf24", marginBottom: 10 }}>{i18n.t("wedding.loadError")}</p>
					<button type="button" onClick={() => loadVendors(0, false)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("wedding.retryLoad")}</button>
				</div>
			)}
			<div style={{ ...weddingCardGrid(isMobile ? 160 : 260, isMobile ? 12 : 20), paddingBottom: pageBottom }}>
				{vendorLoading ? Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="bg-surface border border-border" style={{ borderRadius: 16, overflow: "hidden", animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
						<Skel h={isMobile ? 140 : 170} r={0} /><div style={{ padding: 16 }}><Skel w="70%" h={14} r={6} style={{ marginBottom: 8 }} /><Skel w="45%" h={12} r={5} style={{ marginBottom: 12 }} /><div style={{ display: "flex", justifyContent: "space-between" }}><Skel w={60} h={12} r={5} /><Skel w={60} h={16} r={6} /></div></div>
					</div>
				)) : vendorLoadError ? null : filtered.length === 0 ? (
					<div className="text-text-secondary" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
						{activeCat === "all" && !vendorQuery.trim() ? i18n.t("wedding.noVendors") : i18n.t("wedding.noVendorsInCategory")}
					</div>
				) : filtered.map((v, i) => (
					<div key={v.id} onClick={() => { setSelectedVendor(v); setWedView("detail"); }}
						className="bg-surface border border-border" style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s", animation: `fadeUp 0.35s ease ${i * 50}ms both`, minWidth: 0 }}
						onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
						onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.transform = "none"; }}>
						<div style={{ height: isMobile ? 140 : 160, background: thumbStyle(v.thumb), position: "relative" }}>
							<div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", borderRadius: 6, padding: "3px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{v.type}</div>
						</div>
						<div style={{ padding: "14px 16px" }}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, gap: 8 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</p>
								{v.rating != null && (
									<div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}><span style={{ color: "#f59e0b", fontSize: 12 }}>★</span><span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>{v.rating}</span></div>
								)}
							</div>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.location}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: WEDDING_ACCENT_SOFT }}>{i18n.t("wedding.fromPrice", { price: money(v.price, v.currency || LISTING_CURRENCY) })}</p>
						</div>
					</div>
				))}
			</div>
			{!vendorLoading && !vendorLoadError && vendorOffset < vendorTotal && (
				<div style={{ textAlign: "center", paddingBottom: pageBottom }}>
					<button type="button" disabled={vendorLoadingMore} onClick={() => loadVendors(vendorOffset, true)}
						style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: vendorLoadingMore ? "wait" : "pointer" }}>
						{vendorLoadingMore ? "…" : i18n.t("common.loadMore")}
					</button>
				</div>
			)}
			</div>
		</div>
	);
}

export { WeddingPage };
