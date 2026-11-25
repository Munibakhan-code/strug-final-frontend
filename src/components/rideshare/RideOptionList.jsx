import { useRef } from 'react';
import i18n from '../../i18n/index.js';
import { useViewport } from '../../hooks/useViewport.js';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function pickupCopy(pickupRange) {
  if (
    !pickupRange
    || typeof pickupRange !== 'object'
    || Array.isArray(pickupRange)
    || !Number.isFinite(pickupRange.min)
    || !Number.isFinite(pickupRange.max)
    || pickupRange.min < 0
    || pickupRange.max < pickupRange.min
  ) {
    return 'Pickup time unavailable';
  }

  return `${pickupRange.min}–${pickupRange.max} min pickup`;
}

function idKey(id) {
  if (typeof id === 'string' && id.trim()) return `string:${id}`;
  if (typeof id === 'number' && Number.isFinite(id)) return `number:${id}`;
  return null;
}

function validOptions(options) {
  if (!Array.isArray(options)) return [];

  const seen = new Set();
  return options.filter((option) => {
    if (!option || typeof option !== 'object') return false;
    const key = idKey(option.id);
    if (key === null || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function RideOptionList({ options = [], selectedId, onSelect, disabled = false } = {}) {
  const { isMobile } = useViewport();
  const safeOptions = validOptions(options);
  const radioRefs = useRef(new Map());

  const enabledOptions = safeOptions.filter((option) => !disabled && Number.isFinite(option.total));
  const selectedEnabled = enabledOptions.some((option) => option.id === selectedId);
  const tabbableId = selectedEnabled ? selectedId : enabledOptions[0]?.id;

  const selectAdjacent = (currentId, direction) => {
    if (enabledOptions.length === 0) return;
    const currentIndex = enabledOptions.findIndex((option) => option.id === currentId);
    const nextIndex = (currentIndex + direction + enabledOptions.length) % enabledOptions.length;
    const nextOption = enabledOptions[nextIndex];
    radioRefs.current.get(idKey(nextOption.id))?.focus();
    if (typeof onSelect === 'function') onSelect(nextOption.id);
  };

  return (
    <div
      role="radiogroup"
      aria-label={i18n.t('rideshare.chooseRide')}
      style={{ display: 'grid', gap: isMobile ? 8 : 10, fontFamily: '"DM Sans", sans-serif' }}
    >
      {safeOptions.map((option) => {
        const validTotal = Number.isFinite(option.total);
        const optionDisabled = disabled || !validTotal;
        const selected = option.id === selectedId;
        const label = typeof option.label === 'string' && option.label.trim()
          ? option.label
          : 'Ride option';
        const seats = Number.isFinite(option.seats) ? `${option.seats} seats` : 'Seats unavailable';
        const key = idKey(option.id);

        return (
          <button
            key={key}
            ref={(node) => {
              if (node) radioRefs.current.set(key, node);
              else radioRefs.current.delete(key);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={optionDisabled}
            tabIndex={!optionDisabled && option.id === tabbableId ? 0 : -1}
            onClick={() => {
              if (!optionDisabled && typeof onSelect === 'function') onSelect(option.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                selectAdjacent(option.id, 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                selectAdjacent(option.id, -1);
              }
            }}
            className="text-text-primary"
            style={{
              width: '100%',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? 10 : 14,
              padding: isMobile ? '10px 12px' : '12px 16px',
              border: `1.5px solid ${selected ? '#3b82f6' : 'var(--color-border)'}`,
              borderRadius: isMobile ? 14 : 18,
              background: selected ? 'rgba(37,99,235,0.17)' : 'var(--color-surface-raised)',
              cursor: optionDisabled ? 'not-allowed' : 'pointer',
              opacity: optionDisabled ? 0.55 : 1,
              font: 'inherit',
              textAlign: 'left',
              overflowWrap: 'anywhere',
              minWidth: 0,
              position: 'relative',
              boxSizing: 'border-box',
            }}
          >
            {option.recommended === true && (
              <span
                style={{
                  position: 'absolute', top: -9, left: isMobile ? 12 : 16, background: '#2563eb', color: '#fff',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', padding: '3px 9px', borderRadius: 999,
                }}
              >
                Recommended
              </span>
            )}
            <span aria-hidden="true" style={{
              width: isMobile ? 34 : 42, height: isMobile ? 34 : 42, borderRadius: '50%', background: 'rgba(37,99,235,0.18)', color: '#60a5fa',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width={isMobile ? 18 : 22} height={isMobile ? 11 : 13} viewBox="0 0 34 20" fill="none"><rect x="1" y="5" width="32" height="9" rx="4.5" fill="currentColor" /><circle cx="9" cy="16" r="3.4" fill="var(--color-surface-raised)" /><circle cx="25" cy="16" r="3.4" fill="var(--color-surface-raised)" /></svg>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: isMobile ? 14 : 15.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              {typeof option.desc === 'string' && option.desc && (
                <span className="text-text-secondary" style={{ display: 'block', marginTop: 2, fontSize: isMobile ? 11.5 : 12.5 }}>{option.desc}</span>
              )}
              <span className="text-text-secondary" style={{ display: 'block', marginTop: 4, fontSize: isMobile ? 11 : 11.5 }}>{seats} · {pickupCopy(option.pickupRange)}</span>
              {Number.isFinite(option.breakdown?.trip_fare) && Number.isFinite(option.breakdown?.service_fee) && (
                <span className="text-text-muted" style={{ display: 'block', marginTop: 2, fontSize: isMobile ? 10 : 10.5 }}>
                  {money.format(option.breakdown.trip_fare)} fare + {money.format(option.breakdown.service_fee)} fee
                </span>
              )}
            </span>
            <span style={{
              fontWeight: validTotal ? 800 : 700,
              fontSize: validTotal ? (isMobile ? 14.5 : 16.5) : (isMobile ? 10.5 : 13),
              color: validTotal ? 'inherit' : 'var(--color-text-secondary)',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}>
              {validTotal ? money.format(option.total) : 'Fare unavailable'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
