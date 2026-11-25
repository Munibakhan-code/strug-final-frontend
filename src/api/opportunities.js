import client from './client';
import { getUser } from '../store/auth';

// Provider "Opportunities" demand map (#326): anonymized demand-density grid cells near
// the seller (~100 km). Requires vertical; market layer uses buyer delivery-address
// aggregates (k≥5, ~4.4 km grid) — never raw addresses. See DemandHeatMap legend.
export const getDemandMap = (vertical) => {
  const v = String(vertical || "").trim();
  if (!v) {
    return Promise.reject(new Error("vertical is required for demand map"));
  }
  return client.get("/provider-opportunities/demand-map", { params: { vertical: v } }).then((r) => r.data);
};

const ACTIONS_KEY_PREFIX = 'strug_opp_actions_v1';

function actionsStorageKey(vertical) {
	const u = getUser();
	const uid = u?.user_id ?? u?.id ?? 'anon';
	return `${ACTIONS_KEY_PREFIX}:${uid}:${vertical || 'food'}`;
}

/** Local MVP status store for opportunity Acted / Dismissed until a dedicated API exists. */
export function loadOpportunityActions(vertical) {
	try {
		const raw = localStorage.getItem(actionsStorageKey(vertical));
		const parsed = raw ? JSON.parse(raw) : {};
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

export function saveOpportunityAction(vertical, segmentKey, action) {
	const all = loadOpportunityActions(vertical);
	const next = { ...all, [segmentKey]: { ...action, updated_at: new Date().toISOString() } };
	try {
		localStorage.setItem(actionsStorageKey(vertical), JSON.stringify(next));
	} catch {
		// Safari private mode / quota — keep the in-memory next so Acted still updates UI.
	}
	return next;
}

export function clearOpportunityAction(vertical, segmentKey) {
	const all = loadOpportunityActions(vertical);
	if (!all[segmentKey]) return all;
	const next = { ...all };
	delete next[segmentKey];
	try {
		localStorage.setItem(actionsStorageKey(vertical), JSON.stringify(next));
	} catch {
		// Same as save: UI can still drop the action even if persist fails.
	}
	return next;
}
