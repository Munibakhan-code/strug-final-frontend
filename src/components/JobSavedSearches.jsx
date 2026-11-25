import React, { useCallback, useEffect, useState } from "react";
import {
	createJobSavedSearch,
	deleteJobSavedSearch,
	getJobSavedSearches,
	runJobSavedSearchAlerts,
	updateJobSavedSearch,
} from "../api/jobs.js";
import { isAuthenticated } from "../store/auth";
import {
	canSaveJobSearch,
	filtersForJobSavedSearch,
	jobSavedSearchFiltersEqual,
	labelJobSavedSearch,
	normalizeJobSavedSearchFrequency,
} from "../utils/jobSavedSearch.js";

const FONT = "'DM Sans', sans-serif";

/**
 * Save-search + alert controls for Jobs browse.
 */
export default function JobSavedSearches({
	filters,
	onApply,
	accent = "#2563eb",
}) {
	const [rows, setRows] = useState([]);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState(null);
	const canSave = canSaveJobSearch(filters);
	const storedFilters = filtersForJobSavedSearch(filters);

	const flash = (text, ok = true) => {
		setMsg({ text, ok });
		setTimeout(() => setMsg(null), 3200);
	};

	const load = useCallback(() => {
		if (!isAuthenticated()) {
			setRows([]);
			return;
		}
		getJobSavedSearches()
			.then((res) => {
				const list = Array.isArray(res) ? res : (res?.data ?? []);
				setRows(Array.isArray(list) ? list : []);
			})
			.catch(() => setRows([]));
	}, []);

	useEffect(() => { load(); }, [load]);

	const alreadySaved = rows.some((r) => jobSavedSearchFiltersEqual(r.filters, storedFilters));

	async function handleSave() {
		if (!isAuthenticated()) {
			flash("Sign in to save searches and get alerts.", false);
			return;
		}
		if (!canSave || busy) return;
		setBusy(true);
		try {
			const name = labelJobSavedSearch(storedFilters).slice(0, 120);
			const res = await createJobSavedSearch({
				name,
				filters: storedFilters,
				alert_enabled: true,
				frequency: "immediate",
			});
			const row = res?.data ?? res;
			if (row) setRows((prev) => [row, ...prev.filter((r) => r.saved_search_id !== row.saved_search_id)]);
			flash("Search saved — alerts on for new matching jobs.");
		} catch (e) {
			flash(e?.response?.data?.message || "Could not save search.", false);
		} finally {
			setBusy(false);
		}
	}

	async function handleToggleAlert(row) {
		if (busy) return;
		setBusy(true);
		const next = !row.alert_enabled;
		setRows((prev) => prev.map((r) => (r.saved_search_id === row.saved_search_id ? { ...r, alert_enabled: next } : r)));
		try {
			await updateJobSavedSearch(row.saved_search_id, { alert_enabled: next });
			flash(next ? "Alerts on" : "Alerts off");
		} catch {
			setRows((prev) => prev.map((r) => (r.saved_search_id === row.saved_search_id ? { ...r, alert_enabled: row.alert_enabled } : r)));
			flash("Could not update alert.", false);
		} finally {
			setBusy(false);
		}
	}

	async function handleToggleFrequency(row) {
		if (busy) return;
		const next = normalizeJobSavedSearchFrequency(row.frequency) === "daily" ? "immediate" : "daily";
		setBusy(true);
		setRows((prev) => prev.map((r) => (r.saved_search_id === row.saved_search_id ? { ...r, frequency: next } : r)));
		try {
			await updateJobSavedSearch(row.saved_search_id, { frequency: next });
			flash(next === "daily" ? "Daily digest cadence" : "Immediate alerts");
		} catch {
			setRows((prev) => prev.map((r) => (r.saved_search_id === row.saved_search_id ? { ...r, frequency: row.frequency } : r)));
			flash("Could not update frequency.", false);
		} finally {
			setBusy(false);
		}
	}

	async function handleRemove(id) {
		if (busy) return;
		setBusy(true);
		const prev = rows;
		setRows((list) => list.filter((r) => r.saved_search_id !== id));
		try {
			await deleteJobSavedSearch(id);
		} catch {
			setRows(prev);
			flash("Could not delete.", false);
		} finally {
			setBusy(false);
		}
	}

	async function handleCheckNow() {
		if (!isAuthenticated() || busy) return;
		setBusy(true);
		try {
			const res = await runJobSavedSearchAlerts();
			const data = res?.data ?? res;
			const n = Number(data?.notified) || 0;
			flash(n > 0
				? `Found ${n} new match alert(s). Check notifications.`
				: "No new matches since your last check.");
		} catch {
			flash("Could not check for new matches.", false);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div style={{ width: "100%", marginTop: 10 }}>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
				{canSave && (
					<button
						type="button"
						disabled={busy || alreadySaved}
						onClick={handleSave}
						style={{
							padding: "7px 12px",
							borderRadius: 12,
							cursor: busy || alreadySaved ? "default" : "pointer",
							background: alreadySaved ? "var(--color-surface-raised)" : `${accent}22`,
							border: `1px solid ${alreadySaved ? "var(--color-border)" : `${accent}55`}`,
							color: alreadySaved ? "var(--color-text-muted)" : accent,
							fontFamily: FONT,
							fontSize: 12.5,
							fontWeight: 700,
						}}
					>
						{alreadySaved ? "Search saved" : "Save search + alerts"}
					</button>
				)}
				{rows.some((r) => r.alert_enabled) && (
					<button
						type="button"
						disabled={busy}
						onClick={handleCheckNow}
						style={{
							padding: "7px 12px",
							borderRadius: 12,
							cursor: busy ? "default" : "pointer",
							background: "transparent",
							border: "1px solid var(--color-border)",
							color: "var(--color-text-secondary)",
							fontFamily: FONT,
							fontSize: 12.5,
							fontWeight: 600,
						}}
					>
						Check for new matches
					</button>
				)}
			</div>

			{rows.length > 0 && (
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
					<span className="text-text-muted" style={{ fontFamily: FONT, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
						Saved searches
					</span>
					{rows.map((s) => (
						<span
							key={s.saved_search_id}
							className="bg-surface-raised border border-border"
							style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 14, padding: "4px 6px 4px 12px" }}
						>
							<button
								type="button"
								onClick={() => onApply?.(s.filters || {})}
								className="text-text-primary"
								style={{
									background: "none",
									border: "none",
									fontFamily: FONT,
									fontSize: 12,
									fontWeight: 600,
									cursor: "pointer",
									padding: 0,
									maxWidth: 200,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
								title={s.name || labelJobSavedSearch(s.filters)}
							>
								{s.name || labelJobSavedSearch(s.filters)}
							</button>
							<button
								type="button"
								onClick={() => handleToggleAlert(s)}
								title={s.alert_enabled ? "Alerts on" : "Alerts off"}
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									color: s.alert_enabled ? accent : "var(--color-text-muted)",
									fontFamily: FONT,
									fontSize: 11,
									fontWeight: 700,
									padding: "2px 4px",
								}}
							>
								{s.alert_enabled ? "Alert" : "Muted"}
							</button>
							<button
								type="button"
								onClick={() => handleToggleFrequency(s)}
								title="Toggle immediate vs daily"
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									color: "var(--color-text-secondary)",
									fontFamily: FONT,
									fontSize: 11,
									fontWeight: 600,
									padding: "2px 4px",
									textTransform: "capitalize",
								}}
							>
								{normalizeJobSavedSearchFrequency(s.frequency)}
							</button>
							<button
								type="button"
								onClick={() => handleRemove(s.saved_search_id)}
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									color: "#f87171",
									fontFamily: FONT,
									fontSize: 14,
									lineHeight: 1,
									padding: "0 4px",
								}}
								aria-label="Delete saved search"
							>
								×
							</button>
						</span>
					))}
				</div>
			)}

			{msg && (
				<div style={{ marginTop: 8, fontFamily: FONT, fontSize: 12.5, color: msg.ok ? "#4ade80" : "#f87171" }}>
					{msg.text}
				</div>
			)}
		</div>
	);
}
