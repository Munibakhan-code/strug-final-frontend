import { getAuthUserId, isAuthenticated } from "../store/auth.js";
import { hasSocialVault } from "./socialVault.js";
import { loadEdgeDrawerTabData } from "./verticalEdgeDrawerData.js";
import { getEdgeDrawerTabs } from "./verticalEdgeDrawerConfig.js";

const SEEN_PREFIX = "strug_edge_drawer_seen_";

/** Tabs that stay lit while in-progress content exists (not session-dismissed). */
const PERSISTENT_GLOW_KEYS = new Set([
	"food:active",
	"rideshare:active",
]);

function seenStorageKey(activeNav, tabId, userId) {
	return `${SEEN_PREFIX}${userId ?? "guest"}_${activeNav}_${tabId}`;
}

/** @param {string} activeNav @param {string} tabId @param {string|number|null} [userId] */
export function markEdgeDrawerTabSeen(activeNav, tabId, userId) {
	if (typeof sessionStorage === "undefined") return;
	sessionStorage.setItem(seenStorageKey(activeNav, tabId, userId ?? getAuthUserId()), "1");
}

/** @param {string} activeNav @param {string} tabId @param {string|number|null} [userId] */
export function isEdgeDrawerTabSeen(activeNav, tabId, userId) {
	if (typeof sessionStorage === "undefined") return false;
	return sessionStorage.getItem(seenStorageKey(activeNav, tabId, userId ?? getAuthUserId())) === "1";
}

/**
 * Whether the edge tab should show a visual activity hint (glow/dot).
 * Not a notification: UI-only on the tab handle.
 *
 * @param {string} activeNav
 * @param {string} tabId
 * @param {boolean} hasContent
 * @param {string|number|null} [userId]
 */
export function shouldGlowEdgeTab(activeNav, tabId, hasContent, userId) {
	if (!hasContent) return false;
	const key = `${activeNav}:${tabId}`;
	if (PERSISTENT_GLOW_KEYS.has(key)) return true;
	return !isEdgeDrawerTabSeen(activeNav, tabId, userId);
}

/**
 * Lightweight probe: does this tab have at least one row to show?
 * @param {string} activeNav
 * @param {string[]} tabIds
 * @param {{ vaultUnlocked?: boolean, limit?: number }} [opts]
 */
export async function probeEdgeDrawerActivities(activeNav, tabIds, opts = {}) {
	const limit = opts.limit ?? 1;
	const tabs = getEdgeDrawerTabs(activeNav);
	const auth = isAuthenticated();
	const out = /** @type {Record<string, boolean>} */ ({});

	await Promise.all(tabIds.map(async (tabId) => {
		const def = tabs.find((t) => t.id === tabId);
		if (def?.auth && !auth) {
			out[tabId] = false;
			return;
		}
		if (tabId === "vault") {
			out[tabId] = hasSocialVault(getAuthUserId());
			return;
		}
		try {
			const result = await loadEdgeDrawerTabData(activeNav, tabId, { limit, vaultUnlocked: opts.vaultUnlocked });
			out[tabId] = (result?.items?.length ?? 0) > 0;
		} catch {
			out[tabId] = false;
		}
	}));

	return out;
}
