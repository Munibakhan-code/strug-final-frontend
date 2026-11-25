import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFriendActivityPrefs, updateFriendActivityPrefs } from '../../api/videos';

export default function CircleSharingToggle() {
  const { t } = useTranslation();
  const descriptionId = useId();
  const active = useRef(false);
  const pending = useRef(false);
  const [prefs, setPrefs] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await getFriendActivityPrefs();
      if (result?.successful !== true || typeof result.share_video_activity !== 'boolean') {
        throw new Error('Invalid preferences response');
      }
      if (active.current) setPrefs(result);
    } catch {
      if (active.current) setError(true);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; };
  }, []);

  async function toggle() {
    if (pending.current || !prefs || prefs.has_profile === false) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await updateFriendActivityPrefs({ share_video_activity: !prefs.share_video_activity });
      if (result?.successful !== true || typeof result.share_video_activity !== 'boolean') {
        throw new Error('Invalid preferences response');
      }
      if (active.current) setPrefs(current => ({ ...current, ...result }));
    } catch {
      if (active.current) setError(true);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const label = t('circlePrivacy.label', { defaultValue: 'Share my video activity' });
  const enabled = prefs?.share_video_activity === true;
  const unavailable = prefs?.has_profile === false;
  const disabled = busy || !prefs || unavailable;
  const statusLabel = busy
    ? t('common.loading')
    : enabled
      ? t('circlePrivacy.on', { defaultValue: 'ON' })
      : t('circlePrivacy.off', { defaultValue: 'OFF' });

  return (
    <section
      className="border border-border bg-surface"
      aria-labelledby={`${descriptionId}-label`}
      style={{
        position: 'relative',
        padding: 14,
        borderRadius: 16,
        marginBottom: 16,
        minWidth: 0,
        overflow: 'hidden',
        background: enabled
          ? 'linear-gradient(135deg, rgba(37,99,235,.15), rgba(124,58,237,.09) 54%, var(--color-surface) 100%)'
          : 'linear-gradient(135deg, var(--color-surface-raised), var(--color-surface))',
        boxShadow: enabled ? '0 12px 28px rgba(37,99,235,.10)' : '0 8px 24px var(--color-shadow)',
        transition: 'background .24s ease, box-shadow .24s ease',
      }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', width: 96, height: 96, top: -58, right: -28, borderRadius: '50%', background: enabled ? 'rgba(96,165,250,.18)' : 'rgba(148,163,184,.07)', filter: 'blur(2px)', pointerEvents: 'none', transition: 'background .24s ease' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11 }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: 11, color: enabled ? '#60a5fa' : 'var(--color-text-secondary)', background: enabled ? 'rgba(37,99,235,.17)' : 'var(--color-surface-raised)', border: `1px solid ${enabled ? 'rgba(96,165,250,.30)' : 'var(--color-border)'}`, transition: 'color .24s ease, background .24s ease, border-color .24s ease' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M17 11l2 2 4-4" opacity={enabled ? 1 : 0.35} />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p id={`${descriptionId}-label`} className="text-text-primary" style={{ margin: 0, fontSize: 13, lineHeight: 1.3, fontWeight: 700 }}>{label}</p>
          <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, color: enabled ? '#60a5fa' : 'var(--color-text-muted)', fontSize: 10, lineHeight: 1, fontWeight: 800, letterSpacing: '.08em' }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: busy ? '#f59e0b' : enabled ? '#3b82f6' : '#94a3b8', boxShadow: enabled && !busy ? '0 0 0 3px rgba(59,130,246,.14)' : 'none' }} />
            {statusLabel}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-label={label}
          aria-describedby={descriptionId}
          aria-checked={enabled}
          aria-busy={busy}
          disabled={disabled}
          onClick={toggle}
          style={{
            position: 'relative',
            width: 62,
            height: 44,
            minWidth: 62,
            minHeight: 44,
            padding: 0,
            borderRadius: 999,
            border: 0,
            background: 'transparent',
            flexShrink: 0,
            cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer',
            opacity: unavailable ? 0.5 : 1,
            transition: 'opacity .2s ease',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              width: 58,
              height: 34,
              top: '50%',
              left: 2,
              borderRadius: 999,
              transform: 'translateY(-50%)',
              border: `1px solid ${enabled ? 'rgba(96,165,250,.65)' : 'var(--color-border)'}`,
              background: enabled ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : 'var(--color-surface-raised)',
              boxShadow: enabled ? 'inset 0 0 0 1px rgba(255,255,255,.12), 0 5px 16px rgba(37,99,235,.28)' : 'inset 0 1px 3px var(--color-shadow)',
              transition: 'background .24s ease, border-color .24s ease, box-shadow .24s ease',
            }}
          >
            <span style={{ position: 'absolute', width: 26, height: 26, top: 3, left: enabled ? 27 : 3, borderRadius: '50%', background: '#fff', boxShadow: '0 3px 9px rgba(15,23,42,.34)', transition: 'left .24s cubic-bezier(.2,.8,.2,1)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={enabled ? '#2563eb' : '#64748b'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', inset: 6 }}>
                {enabled ? <path d="m5 12 4 4L19 6" /> : <path d="M8 8l8 8M16 8l-8 8" />}
              </svg>
            </span>
          </span>
        </button>
      </div>
      <p id={descriptionId} className="text-text-secondary" style={{ position: 'relative', fontSize: 11.5, lineHeight: 1.5, margin: '11px 0 0' }}>
        {t('circlePrivacy.description', { defaultValue: 'Let mutual friends see videos you watch and like. Off keeps this activity private. Your own watch history stays available.' })}
      </p>
      {unavailable && <p className="text-text-secondary" style={{ position: 'relative', fontSize: 11.5, margin: '9px 0 0' }}>{t('circlePrivacy.profileRequired', { defaultValue: 'Create a social profile to enable sharing.' })}</p>}
      {error && <div role="alert" className="text-text-secondary" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)', fontSize: 11.5, marginTop: 10 }}>
        {t('circlePrivacy.error', { defaultValue: 'Could not confirm your setting. Please try again.' })}
        {!prefs && <button type="button" onClick={load} disabled={busy} style={{ minHeight: 36, padding: '0 12px', flexShrink: 0, borderRadius: 999, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>{t('common.retry')}</button>}
      </div>}
    </section>
  );
}
