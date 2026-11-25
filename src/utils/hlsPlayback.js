/**
 * HLS knobs for the watch player.
 *
 * Reopening a video you already started used to attach at 0:00 and then seek. On a phone that
 * means downloading the opening fragments, throwing them away, and waiting on a second fetch
 * at the resume point. startPosition tells hls.js to request from that time first.
 *
 * Mobile also used a 1.5 Mbps ABR guess and a 2-minute forward buffer, which is a broadband
 * desktop profile. Cellular then climbs too high after the first fragments and stalls.
 */

/** Skip tiny watches, and don't resume into the last 15s of a finished clip. */
export function resumeStartPosition(sec, duration) {
	const t = Number(sec);
	if (!Number.isFinite(t) || t <= 5) return -1;
	if (Number.isFinite(duration) && duration > 0 && t >= duration - 15) return -1;
	return t;
}

export function hlsPlayerConfig({ isMobile = false, startPosition = -1 } = {}) {
	const startPos = resumeStartPosition(startPosition);
	if (isMobile) {
		return {
			startFragPrefetch: true,
			maxBufferLength: 15,
			maxMaxBufferLength: 40,
			backBufferLength: 15,
			startLevel: -1,
			abrEwmaDefaultEstimate: 500_000,
			capLevelToPlayerSize: true,
			startPosition: startPos,
		};
	}
	return {
		startFragPrefetch: true,
		maxBufferLength: 30,
		maxMaxBufferLength: 120,
		backBufferLength: 30,
		startLevel: -1,
		abrEwmaDefaultEstimate: 1_500_000,
		capLevelToPlayerSize: true,
		startPosition: startPos,
	};
}

/** HLS master rungs → Settings Quality rows. Auto stays first; rungs high-to-low like YouTube. */
export function qualityChoicesFromLevels(levels) {
	if (!Array.isArray(levels) || !levels.length) return [{ label: 'Auto', index: -1 }];
	const rows = levels.map((l, i) => {
		const height = Number(l?.height);
		const ok = Number.isFinite(height) && height > 0;
		return { label: ok ? `${height}p` : `Level ${i + 1}`, index: i, height: ok ? height : 0 };
	});
	rows.sort((a, b) => b.height - a.height);
	return [{ label: 'Auto', index: -1 }, ...rows.map(({ label, index }) => ({ label, index }))];
}

/** Auto row while ABR is on: "Auto (480p)" once hls.js reports the active height. */
export function autoQualityLabel(height) {
	const h = Number(height);
	if (!Number.isFinite(h) || h <= 0) return 'Auto';
	return `Auto (${h}p)`;
}
