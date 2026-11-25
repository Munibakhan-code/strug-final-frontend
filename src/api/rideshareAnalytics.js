import client from './client.js';
import { buildRideAnalyticsPayload } from '../utils/rideshareRiderExperience.js';

export async function trackRideEvent(event, metadata = {}) {
  try {
    await client.post('/ride-request/analytics', buildRideAnalyticsPayload(event, metadata));
    return true;
  } catch {
    return false;
  }
}
