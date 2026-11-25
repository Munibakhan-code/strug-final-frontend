import React, { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_OPTIONS, countryFlagUrl } from "../utils/regionConfig.js";

/**
 * Dark-theme custom country dropdown with flags + search. Drop-in for a native <select>:
 * controlled via `value` (country full name) and `onChange(name)`. `invalid` paints the
 * border red while empty (used where country is required).
 */
export default function CountrySelect({
  value,
  onChange,
  placeholder = "Select your country…",
  invalid = false,
  ariaLabelledBy,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      // Focus the search box when the panel opens.
      const id = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  const Flag = ({ country, size = 22 }) => {
    const url = countryFlagUrl(country);
    // Fix the HEIGHT and let width follow the flag's natural aspect ratio, so
    // non-rectangular flags (Nepal's pennant) and square ones (Switzerland) aren't cropped.
    const h = Math.round(size * 0.72);
    if (!url) return <span style={{ width: size, height: h, display: "inline-block", flexShrink: 0 }} />;
    return (
      <img
        src={url}
        srcSet={`${url} 1x, ${url.replace("/w40/", "/w80/")} 2x`}
        alt=""
        loading="lazy"
        style={{ height: h, width: "auto", borderRadius: 2, flexShrink: 0, display: "block" }}
      />
    );
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`bg-surface-raised ${value ? "text-text-primary" : "text-text-secondary"}`}
        style={{
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: `1px solid ${invalid && !value ? "rgba(239,68,68,0.55)" : open ? "rgba(37,99,235,0.55)" : "var(--color-border)"}`,
          borderRadius: 12,
          padding: "12px 14px",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 15,
          outline: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {value && <Flag country={value} />}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        <span
          className="text-text-secondary"
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
            fontSize: 12,
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className="bg-surface-raised border border-border"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 50,
            borderRadius: 12,
            boxShadow: "0 16px 48px var(--color-shadow)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 8, borderBottom: "1px solid var(--color-border-subtle)" }}>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country…"
              aria-label="Search country"
              className="bg-surface-raised border border-border text-text-primary"
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 8,
                padding: "9px 12px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div className="text-text-secondary" style={{ padding: "14px 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
                No matches
              </div>
            )}
            {filtered.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="text-text-primary"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  // was fixed white text regardless of state — fine while the panel was always
                  // dark, but the active blue tint (and the plain panel bg) both lighten in light
                  // theme, so the text must flip with the panel (same fix as LanguageSelect.jsx).
                  background: c === value ? "rgba(37,99,235,0.18)" : "transparent",
                  border: "none",
                  padding: "10px 14px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (c !== value) e.currentTarget.style.background = "var(--color-border)";
                }}
                onMouseLeave={(e) => {
                  if (c !== value) e.currentTarget.style.background = "transparent";
                }}
              >
                <Flag country={c} size={20} />
                <span>{c}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
