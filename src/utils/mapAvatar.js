// Circular profile-photo markers for the Leaflet maps (on-demand discovery + live tracking).
// Shared so the hirer, the nearby workers, and the matched worker all render consistently.
import L from "leaflet";
import { mediaUrl } from "./mediaUrl.js";

export const initialOf = (name) => String(name || "").trim().charAt(0).toUpperCase() || "•";

/** Best-effort profile-photo URL from a user/worker object (fields vary by endpoint). */
export const avatarUrlOf = (o) =>
	mediaUrl(o?.profile_pic_url ?? o?.avatar ?? o?.profile_image ?? o?.image_url ?? o?.avatar_url) || null;

/** Best-effort display name from a user/worker object. */
export const nameOf = (o) =>
	o?.name ?? o?.full_name ?? o?.display_name ?? o?.username ?? o?.first_name ?? "";

/** A circular profile-photo map marker (initials fallback), ringed in `ring`, optionally
 *  pulsing. Anchored at its centre so it sits exactly on the point. */
export function avatarDivIcon(url, ring, size, { pulse = false, initial = "•" } = {}) {
	const half = size / 2;
	const pulseRing = pulse
		? `<span style="position:absolute;left:${-half - 3}px;top:${-half - 3}px;width:${size + 6}px;height:${size + 6}px;border-radius:50%;background:${ring};animation:strugPulse 1.6s ease-out infinite"></span>`
		: "";
	const face = url
		? `<img src="${url}" alt="" style="position:absolute;left:${-half}px;top:${-half}px;width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 0 0 2px ${ring},0 2px 8px rgba(0,0,0,.55)"/>`
		: `<span style="position:absolute;left:${-half}px;top:${-half}px;width:${size}px;height:${size}px;border-radius:50%;background:${ring};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:#fff;font-family:'DM Sans',sans-serif;font-weight:700;font-size:${Math.round(size * 0.42)}px">${initial}</span>`;
	return L.divIcon({ className: "", html: `<div style="position:relative;width:0;height:0">${pulseRing}${face}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] });
}
