import { useEffect, useState } from 'react';
import { getRaidTargets, startLiveRaid } from '../../api/live';

const font = "'DM Sans', sans-serif";

/** Modal to pick a live target and start a raid (ends current stream). */
export default function StreamRaidPicker({ sessionId, open, onClose, onRaided, accent = '#9146FF' }) {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setConfirmTarget(null);
    getRaidTargets()
      .then((r) => {
        if (!cancelled) setTargets(Array.isArray(r?.data) ? r.data : []);
      })
      .catch(() => {
        if (!cancelled) setTargets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const raid = async (targetSessionId) => {
    if (!sessionId || !targetSessionId) return;
    setBusy(targetSessionId);
    setError('');
    try {
      const res = await startLiveRaid(sessionId, targetSessionId);
      onRaided?.(res);
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.message || 'Raid failed');
      setConfirmTarget(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border border-border text-text-primary"
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 14,
          padding: 20,
          fontFamily: font,
        }}
      >
        {confirmTarget ? (
          <>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Confirm raid?</h3>
            <p className="text-text-secondary" style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.55 }}>
              Viewers will be sent to <strong className="text-text-primary">{confirmTarget.display_name}</strong> and
              your stream will end. This can’t be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setConfirmTarget(null)}
                className="border border-border text-text-secondary"
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'transparent',
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void raid(confirmTarget.session_id)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: accent,
                  color: '#fff',
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                {busy === confirmTarget.session_id ? 'Raiding…' : 'Raid & end stream'}
              </button>
            </div>
            {error && <p style={{ margin: '12px 0 0', fontSize: 12, color: '#f87171' }}>{error}</p>}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Raid a channel</h3>
              <button type="button" onClick={onClose} className="text-text-secondary" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <p className="text-text-secondary" style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.5 }}>
              Send your viewers to another live stream, then end yours. They’ll see an 8-second countdown.
            </p>
            {loading && <p className="text-text-secondary" style={{ fontSize: 13 }}>Loading live channels…</p>}
            {!loading && targets.length === 0 && (
              <p className="text-text-secondary" style={{ fontSize: 13 }}>No other channels are live right now. You can still end your stream normally.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {targets.map((t) => (
                <button
                  key={t.session_id}
                  type="button"
                  disabled={!!busy}
                  onClick={() => setConfirmTarget(t)}
                  className="border border-border bg-surface-raised text-text-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy && busy !== t.session_id ? 0.5 : 1,
                    fontFamily: font,
                  }}
                >
                  {/* Avatar fallback tile — kept as a fixed neutral dark navy regardless of theme,
                      same as other avatar placeholders across the app. */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e293b', overflow: 'hidden', flexShrink: 0 }}>
                    {t.profile_pic_url ? <img src={t.profile_pic_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.display_name}</div>
                    <div className="text-text-secondary" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title} · {t.viewer_count ?? 0} viewers
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>
                    Raid
                  </span>
                </button>
              ))}
            </div>
            {error && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#f87171' }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
