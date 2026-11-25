import { useMemo } from "react";

/**
 * Build the page-number window shown in the pager (with ellipsis gaps).
 * Example for page 6 of 12: [1, "…", 5, 6, 7, "…", 12]
 */
export function buildPaginationItems(page, totalPages) {
  const current = Math.max(1, Number(page) || 1);
  const total = Math.max(1, Number(totalPages) || 1);
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("…");
  for (let n = start; n <= end; n += 1) items.push(n);
  if (end < total - 1) items.push("…");
  items.push(total);
  return items;
}

const btnBase = {
  minWidth: 36,
  height: 36,
  padding: "0 12px",
  borderRadius: 10,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  transition: "background 0.15s, border-color 0.15s, color 0.15s",
};

/**
 * Reusable dark-theme pagination control.
 *
 * @param {object} props
 * @param {number} props.page — 1-based current page
 * @param {number} props.totalItems
 * @param {number} [props.pageSize=10]
 * @param {(page: number) => void} props.onChange
 * @param {string} [props.className]
 * @param {object} [props.style]
 */
export default function Pagination({
  page,
  totalItems,
  pageSize = 10,
  onChange,
  className,
  style,
  prevLabel = "Previous",
  nextLabel = "Next",
}) {
  const total = Math.max(0, Number(totalItems) || 0);
  const size = Math.max(1, Number(pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);

  const items = useMemo(
    () => buildPaginationItems(current, totalPages),
    [current, totalPages],
  );

  if (total <= size) return null;

  const go = (next) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (clamped !== current) onChange?.(clamped);
  };

  return (
    <nav
      className={className}
      aria-label="Pagination"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 6,
        ...style,
      }}
    >
      <button
        type="button"
        aria-label={prevLabel}
        disabled={current <= 1}
        onClick={() => go(current - 1)}
        className={
          current <= 1
            ? "bg-surface border border-border text-text-muted"
            : "bg-surface-raised border border-border text-text-secondary"
        }
        style={{
          ...btnBase,
          cursor: current <= 1 ? "default" : "pointer",
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span style={{ display: "inline" }}>{prevLabel}</span>
      </button>

      {items.map((item, idx) => {
        if (item === "…") {
          return (
            <span
              key={`gap-${idx}`}
              aria-hidden="true"
              className="text-text-muted"
              style={{
                ...btnBase,
                minWidth: 28,
                background: "transparent",
                border: "none",
                cursor: "default",
              }}
            >
              …
            </span>
          );
        }
        const active = item === current;
        return (
          <button
            key={item}
            type="button"
            aria-label={`Page ${item}`}
            aria-current={active ? "page" : undefined}
            onClick={() => go(item)}
            style={{
              ...btnBase,
              minWidth: 36,
              background: active ? "rgba(37,99,235,0.22)" : "var(--color-surface-raised)",
              border: active ? "1px solid rgba(37,99,235,0.55)" : "1px solid var(--color-border)",
              color: active ? "#60a5fa" : "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            {item}
          </button>
        );
      })}

      <button
        type="button"
        aria-label={nextLabel}
        disabled={current >= totalPages}
        onClick={() => go(current + 1)}
        className={
          current >= totalPages
            ? "bg-surface border border-border text-text-muted"
            : "bg-surface-raised border border-border text-text-secondary"
        }
        style={{
          ...btnBase,
          cursor: current >= totalPages ? "default" : "pointer",
        }}
      >
        <span style={{ display: "inline" }}>{nextLabel}</span>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </nav>
  );
}
