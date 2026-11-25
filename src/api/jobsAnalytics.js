import client from './client.js';
import { buildJobAnalyticsPayload } from '../utils/jobAnalytics.js';

/** Fire-and-forget seeker funnel event. Never throws into UI. */
export async function trackJobEvent(event, metadata = {}) {
  try {
    const payload = buildJobAnalyticsPayload(event, metadata);
    if (!payload.event) return false;
    await client.post('/job/analytics', payload);
    return true;
  } catch {
    return false;
  }
}
