/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { mergeWorkStatusProfile, rollbackWorkStatusProfile } from './profileWorkStatus.js';

describe('mergeWorkStatusProfile', () => {
  it('patches an existing profile with optimistic status', () => {
    const merged = mergeWorkStatusProfile(
      { profile_id: 1, display_name: 'Ada', work_status: null },
      'available_for_work',
      null,
    );
    expect(merged).toEqual({
      profile_id: 1,
      display_name: 'Ada',
      work_status: 'available_for_work',
    });
  });

  it('seeds a profile from the server row when local profile is null', () => {
    const merged = mergeWorkStatusProfile(
      null,
      'available_for_work',
      { profile_id: 9, handle: 'newuser', work_status: 'available_for_work' },
    );
    expect(merged.profile_id).toBe(9);
    expect(merged.work_status).toBe('available_for_work');
    expect(merged.handle).toBe('newuser');
  });

  it('keeps an explicit null work_status from the server (cleared badge)', () => {
    const merged = mergeWorkStatusProfile(
      { profile_id: 1, work_status: 'hiring' },
      null,
      { profile_id: 1, work_status: null },
    );
    expect(merged.work_status).toBeNull();
  });
});

describe('rollbackWorkStatusProfile', () => {
  it('restores the previous profile object', () => {
    const prev = { profile_id: 1, work_status: null };
    expect(rollbackWorkStatusProfile(prev)).toBe(prev);
  });

  it('returns null when there was no prior profile', () => {
    expect(rollbackWorkStatusProfile(null)).toBeNull();
  });
});
