// utils/freelance-mappers.js

export function mapGigToService(gig) {
  const freelancer = gig.freelancer_profile || {};
  const user = freelancer.user || {};
  const packages = gig.packages || [];

  const categoryColors = {
    "Programming & Tech": "linear-gradient(135deg,#0c1a2e,#2563eb)",
    "Graphics & Design": "linear-gradient(135deg,#1e1b4b,#7c3aed)",
    "Writing & Translation": "linear-gradient(135deg,#052e16,#16a34a)",
    "Digital Marketing": "linear-gradient(135deg,#1c1917,#f59e0b)",
    "Video & Animation": "linear-gradient(135deg,#1a0a00,#ef4444)",
    "Music & Audio": "linear-gradient(135deg,#0f172a,#06b6d4)",
  };

  const thumb = categoryColors[gig.Freelance_Category] || "linear-gradient(135deg,#13151c,#2563eb)";

  let bestPrice = 0;
  let bestDeliveryDays = 7;
  packages.forEach(pkg => {
    if (pkg.price > bestPrice) {
      bestPrice = pkg.price;
    }
    if (pkg.delivery_days && pkg.delivery_days < bestDeliveryDays) {
      bestDeliveryDays = pkg.delivery_days;
    }
  });

  return {
    id: gig.id,
    title: gig.title,
    seller: freelancer.display_name || user.name || "Freelancer",
    rating: gig.averageRating || 0,
    reviews: gig.totalReviews || 0,
    price: bestPrice || packages[0]?.price || 0,
    deliveryDays: bestDeliveryDays || packages[0]?.delivery_days || 7,
    thumb: thumb,
    description: gig.description,
    category: gig.Freelance_Category,
    subCategory: gig.Freelance_SubCategory,
    images: gig.images || [],
    packages: packages,
    freelancer: freelancer,
    status: gig.status,
    created_at: gig.created_at,
    averageRating: gig.averageRating || 0,
    totalReviews: gig.totalReviews || 0,
  };
}