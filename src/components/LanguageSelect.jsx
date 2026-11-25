import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/index.js";
import { applyLanguage } from "../utils/languagePrefs.js";

function intlLanguageName(code, uiLang) {
  try {
    const dn = new Intl.DisplayNames([uiLang], { type: "language" });
    const tag = code === "tl" ? "fil" : code;
    return dn.of(tag);
  } catch {
    return null;
  }
}

function formatLanguageLabel(lang, uiLang) {
  const localized = intlLanguageName(lang.code, uiLang);
  const parenthetical = localized && localized !== lang.native ? localized : lang.english;
  return `${lang.native} (${parenthetical})`;
}

/**
 * Dark-theme language picker for Settings (replaces native <select> on Windows).
 */
export function LanguageSelect({ value, onChange, ariaLabelledBy, ariaLabel }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef(null);

  const current = LANGUAGES.find((l) => l.code === value) ?? LANGUAGES.find((l) => l.code === "en");
  const uiLang = i18n.resolvedLanguage || i18n.language || "en";
  const currentLabel = useMemo(
    () => (current ? formatLanguageLabel(current, uiLang) : ""),
    [current, uiLang],
  );

  const filtered = LANGUAGES.filter(
    (l) =>
      l.english.toLowerCase().includes(search.toLowerCase()) ||
      l.native.toLowerCase().includes(search.toLowerCase()) ||
      l.code.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (code) => {
    onChange?.(code);
    applyLanguage(code);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="strug-select-trigger bg-surface-raised border border-border text-text-primary"
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "12px 16px",
          borderRadius: 12,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 14,
          cursor: "pointer",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{currentLabel}</span>
        <span style={{ opacity: 0.5, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="bg-surface-raised border border-border"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 100,
            borderRadius: 12,
            boxShadow: "0 12px 40px var(--color-shadow)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid var(--color-border-subtle)" }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("language.searchLanguages")}
              aria-label={t("language.searchLanguages")}
              className="bg-surface-raised border border-border text-text-primary"
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 8,
                padding: "8px 12px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <p className="text-text-secondary" style={{ padding: "12px 14px", margin: 0, fontSize: 13 }}>
                {t("common.noResults")}
              </p>
            ) : (
              filtered.map((l) => {
                const active = l.code === value;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => pick(l.code)}
                    className={active ? "text-text-primary" : "text-text-secondary"}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      border: "none",
                      // active/inactive text was fixed #fff/rgba(255,255,255,X) — fine when this
                      // panel was always dark, but the blue-tinted active background lightens in
                      // light theme, so text must flip with it (same fix as reportKit.jsx's select).
                      background: active ? "rgba(37,99,235,0.35)" : "transparent",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-border-subtle)",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "var(--color-border)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span style={{ fontWeight: active ? 700 : 500 }}>{l.native}</span>
                    <span style={{ opacity: 0.45, marginLeft: 6 }}>
                      ({intlLanguageName(l.code, uiLang) ?? l.english})
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
