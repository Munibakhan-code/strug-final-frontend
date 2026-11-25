import { useEffect, useRef, useState } from 'react';
import { createDraftId, saveVideoDraft, saveDraftMedia, deleteVideoDraft, listVideoDrafts, DRAFT_EVENT } from '../utils/videoDrafts.js';

export function useVideoDraftCount(owner) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => { try { setCount(listVideoDrafts(owner).length); } catch { setCount(0); } };
    refresh();
    window.addEventListener(DRAFT_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DRAFT_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [owner]);
  return count;
}

export function useVideoDrafts({ owner, open, items, visibility }) {
  const refs = useRef([]);
  const draftOwner = useRef(null);
  const latest = useRef(null);
  const [status, setStatus] = useState('idle');
  latest.current = { owner, items, visibility };
  const persist = () => {
    const current = latest.current;
    if (!current.owner) { setStatus('error'); return null; }
    if (draftOwner.current !== null && draftOwner.current !== current.owner) {
      setStatus('error');
      return null;
    }
    draftOwner.current = current.owner;
    try {
      const unused = [...refs.current];
      const nextRefs = [];
      const ids = current.items.map((item, index) => {
        if (!item.file && !item.title && !item.desc && !item.thumbnail && !item.originalFileName) return null;
        let entryIndex = item.draftId
          ? unused.findIndex(candidate => candidate?.id === item.draftId && candidate.owner === current.owner)
          : unused.findIndex(candidate => candidate?.file && candidate.file === item.file && candidate.owner === current.owner);
        if (entryIndex < 0 && !item.draftId && current.items.length === 1 && unused[0]?.owner === current.owner) entryIndex = 0;
        let entry = entryIndex >= 0 ? unused.splice(entryIndex, 1)[0] : null;
        if (!entry) {
          entry = { id: item.draftId || createDraftId(), owner: current.owner };
        }
        nextRefs[index] = entry;
        if (entry.reselect === undefined) entry.reselect = Boolean(item.originalFileName && !item.file);
        saveVideoDraft(current.owner, entry.id, item, current.visibility);
        if (entry.file !== item.file || entry.thumbnail !== item.thumbnail) {
          entry.file = item.file;
          entry.thumbnail = item.thumbnail;
          entry.pending = Promise.resolve(entry.pending).then(() => saveDraftMedia(current.owner, entry.id, item.file, item.thumbnail))
            .then(fits => { entry.reselect = !fits || Boolean(item.originalFileName && !item.file); })
            .catch(() => { entry.reselect = true; });
        }
        return entry.id;
      });
      for (const entry of unused) if (entry && entry.owner === current.owner) deleteVideoDraft(entry.owner, entry.id);
      refs.current = nextRefs;
      return ids;
    } catch {
      setStatus('error');
      return null;
    }
  };
  // Persist metadata after each edit, not only when the page is closing.
  useEffect(() => {
    if (!open || !owner) return;
    const ids = persist();
    if (!ids) return;
    setStatus(ids.some(Boolean) ? 'saving' : 'idle');
    let stale = false;
    Promise.all(refs.current.map(entry => entry?.pending)).then(() => {
      if (!stale) setStatus(ids.some(Boolean) ? (refs.current.some(entry => entry?.reselect) ? 'reselect' : 'saved') : 'idle');
    });
    return () => { stale = true; };
  }, [owner, open, items, visibility]);
  return {
    status,
    hasDraft: items.some(item => item.file || item.title || item.desc || item.thumbnail || item.originalFileName),
    save: async () => {
      const ids = persist();
      if (!ids) return false;
      await Promise.all(refs.current.map(entry => entry?.pending));
      return true;
    },
    submit: () => { const ids = persist(); refs.current = []; draftOwner.current = null; return ids || []; },
    reset: () => { refs.current = []; draftOwner.current = null; },
    discard: async () => {
      await Promise.all(refs.current.filter(Boolean).map(entry => deleteVideoDraft(entry.owner, entry.id)));
      refs.current = [];
      draftOwner.current = null;
    },
  };
}
