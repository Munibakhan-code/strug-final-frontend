/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client.js', () => ({
  default: { post: vi.fn() },
}));

import client from './client.js';
import {
  RECRUIT_FIRST_TOUCH_KEY,
  stashFirstTouchRecruiter,
  peekFirstTouchRecruiter,
  clearFirstTouchRecruiter,
  claimFirstTouchRecruiter,
} from './referral.js';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(client.post).mockReset();
});

describe('first-touch recruiter (share-link discovery)', () => {
  it('stashes and peeks a trimmed code', () => {
    stashFirstTouchRecruiter('  CREATOR1  ');
    expect(peekFirstTouchRecruiter()).toBe('CREATOR1');
    expect(localStorage.getItem(RECRUIT_FIRST_TOUCH_KEY)).toBe('CREATOR1');
    clearFirstTouchRecruiter();
    expect(peekFirstTouchRecruiter()).toBe('');
  });

  it('claims the stashed creator and clears storage', async () => {
    stashFirstTouchRecruiter('CREATOR1');
    vi.mocked(client.post).mockResolvedValue({ data: { successful: true } });
    const result = await claimFirstTouchRecruiter();
    expect(client.post).toHaveBeenCalledWith('/referral/apply', { ref_code: 'CREATOR1' });
    expect(result).toEqual({ claimed: true });
    expect(peekFirstTouchRecruiter()).toBe('');
  });

  it('does not steal credit if the follower already has a recruiter', async () => {
    stashFirstTouchRecruiter('CREATOR1');
    vi.mocked(client.post).mockRejectedValue({
      response: {
        status: 409,
        data: { successful: false, message: 'You already have a recruiter and cannot be recruited by someone else' },
      },
    });
    const result = await claimFirstTouchRecruiter();
    expect(result.already).toBe(true);
    expect(result.claimed).toBe(false);
    expect(peekFirstTouchRecruiter()).toBe('');
  });

  it('drops an invalid own-code without retrying forever', async () => {
    stashFirstTouchRecruiter('MYCODE');
    vi.mocked(client.post).mockRejectedValue({
      response: {
        status: 400,
        data: { successful: false, message: 'Cannot apply your own referral code' },
      },
    });
    const result = await claimFirstTouchRecruiter();
    expect(result.claimed).toBe(false);
    expect(peekFirstTouchRecruiter()).toBe('');
  });
});
