import { useEffect } from "react";
import { subscribeSocketReconnect } from "../api/chatSocket";
import {
	CHAT_LIVE_FIRST_POLL_MS,
	CHAT_LIVE_POLL_MS,
} from "../utils/chatLive.js";

/**
 * Replica fan-out is not guaranteed (in-memory Socket.IO rooms). While a chat
 * surface is mounted, refresh the open thread + inbox over HTTP on a short
 * cadence, on tab focus, and whenever the socket reconnects and re-joins.
 */
export function useChatLiveFallback({ channelId, pollThread, pollInbox }) {
	useEffect(() => {
		const onReconnect = () => {
			pollInbox?.();
			if (channelId) pollThread?.(channelId);
		};
		return subscribeSocketReconnect(onReconnect);
	}, [channelId, pollThread, pollInbox]);

	useEffect(() => {
		if (!pollThread && !pollInbox) return undefined;

		const tick = () => {
			if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
			pollInbox?.();
			if (channelId) pollThread?.(channelId);
		};

		const first = setTimeout(tick, CHAT_LIVE_FIRST_POLL_MS);
		const interval = setInterval(tick, CHAT_LIVE_POLL_MS);
		const onVis = () => {
			if (document.visibilityState === "visible") tick();
		};
		document.addEventListener("visibilitychange", onVis);
		return () => {
			clearTimeout(first);
			clearInterval(interval);
			document.removeEventListener("visibilitychange", onVis);
		};
	}, [channelId, pollThread, pollInbox]);
}
