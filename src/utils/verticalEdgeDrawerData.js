import { getBookmarkedPosts, getCloseFriends } from "../api/social.js";
import { getSavedPosts } from "../api/townhall.js";
import { getBookings } from "../api/booking.js";
import { getMyFoodOrders } from "../api/food.js";
import { getJob, getMyApplications, getJobSavedSearches } from "../api/jobs.js";
import { getPassengerRideHistory } from "../api/rideshare.js";
import { getMyOrders } from "../api/shop.js";
import { getSaves } from "../api/saves.js";
import { getAddresses, getWalletBalance } from "../api/user.js";
import { getAuthUserId, isAuthenticated } from "../store/auth.js";
import { readSavedJobIds } from "./seekerJobs.js";
import { listSocialVaultItems } from "./socialVault.js";

export const STORAGE_KEYS = {
	tempstayRecent: "strug_tempstay_recent",
	foodActive: "strug_food_active_v1",
	rideshareActive: "strug_rideshare_active_v1",
};

export const FOOD_TERMINAL_STATUSES = new Set(["delivered", "cancelled", "canceled", "completed"]);

/** @param {unknown} payload */
export function asArray(payload) {
	if (!payload) return [];
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.data)) return payload.data;
	if (Array.isArray(payload?.items)) return payload.items;
	return [];
}

/** @param {string} key @param {unknown} fallback @param {Storage} storage */
export function readJsonStorage(key, fallback = [], storage = typeof localStorage !== "undefined" ? localStorage : null) {
	if (!storage) return fallback;
	try {
		const raw = storage.getItem(key);
		const parsed = raw ? JSON.parse(raw) : fallback;
		return Array.isArray(parsed) ? parsed : fallback;
	} catch {
		return fallback;
	}
}

/** @param {string} key @param {unknown} fallback @param {Storage} storage */
export function readSessionJson(key, fallback = null, storage = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
	if (!storage) return fallback;
	try {
		const raw = storage.getItem(key);
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}

/** @param {unknown[]} orders */
export function filterActiveFoodOrders(orders) {
	return asArray(orders).filter((o) => {
		const status = String(o?.order_status ?? o?.status ?? "").toLowerCase();
		return status && !FOOD_TERMINAL_STATUSES.has(status);
	});
}

/**
 * @param {object} row
 * @returns {{ id: string|number, title: string, sub?: string, nav?: string, badge?: string }}
 */
export function mapGenericRow(row) {
	const id = row?.id ?? row?.entity_id ?? row?.order_id ?? row?.requestId;
	const title = row?.title ?? row?.name ?? row?.label ?? row?.meta?.title ?? `#${id ?? ""}`;
	const sub = row?.sub ?? row?.meta?.sub ?? row?.status ?? row?.order_status ?? row?.description;
	return { id: id ?? title, title: String(title), sub: sub != null ? String(sub) : undefined };
}

/** Temp Stay recently-viewed rows (localStorage slim listing). */
export function mapTempstayRecentRow(row) {
	const id = row?.id;
	return {
		id,
		title: row?.name ?? row?.title ?? (id != null ? `Listing #${id}` : "Listing"),
		sub: row?.location,
		nav: "tempstay",
		target: id != null ? { listingId: id } : undefined,
	};
}

/** @param {object} post @param {"social"|"feed"} vertical */
export function mapSocialBookmarkRow(post, vertical) {
	const isTownHall = vertical === "social";
	const id = isTownHall
		? (post?.post_id ?? post?.id)
		: (post?.social_post_id ?? post?.id);
	const sp = post?.social_profile ?? post?.user?.social_profiles?.[0] ?? null;
	const author = sp?.display_name ?? post?.user?.name ?? post?.user?.username ?? "Post";
	const text = isTownHall
		? (post?.content ?? "")
		: (post?.caption_text ?? post?.caption ?? "");
	const title = text ? text.slice(0, 80) : author;
	return {
		id,
		title,
		sub: author,
		nav: vertical,
		target: isTownHall ? { townHallPostId: id } : { feedPostId: id },
	};
}

/** @param {object} friend */
export function mapCloseFriendRow(friend) {
	const name = friend?.display_name ?? friend?.handle ?? "Friend";
	return {
		id: friend?.profile_id ?? friend?.user_id ?? name,
		title: name,
		sub: friend?.handle ? `@${friend.handle.replace(/^@/, "")}` : undefined,
		badge: "Close friend",
		nav: friend?.user_id != null ? "profile" : undefined,
		target: friend?.user_id != null ? { profileUserId: friend.user_id } : undefined,
	};
}

/** @param {object} row @param {"social"|"feed"} vertical */
export function mapVaultDrawerRow(row, vertical) {
	const nav = row?.vertical ?? vertical;
	const isTownHall = nav === "social";
	return {
		id: row?.id,
		title: row?.title ?? "Saved item",
		sub: row?.sub,
		nav,
		target: isTownHall ? { townHallPostId: row?.id } : { feedPostId: row?.id },
	};
}

/** Stash drawer deep-link targets before navigateTo (mirrors __videosOpenVideoId). */
export function applyDrawerItemHandoff(item) {
	if (!item?.target || typeof window === "undefined") return;
	let shouldNotify = false;
	if (item.target.listingId != null) {
		window.__tempstayOpenListingId = item.target.listingId;
		shouldNotify = true;
	}
	if (item.target.jobId != null) {
		window.__jobsOpenJobId = Number(item.target.jobId);
		shouldNotify = true;
	}
	if (item.target.townHallPostId != null) {
		window.__townHallOpenPostId = item.target.townHallPostId;
		shouldNotify = true;
	}
	if (item.target.feedPostId != null) {
		window.__feedOpenPostId = item.target.feedPostId;
		shouldNotify = true;
	}
	if (item.target.profileUserId != null) {
		window.__profileTargetId = item.target.profileUserId;
		shouldNotify = true;
	}
	if (shouldNotify) {
		window.dispatchEvent(new CustomEvent("strug:open-notification-target"));
	}
}

const SAVE_ENTITY_NAV = {
	stay: "tempstay",
	property: "tempstay",
	restaurant: "food",
	product: "shop",
	listing: "shop",
	venue: "venues",
};

/** @param {object} save */
export function mapSaveToDrawerItem(save) {
	const meta = save?.meta || {};
	const entityType = String(save?.entity_type || "").toLowerCase();
	const nav = SAVE_ENTITY_NAV[entityType] || "favourites";
	const entityId = save?.entity_id;
	let target;
	if (nav === "tempstay" && entityId != null) {
		target = { listingId: entityId };
	}
	return {
		id: save?.id ?? entityId,
		title: meta.title || save?.entity_type || "Saved",
		sub: meta.sub || meta.price,
		nav,
		target,
	};
}

/** @param {object} booking */
export function mapBookingToDrawerItem(booking) {
	const listing = booking?.listing || {};
	const listingId = listing.id ?? listing.listing_id ?? booking?.listing_id;
	return {
		id: booking?.id,
		title: listing.title || listing.name || `Booking #${booking?.id ?? ""}`,
		sub: booking?.status || booking?.start_date,
		nav: "tempstay",
		target: listingId != null ? { listingId } : undefined,
	};
}

/** @param {object} app */
export function mapApplicationToDrawerItem(app) {
	const job = app?.jobs || app?.job || {};
	const jobId = job?.job_id ?? job?.id;
	return {
		id: app?.job_application_id ?? app?.id,
		title: job.job_name || job.title || app?.job_title || `Application #${app?.job_application_id ?? app?.id ?? ""}`,
		sub: app?.status,
		nav: "jobs",
		target: jobId != null ? { jobId } : undefined,
	};
}

/** @param {object} alert */
export function mapJobAlertToDrawerItem(alert) {
	return {
		id: alert?.id,
		title: alert?.name || alert?.keyword || "Job alert",
		sub: alert?.location || (alert?.is_remote ? "Remote" : undefined),
		nav: "jobs",
	};
}

/**
 * Load drawer panel rows for a vertical tab.
 * @param {string} activeNav
 * @param {string} tabId
 * @param {{ limit?: number }} [opts]
 */
export async function loadEdgeDrawerTabData(activeNav, tabId, opts = {}) {
	const limit = opts.limit ?? 12;
	const userId = getAuthUserId();

	if (activeNav === "home") {
		if (tabId === "dashboard") {
			const links = [
				{ id: "dash", title: "Account dashboard", nav: "dashboard" },
				{ id: "orders", title: "Orders", nav: "orders" },
				{ id: "wallet", title: "Wallet", nav: "wallet" },
				{ id: "favourites", title: "Favourites", nav: "favourites" },
				{ id: "profile", title: "Profile", nav: "profile" },
			];
			let walletBalance = null;
			if (isAuthenticated()) {
				try {
					const res = await getWalletBalance();
					walletBalance = res?.balance;
				} catch { /* guest/offline */ }
			}
			return { items: links, walletBalance };
		}
		if (tabId === "provider") {
			return {
				items: [
					{ id: "provider", title: "Provider hub", nav: "provider" },
					{ id: "sell", title: "Sell on Strug", nav: "sd-ecommerce" },
					{ id: "host", title: "Host on Strug", nav: "sd-tempstay" },
				],
			};
		}
	}

	if (activeNav === "tempstay") {
		if (tabId === "trips") {
			const data = await getBookings({ role: "guest", vertical: "tempstay" }).catch(() => []);
			return { items: asArray(data).slice(0, limit).map(mapBookingToDrawerItem) };
		}
		if (tabId === "saved") {
			const data = await getSaves("stay").catch(() => []);
			return { items: asArray(data).slice(0, limit).map(mapSaveToDrawerItem) };
		}
		if (tabId === "recent") {
			return { items: readJsonStorage(STORAGE_KEYS.tempstayRecent, []).slice(0, limit).map(mapTempstayRecentRow) };
		}
	}

	if (activeNav === "food") {
		if (tabId === "orders") {
			const data = await getMyFoodOrders().catch(() => []);
			return { items: asArray(data).slice(0, limit).map((o) => ({
				id: o?.id,
				title: o?.vendor_name || o?.restaurant_name || `Order #${o?.id ?? ""}`,
				sub: o?.order_status ?? o?.status,
				nav: "food",
			})) };
		}
		if (tabId === "favourites") {
			const saves = await getSaves("restaurant").catch(() => []);
			return { items: asArray(saves).slice(0, limit).map(mapSaveToDrawerItem) };
		}
		if (tabId === "active") {
			const session = readSessionJson(STORAGE_KEYS.foodActive, null);
			if (session?.orderId) {
				return { items: [{ id: session.orderId, title: `Order #${session.orderId}`, sub: "In progress", nav: "food" }] };
			}
			const data = await getMyFoodOrders().catch(() => []);
			return { items: filterActiveFoodOrders(data).slice(0, limit).map((o) => ({
				id: o?.id,
				title: o?.vendor_name || `Order #${o?.id ?? ""}`,
				sub: o?.order_status ?? o?.status,
				nav: "food",
			})) };
		}
	}

	if (activeNav === "shop") {
		if (tabId === "orders") {
			if (!userId) return { items: [] };
			const data = await getMyOrders(userId).catch(() => []);
			return { items: asArray(data).slice(0, limit).map((o) => ({
				id: o?.id,
				title: o?.product_name || o?.title || `Order #${o?.id ?? ""}`,
				sub: o?.status,
				nav: "shop",
			})) };
		}
		if (tabId === "wishlist") {
			const data = await getSaves("product").catch(() => []);
			return { items: asArray(data).slice(0, limit).map(mapSaveToDrawerItem) };
		}
	}

	if (activeNav === "jobs") {
		if (tabId === "applications") {
			const data = await getMyApplications().catch(() => []);
			return { items: asArray(data).slice(0, limit).map(mapApplicationToDrawerItem) };
		}
		if (tabId === "saved") {
			const ids = readSavedJobIds().slice(0, limit);
			const jobs = await Promise.all(ids.map((id) => getJob(id).catch(() => null)));
			return {
				items: jobs.filter(Boolean).map((j) => ({
					id: j.job_id ?? j.id,
					title: j.title ?? j.job_title ?? `Job #${j.job_id ?? j.id ?? ""}`,
					sub: j.company_name ?? j.location,
					nav: "jobs",
					target: j.job_id != null ? { jobId: j.job_id } : undefined,
				})),
			};
		}
		if (tabId === "alerts") {
			const data = await getJobSavedSearches().catch(() => []);
			return { items: asArray(data).slice(0, limit).map(mapJobAlertToDrawerItem) };
		}
	}

	if (activeNav === "rideshare") {
		if (tabId === "trips") {
			const data = await getPassengerRideHistory({ limit }).catch(() => []);
			return { items: asArray(data).slice(0, limit).map((r) => ({
				id: r?.id,
				title: r?.pickup || r?.pickup_address || "Trip",
				sub: r?.status || r?.dropoff || r?.dropoff_address,
				nav: "rideshare",
			})) };
		}
		if (tabId === "places") {
			const data = await getAddresses().catch(() => []);
			const list = asArray(data?.data ?? data);
			return { items: list.slice(0, limit).map((a) => ({
				id: a?.id,
				title: a?.label || a?.name || a?.address_line1 || "Saved place",
				sub: a?.address_line1 || a?.city,
				nav: "rideshare",
			})) };
		}
		if (tabId === "active") {
			const session = readSessionJson(STORAGE_KEYS.rideshareActive, null);
			if (session?.requestId) {
				return { items: [{ id: session.requestId, title: `Ride #${session.requestId}`, sub: "In progress", nav: "rideshare" }] };
			}
			return { items: [] };
		}
	}

	if (activeNav === "venues") {
		if (tabId === "bookings") {
			const data = await getBookings({ role: "guest", vertical: "venue" }).catch(() => []);
			return { items: asArray(data).slice(0, limit).map(mapBookingToDrawerItem) };
		}
		if (tabId === "saved") {
			const data = await getSaves("venue").catch(() => []);
			return { items: asArray(data).slice(0, limit).map(mapSaveToDrawerItem) };
		}
	}

	if (activeNav === "social" || activeNav === "feed") {
		if (tabId === "bookmarks") {
			if (activeNav === "social") {
				const data = await getSavedPosts().catch(() => []);
				return { items: asArray(data).slice(0, limit).map((p) => mapSocialBookmarkRow(p, "social")) };
			}
			const res = await getBookmarkedPosts().catch(() => ({}));
			const posts = asArray(res?.data ?? res);
			return { items: posts.slice(0, limit).map((p) => mapSocialBookmarkRow(p, "feed")) };
		}
		if (tabId === "closeFriends") {
			const res = await getCloseFriends().catch(() => ({}));
			const friends = asArray(res?.data ?? res);
			return { items: friends.slice(0, limit).map(mapCloseFriendRow) };
		}
		if (tabId === "vault") {
			if (!opts.vaultUnlocked) return { items: [], vaultLocked: true };
			const rows = await listSocialVaultItems(userId).catch(() => []);
			if (rows == null) return { items: [], vaultLocked: true };
			return { items: asArray(rows).slice(0, limit).map((row) => mapVaultDrawerRow(row, activeNav)) };
		}
	}

	return { items: [] };
}
