/**
 * Food-order rating helpers — map API rows for the seller Reviews tab / Overview KPI.
 */

/** Normalize GET /food/vendor/:id/ratings row → SellerReviewsTab card shape. */
export function mapFoodOrderRatingToReview(row) {
  const buyer = row?.buyer || row?.user || row?.customer || {};
  const stars = Number(row?.rating ?? row?.stars) || 0;
  const comment = row?.comment ?? row?.review ?? row?.feedback ?? row?.text ?? "";
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
      date = String(rawDate);
    }
  }
  return {
    id: row?.food_order_rating_id ?? row?.rating_id ?? row?.id ?? row?.food_order_id,
    name: buyer?.name || buyer?.username || row?.buyer_name || row?.customer_name || "Customer",
    rating: stars,
    stars,
    comment,
    text: comment,
    date,
    created_at: rawDate,
    order_id: row?.food_order_id ?? row?.order_id ?? null,
    reply: row?.reply || row?.seller_reply || row?.vendor_reply || null,
  };
}

/** Overview Avg Rating label from vendor summary fields. */
export function formatVendorAvgRating(vendorOrRating, reviewCount) {
  let avg;
  let count;
  if (vendorOrRating != null && typeof vendorOrRating === "object" && !Array.isArray(vendorOrRating)) {
    avg = vendorOrRating.rating ?? vendorOrRating.avg_rating ?? vendorOrRating.average_rating;
    count = vendorOrRating.review_count ?? vendorOrRating.reviews_count ?? vendorOrRating.rating_count;
  } else {
    avg = vendorOrRating;
    count = reviewCount;
  }
  const n = Number(avg);
  if (!Number.isFinite(n)) return "—";
  const countMissing = count == null || count === "";
  const c = Number(count);
  // Explicit review_count=0 => no reviews yet.
  if (!countMissing && Number.isFinite(c) && c <= 0) return "—";
  // Missing review_count but rating present (some BE payloads) => still show avg.
  if (countMissing && !(n > 0)) return "—";
  if (!countMissing && !(c > 0)) return "—";
  return (Math.round(n * 10) / 10).toFixed(1);
}

/** Body for POST /food/orders/:id/rating */
export function buildFoodOrderRatingPayload({ rating, comment, driverRating, deliveryMode }) {
  const payload = {
    rating: Number(rating) || 0,
    comment: String(comment || "").trim() || undefined,
  };
  if (deliveryMode !== "pickup" && driverRating > 0) {
    payload.driver_rating = Number(driverRating);
  }
  return payload;
}

/** True when notification payload is a food-order rating event. */
export function isFoodRatingNotification(n) {
  if (!n || typeof n !== "object") return false;
  const type = String(n.type || n.event || "").toLowerCase();
  const entityType = String(n.entity_type || n.entityType || "").toLowerCase();
  return (
    type === "food_order_rating"
    || type === "food.rating"
    || type === "food_rating"
    || type === "order.rated"
    || entityType === "food_order_rating"
    || entityType === "food-order-rating"
  );
}
