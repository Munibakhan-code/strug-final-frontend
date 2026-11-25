import React from "react";
import { useTranslation } from "react-i18next";

// Top-level Home / Shorts switch, directly under the Videos search bar.
//
// Short-form used to be a chip inside the category bar ("Clips"), which put a whole content MODE
// on the same row as category filters — and the shorts grid has no use for categories at all.
// It is a section now: Home keeps the category bar and the long-form feed, Shorts renders the
// clips grid on its own. Both destinations already existed as `activeTab` values ("browse" and
// "shorts"); this only makes the second one reachable from the page instead of solely via the
// app-level `__videosInitialTab` handoff.

const ACCENT = "#2563eb";

const Tab = React.memo(function Tab({ label, selected, onSelect }) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={selected}
			onClick={onSelect}
			className={[
				"cursor-pointer border-b-2 bg-transparent transition-colors duration-150",
				selected ? "text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
			].join(" ")}
			style={{
				fontFamily: "'DM Sans', sans-serif",
				fontSize: 14,
				fontWeight: 700,
				padding: "0 4px 9px",
				borderBottomColor: selected ? ACCENT : undefined,
			}}
		>
			{label}
		</button>
	);
});

/**
 * @param {object}   props
 * @param {string}   props.activeTab  the page's current tab ("browse" | "shorts" | library tabs)
 * @param {Function} props.onSelect   called with "browse" or "shorts"
 */
const VideoSectionTabs = React.memo(function VideoSectionTabs({ activeTab, onSelect }) {
	const { t } = useTranslation();
	return (
		<div
			role="tablist"
			aria-label={t("videos.landingTitle")}
			className="border-b border-border-subtle"
			style={{ display: "flex", justifyContent: "center", gap: 26, marginBottom: 18 }}
		>
			<Tab label={t("nav.home")} selected={activeTab === "browse"} onSelect={() => onSelect("browse")} />
			<Tab label={t("videos.shorts")} selected={activeTab === "shorts"} onSelect={() => onSelect("shorts")} />
		</div>
	);
});

export default VideoSectionTabs;
