// Push opt-in nudge.
//
// The web-push pipeline (service worker + VAPID + notify() → sendWebPushToUser) has been wired
// end to end for a while, but nothing ever ASKS the user to turn it on — the only switch lived
// buried in Settings. So for almost everyone `sendWebPushToUser` returned `{ sent: 0 }`: the
// feature existed but never reached a phone. This is the ask.
//
// Deliberately quiet: it only renders when push is actually actionable (supported + permission
// still 'default'), and a dismissal is remembered for two weeks so it never nags. Denied or
// already-granted → renders nothing. Drop it wherever the user is already thinking about
// notifications (the panel, the alerts screen) rather than interrupting a flow.

import { useState } from 'react';
import { isPushSupported, pushPermission, subscribeToPush } from '../api/push';

const DISMISS_KEY = 'strug_push_prompt_dismissed_at';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

// Everything on by default — the backend `categories` map is a sparse opt-out.
const DEFAULT_CATS = {
  chat: true, social: true, orders: true, rides: true, work: true,
  quotes: true, live: true, video: true, townhall: true, payments: true, system: true,
};

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

// Decided once, on mount — none of these inputs change while the panel is open (a permission
// change reloads the SW context), so an effect would only add a render.
function initialState() {
  if (typeof window === 'undefined') return 'hidden';
  if (!isPushSupported()) return 'hidden';
  if (pushPermission() !== 'default') return 'hidden'; // granted or denied — nothing to ask
  if (recentlyDismissed()) return 'hidden';
  return 'prompt';
}

export default function PushOptInBanner({ compact = false }) {
  const [state, setState] = useState(initialState); // hidden | prompt | busy | done | error
  const [errorMsg, setErrorMsg] = useState('');

  if (state === 'hidden' || state === 'done') return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setState('hidden');
  };

  const enable = async () => {
    setState('busy');
    setErrorMsg('');
    try {
      const res = await subscribeToPush(DEFAULT_CATS);
      if (res.ok) {
        try { localStorage.removeItem(DISMISS_KEY); } catch { /* noop */ }
        setState('done');
        return;
      }
      // permission prompt was dismissed or blocked, or push is disabled server-side
      if (res.reason === 'denied') {
        setErrorMsg('Notifications are blocked. Enable them for this site in your browser settings.');
      } else if (res.reason === 'push-disabled') {
        setErrorMsg("Push isn't available right now. Try again later.");
      } else {
        setErrorMsg('Could not turn on notifications. Try again.');
      }
      setState('error');
    } catch {
      setErrorMsg('Could not turn on notifications. Try again.');
      setState('error');
    }
  };

  const busy = state === 'busy';

  return (
    <div
      className="border border-border"
      style={{
        margin: compact ? '10px 12px 4px' : '12px 16px 4px',
        padding: compact ? '10px 12px' : '12px 14px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(37,99,235,0.14), rgba(37,99,235,0.04))',
        borderColor: 'rgba(37,99,235,0.32)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span
        style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa',
        }}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700, margin: '0 0 2px' }}>
          Turn on notifications
        </p>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, lineHeight: 1.45, margin: 0 }}>
          {state === 'error'
            ? errorMsg
            : 'Get ride, order and delivery updates even when Strug is closed.'}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={enable}
            disabled={busy}
            style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700,
              padding: '5px 12px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
              background: '#2563eb', border: '1px solid #2563eb', color: '#fff',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Enabling…' : state === 'error' ? 'Try again' : 'Turn on'}
          </button>
          <button
            onClick={dismiss}
            style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
              padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
            }}
          >
            Not now
          </button>
        </div>
      </div>

      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0,
          color: 'var(--color-text-muted)', flexShrink: 0,
        }}
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
