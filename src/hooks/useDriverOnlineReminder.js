import { useEffect } from 'react';
import { getDriverProfile, setDriverStatus } from '../api/rideshare.js';
import { getAuthUserId, getToken } from '../store/auth.js';

const checkedSessions = new Set();

export function resetDriverReminderSessions() {
  checkedSessions.clear();
}

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error("Location isn't available on this device. Enable location to go online."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) => reject(new Error(error?.code === 1
        ? 'Location is blocked. Allow location access so riders can find you.'
        : "Couldn't get your location. Check GPS and try again.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

export function useDriverOnlineReminder(authReady, { push } = {}) {
  useEffect(() => {
    if (!authReady || !push) return undefined;
    const uid = getAuthUserId();
    const token = getToken();
    if (uid == null || !token) return undefined;

    const sessionId = `${uid}:${token.slice(-12)}`;
    if (checkedSessions.has(sessionId)) return undefined;
    checkedSessions.add(sessionId);
    let cancelled = false;

    getDriverProfile()
      .then((response) => {
        if (cancelled) return;
        const profile = response?.data ?? response;
        if (!profile?.driver_profile_id || profile.is_online !== false) return;
        push({
          key: `driver-online-reminder:${sessionId}`,
          title: "You're currently offline",
          body: 'Go online so nearby riders can find and request you.',
          vertical: 'rideshare',
          icon: 'wifi-off',
          persistent: true,
          actions: [
            {
              id: 'go-online',
              label: 'Go Online',
              run: async () => {
                const coords = await currentPosition();
                await setDriverStatus(true, coords.latitude, coords.longitude);
              },
            },
            { id: 'not-now', label: 'Not Now', intent: 'secondary', run: () => Promise.resolve() },
          ],
        });
      })
      .catch(() => {
        // A 404 means this account is not a rideshare driver. Other profile lookup failures
        // should not interrupt login; the dashboard remains the manual status control.
      });

    return () => { cancelled = true; };
  }, [authReady, push]);
}
