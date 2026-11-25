/**
 * Ensure the signed-in doctor has paired medical booking_listings on the patient page.
 * Creates or updates online + in-person legs from provider profile fields.
 * Phase 2 also syncs the professional appointment_service_providers row (bug #241).
 */
import { getMyBookingListings, createBookingListing, updateBookingListing } from "../api/booking.js";
import { getMedicalProviders, updateServiceProviderProfile } from "../api/medical.js";
import { getUser } from "../store/auth.js";
import {
	buildMedicalListingPairPayloads,
	buildProviderProfileUpdate,
	findMedicalListingPair,
	medicalGroupId,
} from "./medicalPublish.js";

async function resolveProviderRow(userId) {
	try {
		const rows = await getMedicalProviders();
		const list = Array.isArray(rows) ? rows : (rows?.data ?? []);
		return list.find((p) => Number(p.service_provider_user_id) === Number(userId)) || null;
	} catch {
		return null;
	}
}

export async function ensureMedicalListingPair(overrides = {}) {
	const user = getUser() || {};
	const userId = user.user_id ?? user.id;
	if (!userId) throw new Error("Not signed in");

	const provider = (await resolveProviderRow(userId)) || {};
	const pair = buildMedicalListingPairPayloads({ provider, user, overrides });
	const groupId = pair.group_id || medicalGroupId(userId);

	const mineRes = await getMyBookingListings({ vertical: "medical" });
	const mine = Array.isArray(mineRes) ? mineRes : (mineRes?.data ?? []);
	const existing = findMedicalListingPair(mine, groupId);

	const upsert = async (legKey, payload) => {
		const current = existing[legKey];
		const body = {
			title: payload.title,
			description: payload.description,
			price: payload.price,
			price_unit: payload.price_unit,
			fulfillment: payload.fulfillment,
			location: payload.location,
			attributes: payload.attributes,
			instant_book: payload.instant_book,
			is_active: true,
		};
		if (payload.latitude != null) body.latitude = payload.latitude;
		if (payload.longitude != null) body.longitude = payload.longitude;

		if (current?.booking_listing_id) {
			const updated = await updateBookingListing(current.booking_listing_id, body);
			return updated?.data ?? updated;
		}
		const created = await createBookingListing(payload);
		return created?.data ?? created;
	};

	const online = await upsert("online", pair.online);
	const inperson = await upsert("inperson", pair.inperson);

	// Sync professional medical profile (not personal user profile).
	if (provider.service_provider_id) {
		const prof = buildProviderProfileUpdate({ provider, overrides });
		const cleaned = Object.fromEntries(
			Object.entries(prof).filter(([, v]) => v !== undefined && v !== null && v !== ""),
		);
		if (Object.keys(cleaned).length) {
			try {
				await updateServiceProviderProfile(provider.service_provider_id, cleaned);
			} catch {
				// Listing publish still succeeds if provider sync fails.
			}
		}
	}

	return { online, inperson, group_id: groupId, provider_id: provider.service_provider_id ?? null };
}
