export const VIEWER_ANALYTICS_RANGES = [
	{ id: "24h", label: "24H", hours: 24 },
	{ id: "7d", label: "7D", days: 7 },
	{ id: "30d", label: "30D", days: 30 },
	{ id: "90d", label: "90D", days: 90 },
	{ id: "all", label: "All", days: null },
];

function listFrom(resp) {
	if (Array.isArray(resp)) return resp;
	const data = resp?.data;
	if (Array.isArray(data)) return data;
	return data?.items ?? data?.videos ?? resp?.items ?? resp?.videos ?? [];
}

function finiteNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : null;
}

function dayKey(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeRow(entry) {
	const video = entry?.video ?? entry ?? {};
	const watchedAt = entry?.watched_at ?? entry?.updated_at ?? video?.watched_at ?? null;
	const watchedDate = watchedAt ? new Date(watchedAt) : null;
	const durationSec = finiteNumber(video?.duration_sec ?? video?.duration_seconds ?? entry?.duration_sec);
	const savedPosition = finiteNumber(entry?.last_position ?? entry?.position_sec ?? entry?.watch_position_sec);
	const watchedSec = savedPosition == null
		? 0
		: (durationSec && durationSec > 0 ? Math.min(savedPosition, durationSec) : savedPosition);
	const progress = durationSec && durationSec > 0 && savedPosition != null
		? Math.min(1, savedPosition / durationSec)
		: null;
	const channel = video?.channel ?? {};
	return {
		id: video?.video_id ?? video?.id ?? entry?.video_id ?? null,
		watchedAt: watchedDate && !Number.isNaN(watchedDate.getTime()) ? watchedDate : null,
		day: watchedDate && !Number.isNaN(watchedDate.getTime()) ? dayKey(watchedDate) : null,
		watchedSec,
		progress,
		category: String(video?.category ?? video?.category_name ?? "General").trim() || "General",
		channel: String(channel?.display_name ?? channel?.name ?? video?.channel_name ?? "Unknown creator").trim() || "Unknown creator",
	};
}

function startOfLocalDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBefore(date, count) {
	const result = new Date(date);
	result.setDate(result.getDate() - count);
	return result;
}

function rangeRows(rows, rangeId, now) {
	const option = VIEWER_ANALYTICS_RANGES.find((item) => item.id === rangeId)
		?? VIEWER_ANALYTICS_RANGES.find((item) => item.id === "30d");
	if (option.hours) {
		const start = new Date(now.getTime() - option.hours * 3_600_000);
		return rows.filter((row) => row.watchedAt && row.watchedAt >= start && row.watchedAt <= now);
	}
	if (!option.days) return rows;
	const today = startOfLocalDay(now);
	const start = daysBefore(today, option.days - 1);
	return rows.filter((row) => row.watchedAt && row.watchedAt >= start);
}

function rankedCounts(rows, key, limit = 5) {
	const counts = new Map();
	for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
	return [...counts.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
		.slice(0, limit);
}

function trendFor(rows, rangeId, now) {
	const option = VIEWER_ANALYTICS_RANGES.find((item) => item.id === rangeId);
	if (option?.hours) {
		const thisHour = new Date(now);
		thisHour.setMinutes(0, 0, 0);
		const counts = new Map();
		for (const row of rows) {
			if (!row.watchedAt) continue;
			const hour = new Date(row.watchedAt);
			hour.setMinutes(0, 0, 0);
			const key = hour.getTime();
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return Array.from({ length: option.hours }, (_, index) => {
			const date = new Date(thisHour.getTime() - (option.hours - 1 - index) * 3_600_000);
			return {
				date: date.toISOString(),
				label: date.toLocaleTimeString(undefined, { hour: "numeric" }),
				videos: counts.get(date.getTime()) ?? 0,
			};
		});
	}
	const counts = new Map();
	for (const row of rows) if (row.day) counts.set(row.day, (counts.get(row.day) ?? 0) + 1);
	if (!option?.days) {
		return [...counts.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, videos]) => ({ date, videos }));
	}
	const today = startOfLocalDay(now);
	return Array.from({ length: option.days }, (_, index) => {
		const date = daysBefore(today, option.days - 1 - index);
		const key = dayKey(date);
		return { date: key, videos: counts.get(key) ?? 0 };
	});
}

export function buildViewerAnalytics(response, rangeId = "30d", now = new Date()) {
	const normalized = listFrom(response).map(normalizeRow).filter((row) => row.id != null);
	const rows = rangeRows(normalized, rangeId, now);
	const measurable = rows.filter((row) => row.progress != null);
	const watchSeconds = rows.reduce((sum, row) => sum + row.watchedSec, 0);
	const averageCompletion = measurable.length
		? measurable.reduce((sum, row) => sum + row.progress, 0) / measurable.length
		: null;
	const completed = measurable.filter((row) => row.progress >= 0.9).length;
	const categories = rankedCounts(rows, "category");
	const channels = rankedCounts(rows, "channel");
	const trend = trendFor(rows, rangeId, now);
	const peak = trend.reduce((best, point) => point.videos > (best?.videos ?? 0) ? point : best, null);

	return {
		totalVideos: rows.length,
		watchSeconds,
		averageCompletion,
		completed,
		measurableCount: measurable.length,
		categories,
		channels,
		trend,
		peak,
	};
}

export function formatViewerWatchTime(seconds) {
	const totalMinutes = Math.round((Number(seconds) || 0) / 60);
	if (totalMinutes < 60) return `${totalMinutes}m`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function buildCirclePulse(response) {
	const rows = listFrom(response)
		.filter((row) => !row?.watching_now && row?.friends?.[0]?.action !== "watching")
		.map((row) => ({
			...row,
			sharedFriends: (Array.isArray(row?.friends) ? row.friends : [])
				.filter((friend) => friend?.action !== "watching"),
		}))
		.filter((row) => row.sharedFriends.length > 0);
	const channelCounts = new Map();
	const categoryCounts = new Map();
	const friendNames = new Set();
	let watched = 0;
	let liked = 0;
	for (const row of rows) {
		const channel = String(row?.channel?.display_name ?? row?.channel_name ?? "Unknown creator").trim() || "Unknown creator";
		channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + row.sharedFriends.length);
		const category = String(row?.category ?? "").trim();
		if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + row.sharedFriends.length);
		for (const friend of row.sharedFriends) {
			if (friend?.display_name) friendNames.add(friend.display_name);
			if (friend?.action === "liked") liked += 1;
			else watched += 1;
		}
	}
	const rank = (counts) => [...counts.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
		.slice(0, 5);
	const newestAt = (row) => Math.max(0, ...row.sharedFriends.map((friend) => {
		const value = friend?.at ?? friend?.watched_at ?? friend?.liked_at ?? friend?.created_at;
		const timestamp = typeof value === "number" ? value : new Date(value).getTime();
		return Number.isFinite(timestamp) ? timestamp : 0;
	}));

	return {
		rows: rows.sort((a, b) => newestAt(b) - newestAt(a)),
		activeFriends: friendNames.size,
		interactions: watched + liked,
		watched,
		liked,
		channels: rank(channelCounts),
		categories: rank(categoryCounts),
	};
}
