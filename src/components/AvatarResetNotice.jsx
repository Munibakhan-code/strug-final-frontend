import { useEffect, useState } from "react";
import { getMyProfile, dismissAvatarNotice } from "../api/social.js";

// #481/#11 — one-time re-upload notice.
//
// A prod storage purge left many profile_pic_url / banner_url rows pointing at 404 blobs. The
// null-dead-profile-media maintenance script NULLs those and sets social_profile.avatar_reset_notice.
// This modal shows once to each flagged account explaining their photo is gone and inviting a
// re-upload, then clears the flag server-side so it never shows again.
export default function AvatarResetNotice({ authReady, onReupload }) {
  const [show, setShow] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    getMyProfile()
      .then((res) => {
        const profile = res?.data ?? res;
        if (alive && profile?.avatar_reset_notice) setShow(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [authReady]);

  if (!show) return null;

  const close = async () => {
    setDismissing(true);
    // Optimistically hide; clear the flag server-side so it never re-appears (fire-and-forget).
    setShow(false);
    dismissAvatarNotice().catch(() => {});
  };

  const reupload = async () => {
    await close();
    onReupload?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-reset-title"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 100%)", background: "linear-gradient(180deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)", border: "1px solid rgba(37,99,235,0.4)", borderRadius: 16, padding: 24, boxShadow: "0 20px 60px var(--color-shadow)" }}
      >
        <div aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(37,99,235,0.16)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </div>
        <p id="avatar-reset-title" className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, margin: "0 0 8px", letterSpacing: "0.01em" }}>Re-upload your profile photo</p>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.55, margin: "0 0 20px" }}>
          During recent maintenance some profile photos and banners were lost and could not be recovered. If your picture looks missing, please re-upload it from your profile — it only takes a moment.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={close}
            disabled={dismissing}
            className="border border-border text-text-primary"
            style={{ padding: "9px 16px", borderRadius: 9, background: "transparent", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            Maybe later
          </button>
          <button
            type="button"
            onClick={reupload}
            disabled={dismissing}
            style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "#2563eb", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            Re-upload now
          </button>
        </div>
      </div>
    </div>
  );
}
