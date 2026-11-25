import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAdminUsers,
  verifyUser,
  banUser,
  shadowBanUser,
  updateUserRole,
  adminGetFlaggedVideos,
  adminResolveFlaggedVideo,
  adminGetJobReports,
  adminResolveJobReport,
} from '../api/admin';
import {
  adminGetPayouts,
  adminApprovePayout,
  adminMarkPayoutPaid,
  adminRejectPayout,
  adminGetMonetizationRequests,
  adminResolveMonetization,
} from '../api/live';
import {
  adminGetFoodPayouts,
  adminApproveFoodPayout,
  adminMarkFoodPayoutPaid,
  adminRejectFoodPayout,
} from '../api/food';
import { Avatar as SharedAvatar, SafeImage } from '../components/SafeImage.jsx';

function useBadgeConfig() {
  const { t } = useTranslation();
  return useMemo(() => ({
    FAN_ACCOUNT:   { icon: '⭐', label: t('admin.badgeFan') },
    TOP_RATED:     { icon: '🏆', label: t('admin.badgeTopRated') },
    INDIVIDUAL:    { icon: '✅', label: t('admin.badgeIndividual') },
    CHARITY:       { icon: '💙', label: t('admin.badgeCharity') },
    CORPORATION:   { icon: '🏢', label: t('admin.badgeCorporation') },
    EDUCATIONAL:   { icon: '🎓', label: t('admin.badgeEducational') },
    GOVERNMENT:    { icon: '🏛️', label: t('admin.badgeGovernment') },
    MEDIA:         { icon: '📰', label: t('admin.badgeMedia') },
    PUBLIC_FIGURE: { icon: '🌟', label: t('admin.badgePublicFigure') },
  }), [t]);
}

// Neutral role colors are theme tokens (see src/index.css). accent/accentBg are the
// brand blue used for selection/emphasis — deliberately NOT theme-dependent (rule: brand
// colors stay fixed). Anywhere accent/accentBg pairs with text, keep that text hardcoded
// too (see isActive row below) rather than mixing in a token that would flip in light mode.
const D = {
  bg:        'var(--color-bg)',
  surface:   'var(--color-surface)',
  surface2:  'var(--color-surface-raised)',
  border:    'var(--color-border-subtle)',
  border2:   'var(--color-border)',
  text:      'var(--color-text-primary)',
  muted:     'var(--color-text-secondary)',
  faint:     'var(--color-text-muted)',
  accent:    '#378ADD',
  accentBg:  '#1a2d42',
};

// #457: delegate to the shared Avatar so a purged/404 photo falls back to the initials disc
// instead of the browser's broken-image icon. Styling is kept identical via the style override.
function Avatar({ url, name, size = 32 }) {
  return (
    <SharedAvatar
      url={url}
      initials={(name || 'U').slice(0, 2)}
      size={size}
      style={{
        background: D.accentBg,
        fontSize: size < 40 ? 11 : 15,
        fontWeight: 600,
        color: D.accent,
        fontFamily: 'inherit',
      }}
    />
  );
}

function Toggle({ checked, onChange, color = D.accent }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
      <span style={{
        position: 'absolute', inset: 0, borderRadius: 22,
        background: checked ? color : 'var(--color-border)', transition: 'background .2s',
      }}>
        {/* Knob stays fixed white with a shadow for definition — the unchecked track is a
            translucent border token that goes near-invisible on a light surface, so the
            knob needs its own edge rather than relying on background contrast. */}
        <span style={{
          position: 'absolute', width: 16, height: 16, borderRadius: '50%',
          background: '#fff', top: 3, left: checked ? 21 : 3, transition: 'left .2s',
          boxShadow: '0 1px 3px var(--color-shadow)',
        }} />
      </span>
    </label>
  );
}

function StatusPill({ profile }) {
  const { t } = useTranslation();
  if (profile?.is_banned)
    return <span style={pill('#3a1a1a', '#f87171')}>{t('admin.statusBanned')}</span>;
  if (profile?.is_shadow_banned)
    return <span style={pill('#2d2010', '#fbbf24')}>{t('admin.statusShadow')}</span>;
  return <span style={pill('#1a2d1a', '#4ade80')}>{t('admin.statusActive')}</span>;
}

function pill(bg, color) {
  return { fontSize: 11, padding: '2px 8px', borderRadius: 6, background: bg, color, fontWeight: 500 };
}

const PAYOUT_STATUS_PILL = {
  PENDING:  ['#2d2010', '#fbbf24'],
  APPROVED: ['#102236', '#60a5fa'],
  PAID:     ['#1a2d1a', '#4ade80'],
  REJECTED: ['#3a1a1a', '#f87171'],
};

function actionBtn(bg, color, disabled) {
  return {
    fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7,
    background: bg, color, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
}

// ─── Admin: live-streamer payout queue ───────────────────────────────────────
function LivePayoutsPanel({ showToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [tick, setTick] = useState(0);
  const reload = () => setTick((x) => x + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminGetPayouts()                            // default: PENDING + APPROVED
      .then((r) => { if (alive) setRows(r?.data || []); })
      .catch(() => showToast(t('admin.payoutLoadFailed', { defaultValue: 'Failed to load payouts' }), 'error'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const act = async (id, fn, okMsg) => {
    setBusyId(id);
    try {
      await fn();
      showToast(okMsg);
      setNotes((n) => ({ ...n, [id]: '' }));
      reload();
    } catch (e) {
      const m = e?.response?.data?.message;
      showToast(m || t('admin.actionFailed', { defaultValue: 'Action failed' }), 'error');
    }
    setBusyId(null);
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.loading', { defaultValue: 'Loading…' })}</div>;
  if (rows.length === 0) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.payoutsEmpty', { defaultValue: 'No pending payout requests.' })}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
      {rows.map((p) => {
        // Fallback pill for an unrecognized status: bg is a fixed dark gray, so its text
        // must stay fixed too (D.muted is now a token and would go dark-on-dark in light mode).
        const [bg, color] = PAYOUT_STATUS_PILL[p.status] || ['#222', '#999'];
        const busy = busyId === p.payout_id;
        const hasConnect = !!p.streamer?.stripe_account_id;
        return (
          <div key={p.payout_id} style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: D.text }}>
                  {p.streamer?.display_name || `Streamer #${p.streamer_id}`}
                  <span style={{ color: D.muted, fontFamily: 'monospace', fontSize: 12, marginLeft: 8 }}>@{p.streamer?.handle}</span>
                </div>
                <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>
                  {new Date(p.created_at).toLocaleString()}
                  {hasConnect && <span style={{ ...pill('#102236', '#60a5fa'), marginLeft: 8 }}>{t('admin.connectLinked', { defaultValue: 'Connect ✓' })}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: D.text }}>CAD {Number(p.amount).toFixed(2)}</div>
                <span style={pill(bg, color)}>{p.status}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <input
                value={notes[p.payout_id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [p.payout_id]: e.target.value }))}
                placeholder={t('admin.payoutNote', { defaultValue: 'Reference / note (optional)' })}
                style={{ flex: 1, minWidth: 160, padding: '7px 10px', border: `1px solid ${D.border2}`, borderRadius: 7, fontSize: 12, background: D.surface2, color: D.text, outline: 'none' }}
              />
              {(p.status === 'PENDING') && (
                <button disabled={busy} onClick={() => act(p.payout_id, () => adminApprovePayout(p.payout_id, notes[p.payout_id]), t('admin.payoutApproved', { defaultValue: hasConnect ? 'Payout sent via Connect' : 'Approved for manual payout' }))} style={actionBtn('#102236', '#60a5fa', busy)}>
                  {hasConnect ? t('admin.payoutApproveSend', { defaultValue: 'Approve & send' }) : t('admin.payoutApprove', { defaultValue: 'Approve' })}
                </button>
              )}
              {(p.status === 'PENDING' || p.status === 'APPROVED') && (
                <button disabled={busy} onClick={() => act(p.payout_id, () => adminMarkPayoutPaid(p.payout_id, notes[p.payout_id]), t('admin.payoutMarkedPaid', { defaultValue: 'Marked as paid' }))} style={actionBtn('#1a2d1a', '#4ade80', busy)}>
                  {t('admin.payoutMarkPaid', { defaultValue: 'Mark paid' })}
                </button>
              )}
              {(p.status === 'PENDING' || p.status === 'APPROVED') && (
                <button disabled={busy} onClick={() => act(p.payout_id, () => adminRejectPayout(p.payout_id, notes[p.payout_id]), t('admin.payoutRejected', { defaultValue: 'Rejected — funds refunded' }))} style={actionBtn('#3a1a1a', '#f87171', busy)}>
                  {t('admin.payoutReject', { defaultValue: 'Reject & refund' })}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Admin: food-vendor payout queue ─────────────────────────────────────────
function FoodPayoutsPanel({ showToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [tick, setTick] = useState(0);
  const reload = () => setTick((x) => x + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminGetFoodPayouts()
      .then((r) => { if (alive) setRows(r?.data || []); })
      .catch(() => showToast(t('admin.foodPayoutLoadFailed', { defaultValue: 'Failed to load food payouts' }), 'error'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const act = async (id, fn, okMsg) => {
    setBusyId(id);
    try {
      await fn();
      showToast(okMsg);
      setNotes((n) => ({ ...n, [id]: '' }));
      reload();
    } catch (e) {
      const m = e?.response?.data?.message;
      showToast(m || t('admin.actionFailed', { defaultValue: 'Action failed' }), 'error');
    }
    setBusyId(null);
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.loading', { defaultValue: 'Loading…' })}</div>;
  if (rows.length === 0) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.payoutsEmpty', { defaultValue: 'No pending payout requests.' })}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
      {rows.map((p) => {
        const [bg, color] = PAYOUT_STATUS_PILL[p.status] || ['#222', '#999'];
        const busy = busyId === p.payout_id;
        const hasConnect = !!p.vendor?.stripe_account_id;
        return (
          <div key={p.payout_id} style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: D.text }}>
                  {p.vendor?.vendor_name || `Vendor #${p.vendor_id}`}
                </div>
                <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>
                  {new Date(p.created_at).toLocaleString()}
                  {hasConnect && <span style={{ ...pill('#102236', '#60a5fa'), marginLeft: 8 }}>{t('admin.connectLinked', { defaultValue: 'Connect ✓' })}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: D.text }}>CAD {Number(p.amount).toFixed(2)}</div>
                <span style={pill(bg, color)}>{p.status}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <input
                value={notes[p.payout_id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [p.payout_id]: e.target.value }))}
                placeholder={t('admin.payoutNote', { defaultValue: 'Reference / note (optional)' })}
                style={{ flex: 1, minWidth: 160, padding: '7px 10px', border: `1px solid ${D.border2}`, borderRadius: 7, fontSize: 12, background: D.surface2, color: D.text, outline: 'none' }}
              />
              {(p.status === 'PENDING') && (
                <button disabled={busy} onClick={() => act(p.payout_id, () => adminApproveFoodPayout(p.payout_id, notes[p.payout_id]), t('admin.payoutApproved', { defaultValue: hasConnect ? 'Payout sent via Connect' : 'Approved for manual payout' }))} style={actionBtn('#102236', '#60a5fa', busy)}>
                  {hasConnect ? t('admin.payoutApproveSend', { defaultValue: 'Approve & send' }) : t('admin.payoutApprove', { defaultValue: 'Approve' })}
                </button>
              )}
              {(p.status === 'PENDING' || p.status === 'APPROVED') && (
                <button disabled={busy} onClick={() => act(p.payout_id, () => adminMarkFoodPayoutPaid(p.payout_id, notes[p.payout_id]), t('admin.payoutMarkedPaid', { defaultValue: 'Marked as paid' }))} style={actionBtn('#1a2d1a', '#4ade80', busy)}>
                  {t('admin.payoutMarkPaid', { defaultValue: 'Mark paid' })}
                </button>
              )}
              {(p.status === 'PENDING' || p.status === 'APPROVED') && (
                <button disabled={busy} onClick={() => act(p.payout_id, () => adminRejectFoodPayout(p.payout_id, notes[p.payout_id]), t('admin.payoutRejected', { defaultValue: 'Rejected — funds refunded' }))} style={actionBtn('#3a1a1a', '#f87171', busy)}>
                  {t('admin.payoutReject', { defaultValue: 'Reject & refund' })}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Admin: streamer monetization-approval queue ─────────────────────────────
function MonetizationPanel({ showToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [tick, setTick] = useState(0);
  const reload = () => setTick((x) => x + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminGetMonetizationRequests()                // default PENDING
      .then((r) => { if (alive) setRows(r?.data || []); })
      .catch(() => showToast(t('admin.monetLoadFailed', { defaultValue: 'Failed to load requests' }), 'error'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const resolve = async (id, action) => {
    setBusyId(id);
    try {
      await adminResolveMonetization(id, action, notes[id]);
      showToast(action === 'APPROVE' ? t('admin.monetApproved', { defaultValue: 'Streamer approved' }) : t('admin.monetRejected', { defaultValue: 'Request rejected' }));
      reload();
    } catch (e) {
      showToast(e?.response?.data?.message || t('admin.actionFailed', { defaultValue: 'Action failed' }), 'error');
    }
    setBusyId(null);
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.loading', { defaultValue: 'Loading…' })}</div>;
  if (rows.length === 0) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.monetEmpty', { defaultValue: 'No pending monetization requests.' })}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
      {rows.map((r) => {
        const busy = busyId === r.request_id;
        return (
          <div key={r.request_id} style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: D.text }}>
                  {r.streamer?.display_name || `Streamer #${r.streamer_id}`}
                  <span style={{ color: D.muted, fontFamily: 'monospace', fontSize: 12, marginLeft: 8 }}>@{r.streamer?.handle}</span>
                </div>
                <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>{r.applied_at ? new Date(r.applied_at).toLocaleString() : ''}</div>
              </div>
              <span style={pill('#2d2010', '#fbbf24')}>{r.status}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <input
                value={notes[r.request_id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.request_id]: e.target.value }))}
                placeholder={t('admin.monetNote', { defaultValue: 'Note (optional)' })}
                style={{ flex: 1, minWidth: 160, padding: '7px 10px', border: `1px solid ${D.border2}`, borderRadius: 7, fontSize: 12, background: D.surface2, color: D.text, outline: 'none' }}
              />
              <button disabled={busy} onClick={() => resolve(r.request_id, 'APPROVE')} style={actionBtn('#1a2d1a', '#4ade80', busy)}>{t('admin.monetApprove', { defaultValue: 'Approve' })}</button>
              <button disabled={busy} onClick={() => resolve(r.request_id, 'REJECT')} style={actionBtn('#3a1a1a', '#f87171', busy)}>{t('admin.monetReject', { defaultValue: 'Reject' })}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FLAG_PILL = {
  auto_banned:      ['#3a1a1a', '#f87171', 'Auto-banned'],
  sensitive:        ['#2d2010', '#fbbf24', 'Sensitive'],
  scan_unavailable: ['#1a2436', '#60a5fa', 'Scan unavailable'],
};

// Content-moderation review queue (W8): videos the transcode worker flagged for a human look.
function ModerationPanel({ showToast }) {
  const { t } = useTranslation();
  const [sub, setSub] = useState('videos'); // videos | jobs

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          ['videos', t('admin.modVideos', { defaultValue: 'Videos' })],
          ['jobs', t('admin.modJobs', { defaultValue: 'Jobs' })],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSub(id)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${sub === id ? D.accent : D.border2}`,
              background: sub === id ? D.accentBg : 'transparent',
              color: sub === id ? D.accent : D.muted,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === 'videos' ? <VideoModerationQueue showToast={showToast} /> : <JobReportsQueue showToast={showToast} />}
    </div>
  );
}

function JobReportsQueue({ showToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((x) => x + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminGetJobReports({ status: 'pending' })
      .then((r) => { if (alive) setRows(r?.data || []); })
      .catch(() => showToast(t('admin.modJobsLoadFailed', { defaultValue: 'Failed to load job reports' }), 'error'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const resolve = async (reportId, action) => {
    setBusyId(reportId);
    try {
      await adminResolveJobReport(reportId, { action });
      showToast(
        action === 'dismiss'
          ? t('admin.modJobsDismissed', { defaultValue: 'Report dismissed' })
          : t('admin.modJobsActioned', { defaultValue: 'Job listing updated' }),
      );
      reload();
    } catch (e) {
      showToast(e?.response?.data?.message || t('admin.actionFailed', { defaultValue: 'Action failed' }), 'error');
    }
    setBusyId(null);
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.loading', { defaultValue: 'Loading…' })}</div>;
  if (rows.length === 0) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.modJobsEmpty', { defaultValue: 'No pending job reports.' })}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
      {rows.map((r) => {
        const busy = busyId === r.report_id;
        const job = r.jobs || {};
        return (
          <div key={r.report_id} style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: D.text }}>{job.job_name || `Job #${r.job_id}`}</div>
            <div style={{ fontSize: 12, color: D.muted, marginTop: 4 }}>
              {job.agents?.company_name || 'Company'} · reason: {r.reason}
              {r.details ? ` · ${r.details}` : ''}
            </div>
            <div style={{ fontSize: 11, color: D.muted, marginTop: 6 }}>
              Reporter #{r.reporter_id} · listing status: {job.status || 'open'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button disabled={busy} onClick={() => resolve(r.report_id, 'dismiss')} style={actionBtn('#1a2436', '#93c5fd', busy)}>Dismiss</button>
              <button disabled={busy} onClick={() => resolve(r.report_id, 'suspend')} style={actionBtn('#3a2a10', '#fbbf24', busy)}>Suspend</button>
              <button disabled={busy} onClick={() => resolve(r.report_id, 'remove')} style={actionBtn('#3a1a1a', '#f87171', busy)}>Remove</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VideoModerationQueue({ showToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((x) => x + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminGetFlaggedVideos()
      .then((r) => { if (alive) setRows(r?.data || []); })
      .catch(() => showToast(t('admin.modLoadFailed', { defaultValue: 'Failed to load flagged videos' }), 'error'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const resolve = async (videoId, action) => {
    setBusyId(videoId);
    try {
      await adminResolveFlaggedVideo(videoId, action);
      showToast(action === 'approve' ? t('admin.modApproved', { defaultValue: 'Video approved' }) : t('admin.modBanned', { defaultValue: 'Video removed' }));
      reload();
    } catch (e) {
      showToast(e?.response?.data?.message || t('admin.actionFailed', { defaultValue: 'Action failed' }), 'error');
    }
    setBusyId(null);
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.loading', { defaultValue: 'Loading…' })}</div>;
  if (rows.length === 0) return <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.modEmpty', { defaultValue: 'No videos awaiting review.' })}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
      {rows.map((v) => {
        const busy = busyId === v.video_id;
        // Same fallback-contrast fix as the payout pill above: fixed dark bg needs fixed text.
        const [bg, color, label] = FLAG_PILL[v.moderation_flag] || ['#222', '#999', v.moderation_flag];
        return (
          <div key={v.video_id} style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SafeImage
                src={v.thumbnail_url}
                alt=""
                style={{ width: 88, height: 50, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: D.surface2 }}
                fallback={<div style={{ width: 88, height: 50, borderRadius: 6, flexShrink: 0, background: D.surface2 }} />}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: D.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>
                  {v.channel?.display_name || `Channel #${v.channel?.channel_id}`}
                  {v.channel?.handle ? <span style={{ fontFamily: 'monospace', marginLeft: 6 }}>@{v.channel.handle}</span> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={pill(bg, color)}>{label}</span>
                  <span style={{ fontSize: 11, color: D.muted }}>{t('admin.modSafety', { defaultValue: 'safety' })}: {v.safety_score != null ? Number(v.safety_score).toFixed(2) : 'n/a'}</span>
                  <span style={{ fontSize: 11, color: D.muted }}>· {v.status}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <a href={`/v/${v.public_id || v.video_id}`} target="_blank" rel="noopener noreferrer" style={{ ...actionBtn('#1a2436', '#93c5fd', busy), textDecoration: 'none' }}>{t('admin.modWatch', { defaultValue: 'Watch' })}</a>
              <button disabled={busy} onClick={() => resolve(v.video_id, 'approve')} style={actionBtn('#1a2d1a', '#4ade80', busy)}>{t('admin.modApprove', { defaultValue: 'Approve' })}</button>
              <button disabled={busy} onClick={() => resolve(v.video_id, 'ban')} style={actionBtn('#3a1a1a', '#f87171', busy)}>{t('admin.modBan', { defaultValue: 'Remove' })}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const BADGE_CONFIG = useBadgeConfig();
const [users, setUsers]           = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [search, setSearch]         = useState('');
  const [filterVerified, setFilterVerified] = useState('');
  const [filterBanned, setFilterBanned]     = useState('');
  const [selected, setSelected]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [view, setView]             = useState('users'); // 'users' | 'payouts' | 'monetization'

  const currentPage = useRef(1);
  const searchTimer = useRef(null);
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);
  const tableRef    = useRef(null);   // ← scrollable container

  const [form, setForm] = useState({
    is_verified: false,
    verification_type: 'NONE',
    is_banned: false,
    is_shadow_banned: false,
    role: 'USER',
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = useCallback(async (page = 1) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await getAdminUsers(page, 15, search, filterVerified, filterBanned);
      const incoming = data.users || [];
      const pag      = data.pagination || { total: 0, page: 1, pages: 1 };
      setUsers(prev => page === 1 ? incoming : [...prev, ...incoming]);
      setPagination(pag);
      setHasMore(pag.page < pag.pages);
      currentPage.current = pag.page;
      setUnauthorized(false);
    } catch (err) {
      if (err?.response?.status === 403 || err?.response?.status === 401) {
        setUnauthorized(true);
      } else {
        showToast(t('admin.failedLoadUsers'), 'error');
      }
    }
    if (page === 1) setLoading(false);
    else setLoadingMore(false);
  }, [search, filterVerified, filterBanned]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      currentPage.current = 1;
      fetchUsers(1);
    }, 350);
  }, [fetchUsers]);

  // ─── Observer watches sentinel inside the scrollable tableRef ────────────
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          fetchUsers(currentPage.current + 1);
        }
      },
      {
        root: tableRef.current,   // ← scroll container as root
        threshold: 0.1,
      }
    );
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, fetchUsers]);

  const selectUser = (user) => {
    setSelected(user);
    const p = user.social_profiles?.[0];
    setForm({
      is_verified:       p?.is_verified        ?? false,
      verification_type: p?.verification_type   ?? 'NONE',
      is_banned:         p?.is_banned           ?? false,
      is_shadow_banned:  p?.is_shadow_banned    ?? false,
      role:              user.role              ?? 'USER',
    });
  };

  const handleSave = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await Promise.all([
        verifyUser(selected.user_id, form.is_verified, form.verification_type),
        banUser(selected.user_id, form.is_banned),
        shadowBanUser(selected.user_id, form.is_shadow_banned),
        updateUserRole(selected.user_id, form.role),
      ]);
      showToast(t('admin.profileUpdated'));
      fetchUsers(1);
    } catch {
      showToast(t('admin.failedSave'), 'error');
    }
    setSaving(false);
  };

  const profile       = selected?.social_profiles?.[0];
  const verifiedCount = users.filter(u => u.social_profiles?.[0]?.is_verified).length;
  const bannedCount   = users.filter(u => u.social_profiles?.[0]?.is_banned).length;

  if (unauthorized) {
    return (
      <div style={{ padding: '3rem 1.5rem', minHeight: '100vh', background: D.bg, fontFamily: 'Inter, sans-serif', color: D.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{t('admin.accessDenied')}</h2>
        <p style={{ margin: 0, fontSize: 13, color: D.muted, textAlign: 'center', maxWidth: 360 }}>
          {t('admin.accessDeniedDesc')}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', minHeight: '100vh', background: D.bg, fontFamily: 'Inter, sans-serif', color: D.text }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: toast.type === 'success' ? '#1a2d1a' : '#3a1a1a',
          color: toast.type === 'success' ? '#4ade80' : '#f87171',
          border: `1px solid ${toast.type === 'success' ? '#2d4a2d' : '#5a2a2a'}`,
        }}>
          {toast.msg}
        </div>
      )}

      {/* View switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', borderBottom: `1px solid ${D.border}`, paddingBottom: 10 }}>
        {[
          ['users',        t('admin.tabUsers',        { defaultValue: 'Users' })],
          ['payouts',      t('admin.tabPayouts',      { defaultValue: 'Live Payouts' })],
          ['foodPayouts',  t('admin.tabFoodPayouts',  { defaultValue: 'Food Payouts' })],
          ['monetization', t('admin.tabMonetization', { defaultValue: 'Monetization' })],
          ['moderation',   t('admin.tabModeration',   { defaultValue: 'Moderation' })],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${view === id ? D.accent : D.border2}`,
            background: view === id ? D.accentBg : 'transparent',
            color: view === id ? D.accent : D.muted, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {view === 'payouts' && <LivePayoutsPanel showToast={showToast} />}
      {view === 'foodPayouts' && <FoodPayoutsPanel showToast={showToast} />}
      {view === 'monetization' && <MonetizationPanel showToast={showToast} />}
      {view === 'moderation' && <ModerationPanel showToast={showToast} />}

      {view === 'users' && (<>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: D.text }}>{t('admin.userManagement')}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: D.muted }}>{t('admin.kycSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={pill(D.accentBg, D.accent)}>{t('admin.total', { count: pagination.total })}</span>
          <span style={pill('#1a2d1a', '#4ade80')}>{t('admin.verified', { count: verifiedCount })}</span>
          <span style={pill('#3a1a1a', '#f87171')}>{t('admin.banned', { count: bannedCount })}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: D.muted, fontSize: 14 }}>🔍</span>
          <input
            type="text"
            placeholder={t('admin.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 8px 8px 34px',
              border: `1px solid ${D.border2}`, borderRadius: 8, fontSize: 13,
              outline: 'none', boxSizing: 'border-box',
              background: D.surface2, color: D.text,
            }}
          />
        </div>
        {[
          { value: filterVerified, onChange: e => setFilterVerified(e.target.value), options: [['', t('admin.filterAllUsers')], ['true', t('admin.filterVerifiedOnly')], ['false', t('admin.filterUnverified')]] },
          { value: filterBanned,   onChange: e => setFilterBanned(e.target.value),   options: [['', t('admin.filterAllStatus')], ['true', t('admin.filterBannedOnly')], ['false', t('admin.filterActiveOnly')]] },
        ].map((sel, i) => (
          <select key={i} value={sel.value} onChange={sel.onChange} style={{
            padding: '8px 10px', border: `1px solid ${D.border2}`, borderRadius: 8,
            fontSize: 13, background: D.surface2, color: D.text, cursor: 'pointer',
          }}>
            {sel.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* ─── Scrollable Table ─── */}
        <div style={{ flex: 1, minWidth: 0, background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Sticky header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 36px',
            padding: '8px 14px', borderBottom: `1px solid ${D.border2}`,
            fontSize: 11, fontWeight: 600, color: D.muted,
            textTransform: 'uppercase', letterSpacing: '.04em',
            background: D.surface, flexShrink: 0,
          }}>
            <span>{t('admin.colUser')}</span><span>{t('admin.colHandle')}</span><span>{t('admin.colBadge')}</span><span>{t('admin.colStatus')}</span><span />
          </div>

          {/* ─── Scrollable body ─── */}
          <div
            ref={tableRef}
            style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}
          >
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.loadingUsers')}</div>
            ) : users.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: D.muted, fontSize: 13 }}>{t('admin.noUsersFound')}</div>
            ) : (
              <>
                {users.map(user => {
                  const p = user.social_profiles?.[0];
                  const b = p?.verification_type ? BADGE_CONFIG[p.verification_type] : null;
                  const isActive = selected?.user_id === user.user_id;
                  return (
                    <div
                      key={user.user_id}
                      onClick={() => selectUser(user)}
                      style={{
                        display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 36px',
                        padding: '10px 14px', borderBottom: `1px solid ${D.border}`,
                        cursor: 'pointer', alignItems: 'center', fontSize: 13,
                        background: isActive ? D.accentBg : 'transparent',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = D.surface2; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Row bg is D.accentBg (fixed dark navy) when active, so text here can't use the
                          plain D.text/D.muted/D.faint tokens — those go near-black in light mode while
                          this background stays fixed-dark. Force fixed light text when isActive instead. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Avatar url={p?.profile_pic_url} name={p?.display_name || user.name} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, color: isActive ? '#fff' : D.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p?.display_name || user.name || '—'}
                          </div>
                          <div style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.65)' : D.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {user.email}
                          </div>
                        </div>
                      </div>
                      <span style={{ color: isActive ? 'rgba(255,255,255,0.65)' : D.muted, fontFamily: 'monospace', fontSize: 12 }}>
                        {p?.handle ? `@${p.handle}` : '—'}
                      </span>
                      <div>
                        {p?.is_verified && b ? (
                          <span style={{ ...pill(D.accentBg, D.accent), display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {b.icon} {b.label}
                          </span>
                        ) : <span style={{ color: isActive ? 'rgba(255,255,255,0.4)' : D.faint }}>—</span>}
                      </div>
                      <div><StatusPill profile={p} /></div>
                      <span style={{ color: isActive ? 'rgba(255,255,255,0.4)' : D.faint, fontSize: 14 }}>›</span>
                    </div>
                  );
                })}

                {/* Sentinel */}
                <div ref={sentinelRef} style={{ padding: '14px', textAlign: 'center' }}>
                  {loadingMore && <span style={{ fontSize: 12, color: D.muted }}>{t('admin.loadingMore')}</span>}
                  {!hasMore && users.length > 0 && !loading && (
                    <span style={{ fontSize: 12, color: D.faint }}>{t('admin.allUsersLoaded', { count: pagination.total })}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── KYC Side Panel ─── */}
        {selected && (
          <div style={{
            width: 290, flexShrink: 0,
            background: D.surface, border: `1px solid ${D.border}`,
            borderRadius: 12, overflow: 'hidden',
            maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${D.border2}` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: D.text }}>🛡️ {t('admin.kycPanel')}</span>
              <button onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: D.muted, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: '16px 14px', borderBottom: `1px solid ${D.border2}`, textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <Avatar url={profile?.profile_pic_url} name={profile?.display_name || selected.name} size={52} />
              </div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: D.text }}>{profile?.display_name || selected.name || '—'}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: D.muted, fontFamily: 'monospace' }}>
                {profile?.handle ? `@${profile.handle}` : selected.email}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: D.faint }}>ID #{selected.user_id}</p>
            </div>

            <div style={{ padding: '14px' }}>
              {/* Verified */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: D.text }}>{t('admin.verifiedLabel')}</p>
                  <p style={{ margin: 0, fontSize: 11, color: D.muted }}>{t('admin.verifiedSub')}</p>
                </div>
                <Toggle checked={form.is_verified} onChange={e => setForm(f => ({ ...f, is_verified: e.target.checked }))} />
              </div>

              {/* Badge grid */}
              {form.is_verified && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ margin: '0 0 7px', fontSize: 11, fontWeight: 600, color: D.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t('admin.badgeType')}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {Object.entries(BADGE_CONFIG).map(([key, cfg]) => (
                      <div key={key} onClick={() => setForm(f => ({ ...f, verification_type: key }))}
                        style={{
                          padding: '7px 8px', borderRadius: 8, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                          border: form.verification_type === key ? `2px solid ${D.accent}` : `1px solid ${D.border2}`,
                          background: form.verification_type === key ? D.accentBg : D.surface2,
                          transition: 'all .15s',
                        }}
                      >
                        <span style={{ fontSize: 13 }}>{cfg.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: form.verification_type === key ? 600 : 400, color: form.verification_type === key ? D.accent : D.muted }}>
                          {cfg.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Role */}
              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 600, color: D.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t('admin.role')}</p>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: `1px solid ${D.border2}`, borderRadius: 8, fontSize: 13, background: D.surface2, color: D.text, cursor: 'pointer' }}>
                  <option value="USER">{t('admin.roleUser')}</option>
                  <option value="MODERATOR">{t('admin.roleModerator')}</option>
                  <option value="ADMIN">{t('admin.roleAdmin')}</option>
                </select>
              </div>

              {/* Ban toggles */}
              {[
                { key: 'is_banned',        label: t('admin.bannedLabel'),      sub: t('admin.bannedSub'),         color: '#f87171' },
                { key: 'is_shadow_banned', label: t('admin.shadowBanLabel'),  sub: t('admin.shadowBanSub'),      color: '#fbbf24' },
              ].map(({ key, label, sub, color }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: form[key] ? color : D.text }}>{label}</p>
                    <p style={{ margin: 0, fontSize: 11, color: D.muted }}>{sub}</p>
                  </div>
                  <Toggle checked={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} color={color} />
                </div>
              ))}

              {/* Save */}
              <button onClick={handleSave} disabled={saving} style={{
                width: '100%', padding: '9px', fontSize: 13, fontWeight: 600,
                background: saving ? D.surface2 : D.accent,
                color: saving ? D.muted : '#fff',
                border: 'none', borderRadius: 8,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background .15s',
              }}>
                {saving ? t('admin.saving') : t('admin.saveChanges')}
              </button>
            </div>
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}