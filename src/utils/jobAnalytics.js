/** Jobs seeker funnel analytics payload helpers (Phase 9). */

const JOB_ANALYTICS_EVENTS = new Set(['job_viewed', 'job_applied']);

function positiveInt(value) {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Build a safe POST /job/analytics body. Unknown events / fields are dropped.
 * @param {string} event
 * @param {{ job_id?: number|string, job_application_id?: number|string }} [metadata]
 */
export function buildJobAnalyticsPayload(event, metadata = {}) {
  const payload = {};
  if (JOB_ANALYTICS_EVENTS.has(event)) payload.event = event;
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return payload;
  const jobId = positiveInt(metadata.job_id);
  if (jobId != null) payload.job_id = jobId;
  const appId = positiveInt(metadata.job_application_id);
  if (appId != null) payload.job_application_id = appId;
  return payload;
}
