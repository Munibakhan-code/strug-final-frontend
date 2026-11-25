/** Defensive helpers for Messages render paths (metadata / preview text). */

export function coerceChatText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function parseChatMessageMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === "object") {
    if (Array.isArray(metadata)) return null;
    return metadata;
  }
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeMessageReactions(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

export function parseLocationCoords(meta) {
  const lat = Number(meta?.lat);
  const lng = Number(meta?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function convAccentColor(channelId, palette) {
  const colors = Array.isArray(palette) && palette.length ? palette : ["#2563eb"];
  const n = Number(channelId);
  const idx = Number.isFinite(n) ? Math.abs(n) % colors.length : 0;
  return colors[idx];
}

/** True for function components and React.memo / forwardRef component types. */
export function isReactComponentType(value) {
  if (typeof value === "function") return true;
  if (value == null || typeof value !== "object") return false;
  return value.$$typeof != null && value.type != null;
}

/** Coerce API context_type to a stable string key (prod may send numbers). */
export function coerceContextTypeKey(contextType) {
  if (contextType == null || contextType === "") return "";
  if (typeof contextType === "string") return contextType;
  if (typeof contextType === "number" || typeof contextType === "boolean") {
    return String(contextType);
  }
  return "";
}

export function formatContextTypeLabel(contextType) {
  const key = coerceContextTypeKey(contextType);
  if (!key) return "";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function normalizePollOptions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((opt) => {
    if (opt == null || typeof opt !== "object") {
      return { text: coerceChatText(opt), voters: [] };
    }
    return {
      ...opt,
      text: coerceChatText(opt.text),
      voters: Array.isArray(opt.voters) ? opt.voters : [],
    };
  });
}

/** Parse localStorage JSON into a Set of ids; rejects non-arrays. */
export function parseIdSetFromStorage(raw, fallback = "[]") {
  try {
    const parsed = JSON.parse(raw ?? fallback);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch {
    return new Set();
  }
}
