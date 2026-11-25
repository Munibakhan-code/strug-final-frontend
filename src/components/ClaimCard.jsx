// Global actionable-offer claim card (Epic 10). Rendered once in AppInner; shows the single
// front-of-queue offer from useIncomingOffers. Bottom-CENTER (bottom-right is contested by the
// upload widget, mini-player, and mobile Messages FAB) at z-100001 — above the Rideshare
// modals (z-100000), because a driver with any dialog open must still see an incoming ride.

import { useState, useEffect, useRef } from 'react';

function money(v) {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.]/g, '')) : Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : (typeof v === 'string' ? v : null);
}

export default function ClaimCard({ offer, busy, error, onAccept, onDecline, onView }) {
  // Tick a timestamp (never derive-and-setState in the effect body), then compute secondsLeft
  // during render. The interval's setState is in an async callback, which is fine.
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    if (!offer?.expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [offer?.key, offer?.expiresAt]);

  const secondsLeft = offer?.expiresAt
    ? Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - now) / 1000))
    : null;

  // Fire the expiry hand-off exactly once, from an effect (not during render).
  useEffect(() => {
    if (secondsLeft === 0 && offer && !expiredRef.current) {
      expiredRef.current = true;
      onDecline?.(offer);
    }
  }, [secondsLeft, offer, onDecline]);

  if (!offer) return null;

  const isRide = offer.vertical === 'rideshare';
  const fare = money(offer.fare);
  const timeoutSec = offer.offerTimeoutSec || 120;
  const pct = secondsLeft != null ? Math.min(100, Math.max(0, (secondsLeft / timeoutSec) * 100)) : 100;
  const urgent = secondsLeft != null && secondsLeft <= 15;
  const isBusy = busy === offer.key;

  const label = { rideshare: 'Incoming ride', courier: 'Courier job', work: 'Job offer', ecommerce: 'Delivery available' }[offer.vertical] || 'Incoming offer';

  return (
    <div
      role="alertdialog"
      aria-label={label}
      style={{
        position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)',
        width: 'min(340px, calc(100vw - 24px))', zIndex: 100001,
        background: 'linear-gradient(180deg, var(--color-surface-raised), var(--color-surface))',
        border: `1.5px solid ${urgent ? '#ef4444' : '#f59e0b'}`,
        borderRadius: 16,
        boxShadow: `0 0 0 4px ${urgent ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.11)'}, 0 24px 64px var(--color-shadow)`,
        padding: 14, fontFamily: "'DM Sans', sans-serif",
        animation: 'claimIn 0.32s cubic-bezier(0.2,0.9,0.3,1.25) both',
      }}
    >
      <style>{`@keyframes claimIn{from{opacity:0;transform:translateX(-50%) translateY(12px) scale(0.95)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: urgent ? '#f87171' : '#f59e0b' }}>
          {label}
        </span>
        {secondsLeft != null && (
          <span style={{
            minWidth: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: urgent ? '#f87171' : '#f59e0b',
            fontVariantNumeric: 'tabular-nums',
            background: `conic-gradient(${urgent ? '#ef4444' : '#f59e0b'} ${pct * 3.6}deg, var(--color-border) 0)`,
            position: 'relative',
          }}>
            <span className="bg-surface-raised" style={{ position: 'absolute', inset: 3, borderRadius: '50%' }} />
            <span style={{ position: 'relative' }}>{secondsLeft}</span>
          </span>
        )}
      </div>

      {fare && <div className="text-text-primary" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{fare}</div>}
      {(offer.from || offer.to) && (
        <div className="text-text-primary" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>
          {offer.from || 'Pickup'} <span className="text-text-secondary">→</span> {offer.to || 'Dropoff'}
        </div>
      )}
      <div className="text-text-muted" style={{ fontSize: 10.5, marginTop: 3 }}>
        {[offer.eta, offer.distance, offer.pickupEta && `${offer.pickupEta} to pickup`].filter(Boolean).join(' · ') || offer.title}
      </div>

      {error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
        <button
          onClick={() => onDecline?.(offer)}
          disabled={isBusy}
          className="bg-surface-raised text-text-secondary"
          style={{
            flex: 1, padding: 9, borderRadius: 9, border: 'none', cursor: isBusy ? 'default' : 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12,
          }}
        >
          {isRide ? 'Decline' : 'Dismiss'}
        </button>
        <button
          onClick={() => (isRide ? onAccept?.(offer) : onView?.(offer))}
          disabled={isBusy}
          style={{
            flex: 2, padding: 9, borderRadius: 9, border: 'none', cursor: isBusy ? 'default' : 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 12,
            background: isBusy ? 'rgba(5,150,105,0.5)' : '#059669', color: '#fff',
          }}
        >
          {isBusy ? 'Accepting…' : isRide ? 'Accept' : 'View'}
        </button>
      </div>
    </div>
  );
}
