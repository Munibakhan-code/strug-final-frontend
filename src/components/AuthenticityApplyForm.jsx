import React from "react";
import { grantSellerCapability } from "../api/realestate";

/**
 * Optional professional details for realtor / precon sellers.
 * Capabilities are granted immediately — this is not a KYC / review gate.
 */
export default function AuthenticityApplyForm({ flagKey, color, onClose, onSubmitted }) {
  const isRealtor = flagKey === "is_realtor";
  const [sellerType, setSellerType] = React.useState(isRealtor ? "agent" : "developer");
  const [form, setForm] = React.useState({
    phone: "",
    license_number: "",
    brokerage_name: "",
    company_name: "",
    registration_number: "",
    project_address: "",
    notes: "",
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const payload = {
        seller_type: sellerType,
        phone: form.phone || undefined,
        notes: form.notes || undefined,
      };
      if (isRealtor && sellerType === "agent") {
        if (!form.license_number.trim() || !form.brokerage_name.trim()) {
          setError("License number and brokerage name are required for agents.");
          setLoading(false);
          return;
        }
        payload.license_number = form.license_number.trim();
        payload.brokerage_name = form.brokerage_name.trim();
      }
      if (!isRealtor) {
        if (!form.company_name.trim() && !form.project_address.trim()) {
          setError("Provide a company name or project address.");
          setLoading(false);
          return;
        }
        payload.company_name = form.company_name.trim() || undefined;
        payload.registration_number = form.registration_number.trim() || undefined;
        payload.project_address = form.project_address.trim() || undefined;
      }
      const res = await grantSellerCapability(flagKey, payload);
      onSubmitted?.(res?.data || res);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Could not submit application");
    } finally {
      setLoading(false);
    }
  }

  const fieldClassName = "bg-bg border border-border text-text-primary";
  const fieldStyle = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };
  const labelClassName = "text-text-secondary";
  const labelStyle = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 6,
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        // Modal scrim — stays a dark dimming overlay regardless of theme (consistent with
        // every other modal backdrop in the app).
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border border-border"
        style={{
          width: "min(460px, 100%)",
          borderRadius: 18,
          padding: "28px 26px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          className="text-text-primary"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: 26,
            margin: "0 0 6px",
            textTransform: "uppercase",
          }}
        >
          {isRealtor ? "Seller profile" : "Developer profile"}
        </h3>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20, lineHeight: 1.55 }}>
          Add a few details about your business. You can publish listings right away — no review wait.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {(isRealtor
            ? [
                { id: "agent", label: "Licensed agent" },
                { id: "individual", label: "Owner / FSBO" },
              ]
            : [
                { id: "developer", label: "Developer" },
                { id: "company", label: "Builder company" },
              ]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSellerType(opt.id)}
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 10,
                border: `1px solid ${sellerType === opt.id ? color : "var(--color-border)"}`,
                background: sellerType === opt.id ? `${color}22` : "var(--color-surface-raised)",
                // Active text uses the accent color (not white) — its background is a translucent
                // accent tint that can render very light in light theme, so fixed white would disappear.
                color: sellerType === opt.id ? color : "var(--color-text-secondary)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className={labelClassName} style={labelStyle}>Phone</label>
            <input className={fieldClassName} style={fieldStyle} value={form.phone} onChange={set("phone")} placeholder="+1 …" />
          </div>
          {isRealtor && sellerType === "agent" && (
            <>
              <div>
                <label className={labelClassName} style={labelStyle}>License number</label>
                <input className={fieldClassName} style={fieldStyle} value={form.license_number} onChange={set("license_number")} />
              </div>
              <div>
                <label className={labelClassName} style={labelStyle}>Brokerage name</label>
                <input className={fieldClassName} style={fieldStyle} value={form.brokerage_name} onChange={set("brokerage_name")} />
              </div>
            </>
          )}
          {!isRealtor && (
            <>
              <div>
                <label className={labelClassName} style={labelStyle}>Company name</label>
                <input className={fieldClassName} style={fieldStyle} value={form.company_name} onChange={set("company_name")} />
              </div>
              <div>
                <label className={labelClassName} style={labelStyle}>Registration # (optional)</label>
                <input className={fieldClassName} style={fieldStyle} value={form.registration_number} onChange={set("registration_number")} />
              </div>
              <div>
                <label className={labelClassName} style={labelStyle}>Project / sales address</label>
                <input className={fieldClassName} style={fieldStyle} value={form.project_address} onChange={set("project_address")} />
              </div>
            </>
          )}
          {isRealtor && sellerType === "individual" && (
            <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Individual listings go live with an Unverified label. Staff can later mark a listing Verified.
            </p>
          )}
          <div>
            <label className={labelClassName} style={labelStyle}>Notes (optional)</label>
            <textarea className={fieldClassName} style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={set("notes")} />
          </div>
        </div>

        {error && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", margin: "14px 0 0" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px",
              background: color,
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Saving…" : "Start listing"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-raised border border-border text-text-secondary"
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
