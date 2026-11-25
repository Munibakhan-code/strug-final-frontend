import { useState, useEffect, useLayoutEffect } from "react";
import {
  HomeIcon, RideshareIcon, ShopIcon, FoodIcon, VideoIcon, SocialIcon,
  EarnIcon, WalletEarningsIcon, ProServicesIcon, TempStayIcon,
  // Per-portal icons for the /provider hub (each portal gets its own, not a group icon).
  LiveIcon, CelebrityIcon, InfluencerIcon, ArtistsIcon, BooksIcon, GroceriesIcon,
  FloralIcon, SecondHandIcon, DigProductsIcon, CateringIcon, DiscountsIcon, CourierIcon,
  OnDemandIcon, DashboardIcon, DigServicesIcon, AutomotiveIcon, MedicalIcon, LearnIcon,
  DecorIcon, WeddingIcon, HotelIcon, VenuesIcon, VehiclesIcon, EquipmentIcon, RealEstateIcon,
  PreconstructIcon, ExperiencesIcon, EventsIcon, ReservationsIcon, InsuranceIcon, MortgageIcon,
  OrdersIcon, PortfolioIcon,
} from "./icons.jsx";
import { getSellerPortalStatus } from "../api/analytics.js";
import { getUser } from "../store/auth.js";
import { useViewport } from "../hooks/useViewport.js";
import { CATEGORY_ONBOARDING } from "./categoryOnboarding.js";

// Each seller portal gets its OWN icon (from the shared icon set), so rows in a group are
// visually distinct rather than all sharing the category glyph.
const PORTAL_ICON = {
  "sd-creator": VideoIcon, "sd-streamer": LiveIcon, "sd-celebrity": CelebrityIcon,
  "sd-influencer": InfluencerIcon, "sd-artist": ArtistsIcon, "sd-authors": BooksIcon,
  "sd-ecommerce": ShopIcon, "sd-food": FoodIcon, "sd-groceries": GroceriesIcon,
  "sd-flowers": FloralIcon, "sd-usedproducts": SecondHandIcon, "sd-digproducts": DigProductsIcon,
  "sd-mealkit": OrdersIcon, "sd-catering": CateringIcon, "sd-listdiscounts": DiscountsIcon,
  "sd-drive": RideshareIcon, "sd-courier": CourierIcon, "sd-work": OnDemandIcon, "sd-jobs": DashboardIcon,
  "sd-services": ProServicesIcon, "sd-proservices": PortfolioIcon, "sd-freelancer": DigServicesIcon,
  "sd-automotive": AutomotiveIcon, "sd-doctors": MedicalIcon, "sd-instructor": LearnIcon,
  "sd-decor": DecorIcon, "sd-wedding": WeddingIcon,
  "sd-host": TempStayIcon, "sd-hotel": HotelIcon, "sd-venue": VenuesIcon, "sd-vehicle": VehiclesIcon,
  "sd-equipment": EquipmentIcon, "sd-realestate": RealEstateIcon, "sd-precon": PreconstructIcon,
  "sd-experiences": ExperiencesIcon, "sd-events": EventsIcon, "sd-restbookings": ReservationsIcon,
  "sd-insurance": InsuranceIcon, "sd-mortgage": MortgageIcon,
};

/*
 * Onboarding surfaces requested by Codezero (2026-06-23):
 *  - WelcomeModal: one-time "Welcome to Strug" hub shown to new users so they know
 *    where to navigate (orient by destination). Approved mockup "Option A".
 *  - BecomeHub: a discoverable, grouped entry point for the ~39 "Become a …" seller
 *    flows that were previously buried behind the unlabeled "More" flyout. Reuses the
 *    same navId targets as MORE_ITEMS in App.jsx. Approved mockup "Option E".
 *
 * Styling matches the app: 'Barlow Condensed' headings + 'DM Sans' body, dark theme,
 * blue (#2563eb) = "use Strug", gold (#f5a623) = "earn on Strug".
 */

const HEAD = "'Barlow Condensed', sans-serif";
const BODY = "'DM Sans', sans-serif";

// Use the REAL sidebar icon components (from icons.jsx) so the onboarding surfaces
// — especially the guided tour, which spotlights actual sidebar buttons — show the
// exact same glyphs as the sidebar. They render with stroke="currentColor", so they
// inherit each container's `color` just like the old hand-drawn glyphs did. Nav-item
// keys map 1:1 to the sidebar; the Become-hub category keys map to their closest
// sidebar equivalent.
const Ico = {
  home: HomeIcon,
  ride: RideshareIcon,
  shop: ShopIcon,
  food: FoodIcon,
  video: VideoIcon,
  social: SocialIcon,
  wallet: WalletEarningsIcon,
  create: VideoIcon,
  sell: ShopIcon,
  drive: RideshareIcon,
  service: ProServicesIcon,
  host: TempStayIcon,
  money: EarnIcon,
};

// Renders a sidebar icon component at the given size. (`icon` is a component, not a path.)
function Glyph({ icon: Icon, size = 22 }) {
  return Icon ? <Icon s={size} /> : null;
}

/* ------------------------------------------------------------------ */
/* WelcomeModal — Option A                                            */
/* ------------------------------------------------------------------ */
const WELCOME_TILES = [
  { id: "rideshare", icon: Ico.ride,   title: "Rideshare", desc: "Book a ride or set your own price", hot: true },
  { id: "shop",      icon: Ico.shop,   title: "Shop",      desc: "Browse stores & local sellers" },
  { id: "food",      icon: Ico.food,   title: "Food",      desc: "Order from restaurants near you" },
  { id: "videos",    icon: Ico.video,  title: "Videos",    desc: "Watch, post & go live" },
  { id: "social",    icon: Ico.social, title: "Town Hall", desc: "Your feed & community" },
  { id: "wallet",    icon: Ico.wallet, title: "Wallet",    desc: "Top up, send & earn" },
];

export function WelcomeModal({ onClose, onNavigate, onEarn, onTour }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 2000, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
      // Modal scrim — stays a dark dimming overlay regardless of theme (consistent with
      // every other modal backdrop in the app).
      background: "radial-gradient(120% 90% at 50% 30%, rgba(3,6,15,.55), rgba(2,4,11,.9))",
      backdropFilter: "blur(3px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="border border-border" style={{
        position: "relative", width: "100%", maxWidth: 760, padding: "42px 44px 34px",
        background: "linear-gradient(180deg, var(--color-surface-raised), var(--color-surface))",
        borderRadius: 24, boxShadow: "0 40px 120px var(--color-shadow)", maxHeight: "92vh", overflowY: "auto",
        animation: "fadeUp 0.3s ease both",
      }}>
        <button onClick={onClose} aria-label="Close" style={closeBtn}>✕</button>
        <span style={eyebrow("#7fa6ff")}><i style={dot("#7fa6ff")} />Welcome to Strug</span>
        <h1 className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 34, letterSpacing: "0.01em", margin: "12px 0 0", lineHeight: 1.05 }}>
          One app for all of it.
        </h1>
        <p style={sub}>Rides, shopping, food, video, payments, and your community. Pick where you want to start.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, margin: "26px 0 26px" }}>
          {WELCOME_TILES.map((t) => (
            <button key={t.id} onClick={() => onNavigate(t.id)} style={tile(t.hot, "#2f6bff")}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(95,140,255,.55)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = t.hot ? "rgba(95,140,255,.45)" : "var(--color-border)")}>
              <div style={tileIc(t.hot, "#2f6bff")}><Glyph icon={t.icon} /></div>
              <h4 style={tileH}>{t.title}</h4>
              <p style={tileP}>{t.desc}</p>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => (onTour ? onTour() : onClose())} style={btnPrimary("#2f6bff", "#1e4fd6", "#fff")}>Take a quick tour →</button>
          <button onClick={() => onEarn?.()} style={btnGhost}>Show me how to earn</button>
          <button onClick={onClose} className="text-text-secondary" style={{ ...btnGhost, background: "none", border: "none" }}>Skip</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CategoryOnboardCard — first-time-in-a-vertical explainer           */
/* (Codezero 2026-06-23): the first time a user opens a category, show */
/* a short, dismissible "here's how this works" card. Shown once per   */
/* category per device (localStorage) — AppInner owns the gating.      */
/* Content lives in ./categoryOnboarding.js so this file keeps         */
/* exporting only components (react-refresh rule).                     */
/* ------------------------------------------------------------------ */

export function CategoryOnboardCard({ vertical, onClose, onDisableAll, accent: accentProp }) {
  const cfg = CATEGORY_ONBOARDING[vertical];
  const [optOut, setOptOut] = useState(false);
  if (!cfg) return null;
  // Prefer the app's real per-vertical colour (PAGE_COLORS, passed from AppInner) so the card
  // matches the page it opens over; fall back to the content accent for verticals with no
  // PAGE_COLORS entry (e.g. medical).
  const accent = accentProp || cfg.accent || "#2f6bff";
  // "Got it" / "Skip" / ✕ / backdrop all dismiss this card (marks the category seen). If the user
  // ticked "don't show these again", dismiss globally instead so no vertical shows a card.
  const finish = () => { if (optOut && onDisableAll) onDisableAll(); else onClose(); };
  return (
    <div onClick={finish} style={{
      position: "fixed", inset: 0, zIndex: 1900, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
      // Modal scrim — stays a dark dimming overlay regardless of theme (consistent with
      // every other modal backdrop in the app).
      background: "radial-gradient(120% 90% at 50% 30%, rgba(3,6,15,.5), rgba(2,4,11,.85))",
      backdropFilter: "blur(3px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="border border-border" style={{
        position: "relative", width: "100%", maxWidth: 420, padding: "34px 30px 26px",
        background: "linear-gradient(180deg, var(--color-surface-raised), var(--color-surface))",
        borderRadius: 22, boxShadow: "0 40px 120px var(--color-shadow)", maxHeight: "92vh", overflowY: "auto",
        animation: "fadeUp 0.3s ease both",
      }}>
        <button onClick={finish} aria-label="Close" style={closeBtn}>✕</button>
        {/* Icon uses the accent color (not white) — its background is a translucent accent tint
            that can render very light in light theme, so fixed white would disappear. */}
        <div style={{ width: 56, height: 56, borderRadius: 16, background: `${accent}30`, display: "grid", placeItems: "center", lineHeight: 0, color: accent, marginBottom: 16 }}>
          <Glyph icon={cfg.icon} size={28} />
        </div>
        <span style={eyebrow(accent)}><i style={dot(accent)} />First time here</span>
        <h2 className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, letterSpacing: ".01em", margin: "10px 0 0", lineHeight: 1.1 }}>{cfg.title}</h2>
        <p style={{ ...sub, marginTop: 10, fontSize: 14 }}>{cfg.tagline}</p>
        {cfg.points?.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "18px 0 22px", display: "flex", flexDirection: "column", gap: 10 }}>
            {cfg.points.map((p, i) => (
              <li key={i} className="text-text-secondary" style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: BODY, fontSize: 13.5, lineHeight: 1.4 }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", background: `${accent}22`, color: accent, fontFamily: HEAD, fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{i + 1}</span>
                {p}
              </li>
            ))}
          </ul>
        )}
        <label className="text-text-secondary" style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", margin: cfg.points?.length ? "0 0 16px" : "18px 0 16px", fontFamily: BODY, fontSize: 12.5 }}>
          {/* Custom checkbox: a visually-hidden native input (keeps keyboard + a11y) behind an
              accent-tinted box that shows a checkmark when ticked. */}
          <span style={{
            position: "relative", flexShrink: 0, width: 18, height: 18, borderRadius: 5,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: `1.5px solid ${optOut ? accent : "var(--color-border)"}`,
            background: optOut ? accent : "transparent", transition: "background .15s, border-color .15s",
          }}>
            <input type="checkbox" checked={optOut} onChange={(e) => setOptOut(e.target.checked)}
              style={{ position: "absolute", inset: 0, opacity: 0, margin: 0, cursor: "pointer" }} />
            {optOut && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            )}
          </span>
          Don&apos;t show these tips again
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={finish} style={{ ...btnPrimary(accent, accent, "#fff"), flex: 1 }}>Got it</button>
          <button onClick={finish} style={{ ...btnGhost, padding: "14px 20px" }}>Skip</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BecomeHub — Option E (rendered as a page at activeNav==="become")  */
/* ------------------------------------------------------------------ */
const BECOME_GROUPS = [
  { key: "create",  icon: Ico.create,  title: "Create & Stream", blurb: "Post videos, go live, build an audience",
    items: [["sd-creator","Become a Creator"],["sd-streamer","Become a Streamer"],["sd-celebrity","Celebrity / Talent"],["sd-influencer","Influencers Portal"],["sd-artist","Starving Artist"],["sd-authors","Authors"]] },
  { key: "sell",    icon: Ico.sell,    title: "Sell", blurb: "Open a shop and sell products or goods",
    items: [["sd-ecommerce","Sell on Strug"],["sd-food","Sell Food"],["sd-groceries","Sell Groceries"],["sd-flowers","Sell Flowers"],["sd-usedproducts","Sell Used Products"],["sd-digproducts","Sell Digital Products"],["sd-catering","Provide Catering"],["sd-listdiscounts","List Discounts"]] },
  { key: "drive",   icon: Ico.drive,   title: "Drive & Deliver", blurb: "Rideshare, courier runs or on-demand work",
    items: [["sd-drive","Strug Drive"],["sd-courier","Become a Courier"],["sd-work","Become a Worker"],["sd-jobs","Post jobs / Hire"]] },
  { key: "service", icon: Ico.service, title: "Offer a Service", blurb: "Trades, medical, freelance & professional",
    items: [["sd-services","Provide a Service"],["sd-proservices","Professionals Portal"],["sd-freelancer","Freelancer"],["sd-automotive","Automotive Provider"],["sd-doctors","Doctors Portal"],["sd-decor","Décor Provider"],["sd-wedding","Wedding Services"]] },
  { key: "host",    icon: Ico.host,    title: "Host & Rent", blurb: "Stays, venues, vehicles & real estate",
    items: [["sd-host","Host"],["sd-hotel","Hotel Provider"],["sd-venue","Venue Provider"],["sd-vehicle","Vehicle Provider"],["sd-equipment","Rent Equipment"],["sd-realestate","Real Estate Agent"],["sd-precon","Precon. Developer"],["sd-experiences","Experience Provider"],["sd-events","Events & Occasions"],["sd-restbookings","Restaurant Bookings"]] },
  { key: "money",   icon: Ico.money,   title: "Money & Finance", blurb: "Become a finance provider",
    items: [["sd-insurance","Become an Insurance Provider"],["sd-mortgage","Become a Mortgage Provider"]] },
];

const GOLD = "#f5a623";

/** Strip diacritics so "decor" matches "Décor", "cafe" matches "Café", etc. */
function normalizeSearch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function portalSearchMatch(nav, label, query) {
  if (!query) return true;
  const q = normalizeSearch(query);
  return normalizeSearch(label).includes(q) || normalizeSearch(nav).includes(q);
}

export function BecomeHub({ onNavigate }) {
  const { isMobile } = useViewport();
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  // #372: BecomeHub was fully hard-coded to desktop — the 148px left pad is the
  // desktop-sidebar clearance, which shoves everything off-centre on a phone
  // (the sidebar is hidden there), and the 3-col / 2-col grids overflow. Mirror
  // the responsive treatment SellerHub already uses.
  const wrapPad = isMobile ? "24px 16px 48px 16px" : "40px 40px 60px 148px";
  const groupCols = isMobile ? "1fr" : "repeat(3,1fr)";
  const itemCols = isMobile ? "1fr" : "repeat(2,1fr)";

  // When searching, flatten + filter across every flow so nothing stays hidden.
  const searchHits = query
    ? BECOME_GROUPS.flatMap((g) => g.items)
        .filter(([nav, label]) => portalSearchMatch(nav, label, query))
    : null;

  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0,
      background: "radial-gradient(90% 60% at 50% -10%, rgba(245,166,35,.10), transparent 60%)" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: wrapPad, fontFamily: BODY }}>
        <span style={eyebrow(GOLD)}><i style={dot(GOLD)} />Start earning on Strug</span>
        <h1 className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: isMobile ? 30 : 40, letterSpacing: "0.01em", margin: "12px 0 0", lineHeight: 1.04 }}>
          Strug isn't just for spending.
        </h1>
        <p style={{ ...sub, maxWidth: 620 }}>
          Drive, sell, create, host or offer a service — there are dozens of ways to earn. Pick a path and you'll be set up in minutes.
        </p>
        <button onClick={() => onNavigate("provider")}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, cursor: "pointer",
            fontFamily: BODY, fontSize: 13, fontWeight: 700, color: "#2f9e44", background: "rgba(47,158,68,.10)",
            border: "1px solid rgba(47,158,68,.32)", borderRadius: 20, padding: "8px 15px" }}>
          See your portals
          <span style={{ fontSize: 15 }}>→</span>
        </button>

        <div style={{ position: "relative", margin: "24px 0 8px", maxWidth: 420 }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2"
            style={{ position: "absolute", left: 14, top: 13 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all ways to earn…"
            className="bg-surface-raised border border-border text-text-primary"
            style={{ width: "100%", padding: "11px 14px 11px 38px", borderRadius: 12,
              fontFamily: BODY, fontSize: 14, outline: "none" }} />
        </div>

        {searchHits ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {searchHits.length === 0 && <p className="text-text-muted" style={{ fontSize: 14, padding: "16px 2px" }}>No matches for “{q}”.</p>}
            {searchHits.map(([nav, label]) => (
              <button key={nav} onClick={() => onNavigate(nav)} style={optRow}>
                <span style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 16, letterSpacing: ".01em" }}>{label}</span>
                <span style={{ marginLeft: "auto", color: GOLD, fontWeight: 700, fontSize: 18 }}>→</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: groupCols, gap: 14, marginTop: 20 }}>
            {BECOME_GROUPS.map((g) => {
              const isOpen = open === g.key;
              return (
                <div key={g.key} style={{ gridColumn: isOpen ? "1 / -1" : "auto" }}>
                  <button onClick={() => setOpen(isOpen ? null : g.key)} style={groupCard(isOpen)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={tileIc(isOpen, GOLD)}><Glyph icon={g.icon} /></div>
                      <div style={{ textAlign: "left", flex: 1 }}>
                        <h4 style={{ ...tileH, fontSize: 16 }}>{g.title}</h4>
                        <p style={{ ...tileP, marginTop: 2 }}>{isOpen ? g.blurb : `${g.items.length} ways`}</p>
                      </div>
                      <span className="text-text-muted" style={{ fontSize: 18, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ display: "grid", gridTemplateColumns: itemCols, gap: 8, marginTop: 10, animation: "fadeUp 0.25s ease both" }}>
                      {g.items.map(([nav, label]) => (
                        <button key={nav} onClick={() => onNavigate(nav)} style={optRow}>
                          <span style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 15, letterSpacing: ".01em" }}>{label}</span>
                          <span style={{ marginLeft: "auto", color: GOLD, fontWeight: 700, fontSize: 17 }}>→</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----- shared inline-style helpers ----- */
const closeBtn = { position: "absolute", top: 18, right: 20, width: 30, height: 30, borderRadius: 9,
  background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 13 };
const eyebrow = (c) => ({ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: BODY, fontSize: 12, fontWeight: 700,
  letterSpacing: ".16em", textTransform: "uppercase", color: c });
const dot = (c) => ({ width: 7, height: 7, borderRadius: "50%", background: c, boxShadow: `0 0 12px ${c}` });
const sub = { fontFamily: BODY, color: "var(--color-text-secondary)", fontSize: 15, lineHeight: 1.5, marginTop: 12 };
const tile = (hot, c) => ({ textAlign: "left", cursor: "pointer", background: hot ? `linear-gradient(180deg,${c}28,${c}0a)` : "var(--color-surface-raised)",
  border: `1px solid ${hot ? "rgba(95,140,255,.45)" : "var(--color-border)"}`, borderRadius: 16, padding: "18px 16px", transition: "border-color .2s" });
// Hot-tile icon uses the accent color (not white) for its icon glyph — the hot background is a
// translucent accent tint that can render very light in light theme, so fixed white would disappear.
const tileIc = (hot, c) => ({ width: 42, height: 42, borderRadius: 12, background: hot ? `${c}40` : "var(--color-surface-raised)",
  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, color: hot ? c : "var(--color-text-secondary)" });
const tileH = { fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: "var(--color-text-primary)", letterSpacing: ".01em" };
const tileP = { fontFamily: BODY, fontSize: 12, color: "var(--color-text-muted)", marginTop: 3, lineHeight: 1.35 };
const groupCard = (open) => ({ width: "100%", cursor: "pointer", background: open ? "linear-gradient(180deg,rgba(245,166,35,.14),rgba(245,166,35,.03))" : "var(--color-surface-raised)",
  border: `1px solid ${open ? "rgba(245,180,80,.4)" : "var(--color-border)"}`, borderRadius: 16, padding: "16px", transition: "all .2s" });
const optRow = { display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left", color: "var(--color-text-primary)",
  background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "13px 15px" };
const btnPrimary = (a, b, fg) => ({ fontFamily: HEAD, fontWeight: 700, fontSize: 15, letterSpacing: ".02em", border: "none", borderRadius: 12,
  cursor: "pointer", padding: "14px 26px", background: `linear-gradient(180deg,${a},${b})`, color: fg, boxShadow: `0 10px 30px ${a}55` });
const btnGhost = { fontFamily: HEAD, fontWeight: 700, fontSize: 15, border: "1px solid var(--color-border)", borderRadius: 12,
  cursor: "pointer", padding: "14px 22px", background: "var(--color-surface-raised)", color: "var(--color-text-primary)" };

/* ------------------------------------------------------------------ */
/* SellerHub — the /seller page                                       */
/* A single place to see every seller portal at a glance. Portals the */
/* user has applied/registered for are "Active" (full colour → opens  */
/* the live dashboard); the rest are greyed "Apply" (still clickable — */
/* clicking opens that portal's apply gate). Status comes from         */
/* GET /seller-portals/me/status; unmapped verticals read as not-      */
/* applied. Reuses BECOME_GROUPS so it always lists the same flows as  */
/* the Earn hub.                                                       */
/* ------------------------------------------------------------------ */
// Forest green = the /provider page's signature colour (matches PAGE_COLORS.provider so the
// sidebar chevrons + chrome tint to it). Used for the hub's eyebrow/title accent + active states.
const SELLER_GREEN = "#2f9e44";

// sd-<x> nav id -> the PAGE_COLORS key for that vertical, for the cases where stripping
// "sd-" doesn't already match a PAGE_COLORS key (e.g. sd-drive lives under "rideshare").
const PORTAL_VERTICAL = {
  "sd-creator": "videos", "sd-streamer": "live", "sd-artist": "artists", "sd-authors": "books",
  "sd-ecommerce": "shop", "sd-flowers": "floral", "sd-usedproducts": "secondhand",
  "sd-mealkit": "food", "sd-listdiscounts": "discounts",
  "sd-drive": "rideshare", "sd-work": "ondemand", "sd-jobs": "jobs",
  "sd-services": "proservices", "sd-freelancer": "digservices", "sd-doctors": "medical", "sd-instructor": "learn",
  "sd-decor": "decor", "sd-wedding": "wedding", "sd-automotive": "automotive",
  "sd-host": "tempstay", "sd-venue": "venues", "sd-vehicle": "vehicles", "sd-precon": "preconstruct", "sd-restbookings": "reservations",
};
function portalColor(nav, pageColors = {}) {
  const key = PORTAL_VERTICAL[nav] || nav.replace(/^sd-/, "");
  return pageColors[key] || SELLER_GREEN;
}

// Portals whose dashboard gate is a PERSISTED user flag (is_seller / is_creator). The
// server-side registration table (store_profile/channel) can lag right after a user applies
// (the row is only created once they set up a store/channel), which left these portals greyed
// until "reapply" (#187). OR-in the durable user flag so they light up the moment you apply.
const PORTAL_USER_FLAG = {
  "sd-ecommerce": "is_seller", "sd-usedproducts": "is_seller",
  "sd-listdiscounts": "is_seller", "sd-flowers": "is_seller",
  "sd-authors": "is_creator", "sd-digproducts": "is_creator",
  "sd-creator": "is_creator", "sd-streamer": "is_creator",
};
function PortalRow({ nav, label, active, color, icon, onNavigate }) {
  const [hov, setHov] = useState(false);
  const lit = active || hov;
  const accent = color || SELLER_GREEN;
  const Icon = icon; // a per-portal icon component from icons.jsx (renders with currentColor)
  return (
    <button
      onClick={() => onNavigate(nav)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={active ? "Open your dashboard" : "Apply to this portal"}
      style={{
        display: "flex", alignItems: "center", gap: 11, textAlign: "left", cursor: "pointer", width: "100%",
        borderRadius: 12, padding: "11px 14px", transition: "all .18s ease",
        background: active ? `${accent}14` : (hov ? "var(--color-surface-raised)" : "transparent"),
        border: `1px solid ${active ? `${accent}55` : "var(--color-border-subtle)"}`,
        opacity: lit ? 1 : 0.5,
      }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? `${accent}26` : "var(--color-surface-raised)",
        border: `1px solid ${active ? `${accent}44` : "var(--color-border)"}`,
        color: active ? accent : "var(--color-text-secondary)" }}>
        {Icon ? <Icon s={17} /> : null}
      </span>
      {/* Active text uses the accent color (not white) — the active row's background is a
          translucent accent tint that can render very light in light theme, so fixed white
          would disappear; inactive text tracks the theme's primary text color. */}
      <span style={{ flex: 1, fontFamily: HEAD, fontWeight: 600, fontSize: 15, color: active ? accent : "var(--color-text-primary)", letterSpacing: ".01em" }}>{label}</span>
      <span style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
        color: active ? accent : "var(--color-text-muted)" }}>{active ? "Active" : "Apply"}</span>
      <span style={{ color: active ? accent : "var(--color-text-muted)", fontWeight: 700, fontSize: 16 }}>→</span>
    </button>
  );
}

export function SellerHub({ onNavigate, pageColors = {} }) {
  const { isMobile } = useViewport();
  const [statuses, setStatuses] = useState(null); // null = loading
  const [q, setQ] = useState("");
  // Mobile: the sidebar is hidden + the mobile nav bars inset the content area, so drop the
  // desktop sidebar clearance and go single-column with tighter type for comfortable taps.
  // 16px side gutters; generous bottom padding so the last row clears the bottom nav bar.
  const wrapPad = isMobile ? "20px 16px 44px 16px" : "40px 40px 60px 148px";
  // Desktop: full-width auto-fill grid that adds columns as the window widens (2 → 3 → 4…),
  // so the page fills the space like other desktop pages instead of a fixed 980px column.
  const gridCols = isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))";

  useEffect(() => {
    let alive = true;
    // Retry a few times: on a cold deep-link to /provider the call can race the auth
    // token refresh and 401 once. Without the retry the hub would fall back to "all
    // greyed" until a manual reload. Only give up (→ {}) after the retries are spent.
    const load = (attempt = 0) => {
      getSellerPortalStatus()
        .then((res) => { if (alive) setStatuses(res?.data?.statuses ?? {}); })
        .catch(() => {
          if (!alive) return;
          if (attempt < 3) setTimeout(() => alive && load(attempt + 1), 600 * (attempt + 1));
          else setStatuses({});
        });
    };
    load();
    return () => { alive = false; };
  }, []);

  const loading = statuses === null;
  const user = getUser() || {};
  const flagActive = (nav) => { const f = PORTAL_USER_FLAG[nav]; return f ? user[f] === true : false; };
  const isActive = (nav) => !!((statuses && statuses[nav]) || flagActive(nav));
  const query = q.trim().toLowerCase();
  const allItems = BECOME_GROUPS.flatMap((g) => g.items);
  const activeTotal = statuses ? allItems.filter(([nav]) => isActive(nav)).length : 0;
  const searchHits = query ? allItems.filter(([nav, label]) => portalSearchMatch(nav, label, query)) : null;

  return (
    <div className="scroll-area" style={{ flex: 1, overflowY: "auto", minHeight: 0,
      background: "radial-gradient(90% 60% at 50% -10%, rgba(47,158,68,.10), transparent 60%)" }}>
      <div style={{ padding: wrapPad, fontFamily: BODY }}>
        {/* Centered hero — title + search, matching the home (NavHubPage) hero. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <h1 className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: isMobile ? 34 : "clamp(40px, 4.8vw, 60px)", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.0 }}>
            Become a Provider
          </h1>
          <p style={{ ...sub, maxWidth: 600 }}>
            {loading ? "Loading your portals…"
              : activeTotal > 0
                ? <>You're active on <strong style={{ color: SELLER_GREEN }}>{activeTotal}</strong> portal{activeTotal === 1 ? "" : "s"}. Greyed portals are ones you haven't applied for yet — tap any to become a provider.</>
                : <>You haven't become a provider yet. Tap any portal below to start earning on Strug.</>}
          </p>

          {/* Animated rotating-border search, matching the home/category pages (.search-wrap). */}
          <div className="search-wrap" style={{ margin: "26px 0 8px", width: isMobile ? "100%" : "min(560px, 92%)" }}>
            <div className="search-inner bg-surface-raised" style={{ position: "relative" }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2"
                style={{ position: "absolute", left: 16, top: 15 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your portals…"
                className="text-text-primary"
                style={{ width: "100%", padding: "14px 16px 14px 46px", borderRadius: 13, background: "transparent",
                  border: "none", fontFamily: BODY, fontSize: 15, outline: "none", textAlign: "left" }} />
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginTop: 20 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-surface-raised border border-border-subtle" style={{ height: 48, borderRadius: 12 }} />
            ))}
          </div>
        ) : searchHits ? (
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginTop: 16 }}>
            {searchHits.length === 0 && <p className="text-text-muted" style={{ fontSize: 14, padding: "16px 2px" }}>No matches for “{q}”.</p>}
            {searchHits.map(([nav, label]) => (
              <PortalRow key={nav} nav={nav} label={label} active={isActive(nav)} color={portalColor(nav, pageColors)} icon={PORTAL_ICON[nav]} onNavigate={onNavigate} />
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 26 }}>
            {BECOME_GROUPS.map((g) => {
              const activeInGroup = g.items.filter(([nav]) => isActive(nav)).length;
              return (
                <div key={g.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
                    <div style={tileIc(activeInGroup > 0, SELLER_GREEN)}><Glyph icon={g.icon} /></div>
                    <div>
                      <h4 style={{ ...tileH, fontSize: 17 }}>{g.title}</h4>
                      <p style={{ ...tileP, marginTop: 2 }}>{activeInGroup} of {g.items.length} active</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8 }}>
                    {g.items.map(([nav, label]) => (
                      <PortalRow key={nav} nav={nav} label={label} active={isActive(nav)} color={portalColor(nav, pageColors)} icon={PORTAL_ICON[nav]} onNavigate={onNavigate} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GuidedTour — Option B                                              */
/* A stepped platform walkthrough for new members (Codezero ask — a   */
/* celebrity requested it). Each step spotlights a real sidebar item   */
/* ([data-nav-id]) with a glowing ring + an arrow that points at it    */
/* (carrd.co "useful instructions" style), alongside a card that       */
/* explains the section. Falls back to a centered card when the target */
/* isn't on screen (mobile / collapsed sidebar). Launched from the     */
/* Welcome modal CTA and re-runnable any time from the profile menu.   */
/* ------------------------------------------------------------------ */
const TOUR_STEPS = [
  { navId: "home", icon: Ico.home, title: "This is your home base",
    desc: "Everything on Strug lives behind this sidebar. Tap any icon to jump between rides, shopping, food, video and your community." },
  { navId: "rideshare", icon: Ico.ride, title: "Get anywhere with Rideshare",
    desc: "Set your pickup and drop-off, choose a vehicle or name your own price. Drivers nearby see your request instantly." },
  { navId: "shop", icon: Ico.shop, title: "Shop local & online",
    desc: "Browse stores and local sellers, then check out in a tap with your Strug wallet or card." },
  { navId: "food", icon: Ico.food, title: "Order the food you love",
    desc: "Find restaurants near you, build your order and track it all the way to your door." },
  { navId: "videos", icon: Ico.video, title: "Watch, post & go live",
    desc: "Stream shows, post videos and shorts, or go live to your followers." },
  { navId: "social", icon: Ico.social, title: "Find your community",
    desc: "Catch up on your feed, drop into the Town Hall and connect with people around you." },
  { navId: "become", icon: Ico.money, gold: true, title: "Ready to start earning?",
    desc: "Drive, sell, create or host — there are dozens of ways to make money on Strug. Open the Earn hub whenever you're ready.",
    cta: "Explore ways to earn" },
];

const isDesktopTour = () => typeof window !== "undefined" && window.innerWidth > 760;

export function GuidedTour({ steps = TOUR_STEPS, onClose, onFinish }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i] || steps[0];
  const last = i === steps.length - 1;
  const gold = !!step.gold;
  const accent = gold ? GOLD : "#2f6bff";
  const accentDark = gold ? "#d98e12" : "#1e4fd6";

  // Spotlight the real sidebar button for this step (desktop + when present).
  useLayoutEffect(() => {
    let cancelled = false;
    const target = () =>
      step.navId && isDesktopTour() ? document.querySelector(`[data-nav-id="${step.navId}"]`) : null;
    const measure = () => {
      if (cancelled) return;
      const el = target();
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const el = target();
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    const t = setTimeout(measure, 300); // re-measure once the smooth scroll settles
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [i, step.navId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, steps.length]);

  const next = () => (last ? onFinish?.() : setI((n) => n + 1));

  const CARD_W = 360;
  const spotlight = !!rect;
  let cardStyle, arrowTop = null;
  if (spotlight) {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    const left = Math.min(rect.left + rect.width + 30, w - CARD_W - 20);
    const top = Math.min(Math.max(rect.top + rect.height / 2 - 170, 20), Math.max(20, h - 380));
    cardStyle = { position: "fixed", left, top, width: CARD_W };
    arrowTop = rect.top + rect.height / 2 - top; // arrow's y offset inside the card
  } else {
    cardStyle = { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "100%", maxWidth: 440 };
  }

  const prev = i > 0 ? steps[i - 1] : null;
  const nxt = i < steps.length - 1 ? steps[i + 1] : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2100, fontFamily: BODY }}>
      {/* The 9999px box-shadow spread here IS the modal scrim for the spotlight state (a
          darkened surround punched out around the highlighted element) — stays dark regardless
          of theme, consistent with every other modal backdrop in the app. */}
      <style>{`@keyframes tourPulse{0%,100%{box-shadow:0 0 0 9999px rgba(2,4,11,.82),0 0 0 2px ${accent},0 0 22px 3px ${accent}99}50%{box-shadow:0 0 0 9999px rgba(2,4,11,.82),0 0 0 2px ${accent},0 0 30px 7px ${accent}cc}}`}</style>

      {spotlight ? (
        <div style={{
          position: "fixed", top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12, borderRadius: 14,
          pointerEvents: "none", animation: "tourPulse 1.9s ease-in-out infinite",
        }} />
      ) : (
        // Modal scrim — stays a dark dimming overlay regardless of theme (consistent with
        // every other modal backdrop in the app).
        <div onClick={onClose} style={{
          position: "fixed", inset: 0,
          background: "radial-gradient(120% 90% at 50% 30%, rgba(3,6,15,.6), rgba(2,4,11,.92))",
          backdropFilter: "blur(3px)",
        }} />
      )}

      {/* Arrow from the card pointing back at the spotlighted item */}
      {spotlight && arrowTop != null && (
        <div style={{
          position: "fixed", left: cardStyle.left - 9, top: cardStyle.top + arrowTop - 9,
          width: 0, height: 0, borderTop: "9px solid transparent", borderBottom: "9px solid transparent",
          borderRight: "10px solid var(--color-surface-raised)", filter: `drop-shadow(-1px 0 0 ${accent})`, zIndex: 2,
        }} />
      )}

      <div onClick={(e) => e.stopPropagation()} className="border border-border" style={{
        ...cardStyle, padding: "24px 26px 20px",
        background: "linear-gradient(180deg, var(--color-surface-raised), var(--color-surface))",
        borderRadius: 22, boxShadow: "0 40px 120px var(--color-shadow)", animation: "fadeUp .28s ease both", zIndex: 1,
      }}>
        {/* Illustration — current step big, neighbours faint, like the journey */}
        <div style={{
          position: "relative", height: 92, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
          background: `radial-gradient(62% 80% at 50% 42%, ${accent}22, transparent 70%)`, borderRadius: 16,
        }}>
          {prev && <div style={tourMini("left")}><Glyph icon={prev.icon} size={18} /></div>}
          {/* Icon uses the accent color (not white) — its background is a translucent accent
              gradient that can render very light in light theme, so fixed white would disappear. */}
          <div style={{
            width: 64, height: 64, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center",
            color: accent, background: `linear-gradient(180deg,${accent}55,${accent}22)`, border: `1px solid ${accent}77`,
            boxShadow: `0 8px 28px ${accent}44`,
          }}><Glyph icon={step.icon} size={30} /></div>
          {nxt && <div style={tourMini("right")}><Glyph icon={nxt.icon} size={18} /></div>}
        </div>

        {/* Progress segments */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {steps.map((_, k) => (
            <span key={k} style={{
              flex: 1, height: 3, borderRadius: 2, transition: "background .3s",
              background: k <= i ? accent : "var(--color-border)",
            }} />
          ))}
        </div>

        <span style={{ ...eyebrow(gold ? GOLD : "#7fa6ff"), fontSize: 11 }}>Step {i + 1} of {steps.length}</span>
        <h2 className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 25, letterSpacing: ".01em", margin: "8px 0 0", lineHeight: 1.08 }}>
          {step.title}
        </h2>
        <p style={{ ...sub, fontSize: 14, marginTop: 8 }}>{step.desc}</p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} className="text-text-muted" style={{
            fontFamily: BODY, fontSize: 13, fontWeight: 600, background: "none", border: "none",
            cursor: "pointer", padding: "6px 2px",
          }}>Skip tour</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {i > 0 && (
              <button onClick={() => setI((n) => Math.max(n - 1, 0))} style={{ ...btnGhost, fontSize: 14, padding: "11px 16px" }}>Back</button>
            )}
            <button onClick={next} style={{ ...btnPrimary(accent, accentDark, "#fff"), fontSize: 14, padding: "11px 22px" }}>
              {last ? (step.cta || "Finish") : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const tourMini = (side) => ({
  position: "absolute", [side]: 14, width: 40, height: 40, borderRadius: 12,
  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)",
  background: "var(--color-surface-raised)", border: "1px solid var(--color-border-subtle)", opacity: 0.7,
});
