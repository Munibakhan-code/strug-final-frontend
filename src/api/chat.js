import client from './client';
import i18n from '../i18n/index.js';
import { normalizeDmSourceVertical } from '../utils/dmSourceVertical.js';

export const getMyConversations = () =>
  client.get('/chat-participants/my-channels').then((r) => r.data);

/** Admin inbox: contextual support channels only. */
export function filterSupportConversations(conversations) {
  const list = Array.isArray(conversations) ? conversations : [];
  return list
    .filter((c) => c?.context_type === 'support')
    .sort((a, b) => {
      const aT = a.last_message?.sent_at ? new Date(a.last_message.sent_at).getTime() : 0;
      const bT = b.last_message?.sent_at ? new Date(b.last_message.sent_at).getTime() : 0;
      return bT - aT;
    });
}

export const getChannelParticipants = (channelId) =>
  client
    .get(`/chat-participants/channel/${channelId}`)
    .then((r) => r.data);

export const addGroupMember = (channelId, username) =>
  client.post(`/chat-channel/${channelId}/participants`, { username }).then((r) => r.data);

export const getChannelMessages = (channelId, limit = 30, beforeMessageId = null) => {
  const params = { limit };
  if (beforeMessageId) params.before_message_id = beforeMessageId;
  return client
    .get(`/chat-messages/channel/${channelId}`, { params })
    .then((r) => r.data);
};

export const getChatMessage = (messageId) =>
  client.get(`/chat-messages/${messageId}`).then((r) => r.data);

export const searchMessages = (channelId, query, limit = 20) =>
  client
    .get(`/chat-messages/channel/${channelId}/search`, {
      params: { q: query, limit },
    })
    .then((r) => r.data);

export const sendMessage = (channelId, content, contentType = 'text', clientMsgId, metadata = null) =>
  client
    .post('/chat-messages', {
      channel_id: channelId,
      content,
      content_type: contentType,
      client_msg_id: clientMsgId,
      ...(metadata ? { metadata } : {}),
    })
    .then((r) => r.data);

/** Server-backed scheduled chat (delivers even when the browser is closed). */
export const createScheduledMessage = ({
  channelId,
  content,
  contentType = 'text',
  clientMsgId,
  scheduledFor,
  metadata = null,
}) =>
  client
    .post('/scheduled-chat-messages', {
      channel_id: channelId,
      content,
      content_type: contentType,
      client_msg_id: clientMsgId,
      scheduled_for: scheduledFor instanceof Date
        ? scheduledFor.toISOString()
        : new Date(scheduledFor).toISOString(),
      ...(metadata ? { metadata } : {}),
    })
    .then((r) => r.data);

export const listScheduledMessages = (channelId = null) => {
  const params = {};
  if (channelId != null && channelId !== '') params.channel_id = channelId;
  return client.get('/scheduled-chat-messages', { params }).then((r) => r.data);
};

export const updateScheduledMessage = (scheduledMessageId, { content, scheduledFor } = {}) => {
  const body = {};
  if (content !== undefined) body.content = content;
  if (scheduledFor !== undefined) {
    body.scheduled_for = scheduledFor instanceof Date
      ? scheduledFor.toISOString()
      : new Date(scheduledFor).toISOString();
  }
  return client.patch(`/scheduled-chat-messages/${scheduledMessageId}`, body).then((r) => r.data);
};

export const cancelScheduledMessage = (scheduledMessageId) =>
  client.delete(`/scheduled-chat-messages/${scheduledMessageId}`).then((r) => r.data);

export const reactToMessage = (messageId, emoji) =>
  client.patch(`/chat-messages/${messageId}/react`, { emoji }).then((r) => r.data);

export const votePoll = (messageId, optionId) =>
  client.patch(`/chat-messages/${messageId}/poll-vote`, { option_id: optionId }).then((r) => r.data);

export const pinMessage = (messageId) =>
  client.patch(`/chat-messages/${messageId}/pin`).then((r) => r.data);

export const editMessage = (messageId, content) =>
  client.put(`/chat-messages/${messageId}`, { content }).then((r) => r.data);

export const deleteMessage = (messageId) =>
  client.delete(`/chat-messages/${messageId}`).then((r) => r.data);

/** Delete a whole conversation for the current user only (leave it; the other side keeps it). */
export const deleteConversation = (channelId) =>
  client.delete(`/chat-channel/${channelId}/leave`).then((r) => r.data);

export const markMessagesRead = (channelId) =>
  client.patch(`/chat-messages/channel/${channelId}/read`).then((r) => r.data);

export const uploadChatMedia = (channelId, file, metadata = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  const durationSeconds = metadata.durationSeconds ?? file?.durationSeconds;
  if (durationSeconds != null) {
    formData.append('duration_seconds', String(durationSeconds));
    formData.append('duration_ms', String(Math.round(Number(durationSeconds) * 1000)));
  }
  const waveformPeaks = metadata.waveformPeaks ?? file?.waveformPeaks;
  const caption = typeof metadata.caption === 'string' ? metadata.caption.trim() : '';
  if ((Array.isArray(waveformPeaks) && waveformPeaks.length) || caption) {
    formData.append(
      'metadata',
      JSON.stringify({
        ...(Array.isArray(waveformPeaks) && waveformPeaks.length
          ? { waveform_peaks: waveformPeaks.slice(0, 64).map((v) => Number(v)) }
          : {}),
        ...(caption ? { caption } : {}),
      }),
    );
  }
  return client
    .post(`/chat-media/channel/${channelId}`, formData, {
      // Let the browser set multipart boundary - manual Content-Type breaks uploads.
      timeout: 120000,
    })
    .then((r) => r.data);
};

export const muteChannel = (channelId, muted = true) =>
  client
    .patch(`/chat-participants/channel/${channelId}/mute`, { muted })
    .then((r) => r.data);

export const openDmChannel = (targetUserId, options = {}) => {
  const id =
    targetUserId !== null && typeof targetUserId === 'object'
      ? (targetUserId.other_user_id ??
        targetUserId.target_user_id ??
        targetUserId.user_id)
      : targetUserId;
  const sourceVertical = normalizeDmSourceVertical(
    options?.sourceVertical ?? options?.source_vertical,
  );
  const body = { target_user_id: id };
  if (sourceVertical) body.source_vertical = sourceVertical;
  return client.post('/chat-channel/dm', body).then((r) => {
    const data = r.data;
    if (data?.channel_id) {
      window.__openChatChannelId = data.channel_id;
    }
    notifyChatInboxUpdate();
    return data;
  });
};

const CONTEXT_ENDPOINTS = {
  rideshare: (id) => `/chat-context/rideshare/${id}`,
  food: (id) => `/chat-context/food/${id}`,
  food_pickup: (id) => `/chat-context/food/${id}/pickup`,
  services: (id) => `/chat-context/services/${id}`,
  ondemand: (id) => `/chat-context/ondemand/${id}`,
  shop: (id) => `/chat-context/shop/${id}`,
  product: (id) => `/chat-context/shop/${id}`,
  rental: (id) => `/chat-context/marketplace/rental/${id}`,
  marketplace: (id) => `/chat-context/marketplace/rental/${id}`,
  support: (id) => `/chat-context/support/${id}`,
  job_application: (id) => `/chat-context/job-application/${id}`,
};

const CONTEXT_RETURN_NAV_IDS = {
  rideshare: { id: 'rideshare', labelKey: 'messages.returnNav.backToRide' },
  food: { id: 'food', labelKey: 'messages.returnNav.backToOrder' },
  food_pickup: { id: 'food', labelKey: 'messages.returnNav.backToOrder' },
  services: { id: 'ondemand', labelKey: 'messages.returnNav.backToJob' },
  ondemand: { id: 'ondemand', labelKey: 'messages.returnNav.backToJob' },
  shop: { id: 'shop', labelKey: 'messages.returnNav.backToOrder' },
  product: { id: 'shop', labelKey: 'messages.returnNav.backToOrder' },
  job_application: { id: 'jobs', labelKey: 'messages.returnNav.backToJob' },
};

/** Where Messages "back" should return when chat was opened from a live vertical flow. */
export function getContextReturnNav(contextType) {
  const entry = CONTEXT_RETURN_NAV_IDS[contextType];
  if (!entry) return null;
  return { id: entry.id, label: i18n.t(entry.labelKey) };
}

export function getDriverDashboardReturnNav() {
  return { id: 'sd-drive', label: i18n.t('messages.returnNav.backToDashboard') };
}

export function peekNavReturn() {
  return window.__navReturn ?? null;
}

export function clearNavReturn() {
  delete window.__navReturn;
}

export const openContextConversation = (contextType, recordId, body) => {
  const path = CONTEXT_ENDPOINTS[contextType]?.(recordId);
  if (!path) throw new Error(`Invalid context type: ${contextType}`);
  return client.post(path, body ?? {}).then((r) => {
    const data = r.data;
    if (data?.channel_id) {
      window.__openChatChannelId = data.channel_id;
    }
    return data;
  });
};

export function notifyChatInboxUpdate() {
  window.dispatchEvent(new Event('strug:chat-inbox-update'));
}

export function parseRentalOrderId(order) {
  if (order == null) return null;
  if (typeof order === 'number' || typeof order === 'string') return Number(order) || null;
  return (
    order.rental_order_id ??
    order.order_id ??
    order._id ??
    order.id ??
    null
  );
}

const ORDER_CONTEXT_TYPES = {
  rideshare: 'rideshare',
  food: 'food',
  service: 'services',
  services: 'services',
  ondemand: 'ondemand',
  product: 'shop',
  shop: 'shop',
  rental: 'rental',
};

export async function openOrderChat(orderType, recordId, options = {}) {
  const context = ORDER_CONTEXT_TYPES[orderType];
  if (!context || recordId == null) return null;
  return openContextChat(context, recordId, options);
}

export async function openSupportChat({ initialMessage, navigate = true } = {}) {
  const supportUserId = import.meta.env.VITE_SUPPORT_USER_ID;
  if (!supportUserId) {
    throw new Error('Support chat is not configured (VITE_SUPPORT_USER_ID).');
  }
  const data = await openDmChannel(Number(supportUserId));
  const channelId = data?.channel_id;
  if (initialMessage && channelId) {
    try {
      await sendMessage(channelId, initialMessage);
    } catch {
      /* optional intro message */
    }
  }
  if (navigate && channelId) {
    window.__openChatChannelId = channelId;
    window.__nav?.('messages');
  }
  notifyChatInboxUpdate();
  return data;
}

export async function openRentalOrderChat(orderOrId, options = {}) {
  const orderId = parseRentalOrderId(orderOrId);
  if (!orderId) return null;
  return openContextChat('rental', orderId, options);
}

export async function openContextChat(
  contextType,
  recordId,
  { body, initialMessage, introOnCreateOnly = false, navigate = true, returnNav } = {},
) {
  const data = await openContextConversation(contextType, recordId, body);
  // introOnCreateOnly: the backend returns created:false when the channel already existed,
  // so callers whose CTA can be pressed repeatedly (e.g. a "Message" button that sits on a
  // list row) can avoid re-injecting the canned intro into an ongoing conversation.
  const skipIntro = introOnCreateOnly && data?.created !== true;
  if (initialMessage && !skipIntro && data?.channel_id) {
    try {
      await sendMessage(data.channel_id, initialMessage);
    } catch {
      /* optional intro message */
    }
  }
  if (navigate && data?.channel_id) {
    window.__openChatChannelId = data.channel_id;
    const backTarget = returnNav ?? getContextReturnNav(contextType);
    if (backTarget) window.__navReturn = backTarget;
    window.__nav?.('messages');
  }
  notifyChatInboxUpdate();
  return data;
}

export async function resolveComposeTarget(input) {
  const rawInput = input.trim();
  const raw = rawInput.replace(/^@/, '');
  if (!raw) throw new Error('Enter an email, user ID, or @handle');

  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum > 0) return asNum;

  if (raw.includes('@')) {
    const user = await client
      .get('/user/email/' + encodeURIComponent(raw))
      .then((r) => r.data);
    if (user?.user_id) return user.user_id;
  }

  const { searchContent } = await import('./social');
  const res = await searchContent(raw);
  const profiles = res?.data?.profiles ?? res?.profiles ?? [];
  const exact =
    profiles.find((p) => p.handle?.toLowerCase() === raw.toLowerCase()) ??
    profiles.find((p) => p.display_name?.toLowerCase() === raw.toLowerCase()) ??
    profiles[0];

  if (exact?.user_id) return exact.user_id;
  throw new Error('User not found. Try email, numeric user ID, or @handle.');
}

export async function getTotalUnreadCount() {
  const data = await getMyConversations();
  const list = Array.isArray(data) ? data : (data?.channels ?? []);
  return list.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
}

/** Open or create DM and optionally send intro + go to Messages. */
export function requireChatChannelId(data) {
  const id = data?.channel_id;
  if (id == null || id === "") {
    const err = new Error(data?.message || "Could not open conversation");
    err.code = "NO_CHANNEL";
    throw err;
  }
  return id;
}

export async function messageUser(targetUserId, { initialMessage, navigate = true, sourceVertical } = {}) {
  if (targetUserId == null || targetUserId === "") {
    throw new Error("User id is required");
  }
  const data = await openDmChannel(targetUserId, { sourceVertical });
  const channelId = requireChatChannelId(data);
  if (initialMessage) {
    try {
      await sendMessage(channelId, initialMessage);
    } catch {
      /* optional intro */
    }
  }
  if (navigate) {
    window.__nav?.("messages");
  }
  return data;
}

/** Open Messages on a channel (e.g. from notification). */
export function openChatChannel(channelId, { navigate = true } = {}) {
  if (channelId == null) return;
  window.__openChatChannelId = Number(channelId);
  if (navigate) window.__nav?.('messages');
  notifyChatInboxUpdate();
}

/** CHAT_MESSAGE social notification -> open channel (uses channel_id when present). */
export async function openChatFromNotification(notification) {
  const type = notification?.type;
  if (type !== 'CHAT_MESSAGE') return false;

  const channelId = notification?.channel_id;
  if (channelId != null) {
    openChatChannel(channelId);
    return true;
  }

  const messageId = notification?.target_id;
  if (!messageId) return false;
  try {
    const msg = await getChatMessage(messageId);
    if (!msg?.channel_id) return false;
    openChatChannel(msg.channel_id);
    return true;
  } catch {
    return false;
  }
}

/** Admin-only: open support ticket conversation with a customer. */
export async function openAdminSupportChat(ticketId, customerUserId, { navigate = true } = {}) {
  const path = CONTEXT_ENDPOINTS.support?.(ticketId);
  if (!path) throw new Error('Invalid support ticket');
  const data = await client
    .post(path, { customer_user_id: Number(customerUserId) })
    .then((r) => r.data);
  if (data?.channel_id) {
    window.__openChatChannelId = data.channel_id;
    if (navigate) window.__nav?.('messages');
    notifyChatInboxUpdate();
  }
  return data;
}

/** Mark in-app CHAT_MESSAGE social notifications read for messages in this channel. */
export async function markChatNotificationsReadForChannel(channelId) {
  if (channelId == null) return;
  try {
    const { getNotifications, markNotificationRead } = await import('./social');
    const res = await getNotifications();
    const list = res?.data ?? [];
    const pending = list.filter(
      (n) =>
        n.type === 'CHAT_MESSAGE' &&
        !n.is_read &&
        Number(n.channel_id) === Number(channelId),
    );
    await Promise.all(
      pending.map((n) => markNotificationRead(n.notification_id).catch(() => {})),
    );
    window.dispatchEvent(new Event('strug:notifications-update'));
  } catch {
    /* optional */
  }
}
