const PREFIX = 'strug:video-draft:v1:';
export const DRAFT_EVENT = 'strug-video-drafts-changed';
const keyFor = (owner, id) => `${PREFIX}${encodeURIComponent(String(owner))}:${id}`;
const signal = () => window.dispatchEvent(new Event(DRAFT_EVENT));
export function createDraftId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure draft storage is unavailable.');
  globalThis.crypto.getRandomValues(bytes);
  const entropy = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `draft-${Date.now().toString(36)}-${entropy}`;
}
export function listVideoDrafts(owner) {
  if (!owner) return [];
  const prefix = keyFor(owner, '');
  const rows = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key));
      if (row?.id && String(row.owner) === String(owner) && Number.isFinite(row.updatedAt)) rows.push(row);
    } catch { /* Ignore an invalid record without hiding other drafts. */ }
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}
export function saveVideoDraft(owner, id, item, visibility) {
  if (!owner) throw new Error('A creator channel is required.');
  let previous = null;
  try { previous = JSON.parse(localStorage.getItem(keyFor(owner, id)) || 'null'); }
  catch { /* Replace only this invalid draft; other drafts remain available. */ }
  const row = {
    id, owner: String(owner), updatedAt: Date.now(),
    title: item.title || '', desc: item.desc || '', category: item.category || 'auto',
    isShort: item.isShort ?? null, visibility,
    fileName: item.file?.name || previous?.fileName || '',
    fileSize: item.file?.size ?? previous?.fileSize ?? 0,
    fileModified: item.file?.lastModified ?? previous?.fileModified ?? 0,
  };
  localStorage.setItem(keyFor(owner, id), JSON.stringify(row));
  signal();
  return row;
}
function openMedia() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('strug-video-drafts', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('media')) request.result.createObjectStore('media');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Draft storage is busy.'));
    request.onsuccess = () => resolve(request.result);
  });
}
async function mediaTransaction(owner, id, mode, operation) {
  const db = await openMedia();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('media', mode);
      const req = operation(tx.objectStore('media'), keyFor(owner, id));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Draft storage interrupted.'));
    });
  } finally { db.close(); }
}
export async function saveDraftMedia(owner, id, file, thumbnail) {
  // Avoid duplicating multi-GB uploads into browser storage. Keep their metadata instead.
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const size = (file?.size || 0) + (thumbnail?.size || 0);
  const available = estimate?.quota ? Math.max(0, estimate.quota - (estimate.usage || 0)) : 0;
  const safeLimit = estimate?.quota ? Math.min(512 * 1024 * 1024, available * 0.4) : 50 * 1024 * 1024;
  const fits = !file || size <= safeLimit;
  await mediaTransaction(owner, id, 'readwrite', (store, key) => store.put({
    file: fits ? file : null,
    thumbnail: thumbnail?.size <= 5 * 1024 * 1024 ? thumbnail : null,
  }, key));
  // A discard can happen while the asynchronous file write is pending.
  if (!localStorage.getItem(keyFor(owner, id))) {
    await mediaTransaction(owner, id, 'readwrite', (store, key) => store.delete(key));
  }
  return fits;
}
export function getDraftMedia(owner, id) {
  if (!localStorage.getItem(keyFor(owner, id))) return Promise.resolve(null);
  return mediaTransaction(owner, id, 'readonly', (store, key) => store.get(key));
}
export function deleteVideoDraft(owner, id) {
  localStorage.removeItem(keyFor(owner, id));
  signal();
  return mediaTransaction(owner, id, 'readwrite', (store, key) => store.delete(key)).catch(() => {});
}
