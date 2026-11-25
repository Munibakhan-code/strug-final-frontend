import React, { useState, useEffect, useCallback } from 'react';
import { useViewport } from '../../hooks/useViewport.js';
import { getMyFreelanceGigs, deleteFreelanceGig, updateFreelanceGigStatus } from '../../api/freelance-gig.js';
import { getFreelanceCategories, getFreelanceSubcategories } from '../../api/freelancer-categories.js';
import { FreelanceGigForm } from './FreelanceGigForm.jsx';
import { SellerAddBtn } from '../shared.jsx';

export const FreelanceGigsManager = ({ color = "#2563eb" }) => {
  const { isMobile } = useViewport();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGigModal, setShowGigModal] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [gigDialog, { confirm: confirmDelete }] = useDialog();
  const [gigsLoading, setGigsLoading] = useState(false);

  // Declared before the mount effect that calls it — the effect used to reference this binding
  // from inside its temporal dead zone.
  const loadGigs = useCallback(async () => {
    setGigsLoading(true);
    try {
      const res = await getMyFreelanceGigs();
      if (res.successful && res.data) {
        setGigs(res.data);
      }
    } catch (err) {
      console.error('Failed to load gigs:', err);
    }
    setGigsLoading(false);
  }, []);

  useEffect(() => {
    loadGigs();
  }, [loadGigs]);

  const handleDelete = async (gig) => {
    const confirmed = await confirmDelete({
      title: "Delete Gig",
      message: `Are you sure you want to delete "${gig.title}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;

    try {
      const result = await deleteFreelanceGig(gig.id);
      if (result.successful) {
        setGigs(prev => prev.filter(g => g.id !== gig.id));
      }
    } catch (err) {
      console.error('Failed to delete gig:', err);
    }
  };

  const handleStatusChange = async (gig, newStatus) => {
    try {
      const result = await updateFreelanceGigStatus(gig.id, newStatus);
      if (result.successful) {
        setGigs(prev => prev.map(g => g.id === gig.id ? { ...g, status: result.data.status } : g));
      }
    } catch (err) {
      console.error('Failed to update gig status:', err);
    }
  };

  const statusColors = {
    DRAFT: '#f59e0b',
    ACTIVE: '#22c55e',
    PAUSED: '#f97316',
    DELETED: '#ef4444'
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <input
          placeholder="Search gigs..."
          className="bg-surface border border-border-subtle text-text-primary"
          style={{
            width: 260,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            outline: "none",
          }}
        />
        <SellerAddBtn
          label="Create Gig"
          color={color}
          onClick={() => { setEditingGig(null); setShowGigModal(true); }}
        />

      </div>

      {gigsLoading ? (
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
          Loading gigs...
        </p>
      ) : gigs.length === 0 ? (
        <div className="text-text-muted" style={{ textAlign: "center", padding: "48px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
          No gigs created yet. Click "Create Gig" to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 16 }}>
          {gigs.map((gig) => (
            <div
              key={gig.id}
              className="border border-border-subtle"
              style={{
                background: "linear-gradient(165deg, var(--color-surface-raised), var(--color-surface))",
                borderRadius: 16,
                padding: "18px 20px",
                overflow: "hidden",
              }}
            >
              {gig.images && gig.images.length > 0 && (
                // Image placeholder/letterbox behind the gig cover photo — stays black in
                // both themes like other media containers (mirrors Hub.jsx's hero treatment).
                <div style={{ height: 120, borderRadius: 10, overflow: "hidden", marginBottom: 12, background: "#000" }}>
                  <img src={gig.images[0]} alt={gig.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p className="text-text-primary" style={{ fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
                    {gig.title}
                  </p>
                  <p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                    {gig.Freelance_Category} → {gig.Freelance_SubCategory}
                  </p>
                  <p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
                    {gig.packages?.length || 0} packages · From {gig.packages?.[0]?.price ? `$${gig.packages[0].price}` : '—'}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: (statusColors[gig.status] || "#888") + "22",
                    color: statusColors[gig.status] || "#888",
                    flexShrink: 0,
                  }}
                >
                  {gig.status || 'DRAFT'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setEditingGig(gig); setShowGigModal(true); }}
                  style={{ padding: "6px 12px", background: color + "22", border: "none", borderRadius: 8, color: color, fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                >
                  Edit
                </button>
                {gig.status !== 'ACTIVE' && gig.status !== 'DELETED' && (
                  <button
                    onClick={() => handleStatusChange(gig, 'ACTIVE')}
                    style={{ padding: "6px 12px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, color: "#22c55e", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                  >
                    Publish
                  </button>
                )}
                {gig.status === 'ACTIVE' && (
                  <button
                    onClick={() => handleStatusChange(gig, 'PAUSED')}
                    style={{ padding: "6px 12px", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, color: "#f59e0b", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                  >
                    Pause
                  </button>
                )}
                {gig.status === 'PAUSED' && (
                  <button
                    onClick={() => handleStatusChange(gig, 'ACTIVE')}
                    style={{ padding: "6px 12px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, color: "#22c55e", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => handleDelete(gig)}
                  style={{ padding: "6px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, color: "#ef4444", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gig Modal */}
      {showGigModal && (
        <FreelanceGigForm
          gig={editingGig}
          color={color}
          onClose={() => setShowGigModal(false)}
          onSave={(saved) => {
            if (editingGig) {
              setGigs(prev => prev.map(g => g.id === saved.id ? saved : g));
            } else {
              setGigs(prev => [saved, ...prev]);
            }
            setShowGigModal(false);
          }}
        />
      )}
    </div>
  );
};

// Simple dialog hook placeholder - you can replace with your existing useDialog
function useDialog() {
  const confirm = (options) => {
    return new Promise((resolve) => {
      if (window.confirm(options.message || 'Are you sure?')) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  };
  return [null, { confirm }];
}