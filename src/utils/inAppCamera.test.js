/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
	canUseGetUserMedia,
	pickRecorderMimeType,
	remainingRecordMs,
	isUsableRecordedBlob,
	recordedBlobToFile,
	cameraStreamConstraints,
	stopMediaStream,
	DEFAULT_MAX_RECORD_MS,
} from "./inAppCamera.js";

describe("canUseGetUserMedia", () => {
	it("is true when mediaDevices.getUserMedia exists", () => {
		expect(canUseGetUserMedia({ mediaDevices: { getUserMedia: () => {} } })).toBe(true);
	});

	it("is false when navigator is missing", () => {
		expect(canUseGetUserMedia(undefined)).toBe(false);
	});

	it("is false when getUserMedia is absent", () => {
		expect(canUseGetUserMedia({ mediaDevices: {} })).toBe(false);
		expect(canUseGetUserMedia({})).toBe(false);
	});
});

describe("pickRecorderMimeType", () => {
	it("returns the first supported MIME type", () => {
		const Ctor = { isTypeSupported: (t) => t === "video/webm" };
		expect(pickRecorderMimeType(Ctor)).toBe("video/webm");
	});

	it("returns empty string when MediaRecorder is missing", () => {
		expect(pickRecorderMimeType(undefined)).toBe("");
	});

	it("returns empty string when no candidate is supported", () => {
		expect(pickRecorderMimeType({ isTypeSupported: () => false })).toBe("");
	});
});

describe("remainingRecordMs", () => {
	it("counts down from the 60s cap", () => {
		expect(remainingRecordMs(1000, 1000 + 15_000)).toBe(DEFAULT_MAX_RECORD_MS - 15_000);
	});

	it("is 0 when time is up", () => {
		expect(remainingRecordMs(0, DEFAULT_MAX_RECORD_MS)).toBe(0);
		expect(remainingRecordMs(0, DEFAULT_MAX_RECORD_MS + 500)).toBe(0);
	});

	it("treats missing start as 0 remaining (fail closed)", () => {
		expect(remainingRecordMs(null, Date.now())).toBe(0);
		expect(remainingRecordMs(undefined, Date.now())).toBe(0);
		expect(remainingRecordMs(NaN, Date.now())).toBe(0);
	});
});

describe("recordedBlobToFile", () => {
	it("wraps a non-empty video blob as a File", () => {
		const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "video/webm" });
		const file = recordedBlobToFile(blob, 1700000000000);
		expect(file).toBeInstanceOf(File);
		expect(file.name).toBe("townhall-record-1700000000000.webm");
		expect(file.type).toBe("video/webm");
		expect(file.size).toBe(3);
	});

	it("rejects empty or missing blobs", () => {
		expect(recordedBlobToFile(null)).toBe(null);
		expect(recordedBlobToFile(undefined)).toBe(null);
		expect(recordedBlobToFile(new Blob([], { type: "video/webm" }))).toBe(null);
		expect(isUsableRecordedBlob({ size: 0 })).toBe(false);
	});

	it("uses mp4 extension when the blob is mp4", () => {
		const blob = new Blob([new Uint8Array([9])], { type: "video/mp4" });
		expect(recordedBlobToFile(blob, 1).name).toBe("townhall-record-1.mp4");
	});
});

describe("cameraStreamConstraints / stopMediaStream", () => {
	it("prefers environment camera unless facing is user", () => {
		expect(cameraStreamConstraints("environment").video.facingMode).toEqual({ ideal: "environment" });
		expect(cameraStreamConstraints("user").video.facingMode).toEqual({ ideal: "user" });
		expect(cameraStreamConstraints("nope").video.facingMode).toEqual({ ideal: "environment" });
	});

	it("always requests audio for Town Hall clips", () => {
		expect(cameraStreamConstraints().audio).toBe(true);
	});

	it("stops tracks and ignores a missing stream", () => {
		const stops = [];
		stopMediaStream({ getTracks: () => [{ stop: () => stops.push("a") }, { stop: () => stops.push("b") }] });
		expect(stops).toEqual(["a", "b"]);
		expect(() => stopMediaStream(null)).not.toThrow();
		expect(() => stopMediaStream({})).not.toThrow();
	});
});
