/** Card/rail duration label from seconds — rolls past an hour (75:30 → 1:15:30). */
export function fmtVideoDuration(durationSec) {
	const s = Math.floor(Number(durationSec));
	if (!Number.isFinite(s) || s <= 0) return '';
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = String(s % 60).padStart(2, '0');
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
