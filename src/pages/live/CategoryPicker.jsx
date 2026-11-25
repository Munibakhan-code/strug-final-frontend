import { useEffect, useMemo, useRef, useState } from 'react';

const VISIBLE_ROWS = 5;
const ROW_H = 40;

const fieldClassName = 'bg-surface border border-border text-text-primary';

const fieldStyle = {
  borderRadius: 10,
  padding: '10px 14px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const FEATURED_ORDER = [
  'Grand Theft Auto V',
  'League of Legends',
  'VALORANT',
  'Minecraft',
  'Dota 2',
  'Counter-Strike',
  'Call of Duty: Warzone',
  'Fortnite',
  'Just Chatting',
];

function sortCategories(categories) {
  const featured = new Set(FEATURED_ORDER.map((n) => n.toLowerCase()));
  return [...categories].sort((a, b) => {
    const aName = (a.category_name || '').toLowerCase();
    const bName = (b.category_name || '').toLowerCase();
    const aFeat = featured.has(aName) ? FEATURED_ORDER.findIndex((n) => n.toLowerCase() === aName) : 999;
    const bFeat = featured.has(bName) ? FEATURED_ORDER.findIndex((n) => n.toLowerCase() === bName) : 999;
    if (aFeat !== bFeat) return aFeat - bFeat;
    return (a.category_name || '').localeCompare(b.category_name || '');
  });
}

function displayLabel(value, sorted) {
  if (value?.categoryId) {
    const hit = sorted.find((c) => String(c.category_id) === String(value.categoryId));
    if (hit) return hit.category_name;
  }
  if (value?.categoryName?.trim()) return value.categoryName.trim();
  return '';
}

/**
 * Custom category picker — compact searchable menu (no native select).
 * value: { categoryId: string|number|null, categoryName: string }
 */
export default function CategoryPicker({
  categories = [],
  value,
  onChange,
  placeholder = 'Search or type a category…',
  style,
  disabled = false,
}) {
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const sorted = useMemo(() => sortCategories(categories), [categories]);
  const label = displayLabel(value, sorted);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => c.category_name?.toLowerCase().includes(q));
  }, [sorted, search]);

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return sorted.find((c) => c.category_name?.toLowerCase() === q) ?? null;
  }, [sorted, search]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const pick = (cat) => {
    onChange?.({ categoryId: cat.category_id, categoryName: cat.category_name });
    setOpen(false);
    setSearch('');
  };

  const pickCustom = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = sorted.find((c) => c.category_name?.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      pick(existing);
      return;
    }
    onChange?.({ categoryId: null, categoryName: trimmed });
    setOpen(false);
    setSearch('');
  };

  if (sorted.length === 0) {
    return (
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={value?.categoryName ?? ''}
        onChange={(e) => onChange?.({ categoryId: null, categoryName: e.target.value.trim() })}
        className={fieldClassName}
        style={{ ...fieldStyle, ...style }}
      />
    );
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={fieldClassName}
        style={{
          ...fieldStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'default' : 'pointer',
          textAlign: 'left',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span className={label ? 'text-text-primary' : 'text-text-muted'} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label || 'Select category…'}
        </span>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2.5" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="bg-surface-raised border border-border"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            borderRadius: 12,
            boxShadow: '0 16px 40px var(--color-shadow)',
            overflow: 'hidden',
          }}
        >
          <div className="border-b border-border-subtle" style={{ padding: '8px 8px 6px' }}>
            <input
              ref={searchRef}
              type="text"
              value={search}
              placeholder="Search categories…"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) pickCustom(search);
                if (e.key === 'Escape') setOpen(false);
              }}
              className={fieldClassName}
              style={{
                ...fieldStyle,
                padding: '8px 10px',
                fontSize: 12,
              }}
            />
          </div>

          <div
            role="listbox"
            style={{
              maxHeight: VISIBLE_ROWS * ROW_H,
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {filtered.length === 0 && search.trim() && (
              <button
                type="button"
                onClick={() => pickCustom(search)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: 'transparent',
                  color: '#a78bfa',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Create &ldquo;{search.trim()}&rdquo;
              </button>
            )}
            {filtered.map((c) => {
              const active = String(c.category_id) === String(value?.categoryId);
              return (
                <button
                  key={c.category_id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(c)}
                  className="text-text-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    height: ROW_H,
                    padding: '0 12px',
                    border: 'none',
                    background: active ? 'rgba(147,51,234,0.25)' : 'transparent',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-surface-raised)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {c.icon_url && (
                    <img
                      src={c.icon_url}
                      alt=""
                      style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.category_name}
                  </span>
                </button>
              );
            })}
          </div>

          {search.trim() && !exactMatch && filtered.length > 0 && (
            <div className="border-t border-border-subtle" style={{ padding: '4px 0' }}>
              <button
                type="button"
                onClick={() => pickCustom(search)}
                className="text-text-secondary"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'transparent',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Use custom: <span style={{ color: '#a78bfa', fontWeight: 600 }}>{search.trim()}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
