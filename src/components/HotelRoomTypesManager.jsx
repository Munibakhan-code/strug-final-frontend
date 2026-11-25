import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getHotelRooms,
  createHotelRoom,
  updateHotelRoom,
  deleteHotelRoom,
} from "../api/booking";
import { uploadImage } from "../api/shop";
import { mediaUrl } from "../utils/mediaUrl";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--color-surface-raised)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: "10px 12px",
  color: "var(--color-text-primary)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  outline: "none",
};

const MAX_ROOM_IMAGES = 8;

const emptyForm = () => ({
  name: "",
  nightly_price: "",
  max_guests: "2",
  quantity: "1",
  beds: "",
  amenities: "",
  images: [],
});

function normalizeRoomImages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u) => typeof u === "string" && u.trim()).slice(0, MAX_ROOM_IMAGES);
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span
        style={{
          display: "block",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--color-text-secondary)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
      {hint ? (
        <span
          style={{
            display: "block",
            marginTop: 6,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--color-text-muted)",
            letterSpacing: 0,
            textTransform: "none",
            lineHeight: 1.4,
          }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function parseAmenities(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function amenitiesToText(raw) {
  if (Array.isArray(raw)) return raw.join(", ");
  if (typeof raw === "string") return raw;
  return "";
}

/**
 * Host UI: manage multiple room types under one hotel listing.
 * Uses existing booking-engine room CRUD — does not create extra hotel listings.
 */
export default function HotelRoomTypesManager({
  listingId,
  hotelName,
  color = "#0ea5e9",
  onClose,
  onChanged,
}) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("list"); // list | create | edit
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [pendingDelete, setPendingDelete] = useState(null);
  const imgInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!listingId) return;
    setLoading(true);
    setError("");
    try {
      const res = await getHotelRooms(listingId);
      const list = res?.data ?? res ?? [];
      setRooms(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load room types.");
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setMode("create");
  };

  const openEdit = (room) => {
    setEditingId(room.room_type_id);
    setForm({
      name: room.name || "",
      nightly_price: room.nightly_price != null ? String(room.nightly_price) : "",
      max_guests: room.max_guests != null ? String(room.max_guests) : "2",
      quantity: room.quantity != null ? String(room.quantity) : "1",
      beds: room.beds || "",
      amenities: amenitiesToText(room.amenities),
      // Every existing photo is loaded into the form, because save replaces the whole
      // array — keeping only the first one here silently deleted the rest on edit.
      images: normalizeRoomImages(room.images),
    });
    setError("");
    setMode("edit");
  };

  const handleImagePick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const slotsLeft = MAX_ROOM_IMAGES - form.images.length;
    if (slotsLeft <= 0) {
      setError(`You can attach up to ${MAX_ROOM_IMAGES} photos per room type.`);
      return;
    }
    const accepted = files.slice(0, slotsLeft);
    setUploading(true);
    setError("");
    try {
      const urls = [];
      for (const file of accepted) {
        const res = await uploadImage(file);
        const url = res?.url || res?.data?.url;
        if (!url) throw new Error("Upload failed");
        urls.push(url);
      }
      setForm((prev) => ({ ...prev, images: normalizeRoomImages([...prev.images, ...urls]) }));
      if (accepted.length < files.length) {
        setError(`Added ${accepted.length} photo${accepted.length === 1 ? "" : "s"} — the limit is ${MAX_ROOM_IMAGES} per room type.`);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const validate = () => {
    const name = String(form.name || "").trim();
    // A blank price must not coerce to 0 (Number("") === 0) and publish a free room.
    const priceRaw = String(form.nightly_price ?? "").trim();
    const price = Number(priceRaw);
    const maxGuestsRaw = String(form.max_guests ?? "").trim();
    const maxGuests = Number(maxGuestsRaw);
    const quantityRaw = String(form.quantity ?? "").trim();
    const quantity = Number(quantityRaw);
    if (!name) return { error: "Room type name is required." };
    if (!priceRaw) return { error: "Nightly price is required." };
    if (!Number.isFinite(price) || price <= 0) {
      return { error: "Nightly price must be greater than 0." };
    }
    if (!maxGuestsRaw || !Number.isInteger(maxGuests) || maxGuests < 1) {
      return { error: "Max guests must be a whole number of at least 1." };
    }
    if (!quantityRaw || !Number.isInteger(quantity) || quantity < 1) {
      return { error: "Rooms of this type must be a whole number of at least 1." };
    }
    return {
      payload: {
        name,
        nightly_price: price,
        max_guests: maxGuests,
        quantity,
        beds: String(form.beds || "").trim() || null,
        amenities: parseAmenities(form.amenities),
        // Full photo set — the server replaces the array, so this must carry every
        // photo the host still wants (an empty array clears them all).
        images: normalizeRoomImages(form.images),
      },
    };
  };

  const handleSave = async () => {
    const v = validate();
    if (v.error) {
      setError(v.error);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (mode === "edit" && editingId) {
        await updateHotelRoom(listingId, editingId, v.payload);
      } else {
        await createHotelRoom(listingId, v.payload);
      }
      await load();
      onChanged?.();
      setMode("list");
      setEditingId(null);
      setForm(emptyForm());
    } catch (e) {
      setError(e?.response?.data?.message || "Could not save room type.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (room) => {
    if (rooms.length <= 1) {
      setError("Keep at least one room type so guests can book this hotel.");
      return;
    }
    setPendingDelete(room);
  };

  const confirmDelete = async () => {
    const room = pendingDelete;
    if (!room) return;
    setSaving(true);
    setError("");
    try {
      await deleteHotelRoom(listingId, room.room_type_id);
      await load();
      onChanged?.();
      setPendingDelete(null);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not remove room type.");
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "create"
      ? "Add room type"
      : mode === "edit"
        ? "Edit room type"
        : "Manage room types";

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(4px)",
        zIndex: 100000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "min(40px, 4vh) 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          margin: "0 auto 40px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 18,
          padding: "26px 26px 22px",
          boxShadow: "0 24px 60px var(--color-shadow)",
          maxHeight: "min(92vh, 900px)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 21,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              fontFamily: "'Barlow Condensed', sans-serif",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", lineHeight: 1, padding: 4, display: "inline-flex" }}
            aria-label="Close"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
          {hotelName ? (
            <>
              <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{hotelName}</span>
              {" — "}
            </>
          ) : null}
          All types stay under this one hotel. Guests pick a type on the hotel page.
          {" "}
          <span style={{ color: "var(--color-text-muted)" }}>
            “Rooms of this type” = physical copies, not guest count.
          </span>
        </p>

        {error ? (
          <p
            style={{
              margin: "0 0 14px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#fca5a5",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
            }}
          >
            {error}
          </p>
        ) : null}

        {mode === "list" ? (
          <>
            {loading ? (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--color-text-secondary)" }}>
                Loading room types…
              </p>
            ) : rooms.length === 0 ? (
              <div
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: 12,
                  padding: "18px 14px",
                  marginBottom: 14,
                }}
              >
                <p style={{ margin: "0 0 6px", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "var(--color-text-secondary)" }}>
                  No room types yet
                </p>
                <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                  Add Deluxe King, Twin, Suite, etc. Guests will see each type on this hotel.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                {rooms.map((room) => {
                  const imgs = normalizeRoomImages(room.images);
                  const thumb = imgs[0] ? mediaUrl(imgs[0]) : null;
                  return (
                  <div
                    key={room.room_type_id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface-raised)",
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        flexShrink: 0,
                        overflow: "hidden",
                        background: "linear-gradient(135deg,#1a1a2a,#0f0f1a)",
                      }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : null}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)" }}>
                        {room.name}
                      </p>
                      <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
                        ${Number(room.nightly_price || 0).toFixed(0)}/night
                        {" · "}
                        {Math.max(1, Number(room.quantity) || 1)} room{Number(room.quantity) === 1 ? "" : "s"}
                        {" · "}
                        up to {Math.max(1, Number(room.max_guests) || 1)} guests
                        {room.beds ? ` · ${room.beds}` : ""}
                        {imgs.length === 0 ? " · no photo yet" : ` · ${imgs.length} photo${imgs.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => openEdit(room)}
                      style={{
                        padding: "7px 12px",
                        background: `${color}22`,
                        border: "none",
                        borderRadius: 8,
                        color,
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: saving ? "default" : "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleDelete(room)}
                      style={{
                        padding: "7px 12px",
                        background: "rgba(239,68,68,0.08)",
                        border: "none",
                        borderRadius: 8,
                        color: "#f87171",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: saving ? "default" : "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={openCreate}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: color,
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + Add room type
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "12px 18px",
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-text-secondary)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <Field label="Room type name *">
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Deluxe King, Twin, Suite…"
                autoFocus
              />
            </Field>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="Nightly price (CAD) *">
                  <input
                    style={inputStyle}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.nightly_price}
                    onChange={(e) => setField("nightly_price", e.target.value)}
                    placeholder="149"
                  />
                </Field>
              </div>
              <div style={{ width: 140 }}>
                <Field
                  label="Rooms of this type *"
                  hint="This many rooms can be booked each night. Block dates from the listing calendar."
                >
                  <input
                    style={inputStyle}
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setField("quantity", e.target.value)}
                    placeholder="1"
                  />
                </Field>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="Max guests per room *">
                  <input
                    style={inputStyle}
                    type="number"
                    min="1"
                    value={form.max_guests}
                    onChange={(e) => setField("max_guests", e.target.value)}
                    placeholder="2"
                  />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Beds (optional)">
                  <input
                    style={inputStyle}
                    value={form.beds}
                    onChange={(e) => setField("beds", e.target.value)}
                    placeholder="1 King Bed"
                  />
                </Field>
              </div>
            </div>
            <Field label="Amenities (comma-separated)">
              <input
                style={inputStyle}
                value={form.amenities}
                onChange={(e) => setField("amenities", e.target.value)}
                placeholder="WiFi, Mini bar, City view…"
              />
            </Field>

            <div style={{ marginBottom: 14 }}>
              <span
                style={{
                  display: "block",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--color-text-secondary)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Room photos (optional)
              </span>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>
                The first photo is the guest room card cover. If empty, guests see the hotel photo instead. Up to {MAX_ROOM_IMAGES}.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {form.images.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    style={{
                      position: "relative",
                      width: 72,
                      height: 72,
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "linear-gradient(135deg,#1a1a2a,#0f0f1a)",
                      border: index === 0 ? `1px solid ${color}` : "1px solid var(--color-border)",
                      flexShrink: 0,
                    }}
                  >
                    <img src={mediaUrl(url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => removeImage(index)}
                      aria-label={`Remove photo ${index + 1}`}
                      style={{
                        position: "absolute",
                        top: 3,
                        right: 3,
                        width: 20,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.65)",
                        border: "1px solid rgba(255,255,255,0.25)",
                        color: "#fff",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 12,
                        lineHeight: 1,
                        cursor: saving ? "default" : "pointer",
                        padding: 0,
                      }}
                    >
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                    {index === 0 ? (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(0,0,0,0.6)",
                          color: "#fff",
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 9,
                          fontWeight: 700,
                          textAlign: "center",
                          padding: "2px 0",
                        }}
                      >
                        Cover
                      </span>
                    ) : null}
                  </div>
                ))}
                <input ref={imgInputRef} type="file" accept="image/*" multiple hidden onChange={handleImagePick} />
                <button
                  type="button"
                  disabled={uploading || saving || form.images.length >= MAX_ROOM_IMAGES}
                  onClick={() => imgInputRef.current?.click()}
                  style={{
                    padding: "9px 14px",
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    color: "var(--color-text-primary)",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: uploading || form.images.length >= MAX_ROOM_IMAGES ? "default" : "pointer",
                    opacity: form.images.length >= MAX_ROOM_IMAGES ? 0.5 : 1,
                  }}
                >
                  {uploading
                    ? "Uploading…"
                    : form.images.length
                      ? `Add more (${form.images.length}/${MAX_ROOM_IMAGES})`
                      : "Upload photos"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setMode("list");
                  setEditingId(null);
                  setError("");
                }}
                style={{
                  padding: "12px 18px",
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-text-secondary)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: saving ? "var(--color-border)" : color,
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Add room type"}
              </button>
            </div>
          </>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmDialog
          open={!!pendingDelete}
          title="Remove room type?"
          message={`Remove “${pendingDelete?.name}”? Guests will no longer see it. Existing bookings stay intact.`}
          confirmLabel="Remove"
          danger
          busy={saving}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    </div>,
    document.body,
  );
}
