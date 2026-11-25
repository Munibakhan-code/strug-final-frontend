import { useEffect, useState } from "react";
import {
  createPropertyUpdate,
  deletePropertyUpdate,
  getPropertyUpdates,
  updatePropertyUpdate,
  uploadListingPhoto,
} from "../api/realestate";

const fieldLabel = {
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "'DM Sans', sans-serif",
  marginBottom: 5,
};
const fieldLabelClass = "text-text-muted";

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};
const inputClass = "bg-surface-raised border border-border text-text-primary";

const cardStyle = {
  borderRadius: 10,
  padding: 12,
  marginBottom: 10,
};
const cardClass = "bg-surface-raised border border-border";

function emptyIncentive() {
  return { title: "", detail: "", badge: "", expires: "" };
}
function emptyMoveIn() {
  return { address: "", beds: "", baths: "", sqft: "", price: "", status: "Available", eta: "" };
}
function emptyPackage() {
  return { id: "", name: "", tagline: "", price_delta: "", swatches: "", includes: "" };
}

/** Structured editors for Livabl merchandising (replaces raw JSON textareas). */
export function PropertyMerchandisingEditor({ incentives, moveInHomes, designPackages, onChange }) {
  const setIncentives = (next) => onChange({ incentives: next, move_in_homes: moveInHomes, design_packages: designPackages });
  const setMoveIns = (next) => onChange({ incentives, move_in_homes: next, design_packages: designPackages });
  const setPackages = (next) => onChange({ incentives, move_in_homes: moveInHomes, design_packages: next });

  return (
    <div>
      <SectionTitle>Incentives</SectionTitle>
      {(incentives || []).map((row, idx) => (
        <div key={`inc-${idx}`} className={cardClass} style={cardStyle}>
          <Row>
            <Field label="Title" value={row.title} onChange={(v) => setIncentives(patch(incentives, idx, { title: v }))} placeholder="Up to $20k closing costs" />
            <Field label="Badge" value={row.badge} onChange={(v) => setIncentives(patch(incentives, idx, { badge: v }))} placeholder="Limited" />
          </Row>
          <Field label="Detail" value={row.detail} onChange={(v) => setIncentives(patch(incentives, idx, { detail: v }))} placeholder="Credit applied at closing…" />
          <Row>
            <Field label="Expires" value={row.expires} onChange={(v) => setIncentives(patch(incentives, idx, { expires: v }))} placeholder="Jul 31" />
            <RemoveBtn onClick={() => setIncentives(incentives.filter((_, i) => i !== idx))} />
          </Row>
        </div>
      ))}
      <AddBtn onClick={() => setIncentives([...(incentives || []), emptyIncentive()])}>+ Add incentive</AddBtn>

      <SectionTitle style={{ marginTop: 18 }}>Quick move-in homes</SectionTitle>
      {(moveInHomes || []).map((row, idx) => (
        <div key={`mi-${idx}`} className={cardClass} style={cardStyle}>
          <Field label="Unit / address" value={row.address} onChange={(v) => setMoveIns(patch(moveInHomes, idx, { address: v }))} placeholder="Unit 1204" />
          <Row>
            <Field label="Beds" value={row.beds} onChange={(v) => setMoveIns(patch(moveInHomes, idx, { beds: v }))} placeholder="2" />
            <Field label="Baths" value={row.baths} onChange={(v) => setMoveIns(patch(moveInHomes, idx, { baths: v }))} placeholder="2" />
            <Field label="Sqft" value={row.sqft} onChange={(v) => setMoveIns(patch(moveInHomes, idx, { sqft: v }))} placeholder="890" />
          </Row>
          <Row>
            <Field label="Price" value={row.price} onChange={(v) => setMoveIns(patch(moveInHomes, idx, { price: v }))} placeholder="729000" />
            <Field label="Status" value={row.status} onChange={(v) => setMoveIns(patch(moveInHomes, idx, { status: v }))} placeholder="Available" />
            <Field label="ETA" value={row.eta} onChange={(v) => setMoveIns(patch(moveInHomes, idx, { eta: v }))} placeholder="30 days" />
          </Row>
          <RemoveBtn onClick={() => setMoveIns(moveInHomes.filter((_, i) => i !== idx))} />
        </div>
      ))}
      <AddBtn onClick={() => setMoveIns([...(moveInHomes || []), emptyMoveIn()])}>+ Add move-in home</AddBtn>

      <SectionTitle style={{ marginTop: 18 }}>Design packages</SectionTitle>
      {(designPackages || []).map((row, idx) => (
        <div key={`pkg-${idx}`} className={cardClass} style={cardStyle}>
          <Row>
            <Field label="Name" value={row.name} onChange={(v) => setPackages(patch(designPackages, idx, { name: v, id: row.id || slugify(v) }))} placeholder="Signature" />
            <Field label="Price delta" value={row.price_delta} onChange={(v) => setPackages(patch(designPackages, idx, { price_delta: v }))} placeholder="18500" />
          </Row>
          <Field label="Tagline" value={row.tagline} onChange={(v) => setPackages(patch(designPackages, idx, { tagline: v }))} placeholder="Elevated finishes" />
          <Field label="Includes (comma-separated)" value={Array.isArray(row.includes) ? row.includes.join(", ") : (row.includes || "")} onChange={(v) => setPackages(patch(designPackages, idx, { includes: v }))} placeholder="Oak floors, Quartz counters" />
          <Field label="Swatches (hex, comma-separated)" value={Array.isArray(row.swatches) ? row.swatches.join(", ") : (row.swatches || "")} onChange={(v) => setPackages(patch(designPackages, idx, { swatches: v }))} placeholder="#c4b5a0, #8b7355" />
          <RemoveBtn onClick={() => setPackages(designPackages.filter((_, i) => i !== idx))} />
        </div>
      ))}
      <AddBtn onClick={() => setPackages([...(designPackages || []), emptyPackage()])}>+ Add design package</AddBtn>
    </div>
  );
}

/** Normalize editor rows into API-ready JSON arrays. */
export function serializeMerchandising({ incentives, move_in_homes, design_packages }) {
  return {
    incentives: (incentives || [])
      .filter((r) => (r.title || "").trim())
      .map((r) => ({
        title: String(r.title).trim(),
        detail: String(r.detail || "").trim() || undefined,
        badge: String(r.badge || "").trim() || undefined,
        expires: String(r.expires || "").trim() || undefined,
      })),
    move_in_homes: (move_in_homes || [])
      .filter((r) => (r.address || "").trim())
      .map((r) => ({
        address: String(r.address).trim(),
        beds: numOrUndef(r.beds),
        baths: numOrUndef(r.baths),
        sqft: numOrUndef(r.sqft),
        price: numOrUndef(r.price),
        status: String(r.status || "Available").trim(),
        eta: String(r.eta || "").trim() || undefined,
      })),
    design_packages: (design_packages || [])
      .filter((r) => (r.name || "").trim())
      .map((r) => ({
        id: String(r.id || slugify(r.name)).trim(),
        name: String(r.name).trim(),
        tagline: String(r.tagline || "").trim() || undefined,
        price_delta: numOrUndef(r.price_delta),
        swatches: csvList(r.swatches),
        includes: csvList(r.includes),
      })),
  };
}

export function merchFromListing(l = {}) {
  return {
    incentives: Array.isArray(l.incentives) ? l.incentives.map((r) => ({ ...emptyIncentive(), ...r })) : [],
    move_in_homes: Array.isArray(l.move_in_homes) ? l.move_in_homes.map((r) => ({ ...emptyMoveIn(), ...r })) : [],
    design_packages: Array.isArray(l.design_packages)
      ? l.design_packages.map((r) => ({
          ...emptyPackage(),
          ...r,
          includes: Array.isArray(r.includes) ? r.includes.join(", ") : (r.includes || ""),
          swatches: Array.isArray(r.swatches) ? r.swatches.join(", ") : (r.swatches || ""),
          price_delta: r.price_delta != null ? String(r.price_delta) : "",
        }))
      : [],
  };
}

/** Seller UI to post / edit / delete construction updates for a project. */
export function ConstructionUpdatesManager({ propertyId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState({ title: "", body: "", image_url: "" });
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await getPropertyUpdates(propertyId);
      const arr = Array.isArray(res) ? res : (res?.data ?? []);
      setRows(arr);
    } catch {
      setMsg("Could not load construction updates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetDraft = () => {
    setDraft({ title: "", body: "", image_url: "" });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!draft.title.trim() || busy) return;
    setBusy(true);
    setMsg("");
    try {
      let image_url = draft.image_url || null;
      if (draft.file) {
        const up = await uploadListingPhoto(draft.file);
        if (up?.url) image_url = up.url;
      }
      const payload = { title: draft.title.trim(), body: draft.body.trim() || null, image_url };
      if (editingId) {
        await updatePropertyUpdate(propertyId, editingId, payload);
      } else {
        await createPropertyUpdate(propertyId, payload);
      }
      resetDraft();
      await load();
      setMsg(editingId ? "Update saved." : "Update posted.");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Could not save update.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (updateId) => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await deletePropertyUpdate(propertyId, updateId);
      if (editingId === updateId) resetDraft();
      await load();
      setMsg("Update deleted.");
    } catch {
      setMsg("Could not delete update.");
    } finally {
      setBusy(false);
    }
  };

  if (!propertyId) {
    return (
      <p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
        Save the project first, then you can post construction updates.
      </p>
    );
  }

  return (
    <div>
      <SectionTitle>Construction updates</SectionTitle>
      <p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>
        Buyers see these on the project page as a progress timeline.
      </p>
      <div className={cardClass} style={cardStyle}>
        <Field label="Title" value={draft.title} onChange={(v) => setDraft((d) => ({ ...d, title: v }))} placeholder="Foundation complete" />
        <label className={fieldLabelClass} style={fieldLabel}>Details</label>
        <textarea
          rows={3}
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          placeholder="What's new on site…"
          className={inputClass}
          style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setDraft((d) => ({ ...d, file: e.target.files?.[0] || null }))}
          className={inputClass}
          style={{ ...inputStyle, padding: 8, marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !draft.title.trim()}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: busy ? "wait" : "pointer",
              background: draft.title.trim() ? "#2563eb" : "rgba(37,99,235,0.3)", color: "#fff",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12,
            }}
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Post update"}
          </button>
          {editingId && (
            <button type="button" onClick={resetDraft} className="border border-border text-text-secondary" style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
              Cancel
            </button>
          )}
        </div>
      </div>
      {msg && <p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>{msg}</p>}
      {loading ? (
        <p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Loading…</p>
      ) : !rows.length ? (
        <p className="text-text-muted" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>No updates yet.</p>
      ) : (
        rows.map((u) => (
          <div key={u.update_id} className={cardClass} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <p className="text-text-primary" style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{u.title}</p>
              {u.body && <p className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{u.body}</p>}
              <p className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
                {u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setEditingId(u.update_id);
                  setDraft({ title: u.title || "", body: u.body || "", image_url: u.image_url || "", file: null });
                }}
                className="border border-border"
                style={{ padding: "6px 10px", borderRadius: 6, background: "transparent", color: "#60a5fa", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(u.update_id)}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.35)", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SectionTitle({ children, style }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", fontFamily: "'DM Sans', sans-serif", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", ...style }}>
      {children}
    </p>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div style={{ flex: 1, minWidth: 0, marginBottom: 8 }}>
      <p className={fieldLabelClass} style={fieldLabel}>{label}</p>
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} style={inputStyle} />
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>;
}

function AddBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-surface-raised text-text-secondary"
      style={{
        width: "100%", padding: "10px 0", borderRadius: 10, cursor: "pointer", marginBottom: 8,
        border: "1px dashed var(--color-border)",
        fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function RemoveBtn({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        alignSelf: "flex-end", marginBottom: 8, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
        background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)",
        color: "#f87171", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
      }}
    >
      Remove
    </button>
  );
}

function patch(arr, idx, partial) {
  return (arr || []).map((row, i) => (i === idx ? { ...row, ...partial } : row));
}

function numOrUndef(v) {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function csvList(v) {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (!v) return [];
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || `pkg-${Date.now()}`;
}
