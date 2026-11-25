/** True when Messages is showing this channel (suppress toast/push/badge noise). */
export function isViewingChatChannel(channelId) {
  if (channelId == null) return false;
  const active = window.__activeChatChannelId;
  if (active == null) return false;
  return Number(active) === Number(channelId);
}
