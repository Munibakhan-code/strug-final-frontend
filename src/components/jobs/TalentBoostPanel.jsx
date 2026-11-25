import { useState } from "react";
import { usePageI18n } from "../../hooks/usePageI18n.js";
import {
	JOBS_ACCENT as ACCENT,
	JOBS_FONT as FONT,
	jobsBlurbStyle,
	jobsBtnStyle,
	jobsFeedbackTextStyle,
	jobsPanelCardStyle,
	jobsSectionLabelStyle,
} from "./jobsLayout.js";
import { purchaseTalentBoost } from "../../api/jobs.js";

const DEFAULT_PLANS = [
	{ days: 7, amountCad: 9.99, label: "7 days" },
	{ days: 14, amountCad: 16.99, label: "14 days" },
	{ days: 30, amountCad: 29.99, label: "30 days" },
];

/**
 * Paid talent-pool boost purchase (wallet).
 */
export default function TalentBoostPanel({
	discoverable,
	boostedUntil,
	boosted,
	plans,
	onBoosted,
}) {
	const { t } = usePageI18n("jobs");
	const [busy, setBusy] = useState(null);
	const [err, setErr] = useState(null);
	const [ok, setOk] = useState(null);
	const list = Array.isArray(plans) && plans.length ? plans : DEFAULT_PLANS;
	const locked = !discoverable || busy != null;

	const buy = async (days) => {
		if (busy) return;
		setBusy(days);
		setErr(null);
		setOk(null);
		try {
			const res = await purchaseTalentBoost(days);
			onBoosted?.(res);
			setOk(
				t("jobs.talentBoost.success", {
					defaultValue: "Boost active until {{when}}.",
					when: res?.talent_boosted_until
						? new Date(res.talent_boosted_until).toLocaleString()
						: "soon",
				}),
			);
		} catch (e) {
			setErr(e?.response?.data?.error || "Couldn't purchase boost.");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div
			className="jobs-card"
			style={{
				...jobsPanelCardStyle({ highlighted: Boolean(boosted), padding: "16px 18px" }),
				display: "grid",
				gap: 12,
			}}
		>
			<div style={jobsSectionLabelStyle}>
				{t("jobs.talentBoost.title", { defaultValue: "Talent pool boost" })}
			</div>
			<p style={jobsBlurbStyle}>
				{t("jobs.talentBoost.blurb", {
					defaultValue: "Pay from your Strug wallet to rank higher in employer talent search while discoverable.",
				})}
			</p>
			{boosted && boostedUntil && (
				<div
					className="jobs-feedback jobs-feedback--ok"
					role="status"
					style={{ ...jobsFeedbackTextStyle(), color: ACCENT, borderColor: "color-mix(in srgb, #2563eb 35%, transparent)", background: "color-mix(in srgb, #2563eb 10%, transparent)" }}
				>
					{t("jobs.talentBoost.activeUntil", {
						defaultValue: "Boosted until {{when}}",
						when: new Date(boostedUntil).toLocaleString(),
					})}
				</div>
			)}
			{!discoverable && (
				<div className="jobs-feedback jobs-feedback--warn" role="status" style={jobsFeedbackTextStyle()}>
					{t("jobs.talentBoost.needDiscoverable", {
						defaultValue: "Turn on talent-pool visibility before buying a boost.",
					})}
				</div>
			)}
			<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label={t("jobs.talentBoost.title", { defaultValue: "Talent pool boost" })}>
				{list.map((plan) => {
					const planBusy = busy === plan.days;
					return (
						<button
							key={plan.days}
							type="button"
							className="jobs-btn jobs-btn--primary"
							disabled={locked}
							aria-busy={planBusy}
							onClick={() => buy(plan.days)}
							style={jobsBtnStyle({ primary: true, disabled: locked })}
						>
							{planBusy
								? t("jobs.talentBoost.buying", { defaultValue: "Purchasing…" })
								: `${plan.label} · $${Number(plan.amountCad).toFixed(2)}`}
						</button>
					);
				})}
			</div>
			{err && (
				<div className="jobs-feedback jobs-feedback--err" role="alert" style={jobsFeedbackTextStyle()}>
					{err}
				</div>
			)}
			{ok && (
				<div className="jobs-feedback jobs-feedback--ok" role="status" style={jobsFeedbackTextStyle()}>
					{ok}
				</div>
			)}
			{busy != null && (
				<span style={{ fontFamily: FONT, fontSize: 12, color: "var(--color-text-muted)" }}>
					{t("jobs.talentBoost.walletHint", { defaultValue: "Charging your Strug wallet…" })}
				</span>
			)}
		</div>
	);
}
