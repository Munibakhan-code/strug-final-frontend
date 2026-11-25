function offerDetails(offer) {
  const route = offer.from && offer.to
    ? `${offer.from} → ${offer.to}`
    : offer.from || offer.to || null;
  const fare = offer.fare != null && Number.isFinite(Number(offer.fare))
    ? `$${Number(offer.fare).toFixed(2)}`
    : null;
  return [route, fare].filter(Boolean).join(' · ') || 'Open the request to see the details.';
}

export function buildOfferToast(offer, { accept, decline, view } = {}) {
  if (!offer) return null;
  const isRide = offer.vertical === 'rideshare' && offer.rideId !== null;
  return {
    key: `offer:${offer.key}`,
    title: offer.title || 'Incoming offer',
    body: offerDetails(offer),
    vertical: offer.vertical,
    persistent: true,
    actions: isRide
      ? [
          { id: 'accept', label: 'Accept', run: () => accept?.(offer) },
          { id: 'decline', label: 'Decline', run: () => decline?.(offer) },
        ]
      : [
          { id: 'view', label: 'View', run: () => view?.(offer) },
          { id: 'dismiss', label: 'Dismiss', run: () => decline?.(offer) },
        ],
  };
}
