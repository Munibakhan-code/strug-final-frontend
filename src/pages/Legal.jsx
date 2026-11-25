// #429: the platform's legal documents — Terms of Service, Privacy Policy, Cookie Policy.
//
// Reachable at /legal, and directly at /terms, /privacy and /cookies so the documents can be
// linked to individually (which is what a signup flow needs — it has to point at the Terms, not
// at a tabbed page the user then has to hunt through).
import { useEffect, useState } from "react";
import { LEGAL_DOCS } from "../content/legal.js";
import { useViewport } from "../hooks/useViewport.js";

const LEGAL_TABS = [
  { id: "terms", label: "Terms of Service" },
  { id: "privacy", label: "Privacy Policy" },
  { id: "cookies", label: "Cookie Policy" },
  // #482: seeded demo profiles use freely-licensed images from Wikimedia Commons. CC BY / CC BY-SA
  // permit commercial use but REQUIRE attribution, and the licence explicitly allows satisfying that
  // with a link to a page carrying the credits. This is that page. It is generated from
  // strug_backend-main/scripts/seed-avatar-attributions.json — regenerate rather than hand-edit.
  // Remove this tab (and the doc) when the demo accounts are removed.
  { id: "credits", label: "Image Credits" },
];

/** Which document a URL is asking for. /terms, /privacy, /cookies, or /legal/<doc>. */
function legalDocFromPath(pathname = window.location.pathname) {
  const segs = pathname.replace(/^\//, "").split("/");
  const first = (segs[0] || "").toLowerCase();
  if (first === "terms") return "terms";
  if (first === "privacy") return "privacy";
  if (first === "cookies" || first === "cookie") return "cookies";
  if (first === "credits") return "credits";
  const sub = (segs[1] || "").toLowerCase();
  return LEGAL_DOCS[sub] ? sub : "terms";
}

export default function LegalPage() {
  const { isMobile } = useViewport();
  const [doc, setDoc] = useState(() => legalDocFromPath());

  // Keep the tab and the URL in step, so browser Back moves between documents rather than
  // leaving the page.
  useEffect(() => {
    const onPop = () => setDoc(legalDocFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const select = (id) => {
    setDoc(id);
    try {
      window.history.pushState({ nav: "legal" }, "", `/${id === "cookies" ? "cookies" : id}`);
    } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  };

  const d = LEGAL_DOCS[doc] ?? LEGAL_DOCS.terms;

  return (
    // #429: exempt from the logged-out preview click-gate. The legal documents must be readable
    // WITHOUT an account — the signup flow links straight at /terms, so bouncing a visitor to
    // sign-in when they try to read the terms they are being asked to agree to would be absurd.
    <div data-preview-allow className="bg-bg" style={{ minHeight: "100dvh", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 90 : 60 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", paddingTop: 32 }}>
        <h1 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 30 : 40, textTransform: "uppercase", letterSpacing: "0.03em", margin: "0 0 6px" }}>
          Legal
        </h1>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, margin: "0 0 22px" }}>
          {d.org}
        </p>

        {/* Document switcher */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 26, borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 14 }}>
          {LEGAL_TABS.map((tabItem) => {
            const active = tabItem.id === doc;
            return (
              <button
                key={tabItem.id}
                onClick={() => select(tabItem.id)}
                style={{
                  background: active ? "rgba(37,99,235,0.15)" : "transparent",
                  border: `1px solid ${active ? "rgba(37,99,235,0.5)" : "var(--color-border)"}`,
                  color: active ? "#60a5fa" : "var(--color-text-secondary)",
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all .15s ease",
                }}
              >
                {tabItem.label}
              </button>
            );
          })}
        </div>

        <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: isMobile ? 24 : 30, textTransform: "uppercase", letterSpacing: "0.03em", margin: "0 0 4px" }}>
          {d.title}
        </h2>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "0 0 26px" }}>
          {d.effective}
        </p>

        <article>
          {d.blocks.map((b, i) => {
            if (b.t === "h") {
              return (
                <h3
                  key={i}
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 800,
                    fontSize: b.lvl >= 2 ? 17 : 20,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: b.lvl >= 2 ? "var(--color-text-primary)" : "#60a5fa",
                    margin: i === 0 ? "0 0 10px" : "28px 0 10px",
                  }}
                >
                  {b.x}
                </h3>
              );
            }
            if (b.t === "li") {
              return (
                <li
                  key={i}
                  className="text-text-secondary"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.75, margin: "0 0 8px 20px" }}
                >
                  {b.x}
                </li>
              );
            }
            return (
              <p
                key={i}
                className="text-text-secondary"
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.75, margin: "0 0 14px" }}
              >
                {b.x}
              </p>
            );
          })}
        </article>
      </div>
    </div>
  );
}
