import { io } from 'socket.io-client';
import { getToken } from '../store/auth';
import { clearJoinedChatChannels } from './chatRooms';

let socket = null;

// S8: resolve the socket endpoint from env. Never silently fall back to localhost in a
// deployed build — that points live chat / viewer-count at the user's own machine. In dev
// (import.meta.env.DEV) localhost is the intended default; in a prod build, a missing env is
// a misconfiguration, so warn loudly and use same-origin rather than localhost.
function resolveSocketUrl() {
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const absoluteApiBase = /^https?:\/\//.test(apiBase || '') ? apiBase : null;
  const fromEnv = import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_BACKEND_URL ?? absoluteApiBase;
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return 'http://localhost:5001';
  console.error('[socket] VITE_SOCKET_URL / VITE_API_BASE_URL are unset in a production build — falling back to same-origin. Live chat and viewer counts may not work.');
  return window.location.origin;
}

export function getSocket() {
  if (!socket) {
    socket = io(resolveSocketUrl(), {
      autoConnect: false,
      auth: { token: getToken() },
      // The backend runs multiple replicas (HTTP autoscale) with the default in-memory
      // socket.io adapter and NO sticky sessions / Redis adapter. HTTP long-polling spreads
      // a single engine.io session's requests across replicas, so follow-up polls carry a
      // `sid` the receiving replica doesn't know → HTTP 400 "Session ID unknown" → the client
      // reconnects forever (a ~2/sec error storm that drains mobile battery/data). Connecting
      // over WebSocket only opens one long-lived connection pinned to a single replica, which
      // sidesteps the sid-bounce entirely. If true multi-replica fan-out is ever needed, add
      // the @socket.io/redis-adapter on the server and/or enable ingress session affinity.
      transports: ['websocket'],
      withCredentials: true,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  s.auth.token = getToken();
  if (!s.connected) s.connect();
  return s;
}

let registeredProfileId = null;

function onSocketConnectForProfile() {
  if (registeredProfileId) {
    getSocket().emit("register-social-profile", registeredProfileId);
  }
}

/** Join profile_* room so CHAT_MESSAGE new-notification events are delivered. */
export function registerSocialProfileRoom(profileId) {
  registeredProfileId = profileId ? Number(profileId) : null;
  const s = connectSocket();
  if (s.connected && registeredProfileId) {
    s.emit("register-social-profile", registeredProfileId);
  }
  s.off("connect", onSocketConnectForProfile);
  s.on("connect", onSocketConnectForProfile);
}

export function disconnectSocket() {
  registeredProfileId = null;
  clearJoinedChatChannels();
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch { /* ignore */ }
    socket = null;
  }
}

/** Join trip_{id} room (server verifies passenger or assigned driver). */
export function joinTripRoom(tripId) {
  const id = Number(tripId);
  if (!id || Number.isNaN(id)) return;
  const s = connectSocket();
  const emit = () => s.emit("join-trip", id);
  if (s.connected) emit();
  else s.once("connect", emit);
}

/** Leave trip room on complete/cancel/unmount. */
export function leaveTripRoom(tripId) {
  const id = Number(tripId);
  if (!id || Number.isNaN(id)) return;
  const s = getSocket();
  if (s.connected) s.emit("leave-trip", id);
}
