import React, { useState, useEffect } from "react";

// Board #457 / #453: "a lot of profile photos across the platform show as a broken image link,
// including some cover photos".
//
// Confirmed cause: a large number of rows still point at Azure blobs that no longer exist (27 of
// 30 sampled prod profiles had a profile_pic_url returning 404 — the blobs were purged, the DB
// rows kept the URL). Every <img> that renders one of those with no onError handler paints the
// browser's broken-image icon.
//
// The idiom already used in a few places — onError={e => { e.currentTarget.style.display = "none" }}
// — is NOT enough for an avatar: the initials live in the *else* branch of a ternary, so hiding the
// <img> leaves an empty coloured disc rather than falling back to the initials. The fallback has to
// be driven by state so the substitute node actually renders. (VerificationBadge.jsx already does
// this correctly; these components generalise that pattern.)

/**
 * An <img> that swaps to a fallback node when the source fails to load (404, purged blob, offline).
 * Everything else passes through to the underlying <img>.
 */
export function SafeImage({ src, fallback = null, alt = "", style, ...rest }) {
  const [failed, setFailed] = useState(false);

  // A new src deserves a fresh attempt — otherwise a component reused for a different image (a
  // virtualised list row, say) would stay permanently failed.
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) return fallback;

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}

/**
 * The canonical avatar. Renders the user's photo; falls back to their initials on a coloured disc
 * when there is no photo OR the photo fails to load.
 *
 * Before this existed there were six separate Avatar implementations plus ~40 hand-rolled inline
 * ones, which is why the broken-image bug was platform-wide.
 */
export function Avatar({
  url,
  initials = "",
  color = "#2563eb",
  size = 36,
  border = false,
  style,
  onClick,
  alt = "",
  ...rest
}) {
  const text = String(initials || "?").slice(0, 2).toUpperCase();

  const disc = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${color}, #0a0a0e)`,
    border: border ? `2px solid ${color}55` : "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    fontSize: Math.floor(size * 0.4),
    color: "#fff",
    flexShrink: 0,
    overflow: "hidden",
    userSelect: "none",
    ...style,
  };

  const initialsNode = <div style={disc} onClick={onClick} {...rest}>{text}</div>;

  if (!url) return initialsNode;

  return (
    <div style={{ ...disc, background: "transparent" }} onClick={onClick} {...rest}>
      <SafeImage
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        // The photo failed: render the initials disc in its place rather than an empty circle.
        fallback={<div style={{ ...disc, width: "100%", height: "100%", border: "none" }}>{text}</div>}
      />
    </div>
  );
}

export default Avatar;
