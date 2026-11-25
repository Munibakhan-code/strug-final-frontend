import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotificationPanel from './NotificationPanel';

// Pin the "today" rows to local noon of the current calendar day so the "Today"
// bucket is deterministic no matter when the suite runs. NotificationPanel buckets
// off local midnight (t >= startOfToday === "Today"), so noon-today always lands in
// "Today". A prior "1 minute ago" timestamp bucketed as "Yesterday" when CI ran in
// the first minute after midnight UTC — a real, if narrow, flake.
const todayNoon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.toISOString(); };
const daysAgoNoon = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.toISOString(); };

const ITEMS = [
  { key: 'a', vertical: 'rideshare', type: 'request', urgency: 'actionable', title: 'New ride request', body: 'Pickup at 210 Bay St', createdAt: todayNoon(), read: false, nav: 'rideshare' },
  { key: 'b', vertical: 'payments', type: 'payout', urgency: 'ambient', title: 'Payout sent', body: '$212.90 on the way', createdAt: todayNoon(), read: false, nav: 'account' },
  { key: 'c', vertical: 'social', type: 'like', urgency: 'ambient', title: '@dana liked your post', body: null, createdAt: daysAgoNoon(1), read: true, nav: 'social' }, // yesterday
];

const noop = () => {};
const baseProps = { loading: false, onClose: noop, onMarkRead: noop, onMarkAllRead: noop, onDismiss: noop, onNavigate: noop };

describe('NotificationPanel', () => {
  it('renders rows grouped by time with an unread count and time buckets', () => {
    render(<NotificationPanel items={ITEMS} {...baseProps} />);
    expect(screen.getByText('New ride request')).toBeInTheDocument();
    // unread count pill = 2 (a + b unread)
    expect(screen.getByText('2')).toBeInTheDocument();
    // a time bucket header renders
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('shows an inline action button only on actionable rows', () => {
    render(<NotificationPanel items={ITEMS} {...baseProps} />);
    // rideshare row is actionable -> "Respond"
    expect(screen.getByRole('button', { name: 'Respond' })).toBeInTheDocument();
  });

  it('mark-read control fires onMarkRead without navigating', () => {
    const onMarkRead = vi.fn();
    const onNavigate = vi.fn();
    render(<NotificationPanel items={ITEMS} {...baseProps} onMarkRead={onMarkRead} onNavigate={onNavigate} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark read' })[0]);
    expect(onMarkRead).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('dismiss control fires onDismiss without navigating', () => {
    const onDismiss = vi.fn();
    const onNavigate = vi.fn();
    render(<NotificationPanel items={ITEMS} {...baseProps} onDismiss={onDismiss} onNavigate={onNavigate} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);
    expect(onDismiss).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('clicking a row navigates and marks read', () => {
    const onMarkRead = vi.fn();
    const onNavigate = vi.fn();
    render(<NotificationPanel items={ITEMS} {...baseProps} onMarkRead={onMarkRead} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Payout sent'));
    expect(onMarkRead).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('account');
  });

  it('renders the richer empty state when there are no items', () => {
    render(<NotificationPanel items={[]} {...baseProps} />);
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });

  // #472 — deep-linking: a notification opens the specific post/profile, not just the category.
  const clickRow = (item, onNavigate) => {
    render(<NotificationPanel items={[{ createdAt: todayNoon(), read: false, ...item }]} {...baseProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText(item.title));
  };

  it('routes a town-hall-post notification to Social with the post target', () => {
    const onNavigate = vi.fn();
    clickRow({ key: 'th', title: '@ana liked your town hall post', type: 'townhall.like', nav: 'social', entityType: 'town_hall_post', entityId: 77 }, onNavigate);
    expect(onNavigate).toHaveBeenCalledWith('social', { townHallPostId: 77 });
  });

  it('routes a social-post like to the Feed with the post target', () => {
    const onNavigate = vi.fn();
    clickRow({ key: 'fp', title: '@ben liked your post', type: 'like', nav: 'social', entityType: 'social_post', entityId: 55 }, onNavigate);
    expect(onNavigate).toHaveBeenCalledWith('feed', { feedPostId: 55 });
  });

  it('routes a profile notification to that profile', () => {
    const onNavigate = vi.fn();
    clickRow({ key: 'pr', title: '@cara started following you', type: 'social.follow', nav: 'social', entityType: 'profile', entityId: 42 }, onNavigate);
    expect(onNavigate).toHaveBeenCalledWith('profile', { profileUserId: 42 });
  });

  it('does NOT deep-link a follow whose id is still a social_post id (falls back to category)', () => {
    // Pre-backend-fix, FOLLOW rows carry entityType 'social_post' + a profile_id — must not open
    // a bogus feed post; fall back to the plain nav until the backend sends a real user_id.
    const onNavigate = vi.fn();
    clickRow({ key: 'fl', title: '@dan started following you', type: 'follow', nav: 'social', entityType: 'social_post', entityId: 999 }, onNavigate);
    expect(onNavigate).toHaveBeenCalledWith('social');
  });

  it('falls back to plain category nav when there is no target', () => {
    const onNavigate = vi.fn();
    clickRow({ key: 'nt', title: 'System update', type: 'system', nav: 'account' }, onNavigate);
    expect(onNavigate).toHaveBeenCalledWith('account');
  });
});
