import i18n from '../../i18n/index.js';

const LEVELS = {
  high: {
    icon: '✓',
    titleKey: 'pickupConfidenceHigh',
    color: '#5cb98a',
    background: 'rgba(92, 185, 138, 0.12)',
  },
  medium: {
    icon: '~',
    titleKey: 'pickupConfidenceMedium',
    color: '#e0a355',
    background: 'rgba(224, 163, 85, 0.14)',
  },
  low: {
    icon: '!',
    titleKey: 'pickupConfidenceLow',
    color: '#fca5a5',
    background: 'rgba(239, 68, 68, 0.12)',
  },
  unknown: {
    icon: '?',
    titleKey: 'pickupConfidenceUnknown',
    color: '#b9ada2',
    background: 'rgba(185, 173, 162, 0.1)',
  },
};

const REASON_KEYS = {
  route_unresolved: 'pickupReasonRouteUnresolved',
  no_nearby_drivers: 'pickupReasonNoDrivers',
  limited_supply: 'pickupReasonLimitedSupply',
  good_supply: 'pickupReasonGoodSupply',
  availability_unknown: 'pickupReasonUnknown',
};

export default function PickupConfidence({ confidence, onConfirmPickup } = {}) {
  const level = LEVELS[confidence?.level] ? confidence.level : 'unknown';
  const state = LEVELS[level];
  const reason = i18n.t(`rideshare.${REASON_KEYS[confidence?.reason] || 'pickupReasonFallback'}`);
  const canConfirm = level === 'low'
    && confidence?.reason === 'route_unresolved'
    && typeof onConfirmPickup === 'function';

  return (
    <div
      role="status"
      aria-live="polite"
      className="text-text-primary"
      style={{
        display: 'grid',
        gap: 8,
        padding: 14,
        border: `1px solid ${state.color}55`,
        borderRadius: 18,
        background: state.background,
        fontFamily: '"DM Sans", sans-serif',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: state.color, fontWeight: 800 }}>
        <span aria-hidden="true">{state.icon}</span>
        <span>{i18n.t(`rideshare.${state.titleKey}`)}</span>
      </div>
      <span className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.4 }}>{reason}</span>
      {canConfirm && (
        <button
          type="button"
          onClick={onConfirmPickup}
          style={{
            minHeight: 44,
            padding: '10px 14px',
            border: '1px solid #2563eb',
            borderRadius: 999,
            background: '#2563eb',
            color: '#fff',
            font: 'inherit',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {i18n.t('rideshare.confirmPickup')}
        </button>
      )}
    </div>
  );
}
