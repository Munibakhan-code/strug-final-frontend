// Global notification bell (Epic 10). Two variants, one component:
//
//   variant="rail"     desktop — pinned in the sidebar between the split-view toggle and the
//                      avatar. Deliberately OUTSIDE SidebarScrollNav: that list scrolls, and a
//                      bell that can scroll out of view defeats the point of an unread badge.
//
//   variant="floating" mobile — top-right, immediately left of the profile button. Unlike that
//                      button (App.jsx:5839, gated on activeNav === "home"), the bell renders on
//                      EVERY route. A driver on their dashboard is exactly who needs it.

import { Tooltip } from './shared.jsx';

export function BellIcon({ s = 22 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function Badge({ count, ring, top = -8, right = -12 }) {
  if (!count) return null;
  return (
    <span style={{
      position: 'absolute', top, right, minWidth: 16, height: 16, padding: '0 3.5px',
      borderRadius: 999, background: '#ef4444', color: '#fff',
      fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, lineHeight: '16px',
      textAlign: 'center', letterSpacing: '-0.02em',
      border: `1.5px solid ${ring}`,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function NotificationBell({ variant = 'rail', unread = 0, open, onClick, label = 'Alerts', bottom = 78 }) {
  const accent = '#2563eb';

  if (variant === 'floating') {
    return (
      <Tooltip text="Notifications"><button
        onClick={onClick}
        aria-label="Notifications"
        style={{
          // Mirrors the Messages FAB — bottom-LEFT corner, same 54×54 size — so it no longer sits
          // over the top of the page (e.g. on the edge-to-edge mobile video). `bottom` matches the
          // Messages FAB's per-page offset, passed from AppInner.
          position: 'fixed', bottom, left: 20, zIndex: 50,
          width: 54, height: 54, borderRadius: '50%',
          background: open ? 'rgba(37,99,235,0.25)' : 'var(--color-surface-glass)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: open ? '1.5px solid rgba(37,99,235,0.5)' : '1px solid var(--color-border)',
          color: open ? '#60a5fa' : 'var(--color-text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0, boxShadow: '0 4px 18px var(--color-shadow)',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <span style={{ position: 'relative', display: 'flex' }}>
          <BellIcon s={24} />
          {/* Ring matches the button's own glass surface, not the page bg behind it. */}
          <Badge count={unread} ring="var(--color-surface-glass)" top={-3} right={-4} />
        </span>
      </button></Tooltip>
    );
  }

  // Rail variant — mirrors the SidebarScrollNav item shape exactly (padding, radius, icon size,
  // 9.5px label, active rail stripe) so it reads as one of the nav buttons, not a bolt-on.
  return (
    <button
      data-nav-id="notifications"
      onClick={onClick}
      style={{
        width: '100%', padding: '8px 4px', borderRadius: 10,
        background: open ? `${accent}22` : 'transparent', border: 'none',
        color: open ? accent : 'var(--color-text-secondary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
        flexShrink: 0, position: 'relative',
      }}
      onMouseEnter={(e) => { if (!open) { e.currentTarget.style.background = `${accent}18`; e.currentTarget.style.color = accent; } }}
      onMouseLeave={(e) => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
    >
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3,
          borderRadius: '0 3px 3px 0', background: accent,
        }} />
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <BellIcon s={22} />
        <Badge count={unread} ring="var(--color-surface-glass)" />
      </div>
      <span style={{
        fontSize: 9.5, fontFamily: "'DM Sans', sans-serif", fontWeight: open ? 700 : 400,
        lineHeight: 1.2, textAlign: 'center',
      }}>
        {label}
      </span>
    </button>
  );
}
