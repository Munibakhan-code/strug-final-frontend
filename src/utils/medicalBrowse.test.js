/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	DEFAULT_TIME_SLOTS,
	MEDICAL_SPECIALTY_DEFS,
	MEDICAL_RADIUS_OPTIONS_KM,
	medTo24h,
	normalizeConsultType,
	filterMedicalDoctors,
	canBookDoctor,
	isDemoDoctor,
	doctorPhotoIsUrl,
	dayKeyFromDate,
	parseMedicalAvailability,
	isDateUnavailable,
	slotsForDate,
	groupMedicalListings,
	matchesMedicalSearch,
	matchesMedicalLocation,
	doctorCoords,
	withDoctorDistance,
	normalizeListingReviews,
	buildDoctorProfileModel,
	MEDICAL_INSURANCE_OPTIONS,
	MEDICAL_SORT_IDS,
	MEDICAL_FAQ_DEFS,
	normalizeInsurancePlans,
	matchesMedicalInsurance,
	specialtiesForSymptom,
	sortMedicalDoctors,
	medicalPageMeta,
	buildMedicalJsonLd,
	buildMedicalFaqJsonLd,
	firstOpenSlot,
	doctorHasSlotOnDate,
	formatNextAvailable,
	withNextAvailable,
	isVerifiedDoctor,
	isHighlyRecommended,
	isWithinWorkDays,
} from "./medicalBrowse.js";

describe("medTo24h", () => {
	it("converts AM/PM labels to HH:MM", () => {
		expect(medTo24h("9:00 AM")).toBe("09:00");
		expect(medTo24h("9:30 AM")).toBe("09:30");
		expect(medTo24h("12:00 PM")).toBe("12:00");
		expect(medTo24h("2:00 PM")).toBe("14:00");
		expect(medTo24h("12:00 AM")).toBe("00:00");
	});

	it("passes through unrecognized labels", () => {
		expect(medTo24h("14:00")).toBe("14:00");
		expect(medTo24h("")).toBe("");
	});
});

describe("normalizeConsultType / filterMedicalDoctors", () => {
	const doctors = [
		{ id: 1, specialty: "Dermatology", modes: ["online", "inperson"], isReal: true },
		{ id: 2, specialty: "Cardiology", modes: ["online"], isReal: true },
		{ id: 3, specialty: "Dermatology", modes: ["inperson"], isReal: false },
	];

	it("treats All / all as no consult filter (Phase 1 bug fix)", () => {
		expect(normalizeConsultType("All")).toBe("all");
		expect(normalizeConsultType("all")).toBe("all");
		expect(filterMedicalDoctors(doctors, { consultType: "All" })).toHaveLength(3);
		expect(filterMedicalDoctors(doctors, { consultType: "all" })).toHaveLength(3);
	});

	it("filters by online / inperson", () => {
		expect(filterMedicalDoctors(doctors, { consultType: "online" }).map((d) => d.id)).toEqual([1, 2]);
		expect(filterMedicalDoctors(doctors, { consultType: "inperson" }).map((d) => d.id)).toEqual([1, 3]);
	});

	it("filters by specialty label", () => {
		expect(filterMedicalDoctors(doctors, { specialtyLabel: "Dermatology" })).toHaveLength(2);
		expect(filterMedicalDoctors(doctors, { specialtyLabel: "All" })).toHaveLength(3);
	});

	it("filters by stable specialty id (i18n-safe)", () => {
		expect(filterMedicalDoctors(doctors, { specialtyId: "dermatology" })).toHaveLength(2);
		expect(filterMedicalDoctors(doctors, { specialtyId: "all" })).toHaveLength(3);
	});
});

describe("demo vs real booking gates", () => {
	it("canBookDoctor requires isReal + listingId for mode", () => {
		expect(canBookDoctor({ isReal: true, online: { listingId: 9 } }, "online")).toBe(true);
		expect(canBookDoctor({ isReal: true, online: { listingId: null } }, "online")).toBe(false);
		expect(canBookDoctor({ isReal: false, online: { listingId: 9 } }, "online")).toBe(false);
		expect(isDemoDoctor({ isReal: false })).toBe(true);
		expect(isDemoDoctor({ isReal: true })).toBe(false);
	});

	it("detects http photos for Avatar", () => {
		expect(doctorPhotoIsUrl("https://cdn.example/doc.jpg")).toBe(true);
		expect(doctorPhotoIsUrl("linear-gradient(135deg,#0d1b35,#2563eb)")).toBe(false);
	});
});

describe("availability slots", () => {
	it("parses blocked dates and booked times", () => {
		const av = parseMedicalAvailability({
			data: {
				blocked: [{ date: "2026-08-12", is_blocked: true }],
				booked: [
					{ start_date: "2026-08-13", start_time: "09:00:00" },
					{ start_date: "2026-08-14" },
				],
			},
		});
		expect(av.blockedDates.has("2026-08-12")).toBe(true);
		expect(av.bookedByDate.get("2026-08-13").has("09:00")).toBe(true);
		expect(isDateUnavailable("2026-08-12", av)).toBe(true);
		expect(isDateUnavailable("2026-08-14", av)).toBe(true);
		expect(isDateUnavailable("2026-08-13", av)).toBe(false);
	});

	it("disables taken and blocked slots", () => {
		const av = parseMedicalAvailability({
			booked: [{ start_date: "2026-08-13", start_time: "09:00" }],
			blocked: [{ date: "2026-08-15", is_blocked: true }],
		});
		const open = slotsForDate("2026-08-13", av);
		expect(open.find((s) => s.label === "9:00 AM")?.available).toBe(false);
		expect(open.find((s) => s.label === "9:30 AM")?.available).toBe(true);
		expect(slotsForDate("2026-08-15", av).every((s) => !s.available)).toBe(true);
		expect(DEFAULT_TIME_SLOTS.length).toBe(10);
	});

	it("intersects DEFAULT_TIME_SLOTS with published work hours", () => {
		const open = slotsForDate("2026-08-13", null, DEFAULT_TIME_SLOTS, {
			from: "13:00",
			to: "17:00",
		});
		expect(open.find((s) => s.label === "9:00 AM")?.available).toBe(false);
		expect(open.find((s) => s.label === "11:00 AM")?.available).toBe(false);
		expect(open.find((s) => s.label === "2:00 PM")?.available).toBe(true);
		expect(open.find((s) => s.label === "4:00 PM")?.available).toBe(true);
		const next = firstOpenSlot(null, {
			fromDate: new Date(2026, 7, 13),
			days: 1,
			workHours: { from: "13:00", to: "17:00" },
		});
		expect(next?.label).toBe("2:00 PM");
	});

	it("dayKeyFromDate is local YYYY-MM-DD", () => {
		expect(dayKeyFromDate(new Date(2026, 7, 13))).toBe("2026-08-13");
		expect(dayKeyFromDate(null)).toBe("");
	});
});

describe("groupMedicalListings", () => {
	it("pairs online/inperson legs by group_id", () => {
		const grouped = groupMedicalListings([
			{
				booking_listing_id: 1,
				title: "Dr A",
				price: 80,
				attributes: { type: "medical", group_id: "g1", doctor_name: "Dr A", specialty: "Dermatology", mode: "online" },
			},
			{
				booking_listing_id: 2,
				title: "Dr A",
				price: 0,
				attributes: { type: "medical", group_id: "g1", doctor_name: "Dr A", specialty: "Dermatology", mode: "inperson" },
			},
			{ booking_listing_id: 3, attributes: { type: "lesson" } },
		]);
		expect(grouped).toHaveLength(1);
		expect(grouped[0].isReal).toBe(true);
		expect(grouped[0].modes).toEqual(["inperson", "online"]);
		expect(grouped[0].online.listingId).toBe(1);
		expect(grouped[0].inperson.listingId).toBe(2);
		expect(grouped[0].price).toBe(80);
	});

	it("passes through address/language from attributes", () => {
		const grouped = groupMedicalListings([
			{
				booking_listing_id: 9,
				price: 70,
				attributes: {
					type: "medical",
					group_id: "g2",
					doctor_name: "Dr B",
					mode: "online",
					address: "1 Main St",
					language: "fr",
					appointment_fee: 70,
				},
			},
		]);
		expect(grouped[0].address).toBe("1 Main St");
		expect(grouped[0].language).toBe("fr");
	});

	it("keeps listing coordinates and credentials for Phase 2 geo/profile", () => {
		const grouped = groupMedicalListings([
			{
				booking_listing_id: 11,
				price: 80,
				latitude: 43.65,
				longitude: -79.38,
				location: "Toronto, ON",
				attributes: {
					type: "medical",
					group_id: "g3",
					doctor_name: "Dr C",
					mode: "inperson",
					credentials: "MD, FRCPC",
					specialty: "Pediatrics",
				},
			},
		]);
		expect(grouped[0].latitude).toBe(43.65);
		expect(grouped[0].longitude).toBe(-79.38);
		expect(grouped[0].location).toBe("Toronto, ON");
		expect(grouped[0].credentials).toBe("MD, FRCPC");
		expect(grouped[0].specialty).toBe("Pediatrics");
	});
});

describe("Phase 2 search / location / specialties", () => {
	it("exposes seed-aligned specialty pills including Pediatrics and Orthopedics", () => {
		const ids = MEDICAL_SPECIALTY_DEFS.map((s) => s.id);
		expect(ids).toContain("pediatrics");
		expect(ids).toContain("orthopedics");
		expect(ids[0]).toBe("all");
		expect(MEDICAL_RADIUS_OPTIONS_KM).toEqual([5, 10, 25, 50]);
	});

	it("matchesMedicalSearch checks name, specialty, and bio", () => {
		const doc = {
			name: "Dr. Marcus Lee",
			specialty: "Pediatrics",
			bio: "Caring for newborns through adolescents.",
		};
		expect(matchesMedicalSearch(doc, "marcus")).toBe(true);
		expect(matchesMedicalSearch(doc, "PEDIATRICS")).toBe(true);
		expect(matchesMedicalSearch(doc, "newborns")).toBe(true);
		expect(matchesMedicalSearch(doc, "dermatology")).toBe(false);
		expect(matchesMedicalSearch(doc, "  ")).toBe(true);
	});

	it("matchesMedicalLocation checks address and location text", () => {
		const doc = { address: "100 Queen St W, Toronto", location: "Toronto, ON" };
		expect(matchesMedicalLocation(doc, "toronto")).toBe(true);
		expect(matchesMedicalLocation(doc, "queen")).toBe(true);
		expect(matchesMedicalLocation(doc, "vancouver")).toBe(false);
		expect(matchesMedicalLocation(doc, "")).toBe(true);
	});

	it("filterMedicalDoctors combines search + location + radius", () => {
		const doctors = [
			{
				id: "a",
				name: "Dr Near",
				specialty: "Dermatology",
				bio: "Skin",
				modes: ["inperson"],
				address: "Toronto",
				latitude: 43.65,
				longitude: -79.38,
			},
			{
				id: "b",
				name: "Dr Far",
				specialty: "Dermatology",
				bio: "Skin",
				modes: ["inperson"],
				address: "Ottawa",
				latitude: 45.42,
				longitude: -75.69,
			},
			{
				id: "c",
				name: "Dr Online Only",
				specialty: "Cardiology",
				bio: "Heart",
				modes: ["online"],
				address: null,
			},
		];
		expect(
			filterMedicalDoctors(doctors, {
				specialtyLabel: "Dermatology",
				searchQuery: "skin",
				locationQuery: "toronto",
			}).map((d) => d.id),
		).toEqual(["a"]);

		const near = filterMedicalDoctors(doctors, {
			specialtyLabel: "All",
			userLat: 43.65,
			userLng: -79.38,
			radiusKm: 25,
		});
		expect(near.map((d) => d.id)).toEqual(["a"]);
		expect(near[0].distanceKm).toBeLessThan(1);
	});

	it("withDoctorDistance / doctorCoords tolerate missing coords", () => {
		expect(doctorCoords({ latitude: "43.7", longitude: "-79.4" })).toEqual({ lat: 43.7, lng: -79.4 });
		expect(doctorCoords({})).toBeNull();
		expect(withDoctorDistance([{ id: 1 }], 43.65, -79.38)[0].distanceKm).toBeNull();
	});
});

describe("Phase 2 profile + reviews model", () => {
	it("normalizeListingReviews reads avg/count/list", () => {
		const n = normalizeListingReviews({
			data: {
				avg_rating: 4.6,
				review_count: 2,
				reviews: [
					{ booking_review_id: 1, rating: 5, review: "Great", created_at: "2026-08-01", user: { name: "A" } },
					{ booking_review_id: 2, rating: 4, review: "Good", created_at: "2026-08-02", user: { username: "b" } },
				],
			},
		});
		expect(n.avgRating).toBe(4.6);
		expect(n.reviewCount).toBe(2);
		expect(n.reviews).toHaveLength(2);
		expect(n.reviews[0].author).toBe("A");
		expect(n.reviews[1].author).toBe("b");
	});

	it("buildDoctorProfileModel merges doctor card + reviews", () => {
		const profile = buildDoctorProfileModel(
			{
				id: "g1",
				name: "Dr A",
				specialty: "Dermatology",
				credentials: "MD",
				bio: "Skin health",
				address: "1 Main",
				language: "en",
				rating: 4.8,
				reviews: 10,
				modes: ["online", "inperson"],
				online: { listingId: 1, price: 95 },
				inperson: { listingId: 2, price: 0 },
				isReal: true,
			},
			{
				avg_rating: 4.9,
				review_count: 3,
				reviews: [{ booking_review_id: 9, rating: 5, review: "Excellent", user: { name: "Pat" } }],
			},
		);
		expect(profile.displayName).toBe("Dr A");
		expect(profile.credentials).toBe("MD");
		expect(profile.primaryListingId).toBe(1);
		expect(profile.reviewSummary.avgRating).toBe(4.9);
		expect(profile.reviewSummary.reviews[0].body).toBe("Excellent");
	});
});

describe("Phase 3 insurance / sort / symptoms / SEO", () => {
	it("exposes insurance chips and sort ids", () => {
		const ids = MEDICAL_INSURANCE_OPTIONS.map((o) => o.id);
		expect(ids[0]).toBe("all");
		expect(ids).toContain("ohip");
		expect(ids).toContain("aetna");
		expect(MEDICAL_SORT_IDS).toEqual(["relevance", "rating", "price", "availability", "distance"]);
		expect(MEDICAL_FAQ_DEFS.length).toBeGreaterThanOrEqual(3);
		expect(MEDICAL_FAQ_DEFS.every((f) => f.qKey && f.aKey)).toBe(true);
	});

	it("normalizeInsurancePlans accepts array or comma-separated string", () => {
		expect(normalizeInsurancePlans("OHIP, Aetna; Blue Cross")).toEqual(["OHIP", "Aetna", "Blue Cross"]);
		expect(normalizeInsurancePlans(["ohip", "  ", "Cigna"])).toEqual(["ohip", "Cigna"]);
		expect(normalizeInsurancePlans(null)).toEqual([]);
	});

	it("matchesMedicalInsurance is a no-op for all / empty", () => {
		const doc = { insurancePlans: ["OHIP", "Aetna"] };
		expect(matchesMedicalInsurance(doc, "all")).toBe(true);
		expect(matchesMedicalInsurance(doc, "")).toBe(true);
		expect(matchesMedicalInsurance(doc, "ohip")).toBe(true);
		expect(matchesMedicalInsurance(doc, "cigna")).toBe(false);
		expect(matchesMedicalInsurance({ insurancePlans: [] }, "ohip")).toBe(false);
		expect(matchesMedicalInsurance({ insurancePlans: ["blue cross"] }, "blue-cross")).toBe(true);
	});

	it("maps symptom queries onto specialties", () => {
		expect(specialtiesForSymptom("knee pain")).toContain("Orthopedics");
		expect(specialtiesForSymptom("anxiety")).toContain("Psychiatry");
		expect(specialtiesForSymptom("rash")).toContain("Dermatology");
		expect(matchesMedicalSearch({ name: "Dr Bone", specialty: "Orthopedics", bio: "" }, "knee pain")).toBe(true);
		expect(matchesMedicalSearch({ name: "Dr Skin", specialty: "Dermatology", bio: "" }, "knee pain")).toBe(false);
		// Short reverse-containment must not OR every specialty (q=a / q=ra).
		expect(specialtiesForSymptom("a")).toEqual([]);
		expect(specialtiesForSymptom("ra")).toEqual([]);
		expect(specialtiesForSymptom("ras")).toContain("Dermatology");
	});

	it("prefers live listing aggregates over published attribute defaults", () => {
		const withLive = groupMedicalListings([
			{
				booking_listing_id: 1,
				price: 80,
				avg_rating: 4.2,
				review_count: 7,
				attributes: {
					type: "medical",
					group_id: "g-live",
					doctor_name: "Dr Live",
					mode: "online",
					rating: 5,
					reviews: 0,
				},
			},
		]);
		expect(withLive[0].rating).toBe(4.2);
		expect(withLive[0].reviews).toBe(7);

		const noLive = groupMedicalListings([
			{
				booking_listing_id: 2,
				price: 80,
				attributes: {
					type: "medical",
					group_id: "g-new",
					doctor_name: "Dr New",
					mode: "online",
				},
			},
		]);
		expect(noLive[0].rating).toBeNull();
		expect(noLive[0].reviews).toBe(0);
		expect(isHighlyRecommended(noLive[0])).toBe(false);
	});

	it("groupMedicalListings merges rating aggregates across online/in-person legs", () => {
		const onlineFirst = groupMedicalListings([
			{
				booking_listing_id: 1,
				price: 80,
				attributes: { type: "medical", group_id: "g-legs", doctor_name: "Dr Legs", mode: "online" },
			},
			{
				booking_listing_id: 2,
				price: 0,
				avg_rating: 4.6,
				review_count: 12,
				attributes: { type: "medical", group_id: "g-legs", doctor_name: "Dr Legs", mode: "inperson" },
			},
		]);
		expect(onlineFirst[0].rating).toBe(4.6);
		expect(onlineFirst[0].reviews).toBe(12);

		const ratedFirst = groupMedicalListings([
			{
				booking_listing_id: 3,
				price: 0,
				avg_rating: 4.6,
				review_count: 12,
				attributes: { type: "medical", group_id: "g-legs-2", doctor_name: "Dr Legs", mode: "inperson" },
			},
			{
				booking_listing_id: 4,
				price: 80,
				attributes: { type: "medical", group_id: "g-legs-2", doctor_name: "Dr Legs", mode: "online" },
			},
		]);
		expect(ratedFirst[0].rating).toBe(4.6);
		expect(ratedFirst[0].reviews).toBe(12);
	});

	it("filterMedicalDoctors applies insurance plan", () => {
		const doctors = [
			{ id: "a", specialty: "Dermatology", modes: ["online"], insurancePlans: ["OHIP", "Aetna"] },
			{ id: "b", specialty: "Dermatology", modes: ["online"], insurancePlans: ["Cigna"] },
		];
		expect(filterMedicalDoctors(doctors, { insurancePlan: "aetna" }).map((d) => d.id)).toEqual(["a"]);
		expect(filterMedicalDoctors(doctors, { insurancePlan: "all" })).toHaveLength(2);
	});

	it("sortMedicalDoctors ranks rating, price, availability, distance", () => {
		const doctors = [
			{ id: "low", rating: 4.1, reviews: 10, price: 140, available: false, distanceKm: 12, online: { price: 140 } },
			{ id: "high", rating: 4.9, reviews: 2, price: 80, available: true, distanceKm: 3, online: { price: 80 } },
			{ id: "mid", rating: 4.5, reviews: 40, price: 95, available: true, distanceKm: null, online: { price: 95 } },
			{ id: "none", rating: null, reviews: 0, price: 70, available: true, distanceKm: 1, online: { price: 70 } },
		];
		expect(sortMedicalDoctors(doctors, "rating").map((d) => d.id)).toEqual(["high", "mid", "low", "none"]);
		expect(sortMedicalDoctors(doctors, "price").map((d) => d.id)).toEqual(["none", "high", "mid", "low"]);
		expect(sortMedicalDoctors(doctors, "availability")[0].id).not.toBe("low");
		expect(sortMedicalDoctors(doctors, "distance").map((d) => d.id)).toEqual(["none", "high", "low", "mid"]);
		expect(sortMedicalDoctors(doctors, "relevance").map((d) => d.id)).toEqual(["low", "high", "mid", "none"]);
	});

	it("groupMedicalListings keeps insurance from attributes", () => {
		const grouped = groupMedicalListings([
			{
				booking_listing_id: 1,
				price: 80,
				attributes: {
					type: "medical",
					group_id: "g-ins",
					doctor_name: "Dr Ins",
					mode: "online",
					insurance: "OHIP, Aetna",
					insurance_plans: ["ohip", "aetna"],
				},
			},
		]);
		expect(grouped[0].insurancePlans).toEqual(["ohip", "aetna"]);
		expect(grouped[0].insurance).toBe("OHIP, Aetna");
	});

	it("medicalPageMeta and JSON-LD describe browse vs profile", () => {
		const browse = medicalPageMeta({ view: "grid" });
		expect(browse.title.toLowerCase()).toContain("doctor");
		expect(browse.description.length).toBeGreaterThan(20);

		const profile = medicalPageMeta({
			view: "profile",
			doctor: { name: "Dr. Ada", specialty: "Dermatology", bio: "Skin health" },
		});
		expect(profile.title).toContain("Dr. Ada");
		expect(profile.description).toContain("Skin health");

		const listLd = buildMedicalJsonLd({
			doctors: [{ name: "Dr. Ada", specialty: "Dermatology", address: "1 Main" }],
			canonical: "https://strug.app/medical",
		});
		expect(listLd["@type"]).toBe("ItemList");
		expect(listLd.itemListElement[0].item["@type"]).toBe("Physician");

		const faqLd = buildMedicalFaqJsonLd([
			{ q: "How do I book?", a: "Search and pick a time." },
		]);
		expect(faqLd["@type"]).toBe("FAQPage");
		expect(faqLd.mainEntity[0]["@type"]).toBe("Question");
	});
});

describe("live next-available + trust + extra filters (audit leftovers)", () => {
	const av = parseMedicalAvailability({
		blocked: [{ date: "2026-08-13", is_blocked: true }],
		booked: [{ start_date: "2026-08-14", start_time: "09:00" }],
	});

	it("firstOpenSlot skips blocked days and taken first slot", () => {
		const slot = firstOpenSlot(av, { fromDate: new Date(2026, 7, 13), days: 5 });
		expect(slot.dateISO).toBe("2026-08-14");
		expect(slot.label).toBe("9:30 AM");
		expect(doctorHasSlotOnDate(av, "2026-08-13")).toBe(false);
		expect(doctorHasSlotOnDate(av, "2026-08-14")).toBe(true);
	});

	it("formatNextAvailable uses Today / Tomorrow / date", () => {
		expect(formatNextAvailable({ dateISO: "2026-08-13", label: "9:00 AM" }, new Date(2026, 7, 13))).toBe("Today · 9:00 AM");
		expect(formatNextAvailable({ dateISO: "2026-08-14", label: "2:00 PM" }, new Date(2026, 7, 13))).toBe("Tomorrow · 2:00 PM");
		expect(formatNextAvailable({ dateISO: "2026-08-20", label: "9:00 AM" }, new Date(2026, 7, 13))).toMatch(/Aug 20/);
	});

	it("withNextAvailable / sort by nextAvailableIso", () => {
		const enriched = withNextAvailable({ id: "a", isReal: true }, av, new Date(2026, 7, 13));
		expect(enriched.nextAvailableIso).toBe("2026-08-14");
		expect(enriched.nextAvailableLabel).toMatch(/Tomorrow/);
		const sorted = sortMedicalDoctors([
			{ id: "later", nextAvailableIso: "2026-08-20" },
			{ id: "sooner", nextAvailableIso: "2026-08-14" },
			{ id: "none" },
		], "availability");
		expect(sorted.map((d) => d.id)).toEqual(["sooner", "later", "none"]);
	});

	it("filters by date, under-18, and provider gender", () => {
		const doctors = [
			{ id: "kid", specialty: "Pediatrics", modes: ["online"], acceptsUnder18: true, providerGender: "woman", availability: av },
			{ id: "adult", specialty: "Cardiology", modes: ["online"], acceptsUnder18: false, providerGender: "man", availability: av },
		];
		expect(filterMedicalDoctors(doctors, { acceptsUnder18: true }).map((d) => d.id)).toEqual(["kid"]);
		expect(filterMedicalDoctors(doctors, { providerGender: "woman" }).map((d) => d.id)).toEqual(["kid"]);
		expect(filterMedicalDoctors(doctors, { availableOnDate: "2026-08-13" })).toHaveLength(0);
		expect(filterMedicalDoctors(doctors, { availableOnDate: "2026-08-14" })).toHaveLength(2);
	});

	it("trust badges: verified listing vs highly recommended", () => {
		expect(isVerifiedDoctor({ isReal: true, credentials: "MD", online: { listingId: 1 } })).toBe(true);
		expect(isVerifiedDoctor({ isReal: true, online: { listingId: 1 } })).toBe(false);
		expect(isVerifiedDoctor({ isReal: false, credentials: "MD" })).toBe(false);
		expect(isHighlyRecommended({ rating: 4.9, reviews: 12 })).toBe(true);
		expect(isHighlyRecommended({ rating: 4.9, reviews: 2 })).toBe(false);
		expect(isHighlyRecommended({ rating: null, reviews: 0 })).toBe(false);
		expect(isHighlyRecommended({ rating: 5, reviews: 0 })).toBe(false);
	});

	it("treats Mon–Fri work days as closed on Saturday", () => {
		expect(isWithinWorkDays("2026-09-11", "Mon", "Fri")).toBe(true); // Friday
		expect(isWithinWorkDays("2026-09-12", "Mon", "Fri")).toBe(false); // Saturday
	});
});
