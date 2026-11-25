import React, { useEffect, useRef, useState, useCallback } from "react";
import i18n from "../i18n/index.js";
import { useClosingTransition, glassBackdropStyle, glassPanelStyle, GLASS_PANEL_CLASS } from "./modalKit.jsx";

// Reusable pan + zoom crop modal (canvas-based, no dependency). The user drags to
// reposition and uses the slider to zoom; on confirm we render the framed region to a
// canvas at a fixed output width and hand back a JPEG File ready for the existing upload
// helpers. Used for banners (#161/#125) and stories (#124).
//
// Props:
//   src       object URL / URL of the source image
//   aspect    width/height of the crop frame (e.g. 16/5 banner, 9/16 story, 1 avatar)
//   title     modal heading
//   outWidth  output pixel width (height derived from aspect); default 1600
//   onCancel  () => void
//   onConfirm (file: File) => void
export default function ImageCropModal({ src, aspect = 16 / 5, title, outWidth = 1600, onCancel, onConfirm }) {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const [imgSize, setImgSize] = useState(null); // natural {w,h}
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const [busy, setBusy] = useState(false);
  const { closing, requestClose } = useClosingTransition();
  const close = (fn) => requestClose(() => fn?.());

  // Measure the frame once mounted / on resize.
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      let w = el.clientWidth;
      let h = w / aspect;
      // Cap portrait/tall frames so the crop box never runs past the viewport.
      const maxH = Math.min(460, Math.round(window.innerHeight * 0.6));
      if (h > maxH) { h = maxH; w = h * aspect; }
      setFrame({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [aspect]);

  // Load the image to get natural dimensions.
  useEffect(() => {
    const im = new Image();
    im.onload = () => { imgRef.current = im; setImgSize({ w: im.naturalWidth, h: im.naturalHeight }); };
    im.src = src;
  }, [src]);

  // Once we know both frame + image, compute the min "cover" scale and center it.
  useEffect(() => {
    if (!imgSize || !frame.w) return;
    const cover = Math.max(frame.w / imgSize.w, frame.h / imgSize.h);
    setMinScale(cover);
    setScale(cover);
    // center
    const dispW = imgSize.w * cover, dispH = imgSize.h * cover;
    setOffset({ x: (frame.w - dispW) / 2, y: (frame.h - dispH) / 2 });
  }, [imgSize, frame.w, frame.h]);

  // Keep the image covering the frame (no gaps) whenever scale/offset change.
  const clamp = useCallback((off, sc) => {
    if (!imgSize || !frame.w) return off;
    const dispW = imgSize.w * sc, dispH = imgSize.h * sc;
    let x = off.x, y = off.y;
    x = Math.min(0, Math.max(frame.w - dispW, x));
    y = Math.min(0, Math.max(frame.h - dispH, y));
    return { x, y };
  }, [imgSize, frame.w, frame.h]);

  const onPointerDown = (e) => {
    const p = e.touches ? e.touches[0] : e;
    drag.current = { px: p.clientX, py: p.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const p = e.touches ? e.touches[0] : e;
    const nx = drag.current.ox + (p.clientX - drag.current.px);
    const ny = drag.current.oy + (p.clientY - drag.current.py);
    setOffset(clamp({ x: nx, y: ny }, scale));
  };
  const onPointerUp = () => { drag.current = null; };

  const onZoom = (e) => {
    const sc = Math.max(minScale, Number(e.target.value));
    // Zoom around the frame center so it feels natural.
    if (imgSize && frame.w) {
      const cx = frame.w / 2, cy = frame.h / 2;
      const k = sc / scale;
      const nx = cx - (cx - offset.x) * k;
      const ny = cy - (cy - offset.y) * k;
      setOffset(clamp({ x: nx, y: ny }, sc));
    }
    setScale(sc);
  };

  const confirm = async () => {
    if (!imgSize || !frame.w || busy) return;
    setBusy(true);
    try {
      const outH = Math.round(outWidth / aspect);
      const canvas = document.createElement("canvas");
      canvas.width = outWidth; canvas.height = outH;
      const ctx = canvas.getContext("2d");
      // Map frame-space → output-space.
      const ratio = outWidth / frame.w;
      const dispW = imgSize.w * scale * ratio;
      const dispH = imgSize.h * scale * ratio;
      ctx.fillStyle = "#0f1117";
      ctx.fillRect(0, 0, outWidth, outH);
      ctx.drawImage(imgRef.current, offset.x * ratio, offset.y * ratio, dispW, dispH);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      const file = new File([blob], `crop-${aspect.toFixed(2)}.jpg`, { type: "image/jpeg" });
      close(() => onConfirm?.(file));
    } finally {
      setBusy(false);
    }
  };

  const btn = { padding: "10px 20px", borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" };

  return (
    <div style={glassBackdropStyle(closing, { zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 })} onMouseUp={onPointerUp} onMouseLeave={onPointerUp} onMouseMove={onPointerMove} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}>
      <div className={GLASS_PANEL_CLASS} style={glassPanelStyle(closing, { width: "min(560px, 100%)", borderRadius: 16, padding: 20 })}>
        <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 4px" }}>{title || i18n.t("crop.title", { defaultValue: "Adjust image" })}</p>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 14px" }}>{i18n.t("crop.hint", { defaultValue: "Drag to reposition · slide to zoom" })}</p>
        <div ref={wrapRef} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <div
            onMouseDown={onPointerDown}
            onTouchStart={onPointerDown}
            className="bg-bg"
            style={{ width: frame.w || "100%", height: frame.h || 180, borderRadius: 12, overflow: "hidden", position: "relative", cursor: "grab", touchAction: "none", userSelect: "none" }}
          >
            {imgSize && (
              <img
                src={src}
                alt=""
                draggable={false}
                style={{ position: "absolute", left: offset.x, top: offset.y, width: imgSize.w * scale, height: imgSize.h * scale, maxWidth: "none", pointerEvents: "none" }}
              />
            )}
          </div>
        </div>
        <input type="range" min={minScale} max={minScale * 4} step="0.01" value={scale} onChange={onZoom} style={{ width: "100%", margin: "14px 0 4px", accentColor: "#2563eb" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button
            onClick={() => close(onCancel)}
            disabled={busy}
            onMouseDown={(e) => !busy && (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            className="bg-surface-raised border border-border text-text-primary"
            style={{ ...btn, transition: "transform 0.12s ease, background 0.15s ease" }}
          >{i18n.t("common.cancel", { defaultValue: "Cancel" })}</button>
          <button
            onClick={confirm}
            disabled={busy || !imgSize}
            onMouseDown={(e) => !busy && imgSize && (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            style={{ ...btn, background: "#2563eb", border: "none", color: "#fff", opacity: (busy || !imgSize) ? 0.6 : 1, transition: "transform 0.12s ease, opacity 0.15s ease" }}
          >{busy ? i18n.t("crop.saving", { defaultValue: "Saving…" }) : i18n.t("crop.apply", { defaultValue: "Apply" })}</button>
        </div>
      </div>
    </div>
  );
}
