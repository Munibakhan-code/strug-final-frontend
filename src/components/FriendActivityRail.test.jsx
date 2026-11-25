import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FriendActivityRail from './FriendActivityRail.jsx';

const likedItem = {
  video_id: 7,
  title: 'A Friend Liked This',
  thumbnail_url: 'https://cdn/thumb.jpg',
  duration_sec: 125,
  views_count: 4200,
  public_id: 'abc123',
  slug: 'a-friend',
  channel: { channel_id: 3, display_name: 'Cool Channel', handle: 'cool' },
  friend_count: 1,
  watching_now: false,
  friends: [{ profile_id: 2, user_id: 9, display_name: 'Xavier', handle: 'xavier', avatar_url: null, action: 'liked' }],
};

const watchingItem = {
  ...likedItem,
  video_id: 8,
  title: 'Watching Now',
  watching_now: true,
  friend_count: 3,
  friends: [
    { profile_id: 2, display_name: 'Xavier', action: 'watching' },
    { profile_id: 3, display_name: 'Ana', action: 'watching' },
    { profile_id: 4, display_name: 'Bo', action: 'watched' },
  ],
};

describe('FriendActivityRail', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<FriendActivityRail items={[]} variant="column" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the header + a card with single-friend "liked" attribution', () => {
    render(<FriendActivityRail items={[likedItem]} variant="column" onSelect={() => {}} />);
    expect(screen.getByText(/Friends are watching/i)).toBeInTheDocument();
    expect(screen.getByText('A Friend Liked This')).toBeInTheDocument();
    expect(screen.getByText('Xavier liked this')).toBeInTheDocument();
  });

  it('treats legacy watching_now as watched (no Live badge)', () => {
    render(<FriendActivityRail items={[watchingItem]} variant="shelf" onSelect={() => {}} />);
    expect(screen.getByText('Xavier +2 watched this')).toBeInTheDocument();
    expect(screen.queryByText(/Live/i)).not.toBeInTheDocument();
  });

  it('calls onSelect with a hydration payload carrying `id` when a card is clicked', async () => {
    const onSelect = vi.fn();
    render(<FriendActivityRail items={[likedItem]} variant="column" onSelect={onSelect} />);
    await userEvent.click(screen.getByText('A Friend Liked This'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const payload = onSelect.mock.calls[0][0];
    // selectVideo() needs `id` to fetch the playable hls_url.
    expect(payload.id).toBe(7);
    expect(payload.title).toBe('A Friend Liked This');
    expect(payload.public_id).toBe('abc123');
  });
});
