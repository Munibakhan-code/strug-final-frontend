import { useState, useRef, useId } from "react";
import { submitBugReport } from "../api/bugs";
import { getUser } from "../store/auth";
import { collectDiagnostics } from "../utils/diagnostics";
import { ModalShell, CustomSelect, PublicBoardLink, inputStyle, labelStyle, FIELD_HEIGHT } from "./reportKit.jsx";

const CATEGORIES = [
  { id: "bug", label: "Bug", color: "#5b8def" },
  { id: "ui", label: "Visual / UI", color: "#a78bfa" },
  { id: "performance", label: "Performance", color: "#22d3ee" },
  { id: "account", label: "Account", color: "#f5a524" },
  { id: "other", label: "Other", color: "#7c8aa0" },
];

const SEVERITIES = [
  { id: "low", label: "Low", color: "#7c8aa0" },
  { id: "medium", label: "Medium", color: "#5b8def" },
  { id: "high", label: "High", color: "#f5a524" },
  { id: "critical", label: "Critical", color: "#f8716a" },
];

const MAX_SCREENSHOTS = 3;

export default function BugReportModal({ accent = "#2563eb", onClose, isMobile = false, navId, onViewReports }) {
  const user = getUser();
  // Bug vs Feature: the same intake doubles as a feature-suggestion channel so
  // suggestions don't pollute the bug queue (board filters category==='feature').
  const [reportType, setReportType] = useState("bug");
  const isFeature = reportType === "feature";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bug");
  const [severity, setSeverity] = useState("medium");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const fileRef = useRef(null);
  const uid = useId(); // unique prefix for label/field associations

  // Snapshot the diagnostics at the moment the user opened the modal — the console errors that
  // matter happened just BEFORE they hit "report a problem". Frozen in state so what we display
  // in the disclosure below is byte-for-byte what we send.
  const [context] = useState(() => collectDiagnostics({ navId, user }));
  const consoleErrors = context?.console ?? [];
  const apiFailures = context?.api ?? [];

  const onFocus = (e) => { e.target.style.borderColor = `${accent}80`; e.target.style.background = "var(--color-border)"; };
  const onBlur = (e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.background = "var(--color-surface-raised)"; };

  const pickFiles = (e) => setFiles(Array.from(e.target.files || []).slice(0, MAX_SCREENSHOTS));
  const removeFile = (idx) => setFiles((f) => f.filter((_, i) => i !== idx));

  const submit = async () => {
    setError("");
    if (title.trim().length < 4) return setError(isFeature ? "Please give your idea a short title." : "Please give the issue a short title.");
    if (description.trim().length < 10) return setError(isFeature ? "Please describe your idea in a little more detail." : "Please describe the issue in a little more detail.");
    setSubmitting(true);
    try {
      await submitBugReport({
        title: title.trim(),
        description: description.trim(),
        category: isFeature ? "feature" : category,
        severity,
        screenshots: files,
        // Exactly the object shown in the disclosure panel — no hidden extras.
        context,
      });
      setDone(true);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.errors?.[0]?.message;
      setError(msg || "Something went wrong submitting your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const primaryBtn = (disabled) => ({
    width: "100%",
    background: disabled ? "var(--color-border)" : accent,
    border: "none",
    borderRadius: 12,
    padding: "13px",
    color: disabled ? "var(--color-text-muted)" : "#fff",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14.5,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    transition: "background 0.15s, transform 0.1s",
  });

  return (
    <ModalShell
      isMobile={isMobile}
      onClose={onClose}
      title={isFeature ? "Suggest a feature" : "Report a problem"}
      labelledBy="Report a problem"
    >
      {/* Render-function children: `close` plays the exit animation before unmounting, so the
          in-content dismiss buttons pop out just like the ✕ / backdrop do. */}
      {(close) => (done ? (
        <div style={{ textAlign: "center", padding: "18px 4px 8px", animation: "reportRowIn 0.25s ease both" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", margin: "0 auto 14px", background: `${accent}22`, border: `1px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15.5, fontWeight: 600, margin: "0 0 6px" }}>{isFeature ? "Thanks for the idea" : "Thanks for the report"}</p>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, margin: "0 0 18px", lineHeight: 1.5 }}>
            {isFeature
              ? "Our team will review your suggestion. Thanks for helping shape Strug."
              : "Our team will take a look. If they need more detail they'll ask you right here — you'll get a notification."}
          </p>
          <button onClick={() => close()} style={primaryBtn(false)}>Done</button>
          {onViewReports && (
            <button
              onClick={() => close(onViewReports)}
              className="border border-border text-text-secondary"
              style={{ width: "100%", marginTop: 8, background: "transparent", borderRadius: 12, padding: "11px", fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
            >
              View my reports
            </button>
          )}
          <div style={{ marginTop: 14 }}><PublicBoardLink accent={accent} /></div>
        </div>
      ) : !user ? (
        <div style={{ padding: "8px 2px" }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.55, margin: 0 }}>
            Please log in to submit a bug report — that way we can follow up with you and keep out spam.
          </p>
        </div>
      ) : (
        <>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" }}>
            {isFeature ? "Have an idea to improve Strug? Tell us what you'd like to see." : "Found something broken or confusing? Tell us what happened."}
          </p>

          {/* type toggle: bug vs feature */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[{ id: "bug", label: "Report a bug" }, { id: "feature", label: "Suggest a feature" }].map((opt) => {
              const active = reportType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setReportType(opt.id)}
                  // active branch was a fixed `#fff` on `${accent}26` (a translucent tint OVER the
                  // panel, not a solid fill) — in light mode that tint over a white panel reads as
                  // pale blue, and fixed white text on it disappears. var(--color-text-primary)
                  // flips with the panel so it stays legible on the tint either way.
                  className={active ? "text-text-primary" : "text-text-secondary"}
                  style={{ flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, background: active ? `${accent}26` : "var(--color-surface-raised)", border: `1px solid ${active ? accent : "var(--color-border)"}`, transition: "all 0.16s ease" }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor={`${uid}-title`} style={labelStyle}>Title</label>
            <input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isFeature ? "Short summary of your idea" : "Short summary of the issue"}
              maxLength={120}
              style={{ ...inputStyle, height: FIELD_HEIGHT }}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          {/* Custom selects — the native <select> drew its option list with OS chrome, so the menu
              came out light-on-dark and ignored our styling. CustomSelect renders the menu itself. */}
          <div style={{ display: "grid", gridTemplateColumns: isFeature ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {!isFeature && (
              <div>
                <label style={labelStyle}>Category</label>
                <CustomSelect ariaLabel="Category" value={category} options={CATEGORIES} onChange={setCategory} accent={accent} />
              </div>
            )}
            <div>
              <label style={labelStyle}>{isFeature ? "Priority" : "Severity"}</label>
              <CustomSelect ariaLabel={isFeature ? "Priority" : "Severity"} value={severity} options={SEVERITIES} onChange={setSeverity} accent={accent} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor={`${uid}-desc`} style={labelStyle}>{isFeature ? "Describe your idea" : "What happened?"}</label>
            <textarea
              id={`${uid}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isFeature ? "What should it do, who is it for, and why would it help?" : "Steps to reproduce, what you expected, what actually happened…"}
              maxLength={5000}
              rows={4}
              style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor={`${uid}-files`} style={labelStyle}>Screenshots (optional, up to {MAX_SCREENSHOTS})</label>
            <input id={`${uid}-files`} ref={fileRef} type="file" accept="image/*" multiple onChange={pickFiles} style={{ display: "none" }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="bg-surface-raised text-text-secondary"
              style={{ width: "100%", border: "1px dashed var(--color-border)", borderRadius: 12, padding: "11px", fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, cursor: "pointer", transition: "border-color 0.15s, color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${accent}88`; e.currentTarget.style.color = "var(--color-text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
            >
              + Attach image
            </button>
            {files.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {files.map((f, i) => (
                  <div key={i} className="bg-surface-raised" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 8, padding: "7px 10px", animation: "reportRowIn 0.2s ease both" }}>
                    <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 270 }}>{f.name}</span>
                    <button onClick={() => removeFile(i)} aria-label="Remove" className="text-text-secondary" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Technical details disclosure.
              We attach what the app knew when you hit report — the page, your device, the build,
              and any errors the app logged. That's what lets the team skip the "which page? which
              account? what threw?" round-trip. It is also console text, so the honest thing is to
              let the reporter read it before they send it. */}
          {context && (
            <div className="border border-border bg-surface-raised" style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setShowContext((v) => !v)}
                aria-expanded={showContext}
                className="text-text-secondary"
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "transparent", border: "none", padding: "11px 13px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, textAlign: "left" }}
              >
                <span>
                  Technical details attached
                  {(consoleErrors.length > 0 || apiFailures.length > 0) && (
                    <span className="text-text-secondary">
                      {" · "}
                      {consoleErrors.length > 0 && `${consoleErrors.length} error${consoleErrors.length === 1 ? "" : "s"}`}
                      {consoleErrors.length > 0 && apiFailures.length > 0 && ", "}
                      {apiFailures.length > 0 && `${apiFailures.length} failed request${apiFailures.length === 1 ? "" : "s"}`}
                    </span>
                  )}
                </span>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", transform: showContext ? "rotate(180deg)" : "none", transition: "transform 0.18s ease" }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {showContext && (
                <div className="text-text-secondary" style={{ borderTop: "1px solid var(--color-border-subtle)", padding: "12px 13px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, lineHeight: 1.65, animation: "reportRowIn 0.16s ease both" }}>
                  <div>page · {context.nav_id || "—"}</div>
                  <div>screen · {context.viewport} ({context.device_type})</div>
                  {context.build_sha && <div>build · {context.build_sha}</div>}
                  <div>signed in · {context.session?.authenticated ? "yes" : "no"}</div>

                  {consoleErrors.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="text-text-muted" style={{ marginBottom: 4 }}>errors the app logged</div>
                      {consoleErrors.map((e, i) => (
                        <div key={i} style={{ color: "#f87171", wordBreak: "break-word", marginBottom: 3 }}>· {e.message}</div>
                      ))}
                    </div>
                  )}

                  {apiFailures.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="text-text-muted" style={{ marginBottom: 4 }}>requests that failed</div>
                      {apiFailures.map((a, i) => (
                        <div key={i} style={{ wordBreak: "break-word", marginBottom: 3 }}>
                          · <span style={{ color: "#fbbf24" }}>{a.status || "network"}</span> {a.method} {a.path}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-text-muted" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--color-border-subtle)", fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, lineHeight: 1.5 }}>
                    No passwords, tokens or message contents are ever included.
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#f87171", fontSize: 13, margin: "0 0 12px", lineHeight: 1.45, animation: "reportRowIn 0.18s ease both" }}>{error}</p>
          )}

          <button onClick={submit} disabled={submitting} style={primaryBtn(submitting)}>
            {submitting ? "Submitting…" : isFeature ? "Submit suggestion" : "Submit report"}
          </button>

          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <PublicBoardLink accent={accent} />
            {onViewReports && (
              <button
                onClick={() => close(onViewReports)}
                className="text-text-secondary"
                style={{ background: "transparent", border: "none", padding: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, cursor: "pointer", transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
              >
                My reports
              </button>
            )}
          </div>
        </>
      ))}
    </ModalShell>
  );
}
