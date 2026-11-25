import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Isolate the popup from the HTTP + socket layers — assert it calls the API correctly.
vi.mock('../api/chat', () => ({
  getChannelMessages: vi.fn(),
  sendMessage: vi.fn(),
  markMessagesRead: vi.fn(() => Promise.resolve()),
}));
vi.mock('../api/chatSocket', () => ({
  subscribeChatEvents: vi.fn(() => () => {}),
  joinChatChannel: vi.fn(() => Promise.resolve()),
  leaveChatChannel: vi.fn(),
  // useChatLiveFallback resubscribes on socket reconnect; stub the unsubscribe.
  subscribeSocketReconnect: vi.fn(() => () => {}),
}));

import { getChannelMessages, sendMessage, markMessagesRead } from '../api/chat';
import { joinChatChannel } from '../api/chatSocket';
import { setUser } from '../store/auth.js';
import QuickReplyPopup from './QuickReplyPopup.jsx';

const CHANNEL = { channelId: 42, title: 'Ada Lovelace', pic: null };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setUser({ user_id: 1 });
  getChannelMessages.mockResolvedValue({
    messages: [
      { message_id: 10, channel_id: 42, sender_id: 2, content: 'hey are you around?', sent_at: '2026-07-16T10:00:00Z', user: { name: 'Ada Lovelace' } },
      { message_id: 11, channel_id: 42, sender_id: 1, content: 'yes! one sec', sent_at: '2026-07-16T10:01:00Z' },
    ],
  });
});

describe('QuickReplyPopup', () => {
  it('renders nothing when no channel is selected', () => {
    const { container } = render(<QuickReplyPopup channel={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('loads the thread in place and shows the peer + both sides of the conversation', async () => {
    render(<QuickReplyPopup channel={CHANNEL} onClose={() => {}} onOpenFull={() => {}} />);
    // Header names the peer and offers the escape hatch to the full page.
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open full chat/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('hey are you around?')).toBeInTheDocument());
    expect(screen.getByText('yes! one sec')).toBeInTheDocument();
    // It joins the channel room and clears the unread on open.
    expect(joinChatChannel).toHaveBeenCalledWith(42);
    expect(markMessagesRead).toHaveBeenCalledWith(42);
    // The channel is flagged as actively viewed so duplicate toasts stay suppressed.
    expect(Number(window.__activeChatChannelId)).toBe(42);
  });

  it('recovers the sender name from the thread when the toast is a generic "New message"', async () => {
    // The notification-delivery path (common in prod without cross-replica sockets) can't name
    // the sender, so the toast arrives titled "New message". Once the thread loads, the header
    // should show the real peer name instead of that generic placeholder.
    const genericToast = { channelId: 42, title: 'New message', pic: null };
    render(<QuickReplyPopup channel={genericToast} onClose={() => {}} onOpenFull={() => {}} />);
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.queryByText('New message')).toBeNull();
  });

  it('sends a reply over the chat API without leaving the section', async () => {
    sendMessage.mockResolvedValue({ message_id: 12, channel_id: 42, sender_id: 1, content: 'be right there', sent_at: '2026-07-16T10:02:00Z' });
    const user = userEvent.setup();
    render(<QuickReplyPopup channel={CHANNEL} onClose={() => {}} onOpenFull={() => {}} />);
    await waitFor(() => expect(screen.getByText('hey are you around?')).toBeInTheDocument());

    const box = screen.getByLabelText(/type a reply/i);
    await user.type(box, 'be right there');
    await user.click(screen.getByRole('button', { name: /send reply/i }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const [channelId, content, contentType, clientMsgId] = sendMessage.mock.calls[0];
    expect(channelId).toBe(42);
    expect(content).toBe('be right there');
    expect(contentType).toBe('text');
    expect(clientMsgId).toBeTruthy();
    // Optimistic echo is on screen.
    expect(screen.getByText('be right there')).toBeInTheDocument();
  });

  it('closes on the × button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<QuickReplyPopup channel={CHANNEL} onClose={onClose} onOpenFull={() => {}} />);
    await user.click(screen.getByRole('button', { name: /close conversation/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
