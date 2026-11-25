import { useEffect, useMemo, useState } from 'react';
import { useViewport } from '../../hooks/useViewport.js';
import { SearchIcon } from '../../components/icons.jsx';
import { DecryptedText } from '../../components/skeletons.jsx';
import { formatViewers } from './liveFormatters.js';
import { useLiveBrowse } from './useLiveBrowse.js';
import LiveCategoryPage from './LiveCategoryPage.jsx';
import { Avatar, SafeImage } from '../../components/SafeImage.jsx';
import { getUser } from '../../store/auth';
import { getMyProfile, getFollowing } from '../../api/social';

/** Strug live vertical — matches app shell (DM Sans, live red accent). */
const ACCENT = '#dc2626';
const ACCENT_LINK = '#2563eb';
// Theme tokens for page chrome (headers, filters, sidebar, search, cards below the fold of a
// thumbnail). Matches the mapping already used by the sibling live/LiveCategoryPage.jsx. A couple
// of spots — the hero carousel's prev/next nav buttons — sit directly on top of the stream photo
// itself, so they intentionally keep a hardcoded literal instead of BORDER/TEXT; see below.
const BORDER = 'var(--color-border-subtle)';
const PANEL = 'var(--color-surface-glass)';
const TEXT = 'var(--color-text-primary)';
const MUTED = 'var(--color-text-secondary)';
const MUTED_DIM = 'var(--color-text-muted)';
const font = "'DM Sans', sans-serif";
const fontDisplay = "'Barlow Condensed', sans-serif";

/* Inline SVG icon set — keeps the live vertical on the app icon language instead of
   emoji (which read as generic and render inconsistently across platforms). */
const svgBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Svg = ({ s = 16, children }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" {...svgBase} style={{ display: 'block' }}>{children}</svg>
);
const HeartIcon = (p) => <Svg {...p}><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z" /></Svg>;
const BellIcon = (p) => <Svg {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></Svg>;
const PlayIcon = (p) => <Svg {...p}><polygon points="7 4 20 12 7 20 7 4" /></Svg>;
const KebabIcon = ({ s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
  </svg>
);
const VerifiedIcon = ({ s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={ACCENT_LINK} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.7-.9 2.9.9 2.9-2.4 1.7-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15.6l.9-2.9-.9-2.9 2.4-1.7 1-2.8 3-.1L12 2Z" />
    <path d="M8.5 12.2l2.3 2.3 4.2-4.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// #457: purged Azure blobs 404, and a bare <img> paints the browser's broken-image icon. Thumbnails
// fall back to the same dark panel gradient the card already shows behind a loading image.
const THUMB_FALLBACK = (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1e293b, #0f172a)' }} />
);

function LiveBadge() {
  return (
    <span
      style={{
        background: ACCENT,
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: 4,
        letterSpacing: '0.06em',
        fontFamily: font,
      }}
    >
      LIVE
    </span>
  );
}

function ViewerPill({ count }) {
  // Always overlaid directly on a stream thumbnail image, like LiveBadge/duration pills below —
  // stays a fixed dark pill in both themes for legibility over arbitrary photo content.
  return (
    <span
      style={{
        background: 'rgba(0,0,0,0.7)',
        color: 'rgba(255,255,255,0.9)',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 4,
        fontFamily: font,
      }}
    >
      {formatViewers(count)} viewers
    </span>
  );
}

function StreamCard({ stream, onWatch, onOpenProfile }) {
  return (
    <article onClick={() => onWatch(stream)} style={{ cursor: 'pointer', fontFamily: font }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#0f172a',
        }}
      >
        <SafeImage
          src={stream.thumb}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={THUMB_FALLBACK}
        />
        <div style={{ position: 'absolute', top: 8, left: 8 }}>
          <LiveBadge />
        </div>
        <div style={{ position: 'absolute', bottom: 8, left: 8 }}>
          <ViewerPill count={stream.viewers} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-start' }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenProfile(stream); }}
          className="bg-surface-raised"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            padding: 0,
            overflow: 'hidden',
            flexShrink: 0,
            cursor: 'pointer',
            // Below the thumbnail, not drawn over it — an ordinary avatar placeholder swatch,
            // so (unlike THUMB_FALLBACK above) this follows the theme.
          }}
        >
          <Avatar url={stream.profile_pic_url} initials={stream.streamer} size={36} style={{ background: 'var(--color-surface-raised)' }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: TEXT,
              lineHeight: 1.35,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {stream.title}
          </h3>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenProfile(stream); }}
            style={{
              margin: '4px 0 0',
              padding: 0,
              border: 'none',
              background: 'none',
              fontSize: 12,
              color: MUTED,
              cursor: 'pointer',
              fontFamily: font,
            }}
          >
            {stream.streamer}
            {stream.verified ? <>{' '}<VerifiedIcon s={12} /></> : ''}
          </button>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED_DIM }}>{stream.category}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {(stream.tags || []).map((tag) => (
              <span
                key={tag}
                className="bg-surface-raised"
                style={{
                  fontSize: 10,
                  color: MUTED,
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="More options"
          style={{ border: 'none', background: 'none', color: MUTED_DIM, cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}
        >
          <KebabIcon s={16} />
        </button>
      </div>
    </article>
  );
}

function VodCard({ vod, onWatchVod, onOpenProfile }) {
  const thumb = vod.thumb || vod.profile_pic_url || 'https://ui-avatars.com/api/?background=0f172a&color=fff&size=256&name=V';
  return (
    <article onClick={() => onWatchVod?.(vod)} style={{ cursor: 'pointer', fontFamily: font }}>
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#0f172a' }}>
        <SafeImage src={thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} fallback={THUMB_FALLBACK} />
        {vod.duration && (
          <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>
            {vod.duration}
          </span>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {vod.title}
        </h3>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenProfile?.({ streamer: vod.streamer, handle: vod.handle, category: vod.category, profile_pic_url: vod.profile_pic_url }); }}
          style={{ padding: 0, border: 'none', background: 'none', fontSize: 12, color: MUTED, cursor: 'pointer', fontFamily: font }}
        >
          {vod.streamer}
        </button>
        {vod.created_at && (
          <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED_DIM }}>
            {new Date(vod.created_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </article>
  );
}

function SectionHeading({ children, style }) {
  return (
    <h2 style={{ fontFamily: fontDisplay, fontSize: 17, fontWeight: 800, color: TEXT, margin: '0 0 10px', letterSpacing: '0.02em', ...style }}>
      {children}
    </h2>
  );
}

function EmptyMsg({ children }) {
  return <p style={{ color: MUTED, fontSize: 14, margin: '12px 0 28px' }}>{children}</p>;
}

function HeroCarousel({ streams, onWatch }) {
  const [idx, setIdx] = useState(0);
  const current = streams[idx] || streams[0];

  useEffect(() => {
    if (streams.length < 2) return undefined;
    const id = setInterval(() => setIdx((i) => (i + 1) % streams.length), 6000);
    return () => clearInterval(id);
  }, [streams.length]);

  if (!current) return null;

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 220, position: 'relative' }}>
        <button
          type="button"
          onClick={() => setIdx((i) => (i - 1 + streams.length) % streams.length)}
          aria-label="Previous"
          style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 3,
            width: 36,
            height: 36,
            borderRadius: 8,
            // Sits directly over the hero photo, so — like the sibling live pages' video-surface
            // overlays — this stays a fixed dark literal instead of the BORDER/TEXT tokens.
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 20,
          }}
        >
          ‹
        </button>

        <div
          onClick={() => onWatch(current)}
          style={{
            flex: 1,
            display: 'flex',
            minWidth: 0,
            cursor: 'pointer',
            borderRadius: 18,
            overflow: 'hidden',
            background: '#0f172a',
            border: `1px solid ${BORDER}`,
          }}
        >
          <div style={{ flex: '1.4 1 0', position: 'relative', minHeight: 220 }}>
            <SafeImage
              src={current.thumb}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 220 }}
              fallback={<div style={{ width: '100%', height: '100%', minHeight: 220, background: 'linear-gradient(135deg, #1e293b, #0f172a)' }} />}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(10,10,14,0.85) 100%)',
              }}
            />
            <div style={{ position: 'absolute', top: 12, left: 12 }}>
              <LiveBadge />
            </div>
          </div>
          <div
            style={{
              flex: '0 0 260px',
              background: PANEL,
              backdropFilter: 'blur(20px)',
              padding: '20px 18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              fontFamily: font,
              borderLeft: `1px solid ${BORDER}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Avatar url={current.profile_pic_url} initials={current.streamer} size={40} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{current.streamer}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{current.category}</div>
              </div>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: MUTED }}>
              {formatViewers(current.viewers)} viewers
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(current.tags || ['english']).map((tag) => (
                <span
                  key={tag}
                  className="bg-surface-raised"
                  style={{
                    fontSize: 10,
                    color: MUTED,
                    borderRadius: 999,
                    padding: '3px 8px',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIdx((i) => (i + 1) % streams.length)}
          aria-label="Next"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 3,
            width: 36,
            height: 36,
            borderRadius: 8,
            // Same reasoning as the prev button above — over the hero photo, stays fixed dark.
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 20,
          }}
        >
          ›
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 10 }}>
        {streams.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIdx(i)}
            style={{
              width: i === idx ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: i === idx ? ACCENT : 'var(--color-text-muted)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>
    </section>
  );
}

function Sidebar({ collapsed, onToggle, onWatch, streams, recommendedCategories, onOpenCategory, onShowAllCategories }) {
  const liveChannels = streams.slice(0, 10);

  // Shared row geometry so both lists (categories + channels) line up on one grid:
  // identical avatar footprint → text left-edges align; symmetric inset → hover pills breathe.
  const sectionHeader = { padding: '14px 16px 7px', fontSize: 10, fontWeight: 700, color: MUTED_DIM, letterSpacing: '0.08em' };
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 11, width: 'calc(100% - 16px)', margin: '1px 8px', padding: '7px 8px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: font, borderRadius: 8, transition: 'background 0.15s ease' };
  const avatarBox = { width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const primaryText = { fontSize: 12.5, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 };
  const secondaryText = { fontSize: 10.5, color: MUTED_DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, marginTop: 1 };
  const metaStyle = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: MUTED, flexShrink: 0, fontVariantNumeric: 'tabular-nums' };
  const liveDot = <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT, boxShadow: '0 0 0 3px rgba(220,38,38,0.14)', flexShrink: 0 }} />;
  const showMoreStyle = { display: 'block', width: 'calc(100% - 16px)', margin: '3px 8px 4px', padding: '5px 8px', textAlign: 'left', border: 'none', background: 'none', color: ACCENT_LINK, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: font, borderRadius: 8 };
  const onRowEnter = (e) => { e.currentTarget.style.background = 'var(--color-surface-raised)'; };
  const onRowLeave = (e) => { e.currentTarget.style.background = 'transparent'; };

  return (
    <aside
      className="bg-surface"
      style={{
        width: collapsed ? 44 : 220,
        flexShrink: 0,
        borderRight: `1px solid ${BORDER}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s ease',
        fontFamily: font,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: collapsed ? '10px 6px' : '10px 14px',
          borderBottom: `1px solid ${BORDER}`,
          minHeight: 44,
        }}
      >
        {!collapsed && (
          <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>For You</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: MUTED,
            fontSize: 14,
            padding: 4,
            marginLeft: collapsed ? 'auto' : 0,
            marginRight: collapsed ? 'auto' : 0,
          }}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0 14px' }}>
          <div style={sectionHeader}>RECOMMENDED CATEGORIES</div>
          {recommendedCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onOpenCategory?.(cat)}
              style={rowStyle}
              onMouseEnter={onRowEnter}
              onMouseLeave={onRowLeave}
            >
              <span style={avatarBox}>
                <SafeImage
                  src={cat.thumb}
                  alt=""
                  style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }}
                  fallback={<span style={{ display: 'block', width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #1e293b, #0f172a)' }} />}
                />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...primaryText, display: 'block' }}>{cat.name}</span>
                <span style={{ ...secondaryText, display: 'block' }}>{cat.tagsLabel || (cat.tags || []).join(', ')}</span>
              </span>
              <span style={metaStyle}>{liveDot}{formatViewers(cat.viewers)}</span>
            </button>
          ))}
          <button type="button" onClick={onShowAllCategories} style={showMoreStyle}>Show more</button>

          <div style={sectionHeader}>LIVE CHANNELS</div>
          {liveChannels.length === 0 && (
            <p style={{ padding: '4px 16px', fontSize: 11, color: MUTED_DIM, margin: 0 }}>No channels live</p>
          )}
          {liveChannels.map((ch) => (
            <button
              key={ch.handle || ch.id}
              type="button"
              onClick={() => onWatch(ch)}
              style={rowStyle}
              onMouseEnter={onRowEnter}
              onMouseLeave={onRowLeave}
            >
              <span style={avatarBox}>
                <Avatar url={ch.profile_pic_url || ch.thumb} initials={ch.streamer} size={30} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...primaryText, display: 'block' }}>{ch.streamer}</span>
                <span style={{ ...secondaryText, display: 'block' }}>{ch.category}</span>
              </span>
              <span style={metaStyle}>{liveDot}{formatViewers(ch.viewers)}</span>
            </button>
          ))}
          {liveChannels.length > 0 && (
            <button type="button" style={showMoreStyle}>Show more</button>
          )}
        </div>
      )}
    </aside>
  );
}

function CategoryCard({ cat, onSelect }) {
  return (
    <article onClick={() => onSelect?.(cat)} style={{ fontFamily: font, cursor: 'pointer' }}>
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
        <SafeImage
          src={cat.thumb}
          alt=""
          style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }}
          fallback={<div style={{ width: '100%', aspectRatio: '3/4', display: 'block', background: 'linear-gradient(135deg, #1e293b, #0f172a)' }} />}
        />
        {cat.isNew && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: ACCENT,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            NEW
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>{cat.name}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>{formatViewers(cat.viewers)} viewers</p>
        </div>
        <button type="button" aria-label="More options" style={{ border: 'none', background: 'none', color: MUTED_DIM, cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}><KebabIcon s={16} /></button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {(cat.tags || []).map((tag) => (
          <span key={tag} className="bg-surface-raised" style={{ fontSize: 10, color: MUTED, borderRadius: 4, padding: '2px 8px' }}>
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function TabRow({ tabs, activeId, onChange, style, compact = false }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: compact ? 14 : 20,
        borderBottom: compact ? 'none' : `1px solid ${BORDER}`,
        marginBottom: compact ? 0 : 20,
        ...style,
      }}
    >
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange?.(tab.id)}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontFamily: font,
              fontSize: compact ? 13 : 14,
              fontWeight: active ? 700 : 500,
              color: active ? ACCENT_LINK : MUTED,
              padding: compact ? '4px 0' : '10px 0',
              borderBottom: active ? `2px solid ${ACCENT_LINK}` : '2px solid transparent',
              marginBottom: compact ? 0 : -1,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LiveTwitchBrowse({
  onWatch,
  onWatchVod,
  onWatchClip,
  onOpenProfile,
  onGoLive,
  activeTab = 'home',
  onTabChange,
  searchPlaceholder = 'Search live streams',
}) {
  const { isMobile } = useViewport();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [followingSubTab, setFollowingSubTab] = useState('overview');
  const [browseSubTab, setBrowseSubTab] = useState('categories');
  const [browseSort, setBrowseSort] = useState('recommended');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [query, setQuery] = useState('');
  const [showMoreStreams, setShowMoreStreams] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const {
    categories,
    recommendedCategories,
    streams: liveStreams,
    streamsLoading: liveLoading,
    recentVods,
    vodsLoading,
    browseError,
    reloadStreams,
    reloadCategories,
  } = useLiveBrowse();

  const [followedUserIds, setFollowedUserIds] = useState(() => new Set());
  const [followingLoading, setFollowingLoading] = useState(false);
  const loggedIn = !!getUser();

  useEffect(() => {
    if (!loggedIn || activeTab !== 'following') return undefined;
    let cancelled = false;
    const loadFollowing = () => {
      setFollowingLoading(true);
      getMyProfile()
        .then((me) => {
          const profileId = me?.data?.profile_id ?? me?.profile_id;
          if (!profileId) return { data: [] };
          return getFollowing(profileId);
        })
        .then((res) => {
          if (cancelled) return;
          const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
          setFollowedUserIds(new Set(rows.map((p) => p?.user_id).filter((id) => id != null).map(Number)));
        })
        .catch(() => {
          if (!cancelled) setFollowedUserIds(new Set());
        })
        .finally(() => {
          if (!cancelled) setFollowingLoading(false);
        });
    };
    loadFollowing();
    const onFollowChanged = () => loadFollowing();
    window.addEventListener('live:follow-changed', onFollowChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('live:follow-changed', onFollowChanged);
    };
  }, [loggedIn, activeTab, liveStreams]);

  const isFollowedStream = (s) => {
    const uid = s?.streamer_user_id;
    if (uid == null) return false;
    return followedUserIds.has(Number(uid));
  };

  const apiStreams = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = !q
      ? [...liveStreams]
      : liveStreams.filter((s) =>
        [s.title, s.streamer, s.handle, s.category].some((v) => String(v || '').toLowerCase().includes(q))
      );
    if (browseSort === 'viewers') {
      rows.sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0));
    } else if (browseSort === 'newest') {
      rows.sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
    } else {
      // recommended: viewers first, then title for stability
      rows.sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0) || String(a.title || '').localeCompare(String(b.title || '')));
    }
    return rows;
  }, [liveStreams, query, browseSort]);

  const followedStreams = useMemo(
    () => apiStreams.filter(isFollowedStream),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiStreams, followedUserIds],
  );

  const followedVods = useMemo(
    () => recentVods.filter((v) => {
      const uid = v?.streamer_user_id;
      if (uid != null) return followedUserIds.has(Number(uid));
      // Fallback: match by handle if VOD rows don't carry user id yet.
      return false;
    }),
    [recentVods, followedUserIds],
  );

  const featuredStreams = useMemo(
    () => [...apiStreams].sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0)).slice(0, 5),
    [apiStreams],
  );
  const gridStreams = apiStreams;
  const visibleStreams = showMoreStreams ? gridStreams : gridStreams.slice(0, 8);

  const filteredCategories = categories.filter((c) => {
    if (!categoryQuery.trim()) return true;
    return c.name.toLowerCase().includes(categoryQuery.toLowerCase());
  });

  const channelList = useMemo(() => {
    const map = new Map();
    apiStreams.forEach((s) => { if (s.handle) map.set(s.handle, s); });
    recentVods.forEach((v) => {
      if (v.handle && !map.has(v.handle)) {
        map.set(v.handle, {
          id: `ch-${v.handle}`,
          handle: v.handle,
          streamer: v.streamer,
          streamer_user_id: v.streamer_user_id ?? null,
          profile_pic_url: v.profile_pic_url,
          category: v.category,
          viewers: 0,
          live: false,
        });
      }
    });
    return [...map.values()];
  }, [apiStreams, recentVods]);

  const followedChannels = useMemo(
    () => channelList.filter((c) => c?.streamer_user_id != null && followedUserIds.has(Number(c.streamer_user_id))),
    [channelList, followedUserIds],
  );

  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 };

  const mainTabs = [
    { id: 'home', label: 'Home' },
    { id: 'following', label: 'Following' },
    { id: 'browse', label: 'Browse' },
  ];

  const showSearch = (activeTab === 'home' || activeTab === 'browse') && !selectedCategory;

  const openCategory = (cat) => {
    setSelectedCategory(cat);
    setBrowseSubTab('categories');
    onTabChange?.('browse');
  };

  const closeCategory = () => setSelectedCategory(null);

  const showAllCategories = () => {
    onTabChange?.('browse');
    setSelectedCategory(null);
    setBrowseSubTab('categories');
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        paddingLeft: isMobile ? 16 : 108,
        paddingRight: isMobile ? 16 : 48,
        fontFamily: font,
      }}
    >
      {/* Compact toolbar — title, tabs, and search on one row (desktop) */}
      <div
        style={{
          paddingTop: isMobile ? 10 : 14,
          paddingBottom: 10,
          flexShrink: 0,
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 10 : 16,
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            rowGap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <h2
              style={{
                fontFamily: fontDisplay,
                fontWeight: 800,
                fontSize: isMobile ? 22 : 24,
                color: TEXT,
                letterSpacing: '0.03em',
                margin: 0,
                lineHeight: 1,
              }}
            >
              <DecryptedText text="LIVE" speed={45} />
            </h2>
            <span
              style={{
                background: ACCENT,
                borderRadius: 4,
                padding: '2px 6px',
                fontWeight: 700,
                fontSize: 9,
                color: '#fff',
                letterSpacing: '0.06em',
                animation: 'pulseLive 2s ease-in-out infinite',
                lineHeight: 1.2,
              }}
            >
              LIVE
            </span>
          </div>

          <TabRow
            tabs={mainTabs}
            activeId={activeTab}
            onChange={(id) => { onTabChange?.(id); setSelectedCategory(null); }}
            compact
            style={{ flex: isMobile ? '1 1 100%' : '0 0 auto' }}
          />

          {onGoLive && (
            <button
              type="button"
              onClick={() => onGoLive()}
              style={{
                flexShrink: 0,
                background: ACCENT,
                border: 'none',
                borderRadius: 8,
                padding: isMobile ? '7px 12px' : '8px 14px',
                color: '#fff',
                fontFamily: font,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              Go Live
            </button>
          )}

          {showSearch && (
            <div
              className="od-search-wrap"
              style={{
                flex: isMobile ? '1 1 100%' : '1 1 auto',
                maxWidth: isMobile ? '100%' : 320,
                minWidth: isMobile ? 0 : 180,
                marginLeft: isMobile ? 0 : 'auto',
              }}
            >
              <div
                className="od-search-inner"
                style={{
                  background: PANEL,
                  backdropFilter: 'blur(20px)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: isMobile ? '8px 12px' : '7px 12px',
                  gap: 8,
                }}
              >
                <div style={{ color: MUTED, flexShrink: 0, display: 'flex' }}>
                  <SearchIcon s={16} />
                </div>
                <input
                  value={activeTab === 'browse' ? categoryQuery : query}
                  onChange={(e) => (activeTab === 'browse' ? setCategoryQuery(e.target.value) : setQuery(e.target.value))}
                  placeholder={activeTab === 'browse' ? 'Search categories' : searchPlaceholder}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: TEXT,
                    fontSize: 13,
                    fontFamily: font,
                    caretColor: ACCENT_LINK,
                    minWidth: 0,
                  }}
                />
                {(activeTab === 'browse' ? categoryQuery : query) && (
                  <button
                    type="button"
                    onClick={() => (activeTab === 'browse' ? setCategoryQuery('') : setQuery(''))}
                    style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {!isMobile && (
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
            onWatch={onWatch}
            streams={apiStreams}
            recommendedCategories={recommendedCategories}
            onOpenCategory={openCategory}
            onShowAllCategories={showAllCategories}
          />
        )}

        {/* paddingLeft gives the content column a gutter off the sidebar's divider — without it the
            cards butt straight up against it (measured 0px), which reads as a rendering glitch. */}
        <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, paddingBottom: 24, paddingTop: 12, paddingLeft: isMobile ? 0 : 16 }}>
          {activeTab === 'following' && (
            <div style={{ paddingRight: isMobile ? 0 : 8 }}>
              <TabRow
                tabs={[
                  { id: 'overview', label: 'Overview' },
                  { id: 'live', label: 'Live' },
                  { id: 'videos', label: 'Videos' },
                  { id: 'categories', label: 'Categories' },
                  { id: 'channels', label: 'Channels' },
                ]}
                activeId={followingSubTab}
                onChange={setFollowingSubTab}
              />

              {followingSubTab === 'overview' && (
                <>
                  {!loggedIn && (
                    <EmptyMsg>Log in to see channels you follow.</EmptyMsg>
                  )}
                  {loggedIn && followedUserIds.size === 0 && !followingLoading && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
                      {[
                        { Icon: HeartIcon, title: 'Follow', text: 'Enjoying a channel? Follow it!' },
                        { Icon: BellIcon, title: 'Get Notified', text: "We'll let you know when it goes live." },
                        { Icon: PlayIcon, title: 'Watch', text: 'Come back and catch the live action.' },
                      ].map((card) => (
                        <div key={card.title} style={{ background: PANEL, borderRadius: 14, padding: 22, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                          <div style={{ color: ACCENT_LINK, marginBottom: 12, display: 'flex', justifyContent: 'center' }}><card.Icon s={26} /></div>
                          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: TEXT }}>{card.title}</div>
                          <div style={{ fontSize: 13, color: MUTED }}>{card.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {followedStreams.length > 0 && (
                    <>
                      <SectionHeading style={{ fontSize: 20, marginBottom: 14 }}>Live now</SectionHeading>
                      <div style={{ ...gridStyle, marginBottom: 28 }}>
                        {followedStreams.slice(0, 6).map((stream) => (
                          <StreamCard key={stream.id} stream={stream} onWatch={onWatch} onOpenProfile={onOpenProfile} />
                        ))}
                      </div>
                    </>
                  )}
                  {followedVods.length > 0 && (
                    <>
                      <SectionHeading style={{ fontSize: 20, marginBottom: 14 }}>Recent broadcasts</SectionHeading>
                      <div style={gridStyle}>
                        {followedVods.slice(0, 6).map((vod) => (
                          <VodCard key={vod.id} vod={vod} onWatchVod={onWatchVod} onOpenProfile={onOpenProfile} />
                        ))}
                      </div>
                    </>
                  )}
                  {loggedIn && followedUserIds.size > 0 && followedStreams.length === 0 && followedVods.length === 0 && !liveLoading && !vodsLoading && !followingLoading && (
                    <EmptyMsg>None of the channels you follow are live or have recent broadcasts right now.</EmptyMsg>
                  )}
                  {(liveLoading || vodsLoading || followingLoading) && followedStreams.length === 0 && followedVods.length === 0 && loggedIn && (
                    <EmptyMsg>Loading…</EmptyMsg>
                  )}
                </>
              )}

              {followingSubTab === 'live' && (
                <>
                  <SectionHeading>Live channels</SectionHeading>
                  {!loggedIn ? (
                    <EmptyMsg>Log in to see channels you follow.</EmptyMsg>
                  ) : followedStreams.length > 0 ? (
                    <div style={gridStyle}>
                      {followedStreams.map((stream) => (
                        <StreamCard key={stream.id} stream={stream} onWatch={onWatch} onOpenProfile={onOpenProfile} />
                      ))}
                    </div>
                  ) : (
                    <EmptyMsg>{liveLoading || followingLoading ? 'Loading live streams…' : 'No followed channels are live right now.'}</EmptyMsg>
                  )}
                </>
              )}

              {followingSubTab === 'videos' && (
                <>
                  <SectionHeading>Past broadcasts</SectionHeading>
                  {!loggedIn ? (
                    <EmptyMsg>Log in to see channels you follow.</EmptyMsg>
                  ) : followedVods.length > 0 ? (
                    <div style={gridStyle}>
                      {followedVods.map((vod) => (
                        <VodCard key={vod.id} vod={vod} onWatchVod={onWatchVod} onOpenProfile={onOpenProfile} />
                      ))}
                    </div>
                  ) : (
                    <EmptyMsg>{vodsLoading || followingLoading ? 'Loading videos…' : 'No past broadcasts from channels you follow.'}</EmptyMsg>
                  )}
                </>
              )}

              {followingSubTab === 'categories' && (
                <>
                  <SectionHeading>Categories</SectionHeading>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 18 }}>
                    {categories.map((cat) => (
                      <CategoryCard key={cat.id} cat={cat} onSelect={openCategory} />
                    ))}
                  </div>
                  {categories.length === 0 && !liveLoading && (
                    <EmptyMsg>No categories available.</EmptyMsg>
                  )}
                </>
              )}

              {followingSubTab === 'channels' && (
                <>
                  <SectionHeading>Channels</SectionHeading>
                  {!loggedIn ? (
                    <EmptyMsg>Log in to see channels you follow.</EmptyMsg>
                  ) : followedChannels.length > 0 ? (
                    <div style={gridStyle}>
                      {followedChannels.map((stream) => (
                        <StreamCard key={stream.handle || stream.id} stream={stream} onWatch={onWatch} onOpenProfile={onOpenProfile} />
                      ))}
                    </div>
                  ) : (
                    <EmptyMsg>{liveLoading || vodsLoading || followingLoading ? 'Loading…' : 'You are not following any live channels yet.'}</EmptyMsg>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'browse' && selectedCategory && (
            <LiveCategoryPage
              category={selectedCategory}
              onBack={closeCategory}
              onWatch={onWatch}
              onWatchVod={onWatchVod}
              onWatchClip={onWatchClip}
              onOpenProfile={onOpenProfile}
            />
          )}

          {activeTab === 'browse' && !selectedCategory && (
            <div style={{ paddingRight: isMobile ? 0 : 8 }}>
              {browseError && (
                <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171', fontFamily: font, fontSize: 13 }}>
                  {browseError}{' '}
                  <button type="button" onClick={() => { reloadCategories(); reloadStreams(); }} style={{ background: 'none', border: 'none', color: ACCENT_LINK, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: font, fontSize: 13 }}>
                    Retry
                  </button>
                </div>
              )}
              <TabRow
                tabs={[
                  { id: 'categories', label: 'Categories' },
                  { id: 'channels', label: 'Live Channels' },
                ]}
                activeId={browseSubTab}
                onChange={setBrowseSubTab}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
                <select
                  value={browseSort}
                  onChange={(e) => setBrowseSort(e.target.value)}
                  aria-label="Sort live browse results"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    fontSize: 13,
                    fontFamily: font,
                    background: PANEL,
                    color: TEXT,
                  }}
                >
                  <option value="recommended">Sort by: Recommended</option>
                  <option value="viewers">Sort by: Viewers</option>
                  <option value="newest">Sort by: Newest</option>
                </select>
              </div>
              {browseSubTab === 'categories' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 18 }}>
                  {filteredCategories.map((cat) => (
                    <CategoryCard key={cat.id} cat={cat} onSelect={openCategory} />
                  ))}
                  {filteredCategories.length === 0 && (
                    <p style={{ gridColumn: '1 / -1', color: MUTED, fontSize: 14, margin: '12px 0' }}>
                      No categories match your search.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
                  {apiStreams.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} onWatch={onWatch} onOpenProfile={onOpenProfile} />
                  ))}
                  {apiStreams.length === 0 && (
                    <p style={{ gridColumn: '1 / -1', color: MUTED, fontSize: 14, margin: '12px 0' }}>
                      {liveLoading ? 'Loading live streams…' : 'No channels are live right now.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'home' && (
            <div style={{ paddingRight: isMobile ? 0 : 8, maxWidth: 1200 }}>
              {featuredStreams.length > 0 ? (
                <HeroCarousel streams={featuredStreams} onWatch={onWatch} />
              ) : (
                <div
                  style={{
                    marginBottom: 20,
                    padding: '32px 24px',
                    borderRadius: 18,
                    border: `1px solid ${BORDER}`,
                    background: PANEL,
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT }}>
                    {liveLoading ? 'Loading live streams…' : 'No one is live right now'}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED }}>
                    {recentVods.length > 0
                      ? 'Catch up on recent broadcasts below.'
                      : 'Check back soon or go live from Become a Provider → Become a Streamer.'}
                  </p>
                </div>
              )}

              <SectionHeading>Live channels we think you&apos;ll like</SectionHeading>
              {visibleStreams.length > 0 ? (
                <div style={{ ...gridStyle, marginBottom: 16 }}>
                  {visibleStreams.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} onWatch={onWatch} onOpenProfile={onOpenProfile} />
                  ))}
                </div>
              ) : !liveLoading && (
                <EmptyMsg>No live channels to show.</EmptyMsg>
              )}
              {!showMoreStreams && gridStreams.length > 8 && (
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <button
                    type="button"
                    onClick={() => setShowMoreStreams(true)}
                    className="bg-surface-raised"
                    style={{
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      padding: '10px 20px',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: font,
                      color: TEXT,
                    }}
                  >
                    Show more ▾
                  </button>
                </div>
              )}

              {recentVods.length > 0 && (
                <>
                  <SectionHeading style={{ marginTop: 8 }}>Recent broadcasts</SectionHeading>
                  <div style={gridStyle}>
                    {recentVods.slice(0, 8).map((vod) => (
                      <VodCard key={vod.id} vod={vod} onWatchVod={onWatchVod} onOpenProfile={onOpenProfile} />
                    ))}
                  </div>
                </>
              )}
              {!vodsLoading && recentVods.length === 0 && apiStreams.length === 0 && !liveLoading && (
                <EmptyMsg>No streams or recordings yet. Be the first to go live!</EmptyMsg>
              )}

              {recommendedCategories.length > 0 && (
                <>
                  <SectionHeading style={{ marginTop: 28 }}>Popular categories</SectionHeading>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 18 }}>
                    {recommendedCategories.map((cat) => (
                      <CategoryCard key={cat.id} cat={cat} onSelect={openCategory} />
                    ))}
                  </div>
                </>
              )}

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
