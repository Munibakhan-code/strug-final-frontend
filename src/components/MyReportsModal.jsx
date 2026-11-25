// src/components/MyReportsModal.jsx — "My reports", as a modal.
//
// This is the reporter's half of the follow-up loop: where they read a question the team asked and
// answer it. It deliberately mirrors BugReportModal (same shell, same anchor, same controls) —
// filing a report and answering a question about it are two beats of one conversation, so they
// should feel like the same surface, not a form and a separate page.
//
// The board can be waiting on the reporter for SEVERAL reports at once, so this pages through them
// one at a time. The ones that need a reply are sorted to the front and the pager says how many are
// left, because a question that's three cards down is a question that never gets answered.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMyBugReports, replyToBugReport } from "../api/bugs";
import { getUser } from "../store/auth";
import { ModalShell, PublicBoardLink, inputStyle } from "./reportKit.jsx";

const STATUS = {
  open: { label: "Open", color: "#f5a524" },
  in_progress: { label: "In progress", color: "#5b8def" },
  awaiting_reporter: { label: "Needs your reply", color: "#a78bfa" },
  resolved: { label: "Resolved", color: "#34d399" },
  wont_fix: { label: "Won't fix", color: "#7c8aa0" },
  duplicate: { label: "Duplicate", color: "#7c8aa0" },
};
const statusOf = (s) => STATUS[s] || { label: s, color: "#7c8aa0" };

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Chip({ color, children }) {
  return (
    <span style={{ flex: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color, background: `${color}1f`, border: `1px solid ${color}55`, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Message({ message, accent }) {
  const mine = message.author_type === "reporter";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 7, animation: "reportRowIn 0.2s ease both" }}>
      <div style={{ maxWidth: "88%", background: mine ? `${accent}1f` : "var(--color-surface-raised)", border: `1px solid ${mine ? `${accent}55` : "var(--color-border)"}`, borderRadius: 12, padding: "8px 11px" }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 700, color: mine ? accent : "var(--color-text-secondary)", marginBottom: 3 }}>
          {mine ? "You" : message.author_name || "Strug team"}
          <span className="text-text-muted" style={{ fontWeight: 400, marginLeft: 7 }}>{fmt(message.created_at)}</span>
        </div>
        {/* Body color was a fixed rgba(255,255,255,0.85) regardless of `mine` — fine while the bubble
            sat on an always-dark panel, but both bubble backgrounds here are only translucent tints
            over the modal panel (var(--color-surface-raised) or accent-tinted), so once the panel
            flips light the fixed near-white text goes unreadable. Token follows the panel instead. */}
        <div className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {message.body}
        </div>
      </div>
    </div>
  );
}

// Small round pager control. Disabled state is visually distinct so "there is nothing after this"
// is obvious without having to click and find out.
function PagerBtn({ dir, onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`bg-surface-raised border border-border ${disabled ? "text-text-muted" : "text-text-secondary"}`}
      style={{
        width: 26, height: 26, borderRadius: 8, flex: "none",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--color-border)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-surface-raised)"; }}
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}

export default function MyReportsModal({ accent = "#2563eb", onClose, isMobile = false, onReportBug }) {
  const user = getUser();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState("");

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const res = await getMyBugReports();
      const list = res.reports || [];
      // Anything the team is blocked on comes first — otherwise a question sits behind three
      // resolved tickets and never gets seen. Ties keep the server's newest-first order.
      list.sort((a, b) => (b.awaiting_you ? 1 : 0) - (a.awaiting_you ? 1 : 0));
      setReports(list);
      setIdx(0);
    } catch (err) {
      // Never a silent catch — a swallowed failure here renders "no reports yet" to someone who
      // has ten, which is the exact class of bug this whole feature exists to stop shipping.
      setError(err?.response?.data?.message || "Could not load your reports. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Moving between reports must not carry a half-typed answer onto someone else's ticket.
  useEffect(() => { setDraft(""); setReplyError(""); }, [idx]);

  const needsReply = useMemo(() => reports.filter((r) => r.awaiting_you).length, [reports]);
  const report = reports[idx] ?? null;

  const send = async () => {
    const body = draft.trim();
    if (!body || !report) return;
    setSending(true);
    setReplyError("");
    try {
      const res = await replyToBugReport(report.bug_report_id, body);
      const { message, status } = res.data;
      setDraft("");
      // The POST echo and the GET list return an identical message shape (one server-side
      // serializer), so appending the echo renders exactly like a refetch would.
      setReports((rs) => rs.map((r, i) => (i === idx
        ? { ...r, messages: [...(r.messages || []), message], status, awaiting_you: status === "awaiting_reporter" }
        : r)));
    } catch (err) {
      setReplyError(err?.response?.data?.message || "Could not send your reply. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const pager = reports.length > 1 && (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 2 }}>
      <PagerBtn dir="prev" label="Previous report" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))} />
      <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, minWidth: 34, textAlign: "center" }}>
        {idx + 1} / {reports.length}
      </span>
      <PagerBtn dir="next" label="Next report" disabled={idx >= reports.length - 1} onClick={() => setIdx((i) => Math.min(reports.length - 1, i + 1))} />
    </div>
  );

  // `close` (from ModalShell) plays the exit animation before unmounting, so the empty-state and
  // cross-to-report-modal buttons pop out too instead of vanishing.
  const body = (close) => {
    if (!user) {
      return (
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.55, margin: 0 }}>
          Please log in to see the reports you've sent us.
        </p>
      );
    }

    if (loading) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel bg-surface-raised" style={{ height: i === 0 ? 54 : 38, borderRadius: 12 }} />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div style={{ border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", borderRadius: 12, padding: 14 }}>
          <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: "#f87171", lineHeight: 1.5 }}>{error}</p>
          <button
            onClick={load}
            className="border border-border text-text-primary"
            style={{ marginTop: 10, background: "transparent", borderRadius: 10, padding: "7px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      );
    }

    if (!report) {
      return (
        <div style={{ textAlign: "center", padding: "22px 4px 6px" }}>
          <p className="text-text-primary" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600 }}>No reports yet</p>
          <p className="text-text-secondary" style={{ margin: "6px 0 16px", fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, lineHeight: 1.5 }}>
            Found something broken? Tell us and we'll take a look.
          </p>
          {onReportBug && (
            <button
              onClick={() => close(onReportBug)}
              style={{ width: "100%", background: accent, border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Report a problem
            </button>
          )}
        </div>
      );
    }

    const st = statusOf(report.status);
    const messages = report.messages ?? [];

    return (
      // Keyed on the report id so switching cards replays the entry animation — it makes the
      // "you are now looking at a different ticket" transition unmistakable.
      <div key={report.bug_report_id} style={{ animation: "reportRowIn 0.22s ease both" }}>
        {needsReply > 0 && (
          <p className="text-text-secondary" style={{ margin: "0 0 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.5 }}>
            The team is waiting on you for <strong style={{ color: accent }}>{needsReply}</strong> report{needsReply === 1 ? "" : "s"}.
          </p>
        )}

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
          <h2 className="text-text-primary" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, lineHeight: 1.35, wordBreak: "break-word" }}>{report.title}</h2>
          <Chip color={st.color}>{st.label}</Chip>
        </div>
        <p className="text-text-muted" style={{ margin: "0 0 12px", fontFamily: "'DM Sans', sans-serif", fontSize: 11.5 }}>
          #{String(report.bug_report_id).padStart(3, "0")} · {report.category} · {fmt(report.created_at)}
        </p>

        <p className="styled-scrollbar bg-surface-raised border border-border-subtle text-text-secondary" style={{ margin: 0, borderRadius: 12, padding: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 108, overflowY: "auto" }}>
          {report.description}
        </p>

        {report.awaiting_you && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, background: `${accent}14`, border: `1px solid ${accent}44`, borderRadius: 10, padding: "9px 11px" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 17h.01M12 13.5a1.5 1.5 0 0 1 1-1.41 2.6 2.6 0 1 0-3.4-2.6" />
            </svg>
            {/* Same fix as the message bubble body: this sat on an accent-tinted background over
                the panel, so a fixed near-white text goes invisible once the panel is light. */}
            <span className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.45 }}>
              The team asked you a question. Your answer helps them reproduce it.
            </span>
          </div>
        )}

        {messages.length > 0 && (
          <div className="styled-scrollbar" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border-subtle)", maxHeight: 240, overflowY: "auto" }}>
            {messages.map((m) => <Message key={m.message_id} message={m} accent={accent} />)}
          </div>
        )}

        {messages.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write your answer…"
              rows={3}
              maxLength={5000}
              style={{ ...inputStyle, resize: "vertical", minHeight: 72, fontSize: 14 }}
              onFocus={(e) => { e.target.style.borderColor = `${accent}80`; e.target.style.background = "var(--color-border)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.background = "var(--color-surface-raised)"; }}
            />
            {replyError && (
              <p style={{ margin: "8px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: "#f87171", lineHeight: 1.45 }}>{replyError}</p>
            )}
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              style={{
                marginTop: 9, width: "100%",
                background: sending || !draft.trim() ? "var(--color-border)" : accent,
                border: "none", borderRadius: 12, padding: "11px",
                color: sending || !draft.trim() ? "var(--color-text-muted)" : "#fff",
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
                cursor: sending || !draft.trim() ? "default" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {sending ? "Sending…" : "Send reply"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <ModalShell
      isMobile={isMobile}
      onClose={onClose}
      title="My reports"
      labelledBy="My reports"
      headerRight={pager}
    >
      {(close) => (
        <>
          {body(close)}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <PublicBoardLink accent={accent} />
            {onReportBug && reports.length > 0 && (
              <button
                onClick={() => close(onReportBug)}
                className="text-text-secondary"
                style={{ background: "transparent", border: "none", padding: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, cursor: "pointer", transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
              >
                Report a problem
              </button>
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
}
