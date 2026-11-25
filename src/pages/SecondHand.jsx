import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { getProducts } from '../api/shop';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonProductCard } from "../components/skeletons.jsx";
import { LeoButton } from "../components/shared.jsx";
import {
	CartPage as FoodCartPage,
	CheckoutPage as FoodCheckoutPage,
	TrackingPage as FoodTrackingPage,
	VERTICAL_PRODUCT_TYPE,
	verticalBrowseListingParams,
	readBuyerBrowseCoords,
	mapListingsToVerticalCatalog,
	mapVerticalProductToCartLine,
	pickCheckoutProductTypeId,
	createVerticalPlaceOrderHandler,
} from "../components/shared-shopping/SharedShopping.jsx";
import { useResolvedProductTypeId } from "../hooks/useResolvedProductTypeId.js";
const SECONDHAND_CATEGORY_DEFS = [
	{ id: "all", labelKey: "events.categories.all", color: "#2563eb", match: null },
	{ id: "category-clothing", labelKey: "secondhand.categoryClothing", color: "#db2877", match: "Clothing" },
	{ id: "category-electronics", labelKey: "secondhand.categoryElectronics", color: "#7c3aed", match: "Electronics" },
	{ id: "category-furniture", labelKey: "secondhand.categoryFurniture", color: "#d97706", match: "Furniture" },
	{ id: "title", labelKey: "books.title", color: "#0891b2", match: "Books" },
	{ id: "sports", labelKey: "events.categories.sports", color: "#059669", match: "Sports" },
	{ id: "category-collectibles", labelKey: "secondhand.categoryCollectibles", color: "#dc2626", match: "Collectibles" },
	{ id: "category-other", labelKey: "secondhand.categoryOther", color: "#65a30d", match: "Other" },
];

const CONDITION_COLOR = { "Like New": "#059669", "Good": "#2563eb", "Fair": "#d97706" };

function SecondHandProductDetail({ product, onBack, onAddToCart, cartCount = 0, onViewCart }) {
	const { isMobile } = useViewport();
	const [qty, setQty] = useState(1);
	const [msgOpen, setMsgOpen] = useState(false);
	const [msgText, setMsgText] = useState("");
	const [msgSent, setMsgSent] = useState(false);
	const sellerRating = (4.5 + (product.id % 5) * 0.08).toFixed(1);
	const sellerListings = 3 + (product.id * 7) % 24;
	const sellerSales = 10 + (product.id * 13) % 90;

	const condDesc = {
		"Like New": i18n.t("secondhand.conditionDescLikeNew"),
		"Good":     i18n.t("secondhand.conditionDescGood"),
		"Fair":     i18n.t("secondhand.conditionDescFair"),
	};

	return (
		<div style={{ flex: 1, overflowY: "auto", paddingTop: 28, paddingRight: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108 }}>
			{isMobile && onViewCart && (
				<button onClick={onViewCart} style={{ position: "fixed", top: 12, right: 12, zIndex: 50, width: 44, height: 44, borderRadius: "50%", background: cartCount > 0 ? "#2563eb" : "var(--color-surface-raised)", border: cartCount > 0 ? "none" : "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: cartCount > 0 ? "0 4px 16px rgba(37,99,235,0.5)" : "none", color: cartCount > 0 ? "#fff" : "var(--color-text-secondary)" }}>
					{/* was hardcoded stroke="#fff" — bug: invisible on the light-mode neutral surface when cart is empty. Fixed to currentColor to track the button's color. */}
					<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
					{cartCount > 0 && <span style={{ position: "absolute", top: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
				</button>
			)}
			<div style={{ maxWidth: 860, display: "flex", gap: 28, flexWrap: "wrap" }}>
				{/* Left: image + description */}
				<div style={{ flex: 2, minWidth: 280 }}>
					<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
						{i18n.t("secondhand.backToSecondHand")}
					</button>
					<div style={{ height: 280, borderRadius: 16, background: (product.thumb && String(product.thumb).startsWith("http")) ? `url(${product.thumb}) center/cover no-repeat` : (product.thumb || "linear-gradient(135deg,#1e3a5f,#2563eb)"), marginBottom: 20, position: "relative" }}>
						{product.condition && <span style={{ position: "absolute", top: 12, left: 12, background: (CONDITION_COLOR[product.condition] || "#2563eb") + "22", border: `1px solid ${(CONDITION_COLOR[product.condition] || "#2563eb")}50`, borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: CONDITION_COLOR[product.condition] || "#2563eb" }}>{product.condition}</span>}
						{/* Chip sits on the product photo — kept dark/white regardless of theme for legibility, matching the same pattern in Hub.jsx's PageCard badges. */}
						<span style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.5)", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{product.category}</span>
					</div>
					<h2 className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 20, lineHeight: 1.3, marginBottom: 10 }}>{product.name}</h2>
					<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 28 }}>${product.price}</span>
						{product.originalPrice && <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, textDecoration: "line-through" }}>${product.originalPrice}</span>}
						{product.originalPrice && <span style={{ background: "rgba(5,150,105,0.12)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 6, padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#059669" }}>{i18n.t("secondhand.percentOff", { pct: Math.round((1 - product.price / product.originalPrice) * 100) })}</span>}
					</div>
					{/* Description */}
					<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>{i18n.t("pinboard.fieldDescription")}</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 10 }}>
							{condDesc[product.condition]} {i18n.t("secondhand.listedByInCategory", { seller: product.seller, category: product.category })}
						</p>
						<div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
							{[
								{ label: i18n.t("shop.condition"), value: product.condition, color: CONDITION_COLOR[product.condition] },
								{ label: i18n.t("pinboard.category"), value: product.category, color: "#60a5fa" },
								{ label: i18n.t("secondhand.listed"), value: "2 days ago", color: "var(--color-text-secondary)" },
							].map(d => (
								<div key={d.label}>
									<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 2 }}>{d.label}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: d.color }}>{d.value}</p>
								</div>
							))}
						</div>
					</div>
					{/* Seller profile */}
					<div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: "16px 18px" }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 14 }}>{i18n.t("secondhand.sellerProfile")}</p>
						<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
							<div style={{ width: 48, height: 48, borderRadius: "50%", background: product.avatarColor || "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff", flexShrink: 0 }}>{product.avatar}</div>
							<div style={{ flex: 1 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{product.seller}</p>
								<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
										<span style={{ color: "#f59e0b", fontSize: 13 }}>★</span>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{sellerRating}</span>
									</div>
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("secondhand.listingsSales", { listings: sellerListings, sales: sellerSales })}</span>
								</div>
							</div>
							<button onClick={() => setMsgOpen(v => !v)} className="bg-surface-raised border border-border text-text-secondary" style={{ borderRadius: 10, padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>{i18n.t("automotive.message")}</button>
						</div>
						{msgOpen && (
							<div>
								{msgSent ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#059669" }}>{i18n.t("secondhand.messageSentReply", { seller: product.seller })}</p>
								) : (
									<>
										<textarea value={msgText} onChange={e => setMsgText(e.target.value)} rows={3} placeholder={i18n.t("secondhand.messagePlaceholder", { seller: product.seller })}
											className="bg-surface-raised border border-border text-text-primary"
											style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "none", outline: "none", marginBottom: 10 }} />
										<button onClick={() => { if (!msgText.trim()) return; setMsgSent(true); }} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("common.send")}</button>
									</>
								)}
							</div>
						)}
					</div>
				</div>
				{/* Right: buy panel */}
				<div style={{ flex: 1, minWidth: 220, maxWidth: 280 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 16, padding: "20px", position: "sticky", top: 0 }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 4 }}>${product.price}</p>
						{product.originalPrice && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 16, textDecoration: "line-through" }}>{i18n.t("secondhand.wasPrice", { price: product.originalPrice })}</p>}
						{!product.originalPrice && <p style={{ marginBottom: 16 }} />}
						<div className="bg-surface-raised" style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 10, padding: "6px 14px", marginBottom: 14, width: "fit-content" }}>
							<button onClick={() => setQty(q => Math.max(1, q - 1))} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>−</button>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: "center" }}>{qty}</span>
							<button onClick={() => setQty(q => q + 1)} className="text-text-primary" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>+</button>
						</div>
						<button onClick={() => onAddToCart({ ...product, qty })} style={{ width: "100%", padding: "13px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>{i18n.t("shop.addToCart")}</button>
						<button onClick={() => onAddToCart({ ...product, qty })} className="bg-surface-raised border border-border text-text-secondary" style={{ width: "100%", padding: "12px", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("shop.buyNow")}</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function SecondHandPage() {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("secondhand");
	const categories = useI18nCategoryList(SECONDHAND_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const [activeCategory, setActiveCategory] = useState("all");
	const loading = usePageLoad();

	const [query, setQuery] = useState("");
	const [shView, setShView] = useState("stores"); // stores | browse | product | cart | checkout | tracking
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [shView]);
	const [selectedItem, setSelectedItem] = useState(null);
	const [cart, setCart] = useState([]);
	const [showRateModal, setShowRateModal] = React.useState(false);
	const [shRating, setShRating] = React.useState(0);
	const [shRatingComment, setShRatingComment] = React.useState("");
	const [shRated, setShRated] = React.useState(false);
	const handleRatingDone = () => { setShowRateModal(false); setCart([]); setShView("stores"); };
	const [shItems, setShItems] = useState([]);
	const [shShops, setShShops] = useState([]);
	const [activeShop, setActiveShop] = useState(null);
	const [placedOrderId, setPlacedOrderId] = useState(null);
	const [deliveryMode, setDeliveryMode] = useState("delivery");
	const resolvedProductTypeId = useResolvedProductTypeId(VERTICAL_PRODUCT_TYPE.secondhand);

	useEffect(() => {
		const { userLat, userLng } = readBuyerBrowseCoords();
		getProducts(verticalBrowseListingParams(VERTICAL_PRODUCT_TYPE.secondhand, { userLat, userLng }))
			.then((r) => {
				const list = Array.isArray(r) ? r : (r?.data ?? []);
				const { products, shops } = mapListingsToVerticalCatalog(list, {
					userLat,
					userLng,
					hideStoresWithoutCoords: false,
					defaultCondition: "Good",
				});
				setShItems(products);
				setShShops(shops.map((s) => ({
					...s,
					eta: s.delivery || s.eta || "—",
					accent: "#2563eb",
					color: "#1a2a3a",
				})));
			})
			.catch(() => {});
	}, []);

	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });
	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [shView]);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ width: "100%" }}>
				<div style={{ padding: "28px 0 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<SkeletonHeading />
					<Skel w={100} h={34} r={20} />
				</div>
				<Skel w="100%" h={42} r={12} style={{ marginBottom: 16 }} />
				<div style={{ display: "flex", gap: 20, marginBottom: 28 }}>
					{[...Array(8)].map((_,i) => <SkeletonCircle key={i} />)}
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
					{[...Array(8)].map((_,i) => <SkeletonProductCard key={i} w={240} imgH={200} />)}
				</div>
			</div>
		</div>
	);

	function addToCart(item) {
		setCart(prev => {
			const line = mapVerticalProductToCartLine(item, item.qty || 1);
			const ex = prev.find(c => c.lineId === line.lineId);
			if (ex) return prev.map(c => c.lineId === line.lineId ? { ...c, qty: c.qty + line.qty } : c);
			return [...prev, line];
		});
		setShView("browse");
		setSelectedItem(null);
	}

	const handlePlaceOrder = createVerticalPlaceOrderHandler({
		setOrderId: setPlacedOrderId,
		setDeliveryMode,
		setView: setShView,
	});

	if (shView === "product" && selectedItem) return <SecondHandProductDetail product={selectedItem} onBack={() => setShView("browse")} onAddToCart={item => { addToCart(item); }} cartCount={cart.reduce((s,c) => s+c.qty, 0)} onViewCart={() => setShView("cart")} />;
	if (shView === "cart") return <FoodCartPage cart={cart} setCart={setCart} onBack={() => setShView("browse")} onCheckout={() => setShView("checkout")} backLabel={t("secondhand.backToShop")} emptyLabel={t("secondhand.browseListings")} />;
	if (shView === "checkout") {
		const currentShop = shShops.find(s => s.id === activeShop) || shShops[0];
		return (
			<FoodCheckoutPage
				cart={cart}
				onBack={() => setShView("cart")}
				onPlaceOrder={handlePlaceOrder}
				restaurant={currentShop}
				sellerId={activeShop}
				productTypeId={pickCheckoutProductTypeId(cart, resolvedProductTypeId)}
				merchantType="seller"
				itemSource="product"
				vertical="secondhand"
			/>
		);
	}
	if (shView === "tracking") return (
		<>
			<FoodTrackingPage
				orderId={placedOrderId}
				deliveryMode={deliveryMode}
				restaurant={shShops.find(s => s.id === activeShop) || shShops[0]}
				merchantType="seller"
				onDone={() => setShowRateModal(true)}
				onBack={() => setShView("stores")}
			/>
			{showRateModal && (
				// Modal backdrop dim layer — stays dark in both themes (same treatment as the
				// SpotlightOverlay scrim in Hub.jsx); the panel itself is tokenized below.
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both", boxShadow: "0 24px 64px var(--color-shadow)" }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{i18n.t("secondhand.rateSeller")}</h3>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>{i18n.t("rideshare.howWasExperience")}</p>
						<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
							{[1,2,3,4,5].map(n => (
								<button key={n} onClick={() => setShRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
									<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= shRating ? "#f59e0b" : "none"} stroke={n <= shRating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								</button>
							))}
						</div>
						<textarea value={shRatingComment} onChange={e => setShRatingComment(e.target.value)} placeholder={i18n.t("common.optionalComment")} rows={3} className="bg-surface-raised border border-border text-text-primary" style={{ width: "100%", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
						<div style={{ display: "flex", gap: 10 }}>
							<button onClick={() => { setPlacedOrderId(null); handleRatingDone(); }} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("ondemand.hire.skip")}</button>
							<button disabled={shRating === 0} onClick={() => { setShRated(true); setPlacedOrderId(null); handleRatingDone(); }} style={{ flex: 1, padding: "11px 0", background: shRating > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: shRating > 0 ? "#fff" : "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: shRating > 0 ? "pointer" : "default" }}>{i18n.t("common.submit")}</button>
						</div>
					</div>
				</div>
			)}
		</>
	);

	const totalItems = cart.reduce((s, c) => s + c.qty, 0);

	// ── Stores view ──
	if (shView === "stores") {
		const sortedShops = shShops.filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()));
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto" }}>
				<div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
					<div style={{ padding: "28px 0 20px", textAlign: "center" }}>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>{landingTitle}</h1>
						<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 24 }}>{t("secondhand.browseBySeller")}</p>
						<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
							<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
								<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={20} /></div>
								<input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("secondhand.searchSellersPlaceholder")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif" }} />
							</div>
						</div>
					</div>

					{sortedShops.length === 0 ? (
						<div style={{ textAlign: "center", padding: "60px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{t("secondhand.noSellersFound")}</p>
						</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
							{sortedShops.map((shop, i) => (
								<div key={shop.id} onClick={() => { setActiveShop(shop.id); setShView("browse"); setQuery(""); }}
									className="border border-border-subtle bg-surface"
									style={{ borderRadius: 16, padding: 20, cursor: "pointer", transition: "all 0.2s" }}
									onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
									onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; }}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
										<div style={{ width: 44, height: 44, borderRadius: "50%", background: shop.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff" }}>{shop.avatar}</div>
										<div>
											<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{shop.name}</p>
											<p className="text-text-secondary" style={{ fontSize: 12 }}>{t("secondhand.defaultSeller")}</p>
										</div>
									</div>
									<p className="text-text-secondary" style={{ fontSize: 12, marginBottom: 10 }}>{shop.eta}</p>
									<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
										<span style={{ color: "#f59e0b", fontSize: 13 }}>★</span>
										<span className="text-text-primary" style={{ fontSize: 12, fontWeight: 600 }}>{shop.rating}</span>
										<span className="text-text-muted" style={{ fontSize: 11 }}>({shop.reviews} reviews)</span>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		);
	}

	const currentShop = shShops.find(s => s.id === activeShop) || shShops[0];
	const filtered = shItems.filter(item => {
		const matchShop = item.seller_id === activeShop;
		const matchCat = matchesCategory(activeCategory, item.category, categories);
		const matchQ = !query || item.name.toLowerCase().includes(query.toLowerCase());
		return matchShop && matchCat && matchQ;
	});

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", overflow: "hidden" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
						<button onClick={() => { setShView("stores"); setActiveShop(null); }} className="bg-surface-raised text-text-secondary" style={{ width: 28, height: 28, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
							onMouseEnter={e => { e.currentTarget.style.background = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
							onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
							<svg width={7} height={12} viewBox="0 0 7 12" fill="none"><path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
						</button>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", flex: 1, textAlign: "center", marginRight: 40 }}>{currentShop?.name ?? title}</h1>
					</div>
					{currentShop && (
						<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 20, textAlign: "center" }}>{currentShop.eta} · {currentShop.rating} ★</p>
					)}
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28, animation: "fadeUp 0.3s ease 60ms both" }}>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
						className={`border ${catScrollState.atStart ? "bg-surface border-border-subtle text-text-muted" : "bg-surface-raised border-border text-text-primary"}`}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, cursor: catScrollState.atStart ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((cat, i) => <LeoButton key={cat.id} cat={cat} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} delay={i * 30} />)}
					</div>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				<div style={{ flex: 1, overflowY: "auto", paddingBottom: totalItems > 0 ? 88 : 24 }}>
					{filtered.length === 0 ? (
						<div style={{ textAlign: "center", padding: "60px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>No items found in this store.</p>
						</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(240px, 1fr))", gap: isMobile ? 12 : 20 }}>
							{filtered.map((item, i) => (
								<div key={item.id} onClick={() => { setSelectedItem(item); setShView("product"); }} className="bg-surface border border-border-subtle" style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", animation: `fadeUp 0.35s ease ${i * 40}ms both`, transition: "transform 0.15s, border-color 0.15s" }}
									onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
									onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; }}>
									<div style={{ height: isMobile ? 130 : 200, background: item.thumb.startsWith("http") ? `url(${item.thumb}) center/cover no-repeat` : item.thumb, position: "relative" }}>
										<span style={{ position: "absolute", top: 8, left: 8, background: CONDITION_COLOR[item.condition] + "22", border: `1px solid ${CONDITION_COLOR[item.condition]}50`, borderRadius: 5, padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: CONDITION_COLOR[item.condition] }}>{item.condition}</span>
									</div>
									<div style={{ padding: isMobile ? "10px 10px 12px" : "12px 14px 14px" }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: isMobile ? 12 : 13, lineHeight: 1.35, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.name}</p>
										<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
											<div style={{ width: 16, height: 16, borderRadius: "50%", background: item.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{item.avatar}</div>
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.seller}</span>
										</div>
										<div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
											<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: isMobile ? 14 : 16 }}>${item.price}</span>
											{item.originalPrice && <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textDecoration: "line-through" }}>${item.originalPrice}</span>}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
				{totalItems > 0 && (
					<div style={{ position: "fixed", bottom: isMobile ? 78 : 24, left: "50%", transform: "translateX(-50%)", zIndex: 50 }}>
						<button onClick={() => setShView("cart")} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 28px", background: "#2563eb", border: "none", borderRadius: 50, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 8px 32px rgba(37,99,235,0.5)" }}>
							<span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "2px 10px", fontSize: 13 }}>{totalItems}</span>
							View Cart
							<span>${cart.reduce((s, c) => s + c.price * c.qty, 0).toFixed(2)}</span>
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

export { SecondHandPage };
