import { useEffect, useState } from 'react';
import { validateRideSchedule } from '../utils/rideshareRiderExperience.js';

const MAX_TIMER_DELAY = 2_147_000_000;

export function useRideScheduleValidation(timing, scheduleDate, scheduleTime) {
  const [clock, setClock] = useState(() => Date.now());
  const validation = validateRideSchedule({ timing, scheduleDate, scheduleTime, now: clock });

  useEffect(() => {
    if (timing !== 'schedule' || !validation.valid || !validation.scheduledAt) return undefined;
    const expiresAt = new Date(validation.scheduledAt).getTime();
    const delay = Math.min(MAX_TIMER_DELAY, Math.max(1, expiresAt - Date.now() + 1));
    const timeoutId = setTimeout(() => setClock(Date.now()), delay);
    return () => clearTimeout(timeoutId);
  }, [timing, scheduleDate, scheduleTime, validation.valid, validation.scheduledAt, clock]);

  return validation;
}
