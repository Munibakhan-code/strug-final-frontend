import { useViewport } from "../hooks/useViewport.js";

// Shared "Coming Soon" full-page overlay. Extracted from the original
// Portfolio.jsx so any vertical temporarily hidden from the app (see
// HIDDEN_VERTICALS in App.jsx) renders a consistent placeholder instead of
// the real page. Pass either a `navId` (looked up in COMING_SOON_COPY) or an
// explicit `title`/`tagline`.
const COMING_SOON_COPY = {
  learn: { title: "Learn", tagline: "Courses and skill-building, coming soon." },
  lessons: { title: "Lessons", tagline: "Book lessons with top instructors, coming soon." },
  portfolio: { title: "Portfolio", tagline: "Showcase your creative work to the world." },
};

function ComingSoonPage({ navId, title, tagline, eta }) {
  const { isMobile } = useViewport();
  const copy = COMING_SOON_COPY[navId] || {};
  const heading = title || copy.title || "Coming Soon";
  const sub = tagline || copy.tagline || "";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: isMobile ? 16 : 108, paddingRight: isMobile ? 16 : 48, overflow: "hidden", position: "relative" }}>
      {/* Blurred grid content underneath */}
      <div style={{ flex: 1, filter: "blur(6px)", opacity: 0.35, pointerEvents: "none", display: "flex", flexWrap: "wrap", gap: 16, padding: "40px 32px", alignContent: "flex-start" }}>
        {[...Array(12)].map((_, i) => (
          <div key={i} style={{ width: 220, height: 280, borderRadius: 14, background: `linear-gradient(135deg, hsl(${i * 30}, 40%, 15%), hsl(${i * 30 + 30}, 30%, 8%))`, flexShrink: 0 }} />
        ))}
      </div>
      {/* Overlay */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(6,8,16,0.55)", backdropFilter: "blur(2px)" }}>
        <div style={{ textAlign: "center", animation: "fadeUp 0.4s ease both" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#2563eb", marginBottom: 14 }}>Coming Soon</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(38px, 5vw, 68px)", color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1, marginBottom: 14 }}>{heading}</h2>
          {eta && <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "clamp(18px, 2.5vw, 28px)", color: "#2563eb", letterSpacing: "0.08em", textTransform: "uppercase" }}>{eta}</p>}
          {sub && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 12 }}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export { ComingSoonPage, COMING_SOON_COPY };
