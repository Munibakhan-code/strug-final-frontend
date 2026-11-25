import React, { useState, useEffect } from 'react';
import i18n from '../../i18n/index.js';
import { useViewport } from '../../hooks/useViewport.js';
import { Skel } from '../skeletons.jsx';
import { getFreelanceReviews } from '../../api/freelance-reviews.js';

const DIG_SVC_PACKAGES = (service) => {
  const tiers = [
    { tier: "BASIC", label: "Basic" },
    { tier: "STANDARD", label: "Standard" },
    { tier: "PREMIUM", label: "Premium" },
  ];

  return tiers.map(t => {
    const pkg = service.packages?.find(p => p.package_type === t.tier);
    return {
      tier: t.label,
      price: pkg?.price || service.price,
      delivery: pkg?.delivery_days || service.deliveryDays,
      desc: pkg?.description || `${t.label} package for ${service.title}`,
      includes: pkg?.features || ["Core deliverables", "1 revision"],
      revisions: pkg?.revisions || 1,
    };
  });
};

export const FreelanceGigDetail = ({ service, onBack, onOrder, isMobile }) => {
  const loading = false;
  const [selPkg, setSelPkg] = useState(0);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactMsg, setContactMsg] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsFetched, setReviewsFetched] = useState(false);
  
  const packages = DIG_SVC_PACKAGES(service);

  useEffect(() => {
    const fetchReviews = async () => {
      if (reviewsFetched) return;
      if (!service.id) return;
      if (!service.totalReviews && !service.reviews) {
        setReviewsFetched(true);
        setReviewsLoading(false);
        return;
      }

      try {
        setReviewsLoading(true);
        const response = await getFreelanceReviews(service.id);
        if (response?.successful && Array.isArray(response.data)) {
          setReviews(response.data);
        } else {
          setReviews([]);
        }
      } catch (error) {
        console.error('Failed to fetch reviews:', error);
        setReviews([]);
      } finally {
        setReviewsLoading(false);
        setReviewsFetched(true);
      }
    };
    fetchReviews();
  }, [service.id, service.totalReviews, service.reviews, reviewsFetched]);

  const bannerImage = service.images?.[0] || service.thumb;

  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48 }}>
      <div style={{ maxWidth: 1060, margin: "0 auto", width: "100%", paddingBottom: 24 }}>
        <button
          onClick={onBack}
          className="text-text-secondary"
          style={{
            marginTop: 24,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            padding: 0,
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Digital Services
        </button>

        {/* Banner */}
        <div
          style={{
            width: "100%",
            height: 200,
            borderRadius: 18,
            marginBottom: 24,
            overflow: "hidden",
            background: service.thumb,
            flexShrink: 0,
          }}
        >
          {bannerImage && bannerImage.startsWith('http') ? (
            <img
              src={bannerImage}
              alt={service.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: service.thumb }} />
          )}
        </div>

        {/* Category badge */}
        {service.Freelance_Category && (
          <span
            style={{
              display: "inline-block",
              background: "rgba(37,99,235,0.15)",
              border: "1px solid rgba(37,99,235,0.3)",
              borderRadius: 6,
              padding: "3px 10px",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              color: "#60a5fa",
              marginBottom: 10,
            }}
          >
            {service.Freelance_Category}
          </span>
        )}

        {/* Title row */}
        <h2
          className="text-text-primary"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            marginBottom: 8,
            lineHeight: 1.2,
          }}
        >
          {service.title}
        </h2>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: service.thumb,
              flexShrink: 0,
            }}
          />
          <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>
            {service.freelancer_profile?.display_name || "Freelancer"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#f59e0b", fontSize: 14 }}>★</span>
            <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
              {service.averageRating || 0}
            </span>
            <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
              ({service.totalReviews || 0} reviews)
            </span>
          </div>
          <button
            onClick={() => setContactOpen(v => !v)}
            className="bg-surface-raised border border-border text-text-secondary"
            style={{
              marginLeft: "auto",
              borderRadius: 10,
              padding: "8px 18px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {i18n.t("automotive.contactSeller")}
          </button>
        </div>

        {/* Contact panel */}
        {contactOpen && (
          <div
            className="bg-surface"
            style={{
              border: "1px solid rgba(37,99,235,0.25)",
              borderRadius: 14,
              padding: "18px 20px",
              marginBottom: 24,
              maxWidth: 600,
            }}
          >
            {contactSent ? (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#059669", textAlign: "center", padding: "8px 0" }}>
                Message sent! They'll reply shortly.
              </p>
            ) : (
              <>
                <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
                  Message {service.freelancer_profile?.display_name || "Freelancer"}
                </p>
                <textarea
                  value={contactMsg}
                  onChange={e => setContactMsg(e.target.value)}
                  rows={3}
                  placeholder={i18n.t("digservices.contactPlaceholder")}
                  className="bg-surface-raised border border-border text-text-primary"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    resize: "none",
                    outline: "none",
                    marginBottom: 12,
                  }}
                />
                <button
                  onClick={() => { if (!contactMsg.trim()) return; setContactSent(true); }}
                  style={{
                    background: "#2563eb",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 22px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {i18n.t("common.sendMessage")}
                </button>
              </>
            )}
          </div>
        )}

        {/* Two-column layout */}
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Left: about + reviews */}
          <div style={{ flex: 2, minWidth: 280 }}>
            <div
              className="bg-surface border border-border-subtle"
              style={{
                borderRadius: 14,
                padding: "20px 22px",
                marginBottom: 24,
              }}
            >
              <p
                className="text-text-primary"
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}
              >
                {i18n.t("digservices.aboutService")}
              </p>
              <p
                className="text-text-secondary"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 15,
                  lineHeight: 1.75,
                }}
              >
                {service.description}
              </p>
              {service.Freelance_SubCategory && (
                <div style={{ marginTop: 12 }}>
                  <span
                    className="bg-surface-raised text-text-secondary"
                    style={{
                      borderRadius: 6,
                      padding: "4px 12px",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                    }}
                  >
                    Sub-category: {service.Freelance_SubCategory}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", gap: 24, marginTop: 18, flexWrap: "wrap" }}>
                {[
                  { label: "Category", value: service.Freelance_Category || "Various" },
                  { label: "Avg. Response", value: "< 2 hrs" },
                  { label: "Status", value: service.status || "Active" },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 2 }}>
                      {item.label}
                    </p>
                    <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Reviews */}
            <div
              className="bg-surface border border-border-subtle"
              style={{
                borderRadius: 14,
                padding: "20px 22px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <p
                  className="text-text-primary"
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {i18n.t("books.tabReviews")}
                </p>
                <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                  ({service.totalReviews || 0})
                </span>
              </div>
              {reviewsLoading ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                    Loading reviews...
                  </p>
                </div>
              ) : (service.totalReviews || 0) === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                    No reviews yet. Be the first to review this service!
                  </p>
                </div>
              ) : reviews.length === 0 && reviewsFetched ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                    No reviews yet. Be the first to review this service!
                  </p>
                </div>
              ) : (
                reviews.map((r, i) => {
                  const buyerUser = r.buyer_profile?.user || {};
                  const socialProfiles = buyerUser.social_profiles || {};
                  const displayName = socialProfiles.display_name || buyerUser.name || buyerUser.username || "Anonymous";
                  const avatar = displayName.charAt(0).toUpperCase();
                  const colors = ["#2563eb", "#db2777", "#059669", "#7c3aed", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"];
                  const color = colors[i % colors.length];
                  return (
                    <div key={r.id} style={{ paddingBottom: 16, marginBottom: 16, borderBottom: i < reviews.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 700,
                            fontSize: 12,
                            color: "#fff",
                            flexShrink: 0,
                          }}
                        >
                          {avatar}
                        </div>
                        <div>
                          <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                            {displayName}
                          </p>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#f59e0b", fontSize: 12 }}>
                              {"★".repeat(Math.min(r.rating || 0, 5))}
                            </span>
                            <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
                              {new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.6, paddingLeft: 48 }}>
                        {r.review}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: packages */}
          <div style={{ flex: 1, minWidth: 240, position: "sticky", top: 0 }}>
            <div
              className="bg-surface border border-border"
              style={{
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", borderBottom: "1px solid var(--color-border-subtle)" }}>
                {packages.map((p, i) => (
                  <button
                    key={p.tier}
                    onClick={() => setSelPkg(i)}
                    style={{
                      flex: 1,
                      padding: "12px 8px",
                      background: selPkg === i ? "rgba(37,99,235,0.12)" : "none",
                      border: "none",
                      borderBottom: `2px solid ${selPkg === i ? "#2563eb" : "transparent"}`,
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 600,
                      fontSize: 13,
                      // Was a hardcoded rgba(255,255,255,0.55) — invisible once the card
                      // behind it (now var(--color-surface)) goes near-white in light theme.
                      color: selPkg === i ? "#60a5fa" : "var(--color-text-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {p.tier}
                  </button>
                ))}
              </div>
              <div style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28 }}>
                    ${packages[selPkg].price}
                  </span>
                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, paddingTop: 8 }}>
                    {packages[selPkg].delivery}-day delivery
                  </span>
                </div>
                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                  {packages[selPkg].desc}
                </p>
                <div style={{ marginBottom: 20 }}>
                  {packages[selPkg].includes.map(item => (
                    <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                  {packages[selPkg].revisions && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 4v6h6" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                      <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
                        {packages[selPkg].revisions} revisions included
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onOrder({ ...service, price: packages[selPkg].price, tier: packages[selPkg].tier, delivery: packages[selPkg].delivery })}
                  style={{
                    width: "100%",
                    background: "#2563eb",
                    border: "none",
                    borderRadius: 12,
                    padding: "14px 0",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#fff",
                    cursor: "pointer",
                    marginBottom: 10,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.target.style.background = "#1d4ed8"}
                  onMouseLeave={e => e.target.style.background = "#2563eb"}
                >
                  Continue — ${packages[selPkg].price}
                </button>
                <button
                  onClick={() => setContactOpen(v => !v)}
                  className="bg-surface-raised border border-border text-text-secondary"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    padding: "12px 0",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {i18n.t("automotive.contactSeller")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};