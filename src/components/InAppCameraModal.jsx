import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import i18n from "../i18n/index.js";
import {
	DEFAULT_MAX_RECORD_MS,
	MIN_RECORD_MS,
	canUseGetUserMedia,
	cameraStreamConstraints,
	pickRecorderMimeType,
	recordedBlobToFile,
	remainingRecordMs,
	stopMediaStream,
} from "../utils/inAppCamera.js";

function RecordShutterIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M23 7l-7 5 7 5V7z" />
			<rect x="1" y="5" width="15" height="14" rx="2" />
		</svg>
	);
}

export function InAppCameraModal({ onClose, onRecorded, onUnavailable, maxMs = DEFAULT_MAX_RECORD_MS }) {
	const videoRef = useRef(null);
	const streamRef = useRef(null);
	const recorderRef = useRef(null);
	const chunksRef = useRef([]);
	const startedAtRef = useRef(null);
	const [facing, setFacing] = useState("environment");
	const [error, setError] = useState("");
	const [recording, setRecording] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [blob, setBlob] = useState(null);
	// Holds the countdown itself rather than a bare re-render counter. Render used to compute
	// `Date.now()` inline (impure) and reference a `tick` counter via `+ tick * 0` purely to keep
	// the dependency alive; the interval now owns the clock and render just reads the value.
	const [remainingMs, setRemainingMs] = useState(maxMs);

	const unavailableRef = useRef(onUnavailable);
	unavailableRef.current = onUnavailable;

	const attachStream = useCallback(async (nextFacing) => {
		stopMediaStream(streamRef.current);
		streamRef.current = null;
		try {
			const stream = await navigator.mediaDevices.getUserMedia(cameraStreamConstraints(nextFacing));
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play().catch(() => {});
			}
			setError("");
			return true;
		} catch {
			setError(i18n.t("social.cameraDenied", { defaultValue: "Could not open the camera. Check permissions or use Upload." }));
			return false;
		}
	}, []);

	useEffect(() => {
		if (!canUseGetUserMedia() || typeof MediaRecorder === "undefined") {
			unavailableRef.current?.();
			return undefined;
		}
		let cancelled = false;
		(async () => {
			await attachStream(facing);
			if (cancelled) stopMediaStream(streamRef.current);
		})();
		return () => {
			cancelled = true;
			try { recorderRef.current?.stop(); } catch { /* ignore */ }
			stopMediaStream(streamRef.current);
			streamRef.current = null;
		};
	}, [facing, attachStream]);

	useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

	// Declared before the interval effect that calls it — it used to be defined below, so the
	// effect closed over a binding in its temporal dead zone.
	const stopRecording = useCallback(() => {
		const rec = recorderRef.current;
		if (!rec || rec.state === "inactive") {
			setRecording(false);
			return;
		}
		try { rec.stop(); } catch { setRecording(false); }
	}, []);

	useEffect(() => {
		if (!recording) {
			setRemainingMs(maxMs);
			return undefined;
		}
		const id = setInterval(() => {
			const left = remainingRecordMs(startedAtRef.current, Date.now(), maxMs);
			setRemainingMs(left);
			if (left <= 0) stopRecording();
		}, 200);
		return () => clearInterval(id);
	}, [recording, maxMs, stopRecording]);

	const startRecording = () => {
		if (recording || previewUrl || !streamRef.current) return;
		if (typeof MediaRecorder === "undefined") {
			onUnavailable?.();
			return;
		}
		chunksRef.current = [];
		const mime = pickRecorderMimeType();
		let rec;
		try {
			rec = mime ? new MediaRecorder(streamRef.current, { mimeType: mime }) : new MediaRecorder(streamRef.current);
		} catch {
			onUnavailable?.();
			return;
		}
		recorderRef.current = rec;
		rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
		rec.onstop = () => {
			setRecording(false);
			const elapsed = startedAtRef.current == null ? 0 : Date.now() - startedAtRef.current;
			startedAtRef.current = null;
			const type = rec.mimeType || mime || "video/webm";
			const out = new Blob(chunksRef.current, { type });
			chunksRef.current = [];
			if (elapsed < MIN_RECORD_MS || out.size <= 0) {
				setError(i18n.t("social.recordTooShort", { defaultValue: "Clip was too short. Hold a bit longer." }));
				return;
			}
			setBlob(out);
			setPreviewUrl(URL.createObjectURL(out));
			if (videoRef.current) videoRef.current.srcObject = null;
			stopMediaStream(streamRef.current);
			streamRef.current = null;
		};
		startedAtRef.current = Date.now();
		setRecording(true);
		setError("");
		rec.start(200);
	};

	const retake = async () => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setPreviewUrl(null);
		setBlob(null);
		await attachStream(facing);
	};

	const useClip = () => {
		const file = recordedBlobToFile(blob);
		if (!file) {
			setError(i18n.t("social.recordFailed", { defaultValue: "Could not save that clip. Try again." }));
			return;
		}
		onRecorded?.(file);
		onClose?.();
	};

	const secondsLeft = Math.ceil((recording ? remainingMs : maxMs) / 1000);

	return createPortal((
		<div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", display: "flex", flexDirection: "column" }} role="dialog" aria-modal="true" aria-label={i18n.t("social.recordVideo", { defaultValue: "Record video" })}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
				<button type="button" onClick={onClose} style={{ minHeight: 44, minWidth: 44, background: "none", border: "none", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 15, cursor: "pointer" }}>
					{i18n.t("common.cancel")}
				</button>
				<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: recording ? "#ef4444" : "#fff" }}>
					{recording ? `${secondsLeft}s` : i18n.t("social.recordVideo", { defaultValue: "Record video" })}
				</span>
				<button
					type="button"
					onClick={() => { if (!recording && !previewUrl) setFacing((f) => f === "user" ? "environment" : "user"); }}
					disabled={recording || !!previewUrl}
					aria-label={i18n.t("social.flipCamera", { defaultValue: "Flip camera" })}
					style={{ minHeight: 44, minWidth: 44, background: "none", border: "none", color: "#fff", cursor: recording || previewUrl ? "default" : "pointer", opacity: recording || previewUrl ? 0.35 : 1 }}
				>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15"/></svg>
				</button>
			</div>

			<div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
				{previewUrl ? (
					<video src={previewUrl} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} controls playsInline />
				) : (
					<video ref={videoRef} muted playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", background: "#111", transform: facing === "user" ? "scaleX(-1)" : "none" }} />
				)}
			</div>

			{error && (
				<p style={{ color: "#fca5a5", fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", margin: "8px 16px 0" }}>{error}</p>
			)}

			<div style={{ padding: "20px 16px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
				{previewUrl ? (
					<div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 420 }}>
						<button type="button" onClick={retake} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: "pointer" }}>
							{i18n.t("social.retake", { defaultValue: "Retake" })}
						</button>
						<button type="button" onClick={useClip} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: "pointer" }}>
							{i18n.t("social.useClip", { defaultValue: "Use clip" })}
						</button>
					</div>
				) : (
					<>
						<button
							type="button"
							aria-pressed={recording}
							aria-label={recording ? i18n.t("social.stopRecording", { defaultValue: "Stop recording" }) : i18n.t("social.startRecording", { defaultValue: "Start recording" })}
							onPointerDown={(e) => {
								e.preventDefault();
								if (recording) stopRecording();
								else startRecording();
							}}
							onPointerUp={(e) => {
								e.preventDefault();
								const started = startedAtRef.current;
								if (recording && started != null && Date.now() - started >= MIN_RECORD_MS) stopRecording();
							}}
							onPointerCancel={() => {
								const started = startedAtRef.current;
								if (recording && started != null && Date.now() - started >= MIN_RECORD_MS) stopRecording();
							}}
							style={{ width: 72, height: 72, borderRadius: "50%", border: "4px solid #fff", background: recording ? "#ef4444" : "rgba(239,68,68,0.85)", cursor: "pointer", touchAction: "none" }}
						/>
						<p style={{ margin: 0, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center" }}>
							{i18n.t("social.holdToRecord", { defaultValue: "Hold to record (up to 60s), or tap to start and tap again to stop." })}
						</p>
					</>
				)}
			</div>
		</div>
	), document.body);
}

/** Gallery upload stays separate. This opens in-app camera, or native capture if getUserMedia is missing. */
export function RecordVideoTrigger({ onFile, disabled = false, label = true, compact = false }) {
	const captureRef = useRef(null);
	const [open, setOpen] = useState(false);

	const openCamera = () => {
		if (disabled) return;
		if (canUseGetUserMedia()) setOpen(true);
		else captureRef.current?.click();
	};

	const onCapture = (e) => {
		const file = e.target.files?.[0] || null;
		e.target.value = "";
		if (file) onFile?.(file);
	};

	return (
		<>
			<input ref={captureRef} type="file" accept="video/*" capture="environment" style={{ display: "none" }} onChange={onCapture} />
			<button
				type="button"
				disabled={disabled}
				onClick={openCamera}
				aria-label={i18n.t("social.recordVideo", { defaultValue: "Record video" })}
				style={{
					background: compact ? "none" : "rgba(37,99,235,0.12)",
					border: compact ? "none" : "1px solid rgba(37,99,235,0.4)",
					borderRadius: compact ? 0 : 10,
					padding: compact ? 0 : "10px 12px",
					minHeight: 44,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 8,
					color: "#60a5fa",
					cursor: disabled ? "default" : "pointer",
					fontFamily: "'DM Sans', sans-serif",
					fontSize: 13,
					fontWeight: 700,
					opacity: disabled ? 0.5 : 1,
				}}
			>
				<RecordShutterIcon />
				{label ? i18n.t("social.recordVideo", { defaultValue: "Record video" }) : null}
			</button>
			{open && (
				<InAppCameraModal
					onClose={() => setOpen(false)}
					onRecorded={(file) => { onFile?.(file); setOpen(false); }}
					onUnavailable={() => { setOpen(false); captureRef.current?.click(); }}
				/>
			)}
		</>
	);
}
