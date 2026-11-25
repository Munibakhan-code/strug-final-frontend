import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
	getMyEmployer, createEmployer, updateEmployer, getMyPostedJobs, createJob,
	updateJob, deleteJob, setJobStatus, getJobApplicants, setApplicationStatus, getJobCategories,
	setApplicationNotes, setApplicationInterview, getApplicationTimeline, bulkSetApplicationStatus,
	getEmployerJobAnalytics,
} from "../api/jobs";
import { uploadImage } from "../api/shop";
import { openContextChat } from "../api/chat";
import { usePageLoad } from "../hooks/usePageLoad.js";
import { usePageI18n } from "../hooks/usePageI18n.js";
import { useViewport } from "../hooks/useViewport.js";
import { Skel } from "../components/skeletons.jsx";
import {
	EMPTY_JOB_FORM,
	jobToForm,
	validateJobForm,
	buildJobPayload,
	nextListingStatus,
	filterPostings,
	summarizePostings,
	validateCompanyForm,
	buildCompanyPayload,
} from "../utils/employerJobs.js";
import {
	COMPANY_SIZE_OPTIONS,
	COMPANY_INDUSTRY_OPTIONS,
	companySharePath,
} from "../utils/companyJobs.js";
import {
	PIPELINE_ACTIONS,
	validateEmployerNote,
	normalizeEmployerNote,
	validateInterviewInput,
	buildBulkStatusPayload,
	toggleSelectedId,
	buildTimelineFromEvents,
	summarizeApplicationFunnel,
	resumeViewerKind,
	isSafeHttpUrl,
} from "../utils/employerAts.js";
import {
	JOB_APPLICATION_CHAT_CONTEXT,
	canOpenJobApplicationChat,
	jobApplicationChatId,
	buildJobApplicationChatIntro,
} from "../utils/jobMessaging.js";
import { salaryDisclosureNudge } from "../utils/jobModeration.js";
import { JobSheet } from "../components/jobs/JobSheet.jsx";
import StructuredResumeSummary from "../components/jobs/StructuredResumeSummary.jsx";
import TalentPoolPanel from "../components/jobs/TalentPoolPanel.jsx";
import PortfolioGallery from "../components/jobs/PortfolioGallery.jsx";
import { normalizePortfolioList } from "../utils/candidatePortfolio.js";
import {
	JOBS_ACCENT as ACCENT,
	JOBS_FONT as FONT,
	JOBS_HEAD as HEAD,
	jobsPageOuterStyle,
	jobsPageInnerStyle,
} from "../components/jobs/jobsLayout.js";

const card = {
	background: "var(--color-surface)",
	border: "1px solid var(--color-border)",
	borderRadius: 16,
	padding: "18px 20px",
	transition: "border-color 0.15s, box-shadow 0.2s",
};
const h1 = { fontFamily: HEAD, fontWeight: 800, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "0.12em", textTransform: "uppercase", margin: 0, lineHeight: 1.1 };
const label = { fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" };
const btn = (disabled) => ({
	padding: "11px 18px",
	background: disabled ? "var(--color-border)" : ACCENT,
	border: "none",
	borderRadius: 12,
	color: disabled ? "var(--color-text-muted)" : "#fff",
	fontFamily: FONT,
	fontSize: 14,
	fontWeight: 700,
	cursor: disabled ? "not-allowed" : "pointer",
	minHeight: 44,
});
const ghostBtn = {
	padding: "9px 14px",
	background: "transparent",
	border: "1px solid var(--color-border)",
	borderRadius: 12,
	color: "var(--color-text-primary)",
	fontFamily: FONT,
	fontSize: 13.5,
	fontWeight: 600,
	cursor: "pointer",
	minHeight: 40,
};
const dangerBtn = { ...ghostBtn, borderColor: "#f8717188", color: "#f87171" };
const input = {
	background: "var(--color-surface)",
	border: "1px solid var(--color-border)",
	borderRadius: 10,
	padding: "11px 14px",
	color: "var(--color-text-primary)",
	fontFamily: FONT,
	fontSize: 14,
	outline: "none",
	width: "100%",
	boxSizing: "border-box",
};

const PIPELINE = PIPELINE_ACTIONS;
const STATUS_COLOR = {
	applied: "#60a5fa", reviewed: "#fbbf24", shortlisted: "#a78bfa",
	rejected: "#f87171", hired: "#4ade80", open: "#4ade80", closed: "#94a3b8", draft: "#fbbf24",
};
const TYPE_LABEL = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship" };

function Badge({ status }) {
	const c = STATUS_COLOR[status] || "#94a3b8";
	return (
		<span style={{
			fontSize: 12, fontWeight: 700, color: c, background: `${c}22`,
			border: `1px solid ${c}55`, borderRadius: 999, padding: "3px 10px",
			textTransform: "capitalize", fontFamily: FONT, whiteSpace: "nowrap",
		}}
		>
			{status}
		</span>
	);
}

function Field({ label: lbl, children, style }) {
	return <div style={style}><div style={{ ...label, marginBottom: 6 }}>{lbl}</div>{children}</div>;
}

function stickyChrome(isMobile) {
	return {
		position: "sticky",
		top: 0,
		zIndex: 6,
		marginLeft: isMobile ? -4 : 0,
		marginRight: isMobile ? -4 : 0,
		paddingTop: 4,
		paddingBottom: 10,
		background: "color-mix(in srgb, var(--color-bg, var(--color-surface)) 88%, transparent)",
		backdropFilter: "blur(12px)",
		WebkitBackdropFilter: "blur(12px)",
	};
}

export default function EmployerPage({ onNavigate } = {}) {
	const loading = usePageLoad(400);
	const { t, landingTitle } = usePageI18n("employer");
	const { isMobile } = useViewport();
	const outer = useMemo(() => jobsPageOuterStyle(isMobile), [isMobile]);
	const inner = useMemo(() => jobsPageInnerStyle(isMobile), [isMobile]);
	const [employer, setEmployer] = useState(undefined);
	const [tab, setTab] = useState("postings");
	const [editingJob, setEditingJob] = useState(null);

	const loadEmployer = useCallback(() => {
		getMyEmployer().then((e) => setEmployer(e || null)).catch(() => setEmployer(null));
	}, []);
	useEffect(() => { loadEmployer(); }, [loadEmployer]);

	const goPost = (job = null) => {
		setEditingJob(job);
		setTab("post");
	};

	const tabs = [
		["postings", t("employer.myPostings", { defaultValue: "My postings" })],
		["post", editingJob ? t("employer.editJob", { defaultValue: "Edit job" }) : t("employer.postJob", { defaultValue: "Post a job" })],
		["talent", t("employer.talentPool", { defaultValue: "Talent pool" })],
		["company", t("employer.companyProfile", { defaultValue: "Company profile" })],
	];

	if (loading || employer === undefined) {
		return (
			<div style={outer} className="styled-scrollbar">
				<div style={inner}>
					<Skel w={260} h={40} r={8} /><div style={{ height: 20 }} /><Skel w="100%" h={160} r={16} />
				</div>
			</div>
		);
	}

	return (
		<div style={outer} className="styled-scrollbar">
			<div style={inner}>
				{typeof onNavigate === "function" && (
					<button
						type="button"
						onClick={() => onNavigate("jobs")}
						style={{ ...ghostBtn, marginBottom: 12, padding: "8px 12px" }}
					>
						{t("employer.backToJobs", { defaultValue: "← Back to Jobs" })}
					</button>
				)}
				<h1 style={h1}>{landingTitle || t("employer.title", { defaultValue: "Employer" })}</h1>
				<p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: isMobile ? 14 : 15, lineHeight: 1.55, margin: "10px 0 0", maxWidth: 620 }}>
					{t("employer.subtitle", { defaultValue: "Post roles, review applicants, and manage your hiring pipeline — all under your Strug company profile." })}
				</p>

				{employer === null ? (
					<CompanyForm onSaved={loadEmployer} intro isMobile={isMobile} />
				) : (
					<>
						<div style={stickyChrome(isMobile)}>
							<div
								className="styled-scrollbar"
								style={{
									display: "flex",
									gap: 8,
									marginTop: 16,
									overflowX: isMobile ? "auto" : "visible",
									flexWrap: isMobile ? "nowrap" : "wrap",
									WebkitOverflowScrolling: "touch",
									paddingBottom: 2,
								}}
							>
								{tabs.map(([id, lbl]) => (
									<button
										key={id}
										type="button"
										className={`jobs-btn${tab === id ? " jobs-btn--primary" : ""}`}
										aria-pressed={tab === id}
										onClick={() => {
											if (id === "post") setEditingJob(null);
											setTab(id);
										}}
										style={{
											...ghostBtn,
											padding: "10px 16px",
											flexShrink: 0,
											whiteSpace: "nowrap",
											minHeight: 40,
											transition: "background-color 180ms ease-out, border-color 180ms ease-out, color 180ms ease-out, box-shadow 180ms ease-out",
											...(tab === id ? { background: ACCENT, borderColor: ACCENT, color: "#fff", boxShadow: "0 4px 14px color-mix(in srgb, #2563eb 28%, transparent)" } : {}),
										}}
									>
										{lbl}
									</button>
								))}
							</div>
						</div>
						{tab === "postings" ? (
							<PostingsTab onEdit={goPost} onCreate={() => goPost(null)} t={t} isMobile={isMobile} />
						) : tab === "post" ? (
							<PostJobTab
								editingJob={editingJob}
								onDone={() => { setEditingJob(null); setTab("postings"); }}
								onCancelEdit={() => { setEditingJob(null); setTab("postings"); }}
								isMobile={isMobile}
							/>
						) : tab === "talent" ? (
							<TalentPoolPanel isMobile={isMobile} />
						) : (
							<CompanyForm employer={employer} onSaved={loadEmployer} isMobile={isMobile} />
						)}
					</>
				)}
			</div>
		</div>
	);
}

function CompanyForm({ employer, onSaved, intro, isMobile }) {
	const [f, setF] = useState({
		company_name: employer?.company_name || "",
		industry: employer?.industry || "",
		company_size: employer?.company_size || "",
		company_country: employer?.company_country || "",
		company_web_url: employer?.company_web_url || "",
		company_description: employer?.company_description || "",
		company_logo_url: employer?.company_logo_url || "",
	});
	const [busy, setBusy] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [msg, setMsg] = useState(null);
	const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

	const save = async () => {
		const err = validateCompanyForm(f);
		if (err) { setMsg({ ok: false, text: err }); return; }
		setBusy(true); setMsg(null);
		try {
			const payload = buildCompanyPayload(f);
			if (employer?.agent_id) await updateEmployer(employer.agent_id, payload);
			else await createEmployer(payload);
			setMsg({ ok: true, text: "Company profile saved. You can post jobs from the Post a job tab." });
			onSaved?.();
		} catch { setMsg({ ok: false, text: "Couldn't save your company profile." }); }
		finally { setBusy(false); }
	};

	const onLogo = async (file) => {
		if (!file) return;
		setUploading(true); setMsg(null);
		try {
			const res = await uploadImage(file);
			const url = res?.url ?? res?.data?.url ?? res?.secure_url ?? res?.path ?? "";
			if (!url) throw new Error("no url");
			set("company_logo_url", url);
			setMsg({ ok: true, text: "Logo uploaded — save the company profile to keep it." });
		} catch { setMsg({ ok: false, text: "Couldn't upload the logo. Try a JPG or PNG." }); }
		finally { setUploading(false); }
	};

	const actions = (
		<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
			<button type="button" onClick={save} disabled={busy} style={{ ...btn(busy), flex: isMobile ? "1 1 auto" : undefined }}>
				{busy ? "Saving…" : "Save company profile"}
			</button>
			{employer?.agent_id && companySharePath(employer.agent_id) && (
				<a
					href={companySharePath(employer.agent_id)}
					target="_blank"
					rel="noreferrer"
					style={{ ...ghostBtn, textDecoration: "none", display: "inline-block" }}
				>
					View public page
				</a>
			)}
			{msg && <span style={{ fontSize: 13, fontFamily: FONT, color: msg.ok ? "#4ade80" : "#f87171", width: isMobile ? "100%" : undefined }}>{msg.text}</span>}
		</div>
	);

	return (
		<div style={{ ...card, display: "grid", gap: 14, maxWidth: 640, marginTop: intro ? 12 : 0 }}>
			{intro && (
				<div style={{ display: "grid", gap: 8 }}>
					<div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18 }}>Step 1 — Create your company profile</div>
					<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 14.5, lineHeight: 1.5 }}>
						Employers need a company profile before posting. After you save, use <strong>Post a job</strong> to publish openings and manage applicants.
					</div>
				</div>
			)}
			<Field label="Company logo">
				<div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
					{f.company_logo_url ? (
						<img src={f.company_logo_url} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", border: "1px solid var(--color-border)" }} />
					) : (
						<div className="bg-surface-raised border border-border" style={{ width: 56, height: 56, borderRadius: 12 }} />
					)}
					<label style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1 }}>
						{uploading ? "Uploading…" : "Upload logo"}
						<input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => onLogo(e.target.files?.[0])} />
					</label>
				</div>
			</Field>
			<Field label="Company name"><input style={input} value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
			<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
				<Field label="Industry" style={{ flex: "1 1 180px" }}>
					<select style={input} value={f.industry} onChange={(e) => set("industry", e.target.value)}>
						<option value="">Select industry</option>
						{COMPANY_INDUSTRY_OPTIONS.filter(Boolean).map((opt) => (
							<option key={opt} value={opt}>{opt}</option>
						))}
						{f.industry && !COMPANY_INDUSTRY_OPTIONS.includes(f.industry) && (
							<option value={f.industry}>{f.industry}</option>
						)}
					</select>
				</Field>
				<Field label="Company size" style={{ flex: "1 1 140px" }}>
					<select style={input} value={f.company_size} onChange={(e) => set("company_size", e.target.value)}>
						<option value="">Select size</option>
						{COMPANY_SIZE_OPTIONS.filter(Boolean).map((opt) => (
							<option key={opt} value={opt}>{opt}</option>
						))}
						{f.company_size && !COMPANY_SIZE_OPTIONS.includes(f.company_size) && (
							<option value={f.company_size}>{f.company_size}</option>
						)}
					</select>
				</Field>
				<Field label="Country" style={{ flex: "1 1 140px" }}><input style={input} value={f.company_country} onChange={(e) => set("company_country", e.target.value)} /></Field>
			</div>
			<Field label="Website"><input style={input} placeholder="https://…" value={f.company_web_url} onChange={(e) => set("company_web_url", e.target.value)} /></Field>
			<Field label="About the company">
				<textarea
					style={{ ...input, minHeight: isMobile ? 110 : 140, resize: "vertical" }}
					placeholder="Mission, culture, what candidates should know…"
					value={f.company_description}
					onChange={(e) => set("company_description", e.target.value)}
				/>
			</Field>
			{actions}
		</div>
	);
}

function PostJobTab({ editingJob, onDone, onCancelEdit, isMobile }) {
	const [categories, setCategories] = useState([]);
	const [f, setF] = useState(() => (editingJob ? jobToForm(editingJob) : { ...EMPTY_JOB_FORM }));
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState(null);
	const isEdit = Boolean(editingJob?.job_id);

	useEffect(() => { getJobCategories().then(setCategories).catch(() => {}); }, []);
	useEffect(() => {
		setF(editingJob ? jobToForm(editingJob) : { ...EMPTY_JOB_FORM });
		setMsg(null);
	}, [editingJob]);

	const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

	const save = async (status) => {
		const err = validateJobForm(f);
		if (err) { setMsg({ ok: false, text: err }); return; }
		setBusy(true); setMsg(null);
		try {
			const payload = buildJobPayload(f, { status });
			if (isEdit) await updateJob(editingJob.job_id, payload);
			else await createJob(payload);
			setMsg({
				ok: true,
				text: status === "draft"
					? (isEdit ? "Draft updated." : "Saved as draft. Publish it from My postings when ready.")
					: (isEdit ? "Job updated." : "Job posted. It's now live in the jobs feed."),
			});
			if (status !== "draft" || isEdit) {
				setTimeout(() => onDone?.(), 500);
			} else {
				setF({ ...EMPTY_JOB_FORM });
			}
		} catch (e) {
			setMsg({ ok: false, text: e?.response?.data?.error || "Couldn't save the job." });
		} finally {
			setBusy(false);
		}
	};

	return (
		<div style={{ ...card, display: "grid", gap: 14, maxWidth: 680 }}>
			{isEdit && (
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
					<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13.5 }}>Editing <strong>{editingJob.job_name}</strong></div>
					<button type="button" onClick={onCancelEdit} style={ghostBtn}>Cancel edit</button>
				</div>
			)}
			<Field label="Job title"><input style={input} placeholder="e.g. Backend Engineer" value={f.job_name} onChange={(e) => set("job_name", e.target.value)} /></Field>
			<Field label="Description"><textarea style={{ ...input, minHeight: isMobile ? 100 : 120, resize: "vertical" }} placeholder="Responsibilities, requirements, what you offer…" value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
			<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
				<Field label="Category" style={{ flex: "1 1 160px" }}>
					<select style={input} value={f.job_category_id} onChange={(e) => set("job_category_id", e.target.value)}>
						<option value="">Select…</option>
						{categories.map((c) => <option key={c.job_category_id} value={c.job_category_id}>{c.job_category_name}</option>)}
					</select>
				</Field>
				<Field label="Employment type" style={{ flex: "1 1 150px" }}>
					<select style={input} value={f.employment_type} onChange={(e) => set("employment_type", e.target.value)}>
						{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
					</select>
				</Field>
				<Field label="Experience level" style={{ flex: "1 1 130px" }}><input style={input} placeholder="e.g. mid" value={f.experience_level} onChange={(e) => set("experience_level", e.target.value)} /></Field>
			</div>
			<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
				<Field label="Location" style={{ flex: "1 1 160px" }}><input style={input} value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
				<Field label="Salary min" style={{ flex: "1 1 110px" }}><input style={input} type="number" value={f.salary_min} onChange={(e) => set("salary_min", e.target.value)} /></Field>
				<Field label="Salary max" style={{ flex: "1 1 110px" }}><input style={input} type="number" value={f.salary_max} onChange={(e) => set("salary_max", e.target.value)} /></Field>
				<Field label="Deadline" style={{ flex: "1 1 140px" }}><input style={input} type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
			</div>
			{salaryDisclosureNudge(f) && (
				<div className="text-text-muted" style={{ fontFamily: FONT, fontSize: 12.5, marginTop: -4 }}>
					{salaryDisclosureNudge(f)}
				</div>
			)}
			<label className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 14, cursor: "pointer" }}>
				<input type="checkbox" checked={f.is_remote} onChange={(e) => set("is_remote", e.target.checked)} /> This role is remote
			</label>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					flexWrap: "wrap",
					position: isMobile ? "sticky" : "static",
					bottom: isMobile ? 8 : undefined,
					paddingTop: isMobile ? 8 : 0,
					background: isMobile ? "var(--color-surface)" : undefined,
					zIndex: isMobile ? 2 : undefined,
				}}
			>
				<button type="button" onClick={() => save("open")} disabled={busy} style={{ ...btn(busy), flex: isMobile ? "1 1 140px" : undefined }}>
					{busy ? "Saving…" : (isEdit ? "Save & publish" : "Post job")}
				</button>
				<button type="button" onClick={() => save("draft")} disabled={busy} style={{ ...ghostBtn, flex: isMobile ? "1 1 120px" : undefined }}>
					{isEdit ? "Save as draft" : "Save draft"}
				</button>
				{msg && <span style={{ fontSize: 13, fontFamily: FONT, color: msg.ok ? "#4ade80" : "#f87171", width: isMobile ? "100%" : undefined }}>{msg.text}</span>}
			</div>
		</div>
	);
}

function PostingsTab({ onEdit, onCreate, t, isMobile }) {
	const tt = t || ((k, o) => o?.defaultValue || k);
	const [jobs, setJobs] = useState(null);
	const [loadError, setLoadError] = useState(null);
	const [pipelineJob, setPipelineJob] = useState(null);
	const [statusFilter, setStatusFilter] = useState("all");
	const [actionMsg, setActionMsg] = useState(null);
	const [funnel, setFunnel] = useState(null);

	const load = useCallback(() => {
		setLoadError(null);
		getMyPostedJobs()
			.then((rows) => setJobs(Array.isArray(rows) ? rows : []))
			.catch(() => { setJobs([]); setLoadError("Couldn't load your postings. Try again."); });
		getEmployerJobAnalytics()
			.then((a) => setFunnel(a))
			.catch(() => setFunnel(null));
	}, []);

	useEffect(() => {
		let alive = true;
		getMyPostedJobs()
			.then((rows) => { if (alive) setJobs(Array.isArray(rows) ? rows : []); })
			.catch(() => { if (alive) { setJobs([]); setLoadError("Couldn't load your postings. Try again."); } });
		getEmployerJobAnalytics()
			.then((a) => { if (alive) setFunnel(a); })
			.catch(() => { if (alive) setFunnel(null); });
		return () => { alive = false; };
	}, []);

	const toggle = async (job) => {
		setActionMsg(null);
		try {
			await setJobStatus(job.job_id, nextListingStatus(job.status || "open"));
			load();
		} catch { setActionMsg({ ok: false, text: "Couldn't update job status." }); }
	};

	const remove = async (job) => {
		const ok = window.confirm(`Delete “${job.job_name}”? This also removes its applications.`);
		if (!ok) return;
		setActionMsg(null);
		try {
			await deleteJob(job.job_id);
			if (pipelineJob?.job_id === job.job_id) setPipelineJob(null);
			load();
			setActionMsg({ ok: true, text: "Job deleted." });
		} catch { setActionMsg({ ok: false, text: "Couldn't delete the job." }); }
	};

	if (jobs === null) return <Skel w="100%" h={100} r={16} />;

	const summary = summarizePostings(jobs);
	const visible = filterPostings(jobs, statusFilter);
	const funnelRates = funnel ? summarizeApplicationFunnel(
		Object.entries(funnel.by_status || {}).flatMap(([status, n]) => Array.from({ length: n }, () => ({ status }))),
	).rates : null;

	return (
		<div style={{ display: "grid", gap: 14 }}>
			{funnel && funnel.total > 0 && (
				<div style={{ ...card, padding: isMobile ? "14px 14px" : "16px 18px" }}>
					<div style={{ ...label, marginBottom: 12 }}>{tt("employer.hiringFunnel", { defaultValue: "Hiring funnel" })}</div>
					<div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))", gap: 10 }}>
						{["applied", "reviewed", "shortlisted", "rejected", "hired"].map((s) => (
							<div
								key={s}
								style={{
									borderRadius: 12,
									padding: "10px 12px",
									border: `1px solid ${STATUS_COLOR[s]}44`,
									background: `${STATUS_COLOR[s]}14`,
								}}
							>
								<div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: STATUS_COLOR[s], lineHeight: 1 }}>
									{funnel.by_status?.[s] || 0}
								</div>
								<div style={{ fontFamily: FONT, fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4, textTransform: "capitalize" }}>{s}</div>
							</div>
						))}
					</div>
					{funnelRates && (
						<div className="text-text-muted" style={{ fontFamily: FONT, fontSize: 12.5, marginTop: 10 }}>
							Hire rate {funnelRates.hired}% · {summary.applicants} applicant{summary.applicants === 1 ? "" : "s"} across {summary.total} posting{summary.total === 1 ? "" : "s"}
						</div>
					)}
				</div>
			)}

			<div style={{ ...stickyChrome(isMobile), marginTop: 0 }}>
				<div
					className="styled-scrollbar"
					style={{
						display: "flex",
						gap: 8,
						overflowX: isMobile ? "auto" : "visible",
						flexWrap: isMobile ? "nowrap" : "wrap",
						WebkitOverflowScrolling: "touch",
						alignItems: "center",
					}}
				>
					{[
						["all", `All (${summary.total})`],
						["open", `Open (${summary.open})`],
						["draft", `Drafts (${summary.draft})`],
						["closed", `Closed (${summary.closed})`],
					].map(([id, lbl]) => (
						<button
							key={id}
							type="button"
							onClick={() => setStatusFilter(id)}
							style={{
								...ghostBtn,
								padding: "8px 12px",
								flexShrink: 0,
								whiteSpace: "nowrap",
								...(statusFilter === id ? { background: ACCENT, borderColor: ACCENT, color: "#fff" } : {}),
							}}
						>
							{lbl}
						</button>
					))}
					{!isMobile && (
						<span className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, marginLeft: "auto" }}>
							{summary.applicants} applicant{summary.applicants === 1 ? "" : "s"} total
						</span>
					)}
				</div>
			</div>

			{loadError && <div style={{ ...card, color: "#f87171", fontFamily: FONT }}>{loadError}</div>}
			{actionMsg && <div style={{ fontFamily: FONT, fontSize: 13, color: actionMsg.ok ? "#4ade80" : "#f87171" }}>{actionMsg.text}</div>}

			{jobs.length === 0 ? (
				<div className="text-text-secondary" style={{ ...card, fontFamily: FONT, display: "grid", gap: 12 }}>
					<div>You haven&apos;t posted any jobs yet.</div>
					<button type="button" onClick={onCreate} style={btn(false)}>Post your first job</button>
				</div>
			) : visible.length === 0 ? (
				<div className="text-text-secondary" style={{ ...card, fontFamily: FONT }}>No postings in this filter.</div>
			) : (
				visible.map((j) => {
					const count = j._count?.job_application ?? 0;
					return (
						<article key={j.job_id} style={{ ...card }}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
								<div style={{ minWidth: 0, flex: "1 1 220px" }}>
									<div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: isMobile ? 18 : 20, lineHeight: 1.2 }}>{j.job_name}</div>
									<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13.5, marginTop: 4 }}>
										{[j.location, j.employment_type && TYPE_LABEL[j.employment_type], j.is_remote && "Remote"].filter(Boolean).join(" · ") || "No location set"}
									</div>
									<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
										<Badge status={j.status || "open"} />
										<span className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13 }}>
											{count} applicant{count === 1 ? "" : "s"}
										</span>
									</div>
								</div>
								<div style={{ display: "flex", flexDirection: "column", gap: 8, flex: isMobile ? "1 1 100%" : "0 0 180px", minWidth: isMobile ? "100%" : 160 }}>
									<button
										type="button"
										onClick={() => setPipelineJob(j)}
										style={{ ...btn(false), padding: "10px 14px", fontSize: 13.5, width: "100%" }}
									>
										{tt("employer.viewApplicants", { defaultValue: "View applicants" })}
										{count > 0 ? ` · ${count}` : ""}
									</button>
									<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
										<button type="button" onClick={() => onEdit(j)} style={{ ...ghostBtn, flex: "1 1 70px" }}>{tt("employer.edit", { defaultValue: "Edit" })}</button>
										<button type="button" onClick={() => toggle(j)} style={{ ...ghostBtn, flex: "1 1 70px" }}>
											{(j.status || "open") === "draft"
												? tt("employer.publish", { defaultValue: "Publish" })
												: (j.status === "open" ? tt("employer.close", { defaultValue: "Close" }) : tt("employer.reopen", { defaultValue: "Reopen" }))}
										</button>
										<button type="button" onClick={() => remove(j)} style={{ ...dangerBtn, flex: "1 1 70px" }}>{tt("employer.delete", { defaultValue: "Delete" })}</button>
									</div>
								</div>
							</div>
						</article>
					);
				})
			)}

			{pipelineJob && (
				<JobSheet
					isMobile={isMobile}
					variant="drawer"
					onClose={() => setPipelineJob(null)}
					title={pipelineJob.job_name || tt("employer.applicants", { defaultValue: "Applicants" })}
					labelledBy="Applicant pipeline"
					maxWidth={520}
				>
					<ApplicantPipeline
						jobId={pipelineJob.job_id}
						jobName={pipelineJob.job_name}
						onChanged={load}
						t={tt}
						isMobile={isMobile}
					/>
				</JobSheet>
			)}
		</div>
	);
}

function ApplicantPipeline({ jobId, jobName, onChanged, t, isMobile }) {
	const tt = t || ((k, o) => o?.defaultValue || k);
	const [apps, setApps] = useState(null);
	const [err, setErr] = useState(null);
	const [selected, setSelected] = useState([]);
	const [bulkBusy, setBulkBusy] = useState(false);
	const [atsApp, setAtsApp] = useState(null);
	const [expandedLetter, setExpandedLetter] = useState(null);

	const load = useCallback(() => {
		setErr(null);
		getJobApplicants(jobId).then((rows) => {
			const list = Array.isArray(rows) ? rows : [];
			setApps(list);
			setAtsApp((cur) => {
				if (!cur) return null;
				return list.find((a) => a.job_application_id === cur.job_application_id) || null;
			});
		}).catch(() => { setApps([]); setErr("Couldn't load applicants."); });
	}, [jobId]);

	useEffect(() => {
		let alive = true;
		getJobApplicants(jobId).then((rows) => {
			if (!alive) return;
			const list = Array.isArray(rows) ? rows : [];
			setApps(list);
		}).catch(() => { if (alive) { setApps([]); setErr("Couldn't load applicants."); } });
		return () => { alive = false; };
	}, [jobId]);

	const move = async (id, status) => {
		setErr(null);
		try {
			await setApplicationStatus(id, status);
			load();
			onChanged?.();
		} catch {
			setErr("Couldn't update that applicant. Try again.");
		}
	};

	const runBulk = async (status) => {
		const payload = buildBulkStatusPayload(selected, status);
		if (!payload.ok) { setErr(payload.error); return; }
		setBulkBusy(true);
		setErr(null);
		try {
			await bulkSetApplicationStatus(payload.ids, payload.status);
			setSelected([]);
			load();
			onChanged?.();
		} catch {
			setErr("Couldn't update selected applicants.");
		} finally {
			setBulkBusy(false);
		}
	};

	if (atsApp) {
		return (
			<div style={{ display: "grid", gap: 12 }}>
				<button
					type="button"
					onClick={() => setAtsApp(null)}
					style={{ ...ghostBtn, justifySelf: "start", padding: "6px 12px", fontSize: 12.5 }}
				>
					← Back to applicants
				</button>
				<ApplicantDetail
					key={atsApp.job_application_id}
					app={atsApp}
					isMobile={isMobile}
					onSaved={() => { load(); onChanged?.(); }}
				/>
			</div>
		);
	}

	return (
		<div style={{ display: "grid", gap: 12 }}>
			{selected.length > 0 && (
				<div
					style={{
						display: "flex",
						gap: 8,
						flexWrap: "wrap",
						position: "sticky",
						top: 0,
						zIndex: 2,
						padding: "8px 0",
						background: "var(--color-surface)",
					}}
				>
					<button type="button" disabled={bulkBusy} onClick={() => runBulk("shortlisted")} style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12.5 }}>
						{tt("employer.shortlist", { defaultValue: "Shortlist" })} ({selected.length})
					</button>
					<button type="button" disabled={bulkBusy} onClick={() => runBulk("rejected")} style={{ ...dangerBtn, padding: "6px 12px", fontSize: 12.5 }}>
						{tt("employer.reject", { defaultValue: "Reject" })} ({selected.length})
					</button>
					<button type="button" onClick={() => setSelected([])} style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12.5 }}>Clear</button>
				</div>
			)}
			{err && <div style={{ fontFamily: FONT, fontSize: 13, color: "#f87171" }}>{err}</div>}
			{apps === null ? <Skel w="100%" h={80} r={12} />
				: apps.length === 0 ? (
					<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 14 }}>
						{tt("employer.noApplicants", { defaultValue: "No applicants yet." })}
					</div>
				) : (
					<div style={{ display: "grid", gap: 10 }}>
						{apps.map((a) => {
							const letterOpen = expandedLetter === a.job_application_id;
							const letter = a.cover_letter || "";
							const longLetter = letter.length > 160;
							return (
								<div key={a.job_application_id} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: "12px 14px" }}>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
										<label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", minWidth: 0, flex: "1 1 160px" }}>
											<input
												type="checkbox"
												checked={selected.includes(a.job_application_id)}
												onChange={() => setSelected((prev) => toggleSelectedId(prev, a.job_application_id))}
												style={{ marginTop: 4 }}
											/>
											<div style={{ minWidth: 0 }}>
												<div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15 }}>{a.candidate?.user?.name || "Candidate"}</div>
												{a.candidate?.headline && (
													<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, marginTop: 2 }}>{a.candidate.headline}</div>
												)}
											</div>
										</label>
										<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
											<Badge status={a.status || "applied"} />
											<button
												type="button"
												onClick={async () => {
													const id = jobApplicationChatId(a);
													if (!canOpenJobApplicationChat(a) || !id) return;
													try {
														await openContextChat(JOB_APPLICATION_CHAT_CONTEXT, id, {
															initialMessage: buildJobApplicationChatIntro({
																role: "employer",
																jobName,
																candidateName: a.candidate?.user?.name,
															}),
															introOnCreateOnly: true,
															returnNav: { id: "sd-jobs", label: "Back to hiring" },
														});
													} catch {
														window.alert("Couldn't open the conversation. Try again.");
													}
												}}
												style={{ ...ghostBtn, padding: "6px 10px", fontSize: 12.5 }}
											>
												{tt("employer.message", { defaultValue: "Message" })}
											</button>
											<button type="button" onClick={() => setAtsApp(a)} style={{ ...btn(false), padding: "6px 12px", fontSize: 12.5, minHeight: 36 }}>
												{tt("employer.openAts", { defaultValue: "Open ATS" })}
											</button>
										</div>
									</div>
									{letter && (
										<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13.5, marginTop: 10, lineHeight: 1.5 }}>
											<div style={{ whiteSpace: "pre-wrap" }}>
												{letterOpen || !longLetter ? letter : `${letter.slice(0, 160).trim()}…`}
											</div>
											{longLetter && (
												<button
													type="button"
													onClick={() => setExpandedLetter(letterOpen ? null : a.job_application_id)}
													style={{ background: "none", border: "none", padding: 0, marginTop: 4, color: ACCENT, fontFamily: FONT, fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}
												>
													{letterOpen ? "Show less" : "Show more"}
												</button>
											)}
										</div>
									)}
									<div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
										{PIPELINE.map((s) => (
											<button
												key={s}
												type="button"
												onClick={() => move(a.job_application_id, s)}
												disabled={a.status === s}
												style={{
													...ghostBtn,
													padding: "5px 10px",
													fontSize: 12.5,
													textTransform: "capitalize",
													minHeight: 34,
													...(a.status === s ? { borderColor: STATUS_COLOR[s], color: STATUS_COLOR[s] } : {}),
												}}
											>
												{s}
											</button>
										))}
									</div>
								</div>
							);
						})}
					</div>
				)}
		</div>
	);
}

function ApplicantDetail({ app, onSaved, isMobile }) {
	const [notes, setNotes] = useState(app.employer_notes || "");
	const [interviewAt, setInterviewAt] = useState(() => {
		if (!app.interview_at) return "";
		const d = new Date(app.interview_at);
		if (Number.isNaN(d.getTime())) return "";
		const pad = (n) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	});
	const [interviewNotes, setInterviewNotes] = useState(app.interview_notes || "");
	const [timeline, setTimeline] = useState(null);
	const [msg, setMsg] = useState(null);
	const kind = resumeViewerKind(app.cv_url);
	const resumeH = isMobile ? 240 : 360;

	useEffect(() => {
		getApplicationTimeline(app.job_application_id)
			.then((ev) => setTimeline(buildTimelineFromEvents(ev)))
			.catch(() => setTimeline([]));
	}, [app.job_application_id, app.status, app.employer_notes, app.interview_at]);

	const saveNotes = async () => {
		const err = validateEmployerNote(notes);
		if (err) { setMsg({ ok: false, text: err }); return; }
		try {
			await setApplicationNotes(app.job_application_id, normalizeEmployerNote(notes));
			setMsg({ ok: true, text: "Notes saved." });
			onSaved?.();
		} catch { setMsg({ ok: false, text: "Couldn't save notes." }); }
	};

	const saveInterview = async () => {
		const payload = {
			interview_at: interviewAt ? new Date(interviewAt).toISOString() : null,
			interview_notes: interviewNotes,
		};
		const err = validateInterviewInput(payload);
		if (err) { setMsg({ ok: false, text: err }); return; }
		try {
			await setApplicationInterview(app.job_application_id, {
				interview_at: payload.interview_at,
				interview_notes: interviewNotes.trim() || null,
			});
			setMsg({ ok: true, text: "Interview saved — seeker notified if scheduled." });
			onSaved?.();
		} catch { setMsg({ ok: false, text: "Couldn't save interview." }); }
	};

	return (
		<div style={{ display: "grid", gap: 14 }}>
			<StructuredResumeSummary resumeJson={app.candidate?.resume_json} />
			{normalizePortfolioList(app.candidate).length > 0 && (
				<PortfolioGallery items={normalizePortfolioList(app.candidate)} readOnly />
			)}
			{isSafeHttpUrl(app.cv_url) && (
				<div>
					<div style={{ ...label, marginBottom: 8 }}>Résumé preview</div>
					{kind === "pdf" && (
						<iframe title="Résumé PDF" src={app.cv_url} style={{ width: "100%", height: resumeH, border: "1px solid var(--color-border)", borderRadius: 10, background: "#111" }} />
					)}
					{kind === "image" && (
						<img src={app.cv_url} alt="Résumé" style={{ maxWidth: "100%", maxHeight: resumeH, borderRadius: 10, border: "1px solid var(--color-border)" }} />
					)}
					{kind === "link" && (
						<a href={app.cv_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontFamily: FONT, fontSize: 13 }}>Open résumé in new tab</a>
					)}
					{(kind === "pdf" || kind === "image") && (
						<div style={{ marginTop: 6 }}>
							<a href={app.cv_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontFamily: FONT, fontSize: 12.5 }}>Open full file</a>
						</div>
					)}
				</div>
			)}

			<div>
				<div style={{ ...label, marginBottom: 6 }}>Employer notes (private)</div>
				<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...input, resize: "vertical" }} placeholder="Interview feedback, red flags, next steps…" />
				<button type="button" onClick={saveNotes} style={{ ...ghostBtn, marginTop: 8, padding: "6px 12px" }}>Save notes</button>
			</div>

			<div>
				<div style={{ ...label, marginBottom: 6 }}>Interview</div>
				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<input type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} style={{ ...input, flex: "1 1 200px" }} />
					<input value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} placeholder="Interview notes for the candidate" style={{ ...input, flex: "2 1 220px" }} />
				</div>
				<button type="button" onClick={saveInterview} style={{ ...ghostBtn, marginTop: 8, padding: "6px 12px" }}>Save interview</button>
			</div>

			<div>
				<div style={{ ...label, marginBottom: 8 }}>Timeline</div>
				{timeline === null ? <Skel w="100%" h={40} r={8} />
					: timeline.length === 0 ? <div className="text-text-muted" style={{ fontFamily: FONT, fontSize: 13 }}>No events yet.</div>
						: (
							<ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
								{timeline.map((ev) => (
									<li key={ev.event_id || `${ev.event_type}-${ev.created_at}-${ev.to_status}`} className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13 }}>
										<span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
											{ev.event_type === "status"
												? `${ev.from_status || "—"} → ${ev.to_status}`
												: ev.event_type}
										</span>
										{ev.note ? ` · ${ev.note}` : ""}
										{ev.created_at ? ` · ${new Date(ev.created_at).toLocaleString()}` : ""}
									</li>
								))}
							</ul>
						)}
			</div>

			{msg && <div style={{ fontFamily: FONT, fontSize: 13, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
		</div>
	);
}
