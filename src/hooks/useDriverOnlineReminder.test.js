import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDriverProfile = vi.fn();
const setDriverStatus = vi.fn();

vi.mock('../api/rideshare.js', () => ({
  getDriverProfile: (...args) => getDriverProfile(...args),
  setDriverStatus: (...args) => setDriverStatus(...args),
}));
vi.mock('../store/auth.js', () => ({
  getAuthUserId: () => 25,
  getToken: () => 'login-token-1',
}));

import { resetDriverReminderSessions, useDriverOnlineReminder } from './useDriverOnlineReminder.js';

beforeEach(() => {
  getDriverProfile.mockReset();
  setDriverStatus.mockReset();
  resetDriverReminderSessions();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 43.65, longitude: -79.38 } })),
    },
  });
});

describe('useDriverOnlineReminder', () => {
  it('queues one persistent reminder when the signed-in driver is offline', async () => {
    getDriverProfile.mockResolvedValue({ data: { driver_profile_id: 3, is_online: false } });
    const push = vi.fn();
    const { rerender } = renderHook(({ ready }) => useDriverOnlineReminder(ready, { push }), {
      initialProps: { ready: true },
    });

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push.mock.calls[0][0]).toMatchObject({
      key: 'driver-online-reminder:25:ogin-token-1',
      vertical: 'rideshare',
      persistent: true,
    });
    expect(push.mock.calls[0][0].actions.map((action) => action.label)).toEqual(['Go Online', 'Not Now']);

    rerender({ ready: false });
    rerender({ ready: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('requests location and updates the backend from Go Online', async () => {
    getDriverProfile.mockResolvedValue({ data: { driver_profile_id: 3, is_online: false } });
    setDriverStatus.mockResolvedValue({ is_online: true });
    const push = vi.fn();
    renderHook(() => useDriverOnlineReminder(true, { push }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    await act(async () => push.mock.calls[0][0].actions[0].run());
    expect(setDriverStatus).toHaveBeenCalledWith(true, 43.65, -79.38);
  });

  it('does not prompt riders or drivers who are already online', async () => {
    getDriverProfile.mockRejectedValueOnce({ response: { status: 404 } });
    const riderPush = vi.fn();
    renderHook(() => useDriverOnlineReminder(true, { push: riderPush }));
    await waitFor(() => expect(getDriverProfile).toHaveBeenCalled());
    expect(riderPush).not.toHaveBeenCalled();

    resetDriverReminderSessions();
    getDriverProfile.mockResolvedValueOnce({ data: { driver_profile_id: 3, is_online: true } });
    const onlinePush = vi.fn();
    renderHook(() => useDriverOnlineReminder(true, { push: onlinePush }));
    await waitFor(() => expect(getDriverProfile).toHaveBeenCalledTimes(2));
    expect(onlinePush).not.toHaveBeenCalled();
  });
});
