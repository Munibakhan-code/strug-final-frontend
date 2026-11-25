/** Format a worker's creator rate for discovery cards / sidebars. */
export function formatWorkerRate(w) {
  if (!w) return null;
  const pkgs = Array.isArray(w.packages) ? w.packages.filter((p) => p && Number(p.price) > 0) : [];
  if (pkgs.length) {
    const min = Math.min(...pkgs.map((p) => Number(p.price)));
    return pkgs.length === 1
      ? `$${min.toFixed(0)}`
      : `from $${min.toFixed(0)}`;
  }
  if (w.price_type === "hourly" && Number(w.hourly_rate) > 0) return `$${Number(w.hourly_rate).toFixed(0)}/hr`;
  if (Number(w.flat_rate) > 0) return `$${Number(w.flat_rate).toFixed(0)}`;
  if (Number(w.hourly_rate) > 0) return `$${Number(w.hourly_rate).toFixed(0)}/hr`;
  return null;
}

export function workerHasCreatorPrice(w) {
  if (!w) return false;
  if (Array.isArray(w.packages) && w.packages.some((p) => Number(p?.price) > 0)) return true;
  return Number(w.hourly_rate) > 0 || Number(w.flat_rate) > 0;
}

/** Prefill hire form fields from a nearby worker's catalog. */
export function creatorPriceDefaults(w) {
  if (!w) return { priceType: "hourly", price: "", packageId: null, useWorkerRate: false };
  const pkgs = Array.isArray(w.packages) ? w.packages.filter((p) => Number(p?.price) > 0) : [];
  if (pkgs.length) {
    const first = pkgs[0];
    return {
      priceType: "flat",
      price: String(first.price),
      packageId: first.worker_package_id,
      useWorkerRate: false,
      durationHours: first.duration_hours,
    };
  }
  if (w.price_type === "flat" && Number(w.flat_rate) > 0) {
    return { priceType: "flat", price: String(w.flat_rate), packageId: null, useWorkerRate: true };
  }
  if (Number(w.hourly_rate) > 0) {
    return { priceType: "hourly", price: String(w.hourly_rate), packageId: null, useWorkerRate: true };
  }
  if (Number(w.flat_rate) > 0) {
    return { priceType: "flat", price: String(w.flat_rate), packageId: null, useWorkerRate: true };
  }
  return { priceType: "hourly", price: "", packageId: null, useWorkerRate: false };
}
