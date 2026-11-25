import React, { useEffect, useState } from 'react';
import { isAuthenticated } from '../../store/auth.js';
import {
  addItemToWishlist,
  buildBookingWishlistPayload,
  buildProductWishlistPayload,
  wishlistRefId,
} from '../../utils/wishlistAdd.js';
import {
  ensureWishlistMembership,
  isWishlistMember,
  markWishlistMember,
} from '../../utils/wishlistMembership.js';

/**
 * Compact control to add a shop product or booking listing to the caller's
 * Profile → Wishlist (friends gift / chip in there).
 *
 * props:
 *   item      — product (variation_id) or booking (listingId)
 *   kind      — "product" | "booking"
 *   accent    — button accent color
 *   compact   — icon-only heart (default false = labeled)
 *   label     — override button label
 *   style     — extra style on the button
 */
export default function AddToWishlistButton({
  item,
  kind = 'product',
  accent = '#db2877',
  compact = false,
  label = 'Wishlist',
  style = {},
}) {
  const itemType = kind === 'booking' ? 'booking' : 'product';
  const refId = wishlistRefId(item, kind);

  const [busy, setBusy] = useState(false);
  const [onList, setOnList] = useState(() => (
    refId != null && isWishlistMember(itemType, refId)
  ));
  const [status, setStatus] = useState(null); // 'err' only (success → onList)
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const id = wishlistRefId(item, kind);
    if (id == null || !isAuthenticated()) {
      if (!cancelled) setOnList(false);
      return undefined;
    }
    // Sync from cache immediately (covers remount after add in same session)
    if (isWishlistMember(itemType, id)) {
      setOnList(true);
    }
    ensureWishlistMembership().then(() => {
      if (cancelled) return;
      setOnList(isWishlistMember(itemType, id));
    });
    return () => { cancelled = true; };
  }, [item, kind, itemType, refId]);

  async function handleClick(e) {
    e?.stopPropagation?.();
    if (busy || onList) return;

    if (!isAuthenticated()) {
      setStatus('err');
      setMessage('Please log in to add to your wishlist.');
      return;
    }

    const built = kind === 'booking'
      ? buildBookingWishlistPayload(item)
      : buildProductWishlistPayload(item);

    if (!built.ok) {
      setStatus('err');
      setMessage(built.error);
      return;
    }

    setBusy(true);
    setStatus(null);
    setMessage('');
    const res = await addItemToWishlist(built.payload);
    setBusy(false);
    if (!res.ok) {
      setStatus('err');
      setMessage(res.error);
      return;
    }
    markWishlistMember(built.payload.item_type, built.payload.item_ref_id);
    setOnList(true);
    setMessage('Added — friends can gift it on Profile → Wishlist.');
  }

  const disabled = busy || onList;
  const bg = onList
    ? 'rgba(5,150,105,0.15)'
    : `${accent}18`;
  const border = onList
    ? '1px solid rgba(5,150,105,0.45)'
    : `1px solid ${accent}55`;
  const color = onList ? '#34d399' : accent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: compact ? 'center' : 'stretch', gap: 4 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={onList ? 'On your wishlist' : 'Add to Profile wishlist'}
        aria-label={onList ? 'Already on wishlist' : 'Add to wishlist'}
        style={{
          padding: compact ? 0 : '7px 12px',
          width: compact ? 32 : undefined,
          height: compact ? 32 : undefined,
          borderRadius: compact ? '50%' : 10,
          background: bg,
          border,
          color,
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 12,
          cursor: disabled ? 'default' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: busy ? 0.7 : 1,
          flexShrink: 0,
          ...style,
        }}
      >
        <svg
          width={compact ? 14 : 12}
          height={compact ? 14 : 12}
          viewBox="0 0 24 24"
          fill={onList ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        {!compact && (busy ? '…' : onList ? 'Added' : label)}
      </button>
      {message && (
        <p
          style={{
            margin: 0,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 10,
            lineHeight: 1.35,
            color: status === 'err' ? '#f87171' : 'var(--color-text-muted)',
            maxWidth: compact ? 120 : 180,
            textAlign: compact ? 'center' : 'left',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
