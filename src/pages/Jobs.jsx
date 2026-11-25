import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
	getJobs, getJob, getJobCategories, applyToJob, getMyApplications,
	withdrawApplication, uploadResume, getMyCandidate, updateMyCandidate,
	getHiringCompanies, getRecommendedJobs, reportJob, trackJobEvent,
	uploadPortfolioFile, addPortfolioItem, deletePortfolioItem,
} from "../api/jobs";
import { openContextChat } from "../api/chat";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { Skel } from "../components/skeletons.jsx";
import { ModalShell } from "../components/reportKit.jsx";
import { JobSheet } from "../components/jobs/JobSheet.jsx";
import {
	JOBS_ACCENT as ACCENT,
	JOBS_FONT as FONT,
	JOBS_HEAD as HEAD,
	jobsPageOuterStyle,
	jobsPageInnerStyle,
	jobsResultsGridStyle,
	jobsFilterShellStyle,
} from "../components/jobs/jobsLayout.js";
import {
	EMPTY_SEEKER_FILTERS,
	PAGE_SIZE,
	buildSeekerListQuery,
	canApplyToJob,
	canEasyApply,
	readSavedJobIds,
	toggleSavedJobId,
	jobSharePath,
	parseJobIdFromPath,
} from "../utils/seekerJobs.js";
import {
	JOB_APPLICATION_CHAT_CONTEXT,
	canOpenJobApplicationChat,
	jobApplicationChatId,
	buildJobApplicationChatIntro,
} from "../utils/jobMessaging.js";
import {
	companyIdFromJob,
	parseAgentIdFromPath,
	pushCompanyUrl,
} from "../utils/companyJobs.js";
import {
	normalizeRecommendedJobs,
	RECOMMENDED_JOBS_LIMIT,
} from "../utils/jobRecommend.js";
import {
	JOB_REPORT_REASONS,
	canReportJob,
} from "../utils/jobModeration.js";
import JobSavedSearches from "../components/JobSavedSearches.jsx";
import JobsEdgeDrawer from "../components/jobs/JobsEdgeDrawer.jsx";
import ResumeBuilder from "../components/jobs/ResumeBuilder.jsx";
import PortfolioGallery from "../components/jobs/PortfolioGallery.jsx";
import ResumeVersionsPanel from "../components/jobs/ResumeVersionsPanel.jsx";
import TalentBoostPanel from "../components/jobs/TalentBoostPanel.jsx";
import CompanyProfile from "./CompanyProfile.jsx";
import { isSafeHttpUrl } from "../utils/safeUrl.js";
import { profileCompleteness } from "../utils/candidateProfileCompleteness.js";
import { normalizeResumeJson, parseResumeJson } from "../utils/resumeBuilder.js";
import { normalizePortfolioList } from "../utils/candidatePortfolio.js";
import { getUser } from "../store/auth.js";

const card = {
	background: "var(--color-surface)",
	border: "1px solid var(--color-border)",
	borderRadius: 16,
	padding: "18px 20px",
	transition: "border-color 0.15s, box-shadow 0.2s, transform 0.2s",
};
const h1 = { fontFamily: HEAD, fontWeight: 800, fontSize: "clamp(30px,3.4vw,44px)", letterSpacing: "0.12em", textTransform: "uppercase", margin: 0, lineHeight: 1.1 };
const label = { fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" };
const btn = (disabled) => ({ padding: "11px 18px", background: disabled ? "var(--color-border)" : ACCENT, border: "none", borderRadius: 12, color: disabled ? "var(--color-text-muted)" : "#fff", fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" });
const ghostBtn = { padding: "10px 16px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 12, color: "var(--color-text-primary)", fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const input = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "11px 14px", color: "var(--color-text-primary)", fontFamily: FONT, fontSize: 14, outline: "none", boxSizing: "border-box" };

function employmentTypeOptions(t) {
	return [
		{ v: "", l: t("jobs.anyType", { defaultValue: "Any type" }) },
		{ v: "full_time", l: t("jobs.fullTime", { defaultValue: "Full-time" }) },
		{ v: "part_time", l: t("jobs.partTime", { defaultValue: "Part-time" }) },
		{ v: "contract", l: t("jobs.contract", { defaultValue: "Contract" }) },
		{ v: "internship", l: t("jobs.internship", { defaultValue: "Internship" }) },
	];
}
function typeLabelMap(t) {
	return {
		full_time: t("jobs.fullTime", { defaultValue: "Full-time" }),
		part_time: t("jobs.partTime", { defaultValue: "Part-time" }),
		contract: t("jobs.contract", { defaultValue: "Contract" }),
		internship: t("jobs.internship", { defaultValue: "Internship" }),
	};
}
const STATUS_COLOR = { applied: "#60a5fa", reviewed: "#fbbf24", shortlisted: "#a78bfa", rejected: "#f87171", hired: "#4ade80" };

const money = (n) => (n == null ? null : `$${Number(n).toLocaleString()}`);
function salaryText(j) {
	const lo = money(j.salary_min), hi = money(j.salary_max);
	if (!lo && !hi) return null;
	const per = j.salary_period ? `/${j.salary_period}` : "";
	if (lo && hi) return `${lo}–${hi}${per}`;
	return `${lo || hi}${per}`;
}

function pushJobUrl(jobId) {
	const path = jobSharePath(jobId);
	try {
		if (window.location.pathname !== path) {
			window.history.pushState({ nav: "jobs", jobId }, "", path);
		}
	} catch { /* ignore */ }
}

function Tabs({ tab, setTab, onHire, t, isMobile, profilePercent }) {
	const tabs = [
		["browse", t("jobs.browse", { defaultValue: "Browse jobs" })],
		["saved", t("jobs.saved", { defaultValue: "Saved" })],
		["apps", t("jobs.myApplications", { defaultValue: "My applications" })],
		["profile", t("jobs.myProfile", { defaultValue: "My profile" })],
	];
	return (
		<div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 8, margin: "20px 0 22px", alignItems: isMobile ? "stretch" : "center" }}>
			<div
				className="styled-scrollbar"
				style={{
					display: "flex",
					gap: 8,
					alignItems: "center",
					overflowX: isMobile ? "auto" : "visible",
					flexWrap: isMobile ? "nowrap" : "wrap",
					WebkitOverflowScrolling: "touch",
					paddingBottom: isMobile ? 2 : 0,
					marginRight: isMobile ? 0 : "auto",
					flex: isMobile ? undefined : 1,
				}}
			>
				{tabs.map(([id, lbl]) => (
					<button
						key={id}
						type="button"
						onClick={() => setTab(id)}
						style={{
							...ghostBtn,
							flexShrink: 0,
							whiteSpace: "nowrap",
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							...(tab === id ? { background: ACCENT, borderColor: ACCENT, color: "#fff" } : {}),
						}}
					>
						{lbl}
						{id === "profile" && profilePercent != null && profilePercent < 100 && (
							<span
								style={{
									fontSize: 10,
									fontWeight: 800,
									padding: "2px 6px",
									borderRadius: 10,
									background: tab === id ? "rgba(255,255,255,0.25)" : "rgba(37,99,235,0.15)",
									color: tab === id ? "#fff" : ACCENT,
								}}
							>
								{profilePercent}%
							</span>
						)}
					</button>
				))}
			</div>
			{typeof onHire === "function" && (
				<button
					type="button"
					onClick={onHire}
					style={{
						...ghostBtn,
						borderColor: `${ACCENT}88`,
						color: ACCENT,
						flexShrink: 0,
						width: isMobile ? "100%" : undefined,
					}}
				>
					{t("jobs.hiringCta", { defaultValue: "Hiring / Post a job" })}
				</button>
			)}
		</div>
	);
}

function StatusBadge({ status }) {
	const c = STATUS_COLOR[status] || "#94a3b8";
	return <span style={{ fontSize: 12, fontWeight: 700, color: c, background: `${c}22`, border: `1px solid ${c}55`, borderRadius: 999, padding: "3px 10px", textTransform: "capitalize", fontFamily: FONT }}>{status || "applied"}</span>;
}

function Chip({ children, accent }) {
	return <span style={{ fontSize: 12.5, fontFamily: FONT, color: accent ? ACCENT : "var(--color-text-secondary)", background: accent ? `${ACCENT}1c` : "var(--color-surface)", border: `1px solid ${accent ? ACCENT + "55" : "var(--color-border)"}`, borderRadius: 8, padding: "4px 10px" }}>{children}</span>;
}

function JobCard({ job, onOpen, onOpenCompany, saved, onToggleSave, t }) {
	const co = job.agents?.company_name || t("jobs.aCompany", { defaultValue: "A company" });
	const id = typeof job.job_id === "number" ? job.job_id : null;
	const companyId = companyIdFromJob(job);
	const TYPE_LABEL = typeLabelMap(t);
	const [hover, setHover] = useState(false);
	const pay = salaryText(job);
	return (
		<div
			style={{
				...card,
				height: "100%",
				position: "relative",
				borderColor: hover ? `${ACCENT}66` : "var(--color-border)",
				boxShadow: hover ? "0 12px 32px var(--color-shadow)" : "0 1px 0 color-mix(in srgb, var(--color-border) 80%, transparent)",
				transform: hover ? "translateY(-2px)" : "none",
				background: hover
					? "linear-gradient(165deg, color-mix(in srgb, var(--color-surface) 88%, #2563eb 12%), var(--color-surface))"
					: "var(--color-surface)",
			}}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
		>
			{id != null && typeof onToggleSave === "function" && (
				<button
					type="button"
					aria-label={saved ? t("jobs.unsave", { defaultValue: "Unsave" }) : t("jobs.save", { defaultValue: "Save" })}
					onClick={(e) => { e.stopPropagation(); onToggleSave(id); }}
					style={{
						position: "absolute",
						top: 12,
						right: 12,
						zIndex: 1,
						...ghostBtn,
						padding: "8px 12px",
						fontSize: 13,
						minHeight: 40,
						background: "var(--color-surface)",
					}}
				>
					{saved ? t("jobs.savedLabel", { defaultValue: "Saved" }) : t("jobs.save", { defaultValue: "Save" })}
				</button>
			)}
			<button
				type="button"
				onClick={() => onOpen(job)}
				style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", width: "100%", color: "inherit" }}
			>
				<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", paddingRight: id != null ? 88 : 0 }}>
					<div style={{ minWidth: 0 }}>
						<div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "clamp(18px, 2.4vw, 22px)", letterSpacing: "0.02em", lineHeight: 1.2 }}>
							{job.job_name}
							{job.sponsored && (
								<span style={{ fontSize: 11, color: ACCENT, marginLeft: 8, fontFamily: FONT, fontWeight: 600 }}>
									{t("jobs.sponsored", { defaultValue: "Sponsored" })}
								</span>
							)}
						</div>
						{companyId && typeof onOpenCompany === "function" ? (
							<span
								role="link"
								tabIndex={0}
								onClick={(e) => { e.stopPropagation(); onOpenCompany(companyId); }}
								onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpenCompany(companyId); } }}
								style={{ fontFamily: FONT, fontSize: 14, marginTop: 6, display: "inline-block", color: ACCENT, textDecoration: "underline", textUnderlineOffset: 2 }}
							>
								{co}
							</span>
						) : (
							<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 14, marginTop: 6 }}>{co}</div>
						)}
					</div>
					{job.job_categories?.job_category_name && (
						<span style={{ ...label, whiteSpace: "nowrap", marginTop: 4 }}>{job.job_categories.job_category_name}</span>
					)}
				</div>
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
					{job.location && <Chip>{job.location}</Chip>}
					{job.is_remote && <Chip accent>{t("jobs.remote", { defaultValue: "Remote" })}</Chip>}
					{job.employment_type && <Chip>{TYPE_LABEL[job.employment_type] || job.employment_type}</Chip>}
					{pay ? <Chip accent>{pay}</Chip> : <Chip>{t("jobs.salaryNotListed", { defaultValue: "Salary not listed" })}</Chip>}
				</div>
			</button>
		</div>
	);
}

export default function JobsPage({ onNavigate, initialJobId, initialAgentId } = {}) {
	const loading = usePageLoad(400);
	const { t, landingTitle } = usePageI18n("jobs");
	const { isMobile } = useViewport();
	const outer = useMemo(() => jobsPageOuterStyle(isMobile), [isMobile]);
	const inner = useMemo(() => jobsPageInnerStyle(isMobile), [isMobile]);
	const [tab, setTab] = useState("browse");
	const [selected, setSelected] = useState(null);
	const [savedIds, setSavedIds] = useState(() => readSavedJobIds());
	const [companyId, setCompanyId] = useState(() => {
		const fromProp = initialAgentId != null ? Number(initialAgentId) : null;
		if (Number.isFinite(fromProp) && fromProp > 0) return fromProp;
		return parseAgentIdFromPath(window.location.pathname);
	});
	const [profilePercent, setProfilePercent] = useState(null);

	const openProfileTab = useCallback(() => setTab("profile"), []);

	const openJob = useCallback((job) => {
		setCompanyId(null);
		setSelected(job);
		if (typeof job?.job_id === "number") pushJobUrl(job.job_id);
	}, []);

	const openJobById = useCallback((jobId) => {
		const id = Number(jobId);
		if (!Number.isFinite(id) || id <= 0) return;
		getJob(id).then((j) => { if (j) openJob(j); }).catch(() => {});
	}, [openJob]);

	const closeJob = useCallback(() => {
		setSelected(null);
		try {
			if (/^\/jobs\/\d+/.test(window.location.pathname)) {
				window.history.pushState({ nav: "jobs" }, "", "/jobs");
			}
		} catch { /* ignore */ }
	}, []);

	const openCompany = useCallback((id) => {
		const n = Number(id);
		if (!Number.isFinite(n) || n <= 0) return;
		setSelected(null);
		setCompanyId(n);
		pushCompanyUrl(n);
	}, []);

	const closeCompany = useCallback(() => {
		setCompanyId(null);
		try {
			if (/^\/company\/\d+/.test(window.location.pathname)) {
				window.history.pushState({ nav: "jobs" }, "", "/jobs");
			}
		} catch { /* ignore */ }
	}, []);

	useEffect(() => {
		const consumeJobHandoff = () => {
			const handoff = typeof window !== "undefined" ? window.__jobsOpenJobId : null;
			if (!handoff) return;
			try { delete window.__jobsOpenJobId; } catch { /* noop */ }
			getJob(handoff).then((j) => { if (j) openJob(j); }).catch(() => {});
		};
		consumeJobHandoff();
		window.addEventListener("strug:open-notification-target", consumeJobHandoff);
		return () => window.removeEventListener("strug:open-notification-target", consumeJobHandoff);
	}, [openJob]);

	useEffect(() => {
		if (companyId) return;
		const fromProp = initialJobId != null ? Number(initialJobId) : null;
		const fromPath = parseJobIdFromPath(window.location.pathname);
		const id = Number.isFinite(fromProp) && fromProp > 0 ? fromProp : fromPath;
		if (!id) return;
		getJob(id).then((j) => { if (j) openJob(j); }).catch(() => {});
	}, [initialJobId, openJob, companyId]);

	useEffect(() => {
		getMyCandidate()
			.then((c) => setProfilePercent(profileCompleteness(c).percent))
			.catch(() => setProfilePercent(null));
	}, [tab]);

	useEffect(() => {
		const onPop = () => {
			const cid = parseAgentIdFromPath(window.location.pathname);
			const jid = parseJobIdFromPath(window.location.pathname);
			if (cid) {
				setSelected(null);
				setCompanyId(cid);
				return;
			}
			setCompanyId(null);
			if (jid) {
				getJob(jid).then((j) => { if (j) setSelected(j); }).catch(() => setSelected(null));
			} else {
				setSelected(null);
			}
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);

	const toggleSave = (id) => setSavedIds(toggleSavedJobId(id));

	const detail = selected && (
		<JobDetailModal
			key={typeof selected.job_id === "number" ? selected.job_id : selected.ad_id || selected.target_url || "job"}
			jobStub={selected}
			onClose={closeJob}
			savedIds={savedIds}
			onToggleSave={toggleSave}
			onOpenCompany={openCompany}
			t={t}
			isMobile={isMobile}
		/>
	);

	if (companyId) {
		return (
			<div style={outer} className="styled-scrollbar">
				<div style={inner}>
					<CompanyProfile
						agentId={companyId}
						onBack={closeCompany}
						onOpenJob={(j) => openJob(j)}
					/>
				</div>
				{detail}
				<JobsEdgeDrawer onOpenProfileTab={openProfileTab} onOpenJob={openJobById} />
			</div>
		);
	}

	return (
		<div style={outer} className="styled-scrollbar">
			<div style={inner}>
				<h1 style={h1}>{landingTitle || t("jobs.title", { defaultValue: "Jobs" })}</h1>
				<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: isMobile ? 14 : 16, lineHeight: 1.55, margin: "10px 0 0", maxWidth: isMobile ? "100%" : 720 }}>
					{t("jobs.subtitle", { defaultValue: "Find your next role across the Strug network. Search openings, apply with your résumé, and track every application in one place." })}
				</p>
				<Tabs
					tab={tab}
					setTab={setTab}
					t={t}
					isMobile={isMobile}
					profilePercent={profilePercent}
					onHire={typeof onNavigate === "function" ? () => onNavigate("employer") : undefined}
				/>
				{loading ? (
					<div style={{ display: "grid", gap: 14 }}>{[0, 1, 2].map((i) => <Skel key={i} w="100%" h={110} r={16} />)}</div>
				) : tab === "browse" ? (
					<BrowseTab onOpen={openJob} onOpenCompany={openCompany} savedIds={savedIds} onToggleSave={toggleSave} t={t} />
				) : tab === "saved" ? (
					<SavedTab onOpen={openJob} onOpenCompany={openCompany} savedIds={savedIds} onToggleSave={toggleSave} t={t} />
				) : tab === "apps" ? (
					<ApplicationsTab onOpenCompany={openCompany} t={t} />
				) : (
					<ProfileTab onCompletenessChange={(c) => setProfilePercent(c.percent)} />
				)}
			</div>
			{detail}
			<JobsEdgeDrawer onOpenProfileTab={openProfileTab} onOpenJob={openJobById} />
		</div>
	);
}

function FilterFields({ filters, set, categories, types, t, runSearch, busy, compact }) {
	const fieldGrid = compact
		? { display: "grid", gap: 10, gridTemplateColumns: "1fr" }
		: {
				display: "grid",
				gap: 10,
				gridTemplateColumns: "minmax(180px, 2fr) minmax(140px, 1.2fr) minmax(120px, 1fr) minmax(120px, 1fr)",
			};
	const metaGrid = compact
		? { display: "grid", gap: 10, gridTemplateColumns: "1fr", marginTop: 12 }
		: {
				display: "grid",
				gap: 10,
				marginTop: 12,
				gridTemplateColumns: "110px 110px minmax(140px, 160px) auto 1fr",
				alignItems: "center",
			};

	return (
		<>
			<div style={fieldGrid}>
				<input style={{ ...input, width: "100%", minWidth: 0 }} placeholder={t("jobs.searchPlaceholder", { defaultValue: "What — job title or keyword" })} value={filters.keyword}
					onChange={(e) => set("keyword", e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} />
				<input style={{ ...input, width: "100%", minWidth: 0 }} placeholder={t("jobs.locationPlaceholder", { defaultValue: "Where — city or region" })} value={filters.location}
					onChange={(e) => set("location", e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} />
				<select style={{ ...input, width: "100%", minWidth: 0 }} value={filters.category} onChange={(e) => set("category", e.target.value)}>
					<option value="">{t("jobs.allCategories", { defaultValue: "All categories" })}</option>
					{categories.map((c) => <option key={c.job_category_id} value={c.job_category_id}>{c.job_category_name}</option>)}
				</select>
				<select style={{ ...input, width: "100%", minWidth: 0 }} value={filters.employment_type} onChange={(e) => set("employment_type", e.target.value)}>
					{types.map((opt) => <option key={opt.v} value={opt.v}>{opt.l}</option>)}
				</select>
			</div>
			<div style={metaGrid}>
				<input style={{ ...input, width: "100%", minWidth: 0 }} type="number" placeholder={t("jobs.minSalary", { defaultValue: "Min $" })} value={filters.salary_min} onChange={(e) => set("salary_min", e.target.value)} />
				<input style={{ ...input, width: "100%", minWidth: 0 }} type="number" placeholder={t("jobs.maxSalary", { defaultValue: "Max $" })} value={filters.salary_max} onChange={(e) => set("salary_max", e.target.value)} />
				<select style={{ ...input, width: "100%", minWidth: 0 }} value={filters.sort} onChange={(e) => set("sort", e.target.value)}>
					<option value="newest">{t("jobs.sortNewest", { defaultValue: "Newest" })}</option>
					<option value="salary_desc">{t("jobs.sortSalaryDesc", { defaultValue: "Salary: high–low" })}</option>
					<option value="salary_asc">{t("jobs.sortSalaryAsc", { defaultValue: "Salary: low–high" })}</option>
				</select>
				<label className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>
					<input type="checkbox" checked={filters.is_remote} onChange={(e) => set("is_remote", e.target.checked)} /> {t("jobs.remoteOnly", { defaultValue: "Remote only" })}
				</label>
				{!compact && (
					<button onClick={runSearch} disabled={busy} style={{ ...btn(busy), justifySelf: "end", minWidth: 120 }}>{busy ? t("jobs.searching", { defaultValue: "Searching…" }) : t("jobs.search", { defaultValue: "Search" })}</button>
				)}
			</div>
		</>
	);
}

function BrowseTab({ onOpen, onOpenCompany, savedIds, onToggleSave, t }) {
	const { isMobile, isTablet } = useViewport();
	const [filters, setFilters] = useState({ ...EMPTY_SEEKER_FILTERS });
	const [categories, setCategories] = useState([]);
	const [jobs, setJobs] = useState([]);
	const [busy, setBusy] = useState(false);
	const [hasMore, setHasMore] = useState(false);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [loadError, setLoadError] = useState(null);
	const types = employmentTypeOptions(t);
	const resultsGrid = jobsResultsGridStyle(isMobile, isTablet);

	useEffect(() => { getJobCategories().then(setCategories).catch(() => {}); }, []);

	const search = useCallback(async (nextFilters = filters) => {
		setBusy(true);
		setLoadError(null);
		try {
			const q = buildSeekerListQuery(nextFilters);
			const rows = await getJobs(q);
			const list = Array.isArray(rows) ? rows : [];
			setJobs(list);
			setHasMore(list.filter((j) => !j.sponsored && !j.is_ad).length >= PAGE_SIZE);
		} catch {
			setJobs([]);
			setHasMore(false);
			setLoadError(t("jobs.loadFailed", { defaultValue: "Couldn't load jobs. Check your connection and try again." }));
		}
		finally { setBusy(false); }
	}, [filters, t]);

	useEffect(() => {
		let alive = true;
		(async () => {
			setBusy(true);
			setLoadError(null);
			try {
				const q = buildSeekerListQuery({ ...EMPTY_SEEKER_FILTERS });
				const rows = await getJobs(q);
				if (!alive) return;
				const list = Array.isArray(rows) ? rows : [];
				setJobs(list);
				setHasMore(list.filter((j) => !j.sponsored && !j.is_ad).length >= PAGE_SIZE);
			} catch {
				if (alive) {
					setJobs([]);
					setHasMore(false);
					setLoadError(t("jobs.loadFailed", { defaultValue: "Couldn't load jobs. Check your connection and try again." }));
				}
			} finally {
				if (alive) setBusy(false);
			}
		})();
		return () => { alive = false; };
	}, [t]);
	const set = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: k === "page" ? v : 1 }));

	const runSearch = () => search({ ...filters, page: 1 });

	return (
		<>
			{isMobile ? (
				<div style={{ marginBottom: 18 }}>
					<button type="button" onClick={() => setFiltersOpen(true)} style={{ ...ghostBtn, width: "100%", marginBottom: 10 }}>
						{t("jobs.filters", { defaultValue: "Filters" })}
					</button>
					{filtersOpen && (
						<ModalShell
							isMobile
							title={t("jobs.filters", { defaultValue: "Filters" })}
							onClose={() => setFiltersOpen(false)}
						>
							{(close) => (
								<>
									<FilterFields filters={filters} set={set} categories={categories} types={types} t={t} runSearch={runSearch} busy={busy} compact />
									<button
										type="button"
										disabled={busy}
										style={{ ...btn(busy), width: "100%", marginTop: 16 }}
										onClick={() => { runSearch(); close(); }}
									>
										{busy ? t("jobs.searching", { defaultValue: "Searching…" }) : t("jobs.search", { defaultValue: "Search" })}
									</button>
									<div style={{ marginTop: 14 }}>
										<JobSavedSearches
											filters={filters}
											onApply={(next) => {
												const merged = { ...EMPTY_SEEKER_FILTERS, ...next, page: 1 };
												setFilters(merged);
												search(merged);
												close();
											}}
										/>
									</div>
								</>
							)}
						</ModalShell>
					)}
				</div>
			) : (
				<div style={jobsFilterShellStyle()}>
					<FilterFields filters={filters} set={set} categories={categories} types={types} t={t} runSearch={runSearch} busy={busy} />
					<JobSavedSearches
						filters={filters}
						onApply={(next) => {
							const merged = { ...EMPTY_SEEKER_FILTERS, ...next, page: 1 };
							setFilters(merged);
							search(merged);
						}}
					/>
				</div>
			)}
			<RecommendedRail onOpen={onOpen} onOpenCompany={onOpenCompany} savedIds={savedIds} onToggleSave={onToggleSave} t={t} />
			<HiringRail onOpenCompany={onOpenCompany} t={t} />
			{jobs.length === 0 && !busy ? (
				<div className="text-text-secondary" style={{ ...card, fontFamily: FONT }}>
					{loadError || t("jobs.noMatches", { defaultValue: "No matching jobs. Try broader filters." })}
				</div>
			) : (
				<div style={resultsGrid}>
					{jobs.map((j) => (
						<JobCard key={j.job_id || j.ad_id || j.target_url} job={j} onOpen={onOpen} onOpenCompany={onOpenCompany} saved={savedIds.includes(j.job_id)} onToggleSave={onToggleSave} t={t} />
					))}
				</div>
			)}
			{(filters.page > 1 || hasMore) && (
				<div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
					<button
						type="button"
						disabled={busy || filters.page <= 1}
						style={ghostBtn}
						onClick={() => {
							const next = { ...filters, page: Math.max(1, filters.page - 1) };
							setFilters(next);
							search(next);
						}}
					>
						{t("jobs.previous", { defaultValue: "Previous" })}
					</button>
					<span className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, alignSelf: "center" }}>{t("jobs.page", { n: filters.page, defaultValue: `Page ${filters.page}` })}</span>
					<button
						type="button"
						disabled={busy || !hasMore}
						style={ghostBtn}
						onClick={() => {
							const next = { ...filters, page: filters.page + 1 };
							setFilters(next);
							search(next);
						}}
					>
						{t("jobs.next", { defaultValue: "Next" })}
					</button>
				</div>
			)}
		</>
	);
}

function RecommendedRail({ onOpen, onOpenCompany, savedIds, onToggleSave, t }) {
	const [rows, setRows] = useState(null);

	useEffect(() => {
		let alive = true;
		getRecommendedJobs({ limit: RECOMMENDED_JOBS_LIMIT })
			.then((raw) => {
				if (!alive) return;
				setRows(normalizeRecommendedJobs(raw));
			})
			.catch(() => {
				if (alive) setRows([]);
			});
		return () => { alive = false; };
	}, []);

	if (rows === null || rows.length === 0) return null;

	return (
		<div style={{ marginBottom: 18 }}>
			<div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>
				{t("jobs.jobsForYou", { defaultValue: "Jobs for you" })}
			</div>
			<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, margin: "0 0 10px", maxWidth: 520 }}>
				{t("jobs.jobsForYouBlurb", { defaultValue: "Ranked from your profile, preferred salary, and recent applications — separate from sponsored listings." })}
			</p>
			<div style={{ display: "grid", gap: 10 }}>
				{rows.map((j) => (
					<JobCard
						key={j.job_id}
						job={j}
						onOpen={onOpen}
						onOpenCompany={onOpenCompany}
						saved={savedIds.includes(j.job_id)}
						onToggleSave={onToggleSave}
						t={t}
					/>
				))}
			</div>
		</div>
	);
}

function HiringRail({ onOpenCompany, t }) {
	const [rows, setRows] = useState([]);

	useEffect(() => {
		getHiringCompanies({ limit: 8 })
			.then((list) => setRows(Array.isArray(list) ? list : []))
			.catch(() => setRows([]));
	}, []);

	if (!rows.length || typeof onOpenCompany !== "function") return null;

	return (
		<div style={{ marginBottom: 18 }}>
			<div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>
				{t("jobs.companiesHiring", { defaultValue: "Companies hiring" })}
			</div>
			<div style={{ position: "relative" }}>
				<div
					className="styled-scrollbar"
					style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}
				>
					{rows.map((c) => (
						<button
							key={c.agent_id}
							type="button"
							onClick={() => onOpenCompany(c.agent_id)}
							style={{
								...card,
								flex: "0 0 auto",
								minWidth: 168,
								maxWidth: 200,
								padding: "12px 14px",
								cursor: "pointer",
								textAlign: "left",
								display: "flex",
								gap: 10,
								alignItems: "center",
							}}
						>
							{c.company_logo_url ? (
								<img src={c.company_logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", border: "1px solid var(--color-border)" }} />
							) : (
								<div className="bg-surface-raised border border-border" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
							)}
							<div style={{ minWidth: 0 }}>
								<div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
									{c.company_name}
								</div>
								<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, marginTop: 2 }}>
									{t("jobs.openCount", { count: c.open_count, defaultValue: `${c.open_count} open` })}
								</div>
							</div>
						</button>
					))}
				</div>
				<div
					aria-hidden
					style={{
						pointerEvents: "none",
						position: "absolute",
						top: 0,
						right: 0,
						bottom: 4,
						width: 36,
						background: "linear-gradient(to right, transparent, var(--color-bg, var(--color-surface)))",
					}}
				/>
			</div>
		</div>
	);
}

function SavedTab({ onOpen, onOpenCompany, savedIds, onToggleSave, t }) {
	const [jobs, setJobs] = useState(null);

	useEffect(() => {
		let alive = true;
		(async () => {
			if (!savedIds.length) { if (alive) setJobs([]); return; }
			const rows = await Promise.all(savedIds.map((id) => getJob(id).catch(() => null)));
			if (alive) setJobs(rows.filter(Boolean));
		})();
		return () => { alive = false; };
	}, [savedIds]);

	if (jobs === null) return <Skel w="100%" h={90} r={16} />;
	if (jobs.length === 0) return <div className="text-text-secondary" style={{ ...card, fontFamily: FONT }}>{t("jobs.noSaved", { defaultValue: "No saved jobs yet. Tap Save on a listing to keep it here." })}</div>;

	return (
		<div style={{ display: "grid", gap: 14 }}>
			{jobs.map((j) => (
				<JobCard key={j.job_id} job={j} onOpen={onOpen} onOpenCompany={onOpenCompany} saved onToggleSave={onToggleSave} t={t} />
			))}
		</div>
	);
}

function JobDetailModal({ jobStub, onClose, savedIds, onToggleSave, onOpenCompany, t, isMobile }) {
	const [job, setJob] = useState(jobStub);
	const [panel, setPanel] = useState("detail"); // detail | apply | report
	const [profile, setProfile] = useState(null);
	const isAd = jobStub.is_ad || typeof jobStub.job_id !== "number";
	const applyGate = canApplyToJob(job);
	const companyId = companyIdFromJob(job);
	const TYPE_LABEL = typeLabelMap(t);

	useEffect(() => {
		if (isAd) return;
		getJob(jobStub.job_id).then(setJob).catch(() => {});
		getMyCandidate().then(setProfile).catch(() => setProfile({}));
		trackJobEvent("job_viewed", { job_id: jobStub.job_id });
	}, [jobStub.job_id, isAd]);

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(`${window.location.origin}${jobSharePath(job.job_id)}`);
		} catch { /* ignore */ }
	};

	const companyName = job.agents?.company_name || t("jobs.aCompany", { defaultValue: "A company" });

	const title = panel === "apply"
		? `${t("jobs.applyTitle", { defaultValue: "Apply" })} — ${job.job_name || ""}`
		: panel === "report"
			? t("jobs.reportTitle", { defaultValue: "Report this job" })
			: (job.job_name || t("jobs.title", { defaultValue: "Jobs" }));

	const footer = panel === "detail" ? (
		<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
			{isAd ? (
				<a href={isSafeHttpUrl(job.target_url) ? job.target_url : "#"} target="_blank" rel="noopener noreferrer" style={{ ...btn(false), textDecoration: "none", display: "inline-block", flex: isMobile ? "1 1 auto" : undefined }}>{t("jobs.learnMore", { defaultValue: "Learn more" })}</a>
			) : (
				<>
					<button type="button" onClick={() => setPanel("apply")} disabled={!applyGate.ok} style={{ ...btn(!applyGate.ok), flex: isMobile ? "1 1 140px" : undefined }}>{t("jobs.applyNow", { defaultValue: "Apply now" })}</button>
					{canEasyApply(profile) && applyGate.ok && (
						<button
							type="button"
							style={ghostBtn}
							onClick={async () => {
								try {
									const res = await applyToJob({ job_id: job.job_id, cv_url: profile.resume_url });
									trackJobEvent("job_applied", {
										job_id: job.job_id,
										job_application_id: res?.data?.job_application_id || res?.job_application_id,
									});
									onClose();
								} catch (err) {
									setPanel("apply");
									window.alert(err?.response?.data?.message || err?.response?.data?.error || "Couldn't Easy Apply — try the full form.");
								}
							}}
						>
							{t("jobs.easyApply", { defaultValue: "Easy Apply" })}
						</button>
					)}
					{typeof job.job_id === "number" && (
						<>
							<button type="button" style={ghostBtn} onClick={() => onToggleSave(job.job_id)}>
								{savedIds.includes(job.job_id) ? t("jobs.unsave", { defaultValue: "Unsave" }) : t("jobs.save", { defaultValue: "Save" })}
							</button>
							<button type="button" style={ghostBtn} onClick={copyLink}>{t("jobs.copyLink", { defaultValue: "Copy link" })}</button>
							{canReportJob(job) && (
								<button type="button" style={{ ...ghostBtn, color: "#f87171", borderColor: "#f8717155" }} onClick={() => setPanel("report")}>
									{t("jobs.report", { defaultValue: "Report" })}
								</button>
							)}
						</>
					)}
				</>
			)}
		</div>
	) : null;

	return (
		<JobSheet
			isMobile={isMobile}
			onClose={onClose}
			title={title}
			maxWidth={panel === "detail" ? 680 : 480}
			labelledBy="Job detail"
			footer={footer}
			headerRight={panel !== "detail" ? (
				<button type="button" onClick={() => setPanel("detail")} style={{ ...ghostBtn, padding: "6px 10px", fontSize: 12.5 }}>
					Back
				</button>
			) : null}
		>
			{panel === "apply" ? (
				<ApplyForm job={job} profile={profile} t={t} onDone={onClose} />
			) : panel === "report" ? (
				<ReportForm job={job} t={t} onDone={() => setPanel("detail")} />
			) : (
				<>
					{companyId && typeof onOpenCompany === "function" ? (
						<button
							type="button"
							onClick={() => { onClose(); onOpenCompany(companyId); }}
							style={{ background: "none", border: "none", padding: 0, marginBottom: 10, cursor: "pointer", fontFamily: FONT, fontSize: 15, color: ACCENT, textDecoration: "underline", textUnderlineOffset: 2 }}
						>
							{companyName}
						</button>
					) : (
						<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 15, marginBottom: 10 }}>{companyName}</div>
					)}
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 14px" }}>
						{job.location && <Chip>{job.location}</Chip>}
						{job.is_remote && <Chip>{t("jobs.remote", { defaultValue: "Remote" })}</Chip>}
						{job.employment_type && <Chip>{TYPE_LABEL[job.employment_type] || job.employment_type}</Chip>}
						{job.experience_level && <Chip>{job.experience_level}</Chip>}
						{salaryText(job) && <Chip accent>{salaryText(job)}</Chip>}
					</div>
					<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
						{job.description || t("jobs.noDescription", { defaultValue: "No description provided." })}
					</div>
					{job.deadline && <div style={{ ...label, marginTop: 14 }}>{t("jobs.applyBefore", { date: new Date(job.deadline).toLocaleDateString(), defaultValue: `Apply before ${new Date(job.deadline).toLocaleDateString()}` })}</div>}
					{!applyGate.ok && !isAd && (
						<div style={{ marginTop: 12, fontFamily: FONT, fontSize: 13, color: "#f87171" }}>{applyGate.reason}</div>
					)}
				</>
			)}
		</JobSheet>
	);
}

function ReportForm({ job, t, onDone }) {
	const [reason, setReason] = useState("scam");
	const [details, setDetails] = useState("");
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState(null);

	const submit = async () => {
		setBusy(true); setMsg(null);
		try {
			await reportJob(job.job_id, { reason, details: details.trim() || undefined });
			setMsg({ ok: true, text: t("jobs.reportThanks", { defaultValue: "Thanks — we received your report." }) });
			setTimeout(onDone, 900);
		} catch (err) {
			setMsg({
				ok: false,
				text: err?.response?.data?.message || err?.response?.data?.error || t("jobs.reportFailed", { defaultValue: "Couldn't submit the report." }),
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 14px" }}>
				{t("jobs.reportBlurb", { defaultValue: "Flag scam, misleading pay, or abusive listings. Our team reviews reports and can remove or suspend the posting." })}
			</p>
			<label style={{ ...label, display: "block", marginBottom: 6 }}>{t("jobs.reason", { defaultValue: "Reason" })}</label>
			<select style={{ ...input, width: "100%", marginBottom: 12 }} value={reason} onChange={(e) => setReason(e.target.value)}>
				{JOB_REPORT_REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
			</select>
			<label style={{ ...label, display: "block", marginBottom: 6 }}>{t("jobs.detailsOptional", { defaultValue: "Details (optional)" })}</label>
			<textarea
				style={{ ...input, width: "100%", minHeight: 90, resize: "vertical", marginBottom: 14 }}
				value={details}
				onChange={(e) => setDetails(e.target.value)}
				placeholder="What looked wrong?"
			/>
			<button type="button" disabled={busy} onClick={submit} style={{ ...btn(busy), width: "100%" }}>{busy ? "Sending…" : t("jobs.submitReport", { defaultValue: "Submit report" })}</button>
			{msg && <div style={{ marginTop: 12, fontSize: 13, fontFamily: FONT, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
		</>
	);
}

function ApplyForm({ job, profile, t, onDone }) {
	const [coverLetter, setCoverLetter] = useState("");
	const [link, setLink] = useState(profile?.resume_url || "");
	const [file, setFile] = useState(null);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState(null);

	useEffect(() => {
		setLink(profile?.resume_url || "");
	}, [profile?.resume_url]);

	const submit = async () => {
		const gate = canApplyToJob(job);
		if (!gate.ok) { setMsg({ ok: false, text: gate.reason }); return; }
		setBusy(true); setMsg(null);
		try {
			let cvUrl = link.trim() || undefined;
			if (cvUrl && !isSafeHttpUrl(cvUrl)) {
				setMsg({ ok: false, text: t("jobs.unsafeResumeUrl", { defaultValue: "Résumé link must be a valid http(s) URL." }) });
				setBusy(false);
				return;
			}
			if (file) { const up = await uploadResume(file); cvUrl = up?.url || cvUrl; }
			const res = await applyToJob({ job_id: job.job_id, cover_letter: coverLetter.trim() || undefined, cv_url: cvUrl });
			trackJobEvent("job_applied", {
				job_id: job.job_id,
				job_application_id: res?.data?.job_application_id || res?.job_application_id,
			});
			setMsg({ ok: true, text: t("jobs.applicationSubmitted", { defaultValue: "Application submitted." }) });
			setTimeout(onDone, 1200);
		} catch (err) {
			setMsg({ ok: false, text: err?.response?.data?.message || err?.response?.data?.error || "Couldn't submit your application." });
		} finally { setBusy(false); }
	};

	return (
		<>
			{canEasyApply(profile) && (
				<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, marginTop: 0 }}>
					Your saved résumé is ready — submit as-is or replace it below.
				</p>
			)}
			<div style={{ ...label, marginTop: 8 }}>{t("jobs.coverLetter", { defaultValue: "Cover letter" })} (optional)</div>
			<textarea style={{ ...input, width: "100%", minHeight: 110, marginTop: 8, resize: "vertical" }} placeholder="Tell the employer why you're a great fit…" value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} />
			<div style={{ ...label, marginTop: 16 }}>{t("jobs.resume", { defaultValue: "Résumé" })} — upload a file</div>
			<input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-text-secondary" style={{ marginTop: 8, fontFamily: FONT, fontSize: 14 }} />
			<div style={{ ...label, marginTop: 16 }}>…or paste a link</div>
			<input style={{ ...input, width: "100%", marginTop: 8 }} placeholder="https://link-to-your-resume" value={link} onChange={(e) => setLink(e.target.value)} />
			<button type="button" onClick={submit} disabled={busy} style={{ ...btn(busy), width: "100%", marginTop: 18 }}>{busy ? "Submitting…" : t("jobs.submitApplication", { defaultValue: "Submit application" })}</button>
			{msg && <div style={{ marginTop: 12, fontSize: 13, fontFamily: FONT, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
		</>
	);
}

function ApplicationsTab({ onOpenCompany, t } = {}) {
	const tt = t || ((k, o) => o?.defaultValue || k);
	const [apps, setApps] = useState(null);
	const [msgBusy, setMsgBusy] = useState(null);
	const [flash, setFlash] = useState(null);
	const load = useCallback(() => { getMyApplications().then(setApps).catch(() => setApps([])); }, []);
	useEffect(() => { load(); }, [load]);

	const withdraw = async (id) => {
		setFlash(null);
		try {
			await withdrawApplication(id);
			load();
		} catch {
			setFlash({ ok: false, text: tt("jobs.withdrawFailed", { defaultValue: "Couldn't withdraw that application. Try again." }) });
		}
	};

	const messageEmployer = async (a) => {
		const id = jobApplicationChatId(a);
		if (!canOpenJobApplicationChat(a) || !id) return;
		setMsgBusy(id);
		try {
			await openContextChat(JOB_APPLICATION_CHAT_CONTEXT, id, {
				initialMessage: buildJobApplicationChatIntro({
					role: "applicant",
					jobName: a.jobs?.job_name,
					companyName: a.jobs?.agents?.company_name,
				}),
				introOnCreateOnly: true,
			});
		} catch {
			window.alert("Couldn't open the conversation. Try again.");
		} finally {
			setMsgBusy(null);
		}
	};

	if (apps === null) return <Skel w="100%" h={90} r={16} />;
	if (apps.length === 0) return <div className="text-text-secondary" style={{ ...card, fontFamily: FONT }}>You haven&apos;t applied to any jobs yet.</div>;

	return (
		<div style={{ display: "grid", gap: 12 }}>
			{flash && <div style={{ fontSize: 13, fontFamily: FONT, color: flash.ok ? "#4ade80" : "#f87171" }}>{flash.text}</div>}
			{apps.map((a) => {
				const companyId = companyIdFromJob(a.jobs);
				const companyName = a.jobs?.agents?.company_name || "A company";
				return (
				<div key={a.job_application_id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
					<div>
						<div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 19 }}>{a.jobs?.job_name || "Job"}</div>
						<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13.5, marginTop: 2 }}>
							{companyId && typeof onOpenCompany === "function" ? (
								<button
									type="button"
									onClick={() => onOpenCompany(companyId)}
									style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: ACCENT, textDecoration: "underline", textUnderlineOffset: 2 }}
								>
									{companyName}
								</button>
							) : companyName}
							{a.application_date && <span className="text-text-muted" style={{ marginLeft: 8 }}>Applied {new Date(a.application_date).toLocaleDateString()}</span>}
						</div>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
						<StatusBadge status={a.status} />
						<button
							type="button"
							onClick={() => messageEmployer(a)}
							disabled={msgBusy === a.job_application_id}
							style={{ ...ghostBtn, padding: "7px 12px", fontSize: 13 }}
						>
							{msgBusy === a.job_application_id ? "Opening…" : tt("jobs.message", { defaultValue: "Message" })}
						</button>
						{a.status === "applied" && <button type="button" onClick={() => withdraw(a.job_application_id)} style={{ ...ghostBtn, padding: "7px 12px", fontSize: 13 }}>{tt("jobs.withdraw", { defaultValue: "Withdraw" })}</button>}
					</div>
				</div>
				);
			})}
		</div>
	);
}

function ProfileTab({ onCompletenessChange } = {}) {
	const { isMobile } = useViewport();
	const [p, setP] = useState(null);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState(null);
	const me = getUser();

	useEffect(() => { getMyCandidate().then(setP).catch(() => setP({})); }, []);
	useEffect(() => {
		if (p) onCompletenessChange?.(profileCompleteness(p));
	}, [p, onCompletenessChange]);
	const set = (k, v) => setP((s) => ({ ...s, [k]: v }));

	const onResumeJsonChange = (resumeJson) => {
		set("resume_json", resumeJson);
	};

	const portfolioItems = normalizePortfolioList(p);

	const refreshPortfolio = (nextItems) => {
		setP((s) => ({
			...s,
			portfolio: nextItems,
			candidate_portfolio_item: nextItems,
		}));
	};

	const onResume = async (file) => {
		if (!file) return;
		setMsg(null);
		try {
			const up = await uploadResume(file);
			set("resume_url", up?.url);
			setMsg({ ok: true, text: "Résumé uploaded." });
		} catch {
			setMsg({ ok: false, text: "Couldn't upload that résumé. Try a PDF or image." });
		}
	};

	const save = async () => {
		if (p.resume_url && !isSafeHttpUrl(p.resume_url)) {
			setMsg({ ok: false, text: "Résumé link must be a valid http(s) URL." });
			return;
		}
		setBusy(true); setMsg(null);
		try {
			const saved = await updateMyCandidate({
				headline: p.headline, bio: p.bio, skills: p.skills, location: p.location,
				resume_url: p.resume_url,
				resume_json: normalizeResumeJson(parseResumeJson(p.resume_json)),
				desired_salary: p.desired_salary ? Number(p.desired_salary) : null,
				years_experience: p.years_experience ? Number(p.years_experience) : null,
				discoverable: Boolean(p.discoverable),
			});
			setP((s) => ({
				...s,
				...saved,
				portfolio: normalizePortfolioList(saved?.portfolio ?? s.portfolio),
				resumes: Array.isArray(saved?.resumes) ? saved.resumes : s.resumes,
			}));
			setMsg({ ok: true, text: "Profile saved." });
		} catch { setMsg({ ok: false, text: "Couldn't save your profile." }); }
		finally { setBusy(false); }
	};

	if (p === null) {
		return (
			<div style={{ display: "grid", gap: 12 }} aria-busy="true" aria-label="Loading profile">
				<Skel w="100%" h={72} r={16} />
				<Skel w="100%" h={200} r={16} />
				<Skel w="100%" h={140} r={16} />
			</div>
		);
	}

	const completeness = profileCompleteness(p);
	const resumes = Array.isArray(p.resumes) ? p.resumes : [];

	return (
		<div className="jobs-card" style={{ ...card, display: "grid", gap: 16, maxWidth: isMobile ? "100%" : 960 }}>
			{completeness.percent < 100 && (
				<div
					className="jobs-feedback"
					style={{
						padding: "12px 14px",
						borderRadius: 12,
						background: "color-mix(in srgb, #2563eb 8%, transparent)",
						border: "1px solid color-mix(in srgb, #2563eb 24%, transparent)",
						fontFamily: FONT,
						fontSize: 13,
						lineHeight: 1.5,
						color: "var(--color-text-secondary)",
					}}
				>
					Profile {completeness.percent}% complete. Employers see this when you apply.
					{!canEasyApply(p) && (
						<span className="jobs-feedback jobs-feedback--warn" style={{ display: "block", marginTop: 8 }}>
							Add a résumé to unlock Easy Apply.
						</span>
					)}
				</div>
			)}
			<Field label="Headline"><input className="jobs-input" style={{ ...input, width: "100%" }} placeholder="e.g. Senior Backend Engineer" value={p.headline || ""} onChange={(e) => set("headline", e.target.value)} /></Field>
			<ResumeBuilder
				value={p.resume_json}
				onChange={onResumeJsonChange}
				profileName={me?.name || me?.username}
				profileHeadline={p.headline}
			/>
			<ResumeVersionsPanel
				resumes={resumes}
				activeResumeJson={normalizeResumeJson(parseResumeJson(p.resume_json))}
				onChangeResumes={(next) => setP((s) => ({ ...s, resumes: next }))}
				onLoadVersion={(row) => {
					set("resume_json", row.resume_json);
					if (row.resume_url) set("resume_url", row.resume_url);
					setMsg({ ok: true, text: `Loaded “${row.label}”. Save profile when ready.` });
				}}
				onPdfUrl={(url) => {
					set("resume_url", url);
					setMsg({ ok: true, text: "Server PDF generated and linked." });
				}}
			/>
			<PortfolioGallery
				items={portfolioItems}
				onUploadFile={async (file) => {
					const created = await uploadPortfolioFile(file);
					refreshPortfolio([...portfolioItems, created]);
				}}
				onAddLink={async ({ url, title }) => {
					const created = await addPortfolioItem({ url, title });
					refreshPortfolio([...portfolioItems, created]);
				}}
				onRemove={async (item) => {
					await deletePortfolioItem(item.portfolio_item_id);
					refreshPortfolio(portfolioItems.filter((x) => x.portfolio_item_id !== item.portfolio_item_id));
				}}
			/>
			<label
				className="jobs-toggle"
				style={{
					display: "flex",
					alignItems: "flex-start",
					gap: 12,
					fontFamily: FONT,
					fontSize: 14,
					color: "var(--color-text-secondary)",
					lineHeight: 1.45,
					padding: "14px 16px",
					borderRadius: 14,
					border: `1px solid ${p.discoverable ? "color-mix(in srgb, #2563eb 40%, var(--color-border))" : "var(--color-border)"}`,
					background: p.discoverable
						? "color-mix(in srgb, #2563eb 8%, var(--color-surface-raised))"
						: "var(--color-surface-raised)",
					cursor: "pointer",
				}}
			>
				<input
					type="checkbox"
					checked={Boolean(p.discoverable)}
					onChange={(e) => set("discoverable", e.target.checked)}
					style={{ marginTop: 3, width: 16, height: 16, accentColor: ACCENT }}
					aria-describedby="jobs-discoverable-hint"
				/>
				<span>
					<strong style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>Visible in employer talent pool</strong>
					<span id="jobs-discoverable-hint" style={{ display: "block", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
						Opt in so hiring managers can find you without an application. You can turn this off anytime.
					</span>
				</span>
			</label>
			<TalentBoostPanel
				discoverable={Boolean(p.discoverable)}
				boosted={Boolean(p.talent_boosted)}
				boostedUntil={p.talent_boosted_until}
				plans={p.talent_boost_plans}
				onBoosted={(res) => {
					setP((s) => ({
						...s,
						talent_boosted: true,
						talent_boosted_until: res?.talent_boosted_until,
						discoverable: true,
					}));
				}}
			/>
			<Field label="About you"><textarea className="jobs-input" style={{ ...input, width: "100%", minHeight: 90, resize: "vertical" }} value={p.bio || ""} onChange={(e) => set("bio", e.target.value)} /></Field>
			<Field label="Skills (comma separated)"><input className="jobs-input" style={{ ...input, width: "100%" }} placeholder="JavaScript, Node.js, React" value={p.skills || ""} onChange={(e) => set("skills", e.target.value)} /></Field>
			<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
				<Field label="Location" style={{ flex: "1 1 180px" }}><input className="jobs-input" style={{ ...input, width: "100%" }} value={p.location || ""} onChange={(e) => set("location", e.target.value)} /></Field>
				<Field label="Desired salary" style={{ flex: "1 1 140px" }}><input className="jobs-input" style={{ ...input, width: "100%" }} type="number" value={p.desired_salary || ""} onChange={(e) => set("desired_salary", e.target.value)} /></Field>
				<Field label="Years experience" style={{ flex: "1 1 120px" }}><input className="jobs-input" style={{ ...input, width: "100%" }} type="number" value={p.years_experience || ""} onChange={(e) => set("years_experience", e.target.value)} /></Field>
			</div>
			<Field label="Résumé">
				<div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
					<input type="file" accept=".pdf,image/*" onChange={(e) => onResume(e.target.files?.[0])} className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 14 }} />
					{isSafeHttpUrl(p.resume_url) && <a href={p.resume_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontFamily: FONT, fontSize: 14, fontWeight: 600 }}>Current résumé</a>}
				</div>
			</Field>
			<div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
				<button type="button" className="jobs-btn jobs-btn--primary" onClick={save} disabled={busy} style={btn(busy)} aria-busy={busy}>{busy ? "Saving…" : "Save profile"}</button>
				{msg && (
					<span
						className={`jobs-feedback ${msg.ok ? "jobs-feedback--ok" : "jobs-feedback--err"}`}
						role={msg.ok ? "status" : "alert"}
						style={{ fontSize: 13, fontFamily: FONT, fontWeight: 600 }}
					>
						{msg.text}
					</span>
				)}
			</div>
		</div>
	);
}

function Field({ label: lbl, children, style }) {
	return <div style={style}><div style={{ ...label, marginBottom: 6 }}>{lbl}</div>{children}</div>;
}
