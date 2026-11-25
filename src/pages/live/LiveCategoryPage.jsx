import { useMemo, useState } from 'react';
import { useViewport } from '../../hooks/useViewport.js';
import { SearchIcon } from '../../components/icons.jsx';
import { formatFollowers, formatViewers } from './liveFormatters.js';
import { useCategoryContent } from './useLiveBrowse.js';
import { Avatar, SafeImage } from '../../components/SafeImage.jsx';

const ACCENT = '#dc2626';
const ACCENT_LINK = '#2563eb';
// These are page-chrome roles (card titles, filters, tabs, category hero info) — none of
// them sit over the stream/video thumbnails themselves, so they follow theme tokens.
const BORDER = 'var(--color-border-subtle)';
const PANEL = 'var(--color-surface-glass)';
const TEXT = 'var(--color-text-primary)';
const MUTED = 'var(--color-text-secondary)';
const MUTED_DIM = 'var(--color-text-muted)';
const font = "'DM Sans', sans-serif";
const fontDisplay = "'Barlow Condensed', sans-serif";

// #457: purged Azure blobs 404, and a bare <img> paints the browser's broken-image icon. Thumbnails
// fall back to the same dark panel gradient the card already shows behind a loading image.
// (Thumbnail placeholders/loading backgrounds below stay dark regardless of theme, same
// treatment as Hub's photo cards — they sit behind stream video/photo content.)
const THUMB_FALLBACK = (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1e293b, #0f172a)' }} />
);

function LiveBadge() {
  return (
    <span style={{ background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.06em', fontFamily: font }}>
      LIVE
    </span>
  );
}

function ViewerPill({ count }) {
  return (
    <span style={{ background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, fontFamily: font }}>
      {formatViewers(count)} viewers
    </span>
  );
}

function StreamCard({ stream, onWatch, onOpenProfile }) {
  return (
    <article onClick={() => onWatch(stream)} style={{ cursor: 'pointer', fontFamily: font }}>
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#0f172a' }}>
        <SafeImage src={stream.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} fallback={THUMB_FALLBACK} />
        <div style={{ position: 'absolute', top: 8, left: 8 }}><LiveBadge /></div>
        <div style={{ position: 'absolute', bottom: 8, left: 8 }}><ViewerPill count={stream.viewers} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-start' }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenProfile(stream); }} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', padding: 0, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', background: '#1e293b' }}>
          <Avatar url={stream.profile_pic_url} initials={stream.streamer} size={36} style={{ background: '#1e293b' }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{stream.title}</h3>
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenProfile(stream); }} style={{ margin: '4px 0 0', padding: 0, border: 'none', background: 'none', fontSize: 12, color: MUTED, cursor: 'pointer', fontFamily: font }}>
            {stream.streamer}{stream.verified ? ' ✓' : ''}
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {(stream.tags || []).map((tag) => (
              <span key={tag} className="bg-surface-raised" style={{ fontSize: 10, color: MUTED, borderRadius: 999, padding: '2px 8px' }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function VodCard({ vod, onWatchVod, onOpenProfile }) {
  return (
    <article onClick={() => onWatchVod?.(vod)} style={{ cursor: 'pointer', fontFamily: font }}>
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#0f172a' }}>
        <SafeImage src={vod.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} fallback={THUMB_FALLBACK} />
        <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>{vod.duration}</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{vod.title}</h3>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenProfile?.({ streamer: vod.streamer, handle: vod.handle, category: vod.category, profile_pic_url: vod.profile_pic_url || `https://i.pravatar.cc/64?u=${vod.handle}` }); }} style={{ padding: 0, border: 'none', background: 'none', fontSize: 12, color: MUTED, cursor: 'pointer', fontFamily: font }}>{vod.streamer}</button>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED_DIM }}>{formatViewers(vod.views)} views · {new Date(vod.created_at).toLocaleDateString()}</p>
      </div>
    </article>
  );
}

function ClipCard({ clip, onWatchClip }) {
  return (
    <article onClick={() => onWatchClip?.(clip)} style={{ cursor: 'pointer', fontFamily: font }}>
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#0f172a' }}>
        <SafeImage src={clip.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} fallback={THUMB_FALLBACK} />
        <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>{clip.duration}</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{clip.title}</h3>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{clip.streamer}</p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED_DIM }}>{formatViewers(clip.views)} views</p>
      </div>
    </article>
  );
}

function TabRow({ tabs, activeId, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 20, borderBottom: `1px solid ${BORDER}`, marginBottom: 16 }}>
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontFamily: font,
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              color: active ? ACCENT_LINK : MUTED,
              padding: '10px 0',
              borderBottom: active ? `2px solid ${ACCENT_LINK}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LiveCategoryPage({ category, onBack, onWatch, onOpenProfile, onWatchVod, onWatchClip }) {
  const { isMobile } = useViewport();
  const [tab, setTab] = useState('live');
  const [followed, setFollowed] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [language, setLanguage] = useState('all');

  const categoryId = category?.category_id ?? Number(category?.id);
  const { streams, vods, clips } = useCategoryContent(categoryId);

  const filteredStreams = useMemo(() => streams.filter((s) => {
    if (language !== 'all' && !(s.tags || []).some((t) => t.toLowerCase() === language)) return false;
    if (tagQuery.trim()) {
      const q = tagQuery.toLowerCase();
      return s.title?.toLowerCase().includes(q) || s.streamer?.toLowerCase().includes(q) || (s.tags || []).some((t) => t.toLowerCase().includes(q));
    }
    return true;
  }), [streams, language, tagQuery]);

  return (
    <div style={{ paddingRight: isMobile ? 0 : 8, fontFamily: font }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: MUTED,
          cursor: 'pointer',
          fontFamily: font,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 16,
          padding: 0,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Browse
      </button>

      {/* Category hero */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 24, marginBottom: 20 }}>
        <SafeImage
          src={category.thumb}
          alt=""
          style={{
            width: isMobile ? 120 : 140,
            height: isMobile ? 160 : 186,
            objectFit: 'cover',
            borderRadius: 12,
            flexShrink: 0,
            border: `1px solid ${BORDER}`,
          }}
          fallback={(
            <div style={{
              width: isMobile ? 120 : 140,
              height: isMobile ? 160 : 186,
              borderRadius: 12,
              flexShrink: 0,
              border: `1px solid ${BORDER}`,
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
            }} />
          )}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: fontDisplay, fontWeight: 800, fontSize: isMobile ? 26 : 32, color: TEXT, margin: '0 0 10px', letterSpacing: '0.02em', lineHeight: 1.1 }}>
            {category.name}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, fontSize: 14, color: MUTED }}>
            <span><strong style={{ color: TEXT }}>{formatViewers(category.viewers)}</strong> Viewers</span>
            <span style={{ color: MUTED_DIM }}>·</span>
            <span><strong style={{ color: TEXT }}>{formatFollowers(category.followers ?? 0)}</strong> Followers</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {(category.tags || []).map((tag) => (
              <span key={tag} className="bg-surface-raised" style={{ fontSize: 12, color: MUTED, borderRadius: 999, padding: '4px 10px' }}>{tag}</span>
            ))}
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: MUTED, lineHeight: 1.5, maxWidth: 720 }}>
            {descExpanded ? category.description : `${(category.description || '').slice(0, 140)}${(category.description || '').length > 140 ? '…' : ''}`}
            {(category.description || '').length > 140 && (
              <button type="button" onClick={() => setDescExpanded((v) => !v)} style={{ marginLeft: 6, border: 'none', background: 'none', color: ACCENT_LINK, cursor: 'pointer', fontFamily: font, fontSize: 13, fontWeight: 600 }}>
                {descExpanded ? 'Less' : 'More'}
              </button>
            )}
          </p>
          <button
            type="button"
            onClick={() => setFollowed((f) => !f)}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: followed ? 'rgba(37,99,235,0.25)' : ACCENT_LINK,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label={followed ? 'Unfollow category' : 'Follow category'}
          >
            ♥
          </button>
        </div>
      </div>

      {category.banner && (
        <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 20, border: `1px solid ${BORDER}`, maxHeight: 180 }}>
          <SafeImage
            src={category.banner}
            alt=""
            style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
            fallback={<div style={{ width: '100%', height: 180, display: 'block', background: 'linear-gradient(135deg, #1e293b, #0f172a)' }} />}
          />
        </div>
      )}

      <TabRow
        tabs={[
          { id: 'live', label: 'Live Channels' },
          { id: 'videos', label: 'Videos' },
          { id: 'clips', label: 'Clips' },
        ]}
        activeId={tab}
        onChange={setTab}
      />

      {tab === 'live' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: font, background: PANEL, color: TEXT }}
            >
              <option value="all">Language</option>
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
            </select>
            <div className="od-search-wrap" style={{ flex: '1 1 200px', maxWidth: 320 }}>
              <div className="od-search-inner" style={{ background: PANEL, display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
                <SearchIcon s={16} />
                <input
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  placeholder="Search Tags"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: TEXT, fontSize: 13, fontFamily: font, minWidth: 0 }}
                />
              </div>
            </div>
            <select style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: font, background: PANEL, color: TEXT }}>
              <option>Recommended For You</option>
              <option>Viewers (High to Low)</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {filteredStreams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} onWatch={onWatch} onOpenProfile={onOpenProfile} />
            ))}
          </div>
          {filteredStreams.length === 0 && (
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 14, padding: 32 }}>No live channels match your filters.</p>
          )}
        </>
      )}

      {tab === 'videos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {vods.map((vod) => (
            <VodCard key={vod.id} vod={vod} onWatchVod={onWatchVod} onOpenProfile={onOpenProfile} />
          ))}
          {vods.length === 0 && (
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: MUTED, fontSize: 14, padding: 32 }}>No videos in this category yet.</p>
          )}
        </div>
      )}

      {tab === 'clips' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} onWatchClip={onWatchClip} />
          ))}
          {clips.length === 0 && (
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: MUTED, fontSize: 14, padding: 32 }}>No clips in this category yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
