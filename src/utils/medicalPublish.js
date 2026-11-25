/**
 * Medical Phase 0–2 — publish helpers.
 * Maps appointment_service_providers (+ user) → paired booking_listing payloads
 * (online priced + in-person free) that Medical.jsx already consumes.
 */

export const MEDICAL_PORTAL_KEY = "sd-doctors";
export const MEDICAL_VERTICAL = "medical";

/** Stable group id so online/inperson legs stay one doctor card. */
export function medicalGroupId(userId) {
	const id = userId != null ? String(userId) : "unknown";
	return `med_user_${id}`;
}

function optionalCoord(v) {
	if (v == null || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

/**
 * Build shared attributes for both listing legs.
 * @param {object} opts
 * @param {object} [opts.provider] appointment_service_providers row
 * @param {object} [opts.user] auth user
 * @param {object} [opts.overrides] form overrides (doctor_name, specialty, bio, fee, photo, credentials, lat/lng)
 */
export function buildMedicalListingAttributes({ provider = {}, user = {}, overrides = {} } = {}) {
	const doctorName =
		overrides.doctor_name
		|| provider.company_name
		|| user.name
		|| user.username
		|| "Doctor";
	const specialty =
		overrides.specialty
		|| provider.specialization
		|| "General Practice";
	const feeRaw = overrides.fee ?? provider.appointment_fee;
	const fee = Number(feeRaw);
	const onlinePrice = Number.isFinite(fee) && fee > 0 ? fee : 60;
	const photo =
		overrides.photo
		|| provider.profile_picture
		|| "linear-gradient(135deg,#0d1b35,#2563eb)";
	const userId = provider.service_provider_user_id ?? user.user_id ?? user.id ?? null;
	const group_id = overrides.group_id || medicalGroupId(userId);
	const latitude = optionalCoord(overrides.latitude ?? overrides.lat);
	const longitude = optionalCoord(overrides.longitude ?? overrides.lng ?? overrides.long);
	const insuranceRaw = overrides.insurance ?? overrides.insurance_plans ?? provider.insurance ?? "";
	const insurancePlans = (Array.isArray(insuranceRaw)
		? insuranceRaw
		: String(insuranceRaw || "").split(/[,;/|]+/))
		.map((s) => String(s || "").trim())
		.filter(Boolean);
	const insurancePlanIds = insurancePlans.map((s) => s.toLowerCase());
	const insuranceLabel = Array.isArray(insuranceRaw)
		? insurancePlans.join(", ")
		: (String(insuranceRaw || "").trim() || (insurancePlans.length ? insurancePlans.join(", ") : ""));

	const shared = {
		type: "medical",
		group_id,
		user_id: userId,
		doctor_name: doctorName,
		specialty,
		credentials: overrides.credentials != null
			? (String(overrides.credentials).trim() || null)
			: (provider.credentials || null),
		bio: overrides.bio != null
			? overrides.bio
			: (provider.specialization ? `${specialty} consultations on Strug.` : ""),
		photo,
		available: true,
		// Provider-table fields surfaced on patient cards (Phase 0 mapping).
		address: overrides.address ?? provider.company_address ?? null,
		language: overrides.language ?? provider.language ?? null,
		appointment_fee: onlinePrice,
		work_hours_from: overrides.work_hours_from ?? provider.work_hours_from ?? null,
		work_hours_to: overrides.work_hours_to ?? provider.work_hours_to ?? null,
		work_days_from: overrides.work_days_from ?? provider.work_days_from ?? null,
		work_days_to: overrides.work_days_to ?? provider.work_days_to ?? null,
		latitude,
		longitude,
		insurance: insuranceLabel || null,
		insurance_plans: insurancePlanIds,
		accepts_under_18: overrides.accepts_under_18 === true || overrides.acceptsUnder18 === true,
		provider_gender: overrides.provider_gender || overrides.providerGender || null,
		// Do not invent rating/reviews on publish — cards prefer live listing aggregates.
	};

	return { shared, onlinePrice, doctorName, specialty, group_id, latitude, longitude };
}

/**
 * Payload to sync the professional medical provider row (bug #241 profile bleed).
 * Does not touch personal user profile fields (email, personal address, etc.).
 */
export function buildProviderProfileUpdate({ provider = {}, overrides = {} } = {}) {
	const fee = Number(overrides.fee ?? overrides.appointment_fee ?? provider.appointment_fee);
	return {
		company_name: overrides.doctor_name || overrides.company_name || provider.company_name || undefined,
		specialization: overrides.specialty || overrides.specialization || provider.specialization || undefined,
		company_address: overrides.address ?? overrides.company_address ?? provider.company_address ?? undefined,
		language: overrides.language ?? provider.language ?? undefined,
		appointment_fee: Number.isFinite(fee) && fee > 0 ? fee : undefined,
		work_hours_from: overrides.work_hours_from ?? provider.work_hours_from ?? undefined,
		work_hours_to: overrides.work_hours_to ?? provider.work_hours_to ?? undefined,
		work_days_from: overrides.work_days_from ?? provider.work_days_from ?? undefined,
		work_days_to: overrides.work_days_to ?? provider.work_days_to ?? undefined,
	};
}

/** Create payloads for online + in-person booking_listing rows. */
export function buildMedicalListingPairPayloads(opts = {}) {
	const { shared, onlinePrice, doctorName, specialty, latitude, longitude } = buildMedicalListingAttributes(opts);
	const location = shared.address || opts.provider?.company_address || null;

	const geo = {};
	if (latitude != null) geo.latitude = latitude;
	if (longitude != null) geo.longitude = longitude;

	return {
		group_id: shared.group_id,
		online: {
			vertical: MEDICAL_VERTICAL,
			title: `${doctorName} — Online Consultation`,
			description: `${specialty} online consultation`,
			price: onlinePrice,
			price_unit: "session",
			currency: "CAD",
			fulfillment: "remote",
			instant_book: true,
			location: location || undefined,
			...geo,
			attributes: { ...shared, mode: "online" },
			images: [],
		},
		inperson: {
			vertical: MEDICAL_VERTICAL,
			title: `${doctorName} — In-Person Visit`,
			description: `${specialty} in-person visit`,
			price: 0,
			price_unit: "session",
			currency: "CAD",
			fulfillment: "onsite",
			instant_book: true,
			location: location || undefined,
			...geo,
			attributes: { ...shared, mode: "inperson" },
			images: [],
		},
	};
}

/**
 * Find existing medical legs for this doctor's group among getMyBookingListings rows.
 * @returns {{ online: object|null, inperson: object|null }}
 */
export function findMedicalListingPair(rows, groupId) {
	const list = Array.isArray(rows) ? rows : [];
	const mine = list.filter(
		(l) => l?.vertical === MEDICAL_VERTICAL || l?.attributes?.type === "medical",
	);
	const matched = mine.filter((l) => (l.attributes?.group_id || null) === groupId);
	const online = matched.find((l) => l.attributes?.mode === "online") || null;
	const inperson = matched.find((l) => l.attributes?.mode === "inperson") || null;
	return { online, inperson };
}

export function mapMedicalHostBooking(o = {}) {
	const status = String(o.status || "requested").toLowerCase();
	const listing = o.booking_listing || {};
	const attrs = listing.attributes && typeof listing.attributes === "object" ? listing.attributes : {};
	const mode = attrs.mode === "inperson" ? "inperson" : "online";
	const amountNum = Number(o.total ?? o.subtotal ?? 0) || 0;
	const date = o.start_date ? String(o.start_date).slice(0, 10) : "";
	const time = o.start_time ? String(o.start_time).slice(0, 5) : "";
	return {
		id: o.booking_id ?? o.id,
		client: o.guest?.name || o.guest?.username || o.guest_name || "Patient",
		service: listing.title || attrs.doctor_name || "Appointment",
		location: mode === "online" ? "Online" : (attrs.address || listing.location || "In person"),
		amount: amountNum > 0 ? `$${amountNum.toFixed(2)}` : "Free",
		amountNum,
		scheduled: [date, time].filter(Boolean).join(" · ") || "—",
		rawStatus: status,
		status: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
		note: o.notes || "",
		isMedicalBooking: true,
	};
}
