/**
 * Client-side X / Twitter URL normalize (mirrors backend/utils/twitter-source.js).
 * Used for optimistic validation before POST /town-hall/import.
 */

const HANDLE = /^@?([A-Za-z0-9_]{1,15})$/;
const STATUS_ID = /^\d{5,25}$/;

export function normalizeTwitterSourceUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    const err = new Error('Paste an X / Twitter profile or post URL');
    err.status = 400;
    throw err;
  }

  const bare = HANDLE.exec(trimmed);
  if (bare && !trimmed.includes('.')) {
    return `https://x.com/${bare[1]}`;
  }

  let url;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    const err = new Error('That does not look like an X / Twitter URL');
    err.status = 400;
    throw err;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (!['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(host)) {
    const err = new Error('Only X / Twitter profile or post links are supported');
    err.status = 400;
    throw err;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (!parts.length) {
    const err = new Error('Use a profile URL (x.com/handle) or a post link');
    err.status = 400;
    throw err;
  }

  const handle = parts[0].replace(/^@/, '');
  if (!HANDLE.test(handle)) {
    const err = new Error('Invalid X / Twitter handle');
    err.status = 400;
    throw err;
  }

  if (parts[1] === 'status' && parts[2] && STATUS_ID.test(parts[2])) {
    return `https://x.com/${handle}/status/${parts[2]}`;
  }

  return `https://x.com/${handle}`;
}

export function formatTownhallImportStatus(job) {
  if (!job) return null;
  const { status, imported_count = 0, skipped_count = 0, failed_count = 0, total_found = 0, error_message } = job;
  if (status === 'queued' || status === 'listing') return 'Looking up posts…';
  if (status === 'importing') {
    const done = imported_count + skipped_count + failed_count;
    return `Importing ${done}/${total_found || '?'}…`;
  }
  if (status === 'done') {
    return `Done — ${imported_count} imported, ${skipped_count} skipped, ${failed_count} failed`;
  }
  if (status === 'error') return error_message || 'Import failed';
  return status;
}
