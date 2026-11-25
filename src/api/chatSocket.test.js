import { describe, it, expect, vi, beforeEach } from 'vitest';

const socket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('./socket', () => ({
  connectSocket: vi.fn(() => socket),
}));

describe('subscribeChatEvents', () => {
  beforeEach(() => {
    socket.on.mockClear();
    socket.off.mockClear();
  });

  it('subscribes notification handlers to legacy and unified notification events', async () => {
    const { subscribeChatEvents } = await import('./chatSocket');
    const onNotification = vi.fn();

    const unsubscribe = subscribeChatEvents({ onNotification });

    expect(socket.on).toHaveBeenCalledWith('new-notification', onNotification);
    expect(socket.on).toHaveBeenCalledWith('notification:new', onNotification);

    unsubscribe();

    expect(socket.off).toHaveBeenCalledWith('new-notification', onNotification);
    expect(socket.off).toHaveBeenCalledWith('notification:new', onNotification);
  });
});
