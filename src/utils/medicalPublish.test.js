/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	MEDICAL_PORTAL_KEY,
	medicalGroupId,
	buildMedicalListingAttributes,
	buildMedicalListingPairPayloads,
	findMedicalListingPair,
	buildProviderProfileUpdate,
	mapMedicalHostBooking,
} from "./medicalPublish.js";

describe("medicalPublish", () => {
	it("uses stable group id per user", () => {
		expect(medicalGroupId(42)).toBe("med_user_42");
		expect(MEDICAL_PORTAL_KEY).toBe("sd-doctors");
	});

	it("maps provider fields into listing attributes", () => {
		const { shared, onlinePrice } = buildMedicalListingAttributes({
			provider: {
				service_provider_user_id: 7,
				company_name: "Dr. Ada Clinic",
				specialization: "Dermatology",
				appointment_fee: 95,
				company_address: "12 King St W, Toronto",
				language: "en",
				work_hours_from: "09:00",
				work_hours_to: "17:00",
			},
			user: { user_id: 7, name: "Ada" },
		});
		expect(shared.group_id).toBe("med_user_7");
		expect(shared.doctor_name).toBe("Dr. Ada Clinic");
		expect(shared.specialty).toBe("Dermatology");
		expect(shared.address).toBe("12 King St W, Toronto");
		expect(shared.language).toBe("en");
		expect(shared.appointment_fee).toBe(95);
		expect(onlinePrice).toBe(95);
		expect(shared.type).toBe("medical");
	});

	it("builds online + inperson pair payloads", () => {
		const pair = buildMedicalListingPairPayloads({
			provider: { service_provider_user_id: 3, company_name: "Dr. Kim", specialization: "Cardiology", appointment_fee: 140 },
			user: { user_id: 3 },
		});
		expect(pair.online.vertical).toBe("medical");
		expect(pair.online.price).toBe(140);
		expect(pair.online.attributes.mode).toBe("online");
		expect(pair.inperson.price).toBe(0);
		expect(pair.inperson.attributes.mode).toBe("inperson");
		expect(pair.online.attributes.group_id).toBe(pair.inperson.attributes.group_id);
	});

	it("finds existing legs by group_id", () => {
		const rows = [
			{ booking_listing_id: 1, vertical: "medical", attributes: { type: "medical", group_id: "med_user_9", mode: "online" } },
			{ booking_listing_id: 2, vertical: "medical", attributes: { type: "medical", group_id: "med_user_9", mode: "inperson" } },
			{ booking_listing_id: 3, vertical: "medical", attributes: { type: "medical", group_id: "other", mode: "online" } },
		];
		const found = findMedicalListingPair(rows, "med_user_9");
		expect(found.online.booking_listing_id).toBe(1);
		expect(found.inperson.booking_listing_id).toBe(2);
	});

	it("includes credentials + lat/lng on listing payloads (Phase 2)", () => {
		const pair = buildMedicalListingPairPayloads({
			provider: { service_provider_user_id: 4, company_name: "Dr. Lee" },
			overrides: {
				credentials: "MD, FRCPC",
				latitude: 43.65,
				longitude: -79.38,
				address: "Toronto",
			},
		});
		expect(pair.online.attributes.credentials).toBe("MD, FRCPC");
		expect(pair.online.latitude).toBe(43.65);
		expect(pair.inperson.longitude).toBe(-79.38);
		expect(pair.inperson.location).toBe("Toronto");
	});

	it("includes self-reported insurance on listing payloads (Phase 3)", () => {
		const pair = buildMedicalListingPairPayloads({
			provider: { service_provider_user_id: 5, company_name: "Dr. Pat" },
			overrides: { insurance: "OHIP, Aetna" },
		});
		expect(pair.online.attributes.insurance).toBe("OHIP, Aetna");
		expect(pair.online.attributes.insurance_plans).toEqual(["ohip", "aetna"]);
		expect(pair.inperson.attributes.insurance_plans).toEqual(["ohip", "aetna"]);
	});

	it("includes under-18 and provider gender on listing payloads", () => {
		const pair = buildMedicalListingPairPayloads({
			provider: { service_provider_user_id: 8, company_name: "Dr. Kim" },
			overrides: { acceptsUnder18: true, providerGender: "woman" },
		});
		expect(pair.online.attributes.accepts_under_18).toBe(true);
		expect(pair.online.attributes.provider_gender).toBe("woman");
	});

	it("buildProviderProfileUpdate maps professional fields only (bug #241)", () => {
		const body = buildProviderProfileUpdate({
			overrides: {
				doctor_name: "Dr. Ada Clinic",
				specialty: "Dermatology",
				address: "12 King St",
				language: "en",
				fee: "95",
			},
		});
		expect(body).toEqual({
			company_name: "Dr. Ada Clinic",
			specialization: "Dermatology",
			company_address: "12 King St",
			language: "en",
			appointment_fee: 95,
			work_hours_from: undefined,
			work_hours_to: undefined,
			work_days_from: undefined,
			work_days_to: undefined,
		});
		expect(body).not.toHaveProperty("email");
		expect(body).not.toHaveProperty("password");
	});

	it("maps host booking rows for the doctors Requests tab", () => {
		const row = mapMedicalHostBooking({
			booking_id: 44,
			status: "awaiting_host",
			total: 60,
			start_date: "2026-09-10",
			start_time: "09:00",
			notes: "Online consultation",
			guest: { name: "Alex" },
			booking_listing: { title: "Dr. Ada — Online Consultation", attributes: { mode: "online" } },
		});
		expect(row.id).toBe(44);
		expect(row.isMedicalBooking).toBe(true);
		expect(row.client).toBe("Alex");
		expect(row.rawStatus).toBe("awaiting_host");
		expect(row.location).toBe("Online");
	});
});
