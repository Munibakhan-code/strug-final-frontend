import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* Central registry of keyboard shortcuts — the single source of truth for the `?` help
   overlay. Global shortcuts work anywhere; contextual ones apply on a specific surface. */
export const SHORTCUTS = [
  { keys: ["⌘/Ctrl", "K"], label: "Open the command palette", ctx: "Global" },
  { keys: ["?"], label: "Show this keyboard-shortcuts sheet", ctx: "Global" },
  { keys: ["Esc"], label: "Close the palette, a dialog, or this sheet", ctx: "Global" },
  { keys: ["↑", "↓"], label: "Move through results / lists", ctx: "Global" },
  { keys: ["Enter"], label: "Open the highlighted result", ctx: "Global" },
  { keys: ["Space", "K"], label: "Play / pause", ctx: "Video player" },
  { keys: ["M"], label: "Mute / unmute", ctx: "Video player" },
  { keys: ["F"], label: "Toggle fullscreen", ctx: "Video player" },
  { keys: ["J", "L"], label: "Seek back / forward 10s", ctx: "Video player" },
  { keys: ["←", "→"], label: "Seek back / forward 5s", ctx: "Video player" },
  { keys: ["0", "–", "9"], label: "Jump to 0–90% of the video", ctx: "Video player" },
];

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 10001,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "12vh 20px 20px",
  background: "rgba(0,0,0,0.5)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const panelStyle = {
  width: "100%",
  maxWidth: 560,
  borderRadius: 16,
  boxShadow: "0 24px 70px var(--color-shadow)",
  overflow: "hidden",
  fontFamily: "'DM Sans', sans-serif",
};
const panelClassName = "bg-surface border border-border";

function Kbd({ children }) {
  return (
    <span className="bg-surface-raised border border-border text-text-primary" style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 22, height: 22, padding: "0 6px", borderRadius: 6,
      fontSize: 11.5, fontWeight: 700,
    }}>{children}</span>
  );
}

/* ⌘K command palette — fuzzy-jump to any page. Pure inline styles, no dependencies. */
export function CommandPalette({ open, onClose, items, onNavigate, labelFor }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const label = (it) => (labelFor ? labelFor(it) : it.label);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const uniqueItems = [];
    const seen = new Set();
    for (const it of items || []) {
      const key = String(it?.id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueItems.push(it);
    }
    const scored = uniqueItems
      .map((it) => {
        const name = label(it).toLowerCase();
        const hay = [name, it.id, ...(it.keywords || [])].join(" ").toLowerCase();
        if (!q) return { it, score: 0 };
        if (name.startsWith(q)) return { it, score: 3 };
        if (name.includes(q)) return { it, score: 2 };
        if (hay.includes(q)) return { it, score: 1 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.it);
  }, [items, query, labelFor]);

  // Reset when opened; focus the input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // focus after the portal mounts
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (it) => {
    if (!it) return;
    onNavigate(it.id);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
  };

  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={panelClassName}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page…"
            aria-label="Search pages"
            className="text-text-primary"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="styled-scrollbar" style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {results.length === 0 ? (
            <div className="text-text-secondary" style={{ padding: "24px 16px", textAlign: "center", fontSize: 13 }}>No pages match “{query}”.</div>
          ) : (
            results.map((it, i) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.id}
                  data-idx={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(it)}
                  aria-selected={i === active}
                  className="text-text-primary"
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                    padding: "10px 12px", borderRadius: 9, border: "none", cursor: "pointer",
                    background: i === active ? "rgba(37,99,235,0.28)" : "transparent",
                    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                  }}
                >
                  <span className="text-text-secondary" style={{ display: "inline-flex", width: 20, height: 20, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
                    {typeof Icon === "function" ? <Icon /> : null}
                  </span>
                  <span>{label(it)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* `?` keyboard-shortcuts cheat sheet. */
export function ShortcutsHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const groups = SHORTCUTS.reduce((acc, s) => {
    (acc[s.ctx] = acc[s.ctx] || []).push(s);
    return acc;
  }, {});

  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className={panelClassName} style={{ ...panelStyle, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, textTransform: "uppercase", letterSpacing: "0.02em" }}>Keyboard shortcuts</span>
          <button onClick={onClose} aria-label="Close" className="text-text-secondary" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div className="styled-scrollbar" style={{ maxHeight: "60vh", overflowY: "auto", padding: "8px 18px 18px" }}>
          {Object.entries(groups).map(([ctx, list]) => (
            <div key={ctx} style={{ marginTop: 14 }}>
              <div className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{ctx}</div>
              {list.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0" }}>
                  <span className="text-text-primary" style={{ fontSize: 13.5 }}>{s.label}</span>
                  <span style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    {s.keys.map((k, j) => <Kbd key={j}>{k === "⌘/Ctrl" ? (IS_MAC ? "⌘" : "Ctrl") : k}</Kbd>)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
