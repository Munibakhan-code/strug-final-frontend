/**
 * Frontend-only CSV export for Orders History.
 * Uses data already loaded in memory — no extra API calls.
 */

const CSV_HEADERS = [
  "Order ID",
  "Type",
  "Title",
  "Seller",
  "Amount",
  "Status",
  "Date",
];

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Excel auto-parses bare `YYYY-MM-DD` into a date serial; a narrow column then
 * renders as ########. Force a visible text cell with ="...".
 */
export function formatOrderExportDate(raw) {
  if (raw == null || raw === "" || raw === "—") return "—";
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  const display = iso ? iso[1] : s;
  // Leading ="" keeps Excel from turning this into a Date type.
  return `="${display}"`;
}

/** Build a CSV string from normalized order-history rows. */
export function buildOrdersCsv(orders) {
  const rows = Array.isArray(orders) ? orders : [];
  const lines = [CSV_HEADERS.join(",")];
  for (const o of rows) {
    lines.push(
      [
        csvEscape(o.id),
        csvEscape(o.type),
        csvEscape(o.title),
        csvEscape(o.seller),
        csvEscape(o.amount),
        csvEscape(String(o.status || "").replace(/[_-]+/g, " ")),
        // Do not csvEscape the formula wrapper — quotes are intentional for Excel.
        formatOrderExportDate(o.date),
      ].join(","),
    );
  }
  // BOM so Excel opens UTF-8 correctly
  return `\uFEFF${lines.join("\r\n")}`;
}

export function ordersExportFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `strug-orders-${y}-${m}-${d}.csv`;
}

/**
 * Trigger a browser download for the given CSV text.
 * Uses a temporary object URL and revokes it after click.
 */
export function downloadTextFile(content, filename, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the browser can start the download first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportOrdersCsv(orders) {
  const list = Array.isArray(orders) ? orders : [];
  if (list.length === 0) return { ok: false, reason: "empty" };
  downloadTextFile(buildOrdersCsv(list), ordersExportFilename());
  return { ok: true, count: list.length };
}
