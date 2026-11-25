/** Town Hall / Social in-app camera (#1584). Keep clip length and MIME choice in one place. */

export const DEFAULT_MAX_RECORD_MS = 60_000;
export const MIN_RECORD_MS = 400;

const MIME_CANDIDATES = [
	"video/webm;codecs=vp9,opus",
	"video/webm;codecs=vp8,opus",
	"video/webm",
	"video/mp4",
];

export function canUseGetUserMedia(nav = typeof navigator !== "undefined" ? navigator : undefined) {
	return Boolean(nav?.mediaDevices?.getUserMedia);
}

export function pickRecorderMimeType(MediaRecorderCtor = typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined) {
	if (typeof MediaRecorderCtor?.isTypeSupported !== "function") return "";
	return MIME_CANDIDATES.find((t) => MediaRecorderCtor.isTypeSupported(t)) || "";
}

export function remainingRecordMs(startedAt, now, maxMs = DEFAULT_MAX_RECORD_MS) {
	if (startedAt == null || !Number.isFinite(Number(startedAt))) return 0;
	if (!Number.isFinite(Number(now)) || !Number.isFinite(Number(maxMs)) || maxMs <= 0) return 0;
	const start = Number(startedAt);
	const t = Number(now);
	if (t < start) return Math.max(0, maxMs);
	return Math.max(0, maxMs - (t - start));
}

export function isUsableRecordedBlob(blob) {
	return Boolean(blob && typeof blob.size === "number" && blob.size > 0);
}

export function recordedBlobToFile(blob, recordedAt = Date.now()) {
	if (!isUsableRecordedBlob(blob)) return null;
	const type = blob.type && String(blob.type).startsWith("video/") ? blob.type : "video/webm";
	const ext = type.includes("mp4") ? "mp4" : "webm";
	const stamp = Number.isFinite(Number(recordedAt)) ? Number(recordedAt) : Date.now();
	return new File([blob], `townhall-record-${stamp}.${ext}`, { type });
}

export function cameraStreamConstraints(facing = "environment") {
	const mode = facing === "user" ? "user" : "environment";
	return {
		video: { facingMode: { ideal: mode }, width: { ideal: 720 }, height: { ideal: 1280 } },
		audio: true,
	};
}

export function stopMediaStream(stream) {
	if (!stream || typeof stream.getTracks !== "function") return;
	stream.getTracks().forEach((track) => {
		try { track.stop(); } catch { /* already stopped */ }
	});
}
