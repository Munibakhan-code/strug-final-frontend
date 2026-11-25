import { useState } from 'react';

const font = "'DM Sans', sans-serif";

// Inline SVG nav icons (icon-set convention — no emoji/glyphs). Render into a 15px box.
const sv = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const IcHome = <svg {...sv}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
const IcStream = <svg {...sv}><polygon points="8 6 18 12 8 18 8 6" /></svg>;
const IcContent = <svg {...sv}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18" /></svg>;
const IcMoney = <svg {...sv}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 10a2.3 2 0 0 1 5 0c0 1.4-1.4 1.8-2.5 2.1s-2.5.7-2.5 2.1a2.3 2 0 0 0 5 0" /></svg>;
const IcSettings = <svg {...sv}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></svg>;
const IcWatch = <svg {...sv}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>;
const IcAnalytics = <svg {...sv}><path d="M4 20V10M10 20V4M16 20v-7M2 20h20" /></svg>;
const IcCommunity = <svg {...sv}><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 6a3 3 0 0 1 0 6M18.5 20c0-2-1-3.6-2.5-4.4" /></svg>;
const IcShield = <svg {...sv}><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" /></svg>;

const NAV = [
  { id: 'Overview', label: 'Home', icon: IcHome },
  { id: 'Go Live', label: 'Stream Manager', icon: IcStream, badge: null },
  { id: 'VODs', label: 'Content', icon: IcContent },
  { id: 'Earnings', label: 'Monetization', icon: IcMoney },
  { id: 'Edit Profile', label: 'Settings', icon: IcSettings },
];

const SECONDARY = [
  { id: 'live', label: 'Watch /live', icon: IcWatch, external: true },
  { id: 'Analytics', label: 'Analytics', icon: IcAnalytics },
  { id: 'Community', label: 'Community', icon: IcCommunity },
  { id: 'Moderation', label: 'Moderation', icon: IcShield },
];

function NavButton({ item, active, accent, onClick }) {
  const isActive = active === item.id;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={item.soon}
      className={isActive ? 'text-text-primary' : item.soon ? 'text-text-muted' : 'text-text-secondary'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 12px',
        marginBottom: 2,
        border: 'none',
        borderRadius: 8,
        background: isActive ? `${accent}33` : 'transparent',
        fontFamily: font,
        fontSize: 14,
        fontWeight: isActive ? 600 : 500,
        cursor: item.soon ? 'default' : 'pointer',
        textAlign: 'left',
        opacity: item.soon ? 0.65 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isActive && !item.soon) e.currentTarget.style.background = 'var(--color-surface-raised)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = isActive ? `${accent}33` : 'transparent';
      }}
    >
      <span style={{ width: 20, textAlign: 'center', fontSize: 13, flexShrink: 0 }}>{item.icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>
      {item.badge === 'NEW' && (
        <span style={{ fontSize: 9, fontWeight: 700, background: '#ec4899', color: '#fff', padding: '2px 5px', borderRadius: 4 }}>
          NEW
        </span>
      )}
      {item.soon && (
        <span className="text-text-muted" style={{ fontSize: 9, fontWeight: 600 }}>Soon</span>
      )}
    </button>
  );
}

/** Twitch-style creator dashboard sidebar — sits to the right of Strug’s main nav. */
export function StreamerCreatorSidebar({ active, onSelect, onWatchLive, accent = '#9333ea', isMobile, collapsed, onToggleCollapse }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="border-b border-border-subtle bg-surface" style={{ flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="text-text-primary"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            border: 'none',
            background: 'transparent',
            fontFamily: font,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <span>Creator Dashboard</span>
          <span className="text-text-secondary">{mobileOpen ? '▴' : '▾'}</span>
        </button>
        {mobileOpen && (
          <div style={{ padding: '0 8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...NAV, ...SECONDARY.filter((s) => !s.soon)].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.external) onWatchLive?.();
                  else onSelect?.(item.id);
                  setMobileOpen(false);
                }}
                className="text-text-primary"
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: `1px solid ${active === item.id ? accent : 'var(--color-border)'}`,
                  background: active === item.id ? `${accent}28` : 'var(--color-surface-raised)',
                  fontFamily: font,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const width = collapsed ? 52 : 240;

  return (
    <aside
      className="bg-surface border-r border-border-subtle"
      style={{
        width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      <div
        className="border-b border-border-subtle"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '14px 8px' : '14px 14px 10px',
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <span className="text-text-primary" style={{ fontFamily: font, fontWeight: 700, fontSize: 13 }}>Creator Dashboard</span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="bg-surface-raised text-text-secondary"
          style={{
            border: 'none',
            borderRadius: 6,
            width: 28,
            height: 28,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '8px 6px' : '10px 8px' }}>
        {NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active}
            accent={accent}
            onClick={() => onSelect?.(item.id)}
          />
        ))}

        {!collapsed && (
          <div className="text-text-muted" style={{ margin: '14px 4px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>
            MORE
          </div>
        )}

        {SECONDARY.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active}
            accent={accent}
            onClick={() => {
              if (item.external) onWatchLive?.();
              else if (!item.soon) onSelect?.(item.id);
            }}
          />
        ))}
      </div>
    </aside>
  );
}

/** Layout shell: Strug main nav stays left; creator sidebar + page content on the right. */
export default function StreamerCreatorShell({
  accent = '#9333ea',
  isMobile,
  activeTab,
  onTab,
  onWatchLive,
  header,
  stats,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const strugNavOffset = isMobile ? 0 : 108;

  return (
    <div
      className="bg-bg"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {header}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          marginLeft: strugNavOffset,
          overflow: 'hidden',
        }}
      >
        <StreamerCreatorSidebar
          active={activeTab}
          onSelect={onTab}
          onWatchLive={onWatchLive}
          accent={accent}
          isMobile={isMobile}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: 'auto',
            padding: isMobile ? '16px' : '20px 28px 40px 20px',
          }}
        >
          {stats}
          {children}
        </main>
      </div>
    </div>
  );
}
