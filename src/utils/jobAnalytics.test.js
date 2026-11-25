/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { buildJobAnalyticsPayload } from './jobAnalytics.js';

describe('buildJobAnalyticsPayload', () => {
  it('accepts allow-listed events with job ids', () => {
    expect(buildJobAnalyticsPayload('job_viewed', { job_id: 12 })).toEqual({
      event: 'job_viewed',
      job_id: 12,
    });
    expect(buildJobAnalyticsPayload('job_applied', {
      job_id: '9',
      job_application_id: 3,
      email: 'x@y.z',
    })).toEqual({
      event: 'job_applied',
      job_id: 9,
      job_application_id: 3,
    });
  });

  it('drops unknown events', () => {
    expect(buildJobAnalyticsPayload('page_viewed', { job_id: 1 })).toEqual({ job_id: 1 });
  });
});
