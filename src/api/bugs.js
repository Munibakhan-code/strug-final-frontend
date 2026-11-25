import client from './client.js';
import { collectDiagnostics } from '../utils/diagnostics.js';

// Submit a bug report. Screenshots are optional (File[] / FileList, up to 3).
// Sent as multipart/form-data so the backend's multer can pick up `screenshots`.
//
// `client_context` carries what the app knew at submit time — build SHA, viewport, device,
// the SPA page, and the last few console errors / failed API calls. It is what stops the board
// from having to ask "which account? which page? what threw?" (see utils/diagnostics.js for
// the privacy contract; the backend re-sanitises everything in utils/bug-report-context.js).
export async function submitBugReport({ title, description, category, severity, screenshots, navId, user, context }) {
  const form = new FormData();
  form.append('title', title);
  form.append('description', description);
  if (category) form.append('category', category);
  if (severity) form.append('severity', severity);
  form.append('page_url', typeof window !== 'undefined' ? window.location.href : '');

  // The caller passes the same object it showed the user in the disclosure panel, so what we
  // send is exactly what they saw. Fall back to collecting it here if not supplied.
  const diagnostics = context ?? collectDiagnostics({ navId, user });
  if (diagnostics) form.append('client_context', JSON.stringify(diagnostics));

  if (screenshots && screenshots.length) {
    Array.from(screenshots).forEach((file) => form.append('screenshots', file));
  }

  const { data } = await client.post('/bug-reports/submit', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// The caller's own reports, each with its reporter↔board thread. Backs the "My reports" page —
// which is where a reporter reads a follow-up question and answers it.
// → { successful, count, reports: [{ ..., messages: [...], awaiting_you }] }
export async function getMyBugReports() {
  const { data } = await client.get('/bug-reports/mine');
  return data;
}

// Answer a board question on your own report. Authed as a normal app user — no board login.
// → { successful, data: { message, status, awaiting_you } }
export async function replyToBugReport(id, body) {
  const { data } = await client.post(`/bug-reports/mine/${id}/messages`, { body });
  return data;
}
