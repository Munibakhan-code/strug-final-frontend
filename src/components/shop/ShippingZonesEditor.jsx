import React, { useEffect, useState } from 'react';
import { getMyShippingZones, saveMyShippingZones } from '../../api/shop.js';

const emptyRow = () => ({
  name: '',
  country: '',
  city: '',
  fee: '',
  priority: 100,
  is_active: true,
});

/**
 * Thin seller editor for country/city shipping zones.
 * Used on Shop (and Books) store profile — pricing copy stays in prep_time.shippingInfo.
 */
export function ShippingZonesEditor() {
  const [rows, setRows] = useState([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMyShippingZones()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.zones) ? data.zones : [];
        setRows(
          list.length
            ? list.map((z) => ({
                name: z.name || '',
                country: z.country || '',
                city: z.city || '',
                fee: z.fee != null ? String(z.fee) : '',
                priority: z.priority ?? 100,
                is_active: z.is_active !== false,
              }))
            : [emptyRow()],
        );
      })
      .catch(() => {
        if (!cancelled) setRows([emptyRow()]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateRow(i, patch) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function onSave() {
    setSaving(true);
    setMsg('');
    try {
      const payload = rows
        .filter((r) => String(r.country || '').trim())
        .map((r, i) => ({
          name: r.name,
          country: r.country,
          city: r.city || null,
          fee: parseFloat(r.fee),
          priority: Number(r.priority) || 100 + i,
          is_active: r.is_active !== false,
        }));
      const saved = await saveMyShippingZones(payload);
      const list = Array.isArray(saved?.zones) ? saved.zones : payload;
      setRows(
        list.length
          ? list.map((z) => ({
              name: z.name || '',
              country: z.country || '',
              city: z.city || '',
              fee: z.fee != null ? String(z.fee) : '',
              priority: z.priority ?? 100,
              is_active: z.is_active !== false,
            }))
          : [emptyRow()],
      );
      setMsg('Shipping zones saved.');
    } catch (err) {
      setMsg(err?.response?.data?.error || 'Could not save shipping zones.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
        Loading shipping zones…
      </p>
    );
  }

  return (
    <div
      className="border border-border"
      style={{
        marginTop: 28,
        padding: 18,
        borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <h3
        className="text-text-primary"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Shipping zones
      </h3>
      <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
        Local buyers (near your store) keep driver delivery. Everyone else is charged the matching
        country/city zone fee at checkout. Leave city blank for a whole-country rate.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 1fr 0.7fr auto',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <input
              value={row.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
              placeholder="Label (optional)"
              className={inputClass}
              style={inputStyle}
            />
            <input
              value={row.country}
              onChange={(e) => updateRow(i, { country: e.target.value })}
              placeholder="Country *"
              className={inputClass}
              style={inputStyle}
            />
            <input
              value={row.city}
              onChange={(e) => updateRow(i, { city: e.target.value })}
              placeholder="City (optional)"
              className={inputClass}
              style={inputStyle}
            />
            <input
              value={row.fee}
              onChange={(e) => updateRow(i, { fee: e.target.value })}
              placeholder="Fee"
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setRows((prev) => (prev.length <= 1 ? [emptyRow()] : prev.filter((_, j) => j !== i)))}
              className={btnGhostClass}
              style={btnGhost}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])} className={btnGhostClass} style={btnGhost}>
          Add zone
        </button>
        <button type="button" onClick={onSave} disabled={saving} style={btnPrimary}>
          {saving ? 'Saving…' : 'Save zones'}
        </button>
        {msg && (
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: msg.includes('saved') ? '#34d399' : '#f87171', alignSelf: 'center' }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 8,
  padding: '8px 10px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  outline: 'none',
};
const inputClass = 'border border-border text-text-primary';

const btnGhost = {
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 8,
  padding: '8px 12px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
const btnGhostClass = 'border border-border text-text-primary';

const btnPrimary = {
  background: '#2563eb',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  color: '#fff',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

export default ShippingZonesEditor;
