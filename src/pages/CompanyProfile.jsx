import React, { useEffect, useState } from "react";
import { getCompanyProfile } from "../api/jobs";
import { Skel } from "../components/skeletons.jsx";
import { normalizeCompanyProfile, companySharePath } from "../utils/companyJobs.js";

const ACCENT = "#2563eb";
const FONT = "'DM Sans', sans-serif";
const HEAD = "'Barlow Condensed', sans-serif";
const card = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 16, padding: "18px 20px" };
const ghostBtn = { padding: "10px 16px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 12, color: "var(--color-text-primary)", fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer" };

function safeWeb(url) {
	if (!url) return null;
	try {
		const u = new URL(url.startsWith("http") ? url : `https://${url}`);
		if (u.protocol !== "http:" && u.protocol !== "https:") return null;
		return u.toString();
	} catch {
		return null;
	}
}

function ErrCard({ message, onBack }) {
	return (
		<div style={card}>
			<div style={{ fontFamily: FONT, color: "#f87171" }}>{message}</div>
			{typeof onBack === "function" && (
				<button type="button" onClick={onBack} style={{ ...ghostBtn, marginTop: 12 }}>Back to Jobs</button>
			)}
		</div>
	);
}

/**
 * Public company destination — about + open roles.
 */
export default function CompanyProfile({ agentId, onBack, onOpenJob }) {
	const id = Number(agentId);
	const idOk = Number.isFinite(id) && id > 0;
	const [load, setLoad] = useState({ forId: null, company: null, err: null });

	useEffect(() => {
		if (!idOk) return undefined;
		let cancelled = false;
		getCompanyProfile(id)
			.then((raw) => {
				if (cancelled) return;
				const n = normalizeCompanyProfile(raw);
				setLoad({
					forId: id,
					company: n,
					err: n ? null : "Company not found.",
				});
			})
			.catch(() => {
				if (cancelled) return;
				setLoad({ forId: id, company: null, err: "Couldn't load this company." });
			});
		return () => { cancelled = true; };
	}, [id, idOk]);

	if (!idOk) return <ErrCard message="Invalid company." onBack={onBack} />;
	if (load.forId !== id) return <Skel w="100%" h={180} r={16} />;
	if (load.err || !load.company) return <ErrCard message={load.err || "Company not found."} onBack={onBack} />;

	const company = load.company;
	const web = safeWeb(company.company_web_url);

	return (
		<div style={{ display: "grid", gap: 16 }}>
			{typeof onBack === "function" && (
				<button type="button" onClick={onBack} style={{ ...ghostBtn, width: "fit-content", padding: "8px 12px" }}>
					← Back to Jobs
				</button>
			)}
			<div style={{ ...card, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
				{company.company_logo_url ? (
					<img
						src={company.company_logo_url}
						alt=""
						style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover", border: "1px solid var(--color-border)" }}
					/>
				) : (
					<div className="bg-surface-raised border border-border" style={{ width: 72, height: 72, borderRadius: 14 }} />
				)}
				<div style={{ flex: "1 1 240px" }}>
					<h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
						{company.company_name}
					</h2>
					<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 14, marginTop: 6 }}>
						{[company.industry, company.company_size, company.company_country].filter(Boolean).join(" · ") || "Employer on Strug"}
					</div>
					{web && (
						<a href={web} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontFamily: FONT, fontSize: 13.5, display: "inline-block", marginTop: 8 }}>
							Company website
						</a>
					)}
					<div className="text-text-muted" style={{ fontFamily: FONT, fontSize: 12, marginTop: 8 }}>
						{company.open_count} open role{company.open_count === 1 ? "" : "s"} · {companySharePath(company.agent_id)}
					</div>
				</div>
			</div>

			{company.company_description && (
				<div style={card}>
					<div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>About</div>
					<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
						{company.company_description}
					</div>
				</div>
			)}

			<div>
				<div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 20, marginBottom: 10 }}>Open roles</div>
				{company.jobs.length === 0 ? (
					<div className="text-text-secondary" style={{ ...card, fontFamily: FONT }}>No open roles right now.</div>
				) : (
					<div style={{ display: "grid", gap: 10 }}>
						{company.jobs.map((j) => (
							<button
								key={j.job_id}
								type="button"
								onClick={() => onOpenJob?.(j)}
								style={{ ...card, textAlign: "left", cursor: "pointer", width: "100%", color: "inherit", font: "inherit" }}
							>
								<div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16 }}>{j.job_name}</div>
								<div className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, marginTop: 4 }}>
									{[j.location, j.is_remote ? "Remote" : null, j.employment_type].filter(Boolean).join(" · ")}
								</div>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
