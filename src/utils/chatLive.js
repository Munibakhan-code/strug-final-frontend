/** Merge a freshly fetched page into the open thread without dropping local rows. */
export function mergeChatMessageLists(prev, incoming) {
	const prevList = Array.isArray(prev) ? prev : [];
	const nextList = Array.isArray(incoming) ? incoming : [];
	if (nextList.length === 0) return prevList;

	const seen = new Set();
	const remember = (m) => {
		if (m?.id != null && m.id !== "") seen.add(`id:${m.id}`);
		if (m?.clientMsgId) seen.add(`c:${m.clientMsgId}`);
	};
	prevList.forEach(remember);

	const additions = [];
	for (const m of nextList) {
		if (m?.id != null && String(m.id).startsWith("tmp-")) continue;
		const idKey = m?.id != null && m.id !== "" ? `id:${m.id}` : null;
		const cKey = m?.clientMsgId ? `c:${m.clientMsgId}` : null;
		if ((idKey && seen.has(idKey)) || (cKey && seen.has(cKey))) continue;
		additions.push(m);
		if (idKey) seen.add(idKey);
		if (cKey) seen.add(cKey);
	}
	if (additions.length === 0) return prevList;

	additions.sort((a, b) => {
		const at = a.sentAt || a.sent_at ? new Date(a.sentAt ?? a.sent_at).getTime() : 0;
		const bt = b.sentAt || b.sent_at ? new Date(b.sentAt ?? b.sent_at).getTime() : 0;
		if (at !== bt) return at - bt;
		return Number(a.id) - Number(b.id);
	});
	return [...prevList, ...additions];
}

export const CHAT_LIVE_POLL_MS = 2500;
export const CHAT_LIVE_FIRST_POLL_MS = 1200;
export const SOCKET_RECONNECTED_EVENT = "strug:socket-reconnected";
