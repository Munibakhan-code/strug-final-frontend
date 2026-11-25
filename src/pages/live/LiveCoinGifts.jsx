import { useEffect, useState } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { getUser } from '../../store/auth';
import { CardInput } from '../../components/BookingPayment.jsx';
import { LiveGiftIcon } from '../../components/icons.jsx';
import {
  getCoinCatalog,
  getCoinBalance,
  buyCoins,
  confirmCoinPurchase,
  sendLiveGift,
} from '../../api/live';

const font = "'DM Sans', sans-serif";
// This gift button/panel/modal renders only inline in the live-watch page's video toolbar
// (LiveWatchPage.jsx), which is not yet theme-converted and stays hardcoded-dark throughout.
// Left dark here to match that surrounding chrome rather than create a jarring half-converted
// island; revisit once LiveWatchPage.jsx itself gets the token treatment.
const BORDER = 'rgba(255,255,255,0.12)';
const ACCENT = '#2563eb';

function ActionBtn({ children, primary, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? ACCENT : 'rgba(255,255,255,0.08)',
        border: primary ? 'none' : `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: '8px 14px',
        color: '#fff',
        fontFamily: font,
        fontWeight: 600,
        fontSize: 13,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#12121a',
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: 20,
          fontFamily: font,
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BuyCoinsPanel({ catalog, balance, onPurchased, onClose }) {
  const stripe = useStripe();
  const elements = useElements();
  const [pack, setPack] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const purchase = async () => {
    if (!pack || !stripe || !elements) return;
    setBusy(true);
    setError('');
    try {
      const { clientSecret, paymentIntentId } = await buyCoins(pack.id);
      const cardEl = elements.getElement(CardElement);
      if (!cardEl) throw new Error('Enter card details');
      const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardEl } });
      if (result.error) throw new Error(result.error.message);
      const confirmed = await confirmCoinPurchase(paymentIntentId);
      onPurchased(confirmed.balance ?? balance + pack.coins);
      setPack(null);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Payment failed');
    } finally {
      setBusy(false);
    }
  };

  const packs = catalog?.packs || [];

  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
        Balance: <strong style={{ color: '#fff' }}>{balance.toLocaleString()} coins</strong>
      </p>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {packs.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPack(p)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 10,
              border: pack?.id === p.id ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
              background: pack?.id === p.id ? 'rgba(37,99,235,0.12)' : 'rgba(255,255,255,0.04)',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: font,
            }}
          >
            <div style={{ fontWeight: 700 }}>{p.label}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              ${(p.amount_cents / 100).toFixed(2)} {catalog?.currency || 'CAD'}
            </div>
          </button>
        ))}
      </div>
      {pack && (
        <>
          {!catalog?.stripe_enabled && (
            <p style={{ color: '#fbbf24', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
              Card payments are not configured for local dev. Add <code style={{ color: '#93c5fd' }}>STRIPE_SECRET_KEY</code> to the backend <code style={{ color: '#93c5fd' }}>.env</code> and{' '}
              <code style={{ color: '#93c5fd' }}>VITE_STRIPE_PUBLISHABLE_KEY</code> to the frontend <code style={{ color: '#93c5fd' }}>.env.local</code>, then restart both servers.
            </p>
          )}
          {catalog?.stripe_enabled && <CardInput style={{ marginBottom: 12 }} />}
          {error && <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn primary disabled={busy || !catalog?.stripe_enabled} onClick={purchase}>
              {busy ? 'Processing…' : `Buy ${pack.label}`}
            </ActionBtn>
            <ActionBtn onClick={() => setPack(null)}>Back</ActionBtn>
          </div>
        </>
      )}
      {!pack && (
        <ActionBtn onClick={onClose}>Close</ActionBtn>
      )}
    </>
  );
}

/** Buy coins + send gifts to a streamer (80% streamer / 20% platform on gift). */
export default function LiveCoinGifts({ streamerId, sessionId, streamerName, onGiftSent }) {
  const loggedIn = !!getUser();
  const [catalog, setCatalog] = useState(null);
  const [balance, setBalance] = useState(0);
  const [panel, setPanel] = useState(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [busyGift, setBusyGift] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    getCoinCatalog().then(setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    getCoinBalance().then((r) => setBalance(r?.coin_balance ?? 0)).catch(() => {});
  }, [loggedIn, panel]);

  const refreshBalance = (next) => {
    if (typeof next === 'number') setBalance(next);
    else getCoinBalance().then((r) => setBalance(r?.coin_balance ?? 0)).catch(() => {});
  };

  const sendGift = async (gift) => {
    if (!streamerId || !gift) return;
    setBusyGift(gift.key);
    setToast('');
    try {
      const res = await sendLiveGift({
        streamer_id: streamerId,
        session_id: sessionId || undefined,
        gift_key: gift.key,
      });
      refreshBalance(res?.coin_balance);
      setToast(`Sent ${gift.label}!`);
      onGiftSent?.(res);
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      const code = e?.response?.data?.code;
      if (code === 'INSUFFICIENT_COINS') {
        setPanel('buy');
        setToast('Not enough coins — buy more to gift.');
      } else {
        const raw = e?.response?.data?.message || e?.message || 'Could not send gift';
        // Never dump Prisma / SQL errors into the live chat toolbar UI.
        const safe =
          typeof raw === 'string' && (raw.includes('prisma') || raw.includes('does not exist') || raw.length > 120)
            ? 'Gifts unavailable right now. Please try again shortly.'
            : raw;
        setToast(safe);
      }
      setTimeout(() => setToast(''), 4000);
    } finally {
      setBusyGift(null);
    }
  };

  if (!loggedIn) return null;
  if (!streamerId) return null;

  const gifts = catalog?.gifts || [];

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <ActionBtn onClick={() => setGiftOpen((o) => !o)}>
        Gift ▾ {balance > 0 ? `(${balance})` : ''}
      </ActionBtn>
      {giftOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 6,
            zIndex: 20,
            minWidth: 220,
            background: '#12121a',
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            Gift {streamerName || 'streamer'} · {balance} coins
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {gifts.map((g) => (
              <button
                key={g.key}
                type="button"
                disabled={!!busyGift}
                onClick={() => sendGift(g)}
                style={{
                  padding: '8px 6px',
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  cursor: busyGift ? 'default' : 'pointer',
                  fontFamily: font,
                  fontSize: 12,
                }}
              >
                <span style={{ display: 'inline-flex', color: '#fbbf24' }}>
                  <LiveGiftIcon name={g.icon || g.key} s={18} />
                </span>
                <div>{g.label}</div>
                <div style={{ color: 'rgba(255,255,255,0.45)' }}>{g.coins}c</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setPanel('buy'); setGiftOpen(false); }}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '8px',
              borderRadius: 8,
              border: 'none',
              background: ACCENT,
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: font,
            }}
          >
            Buy coins
          </button>
          {toast && (
            <p
              title={toast}
              style={{
                margin: '8px 0 0',
                fontSize: 11,
                color: '#f87171',
                lineHeight: 1.35,
                wordBreak: 'break-word',
                maxWidth: 200,
              }}
            >
              {toast}
            </p>
          )}
        </div>
      )}
      {!giftOpen && toast && (
        <span
          title={toast}
          style={{
            fontSize: 12,
            color: ACCENT,
            alignSelf: 'center',
            maxWidth: 140,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {toast}
        </span>
      )}
      {panel === 'buy' && (
        <Modal title="Buy coins" onClose={() => setPanel(null)}>
          <BuyCoinsPanel
            catalog={catalog}
            balance={balance}
            onPurchased={(b) => { refreshBalance(b); setPanel(null); setGiftOpen(true); }}
            onClose={() => setPanel(null)}
          />
        </Modal>
      )}
    </div>
  );
}
