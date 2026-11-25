import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, DigProductsIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonProductCard } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble } from "../components/shared.jsx";
import { CheckoutPage as FoodCheckoutPage, createVerticalPlaceOrderHandler } from "../components/shared-shopping/SharedShopping.jsx";
import client from '../api/client';

const DIGPROD_CATEGORY_DEFS = [
	{ id: "all", labelKey: "common.all", color: "#2563eb", match: null },
	{ id: "templates", labelKey: "digproducts.categories.templates", color: "#7c3aed", match: "Templates" },
	{ id: "courses", labelKey: "digproducts.categories.courses", color: "#059669", match: "Courses" },
	{ id: "presets", labelKey: "digproducts.categories.presets", color: "#db2777", match: "Presets" },
	{ id: "assets", labelKey: "digproducts.categories.assets", color: "#d97706", match: "Assets" },
	{ id: "ebooks", labelKey: "digproducts.categories.ebooks", color: "#0891b2", match: "E-books" },
	{ id: "audio", labelKey: "messages.audio", color: "#dc2626", match: "Audio" },
];

function DigProductDetailPage({ product, onBack, onBuy }) {
	const { isMobile, isTablet } = useViewport();
	const loading = usePageLoad(150);
	const [buying, setBuying] = useState(false);
	const [activeTab, setActiveTab] = useState("overview");

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, overflowY: "auto", padding: "32px 40px 32px 0" }}>
				<Skel w={100} h={16} r={6} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
					<Skel w="min(380px,100%)" h={285} r={18} />
					<div style={{ flex: 1, minWidth: 260 }}>
						<Skel w={80} h={22} r={6} style={{ marginBottom: 14 }} />
						<Skel w="80%" h={30} r={8} style={{ marginBottom: 10 }} />
						<Skel w="40%" h={14} r={6} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={180} r={14} />
					</div>
				</div>
			</div>
		</div>
	);

	const ratingStars = product.rating;
	const starPct = n => Math.round(product.reviews * (n === 5 ? 0.68 : n === 4 ? 0.22 : n === 3 ? 0.07 : 0.02));

	return (
		<div style={{ flex: 1, overflowY: "auto", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, paddingTop: 32, paddingBottom: 24 }}>
			<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>{i18n.t("digproducts.back")}</button>
			<div style={{ display: "flex", gap: 36, flexWrap: "wrap", marginBottom: 32 }}>
				{/* Preview */}
				<div style={{ width: (isMobile || isTablet) ? "100%" : "min(360px,100%)", aspectRatio: "4/3", borderRadius: 18, background: product.thumb, flexShrink: 0, boxShadow: "0 20px 60px var(--color-shadow)", position: "relative" }}>
					{/* Format badge overlays the product thumb (photo/gradient) -- stays a dark scrim in both themes for legibility */}
					<div style={{ position: "absolute", top: 14, left: 14, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", borderRadius: 8, padding: "5px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#60a5fa" }}>{product.format}</div>
				</div>
				{/* Info + buy card */}
				<div style={{ flex: 1, minWidth: 260 }}>
					<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
						<span className="bg-surface-raised text-text-secondary" style={{ borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{product.category}</span>
					</div>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 8, lineHeight: 1.2 }}>{product.title}</h1>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
						<span style={{ color: "#f59e0b", fontSize: 14 }}>{"★".repeat(Math.round(ratingStars))}</span>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{product.rating}</span>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>({product.reviews.toLocaleString()} {i18n.t("digproducts.reviews")})</span>
					</div>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>{i18n.t("digproducts.bySeller")} <span style={{ color: "#60a5fa", fontWeight: 600 }}>{product.seller}</span> · {(product.sellerSales || 0).toLocaleString()} {i18n.t("digproducts.sales")}</p>
					{/* File info pills */}
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
						{[
							{ icon: "📁", label: product.fileSize },
							{ icon: "🔖", label: `v${product.version}` },
							{ icon: "📅", label: i18n.t("digproducts.updated", { date: product.updated }) },
						].map(pill => (
							<span key={pill.label} className="bg-surface border border-border text-text-secondary" style={{ borderRadius: 8, padding: "5px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{pill.icon} {pill.label}</span>
						))}
					</div>
					<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "20px", marginBottom: 16 }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32 }}>${product.price}</p>
							<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#059669", background: "rgba(5,150,105,0.12)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>{i18n.t("digproducts.instantDownload")}</span>
						</div>
						<button onClick={() => { setBuying(true); setTimeout(() => onBuy(product), 350); }}
							style={{ width: "100%", background: buying ? "#059669" : "#2563eb", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: "pointer", transition: "background 0.2s", marginBottom: 10 }}>
							{buying ? i18n.t("digproducts.processing") : i18n.t("digproducts.buyDownload")}
						</button>
						<div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
							{[i18n.t("digproducts.lifetimeAccess"), i18n.t("digproducts.freeUpdates"), i18n.t("digproducts.secureCheckout")].map(f => (
								<span key={f} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{f}</span>
							))}
						</div>
					</div>
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center" }}>{i18n.t("digproducts.compatibleWith", { value: product.compatibility })}</p>
				</div>
			</div>
			{/* Tabs */}
			<div style={{ borderBottom: "1px solid var(--color-border)", marginBottom: 24 }}>
				<div style={{ display: "flex", gap: 0 }}>
					{["overview", "whats-included", "reviews"].map(tab => (
						<button key={tab} onClick={() => setActiveTab(tab)}
							style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab ? "#2563eb" : "transparent"}`, color: activeTab === tab ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s", textTransform: "capitalize" }}>
							{tab === "whats-included" ? i18n.t("digproducts.tabWhatsIncluded") : tab === "overview" ? i18n.t("digproducts.tabOverview") : i18n.t("digproducts.tabReviews")}
						</button>
					))}
				</div>
			</div>
			{activeTab === "overview" && (
				<div style={{ maxWidth: 640 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
						{i18n.t("digproducts.overviewText1", { compatibility: product.compatibility })}
						<br /><br />
						{i18n.t("digproducts.overviewText2", { count: product.sellerSales?.toLocaleString() })}
					</p>
					<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
						{[i18n.t("digproducts.instantAccess"), i18n.t("digproducts.noSubscription"), i18n.t("digproducts.commercialLicense"), i18n.t("digproducts.prioritySupport")].map(f => (
							<div key={f} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 8, padding: "6px 12px" }}>
								<span style={{ color: "#059669", fontSize: 12 }}>✓</span>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{f}</span>
							</div>
						))}
					</div>
				</div>
			)}
			{activeTab === "whats-included" && (
				<div style={{ maxWidth: 560 }}>
					<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.05em", marginBottom: 16 }}>{i18n.t("digproducts.filesContents")}</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{(product.includes || []).map((item, i) => (
							<div key={i} className="bg-surface border border-border" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10 }}>
								<span style={{ color: "#2563eb", fontSize: 16, flexShrink: 0 }}>📄</span>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{item}</p>
							</div>
						))}
					</div>
				</div>
			)}
			{activeTab === "reviews" && (
				<div style={{ maxWidth: 560 }}>
					<div style={{ display: "flex", gap: 32, marginBottom: 28, flexWrap: "wrap" }}>
						<div style={{ textAlign: "center" }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 52, lineHeight: 1 }}>{product.rating}</p>
							<span style={{ color: "#f59e0b", fontSize: 18 }}>{"★".repeat(Math.round(product.rating))}</span>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>{product.reviews.toLocaleString()} {i18n.t("digproducts.reviews")}</p>
						</div>
						<div style={{ flex: 1, minWidth: 200 }}>
							{[5, 4, 3, 2].map(n => {
								const count = starPct(n);
								const pct = Math.round((count / product.reviews) * 100);
								return (
									<div key={n} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
										<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, width: 14 }}>{n}</span>
										<span style={{ color: "#f59e0b", fontSize: 11 }}>★</span>
										<div className="bg-surface-raised" style={{ flex: 1, height: 6, borderRadius: 3, overflow: "hidden" }}>
											<div style={{ height: "100%", width: `${pct}%`, background: "#f59e0b", borderRadius: 3 }} />
										</div>
										<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, width: 30 }}>{pct}%</span>
									</div>
								);
							})}
						</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
						{[
							{ user: "CreativeStudio99", text: "Saved me at least 20 hours of work. Absolutely worth it.", stars: 5, time: "2 days ago" },
							{ user: "marketer_m",      text: "Clean, well-organized, and easy to customize. Will buy again.", stars: 5, time: "1 week ago" },
							{ user: "SoloFreelancer",  text: "Good product, though took me a while to set up. Great value.", stars: 4, time: "2 weeks ago" },
						].map((r, i) => (
							<div key={i} className="bg-surface border border-border" style={{ borderRadius: 12, padding: "14px 16px" }}>
								<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13 }}>{r.user}</span>
									<span style={{ color: "#f59e0b", fontSize: 12 }}>{"★".repeat(r.stars)}</span>
								</div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>{r.text}</p>
								<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{r.time}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export function DigProductConfirmPage({ product, orderId, onDone }) {
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, fontSize: 32 }}>↓</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 10 }}>{i18n.t("digproducts.purchaseComplete")}</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 6 }}><span className="text-text-primary" style={{ fontWeight: 600 }}>{product?.title}</span></p>
			{orderId != null && (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>
					{i18n.t("common.orderId", { defaultValue: "Order" })} #{orderId}
				</p>
			)}
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 28 }}>{i18n.t("digproducts.downloadSent")}</p>
			<button style={{ background: "#2563eb", border: "none", borderRadius: 12, padding: "12px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer", marginBottom: 12 }}>{i18n.t("digproducts.downloadNow")}</button>
			<button onClick={onDone} className="text-text-secondary" style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer" }}>{i18n.t("digproducts.backToProducts")}</button>
		</div>
	);
}

const getDigCategory = (title = '') => {
	const t = title.toLowerCase();
	if (t.includes('notion') || t.includes('dashboard') || t.includes('templates')) return 'Templates';
	if (t.includes('preset') || t.includes('presets') || t.includes('lightroom') || t.includes('lut')) return 'Presets';
	if (t.includes('mockup') || t.includes('kit') || t.includes('assets') || t.includes('ui')) return 'Assets';
	return 'Templates';
};

const getDigFormat = (title = '', cat = '') => {
	if (cat === 'Presets') return '.XMP';
	if (title.toLowerCase().includes('notion')) return 'Notion';
	if (title.toLowerCase().includes('figma')) return 'Figma';
	return 'ZIP';
};

function DigitalProductsPage({ onNavigate }) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("digproducts");
	const categories = useI18nCategoryList(DIGPROD_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	// Stable category id (DIGPROD_CATEGORY_DEFS[].id), never the translated label —
	// item.category holds the English API value, so filtering must go through matchesCategory.
	const [cat, setCat] = useState("all");
	const [dpView, setDpView] = useState("stores"); // stores | browse | detail | checkout | confirm
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [dpView]);
	const [selectedProd, setSelectedProd] = useState(null);
	const [cart, setCart] = useState([]);
	const [placedOrderId, setPlacedOrderId] = useState(null);
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
	}, [dpView]);

	const [dpItems, setDpItems] = useState([]);
	const [dpShops, setDpShops] = useState([]);
	const [activeCreator, setActiveCreator] = useState(null);
	const [query, setQuery] = useState("");

	useEffect(() => {
		client.get('/dg-content', { params: { category: 'DigitalProducts' } }).then(res => {
			const list = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
			const sellersMap = {};
			const mappedProds = list.map((b, idx) => {
				const sId = b.author || 'Productivity Labs';
				if (!sellersMap[sId]) {
					sellersMap[sId] = {
						id: sId,
						name: sId,
						avatar: sId.charAt(0).toUpperCase(),
						avatarColor: ["#7c3aed", "#2563eb", "#ef4444", "#16a34a", "#f59e0b", "#ec4899"][idx % 6],
						eta: "Instant Download",
						rating: 4.9,
						reviews: 24 + (idx * 11) % 50,
						fee: 0.00,
						color: "#13131f",
						accent: "#2563eb",
					};
				}
				const category = getDigCategory(b.content_title);
				return {
					id: b.content_id,
					title: b.content_title || 'Untitled Product',
					description: b.content_description || '',
					seller: sId,
					price: Number(b.price) || 0,
					format: getDigFormat(b.content_title, category),
					fileSize: "4.2 MB",
					version: "1.0",
					updated: "Jun 2026",
					compatibility: "All platform compatible",
					includes: ["Instant download", "Documentation included", "Lifetime free updates"],
					thumb: b.cover_img_url || ["linear-gradient(135deg,#1e1b4b,#7c3aed)", "linear-gradient(135deg,#0c1a2e,#2563eb)", "linear-gradient(135deg,#0f172a,#ef4444)"][idx % 3],
					category,
					rating: 4.8,
					reviews: 15 + (idx * 7) % 30,
					avatarColor: sellersMap[sId].avatarColor,
					avatar: sellersMap[sId].avatar,
				};
			});
			setDpItems(mappedProds);
			setDpShops(Object.values(sellersMap));
		}).catch(() => {});
	}, []);

	if (dpView === "detail" && selectedProd) return <DigProductDetailPage product={selectedProd} onBack={() => setDpView("browse")} onBuy={p => { setCart([{ ...p, qty: 1 }]); setDpView("checkout"); }} />;
	
	if (dpView === "checkout") {
		const currentShop = dpShops.find(s => s.id === activeCreator) || dpShops[0];
		const handlePlaceOrder = createVerticalPlaceOrderHandler({
			setOrderId: setPlacedOrderId,
			setView: setDpView,
			trackingView: "confirm",
		});
		return (
			<FoodCheckoutPage
				cart={cart.map(item => ({
					lineId: item.id,
					id: item.id,
					name: item.title,
					price: item.price,
					qty: item.qty,
					gradient: item.thumb,
					extras: []
				}))}
				onBack={() => setDpView("detail")}
				onPlaceOrder={handlePlaceOrder}
				restaurant={currentShop}
				sellerId={activeCreator}
				isDigital={true}
				merchantType="seller"
				itemSource="digital"
				vertical="digitalproducts"
			/>
		);
	}

	if (dpView === "confirm") return (
		<DigProductConfirmPage
			product={selectedProd}
			orderId={placedOrderId}
			onDone={() => { setDpView("stores"); setSelectedProd(null); setCart([]); setActiveCreator(null); setPlacedOrderId(null); }}
		/>
	);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ width: "100%" }}>
				<div style={{ padding: "28px 0 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<SkeletonHeading />
				</div>
				<Skel w="100%" h={42} r={12} style={{ marginBottom: 16 }} />
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
					{[...Array(8)].map((_,i) => <SkeletonProductCard key={i} w={240} imgH={160} />)}
				</div>
			</div>
		</div>
	);

	// ── Stores view ──
	if (dpView === "stores") {
		const sortedShops = dpShops.filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()));
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto" }}>
				<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
					<div style={{ padding: "28px 0 20px", textAlign: "center" }}>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>{landingTitle}</h1>
						<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 24 }}>{t("digproducts.subtitle")}</p>
						<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
							<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
								<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={20} /></div>
								<input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("digproducts.searchCreatorsPlaceholder")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif" }} />
							</div>
						</div>
					</div>

					{sortedShops.length === 0 ? (
						<div style={{ textAlign: "center", padding: "60px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{t("digproducts.noCreatorsFound")}</p>
						</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
							{sortedShops.map((shop, i) => (
								<div key={shop.id} onClick={() => { setActiveCreator(shop.id); setDpView("browse"); setQuery(""); }}
									className="border border-border-subtle bg-surface"
									style={{ borderRadius: 16, padding: 20, cursor: "pointer", transition: "all 0.2s" }}
									onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
									onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; }}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
										<div style={{ width: 44, height: 44, borderRadius: "50%", background: shop.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff" }}>{shop.avatar}</div>
										<div>
											<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{shop.name}</p>
											<p className="text-text-secondary" style={{ fontSize: 12 }}>{t("digproducts.digitalCreator")}</p>
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

	const currentShop = dpShops.find(s => s.id === activeCreator) || dpShops[0];
	const filtered = dpItems.filter(item => {
		const matchShop = item.seller === activeCreator;
		const matchCat = matchesCategory(cat, item.category, categories);
		const matchQ = !query || item.title.toLowerCase().includes(query.toLowerCase());
		return matchShop && matchCat && matchQ;
	});

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", overflow: "hidden" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
						<button onClick={() => { setDpView("stores"); setActiveCreator(null); }} className="bg-surface text-text-secondary" style={{ width: 28, height: 28, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
							onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-raised)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
							onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}>
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
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search products by ${currentShop?.name ?? ""}...`} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						</div>
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28, animation: "fadeUp 0.3s ease 60ms both" }}>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
						className={catScrollState.atStart ? "bg-surface text-text-muted" : "bg-surface-raised text-text-primary"}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, border: `1px solid ${catScrollState.atStart ? "var(--color-border-subtle)" : "var(--color-border)"}`, cursor: catScrollState.atStart ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<div ref={catScrollRef} className="ecom-cat-scroll" style={{ flex: 1, display: "flex", gap: 20, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", justifyContent: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "center" : "flex-start" }}>
						{categories.map((c, i) => <LeoButton key={c.id} cat={c} active={cat === c.id} onClick={() => setCat(c.id)} delay={i * 30} />)}
					</div>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
				<div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
					{filtered.length === 0 ? (
						<div style={{ textAlign: "center", padding: "60px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>No products found for this creator.</p>
						</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>
							{filtered.map((prod, i) => (
								<div key={prod.id} onClick={() => { setSelectedProd(prod); setDpView("detail"); }}
									className="bg-surface border border-border"
									style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s", animation: `fadeUp 0.35s ease ${i * 40}ms both` }}
									onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
									onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; e.currentTarget.style.transform = "none"; }}>
									<div style={{ height: 150, background: prod.thumb, position: "relative" }}>
										{/* Format badge overlays the product thumb -- stays a dark scrim in both themes for legibility */}
										<div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", borderRadius: 6, padding: "3px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#60a5fa" }}>{prod.format}</div>
									</div>
									<div style={{ padding: "14px 16px" }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 4, lineHeight: 1.35 }}>{prod.title}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10 }}>{prod.seller}</p>
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
											<div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#f59e0b", fontSize: 12 }}>★</span><span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{prod.rating}</span></div>
											<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#60a5fa" }}>${prod.price}</span>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export { DigitalProductsPage };
