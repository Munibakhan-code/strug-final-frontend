/**
 * Book Artist — category launcher into Work (ondemand).
 * Alfred: talent pricing lives in Work; users still need category-first entry
 * (Book DJ / Photographer / etc.). This replaces the failed parallel marketplace UX.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { useViewport } from "../hooks/useViewport.js";
import { BookArtistIcon } from "../components/icons.jsx";
import { setWorkHirePreset, clearWorkHirePreset } from "../utils/workHirePreset.js";
import { BOOK_ARTIST_CATEGORIES, BOOK_ARTIST_MACRO, BOOK_ARTIST_RADIUS_KM } from "../utils/bookArtistCategories.js";

const ACCENT = "#f43f5e";
const FONT = "'DM Sans', sans-serif";

function openWorkCategory(onNavigate, { leafSlugs = [], macroOnly = false } = {}) {
  setWorkHirePreset({
    macro: BOOK_ARTIST_MACRO,
    leafSlugs: !macroOnly && leafSlugs.length ? leafSlugs : [],
    source: "bookartist",
    catalog: true,
    radius: BOOK_ARTIST_RADIUS_KM,
  });
  window.__navReturn = { id: "bookartist", label: "Back to Book Artist" };
  try { window.dispatchEvent(new CustomEvent("strug:nav-return")); } catch { /* ignore */ }
  onNavigate?.("ondemand");
}

export function BookArtistPage({ onNavigate }) {
  const { t } = useTranslation();
  const { isMobile } = useViewport();
  const pad = isMobile ? 16 : 48;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        boxSizing: "border-box",
        paddingTop: isMobile ? 16 : 28,
        paddingBottom: isMobile ? 96 : 80,
        paddingLeft: pad,
        paddingRight: isMobile ? 16 : 48,
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ color: ACCENT, display: "inline-flex", flexShrink: 0 }}><BookArtistIcon s={isMobile ? 24 : 28} /></span>
          <h1
            className="text-text-primary"
            style={{ fontFamily: FONT, fontSize: isMobile ? 22 : 28, fontWeight: 800, margin: 0, lineHeight: 1.2 }}
          >
            {t("bookartist.landingTitle", { defaultValue: "Book an Artist" })}
          </h1>
        </div>
        <p
          className="text-text-secondary"
          style={{ fontFamily: FONT, fontSize: isMobile ? 13 : 14, lineHeight: 1.5, margin: "0 0 20px", maxWidth: 560 }}
        >
          {t("bookartist.launcherBody", {
            defaultValue:
              "Browse DJs, photographers, videographers, and entertainers on Work — they set their own rates and packages. Pick a category to see who’s available.",
          })}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(180px, 1fr))",
            gap: isMobile ? 10 : 12,
            marginBottom: 20,
          }}
        >
          {BOOK_ARTIST_CATEGORIES.map((cat) => {
            const label = t(cat.labelKey, { defaultValue: cat.fallback });
            const spanAll = cat.macroOnly && isMobile;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => openWorkCategory(onNavigate, cat)}
                className="border border-border bg-surface"
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: isMobile ? "14px 12px" : "16px 14px",
                  cursor: "pointer",
                  color: "inherit",
                  borderTop: `3px solid ${cat.color}`,
                  minHeight: isMobile ? 108 : 120,
                  gridColumn: spanAll ? "1 / -1" : undefined,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: isMobile ? 30 : 34,
                    height: isMobile ? 30 : 34,
                    borderRadius: "50%",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `${cat.color}22`,
                    color: cat.color,
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: isMobile ? 14 : 16,
                    lineHeight: 1,
                  }}
                >
                  {String(label || cat.fallback || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div
                  className="text-text-primary"
                  style={{
                    fontFamily: FONT,
                    fontSize: isMobile ? 13 : 15,
                    fontWeight: 750,
                    lineHeight: 1.25,
                    wordBreak: "break-word",
                  }}
                >
                  {label}
                </div>
                <div
                  className="text-text-muted"
                  style={{ fontFamily: FONT, fontSize: 11, marginTop: 4, lineHeight: 1.3 }}
                >
                  {cat.macroOnly
                    ? t("bookartist.openWorkBrowse", { defaultValue: "Browse entertainment on Work" })
                    : t("bookartist.bookViaWork", { defaultValue: "Browse & book on Work" })}
                </div>
              </button>
            );
          })}
        </div>

        <div
          className="border border-border bg-surface"
          style={{ borderRadius: 14, padding: isMobile ? 14 : 16 }}
        >
          <p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, margin: "0 0 12px", lineHeight: 1.45 }}>
            {t("bookartist.launcherSellerHint", {
              defaultValue:
                "Are you a DJ, photographer, or entertainer? Open the Work provider dashboard — add your service, set rates/packages, and go online to get booked.",
            })}
          </p>
          <button
            type="button"
            onClick={() => {
              clearWorkHirePreset();
              window.__navReturn = { id: "bookartist", label: "Back to Book Artist" };
              try { window.dispatchEvent(new CustomEvent("strug:nav-return")); } catch { /* ignore */ }
              onNavigate?.("sd-work");
            }}
            style={{
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              background: ACCENT,
              border: "none",
              borderRadius: 12,
              padding: "12px 16px",
              cursor: "pointer",
              width: isMobile ? "100%" : "auto",
              minHeight: 44,
            }}
          >
            {t("bookartist.openProviderDashboard", { defaultValue: "Offer services on Work" })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BookArtistPage;
