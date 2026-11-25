import { useState } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { createTipIntent, confirmTip } from '../../api/rideshare.js';
import i18n from '../../i18n/index.js';

const TAG_KEYS = ['feedbackGreatPickup', 'feedbackSafeDriving', 'feedbackCleanVehicle', 'feedbackEasyToFind'];

const card = {
  borderRadius: 22, padding: 20,
  fontFamily: '"DM Sans", sans-serif',
};
const cardClass = 'bg-surface-raised border border-border text-text-primary';
const rowLabel = { fontSize: 12, marginRight: 6 };
const buttonStyle = {
  minHeight: 44, padding: '10px 16px', borderRadius: 999, cursor: 'pointer',
  border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)',
  font: '700 13.5px/1 "DM Sans", sans-serif',
};
const primaryButtonStyle = { ...buttonStyle, background: '#2563eb', border: '1px solid #2563eb', color: '#fff' };
const tagSelectedStyle = { ...buttonStyle, background: 'rgba(37,99,235,0.17)', border: '1px solid #3b82f6', color: '#fff' };
const textareaStyle = {
  width: '100%', minHeight: 88, boxSizing: 'border-box', borderRadius: 12, resize: 'vertical',
  padding: '10px 14px',
  font: '400 13.5px/1.5 "DM Sans", sans-serif',
};
const textareaClass = 'border border-border bg-surface text-text-primary';

const TIP_PRESETS = [2, 5, 10];

export function TipCard({ tripId, driverName }) {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [showCard, setShowCard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [tippedAmount, setTippedAmount] = useState(null);

  if (tripId == null) return null;
  if (tippedAmount != null) {
    return (
      <div className={cardClass} style={card}>
        <p style={{ margin: 0, color: '#5cb98a', fontWeight: 700, fontSize: 14 }}>
          Thanks! You tipped {driverName || 'your driver'} ${tippedAmount.toFixed(2)}.
        </p>
      </div>
    );
  }

  const effectiveAmount = amount === 'custom' ? Number(customAmount) : amount;
  const amountValid = Number.isFinite(effectiveAmount) && effectiveAmount >= 1 && effectiveAmount <= 100;

  const startCardEntry = () => {
    if (!amountValid) { setError('Choose or enter a tip amount between $1 and $100.'); return; }
    setError(null);
    setShowCard(true);
  };

  const submitTip = async () => {
    if (!stripe || !elements) { setError('Payment form is still loading.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { clientSecret, paymentIntentId } = await createTipIntent(tripId, effectiveAmount);
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });
      if (result.error) { setError(result.error.message); setSubmitting(false); return; }
      const piId = result.paymentIntent?.id ?? paymentIntentId;
      await confirmTip(tripId, piId);
      setTippedAmount(effectiveAmount);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not add tip. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cardClass} style={card}>
      <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Tip {driverName || 'your driver'}</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {TIP_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            style={amount === preset ? tagSelectedStyle : buttonStyle}
            onClick={() => { setAmount(preset); setShowCard(false); }}
          >${preset}</button>
        ))}
        <button
          type="button"
          style={amount === 'custom' ? tagSelectedStyle : buttonStyle}
          onClick={() => { setAmount('custom'); setShowCard(false); }}
        >Custom</button>
      </div>
      {amount === 'custom' && (
        <input
          aria-label="Custom tip amount"
          type="number"
          min="1"
          max="100"
          placeholder="Amount"
          value={customAmount}
          onChange={(event) => setCustomAmount(event.target.value)}
          className={textareaClass}
          style={{ ...textareaStyle, minHeight: 44, marginBottom: 10 }}
        />
      )}
      {!showCard && (
        <button type="button" style={{ ...primaryButtonStyle, width: '100%' }} onClick={startCardEntry} disabled={amount == null}>
          Add tip
        </button>
      )}
      {showCard && (
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Kept permanently dark: Stripe's CardElement renders in a cross-origin iframe whose
              text color is set via this JS options object, not CSS — it can't resolve our
              var(--color-*) custom properties, so the box and its white text must stay a fixed
              matched pair regardless of theme. */}
          <div style={{ border: '1px solid #332a24', borderRadius: 12, background: '#14100e', padding: '12px 14px' }}>
            <CardElement options={{ style: { base: { color: '#fff', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', '::placeholder': { color: 'rgba(255,255,255,0.3)' } }, invalid: { color: '#f87171' } } }} />
          </div>
          <button type="button" style={{ ...primaryButtonStyle, width: '100%', opacity: submitting ? 0.6 : 1 }} disabled={submitting} onClick={submitTip}>
            {submitting ? 'Processing…' : `Pay $${Number.isFinite(effectiveAmount) ? effectiveAmount.toFixed(2) : ''} tip`}
          </button>
        </div>
      )}
      {error && <p role="alert" style={{ margin: '10px 0 0', color: '#fca5a5', fontSize: 13 }}>{error}</p>}
    </div>
  );
}

export function TripReceiptSummary({ receipt }) {
  if (!receipt) return null;
  const total = Number.isFinite(Number(receipt.total))
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: receipt.currency || 'CAD' }).format(Number(receipt.total))
    : '—';
  return (
    <section aria-label="Trip receipt" className={cardClass} style={{ ...card, display: 'grid', gap: 10 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>Trip Receipt</h2>
      <div style={{ display: 'grid', gap: 6 }}>
        {receipt.rideId != null && <p style={{ margin: 0, fontSize: 13.5 }}><span className="text-text-secondary" style={rowLabel}>Ride ID</span>#{receipt.rideId}</p>}
        {receipt.tripId != null && <p style={{ margin: 0, fontSize: 13.5 }}><span className="text-text-secondary" style={rowLabel}>Trip ID</span>#{receipt.tripId}</p>}
        {receipt.completedAtLabel && <p style={{ margin: 0, fontSize: 13.5 }}><span className="text-text-secondary" style={rowLabel}>Completed</span>{receipt.completedAtLabel}</p>}
        {receipt.driverName && <p style={{ margin: 0, fontSize: 13.5 }}><span className="text-text-secondary" style={rowLabel}>Driver</span>{receipt.driverName}</p>}
        {receipt.vehicleType && <p style={{ margin: 0, fontSize: 13.5 }}><span className="text-text-secondary" style={rowLabel}>Vehicle</span>{receipt.vehicleType}</p>}
        {Number.isFinite(receipt.distanceKm) && <p style={{ margin: 0, fontSize: 13.5 }}><span className="text-text-secondary" style={rowLabel}>Distance</span>{receipt.distanceKm.toFixed(2)} km</p>}
        {receipt.paymentMethod && receipt.paymentMethod !== '—' && <p style={{ margin: 0, fontSize: 13.5 }}><span className="text-text-secondary" style={rowLabel}>Payment</span>{receipt.paymentMethod}</p>}
      </div>
      <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
        <p className="text-text-secondary" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: 0, fontSize: 13 }}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: '#5cb98a', flexShrink: 0, marginTop: 4 }} />
          {receipt.pickup}
        </p>
        <p className="text-text-secondary" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: 0, fontSize: 13 }}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: 4 }} />
          {receipt.dropoff}
        </p>
      </div>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>Total paid: {total}</p>
      <p className="text-text-secondary" style={{ margin: 0, fontSize: 12 }}>A receipt was also sent to your email on file.</p>
    </section>
  );
}

export default function RideCompletionPanel({ receipt, rating = 0, onRatingChange, selectedTags = [], onToggleTag, comment = '', onCommentChange, submitting = false, error, rated = false, onSubmit, onRebook, onReport, onViewHistory }) {
  const tags = TAG_KEYS.map((key) => i18n.t(`rideshare.${key}`));
  return (
    <section aria-label="Completed ride" style={{ display: 'grid', gap: 12 }}>
      <TripReceiptSummary receipt={receipt} />
      {receipt?.tripId != null && <TipCard tripId={receipt.tripId} driverName={receipt.driverName} />}
      {rated ? (
        <p role="status" style={{ margin: 0, color: '#5cb98a', fontWeight: 700, fontSize: 14 }}>Thanks for your feedback.</p>
      ) : (
        <div className={cardClass} style={{ ...card, display: 'grid', gap: 12 }}>
          <div role="radiogroup" aria-label="Rate your driver" style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                className="border border-border bg-surface-raised"
                style={{
                  minHeight: 44, minWidth: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 20,
                  color: star <= rating ? '#e0a355' : 'var(--color-text-secondary)',
                }}
                onClick={() => onRatingChange?.(star)}
              >★</button>
            ))}
          </div>
          <div aria-label="Feedback tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={selectedTags.includes(tag)}
                style={selectedTags.includes(tag) ? tagSelectedStyle : buttonStyle}
                onClick={() => onToggleTag?.(tag)}
              >{tag}</button>
            ))}
          </div>
          <label className="text-text-secondary" style={{ display: 'grid', gap: 6, fontSize: 12.5 }}>
            Comment
            <textarea aria-label="Comment" value={comment} onChange={(event) => onCommentChange?.(event.target.value)} className={textareaClass} style={textareaStyle} />
          </label>
          {error && <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: 13.5 }}>{error}</p>}
          <button type="button" style={{ ...primaryButtonStyle, opacity: rating < 1 || submitting ? 0.5 : 1, cursor: rating < 1 || submitting ? 'not-allowed' : 'pointer' }} disabled={rating < 1 || submitting} onClick={onSubmit}>
            {submitting ? 'Submitting…' : 'Submit rating'}
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" style={primaryButtonStyle} onClick={onRebook}>{i18n.t('rideshare.bookAgain')}</button>
        {onReport && <button type="button" style={buttonStyle} onClick={onReport}>{i18n.t('rideshare.reportIssue')}</button>}
      </div>
      {onViewHistory && (
        <button
          type="button"
          onClick={onViewHistory}
          style={{ width: '100%', padding: '6px 0 0', background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          {i18n.t('rideshare.viewOrderHistory', { defaultValue: 'View in Order History →' })}
        </button>
      )}
    </section>
  );
}
