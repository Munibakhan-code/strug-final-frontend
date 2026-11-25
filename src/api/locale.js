import client from './client';

/** Geo-IP + browser language hint from backend. */
export const detectLocale = () =>
  client.get('/locale/detect').then((r) => r.data?.data ?? r.data);
