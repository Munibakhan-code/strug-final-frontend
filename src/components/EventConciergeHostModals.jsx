import React, { useEffect, useState } from "react";
import ConfirmDialog, { useDialog } from "./ConfirmDialog.jsx";

const ACCENT = "#f97316";
const FONT = "'DM Sans', sans-serif";

function inputStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: FONT,
    fontSize: 14,
    color: "#fff",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 12,
    padding: "12px 14px",
    outline: "none",
    colorScheme: "dark",
  };
}

function FieldLabel({ children }) {
  return (
    <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, style }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#fff",
        background: disabled ? "rgba(249,115,22,0.35)" : ACCENT, border: "none", borderRadius: 12,
        padding: "12px 18px", cursor: disabled ? "default" : "pointer", ...style,
      }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, disabled, style }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12, padding: "10px 14px", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1, ...style,
      }}
    >
      {children}
    </button>
  );
}

function ModalShell({ title, children, onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 90, display: "grid", placeItems: "center", padding: 16 }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", background: "#121216", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 14px" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function toDateInputValue(d) {
  if (!d) return "";
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

export function EditPlanModal({ plan, occasions = [], vibes = [], onClose, onSave }) {
  const [form, setForm] = useState({
    title: plan.title || "",
    occasion: plan.occasion || "other",
    event_date: plan.event_date ? toDateInputValue(plan.event_date) : "",
    rsvp_deadline: plan.rsvp_deadline ? toDateInputValue(plan.rsvp_deadline) : "",
    guests: plan.guests != null ? String(plan.guests) : "",
    budget: plan.budget != null ? String(plan.budget) : "",
    city: plan.city || "",
    vibe: plan.vibe || "",
    notes: plan.notes || "",
    status: plan.status || "planning",
    allow_late_rsvp: plan.allow_late_rsvp !== false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) { setErr("Title required"); return; }
    setBusy(true);
    setErr("");
    try {
      await onSave({
        title: form.title.trim(),
        occasion: form.occasion,
        event_date: form.event_date || null,
        rsvp_deadline: form.rsvp_deadline || null,
        guests: form.guests === "" ? null : Number(form.guests),
        budget: form.budget === "" ? null : Number(form.budget),
        city: form.city.trim() || null,
        vibe: form.vibe || null,
        notes: form.notes.trim() || null,
        status: form.status,
        allow_late_rsvp: form.allow_late_rsvp,
      });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Edit event" onClose={onClose}>
      <FieldLabel>Title</FieldLabel>
      <input value={form.title} onChange={(e) => set("title", e.target.value)} style={{ ...inputStyle(), marginBottom: 12 }} />
      <FieldLabel>Occasion</FieldLabel>
      <select value={form.occasion} onChange={(e) => set("occasion", e.target.value)} style={{ ...inputStyle(), marginBottom: 12 }}>
        {occasions.map((o) => <option key={o.id} value={o.id} style={{ color: "#111" }}>{o.label}</option>)}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <FieldLabel>Event date</FieldLabel>
          <input type="date" value={form.event_date} onChange={(e) => set("event_date", e.target.value)} style={inputStyle()} />
        </div>
        <div>
          <FieldLabel>RSVP deadline</FieldLabel>
          <input type="date" value={form.rsvp_deadline} onChange={(e) => set("rsvp_deadline", e.target.value)} style={inputStyle()} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <FieldLabel>Guests</FieldLabel>
          <input type="number" min={1} value={form.guests} onChange={(e) => set("guests", e.target.value)} style={inputStyle()} />
        </div>
        <div>
          <FieldLabel>Budget (CAD)</FieldLabel>
          <input type="number" min={0} value={form.budget} onChange={(e) => set("budget", e.target.value)} style={inputStyle()} />
        </div>
      </div>
      <FieldLabel>City</FieldLabel>
      <input value={form.city} onChange={(e) => set("city", e.target.value)} style={{ ...inputStyle(), marginBottom: 12 }} />
      <FieldLabel>Vibe</FieldLabel>
      <select value={form.vibe} onChange={(e) => set("vibe", e.target.value)} style={{ ...inputStyle(), marginBottom: 12 }}>
        <option value="" style={{ color: "#111" }}>—</option>
        {vibes.map((v) => <option key={v.id} value={v.id} style={{ color: "#111" }}>{v.label}</option>)}
      </select>
      <FieldLabel>Status</FieldLabel>
      <select value={form.status} onChange={(e) => set("status", e.target.value)} style={{ ...inputStyle(), marginBottom: 12 }}>
        {["planning", "active", "completed"].map((s) => <option key={s} value={s} style={{ color: "#111" }}>{s}</option>)}
      </select>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
        <input type="checkbox" checked={form.allow_late_rsvp} onChange={(e) => set("allow_late_rsvp", e.target.checked)} />
        Allow late RSVPs after deadline
      </label>
      <FieldLabel>Notes / day-of details</FieldLabel>
      <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} style={{ ...inputStyle(), marginBottom: 12, resize: "vertical" }} placeholder="Schedule, parking, dress code…" />
      {err && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "0 0 10px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <GhostBtn onClick={onClose} style={{ flex: 1 }} disabled={busy}>Cancel</GhostBtn>
        <PrimaryBtn onClick={submit} style={{ flex: 1 }} disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryBtn>
      </div>
    </ModalShell>
  );
}

export function EditGuestModal({ guest, onClose, onSave }) {
  const [form, setForm] = useState({
    name: guest.name || "",
    email: guest.email || "",
    phone: guest.phone || "",
    status: guest.status || "pending",
    plus_ones: guest.plus_ones != null ? String(guest.plus_ones) : "0",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!form.name.trim()) { setErr("Name required"); return; }
    setBusy(true);
    setErr("");
    try {
      await onSave({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: form.status,
        plus_ones: Math.max(0, Math.min(10, parseInt(form.plus_ones, 10) || 0)),
      });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Edit guest" onClose={onClose}>
      <FieldLabel>Name</FieldLabel>
      <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inputStyle(), marginBottom: 12 }} />
      <FieldLabel>Email</FieldLabel>
      <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={{ ...inputStyle(), marginBottom: 12 }} />
      <FieldLabel>Phone</FieldLabel>
      <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={{ ...inputStyle(), marginBottom: 12 }} placeholder="+1…" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <FieldLabel>Status</FieldLabel>
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle()}>
            {["pending", "invited", "accepted", "maybe", "declined"].map((s) => (
              <option key={s} value={s} style={{ color: "#111" }}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Plus-ones</FieldLabel>
          <input type="number" min={0} max={10} value={form.plus_ones} onChange={(e) => setForm((f) => ({ ...f, plus_ones: e.target.value }))} style={inputStyle()} />
        </div>
      </div>
      {err && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "0 0 10px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <GhostBtn onClick={onClose} style={{ flex: 1 }} disabled={busy}>Cancel</GhostBtn>
        <PrimaryBtn onClick={submit} style={{ flex: 1 }} disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryBtn>
      </div>
    </ModalShell>
  );
}

export function EditNeedBudgetModal({ need, onClose, onSave }) {
  const [amount, setAmount] = useState(need.target_budget != null ? String(need.target_budget) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const raw = amount.trim();
      await onSave(raw === "" ? null : Number(raw));
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`Budget · ${need.title}`} onClose={onClose}>
      <FieldLabel>Target budget (CAD)</FieldLabel>
      <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle(), marginBottom: 12 }} placeholder="Leave blank to clear" />
      {err && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "0 0 10px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <GhostBtn onClick={onClose} style={{ flex: 1 }} disabled={busy}>Cancel</GhostBtn>
        <PrimaryBtn onClick={submit} style={{ flex: 1 }} disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryBtn>
      </div>
    </ModalShell>
  );
}

export function CoPlannerModal({ onClose, onAdd, onRemove, collaborators = [], isOwner = true }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!email.trim()) { setErr("Email required"); return; }
    setBusy(true);
    setErr("");
    try {
      await onAdd(email.trim());
      setEmail("");
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || "Could not add");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Co-planners" onClose={onClose}>
      <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 12px", lineHeight: 1.45 }}>
        {isOwner
          ? "Invite a Strug account by email. They’ll see this event in Event Concierge and can edit needs, invites, and registry."
          : "You have edit access as a co-planner. Only the owner can add or remove co-planners."}
      </p>
      {collaborators.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {collaborators.map((c) => (
            <div
              key={c.user_id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <span style={{ fontFamily: FONT, fontSize: 13, color: "#fff" }}>{c.label || `User #${c.user_id}`}</span>
              {isOwner && onRemove && (
                <GhostBtn
                  style={{ fontSize: 11, padding: "6px 10px", color: "#fca5a5" }}
                  disabled={removingId === c.user_id}
                  onClick={async () => {
                    setRemovingId(c.user_id);
                    setErr("");
                    try {
                      await onRemove(c.user_id);
                    } catch (e) {
                      setErr(e?.response?.data?.error || e?.message || "Could not remove");
                    } finally {
                      setRemovingId(null);
                    }
                  }}
                >
                  {removingId === c.user_id ? "…" : "Remove"}
                </GhostBtn>
              )}
            </div>
          ))}
        </div>
      )}
      {isOwner && (
        <>
          <FieldLabel>Email</FieldLabel>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle(), marginBottom: 12 }} placeholder="partner@email.com" />
        </>
      )}
      {err && <p style={{ fontFamily: FONT, fontSize: 12, color: "#fca5a5", margin: "0 0 10px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <GhostBtn onClick={onClose} style={{ flex: 1 }} disabled={busy || removingId != null}>Close</GhostBtn>
        {isOwner && (
          <PrimaryBtn onClick={submit} style={{ flex: 1 }} disabled={busy || removingId != null}>{busy ? "Adding…" : "Add"}</PrimaryBtn>
        )}
      </div>
    </ModalShell>
  );
}

/** Planning timeline from event date + open needs. */
export function buildTimeline(plan) {
  const days = (() => {
    if (!plan.event_date) return null;
    const d = new Date(plan.event_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((target - today) / 86400000);
  })();

  const openNeeds = (plan.needs || []).filter((n) => !["booked", "done", "skipped"].includes(n.status));
  const steps = [
    { when: "ASAP", title: "Lock venue & big-ticket needs", done: !openNeeds.some((n) => n.category === "venue" || n.linked_nav === "venues"), tab: "checklist" },
    { when: "T-4 weeks", title: "Send invitations", done: (plan.guest_list || []).length > 0 && (plan.guest_list || []).every((g) => g.status !== "pending"), tab: "invites" },
    { when: "T-2 weeks", title: "Book remaining vendors", done: openNeeds.filter((n) => n.category !== "gifts").length === 0, tab: "checklist" },
    { when: plan.rsvp_deadline ? `By ${new Date(plan.rsvp_deadline).toLocaleDateString()}` : "T-1 week", title: "Close RSVPs & finalize headcount", done: (plan.rsvp_summary?.pending || 0) === 0 && (plan.guest_list || []).length > 0, tab: "invites" },
    { when: "Day of", title: "Share day-of notes with guests", done: Boolean(plan.notes?.trim()), tab: "overview" },
  ];

  return { days, steps };
}

export function TimelineCard({ plan, onGo }) {
  const { days, steps } = buildTimeline(plan);
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: 16, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>
        Timeline {days != null ? `· ${days < 0 ? "event passed" : days === 0 ? "today" : `${days} days out`}` : ""}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {steps.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onGo?.(s.tab)}
            style={{
              textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "10px 12px", cursor: "pointer", color: "inherit",
            }}
          >
            <span style={{ color: s.done ? "#4ade80" : ACCENT, fontWeight: 800, fontSize: 14 }}>{s.done ? "✓" : "○"}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{s.when}</div>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.title}</div>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { ConfirmDialog, useDialog, ACCENT, FONT };
