import { useState } from "react";
import { BADGE_MAP } from "../utils/badges.js";

// Renders a verified user's badge image for their verification_type, falling back
// to the classic blue check when the type is NONE/unknown or the badge image is
// missing (404). Keeps the feed from showing broken-image icons.
export default function VerificationBadge({ verified, verificationType, size = 20 }) {
	const [imgFailed, setImgFailed] = useState(false);
	if (!verified) return null;

	const src = BADGE_MAP[verificationType];
	if (src && !imgFailed) {
		return (
			<img
				src={src}
				alt={verificationType}
				title={verificationType?.replace(/_/g, " ")}
				onError={() => setImgFailed(true)}
				style={{ width: size, height: size, objectFit: "contain", borderRadius: "50%", flexShrink: 0, verticalAlign: "middle" }}
			/>
		);
	}

	return (
		<svg width={16} height={16} viewBox="0 0 24 24" fill="#2563eb" style={{ flexShrink: 0 }}>
			<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
		</svg>
	);
}
