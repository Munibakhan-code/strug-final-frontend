/** Local dev login — never enabled on production SWA builds unless explicitly opted in on localhost. */
export function isLocalDevLoginEnabled() {
  if (import.meta.env.VITE_DEV_LOGIN === 'false') return false;

  const isLocalHost = () => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  };

  if (import.meta.env.VITE_DEV_LOGIN === 'true') {
    return isLocalHost();
  }

  // Default: Vite dev server on localhost only (production `npm run build` → always false).
  return !!import.meta.env.DEV && isLocalHost();
}
