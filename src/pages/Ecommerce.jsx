import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon } from "../components/icons.jsx";
import { SkeletonProductCard, SkeletonCircle, SkeletonHeading } from "../components/skeletons.jsx";
import { getUser } from "../store/auth";
import { getLocationItem, setLocationItem } from "../utils/userLocation.js";
import {
	getProducts as apiFetchProducts,
	getProduct as apiGetProduct,
	getMyOrders,
	getMyCart,
	addToCart as apiAddToCart,
	getProductRatingsBySeller,
	submitProductRating,
	getOrder as getProductOrder,
} from "../api/shop";
import { FoodAddressCapture, FoodCartPage, FoodCheckoutPage, FoodTrackingPage } from "./Food.jsx";
import { fmt, getUserRegion } from "../utils/regionConfig.js";
import { SaveButton } from "../components/SaveButton.jsx";
import { slugify } from "../utils/slugify";
import {
	mapListingToProduct,
	mapListingsToProducts,
	mapListingsToLocalShops,
	mapProductToSelectedShop,
} from "../utils/shopMappers.js";
import { ShopHeroBanner, ShopLogoAvatar, ShopProductImage } from "../components/shop/ShopBrandingMedia.jsx";
import { shopCanAcceptOrders, productCanAddToCart } from "../utils/shopAvailabilityHelpers.js";
import { filterListingsForShopBrowse, shopBrowseListingParams } from "../utils/shopBrowseHelpers.js";
import {
	mapProductCartRowsToLines,
	buildAddToCartPayload,
	mergeCartLine,
	mapProductRatingToReview,
	averageSellerRating,
	buildProductRatingPayload,
} from "../utils/shopBuyerHelpers.js";

function StarRow({ rating, size = 14 }) {
	return (
		<div style={{ display: "flex", gap: 2 }}>
			{[1,2,3,4,5].map(s => (
				<svg key={s} width={size} height={size} viewBox="0 0 24 24"
					fill={s <= rating ? "#f59e0b" : "var(--color-text-muted)"}
					stroke={s <= rating ? "#f59e0b" : "var(--color-text-muted)"}
					strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
				</svg>
			))}
		</div>
	);
}

const ECOM_STATUS_STAGE = { pending: 0, confirmed: 1, shipped: 2, delivered: 3 };

function EcomTrackingPage({ onDone, orderId }) {
	const { isMobile } = useViewport();
	const { t } = useTranslation();
const [stage, setStage] = useState(0);
	const [showRateModal, setShowRateModal] = useState(false);
	const [rating, setRating] = useState(0);
	const [ratingComment, setRatingComment] = useState("");
	const [rated, setRated] = useState(false);
	const [rateBusy, setRateBusy] = useState(false);
	const [rateError, setRateError] = useState("");
	const [resolvedOrder, setResolvedOrder] = useState(null);
	useEffect(() => {
		const uid = getUser()?.id ?? getUser()?.user_id;
		if (!uid) return;
		let mounted = true;
		const poll = () => {
			getMyOrders(uid).then(data => {
				if (!mounted) return;
				const list = Array.isArray(data) ? data : (data?.data ?? []);
				const order = orderId
					? list.find(o => (o.product_order_id ?? o.id) === orderId)
					: list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
				if (order) setResolvedOrder(order);
				if (order?.status != null) {
					const s = ECOM_STATUS_STAGE[order.status];
					if (s !== undefined) setStage(s);
				}
			}).catch(() => {});
		};
		poll();
		const timer = setInterval(poll, 30000);
		return () => { mounted = false; clearInterval(timer); };
	}, [orderId]);

	async function submitRating() {
		if (rating === 0 || rateBusy) return;
		setRateError("");
		const u = getUser();
		const buyerId = u?.id ?? u?.user_id;
		const sellerId = resolvedOrder?.seller_id ?? resolvedOrder?.sellerId;
		const oid = resolvedOrder?.product_order_id ?? resolvedOrder?.id ?? orderId;
		if (!buyerId || !sellerId) {
			setRateError(t("shop.rateMissingOrder", { defaultValue: "Missing order details — try again from Order history." }));
			return;
		}
		setRateBusy(true);
		try {
			await submitProductRating(buildProductRatingPayload({
				sellerId,
				orderId: oid,
				buyerId,
				rating,
				feedback: ratingComment.trim() || undefined,
				productTypeId: resolvedOrder?.product_type_id ?? 1,
			}));
			setShowRateModal(false);
			setRated(true);
		} catch (err) {
			const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message;
			setRateError(String(msg || t("shop.rateFailed", { defaultValue: "Couldn't submit rating. Please try again." })));
		} finally {
			setRateBusy(false);
		}
	}

	const stages = [
		{ label: t("shop.trackingPlaced"), desc: t("shop.trackingPlacedDesc") },
		{ label: t("shop.trackingProcessing"), desc: t("shop.trackingProcessingDesc") },
		{ label: t("shop.trackingShipped"), desc: t("shop.trackingShippedDesc") },
		{ label: t("shop.trackingDelivered"), desc: t("shop.trackingDeliveredDesc") },
	];
	const icons = [
		<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
		<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 5.34L3.93 6.75M19.07 19.07l-1.41-1.41M5.34 18.66l-1.41 1.41M21 12h-3M3 12H1M12 3V1M12 21v-3"/></svg>,
		<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
		<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
	];
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, animation: "fadeUp 0.3s ease both" }}>
			<div style={{ paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 40, paddingBottom: 24 }}>
				<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{t("shop.orderTracking")}</h1>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 36 }}>{t("shop.estDelivery")}</p>
				<div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 32 }}>
					{stages.map((s, i) => (
						<div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
							<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
								<div style={{ width: 40, height: 40, borderRadius: "50%", background: i <= stage ? "#2563eb" : "rgba(255,255,255,0.06)", border: `2px solid ${i <= stage ? "#2563eb" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: i <= stage ? "#fff" : "var(--color-text-muted)", transition: "all 0.3s", flexShrink: 0 }}>{icons[i]}</div>
								{i < stages.length - 1 && <div style={{ width: 2, height: 32, background: i < stage ? "#2563eb" : "var(--color-border)", transition: "background 0.3s" }} />}
							</div>
							<div style={{ paddingTop: 8, paddingBottom: i < stages.length - 1 ? 24 : 0 }}>
								<p className={i <= stage ? "text-text-primary" : "text-text-muted"} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{s.label}</p>
								{i === stage && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{s.desc}</p>}
							</div>
						</div>
					))}
				</div>
				{stage >= stages.length - 1 && (
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{!rated && <button onClick={() => setShowRateModal(true)} style={{ width: "100%", padding: "13px", background: "#2563eb", border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{t("shop.rateOrder")}</button>}
						{rated && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#059669", textAlign: "center" }}>{t("shop.ratingThanks", { defaultValue: "Thanks for your feedback." })}</p>}
						<button onClick={onDone} className="border border-border text-text-secondary" style={{ width: "100%", padding: "13px", background: "rgba(255,255,255,0.05)", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{rated ? t("common.done") : t("shop.skipAndDone")}</button>
					</div>
				)}
				{showRateModal && (
					<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
						<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, animation: "fadeUp 0.25s ease both" }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{t("shop.rateOrderTitle")}</h3>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>{t("shop.rateOrderPrompt")}</p>
							<div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
								{[1,2,3,4,5].map(n => (
									<button key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
										<svg width={30} height={30} viewBox="0 0 24 24" fill={n <= rating ? "#f59e0b" : "none"} stroke={n <= rating ? "#f59e0b" : "var(--color-text-muted)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
									</button>
								))}
							</div>
							<textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder={t("shop.rateCommentPlaceholder")} rows={3} className="border border-border text-text-primary" style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />
							{rateError ? <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginBottom: 12 }}>{rateError}</p> : null}
							<div style={{ display: "flex", gap: 10 }}>
								<button onClick={() => { setShowRateModal(false); onDone(); }} className="border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", background: "rgba(255,255,255,0.06)", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{t("common.cancel")}</button>
								<button disabled={rating === 0 || rateBusy} onClick={submitRating} style={{ flex: 1, padding: "11px 0", background: rating > 0 ? "#2563eb" : "rgba(37,99,235,0.3)", border: "none", borderRadius: 10, color: rating > 0 ? "#fff" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: rating > 0 && !rateBusy ? "pointer" : "default" }}>{rateBusy ? t("common.loading", { defaultValue: "Loading…" }) : t("common.submit")}</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function ShopCard({ shop, delay, fluid }) {
	const { t } = useTranslation();
	const [hov, setHov] = useState(false);
	const open = shopCanAcceptOrders(shop);
	return (
		<div onClick={shop.onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
			width: fluid ? "100%" : 280, borderRadius: 18, overflow: "hidden", cursor: "pointer",
			background: "rgba(255,255,255,0.05)",
			border: `1px solid ${hov ? "var(--color-border)" : "var(--color-border-subtle)"}`,
			transform: hov ? "translateY(-4px)" : "none",
			boxShadow: hov ? "0 16px 48px var(--color-shadow)" : "0 4px 18px var(--color-shadow)",
			transition: "all 0.2s", animation: `fadeUp 0.35s ease ${delay}ms both`, flexShrink: fluid ? undefined : 0,
			opacity: open ? 1 : 0.85,
		}}>
			{/* aspectRatio (not a fixed px height) so the image scales with the card — matches
			    the main food page's RestaurantCard so both listing grids read as one system. */}
			<div style={{ width: "100%", aspectRatio: "16/9", position: "relative" }}>
				<ShopHeroBanner shop={shop} height="100%">
					{/* "Closed" scrim sits over the shop photo — stays a dark overlay regardless of theme so the
					    white label keeps reading against arbitrary photography underneath (see Hub.jsx hero pattern). */}
					{!open && (
						<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
							<span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif" }}>{t("shop.closed")}</span>
						</div>
					)}
					{shop.logoUrl && (
						<div style={{ position: "absolute", bottom: 10, left: 10 }}>
							<ShopLogoAvatar logoUrl={shop.logoUrl} name={shop.name} size={42} />
						</div>
					)}
					<div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.75)", borderRadius: 6, padding: "3px 8px" }}>
						<span style={{ fontSize: 11, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{t("shop.deliveryFeeShort", { fee: shop.fee })}</span>
					</div>
				</ShopHeroBanner>
			</div>
			{/* Condensed single-line meta (rating · delivery time), no separate footer row —
			    same pattern as the main food page's cards. */}
			<div style={{ padding: "10px 12px 12px" }}>
				<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shop.name}</p>
				<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
					<svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b" style={{ flexShrink: 0 }}><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
					<span className="text-text-primary" style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{shop.rating}</span>
					<span className="text-text-muted" style={{ fontSize: 11, flexShrink: 0 }}>&middot;</span>
					<span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shop.delivery}</span>
				</div>
			</div>
		</div>
	);
}

function EcomShareButton({ product }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const refCode = getUser()?.ref_code;
	const base = `${window.location.origin}/listing/shop/${product.id}-${slugify(product.name)}`;
	const url = refCode ? `${base}?ref=${encodeURIComponent(refCode)}` : base;
	return (
		<button type="button" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
			style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: copied ? "#22c55e" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0, minHeight: 44 }}>
			{copied ? (
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
			) : (
				<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
			)}
			{copied ? t("common.copied") : t("common.share", { defaultValue: "Share" })}
		</button>
	);
}

function LocalShopStorePage({ shop, cart, setCart, onBack, onViewCart, initialProductId, onProductSelect, onProductBack, onAddToCart }) {
	const { isMobile } = useViewport();
	const { t, i18n } = useTranslation();
	const { currency } = getUserRegion();
	const allCatKey = "__all__";
	const [storeTab, setStoreTab] = useState("products");
	const [activeCat, setActiveCat] = useState(allCatKey);
	const [selectedItem, setSelectedItem] = useState(null);
	const [qty, setQty] = useState(1);
	const [reviews, setReviews] = useState([]);
	const [avgRating, setAvgRating] = useState(shop?.rating ?? null);

	useEffect(() => {
		if (!initialProductId || !shop?.products?.length) return;
		const item = shop.products.find(p => String(p.id) === String(initialProductId));
		if (item) setSelectedItem(item);
	}, [initialProductId, shop?.products]);

	useEffect(() => {
		if (!shop?.id) return;
		let mounted = true;
		getProductRatingsBySeller(shop.id).then((data) => {
			if (!mounted) return;
			const rows = Array.isArray(data) ? data : (data?.data ?? []);
			const mapped = rows.map(mapProductRatingToReview);
			setReviews(mapped);
			const avg = averageSellerRating(mapped);
			if (avg != null) setAvgRating(avg);
		}).catch(() => {});
		return () => { mounted = false; };
	}, [shop?.id]);
	
	const categoryNames = Array.from(new Set(shop.products.map(p => p.category)));
	const cats = [{ key: allCatKey, label: t("common.all") }, ...categoryNames.map(name => ({ key: name, label: name }))];
	const filtered = activeCat === allCatKey ? shop.products : shop.products.filter(p => p.category === activeCat);
	const cartCount = cart.reduce((s, i) => s + i.qty, 0);
	const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
	const storeOpen = shopCanAcceptOrders(shop);
	const canOrderItem = selectedItem ? productCanAddToCart(selectedItem, shop) : false;

	const handleAddSelected = async () => {
		if (!canOrderItem || !selectedItem) return;
		if (onAddToCart) {
			await onAddToCart(selectedItem, qty);
		} else {
			setCart(prev => mergeCartLine(prev, { ...selectedItem, extras: [], gradient: selectedItem.thumb }, qty));
		}
		setSelectedItem(null);
		setQty(1);
	};

	// Rendered as a centered modal over the (still-visible, dimmed) product grid — not a
	// full-page replacement — matching the main food page's item detail. Reviews moved out to
	// the store page's own Reviews tab (below) since they're seller-level, not per-item, and
	// showed the same list regardless of which product you opened.
	const itemDetailModal = selectedItem && (
		<div
			onClick={() => { setSelectedItem(null); setQty(1); onProductBack?.(); }}
			style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,8,16,0.72)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" }}
		>
			<div
				onClick={e => e.stopPropagation()}
				className="bg-surface-raised border border-border"
				style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", borderRadius: 20, boxShadow: "0 30px 80px var(--color-shadow)", position: "relative", animation: "fadeUp 0.25s ease both" }}
			>
				<button
					onClick={() => { setSelectedItem(null); setQty(1); onProductBack?.(); }}
					aria-label={t("shop.backToShop")}
					style={{ position: "absolute", top: 14, right: 14, zIndex: 2, width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
				>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
				<div style={{ borderRadius: "20px 20px 0 0", aspectRatio: "16/9", width: "100%", position: "relative", overflow: "hidden" }}>
					<ShopProductImage product={selectedItem} style={{ position: "absolute", inset: 0 }} />
					<SaveButton entityType="product" entityId={selectedItem.id}
						meta={{ title: selectedItem.name, sub: selectedItem.category, price: `$${Number(selectedItem.price).toFixed(2)}`, thumb: selectedItem.thumb, accent: "#d97706" }}
						style={{ position: "absolute", top: 12, left: 12 }} />
				</div>
				<div style={{ padding: "18px 22px 22px" }}>
					<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 24, textTransform: "uppercase", letterSpacing: "0.02em" }}>{selectedItem.name}</h2>
						<EcomShareButton product={selectedItem} />
					</div>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14 }}>{selectedItem.category}</p>
					<div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 700 }}>{fmt(selectedItem.price, currency, i18n.language)}</p>
						{selectedItem.discountPct > 0 && (
							<>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textDecoration: "line-through" }}>{fmt(selectedItem.origPrice, currency, i18n.language)}</span>
								<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 12, color: "#fff", background: "#dc2626", borderRadius: 6, padding: "2px 8px" }}>-{selectedItem.discountPct}%</span>
							</>
						)}
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("shop.qty")}</p>
						<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
							<button onClick={() => setQty(q => Math.max(1, q - 1))} disabled={!canOrderItem} className="bg-surface-raised border border-border text-text-primary" style={{ width: 44, height: 44, borderRadius: "50%", cursor: canOrderItem ? "pointer" : "default", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: canOrderItem ? 1 : 0.4 }}>−</button>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{qty}</span>
							<button onClick={() => setQty(q => q + 1)} disabled={!canOrderItem} style={{ width: 44, height: 44, borderRadius: "50%", background: "#2563eb", border: "none", color: "#fff", cursor: canOrderItem ? "pointer" : "default", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: canOrderItem ? 1 : 0.4 }}>+</button>
						</div>
					</div>
					{!storeOpen && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>{t("shop.closed")}</p>
					)}
					{storeOpen && selectedItem.isInStock === false && (
						<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: "#f87171", marginBottom: 12 }}>{t("shop.outOfStock")}</p>
					)}
					<button onClick={handleAddSelected} disabled={!canOrderItem} style={{ width: "100%", padding: "13px", background: canOrderItem ? "#2563eb" : "rgba(37,99,235,0.35)", border: "none", borderRadius: 12, color: canOrderItem ? "#fff" : "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: canOrderItem ? "pointer" : "default" }}>
						{!storeOpen ? t("shop.closed") : selectedItem.isInStock === false ? t("shop.outOfStock") : t("shop.addToCartWithTotal", { total: fmt(selectedItem.price * qty, currency, i18n.language) })}
					</button>
				</div>
			</div>
		</div>
	);

	return (
		<>
		{itemDetailModal}
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", animation: "fadeUp 0.3s ease both" }}>
			<div style={{ paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 28, paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{t("shop.localShops")}
				</button>
				
				{/* Shop hero (gradientOverlay=true) is a full-bleed photo with a dark scrim under it — the
				    "Closed" label, shop name and stats below all stay white-on-dark regardless of theme so
				    they keep reading against arbitrary storefront photography (see Hub.jsx hero pattern). */}
				<ShopHeroBanner shop={shop} height={180} borderRadius={16} gradientOverlay style={{ marginBottom: 20 }}>
					{!storeOpen && (
						<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
							<span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.04em" }}>{t("shop.closed")}</span>
						</div>
					)}
					<div style={{ position: "absolute", bottom: 18, left: 22, display: "flex", alignItems: "flex-end", gap: 14 }}>
						<ShopLogoAvatar logoUrl={shop.logoUrl} name={shop.name} size={56} />
						<div>
							<h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: "#fff", textTransform: "uppercase", marginBottom: 4 }}>{shop.name}</h2>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
									<svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
									<span style={{ fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{avgRating ?? shop.rating ?? "—"}</span>
								</div>
								<span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{shop.delivery}</span>
							</div>
						</div>
					</div>
				</ShopHeroBanner>

				{(shop.bio || shop.returnPolicy || shop.shippingInfo) && (
					<div className="border border-border" style={{ marginBottom: 24, padding: "14px 16px", background: "rgba(255,255,255,0.04)", borderRadius: 14 }}>
						{shop.bio && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: shop.returnPolicy || shop.shippingInfo ? 12 : 0, lineHeight: 1.5 }}>{shop.bio}</p>
						)}
						{shop.returnPolicy && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: shop.shippingInfo ? 6 : 0 }}>
								<span className="text-text-secondary" style={{ fontWeight: 700 }}>{t("shop.returnPolicy")}: </span>
								{shop.returnPolicy}
							</p>
						)}
						{shop.shippingInfo && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>
								<span className="text-text-secondary" style={{ fontWeight: 700 }}>{t("shop.shippingInfo")}: </span>
								{shop.shippingInfo}
							</p>
						)}
					</div>
				)}

				<div style={{ display: "flex", gap: 2, marginBottom: 20, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 3, width: "fit-content" }}>
					{[
						{ id: "products", label: t("shop.productsTab", { defaultValue: "Products" }) },
						{ id: "reviews", label: t("shop.reviewsTab", { defaultValue: "Reviews ({{count}})", count: reviews.length }) },
					].map(tab => (
						<button key={tab.id} onClick={() => setStoreTab(tab.id)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: storeTab === tab.id ? "#2563eb" : "transparent", color: storeTab === tab.id ? "#fff" : "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
							{tab.label}
						</button>
					))}
				</div>

				{storeTab === "reviews" ? (
					<div style={{ maxWidth: 640 }}>
						{avgRating != null && (
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
								<svg width={18} height={18} viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 800, color: "#fff" }}>{avgRating}</span>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{t("shop.reviewsCount", { count: reviews.length, defaultValue: "{{count}} review(s)" })}</span>
							</div>
						)}
						{reviews.length === 0 ? (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.45)", padding: "20px 0" }}>{t("shop.noReviews")}</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>
								{reviews.map((r) => (
									<div key={r.id ?? `${r.name}-${r.stars}-${r.comment}`} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
										<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>{r.name}</span>
											<StarRow rating={r.stars || r.rating || 0} size={12} />
										</div>
										{r.comment && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, margin: 0 }}>{r.comment}</p>}
									</div>
								))}
							</div>
						)}
					</div>
				) : (
				<>
				<div style={{ display: "flex", gap: 8, marginBottom: 24, overflowX: "auto", scrollbarWidth: "none" }}>
					{cats.map(cat => (
						<button key={cat.key} onClick={() => setActiveCat(cat.key)} style={{ padding: "8px 18px", borderRadius: 20, border: `1px solid ${activeCat === cat.key ? "#2563eb" : "var(--color-border)"}`, background: activeCat === cat.key ? "rgba(37,99,235,0.18)" : "transparent", color: activeCat === cat.key ? "#2563eb" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
							{cat.label}
						</button>
					))}
				</div>

				{/* Same card language as the main food page's menu items — image on top (capped
				    max-width so a handful of items don't stretch huge) with a floating quick-add
				    "+" button, instead of the sparse centered-circle tile. */}
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(170px, 200px))", gap: isMobile ? 12 : 16, marginBottom: 32 }}>
					{filtered.map((item, i) => {
						const itemOrderable = productCanAddToCart(item, shop);
						return (
						<div key={item.id} onClick={() => { setSelectedItem(item); onProductSelect?.(item); }} role="button" tabIndex={0}
							onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedItem(item); onProductSelect?.(item); } }}
							style={{ borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", transition: "all 0.2s", opacity: itemOrderable ? 1 : 0.72, animation: `fadeUp 0.3s ease ${i * 40}ms both` }}
							onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.5)"; }}
							onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
							<div style={{ width: "100%", aspectRatio: "1/1", position: "relative" }}>
								<ShopProductImage product={item} style={{ position: "absolute", inset: 0 }} />
								{itemOrderable && (
									<button
										type="button"
										aria-label={t("shop.addToCart", { defaultValue: "Add to cart" })}
										onClick={e => { e.stopPropagation(); onAddToCart?.(item, 1); }}
										style={{ position: "absolute", bottom: 8, right: 8, width: 44, height: 44, borderRadius: "50%", background: "#2563eb", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.55)", transition: "background 0.15s" }}
										onMouseEnter={e => { e.currentTarget.style.background = "#3b82f6"; }}
										onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; }}
									>
										<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
									</button>
								)}
							</div>
							<div style={{ padding: "10px 12px 12px" }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
								{item.isInStock === false ? (
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, fontWeight: 600, color: "#f87171", marginBottom: 4 }}>{t("shop.outOfStock")}</p>
								) : null}
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>{fmt(item.price, currency, i18n.language)}</p>
							</div>
						</div>
						);
					})}
				</div>
				
				{cartCount > 0 && (
					// A compact centered pill (not a full-bleed slab) — matches the main food
					// page's cart bar convention instead of dominating the screen.
					<div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center" }}>
						<button onClick={onViewCart} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#2563eb", border: "none", borderRadius: 28, padding: "8px 18px 8px 8px", cursor: "pointer", boxShadow: "0 10px 30px rgba(37,99,235,0.5)" }}>
							<div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 800, color: "#fff" }}>{cartCount}</span>
							</div>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("shop.viewCart")}</span>
							<span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.3)" }} />
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmt(cartTotal, currency, i18n.language)}</span>
						</button>
					</div>
				)}
				</>
				)}
			</div>
		</div>
		</>
	);
}

function EcommercePage({ initialListingId } = {}) {
	const { isMobile } = useViewport();
	const { t } = useTranslation();
	const loading = usePageLoad();

	const [query, setQuery] = useState("");
	const [view, setView] = useState("landing"); // landing | store | cart | checkout | tracking
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

	const [selectedShop, setSelectedShop] = useState(null);
	const [cart, setCart] = useState([]);
	const [ecomDeliveryMode, setEcomDeliveryMode] = useState("delivery");
	const [placedOrderId, setPlacedOrderId] = useState(null);
	const [cartShaking, setCartShaking] = useState(false);
	const [products, setProducts] = useState([]);
	const didEcomColdLoad = useRef(false);

	useEffect(() => {
		const u = getUser();
		const uid = u?.id ?? u?.user_id;
		if (!uid) return;
		getMyCart(uid).then((data) => {
			const rows = Array.isArray(data) ? data : (data?.data ?? []);
			setCart(mapProductCartRowsToLines(rows));
		}).catch(() => {});
	}, []);

	useEffect(() => {
		try {
			const trackId = sessionStorage.getItem("strug_track_product_order_id");
			if (!trackId) return;
			sessionStorage.removeItem("strug_track_product_order_id");
			const oid = Number(trackId) || trackId;
			setPlacedOrderId(oid);
			setAddressSet(true);
			setView("tracking");
			getProductOrder(oid).then((order) => {
				const seller =
					order?.user_product_order_seller_idTouser
					|| order?.seller
					|| null;
				const sellerId = order?.seller_id ?? seller?.user_id ?? seller?.id;
				if (sellerId == null) return;
				setSelectedShop({
					id: sellerId,
					seller_id: sellerId,
					name: seller?.name || seller?.username || "Shop",
					product_type_id: order?.product_type_id ?? null,
				});
			}).catch(() => {});
		} catch {}
	}, []);

	useEffect(() => {
		if (!initialListingId || didEcomColdLoad.current) return;
		didEcomColdLoad.current = true;
		apiGetProduct(initialListingId).then(async (p) => {
			if (!p) return;
			const product = mapListingToProduct(p);
			let shop = mapProductToSelectedShop(product);
			const sellerId = product.seller_id;
			if (sellerId) {
				try {
					const listingData = await apiFetchProducts({ seller_id: sellerId });
					const items = filterListingsForShopBrowse(Array.isArray(listingData) ? listingData : (listingData?.data ?? []));
					const mapped = mapListingsToProducts(items);
					const shops = mapListingsToLocalShops(mapped);
					const full = shops.find((s) => s.id === sellerId);
					if (full) shop = { ...full, products: full.products?.length ? full.products : [product] };
					else shop = { ...shop, products: mapped.length ? mapped : [product] };
				} catch {
					shop = { ...shop, products: [product] };
				}
			}
			setSelectedShop(shop);
			setAddressSet(true);
			setView("store");
		}).catch(() => {});
	}, [initialListingId]);

	/* Popstate: browser back from /listing/shop/:id → close product detail or shop */
	useEffect(() => {
		const handler = () => {
			if (!/^\/listing\/shop\//.test(window.location.pathname)) {
				if (window.location.pathname.startsWith("/shop")) {
					// Stay on store if we still have a selected shop and only left the listing URL.
					setView((v) => (v === "store" ? "store" : "landing"));
					if (!selectedShop) setView("landing");
				} else {
					setSelectedShop(null);
					setView("landing");
				}
			}
		};
		window.addEventListener('popstate', handler);
		return () => window.removeEventListener('popstate', handler);
	}, [selectedShop]);

	useEffect(() => {
		const lat = parseFloat(getLocationItem('strug_user_lat'));
		const lng = parseFloat(getLocationItem('strug_user_lng'));
		const userLat = Number.isFinite(lat) ? lat : null;
		const userLng = Number.isFinite(lng) ? lng : null;

		apiFetchProducts(shopBrowseListingParams({ userLat, userLng })).then(data => {
			const items = filterListingsForShopBrowse(Array.isArray(data) ? data : (data?.data ?? []));
			// Nearby stores first, then sellers who never set store coords — RANKED last, not hidden.
			// Hiding them (Phase 7) meant a seller who skipped the location field vanished from the
			// storefront for every located buyer, while their own dashboard still looked healthy.
			setProducts(mapListingsToProducts(items, { userLat, userLng }));
		}).catch(() => {});
	}, [addressSet]);

	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [view]);

	const cartCount = cart.reduce((s, i) => s + i.qty, 0);

	const localShops = mapListingsToLocalShops(products, { query });

	const handleAddToCart = async (item, qty = 1) => {
		const u = getUser();
		const buyerId = u?.id ?? u?.user_id;
		const sellerId = selectedShop?.id ?? item?.seller_id;
		setCart((prev) => mergeCartLine(prev, {
			...item,
			seller_id: sellerId,
			product_type_id: item?.product_type_id ?? null,
			extras: [],
			gradient: item.thumb,
			lineId: item.lineId ?? item.id,
		}, qty));
		setCartShaking(true);
		setTimeout(() => setCartShaking(false), 450);
		if (!buyerId || !sellerId || item?.variation_id == null) return;
		try {
			await apiAddToCart(buildAddToCartPayload({
				item,
				buyerId,
				sellerId,
				qty,
				productTypeId: item?.product_type_id ?? null,
			}));
			const data = await getMyCart(buyerId);
			const rows = Array.isArray(data) ? data : (data?.data ?? []);
			setCart(mapProductCartRowsToLines(rows));
		} catch {
			/* local cart already updated — sync is best-effort */
		}
	};

	const checkoutSellerId = selectedShop?.id ?? cart.find((i) => i?.seller_id != null)?.seller_id ?? null;
	const checkoutRestaurant = selectedShop || (checkoutSellerId != null
		? { id: checkoutSellerId, seller_id: checkoutSellerId, name: "Shop" }
		: null);

	const handleViewCartClick = () => {
		setView("cart");
	};
	const isCartView = view === "cart";

	const cartBadge = !isCartView && (
		<div style={{ position: "fixed", top: isMobile ? 12 : (view === "store" ? 72 : 20), right: isMobile ? 12 : 40, zIndex: 50, display: "flex", alignItems: "center", gap: 12 }}>
			{isMobile ? (
				<>
					<button onClick={() => window.__nav?.("orders")} className="bg-surface-glass border border-border text-text-secondary" style={{ backdropFilter: "blur(12px)", borderRadius: 20, padding: "8px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{t("shop.myOrders", { defaultValue: "My Orders" })}</button>
					<button onClick={handleViewCartClick} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: cartCount > 0 ? "#2563eb" : "var(--color-surface-raised)", border: cartCount > 0 ? "none" : "1px solid var(--color-border)", borderRadius: "50%", color: cartCount > 0 ? "#fff" : "var(--color-text-secondary)", cursor: "pointer", boxShadow: cartCount > 0 ? "0 4px 20px rgba(37,99,235,0.45)" : "none", transition: "background 0.2s, box-shadow 0.2s", animation: cartShaking ? "cartShake 0.45s ease" : "none", transformOrigin: "center" }}>
						<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
						{cartCount > 0 && <span style={{ position: "absolute", top: -3, right: -3, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
					</button>
				</>
			) : (
				<button onClick={handleViewCartClick} style={{ display: "flex", alignItems: "center", gap: 8, background: cartCount > 0 ? "#2563eb" : "var(--color-surface-raised)", border: cartCount > 0 ? "none" : "1px solid var(--color-border)", borderRadius: 24, color: cartCount > 0 ? "#fff" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, padding: "10px 18px", cursor: "pointer", boxShadow: cartCount > 0 ? "0 4px 20px rgba(37,99,235,0.45)" : "none", transition: "background 0.2s, box-shadow 0.2s", animation: cartShaking ? "cartShake 0.45s ease" : "none", transformOrigin: "center" }}>
					<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
					{cartCount > 0 ? t("shop.cartWithCount", { count: cartCount }) : t("shop.cart")}
				</button>
			)}
		</div>
	);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 32, overflow: "hidden" }}>
			<div style={{ padding: "28px 0 20px", display: "flex", justifyContent: "center", alignItems: "center" }}>
				<SkeletonHeading />
			</div>
			<div style={{ display: "flex", gap: 20, marginBottom: 28 }}>
				{[...Array(8)].map((_,i) => <SkeletonCircle key={i} />)}
			</div>
			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: isMobile ? 16 : 20 }}>
				{[...Array(8)].map((_,i) => <SkeletonProductCard key={i} w="100%" />)}
			</div>
		</div>
	);

	if (!addressSet) {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				{cartBadge}
				<FoodAddressCapture allowAutoResume={false} onConfirm={(addr, lat, lng) => {
					setDeliveryAddr(addr);
					setAddressSet(true);
					try {
						setLocationItem('strug_user_address', addr);
						if (lat) setLocationItem('strug_user_lat', String(lat));
						if (lng) setLocationItem('strug_user_lng', String(lng));
					} catch {}
				}} subtitle={t("shop.addressSubtitle")} ctaLabel={t("shop.findShops")} />
			</div>
		);
	}
	if (view === "store" && selectedShop) {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				{cartBadge}
				<LocalShopStorePage shop={selectedShop} cart={cart} setCart={setCart}
					onBack={() => { setSelectedShop(null); setView("landing"); window.history.pushState({}, '', '/shop'); }}
					onViewCart={() => setView("cart")}
					initialProductId={initialListingId}
					onProductSelect={item => window.history.pushState({}, '', `/listing/shop/${item.id}-${slugify(item.name)}`)}
					onProductBack={() => window.history.pushState({}, '', `/shop`)}
					onAddToCart={handleAddToCart} />
			</div>
		);
	}
	if (view === "cart") {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				<FoodCartPage cart={cart} setCart={setCart} onBack={() => setView(selectedShop ? "store" : "landing")} onCheckout={() => setView("checkout")} backLabel={t("shop.backToShop")} emptyLabel={t("shop.browseShops")} persistProductCart />
			</div>
		);
	}
	if (view === "checkout") {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				<FoodCheckoutPage cart={cart} onBack={() => setView("cart")} onPlaceOrder={(oid, mode) => { setPlacedOrderId(oid); if (mode) setEcomDeliveryMode(mode); setView("tracking"); }} restaurant={checkoutRestaurant} sellerId={checkoutSellerId} deliveryAddr={deliveryAddr} vendorTypeId={1} productTypeId={cart.find((i) => i?.product_type_id != null)?.product_type_id ?? null} itemSource="product" vertical="shop" />
			</div>
		);
	}
	if (view === "tracking") {
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				<FoodTrackingPage orderId={placedOrderId} deliveryMode={ecomDeliveryMode} onDone={() => { setCart([]); setSelectedShop(null); setPlacedOrderId(null); setEcomDeliveryMode("delivery"); setView("landing"); }} onBack={() => setView("landing")} restaurant={selectedShop} merchantType="seller" />
			</div>
		);
	}

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden", position: "relative" }}>
			{cartBadge}
			<div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
				<div className="bg-bg" style={{ padding: "28px 0 20px", paddingTop: isMobile ? 12 : 28, animation: "fadeUp 0.3s ease both", position: "sticky", top: 0, zIndex: 10 }}>
					{isMobile && (
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", marginBottom: 12, marginTop: 0 }}>{t("nav.shop")}</h1>
					)}
					<div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20, position: "relative" }}>
						<div className="border border-border" style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "9px 14px", cursor: "pointer" }} onClick={() => setAddressSet(false)}>
							<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
							<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{deliveryAddr || t("shop.setAddress")}</span>
						</div>
						{!isMobile && <button onClick={() => window.__nav?.("orders")} className="text-text-secondary" style={{ position: "absolute", right: 150, background: "none", border: "none", padding: "7px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }} onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-primary)"} onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-secondary)"}>{t("shop.myOrders", { defaultValue: "My Orders" })} →</button>}
					</div>
					<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
						{/* Dark glass "search well" — matches this exact treatment across every other vertical browse
							page (Food, TempStay, Venues, ...), so it stays hardcoded rather than tokenized here alone. */}
						<div className="od-search-inner" style={{ background: "rgba(14,12,20,0.92)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
							<div style={{ color: "rgba(255,255,255,0.55)", flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("shop.searchProducts")} style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				<div className="ecom-products" style={{ paddingBottom: 24 }}>
					{localShops.length === 0 ? (
						<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "center", marginTop: 40 }}>{t("shop.noLocalShops")}</p>
					) : (
						// Capped max-width (not 1fr) — with only a few shops, auto-fit's 1fr stretched each
						// card to fill the whole row on large screens. A fixed max leaves trailing
						// whitespace instead of ballooning card size (same fix as Food.jsx's menu grid).
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 320px))", gap: isMobile ? 16 : 20 }}>
							{localShops.map((shop, i) => (
								<ShopCard key={shop.id} shop={{...shop, onClick: () => { if (!shopCanAcceptOrders(shop)) return; setSelectedShop(shop); setView("store"); }}} delay={i * 40} fluid />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export { EcommercePage, EcomTrackingPage };


