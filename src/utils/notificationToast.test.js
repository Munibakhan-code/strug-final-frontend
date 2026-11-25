import { describe, expect, it } from 'vitest';
import { normalizeToastEvent, resolveToastTheme, toastEntityKey } from './notificationToast.js';

describe('resolveToastTheme', () => {
  it.each([
    ['rideshare', '#3b82f6'], ['courier', '#06b6d4'], ['food', '#f97316'],
    ['ecommerce', '#8b5cf6'], ['booking', '#14b8a6'], ['work', '#6366f1'],
    ['quotes', '#6366f1'], ['chat', '#a855f7'], ['payments', '#22c55e'],
    ['wallet', '#22c55e'], ['system', '#f59e0b'],
  ])('maps %s to its accent', (vertical, accent) => {
    expect(resolveToastTheme(vertical).accent).toBe(accent);
  });

  it('uses red for errors and the supplied app accent for unknown verticals', () => {
    expect(resolveToastTheme('food', 'error').accent).toBe('#ef4444');
    expect(resolveToastTheme('mystery', 'info', '#123456').accent).toBe('#123456');
  });
});

describe('notification normalization', () => {
  it('normalizes a unified notification with a stable entity key', () => {
    const toast = normalizeToastEvent({
      notification_id: 4, vertical: 'food', type: 'order.placed', title: 'New order',
      body: 'Order from Sam', entity_type: 'food_order', entity_id: 55, action_url: 'sd-food',
    });
    expect(toast).toMatchObject({ key: 'food:food_order:55', vertical: 'food', nav: 'sd-food' });
  });

  it('supports chat, window-bus, and malformed events', () => {
    expect(normalizeToastEvent({ channelId: 7, title: 'Ada', body: 'Hi' }, { source: 'chat' }))
      .toMatchObject({ key: 'chat:channel:7', vertical: 'chat', nav: 'messages' });
    expect(normalizeToastEvent({ title: 'Paid', body: 'Done', nav: 'wallet', vertical: 'wallet' }, { source: 'window' }))
      .toMatchObject({ nav: 'wallet', vertical: 'wallet' });
    expect(normalizeToastEvent(null)).toBeNull();
    expect(normalizeToastEvent({ body: 'missing title' })).toBeNull();
  });

  it('builds entity keys only from stable identity', () => {
    expect(toastEntityKey('rideshare', 'ride_request', 9)).toBe('rideshare:ride_request:9');
    expect(toastEntityKey('rideshare', null, null)).toBeNull();
  });
});
