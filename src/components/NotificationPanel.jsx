// Global notification panel (Epic 10).
//
// Geometry is a deliberate clone of LanguagePicker (App.jsx:7207) — a 280px panel docked
// beside the sidebar rail on desktop, a full-bleed sheet on mobile — so it reads as a sibling
// of the language flyout rather than a new kind of surface. Same backdrop/z-index pair
// (54 catcher / 60 panel) and the same `flyoutIn` animation.
//
// It leans on signals the notification rows already carry rather than rendering every row the
// same way: each row is tinted with its vertical's colour (soft left-to-right wash on unread),
// `urgency === 'actionable'` rows surface an inline primary action, rows group into
// Today/Yesterday/This week/Earlier, and hovering a row reveals mark-read / dismiss controls.

import { useMemo, useState } from 'react';
import { useViewport } from '../hooks/useViewport';
import { VERTICAL_ORDER, VERTICAL_LABELS } from '../api/notifications';
import { Tooltip } from './Tooltip.jsx';
import { openContextChat } from '../api/chat';
import { JOB_APPLICATION_CHAT_CONTEXT } from '../utils/jobMessaging.js';
import PushOptInBanner from './PushOptInBanner.jsx';

// Per-vertical marks. Inline SVG, never emoji (house icon-set convention).
const S = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
// Keyed on the backend `vertical` values (rideshare/food/ecommerce/courier/work/quotes/social).
const carIcon   = (c) => <svg {...S} stroke={c}><path d="M5 17h14M6 17V9l2-4h8l2 4v8" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></svg>;
const bagIcon   = (c) => <svg {...S} stroke={c}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 01-8 0" /></svg>;
const boxIcon   = (c) => <svg {...S} stroke={c}><path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" /></svg>;
const VERTICAL_ICONS = {
  rideshare: carIcon,
  courier:   carIcon,
  food:      bagIcon,
  ecommerce: boxIcon,
  work:   (c) => <svg {...S} stroke={c}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>,
  jobs:   (c) => <svg {...S} stroke={c}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>,
  quotes: (c) => <svg {...S} stroke={c}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 15h6" /></svg>,
  social: (c) => <svg {...S} stroke={c}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  booking: (c) => <svg {...S} stroke={c}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  video: (c) => <svg {...S} stroke={c}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>,
  live: (c) => <svg {...S} stroke={c}><circle cx="12" cy="12" r="3" /><path d="M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8M2.8 2.8a13 13 0 000 18.4M21.2 2.8a13 13 0 010 18.4" /></svg>,
  townhall: (c) => <svg {...S} stroke={c}><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" /></svg>,
  payments: (c) => <svg {...S} stroke={c}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>,
  // Every vertical the backend can emit needs an entry, INCLUDING the fallback: notify() coerces
  // an unmapped vertical to 'system', and a row with no icon renders an empty tile.
  system: (c) => <svg {...S} stroke={c}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>,
};
const VERTICAL_COLORS = {
  rideshare: '#f59e0b', courier: '#f59e0b', food: '#059669', ecommerce: '#0d9488',
  work: '#8b5cf6', jobs: '#2563eb', quotes: '#0ea5e9', social: '#2563eb', booking: '#e11d48',
  video: '#ec4899', live: '#ef4444', townhall: '#14b8a6', payments: '#22c55e', system: '#64748b',
};

// Label for the inline primary on an actionable row, keyed by vertical. Epic 10 (a): this button
// navigates to the destination surface where the offer is accepted/declined — the notification
// payload does not yet carry the entity id (ride_request / booking / job) needed to accept in
// place. (b) will thread those ids through and split this into real Accept / Decline that call
// acceptRide / acceptBooking / acceptWorkOffer directly.
const ACTION_LABEL = {
  rideshare: 'Respond', courier: 'Respond', booking: 'Respond', quotes: 'View quote',
  work: 'View', jobs: 'Open chat', food: 'Track order', ecommerce: 'Track',
  payments: 'Open wallet',
};
const actionLabelFor = (v) => ACTION_LABEL[v] || 'View';

const CheckIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>;
const XIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>;
const BellOffIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

// Which Today/Yesterday/This week/Earlier bucket a timestamp falls in. Computed off local
// midnight so "Today" means the calendar day, not a rolling 24h.
const BUCKETS = ['Today', 'Yesterday', 'This week', 'Earlier'];
function bucketOf(iso) {
  if (!iso) return 'Earlier';
  const startToday = new Date().setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= startToday) return 'Today';
  if (t >= startToday - 86400000) return 'Yesterday';
  if (t >= startToday - 6 * 86400000) return 'This week';
  return 'Earlier';
}

// Absolute clock time to sit beside the relative one. Same-day/yesterday rows show just the
// time; older rows prepend the date so "5d ago · Jul 10, 9:03 AM" is unambiguous.
function clockTime(iso, bucket) {
  if (!iso) return '';
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (bucket === 'Today' || bucket === 'Yesterday') return t;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${t}`;
}

export default function NotificationPanel({ items, loading, onClose, onMarkRead, onMarkAllRead, onDismiss, onNavigate }) {
  const { isMobile } = useViewport();
  const [filter, setFilter] = useState('all');
  const [hoverRow, setHoverRow] = useState(null);
  const [hoverChip, setHoverChip] = useState(null);

  // Only offer a chip for a vertical that actually has rows — an empty "Rides" chip that can
  // never match anything is worse than no chip. Rides/Orders appear once Phase 1 lands.
  const present = useMemo(() => {
    const seen = new Set(items.map((i) => i.vertical));
    return VERTICAL_ORDER.filter((v) => seen.has(v));
  }, [items]);

  // Per-vertical unread tallies, surfaced on the filter chips on hover.
  const unreadByVertical = useMemo(() => {
    const m = {};
    for (const i of items) if (!i.read) m[i.vertical] = (m[i.vertical] || 0) + 1;
    return m;
  }, [items]);
  const unreadTotal = useMemo(() => items.reduce((n, i) => (i.read ? n : n + 1), 0), [items]);

  const shown = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.vertical === filter)),
    [items, filter],
  );

  // Group the visible rows into ordered time buckets, preserving each row's newest-first order.
  const groups = useMemo(() => {
    const by = {};
    for (const n of shown) (by[bucketOf(n.createdAt)] ||= []).push(n);
    return BUCKETS.filter((b) => by[b]?.length).map((b) => [b, by[b]]);
  }, [shown]);

  // #472: deep-link to the actual post/video/profile the notification is about, not just its
  // category. The row carries entityType/entityId (from the unified table, or normaliseSocial for
  // the legacy silo); route those to the right surface with a target and let the page open the
  // item. Anything without a recognised target (rides, orders, DMs, follows pending a backend
  // user_id) falls back to the plain category nav.
  const openRow = (n) => {
    onMarkRead(n);
    const type = String(n.type || '').toLowerCase();
    const eid = n.entityId;
    let routed = false;
    if (eid != null && !type.includes('follow')) {
      if (n.entityType === 'town_hall_post') { onNavigate('social', { townHallPostId: eid }); routed = true; }
      else if (n.entityType === 'social_post') { onNavigate('feed', { feedPostId: eid }); routed = true; }
      else if (n.entityType === 'video') { onNavigate('videos', { videoId: eid }); routed = true; }
      else if (n.entityType === 'food_order' || ['food', 'floral', 'groceries', 'catering'].includes(n.vertical)) {
        const dest = String(n.nav || n.vertical || '').trim();
        if (dest.startsWith('sd-')) { onNavigate(dest); routed = true; }
        else if (dest === 'floral' || dest === 'groceries' || dest === 'catering') { onNavigate(dest, { foodOrderId: eid }); routed = true; }
        else { onNavigate('food', { foodOrderId: eid }); routed = true; }
      }
      else if (n.entityType === 'wallet_transaction' || n.vertical === 'payments') { onNavigate('wallet', { walletTxnId: eid }); routed = true; }
      else if (n.entityType === 'job_application' || n.vertical === 'jobs') {
        openContextChat(JOB_APPLICATION_CHAT_CONTEXT, eid).catch(() => {});
        onNavigate('messages', { jobApplicationId: eid });
        routed = true;
      }
      else if (n.entityType === 'mechanic_booking') { onNavigate('sd-automotive', { automotiveTab: 'Requests', automotiveRequestType: 'service' }); routed = true; }
    } else if (eid != null && n.entityType === 'profile') {
      onNavigate('profile', { profileUserId: eid }); routed = true;
    }
    if (!routed && n.nav) onNavigate(n.nav);
    onClose();
  };

  const chip = (id, label) => {
    const on = filter === id;
    const count = id === 'all' ? 0 : unreadByVertical[id] || 0;
    const showCount = count > 0 && hoverChip === id;
    return (
      <button
        key={id}
        onClick={() => setFilter(id)}
        onMouseEnter={() => setHoverChip(id)}
        onMouseLeave={() => setHoverChip((c) => (c === id ? null : c))}
        style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: on ? 700 : 500,
          padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: on ? '#2563eb' : 'var(--color-surface-raised)',
          border: `1px solid ${on ? '#2563eb' : 'var(--color-border)'}`,
          color: on ? '#fff' : 'var(--color-text-secondary)',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {label}
        {count > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800, lineHeight: '14px', height: 14, textAlign: 'center',
            borderRadius: 999, color: on ? '#fff' : '#dbeafe',
            background: on ? 'rgba(255,255,255,0.22)' : 'rgba(37,99,235,0.35)',
            overflow: 'hidden', transition: 'max-width 0.18s ease, opacity 0.18s ease, padding 0.18s ease',
            maxWidth: showCount ? 24 : 0, opacity: showCount ? 1 : 0, padding: showCount ? '0 5px' : 0,
          }}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 54 }} />
      <div
        role="dialog"
        aria-label="Notifications"
        className="bg-surface border border-border"
        style={{
          position: 'fixed',
          ...(isMobile
            ? { top: 58, left: 12, right: 12, bottom: 70 }
            : { top: 12, bottom: 14, left: 92, width: 280 }),
          zIndex: 60,
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          boxShadow: '0 20px 56px var(--color-shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'flyoutIn 0.15s ease both',
        }}
      >
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <h2 className="text-text-primary" style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 21,
              letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0,
              display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
            }}>
              Notifications
              {unreadTotal > 0 && (
                <span style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 800, color: '#fff',
                  background: '#2563eb', borderRadius: 999, minWidth: 20, height: 20, padding: '0 6px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 0,
                }}>
                  {unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              )}
            </h2>
            {unreadTotal > 0 && (
              <button
                onClick={onMarkAllRead}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 600, color: '#60a5fa',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          {present.length > 1 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {chip('all', 'All')}
              {present.map((v) => chip(v, VERTICAL_LABELS[v]))}
            </div>
          )}
        </div>

        <PushOptInBanner />

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skel" style={{ height: 44, borderRadius: 8 }} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div style={{ padding: '52px 24px 40px', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle at 50% 40%, rgba(37,99,235,0.22), rgba(37,99,235,0.05))',
                border: '1px solid rgba(37,99,235,0.25)',
              }}>
                <BellOffIcon />
              </div>
              <div className="text-text-primary" style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700,
                marginBottom: 5,
              }}>
                {filter === 'all' ? "You're all caught up" : `No ${VERTICAL_LABELS[filter]?.toLowerCase()} notifications`}
              </div>
              <div className="text-text-secondary" style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, lineHeight: 1.5,
              }}>
                {filter === 'all' ? 'New activity across your verticals lands here.' : 'Check back later, or switch filters.'}
              </div>
            </div>
          ) : (
            (() => {
              let idx = 0; // running index across all buckets, for the staggered entrance
              return groups.map(([bucket, rows]) => (
                <div key={bucket}>
                  <div className="text-text-muted" style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', padding: '12px 16px 5px',
                  }}>
                    {bucket}
                  </div>
                  {rows.map((n) => {
                    const color = VERTICAL_COLORS[n.vertical] || '#2563eb';
                    const icon = VERTICAL_ICONS[n.vertical];
                    const actionable = n.urgency === 'actionable';
                    const hovered = hoverRow === n.key;
                    const delay = idx++ * 30;
                    return (
                      <div
                        key={n.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => openRow(n)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(n); } }}
                        onMouseEnter={() => setHoverRow(n.key)}
                        onMouseLeave={() => setHoverRow((k) => (k === n.key ? null : k))}
                        style={{
                          width: '100%', display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left',
                          padding: '11px 14px', position: 'relative', cursor: 'pointer',
                          borderBottom: '1px solid var(--color-border-subtle)',
                          background: hovered
                            ? 'var(--color-surface-raised)'
                            : (n.read ? 'transparent' : `linear-gradient(90deg, ${color}1a 0%, rgba(255,255,255,0) 65%)`),
                          transition: 'background 0.15s',
                          animation: 'fadeUp 0.3s ease both', animationDelay: `${delay}ms`,
                        }}
                      >
                        {/* Hover controls — mark read (unread only) + dismiss. stopPropagation so they
                            don't trigger the row's navigate-on-click. */}
                        <div style={{
                          position: 'absolute', top: 9, right: 10, display: 'flex', gap: 4,
                          opacity: hovered ? 1 : 0, transition: 'opacity 0.15s', pointerEvents: hovered ? 'auto' : 'none',
                        }}>
                          {!n.read && (
                            <Tooltip text="Mark read"><button
                              aria-label="Mark read"
                              onClick={(e) => { e.stopPropagation(); onMarkRead(n); }}
                              style={hoverBtn}
                              onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverBtnHover)}
                              onMouseLeave={(e) => Object.assign(e.currentTarget.style, hoverBtn)}
                            >
                              <CheckIcon />
                            </button></Tooltip>
                          )}
                          <Tooltip text="Dismiss"><button
                            aria-label="Dismiss"
                            onClick={(e) => { e.stopPropagation(); (onDismiss || onMarkRead)(n); }}
                            style={hoverBtn}
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverBtnHover)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, hoverBtn)}
                          >
                            <XIcon />
                          </button></Tooltip>
                        </div>

                        <span style={{
                          width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          background: `${color}22`, border: `1px solid ${color}4d`,
                        }}>
                          {icon ? icon(color) : null}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="text-text-primary" style={{
                            display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                            fontWeight: n.read ? 550 : 700, lineHeight: 1.35, paddingRight: 34,
                          }}>
                            {n.title}
                          </span>
                          {n.body && (
                            <span className="text-text-secondary" style={{
                              display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                              lineHeight: 1.35, marginTop: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {n.body}
                            </span>
                          )}
                          {actionable && (
                            <span style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); openRow(n); }}
                                style={{
                                  fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 700,
                                  padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                                  border: '1px solid transparent', background: color, color: '#fff',
                                }}
                              >
                                {actionLabelFor(n.vertical)}
                              </button>
                            </span>
                          )}
                          <span className="text-text-muted" style={{
                            display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                            marginTop: 3,
                          }}>
                            {timeAgo(n.createdAt)}
                            {n.createdAt && <span className="text-text-secondary">{` · ${clockTime(n.createdAt, bucket)}`}</span>}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>
      </div>
    </>
  );
}

const hoverBtn = {
  width: 20, height: 20, borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
};
const hoverBtnHover = { ...hoverBtn, color: 'var(--color-text-primary)', background: 'var(--color-border)' };
