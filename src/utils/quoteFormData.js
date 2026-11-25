// Shared quote form_data helpers. Backend sanitizeInput/xss() entity-encodes values in
// form_data on write (e.g. "<100k" → "&lt;100k"). xss@1.0.15 only escapes < and >;
// decoding &amp;/&quot;/&#39; would irreversibly corrupt legitimate input like "AT&T".

// Closed deals older than ~11 months (~300 days) — same window as provider "renewing"
// prospects (backend renewalCutoff in utils/quote-dispatch.js).
export const RENEWAL_MS = 300 * 24 * 60 * 60 * 1000;

export function isPastRequest(r) {
  return ["expired", "cancelled", "deal_closed"].includes(r?.status);
}

export function isRenewable(r) {
  if (r?.status !== "deal_closed") return false;
  const raw = r.updated_at || r.created_at;
  if (raw == null || raw === "") return false;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) && Date.now() - ts >= RENEWAL_MS;
}

export function flattenLeaves(cats) {
  return (cats || []).flatMap((m) => m.children || []);
}

/** Undo only the entities xss actually writes (&lt; / &gt;). */
export function decodeHtmlEntities(value) {
  if (typeof value !== "string" || !value.includes("&")) return value;
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/**
 * Coerce stored form_data for inputs. Schema fields get type-aware coercion; keys no
 * longer in the schema are still kept (decoded) so prefills don't silently drop them.
 * Recurses into arrays/objects for future multi-select schema.
 */
export function normalizeFormData(raw, schema) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const fields = Array.isArray(schema) ? schema : [];
  const out = {};
  const seen = new Set();
  for (const f of fields) {
    if (!f?.key || src[f.key] === undefined || src[f.key] === null) continue;
    seen.add(f.key);
    const v = src[f.key];
    out[f.key] = f.type === "number" ? v : decodeFormValue(v);
  }
  for (const [k, v] of Object.entries(src)) {
    if (seen.has(k) || v === undefined || v === null) continue;
    out[k] = decodeFormValue(v);
  }
  return out;
}

function decodeFormValue(v) {
  if (typeof v === "string") return decodeHtmlEntities(v);
  if (Array.isArray(v)) return v.map(decodeFormValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, child] of Object.entries(v)) out[k] = decodeFormValue(child);
    return out;
  }
  return v;
}

/** Match backend validateForm: only undefined/null/"" are empty — numeric 0 is valid. */
export function fieldEmpty(v) {
  return v === undefined || v === null || v === "";
}

export function schemaOptions(field) {
  return (field?.options || []).map((o) => decodeHtmlEntities(String(o)));
}
