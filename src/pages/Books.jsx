import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { getBooks } from '../api/books';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonHeading, SkeletonProductCard } from "../components/skeletons.jsx";
import { LeoButton } from "../components/shared.jsx";
import { CheckoutPage as FoodCheckoutPage, createVerticalPlaceOrderHandler } from "../components/shared-shopping/SharedShopping.jsx";
import { DigProductConfirmPage } from "./DigitalProducts.jsx";

const BOOK_GENRE_DEFS = [
	{ id: "all", labelKey: "common.all", color: "#2563eb", match: null },
	{ id: "business", labelKey: "learn.categories.business", color: "#059669", match: "Business" },
	{ id: "tech", labelKey: "meet.categories.tech", color: "#7c3aed", match: "Tech" },
	{ id: "fiction", labelKey: "books.genres.fiction", color: "#d97706", match: "Fiction" },
	{ id: "biography", labelKey: "books.genres.biography", color: "#0891b2", match: "Biography" },
	{ id: "romance", labelKey: "books.genres.romance", color: "#db2777", match: "Romance" },
];

function BookDetailPage({ book, onBack, onBuy }) {
	const { t } = usePageI18n("books");
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [added, setAdded] = useState(false);
	const [wishlisted, setWishlisted] = useState(false);
	const [bookTab, setBookTab] = useState("about"); // about | details | reviews

	const related = useMemo(() => [], []);

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, overflowY: "auto", padding: "32px 40px 32px 0" }}>
				<Skel w={140} h={16} r={6} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
					<Skel w={220} h={300} r={16} />
					<div style={{ flex: 1, minWidth: 260 }}>
						<Skel w={80} h={24} r={6} style={{ marginBottom: 12 }} />
						<Skel w="75%" h={36} r={8} style={{ marginBottom: 8 }} />
						<Skel w="40%" h={16} r={6} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={80} r={8} style={{ marginBottom: 28 }} />
						<Skel w={120} h={40} r={8} style={{ marginBottom: 24 }} />
						<Skel w={160} h={48} r={12} />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingTop: 32, paddingBottom: 24 }}>
			<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
				← {t("books.backToBooks")}
			</button>
			<div style={{ display: "flex", gap: 40, flexWrap: "wrap", marginBottom: 32 }}>
				<div style={{ flexShrink: 0 }}>
					<div style={{ width: 220, height: 300, borderRadius: 16, background: book.cover, boxShadow: "0 20px 60px var(--color-shadow)", marginBottom: 12 }} />
					<button onClick={() => setWishlisted(v => !v)}
						style={{ width: 220, background: wishlisted ? "rgba(239,68,68,0.12)" : "var(--color-surface)", border: `1px solid ${wishlisted ? "rgba(239,68,68,0.35)" : "var(--color-border)"}`, borderRadius: 10, padding: "9px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: wishlisted ? "#ef4444" : "var(--color-text-secondary)", cursor: "pointer", transition: "all 0.15s" }}>
						{wishlisted ? t("books.wishlisted") : t("books.addToWishlist")}
					</button>
				</div>
				<div style={{ flex: 1, minWidth: 260 }}>
					<span style={{ display: "inline-block", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#60a5fa", marginBottom: 12 }}>{book.genre}</span>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 36, marginBottom: 6 }}>{book.title}</h1>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 12 }}>{t("books.byAuthor")} <span style={{ color: "#60a5fa", fontWeight: 600 }}>{book.author}</span></p>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
						<span style={{ color: "#f59e0b", fontSize: 16 }}>{"★".repeat(Math.round(book.rating))}</span>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600 }}>{book.rating}</span>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>({book.reviews.toLocaleString()} {t("books.reviews")})</span>
					</div>
					{/* Tabs */}
					<div style={{ borderBottom: "1px solid var(--color-border-subtle)", marginBottom: 20 }}>
						<div style={{ display: "flex", gap: 0 }}>
							{["about", "details", "reviews"].map(tabKey => (
								<button key={tabKey} onClick={() => setBookTab(tabKey)}
									style={{ padding: "8px 18px", background: "none", border: "none", borderBottom: `2px solid ${bookTab === tabKey ? "#2563eb" : "transparent"}`, color: bookTab === tabKey ? "#60a5fa" : "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>
									{tabKey === "about" ? t("books.tabAbout") : tabKey === "details" ? t("books.tabDetails") : t("books.tabReviews")}
								</button>
							))}
						</div>
					</div>
					{bookTab === "about" && (
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.8, marginBottom: 24, maxWidth: 480 }}>{t("books.aboutText")}</p>
					)}
					{bookTab === "details" && (
						<div style={{ marginBottom: 24 }}>
							{[[t("books.format"), t("books.formatValue")], [t("books.language"), t("books.languageValue")], [t("books.pages"), t("books.pagesValue")], [t("books.publisher"), t("books.publisherValue")], [t("books.isbn"), `978-3-${book.id}-${book.reviews}`]].map(([k, v]) => (
								<div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{k}</span>
									<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{v}</span>
								</div>
							))}
						</div>
					)}
					{bookTab === "reviews" && (
						<div style={{ marginBottom: 24 }}>
							{[
								{ name: "BookwormNova", text: "Couldn't put it down. One of the best reads of the year.", stars: 5 },
								{ name: "ReaderK",      text: "The writing is beautiful. Emotional and thought-provoking.", stars: 5 },
								{ name: "Page_Turner",  text: "Great story but a slow start. Worth sticking through.", stars: 4 },
							].map((r, i) => (
								<div key={i} style={{ borderBottom: "1px solid var(--color-border-subtle)", padding: "14px 0" }}>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
										<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13 }}>{r.name}</span>
										<span style={{ color: "#f59e0b", fontSize: 12 }}>{"★".repeat(r.stars)}</span>
									</div>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }}>{r.text}</p>
								</div>
							))}
						</div>
					)}
					<div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
						<span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32 }}>${book.price.toFixed(2)}</span>
						{!book.is_international ? (
							<button onClick={() => { setAdded(true); setTimeout(() => onBuy(book, "local"), 300); }}
								style={{ background: added ? "#059669" : "#2563eb", border: "none", borderRadius: 12, padding: "12px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: "pointer", transition: "background 0.2s" }}>
								{added ? t("books.added") : t("books.buyBookLocal")}
							</button>
						) : (
							<button onClick={() => { setAdded(true); setTimeout(() => onBuy(book, "international"), 300); }}
								style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 12, padding: "12px 28px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#60a5fa", cursor: "pointer", transition: "background 0.2s" }}
								onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.25)"; }}
								onMouseLeave={e => { e.currentTarget.style.background = "rgba(37,99,235,0.15)"; }}>
								{t("books.shipBySellerIntl")}
							</button>
						)}
					</div>
				</div>
			</div>
			{/* More in this genre */}
			{related.length > 0 && (
				<div>
					<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 16 }}>{t("books.moreInGenre", { genre: book.genre })}</h3>
					<div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
						{related.map((b, i) => (
							<div key={b.id} onClick={() => { onBack(); }} style={{ cursor: "pointer", animation: `fadeUp 0.3s ease ${i * 60}ms both` }}>
								<div style={{ width: 130, height: 180, borderRadius: 10, background: b.cover, boxShadow: "0 8px 20px var(--color-shadow)", marginBottom: 8 }} />
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, maxWidth: 130, lineHeight: 1.3, marginBottom: 3 }}>{b.title}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>${b.price.toFixed(2)}</p>
							</div>
						))}
					</div>
				</div>
			)}
			</div>
		</div>
	);
}

const getBookGenre = (title = '') => {
	const t = title.toLowerCase();
	if (t.includes('scaling') || t.includes('business') || t.includes('management') || t.includes('grow')) return 'Business';
	if (t.includes('web') || t.includes('design') || t.includes('node') || t.includes('mastery') || t.includes('javascript') || t.includes('code') || t.includes('programming')) return 'Tech';
	return 'Fiction';
};

function BooksPage() {
	const { t, title, landingTitle } = usePageI18n("books");
const categories = useI18nCategoryList(BOOK_GENRE_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [genre, setGenre] = useState("all");
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
	}, [genre]);

	const [booksView, setBooksView] = useState("stores"); // stores | browse | detail | checkout | tracking
	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [booksView]);
	const [selectedBook, setSelectedBook] = useState(null);
	const [cart, setCart] = useState([]);
	const [booksData, setBooksData] = useState([]);
	const [booksShops, setBooksShops] = useState([]);
	const [activeAuthor, setActiveAuthor] = useState(null);
	const [query, setQuery] = useState("");
	const [placedOrderId, setPlacedOrderId] = useState(null);

	useEffect(() => {
		getBooks().then(r => {
			const list = Array.isArray(r) ? r : [];
			const authorsMap = {};
			const mappedBooks = list.map((b, idx) => {
				const sId = b.author || 'Unknown Author';
				if (!authorsMap[sId]) {
					authorsMap[sId] = {
						id: sId,
						name: sId,
						avatar: sId.charAt(0).toUpperCase(),
						avatarColor: ["#db2877", "#7c3aed", "#d97706", "#0891b2", "#059669", "#dc2626"][idx % 6],
						eta: "Delivery in 3-5 days",
						rating: 4.8,
						reviews: 12 + (idx * 5) % 40,
						fee: 0.00,
						color: "#1a2a3a",
						accent: "#2563eb",
					};
				}
				return {
					id: b.content_id,
					title: b.content_title || 'Untitled',
					author: sId,
					description: b.content_description || '',
					price: Number(b.price) || 0,
					rating: 4.5,
					reviews: 0,
					cover: b.cover_img_url || "linear-gradient(135deg,#1e3a5f,#2563eb)",
					genre: getBookGenre(b.content_title),
					avatarColor: authorsMap[sId].avatarColor,
					avatar: authorsMap[sId].avatar,
					is_international: !!b.is_international,
				};
			});
			setBooksData(mappedBooks);
			setBooksShops(Object.values(authorsMap));
		}).catch(() => {});
	}, []);

	if (booksView === "detail" && selectedBook) {
		return <BookDetailPage book={selectedBook} onBack={() => setBooksView("browse")} onBuy={(b, type) => { setCart([{ ...b, qty: 1, shippingType: type }]); setBooksView("checkout"); }} />;
	}
	if (booksView === "checkout") {
		const currentShop = booksShops.find(s => s.id === activeAuthor) || booksShops[0];
		const handlePlaceOrder = createVerticalPlaceOrderHandler({
			setOrderId: setPlacedOrderId,
			setView: setBooksView,
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
					shippingType: item.shippingType,
					gradient: item.cover,
					extras: []
				}))}
				onBack={() => setBooksView("detail")}
				onPlaceOrder={handlePlaceOrder}
				restaurant={currentShop}
				sellerId={activeAuthor}
				isDigital={true}
				vertical="books"
				merchantType="seller"
				itemSource="digital"
			/>
		);
	}
	if (booksView === "confirm") {
		return (
			<DigProductConfirmPage
				product={selectedBook}
				orderId={placedOrderId}
				onDone={() => { setBooksView("stores"); setSelectedBook(null); setCart([]); setActiveAuthor(null); setPlacedOrderId(null); }}
			/>
		);
	}

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ width: "100%" }}>
				<div style={{ padding: "28px 0 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<SkeletonHeading />
				</div>
				<Skel w="100%" h={42} r={12} style={{ marginBottom: 16 }} />
				<div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
					{[...Array(8)].map((_,i) => <SkeletonProductCard key={i} w={170} imgH={240} />)}
				</div>
			</div>
		</div>
	);

	// ── Stores view ──
	if (booksView === "stores") {
		const sortedShops = booksShops.filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()));
		return (
			<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflowY: "auto" }}>
				<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
					<div style={{ padding: "28px 0 20px", textAlign: "center" }}>
						<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 42px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>{landingTitle}</h1>
						<p className="text-text-secondary" style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 24 }}>{t("books.discoverSubtitle")}</p>
						<div className="od-search-wrap" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
							<div className="od-search-inner bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12 }}>
								<div className="text-text-secondary" style={{ flexShrink: 0 }}><SearchIcon s={20} /></div>
								<input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("books.searchAuthorsPlaceholder")} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif" }} />
							</div>
						</div>
					</div>

					{sortedShops.length === 0 ? (
						<div style={{ textAlign: "center", padding: "60px 20px" }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>{t("books.noAuthorsFound")}</p>
						</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
							{sortedShops.map((shop) => (
								<div key={shop.id} onClick={() => { setActiveAuthor(shop.id); setBooksView("browse"); setQuery(""); }}
									className="bg-surface border border-border-subtle"
									style={{ borderRadius: 16, padding: 20, cursor: "pointer", transition: "all 0.2s" }}
									onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
									onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; }}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
										<div style={{ width: 44, height: 44, borderRadius: "50%", background: shop.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff" }}>{shop.avatar}</div>
										<div>
											<p className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{shop.name}</p>
											<p className="text-text-secondary" style={{ fontSize: 12 }}>{t("books.independentAuthor")}</p>
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

	const currentShop = booksShops.find(s => s.id === activeAuthor) || booksShops[0];
	const filtered = booksData.filter(item => {
		const matchShop = item.author === activeAuthor;
		const matchCat = matchesCategory(genre, item.genre, categories);
		const matchQ = !query || item.title.toLowerCase().includes(query.toLowerCase());
		return matchShop && matchCat && matchQ;
	});

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", overflow: "hidden" }}>
				<div style={{ padding: "28px 0 20px", animation: "fadeUp 0.3s ease both" }}>
					<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
						<button onClick={() => { setBooksView("stores"); setActiveAuthor(null); }} className="bg-surface text-text-secondary" style={{ width: 28, height: 28, borderRadius: 8, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
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
							<input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search books by ${currentShop?.name ?? ""}...`} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
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
						{categories.map((g, i) => (
							<LeoButton key={g.id} cat={g} active={genre === g.id} onClick={() => setGenre(g.id)} delay={i * 30} />
						))}
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
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>No books found for this author.</p>
						</div>
					) : (
						<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(170px, 1fr))", gap: 24 }}>
							{filtered.map((book, i) => (
								<div key={book.id} onClick={() => { setSelectedBook(book); setBooksView("detail"); }}
									style={{ cursor: "pointer", animation: `fadeUp 0.35s ease ${i * 40}ms both` }}>
									<div style={{ width: "100%", paddingBottom: "140%", position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 10, boxShadow: "0 8px 24px var(--color-shadow)" }}>
										<div style={{ position: "absolute", inset: 0, background: book.cover }} />
									</div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 3, lineHeight: 1.3 }}>{book.title}</p>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 4 }}>{book.author}</p>
									<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#60a5fa" }}>${book.price.toFixed(2)}</p>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export { BooksPage };
