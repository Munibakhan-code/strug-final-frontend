// Celebrity.jsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import i18n from "../i18n/index.js";
import { isAuthenticated } from '../store/auth';
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { Skel } from "../components/skeletons.jsx";
import { LeoButton, AddressAutocomplete } from "../components/shared.jsx";
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';

// API imports
import {
	getCelebrityListings,
	getCelebrityListing,
	getCelebrityListingReviews,
	createCelebrityBooking,
	getMyCelebrityBookings,
	getReceivedCelebrityBookings,
	getCelebrityBooking,
	cancelCelebrityBooking,
	completeCelebrityBooking,
	approveCelebrityBooking,
	rejectCelebrityBooking,
	payCelebrityBooking,
	markCelebrityBookingRecording,
	deliverCelebrityBookingVideo,
	createCelebrityReview,
	getCelebrityProfile as getCelebrityProfileAPI
} from "../api/celebrity.js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
	console.warn('VITE_STRIPE_PUBLISHABLE_KEY is not set in environment variables');
}

// Category definitions
const CELEBRITY_CATEGORY_DEFS = [
	{ id: "all", labelKey: "common.all", color: "#2563eb", match: null },
	{ id: "sports", labelKey: "events.categories.sports", color: "#dc2626", match: "Sports" },
	{ id: "entertainment", labelKey: "discounts.categories.entertainment", color: "#7c3aed", match: "Entertainment" },
	{ id: "music", labelKey: "events.categories.music", color: "#db2777", match: "Music" },
	{ id: "comedy", labelKey: "events.categories.comedy", color: "#f59e0b", match: "Comedy" },
	{ id: "education", labelKey: "celebrity.categoryEducation", color: "#059669", match: "Education" },
	{ id: "creators", labelKey: "celebrity.categoryCreators", color: "#0891b2", match: "Creators" },
];

// Map API listing to UI format
function mapCelebrityListing(listing) {
	const profile = listing.celebrity_profile || {};
	const user = profile.user || {};
	const photos = listing.photos || [];

	return {
		id: listing.id,
		name: profile.display_name || user.name || "Celebrity",
		displayName: profile.display_name || user.name || "Celebrity",
		title: listing.title || "Celebrity Cameo",
		category: listing.category || "Entertainment",
		known_for: listing.known_for || "",
		location: listing.location || "",
		price: parseFloat(listing.price_per_video) || 0,
		price_per_video: parseFloat(listing.price_per_video) || 0,
		turnaround: listing.turnaround_days ? `${listing.turnaround_days} days` : '3 days',
		turnaround_days: listing.turnaround_days || 3,
		bio: listing.description || "",
		description: listing.description || "",
		rating: listing.averageRating || profile.rating || 0,
		averageRating: listing.averageRating || profile.rating || 0,
		reviews: listing._count?.reviews || 0,
		totalReviews: listing._count?.reviews || 0,
		photo: photos[0] || "linear-gradient(135deg,#0c1a2e,#2563eb)",
		photos: photos,
		celebrity_profile_id: listing.celebrity_profile_id,
		profile: profile,
		user: user,
		status: listing.status,
		created_at: listing.created_at,
		totalBookings: listing._count?.bookings || 0,
	};
}

// =========================================
// Card Input Component (Stripe)
// =========================================
const CardInput = ({ onCardChange }) => {
	const stripe = useStripe();
	const elements = useElements();
	const [cardError, setCardError] = useState('');

	const handleCardChange = (event) => {
		setCardError(event.error ? event.error.message : '');
		onCardChange({ error: event.error, complete: event.complete });
	};

	return (
		<div style={{ marginBottom: 16 }}>
			<label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "block", marginBottom: 8 }}>
				Card Details
			</label>
			{/* Kept permanently dark, like the CardElement box in Rideshare.jsx: Stripe's iframe
			    reads its text color from this JS options object, which can't resolve
			    var(--color-*) custom properties, so box + white text must stay a fixed
			    matched pair regardless of theme. */}
			<div style={{
				background: "rgba(255,255,255,0.05)",
				border: "1px solid rgba(255,255,255,0.12)",
				borderRadius: 12,
				padding: "14px 16px",
			}}>
				<CardElement
					options={{
						style: {
							base: {
								fontSize: '16px',
								color: '#fff',
								'::placeholder': {
									color: 'rgba(255,255,255,0.3)',
								},
							},
							invalid: {
								color: '#ef4444',
							},
						},
					}}
					onChange={handleCardChange}
				/>
			</div>
			{cardError && (
				<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#ef4444', marginTop: 6 }}>
					{cardError}
				</p>
			)}
		</div>
	);
};

// =========================================
// Empty State Component
// =========================================
const EmptyState = ({ icon, title, message, actionText, onAction }) => {
	return (
		<div style={{ padding: "60px 20px", textAlign: "center" }}>
			{icon && <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>}
			<h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>{title}</h3>
			<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: actionText ? 20 : 0 }}>{message}</p>
			{actionText && onAction && (
				<button onClick={onAction} style={{ padding: "10px 24px", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
					{actionText}
				</button>
			)}
		</div>
	);
};

// =========================================
// Confirmation Modal Component
// =========================================
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Delete", cancelText = "Cancel" }) => {
	if (!isOpen) return null;

	return (
		<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
			<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 28, width: "100%", maxWidth: 400 }}>
				<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>{title}</h3>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 24 }}>{message}</p>
				<div style={{ display: "flex", gap: 12 }}>
					<button onClick={onClose} className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
						{cancelText}
					</button>
					<button onClick={onConfirm} style={{ flex: 1, padding: "11px 0", background: "#ef4444", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
						{confirmText}
					</button>
				</div>
			</div>
		</div>
	);
};

// =========================================
// Custom Sort Dropdown
// =========================================
function CustomSortDropdown({ value, onChange, options }) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setIsOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const currentOption = options.find(opt => opt.value === value);

	return (
		<div ref={dropdownRef} style={{ position: 'relative', minWidth: 180 }}>
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="bg-surface border border-border text-text-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 14px', borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
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
				<div className="bg-surface-raised border border-border" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, borderRadius: 10, padding: '4px', zIndex: 1000, boxShadow: '0 8px 24px var(--color-shadow)' }}>
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

// =========================================
// Celebrity Profile Detail View
// =========================================
function CelebrityProfileDetailView({ celebrity, onBack, onBook }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [messageType, setMessageType] = useState('MYSELF');
	const [recipientName, setRecipientName] = useState("");
	const [requestMessage, setRequestMessage] = useState("");
	const [reviews, setReviews] = useState([]);
	const [reviewsLoading, setReviewsLoading] = useState(false);
	const [reviewsFetched, setReviewsFetched] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	// Fetch reviews for this listing
	useEffect(() => {
		const fetchReviews = async () => {
			if (reviewsFetched) return;
			if (!celebrity.id) return;

			try {
				setReviewsLoading(true);
				const response = await getCelebrityListingReviews(celebrity.id);
				if (response?.successful && Array.isArray(response.data)) {
					setReviews(response.data);
				} else {
					setReviews([]);
				}
			} catch (error) {
				console.error('Failed to fetch celebrity reviews:', error);
				setReviews([]);
			} finally {
				setReviewsLoading(false);
				setReviewsFetched(true);
			}
		};
		fetchReviews();
	}, [celebrity.id, reviewsFetched]);

	if (loading) {
		return (
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
	}

	// Get profile image and cover image from celebrity profile
	const profileImage = celebrity.profile?.profile_image || null;
	const coverImage = celebrity.profile?.cover_image || null;
	const packagePhotos = celebrity.photos || [];

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<button
					onClick={onBack}
					className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}
				>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="15 18 9 12 15 6" />
					</svg>
					Celebrity Cameos
				</button>

				{/* Cover Image - Full width banner. Photo/gradient placeholder kept hardcoded dark in
				    both themes — it's media, not surface chrome, and the "?" initial fallback needs
				    to read on it either way. */}
				<div style={{
					width: "100%",
					height: 260,
					borderRadius: 18,
					marginBottom: 0,
					overflow: "hidden",
					background: "linear-gradient(135deg,#0c1a2e,#2563eb)",
					flexShrink: 0,
					position: "relative",
				}}>
					{coverImage && coverImage.startsWith('http') ? (
						<img
							src={coverImage}
							alt={`${celebrity.name} cover`}
							style={{ width: "100%", height: "100%", objectFit: "cover" }}
							onError={(e) => { e.target.style.display = 'none'; }}
						/>
					) : (
						<div style={{
							width: "100%",
							height: "100%",
							background: "linear-gradient(135deg,#0c1a2e,#2563eb)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}>
							<span style={{ fontSize: 64, opacity: 0.3 }}>
								{celebrity.name?.charAt(0) || "?"}
							</span>
						</div>
					)}
				</div>

				{/* Profile Image - Below cover, overlapping */}
				<div style={{
					display: "flex",
					alignItems: "flex-end",
					marginTop: -60,
					paddingLeft: 32,
					paddingRight: 32,
					marginBottom: 16,
					position: "relative",
					zIndex: 2,
				}}>
					<div style={{
						width: 120,
						height: 120,
						borderRadius: "50%",
						// border matches page bg, cutting the avatar out from the cover photo above it
						border: "4px solid var(--color-bg)",
						background: "linear-gradient(135deg,#0c1a2e,#2563eb)",
						boxShadow: "0 4px 20px var(--color-shadow)",
						overflow: "hidden",
						flexShrink: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}>
						{profileImage && profileImage.startsWith('http') ? (
							<img
								src={profileImage}
								alt={celebrity.name}
								style={{
									width: "100%",
									height: "100%",
									objectFit: "cover",
									display: "block",
								}}
								onError={(e) => { e.target.style.display = 'none'; }}
							/>
						) : (
							<span style={{ fontSize: 40, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>
								{celebrity.name?.charAt(0) || "?"}
							</span>
						)}
					</div>

					{/* Celebrity name and title next to profile image */}
					<div style={{ marginLeft: 20, flex: 1 }}>
						{celebrity.category && (
							<span style={{
								display: "inline-block",
								background: "rgba(37,99,235,0.15)",
								border: "1px solid rgba(37,99,235,0.3)",
								borderRadius: 6,
								padding: "3px 10px",
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 11,
								fontWeight: 600,
								color: "#60a5fa",
								marginBottom: 6
							}}>
								{celebrity.category}
							</span>
						)}
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 2, lineHeight: 1.2 }}>
							{celebrity.name}
						</h2>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 6 }}>
							{celebrity.title}
						</p>
						{/* Stats row */}
						<div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
								<span style={{ color: "#f59e0b", fontSize: 13 }}>★</span>
								<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600 }}>
									{celebrity.rating || 0}
								</span>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
									({celebrity.reviews || 0} reviews)
								</span>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
								<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</svg>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
									{celebrity.turnaround}
								</span>
							</div>
							{celebrity.location && (
								<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
									<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
										<circle cx="12" cy="10" r="3" />
									</svg>
									<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
										{celebrity.location}
									</span>
								</div>
							)}
							{celebrity.known_for && (
								<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
									<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
										Known for: {celebrity.known_for}
									</span>
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Package/Listing Images */}
				{packagePhotos.length > 0 && (
					<div style={{ paddingLeft: 32, paddingRight: 32, marginBottom: 24 }}>
						<p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>
							Package Images
						</p>
						<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
							{packagePhotos.map((photo, index) => (
								<div
									key={index}
									className="border border-border" style={{ width: 120, height: 120, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}
								>
									<img
										src={photo}
										alt={`${celebrity.name} package ${index + 1}`}
										style={{ width: "100%", height: "100%", objectFit: "cover" }}
										onError={(e) => { e.target.style.display = 'none'; }}
									/>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Two-column layout */}
				<div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start", paddingLeft: 32, paddingRight: 32 }}>
					{/* Left: About + Reviews */}
					<div style={{ flex: 2, minWidth: 280 }}>
						<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 14, padding: "20px 22px", marginBottom: 24 }}>
							<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>
								About {celebrity.name}
							</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, lineHeight: 1.75 }}>
								{celebrity.bio || `${celebrity.name} is a ${celebrity.category.toLowerCase()} celebrity known for ${celebrity.known_for || "their work"}.`}
							</p>
							{celebrity.profile?.languages && celebrity.profile.languages.length > 0 && (
								<div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
									{celebrity.profile.languages.map((lang) => (
										<span key={lang} className="bg-surface text-text-secondary" style={{ borderRadius: 6, padding: "4px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
											{lang}
										</span>
									))}
								</div>
							)}
						</div>

						{/* Reviews */}
						<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 14, padding: "20px 22px" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
								<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>
									Reviews
								</p>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
									({celebrity.reviews || 0})
								</span>
							</div>

							{reviewsLoading ? (
								<div style={{ textAlign: "center", padding: "20px 0" }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
										Loading reviews...
									</p>
								</div>
							) : (celebrity.reviews || 0) === 0 ? (
								<div style={{ textAlign: "center", padding: "20px 0" }}>
									<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
										No reviews yet. Be the first to review this celebrity!
									</p>
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
										<div key={r.id} style={{
											paddingBottom: 16,
											marginBottom: 16,
											borderBottom: i < reviews.length - 1 ? "1px solid var(--color-border-subtle)" : "none"
										}}>
											<div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
												<div style={{
													width: 36,
													height: 36,
													borderRadius: "50%",
													background: color,
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													fontFamily: "'Barlow Condensed', sans-serif",
													fontWeight: 700,
													fontSize: 12,
													color: "#fff",
													flexShrink: 0
												}}>
													{avatar}
												</div>
												<div>
													<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
														{displayName}
													</p>
													<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
														<span style={{ color: "#f59e0b", fontSize: 12 }}>
															{"★".repeat(Math.min(r.rating || 0, 5))}
														</span>
														<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
															{new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
														</span>
													</div>
												</div>
											</div>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.6, paddingLeft: 48 }}>
												{r.review}
											</p>
										</div>
									);
								})
							)}
						</div>
					</div>

					{/* Right: Booking Form */}
					<div style={{ flex: 1, minWidth: 240, position: "sticky", top: 0 }}>
						<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden", padding: "20px" }}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
								<span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28 }}>
									${celebrity.price}
								</span>
								<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, paddingTop: 8 }}>
									{celebrity.turnaround}
								</span>
							</div>

							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>
								Personalised video message from {celebrity.name}
							</p>

							{/* Message Type */}
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 8 }}>
								This video is for:
							</p>
							<div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
								{['MYSELF', 'SOMEONE_ELSE'].map(opt => (
									<button
										key={opt}
										onClick={() => setMessageType(opt)}
										style={{
											flex: 1,
											padding: "8px 12px",
											background: messageType === opt ? "#2563eb" : "var(--color-surface)",
											border: `1px solid ${messageType === opt ? "#2563eb" : "var(--color-border)"}`,
											borderRadius: 8,
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 12,
											color: messageType === opt ? "#fff" : "var(--color-text-secondary)",
											cursor: "pointer",
											transition: "all 0.15s"
										}}
									>
										{opt === 'MYSELF' ? 'Myself' : 'Someone Else'}
									</button>
								))}
							</div>

							{/* Recipient Name (if SOMEONE_ELSE) */}
							{messageType === 'SOMEONE_ELSE' && (
								<input
									value={recipientName}
									onChange={(e) => setRecipientName(e.target.value)}
									placeholder="Recipient's name"
									className="bg-surface border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", marginBottom: 16 }}
								/>
							)}

							{/* Request Message */}
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 8 }}>
								Your message to {celebrity.name}:
							</p>
							<textarea
								value={requestMessage}
								onChange={(e) => setRequestMessage(e.target.value)}
								rows={4}
								placeholder={`What would you like ${celebrity.name.split(" ")[0]} to say? Include any names, details, or special requests...`}
								className="bg-surface border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, resize: "vertical", outline: "none", marginBottom: 16 }}
							/>

							{/* Book Button - Creates booking request (no payment yet) */}
							<button
								onClick={() => {
									if (!requestMessage.trim()) return;
									setSubmitting(true);
									onBook({
										celebrity,
										messageType,
										recipientName: messageType === 'SOMEONE_ELSE' ? recipientName : null,
										requestMessage: requestMessage.trim(),
									});
								}}
								disabled={submitting}
								style={{
									width: "100%",
									background: submitting ? "rgba(37,99,235,0.5)" : "#2563eb",
									border: "none",
									borderRadius: 12,
									padding: "14px 0",
									fontFamily: "'DM Sans', sans-serif",
									fontWeight: 700,
									fontSize: 14,
									color: "#fff",
									cursor: submitting ? "default" : "pointer",
									transition: "background 0.15s"
								}}
								onMouseEnter={e => { if (!submitting) e.target.style.background = "#1d4ed8"; }}
								onMouseLeave={e => { if (!submitting) e.target.style.background = "#2563eb"; }}
							>
								{submitting ? "Sending Request..." : `Send Booking Request — $${celebrity.price}`}
							</button>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center", marginTop: 8 }}>
								Your request will be sent to {celebrity.name} for approval. Payment will be required after approval.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// =========================================
// Celebrity Checkout / Payment View
// =========================================
function CelebrityCheckoutView({ order, bookingId, onBack, onConfirm }) {
	const { isMobile } = useViewport();
	const [submitting, setSubmitting] = useState(false);
	const [orderError, setOrderError] = useState(null);
	const [cardComplete, setCardComplete] = useState(false);
	const [cardError, setCardError] = useState(null);
	const [booking, setBooking] = useState(null);

	const stripe = useStripe();
	const elements = useElements();

	// Load booking details on mount
	useEffect(() => {
		const loadBooking = async () => {
			if (!bookingId) return;
			try {
				const res = await getCelebrityBooking(bookingId);
				if (res?.successful) {
					setBooking(res.data);
				}
			} catch (err) {
				console.error('Failed to load booking:', err);
			}
		};
		loadBooking();
	}, [bookingId]);

	const handleCardChange = ({ error, complete }) => {
		setCardError(error);
		setCardComplete(complete);
	};

	const handlePlaceOrder = async () => {
		if (!stripe || !elements) {
			setOrderError("Payment system is not ready. Please try again.");
			return;
		}

		if (!cardComplete) {
			setOrderError("Please enter your card details.");
			return;
		}

		setOrderError(null);
		setSubmitting(true);

		try {
			// Create payment intent
			const payResponse = await payCelebrityBooking(bookingId);

			if (!payResponse?.successful) {
				setOrderError(payResponse?.message || 'Failed to process payment');
				setSubmitting(false);
				return;
			}

			const { client_secret } = payResponse.data;

			// Confirm payment with Stripe
			const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
				payment_method: {
					card: elements.getElement(CardElement),
				},
			});

			if (confirmError) {
				setOrderError(confirmError.message || 'Payment failed');
				setSubmitting(false);
				return;
			}

			if (paymentIntent.status === 'succeeded') {
				onConfirm(bookingId);
			} else {
				setOrderError('Payment was not successful. Please try again.');
				setSubmitting(false);
			}

		} catch (err) {
			const status = err?.response?.status;
			setOrderError(
				err?.response?.data?.message ||
				(status === 401 ? 'Please log in to pay' :
					status === 403 ? 'You do not have permission to pay for this booking' :
						'Could not process payment. Please try again.')
			);
			setSubmitting(false);
		}
	};

	if (!booking) {
		return (
			<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
					Loading booking details...
				</p>
			</div>
		);
	}

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 560, width: "100%", margin: "0 auto", paddingBottom: 24 }}>
				<button
					onClick={onBack}
					className="text-text-secondary" style={{ marginTop: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}
				>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="15 18 9 12 15 6" />
					</svg>
					Back to Bookings
				</button>

				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 24 }}>
					Complete Payment
				</h2>

				{/* Booking Details */}
				<div className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, padding: 20, marginBottom: 20 }}>
					<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
						Booking Details
					</p>
					<p className="text-text-primary" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
						Video from {booking.celebrity_profile?.display_name || "Celebrity"}
					</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
						{booking.message_type === 'SOMEONE_ELSE' ? `For ${booking.recipient_name || 'Someone Else'}` : 'For Myself'}
					</p>
					<p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>
						Status: <span style={{ color: "#f59e0b" }}>Approved - Awaiting Payment</span>
					</p>
					<div className="bg-border-subtle" style={{ height: 1, margin: "12px 0" }} />
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
							Total
						</span>
						<span className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
							${parseFloat(booking.price).toFixed(2)}
						</span>
					</div>
				</div>

				{/* Stripe Payment Field */}
				<CardInput onCardChange={handleCardChange} />

				{orderError && (
					<p style={{
						fontSize: 12,
						color: "#ef4444",
						fontFamily: "'DM Sans', sans-serif",
						marginBottom: 10,
						textAlign: "center"
					}}>
						{orderError}
					</p>
				)}

				<button
					onClick={handlePlaceOrder}
					disabled={submitting || !cardComplete}
					style={{
						width: "100%",
						background: (submitting || !cardComplete) ? "rgba(37,99,235,0.4)" : "#2563eb",
						border: "none",
						borderRadius: 14,
						padding: "16px 0",
						color: (submitting || !cardComplete) ? "rgba(255,255,255,0.4)" : "#fff",
						fontFamily: "'DM Sans', sans-serif",
						fontSize: 16,
						fontWeight: 700,
						cursor: (submitting || !cardComplete) ? "default" : "pointer"
					}}
				>
					{submitting ? "Processing…" : `Pay $${parseFloat(booking.price).toFixed(2)}`}
				</button>
			</div>
		</div>
	);
}

// =========================================
// Celebrity Confirm / Success View
// =========================================
function CelebrityConfirmView({ order, bookingId, onDone }) {
	const [countdown, setCountdown] = useState(5);

	useEffect(() => {
		// Countdown timer
		const timer = setInterval(() => {
			setCountdown(prev => {
				if (prev <= 1) {
					clearInterval(timer);
					onDone(); // Redirect to My Bookings
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(timer);
	}, [onDone]);

	return (
		<div style={{
			flex: 1,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			overflowY: "auto",
			minHeight: "100%",
			padding: "40px 24px",
		}}>
			<div style={{
				maxWidth: 420,
				width: "100%",
				textAlign: "center",
			}}>
				{/* Success Animation */}
				<div style={{
					width: 100,
					height: 100,
					borderRadius: "50%",
					background: "rgba(5,150,105,0.15)",
					border: "3px solid #059669",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					margin: "0 auto 24px",
					fontSize: 48,
					animation: "scaleIn 0.5s ease both",
				}}>
					✓
				</div>

				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, marginBottom: 8, letterSpacing: "0.02em" }}>
					Payment Successful! 🎉
				</h2>

				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 24, lineHeight: 1.6 }}>
					Your booking has been confirmed. You'll receive your personalised video soon.
				</p>

				{/* Countdown */}
				<div className="bg-surface-raised border border-border-subtle" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "12px 20px", borderRadius: 12 }}>
					<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
					<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
						Redirecting to <strong style={{ color: "#60a5fa" }}>My Bookings</strong> in
					</span>
					<span style={{
						fontFamily: "'Barlow Condensed', sans-serif",
						fontWeight: 700,
						fontSize: 20,
						color: "#60a5fa",
						minWidth: 28,
						textAlign: "center",
					}}>
						{countdown}s
					</span>
				</div>

				{/* Manual redirect button */}
				<button
					onClick={onDone}
					className="bg-surface-raised border border-border text-text-secondary" style={{ marginTop: 20, padding: "12px 28px", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
					onMouseEnter={e => {
						e.currentTarget.style.background = "var(--color-border)";
						e.currentTarget.style.color = "var(--color-text-primary)";
					}}
					onMouseLeave={e => {
						e.currentTarget.style.background = "var(--color-surface-raised)";
						e.currentTarget.style.color = "var(--color-text-secondary)";
					}}
				>
					Go to My Bookings Now
				</button>
			</div>
		</div>
	);
}

// =========================================
// My Bookings Tab Component
// =========================================
function MyCelebrityBookingsTab({ bookings, loading, onRefresh, onPay }) {
	const [paymentModal, setPaymentModal] = useState(null);
	const [paymentLoading, setPaymentLoading] = useState(false);
	const [paymentError, setPaymentError] = useState(null);
	const [cardComplete, setCardComplete] = useState(false);
	const [cardError, setCardError] = useState(null);
	const [ratingModal, setRatingModal] = useState(null);
	const [ratingValue, setRatingValue] = useState(0);
	const [ratingComment, setRatingComment] = useState("");
	const [selectedBooking, setSelectedBooking] = useState(null);
	const [showBookingDetail, setShowBookingDetail] = useState(false);
	const [completingBooking, setCompletingBooking] = useState(false);

	const stripe = useStripe();
	const elements = useElements();

	const handleCardChange = ({ error, complete }) => {
		setCardError(error);
		setCardComplete(complete);
	};

	const handlePayment = async () => {
		if (!stripe || !elements) {
			setPaymentError("Payment system is not ready. Please try again.");
			return;
		}

		if (!cardComplete) {
			setPaymentError("Please enter your card details.");
			return;
		}

		setPaymentLoading(true);
		setPaymentError(null);

		try {
			// Create payment intent
			const payResult = await payCelebrityBooking(paymentModal.bookingId);

			if (!payResult.successful) {
				setPaymentError(payResult.message || "Payment failed");
				setPaymentLoading(false);
				return;
			}

			const { client_secret } = payResult.data;

			const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
				payment_method: {
					card: elements.getElement(CardElement),
				},
			});

			if (confirmError) {
				setPaymentError(confirmError.message || "Payment failed");
				setPaymentLoading(false);
				return;
			}

			if (paymentIntent.status === 'succeeded') {
				setPaymentModal(null);
				await onRefresh();
				setPaymentLoading(false);
				// Navigate to confirm view
				if (onPay) {
					onPay(paymentModal.bookingId);
				}
			} else {
				setPaymentError("Payment was not successful. Please try again.");
				setPaymentLoading(false);
			}
		} catch (err) {
			setPaymentError(err?.response?.data?.message || "Payment failed. Please try again.");
			setPaymentLoading(false);
		}
	};

	const handleRatingSubmit = async () => {
		if (!ratingModal || ratingValue === 0) return;
		try {
			await createCelebrityReview({
				booking_id: ratingModal.bookingId,
				rating: ratingValue,
				review: ratingComment
			});
			setRatingModal(null);
			setRatingValue(0);
			setRatingComment("");
			onRefresh();
		} catch (error) {
			console.error("Failed to submit review:", error);
		}
	};

	const handleBookingDetailRatingSubmit = async () => {
		if (!selectedBooking || ratingValue === 0) return;
		try {
			await createCelebrityReview({
				booking_id: selectedBooking.id,
				rating: ratingValue,
				review: ratingComment
			});
			setShowBookingDetail(false);
			setRatingValue(0);
			setRatingComment("");
			setSelectedBooking(null);
			onRefresh();
		} catch (error) {
			console.error("Failed to submit review:", error);
		}
	};

	// Handle Mark as Complete
	const handleMarkComplete = async (bookingId) => {
		if (!bookingId) return;
		setCompletingBooking(true);
		try {
			const res = await completeCelebrityBooking(bookingId);
			if (res?.successful) {
				onRefresh();
			} else {
				console.error('Failed to complete booking:', res?.message);
			}
		} catch (error) {
			console.error('Failed to complete booking:', error);
		}
		setCompletingBooking(false);
	};

	const getStatusColor = (status) => {
		const map = {
			PENDING: '#f59e0b',
			ACCEPTED: '#2563eb',
			RECORDING: '#8b5cf6',
			DELIVERED: '#06b6d4',
			COMPLETED: '#059669',
			CANCELLED: '#6b7280'
		};
		return map[status] || '#6b7280';
	};

	const formatStatus = (status) => {
		const map = {
			PENDING: 'Pending Approval',
			ACCEPTED: 'Accepted',
			RECORDING: 'Recording',
			DELIVERED: 'Delivered',
			COMPLETED: 'Completed',
			CANCELLED: 'Cancelled'
		};
		return map[status] || status;
	};

	const formatPaymentStatus = (status) => {
		const map = {
			PENDING: 'Pending',
			PAID: 'Paid',
			FAILED: 'Failed',
			CANCELLED: 'Cancelled',
			REFUNDED: 'Refunded'
		};
		return map[status] || status;
	};

	if (loading) {
		return (
			<div style={{ padding: "20px 0" }}>
				{[...Array(3)].map((_, i) => (
					<Skel key={i} w="100%" h={80} r={12} style={{ marginBottom: 12 }} />
				))}
			</div>
		);
	}

	if (!bookings || bookings.length === 0) {
		return (
			<EmptyState
				icon="📅"
				title="No bookings yet"
				message="Browse celebrities and book your first cameo!"
			/>
		);
	}

	return (
		<div style={{ padding: "20px 0" }}>
			{bookings.map(booking => (
				<div
					key={booking.id}
					className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 12, padding: "16px", marginBottom: 12, cursor: "pointer" }}
					onClick={() => {
						setSelectedBooking(booking);
						setShowBookingDetail(true);
						setRatingValue(0);
						setRatingComment("");
					}}
				>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
						<div>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>
								{booking.listing?.title || "Celebrity Cameo"}
							</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
								{booking.celebrity_profile?.display_name || "Celebrity"} · ${parseFloat(booking.price).toFixed(2)}
							</p>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
								{new Date(booking.created_at).toLocaleDateString()}
							</p>
						</div>
						<div style={{ textAlign: "right" }}>
							<span style={{
								fontFamily: "'DM Sans', sans-serif",
								fontSize: 11,
								padding: "4px 12px",
								borderRadius: 6,
								background: `${getStatusColor(booking.status)}20`,
								color: getStatusColor(booking.status),
								display: "inline-block",
								border: `1px solid ${getStatusColor(booking.status)}40`,
							}}>
								{formatStatus(booking.status)}
							</span>
							<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 4 }}>
								Payment: {formatPaymentStatus(booking.payment_status)}
							</p>
							{booking.status === "ACCEPTED" && booking.payment_status === "PENDING" && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										if (onPay) {
											onPay(booking.id);
										} else {
											setPaymentModal({ bookingId: booking.id });
										}
									}}
									style={{
										marginTop: 6,
										padding: "4px 12px",
										background: "#2563eb",
										border: "none",
										borderRadius: 6,
										color: "#fff",
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 11,
										fontWeight: 600,
										cursor: "pointer",
										transition: "background 0.2s"
									}}
									onMouseEnter={e => e.target.style.background = "#1d4ed8"}
									onMouseLeave={e => e.target.style.background = "#2563eb"}
								>
									Pay Now
								</button>
							)}
							{booking.status === "DELIVERED" && booking.payment_status === "PAID" && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleMarkComplete(booking.id);
									}}
									disabled={completingBooking}
									style={{
										marginTop: 6,
										padding: "4px 12px",
										background: "#059669",
										border: "none",
										borderRadius: 6,
										color: "#fff",
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 11,
										fontWeight: 600,
										cursor: completingBooking ? "default" : "pointer",
										opacity: completingBooking ? 0.6 : 1,
										transition: "background 0.2s"
									}}
									onMouseEnter={e => {
										if (!completingBooking) e.target.style.background = "#047857";
									}}
									onMouseLeave={e => {
										if (!completingBooking) e.target.style.background = "#059669";
									}}
								>
									{completingBooking ? "..." : "✓ Mark as Complete"}
								</button>
							)}
							{booking.payment_status === "PAID" && booking.status === "COMPLETED" && !booking.review && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										setSelectedBooking(booking);
										setShowBookingDetail(true);
										setRatingValue(0);
										setRatingComment("");
										// Auto-scroll to review section after a small delay
										setTimeout(() => {
											const reviewSection = document.getElementById('review-section');
											if (reviewSection) {
												reviewSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
											}
										}, 300);
									}}
									style={{
										marginTop: 6,
										padding: "4px 12px",
										background: "#f59e0b",
										border: "none",
										borderRadius: 6,
										color: "#fff",
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 11,
										fontWeight: 600,
										cursor: "pointer",
										transition: "background 0.2s"
									}}
									onMouseEnter={e => e.target.style.background = "#d97706"}
									onMouseLeave={e => e.target.style.background = "#f59e0b"}
								>
									⭐ Rate
								</button>
							)}
							{booking.payment_status === "PAID" && booking.status === "COMPLETED" && booking.review && (
								<span style={{
									marginTop: 6,
									display: "inline-block",
									padding: "2px 10px",
									background: "rgba(5,150,105,0.15)",
									borderRadius: 4,
									color: "#34d399",
									fontFamily: "'DM Sans', sans-serif",
									fontSize: 10,
									fontWeight: 600
								}}>
									⭐ Reviewed
								</span>
							)}
						</div>
					</div>
				</div>
			))}

			{/* Payment Modal */}
			{paymentModal && (
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 32, width: "100%", maxWidth: 480, minHeight: 260 }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Complete Payment</h3>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 18 }}>
							Your booking has been approved. Please complete the payment.
						</p>

						{paymentError && (
							<div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171" }}>{paymentError}</p>
							</div>
						)}

						<CardInput onCardChange={handleCardChange} />

						<div style={{ display: "flex", gap: 12 }}>
							<button
								onClick={() => setPaymentModal(null)}
								className="bg-surface-raised border border-border text-text-primary" style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
							>
								Cancel
							</button>
							<button
								onClick={handlePayment}
								disabled={paymentLoading || !cardComplete}
								style={{ flex: 1, padding: "11px 0", background: paymentLoading || !cardComplete ? "rgba(37,99,235,0.4)" : "#2563eb", border: "none", borderRadius: 10, color: paymentLoading || !cardComplete ? "rgba(255,255,255,0.4)" : "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: paymentLoading || !cardComplete ? "default" : "pointer" }}
							>
								{paymentLoading ? "Processing..." : "Pay Now"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Booking Detail Modal */}
			{showBookingDetail && selectedBooking && (
				<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 20, padding: 32, width: "100%", maxWidth: 500, maxHeight: "80vh", overflowY: "auto" }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
							<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22 }}>
								Booking Details
							</h3>
							<button onClick={() => { setShowBookingDetail(false); setSelectedBooking(null); setRatingValue(0); setRatingComment(""); }} className="text-text-secondary" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer" }}>×</button>
						</div>

						<div style={{ marginBottom: 16 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Celebrity</p>
							<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600 }}>
								{selectedBooking.celebrity_profile?.display_name || "Celebrity"}
							</p>
						</div>

						<div style={{ marginBottom: 16 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Message</p>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5 }}>
								{selectedBooking.request_message}
							</p>
						</div>

						{selectedBooking.recipient_name && (
							<div style={{ marginBottom: 16 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Recipient</p>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
									{selectedBooking.recipient_name}
								</p>
							</div>
						)}

						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
							<div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Price</p>
								<p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#60a5fa", fontWeight: 600 }}>
									${parseFloat(selectedBooking.price).toFixed(2)}
								</p>
							</div>
							<div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Date</p>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
									{new Date(selectedBooking.created_at).toLocaleDateString()}
								</p>
							</div>
						</div>

						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
							<div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Status</p>
								<span style={{
									fontFamily: "'DM Sans', sans-serif",
									fontSize: 12,
									padding: "2px 10px",
									borderRadius: 4,
									background: `${getStatusColor(selectedBooking.status)}20`,
									color: getStatusColor(selectedBooking.status),
									display: "inline-block",
									border: `1px solid ${getStatusColor(selectedBooking.status)}40`,
								}}>
									{formatStatus(selectedBooking.status)}
								</span>
							</div>
							<div>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Payment</p>
								<span style={{
									fontFamily: "'DM Sans', sans-serif",
									fontSize: 12,
									padding: "2px 10px",
									borderRadius: 4,
									background: selectedBooking.payment_status === "PAID" ? "rgba(5,150,105,0.15)" : "rgba(245,158,11,0.15)",
									color: selectedBooking.payment_status === "PAID" ? "#34d399" : "#f59e0b",
									display: "inline-block"
								}}>
									{formatPaymentStatus(selectedBooking.payment_status)}
								</span>
							</div>
						</div>

						{/* Video URL if delivered */}
						{selectedBooking.video_url && (
							<div style={{ marginBottom: 16, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 16 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>Video</p>
								<a
									href={selectedBooking.video_url}
									target="_blank"
									rel="noopener noreferrer"
									style={{
										color: "#60a5fa",
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 14,
										textDecoration: "none",
										wordBreak: "break-all"
									}}
								>
									Watch Video →
								</a>
							</div>
						)}

						{/* Mark as Complete Button - only for DELIVERED and PAID */}
						{selectedBooking.status === "DELIVERED" && selectedBooking.payment_status === "PAID" && (
							<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 16, marginBottom: 16 }}>
								<button
									onClick={() => {
										handleMarkComplete(selectedBooking.id);
									}}
									disabled={completingBooking}
									style={{
										width: "100%",
										padding: "10px 0",
										background: completingBooking ? "rgba(5,150,105,0.4)" : "#059669",
										border: "none",
										borderRadius: 10,
										color: "#fff",
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 14,
										fontWeight: 700,
										cursor: completingBooking ? "default" : "pointer",
										opacity: completingBooking ? 0.6 : 1,
										transition: "all 0.2s"
									}}
									onMouseEnter={e => {
										if (!completingBooking) {
											e.currentTarget.style.background = "#047857";
											e.currentTarget.style.transform = "translateY(-1px)";
										}
									}}
									onMouseLeave={e => {
										if (!completingBooking) {
											e.currentTarget.style.background = "#059669";
											e.currentTarget.style.transform = "none";
										}
									}}
								>
									{completingBooking ? "Processing..." : "✓ Mark as Complete"}
								</button>
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textAlign: "center", marginTop: 8 }}>
									Confirm you've received and watched the video
								</p>
							</div>
						)}

						{/* Review Section - only show if COMPLETED and PAID */}
						{selectedBooking.status === "COMPLETED" &&
							selectedBooking.payment_status === "PAID" && (
								<div id="review-section" style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 16 }}>
									{!selectedBooking.review ? (
										<>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 12 }}>Leave a Review</p>
											<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
												{[1, 2, 3, 4, 5].map(n => (
													<button
														key={n}
														onClick={() => setRatingValue(n)}
														style={{
															background: "none",
															border: "none",
															cursor: "pointer",
															padding: 0,
															transition: "transform 0.15s"
														}}
														onMouseEnter={e => e.currentTarget.style.transform = "scale(1.15)"}
														onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
													>
														<svg
															width={32}
															height={32}
															viewBox="0 0 24 24"
															fill={n <= ratingValue ? "#f59e0b" : "none"}
															stroke={n <= ratingValue ? "#f59e0b" : "var(--color-text-muted)"}
															strokeWidth="1.5"
														>
															<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
														</svg>
													</button>
												))}
											</div>
											<textarea
												value={ratingComment}
												onChange={e => setRatingComment(e.target.value)}
												placeholder="Share your experience (optional)"
												rows={2}
												className="bg-surface border border-border text-text-primary" style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", resize: "none", marginBottom: 12 }}
											/>
											<button
												onClick={handleBookingDetailRatingSubmit}
												disabled={ratingValue === 0}
												style={{
													padding: "8px 20px",
													background: ratingValue > 0 ? "#2563eb" : "rgba(37,99,235,0.3)",
													border: "none",
													borderRadius: 8,
													color: ratingValue > 0 ? "#fff" : "rgba(255,255,255,0.3)",
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 13,
													fontWeight: 600,
													cursor: ratingValue > 0 ? "pointer" : "default",
													transition: "all 0.2s"
												}}
												onMouseEnter={e => {
													if (ratingValue > 0) {
														e.currentTarget.style.background = "#1d4ed8";
														e.currentTarget.style.transform = "translateY(-1px)";
													}
												}}
												onMouseLeave={e => {
													if (ratingValue > 0) {
														e.currentTarget.style.background = "#2563eb";
														e.currentTarget.style.transform = "none";
													}
												}}
											>
												Submit Review
											</button>
										</>
									) : (
										<>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 6 }}>Your Review</p>
											<div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
												{[...Array(5)].map((_, i) => (
													<svg
														key={i}
														width={18}
														height={18}
														viewBox="0 0 24 24"
														fill={i < selectedBooking.review.rating ? "#f59e0b" : "none"}
														stroke={i < selectedBooking.review.rating ? "#f59e0b" : "var(--color-text-muted)"}
														strokeWidth="1.5"
													>
														<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
													</svg>
												))}
											</div>
											{selectedBooking.review.review && (
												<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5 }}>
													"{selectedBooking.review.review}"
												</p>
											)}
										</>
									)}
								</div>
							)}

						<button
							onClick={() => { setShowBookingDetail(false); setSelectedBooking(null); setRatingValue(0); setRatingComment(""); }}
							className="bg-surface-raised border border-border text-text-primary" style={{ marginTop: 16, padding: "10px 24px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer", width: "100%", transition: "all 0.2s" }}
							onMouseEnter={e => {
								e.currentTarget.style.background = "var(--color-border)";
							}}
							onMouseLeave={e => {
								e.currentTarget.style.background = "var(--color-surface-raised)";
							}}
						>
							Close
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// =========================================
// Main Celebrity Page
// =========================================
function CelebrityPage({ onNavigate }) {
	const { t, title, landingTitle, searchPlaceholder } = usePageI18n("celebrity");
	const categories = CELEBRITY_CATEGORY_DEFS;
	const { isMobile } = useViewport();
	const loading = usePageLoad();

	const [activeTab, setActiveTab] = useState("browse");
	const [selectedCategory, setSelectedCategory] = useState("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [tempSearchQuery, setTempSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState("recent");

	const [currentPage, setCurrentPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [totalItems, setTotalItems] = useState(0);
	const itemsPerPage = 8;

	const [listings, setListings] = useState([]);
	const [listingsLoading, setListingsLoading] = useState(true);
	const [listingsError, setListingsError] = useState(null);

	// View state
	const [view, setView] = useState("grid");
	const [selectedCelebrity, setSelectedCelebrity] = useState(null);
	const [order, setOrder] = useState(null);
	const [bookingId, setBookingId] = useState(null);
	const [pendingPaymentBookingId, setPendingPaymentBookingId] = useState(null);

	// My bookings
	const [myBookings, setMyBookings] = useState([]);
	const [loadingBookings, setLoadingBookings] = useState(false);
	const [bookingsLoaded, setBookingsLoaded] = useState(false);

	// Sort options
	const sortOptions = [
		{ value: 'recent', label: 'Recent' },
		{ value: 'price_low', label: 'Price: Low to High' },
		{ value: 'price_high', label: 'Price: High to Low' },
		{ value: 'oldest', label: 'Oldest' },
	];

	// Fetch listings
	const fetchListings = async (page = 1) => {
		try {
			setListingsLoading(true);
			setListingsError(null);

			const params = {
				limit: itemsPerPage,
				offset: (page - 1) * itemsPerPage,
				sortBy: sortBy,
			};

			if (selectedCategory !== 'all') {
				params.category = selectedCategory;
			}

			if (searchQuery.trim()) {
				params.search = searchQuery.trim();
			}

			const response = await getCelebrityListings(params);

			if (response?.successful && Array.isArray(response.data)) {
				const mapped = response.data.map(mapCelebrityListing);
				setListings(mapped);

				if (response.pagination) {
					setTotalItems(response.pagination.total || 0);
					setTotalPages(response.pagination.totalPages || 1);
				} else {
					setTotalItems(mapped.length);
					setTotalPages(Math.ceil(mapped.length / itemsPerPage));
				}
			} else {
				setListings([]);
				setTotalItems(0);
				setTotalPages(1);
				setListingsError(response?.message || 'Failed to load celebrities');
			}
		} catch (error) {
			console.error('Failed to fetch celebrity listings:', error);
			setListingsError(error?.message || 'Failed to load celebrities');
			setListings([]);
			setTotalItems(0);
			setTotalPages(1);
		} finally {
			setListingsLoading(false);
		}
	};

	// Load my bookings - only when tab is opened
	const loadMyBookings = async (force = false) => {
		if (!force && bookingsLoaded && myBookings.length > 0) return;

		setLoadingBookings(true);
		try {
			if (isAuthenticated()) {
				const response = await getMyCelebrityBookings();
				if (response?.successful && Array.isArray(response.data)) {
					setMyBookings(response.data);
				} else {
					setMyBookings([]);
				}
			} else {
				setMyBookings([]);
			}
			setBookingsLoaded(true);
		} catch (error) {
			console.error('Failed to load my bookings:', error);
			setMyBookings([]);
		} finally {
			setLoadingBookings(false);
		}
	};

	// Refresh my bookings (for after payment/rating)
	const refreshMyBookings = async () => {
		await loadMyBookings(true);
	};

	// Initial fetch
	useEffect(() => {
		fetchListings(1);
	}, [selectedCategory, searchQuery, sortBy]);

	// Fetch when page changes
	useEffect(() => {
		if (currentPage > 1) {
			fetchListings(currentPage);
		}
	}, [currentPage]);

	// Load bookings when tab changes to "orders"
	useEffect(() => {
		if (activeTab === "orders") {
			loadMyBookings();
		}
	}, [activeTab]);

	const handleSearch = (e) => {
		e.preventDefault();
		setSearchQuery(tempSearchQuery);
		setCurrentPage(1);
	};

	const handleSortChange = (value) => {
		setSortBy(value);
		setCurrentPage(1);
	};

	const handlePageChange = (page) => {
		if (page >= 1 && page <= totalPages) {
			setCurrentPage(page);
			const gridElement = document.getElementById('celebrity-grid');
			if (gridElement) {
				gridElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}
	};

	const handleOrderComplete = () => {
		setView("grid");
		setSelectedCelebrity(null);
		setOrder(null);
		setBookingId(null);
		setPendingPaymentBookingId(null);
		setActiveTab("orders");
		refreshMyBookings();
		fetchListings(currentPage);
	};

	// Handle tab change
	const handleTabChange = (tab) => {
		setActiveTab(tab);
		if (tab === "orders") {
			loadMyBookings();
		}
	};

	// Handle booking creation - creates the booking request and navigates to my bookings
	const handleBookingCreated = async (bookingData) => {
		try {
			const response = await createCelebrityBooking(bookingData);
			if (response?.successful) {
				const booking = response.data;
				setBookingId(booking.id);
				// Refresh bookings and switch to orders tab
				await refreshMyBookings();
				setActiveTab("orders");
				setView("grid");
				setSelectedCelebrity(null);
				setOrder(null);
			} else {
				console.error('Failed to create booking:', response?.message);
			}
		} catch (error) {
			console.error('Failed to create booking:', error);
		}
	};

	// Handle payment - opens checkout view for payment
	const handlePay = (bookingId) => {
		setPendingPaymentBookingId(bookingId);
		setView("checkout");
	};

	// View rendering
	if (view === "profile" && selectedCelebrity) {
		return (
			<CelebrityProfileDetailView
				celebrity={selectedCelebrity}
				onBack={() => setView("grid")}
				onBook={(ord) => {
					setOrder(ord);
					// Create booking request immediately
					const bookingData = {
						listing_id: ord.celebrity.id,
						message_type: ord.messageType,
						request_message: ord.requestMessage,
					};
					if (ord.messageType === 'SOMEONE_ELSE' && ord.recipientName) {
						bookingData.recipient_name = ord.recipientName;
					}
					handleBookingCreated(bookingData);
				}}
			/>
		);
	}

	if (view === "checkout" && (pendingPaymentBookingId || order)) {
		return (
			<Elements stripe={stripePromise}>
				<CelebrityCheckoutView
					order={order}
					bookingId={pendingPaymentBookingId || bookingId}
					onBack={() => {
						setView("grid");
						setPendingPaymentBookingId(null);
						setActiveTab("orders");
						refreshMyBookings();
					}}
					onConfirm={(id) => {
						setBookingId(id);
						setPendingPaymentBookingId(null);
						setView("confirm");
					}}
				/>
			</Elements>
		);
	}

	if (view === "confirm") {
		return (
			<CelebrityConfirmView
				order={order}
				bookingId={bookingId}
				onDone={handleOrderComplete}
			/>
		);
	}

	const isLoading = listingsLoading || loading;
	const hasListings = listings.length > 0;

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				<div style={{ padding: "32px 0 0" }}>
					<div style={{ textAlign: "center", marginBottom: 28 }}>
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px,3vw,36px)", letterSpacing: "0.03em", marginBottom: 4 }}>
							{landingTitle || "Celebrity Cameos"}
						</h2>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 14 }}>
							Get a personalised video message from your favourite celebrities
						</p>

						{/* "Join as Celebrity" Button */}
						<button
							style={{
								background: "rgba(37,99,235,0.15)",
								border: "1px solid rgba(37,99,235,0.35)",
								borderRadius: 10,
								padding: "10px 18px",
								fontFamily: "'DM Sans', sans-serif",
								fontWeight: 600,
								fontSize: 13,
								color: "#60a5fa",
								cursor: "pointer",
								transition: "all 0.2s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "rgba(37,99,235,0.25)";
								e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "rgba(37,99,235,0.15)";
								e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
							}}
							onClick={() => {
								if (onNavigate) {
									onNavigate("sd-celebrity");
								} else {
									window.__nav?.("sd-celebrity");
								}
							}}
						>
							{"Join as Celebrity"}
						</button>
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
						onClick={() => handleTabChange("browse")}
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
						Browse Celebrities
					</button>
					<button
						onClick={() => handleTabChange("orders")}
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
						My Bookings {myBookings.length > 0 && `(${myBookings.length})`}
					</button>
				</div>

				{activeTab === "orders" ? (
					<MyCelebrityBookingsTab
						bookings={myBookings}
						loading={loadingBookings}
						onRefresh={refreshMyBookings}
						onPay={handlePay}
					/>
				) : (
					<>
						{/* Category Filter */}
						<div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
							{categories.map((c) => (
								<button
									key={c.id}
									onClick={() => { setSelectedCategory(c.id); setCurrentPage(1); }}
									style={{
										padding: "6px 16px",
										background: selectedCategory === c.id ? c.color : "var(--color-surface-raised)",
										border: `1px solid ${selectedCategory === c.id ? c.color : "var(--color-border)"}`,
										borderRadius: 20,
										fontFamily: "'DM Sans', sans-serif",
										fontSize: 13,
										color: selectedCategory === c.id ? "#fff" : "var(--color-text-secondary)",
										cursor: "pointer",
										transition: "all 0.15s",
									}}
								>
									{c.id === 'all' ? 'All' : c.labelKey ? i18n.t(c.labelKey) : c.id}
								</button>
							))}
						</div>

						{/* Search and Sort */}
						<div style={{
							display: "flex",
							gap: 12,
							marginBottom: 24,
							flexWrap: "wrap",
							alignItems: "center"
						}}>
							<form onSubmit={handleSearch} style={{
								flex: 1,
								minWidth: 200,
								display: "flex",
								gap: 8,
								alignItems: "center"
							}}>
								<div className="bg-surface-raised border border-border" style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", borderRadius: 10, padding: "0 12px" }}>
									<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<circle cx="11" cy="11" r="8" />
										<line x1="21" y1="21" x2="16.65" y2="16.65" />
									</svg>
									<input
										type="text"
										value={tempSearchQuery}
										onChange={(e) => setTempSearchQuery(e.target.value)}
										placeholder="Search celebrities by name, category, or known for..."
										className="text-text-primary" style={{ flex: 1, padding: "10px 12px", background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none" }}
									/>
									{tempSearchQuery && (
										<button
											type="button"
											onClick={() => setTempSearchQuery("")}
											className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", fontSize: 16 }}
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

							<CustomSortDropdown
								value={sortBy}
								onChange={handleSortChange}
								options={sortOptions}
							/>
						</div>

						{/* Results count */}
						{!isLoading && (
							<div className="text-text-secondary" style={{ marginBottom: 16, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
								{totalItems} celebrity{totalItems !== 1 ? 's' : ''} found
								{searchQuery && ` for "${searchQuery}"`}
							</div>
						)}

						{/* Error message */}
						{listingsError && (
							<div style={{
								background: "rgba(239,68,68,0.1)",
								border: "1px solid rgba(239,68,68,0.25)",
								borderRadius: 12,
								padding: "12px 18px",
								marginBottom: 16,
								display: "flex",
								alignItems: "center",
								gap: 10
							}}>
								<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<circle cx="12" cy="12" r="10" />
									<line x1="12" y1="8" x2="12" y2="12" />
									<line x1="12" y1="16" x2="12.01" y2="16" />
								</svg>
								<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171" }}>
									Couldn't load celebrities. Please try again later.
								</span>
							</div>
						)}

						{/* No results */}
						{!isLoading && !hasListings && !listingsError && (
							<div style={{ textAlign: "center", padding: "60px 20px" }}>
								<div className="bg-surface-raised" style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
									<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
										<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
										<circle cx="12" cy="7" r="4" />
									</svg>
								</div>
								<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
									{searchQuery ? `No results found for "${searchQuery}"` : "No Celebrities Available"}
								</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
									{searchQuery ? (
										"Try adjusting your search terms or filters."
									) : (
										"There are currently no active celebrity listings. Check back later!"
									)}
								</p>
							</div>
						)}

						{/* Grid */}
						<div id="celebrity-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>
							{isLoading ? (
								Array.from({ length: itemsPerPage }).map((_, i) => (
									<div key={i} className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, overflow: "hidden", animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
										<Skel h={180} r={0} />
										<div style={{ padding: 16 }}>
											<Skel w="70%" h={14} r={6} style={{ marginBottom: 8 }} />
											<Skel w="55%" h={12} r={5} style={{ marginBottom: 12 }} />
											<div style={{ display: "flex", justifyContent: "space-between" }}>
												<Skel w={60} h={12} r={5} />
												<Skel w={50} h={16} r={6} />
											</div>
										</div>
									</div>
								))
							) : (
								hasListings ? listings.map((celebrity, i) => {
									const firstPhoto = celebrity.photos?.[0] || celebrity.photo;
									return (
										<div
											key={celebrity.id}
											onClick={() => { setSelectedCelebrity(celebrity); setView("profile"); }}
											className="bg-surface-raised border border-border-subtle" style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s", animation: `fadeUp 0.35s ease ${i * 40}ms both` }}
											onMouseEnter={e => {
												e.currentTarget.style.borderColor = "var(--color-border)";
												e.currentTarget.style.transform = "translateY(-2px)";
											}}
											onMouseLeave={e => {
												e.currentTarget.style.borderColor = "var(--color-border-subtle)";
												e.currentTarget.style.transform = "none";
											}}
										>
											{/* Photo container: celebrity.photo is either a real photo URL or a hardcoded
											    gradient placeholder (see mapCelebrityListing) — media, so it and the
											    category chip's dark scrim stay fixed in both themes for legibility. */}
											<div style={{ height: 170, background: celebrity.photo, position: "relative", overflow: "hidden" }}>
												{firstPhoto && firstPhoto.startsWith('http') ? (
													<img
														src={firstPhoto}
														alt={celebrity.name}
														style={{ width: "100%", height: "100%", objectFit: "cover" }}
														onError={(e) => { e.target.style.display = 'none'; }}
													/>
												) : null}
												<div style={{
													position: "absolute",
													bottom: 10,
													left: 10,
													background: "rgba(0,0,0,0.6)",
													backdropFilter: "blur(4px)",
													borderRadius: 6,
													padding: "3px 9px",
													fontFamily: "'DM Sans', sans-serif",
													fontSize: 10,
													fontWeight: 600,
													color: "rgba(255,255,255,0.7)"
												}}>
													{celebrity.category}
												</div>
											</div>
											<div style={{ padding: "14px 16px" }}>
												<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
													{celebrity.name}
												</p>
												<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 10, lineHeight: 1.35 }}>
													{celebrity.title}
												</p>
												<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
													<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
														<span style={{ color: "#f59e0b", fontSize: 12 }}>★</span>
														<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
															{celebrity.rating || 0}
														</span>
														<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
															({celebrity.reviews || 0})
														</span>
													</div>
													<p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#60a5fa" }}>
														${celebrity.price}
													</p>
												</div>
												{celebrity.turnaround_days && (
													<div className="text-text-muted" style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
														⏱ {celebrity.turnaround_days} day{celebrity.turnaround_days > 1 ? 's' : ''} delivery
													</div>
												)}
											</div>
										</div>
									);
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
									className={`bg-surface-raised border border-border-subtle ${currentPage === 1 ? "text-text-muted" : "text-text-secondary"}`} style={{ padding: "8px 14px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: currentPage === 1 ? "default" : "pointer", transition: "all 0.15s" }}
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
												background: currentPage === pageNum ? "#2563eb" : "var(--color-surface-raised)",
												border: currentPage === pageNum ? "none" : "1px solid var(--color-border-subtle)",
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
									className={`bg-surface-raised border border-border-subtle ${currentPage === totalPages ? "text-text-muted" : "text-text-secondary"}`} style={{ padding: "8px 14px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: currentPage === totalPages ? "default" : "pointer", transition: "all 0.15s" }}
								>
									Next
								</button>

								<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginLeft: 8 }}>
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

export { CelebrityPage };