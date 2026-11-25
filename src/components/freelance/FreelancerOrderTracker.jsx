import React, { useState, useEffect } from 'react';
import i18n from '../../i18n/index.js';
import { useViewport } from '../../hooks/useViewport.js';
import { getUser } from '../../store/auth.js';
import { getMyFreelanceOrders, cancelFreelanceOrder, completeFreelanceOrder, createFreelanceReview } from '../../api/freelance-orders.js';

// Order detail modal
function OrderDetailModal({ order, onClose }) {
  const { isMobile } = useViewport();
  
  if (!order) return null;
  
  const freelancer = order.freelancer_profile || {};
  const user = freelancer.user || {};
  const gig = order.gig || {};
  
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-surface border border-border"
        style={{
          borderRadius: 20,
          padding: isMobile ? '20px' : '32px',
          maxWidth: 560,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, margin: 0 }}>
            Order Details
          </h3>
          <button
            onClick={onClose}
            className="text-text-secondary"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Gig Info */}
        <div style={{ marginBottom: 16 }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Gig
          </p>
          <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700 }}>
            {gig.title || 'N/A'}
          </p>
        </div>

        {/* Freelancer */}
        <div style={{ marginBottom: 16 }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Freelancer
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, color: '#fff' }}>
              {(freelancer.display_name || user.name || 'F').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600 }}>
                {freelancer.display_name || user.name || 'Freelancer'}
              </p>
              {freelancer.country && (
                <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
                  {freelancer.country}
                </p>
              )}
            </div>
          </div>
          {freelancer.freelance_bio && (
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              {freelancer.freelance_bio}
            </p>
          )}
          {freelancer.skills && freelancer.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {freelancer.skills.map((skill, idx) => (
                <span key={idx} className="bg-surface-raised text-text-secondary" style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11 }}>
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Package & Price */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Package
            </p>
            <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600 }}>
              {order.package_type || 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Price
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: '#22c55e' }}>
              ${order.price || '0'}
            </p>
          </div>
        </div>

        {/* Requirements */}
        {order.requirements && (
          <div style={{ marginBottom: 16 }}>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Requirements
            </p>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6 }}>
              {order.requirements}
            </p>
          </div>
        )}

        {/* Files */}
        {order.requirement_files && order.requirement_files.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Attachments
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {order.requirement_files.map((file, idx) => (
                <a
                  key={idx}
                  href={file}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(37,99,235,0.12)',
                    border: '1px solid rgba(37,99,235,0.25)',
                    borderRadius: 8,
                    color: '#60a5fa',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  📎 File {idx + 1}
                </a>
              ))}
            </div>
          </div>
        )}
        
        {/* Status */}
        <div style={{ marginBottom: 16 }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Status
          </p>
          <span style={{
            padding: '4px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            background: order.status === 'COMPLETED' ? 'rgba(34,197,94,0.15)' : order.status === 'CANCELLED' ? 'rgba(239,68,68,0.15)' : order.status === 'DELIVERED' ? 'rgba(96,165,250,0.15)' : order.status === 'IN_PROGRESS' ? 'rgba(96,165,250,0.15)' : 'rgba(245,158,11,0.15)',
            color: order.status === 'COMPLETED' ? '#22c55e' : order.status === 'CANCELLED' ? '#ef4444' : order.status === 'DELIVERED' ? '#60a5fa' : order.status === 'IN_PROGRESS' ? '#60a5fa' : '#f59e0b',
          }}>
            {order.status || 'PENDING'}
          </span>
          {order.completed_at && (
            <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 4 }}>
              Completed: {new Date(order.completed_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Contact Seller Button */}
        <button
          className="bg-surface-raised border border-border text-text-secondary"
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Contact Seller
        </button>
      </div>
    </div>
  );
}

// Review Modal
function ReviewModal({ order, onClose, onSubmit }) {
  const { isMobile } = useViewport();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!review.trim()) return;
    setLoading(true);
    try {
      await onSubmit(order.id, rating, review);
      setSubmitted(true);
      setTimeout(() => {
        onClose();
        setSubmitted(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to submit review:', err);
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(6px)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="bg-surface"
          style={{
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 20,
            padding: '40px',
            maxWidth: 400,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
            Review Submitted!
          </h3>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
            Thank you for your feedback. Your review has been sent successfully.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(6px)',
        zIndex: 1001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-surface border border-border"
        style={{
          borderRadius: 20,
          padding: isMobile ? '20px' : '32px',
          maxWidth: 480,
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 16 }}>
          Leave a Review
        </h3>

        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 16 }}>
          How was your experience with this freelancer?
        </p>

        {/* Rating Stars */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 32,
                cursor: 'pointer',
                // Was a hardcoded rgba(255,255,255,0.15) — an "empty star" fixed that faint
                // is invisible in light theme; border token flips correctly with theme.
                color: star <= rating ? '#f59e0b' : 'var(--color-border)',
                transition: 'color 0.15s',
              }}
            >
              ★
            </button>
          ))}
        </div>

        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Share your experience with this freelancer..."
          rows={4}
          className="bg-surface-raised border border-border text-text-primary"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 14px',
            borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            resize: 'vertical',
            outline: 'none',
            marginBottom: 16,
          }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            className="bg-surface-raised border border-border-subtle text-text-secondary"
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 10,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !review.trim()}
            style={{
              flex: 1,
              padding: '12px',
              background: '#2563eb',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading || !review.trim() ? 'default' : 'pointer',
              opacity: loading || !review.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Order Tracker Component
export function FreelancerOrderTracker({ color = '#2563eb' }) {
  const { isMobile } = useViewport();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reviewOrder, setReviewOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await getMyFreelanceOrders();
      if (res.successful && res.data) {
        setOrders(res.data);
      }
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await cancelFreelanceOrder(orderId);
      if (res.successful) {
        await loadOrders();
      }
    } catch (err) {
      console.error('Failed to cancel order:', err);
    }
    setActionLoading(prev => ({ ...prev, [orderId]: false }));
  };

  const handleCompleteOrder = async (orderId) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await completeFreelanceOrder(orderId);
      if (res.successful) {
        await loadOrders();
        // Show review modal after completion
        const completedOrder = orders.find(o => o.id === orderId);
        if (completedOrder) {
          setReviewOrder(completedOrder);
        }
      }
    } catch (err) {
      console.error('Failed to complete order:', err);
    }
    setActionLoading(prev => ({ ...prev, [orderId]: false }));
  };

  const handleSubmitReview = async (orderId, rating, reviewText) => {
    const res = await createFreelanceReview({
      order_id: orderId,
      rating,
      review: reviewText,
    });
    if (res.successful) {
      await loadOrders();
    }
    return res;
  };

  const getStatusColor = (status) => {
    const colors = {
      'PENDING': '#f59e0b',
      'IN_PROGRESS': '#60a5fa',
      'DELIVERED': '#8b5cf6',
      'COMPLETED': '#22c55e',
      'CANCELLED': '#ef4444',
    };
    return colors[status] || 'var(--color-text-muted)';
  };

  const getStatusBg = (status) => {
    const bg = {
      'PENDING': 'rgba(245,158,11,0.15)',
      'IN_PROGRESS': 'rgba(96,165,250,0.15)',
      'DELIVERED': 'rgba(139,92,246,0.15)',
      'COMPLETED': 'rgba(34,197,94,0.15)',
      'CANCELLED': 'rgba(239,68,68,0.15)',
    };
    return bg[status] || 'var(--color-surface-raised)';
  };

  if (loading) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center' }}>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
          Loading your orders...
        </p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div className="bg-surface-raised" style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
        </div>
        <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
          No Orders Yet
        </p>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
          You haven't placed any orders yet. Browse gigs and get started!
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {orders.length} Order{orders.length > 1 ? 's' : ''}
        </p>
      </div>

      {orders.map((order) => {
        const freelancer = order.freelancer_profile || {};
        const user = freelancer.user || {};
        const gig = order.gig || {};
        const hasReview = order.review !== null && order.review !== undefined;
        const isDelivered = order.status === 'DELIVERED' && !order.is_completed;
        const isCompleted = order.status === 'COMPLETED' || order.is_completed;
        const isPending = order.status === 'PENDING';
        const isCancelled = order.status === 'CANCELLED';

        return (
          <div
            key={order.id}
            className="bg-surface border border-border-subtle"
            style={{
              borderRadius: 14,
              padding: isMobile ? '14px 16px' : '18px 22px',
              marginBottom: 12,
              cursor: 'pointer',
            }}
            onClick={() => setSelectedOrder(order)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  {gig.title || 'Gig'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                    {freelancer.display_name || user.name || 'Freelancer'}
                  </span>
                  <span className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>·</span>
                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                    {order.package_type || 'Standard'}
                  </span>
                </div>
                <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: 2 }}>
                  ${order.price || '0'} · {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                <span style={{
                  padding: '3px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  background: getStatusBg(order.status),
                  color: getStatusColor(order.status),
                }}>
                  {order.status || 'PENDING'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 12 }}>
              {/* {
              isPending && !isCancelled && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleCancelOrder(order.id); }}
                  disabled={actionLoading[order.id]}
                  style={{
                    padding: '6px 14px',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 8,
                    color: '#ef4444',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    fontWeight: 600, 
                    cursor: 'pointer',
                    opacity: actionLoading[order.id] ? 0.6 : 1,
                  }}
                >
                  {actionLoading[order.id] ? '...' : 'Cancel Order'}
                </button>
              )} */}

              {isDelivered && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleCompleteOrder(order.id); }}
                  disabled={actionLoading[order.id]}
                  style={{
                    padding: '6px 14px',
                    background: 'rgba(34,197,94,0.15)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: 8,
                    color: '#22c55e',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: actionLoading[order.id] ? 0.6 : 1,
                  }}
                >
                  {actionLoading[order.id] ? '...' : 'Complete Order'}
                </button>
              )}

              {isCompleted && !hasReview && (
                <button
                  onClick={(e) => { e.stopPropagation(); setReviewOrder(order); }}
                  style={{
                    padding: '6px 14px',
                    background: 'rgba(245,158,11,0.15)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 8,
                    color: '#f59e0b',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Write Review
                </button>
              )}

              {hasReview && (
                <span style={{
                  padding: '6px 14px',
                  background: 'rgba(34,197,94,0.08)',
                  borderRadius: 8,
                  color: '#34d399',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  ⭐ {order.review.rating}/5 · Reviewed
                </span>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }}
                className="bg-surface-raised border border-border-subtle text-text-secondary"
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginLeft: 'auto',
                }}
              >
                View Details
              </button>
            </div>
          </div>
        );
      })}

      {/* Modals */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {reviewOrder && (
        <ReviewModal
          order={reviewOrder}
          onClose={() => setReviewOrder(null)}
          onSubmit={handleSubmitReview}
        />
      )}
    </div>
  );
}