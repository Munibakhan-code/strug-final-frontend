import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import i18n from '../../i18n/index.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { DRAFT_EVENT, listVideoDrafts, getDraftMedia, deleteVideoDraft } from '../../utils/videoDrafts.js';
import './VideoDrafts.css';

export const draftText = (key, fallback) => i18n.t(`videos.drafts.${key}`, { defaultValue: fallback });
export function DraftStatus({ status }) {
  if (status === 'idle') return null;
  const text = {
    saving: draftText('saving', 'Saving draft…'),
    saved: draftText('saved', 'Saved to drafts on this device'),
    reselect: draftText('reselect', 'Details saved. Select the video file again when continuing this draft.'),
    error: draftText('error', 'Draft could not be saved. Device storage may be full or unavailable.'),
  };
  return <p className="video-draft-status" role="status">{text[status]}</p>;
}
export function DraftCloseDialog({ open, onSave, onDiscard, onKeep }) {
  const ref = useFocusTrap(open);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    const escape = event => { if (event.key === 'Escape' && !busy) { event.stopImmediatePropagation(); onKeep(); } };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [open, busy, onKeep]);
  if (!open) return null;
  const act = async fn => {
    setBusy(true); setError(false);
    try { if (await fn() === false) setError(true); } catch { setError(true); }
    finally { setBusy(false); }
  };
  return createPortal(<div className="video-draft-backdrop"><div ref={ref} role="dialog" aria-modal="true" aria-label={draftText('closeTitle', 'Save this upload?')} className="video-draft-dialog">
    <h3>{draftText('closeTitle', 'Save this upload?')}</h3>
    <p>{draftText('closeBody', 'Continue later from Creator Studio → Content → Drafts on this device.')}</p>
    {error && <p role="alert">{draftText('error', 'Draft could not be saved. Device storage may be full or unavailable.')}</p>}
    <div className="video-draft-actions">
      <button type="button" disabled={busy} onClick={onKeep}>{draftText('keep', 'Keep editing')}</button>
      <button type="button" disabled={busy} onClick={() => act(onDiscard)}>{draftText('discard', 'Discard')}</button>
      <button type="button" disabled={busy} onClick={() => act(onSave)}>{draftText('save', 'Save draft')}</button>
    </div>
  </div></div>, document.body);
}
function DraftCard({ row, owner, busy, deleting, setDeleting, resume, setError }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let url;
    let active = true;
    getDraftMedia(owner, row.id).then(media => {
      if (!active || !media?.thumbnail) return;
      url = URL.createObjectURL(media.thumbnail);
      setPreview(url);
    }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [owner, row.id]);
  return <article className="video-draft-card">
    <div className="video-draft-thumb">{preview
      ? <img src={preview} alt="" />
      : <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="9 7 18 12 9 17 9 7" /></svg>}
    </div>
    <div className="video-draft-card-copy">
      <h4>{row.title || row.fileName || draftText('untitled', 'Untitled video')}</h4>
      <p>{row.fileName || draftText('reselect', 'Select the video file again when continuing this draft.')}</p>
      <time dateTime={new Date(row.updatedAt).toISOString()}>{new Date(row.updatedAt).toLocaleString()}</time>
      <div className="video-draft-actions">
        <button type="button" disabled={busy !== null} onClick={() => resume(row)}>{draftText('continue', 'Continue')}</button>
        <button type="button" disabled={busy !== null} onClick={() => setDeleting(row.id)}>{draftText('delete', 'Delete')}</button>
      </div>
      {deleting === row.id && <div className="video-draft-delete" role="group" aria-label={draftText('deleteQuestion', 'Delete this draft?')}>
        <span>{draftText('deleteQuestion', 'Delete this draft?')}</span>
        <button type="button" onClick={async () => { try { await deleteVideoDraft(owner, row.id); setDeleting(null); } catch { setError(true); } }}>{draftText('delete', 'Delete')}</button>
        <button type="button" onClick={() => setDeleting(null)}>{i18n.t('common.cancel')}</button>
      </div>}
    </div>
  </article>;
}
export default function VideoDrafts({ owner, onContinue }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(null);
  const [deleting, setDeleting] = useState(null);
  useEffect(() => {
    const refresh = () => { try { setRows(listVideoDrafts(owner)); setError(false); } catch { setError(true); } };
    refresh();
    window.addEventListener(DRAFT_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DRAFT_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [owner]);
  const resume = async row => {
    setBusy(row.id);
    try {
      const media = await getDraftMedia(owner, row.id).catch(() => null);
      onContinue({ ...row, file: media?.file || null, thumbnail: media?.thumbnail || null });
    } finally { setBusy(null); }
  };
  return <section className="video-drafts" aria-label={draftText('title', 'Drafts')}>
    <p>{draftText('device', 'Private drafts saved on this device. Clearing browser data removes these drafts.')}</p>
    {error && <p role="alert">{draftText('error', 'Draft could not be saved. Device storage may be full or unavailable.')}</p>}
    {!error && !rows.length && <p>{draftText('empty', 'No drafts yet. Unfinished uploads will appear here.')}</p>}
    <div className="video-drafts-grid">{rows.map(row => <DraftCard key={row.id} row={row} owner={owner} busy={busy} deleting={deleting} setDeleting={setDeleting} resume={resume} setError={setError} />)}</div>
  </section>;
}
