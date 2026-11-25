import client from './client';

/** Public platform pulse for profile sidebar (Platform Today + Did You Know tips). */
export const getPlatformToday = () =>
  client.get('/platform/today').then((r) => r.data?.data ?? r.data);

/** Curated What's New / quotes / news / spotlight / spin / poll shape / goals. */
export const getPlatformProfileContent = () =>
  client.get('/platform/profile-content').then((r) => r.data?.data ?? r.data);

/** Book of the day from catalog (or curated fallback). */
export const getPlatformBookOfDay = () =>
  client.get('/platform/book-of-day').then((r) => r.data?.data ?? r.data);

/** Live weather via backend Open-Meteo proxy. */
export const getPlatformWeather = (params) =>
  client.get('/platform/weather', { params }).then((r) => r.data?.data ?? r.data);

/** Platform community poll + tallies (optional auth for my_vote). */
export const getPlatformProfilePoll = () =>
  client.get('/platform/profile-poll').then((r) => r.data?.data ?? r.data);

export const votePlatformProfilePoll = (option) =>
  client.post('/platform/profile-poll/vote', { option }).then((r) => r.data?.data ?? r.data);

export const clearPlatformProfilePollVote = () =>
  client.delete('/platform/profile-poll/vote').then((r) => r.data);

/** Sticky notes / daily goals / challenge completion (auth). */
export const getPlatformSidebarState = () =>
  client.get('/platform/me/sidebar-state').then((r) => r.data?.data ?? r.data);

export const putPlatformSidebarState = (state) =>
  client.put('/platform/me/sidebar-state', state).then((r) => r.data?.data ?? r.data);
