const joinedChatChannels = new Set();

export function rememberJoinedChatChannel(channelId) {
	const id = Number(channelId);
	if (!Number.isFinite(id) || id <= 0) return null;
	joinedChatChannels.add(id);
	return id;
}

export function forgetJoinedChatChannel(channelId) {
	const id = Number(channelId);
	if (!Number.isFinite(id)) return;
	joinedChatChannels.delete(id);
}

export function listJoinedChatChannels() {
	return [...joinedChatChannels];
}

export function clearJoinedChatChannels() {
	joinedChatChannels.clear();
}
