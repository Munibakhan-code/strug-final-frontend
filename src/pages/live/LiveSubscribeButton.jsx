import { useEffect, useState } from 'react';
import i18n from '../../i18n/index.js';
import { getUser } from '../../store/auth';
import {
  getSubscriptionStatus,
  startSubscriptionCheckout,
  cancelSubscription,
} from '../../api/live';

function SubStar() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

/** Twitch-style paid subscribe button for the live watch page. Only usage today
 *  (LiveWatchPage's "streamer bar") renders it in normal page flow BELOW the video player,
 *  on a theme-aware panel — not on the dark video-overlay chrome. So its neutral states use
 *  theme tokens (fixed white text on a faint white overlay would go unreadable in light mode);
 *  the Twitch-purple/danger-red solid states keep their fixed brand colors + white text since
 *  those backgrounds don't change with theme. */
export default function LiveSubscribeButton({ streamerId, handle, compact, asActionBtn = false }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const loggedIn = !!getUser();

  useEffect(() => {
    if (!streamerId || !loggedIn) return;
    getSubscriptionStatus(streamerId).then(setStatus).catch(() => {});
  }, [streamerId, loggedIn]);

  if (!loggedIn || !streamerId) return null;

  const priceLabel = `$${((status?.price_cents ?? 499) / 100).toFixed(2)}`;
  const subscribed = status?.subscribed;
  const ending = subscribed && status?.cancel_at_period_end;

  if (status && !status.subscriptions_enabled && !subscribed) return null;

  const subscribe = async () => {
    setBusy(true);
    try {
      const res = await startSubscriptionCheckout(streamerId ? { streamer_id: streamerId } : { handle });
      if (res?.url) { window.location.href = res.url; return; }
    } catch (_) { /* refetch below */ }
    try { setStatus(await getSubscriptionStatus(streamerId)); } catch (_) {}
    setBusy(false);
  };

  const doCancel = async () => {
    setBusy(true);
    try { await cancelSubscription(streamerId); setStatus(await getSubscriptionStatus(streamerId)); } catch (_) {}
    setConfirmCancel(false);
    setBusy(false);
  };

  const base = {
    border: asActionBtn ? `1px solid var(--color-border)` : 'none',
    borderRadius: compact ? 10 : 8,
    padding: compact ? '8px 14px' : '9px 18px',
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 700,
    fontSize: 13,
    color: asActionBtn ? 'var(--color-text-primary)' : '#fff',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.6 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    background: asActionBtn ? 'var(--color-surface-raised)' : '#9146FF',
  };

  if (confirmCancel) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={doCancel} style={{ ...base, background: '#dc2626', border: 'none', color: '#fff' }}>
          {i18n.t('live.confirmCancelSub', { defaultValue: 'Cancel sub?' })}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirmCancel(false)} style={{ ...base, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
          {i18n.t('common.keep', { defaultValue: 'Keep' })}
        </button>
      </div>
    );
  }

  if (subscribed) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirmCancel(true)}
        title={status?.current_period_end ? new Date(status.current_period_end).toLocaleDateString() : undefined}
        style={{
          ...base,
          background: ending ? 'var(--color-surface-raised)' : 'rgba(145,70,255,0.18)',
          border: '1px solid #9146FF',
          color: 'var(--color-text-primary)',
        }}
      >
        <SubStar />
        {ending ? i18n.t('live.subEnding', { defaultValue: 'Ending soon' }) : i18n.t('live.subscribed', { defaultValue: 'Subscribed' })}
      </button>
    );
  }

  return (
    <button type="button" disabled={busy} onClick={subscribe} style={base}>
      <SubStar />
      {asActionBtn
        ? i18n.t('live.subscribeShort', { defaultValue: 'Subscribe ★' })
        : i18n.t('live.subscribePrice', { defaultValue: 'Subscribe {{price}}/mo', price: priceLabel })}
    </button>
  );
}
