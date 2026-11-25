import { useCallback, useEffect, useState } from "react";
import { searchTalentPool } from "../../api/jobs";
import { openDmChannel } from "../../api/chat";
import { usePageI18n } from "../../hooks/usePageI18n.js";
import { Skel } from "../skeletons.jsx";
import PortfolioGallery from "./PortfolioGallery.jsx";
import StructuredResumeSummary from "./StructuredResumeSummary.jsx";
import { normalizePortfolioList } from "../../utils/candidatePortfolio.js";
import { isSafeHttpUrl } from "../../utils/safeUrl.js";
import {
	JOBS_ACCENT as ACCENT,
	JOBS_FONT as FONT,
	jobsBlurbStyle,
	jobsBtnStyle,
	jobsEmptyStateStyle,
	jobsFeedbackTextStyle,
	jobsInputStyle,
	jobsPanelCardStyle,
	jobsSectionLabelStyle,
} from "./jobsLayout.js";

/**
 * Employer passive candidate search (opt-in talent pool).
 */
export default function TalentPoolPanel({ isMobile }) {
	const { t } = usePageI18n("jobs");
	const [filters, setFilters] = useState({ keyword: "", location: "", skills: "", years_min: "" });
	const [results, setResults] = useState(null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState(null);
	const [msgBusy, setMsgBusy] = useState(null);
	const [expanded, setExpanded] = useState(null);

	const search = useCallback(async () => {
		setBusy(true);
		setErr(null);
		try {
			const data = await searchTalentPool({
				keyword: filters.keyword || undefined,
				location: filters.location || undefined,
				skills: filters.skills || undefined,
				years_min: filters.years_min || undefined,
				limit: 24,
			});
			setResults(Array.isArray(data?.results) ? data.results : []);
		} catch (e) {
			setResults([]);
			setErr(e?.response?.data?.error || "Couldn't search the talent pool.");
		} finally {
			setBusy(false);
		}
	}, [filters]);

	useEffect(() => {
		void search();
		// Initial browse only; Search button re-runs with current filters.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const messageCandidate = async (c) => {
		const uid = c?.user?.user_id;
		if (!uid || msgBusy) return;
		setMsgBusy(c.candidate_id);
		try {
			await openDmChannel(uid, { sourceVertical: "jobs" });
			if (window.__nav) window.__nav("messages");
		} catch {
			setErr("Couldn't open a conversation with that candidate.");
		} finally {
			setMsgBusy(null);
		}
	};

	const onSearchKeyDown = (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			void search();
		}
	};

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div className="jobs-card" style={jobsPanelCardStyle()}>
				<p style={{ ...jobsBlurbStyle, marginBottom: 14, fontSize: 14 }}>
					{t("employer.talentPoolBlurb", {
						defaultValue: "Browse seekers who opted into discoverability. Message them about open roles.",
					})}
				</p>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr 0.7fr auto",
						gap: 12,
						alignItems: "end",
					}}
				>
					<label style={{ display: "grid", gap: 6 }}>
						<span style={jobsSectionLabelStyle}>
							{t("employer.talentKeyword", { defaultValue: "Keyword" })}
						</span>
						<input
							className="jobs-input"
							style={jobsInputStyle()}
							value={filters.keyword}
							onChange={(e) => setFilters((s) => ({ ...s, keyword: e.target.value }))}
							onKeyDown={onSearchKeyDown}
							placeholder="React, nurse…"
						/>
					</label>
					<label style={{ display: "grid", gap: 6 }}>
						<span style={jobsSectionLabelStyle}>
							{t("employer.talentLocation", { defaultValue: "Location" })}
						</span>
						<input
							className="jobs-input"
							style={jobsInputStyle()}
							value={filters.location}
							onChange={(e) => setFilters((s) => ({ ...s, location: e.target.value }))}
							onKeyDown={onSearchKeyDown}
							placeholder="Toronto"
						/>
					</label>
					<label style={{ display: "grid", gap: 6 }}>
						<span style={jobsSectionLabelStyle}>
							{t("employer.talentSkills", { defaultValue: "Skills" })}
						</span>
						<input
							className="jobs-input"
							style={jobsInputStyle()}
							value={filters.skills}
							onChange={(e) => setFilters((s) => ({ ...s, skills: e.target.value }))}
							onKeyDown={onSearchKeyDown}
							placeholder="Node.js"
						/>
					</label>
					<label style={{ display: "grid", gap: 6 }}>
						<span style={jobsSectionLabelStyle}>
							{t("employer.talentYears", { defaultValue: "Min years" })}
						</span>
						<input
							className="jobs-input"
							style={jobsInputStyle()}
							type="number"
							min={0}
							value={filters.years_min}
							onChange={(e) => setFilters((s) => ({ ...s, years_min: e.target.value }))}
							onKeyDown={onSearchKeyDown}
						/>
					</label>
					<button
						type="button"
						onClick={search}
						disabled={busy}
						aria-busy={busy}
						className="jobs-btn jobs-btn--primary"
						style={jobsBtnStyle({ primary: true, disabled: busy })}
					>
						{busy
							? t("employer.talentSearching", { defaultValue: "Searching…" })
							: t("employer.talentSearch", { defaultValue: "Search" })}
					</button>
				</div>
				{err && (
					<div className="jobs-feedback jobs-feedback--err" role="alert" style={{ ...jobsFeedbackTextStyle(), marginTop: 12 }}>
						{err}
					</div>
				)}
			</div>

			{results === null || busy ? (
				<div style={{ display: "grid", gap: 12 }} aria-busy="true" aria-label={t("employer.talentSearching", { defaultValue: "Searching…" })}>
					<Skel w="100%" h={118} r={16} />
					<Skel w="100%" h={118} r={16} />
					<Skel w="100%" h={118} r={16} />
				</div>
			) : results.length === 0 ? (
				<div className="jobs-empty" style={{ ...jobsEmptyStateStyle(), ...jobsPanelCardStyle({ padding: "28px 18px" }) }} role="status">
					{t("employer.talentEmpty", { defaultValue: "No discoverable candidates match those filters." })}
				</div>
			) : (
				<div style={{ display: "grid", gap: 12 }}>
					{results.map((c) => {
						const open = expanded === c.candidate_id;
						const portfolio = normalizePortfolioList(c);
						const name = c.user?.name || c.user?.username || "Candidate";
						return (
							<div key={c.candidate_id} className="jobs-card jobs-card--interactive" style={jobsPanelCardStyle()}>
								<div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
									<div style={{ flex: "1 1 220px", minWidth: 0 }}>
										<div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, lineHeight: 1.3, color: "var(--color-text-primary)", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
											<span>{name}</span>
											{c.talent_boosted ? (
												<span
													className="jobs-chip"
													style={{
														fontSize: 11,
														fontWeight: 700,
														padding: "4px 10px",
														borderRadius: 999,
														background: ACCENT,
														color: "#fff",
														letterSpacing: "0.04em",
														textTransform: "uppercase",
													}}
												>
													{t("employer.talentBoosted", { defaultValue: "Boosted" })}
												</span>
											) : null}
										</div>
										{c.headline && (
											<div style={{ fontFamily: FONT, fontSize: 14, lineHeight: 1.45, color: "var(--color-text-secondary)", marginTop: 6 }}>
												{c.headline}
											</div>
										)}
										<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
											{c.location && (
												<span className="jobs-chip" style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "color-mix(in srgb, #2563eb 14%, transparent)", color: "#93c5fd", fontFamily: FONT, fontWeight: 600 }}>
													{c.location}
												</span>
											)}
											{c.years_experience != null && (
												<span className="jobs-chip" style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", fontFamily: FONT, fontWeight: 600 }}>
													{c.years_experience} yrs
												</span>
											)}
											{String(c.skills || "")
												.split(",")
												.map((s) => s.trim())
												.filter(Boolean)
												.slice(0, 4)
												.map((s) => (
													<span key={s} className="jobs-chip" style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", fontFamily: FONT, fontWeight: 600 }}>
														{s}
													</span>
												))}
										</div>
									</div>
									<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
										<button
											type="button"
											className="jobs-btn"
											style={jobsBtnStyle()}
											aria-expanded={open}
											onClick={() => setExpanded(open ? null : c.candidate_id)}
										>
											{open
												? t("employer.talentHide", { defaultValue: "Hide profile" })
												: t("employer.talentView", { defaultValue: "View profile" })}
										</button>
										<button
											type="button"
											className="jobs-btn jobs-btn--primary"
											style={jobsBtnStyle({ primary: true, disabled: msgBusy === c.candidate_id })}
											disabled={msgBusy === c.candidate_id}
											aria-busy={msgBusy === c.candidate_id}
											onClick={() => messageCandidate(c)}
										>
											{msgBusy === c.candidate_id
												? t("employer.talentMessaging", { defaultValue: "Opening…" })
												: t("employer.talentMessage", { defaultValue: "Message" })}
										</button>
									</div>
								</div>
								{open && (
									<div className="jobs-expand" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border)", display: "grid", gap: 16 }}>
										{c.bio && (
											<p style={{ fontFamily: FONT, fontSize: 14, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.55 }}>
												{c.bio}
											</p>
										)}
										<StructuredResumeSummary resumeJson={c.resume_json} />
										{isSafeHttpUrl(c.resume_url) && (
											<a href={c.resume_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>
												{t("employer.talentResumeFile", { defaultValue: "Open résumé file" })}
											</a>
										)}
										{portfolio.length > 0 && (
											<PortfolioGallery items={portfolio} readOnly />
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
