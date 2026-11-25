/**
 * Mortgage form helpers — Canadian down payment + client-side financial checks.
 * Mirrors backend/utils/quote-form-validate.js rules for immediate field errors.
 */

/** Canadian minimum down payment for a purchase price. */
export function canadianMinDownPayment(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (p < 500_000) return Math.round(p * 0.05);
  if (p < 1_000_000) return Math.round(500_000 * 0.05 + (p - 500_000) * 0.1);
  return Math.round(p * 0.2);
}

/** True when down payment is under 20% (typically CMHC-insured in Canada). */
export function isInsuredMortgage(price, downPayment) {
  const p = Number(price);
  const d = Number(downPayment);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(d) || d < 0) return null;
  return d / p < 0.2;
}

export function downPaymentHint(price, downPayment, country = "Canada") {
  const p = Number(price);
  const d = Number(downPayment);
  if (!Number.isFinite(p) || p <= 0) return null;
  const isCanada = !country || /^canada$/i.test(String(country).trim());
  if (!isCanada) return null;
  const min = canadianMinDownPayment(p);
  const insured = Number.isFinite(d) ? isInsuredMortgage(p, d) : null;
  const parts = [];
  if (min != null) {
    parts.push(`Canadian minimum down payment for this price: $${min.toLocaleString()}`);
  }
  if (insured === true) {
    parts.push("Under 20% down → typically insured (CMHC/insurance premium may apply).");
  } else if (insured === false) {
    parts.push("20%+ down → conventional (no mortgage default insurance required).");
  }
  return parts.length ? parts.join(" ") : null;
}

function parseNumber(v) {
  if (v === undefined || v === null || v === "") return { empty: true };
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return { invalid: true };
  return { value: n };
}

/**
 * @returns {{ fieldErrors: Record<string,string>, missingLabels: string[], message: string|null }}
 */
export function validateMortgageFormClient(category, formData, { country } = {}) {
  const schema = Array.isArray(category?.form_schema) ? category.form_schema : [];
  const data = formData && typeof formData === "object" ? formData : {};
  const fieldErrors = {};
  const missingLabels = [];
  const slug = category?.slug || "";

  for (const f of schema) {
    if (!f?.key) continue;
    const forceRequired = slug === "mortgage-new-purchase" && f.key === "amortization_years";
    const required = !!(f.required || forceRequired);
    const empty = data[f.key] === undefined || data[f.key] === null || data[f.key] === "";
    if (required && empty) {
      missingLabels.push(f.label || f.key);
      fieldErrors[f.key] = "Required";
      continue;
    }
    if (f.type === "number" && !empty) {
      const r = parseNumber(data[f.key]);
      if (r.invalid) fieldErrors[f.key] = "Enter a valid number";
      else if (r.value < 0) fieldErrors[f.key] = "Cannot be negative";
    }
  }

  const isCanada = !country || /^canada$/i.test(String(country).trim());

  const setIf = (key, msg) => {
    if (!fieldErrors[key]) fieldErrors[key] = msg;
  };

  if (slug === "mortgage-new-purchase") {
    const price = parseNumber(data.property_price);
    const down = parseNumber(data.down_payment);
    if (price.value != null && down.value != null && down.value > price.value) {
      setIf("down_payment", "Cannot exceed property price");
    }
    if (isCanada && price.value != null && down.value != null && down.value > 0) {
      const min = canadianMinDownPayment(price.value);
      if (min != null && down.value < min) {
        setIf("down_payment", `Below Canadian minimum ($${min.toLocaleString()})`);
      }
    }
  }

  if (slug === "mortgage-refinance") {
    const value = parseNumber(data.property_value);
    const balance = parseNumber(data.current_balance);
    if (value.value != null && balance.value != null && balance.value > value.value) {
      setIf("current_balance", "Cannot exceed property value");
    }
  }

  if (slug === "mortgage-renewal") {
    const value = parseNumber(data.property_value);
    const balance = parseNumber(data.current_balance);
    if (value.value != null && balance.value != null && balance.value > value.value) {
      setIf("current_balance", "Cannot exceed property value");
    }
  }

  if (slug === "mortgage-heloc") {
    const value = parseNumber(data.property_value);
    const balance = parseNumber(data.mortgage_balance);
    const limit = parseNumber(data.requested_credit_limit);
    if (value.value != null && balance.value != null && balance.value > value.value) {
      setIf("mortgage_balance", "Cannot exceed property value");
    }
    if (value.value != null && balance.value != null && limit.value != null) {
      const equity = value.value - balance.value;
      if (limit.value > equity) {
        setIf("requested_credit_limit", `Cannot exceed equity ($${equity.toLocaleString()})`);
      }
    }
  }

  const keys = Object.keys(fieldErrors);
  let message = null;
  if (missingLabels.length) message = `Please fill: ${missingLabels.join(", ")}`;
  else if (keys.length) message = fieldErrors[keys[0]];

  return { fieldErrors, missingLabels, message, ok: keys.length === 0 };
}
