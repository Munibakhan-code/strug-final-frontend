import client from './client';

// POST /ai-chat — backend ai-chat-routes.js → runChatGraph
// body: { message, verticalSlug, history: [{ role: 'user'|'assistant', content }] }
// returns: { response } (string). Auth is optional — anonymous callers are not bound to a user.
export const sendAIChat = ({ message, verticalSlug = 'general', history = [] }) =>
	client
		.post('/ai-chat', { message, verticalSlug, history })
		.then((r) => r.data?.response ?? '');
