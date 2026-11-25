/** Mirrors backend ALLOWED_DM_SOURCE_VERTICALS for client-side DM opens. */
export const DM_SOURCE_VERTICALS = new Set([
	'jobs',
	'food',
	'social',
	'rideshare',
	'medical',
	'decor',
	'automotive',
	'realestate',
	'hotel',
	'venues',
	'tempstay',
	'shop',
	'ondemand',
	'videos',
	'wedding',
	'equipment',
	'experiences',
	'preconstruct',
	'reservations',
	'rental',
]);

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeDmSourceVertical(raw) {
	if (raw == null || raw === '') return null;
	const key = String(raw).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
	if (!key || !DM_SOURCE_VERTICALS.has(key)) return null;
	return key;
}
