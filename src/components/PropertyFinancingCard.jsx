import React from "react";
import { useTranslation } from "react-i18next";
import { startPropertyFinancing } from "../utils/propertyFinancing.js";

const ACCENT_M = "#14b8a6";
const ACCENT_I = "#0ea5e9";

/**
 * Buyer journey card on Construct / Real Estate detail pages.
 * Starts Mortgage → Insurance funnel with property context prefilled.
 */
export default function PropertyFinancingCard({ item, source = "realestate" }) {
  const { t } = useTranslation();
  if (!item) return null;

  const isRental =
    source === "realestate" &&
    (item._kind === "rental" || /rent/i.test(String(item.category || "")));

  const priceLabel =
    item.priceLabel ||
    (item.priceNum != null
      ? `$${Number(item.priceNum).toLocaleString()}`
      : item.price
        ? (typeof item.price === "number" ? `$${Number(item.price).toLocaleString()}` : String(item.price))
        : null);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(20,184,166,0.12), rgba(14,165,233,0.10))",
        border: "1px solid rgba(20,184,166,0.28)",
        borderRadius: 16,
        padding: "18px 20px",
        marginBottom: 16,
      }}
    >
      <p
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          color: ACCENT_M,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          margin: "0 0 10px",
        }}
      >
        {t("financing.badge", { defaultValue: "Buyer journey" })}
      </p>

      <h3
        className="text-text-primary"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          margin: "0 0 8px",
          lineHeight: 1.15,
        }}
      >
        {isRental
          ? t("financing.rentalTitle", { defaultValue: "Protect this rental" })
          : t("financing.title", { defaultValue: "Can you finance this?" })}
      </h3>

      <p
        className="text-text-secondary"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          lineHeight: 1.55,
          margin: "0 0 14px",
        }}
      >
        {isRental
          ? t("financing.rentalBlurb", {
              defaultValue: "Get renters insurance quotes with this address pre-filled — compare providers in one place.",
            })
          : t("financing.blurb", {
              defaultValue: "Get mortgage quotes for this property, then protect it with home insurance — all inside Strug.",
            })}
      </p>

      {/* Step strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <StepPill n={1} label={t("financing.stepProperty", { defaultValue: "Property" })} active done />
        {!isRental && (
          <>
            <StepArrow />
            <StepPill n={2} label={t("financing.stepMortgage", { defaultValue: "Mortgage" })} color={ACCENT_M} />
            <StepArrow />
            <StepPill n={3} label={t("financing.stepInsurance", { defaultValue: "Insurance" })} color={ACCENT_I} />
          </>
        )}
        {isRental && (
          <>
            <StepArrow />
            <StepPill n={2} label={t("financing.stepInsurance", { defaultValue: "Insurance" })} color={ACCENT_I} />
          </>
        )}
      </div>

      {priceLabel && (
        <p
          className="text-text-muted"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            margin: "0 0 12px",
          }}
        >
          {t("financing.basedOn", {
            price: priceLabel,
            defaultValue: `Based on ${priceLabel}`,
          })}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() =>
            startPropertyFinancing(item, source, {
              step: isRental ? "insurance" : "mortgage",
            })
          }
          style={{
            flex: "1 1 160px",
            padding: "12px 16px",
            background: isRental ? ACCENT_I : ACCENT_M,
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {isRental
            ? t("financing.ctaInsurance", { defaultValue: "Get insurance quotes" })
            : t("financing.ctaMortgage", { defaultValue: "Get financing quotes" })}
        </button>
        {!isRental && (
          <button
            type="button"
            onClick={() => startPropertyFinancing(item, source, { step: "insurance" })}
            style={{
              flex: "1 1 140px",
              padding: "12px 16px",
              background: "transparent",
              border: `1px solid ${ACCENT_I}66`,
              borderRadius: 10,
              color: ACCENT_I,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t("financing.ctaInsuranceOnly", { defaultValue: "Insurance only" })}
          </button>
        )}
      </div>
    </div>
  );
}

function StepPill({ n, label, color = "#2563eb", active, done }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        // Inactive-state neutral chip is theme-flipping, so its text/border follow suit —
        // fixed white/near-white was invisible against the light-theme chip.
        background: done || active ? `${color}22` : "var(--color-surface-raised)",
        color: done || active ? color : "var(--color-text-muted)",
        border: `1px solid ${done || active ? `${color}55` : "var(--color-border)"}`,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: done || active ? color : "var(--color-surface-raised)",
          // Same fix as the chip above: white numeral only stays readable once the
          // circle itself is guaranteed dark (the done/active accent-colored state).
          color: done || active ? "#fff" : "var(--color-text-muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
        }}
      >
        {done ? "✓" : n}
      </span>
      {label}
    </span>
  );
}

function StepArrow() {
  // Sits directly on the card's translucent accent gradient, which composites with the
  // page background and flips light in light theme — fixed low-opacity white vanished there.
  return (
    <span className="text-text-muted" style={{ fontSize: 12, fontWeight: 700 }}>→</span>
  );
}
