import React from 'react';

export const FreelanceGigCard = ({ gig, onClick }) => {
  const freelancer = gig.freelancer_profile || {};
  const user = freelancer.user || {};
  const packages = gig.packages || [];

  // Get the best price and delivery days
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

  // Category placeholder thumbnails shown when a gig has no cover image — stay dark
  // gradients regardless of theme (mirrors Hub.jsx's hero treatment), so the category
  // badge/tag colors below read consistently over them.
  const categoryColors = {
    "Programming & Tech": "linear-gradient(135deg,#0c1a2e,#2563eb)",
    "Graphics & Design": "linear-gradient(135deg,#1e1b4b,#7c3aed)",
    "Writing & Translation": "linear-gradient(135deg,#052e16,#16a34a)",
    "Digital Marketing": "linear-gradient(135deg,#1c1917,#f59e0b)",
    "Video & Animation": "linear-gradient(135deg,#1a0a00,#ef4444)",
    "Music & Audio": "linear-gradient(135deg,#0f172a,#06b6d4)",
  };

  const thumb = categoryColors[gig.Freelance_Category] || "linear-gradient(135deg,#13151c,#2563eb)";

  return (
    <div
      onClick={onClick}
      className="bg-surface-raised border border-border-subtle"
      style={{
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}
    >
      <div style={{ width: "100%", height: 140, background: thumb, overflow: "hidden", flexShrink: 0 }}>
        {gig.images?.[0] ? (
          <img
            src={gig.images[0]}
            alt={gig.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : null}
      </div>
      <div style={{ padding: "16px" }}>
        {gig.Freelance_Category && (
          <span
            style={{
              display: "inline-block",
              background: "rgba(37,99,235,0.12)",
              borderRadius: 4,
              padding: "1px 8px",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 9,
              fontWeight: 600,
              color: "#60a5fa",
              marginBottom: 6,
            }}
          >
            {gig.Freelance_Category}
          </span>
        )}
        <p
          className="text-text-primary"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 15,
            marginBottom: 6,
            lineHeight: 1.35,
          }}
        >
          {gig.title}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ color: "#f59e0b", fontSize: 13 }}>★</span>
          <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
            {gig.averageRating || 0} ({gig.totalReviews || 0})
          </span>
          <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
            · {freelancer.display_name || user.name || "Freelancer"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
            Delivery in {bestDeliveryDays || 7}d
          </span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#60a5fa" }}>
            From ${bestPrice || packages[0]?.price || 0}
          </span>
        </div>
        {freelancer.country && (
          <div className="text-text-muted" style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
            {freelancer.country}
          </div>
        )}
      </div>
    </div>
  );
};