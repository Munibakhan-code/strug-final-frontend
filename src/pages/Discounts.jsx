import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { getDiscounts, validatePromoCode, reportDiscount } from '../api/discounts';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonProductCard } from "../components/skeletons.jsx";
import { LeoButton, Tooltip } from "../components/shared.jsx";
import {
	CheckoutPage as FoodCheckoutPage,
	TrackingPage as FoodTrackingPage,
	VERTICAL_PRODUCT_TYPE,
	pickCheckoutProductTypeId,
	createVerticalPlaceOrderHandler,
} from "../components/shared-shopping/SharedShopping.jsx";
import { useResolvedProductTypeId } from "../hooks/useResolvedProductTypeId.js";
import { getUserRegion, fmt } from "../utils/regionConfig";
import { getUser } from "../store/auth";
import {
	DISCOUNT_CATEGORY_DEFS,
	calcDiscountPct,
	computePromoDiscountAmount,
	discountsPathForDeal,
	filterDiscountDeals,
	mapApiDeal,
	parseDiscountsPath,
} from "../utils/discountBrowse.js";

function DiscountCartPage({ cart, setCart, onBack, onCheckout, promoCode, setPromoCode, promoDiscount, setPromoDiscount, promoPromotionId }) {
	const { isMobile } = useViewport();
	const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
	const [promoApplied, setPromoApplied] = useState(Boolean(promoDiscount));
	const [promoError, setPromoError] = useState(null);
	const [promoLoading, setPromoLoading] = useState(false);
	const discountAmount = computePromoDiscountAmount(promoDiscount, subtotal);
	const { tax: taxRate, currency } = getUserRegion();
	const discountedSubtotal = Math.max(0, subtotal - discountAmount);
	const platformFee = discountedSubtotal * 0.08;
	const activeTaxRate = (getUser()?.country && taxRate !== undefined && taxRate !== null) ? taxRate : 0;
	const tax = (discountedSubtotal + platformFee) * activeTaxRate;
	const grandTotal = discountedSubtotal + platformFee + tax;

	async function handleApplyPromo() {
		const code = String(promoCode || "").trim();
		if (!code && !promoPromotionId) return;
		setPromoLoading(true);
		setPromoError(null);
		try {
			const res = await validatePromoCode(code || null, {
				subtotal,
				vertical: 'discounts',
				...(promoPromotionId ? { promotion_id: promoPromotionId } : {}),
			});
			if (res.valid) {
				setPromoApplied(true);
				if (res.code) setPromoCode(res.code);
				setPromoDiscount({ type: res.type, value: res.value, label: res.label, code: res.code || code });
			} else {
				setPromoError(res.message || i18n.t("food.checkout.invalidPromo", { defaultValue: "Invalid promo code" }));
				setPromoDiscount(null);
				setPromoApplied(false);
			}
		} catch (err) {
			setPromoError(err?.response?.data?.message || i18n.t("food.checkout.invalidPromo", { defaultValue: "Invalid promo code" }));
			setPromoDiscount(null);
			setPromoApplied(false);
		} finally {
			setPromoLoading(false);
		}
	}

	useEffect(() => {
		if (!promoPromotionId || promoDiscount) return;
		handleApplyPromo();
		// Apply once when arriving from browse tap-to-apply (code is not on the public feed).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [promoPromotionId]);

	if (cart.length === 0) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, opacity: 0.45 }}>
			<svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
			<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{i18n.t("discounts.cartEmpty")}</p>
			<button onClick={onBack} style={{ background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: "10px 22px", cursor: "pointer" }}>{i18n.t("discounts.browseDeals")}</button>
		</div>
	);
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, animation: "fadeUp 0.3s ease both" }}>
			<div style={{ paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("discounts.backToDeals")}
				</button>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 24 }}>{i18n.t("discounts.yourCart")}</h1>
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 28, alignItems: "start" }}>
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{cart.map((item, i) => (
							<div key={item.lineId} className="bg-surface border border-border" style={{ borderRadius: 12, padding: "12px 14px" }}>
								<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
									<div style={{ width: 52, height: 52, borderRadius: 10, background: item.gradient, flexShrink: 0 }} />
									<div style={{ flex: 1 }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{item.name}</p>
										{item.brand && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{item.brand}</p>}
									</div>
									<div className="bg-surface-raised" style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 8, padding: "4px 10px" }}>
										<button onClick={() => setCart(c => c.map((ci, ci_i) => ci_i === i ? { ...ci, qty: Math.max(0, ci.qty - 1) } : ci).filter(ci => ci.qty > 0))} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>−</button>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{item.qty}</span>
										<button onClick={() => setCart(c => c.map((ci, ci_i) => ci_i === i ? { ...ci, qty: ci.qty + 1 } : ci))} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>+</button>
									</div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, minWidth: 52, textAlign: "right" }}>{fmt(item.price * item.qty, currency)}</p>
									<Tooltip text="Remove item"><button
										onClick={() => setCart(c => c.filter(ci => ci.lineId !== item.lineId))}
										className="text-text-muted"
										style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 5px", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
										aria-label="Remove item"
									>
										<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
									</button></Tooltip>
								</div>
							</div>
						))}
					</div>
					<div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 12 }}>
						<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "18px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("floral.orderSummary")}</p>
							{[
								[i18n.t("discounts.subtotal"), fmt(subtotal, currency)],
								...(discountAmount > 0 ? [[promoDiscount?.label || i18n.t("discounts.promoCode"), `−${fmt(discountAmount, currency)}`]] : []),
								[i18n.t("discounts.platformFee"), fmt(platformFee, currency)],
								[i18n.t("discounts.taxLabel", { rate: (activeTaxRate * 100).toFixed(0) }), fmt(tax, currency)]
							].map(([l, v]) => (
								<div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{l}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{v}</span>
								</div>
							))}
							<div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700 }}>{i18n.t("ondemand.hire.total")}</span>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700 }}>{fmt(grandTotal, currency)}</span>
							</div>
						</div>
						<div className="bg-surface border border-border" style={{ borderRadius: 12, padding: "14px 16px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{i18n.t("discounts.promoCode")}</p>
							<div style={{ display: "flex", gap: 8 }}>
								<input value={promoCode} onChange={e => { setPromoCode(e.target.value); setPromoApplied(false); setPromoDiscount(null); setPromoError(null); }} placeholder={i18n.t("discounts.enterCode")} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", caretColor: "#2563eb" }} />
								<button onClick={handleApplyPromo} disabled={promoLoading} style={{ background: promoApplied ? "rgba(16,185,129,0.15)" : "rgba(37,99,235,0.15)", border: `1px solid ${promoApplied ? "rgba(16,185,129,0.35)" : "rgba(37,99,235,0.3)"}`, borderRadius: 8, color: promoApplied ? "#10b981" : "#2563eb", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, padding: "9px 14px", cursor: promoLoading ? "default" : "pointer", whiteSpace: "nowrap" }}>
									{promoLoading ? "…" : promoApplied ? "✓" : i18n.t("discounts.applyPromo")}
								</button>
							</div>
							{promoError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", margin: "8px 0 0" }}>{promoError}</p>}
						</div>
						<button onClick={onCheckout} style={{ width: "100%", padding: "14px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
							{i18n.t("discounts.proceedCheckout")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function DiscountsPage() {
	const { landingTitle, searchPlaceholder } = usePageI18n("discounts");
	const categories = useI18nCategoryList(DISCOUNT_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const { currency } = getUserRegion();
	const [activeCategory, setActiveCategory] = useState("all");
	const [tab, setTab] = useState("all");
	const loading = usePageLoad();
	const [cart, setCart] = useState([]);
	const [discountView, setDiscountView] = useState("landing");
	const [cartShaking, setCartShaking] = useState(false);
	const [dealsData, setDealsData] = useState([]);
	const [loaded, setLoaded] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const [placedOrderId, setPlacedOrderId] = useState(null);
	const [deliveryMode, setDeliveryMode] = useState("delivery");
	const [promoCode, setPromoCode] = useState("");
	const [promoPromotionId, setPromoPromotionId] = useState(null);
	const [promoDiscount, setPromoDiscount] = useState(null);
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState("newest");
	const resolvedProductTypeId = useResolvedProductTypeId(VERTICAL_PRODUCT_TYPE.shop);
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });

	useEffect(() => {
		const handle = setTimeout(() => {
			getDiscounts({ q: query || undefined, sort, include_promos: true })
				.then(r => { setDealsData(Array.isArray(r) ? r.map(mapApiDeal) : []); setLoadError(false); })
				.catch(() => { setDealsData([]); setLoadError(true); })
				.finally(() => setLoaded(true));
		}, 200);
		return () => clearTimeout(handle);
	}, [query, sort]);

	useEffect(() => {
		const apply = () => {
			const parsed = parseDiscountsPath(window.location.pathname);
			if (parsed.view === 'deal' || parsed.view === 'promo') {
				// Keep browse; deep links into origin vertical are preferred via card click.
			}
		};
		apply();
		window.addEventListener('popstate', apply);
		return () => window.removeEventListener('popstate', apply);
	}, []);

	function addToCart(deal) {
		if (deal.dealKind !== 'sale' || !deal.listing_id) return;
		setCart(prev => {
			const existing = prev.find(c => c.lineId === deal.id);
			if (existing) return prev.map(c => c.lineId === deal.id ? { ...c, qty: c.qty + 1 } : c);
			return [...prev, {
				lineId: deal.id,
				seller_id: deal.seller_id ?? null,
				variation_id: deal.variation_id ?? null,
				product_type_id: deal.product_type_id ?? null,
				dealType: deal.dealType,
				name: deal.name,
				brand: deal.brand,
				price: deal.salePrice,
				qty: 1,
				gradient: deal.thumb,
				promo_code: promoDiscount?.code || null,
			}];
		});
		setCartShaking(true);
		setTimeout(() => setCartShaking(false), 500);
	}
	function buyNow(deal) {
		addToCart(deal);
		setDiscountView("checkout");
	}
	function openDeal(deal) {
		const path = discountsPathForDeal(deal);
		if (deal.dealKind === 'sale' && deal.deepLink) {
			window.history.pushState({ nav: deal.sourceVertical || 'shop' }, '', deal.deepLink);
			window.dispatchEvent(new PopStateEvent('popstate'));
			return;
		}
		window.history.pushState({ nav: 'discounts' }, '', path);
	}

	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [discountView]);

	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [discountView]);

	const filtered = useMemo(
		() => filterDiscountDeals(dealsData, { activeCategory, categories, query, tab }, matchesCategory),
		[dealsData, activeCategory, categories, query, tab],
	);
	const cartCount = cart.reduce((s, i) => s + i.qty, 0);

	const cartBadge = discountView !== "cart" && (isMobile ? (
		<button onClick={() => setDiscountView("cart")} style={{ position: "fixed", top: 12, right: 12, zIndex: 50, width: 44, height: 44, borderRadius: "50%", background: cartCount > 0 ? "#2563eb" : "var(--color-border)", border: cartCount > 0 ? "none" : "1px solid var(--color-border)", color: cartCount > 0 ? "#fff" : "var(--color-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: cartCount > 0 ? "0 4px 16px rgba(37,99,235,0.5)" : "none", animation: cartShaking ? "cartShake 0.45s ease" : "none" }}>
			{/* stroke uses currentColor (inherits the button's color above) instead of a hardcoded value — matches the fixed convention used in Food.jsx's equivalent cart badge */}
			<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
			{cartCount > 0 && <span style={{ position: "absolute", top: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
		</button>
	) : (
		<button onClick={() => setDiscountView("cart")} style={{ position: "fixed", top: 20, right: 40, zIndex: 50, display: "flex", alignItems: "center", gap: 8, background: cartCount > 0 ? "#2563eb" : "var(--color-border)", border: cartCount > 0 ? "none" : "1px solid var(--color-border)", borderRadius: 24, color: cartCount > 0 ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, padding: "10px 18px", cursor: "pointer", boxShadow: cartCount > 0 ? "0 4px 20px rgba(37,99,235,0.45)" : "none", transition: "background 0.2s, box-shadow 0.2s", animation: cartShaking ? "cartShake 0.45s ease" : "none", transformOrigin: "center" }}>
			<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
			{cartCount > 0 ? i18n.t("discounts.cartWithCount", { count: cartCount }) : i18n.t("discounts.cartLabel")}
		</button>
	));

	if (discountView === "cart") return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
			<DiscountCartPage
				cart={cart}
				setCart={setCart}
				promoCode={promoCode}
				setPromoCode={setPromoCode}
				promoPromotionId={promoPromotionId}
				promoDiscount={promoDiscount}
				setPromoDiscount={setPromoDiscount}
				onBack={() => setDiscountView("landing")}
				onCheckout={() => setDiscountView("checkout")}
			/>
		</div>
	);
	if (discountView === "checkout") {
		const checkoutSellerId = cart.find((c) => c.seller_id != null)?.seller_id ?? null;
		const restaurant = checkoutSellerId != null
			? { id: checkoutSellerId, name: cart[0]?.brand || i18n.t("discounts.dealFallback", { defaultValue: "Deal" }), fee: "Free" }
			: null;
		const handlePlaceOrder = createVerticalPlaceOrderHandler({
			setOrderId: setPlacedOrderId,
			setDeliveryMode,
			setView: setDiscountView,
		});
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				{cartBadge}
				<FoodCheckoutPage
					cart={cart}
					onBack={() => setDiscountView("cart")}
					onPlaceOrder={handlePlaceOrder}
					restaurant={restaurant}
					sellerId={checkoutSellerId}
					merchantType="seller"
					itemSource="product"
					vertical="discounts"
					productTypeId={pickCheckoutProductTypeId(cart, resolvedProductTypeId)}
					promoCode={promoDiscount?.code || promoCode || null}
				/>
			</div>
		);
	}
	if (discountView === "tracking") return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
			<FoodTrackingPage
				orderId={placedOrderId}
				deliveryMode={deliveryMode}
				merchantType="seller"
				restaurant={cart[0]?.seller_id != null ? { id: cart[0].seller_id, name: cart[0]?.brand || "Store" } : null}
				onDone={() => { setCart([]); setPlacedOrderId(null); setPromoDiscount(null); setPromoCode(""); setPromoPromotionId(null); setDiscountView("landing"); }}
				onBack={() => setDiscountView("landing")}
			/>
		</div>
	);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			<div style={{ width: "100%" }}>
				<div style={{ padding: "28px 0 20px" }}><SkeletonHeading /></div>
				<div style={{ display: "flex", gap: 20, marginBottom: 28 }}>
					{[...Array(7)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
					{[...Array(6)].map((_,i) => <SkeletonProductCard key={i} w={280} imgH={130} />)}
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			{cartBadge}
			<div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
				<div className="bg-bg" style={{ position: "sticky", top: 0, zIndex: 10, padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center" }}>{landingTitle}</h1>
					</div>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
							<select value={sort} onChange={e => setSort(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
								<option value="newest">Newest</option>
								<option value="biggest">Biggest %</option>
								<option value="ending_soon">Ending soon</option>
							</select>
						</div>
					</div>
					<div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
						{[
							['all', i18n.t("discounts.allDeals", { defaultValue: "All" })],
							['sales', i18n.t("discounts.onSale", { defaultValue: "On sale" })],
							['coupons', i18n.t("discounts.coupons", { defaultValue: "Coupons" })],
							['deals', i18n.t("discounts.localDeals", { defaultValue: "Local deals" })],
						].map(([id, label]) => (
							<button key={id} onClick={() => setTab(id)} className="text-text-primary" style={{ background: tab === id ? "rgba(37,99,235,0.18)" : "var(--color-surface-raised)", border: `1px solid ${tab === id ? "#2563eb" : "var(--color-border)"}`, borderRadius: 999, padding: "8px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
						))}
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28, animation: "fadeUp 0.35s ease 60ms both" }}>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })} className={`border ${catScrollState.atStart ? "bg-surface border-border-subtle text-text-muted" : "bg-surface-raised border-border text-text-primary"}`} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, cursor: catScrollState.atStart ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto" }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((cat, i) => (
							<LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />
						))}
					</div>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)" }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				<div style={{ paddingBottom: 24 }}>
					{loaded && filtered.length === 0 ? (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "80px 20px", opacity: 0.5, textAlign: "center" }}>
							<svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600 }}>{loadError ? i18n.t("discounts.loadFailed", { defaultValue: "Couldn't load deals." }) : i18n.t("discounts.emptyTitle", { defaultValue: "No active deals right now" })}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, maxWidth: 360 }}>{i18n.t("discounts.emptyBody", { defaultValue: "Sellers haven’t put anything on sale yet. Check back soon — real markdowns will show up here." })}</p>
						</div>
					) : (
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
						{filtered.map((deal, i) => {
							const discountPct = deal.discountPct || calcDiscountPct(deal.origPrice, deal.salePrice);
							const isSale = deal.dealKind === 'sale';
							return (
							<div key={`${deal.dealKind}-${deal.id}`} className="bg-surface" style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${deal.accent}20`, animation: `fadeUp 0.35s ease ${i * 40}ms both`, display: "flex", flexDirection: "column", cursor: "pointer" }} onClick={() => openDeal(deal)}>
								<div style={{ position: "relative", height: 130, background: deal.thumb, flexShrink: 0 }}>
									{deal.image_url && (
									<img src={deal.image_url} alt={deal.name} loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} />
									)}
									{/* Badges overlay a photo/gradient thumbnail — kept as dark chips with white text
									    regardless of theme, same reasoning as Hub.jsx's hero-photo scrim. */}
									{discountPct > 0 && (
									<div style={{ position: "absolute", top: 10, left: 10, background: "#dc2626", borderRadius: 6, padding: "3px 10px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 14, color: "#fff" }}>-{discountPct}{deal.discountType === 'fixed' ? '' : '%'}</div>
									)}
									<div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff" }}>{deal.category}</div>
									{deal.expires && (
									<div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{i18n.t("discounts.ends", { date: deal.expires })}</div>
									)}
								</div>
								<div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, lineHeight: 1.35, marginBottom: 4 }}>{deal.name}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10 }}>{deal.brand || deal.code || deal.dealKind}{isSale && deal.stock > 0 ? ` · ${i18n.t("discounts.left", { count: deal.stock })}` : ""}</p>
									{isSale ? (
									<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
										<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: deal.accent }}>{fmt(deal.salePrice, currency)}</span>
										{discountPct > 0 && (
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textDecoration: "line-through" }}>{fmt(deal.origPrice, currency)}</span>
										)}
									</div>
									) : (
									<div style={{ marginBottom: 14 }}>
										<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#93c5fd" }}>{deal.code ? `Code: ${deal.code}` : deal.description || 'Coupon'}</p>
									</div>
									)}
									{isSale ? (() => { const dealQty = cart.find(c => c.lineId === deal.id)?.qty || 0; return (
									<div style={{ display: "flex", gap: 8, marginTop: "auto" }} onClick={e => e.stopPropagation()}>
										<button onClick={() => addToCart(deal)} className="bg-surface-raised text-text-primary" style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
											{dealQty > 0 ? i18n.t("discounts.cartWithCount", { count: dealQty }) : i18n.t("discounts.addToCart")}
										</button>
										<button onClick={() => buyNow(deal)} style={{ flex: 1, padding: "9px 0", background: deal.accent, border: "none", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
											{i18n.t("discounts.buyNow")}
										</button>
									</div>
									); })() : (
									<div style={{ display: "flex", gap: 8, marginTop: "auto" }} onClick={e => e.stopPropagation()}>
										<button onClick={() => { setPromoCode(deal.code || ''); setPromoPromotionId(deal.promotion_id || null); setDiscountView('cart'); }} style={{ flex: 1, padding: "9px 0", background: deal.accent, border: "none", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
											{i18n.t("discounts.applyPromo")}
										</button>
										<button onClick={async () => { try { await reportDiscount({ promotion_id: deal.promotion_id, reason: 'Reported from Discounts browse' }); } catch { /* noop */ } }} className="bg-surface-raised border border-border text-text-secondary" style={{ padding: "9px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>
											Report
										</button>
									</div>
									)}
								</div>
							</div>
							);
						})}
					</div>
					)}
				</div>
			</div>
		</div>
	);
}

export { DiscountsPage };
