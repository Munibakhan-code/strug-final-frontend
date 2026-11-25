import { useCallback, useEffect, useState } from "react";
import { SlideOutPanel, SlideOutEdgeTab } from "../SlideOutPanel.jsx";
import { usePageI18n } from "../../hooks/usePageI18n.js";
import { useViewport } from "../../hooks/useViewport.js";
import { getAuthUserId, isAuthenticated } from "../../store/auth.js";
import { getMyCandidate } from "../../api/jobs.js";
import {
	JOBS_DRAWER_TAB_IDS,
	loadJobsDrawerTab,
	markJobsDrawerTabSeen,
	shouldGlowJobsResumeTab,
	stackJobsEdgeTabTop,
} from "../../utils/jobsEdgeDrawer.js";
import { edgeTabHeightPx } from "../../utils/verticalEdgeDrawerConfig.js";
import { profileCompleteness } from "../../utils/candidateProfileCompleteness.js";
import { JOBS_ACCENT as ACCENT, JOBS_FONT as FONT } from "./jobsLayout.js";

function DrawerRow({ item, onAction }) {
	const clickable = item.target?.jobId != null || item.action || item.href;
	return (
		<div
			style={{
				padding: "10px 12px",
				borderRadius: 10,
				border: "1px solid var(--color-border)",
				background: "var(--color-surface-raised)",
				marginBottom: 8,
			}}
		>
			<button
				type="button"
				disabled={!clickable}
				onClick={() => {
					if (item.href) {
						window.open(item.href, "_blank", "noopener,noreferrer");
						return;
					}
					if (item.action === "edit-profile") {
						onAction?.("edit-profile");
						return;
					}
					if (item.target?.jobId != null) {
						onAction?.("open-job", item.target.jobId);
					}
				}}
				style={{
					width: "100%",
					textAlign: "left",
					background: "none",
					border: "none",
					padding: 0,
					cursor: clickable ? "pointer" : "default",
					fontFamily: FONT,
				}}
			>
				<div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)" }}>{item.title}</div>
				{item.sub && (
					<div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{item.sub}</div>
				)}
			</button>
		</div>
	);
}

/**
 * Jobs right-edge drawer (desktop/tablet). Mobile uses in-page tabs.
 */
export default function JobsEdgeDrawer({ onOpenProfileTab, onOpenJob }) {
	const { t } = usePageI18n("jobs");
	const { isMobile } = useViewport();
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState("applications");
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(false);
	const [candidate, setCandidate] = useState(null);
	const auth = isAuthenticated();
	const userId = getAuthUserId();

	const tabLabels = {
		applications: t("jobs.edgeDrawer.applications", { defaultValue: "Applications" }),
		saved: t("jobs.edgeDrawer.saved", { defaultValue: "Saved" }),
		alerts: t("jobs.edgeDrawer.alerts", { defaultValue: "Alerts" }),
		resume: t("jobs.edgeDrawer.resume", { defaultValue: "Résumé" }),
	};

	const loadTab = useCallback(async (tabId) => {
		if (!auth) {
			setItems([]);
			return;
		}
		setLoading(true);
		try {
			const result = await loadJobsDrawerTab(tabId, { limit: 25, userId });
			setItems(result?.items ?? []);
			if (result?.meta?.candidate) setCandidate(result.meta.candidate);
		} catch {
			setItems([]);
		} finally {
			setLoading(false);
		}
	}, [auth, userId]);

	useEffect(() => {
		if (!auth) return;
		getMyCandidate().then(setCandidate).catch(() => setCandidate(null));
	}, [auth]);

	useEffect(() => {
		if (!open) return;
		markJobsDrawerTabSeen(tab, userId);
		loadTab(tab);
	}, [open, tab, loadTab, userId]);

	const openTab = (tabId) => {
		setTab(tabId);
		setOpen(true);
	};

	const handleRowAction = (action, jobId) => {
		if (action === "edit-profile") {
			setOpen(false);
			onOpenProfileTab?.();
			return;
		}
		if (action === "open-job" && jobId != null) {
			setOpen(false);
			onOpenJob?.(jobId);
		}
	};

	if (isMobile) return null;

	const resumeGlow = auth && shouldGlowJobsResumeTab(candidate, userId);
	const completeness = profileCompleteness(candidate);

	return (
		<>
			{JOBS_DRAWER_TAB_IDS.map((tabId, index) => (
				<SlideOutEdgeTab
					key={tabId}
					open={open && tab === tabId}
					onClick={() => openTab(tabId)}
					top={stackJobsEdgeTabTop(index)}
					height={edgeTabHeightPx()}
					label={tabLabels[tabId]}
					ariaLabel={tabLabels[tabId]}
					hasActivity={tabId === "resume" && resumeGlow}
				/>
			))}
			<SlideOutPanel
				open={open}
				onClose={() => setOpen(false)}
				lockScroll={false}
				titleVariant="content"
				width={380}
				title={tabLabels[tab]}
			>
				{!auth ? (
					<p style={{ fontFamily: FONT, fontSize: 14, color: "var(--color-text-secondary)", textAlign: "center", padding: "24px 8px" }}>
						{t("jobs.edgeDrawer.signIn", { defaultValue: "Sign in to view your jobs drawer." })}
					</p>
				) : loading ? (
					<p style={{ fontFamily: FONT, fontSize: 13, color: "var(--color-text-muted)", textAlign: "center", padding: "32px 8px" }}>
						{t("common.loading", { defaultValue: "Loading…" })}
					</p>
				) : items.length === 0 ? (
					<p style={{ fontFamily: FONT, fontSize: 13, color: "var(--color-text-muted)", textAlign: "center", padding: "32px 8px" }}>
						{tab === "resume"
							? t("jobs.edgeDrawer.resumeEmpty", { defaultValue: "Build your seeker profile so employers see you when you apply." })
							: t("jobs.edgeDrawer.empty", { defaultValue: "Nothing here yet." })}
					</p>
				) : (
					<>
						{tab === "resume" && candidate && (
							<div
								style={{
									marginBottom: 12,
									padding: "10px 12px",
									borderRadius: 10,
									background: "rgba(37,99,235,0.08)",
									border: "1px solid rgba(37,99,235,0.2)",
									fontFamily: FONT,
									fontSize: 13,
									color: "var(--color-text-secondary)",
								}}
							>
								{t("jobs.edgeDrawer.profilePercent", {
									defaultValue: "{{percent}}% profile complete",
									percent: completeness.percent,
								})}
								<button
									type="button"
									onClick={() => handleRowAction("edit-profile")}
									style={{
										marginTop: 8,
										padding: "6px 12px",
										borderRadius: 8,
										border: "none",
										background: ACCENT,
										color: "#fff",
										fontFamily: FONT,
										fontSize: 12,
										fontWeight: 700,
										cursor: "pointer",
									}}
								>
									{t("jobs.edgeDrawer.editProfile", { defaultValue: "Edit profile" })}
								</button>
							</div>
						)}
						{items.map((item) => (
							<DrawerRow key={item.id} item={item} onAction={handleRowAction} />
						))}
					</>
				)}
			</SlideOutPanel>
		</>
	);
}
