import React, { useState, useEffect, useMemo, useRef } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon, DigServicesIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading, SkeletonServiceCard } from "../components/skeletons.jsx";
import { LeoButton, ODCategoryBubble } from "../components/shared.jsx";
import { createOrder } from "../api/shop";
import { getUser } from "../store/auth";
import { getFreelanceGigs } from "../api/freelance-gig.js";
import { getFreelanceReviews } from "../api/freelance-reviews.js";
import { createFreelanceOrder } from "../api/freelance-orders.js";
import { FreelancerOrderTracker } from "../components/freelance/FreelancerOrderTracker.jsx";
import FreelanceOrderForm from "../components/freelance/FreelanceOrderForm.jsx";

// Map API gig to service card format
function mapGigToService(gig) {
	const freelancer = gig.freelancer_profile || {};
	const user = freelancer.user || {};
	const packages = gig.packages || [];

	// Generate a gradient from the category or use default
	const categoryColors = {
		"Programming & Tech": "linear-gradient(135deg,#0c1a2e,#2563eb)",
		"Graphics & Design": "linear-gradient(135deg,#1e1b4b,#7c3aed)",
		"Writing & Translation": "linear-gradient(135deg,#052e16,#16a34a)",
		"Digital Marketing": "linear-gradient(135deg,#1c1917,#f59e0b)",
		"Video & Animation": "linear-gradient(135deg,#1a0a00,#ef4444)",
		"Music & Audio": "linear-gradient(135deg,#0f172a,#06b6d4)",
	};

	const thumb = categoryColors[gig.Freelance_Category] || "linear-gradient(135deg,#13151c,#2563eb)";

	// Get the best price (highest package) and delivery days
	let bestPrice = 0;
	let bestDeliveryDays = 7;
	packages.forEach(pkg => {
		if (pkg.price > bestPrice) {
			bestPrice = pkg.price;
		}
		if (pkg.delivery_days && pkg.delivery_days < bestDeliveryDays) {
			bestDeliveryDays = pkg.delivery_days;
		}
	});

	return {
		id: gig.id,
		title: gig.title,
		seller: freelancer.display_name || user.name || "Freelancer",
		rating: gig.averageRating || 0,
		reviews: gig.totalReviews || 0,
		price: bestPrice || packages[0]?.price || 0,
		deliveryDays: bestDeliveryDays || packages[0]?.delivery_days || 7,
		thumb: thumb,
		description: gig.description,
		category: gig.Freelance_Category,
		subCategory: gig.Freelance_SubCategory,
		images: gig.images || [],
		packages: packages,
		freelancer: freelancer,
		freelancer_profile: freelancer,
		status: gig.status,
		created_at: gig.created_at,
		averageRating: gig.averageRating || 0,
		totalReviews: gig.totalReviews || 0,
	};
}

// Get package price for a service
function getPackagePrice(svc, tier) {
	const pkg = svc.packages?.find(p => p.package_type === tier);
	return pkg?.price || svc.price;
}

// Get package delivery days
function getPackageDelivery(svc, tier) {
	const pkg = svc.packages?.find(p => p.package_type === tier);
	return pkg?.delivery_days || svc.deliveryDays;
}

const DIG_SVC_PACKAGES = (svc) => {
	const tiers = [
		{ tier: "BASIC", label: "Basic" },
		{ tier: "STANDARD", label: "Standard" },
		{ tier: "PREMIUM", label: "Premium" },
	];

	return tiers.map(t => {
		const pkg = svc.packages?.find(p => p.package_type === t.tier);
		return {
			tier: t.label,
			price: pkg?.price || svc.price,
			delivery: pkg?.delivery_days || svc.deliveryDays,
			desc: pkg?.description || `${t.label} package for ${svc.title}`,
			includes: pkg?.features || ["Core deliverables", "1 revision"],
			revisions: pkg?.revisions || 1,
		};
	});
};

function DigSvcDetailPage({ service, onBack, onOrder }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [selPkg, setSelPkg] = useState(0);
	const [contactOpen, setContactOpen] = useState(false);
	const [contactMsg, setContactMsg] = useState("");
	const [contactSent, setContactSent] = useState(false);
	const [reviews, setReviews] = useState([]);
	const [reviewsLoading, setReviewsLoading] = useState(false);
	const [reviewsError, setReviewsError] = useState(null);
	const [reviewsFetched, setReviewsFetched] = useState(false);
	const packages = DIG_SVC_PACKAGES(service);

	// Fetch reviews for this gig - only once when component mounts or service changes
	useEffect(() => {
		const fetchReviews = async () => {
			// Only fetch if not already fetched and service has reviews count > 0
			if (reviewsFetched) return;
			if (!service.id) return;
			if (!service.totalReviews && !service.reviews) {
				// No reviews exist, skip fetching
				setReviewsFetched(true);
				setReviewsLoading(false);
				return;
			}

			try {
				setReviewsLoading(true);
				setReviewsError(null);
				const response = await getFreelanceReviews(service.id);
				if (response?.successful && Array.isArray(response.data)) {
					setReviews(response.data);
				} else {
					setReviews([]);
				}
			} catch (error) {
				console.error('Failed to fetch reviews:', error);
				setReviewsError('Failed to load reviews');
				setReviews([]);
			} finally {
				setReviewsLoading(false);
				setReviewsFetched(true);
			}
		};
		fetchReviews();
	}, [service.id, service.totalReviews, service.reviews, reviewsFetched]);

	if (loading) return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<Skel w={160} h={18} r={6} style={{ marginTop: 24, marginBottom: 20 }} />
				<Skel w="100%" h={200} r={18} style={{ marginBottom: 24 }} />
				<Skel w="70%" h={28} r={8} style={{ marginBottom: 12 }} />
				<Skel w="45%" h={14} r={6} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 24 }}>
					<div style={{ flex: 2 }}>
						<Skel w="100%" h={120} r={10} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={180} r={10} />
					</div>
					<div style={{ flex: 1 }}>
						<Skel w="100%" h={300} r={12} />
					</div>
				</div>
			</div>
		</div>
	);

	// Display first image as banner if available
	const bannerImage = service.images?.[0] || service.thumb;

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
					Digital Services
				</button>
				{/* Banner - with fixed size and fallback */}
				<div style={{ width: "100%", height: 200, borderRadius: 18, marginBottom: 24, overflow: "hidden", background: service.thumb, flexShrink: 0 }}>
					{bannerImage && bannerImage.startsWith('http') ? (
						<img
							src={bannerImage}
							alt={service.title}
							style={{ width: "100%", height: "100%", objectFit: "cover" }}
							onError={(e) => {
								e.target.style.display = 'none';
							}}
						/>
					) : (
						<div style={{ width: "100%", height: "100%", background: service.thumb }} />
					)}
				</div>
				{/* Category badge */}
				{service.category && (
					<span style={{ display: "inline-block", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, color: "#60a5fa", marginBottom: 10 }}>
						{service.category}
					</span>
				)}
				{/* Title row */}
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 8, lineHeight: 1.2 }}>{service.title}</h2>
				<div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
					<div style={{ width: 36, height: 36, borderRadius: "50%", background: service.thumb, flexShrink: 0 }} />
					<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{service.seller}</span>
					<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
						<span style={{ color: "#f59e0b", fontSize: 14 }}>★</span>
						<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{service.averageRating || service.rating || 0}</span>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>({service.totalReviews || service.reviews || 0} reviews)</span>
					</div>
					<button onClick={() => setContactOpen(v => !v)} className="bg-surface-raised border border-border text-text-primary" style={{ marginLeft: "auto", borderRadius: 10, padding: "8px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{i18n.t("automotive.contactSeller")}</button>
				</div>
				{/* Contact panel */}
				{contactOpen && (
					<div className="bg-surface" style={{ border: "1px solid rgba(37,99,235,0.25)", borderRadius: 14, padding: "18px 20px", marginBottom: 24, maxWidth: 600 }}>
						{contactSent ? (
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#059669", textAlign: "center", padding: "8px 0" }}>Message sent! {service.seller} will reply shortly.</p>
						) : (
							<>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Message {service.seller}</p>
								<textarea value={contactMsg} onChange={e => setContactMsg(e.target.value)} rows={3} placeholder={i18n.t("digservices.contactPlaceholder")}
									className="bg-surface border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "none", outline: "none", marginBottom: 12 }} />
								<button onClick={() => { if (!contactMsg.trim()) return; setContactSent(true); }} style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "10px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>{i18n.t("common.sendMessage")}</button>
							</>
						)}
					</div>
				)}
				{/* Two-column layout */}
				<div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
					{/* Left: about + reviews */}
					<div style={{ flex: 2, minWidth: 280 }}>
						<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "20px 22px", marginBottom: 24 }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>{i18n.t("digservices.aboutService")}</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, lineHeight: 1.75 }}>
								{service.description || `${service.seller} delivers professional-grade results for ${service.title.toLowerCase()}.`}
							</p>
							{service.subCategory && (
								<div style={{ marginTop: 12 }}>
									<span className="bg-surface text-text-secondary" style={{ borderRadius: 6, padding: "4px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
										Sub-category: {service.subCategory}
									</span>
								</div>
							)}
							<div style={{ display: "flex", gap: 24, marginTop: 18, flexWrap: "wrap" }}>
								{[
									{ label: "Category", value: service.category || "Various" },
									{ label: "Avg. Response", value: "< 2 hrs" },
									{ label: "Status", value: service.status || "Active" },
								].map(item => (
									<div key={item.label}>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 2 }}>{item.label}</p>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>{item.value}</p>
									</div>
								))}
							</div>
						</div>
						{/* Reviews */}
						<div className="bg-surface border border-border" style={{ borderRadius: 14, padding: "20px 22px" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
								<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>{i18n.t("books.tabReviews")}</p>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>({service.totalReviews || service.reviews || 0})</span>
							</div>
							{reviewsLoading ? (
								<div style={{ textAlign: "center", padding: "20px 0" }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading reviews...</p>
								</div>
							) : (service.totalReviews || service.reviews || 0) === 0 ? (
								<div style={{ textAlign: "center", padding: "20px 0" }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No reviews yet. Be the first to review this service!</p>
								</div>
							) : reviews.length === 0 && reviewsFetched ? (
								<div style={{ textAlign: "center", padding: "20px 0" }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No reviews yet. Be the first to review this service!</p>
								</div>
							) : (
								reviews.map((r, i) => {
									const buyerUser = r.buyer_profile?.user || {};
									const socialProfiles = buyerUser.social_profiles || {};
									const displayName = socialProfiles.display_name || buyerUser.name || buyerUser.username || "Anonymous";
									const avatar = displayName.charAt(0).toUpperCase();
									const colors = ["#2563eb", "#db2777", "#059669", "#7c3aed", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"];
									const color = colors[i % colors.length];
									return (
										<div key={r.id} style={{ paddingBottom: 16, marginBottom: 16, borderBottom: i < reviews.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
											<div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
												<div style={{ width: 36, height: 36, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12, color: "#fff", flexShrink: 0 }}>{avatar}</div>
												<div>
													<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{displayName}</p>
													<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
														<span style={{ color: "#f59e0b", fontSize: 12 }}>{"★".repeat(Math.min(r.rating || 0, 5))}</span>
														<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
															{new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
														</span>
													</div>
												</div>
											</div>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.6, paddingLeft: 48 }}>{r.review}</p>
										</div>
									);
								})
							)}
						</div>
					</div>
					{/* Right: packages */}
					<div style={{ flex: 1, minWidth: 240, position: "sticky", top: 0 }}>
						<div className="bg-surface border border-border" style={{ borderRadius: 16, overflow: "hidden" }}>
							{/* Package tabs */}
							<div style={{ display: "flex", borderBottom: "1px solid var(--color-border-subtle)" }}>
								{packages.map((p, i) => (
									<button key={p.tier} onClick={() => setSelPkg(i)} style={{ flex: 1, padding: "12px 8px", background: selPkg === i ? "rgba(37,99,235,0.12)" : "none", border: "none", borderBottom: `2px solid ${selPkg === i ? "#2563eb" : "transparent"}`, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: selPkg === i ? "#60a5fa" : "var(--color-text-secondary)", cursor: "pointer", transition: "all 0.15s" }}>{p.tier}</button>
								))}
							</div>
							<div style={{ padding: "20px" }}>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
									<span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28 }}>${packages[selPkg].price}</span>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, paddingTop: 8 }}>{packages[selPkg].delivery}-day delivery</span>
								</div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{packages[selPkg].desc}</p>
								<div style={{ marginBottom: 20 }}>
									{packages[selPkg].includes.map(item => (
										<div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{item}</span>
										</div>
									))}
									{packages[selPkg].revisions && (
										<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
											<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
											<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{packages[selPkg].revisions} revisions included</span>
										</div>
									)}
								</div>
								<button onClick={() => onOrder({ ...service, price: packages[selPkg].price, tier: packages[selPkg].tier, delivery: packages[selPkg].delivery })} style={{ width: "100%", background: "#2563eb", border: "none", borderRadius: 12, padding: "14px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer", marginBottom: 10, transition: "background 0.15s" }}
									onMouseEnter={e => e.target.style.background = "#1d4ed8"}
									onMouseLeave={e => e.target.style.background = "#2563eb"}>
									Continue — ${packages[selPkg].price}
								</button>
								<button onClick={() => setContactOpen(v => !v)} className="bg-surface border border-border text-text-secondary" style={{ width: "100%", borderRadius: 12, padding: "12px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("automotive.contactSeller")}</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function DigSvcChatView({ service, onDone }) {
	const [msgs, setMsgs] = useState([
		{ from: "seller", text: `Hi there! Thanks for your interest. I'm ${service.seller} and I'm excited to get started on "${service.title}". Could you share any existing materials or references?`, time: "Just now" },
		{ from: "buyer", text: "Sure! I've attached a brief below. Feel free to ask if you need anything else.", time: "Just now" },
	]);
	const [input, setInput] = useState("");
	const { isMobile } = useViewport();
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: 32, paddingRight: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, maxWidth: 720 }}>
			<button onClick={onDone} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 6, padding: 0, alignSelf: "flex-start" }}>← Back to Digital Services</button>
			<div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 14, alignItems: "center" }}>
				<div style={{ width: 44, height: 44, borderRadius: 10, background: service.thumb, flexShrink: 0 }} />
				<div>
					{/* chat header sits over a fixed light-blue brand tint (rgba(37,99,235,0.08)), not the page bg, but that tint still lightens a lot in light theme, so text must follow the theme too */}
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{service.title}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{service.seller} · Delivery in {service.delivery || service.deliveryDays} day{service.deliveryDays > 1 ? "s" : ""}</p>
				</div>
				<span style={{ marginLeft: "auto", background: "#059669", borderRadius: 6, padding: "4px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{i18n.t("digservices.inProgress")}</span>
			</div>
			<div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
				{msgs.map((m, i) => (
					<div key={i} style={{ display: "flex", justifyContent: m.from === "buyer" ? "flex-end" : "flex-start" }}>
						<div style={{ maxWidth: "70%", background: m.from === "buyer" ? "#2563eb" : "var(--color-surface-raised)", borderRadius: m.from === "buyer" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px" }}>
							{/* buyer bubble is fixed brand blue in both themes, so its text stays hardcoded white; seller bubble background is tokenized (goes light in light theme) so its text must follow */}
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: m.from === "buyer" ? "#fff" : "var(--color-text-primary)", lineHeight: 1.5 }}>{m.text}</p>
							<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: m.from === "buyer" ? "rgba(255,255,255,0.55)" : "var(--color-text-secondary)", marginTop: 4, textAlign: "right" }}>{m.time}</p>
						</div>
					</div>
				))}
			</div>
			<div style={{ display: "flex", gap: 10 }}>
				<input value={input} onChange={e => setInput(e.target.value)}
					onKeyDown={e => { if (e.key === "Enter" && input.trim()) { setMsgs(p => [...p, { from: "buyer", text: input.trim(), time: "Just now" }]); setInput(""); } }}
					placeholder={i18n.t("messages.typePlaceholder")} className="bg-surface border border-border text-text-primary" style={{ flex: 1, borderRadius: 10, padding: "12px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none" }} />
				<button onClick={() => { if (input.trim()) { setMsgs(p => [...p, { from: "buyer", text: input.trim(), time: "Just now" }]); setInput(""); } }}
					style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "0 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("common.send")}</button>
			</div>
		</div>
	);
}

// Custom Sort Dropdown Component
function CustomSortDropdown({ value, onChange, options }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setIsOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	// Find current option label
	const currentOption = options.find(opt => opt.value === value);

	return (
		<div ref={dropdownRef} style={{ position: 'relative', minWidth: 180 }}>
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="bg-surface border border-border text-text-primary" style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					width: '100%',
					padding: '10px 14px',
					borderRadius: 10,
					fontFamily: "'DM Sans', sans-serif",
					fontSize: 13,
					cursor: 'pointer',
					outline: 'none',
					transition: 'all 0.15s',
				}}
			>
				<span>{currentOption?.label || 'Sort by'}</span>
				<svg
					width={14}
					height={14}
					viewBox="0 0 24 24"
					fill="none"
					stroke="var(--color-text-muted)"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					style={{
						transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
						transition: 'transform 0.2s'
					}}
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>

			{isOpen && (
				<div className="bg-surface-raised border border-border" style={{
					position: 'absolute',
					top: 'calc(100% + 4px)',
					left: 0,
					right: 0,
					borderRadius: 10,
					padding: '4px',
					zIndex: 1000,
					boxShadow: '0 8px 24px var(--color-shadow)',
				}}>
					{options.map((option) => (
						<button
							key={option.value}
							onClick={() => {
								onChange(option.value);
								setIsOpen(false);
							}}
							style={{
								display: 'block',
								width: '100%',
								padding: '8px 14px',
								background: value === option.value ? 'rgba(37,99,235,0.15)' : 'none',
								border: 'none',
								borderRadius: 6,
								color: value === option.value ? '#60a5fa' : 'var(--color-text-secondary)',
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 13,
								cursor: 'pointer',
								textAlign: 'left',
								transition: 'all 0.1s',
							}}
							onMouseEnter={(e) => {
								if (value !== option.value) {
									e.target.style.background = 'var(--color-surface)';
								}
							}}
							onMouseLeave={(e) => {
								if (value !== option.value) {
									e.target.style.background = 'none';
								}
							}}
						>
							{option.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function DigitalServicesPage({ onNavigate }) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("digservices");
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [dgsView, setDgsView] = useState("grid");
	const [gigs, setGigs] = useState([]);
	const [gigsLoading, setGigsLoading] = useState(true);
	const [gigsError, setGigsError] = useState(null);
	const [activeTab, setActiveTab] = useState("browse");
	const [currentPage, setCurrentPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [totalItems, setTotalItems] = useState(0);
	const itemsPerPage = 6;

	// Search and sort state
	const [searchQuery, setSearchQuery] = useState("");
	const [tempSearchQuery, setTempSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState("created_at");
	const [sortOrder, setSortOrder] = useState("desc");

	// Sort options
	const sortOptions = [
		{ value: 'latest', label: 'Latest' },
		{ value: 'oldest', label: 'Oldest' },
		{ value: 'most_reviews', label: 'Most Reviews' },
		{ value: 'least_reviews', label: 'Least Reviews' },
		{ value: 'most_orders', label: 'Most Orders' },
		{ value: 'least_orders', label: 'Least Orders' },
	];

	// Get current sort value
	const getCurrentSortValue = () => {
		if (sortBy === 'created_at' && sortOrder === 'desc') return 'latest';
		if (sortBy === 'created_at' && sortOrder === 'asc') return 'oldest';
		if (sortBy === 'reviews' && sortOrder === 'desc') return 'most_reviews';
		if (sortBy === 'reviews' && sortOrder === 'asc') return 'least_reviews';
		if (sortBy === 'orders' && sortOrder === 'desc') return 'most_orders';
		if (sortBy === 'orders' && sortOrder === 'asc') return 'least_orders';
		return 'latest';
	};

	// Fetch freelance gigs from API with search and sort
	const fetchGigs = async (page = 1) => {
		try {
			setGigsLoading(true);
			setGigsError(null);

			const params = {
				status: 'ACTIVE',
				limit: itemsPerPage,
				offset: (page - 1) * itemsPerPage
			};

			if (searchQuery.trim()) {
				params.search = searchQuery.trim();
			}

			params.sortBy = sortBy;
			params.sortOrder = sortOrder;

			console.log('Fetching freelance gigs with params:', params);
			const response = await getFreelanceGigs(params);
			console.log('Freelance gigs response:', response);

			if (response?.successful && Array.isArray(response.data)) {
				const mappedGigs = response.data.map(mapGigToService);
				setGigs(mappedGigs);
				if (response.pagination) {
					const total = response.pagination.total || 0;
					setTotalItems(total);
					setTotalPages(Math.ceil(total / itemsPerPage));
				} else {
					setTotalItems(mappedGigs.length);
					setTotalPages(Math.ceil(mappedGigs.length / itemsPerPage));
				}
				setGigsError(null);
			} else {
				if (response?.data && Array.isArray(response.data)) {
					const mappedGigs = response.data.map(mapGigToService);
					setGigs(mappedGigs);
					setTotalItems(mappedGigs.length);
					setTotalPages(Math.ceil(mappedGigs.length / itemsPerPage));
					setGigsError(null);
				} else {
					setGigs([]);
					setTotalItems(0);
					setTotalPages(1);
					setGigsError(response?.message || 'Failed to load services');
				}
			}
		} catch (error) {
			console.error('Failed to fetch freelance gigs:', error);
			setGigsError(error?.message || 'Failed to load services');
			setGigs([]);
			setTotalItems(0);
			setTotalPages(1);
		} finally {
			setGigsLoading(false);
		}
	};

	// Initial fetch
	useEffect(() => {
		fetchGigs(1);
	}, []);

	// Fetch when search or sort changes
	useEffect(() => {
		setCurrentPage(1);
		fetchGigs(1);
	}, [searchQuery, sortBy, sortOrder]);

	// Fetch when page changes
	useEffect(() => {
		if (currentPage > 1) {
			fetchGigs(currentPage);
		}
	}, [currentPage]);

	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [dgsView]);
	const [selectedSvc, setSelectedSvc] = useState(null);
	const [orderedSvc, setOrderedSvc] = useState(null);

	// Handle order complete - switch to orders tab
	const handleOrderComplete = () => {
		// Reset the view states
		setDgsView("grid");
		setSelectedSvc(null);
		setOrderedSvc(null);
		// Switch to orders tab
		setActiveTab("orders");
		// Refresh gigs in background
		fetchGigs(currentPage);
	};

	if (dgsView === "detail" && selectedSvc) {
		return <DigSvcDetailPage service={selectedSvc} onBack={() => setDgsView("grid")} onOrder={svc => { setOrderedSvc(svc); setDgsView("requirements"); }} />;
	}

	if (dgsView === "requirements" && (orderedSvc || selectedSvc)) {
		return (
			<FreelanceOrderForm
				service={orderedSvc || selectedSvc}
				onBack={() => setDgsView("detail")}
				onSubmit={() => setDgsView("chat")}
				onOrderComplete={handleOrderComplete}
				isMobile={isMobile}
			/>
		);
	}

	if (dgsView === "chat" && (orderedSvc || selectedSvc)) {
		return <DigSvcChatView service={orderedSvc || selectedSvc} onDone={() => {
			setDgsView("grid");
			setSelectedSvc(null);
			setOrderedSvc(null);
			setActiveTab("orders");
			fetchGigs(currentPage);
		}} />;
	}

	const isLoading = gigsLoading || loading;
	const hasGigs = gigs.length > 0;

	const handlePageChange = (page) => {
		if (page >= 1 && page <= totalPages) {
			setCurrentPage(page);
			const gridElement = document.getElementById('gig-grid');
			if (gridElement) {
				gridElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}
	};

	// Handle search submit - only when button is clicked
	const handleSearch = (e) => {
		e.preventDefault();
		setSearchQuery(tempSearchQuery);
	};

	// Handle sort change
	const handleSortChange = (value) => {
		switch (value) {
			case 'latest':
				setSortBy('created_at');
				setSortOrder('desc');
				break;
			case 'oldest':
				setSortBy('created_at');
				setSortOrder('asc');
				break;
			case 'most_reviews':
				setSortBy('reviews');
				setSortOrder('desc');
				break;
			case 'least_reviews':
				setSortBy('reviews');
				setSortOrder('asc');
				break;
			case 'most_orders':
				setSortBy('orders');
				setSortOrder('desc');
				break;
			case 'least_orders':
				setSortBy('orders');
				setSortOrder('asc');
				break;
			default:
				setSortBy('created_at');
				setSortOrder('desc');
		}
	};

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<div style={{ padding: "32px 0 0" }}>
					<div style={{ textAlign: "center", marginBottom: 28 }}>
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px,3vw,36px)", letterSpacing: "0.03em", marginBottom: 4 }}>{landingTitle}</h2>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 14 }}>{i18n.t("digservices.subtitle")}</p>
						<button style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#60a5fa", cursor: "pointer" }} onClick={() => onNavigate && onNavigate("sd-freelancer")}>{t("digservices.becomeFreelancer")}</button>
					</div>
				</div>

				{/* Tab Bar */}
				<div style={{
					display: "flex",
					gap: 4,
					marginBottom: 24,
					borderBottom: "1px solid var(--color-border-subtle)",
					paddingBottom: 4,
				}}>
					<button
						onClick={() => { setActiveTab("browse"); setCurrentPage(1); }}
						style={{
							padding: "8px 20px",
							background: activeTab === "browse" ? "rgba(37,99,235,0.15)" : "none",
							border: "none",
							borderRadius: 8,
							color: activeTab === "browse" ? "#60a5fa" : "var(--color-text-secondary)",
							fontFamily: "'DM Sans', sans-serif",
							fontSize: 13,
							fontWeight: 600,
							cursor: "pointer",
							transition: "all 0.15s",
							borderBottom: activeTab === "browse" ? "2px solid #2563eb" : "2px solid transparent",
						}}
					>
						Browse Gigs
					</button>
					<button
						onClick={() => setActiveTab("orders")}
						style={{
							padding: "8px 20px",
							background: activeTab === "orders" ? "rgba(37,99,235,0.15)" : "none",
							border: "none",
							borderRadius: 8,
							color: activeTab === "orders" ? "#60a5fa" : "var(--color-text-secondary)",
							fontFamily: "'DM Sans', sans-serif",
							fontSize: 13,
							fontWeight: 600,
							cursor: "pointer",
							transition: "all 0.15s",
							borderBottom: activeTab === "orders" ? "2px solid #2563eb" : "2px solid transparent",
						}}
					>
						My Orders
					</button>
				</div>

				{/* Content based on active tab */}
				{activeTab === "orders" ? (
					<FreelancerOrderTracker color="#2563eb" />
				) : (
					<>
						{/* Search and Sort Bar */}
						<div style={{
							display: "flex",
							gap: 12,
							marginBottom: 24,
							flexWrap: "wrap",
							alignItems: "center"
						}}>
							{/* Search Bar */}
							<form onSubmit={handleSearch} style={{
								flex: 1,
								minWidth: 200,
								display: "flex",
								gap: 8,
								alignItems: "center"
							}}>
								<div className="bg-surface border border-border" style={{
									flex: 1,
									position: "relative",
									display: "flex",
									alignItems: "center",
									borderRadius: 10,
									padding: "0 12px",
								}}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<circle cx="11" cy="11" r="8" />
										<line x1="21" y1="21" x2="16.65" y2="16.65" />
									</svg>
									<input
										type="text"
										value={tempSearchQuery}
										onChange={(e) => setTempSearchQuery(e.target.value)}
										placeholder="Search gigs by title or description..."
										className="text-text-primary" style={{
											flex: 1,
											padding: "10px 12px",
											background: "none",
											border: "none",
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 14,
											outline: "none",
										}}
									/>
									{tempSearchQuery && (
										<button
											type="button"
											onClick={() => setTempSearchQuery("")}
											className="text-text-muted" style={{
												background: "none",
												border: "none",
												cursor: "pointer",
												padding: "4px",
												fontSize: 16,
											}}
										>
											×
										</button>
									)}
								</div>
								<button
									type="submit"
									style={{
										padding: "10px 20px",
										background: "#2563eb",
										border: "none",
										borderRadius: 10,
										color: "#fff",
										fontFamily: "'DM Sans', sans-serif",
										fontWeight: 600,
										fontSize: 14,
										cursor: "pointer",
										whiteSpace: "nowrap",
									}}
								>
									Search
								</button>
							</form>

							{/* Custom Sort Dropdown */}
							<CustomSortDropdown
								value={getCurrentSortValue()}
								onChange={handleSortChange}
								options={sortOptions}
							/>
						</div>

						{/* Results count */}
						{!isLoading && (
							<div className="text-text-secondary" style={{
								marginBottom: 16,
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 13
							}}>
								{totalItems} gig{totalItems !== 1 ? 's' : ''} found
								{searchQuery && ` for "${searchQuery}"`}
							</div>
						)}

						{/* Error message */}
						{gigsError && (
							<div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
								<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171" }}>Couldn't load services. Please try again later.</span>
							</div>
						)}

						{/* No gigs found */}
						{!isLoading && !hasGigs && !gigsError && (
							<div style={{ textAlign: "center", padding: "60px 20px" }}>
								<div className="bg-surface" style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
									<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
										<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
									</svg>
								</div>
								<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
									{searchQuery ? `No results found for "${searchQuery}"` : "No Freelance Services Available"}
								</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
									{searchQuery ? (
										"Try adjusting your search terms or filters."
									) : (
										<>
											There are currently no active freelance services. Check back later or
											<button style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: "0 4px" }} onClick={() => onNavigate && onNavigate("sd-freelancer")}>become a freelancer</button>
											to list your services.
										</>
									)}
								</p>
							</div>
						)}

						{/* Gig grid */}
						<div id="gig-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
							{isLoading ? (
								Array.from({ length: itemsPerPage }).map((_, i) => (
									<div key={i} className="bg-surface border border-border" style={{ borderRadius: 16, overflow: "hidden", animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
										<Skel h={160} r={0} />
										<div style={{ padding: 16 }}>
											<Skel w="90%" h={14} r={6} style={{ marginBottom: 8 }} />
											<Skel w="55%" h={12} r={6} style={{ marginBottom: 12 }} />
											<Skel w="35%" h={16} r={6} />
										</div>
									</div>
								))
							) : (
								hasGigs ? gigs.map((svc, i) => {
									const isFromApi = !!svc.category;
									return (
										<div key={svc.id || i} onClick={() => { setSelectedSvc(svc); setDgsView("detail"); }}
											className="bg-surface border border-border-subtle" style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s", animation: `fadeUp 0.35s ease ${i * 50}ms both` }}
											onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
											onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}>
											<div style={{ width: "100%", height: 140, background: svc.thumb, overflow: "hidden", flexShrink: 0 }}>
												{svc.images?.[0] ? (
													<img
														src={svc.images[0]}
														alt={svc.title}
														style={{ width: "100%", height: "100%", objectFit: "cover" }}
														onError={(e) => {
															e.target.style.display = 'none';
														}}
													/>
												) : null}
											</div>
											<div style={{ padding: "16px" }}>
												{isFromApi && svc.category && (
													<span style={{ display: "inline-block", background: "rgba(37,99,235,0.12)", borderRadius: 4, padding: "1px 8px", fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 600, color: "#60a5fa", marginBottom: 6 }}>
														{svc.category}
													</span>
												)}
												<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6, lineHeight: 1.35 }}>{svc.title}</p>
												<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
													<span style={{ color: "#f59e0b", fontSize: 13 }}>★</span>
													<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{svc.averageRating || 0} ({svc.totalReviews || 0})</span>
													<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>· {svc.seller}</span>
												</div>
												<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
													<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Delivery in {svc.deliveryDays}d</span>
													<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#60a5fa" }}>From ${svc.packages?.[0]?.price || svc.price || 0}</span>
												</div>
												{isFromApi && svc.freelancer?.country && (
													<div className="text-text-muted" style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
														{svc.freelancer.country}
													</div>
												)}
											</div>
										</div>
									)
								}) : null
							)}
						</div>

						{/* Pagination */}
						{!isLoading && totalPages > 1 && (
							<div style={{
								display: "flex",
								justifyContent: "center",
								alignItems: "center",
								gap: 6,
								marginTop: 32,
								paddingTop: 20,
								borderTop: "1px solid var(--color-border-subtle)",
								flexWrap: "wrap",
							}}>
								<button
									onClick={() => handlePageChange(currentPage - 1)}
									disabled={currentPage === 1}
									className={`bg-surface border border-border ${currentPage === 1 ? "text-text-muted" : "text-text-secondary"}`} style={{
										padding: "8px 14px",
										borderRadius: 8,
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 13,
										cursor: currentPage === 1 ? "default" : "pointer",
										transition: "all 0.15s",
									}}
								>
									Previous
								</button>

								{Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
									let pageNum;
									if (totalPages <= 5) {
										pageNum = i + 1;
									} else if (currentPage <= 3) {
										pageNum = i + 1;
									} else if (currentPage >= totalPages - 2) {
										pageNum = totalPages - 4 + i;
									} else {
										pageNum = currentPage - 2 + i;
									}

									if (pageNum < 1 || pageNum > totalPages) return null;

									return (
										<button
											key={pageNum}
											onClick={() => handlePageChange(pageNum)}
											style={{
												padding: "8px 16px",
												background: currentPage === pageNum ? "#2563eb" : "var(--color-surface)",
												border: currentPage === pageNum ? "none" : "1px solid var(--color-border)",
												borderRadius: 8,
												color: currentPage === pageNum ? "#fff" : "var(--color-text-secondary)",
												fontFamily: "'DM Sans', sans-serif",
												fontSize: 13,
												fontWeight: currentPage === pageNum ? 700 : 400,
												cursor: "pointer",
												transition: "all 0.15s",
												minWidth: 40,
											}}
										>
											{pageNum}
										</button>
									);
								})}

								<button
									onClick={() => handlePageChange(currentPage + 1)}
									disabled={currentPage === totalPages}
									className={`bg-surface border border-border ${currentPage === totalPages ? "text-text-muted" : "text-text-secondary"}`} style={{
										padding: "8px 14px",
										borderRadius: 8,
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 13,
										cursor: currentPage === totalPages ? "default" : "pointer",
										transition: "all 0.15s",
									}}
								>
									Next
								</button>

								<span className="text-text-muted" style={{
									fontFamily: "'DM Sans', sans-serif",
									fontSize: 12,
									marginLeft: 8,
								}}>
									Page {currentPage} of {totalPages}
								</span>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}

export { DigitalServicesPage };