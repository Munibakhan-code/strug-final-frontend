import React from "react";
import { SaveButton } from "./SaveButton.jsx";
import {
  galleryGridImages,
  galleryHasExtraPhotos,
} from "../utils/tempstayListingHelpers.js";

const gridBtn = {
  padding: 0,
  border: "none",
  cursor: "pointer",
  position: "relative",
  overflow: "hidden",
  borderRadius: 12,
  background: "#000",
  display: "block",
  width: "100%",
  height: "100%",
};

export function TempStayDetailGallery({
  listing,
  galleryImages,
  galleryIdx,
  isMobile,
  onOpenLightbox,
  onTouchStart,
  onTouchEnd,
  t,
}) {
  const gridImages = galleryGridImages(galleryImages);
  const hasExtra = galleryHasExtraPhotos(galleryImages);

  const saveBtn = (
    <SaveButton
      entityType="stay"
      entityId={listing.id}
      meta={{
        title: listing.name,
        sub: listing.location,
        price: `$${listing.priceNum}/night`,
        thumb: galleryImages[0] || listing.thumb,
        accent: "#2563eb",
      }}
      style={{ position: "absolute", top: 14, right: 14, zIndex: 3 }}
    />
  );

  if (!galleryImages.length) {
    return (
      <div
        style={{
          marginBottom: 24,
          borderRadius: isMobile ? 0 : 12,
          overflow: "hidden",
          height: isMobile ? 280 : 420,
          background: listing.thumb,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.85,
        }}
      >
        <span style={{ fontSize: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
          {t("common.photos")}
        </span>
        {saveBtn}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div
        style={{
          marginLeft: -16,
          marginRight: -16,
          marginBottom: 20,
          position: "relative",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          style={{
            height: 300,
            background: "#000",
            position: "relative",
            touchAction: "pan-y",
          }}
        >
          <img
            loading="eager"
            decoding="async"
            src={galleryImages[galleryIdx]}
            alt={listing.name}
            onClick={() => onOpenLightbox(galleryIdx)}
            style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
          />
          {saveBtn}
          {listing.superhost && (
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                background: "rgba(0,0,0,0.72)",
                backdropFilter: "blur(6px)",
                borderRadius: 20,
                padding: "5px 12px",
                display: "flex",
                alignItems: "center",
                gap: 5,
                zIndex: 2,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="#f59e0b">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
              </svg>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {t("common.superhost")}
              </span>
            </div>
          )}
          {galleryImages.length > 1 && (
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 6,
                zIndex: 2,
              }}
            >
              {galleryImages.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === galleryIdx ? 8 : 6,
                    height: i === galleryIdx ? 8 : 6,
                    borderRadius: "50%",
                    background: i === galleryIdx ? "#fff" : "rgba(255,255,255,0.45)",
                    transition: "all 0.15s",
                  }}
                />
              ))}
            </div>
          )}
          {galleryImages.length > 1 && (
            <button
              type="button"
              onClick={() => onOpenLightbox(galleryIdx)}
              style={{
                position: "absolute",
                bottom: 12,
                right: 14,
                zIndex: 2,
                background: "rgba(0,0,0,0.65)",
                border: "none",
                borderRadius: 8,
                padding: "6px 10px",
                color: "#fff",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("tempstay.showAllPhotos", { count: galleryImages.length })}
            </button>
          )}
        </div>
      </div>
    );
  }

  const openAt = (index) => () => onOpenLightbox(index);

  if (gridImages.length === 1) {
    return (
      <div style={{ marginBottom: 28, position: "relative", borderRadius: 12, overflow: "hidden" }}>
        <button type="button" onClick={openAt(0)} style={{ ...gridBtn, height: 420, borderRadius: 12 }}>
          <img
            loading="eager"
            decoding="async"
            src={gridImages[0]}
            alt={listing.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </button>
        {saveBtn}
      </div>
    );
  }

  const sideSlots = [1, 2, 3, 4];

  return (
    <div style={{ marginBottom: 28, position: "relative" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 8,
          height: 420,
        }}
      >
        <button
          type="button"
          onClick={openAt(0)}
          style={{ ...gridBtn, gridRow: "1 / 3", gridColumn: "1" }}
        >
          <img
            loading="eager"
            decoding="async"
            src={gridImages[0]}
            alt={listing.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </button>
        {sideSlots.map((slot) => {
          const src = gridImages[slot];
          if (!src) {
            return (
              <div
                key={slot}
                style={{ background: "var(--color-surface-raised)", borderRadius: 12 }}
              />
            );
          }
          const showOverlay = slot === 4 && hasExtra;
          return (
            <button key={slot} type="button" onClick={openAt(slot)} style={gridBtn}>
              <img
                loading="lazy"
                decoding="async"
                src={src}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              {showOverlay && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.48)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {t("tempstay.showAllPhotos", { count: galleryImages.length })}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {saveBtn}
      {hasExtra && gridImages.length >= 5 && (
        <button
          type="button"
          onClick={openAt(0)}
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            zIndex: 3,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "8px 14px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 14px var(--color-shadow)",
          }}
        >
          {t("tempstay.showAllPhotos", { count: galleryImages.length })}
        </button>
      )}
    </div>
  );
}
