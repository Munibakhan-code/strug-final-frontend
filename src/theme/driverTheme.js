// Design tokens for the driver-side redesign (Home screen, offer takeover, bottom nav).
// Scoped to the new driver components only — not a repo-wide token migration. Values match
// the colors/fonts already used throughout the app (SellerDashboards.jsx, App.jsx, etc.),
// just centralized here instead of re-typed as inline hex everywhere.

export const driverTheme = {
  // Neutral chrome routes through the app's --color-* theme tokens (see src/index.css) so the
  // driver dashboard follows light/dark mode like every other page. Only the brand/status
  // accents below stay hardcoded — those aren't theme-dependent.
  bg: "var(--color-bg)",
  card: "var(--color-surface)",
  border: "var(--color-border)",
  borderSubtle: "var(--color-border-subtle)",
  textPrimary: "var(--color-text-primary)",
  textSecondary: "var(--color-text-secondary)",
  textMuted: "var(--color-text-muted)",

  accentRide: "#2563eb",
  accentCourier: "#0ea5e9",

  online: "#22c55e",
  onlineDark: "#16a34a",
  warning: "#f59e0b",
  danger: "#ef4444",
  dangerLight: "#f87171",

  fontHeading: "'Barlow Condensed', sans-serif",
  fontBody: "'DM Sans', sans-serif",
};

export default driverTheme;
