/**
 * YouTube-style save-to-playlist picker.
 * Mobile: bottom sheet. Desktop: centered card.
 * Playlists stay listed with a check so a video can be saved to several lists
 * without the sheet closing after the first tap.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import i18n from "../../i18n/index.js";
import { videoIdOf, isMixPlaylist, mixNameForCategory, sortPlaylistsForPicker } from "../../utils/listenMix.js";

export default function SaveToPlaylistSheet({
	open,
	onClose,
	playlists = [],
	targetVideo,
	isMobile = false,
	onToggle,
	onCreate,
}) {
	const [name, setName] = useState("");
	const [makePublic, setMakePublic] = useState(false);
	const [busyId, setBusyId] = useState(null);
	const [error, setError] = useState("");
	const [armed, setArmed] = useState(false);
	const [toast, setToast] = useState("");
	const [localChecks, setLocalChecks] = useState({});
	const toastT = useRef(null);

	const showToast = (msg) => {
		setToast(msg);
		if (toastT.current) window.clearTimeout(toastT.current);
		toastT.current = window.setTimeout(() => setToast(""), 2200);
	};

	useEffect(() => {
		if (!open) { setName(""); setMakePublic(false); setBusyId(null); setError(""); setArmed(false); setToast(""); setLocalChecks({}); return undefined; }
		// The ⋮ menu click that opens this sheet would otherwise land on the new overlay
		// (especially on touch) and close it in the same tap — save looks like a no-op.
		const t = window.setTimeout(() => setArmed(true), 350);
		return () => window.clearTimeout(t);
	}, [open]);

	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open || typeof document === "undefined") return null;

	const vid = videoIdOf(targetVideo);
	const listed = sortPlaylistsForPicker(playlists);
	const inPlaylist = (pl) => (pl.videos || []).some((v) => String(videoIdOf(v)) === String(vid));
	const isChecked = (pl) => (pl.id in localChecks) ? localChecks[pl.id] : inPlaylist(pl);
	const defaultMixName = targetVideo
		? mixNameForCategory(targetVideo?.category)
		: i18n.t("videos.playlist", { defaultValue: "Playlist" });
	const trimmedName = name.trim();
	const canMakePublic = trimmedName.length > 0 && !isMixPlaylist(trimmedName);
	const submitCreate = async () => {
		setError("");
		setBusyId("create");
		const savedName = trimmedName || defaultMixName;
		try {
			await onCreate?.(trimmedName, { isPublic: canMakePublic && makePublic });
			setName("");
			setMakePublic(false);
			showToast(i18n.t("videos.savedToPlaylist", { name: savedName, defaultValue: `Saved to ${savedName}` }));
		} catch (err) {
			setError(err?.message || i18n.t("videos.playlistSaveFailed", { defaultValue: "Could not save to playlist" }));
		} finally {
			setBusyId(null);
		}
	};

	const panel = (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="save-to-playlist-title"
			className="bg-surface-raised border border-border"
			onClick={(e) => e.stopPropagation()}
			style={isMobile
				? {
					position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 120,
					borderRadius: "16px 16px 0 0",
					padding: "12px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
					maxHeight: "78vh",
					overflowY: "auto",
					boxShadow: "0 -12px 40px var(--color-shadow)",
				}
				: {
					position: "relative",
					borderRadius: 16,
					padding: 22,
					width: "min(400px, 90vw)",
					maxHeight: "70vh",
					overflowY: "auto",
				}}
		>
			{isMobile && (
				<div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border)", margin: "0 auto 12px" }} />
			)}
			<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
				<h3
					id="save-to-playlist-title"
					className="text-text-primary"
					style={{ flex: 1, margin: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16 }}
				>
					{i18n.t("videos.saveToPlaylist")}
				</h3>
				<button
					type="button"
					onClick={onClose}
					aria-label={i18n.t("common.close", { defaultValue: "Close" })}
					className="text-text-secondary"
					style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
				>
					<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
				</button>
			</div>

			{playlists.length === 0 && (
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: "0 0 16px" }}>
					{i18n.t("videos.noPlaylists")}
				</p>
			)}

			<div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
				{listed.map((pl) => {
					const checked = isChecked(pl);
					const busy = busyId === pl.id;
					return (
						<button
							key={pl.id}
							type="button"
							disabled={busy || vid == null}
							onClick={async () => {
								const next = !checked;
								setLocalChecks((prev) => ({ ...prev, [pl.id]: next }));
								setBusyId(pl.id);
								setError("");
								try {
									await onToggle?.(pl, next);
									showToast(next
										? i18n.t("videos.savedToPlaylist", { name: pl.name, defaultValue: `Saved to ${pl.name}` })
										: i18n.t("videos.removedFromPlaylistToast", { name: pl.name, defaultValue: `Removed from ${pl.name}` }));
								} catch (err) {
									setLocalChecks((prev) => ({ ...prev, [pl.id]: checked }));
									setError(err?.message || i18n.t("videos.playlistSaveFailed", { defaultValue: "Could not save to playlist" }));
								} finally { setBusyId(null); }
							}}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								width: "100%",
								padding: "10px 8px",
								background: "transparent",
								border: "none",
								borderRadius: 10,
								cursor: busy ? "default" : "pointer",
								textAlign: "left",
								opacity: busy ? 0.6 : 1,
							}}
						>
							<span
								aria-hidden="true"
								style={{
									width: 22,
									height: 22,
									borderRadius: 4,
									border: checked ? "none" : "2px solid var(--color-text-muted)",
									background: checked ? "#2563eb" : "transparent",
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									flexShrink: 0,
								}}
							>
								{checked && (
									<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
								)}
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, margin: 0 }}>
									{pl.name}
									{isMixPlaylist(pl.name) && (
										<span className="text-text-muted" style={{ fontWeight: 500, fontSize: 11, marginLeft: 8 }}>MIX</span>
									)}
								</p>
								<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "2px 0 0" }}>
									{i18n.t("videos.videoCount", { count: pl.videos?.length ?? 0 })}
								</p>
							</div>
						</button>
					);
				})}
			</div>

			<div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 14 }}>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, margin: "0 0 8px" }}>
					{i18n.t("videos.createNewPlaylist")}
				</p>
				<div style={{ display: "flex", gap: 8 }}>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={i18n.t("videos.playlistNamePlaceholder", { defaultValue: "Name (optional)" })}
						className="bg-surface border border-border text-text-primary"
						style={{ flex: 1, padding: "10px 12px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none" }}
						onKeyDown={(e) => {
							if (e.key === "Enter") submitCreate();
						}}
					/>
					<button
						type="button"
						onClick={submitCreate}
						disabled={busyId != null}
						style={{
							padding: "10px 14px",
							background: "#2563eb",
							border: "none",
							borderRadius: 10,
							color: "#fff",
							fontFamily: "'DM Sans', sans-serif",
							fontWeight: 700,
							fontSize: 13,
							cursor: busyId != null ? "default" : "pointer",
							opacity: busyId != null ? 0.6 : 1,
						}}
					>
						{i18n.t("videos.create")}
					</button>
				</div>
				{canMakePublic && (
					<label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
						<input
							type="checkbox"
							checked={makePublic}
							onChange={(e) => setMakePublic(e.target.checked)}
							style={{ accentColor: "#2563eb" }}
						/>
						<span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
							{i18n.t("videos.playlistPublicOnChannel")}
						</span>
					</label>
				)}
				<p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "8px 0 0" }}>
					{i18n.t("videos.unnamedMixHint", { name: defaultMixName })}
				</p>
				{error && (
					<p role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#ef4444", margin: "8px 0 0" }}>{error}</p>
				)}
				{toast && (
					<p role="status" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#4ade80", margin: "8px 0 0" }}>{toast}</p>
				)}
			</div>
		</div>
	);

	return createPortal(
		<div
			onPointerDown={(e) => { if (!armed) { e.preventDefault(); e.stopPropagation(); } }}
			onClick={() => { if (armed) onClose?.(); }}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 10050,
				background: "rgba(0,0,0,0.55)",
				display: "flex",
				alignItems: isMobile ? "flex-end" : "center",
				justifyContent: "center",
				padding: isMobile ? 0 : 20,
			}}
		>
			{panel}
		</div>,
		document.body,
	);
}

/** YouTube-like playlist tile (collage thumb + mix badge). */
export function PlaylistCard({ playlist, onOpen, isMobile = false, delay = 0, variant = "grid" }) {
	const videos = playlist.videos ?? [];
	const thumbs = videos.map((v) => v.thumb).filter((t) => typeof t === "string" && t.startsWith("http")).slice(0, 4);
	const mix = isMixPlaylist(playlist.name);
	const count = videos.length;
	const shelf = variant === "shelf";
	const row = isMobile && !shelf;

	return (
		<button
			type="button"
			onClick={() => onOpen?.(playlist)}
			aria-label={playlist.name}
			style={{
				display: "flex",
				flexDirection: row ? "row" : "column",
				alignItems: row ? "flex-start" : "stretch",
				gap: row ? 12 : 0,
				width: "100%",
				maxWidth: "100%",
				padding: 0,
				border: "none",
				background: "transparent",
				cursor: "pointer",
				textAlign: "left",
				animation: `fadeUp 0.3s ease ${delay}ms both`,
			}}
		>
			<div
				style={{
					position: "relative",
					...(row
						? { width: 148, height: 84, flexShrink: 0, maxWidth: "46%" }
						: { width: "100%", aspectRatio: "16 / 9" }),
					borderRadius: 12,
					overflow: "hidden",
					background: "linear-gradient(135deg,#1e3a5f,#0f2744)",
				}}
			>
				{thumbs.length >= 4 ? (
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%", height: "100%" }}>
						{thumbs.map((src, i) => (
							<div key={i} style={{ backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }} />
						))}
					</div>
				) : thumbs.length > 0 ? (
					<div style={{ width: "100%", height: "100%", backgroundImage: `url(${thumbs[0]})`, backgroundSize: "cover", backgroundPosition: "center" }} />
				) : (
					<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
						<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
					</div>
				)}
				<div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "34%", background: "rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff" }}>
					<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /></svg>
					<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, marginTop: 4 }}>{count}</span>
				</div>
			</div>
			<div style={{ flex: 1, minWidth: 0, padding: row ? "0 4px 0 0" : "10px 2px 0" }}>
				<p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
					{playlist.name}
				</p>
				<p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "4px 0 0" }}>
					{mix ? i18n.t("videos.mixPlaylist", { defaultValue: "Mix" }) : i18n.t("videos.playlist", { defaultValue: "Playlist" })}
					{" · "}
					{i18n.t("videos.videoCount", { count })}
				</p>
			</div>
		</button>
	);
}

/** Horizontal playlist row for the home feed — same idea as YouTube's Mix / playlist shelves. */
export function PlaylistsShelf({ playlists = [], onOpen, onSeeAll, isMobile = false, gutterPx = 16 }) {
	const scrollRef = useRef(null);
	const [edges, setEdges] = useState({ left: false, right: false });
	const visible = (playlists || []).filter((p) => (p.videos || []).length > 0);
	const measure = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
	}, []);
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, [measure, visible.length]);
	if (visible.length === 0) return null;
	const scrollBy = (dir) => {
		const el = scrollRef.current;
		if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
	};
	return (
		<div style={{ marginBottom: 36 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, ...(isMobile ? { paddingLeft: gutterPx, paddingRight: gutterPx } : {}) }}>
				<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-primary" aria-hidden="true">
					<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
				</svg>
				<h3 className="text-text-primary" style={{ flex: 1, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
					{i18n.t("videos.yourPlaylists")}
				</h3>
				{onSeeAll && (
					<button
						type="button"
						onClick={onSeeAll}
						className="text-text-secondary"
						style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: 0 }}
					>
						{i18n.t("common.seeAll")}
					</button>
				)}
			</div>
			<div style={{ position: "relative" }}>
				<div
					ref={scrollRef}
					onScroll={measure}
					className="strug-share-row"
					style={{ display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none", scrollSnapType: "x proximity", paddingBottom: 4, ...(isMobile ? { paddingLeft: gutterPx, paddingRight: gutterPx } : {}) }}
				>
					{visible.map((pl, i) => (
						<div key={pl.id ?? `pl-${i}`} style={{ flex: "0 0 auto", width: isMobile ? 168 : 220, scrollSnapAlign: "start" }}>
							<PlaylistCard playlist={pl} onOpen={onOpen} variant="shelf" delay={i * 40} />
						</div>
					))}
				</div>
				{!isMobile && [["left", edges.left, -1], ["right", edges.right, 1]].map(([side, shown, dir]) => shown && (
					<button
						key={side}
						type="button"
						aria-label={i18n.t(dir < 0 ? "common.previous" : "common.next")}
						onClick={() => scrollBy(dir)}
						className="bg-surface-raised border border-border text-text-primary"
						style={{ position: "absolute", top: "28%", [side]: -6, width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 18px var(--color-shadow)", padding: 0 }}
					>
						<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							{dir < 0 ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
						</svg>
					</button>
				))}
			</div>
		</div>
	);
}
