/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import client from './client.js';
import {
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
} from './social.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('follow request endpoints (#1626)', () => {
  it('getFollowRequests → GET /social-follow/requests', async () => {
    client.get.mockResolvedValue({
      data: {
        successful: true,
        data: [{ requester_profile_id: 5, requester: { handle: 'fan' } }],
      },
    });
    const out = await getFollowRequests();
    expect(client.get).toHaveBeenCalledWith('/social-follow/requests', { params: { limit: 50 } });
    expect(out.data).toHaveLength(1);
    expect(out.data[0].requester_profile_id).toBe(5);
  });

  it('getFollowRequests returns empty list', async () => {
    client.get.mockResolvedValue({ data: { successful: true, data: [] } });
    const out = await getFollowRequests();
    expect(out.data).toEqual([]);
  });

  it('getFollowRequests forwards limit query param', async () => {
    client.get.mockResolvedValue({ data: { successful: true, data: [] } });
    await getFollowRequests(10);
    expect(client.get).toHaveBeenCalledWith('/social-follow/requests', { params: { limit: 10 } });
  });

  it('getFollowRequests rejects when API returns 401', async () => {
    client.get.mockRejectedValue({ response: { status: 401 } });
    await expect(getFollowRequests()).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it('acceptFollowRequest → POST /social-follow/requests/:id/accept', async () => {
    client.post.mockResolvedValue({ data: { successful: true, action: 'accepted' } });
    const out = await acceptFollowRequest(12);
    expect(client.post).toHaveBeenCalledWith('/social-follow/requests/12/accept');
    expect(out.action).toBe('accepted');
  });

  it('acceptFollowRequest targets the requester profile id in the path', async () => {
    client.post.mockResolvedValue({ data: { successful: true, action: 'accepted' } });
    await acceptFollowRequest(99);
    expect(client.post).toHaveBeenCalledWith('/social-follow/requests/99/accept');
  });

  it('rejectFollowRequest → POST /social-follow/requests/:id/reject', async () => {
    client.post.mockResolvedValue({ data: { successful: true, action: 'rejected' } });
    const out = await rejectFollowRequest(12);
    expect(client.post).toHaveBeenCalledWith('/social-follow/requests/12/reject');
    expect(out.action).toBe('rejected');
  });

  it('rejectFollowRequest rejects on 403 when caller is not the profile owner', async () => {
    client.post.mockRejectedValue({ response: { status: 403 } });
    await expect(rejectFollowRequest(12)).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});
