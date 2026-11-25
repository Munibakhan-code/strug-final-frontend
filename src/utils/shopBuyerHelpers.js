/**
 * Shop buyer helpers — cart, ratings, orders, search (Phase 6).
 */

/** Match shop name or any product name/description/category. */
export function shopMatchesBuyerQuery(shop, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  if (String(shop?.name ?? '').toLowerCase().includes(q)) return true;
  const products = Array.isArray(shop?.products) ? shop.products : [];
  return products.some((p) => {
    const hay = [p?.name, p?.description, p?.category]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Map API product_cart row → FoodCartPage / Shop cart line. */
export function mapProductCartToLine(row) {
  const listing = row?.product_variation?.product_listing;
  const variation = row?.product_variation;
  const price = parseFloat(variation?.price ?? row?.total ?? 0) || 0;
  const qty = Number(row?.qty) || 1;
  const unitPrice = qty > 0 && row?.total != null
    ? (parseFloat(row.total) || price * qty) / qty
    : price;
  return {
    id: listing?.listing_id ?? variation?.listing_id ?? row?.variation_id,
    lineId: listing?.listing_id ?? row?.cart_id ?? row?.variation_id,
    cart_id: row?.cart_id ?? null,
    variation_id: row?.variation_id ?? variation?.variation_id ?? null,
    seller_id: row?.seller_id ?? null,
    name: listing?.name ?? 'Product',
    title: listing?.name ?? 'Product',
    price: unitPrice,
    qty,
    image_url: listing?.image_url ?? variation?.image_url ?? null,
    thumb: listing?.image_url ?? null,
    extras: [],
    product_type_id: row?.product_type_id
      ?? variation?.product_type_id
      ?? listing?.product_type_id
      ?? null,
  };
}

export function mapProductCartRowsToLines(rows) {
  return (Array.isArray(rows) ? rows : []).map(mapProductCartToLine);
}

/** Build POST /product-cart body for one UI cart line. */
export function buildAddToCartPayload({
  item,
  buyerId,
  sellerId,
  productTypeId = null,
  qty,
}) {
  const q = Number(qty ?? item?.qty) || 1;
  const unit = parseFloat(item?.price) || 0;
  const typeId = productTypeId ?? item?.product_type_id ?? null;
  return {
    seller_id: Number(sellerId ?? item?.seller_id),
    buyer_id: Number(buyerId),
    variation_id: item?.variation_id != null ? Number(item.variation_id) : null,
    qty: q,
    total: unit * q,
    ...(typeId != null ? { product_type_id: Number(typeId) } : {}),
  };
}

/** Merge local add into existing cart lines (by variation_id or lineId). */
export function mergeCartLine(cart, item, qty = 1) {
  const list = Array.isArray(cart) ? [...cart] : [];
  const key = item?.variation_id != null
    ? `v:${item.variation_id}`
    : `l:${item?.lineId ?? item?.id}`;
  const idx = list.findIndex((c) => {
    const ck = c?.variation_id != null
      ? `v:${c.variation_id}`
      : `l:${c?.lineId ?? c?.id}`;
    return ck === key;
  });
  if (idx >= 0) {
    list[idx] = { ...list[idx], qty: (list[idx].qty || 0) + qty };
    return list;
  }
  return [
    ...list,
    {
      ...item,
      qty,
      lineId: item?.lineId ?? item?.id,
      extras: item?.extras ?? [],
      gradient: item?.thumb ?? item?.gradient,
    },
  ];
}

/** Map API product_ratings row → buyer review card.
 * No date — product_ratings schema has no timestamp column. */
export function mapProductRatingToReview(row) {
  const buyer = row?.user_product_ratings_buyer_idTouser
    || row?.buyer
    || row?.user
    || {};
  const stars = Number(row?.rating) || 0;
  const rawDate = row?.created_at ?? row?.date ?? null;
  let date = "";
  if (rawDate) {
    try {
      date = new Date(rawDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      date = String(rawDate).slice(0, 10);
    }
  }
  return {
    id: row?.rating_id ?? row?.id,
    name: buyer?.name || buyer?.username || row?.buyer_name || 'Buyer',
    rating: stars,
    stars,
    comment: row?.feedback || row?.comment || '',
    text: row?.feedback || row?.comment || '',
    order_id: row?.order_id ?? null,
    date,
    created_at: rawDate,
    reply: row?.reply || row?.seller_reply || null,
  };
}

export function averageSellerRating(ratings) {
  const list = Array.isArray(ratings) ? ratings : [];
  if (!list.length) return null;
  const sum = list.reduce((s, r) => s + (Number(r?.rating ?? r?.stars) || 0), 0);
  return Math.round((sum / list.length) * 10) / 10;
}

/** Normalize GET /product-order/buyer row for Account order history. */
export function normalizeBuyerProductOrder(o, fallbackTitle = 'Product order') {
  const listing = o?.product_variation?.product_listing;
  const seller =
    o?.user_product_order_seller_idTouser?.name
    || o?.user_product_order_seller_idTouser?.username
    || o?.seller_name
    || o?.seller?.name
    || '—';
  const rawDate = o?.date || o?.order_time || o?.created_at || null;
  const dateStr = rawDate ? String(rawDate).split('T')[0] : '—';
  return {
    id: `#PO-${o?.order_id ?? o?.id}`,
    _rawId: o?.order_id ?? o?.id ?? null,
    title: listing?.name || o?.listing_name || o?.product_name || fallbackTitle,
    seller,
    amount: `$${parseFloat(o?.total ?? o?.total_amount ?? o?.amount ?? 0).toFixed(2)}`,
    status: o?.status ?? 'pending',
    date: dateStr,
    rating: null,
    deliveryTime: '—',
    type: 'product',
    trackable: true,
  };
}

/** Build POST /product-ratings body after shop order tracking. */
export function buildProductRatingPayload({
  sellerId,
  orderId,
  buyerId,
  rating,
  feedback,
  productTypeId = null,
}) {
  return {
    seller_id: Number(sellerId),
    order_id: orderId != null ? Number(orderId) : null,
    buyer_id: Number(buyerId),
    rating: Number(rating),
    feedback: feedback || null,
    ...(productTypeId != null ? { product_type_id: Number(productTypeId) } : {}),
  };
}
