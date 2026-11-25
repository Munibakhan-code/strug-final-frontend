const KEY = "strug_work_hire_preset";

function writeWindow(payload) {
  if (typeof window === "undefined") return;
  window.__ondemandPresetMacro = payload?.macro || null;
  if (payload?.leafSlugs?.length) window.__ondemandPresetLeafSlugs = payload.leafSlugs;
  else {
    try { delete window.__ondemandPresetLeafSlugs; } catch { window.__ondemandPresetLeafSlugs = null; }
  }
  if (payload) window.__ondemandPresetMeta = { source: payload.source || null, catalog: !!payload.catalog, radius: payload.radius, ts: payload.ts };
  else {
    try { delete window.__ondemandPresetMeta; } catch { window.__ondemandPresetMeta = null; }
  }
}

/** Persist a Work hire deep-link so category clicks survive remounts. */
export function setWorkHirePreset(preset = {}) {
  const payload = {
    macro: preset.macro || null,
    leafSlugs: Array.isArray(preset.leafSlugs) ? preset.leafSlugs.filter(Boolean) : [],
    source: preset.source || null,
    catalog: !!preset.catalog,
    radius: Number(preset.radius) > 0 ? Number(preset.radius) : undefined,
    ts: Date.now(),
  };
  try { sessionStorage.setItem(KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  writeWindow(payload);
  return payload;
}

export function peekWorkHirePreset() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.macro || (Array.isArray(parsed.leafSlugs) && parsed.leafSlugs.length))) return parsed;
    }
  } catch { /* ignore */ }
  if (typeof window === "undefined") return null;
  const macro = window.__ondemandPresetMacro || null;
  const leafSlugs = Array.isArray(window.__ondemandPresetLeafSlugs) ? window.__ondemandPresetLeafSlugs : [];
  const meta = window.__ondemandPresetMeta || {};
  if (!macro && !leafSlugs.length) return null;
  return {
    macro,
    leafSlugs,
    source: meta.source || null,
    catalog: !!meta.catalog,
    radius: meta.radius,
    ts: meta.ts,
  };
}

export function clearWorkHirePreset() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  if (typeof window === "undefined") return;
  try { delete window.__ondemandPresetMacro; } catch { window.__ondemandPresetMacro = null; }
  try { delete window.__ondemandPresetLeafSlugs; } catch { window.__ondemandPresetLeafSlugs = null; }
  try { delete window.__ondemandPresetMeta; } catch { window.__ondemandPresetMeta = null; }
}
