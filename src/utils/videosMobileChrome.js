/**
 * Geometry the mobile Videos section shares with the app shell.
 *
 * Constants, not a component, on purpose: App.jsx needs them for the fab and the notification bell,
 * and the Videos page is lazy-loaded — importing the nav component there would drag it into the main
 * bundle just to read two numbers.
 */

/** Height of the Videos tab bar row. Safe-area inset is added on top of it, never taken out. */
export const VIDEOS_MOBILE_NAV_HEIGHT = 62;

/**
 * One line above the tab bar where everything that floats on Videos docks: the notification bell,
 * the Messages fab and the phone mini-player. They have to agree, or the mini-player lands on top
 * of the fab; the fab's usual 78px sits on the tab bar's labels.
 */
export const VIDEOS_MOBILE_DOCK_BOTTOM = 126;
