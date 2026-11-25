import React, { useState, useEffect, useCallback } from "react";
import {
	getMyReferralCode,
	getReferralOverview,
	getReferralEarnings,
	applyReferralCode,
	claimFirstTouchRecruiter,
	getMyRecruiter,
	inviteToRecruit,
	getReceivedInvites,
	getSentInvites,
	acceptRecruitInvite,
	declineRecruitInvite,
	getMyRecruits,
	resendRecruitInvite,
} from "../api/referral";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { useViewport } from "../hooks/useViewport.js";
import { Skel } from "../components/skeletons.jsx";
import { getUser } from "../store/auth.js";
import { useTranslation } from "react-i18next";
import { jobsPageOuterStyle, jobsPageInnerStyle } from "../components/jobs/jobsLayout.js";

const ACCENT = "#2563eb";
const card = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 16, padding: "20px 22px" };
const h1 = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px,6vw,44px)", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0, lineHeight: 1.1 };
const label = { fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" };
// Disabled fill/text follow theme tokens (unlike the enabled state's fixed white-on-accent) —
// a fixed white label on the disabled fill would go invisible once that fill turns near-white in light mode.
const btn = (disabled, { block, compact, isMobile } = {}) => ({
	padding: compact ? "8px 14px" : isMobile ? "12px 18px" : "11px 18px",
	minHeight: compact ? 36 : isMobile ? 44 : undefined,
	width: block ? "100%" : undefined,
	flexShrink: 0,
	background: disabled ? "var(--color-border)" : ACCENT,
	border: "none",
	borderRadius: 12,
	color: disabled ? "var(--color-text-muted)" : "#fff",
	fontFamily: "'DM Sans', sans-serif",
	fontSize: compact ? 12 : 14,
	fontWeight: 700,
	cursor: disabled ? "not-allowed" : "pointer",
	boxSizing: "border-box",
});
const inputStyle = (isMobile) => ({
	flex: 1,
	minWidth: 0,
	width: isMobile ? "100%" : undefined,
	minHeight: isMobile ? 44 : undefined,
	background: "var(--color-surface)",
	border: "1px solid var(--color-border)",
	borderRadius: 10,
	padding: "11px 14px",
	color: "var(--color-text-primary)",
	fontFamily: "'DM Sans', sans-serif",
	fontSize: isMobile ? 16 : 14, // 16px avoids iOS zoom-on-focus
	outline: "none",
	boxSizing: "border-box",
});
const chip = (active, isMobile) => ({
	padding: isMobile ? "10px 16px" : "7px 12px",
	minHeight: isMobile ? 40 : undefined,
	flexShrink: 0,
	borderRadius: 999,
	border: active ? `1px solid ${ACCENT}` : "1px solid var(--color-border)",
	background: active ? ACCENT : "transparent",
	color: active ? "#fff" : "var(--color-text-secondary)",
	fontFamily: "'DM Sans', sans-serif",
	fontSize: 12,
	fontWeight: 700,
	cursor: "pointer",
	whiteSpace: "nowrap",
});

/** Same desktop shell as Jobs (sidebar padding + 1040px content column). */
function pageShell(isMobile) {
	const shell = jobsPageOuterStyle(isMobile);
	return {
		...shell,
		WebkitOverflowScrolling: "touch",
		overscrollBehavior: "contain",
		paddingBottom: isMobile
			? "calc(28px + env(safe-area-inset-bottom, 0px))"
			: shell.paddingBottom,
	};
}

function Stat({ value, label: lbl, isMobile }) {
	return (
		<div style={{ ...card, minWidth: 0, padding: isMobile ? "16px 16px" : "20px 22px" }}>
			<div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 26 : 30, lineHeight: 1 }}>{value}</div>
			<div style={{ ...label, marginTop: 6, fontSize: isMobile ? 11 : 12 }}>{lbl}</div>
		</div>
	);
}

const STATUS_COLOR = {
	accepted: "#4ade80",
	declined: "#f87171",
	expired: "#fbbf24",
	pending: "var(--color-text-secondary)",
};

const STATUS_LABEL = {
	accepted: "Accepted",
	declined: "Declined",
	expired: "Expired",
	pending: "Invited",
};

function RowForm({ isMobile, children }) {
	return (
		<div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row", flexWrap: isMobile ? "nowrap" : "wrap", alignItems: isMobile ? "stretch" : "center" }}>
			{children}
		</div>
	);
}

export default function RecruiterPage({ onNavigate }) {
	const { t } = useTranslation();
	const loading = usePageLoad(400);
	const { isMobile, isTablet } = useViewport();
	const goBack = () => { if (onNavigate) onNavigate("profile"); else if (typeof window !== "undefined") window.history.back(); };
	const [code, setCode] = useState(null);
	const [overview, setOverview] = useState(null);
	const [earnings, setEarnings] = useState(null);
	const [myRecruiter, setMyRecruiter] = useState(null);
	const [copied, setCopied] = useState(null); // 'link' | 'code' | 'user' | null
	const myUsername = String(getUser()?.username || "").trim().replace(/^@/, "");
	const [applyVal, setApplyVal] = useState("");
	const [applyBusy, setApplyBusy] = useState(false);
	const [applyMsg, setApplyMsg] = useState(null); // { ok, text }
	const [inviteVal, setInviteVal] = useState("");
	const [inviteBusy, setInviteBusy] = useState(false);
	const [inviteMsg, setInviteMsg] = useState(null); // { ok, text }
	const [sentInvites, setSentInvites] = useState([]);
	const [received, setReceived] = useState([]);
	const [invActBusy, setInvActBusy] = useState(null); // invite_id being accepted/declined/resent
	const [recruitsData, setRecruitsData] = useState(null);
	const [recruitFilter, setRecruitFilter] = useState("all"); // all | period | active

	const loadRecruits = useCallback(async (filter) => {
		try {
			const data = await getMyRecruits(filter, "28d");
			setRecruitsData(data);
		} catch {
			setRecruitsData({ recruits: [], summary: { total: 0, in_period: 0 } });
		}
	}, []);

	const load = useCallback(async () => {
		await claimFirstTouchRecruiter().catch(() => {});
		const [c, o, e, mine, sent, recv] = await Promise.allSettled([
			getMyReferralCode(), getReferralOverview("28d"), getReferralEarnings(), getMyRecruiter(), getSentInvites(), getReceivedInvites(),
		]);
		if (c.status === "fulfilled") setCode(c.value);
		if (o.status === "fulfilled") setOverview(o.value);
		if (e.status === "fulfilled") setEarnings(e.value);
		if (mine.status === "fulfilled") setMyRecruiter(mine.value);
		if (sent.status === "fulfilled") setSentInvites(sent.value || []);
		if (recv.status === "fulfilled") setReceived(recv.value || []);
	}, []);

	useEffect(() => { load(); }, [load]);

	useEffect(() => {
		loadRecruits(recruitFilter);
	}, [recruitFilter, loadRecruits]);

	// Discover the real scroll container once the skeleton is gone / lists fill in.
	useEffect(() => {
		if (typeof window === "undefined") return;
		window.dispatchEvent(new CustomEvent("strug:view-change"));
	}, [loading, recruitsData, sentInvites.length, received.length]);

	// After invite/apply actions, refresh both invites and recruits.
	const reloadAll = useCallback(async () => {
		await load();
		await loadRecruits(recruitFilter);
	}, [load, loadRecruits, recruitFilter]);

	const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	// Prefer API summary (Phase 0 mapping fix kept here so recruit count is honest).
	const totals = overview?.summary || overview?.totals || {};
	const recruitedCount = totals.referred_users ?? recruitsData?.summary?.total ?? code?.usage_count ?? 0;
	const lifetime = totals.lifetime_total ?? earnings?.total ?? 0;
	const pending = totals.pending_total ?? 0;
	const alreadyRecruited = (myRecruiter?.applied_codes || []).length > 0;
	const recruits = recruitsData?.recruits || [];
	const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

	// Prefer username in the share link when set: easier to say out loud than STRUG-….
	// Backend apply resolves either value to the same affiliate link.
	const inviteShareToken = () => myUsername || code?.ref_code || "";
	const inviteShareUrl = () => {
		const token = inviteShareToken();
		if (!token) return "";
		const origin = typeof window !== "undefined" ? window.location.origin : "https://app.strug.ca";
		return `${origin}/?ref=${encodeURIComponent(token)}`;
	};

	const flashCopied = (kind) => {
		setCopied(kind);
		setTimeout(() => setCopied(null), 1600);
	};

	const copyText = (text, kind) => {
		if (!text) return;
		try {
			navigator.clipboard?.writeText(text);
			flashCopied(kind);
		} catch { /* ignore */ }
	};

	const copyInviteLink = () => copyText(inviteShareUrl(), "link");
	const copyOfficialCode = () => copyText(code?.ref_code || "", "code");
	const copyUsername = () => copyText(myUsername, "user");

	const shareCode = async () => {
		const shareUrl = inviteShareUrl();
		if (!shareUrl) return;
		const shareLabel = myUsername || code?.ref_code || "";
		if (canShare) {
			try {
				await navigator.share({
					title: t("recruiterPage.shareTitle"),
					text: t("recruiterPage.shareText", { code: shareLabel }),
					url: shareUrl,
				});
				return;
			} catch { /* share cancelled */ }
		}
		copyInviteLink();
	};

	const submitApply = async () => {
		const v = applyVal.trim();
		if (!v || applyBusy) return;
		setApplyBusy(true); setApplyMsg(null);
		try {
			const res = await applyReferralCode(v);
			setApplyMsg({ ok: true, text: res?.message || "Affiliate added." });
			setApplyVal("");
			await reloadAll();
		} catch (err) {
			setApplyMsg({ ok: false, text: err?.response?.data?.message || "Couldn't apply that code." });
		} finally { setApplyBusy(false); }
	};

	const submitInvite = async () => {
		const v = inviteVal.trim().replace(/^@/, "");
		if (!v || inviteBusy) return;
		setInviteBusy(true); setInviteMsg(null);
		try {
			const res = await inviteToRecruit(v);
			setInviteMsg({ ok: true, text: res?.message || `Invite sent to @${v}.` });
			setInviteVal("");
			await reloadAll();
		} catch (err) {
			setInviteMsg({ ok: false, text: err?.response?.data?.message || "Couldn't send that invite." });
		} finally { setInviteBusy(false); }
	};

	const respondInvite = async (inviteId, accept) => {
		if (invActBusy) return;
		setInvActBusy(inviteId);
		try {
			await (accept ? acceptRecruitInvite(inviteId) : declineRecruitInvite(inviteId));
			await reloadAll();
		} catch { /* surfaced by list refresh */ } finally { setInvActBusy(null); }
	};

	const resendInvite = async (inviteId) => {
		if (invActBusy) return;
		setInvActBusy(inviteId);
		setInviteMsg(null);
		try {
			const res = await resendRecruitInvite(inviteId);
			setInviteMsg({ ok: true, text: res?.message || "Invite resent." });
			await reloadAll();
		} catch (err) {
			setInviteMsg({ ok: false, text: err?.response?.data?.message || "Couldn't resend that invite." });
		} finally { setInvActBusy(null); }
	};

	const inner = jobsPageInnerStyle(isMobile);
	const backBtn = {
		background: "none",
		border: "none",
		color: "var(--color-text-secondary)",
		cursor: "pointer",
		fontFamily: "'DM Sans', sans-serif",
		fontSize: 14,
		marginBottom: isMobile ? 12 : 18,
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		padding: isMobile ? "8px 4px 8px 0" : 0,
		minHeight: 44,
		marginLeft: -4,
	};

	if (loading) {
		return (
			<div className="scroll-area" style={pageShell(isMobile)}>
				<div style={inner}>
					<button onClick={goBack} style={backBtn} aria-label="Back to profile">← Back</button>
					<Skel w={220} h={40} r={8} />
					<div style={{ height: 20 }} />
					<Skel w="100%" h={120} r={16} />
					<div style={{ height: 16 }} />
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14 }}>
						{[0, 1, 2].map((i) => <Skel key={i} w="100%" h={90} r={16} />)}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="scroll-area" style={pageShell(isMobile)}>
			<div style={inner}>
				<button onClick={goBack} style={backBtn} aria-label="Back to profile">
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
					Back
				</button>
				<h1 style={h1}>{t("recruiterPage.title")}</h1>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 15, lineHeight: 1.55, margin: "10px 0 8px", maxWidth: 560 }}>
					{t("recruiterPage.intro")}
				</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 13 : 14, lineHeight: 1.55, margin: "0 0 24px", maxWidth: 560 }}>
					{t("recruiterPage.introSimple")}
				</p>

				{/* Incoming invites — someone wants to recruit YOU (only if not already recruited) */}
				{!alreadyRecruited && received.length > 0 && (
					// Gradient's 2nd stop is a fixed low-alpha white wash (not a token): at 5% alpha it barely
					// tints anything and reads correctly blended over either theme's surface as-is.
					<div style={{ ...card, marginBottom: 16, padding: isMobile ? "16px 16px" : "20px 22px", background: `linear-gradient(120deg, ${ACCENT}22, rgba(255,255,255,0.05))`, borderColor: `${ACCENT}55` }}>
						<div style={label}>Affiliate invites</div>
						<div className="text-text-secondary" style={{ fontSize: 13, margin: "8px 0 14px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
							{t("recruiterPage.incomingHint")}
						</div>
						{received.map((inv) => (
							<div key={inv.invite_id} style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: "1px solid var(--color-border-subtle)", flexDirection: isMobile ? "column" : "row" }}>
								<div className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
									<strong>{inv.user?.name || inv.user?.username || "Someone"}</strong>
									{inv.user?.username && <span className="text-text-secondary" style={{ marginLeft: 6 }}>@{inv.user.username}</span>}
									<span className="text-text-secondary"> wants you as their affiliate</span>
								</div>
								<div style={{ display: "flex", gap: 8, width: isMobile ? "100%" : undefined }}>
									<button onClick={() => respondInvite(inv.invite_id, true)} disabled={invActBusy === inv.invite_id} style={{ ...btn(invActBusy === inv.invite_id, { isMobile }), flex: isMobile ? 1 : undefined }}>
										{invActBusy === inv.invite_id ? "…" : "Accept"}
									</button>
									{/* Neutral secondary action — not disabled, so it needs its own token pairing (fixed white
									    text on this fill would go invisible once the fill turns near-white in light mode).
									    Spread base btn(false) also sets background/color (ACCENT / #fff) which this
									    literal override replaces — per the spread-conflict rule, left inline rather than
									    partially moved to className, since inline always wins and splitting the two
									    sources here would be misleading, not incorrect, but we keep it simple and safe. */}
									<button onClick={() => respondInvite(inv.invite_id, false)} disabled={invActBusy === inv.invite_id} style={{ ...btn(false, { isMobile }), flex: isMobile ? 1 : undefined, background: "var(--color-border)", color: "var(--color-text-primary)" }}>
										Decline
									</button>
								</div>
							</div>
						))}
					</div>
				)}

				{/* Your invite codes — same fixed 5% white gradient stop as the received-invites card above */}
				<div style={{ ...card, padding: isMobile ? "16px 16px" : "20px 22px", background: `linear-gradient(120deg, ${ACCENT}22, rgba(255,255,255,0.05))`, borderColor: `${ACCENT}55` }}>
					<div style={label}>{t("recruiterPage.yourInvite")}</div>
					<div className="text-text-secondary" style={{ fontSize: 13, margin: "8px 0 0", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
						{t("recruiterPage.shareHint")}
					</div>

					{myUsername ? (
						<div style={{ marginTop: 16 }}>
							<div style={{ ...label, textTransform: "none", letterSpacing: 0 }}>{t("recruiterPage.usernameLabel")}</div>
							<div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", gap: 12, marginTop: 8, flexDirection: isMobile ? "column" : "row" }}>
								<button
									type="button"
									onClick={copyUsername}
									aria-label={t("recruiterPage.copyUsername")}
									style={{
										fontFamily: "'Barlow Condensed', sans-serif",
										fontWeight: 800,
										fontSize: isMobile ? 28 : 32,
										letterSpacing: "0.04em",
										lineHeight: 1.2,
										background: "var(--color-surface)",
										border: "1px solid var(--color-border)",
										borderRadius: 12,
										padding: isMobile ? "12px 14px" : "8px 16px",
										color: "var(--color-text-primary)",
										cursor: "pointer",
										textAlign: "center",
										overflowWrap: "anywhere",
										minWidth: 0,
										flex: isMobile ? undefined : 1,
									}}
								>
									@{myUsername}
								</button>
								<button onClick={copyUsername} style={{ ...btn(false, { isMobile }), flex: isMobile ? 1 : undefined, width: isMobile ? "100%" : undefined }}>
									{copied === "user" ? t("recruiterPage.copied") : t("recruiterPage.copyUsername")}
								</button>
							</div>
							<div className="text-text-secondary" style={{ fontSize: 12, marginTop: 8, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.45 }}>
								{t("recruiterPage.usernameHint")}
							</div>
						</div>
					) : null}

					<div style={{ marginTop: 16 }}>
						<div style={{ ...label, textTransform: "none", letterSpacing: 0 }}>{t("recruiterPage.officialCodeLabel")}</div>
						<div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", gap: 12, marginTop: 8, flexDirection: isMobile ? "column" : "row" }}>
							<button
								type="button"
								onClick={copyOfficialCode}
								disabled={!code?.ref_code}
								aria-label={code?.ref_code ? t("recruiterPage.copyOfficialCode") : "Code unavailable"}
								style={{
									fontFamily: "'Barlow Condensed', sans-serif",
									fontWeight: 800,
									fontSize: isMobile ? 24 : 28,
									letterSpacing: isMobile ? "0.06em" : "0.1em",
									lineHeight: 1.2,
									background: "var(--color-surface)",
									border: "1px solid var(--color-border)",
									borderRadius: 12,
									padding: isMobile ? "12px 14px" : "8px 16px",
									color: "var(--color-text-primary)",
									cursor: code?.ref_code ? "pointer" : "default",
									textAlign: "center",
									overflowWrap: "anywhere",
									minWidth: 0,
									flex: isMobile ? undefined : 1,
								}}
							>
								{code?.ref_code || "—"}
							</button>
							<button onClick={copyOfficialCode} disabled={!code?.ref_code} style={{ ...btn(!code?.ref_code, { isMobile }), flex: isMobile ? 1 : undefined, width: isMobile ? "100%" : undefined }}>
								{copied === "code" ? t("recruiterPage.copied") : t("recruiterPage.copyOfficialCode")}
							</button>
						</div>
					</div>

					<div style={{ display: "flex", gap: 8, marginTop: 16, flexDirection: isMobile ? "column" : "row" }}>
						<button onClick={copyInviteLink} disabled={!inviteShareToken()} style={{ ...btn(!inviteShareToken(), { isMobile }), flex: 1 }}>
							{copied === "link" ? t("recruiterPage.copied") : t("recruiterPage.copyLink")}
						</button>
						<button
							onClick={shareCode}
							disabled={!inviteShareToken()}
							style={{
								...btn(!inviteShareToken(), { isMobile }),
								flex: 1,
								background: inviteShareToken() ? "var(--color-surface-raised)" : "var(--color-border)",
								color: inviteShareToken() ? "var(--color-text-primary)" : "var(--color-text-muted)",
								border: "1px solid var(--color-border)",
							}}
						>
							{t("recruiterPage.share")}
						</button>
					</div>
				</div>

				{/* Invite by username — recruiter-initiated, the invited person must accept */}
				<div style={{ ...card, marginTop: 16, padding: isMobile ? "16px 16px" : "20px 22px" }}>
					<div style={label}>{t("recruiterPage.inviteByUsernameTitle")}</div>
					<div className="text-text-secondary" style={{ fontSize: 13, margin: "8px 0 12px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
						{t("recruiterPage.inviteByUsernameHint")}
					</div>
					<RowForm isMobile={isMobile}>
						<input
							style={inputStyle(isMobile)}
							placeholder={t("recruiterPage.usernamePlaceholder")}
							value={inviteVal}
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
							enterKeyHint="send"
							onChange={(e) => setInviteVal(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && submitInvite()}
						/>
						<button onClick={submitInvite} disabled={!inviteVal.trim() || inviteBusy} style={btn(!inviteVal.trim() || inviteBusy, { isMobile, block: isMobile })}>
							{inviteBusy ? "Sending…" : "Send invite"}
						</button>
					</RowForm>
					{inviteMsg && (
						<div style={{ marginTop: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: inviteMsg.ok ? "#4ade80" : "#f87171" }}>
							{inviteMsg.text}
						</div>
					)}
					{sentInvites.length > 0 && (
						<div style={{ marginTop: 14 }}>
							<div style={{ ...label, marginBottom: 4 }}>Invite pipeline</div>
							{sentInvites.map((inv) => {
								const status = inv.status || "pending";
								const c = STATUS_COLOR[status] || STATUS_COLOR.pending;
								return (
									<div key={inv.invite_id} style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 10, padding: "12px 0", borderTop: "1px solid var(--color-border-subtle)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, flexWrap: "wrap" }}>
										<span className="text-text-primary">@{inv.user?.username || inv.user?.name || "user"}</span>
										<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
											<span style={{ color: c, fontSize: 12, fontWeight: 700 }}>{STATUS_LABEL[status] || status}</span>
											{inv.can_resend && (
												<button
													onClick={() => resendInvite(inv.invite_id)}
													disabled={invActBusy === inv.invite_id}
													style={btn(invActBusy === inv.invite_id, { isMobile, compact: true })}
												>
													{invActBusy === inv.invite_id ? "…" : "Resend"}
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Stats */}
				<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14, marginTop: 16 }}>
					<Stat value={recruitedCount} label="People linked" isMobile={isMobile} />
					<Stat value={money(lifetime)} label="Total earned" isMobile={isMobile} />
					<Stat value={money(pending)} label="Pending" isMobile={isMobile} />
				</div>

				{/* My recruits — multi-ongoing visibility */}
				<div style={{ ...card, marginTop: 16, padding: isMobile ? "16px 16px" : "20px 22px" }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
						<div style={label}>My affiliates</div>
						<div
							style={{
								display: "flex",
								gap: 8,
								width: isMobile ? "100%" : undefined,
								overflowX: isMobile ? "auto" : "visible",
								flexWrap: isMobile ? "nowrap" : "wrap",
								WebkitOverflowScrolling: "touch",
								scrollbarWidth: "none",
								msOverflowStyle: "none",
							}}
						>
							{[
								{ id: "all", label: "All" },
								{ id: "period", label: "This period" },
								{ id: "active", label: "Active" },
							].map((f) => (
								<button key={f.id} type="button" onClick={() => setRecruitFilter(f.id)} style={chip(recruitFilter === f.id, isMobile)}>
									{f.label}
								</button>
							))}
						</div>
					</div>
					<div className="text-text-secondary" style={{ fontSize: 12, marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}>
						{recruitsData?.summary
							? `${recruitsData.summary.total || 0} linked · ${recruitsData.summary.in_period || 0} in last 28 days`
							: "Ongoing people linked to your code"}
					</div>
					<div style={{ marginTop: 12 }}>
						{recruits.length === 0 ? (
							<div className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
								No affiliates yet{recruitFilter === "period" ? " in this period" : ""}. Share your Affiliate Code or send invites to grow this list.
							</div>
						) : isMobile || isTablet ? (
							<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
								{recruits.map((r, i) => (
									<div
										key={r.share_id ?? r.user?.user_id ?? i}
										style={{
											background: "var(--color-surface-raised)",
											border: "1px solid var(--color-border-subtle)",
											borderRadius: 12,
											padding: "14px 14px",
											fontFamily: "'DM Sans', sans-serif",
										}}
									>
										<div className="text-text-primary" style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
											{r.user?.name || r.user?.username || "Affiliate"}
										</div>
										{r.user?.username && (
											<div className="text-text-secondary" style={{ fontSize: 12, marginTop: 2 }}>@{r.user.username}</div>
										)}
										<div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
											<div>
												<div style={{ ...label, fontSize: 10 }}>Linked</div>
												<div className="text-text-primary" style={{ fontSize: 13, marginTop: 2 }}>
													{r.linked_at ? new Date(r.linked_at).toLocaleDateString() : "—"}
												</div>
											</div>
											<div>
												<div style={{ ...label, fontSize: 10 }}>GMV</div>
												<div className="text-text-primary" style={{ fontSize: 13, marginTop: 2 }}>{money(r.lifetime_gmv)}</div>
											</div>
											<div>
												<div style={{ ...label, fontSize: 10 }}>Your earn</div>
												<div style={{ color: "#4ade80", fontWeight: 700, fontSize: 13, marginTop: 2 }}>{money(r.earnings_attributed)}</div>
											</div>
										</div>
									</div>
								))}
							</div>
						) : (
							<>
								<div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))", gap: 10, padding: "0 0 8px", ...label, fontSize: 10 }}>
									<div>Person</div>
									<div>Linked</div>
									<div>GMV</div>
									<div>Your earn</div>
								</div>
								{recruits.map((r, i) => (
									<div
										key={r.share_id ?? r.user?.user_id ?? i}
										style={{
											display: "grid",
											gridTemplateColumns: "minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))",
											gap: 10,
											alignItems: "center",
											padding: "12px 0",
											borderTop: "1px solid var(--color-border-subtle)",
											fontFamily: "'DM Sans', sans-serif",
											fontSize: 13,
										}}
									>
										<div className="text-text-primary" style={{ minWidth: 0 }}>
											<div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
												{r.user?.name || r.user?.username || "Affiliate"}
											</div>
											{r.user?.username && (
												<div className="text-text-secondary" style={{ fontSize: 12 }}>@{r.user.username}</div>
											)}
										</div>
										<div className="text-text-primary">
											{r.linked_at ? new Date(r.linked_at).toLocaleDateString() : "—"}
										</div>
										<div className="text-text-primary">{money(r.lifetime_gmv)}</div>
										<div style={{ color: "#4ade80", fontWeight: 700 }}>{money(r.earnings_attributed)}</div>
									</div>
								))}
							</>
						)}
					</div>
				</div>

				{/* Earnings history */}
				<div style={{ ...card, marginTop: 16, padding: isMobile ? "16px 16px" : "20px 22px" }}>
					<div style={label}>Recent earnings</div>
					<div style={{ marginTop: 12 }}>
						{(earnings?.transactions || []).length === 0 ? (
							<div className="text-text-secondary" style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
								No earnings yet. They'll show up here as people on your Affiliate Code take rides, sell, shop, or engage on Strug.
							</div>
						) : (
							(earnings.transactions).slice(0, 8).map((t, i) => (
								<div key={t.transaction_id ?? i} style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, padding: "12px 0", borderBottom: i < Math.min(7, earnings.transactions.length - 1) ? "1px solid var(--color-border-subtle)" : "none" }}>
									<div className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, minWidth: 0 }}>
										<div>{t.description || "Affiliate reward"}</div>
										{t.created_at && <div className="text-text-secondary" style={{ fontSize: 12, marginTop: 2 }}>{new Date(t.created_at).toLocaleDateString()}</div>}
									</div>
									<div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "#4ade80", flexShrink: 0 }}>+{money(t.amount)}</div>
								</div>
							))
						)}
					</div>
				</div>

				{/* Got recruited? — consent-based opt-in */}
				<div style={{ ...card, marginTop: 16, padding: isMobile ? "16px 16px" : "20px 22px" }}>
					<div style={label}>{t("recruiterPage.applyTitle")}</div>
					{alreadyRecruited ? (
						<div className="text-text-secondary" style={{ fontSize: 14, marginTop: 10, fontFamily: "'DM Sans', sans-serif" }}>
							{t("recruiterPage.alreadyLinked")}
						</div>
					) : (
						<>
							<div className="text-text-secondary" style={{ fontSize: 13, margin: "8px 0 12px", fontFamily: "'DM Sans', sans-serif" }}>
								{t("recruiterPage.applyHint")}
							</div>
							<RowForm isMobile={isMobile}>
								<input
									style={inputStyle(isMobile)}
									placeholder={t("recruiterPage.applyPlaceholder")}
									value={applyVal}
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									enterKeyHint="done"
									onChange={(e) => setApplyVal(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && submitApply()}
								/>
								<button onClick={submitApply} disabled={!applyVal.trim() || applyBusy} style={btn(!applyVal.trim() || applyBusy, { isMobile, block: isMobile })}>
									{applyBusy ? t("recruiterPage.applying") : t("recruiterPage.apply")}
								</button>
							</RowForm>
							{applyMsg && (
								<div style={{ marginTop: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: applyMsg.ok ? "#4ade80" : "#f87171" }}>
									{applyMsg.text}
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
