import { useEffect, useState } from 'react';
import { isDriverLocationStale } from '../../utils/rideshareRiderExperience.js';
import i18n from '../../i18n/index.js';

const actionStyle = {
  minHeight: 44, padding: '10px 16px', borderRadius: 999, cursor: 'pointer',
  font: '700 13.5px/1 "DM Sans", sans-serif',
};
const actionClass = 'border border-border bg-surface-raised text-text-primary';
const emergencyStyle = { ...actionStyle, border: '1px solid rgba(252,165,165,0.4)', color: '#fca5a5' };

export default function RidePickupPanel({
  driverName, driverImage, driverRating, vehicleModel, vehicleColor, vehiclePlate, etaLabel,
  locationUpdatedAt, now, arrived = false, stage, rideOtp,
  onMessage, onCall, onShare, onEmergency, onShowOtp,
}) {
  const [liveNow, setLiveNow] = useState(() => Date.now());
  useEffect(() => {
    if (now != null) return undefined;
    const updatedMs = new Date(locationUpdatedAt).getTime();
    const delay = Number.isFinite(updatedMs) ? Math.max(0, updatedMs + 15_001 - Date.now()) : 0;
    const id = setTimeout(() => setLiveNow(Date.now()), delay);
    return () => clearTimeout(id);
  }, [locationUpdatedAt, now]);
  const stale = isDriverLocationStale(locationUpdatedAt, now ?? liveNow);
  const showOtp = rideOtp && (stage === 'accepted' || stage === 'ongoing');

  return (
    <section
      aria-label="Driver and pickup details"
      className="bg-surface-raised border border-border text-text-primary"
      style={{
        display: 'grid', gap: 14, padding: 20, borderRadius: 22, fontFamily: '"DM Sans", sans-serif',
      }}
    >
      {arrived && (
        <p role="status" aria-live="polite" style={{ margin: 0, color: '#5cb98a', fontWeight: 700, fontSize: 14 }}>
          {i18n.t('rideshare.driverArrived')}
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        style={{ margin: 0, fontSize: 12.5, color: stale ? '#e0a355' : 'var(--color-text-secondary)' }}
      >
        {i18n.t(stale ? 'rideshare.locationStale' : 'rideshare.locationFresh')}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {driverImage && <img src={driverImage} alt="" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />}
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 15.5 }}>{driverName || 'Driver details unavailable'}</strong>
          {driverRating != null && Number.isFinite(Number(driverRating)) && (
            <span className="text-text-secondary" style={{ fontSize: 12.5 }}>★ {Number(driverRating).toFixed(1)} rating</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span className="text-text-primary" style={{ fontSize: 13.5, fontWeight: 600 }}>
          {[vehicleColor, vehicleModel].filter(Boolean).join(' ') || 'Vehicle details unavailable'}
        </span>
        <span className="text-text-secondary border border-border" style={{ fontSize: 12, borderRadius: 999, padding: '2px 10px' }}>
          {vehiclePlate || 'Plate unavailable'}
        </span>
        {etaLabel && (
          <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 700 }}>ETA: {etaLabel}</span>
        )}
      </div>

      {showOtp && (
        <div style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 16, padding: '14px 16px' }}>
          <strong style={{ display: 'block', fontSize: 26, letterSpacing: '0.12em', color: '#fff' }}>{rideOtp}</strong>
          <p style={{ margin: '6px 0 0', color: '#bfdbfe', fontSize: 12.5, lineHeight: 1.5 }}>Your driver uses this code to start the ride.</p>
          {onShowOtp && <button type="button" className={actionClass} style={{ ...actionStyle, marginTop: 10, background: 'transparent' }} onClick={onShowOtp}>View trip code</button>}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {onMessage && <button type="button" className={actionClass} style={actionStyle} onClick={onMessage}>Message driver</button>}
        {onCall && <button type="button" className={actionClass} style={actionStyle} onClick={onCall}>Call driver</button>}
        {onShare && <button type="button" className={actionClass} style={actionStyle} onClick={onShare}>Share ride</button>}
        {onEmergency && <button type="button" className="bg-surface-raised" style={emergencyStyle} onClick={onEmergency}>Emergency help</button>}
      </div>
    </section>
  );
}
