import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import i18n from "../i18n/index.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useI18nCategoryList, matchesCategory } from "../hooks/useI18nCategoryList.js";
import { useViewport } from "../hooks/useViewport.js";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { SearchIcon } from "../components/icons.jsx";
import { Skel, SkeletonCircle, SkeletonHeading } from "../components/skeletons.jsx";
import { LeoButton } from "../components/shared.jsx";
import { CardInput } from "../components/BookingPayment.jsx";
import { useDialog } from "../components/ConfirmDialog.jsx";
import { useStripe, useElements, CardNumberElement } from "@stripe/react-stripe-js";
import {
	createDonation, getCampaigns, getCampaign, getMyCampaigns, createCampaign, updateCampaign,
	getRewardTiers, createRewardTier, updateRewardTier, deleteRewardTier,
	getCampaignUpdates, createCampaignUpdate, deleteCampaignUpdate,
	getPayoutSummary, getPayouts, withdrawCampaign, getMyDonations,
	getCampaignBackers, updateDonationFulfillment,
} from "../api/raise";
import { createStripeIntent } from "../api/payment";
import { uploadImage } from "../api/shop";
import { getUser, isAuthenticated } from "../store/auth";
import { RAISE_CATEGORY_DEFS, filterRaiseCampaigns, mapRaiseCampaign, parseRaisePath, raisePathForView } from "../utils/raiseBrowse.js";

const RAISE_THUMBS = [
	"linear-gradient(135deg,#052e16,#16a34a)", "linear-gradient(135deg,#1e1b4b,#7c3aed)",
	"linear-gradient(135deg,#451a03,#f59e0b)", "linear-gradient(135deg,#1c1917,#ef4444)",
	"linear-gradient(135deg,#0c1a2e,#2563eb)", "linear-gradient(135deg,#0f172a,#06b6d4)",
];

const RAISE_PROJECTS = [
	{ id: 1,  title: "Solara — Solar Lanterns for Off-Grid Communities", creator: "EcoTech Collective", category: "Technology", goal: 25000, raised: 19400, backers: 412, daysLeft: 14, thumb: "linear-gradient(135deg,#052e16,#16a34a)", type: "kickstarter", tagline: "Power the world one lantern at a time." },
	{ id: 2,  title: "Roots: A Graphic Novel About Diaspora Identity",   creator: "Amara Diallo",       category: "Art",        goal: 8000,  raised: 11250, backers: 287, daysLeft: 3,  thumb: "linear-gradient(135deg,#1e1b4b,#7c3aed)", type: "kickstarter", tagline: "Stories that cross borders." },
	{ id: 3,  title: "Help Rebuild the Nakuru Youth Music Centre",       creator: "Nakuru Foundation",  category: "Community",  goal: 15000, raised: 6820,  backers: 194, daysLeft: 22, thumb: "linear-gradient(135deg,#451a03,#f59e0b)", type: "gofundme",   tagline: "Music changes lives. Help us rebuild." },
	{ id: 4,  title: "BrewBot — Home Brewing Automation Device",         creator: "James Okafor",       category: "Food",       goal: 40000, raised: 38100, backers: 763, daysLeft: 6,  thumb: "linear-gradient(135deg,#1c1917,#ef4444)", type: "kickstarter", tagline: "Craft beer, perfectly automated." },
	{ id: 5,  title: "Medical Fund for Maya Rodriguez",                  creator: "Rodriguez Family",   category: "Medical",    goal: 30000, raised: 22500, backers: 891, daysLeft: 45, thumb: "linear-gradient(135deg,#0c1a2e,#2563eb)", type: "gofundme",   tagline: "Help Maya get the treatment she needs." },
	{ id: 6,  title: "Aurelia — Minimal Mechanical Keyboard",            creator: "Studio Aurelia",     category: "Technology", goal: 60000, raised: 71200, backers: 1204,daysLeft: 9,  thumb: "linear-gradient(135deg,#0f172a,#06b6d4)", type: "kickstarter", tagline: "Type beautifully." },
];

function RaiseProjectPage({ project, onBack, onDonate }) {
	const { isMobile } = useViewport();
	const loading = usePageLoad(150);
	const [amount, setAmount] = useState("");
	const [custom, setCustom] = useState(false);
	const [refCode, setRefCode] = useState("");
	const [donated, setDonated] = useState(false);
	const [payError, setPayError] = useState(null);
	const [tiers, setTiers] = useState([]);
	const [selectedTierId, setSelectedTierId] = useState(null);
	const [updates, setUpdates] = useState([]);
	const stripe = useStripe();
	const elements = useElements();
	const isReal = project.isReal === true;
	const presets = project.type === "gofundme" ? [10, 25, 50, 100] : [25, 50, 100, 250];

	// Load reward tiers + the updates feed for real campaigns.
	useEffect(() => {
		if (!isReal) return;
		getRewardTiers(project.id).then(rows => setTiers(Array.isArray(rows) ? rows : [])).catch(() => {});
		getCampaignUpdates(project.id).then(rows => setUpdates(Array.isArray(rows) ? rows : [])).catch(() => {});
	}, [isReal, project.id]);

	const selectedTier = tiers.find(t => t.tier_id === selectedTierId) || null;
	function pickTier(t) {
		const soldOut = t.quantity_limit != null && t.claimed_count >= t.quantity_limit;
		if (soldOut) return;
		setSelectedTierId(t.tier_id);
		setCustom(false);
		setAmount(String(t.amount));
	}
	function pickAmount(v) { setSelectedTierId(null); setCustom(false); setAmount(String(v)); }

	// Charge the card first, then record the donation tied to that PaymentIntent.
	// Only real campaigns (real project_id) are donatable — never charge a card
	// against a demo campaign that has no backing row.
	async function handleDonate() {
		if (!amount || donated) return;
		if (!isReal) { setPayError(i18n.t("raise.demoCampaignMessage")); return; }
		if (!isAuthenticated()) { setPayError("Please log in to donate."); return; }
		// A chosen tier sets a pledge floor — don't let the amount drop below it.
		if (selectedTier && parseFloat(amount) < Number(selectedTier.amount)) {
			setPayError(i18n.t("raise.tierMinPledge", { amount: Number(selectedTier.amount).toLocaleString(), defaultValue: `Pledge at least $${Number(selectedTier.amount).toLocaleString()} for this reward.` }));
			return;
		}
		setPayError(null);
		setDonated(true);
		let paymentIntentId = null;
		try {
			if (stripe && elements) {
				// Amount in dollars (major units) — backend converts to cents for Stripe.
				const { clientSecret, paymentIntentId: piId } = await createStripeIntent(parseFloat(amount), { purpose: 'donation', vertical: 'raise' });
				// This form renders <CardInput/>, which mounts Stripe's SPLIT fields
				// (CardNumberElement/Expiry/Cvc) — not the combined CardElement other pages use.
				// getElement must be asked for the element that is actually mounted.
				const card = elements.getElement(CardNumberElement);
				if (!card) {
					setPayError(i18n.t("raise.cardNotReady", { defaultValue: "Card details are not ready. Please re-enter your card." }));
					setDonated(false);
					return;
				}
				const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
				if (result.error) { setPayError(result.error.message); setDonated(false); return; }
				paymentIntentId = result.paymentIntent?.id ?? piId ?? null;
			}
			await createDonation({
				project_id: project.id,
				amount: parseFloat(amount),
				payment_intent_id: paymentIntentId,
				reward_tier_id: selectedTierId,
				referral_code: refCode || null,
			});
			onDonate({ amount, refCode });
		} catch (err) {
			setPayError(paymentIntentId
				? "Your payment went through, but we couldn't record the donation. Our team has been notified and will confirm or refund it shortly."
				: "Could not process your donation. Please try again.");
			setDonated(false);
		}
	}
	const pct = Math.min(100, Math.round((project.raised / project.goal) * 100));

	if (loading) return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden" }}>
			<div style={{ flex: 1, overflowY: "auto", padding: "32px 40px 32px 0" }}>
				<Skel w={140} h={16} r={6} style={{ marginBottom: 28 }} />
				<div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
					<div style={{ flex: 2, minWidth: 280 }}>
						<Skel w="100%" h={0} r={18} style={{ paddingBottom: "50%", marginBottom: 24 }} />
						<Skel w={80} h={22} r={6} style={{ marginBottom: 12 }} />
						<Skel w="80%" h={30} r={8} style={{ marginBottom: 10 }} />
						<Skel w="40%" h={14} r={6} style={{ marginBottom: 20 }} />
						<Skel w="100%" h={100} r={8} />
					</div>
					<div style={{ flex: 1, minWidth: 260, maxWidth: 340 }}>
						<Skel w="100%" h={320} r={18} />
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingTop: 32, paddingBottom: 24 }}>
			<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>{i18n.t("raise.backToRaise")}</button>
			<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 40 }}>
				{/* Left */}
				<div style={{ flex: 2, minWidth: 0 }}>
					<div style={{ width: "100%", paddingBottom: "50%", position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 24 }}>
						{/* #0f1117 is a cover-photo letterbox backdrop (shows while the image loads/if it doesn't
						    fill the box) — stays dark in both themes intentionally, same as photo/video scrims elsewhere. */}
						<div style={{ position: "absolute", inset: 0, background: project.coverUrl ? `#0f1117 url("${project.coverUrl}") center/cover no-repeat` : project.thumb }} />
						<div style={{ position: "absolute", top: 14, left: 14, background: project.type === "kickstarter" ? "rgba(5,150,105,0.85)" : "rgba(37,99,235,0.85)", borderRadius: 6, padding: "4px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#fff" }}>
							{project.type === "kickstarter" ? i18n.t("raise.campaign") : i18n.t("raise.fundraiser")}
						</div>
					</div>
					<span className="bg-surface-raised border border-border text-text-secondary" style={{ display: "inline-block", borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{project.category}</span>
					<h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 8, lineHeight: 1.2 }}>{project.title}</h1>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 20 }}>{i18n.t("raise.byCreator", { creator: project.creator })}</p>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, lineHeight: 1.75, marginBottom: 0 }}>
						{project.tagline} {i18n.t("raise.campaignStory")}
						<br /><br />
						{i18n.t("raise.campaignStoryFollowUp")}
					</p>
					{/* Updates feed */}
					{updates.length > 0 && (
						<div style={{ marginTop: 36 }}>
							<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 16 }}>{i18n.t("raise.updates", { defaultValue: "Updates" })} <span className="text-text-muted">{updates.length}</span></h2>
							<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
								{updates.map(u => (
									<div key={u.update_id} className="bg-surface border border-border" style={{ borderRadius: 14, padding: "16px 18px" }}>
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
											{u.title && <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, margin: 0 }}>{u.title}</p>}
											<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, flexShrink: 0, marginLeft: "auto" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}</span>
										</div>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{u.body}</p>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
				{/* Right — pledge card */}
				<div style={{ flex: 1, minWidth: 0, maxWidth: isMobile ? "none" : 340 }}>
					<div className="bg-surface border border-border" style={{ borderRadius: 18, padding: "24px" }}>
						<p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 2 }}>${project.raised.toLocaleString()}</p>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 14 }}>{i18n.t("raise.raisedOfGoal", { goal: project.goal.toLocaleString() })}</p>
						{/* Progress bar */}
						<div className="bg-surface-raised" style={{ height: 6, borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
							<div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: pct >= 100 ? "#059669" : "#2563eb", transition: "width 0.4s ease" }} />
						</div>
						<div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
							<div><p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18 }}>{project.backers.toLocaleString()}</p><p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("raise.backers")}</p></div>
							<div><p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, color: project.daysLeft <= 7 ? "#ef4444" : "var(--color-text-primary)" }}>{project.daysLeft}</p><p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("raise.daysLeft")}</p></div>
							<div><p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18 }}>{pct}%</p><p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("raise.fundedLabel")}</p></div>
						</div>
						{/* Reward tiers */}
						{tiers.length > 0 && (
							<div style={{ marginBottom: 16 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{i18n.t("raise.chooseReward", { defaultValue: "Choose a reward" })}</p>
								<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
									{tiers.map(t => {
										const soldOut = t.quantity_limit != null && t.claimed_count >= t.quantity_limit;
										const left = t.quantity_limit != null ? Math.max(0, t.quantity_limit - t.claimed_count) : null;
										const active = selectedTierId === t.tier_id;
										return (
											<button key={t.tier_id} onClick={() => pickTier(t)} disabled={soldOut}
												style={{ textAlign: "left", background: active ? "rgba(37,99,235,0.14)" : "var(--color-surface)", border: `1px solid ${active ? "#2563eb" : "var(--color-border)"}`, borderRadius: 12, padding: "12px 14px", cursor: soldOut ? "not-allowed" : "pointer", opacity: soldOut ? 0.5 : 1, transition: "all 0.15s" }}>
												<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: t.reward_description ? 6 : 0 }}>
													<span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{t.title || i18n.t("raise.reward", { defaultValue: "Reward" })}</span>
													<span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, color: "#60a5fa", flexShrink: 0 }}>${Number(t.amount).toLocaleString()}+</span>
												</div>
												{t.reward_description && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, margin: 0 }}>{t.reward_description}</p>}
												{t.quantity_limit != null && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: soldOut ? "#ef4444" : "var(--color-text-muted)", marginTop: 6, marginBottom: 0 }}>{soldOut ? i18n.t("raise.tierSoldOut", { defaultValue: "Sold out" }) : i18n.t("raise.tierLeft", { count: left, defaultValue: `${left} of ${t.quantity_limit} left` })}</p>}
											</button>
										);
									})}
								</div>
							</div>
						)}
						{/* Amount presets */}
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{tiers.length > 0 ? i18n.t("raise.orPledgeAmount", { defaultValue: "Or pledge any amount" }) : (project.type === "gofundme" ? i18n.t("raise.donate") : i18n.t("raise.backProject"))}</p>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
							{presets.map(p => (
								<button key={p} onClick={() => pickAmount(p)}
									style={{ background: amount === String(p) && !custom && !selectedTierId ? "#2563eb" : "var(--color-surface-raised)", border: `1px solid ${amount === String(p) && !custom && !selectedTierId ? "#2563eb" : "var(--color-border)"}`, borderRadius: 10, padding: "10px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: amount === String(p) && !custom && !selectedTierId ? "#fff" : "var(--color-text-primary)", cursor: "pointer", transition: "all 0.15s" }}>
									${p}
								</button>
							))}
						</div>
						<input value={custom ? amount : ""} onFocus={() => { setCustom(true); setSelectedTierId(null); }} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))}
							placeholder={i18n.t("raise.customAmount")}
							className="text-text-primary"
							style={{ width: "100%", boxSizing: "border-box", background: custom ? "rgba(37,99,235,0.1)" : "var(--color-surface)", border: `1px solid ${custom ? "rgba(37,99,235,0.4)" : "var(--color-border)"}`, borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", marginBottom: 14 }} />
						{/* Referral code */}
						<input value={refCode} onChange={e => setRefCode(e.target.value)} placeholder={i18n.t("raise.referralPlaceholder")}
							className="bg-surface border border-border text-text-primary"
							style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", marginBottom: 14 }} />
						{/* Card */}
						{isReal && (
							<div style={{ marginBottom: 14 }}>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{i18n.t("common.cardDetails")}</p>
								<CardInput />
							</div>
						)}
						{!isReal && (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{i18n.t("raise.demoCampaignMessage")}</p>
						)}
						{payError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", marginBottom: 10 }}>{payError}</p>}
						<button onClick={handleDonate} disabled={donated || !isReal}
							style={{ width: "100%", background: donated ? "#059669" : isReal ? "#2563eb" : "rgba(37,99,235,0.35)", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: donated || !isReal ? "default" : "pointer", transition: "background 0.2s" }}>
							{donated ? i18n.t("raise.processing") : amount ? (project.type === "gofundme" ? i18n.t("raise.donateAmount", { amount }) : i18n.t("raise.backAmount", { amount })) : (project.type === "gofundme" ? i18n.t("raise.donate") : i18n.t("raise.backProject"))}
						</button>
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}

function RaiseConfirmPage({ project, amount, onDone }) {
	const refCode = getUser()?.ref_code ?? null;
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
			<div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, fontSize: 32 }}>✓</div>
			<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, marginBottom: 10 }}>{project.type === "gofundme" ? i18n.t("raise.donationReceived") : i18n.t("raise.youreBacker")}</h2>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 6 }}>{i18n.t("raise.thankYouSupporting")} <span className="text-text-primary" style={{ fontWeight: 600 }}>{project.title}</span></p>
			<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28 }}>{i18n.t("raise.receiptSent", { amount })}</p>
			{refCode && (
				<div style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: 12, padding: "16px 24px", marginBottom: 28 }}>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 6 }}>{i18n.t("raise.referralShare")}</p>
					<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: "#60a5fa", letterSpacing: "0.1em" }}>{refCode}</p>
				</div>
			)}
			<button onClick={onDone} style={{ background: "#2563eb", border: "none", borderRadius: 12, padding: "12px 32px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: "pointer" }}>{i18n.t("common.done")}</button>
		</div>
	);
}

// Shared input styling for the creator management panels.
const CREATOR_INPUT = { width: "100%", boxSizing: "border-box", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-primary)", outline: "none" };
const PANEL_STYLE = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 16, padding: "20px 22px", marginTop: 20 };
const PANEL_TITLE = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, color: "var(--color-text-primary)", marginBottom: 4 };
const PANEL_SUB = { fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 };

// Reward-tier manager — define the pledge tiers backers can choose on the campaign page.
function TierManager({ projectId }) {
	const [tiers, setTiers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [form, setForm] = useState({ title: "", amount: "", reward_description: "", quantity_limit: "" });
	const [editId, setEditId] = useState(null);
	const [saving, setSaving] = useState(false);
	const [err, setErr] = useState(null);
	const [dialog, { confirm }] = useDialog();

	async function refresh() {
		setLoading(true);
		try { const rows = await getRewardTiers(projectId); setTiers(Array.isArray(rows) ? rows : []); } catch { /* keep list */ }
		setLoading(false);
	}
	useEffect(() => { refresh(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

	function resetForm() { setEditId(null); setForm({ title: "", amount: "", reward_description: "", quantity_limit: "" }); setErr(null); }
	function startEdit(t) { setEditId(t.tier_id); setForm({ title: t.title || "", amount: String(Number(t.amount) || ""), reward_description: t.reward_description || "", quantity_limit: t.quantity_limit != null ? String(t.quantity_limit) : "" }); setErr(null); }

	async function save() {
		setErr(null);
		const amount = parseFloat(form.amount);
		if (!amount || amount <= 0) { setErr(i18n.t("raise.tierAmountRequired", { defaultValue: "Set a pledge amount greater than 0." })); return; }
		setSaving(true);
		const payload = {
			project_id: projectId,
			title: form.title.trim() || null,
			amount,
			reward_description: form.reward_description.trim() || null,
			quantity_limit: form.quantity_limit === "" ? null : Math.max(0, parseInt(form.quantity_limit, 10) || 0),
		};
		try {
			if (editId) await updateRewardTier(editId, payload);
			else await createRewardTier(payload);
			resetForm();
			await refresh();
		} catch { setErr(i18n.t("raise.tierSaveFailed", { defaultValue: "Could not save the reward. Try again." })); }
		setSaving(false);
	}

	async function remove(t) {
		const ok = await confirm({ title: i18n.t("raise.deleteTier", { defaultValue: "Delete reward?" }), message: i18n.t("raise.deleteTierMsg", { defaultValue: "Backers will no longer be able to choose this reward." }), confirmLabel: i18n.t("common.delete", { defaultValue: "Delete" }) });
		if (!ok) return;
		try { await deleteRewardTier(t.tier_id); if (editId === t.tier_id) resetForm(); await refresh(); } catch { /* ignore */ }
	}

	return (
		<div style={PANEL_STYLE}>
			{dialog}
			<h3 style={PANEL_TITLE}>{i18n.t("raise.rewardTiers", { defaultValue: "Reward tiers" })}</h3>
			<p style={PANEL_SUB}>{i18n.t("raise.rewardTiersSub", { defaultValue: "Offer backers a reward for pledging at set amounts." })}</p>
			{loading ? <Skel h={60} r={12} /> : tiers.length > 0 && (
				<div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
					{tiers.map(t => (
						<div key={t.tier_id} className="bg-surface border border-border" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderRadius: 12, padding: "12px 14px" }}>
							<div style={{ minWidth: 0 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: 0 }}>{t.title || i18n.t("raise.reward", { defaultValue: "Reward" })} · <span style={{ color: "#60a5fa" }}>${Number(t.amount).toLocaleString()}+</span></p>
								{t.reward_description && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.reward_description}</p>}
								<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "3px 0 0" }}>{t.quantity_limit != null ? i18n.t("raise.tierClaimedOf", { claimed: t.claimed_count, limit: t.quantity_limit, defaultValue: `${t.claimed_count} of ${t.quantity_limit} claimed` }) : i18n.t("raise.tierClaimed", { count: t.claimed_count, defaultValue: `${t.claimed_count} claimed` })}</p>
							</div>
							<div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
								<button onClick={() => startEdit(t)} className="bg-surface-raised border border-border text-text-secondary" style={{ borderRadius: 8, padding: "6px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer" }}>{i18n.t("common.edit", { defaultValue: "Edit" })}</button>
								<button onClick={() => remove(t)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "6px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", cursor: "pointer" }}>{i18n.t("common.delete", { defaultValue: "Delete" })}</button>
							</div>
						</div>
					))}
				</div>
			)}
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={i18n.t("raise.tierTitlePlaceholder", { defaultValue: "Reward name (e.g. Early Bird)" })} style={{ ...CREATOR_INPUT, flex: 2, minWidth: 160 }} maxLength={80} />
					<input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") }))} inputMode="decimal" placeholder={i18n.t("raise.tierAmountPlaceholder", { defaultValue: "Amount $" })} style={{ ...CREATOR_INPUT, flex: 1, minWidth: 90 }} />
					<input value={form.quantity_limit} onChange={e => setForm(f => ({ ...f, quantity_limit: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder={i18n.t("raise.tierLimitPlaceholder", { defaultValue: "Limit (optional)" })} style={{ ...CREATOR_INPUT, flex: 1, minWidth: 110 }} />
				</div>
				<textarea value={form.reward_description} onChange={e => setForm(f => ({ ...f, reward_description: e.target.value }))} placeholder={i18n.t("raise.tierDescPlaceholder", { defaultValue: "What does the backer receive?" })} rows={2} style={{ ...CREATOR_INPUT, resize: "vertical", lineHeight: 1.5 }} maxLength={400} />
				{err && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", margin: 0 }}>{err}</p>}
				<div style={{ display: "flex", gap: 8 }}>
					<button onClick={save} disabled={saving} style={{ background: saving ? "rgba(37,99,235,0.4)" : "#2563eb", border: "none", borderRadius: 10, padding: "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: saving ? "default" : "pointer" }}>{editId ? i18n.t("raise.saveReward", { defaultValue: "Save reward" }) : i18n.t("raise.addReward", { defaultValue: "Add reward" })}</button>
					{editId && <button onClick={resetForm} className="bg-surface-raised border border-border text-text-secondary" style={{ borderRadius: 10, padding: "9px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{i18n.t("common.cancel", { defaultValue: "Cancel" })}</button>}
				</div>
			</div>
		</div>
	);
}

// Updates feed manager — post progress updates backers see on the campaign page.
function UpdatesManager({ projectId }) {
	const [updates, setUpdates] = useState([]);
	const [loading, setLoading] = useState(true);
	const [form, setForm] = useState({ title: "", body: "" });
	const [saving, setSaving] = useState(false);
	const [err, setErr] = useState(null);
	const [dialog, { confirm }] = useDialog();

	async function refresh() {
		setLoading(true);
		try { const rows = await getCampaignUpdates(projectId); setUpdates(Array.isArray(rows) ? rows : []); } catch { /* keep */ }
		setLoading(false);
	}
	useEffect(() => { refresh(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

	async function post() {
		setErr(null);
		if (!form.body.trim()) { setErr(i18n.t("raise.updateBodyRequired", { defaultValue: "Write an update before posting." })); return; }
		setSaving(true);
		try { await createCampaignUpdate({ project_id: projectId, title: form.title.trim() || null, body: form.body.trim() }); setForm({ title: "", body: "" }); await refresh(); }
		catch { setErr(i18n.t("raise.updatePostFailed", { defaultValue: "Could not post the update. Try again." })); }
		setSaving(false);
	}
	async function remove(u) {
		const ok = await confirm({ title: i18n.t("raise.deleteUpdate", { defaultValue: "Delete update?" }), message: i18n.t("raise.deleteUpdateMsg", { defaultValue: "This update will be removed from the campaign page." }), confirmLabel: i18n.t("common.delete", { defaultValue: "Delete" }) });
		if (!ok) return;
		try { await deleteCampaignUpdate(u.update_id); await refresh(); } catch { /* ignore */ }
	}

	return (
		<div style={PANEL_STYLE}>
			{dialog}
			<h3 style={PANEL_TITLE}>{i18n.t("raise.updates", { defaultValue: "Updates" })}</h3>
			<p style={PANEL_SUB}>{i18n.t("raise.updatesSub", { defaultValue: "Keep backers in the loop on your progress." })}</p>
			<div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: updates.length ? 18 : 0 }}>
				<input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={i18n.t("raise.updateTitlePlaceholder", { defaultValue: "Update title (optional)" })} style={CREATOR_INPUT} maxLength={120} />
				<textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder={i18n.t("raise.updateBodyPlaceholder", { defaultValue: "Share your latest news…" })} rows={3} style={{ ...CREATOR_INPUT, resize: "vertical", lineHeight: 1.5 }} maxLength={4000} />
				{err && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", margin: 0 }}>{err}</p>}
				<button onClick={post} disabled={saving} style={{ alignSelf: "flex-start", background: saving ? "rgba(37,99,235,0.4)" : "#2563eb", border: "none", borderRadius: 10, padding: "9px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", cursor: saving ? "default" : "pointer" }}>{i18n.t("raise.postUpdate", { defaultValue: "Post update" })}</button>
			</div>
			{loading ? <Skel h={48} r={12} /> : updates.map(u => (
				<div key={u.update_id} style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 14, marginTop: 14 }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: 0 }}>{u.title || i18n.t("raise.update", { defaultValue: "Update" })}</p>
						<button onClick={() => remove(u)} style={{ background: "none", border: "none", color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer", padding: 0, flexShrink: 0 }}>{i18n.t("common.delete", { defaultValue: "Delete" })}</button>
					</div>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{u.body}</p>
					<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "6px 0 0" }}>{u.created_at ? new Date(u.created_at).toLocaleString() : ""}</p>
				</div>
			))}
		</div>
	);
}

// Payout panel — withdraw a campaign's raised funds (net of platform fee) to the wallet.
function PayoutPanel({ projectId }) {
	const [summary, setSummary] = useState(null);
	const [history, setHistory] = useState([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState(null);
	const [err, setErr] = useState(null);
	const [dialog, { confirm }] = useDialog();

	async function refresh() {
		setLoading(true);
		try {
			const [s, h] = await Promise.all([getPayoutSummary(projectId), getPayouts(projectId)]);
			setSummary(s); setHistory(Array.isArray(h) ? h : []);
		} catch { setErr(i18n.t("raise.payoutLoadFailed", { defaultValue: "Could not load payout details." })); }
		setLoading(false);
	}
	useEffect(() => { refresh(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

	async function withdraw() {
		if (!summary || !(summary.available > 0)) return;
		const feePct = Math.round((summary.fee_pct || 0) * 100);
		const ok = await confirm({
			title: i18n.t("raise.withdrawTitle", { defaultValue: "Withdraw funds?" }),
			message: i18n.t("raise.withdrawMsg", { gross: summary.available.toLocaleString(), fee: summary.fee_estimate.toLocaleString(), net: summary.net_estimate.toLocaleString(), pct: feePct, defaultValue: `Withdraw $${summary.available.toLocaleString()} to your wallet. After the ${feePct}% platform fee ($${summary.fee_estimate.toLocaleString()}), you'll receive $${summary.net_estimate.toLocaleString()}.` }),
			confirmLabel: i18n.t("raise.withdraw", { defaultValue: "Withdraw" }),
			danger: false,
		});
		if (!ok) return;
		setBusy(true); setErr(null); setMsg(null);
		try { const r = await withdrawCampaign(projectId); setMsg(r?.message || i18n.t("raise.withdrawDone", { defaultValue: "Funds sent to your wallet." })); await refresh(); }
		catch (e) { setErr(e?.response?.data?.error || i18n.t("raise.withdrawFailed", { defaultValue: "Withdrawal failed. Try again." })); }
		setBusy(false);
	}

	const feePct = summary ? Math.round((summary.fee_pct || 0) * 100) : 5;
	return (
		<div style={PANEL_STYLE}>
			{dialog}
			<h3 style={PANEL_TITLE}>{i18n.t("raise.payouts", { defaultValue: "Payouts" })}</h3>
			<p style={PANEL_SUB}>{i18n.t("raise.payoutsSub", { pct: feePct, defaultValue: `Request a payout review for your raised funds. Strug keeps a ${feePct}% platform fee.` })}</p>
			{loading ? <Skel h={80} r={12} /> : summary && (
				<>
					<div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
						{[
							{ label: i18n.t("raise.raised", { defaultValue: "Raised" }), val: summary.raised },
							{ label: i18n.t("raise.withdrawn", { defaultValue: "Withdrawn" }), val: summary.withdrawn },
							{ label: i18n.t("raise.pendingReview", { defaultValue: "Pending review" }), val: summary.pending_review || 0 },
							{ label: i18n.t("raise.reserve", { defaultValue: "Reserve" }), val: summary.reserved || 0 },
							{ label: i18n.t("raise.available", { defaultValue: "Available" }), val: summary.available, accent: true },
						].map(s => (
							<div key={s.label} className="bg-surface" style={{ flex: 1, minWidth: 92, border: `1px solid ${s.accent ? "rgba(37,99,235,0.35)" : "var(--color-border)"}`, borderRadius: 12, padding: "12px 14px" }}>
								<p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, color: s.accent ? "#60a5fa" : "var(--color-text-primary)", margin: 0 }}>${Number(s.val).toLocaleString()}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "2px 0 0" }}>{s.label}</p>
							</div>
						))}
					</div>
					{msg && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#34d399", margin: "0 0 12px" }}>{msg}</p>}
					{err && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#ef4444", margin: "0 0 12px" }}>{err}</p>}
					<button onClick={withdraw} disabled={busy || !(summary.available > 0)} style={{ background: !(summary.available > 0) ? "rgba(37,99,235,0.3)" : busy ? "rgba(37,99,235,0.4)" : "#2563eb", border: "none", borderRadius: 10, padding: "11px 22px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", cursor: busy || !(summary.available > 0) ? "default" : "pointer" }}>
						{busy ? i18n.t("raise.processing", { defaultValue: "Processing…" }) : summary.available > 0 ? i18n.t("raise.withdrawAmount", { amount: summary.net_estimate.toLocaleString(), defaultValue: `Request $${summary.net_estimate.toLocaleString()} payout review` }) : i18n.t("raise.nothingToWithdraw", { defaultValue: "Nothing to withdraw yet" })}
					</button>
					{history.length > 0 && (
						<div style={{ marginTop: 18 }}>
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{i18n.t("raise.payoutHistory", { defaultValue: "Payout history" })}</p>
							{history.map(p => (
								<div key={p.payout_id} className="text-text-secondary" style={{ display: "flex", justifyContent: "space-between", fontFamily: "'DM Sans', sans-serif", fontSize: 12, padding: "6px 0", borderTop: "1px solid var(--color-border-subtle)" }}>
									<span>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}</span>
									<span style={{ color: "#34d399" }}>+${Number(p.net_amount).toLocaleString()} <span className="text-text-muted">({i18n.t("raise.feeShort", { fee: Number(p.fee_amount).toLocaleString(), defaultValue: `fee $${Number(p.fee_amount).toLocaleString()}` })})</span></span>
								</div>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}

function BackerManager({ projectId }) {
	const [backers, setBackers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [err, setErr] = useState(null);
	const [savingId, setSavingId] = useState(null);

	async function refresh() {
		setLoading(true);
		setErr(null);
		try {
			const rows = await getCampaignBackers(projectId);
			setBackers(Array.isArray(rows) ? rows : []);
		} catch {
			setErr(i18n.t("raise.backersLoadFailed", { defaultValue: "Could not load backers." }));
		}
		setLoading(false);
	}
	useEffect(() => { refresh(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

	async function setStatus(row, fulfillment_status) {
		setSavingId(row.donation_id);
		try {
			await updateDonationFulfillment(row.donation_id, { fulfillment_status });
			await refresh();
		} catch {
			setErr(i18n.t("raise.fulfillmentSaveFailed", { defaultValue: "Could not update fulfillment." }));
		}
		setSavingId(null);
	}

	return (
		<div style={PANEL_STYLE}>
			<h3 style={PANEL_TITLE}>{i18n.t("raise.backerOps", { defaultValue: "Backers" })}</h3>
			<p style={PANEL_SUB}>{i18n.t("raise.backerOpsSub", { defaultValue: "Track donors, rewards, and fulfillment progress." })}</p>
			{err && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", margin: "0 0 10px" }}>{err}</p>}
			{loading ? <Skel h={60} r={12} /> : backers.length === 0 ? (
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0 }}>{i18n.t("raise.noBackersYet", { defaultValue: "No backers yet." })}</p>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
					{backers.map((b) => (
						<div key={b.donation_id} className="bg-surface border border-border" style={{ borderRadius: 12, padding: "12px 14px" }}>
							<div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
								<div>
									<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, margin: 0 }}>{b.user?.name || b.user?.username || `Backer #${b.donation_id}`}</p>
									<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "3px 0 0" }}>${Number(b.amount || 0).toLocaleString()} {b.reward_tier?.title ? `· ${b.reward_tier.title}` : ""}</p>
								</div>
								<span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{b.fulfillment_status || 'pending'}</span>
							</div>
							{b.shipping_address && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "0 0 8px" }}>{b.shipping_name || ''} {b.shipping_name ? '· ' : ''}{b.shipping_address}</p>}
							<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
								{['pending', 'in_progress', 'fulfilled'].map((status) => (
									<button
										key={status}
										onClick={() => setStatus(b, status)}
										disabled={savingId === b.donation_id}
										className="text-text-primary"
										style={{
											background: b.fulfillment_status === status ? "rgba(37,99,235,0.16)" : "var(--color-surface)",
											border: `1px solid ${b.fulfillment_status === status ? "#2563eb" : "var(--color-border)"}`,
											borderRadius: 8,
											padding: "6px 10px",
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 11,
											cursor: savingId === b.donation_id ? "default" : "pointer",
										}}
									>
										{status}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// Crowdfunding creator: create/edit campaigns and manage your own.
// Replaces the (mis-wired) Airbnb host dashboard that "Start a Campaign" used to open.
function RaiseCreatorPage({ onBack, initialProjectId = null, onManageProject = null }) {
	const { isMobile } = useViewport();
	const uid = useId();
	const [mine, setMine] = useState([]);
	const [loadingMine, setLoadingMine] = useState(true);
	const [editingId, setEditingId] = useState(null); // null = create new
	const [form, setForm] = useState({ title: "", description: "", goal: "", deadline: "", thumbIdx: 0, cover_url: "", category: "Community", campaign_type: "fundraiser", status: "draft" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	const [savedMsg, setSavedMsg] = useState(null);
	const [coverUploading, setCoverUploading] = useState(false);
	const coverInputRef = useRef(null);

	async function handleCoverChange(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		const preview = URL.createObjectURL(file);
		setForm(f => ({ ...f, cover_url: preview }));
		setCoverUploading(true);
		try {
			const res = await uploadImage(file);
			const url = res?.url ?? res?.data?.url;
			if (url) setForm(f => ({ ...f, cover_url: url }));
		} catch {
			setForm(f => ({ ...f, cover_url: "" }));
			setError(i18n.t("raise.coverUploadFailed", { defaultValue: "Could not upload that image. Please try another." }));
		}
		setCoverUploading(false);
		if (coverInputRef.current) coverInputRef.current.value = "";
	}

	// Ownership is enforced server-side: /projects/mine returns only the authenticated
	// creator's campaigns, so the client never learns ids it can't act on.
	async function refreshMine() {
		setLoadingMine(true);
		try {
			const rows = await getMyCampaigns();
			setMine(Array.isArray(rows) ? rows : []);
		} catch { /* leave list empty on failure */ }
		setLoadingMine(false);
	}
	useEffect(() => { refreshMine(); }, []);  
	useEffect(() => {
		if (!initialProjectId || !mine.length) return;
		const match = mine.find((p) => String(p.project_id) === String(initialProjectId));
		if (match) startEdit(match);
	}, [initialProjectId, mine]);

	function resetForm() { setEditingId(null); setForm({ title: "", description: "", goal: "", deadline: "", thumbIdx: 0, cover_url: "", category: "Community", campaign_type: "fundraiser", status: "draft" }); setError(null); }

	function startEdit(p) {
		setEditingId(p.project_id);
		setForm({
			title: p.title || p.project_name || "",
			description: p.description || "",
			goal: String(Number(p.expected_amount) || ""),
			deadline: p.deadline ? new Date(p.deadline).toISOString().slice(0, 10) : "",
			thumbIdx: 0,
			cover_url: p.cover_url || "",
			category: p.category || "Community",
			campaign_type: p.campaign_type || "fundraiser",
			status: p.status || "draft",
		});
		setError(null); setSavedMsg(null);
	}

	async function handleSave() {
		setError(null);
		if (!isAuthenticated()) { setError(i18n.t("raise.loginToCreate", { defaultValue: "Please log in to create a campaign." })); return; }
		if (!form.title.trim()) { setError(i18n.t("raise.titleRequired", { defaultValue: "Give your campaign a title." })); return; }
		const goal = parseFloat(form.goal);
		if (!goal || goal <= 0) { setError(i18n.t("raise.goalRequired", { defaultValue: "Set a funding goal greater than 0." })); return; }
		if (coverUploading) { setError(i18n.t("raise.coverStillUploading", { defaultValue: "Please wait for the cover photo to finish uploading." })); return; }
		setSaving(true);
		// Only editable fields are sent. owner_user_id, current_amount and posted_date are
		// owned by the server (owner from the auth token, funds from confirmed donations).
		const payload = {
			project_name: form.title.trim(),
			title: form.title.trim(),
			description: form.description.trim(),
			expected_amount: goal,
			deadline: form.deadline || undefined,
			cover_url: form.cover_url ? form.cover_url : (editingId ? null : undefined),
			category: form.category,
			campaign_type: form.campaign_type,
			status: form.status,
		};
		try {
			if (editingId) {
				await updateCampaign(editingId, payload);
				setSavedMsg(i18n.t("raise.campaignUpdated", { defaultValue: "Campaign updated." }));
			} else {
				await createCampaign(payload);
				setSavedMsg(i18n.t("raise.campaignCreated", { defaultValue: "Campaign created — it's now live for backers." }));
			}
			resetForm();
			await refreshMine();
		} catch {
			setError(i18n.t("raise.saveFailed", { defaultValue: "Could not save your campaign. Please try again." }));
		}
		setSaving(false);
	}

	const inputStyle = { width: "100%", boxSizing: "border-box", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "11px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-primary)", outline: "none" };
	const labelStyle = { fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 7, display: "block" };

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 980, margin: "0 auto", width: "100%", paddingTop: 32, paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("raise.backToRaise")}
				</button>
				<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 32 }}>
					{/* Create / edit form */}
					<div style={{ flex: 1, minWidth: 0 }}>
						<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 4 }}>{editingId ? i18n.t("raise.editCampaign", { defaultValue: "Edit Campaign" }) : i18n.t("raise.startCampaign")}</h2>
						<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 22 }}>{i18n.t("raise.creatorSubtitle", { defaultValue: "Tell backers your story and set a funding goal." })}</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
							<div>
								<label htmlFor={`${uid}-title`} style={labelStyle}>{i18n.t("raise.fieldTitle", { defaultValue: "Campaign title" })}</label>
								<input id={`${uid}-title`} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={i18n.t("raise.titlePlaceholder", { defaultValue: "e.g. Solar lanterns for off-grid villages" })} style={inputStyle} maxLength={120} />
							</div>
							<div>
								<label htmlFor={`${uid}-story`} style={labelStyle}>{i18n.t("raise.fieldStory", { defaultValue: "Story" })}</label>
								<textarea id={`${uid}-story`} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={i18n.t("raise.storyPlaceholder", { defaultValue: "What are you raising for, and why does it matter?" })} rows={5} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
							</div>
							<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
								<div style={{ flex: 1, minWidth: 130 }}>
									<label htmlFor={`${uid}-goal`} style={labelStyle}>{i18n.t("raise.fieldGoal", { defaultValue: "Funding goal ($)" })}</label>
									<input id={`${uid}-goal`} value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value.replace(/[^\d.]/g, "") }))} inputMode="decimal" placeholder="25000" style={inputStyle} />
								</div>
								<div style={{ flex: 1, minWidth: 130 }}>
									<label htmlFor={`${uid}-deadline`} style={labelStyle}>{i18n.t("raise.fieldDeadline", { defaultValue: "Deadline" })}</label>
									<input id={`${uid}-deadline`} type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={{ ...inputStyle, colorScheme: "dark" }} />
								</div>
							</div>
							<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
								<div style={{ flex: 1, minWidth: 150 }}>
									<label htmlFor={`${uid}-category`} style={labelStyle}>{i18n.t("pinboard.category", { defaultValue: "Category" })}</label>
									<select id={`${uid}-category`} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
										{RAISE_CATEGORY_DEFS.filter((c) => c.match != null).map((c) => (
											<option key={c.id} value={c.match}>{i18n.t(c.labelKey)}</option>
										))}
									</select>
								</div>
								<div style={{ flex: 1, minWidth: 150 }}>
									<label htmlFor={`${uid}-type`} style={labelStyle}>{i18n.t("raise.campaign", { defaultValue: "Campaign type" })}</label>
									<select id={`${uid}-type`} value={form.campaign_type} onChange={e => setForm(f => ({ ...f, campaign_type: e.target.value }))} style={inputStyle}>
										<option value="fundraiser">{i18n.t("raise.fundraiser")}</option>
										<option value="campaign">{i18n.t("raise.campaign")}</option>
									</select>
								</div>
								<div style={{ flex: 1, minWidth: 150 }}>
									<label htmlFor={`${uid}-status`} style={labelStyle}>{i18n.t("common.status", { defaultValue: "Status" })}</label>
									<select id={`${uid}-status`} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
										<option value="draft">{i18n.t("common.draft", { defaultValue: "Draft" })}</option>
										<option value="live">{i18n.t("common.publish", { defaultValue: "Publish" })}</option>
										<option value="paused">{i18n.t("common.pause", { defaultValue: "Paused" })}</option>
										<option value="completed">{i18n.t("common.complete", { defaultValue: "Completed" })}</option>
									</select>
								</div>
							</div>
							<div>
								<label htmlFor={`${uid}-cover`} style={labelStyle}>{i18n.t("raise.fieldCover", { defaultValue: "Cover photo" })}</label>
								<div className="border border-border" style={{ width: "100%", height: 150, borderRadius: 12, overflow: "hidden", background: form.cover_url ? `#0f1117 url("${form.cover_url}") center/cover no-repeat` : RAISE_THUMBS[form.thumbIdx] || RAISE_THUMBS[0], display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
									{!form.cover_url && <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{i18n.t("raise.coverHint", { defaultValue: "Upload a photo or pick a color below" })}</span>}
								</div>
								<input id={`${uid}-cover`} ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={handleCoverChange} />
								<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
									<button onClick={() => coverInputRef.current?.click()} disabled={coverUploading} className="bg-surface-raised border border-border text-text-primary" style={{ padding: "9px 18px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: coverUploading ? "default" : "pointer", opacity: coverUploading ? 0.6 : 1 }}>{coverUploading ? i18n.t("raise.coverUploading", { defaultValue: "Uploading…" }) : (form.cover_url ? i18n.t("raise.coverChange", { defaultValue: "Change photo" }) : i18n.t("raise.coverAdd", { defaultValue: "Upload photo" }))}</button>
									{form.cover_url && <button onClick={() => setForm(f => ({ ...f, cover_url: "" }))} disabled={coverUploading} style={{ padding: "9px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, color: "#ef4444", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: coverUploading ? "default" : "pointer", opacity: coverUploading ? 0.6 : 1 }}>{i18n.t("raise.coverRemove", { defaultValue: "Remove" })}</button>}
								</div>
								{!form.cover_url && (
									<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
										{RAISE_THUMBS.map((th, i) => (
											<button key={i} onClick={() => setForm(f => ({ ...f, thumbIdx: i }))} style={{ width: 56, height: 40, borderRadius: 8, background: th, border: form.thumbIdx === i ? "2px solid #60a5fa" : "2px solid transparent", cursor: "pointer", padding: 0 }} aria-label={`Cover ${i + 1}`} />
										))}
									</div>
								)}
							</div>
							{error && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#ef4444", margin: 0 }}>{error}</p>}
							{savedMsg && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#34d399", margin: 0 }}>{savedMsg}</p>}
							<div style={{ display: "flex", gap: 10 }}>
								<button onClick={handleSave} disabled={saving || coverUploading} style={{ flex: 1, background: (saving || coverUploading) ? "rgba(37,99,235,0.4)" : "#2563eb", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", cursor: (saving || coverUploading) ? "default" : "pointer" }}>
									{saving ? i18n.t("raise.saving", { defaultValue: "Saving…" }) : editingId ? i18n.t("raise.saveChanges", { defaultValue: "Save changes" }) : i18n.t("raise.launchCampaign", { defaultValue: "Launch campaign" })}
								</button>
								{editingId && <button onClick={resetForm} disabled={saving} className="bg-surface-raised border border-border text-text-secondary" style={{ borderRadius: 12, padding: "13px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{i18n.t("common.cancel", { defaultValue: "Cancel" })}</button>}
							</div>
						</div>
						{/* Deep-crowdfunding management — only for a saved campaign you're editing. */}
						{editingId && (
							<>
								<TierManager projectId={editingId} />
								<UpdatesManager projectId={editingId} />
								<BackerManager projectId={editingId} />
								<PayoutPanel projectId={editingId} />
							</>
						)}
					</div>
					{/* My campaigns */}
					<div style={{ width: isMobile ? "100%" : 340, flexShrink: 0 }}>
						<h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 14 }}>{i18n.t("raise.myCampaigns", { defaultValue: "My Campaigns" })}</h3>
						{loadingMine ? (
							<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[0, 1].map(i => <Skel key={i} h={84} r={12} />)}</div>
						) : mine.length === 0 ? (
							<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("raise.noCampaignsYet", { defaultValue: "You haven't launched a campaign yet." })}</p>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
								{mine.map(p => {
									const goal = Number(p.expected_amount) || 0;
									const raised = Number(p.current_amount) || 0;
									const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
									return (
										<button key={p.project_id} onClick={() => { startEdit(p); onManageProject?.(p.project_id); }} style={{ textAlign: "left", background: editingId === p.project_id ? "rgba(37,99,235,0.12)" : "var(--color-surface)", border: `1px solid ${editingId === p.project_id ? "rgba(37,99,235,0.4)" : "var(--color-border)"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer" }}>
											<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 8, lineHeight: 1.3 }}>{p.title || p.project_name || i18n.t("raise.untitled", { defaultValue: "Untitled" })}</p>
											<div className="bg-surface-raised" style={{ height: 4, borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
												<div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: pct >= 100 ? "#059669" : "#2563eb" }} />
											</div>
											<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>${raised.toLocaleString()} {i18n.t("raise.raised")} · {pct}% · {(p.status || "draft").toUpperCase()}</p>
										</button>
									);
								})}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function RaiseBackedPage({ onBack, onOpenProject }) {
	const { isMobile } = useViewport();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		if (!isAuthenticated()) { setRows([]); setLoading(false); return; }
		getMyDonations().then((data) => setRows(Array.isArray(data) ? data : [])).catch(() => setRows([])).finally(() => setLoading(false));
	}, []);

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 980, margin: "0 auto", width: "100%", paddingTop: 32, paddingBottom: 24 }}>
				<button onClick={onBack} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					{i18n.t("raise.backToRaise")}
				</button>
				<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 16 }}>{i18n.t("raise.backedCampaigns", { defaultValue: "Backed Campaigns" })}</h2>
				{loading ? (
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[0, 1, 2].map((i) => <Skel key={i} h={80} r={12} />)}</div>
				) : !isAuthenticated() ? (
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("raise.loginToCreate", { defaultValue: "Please log in to create a campaign." })}</p>
				) : rows.length === 0 ? (
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("raise.noBackedCampaigns", { defaultValue: "You have not backed any campaigns yet." })}</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
						{rows.map((row) => (
							<button key={row.donation_id} onClick={() => onOpenProject(row.projects)} className="bg-surface border border-border" style={{ textAlign: "left", borderRadius: 12, padding: "14px 16px", cursor: "pointer" }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0 }}>{row.projects?.title || row.projects?.project_name || `Campaign #${row.project_id}`}</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "6px 0 0" }}>${Number(row.amount || 0).toLocaleString()} · {(row.payment_status || 'unpaid').toUpperCase()} {row.reward_tier?.title ? `· ${row.reward_tier.title}` : ""}</p>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function RaisePage() {
	const { t, landingTitle, searchPlaceholder } = usePageI18n("raise");
	const categories = useI18nCategoryList(RAISE_CATEGORY_DEFS);
	const { isMobile } = useViewport();
	const loading = usePageLoad();
	const [activeCategory, setActiveCategory] = useState("all");
	const [query, setQuery] = useState("");
	const [typeFilter, setTypeFilter] = useState("all");
	const [raiseView, setRaiseView] = useState("grid");
	const [selectedProject, setSelectedProject] = useState(null);
	const [manageProjectId, setManageProjectId] = useState(null);
	const [donationInfo, setDonationInfo] = useState(null);
	const [campaigns, setCampaigns] = useState([]);
	const [loadError, setLoadError] = useState(false);
	const catScrollRef = useRef(null);
	const [catScrollState, setCatScrollState] = useState({ atStart: true, atEnd: true });

	useEffect(() => { window.dispatchEvent(new CustomEvent('strug:view-change')); }, [raiseView]);
	useLayoutEffect(() => {
		const el = catScrollRef.current;
		if (!el) return;
		const update = () => setCatScrollState(prev => { const atStart = el.scrollLeft <= 4, atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4; return prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }; });
		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
	}, [raiseView]);

	useEffect(() => {
		const handle = setTimeout(() => {
			const categoryMatch = categories.find((c) => c.id === activeCategory)?.match || undefined;
			const params = {
				q: query || undefined,
				category: categoryMatch,
				...(typeFilter === "all" ? {} : typeFilter === "ending_soon" ? { ending_soon: true } : { campaign_type: typeFilter }),
			};
			getCampaigns(params)
				.then((rows) => {
					const arr = Array.isArray(rows) ? rows : [];
					setCampaigns(arr.map((row, i) => mapRaiseCampaign(row, i, RAISE_THUMBS)));
					setLoadError(false);
				})
				.catch(() => {
					setCampaigns(import.meta.env.DEV ? RAISE_PROJECTS.map((p) => ({ ...p, isReal: false })) : []);
					setLoadError(true);
				});
		}, 220);
		return () => clearTimeout(handle);
	}, [query, activeCategory, typeFilter, categories]);

	useEffect(() => {
		const applyPath = () => {
			const parsed = parseRaisePath(window.location.pathname);
			if (parsed.view === 'create') { setRaiseView('create'); setManageProjectId(null); return; }
			if (parsed.view === 'backed') { setRaiseView('backed'); return; }
			if (parsed.view === 'manage') { setRaiseView('create'); setManageProjectId(parsed.id); return; }
			if (parsed.view === 'project' && parsed.id) {
				getCampaign(parsed.id).then((row) => {
					setSelectedProject(mapRaiseCampaign(row, 0, RAISE_THUMBS));
					setRaiseView('project');
				}).catch(() => {
					setRaiseView('grid');
					setSelectedProject(null);
				});
				return;
			}
			setRaiseView('grid');
			setSelectedProject(null);
			setManageProjectId(null);
		};
		applyPath();
		window.addEventListener('popstate', applyPath);
		return () => window.removeEventListener('popstate', applyPath);
	}, []);

	const filtered = useMemo(
		() => filterRaiseCampaigns(campaigns, { activeCategory, categories, query }, matchesCategory),
		[campaigns, activeCategory, categories, query],
	);

	function pushView(nextView, project = null, extra = {}) {
		if (extra.manageProjectId) setManageProjectId(extra.manageProjectId);
		if (project) setSelectedProject(project);
		setRaiseView(nextView);
		window.history.pushState({ nav: 'raise' }, '', raisePathForView(nextView, extra.manageProjectId ? { id: extra.manageProjectId } : project));
	}

	function openProject(project) {
		pushView('project', project);
	}

	if (raiseView === "project" && selectedProject) {
		return <RaiseProjectPage project={selectedProject} onBack={() => pushView("grid")} onDonate={info => { setDonationInfo(info); setRaiseView("confirm"); window.history.pushState({ nav: 'raise' }, '', raisePathForView('confirm', selectedProject)); }} />;
	}
	if (raiseView === "confirm" && selectedProject) {
		return <RaiseConfirmPage project={selectedProject} amount={donationInfo?.amount} onDone={() => { setDonationInfo(null); pushView("grid"); setSelectedProject(null); }} />;
	}
	if (raiseView === "create") return (
		<RaiseCreatorPage
			initialProjectId={manageProjectId}
			onBack={() => pushView("grid")}
			onManageProject={(id) => {
				setManageProjectId(id);
				window.history.pushState({ nav: 'raise' }, '', raisePathForView('manage', { id }));
			}}
		/>
	);
	if (raiseView === "backed") {
		return <RaiseBackedPage onBack={() => pushView("grid")} onOpenProject={(project) => openProject(mapRaiseCampaign(project, 0, RAISE_THUMBS))} />;
	}

	return (
		<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", padding: "32px 0 0" }}>
				<div style={{ textAlign: "center", marginBottom: 16 }}>
					<h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "0.03em", marginBottom: 4 }}>{landingTitle}</h2>
					<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 14 }}>{i18n.t("raise.subtitle")}</p>
					<div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
						<button onClick={() => { if (!isAuthenticated()) { window.location.href = import.meta.env.VITE_LOGIN_URL; return; } pushView("create"); }} style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#60a5fa", cursor: "pointer" }}>{t("raise.startCampaign")}</button>
						<button onClick={() => { if (!isAuthenticated()) { window.location.href = import.meta.env.VITE_LOGIN_URL; return; } pushView("backed"); }} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "10px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{i18n.t("raise.backedCampaigns", { defaultValue: "Backed campaigns" })}</button>
					</div>
				</div>
				<div style={{ width: "min(760px, 100%)", margin: "0 auto 14px" }}>
					{/* Search bar — translucent glass panel with backdrop blur floating over the page. */}
					<div className="bg-surface-glass" style={{ backdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "14px 18px", gap: 12, borderRadius: 14 }}>
						<div className="text-text-secondary" style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><SearchIcon s={20} /></div>
						<input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} className="text-text-primary" style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, fontFamily: "'DM Sans', sans-serif", caretColor: "#2563eb" }} />
						<select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-surface-raised border border-border text-text-primary" style={{ borderRadius: 10, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
							<option value="all">All</option>
							<option value="fundraiser">Fundraisers</option>
							<option value="campaign">Campaigns</option>
							<option value="ending_soon">Ending soon</option>
						</select>
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
						{categories.map((c, i) => <LeoButton key={c.id} cat={c} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)} delay={i * 30} />)}
					</div>
					<button onClick={() => catScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
						style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", marginTop: 16, background: catScrollState.atEnd ? "var(--color-surface)" : "#2563eb", border: `1px solid ${catScrollState.atEnd ? "var(--color-border-subtle)" : "transparent"}`, color: catScrollState.atEnd ? "var(--color-text-muted)" : "#fff", cursor: catScrollState.atEnd ? "default" : "pointer", visibility: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "hidden" : "visible", pointerEvents: (!isMobile && catScrollState.atStart && catScrollState.atEnd) ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: catScrollState.atEnd ? "none" : "0 2px 14px rgba(37,99,235,0.55)", transition: "transform 0.12s, background 0.2s" }}
						onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
				</div>
			</div>
			<div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
				{loading ? (
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
						{Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="bg-surface border border-border" style={{ borderRadius: 18, overflow: "hidden", animation: `fadeUp 0.3s ease ${i * 50}ms both` }}>
								<Skel h={180} r={0} />
								<div style={{ padding: 18 }}>
									<Skel w="85%" h={15} r={6} style={{ marginBottom: 8 }} />
									<Skel w="50%" h={12} r={5} style={{ marginBottom: 16 }} />
									<Skel h={6} r={3} style={{ marginBottom: 12 }} />
								</div>
							</div>
						))}
					</div>
				) : filtered.length === 0 ? (
					<div style={{ textAlign: "center", opacity: 0.6, padding: "40px 20px" }}>
						<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, marginBottom: 8 }}>
							{loadError ? i18n.t("raise.loadFailed", { defaultValue: "Couldn't load campaigns." }) : i18n.t("raise.noResults", { defaultValue: "No campaigns match these filters." })}
						</p>
						{loadError && <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Try again in a moment.</p>}
					</div>
				) : (
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
						{filtered.map((project, i) => {
							const pct = project.goal > 0 ? Math.min(100, Math.round((project.raised / project.goal) * 100)) : 0;
							return (
								<div key={project.id} onClick={() => openProject(project)}
									className="bg-surface border border-border"
									style={{ borderRadius: 18, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s", animation: `fadeUp 0.35s ease ${i * 50}ms both` }}
									onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
									onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "none"; }}>
									<div style={{ height: 160, background: project.coverUrl ? `#0f1117 url("${project.coverUrl}") center/cover no-repeat` : project.thumb, position: "relative" }}>
										<div style={{ position: "absolute", top: 12, left: 12, background: project.type === "kickstarter" ? "rgba(5,150,105,0.85)" : "rgba(37,99,235,0.85)", borderRadius: 6, padding: "3px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff" }}>
											{project.type === "kickstarter" ? i18n.t("raise.campaign") : i18n.t("raise.fundraiser")}
										</div>
										{pct >= 100 && <div style={{ position: "absolute", top: 12, right: 12, background: "#059669", borderRadius: 6, padding: "3px 9px", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: "#fff" }}>{i18n.t("raise.funded")}</div>}
									</div>
									<div style={{ padding: "16px 18px" }}>
										<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{project.title}</p>
										<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 12 }}>{i18n.t("raise.byCreator", { creator: project.creator })}</p>
										<div className="bg-surface-raised" style={{ height: 4, borderRadius: 2, marginBottom: 12, overflow: "hidden" }}>
											<div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: pct >= 100 ? "#059669" : "#2563eb" }} />
										</div>
										<div style={{ display: "flex", gap: 0, justifyContent: "space-between" }}>
											<div><p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>${project.raised.toLocaleString()}</p><p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("raise.raised")}</p></div>
											<div><p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>{project.backers.toLocaleString()}</p><p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("raise.backers")}</p></div>
											<div><p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: project.daysLeft <= 7 ? "#ef4444" : "var(--color-text-primary)" }}>{project.daysLeft}d</p><p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("raise.left")}</p></div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

export { RaisePage };
