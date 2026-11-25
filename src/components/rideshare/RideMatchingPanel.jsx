import { useEffect, useState } from 'react';
import { getMatchingPhase } from '../../utils/rideshareRiderExperience.js';
import i18n from '../../i18n/index.js';

const COPY_KEYS = {
  contacting: 'matchingContacting',
  expanding: 'matchingExpanding',
  delayed: 'matchingDelayed',
};

const buttonStyle = {
  minHeight: 44, padding: '10px 16px', borderRadius: 999, cursor: 'pointer',
  font: '700 13.5px/1 "DM Sans", sans-serif',
};
const buttonClass = 'border border-border bg-surface-raised text-text-primary';
const primaryButtonStyle = { ...buttonStyle, background: '#2563eb', border: '1px solid #2563eb', color: '#fff' };
const cancelButtonStyle = { ...buttonStyle, border: '1px solid rgba(252,165,165,0.4)', color: '#fca5a5' };

export default function RideMatchingPanel({ startedAt, elapsedMs, onContinue, onChangeRide, onCancel, busy = false, error }) {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isFinite(elapsedMs) || !Number.isFinite(startedAt)) return undefined;
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [elapsedMs, startedAt]);
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : Math.max(0, clock - (startedAt ?? clock));
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Finding a driver"
      className="bg-surface-raised border border-border text-text-primary"
      style={{
        padding: 20, borderRadius: 22, fontFamily: '"DM Sans", sans-serif',
      }}
    >
      <h2 className="text-text-primary" style={{ margin: '0 0 8px', overflowWrap: 'anywhere', fontSize: 17, fontWeight: 700 }}>{i18n.t(`rideshare.${COPY_KEYS[getMatchingPhase(elapsed)]}`)}</h2>
      <p className="text-text-secondary" style={{ overflowWrap: 'anywhere', margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.5 }}>{i18n.t('rideshare.matchingSupport')}</p>
      {error && <p role="alert" style={{ color: '#fca5a5', margin: '0 0 12px', fontSize: 13.5 }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {onContinue && <button type="button" style={primaryButtonStyle} disabled={busy} onClick={onContinue}>{i18n.t('rideshare.continueWaiting')}</button>}
        <button type="button" className={buttonClass} style={buttonStyle} disabled={busy} onClick={onChangeRide}>{i18n.t('rideshare.changeRide')}</button>
        <button type="button" className="bg-surface-raised" style={cancelButtonStyle} disabled={busy} onClick={onCancel}>{i18n.t('rideshare.cancelRide')}</button>
      </div>
    </section>
  );
}
