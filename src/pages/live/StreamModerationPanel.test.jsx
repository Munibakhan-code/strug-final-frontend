import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Isolate the panel from the HTTP layer — assert it loads state and calls the API correctly.
vi.mock('../../api/live.js', () => ({
  getChatSettings: vi.fn(),
  updateChatSettings: vi.fn(),
  getChatModerators: vi.fn(),
  addChatModerator: vi.fn(),
  removeChatModerator: vi.fn(),
  getChatBans: vi.fn(),
  banChatUser: vi.fn(),
  unbanChatUser: vi.fn(),
  getBannedWords: vi.fn(),
  addBannedWord: vi.fn(),
  removeBannedWord: vi.fn(),
}));

import * as live from '../../api/live.js';
import StreamModerationPanel from './StreamModerationPanel.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  live.getChatSettings.mockResolvedValue({ data: { chat_mode: 'PUBLIC', slow_mode_ms: 0 } });
  live.getBannedWords.mockResolvedValue({ data: [{ word_id: 1, word: 'spam' }] });
  live.getChatBans.mockResolvedValue({ data: [{ ban_id: 7, user_id: 42, reason: 'harassment', expires_at: null, user: { user_id: 42, username: 'troll', name: 'T' } }] });
  live.getChatModerators.mockResolvedValue({ data: [{ mod_id: 3, user_id: 9, user: { user_id: 9, username: 'helper', name: 'H' } }] });
});

describe('StreamModerationPanel', () => {
  it('loads and renders the current moderation state', async () => {
    render(<StreamModerationPanel />);
    await waitFor(() => expect(screen.getByText(/Chat controls/i)).toBeInTheDocument());
    // banned word chip, active ban, and moderator all render
    expect(screen.getByText('spam')).toBeInTheDocument();
    expect(screen.getByText('@troll')).toBeInTheDocument();
    expect(screen.getByText(/harassment/)).toBeInTheDocument();
    expect(screen.getByText('@helper')).toBeInTheDocument();
  });

  it('adds a blocked word through the API', async () => {
    live.addBannedWord.mockResolvedValueOnce({ data: { word_id: 2, word: 'badword' } });
    const user = userEvent.setup();
    render(<StreamModerationPanel />);
    await waitFor(() => expect(screen.getByText(/Blocked words/i)).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Add a word or phrase/i), 'BadWord');
    await user.click(screen.getByRole('button', { name: /^Add$/i }));

    expect(live.addBannedWord).toHaveBeenCalledWith('badword');
    await waitFor(() => expect(screen.getByText('badword')).toBeInTheDocument());
  });

  it('bans a user by username with a timeout duration', async () => {
    live.banChatUser.mockResolvedValueOnce({ data: {} });
    live.getChatBans.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<StreamModerationPanel />);
    await waitFor(() => expect(screen.getByText(/Bans & timeouts/i)).toBeInTheDocument());

    await user.type(screen.getAllByPlaceholderText('@username')[0], '@baduser');
    await user.selectOptions(screen.getAllByRole('combobox')[2], '60');
    await user.click(screen.getByRole('button', { name: /^Ban$/i }));

    expect(live.banChatUser).toHaveBeenCalledWith(expect.objectContaining({ target_username: 'baduser', duration_minutes: 60 }));
  });

  it('lifts a ban via unban', async () => {
    live.unbanChatUser.mockResolvedValue({ successful: true });
    const user = userEvent.setup();
    render(<StreamModerationPanel />);
    await waitFor(() => expect(screen.getByText('@troll')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Unban/i }));
    expect(live.unbanChatUser).toHaveBeenCalledWith(42);
    await waitFor(() => expect(screen.queryByText('@troll')).toBeNull());
  });

  it('saves chat settings', async () => {
    live.updateChatSettings.mockResolvedValueOnce({ successful: true });
    const user = userEvent.setup();
    render(<StreamModerationPanel />);
    await waitFor(() => expect(screen.getByText(/Chat controls/i)).toBeInTheDocument());

    const whoCanChat = screen.getAllByRole('combobox')[0];
    await user.selectOptions(whoCanChat, 'FOLLOWERS_ONLY');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(live.updateChatSettings).toHaveBeenCalledWith(expect.objectContaining({ chat_mode: 'FOLLOWERS_ONLY' }));
  });
});
