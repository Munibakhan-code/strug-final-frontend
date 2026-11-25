import { connectSocket } from './socket';
import {
  rememberJoinedChatChannel,
  forgetJoinedChatChannel,
  listJoinedChatChannels,
} from './chatRooms';
import { SOCKET_RECONNECTED_EVENT } from '../utils/chatLive.js';
import { notifyChatInboxUpdate } from './chat';

function rejoinTrackedChatRooms() {
  const socket = connectSocket();
  for (const channelId of listJoinedChatChannels()) {
    socket.emit('join_chat', { channel_id: channelId });
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SOCKET_RECONNECTED_EVENT));
    notifyChatInboxUpdate();
  }
}

function installChatRejoin(socket) {
  socket.off('connect', rejoinTrackedChatRooms);
  socket.on('connect', rejoinTrackedChatRooms);
}

function emitWithAck(event, payload) {
  const socket = connectSocket();
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res) => {
      if (res?.ok === false) {
        reject(new Error(res.message || `Socket ${event} failed`));
        return;
      }
      resolve(res);
    });
    setTimeout(() => reject(new Error(`Socket ${event} timed out`)), 12000);
  });
}

export function joinChatChannel(channelId) {
  const id = rememberJoinedChatChannel(channelId);
  if (id == null) return Promise.reject(new Error('Invalid chat channel'));
  const socket = connectSocket();
  installChatRejoin(socket);
  return emitWithAck('join_chat', { channel_id: id });
}

export function leaveChatChannel(channelId) {
  forgetJoinedChatChannel(channelId);
  const socket = connectSocket();
  socket.emit('leave_chat', { channel_id: Number(channelId) });
}

export function sendChatMessageSocket(
  channelId,
  content,
  contentType = 'text',
  clientMsgId,
  metadata = null,
) {
  return emitWithAck('send_chat_message', {
    channel_id: Number(channelId),
    content,
    content_type: contentType,
    client_msg_id: clientMsgId,
    ...(metadata ? { metadata } : {}),
  }).then((res) => res.message ?? res);
}

export function markMessagesReadSocket(channelId) {
  return emitWithAck('mark_messages_read', { channel_id: Number(channelId) });
}

// #275 presence: ask for a one-shot snapshot of which of the given user ids are online.
// The server intersects the list with the caller's actual chat peers, so this only ever
// returns presence for people the caller messages. Live edges arrive as 'presence-changed'
// on the caller's own socket (server pushes to the user's private room) — no subscribe step.
export function queryPresence(userIds) {
  return emitWithAck('presence_query', { user_ids: (userIds || []).map(Number) })
    .then((res) => res?.online ?? [])
    .catch(() => []);
}

export function emitTypingStart(channelId) {
  connectSocket().emit('typing_start', { channel_id: Number(channelId) });
}

export function emitTypingStop(channelId) {
  connectSocket().emit('typing_stop', { channel_id: Number(channelId) });
}

export function subscribeChatEvents({
  onMessageCreated,
  onMessageUpdated,
  onMessageDeleted,
  onTypingStarted,
  onTypingStopped,
  onMessagesRead,
  onPresenceChanged,
  onChatError,
  onNotification,
}) {
  const socket = connectSocket();
  installChatRejoin(socket);

  if (onMessageCreated) socket.on('message-created', onMessageCreated);
  if (onMessageUpdated) socket.on('message-updated', onMessageUpdated);
  if (onMessageDeleted) socket.on('message-deleted', onMessageDeleted);
  if (onTypingStarted) socket.on('typing-started', onTypingStarted);
  if (onTypingStopped) socket.on('typing-stopped', onTypingStopped);
  if (onMessagesRead) socket.on('messages-read', onMessagesRead);
  if (onPresenceChanged) socket.on('presence-changed', onPresenceChanged);
  if (onChatError) socket.on('chat-error', onChatError);
  if (onNotification) {
    socket.on('new-notification', onNotification);
    socket.on('notification:new', onNotification);
  }

  return () => {
    if (onMessageCreated) socket.off('message-created', onMessageCreated);
    if (onMessageUpdated) socket.off('message-updated', onMessageUpdated);
    if (onMessageDeleted) socket.off('message-deleted', onMessageDeleted);
    if (onTypingStarted) socket.off('typing-started', onTypingStarted);
    if (onTypingStopped) socket.off('typing-stopped', onTypingStopped);
    if (onMessagesRead) socket.off('messages-read', onMessagesRead);
    if (onPresenceChanged) socket.off('presence-changed', onPresenceChanged);
    if (onChatError) socket.off('chat-error', onChatError);
    if (onNotification) {
      socket.off('new-notification', onNotification);
      socket.off('notification:new', onNotification);
    }
  };
}

export function subscribeSocketReconnect(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') return () => {};
  window.addEventListener(SOCKET_RECONNECTED_EVENT, handler);
  return () => window.removeEventListener(SOCKET_RECONNECTED_EVENT, handler);
}
