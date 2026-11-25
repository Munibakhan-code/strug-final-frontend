import { useState } from 'react';
import { AddressAutocomplete } from '../shared.jsx';
import PickupConfidence from './PickupConfidence.jsx';
import RideOptionList from './RideOptionList.jsx';
import { validateCustomRideOffer, validateRideSchedule } from '../../utils/rideshareRiderExperience.js';
import { useViewport } from '../../hooks/useViewport.js';
import i18n from '../../i18n/index.js';

const card = {
  borderRadius: 22, padding: 20,
  boxShadow: '0 16px 32px -22px var(--color-shadow)',
};
const cardClass = 'bg-surface-raised border border-border';
const button = {
  minHeight: 44, borderRadius: 999, border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)', padding: '9px 16px', cursor: 'pointer', fontWeight: 700,
};
const buttonSolid = { ...button, background: '#2563eb', color: '#fff', border: '1px solid #2563eb' };
const input = {
  width: '100%', minHeight: 44, boxSizing: 'border-box', borderRadius: 12,
  border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', padding: '10px 14px',
};
const sectionLabel = {
  display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 10,
};
const notice = {
  margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#bfdbfe',
  background: 'rgba(37,99,235,0.16)', borderRadius: 12, padding: '10px 12px',
};
const chip = {
  background: 'transparent',
  borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};

function formatSavedPlace(place) {
  return [place?.street, place?.city, place?.country].filter(Boolean).join(', ');
}

function SavedPlaceChips({ places, onPick }) {
  if (!Array.isArray(places) || places.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {places.map((place) => (
        <button
          key={place.address_id ?? place.id ?? place.label}
          type="button"
          className="border border-border text-text-secondary"
          style={chip}
          onClick={() => onPick(formatSavedPlace(place))}
        >{place.label}</button>
      ))}
    </div>
  );
}

export default function RideBookingPanel({
  pickup = '', dropoff = '', setPickup, setDropoff, savedPlaces = [], routeMeta, confidence,
  stops = [], setStops,
  onConfirmPickup, timing = 'now', setTiming, scheduleDate = '', setScheduleDate,
  scheduleTime = '', setScheduleTime, options = [], selectedId, onSelect,
  priceMode = 'standard', setPriceMode, userPrice = '', setUserPrice,
  referralCode = '', setReferralCode, onConfirm,
  scheduleValidation, fareStatus = 'idle',
} = {}) {
  const { isMobile } = useViewport();
  const [referralOpen, setReferralOpen] = useState(false);
  const effectiveSchedule = scheduleValidation ?? validateRideSchedule({ timing, scheduleDate, scheduleTime });
  const customOffer = validateCustomRideOffer(userPrice);
  const customFare = customOffer.amount;
  const customValid = priceMode !== 'setprice' || customOffer.valid;
  const displayOptions = Array.isArray(options) ? options.map((option) => priceMode === 'setprice'
    ? { ...option, total: customValid ? customFare : null, breakdown: null, recommended: false }
    : option) : [];
  const selected = displayOptions.find((option) => option?.id === selectedId);
  const standardFare = Number.isFinite(selected?.total) ? selected.total : null;
  const fare = priceMode === 'setprice' && customValid ? customFare : standardFare;
  const confidenceBlocked = confidence?.blocksBooking === true;
  const routeResolved = ['OK', 'SUCCESS'].includes(String(routeMeta?.status || '').toUpperCase())
    && Number(routeMeta?.distanceKm) > 0 && Number(routeMeta?.durationMin) > 0;
  const stopsValid = stops.every((stop) => String(stop?.address || '').trim());
  const canConfirm = routeResolved && stopsValid && Number.isFinite(fare) && customValid && !confidenceBlocked && effectiveSchedule.valid;
  let blockedReason = '';
  if (!routeResolved) blockedReason = 'Confirm a valid pickup and dropoff route.';
  else if (!stopsValid) blockedReason = 'Enter every stop address or remove empty stops.';
  else if (confidenceBlocked) blockedReason = 'Confirm your pickup before booking.';
  else if (!effectiveSchedule.valid && effectiveSchedule.reason === 'schedule_incomplete') blockedReason = 'Choose a schedule date and time.';
  else if (!effectiveSchedule.valid && effectiveSchedule.reason === 'schedule_past') blockedReason = 'Choose a future time for your ride.';
  else if (!effectiveSchedule.valid) blockedReason = 'Enter a valid schedule date and time.';
  else if (!customValid) blockedReason = 'Enter an offer of at least $1.00';
  else if (!Number.isFinite(fare) && fareStatus === 'pending') blockedReason = 'Updating fare…';
  else if (!Number.isFinite(fare) && fareStatus === 'error') blockedReason = 'Fare estimate unavailable. Try the route again.';
  else if (!Number.isFinite(fare)) blockedReason = 'Choose a route to get a fare.';
  const vehicleLabel = selected?.label || 'ride';
  const actionLabel = Number.isFinite(fare)
    ? `Confirm ${vehicleLabel} · $${fare.toFixed(2)}`
    : 'Fare unavailable';
  const updateStop = (index, value) => {
    setStops?.((current) => current.map((stop, i) => (i === index ? { ...stop, address: value } : stop)));
  };
  const removeStop = (index) => {
    setStops?.((current) => current.filter((_, i) => i !== index).map((stop, i) => ({ ...stop, sequence: i + 1 })));
  };
  const addStop = () => {
    setStops?.((current) => current.length >= 5 ? current : [...current, { sequence: current.length + 1, address: '' }]);
  };

  return (
    <section aria-label="Book a ride" className="text-text-primary" style={{ display: 'grid', gap: 12, fontFamily: '"DM Sans", sans-serif' }}>
      {fareStatus === 'pending' && <span role="status" aria-label="Updating fare" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Updating fare…</span>}

      <div className={cardClass} style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: '50%', background: '#5cb98a', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="text-text-secondary" style={sectionLabel}>Pickup</span>
            <AddressAutocomplete inputId="ride-pickup" ariaLabel="Pickup" value={pickup} onChange={setPickup} useLocation placeholder="Pickup location" inputStyle={input} />
            <SavedPlaceChips places={savedPlaces} onPick={setPickup} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="text-text-secondary" style={sectionLabel}>Drop-off</span>
            <AddressAutocomplete inputId="ride-dropoff" ariaLabel="Dropoff" value={dropoff} onChange={setDropoff} placeholder="Drop-off location" inputStyle={input} />
            <SavedPlaceChips places={savedPlaces} onPick={setDropoff} />
          </div>
        </div>
        <button
          type="button"
          style={{
            ...button, marginTop: 10, display: 'inline-flex',
            alignItems: 'center', gap: 8, padding: '8px 14px',
          }}
          onClick={() => { setPickup?.(dropoff); setDropoff?.(pickup); }}
        ><span aria-hidden="true">⇅</span> {i18n.t('rideshare.swapRoute')}</button>
        {stops.length > 0 && (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {stops.map((stop, index) => (
              <div key={stop.sequence ?? index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  <span className="text-text-secondary" style={{ ...sectionLabel, marginBottom: 0 }}>Stop {index + 1}</span>
                  <AddressAutocomplete
                    inputId={`ride-stop-${index}`}
                    ariaLabel={`Stop ${index + 1}`}
                    value={stop.address || ''}
                    onChange={(value) => updateStop(index, value)}
                    placeholder="Add stop address"
                    inputStyle={input}
                  />
                </label>
                <button type="button" onClick={() => removeStop(index)} style={{ ...button, minHeight: 44, padding: '8px 12px' }}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={stops.length >= 5}
          onClick={addStop}
          style={{ ...button, marginTop: 10, opacity: stops.length >= 5 ? 0.55 : 1 }}
        >
          Add stop
        </button>
        {Number(routeMeta?.durationMin) > 0 && Number(routeMeta?.distanceKm) > 0 && (
          <p className="text-text-secondary" style={{ fontSize: 13, margin: '12px 0 0' }}>{Number(routeMeta.durationMin)} min · {Number(routeMeta.distanceKm)} km</p>
        )}
      </div>

      <PickupConfidence confidence={confidence} onConfirmPickup={onConfirmPickup} />

      <div className={cardClass} style={card}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" style={{ ...(timing === 'now' ? buttonSolid : button), flex: 1 }} aria-pressed={timing === 'now'} onClick={() => setTiming?.('now')}>Right now</button>
          <button type="button" style={{ ...(timing === 'schedule' ? buttonSolid : button), flex: 1 }} aria-pressed={timing === 'schedule'} onClick={() => setTiming?.('schedule')}>Schedule</button>
        </div>
        {timing === 'schedule' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <input aria-label="Schedule date" type="date" value={scheduleDate} onChange={(event) => setScheduleDate?.(event.target.value)} style={input} />
            <input aria-label="Schedule time" type="time" value={scheduleTime} onChange={(event) => setScheduleTime?.(event.target.value)} style={input} />
          </div>
        )}
      </div>

      <div className={cardClass} style={{ ...card, padding: isMobile ? '14px 12px' : 20, borderRadius: isMobile ? 16 : 22 }}>
        <span className="text-text-secondary" style={{ ...sectionLabel, marginBottom: isMobile ? 8 : 10 }}>Choose your ride</span>
        <RideOptionList options={displayOptions} selectedId={selectedId} onSelect={onSelect} />
      </div>

      <div className={cardClass} style={card}>
        <span className="text-text-secondary" style={sectionLabel}>Price</span>
        <p className="text-text-secondary" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>
          {Number.isFinite(standardFare) ? `Happy with $${standardFare.toFixed(2)}, or want to offer your own price?` : 'Want to offer your own price instead?'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" style={{ ...(priceMode !== 'setprice' ? buttonSolid : button), flex: 1 }} onClick={() => setPriceMode?.('standard')}>Use this fare</button>
          <button type="button" style={{ ...(priceMode === 'setprice' ? buttonSolid : button), flex: 1 }} onClick={() => setPriceMode?.('setprice')}>Set your own</button>
        </div>
        {priceMode === 'setprice' && (
          <>
            <input aria-label="Your price" type="number" min="1" value={userPrice} onChange={(event) => setUserPrice?.(event.target.value)} style={{ ...input, marginTop: 10 }} />
            <p style={notice}>Offering less may take a little longer to match — that's okay, we'll keep looking.</p>
          </>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-expanded={referralOpen}
        onClick={() => setReferralOpen((open) => !open)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setReferralOpen((open) => !open); } }}
        className="text-text-secondary bg-surface-raised"
        style={{
          border: '1.5px dashed var(--color-border)', borderRadius: 18, padding: '14px 18px', cursor: 'pointer',
          fontSize: 13.5, fontWeight: 600,
        }}
      >
        {referralOpen ? 'Referral code' : <>Have a referral code? <span style={{ color: '#60a5fa' }}>Add it here</span></>}
        {referralOpen && (
          <input
            aria-label="Referral code"
            value={referralCode}
            onChange={(event) => setReferralCode?.(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            style={{ ...input, marginTop: 10 }}
          />
        )}
      </div>

      <div className={cardClass} style={card}>
        {blockedReason && <p role="status" style={{ color: '#fca5a5', margin: '0 0 12px', fontSize: 13.5 }}>{blockedReason}</p>}
        <button
          type="button"
          disabled={!canConfirm}
          aria-label={actionLabel}
          onClick={() => canConfirm && onConfirm?.()}
          style={{
            width: '100%', appearance: 'none', border: 'none', background: '#2563eb', color: '#fff',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 15, padding: 16, borderRadius: 999,
            cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5,
            boxShadow: canConfirm ? '0 12px 24px -10px rgba(37,99,235,0.55)' : 'none',
          }}
        >{actionLabel}</button>
      </div>
    </section>
  );
}
