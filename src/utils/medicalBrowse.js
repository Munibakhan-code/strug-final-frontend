/**
 * Medical category browse/booking helpers (Phase 1–2 maturity).
 * Pure functions — unit-tested; keep Medical.jsx thin on filter/availability/profile logic.
 */
import { haversineKm } from "./geo.js";

/** Default appointment slots shown when the listing has no finer-grained schedule. */
export const DEFAULT_TIME_SLOTS = [
	"9:00 AM",
	"9:30 AM",
	"10:00 AM",
	"10:30 AM",
	"11:00 AM",
	"2:00 PM",
	"2:30 PM",
	"3:00 PM",
	"3:30 PM",
	"4:00 PM",
];

/** Specialty filter pills — labels must match `specialty` on doctor records / seed. */
export const MEDICAL_SPECIALTY_DEFS = [
	{ id: "all", labelKey: "medical.specialties.all", color: "#2563eb", match: null },
	{ id: "general-practice", labelKey: "medical.specialties.generalPractice", color: "#2563eb", match: "General Practice" },
	{ id: "dermatology", labelKey: "medical.specialties.dermatology", color: "#db2777", match: "Dermatology" },
	{ id: "cardiology", labelKey: "medical.specialties.cardiology", color: "#dc2626", match: "Cardiology" },
	{ id: "psychiatry", labelKey: "medical.specialties.psychiatry", color: "#7c3aed", match: "Psychiatry" },
	{ id: "pediatrics", labelKey: "medical.specialties.pediatrics", color: "#0891b2", match: "Pediatrics" },
	{ id: "orthopedics", labelKey: "medical.specialties.orthopedics", color: "#d97706", match: "Orthopedics" },
];

/** Near-me radius choices (km) for in-person browse. */
export const MEDICAL_RADIUS_OPTIONS_KM = [5, 10, 25, 50];

/** Self-reported plans shown on the patient filter (not a live payer network). */
export const MEDICAL_INSURANCE_OPTIONS = [
	{ id: "all", labelKey: "medical.insuranceAll" },
	{ id: "ohip", label: "OHIP" },
	{ id: "ramq", label: "RAMQ" },
	{ id: "msp", label: "MSP" },
	{ id: "aetna", label: "Aetna" },
	{ id: "blue-cross", label: "Blue Cross" },
	{ id: "cigna", label: "Cigna" },
	{ id: "united", label: "UnitedHealthcare" },
	{ id: "self-pay", label: "Self-pay" },
];

export const MEDICAL_SORT_IDS = ["relevance", "rating", "price", "availability", "distance"];

export const MEDICAL_FAQ_DEFS = [
	{ qKey: "medical.faq.book.q", aKey: "medical.faq.book.a" },
	{ qKey: "medical.faq.inperson.q", aKey: "medical.faq.inperson.a" },
	{ qKey: "medical.faq.emergency.q", aKey: "medical.faq.emergency.a" },
	{ qKey: "medical.faq.insurance.q", aKey: "medical.faq.insurance.a" },
];

export function normalizeInsurancePlans(raw) {
	if (Array.isArray(raw)) {
		return raw.map((s) => String(s || "").trim()).filter(Boolean);
	}
	if (typeof raw === "string") {
		return raw.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
	}
	return [];
}

export function matchesMedicalInsurance(doctor, selectedId) {
	if (selectedId == null || selectedId === "" || String(selectedId).toLowerCase() === "all") return true;
	const plans = normalizeInsurancePlans(doctor?.insurancePlans?.length ? doctor.insurancePlans : doctor?.insurance);
	if (!plans.length) return false;
	const opt = MEDICAL_INSURANCE_OPTIONS.find((o) => o.id === selectedId);
	const needles = [selectedId, opt?.label].filter(Boolean).flatMap((s) => {
		const n = normText(s);
		return [n, n.replace(/-/g, " "), n.replace(/\s+/g, "-")];
	});
	return plans.some((p) => {
		const n = normText(p);
		return needles.some((needle) => n.includes(needle) || needle.includes(n));
	});
}

function onlineConsultPrice(doctor) {
	const p = doctor?.online?.price ?? doctor?.price;
	const n = Number(p);
	return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function ratingSortKey(doctor) {
	// Null / missing rating sorts last — never invent a score for ranking.
	if (doctor?.rating == null || doctor.rating === "") return -1;
	const n = Number(doctor.rating);
	return Number.isFinite(n) ? n : -1;
}

export function sortMedicalDoctors(doctors, sortBy = "relevance") {
	const list = [...(Array.isArray(doctors) ? doctors : [])];
	if (sortBy === "rating") {
		list.sort((a, b) => ratingSortKey(b) - ratingSortKey(a)
			|| (Number(b.reviews) || 0) - (Number(a.reviews) || 0));
	} else if (sortBy === "price") {
		list.sort((a, b) => onlineConsultPrice(a) - onlineConsultPrice(b));
	} else if (sortBy === "availability") {
		list.sort((a, b) => {
			const ta = a.nextAvailableIso ? Date.parse(`${a.nextAvailableIso}T00:00:00`) : Number.POSITIVE_INFINITY;
			const tb = b.nextAvailableIso ? Date.parse(`${b.nextAvailableIso}T00:00:00`) : Number.POSITIVE_INFINITY;
			if (ta !== tb) return ta - tb;
			return Number(b.available === true) - Number(a.available === true)
				|| ratingSortKey(b) - ratingSortKey(a);
		});
	} else if (sortBy === "distance") {
		list.sort((a, b) => {
			if (a.distanceKm == null && b.distanceKm == null) return 0;
			if (a.distanceKm == null) return 1;
			if (b.distanceKm == null) return -1;
			return a.distanceKm - b.distanceKm;
		});
	}
	return list;
}

export function medicalPageMeta({ view = "grid", doctor = null } = {}) {
	if ((view === "profile" || view === "booking") && doctor?.name) {
		const spec = doctor.specialty ? ` — ${doctor.specialty}` : "";
		return {
			title: `${doctor.name}${spec}`,
			description: doctor.bio
				|| `Book ${doctor.name}${doctor.specialty ? `, ${doctor.specialty}` : ""} on Strug Medical.`,
		};
	}
	return {
		title: "Find a doctor",
		description: "Search by specialty or symptom, filter by insurance and location, and book in-person or online consultations on Strug.",
	};
}

export function buildMedicalJsonLd({ doctors = [], canonical = "" } = {}) {
	const list = Array.isArray(doctors) ? doctors : [];
	return {
		"@context": "https://schema.org",
		"@type": "ItemList",
		name: "Doctors on Strug",
		url: canonical || undefined,
		itemListElement: list.slice(0, 20).map((d, i) => ({
			"@type": "ListItem",
			position: i + 1,
			item: {
				"@type": "Physician",
				name: d.name,
				medicalSpecialty: d.specialty || undefined,
				...(d.address ? { address: d.address } : {}),
			},
		})),
	};
}

export function buildMedicalFaqJsonLd(faqs = []) {
	const list = Array.isArray(faqs) ? faqs : [];
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: list.map((f) => ({
			"@type": "Question",
			name: f.q,
			acceptedAnswer: { "@type": "Answer", text: f.a },
		})),
	};
}

/** "9:00 AM" → "09:00" (24h) for the booking engine start_time field. */
export function medTo24h(label) {
	const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label || "");
	if (!m) return label;
	let h = Number(m[1]) % 12;
	if (/PM/i.test(m[3])) h += 12;
	return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Normalize consult toggle ids — UI previously used "All" while filters compared "all". */
export function normalizeConsultType(id) {
	if (id == null || id === "" || String(id).toLowerCase() === "all") return "all";
	return String(id);
}

function normText(v) {
	return String(v || "").trim().toLowerCase();
}

/** Symptom phrases patients type instead of a specialty name (Zocdoc-style guided search). */
export const MEDICAL_SYMPTOM_MAP = [
	{ specialty: "Orthopedics", terms: ["knee pain", "knee", "joint", "fracture", "sports injury", "back pain", "hip"] },
	{ specialty: "Psychiatry", terms: ["anxiety", "depression", "mental", "panic", "therapy", "adhd", "insomnia"] },
	{ specialty: "Dermatology", terms: ["rash", "acne", "eczema", "skin", "mole", "psoriasis"] },
	{ specialty: "Cardiology", terms: ["chest pain", "heart", "hypertension", "blood pressure", "palpitation"] },
	{ specialty: "Pediatrics", terms: ["child", "kid", "newborn", "infant", "pediatric", "baby"] },
	{ specialty: "General Practice", terms: ["checkup", "check-up", "flu", "cold", "fever", "primary care", "gp"] },
];

export function specialtiesForSymptom(query) {
	const q = normText(query);
	if (!q) return [];
	const hits = [];
	for (const row of MEDICAL_SYMPTOM_MAP) {
		// Reverse containment only for queries ≥3 chars (q=a must not match every alias).
		if (row.terms.some((t) => q.includes(t) || (q.length >= 3 && t.includes(q)))) {
			hits.push(row.specialty);
		}
	}
	return [...new Set(hits)];
}

/** Phase 2–3 — free-text match on name / specialty / bio, plus symptom → specialty. */
export function matchesMedicalSearch(doctor, query) {
	const q = normText(query);
	if (!q) return true;
	const hay = [doctor?.name, doctor?.specialty, doctor?.bio, doctor?.credentials, doctor?.insurance]
		.map(normText)
		.join(" ");
	if (hay.includes(q)) return true;
	const specs = specialtiesForSymptom(q);
	const spec = normText(doctor?.specialty);
	return specs.some((s) => spec === normText(s));
}

/** Phase 2 — location text match on address / location. Empty query matches all. */
export function matchesMedicalLocation(doctor, locationQuery) {
	const q = normText(locationQuery);
	if (!q) return true;
	const hay = [doctor?.address, doctor?.location].map(normText).join(" ");
	return hay.includes(q);
}

export function doctorCoords(doctor) {
	const lat = Number(doctor?.latitude ?? doctor?.lat);
	const lng = Number(doctor?.longitude ?? doctor?.lng ?? doctor?.long);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return { lat, lng };
}

/** Attach distanceKm from a user origin (null when coords missing). */
export function withDoctorDistance(doctors, userLat, userLng) {
	const list = Array.isArray(doctors) ? doctors : [];
	return list.map((d) => {
		const c = doctorCoords(d);
		const distanceKm = c ? haversineKm(userLat, userLng, c.lat, c.lng) : null;
		return { ...d, distanceKm };
	});
}

export function filterMedicalDoctors(
	doctors,
	{
		specialtyId = "all",
		specialtyLabel = "All",
		consultType = "all",
		searchQuery = "",
		locationQuery = "",
		insurancePlan = "all",
		availableOnDate = "",
		acceptsUnder18 = false,
		providerGender = "all",
		userLat = null,
		userLng = null,
		radiusKm = null,
	} = {},
) {
	const mode = normalizeConsultType(consultType);
	const list = Array.isArray(doctors) ? doctors : [];
	const hasOrigin = Number.isFinite(Number(userLat)) && Number.isFinite(Number(userLng));
	const radius = radiusKm != null && radiusKm !== "" ? Number(radiusKm) : null;
	const applyRadius = hasOrigin && Number.isFinite(radius) && radius > 0;
	const specMatch = resolveSpecialtyMatch(specialtyId, specialtyLabel);

	const withDist = applyRadius || hasOrigin
		? withDoctorDistance(list, userLat, userLng)
		: list.map((d) => ({ ...d, distanceKm: d.distanceKm ?? null }));

	return withDist.filter((d) => {
		const matchSpec = !specMatch || d.specialty === specMatch;
		const matchMode = mode === "all" || (d.modes || []).includes(mode);
		if (!matchSpec || !matchMode) return false;
		if (!matchesMedicalSearch(d, searchQuery)) return false;
		if (!matchesMedicalLocation(d, locationQuery)) return false;
		if (!matchesMedicalInsurance(d, insurancePlan)) return false;
		if (acceptsUnder18 && !d.acceptsUnder18) return false;
		if (providerGender && providerGender !== "all") {
			if (normText(d.providerGender) !== normText(providerGender)) return false;
		}
		if (availableOnDate) {
			const iso = String(availableOnDate).slice(0, 10);
			if (!doctorAvailableOnDate(d, iso, mode)) return false;
		}
		if (applyRadius) {
			if (d.distanceKm == null) return false;
			if (d.distanceKm > radius) return false;
		}
		return true;
	});
}

function resolveSpecialtyMatch(specialtyId, specialtyLabel) {
	if (specialtyId && specialtyId !== "all") {
		const def = MEDICAL_SPECIALTY_DEFS.find((d) => d.id === specialtyId);
		if (def?.match) return def.match;
	}
	if (specialtyLabel && specialtyLabel !== "All" && String(specialtyLabel).toLowerCase() !== "all") {
		const byMatch = MEDICAL_SPECIALTY_DEFS.find((d) => d.match === specialtyLabel);
		if (byMatch?.match) return byMatch.match;
		return specialtyLabel;
	}
	return null;
}

export function canBookDoctor(doctor, mode) {
	const leg = doctor?.[mode];
	return doctor?.isReal === true && !!leg?.listingId;
}

export function isDemoDoctor(doctor) {
	return !doctor || doctor.isReal !== true;
}

export function doctorPhotoIsUrl(photo) {
	return typeof photo === "string" && /^https?:\/\//i.test(photo);
}

export function dayKeyFromDate(d) {
	if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/**
 * Parse getListingAvailability payload into blocked dates + booked times by date.
 * Times are stored as HH:MM (24h) when present.
 */
export function parseMedicalAvailability(payload) {
	const data = payload?.data ?? payload ?? {};
	const blockedDates = new Set();
	const bookedByDate = new Map();

	const pushBooked = (dateISO, time24) => {
		if (!dateISO) return;
		const key = String(dateISO).slice(0, 10);
		if (!bookedByDate.has(key)) bookedByDate.set(key, new Set());
		if (time24) {
			const t = String(time24).slice(0, 5);
			bookedByDate.get(key).add(t);
		} else {
			bookedByDate.get(key).add("*");
		}
	};

	for (const b of data.blocked || []) {
		if (b?.is_blocked && b.date) blockedDates.add(String(b.date).slice(0, 10));
	}
	for (const b of data.booked || []) {
		pushBooked(b?.start_date, b?.start_time);
	}

	return { blockedDates, bookedByDate };
}

export function isDateUnavailable(dateISO, availability) {
	if (!dateISO || !availability) return false;
	const key = String(dateISO).slice(0, 10);
	if (availability.blockedDates?.has(key)) return true;
	const times = availability.bookedByDate?.get(key);
	return !!(times && times.has("*"));
}

/**
 * Map default TIME_SLOTS to availability for a date.
 * When workHoursFrom/To are set, slots outside that window are unavailable.
 * @returns {{ label: string, time24: string, available: boolean }[]}
 */
export function slotsForDate(dateISO, availability, baseSlots = DEFAULT_TIME_SLOTS, workHours = null, workDays = null) {
	const key = dateISO ? String(dateISO).slice(0, 10) : "";
	if (key && !isWithinWorkDays(key, workDays?.from ?? workDays?.workDaysFrom, workDays?.to ?? workDays?.workDaysTo)) {
		return (baseSlots || []).map((label) => ({ label, time24: medTo24h(label), available: false }));
	}
	const fullyBlocked = isDateUnavailable(key, availability);
	const taken = availability?.bookedByDate?.get(key) || new Set();
	const fromM = parseTimeToMinutes(workHours?.from ?? workHours?.workHoursFrom);
	const toM = parseTimeToMinutes(workHours?.to ?? workHours?.workHoursTo);
	return (baseSlots || []).map((label) => {
		const time24 = medTo24h(label);
		const slotM = parseTimeToMinutes(time24);
		const inHours = fromM == null || toM == null || slotM == null
			|| (slotM >= fromM && slotM < toM);
		const available = inHours && !fullyBlocked && !taken.has(time24) && !taken.has("*");
		return { label, time24, available };
	});
}

/** Parse "09:00" / "9:00 AM" → minutes from midnight, or null. */
export function parseTimeToMinutes(raw) {
	if (raw == null || raw === "") return null;
	const s = String(raw).trim();
	const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s);
	if (ampm) {
		let h = Number(ampm[1]) % 12;
		if (/PM/i.test(ampm[3])) h += 12;
		return h * 60 + Number(ampm[2]);
	}
	const h24 = /^(\d{1,2}):(\d{2})$/.exec(s);
	if (h24) return Number(h24[1]) * 60 + Number(h24[2]);
	return null;
}

/**
 * First bookable default slot in the next `days` calendar days (skips a fully blocked today).
 * `fromDate` is local; day 0 is that date.
 */
export function firstOpenSlot(availability, {
	fromDate = new Date(),
	days = 14,
	baseSlots = DEFAULT_TIME_SLOTS,
	workHours = null,
	workDays = null,
} = {}) {
	const start = fromDate instanceof Date && !Number.isNaN(fromDate.getTime()) ? fromDate : new Date();
	for (let i = 0; i < days; i++) {
		const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		const dateISO = dayKeyFromDate(d);
		const open = slotsForDate(dateISO, availability, baseSlots, workHours, workDays).find((s) => s.available);
		if (open) {
			return { dateISO, label: open.label, time24: open.time24 };
		}
	}
	return null;
}

export function doctorHasSlotOnDate(availability, dateISO, baseSlots = DEFAULT_TIME_SLOTS, workHours = null, workDays = null) {
	if (!dateISO) return true;
	if (!availability) return true;
	return slotsForDate(String(dateISO).slice(0, 10), availability, baseSlots, workHours, workDays).some((s) => s.available);
}

export function doctorSchedule(doctor) {
	return {
		workHours: {
			from: doctor?.workHoursFrom ?? doctor?.work_hours_from ?? null,
			to: doctor?.workHoursTo ?? doctor?.work_hours_to ?? null,
		},
		workDays: {
			from: doctor?.workDaysFrom ?? doctor?.work_days_from ?? null,
			to: doctor?.workDaysTo ?? doctor?.work_days_to ?? null,
		},
	};
}

/** True when at least one consult mode has an open default slot on dateISO. */
export function doctorAvailableOnDate(doctor, dateISO, consultType = "all") {
	if (!dateISO) return true;
	const iso = String(dateISO).slice(0, 10);
	const { workHours, workDays } = doctorSchedule(doctor);
	const mode = normalizeConsultType(consultType);
	const legs = mode === "all" ? ["online", "inperson"] : [mode];
	let anyAvail = false;
	for (const m of legs) {
		const av = m === "online" ? doctor.availabilityOnline : doctor.availabilityInperson;
		if (av) {
			anyAvail = true;
			if (doctorHasSlotOnDate(av, iso, DEFAULT_TIME_SLOTS, workHours, workDays)) return true;
		}
	}
	if (!anyAvail && doctor.availability) {
		if (doctorHasSlotOnDate(doctor.availability, iso, DEFAULT_TIME_SLOTS, workHours, workDays)) return true;
		return false;
	}
	if (!anyAvail && doctor.nextAvailableIso && doctor.nextAvailableIso > iso) return false;
	if (!anyAvail) return true;
	return false;
}

const WEEKDAY_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function parseWeekdayIndex(raw) {
	if (raw == null || raw === "") return null;
	const s = String(raw).trim().toLowerCase().slice(0, 3);
	const i = WEEKDAY_SHORT.indexOf(s);
	return i >= 0 ? i : null;
}

export function isWithinWorkDays(dateISO, from, to) {
	const a = parseWeekdayIndex(from);
	const b = parseWeekdayIndex(to);
	if (a == null && b == null) return true;
	const d = new Date(`${String(dateISO).slice(0, 10)}T12:00:00`);
	if (Number.isNaN(d.getTime())) return true;
	const day = d.getDay();
	const start = a ?? 0;
	const end = b ?? 6;
	if (start <= end) return day >= start && day <= end;
	return day >= start || day <= end;
}

export function formatNextAvailable(slot, now = new Date()) {
	if (!slot?.dateISO) return null;
	const today = dayKeyFromDate(now);
	const tomorrow = dayKeyFromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
	if (slot.dateISO === today) return `Today · ${slot.label}`;
	if (slot.dateISO === tomorrow) return `Tomorrow · ${slot.label}`;
	const d = new Date(`${slot.dateISO}T12:00:00`);
	const pretty = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
	return `${pretty} · ${slot.label}`;
}

export function withNextAvailable(doctor, availability, now = new Date()) {
	const { workHours, workDays } = doctorSchedule(doctor);
	const slot = availability
		? firstOpenSlot(availability, { fromDate: now, workHours, workDays })
		: null;
	return {
		...doctor,
		availability: availability || doctor.availability || null,
		nextAvailable: slot,
		nextAvailableIso: slot?.dateISO || null,
		nextAvailableLabel: formatNextAvailable(slot, now),
	};
}

/** Earliest open slot across online and in-person listing availability. */
export function withNextAvailableFromLegs(doctor, { online = null, inperson = null } = {}, now = new Date()) {
	const { workHours, workDays } = doctorSchedule(doctor);
	const candidates = [];
	for (const av of [online, inperson]) {
		if (!av) continue;
		const slot = firstOpenSlot(av, { fromDate: now, workHours, workDays });
		if (slot) candidates.push(slot);
	}
	candidates.sort((a, b) => {
		if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
		return (a.time24 || "").localeCompare(b.time24 || "");
	});
	const slot = candidates[0] || null;
	return {
		...doctor,
		availabilityOnline: online || null,
		availabilityInperson: inperson || null,
		availability: online || inperson || doctor.availability || null,
		nextAvailable: slot,
		nextAvailableIso: slot?.dateISO || null,
		nextAvailableLabel: formatNextAvailable(slot, now),
	};
}

export function isVerifiedDoctor(doctor) {
	return doctor?.isReal === true && !!String(doctor.credentials || "").trim();
}

export function isHighlyRecommended(doctor) {
	// Only badge when live/real aggregates exist — never on invented defaults.
	const rating = Number(doctor?.rating);
	const reviews = Number(doctor?.reviews);
	return Number.isFinite(rating) && rating >= 4.8
		&& Number.isFinite(reviews) && reviews >= 5;
}

function cardRatingFromListing(l, a) {
	const raw = l.avg_rating != null && l.avg_rating !== "" ? l.avg_rating : a.rating;
	if (raw == null || raw === "") return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

function cardReviewsFromListing(l, a) {
	return Number(
		l.review_count != null ? l.review_count : (a.reviews != null ? a.reviews : 0),
	) || 0;
}

/** Prefer the listing leg with more (or any) live reviews when grouping modes. */
function mergeReviewAggregates(target, l, a) {
	const reviews = cardReviewsFromListing(l, a);
	const rating = cardRatingFromListing(l, a);
	if (reviews > target.reviews) {
		target.reviews = reviews;
		target.rating = rating;
	} else if (reviews === target.reviews && target.rating == null && rating != null) {
		target.rating = rating;
	}
}

/** Group booking_listing rows (vertical medical) into doctor cards. */
export function groupMedicalListings(rows) {
	const arr = Array.isArray(rows) ? rows : [];
	const real = arr.filter((l) => (l.attributes?.type) === "medical");
	const groups = {};
	for (const l of real) {
		const a = l.attributes ?? {};
		const key = a.group_id ?? a.doctor_name ?? l.booking_listing_id;
		if (!groups[key]) {
			groups[key] = {
				id: key,
				isReal: true,
				name: a.doctor_name || l.title || "Doctor",
				specialty: a.specialty || "General Practice",
				credentials: a.credentials || null,
				rating: cardRatingFromListing(l, a),
				reviews: cardReviewsFromListing(l, a),
				photo: a.photo || "linear-gradient(135deg,#0d1b35,#2563eb)",
				bio: a.bio || "",
				available: a.available !== false,
				userId: a.user_id ?? null,
				address: a.address || null,
				location: l.location || a.address || null,
				language: a.language || null,
				appointmentFee: a.appointment_fee ?? null,
				workHoursFrom: a.work_hours_from ?? null,
				workHoursTo: a.work_hours_to ?? null,
				workDaysFrom: a.work_days_from ?? null,
				workDaysTo: a.work_days_to ?? null,
				insurance: a.insurance || null,
				insurancePlans: normalizeInsurancePlans(a.insurance_plans?.length ? a.insurance_plans : a.insurance),
				acceptsUnder18: a.accepts_under_18 === true || a.accepts_under_18 === "true",
				providerGender: a.provider_gender || null,
				latitude: l.latitude != null ? Number(l.latitude) : (a.latitude != null ? Number(a.latitude) : null),
				longitude: l.longitude != null ? Number(l.longitude) : (a.longitude != null ? Number(a.longitude) : null),
				online: null,
				inperson: null,
				modes: [],
			};
		} else {
			// Prefer coordinates / location from whichever leg has them.
			if (groups[key].latitude == null && l.latitude != null) groups[key].latitude = Number(l.latitude);
			if (groups[key].longitude == null && l.longitude != null) groups[key].longitude = Number(l.longitude);
			if (!groups[key].location && (l.location || a.address)) {
				groups[key].location = l.location || a.address;
			}
			if (!groups[key].credentials && a.credentials) groups[key].credentials = a.credentials;
			if (!groups[key].address && a.address) groups[key].address = a.address;
			if (!groups[key].insurance && a.insurance) groups[key].insurance = a.insurance;
			if (!groups[key].insurancePlans?.length) {
				groups[key].insurancePlans = normalizeInsurancePlans(a.insurance_plans?.length ? a.insurance_plans : a.insurance);
			}
			mergeReviewAggregates(groups[key], l, a);
		}
		const mode = a.mode === "inperson" ? "inperson" : "online";
		groups[key][mode] = { listingId: l.booking_listing_id, price: Number(l.price) || 0 };
		if (!groups[key].modes.includes(mode)) groups[key].modes.push(mode);
	}
	return Object.values(groups).map((d) => ({
		...d,
		modes: ["inperson", "online"].filter((m) => d.modes.includes(m)),
		price: d.online?.price ?? 0,
	}));
}

/** Normalize GET /booking/listings/:id/reviews payload for the profile UI. */
export function normalizeListingReviews(payload) {
	const data = payload?.data ?? payload ?? {};
	const list = Array.isArray(data.reviews) ? data.reviews : [];
	return {
		avgRating: Number(data.avg_rating ?? 0) || 0,
		reviewCount: Number(data.review_count ?? list.length) || 0,
		reviews: list.map((r) => ({
			id: r.booking_review_id ?? r.id,
			rating: Number(r.rating) || 0,
			body: r.review || r.comment || "",
			createdAt: r.created_at || null,
			author: r.user?.name || r.user?.username || "Patient",
		})),
	};
}

/** Combine review payloads from online + in-person listing legs. */
export function mergeListingReviewPayloads(payloads) {
	const summaries = (Array.isArray(payloads) ? payloads : []).filter(Boolean).map(normalizeListingReviews);
	const seen = new Set();
	const reviews = [];
	for (const s of summaries) {
		for (const r of s.reviews) {
			const key = r.id != null ? String(r.id) : `${r.author}:${r.createdAt}:${r.body}`;
			if (seen.has(key)) continue;
			seen.add(key);
			reviews.push(r);
		}
	}
	const rated = reviews.filter((r) => r.rating > 0);
	const avgRating = rated.length
		? rated.reduce((s, r) => s + r.rating, 0) / rated.length
		: 0;
	return {
		avgRating,
		reviewCount: reviews.length,
		reviews,
	};
}

/** Profile page model: doctor card + verified reviews for a primary listing. */
export function buildDoctorProfileModel(doctor, reviewsPayload) {
	const reviewSummary = normalizeListingReviews(reviewsPayload);
	const primaryListingId =
		doctor?.online?.listingId
		|| doctor?.inperson?.listingId
		|| null;
	return {
		id: doctor?.id,
		displayName: doctor?.name || "Doctor",
		specialty: doctor?.specialty || "",
		credentials: doctor?.credentials || null,
		bio: doctor?.bio || "",
		photo: doctor?.photo,
		address: doctor?.address || doctor?.location || null,
		language: doctor?.language || null,
		insurance: doctor?.insurance || null,
		insurancePlans: normalizeInsurancePlans(doctor?.insurancePlans?.length ? doctor.insurancePlans : doctor?.insurance),
		acceptsUnder18: doctor?.acceptsUnder18 === true,
		providerGender: doctor?.providerGender || null,
		workHoursFrom: doctor?.workHoursFrom || null,
		workHoursTo: doctor?.workHoursTo || null,
		nextAvailableLabel: doctor?.nextAvailableLabel || null,
		modes: doctor?.modes || [],
		online: doctor?.online || null,
		inperson: doctor?.inperson || null,
		isReal: doctor?.isReal === true,
		primaryListingId,
		cardRating: doctor?.rating ?? null,
		cardReviews: doctor?.reviews ?? 0,
		reviewSummary,
	};
}
