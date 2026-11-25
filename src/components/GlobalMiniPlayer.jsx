import { useEffect, useRef, useState, useCallback } from "react";
import HlsVideo from "./HlsVideo.jsx";

// Cross-section persistent mini-player (bug board #471 + #473 item 2).
//
// The in-page mini-player in Videos.jsx (scroll the watch page → the player shrinks to a corner)
// only survives WHILE you're on the Videos section: navigating to another section unmounts the
// whole VideosPage and the video stops. This component lives in the AppInner shell, ABOVE the
// page-swap, so a video keeps playing in a corner after you leave the Videos section — click it to
// go back to the full watch page, ✕ to close.
//
// Hand-off is "pragmatic re-seek": a fresh <video> is mounted and seeked to the timestamp the full
// player was at (persisted to strug_resume_<id> / passed in as startTime), so there is a brief
// re-buffer at the transition rather than a truly seamless element hand-off — a deliberate tradeoff
// to avoid reparenting the (load-bearing) main player DOM node. See the Videos.jsx wiring.
export default function GlobalMiniPlayer({ video, startTime = 0, isMobile = false, onExpand, onClose }) {
  const vidRef = useRef(null);
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    const closeReplaced = () => onClose?.(vidRef.current?.currentTime || 0);
    root?.addEventListener('strug:playback-replaced', closeReplaced);
    return () => root?.removeEventListener('strug:playback-replaced', closeReplaced);
  }, [onClose]);
  const dragState = useRef(null);
  // Position: null = default docked corner (bottom-right desktop / bottom-center mobile). Once the
  // user drags, we switch to explicit left/top coords.
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);

  const src = video?.processed_video_url || "";
  const W = isMobile ? 200 : 340;
  const H = Math.round((W * 9) / 16);
  const MARGIN = 16;

  // Seek the fresh element to where the full player left off, then play. Autoplay-with-sound is
  // allowed here because the user was already playing a video (prior gesture on this origin); if a
  // browser still blocks it, playback simply stays paused and the user can tap to resume.
  const onReady = useCallback((el) => {
    vidRef.current = el;
    if (!el) return;
    el.play?.().catch(() => { /* autoplay blocked — user can tap play */ });
  }, []);

  // ── Rotate-to-fullscreen on mobile (#473 item 3): turn the phone landscape while the mini is
  // playing → the video goes fullscreen; back to portrait → exit. Orientation lock/fullscreen are
  // browser-gated, so this is best-effort and silently no-ops where the browser refuses.
  useEffect(() => {
    if (!isMobile) return undefined;
    const onOrient = () => {
      const el = vidRef.current;
      if (!el) return;
      const landscape = (window.screen?.orientation?.type || "").startsWith("landscape")
        || (typeof window.orientation === "number" && Math.abs(window.orientation) === 90)
        || window.innerWidth > window.innerHeight;
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (landscape && !fsEl) {
        (el.requestFullscreen || el.webkitEnterFullscreen || el.webkitRequestFullscreen)?.call(el);
      } else if (!landscape && fsEl === el) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      }
    };
    window.addEventListener("orientationchange", onOrient);
    window.screen?.orientation?.addEventListener?.("change", onOrient);
    return () => {
      window.removeEventListener("orientationchange", onOrient);
      window.screen?.orientation?.removeEventListener?.("change", onOrient);
    };
  }, [isMobile]);

  // ── Drag to reposition (#473 item 2). Pointer-based so it works with mouse + touch. We drag the
  // header only, so taps on the video still expand and taps on ✕ still close.
  const onDragStart = useCallback((e) => {
    const box = e.currentTarget.closest("[data-mini-root]");
    if (!box) return;
    const r = box.getBoundingClientRect();
    dragState.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onDragMove = useCallback((e) => {
    const st = dragState.current;
    if (!st) return;
    st.moved = true;
    const w = W, h = H + 34; // include header height
    let left = e.clientX - st.dx;
    let top = e.clientY - st.dy;
    left = Math.max(MARGIN, Math.min(window.innerWidth - w - MARGIN, left));
    top = Math.max(MARGIN, Math.min(window.innerHeight - h - MARGIN, top));
    setPos({ left, top });
  }, [W, H]);

  const onDragEnd = useCallback((e) => {
    dragState.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const handleExpand = useCallback(() => {
    // If a drag just happened, don't treat the release as a click-to-expand.
    onExpand?.(vidRef.current?.currentTime || 0);
  }, [onExpand]);
  const handleClose = useCallback((e) => {
    e.stopPropagation();
    onClose?.(vidRef.current?.currentTime || 0);
  }, [onClose]);

  if (!src) return null;

  const rootStyle = pos
    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
    : isMobile
      ? { left: "50%", transform: "translateX(-50%)", bottom: 84 }
      : { right: MARGIN, bottom: MARGIN };

  return (
    <div
      data-mini-root
      ref={rootRef}
      style={{
        position: "fixed", zIndex: 1200, width: W,
        borderRadius: 12, overflow: "hidden", background: "#000",
        boxShadow: "0 8px 30px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
        fontFamily: "'DM Sans', sans-serif", userSelect: dragging ? "none" : "auto",
        transition: dragging ? "none" : "box-shadow 0.15s",
        ...rootStyle,
      }}
    >
      {/* Header = drag handle + title + close. */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        style={{
          height: 34, display: "flex", alignItems: "center", gap: 8, padding: "0 8px 0 10px",
          background: "rgba(20,20,26,0.96)", cursor: dragging ? "grabbing" : "grab", touchAction: "none",
        }}
      >
        <span style={{
          flex: 1, color: "#fff", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis",
        }}>{video?.title || "Now playing"}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleClose}
          aria-label="Close mini player"
          style={{
            width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: "none",
            background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, lineHeight: 1,
          }}
        >×</button>
      </div>
      {/* Video: click anywhere on it to expand back to the full watch page. */}
      <div
        onClick={handleExpand}
        title="Back to video"
        style={{ position: "relative", width: "100%", height: H, cursor: "pointer", background: "#000" }}
      >
        <HlsVideo
          key={src}
          src={src}
          startTime={startTime}
          isMobile={isMobile}
          onVideoEl={onReady}
          autoPlay
          playsInline
          controls={false}
          poster={video?.thumbnail_url || undefined}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
        />
        {/* Expand affordance. */}
        <div style={{
          position: "absolute", top: 6, left: 6, padding: "3px 7px", borderRadius: 6,
          background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.04em", pointerEvents: "none", opacity: 0.85,
        }}>TAP TO EXPAND</div>
      </div>
    </div>
  );
}
