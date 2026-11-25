import { coerceContextTypeKey } from "./messagesRenderHelpers.js";

/** Backend marketplace rentals surface as marketplace; UI label is Rental. */
const TYPE_ALIASES = {
	marketplace: "rental",
};

/**
 * @param {unknown} contextType
 * @returns {string}
 */
export function normalizeContextTypeForOrigin(contextType) {
	const key = coerceContextTypeKey(contextType);
	if (!key || key === "dm") return "";
	return TYPE_ALIASES[key] ?? key;
}

/**
 * i18n keys under messages.origin.* — pass a t() from usePageI18n or i18n.
 * @param {string} normalizedKey
 * @param {(key: string, opts?: object) => string} t
 */
export function contextOriginLabel(normalizedKey, t) {
	if (!normalizedKey) return "";
	const i18nKey = `messages.origin.${normalizedKey}`;
	const label = t(i18nKey, { defaultValue: "" });
	if (label) return label;
	// job_application stored key vs jobs label key
	if (normalizedKey === "job_application") {
		return t("messages.origin.jobs", { defaultValue: "Jobs" });
	}
	return normalizedKey.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Emoji glyphs for legacy inbox rows; components can override per vertical. */
export const CONTEXT_ORIGIN_GLYPHS = {
	food: "🍔",
	rideshare: "🚗",
	services: "🛠",
	ondemand: "🧰",
	shop: "🛍",
	rental: "🏠",
	support: "🎧",
	jobs: "💼",
	job_application: "💼",
	dating_match: "💕",
	dating_blind_session: "💕",
	social: "👥",
	medical: "🏥",
	decor: "🛋",
	automotive: "🚗",
	realestate: "🏡",
	hotel: "🏨",
	venues: "🎭",
	tempstay: "🏠",
	videos: "▶",
	wedding: "💒",
	equipment: "🔧",
	experiences: "🎟",
	preconstruct: "🏗",
	reservations: "📅",
};

/**
 * @param {unknown} contextType
 * @param {(key: string, opts?: object) => string} t
 * @returns {{ key: string, label: string, glyph: string } | null}
 */
export function getContextOriginDisplay(contextType, t) {
	const raw = coerceContextTypeKey(contextType);
	if (!raw || raw === "dm") return null;
	const key = normalizeContextTypeForOrigin(raw);
	if (!key) return null;
	const label = contextOriginLabel(key === "job_application" ? "job_application" : key, t);
	const glyph = CONTEXT_ORIGIN_GLYPHS[key] ?? CONTEXT_ORIGIN_GLYPHS[raw] ?? "💬";
	return { key, label, glyph };
}
