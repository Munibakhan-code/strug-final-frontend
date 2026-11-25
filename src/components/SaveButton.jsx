import { useEffect, useState } from "react";
import { toggleSave } from "../api/saves";
import { isAuthenticated } from "../store/auth";

// Drop-in heart/save toggle for any vertical card or detail page. Pass
// entityType + entityId, and a small `meta` snapshot ({ title, sub, price,
// thumb, accent }) so the Favourites page can render the saved card without
// re-fetching the entity. Optimistic; best-effort (reverts on failure).
//
// `initialSaved` defaults to false because callers often don't know the real state on first
// paint (it comes from an async /saves lookup) — once that lookup resolves and the caller passes
// the real value, this re-syncs so the heart doesn't always render unfilled after a remount.
function SaveButton({ entityType, entityId, meta, initialSaved = false, size = 34, style }) {
	const [saved, setSaved] = useState(initialSaved);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setSaved(initialSaved);
	}, [initialSaved]);

	async function toggle(e) {
		if (e) e.stopPropagation();
		if (busy || !entityId) return;
		if (!isAuthenticated()) { window.__nav?.("login"); return; }
		const next = !saved;
		setSaved(next);
		setBusy(true);
		try {
			const res = await toggleSave(entityType, String(entityId), meta);
			if (typeof res?.saved === "boolean") setSaved(res.saved);
		} catch {
			setSaved(!next); // revert
		} finally {
			setBusy(false);
		}
	}

	return (
		<button onClick={toggle} title={saved ? "Saved" : "Save"} aria-label={saved ? "Remove from favourites" : "Save to favourites"}
			style={{ width: size, height: size, borderRadius: "50%", border: "none", background: saved ? "rgba(239,68,68,0.16)" : "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", transition: "background 0.15s", ...style }}>
			<svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill={saved ? "#ef4444" : "none"} stroke={saved ? "#ef4444" : "rgba(255,255,255,0.85)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
				<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
			</svg>
		</button>
	);
}

export { SaveButton };
