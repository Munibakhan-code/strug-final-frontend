import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Watch / mini-player flows do real userEvent + waitFor against the full page; 5s flakes under load.
vi.setConfig({ testTimeout: 15000 });


// Page-level coverage for the Videos browse bar: the chips and the Home/Clips tabs are wired
// straight into the real VideosPage, so this asserts the thing that actually ships — which chip
// produces which API request, and what lands on screen — rather than the components in isolation.
//
// It exists because the browse bar cannot be exercised by hand in a logged-out preview: the app's
// preview gate (App.jsx, #333/#154) sends every click to sign-in, so a manual pass can never reach
// chip selection at all.

const viewport = { isMobile: false, isTablet: false, isDesktopWide: true, width: 1280 };
// MOBILE_MAX comes along because the page reads it directly for the phone-rotation handlers; a mock
// without it makes every rotation throw.
vi.mock('../hooks/useViewport.js', () => ({ MOBILE_MAX: 767, useViewport: () => viewport }));
vi.mock('../hooks/usePageLoad.js', () => ({ usePageLoad: () => false }));
vi.mock('../hooks/usePageI18n.js', () => ({
  usePageI18n: () => ({ t: (k) => k, title: 'Videos', landingTitle: 'Videos', searchPlaceholder: 'Search' }),
}));

// Real English strings, so the test asserts the labels a user actually reads. {{placeholders}} are
// filled in the same way i18next would, or a label like "Start at {{time}}" never matches. The
// helper is inlined in both factories because vi.mock is hoisted above any top-level binding.
vi.mock('react-i18next', async () => {
  const en = (await import('../i18n/locales/en.json')).default;
  const lookup = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), en);
  const t = (key, opts) => {
    const pluralKey = opts?.count == null ? key : `${key}_${Number(opts.count) === 1 ? 'one' : 'other'}`;
    const s = lookup(pluralKey) ?? lookup(key) ?? opts?.defaultValue ?? key;
    return typeof s === 'string' && opts ? s.replace(/\{\{(\w+)\}\}/g, (m, n) => (opts[n] == null ? m : String(opts[n]))) : s;
  };
  return { useTranslation: () => ({ t, i18n: { language: 'en' } }), initReactI18next: { type: '3rdParty', init: () => {} } };
});
vi.mock('../i18n/index.js', async () => {
  const en = (await import('../i18n/locales/en.json')).default;
  const lookup = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), en);
  const t = (key, opts) => {
    const pluralKey = opts?.count == null ? key : `${key}_${Number(opts.count) === 1 ? 'one' : 'other'}`;
    const s = lookup(pluralKey) ?? lookup(key) ?? opts?.defaultValue ?? key;
    return typeof s === 'string' && opts ? s.replace(/\{\{(\w+)\}\}/g, (m, n) => (opts[n] == null ? m : String(opts[n]))) : s;
  };
  return { default: { t, language: 'en', on: () => {}, off: () => {} } };
});

vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } } }));
vi.mock('../components/FriendActivityRail.jsx', () => ({ default: () => null }));
vi.mock('../components/ReportModal.jsx', () => ({ default: () => null }));
vi.mock('../utils/uploadManager.js', () => ({ enqueueUpload: vi.fn(), onVideoCreated: () => () => {} }));
vi.mock('../store/auth.js', () => ({ getAuthUserId: () => 1 }));
vi.mock('../api/videos', () => ({
  getVideoFeed: vi.fn(), getHomeFeed: vi.fn(), getShorts: vi.fn(), getWatchHistory: vi.fn(), getVideo: vi.fn(),
  getVideoRecommendations: vi.fn(), getMyChannel: vi.fn(), getChannelByHandle: vi.fn(),
  createChannel: vi.fn(), getVideoComments: vi.fn(), addVideoComment: vi.fn(),
  deleteVideoComment: vi.fn(), toggleCommentLike: vi.fn(), toggleVideoLike: vi.fn(),
  toggleVideoDislike: vi.fn(), getLikedVideoIds: vi.fn(), subscribeToChannel: vi.fn(),
  unsubscribeFromChannel: vi.fn(), getChannelSubscriptionStatus: vi.fn(), recordVideoView: vi.fn(),
  recordWatchProgress: vi.fn(), getWatchResume: vi.fn(), getWatchLater: vi.fn(),
  toggleWatchLater: vi.fn(), getMySubscriptions: vi.fn(), getSubscriptionUploads: vi.fn(), getSubscriptionCreatorPicks: vi.fn(), createCreatorPick: vi.fn(), getChannelAnalytics: vi.fn(),
  getPlaylists: vi.fn(), getChannelPlaylists: vi.fn(), createPlaylist: vi.fn(), addVideoToPlaylist: vi.fn(),
  removeVideoFromPlaylist: vi.fn(),
  searchVideos: vi.fn(), suggestVideos: vi.fn(), getFriendVideoActivity: vi.fn(),
  getFriendChannelOverlap: vi.fn(),
  getChipSignals: vi.fn(), logVideoSearch: vi.fn(),
}));

import * as api from '../api/videos';
import { DRAWER_SUB_UPLOAD_CAP } from '../utils/friendCircle.js';
import { VideosPage } from './Videos.jsx';

/** Feed row in the v2 keyset shape the real endpoint returns. */
const vid = (id, title, extra = {}) => ({
  video_id: id, public_id: `p${id}`, slug: `s${id}`, title,
  thumbnail_url: `https://cdn.test/${id}.jpg`, duration_sec: 90, views_count: 100 * id,
  video_type: 'long', created_at: '2026-08-01T00:00:00Z',
  description: extra.description ?? `About ${title}`,
  channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
  ...extra,
});
const feed = (items) => ({ successful: true, data: { items, next_cursor: null } });
const homeFeed = (items, nextCursor = null, cold = false) => ({
  successful: true,
  data: {
    items: items.map((v) => ({ ...v, content_type: 'video' })),
    next_cursor: nextCursor,
    cold_start: cold,
  },
});
const mockEditorialFeed = (items, nextCursor = null) => {
  api.getHomeFeed.mockResolvedValue(homeFeed(items, nextCursor));
  api.getVideoFeed.mockResolvedValue(feed(items));
};

beforeEach(() => {
  vi.clearAllMocks();
  viewport.isMobile = false;
  viewport.width = 1280;
  // jsdom keeps one location for the whole file, and opening a video pushes /v/:id. Without this
  // the next test mounts on that URL and deep-links straight back into the video it left behind.
  window.history.replaceState({}, '', '/videos');
  mockEditorialFeed([vid(1, 'Editorial One')]);
  api.getShorts.mockResolvedValue(feed([]));
  api.getWatchHistory.mockResolvedValue({ successful: true, data: [] });
  api.getLikedVideoIds.mockResolvedValue([]);
  api.getMyChannel.mockResolvedValue({ data: null });
  api.getPlaylists.mockResolvedValue({ data: [] });
  api.getChannelPlaylists.mockResolvedValue([]);
  api.getWatchLater.mockResolvedValue({ data: [] });
  api.getMySubscriptions.mockResolvedValue({ data: [] });
  api.getSubscriptionUploads.mockResolvedValue({ data: [] });
  api.getSubscriptionCreatorPicks.mockResolvedValue({ data: [] });
  api.createCreatorPick.mockResolvedValue({ successful: true, data: { pick_id: 1 } });
  api.getFriendVideoActivity.mockResolvedValue([]);
  api.getFriendChannelOverlap.mockResolvedValue([]);
  api.getVideo.mockResolvedValue(null);
  // Watch-view endpoints, so a test that opens a video doesn't blow up on an unmocked promise.
  api.getVideoComments.mockResolvedValue({ data: [] });
  api.getVideoRecommendations.mockResolvedValue(feed([]));
  api.getChannelSubscriptionStatus.mockResolvedValue({ subscribed: false });
  api.recordVideoView.mockResolvedValue({});
  api.recordWatchProgress.mockResolvedValue({});
  api.getWatchResume.mockResolvedValue({});
  // VideosPage runs its own search as soon as the box has 2+ characters.
  api.searchVideos.mockResolvedValue(feed([]));
  api.suggestVideos.mockResolvedValue({ suggestions: [], videos: [], channels: [] });
  // Default: the personalisation endpoint says nothing, so the built-in ordering applies.
  api.getChipSignals.mockResolvedValue(null);
  api.logVideoSearch.mockResolvedValue(undefined);
  api.getChannelAnalytics.mockResolvedValue({ data: {} });
  api.getChannelByHandle.mockResolvedValue({ data: null });
});

const bar = () => screen.getByRole('radiogroup', { name: 'Filter videos by category' });
const chip = (name) => within(bar()).getByRole('radio', { name });
/** The browse effect is debounce-free but async; wait for the request it should have fired. */
const lastFeedCall = () => api.getVideoFeed.mock.calls.at(-1)?.[0];

describe('Videos browse bar — chips drive the real feed requests', () => {
  // With no watch history the page renders the new-user ordering: "All" and the section filters
  // stay put, the categories lead with the globally popular ones, and "Watched" stays last.
  it('renders the merged chip row with the new-user ordering, Watched last', async () => {
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    const labels = within(bar()).getAllByRole('radio').map((c) => c.textContent);
    expect(labels).toEqual([
      'All', 'Trending', 'Latest', 'Discover',
      'Music', 'Entertainment', 'Gaming', 'Comedy', 'Tech',
      'General', 'Sports', 'News', 'Education', 'Travel', 'Food', 'Fitness',
      'Watched',
    ]);
  });

  it('uses the server\'s regional trends when the personalisation endpoint answers', async () => {
    api.getChipSignals.mockResolvedValue({
      country: 'Pakistan',
      personalised: false,
      personal: [],
      regional: ['News', 'Comedy'],
      global: ['Gaming'],
    });
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    await waitFor(() => {
      const labels = within(bar()).getAllByRole('radio').map((c) => c.textContent);
      // Server-supplied regional order leads the categories, ahead of the built-in defaults.
      expect(labels.indexOf('News')).toBeLessThan(labels.indexOf('Music'));
      expect(labels.indexOf('Comedy')).toBeLessThan(labels.indexOf('Music'));
      expect(labels[0]).toBe('All');
      expect(labels[labels.length - 1]).toBe('Watched');
    });
  });

  it('keeps "All" first and "Watched" last once a watch history personalises the row', async () => {
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: Array.from({ length: 8 }, (_, i) => ({
        watched_at: new Date(Date.now() - i * 3600000).toISOString(),
        video: { ...vid(100 + i, `Tech ${i}`), category: 'Tech' },
      })),
    });
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    await waitFor(() => {
      const labels = within(bar()).getAllByRole('radio').map((c) => c.textContent);
      expect(labels[0]).toBe('All');
      expect(labels[labels.length - 1]).toBe('Watched');
      // The watched category is lifted ahead of the untouched ones.
      expect(labels.indexOf('Tech')).toBeLessThan(labels.indexOf('Travel'));
    });
  });

  it('labels the chip bar distinctly from the upload form\'s category field', async () => {
    render(<VideosPage />);
    // Both used to be named "Category", which is ambiguous for screen readers on one page.
    expect(await screen.findByRole('radiogroup', { name: 'Filter videos by category' })).toBeInTheDocument();
  });

  it('starts on All with no narrowing request', async () => {
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    expect(chip('All')).toHaveAttribute('aria-checked', 'true');
    // Editorial landing loads personalised home-feed; filtered chips still use /video/feed.
    await waitFor(() => expect(api.getHomeFeed).toHaveBeenCalled());
    expect(api.getVideoFeed.mock.calls.every(([p]) => !p?.category)).toBe(true);
  });

  it('sends sort=trending for the Trending chip and no category', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(chip('Trending'));
    await waitFor(() => expect(lastFeedCall()).toMatchObject({ sort: 'trending' }));
    expect(lastFeedCall().category).toBeUndefined();
    expect(chip('Trending')).toHaveAttribute('aria-checked', 'true');
  });

  it('sends the API category value — not the chip id — for a category chip', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(chip('Music'));
    await waitFor(() => expect(lastFeedCall()).toMatchObject({ category: 'Music', sort: 'latest' }));
  });

  it('sends category=General for the General chip (the backend default bucket)', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(chip('General'));
    await waitFor(() => expect(lastFeedCall()).toMatchObject({ category: 'General' }));
  });

  it('is single-select — picking a category clears the previous section filter', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(chip('Trending'));
    await waitFor(() => expect(lastFeedCall()).toMatchObject({ sort: 'trending' }));
    await user.click(chip('Tech'));
    await waitFor(() => expect(lastFeedCall()).toMatchObject({ category: 'Tech', sort: 'latest' }));
    expect(chip('Trending')).toHaveAttribute('aria-checked', 'false');
    expect(within(bar()).getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  it('renders the videos the selected category returns', async () => {
    const user = userEvent.setup();
    api.getVideoFeed.mockResolvedValue(feed([vid(7, 'A Gaming Clip'), vid(8, 'Another Gaming One')]));
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(chip('Gaming'));
    expect(await screen.findByText('A Gaming Clip')).toBeInTheDocument();
    expect(await screen.findByText('Another Gaming One')).toBeInTheDocument();
  });

  it('loads watch history for the Watched chip instead of the catalogue', async () => {
    const user = userEvent.setup();
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [{ watched_at: '2026-08-09T10:00:00Z', video: vid(42, 'Something I Watched') }],
    });
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    const feedCallsBefore = api.getVideoFeed.mock.calls.length;

    await user.click(chip('Watched'));

    await waitFor(() => expect(api.getWatchHistory).toHaveBeenCalled());
    expect(await screen.findByText('Something I Watched')).toBeInTheDocument();
    // A personal list must not also fire a catalogue query.
    expect(api.getVideoFeed.mock.calls.length).toBe(feedCallsBefore);
  });

  it('drops a watch-history row whose video is still processing', async () => {
    const user = userEvent.setup();
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [
        { watched_at: '2026-08-09T10:00:00Z', video: vid(1, 'Ready One', { status: 'safe' }) },
        { watched_at: '2026-08-09T11:00:00Z', video: vid(2, 'Unsafe One', { status: 'pending' }) },
      ],
    });
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(chip('Watched'));
    expect(await screen.findByText('Ready One')).toBeInTheDocument();
    expect(screen.queryByText('Unsafe One')).not.toBeInTheDocument();
  });

  it('returns to the unfiltered editorial view when All is picked again', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(chip('Music'));
    await waitFor(() => expect(lastFeedCall()).toMatchObject({ category: 'Music' }));
    await user.click(chip('All'));
    await waitFor(() => expect(chip('All')).toHaveAttribute('aria-checked', 'true'));
    expect(within(bar()).getAllByRole('radio', { checked: true })).toHaveLength(1);
  });
});

describe('video upload localization and mobile layout', () => {
  const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

  afterEach(() => {
    if (createObjectUrlDescriptor) Object.defineProperty(URL, 'createObjectURL', createObjectUrlDescriptor);
    else delete URL.createObjectURL;
    if (revokeObjectUrlDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
    else delete URL.revokeObjectURL;
  });

  it('fits localized bulk-upload actions into two full-width mobile rows', async () => {
    const user = userEvent.setup();
    viewport.isMobile = true;
    viewport.width = 320;
    api.getMyChannel.mockResolvedValue({ data: { channel_id: 9, handle: 'nine', display_name: 'Creator Nine' } });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:video-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    render(<VideosPage />);
    await user.click(await screen.findByTitle('Upload Video'));
    const fileInput = document.querySelector('input[type="file"][multiple]');
    expect(fileInput).not.toBeNull();
    await user.upload(fileInput, [
      new File(['one'], 'one.mp4', { type: 'video/mp4' }),
      new File(['two'], 'two.mp4', { type: 'video/mp4' }),
    ]);

    const footer = await screen.findByTestId('video-upload-footer');
    expect(footer).toHaveStyle({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' });
    expect(within(footer).getByRole('button', { name: '← Previous' })).toBeInTheDocument();
    expect(within(footer).getByRole('button', { name: 'Next →' })).toBeInTheDocument();
    expect(within(footer).getByRole('button', { name: 'Upload 2 videos' })).toBeInTheDocument();
  });
});

describe('search suggestions — one flat list', () => {
  const type = async (user, text) => {
    const box = screen.getByPlaceholderText('Search');
    await user.click(box);
    await user.type(box, text);
    return box;
  };

  beforeEach(() => {
    api.suggestVideos.mockResolvedValue({
      suggestions: ['Morning Routine for Peak Energy'],
      videos: [vid(42, 'Morning Routine for Peak Energy')],
      channels: [{ channel_id: 9, display_name: 'FitWithMorgan', handle: 'fitwithmorgan', profile_pic_url: null }],
    });
  });

  it('logs a settled search once, with the result count', async () => {
    const user = userEvent.setup();
    api.searchVideos.mockResolvedValue(feed([vid(1, 'a'), vid(2, 'b')]));
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    await type(user, 'mor');

    await waitFor(() => expect(api.logVideoSearch).toHaveBeenCalledWith('mor', 2));
    // Typing more of the same word must not file a second row for it.
    await type(user, 'n');
    await waitFor(() => expect(api.searchVideos).toHaveBeenCalledWith('morn'));
    expect(api.logVideoSearch.mock.calls.filter(([q]) => q === 'mor')).toHaveLength(1);
  });

  it('records a zero-result search — the signal watch history can never show', async () => {
    const user = userEvent.setup();
    api.searchVideos.mockResolvedValue(feed([]));
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    await type(user, 'cooking');

    await waitFor(() => expect(api.logVideoSearch).toHaveBeenCalledWith('cooking', 0));
  });

  it('clears the box from the round clear button', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    const box = await type(user, 'mor');
    expect(box).toHaveValue('mor');

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(box).toHaveValue('');
    // It only exists while there is something to clear.
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('drops the section headings the two-column dropdown used to show', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await type(user, 'mor');

    expect(await screen.findByText('Morning Routine for Peak Energy')).toBeInTheDocument();
    expect(screen.queryByText(/^Recent$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Creators$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you might like/i)).not.toBeInTheDocument();
  });

  it('lists phrase and channel results together in the same column', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await type(user, 'mor');

    expect(await screen.findByText('Morning Routine for Peak Energy')).toBeInTheDocument();
    // FitWithMorgan can appear in the suggest dropdown and on the search-results channel
    // row once the page-level search effect settles — both are valid.
    expect(screen.getAllByText('FitWithMorgan').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('@fitwithmorgan')).toBeInTheDocument();
  });

  // /video/suggest matches titles that START WITH the query for its phrase list, but its video
  // list also matches anywhere in the title or description — so a video found by its description
  // has no phrase row. Those used to live in the removed "You might like" pane.
  it('still lists videos that no phrase row covers', async () => {
    const user = userEvent.setup();
    api.suggestVideos.mockResolvedValue({
      suggestions: ['Morning Routine for Peak Energy'],
      videos: [
        vid(42, 'Morning Routine for Peak Energy'),
        vid(77, 'Sunrise Habits'), // matched on description only — no phrase row
      ],
      channels: [],
    });
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await type(user, 'mor');

    expect(await screen.findByText('Sunrise Habits')).toBeInTheDocument();
    // The one that does have a phrase row is not duplicated.
    expect(screen.getAllByText('Morning Routine for Peak Energy')).toHaveLength(1);
  });

  it('opens the video from one of those rows', async () => {
    const user = userEvent.setup();
    api.suggestVideos.mockResolvedValue({
      suggestions: [],
      videos: [vid(77, 'Sunrise Habits')],
      channels: [],
    });
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await type(user, 'mor');

    await user.click(await screen.findByText('Sunrise Habits'));

    await waitFor(() => expect(api.getVideo).toHaveBeenCalledWith(77));
  });

  it('opens the video directly when a suggestion is exactly a video title', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await type(user, 'mor');

    const row = await screen.findByText('Morning Routine for Peak Energy');
    await user.click(row);

    // Routed to the video rather than just filling the search box — this is what the removed
    // "You might like" pane used to be for. (searchVideos fires from typing, not from this click.)
    await waitFor(() => expect(api.getVideo).toHaveBeenCalledWith(42));
  });
});

describe('search results — channel rows open the creator page', () => {
  it('loads the channel feed when a matched creator is clicked from search results', async () => {
    const user = userEvent.setup();
    api.searchVideos.mockResolvedValue(feed([vid(55, 'Fit Workout')]));
    api.suggestVideos.mockResolvedValue({
      suggestions: [],
      videos: [],
      channels: [{ channel_id: 9, display_name: 'FitWithMorgan', handle: 'fitwithmorgan', profile_pic_url: null }],
    });
    api.getVideoFeed.mockImplementation((params) => {
      if (params?.channel_id === 9) return Promise.resolve(feed([vid(56, 'Channel Video')]));
      return Promise.resolve(feed([vid(1, 'Editorial One')]));
    });
    api.getChannelByHandle.mockResolvedValue(null);
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    const box = screen.getByPlaceholderText('Search');
    await user.click(box);
    await user.type(box, 'fitwith');

    await waitFor(() => expect(api.searchVideos).toHaveBeenCalledWith('fitwith'));
    expect(await screen.findByText('Channels')).toBeInTheDocument();
    await user.click(screen.getByText('View Channel →'));

    await waitFor(() => expect(api.getVideoFeed).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: 9, include_shorts: true, limit: 50 }),
    ));
    expect(await screen.findByText('Channel Video')).toBeInTheDocument();
  });

  it('opens the channel from the search dropdown when a creator row is picked', async () => {
    const user = userEvent.setup();
    api.suggestVideos.mockResolvedValue({
      suggestions: [],
      videos: [],
      channels: [{ channel_id: 9, display_name: 'FitWithMorgan', handle: 'fitwithmorgan', profile_pic_url: null }],
    });
    api.getVideoFeed.mockImplementation((params) => {
      if (params?.channel_id === 9) return Promise.resolve(feed([vid(57, 'Dropdown Channel Video')]));
      return Promise.resolve(feed([vid(1, 'Editorial One')]));
    });
    api.getChannelByHandle.mockResolvedValue(null);
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    const box = screen.getByPlaceholderText('Search');
    await user.click(box);
    await user.type(box, 'fit');
    await user.click(await screen.findByText('FitWithMorgan'));

    await waitFor(() => expect(api.getVideoFeed).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: 9, include_shorts: true, limit: 50 }),
    ));
    expect(await screen.findByText('Dropdown Channel Video')).toBeInTheDocument();
  });
});

describe('library — creator avatars on saved rows', () => {
  const pic = 'https://cdn.test/avatar-nine.jpg';
  const savedVideo = (id, title) => ({
    saved_at: '2026-08-12T00:00:00Z',
    video: vid(id, title, {
      channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine', profile_pic_url: pic },
    }),
  });

  it('shows the channel profile photo on Watch Later cards', async () => {
    const user = userEvent.setup();
    api.getWatchLater.mockResolvedValue({ data: [savedVideo(102, 'Saved For Later')] });
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Library' }));
    await user.click(await screen.findByText('Watch Later'));

    await waitFor(() => expect(screen.getByText('Saved For Later')).toBeInTheDocument());
    const avatar = document.querySelector(`img[src="${pic}"]`);
    expect(avatar).toBeTruthy();
    expect(avatar).toHaveAttribute('alt', 'Creator Nine');
  });

  it('shows the channel profile photo on Watch History cards', async () => {
    const user = userEvent.setup();
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [{ watched_at: '2026-08-12T00:00:00Z', video: savedVideo(103, 'Seen Before').video }],
    });
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Library' }));
    await user.click(await screen.findByText('Watch History'));

    await waitFor(() => expect(screen.getByText('Seen Before')).toBeInTheDocument());
    const avatar = document.querySelector(`img[src="${pic}"]`);
    expect(avatar).toBeTruthy();
    expect(avatar).toHaveAttribute('alt', 'Creator Nine');
  });
});

// YouTube-style: avatar / channel name on a feed card open the creator, not the video.
describe('video card — open channel from profile', () => {
  it('opens the creator channel when the channel name on a card is clicked', async () => {
    const user = userEvent.setup();
    mockEditorialFeed([
      vid(501, 'Editorial One', {
        channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
      }),
    ]);
    api.getChannelByHandle.mockResolvedValue({
      data: { channel_id: 9, handle: 'nine', display_name: 'Creator Nine', description: 'Welcome.', _count: { subscriptions: 12 } },
    });
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([
          vid(501, 'Editorial One', {
            channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
          }),
        ]));
      }
      return Promise.resolve(feed([
        vid(501, 'Editorial One', {
          channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
        }),
      ]));
    });

    render(<VideosPage />);
    await screen.findByText('Editorial One');
    await user.click(screen.getByTestId('video-card-channel-name'));

    expect(await screen.findByRole('heading', { name: 'Creator Nine' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Editorial One' })).not.toBeInTheDocument();
    await waitFor(() => expect(api.getVideoFeed).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: 9, include_shorts: true }),
    ));
  });

  it('opens the creator channel when the card avatar is clicked', async () => {
    const user = userEvent.setup();
    mockEditorialFeed([
      vid(502, 'Avatar Tap Video', {
        channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
      }),
    ]);
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([vid(502, 'Avatar Tap Video')]));
      }
      return Promise.resolve(feed([
        vid(502, 'Avatar Tap Video', {
          channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
        }),
      ]));
    });
    api.getChannelByHandle.mockResolvedValue({
      data: { channel_id: 9, handle: 'nine', display_name: 'Creator Nine', description: 'Welcome.', _count: { subscriptions: 3 } },
    });

    render(<VideosPage />);
    await screen.findByText('Avatar Tap Video');
    await user.click(screen.getByTestId('video-card-channel-avatar'));

    expect(await screen.findByRole('heading', { name: 'Creator Nine' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Avatar Tap Video' })).not.toBeInTheDocument();
  });
});

// The feed does not return hls_url — only /video/play/:id does — so a card has to fetch one
// before it can preview anything. jsdom has no media stack, so these assert the resolution and
// the intent delay around it rather than playback itself.
describe('hover preview', () => {
  // The resolved-URL cache lives at module scope, so each test uses its own video id — otherwise
  // a card cached by an earlier test would never fetch again and the assertions would depend on
  // the order they ran in.
  let nextId = 700;
  const hoverCard = (id) => {
    mockEditorialFeed([vid(id, `Hover ${id}`)]);
    api.getVideo.mockResolvedValue({ ...vid(id, `Hover ${id}`), hls_url: `https://cdn.test/${id}/master.m3u8` });
    // The editorial landing repeats the same video across its rails; any one card will do.
    return async () => (await screen.findAllByText(`Hover ${id}`))[0];
  };

  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    nextId += 1;
  });

  it('resolves a playable URL once the pointer settles on a card', async () => {
    const user = userEvent.setup();
    const id = nextId;
    const findCard = hoverCard(id);
    render(<VideosPage />);
    const card = await findCard();
    expect(api.getVideo).not.toHaveBeenCalled();

    await user.hover(card);

    await waitFor(() => expect(api.getVideo).toHaveBeenCalledWith(id), { timeout: 3000 });
  });

  it('does not fetch for a pointer that only passes over', async () => {
    const user = userEvent.setup();
    const findCard = hoverCard(nextId);
    render(<VideosPage />);
    const card = await findCard();

    await user.hover(card);
    await user.unhover(card);

    // Well inside the 500ms intent delay — the cancelled timer must not fire.
    await new Promise((r) => setTimeout(r, 700));
    expect(api.getVideo).not.toHaveBeenCalled();
  });

  it('asks only once for the same card', async () => {
    const user = userEvent.setup();
    const findCard = hoverCard(nextId);
    render(<VideosPage />);
    const card = await findCard();

    await user.hover(card);
    await waitFor(() => expect(api.getVideo).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await user.unhover(card);
    await user.hover(card);
    await new Promise((r) => setTimeout(r, 700));

    expect(api.getVideo).toHaveBeenCalledTimes(1);
  });
});

describe('card three-dot menu', () => {
  beforeEach(() => {
    mockEditorialFeed([vid(31, 'Menu Me')]);
    api.toggleWatchLater.mockResolvedValue({});
  });

  const openMenu = async (user) => {
    const buttons = await screen.findAllByRole('button', { name: 'More actions' });
    await user.click(buttons[0]);
  };

  it('gives every card a menu', async () => {
    render(<VideosPage />);
    const buttons = await screen.findAllByRole('button', { name: 'More actions' });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('offers share, watch later and save to playlist', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await openMenu(user);

    expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watch Later' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to playlist' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recommend to subscribers' })).not.toBeInTheDocument();
  });

  it('offers recommend when the viewer has a channel and the video is not theirs', async () => {
    const user = userEvent.setup();
    api.getMyChannel.mockResolvedValue({ data: { channel_id: 42, handle: 'me', display_name: 'Me' } });
    api.createCreatorPick.mockResolvedValue({ successful: true, data: { pick_id: 7 } });
    render(<VideosPage />);
    await openMenu(user);

    await user.click(await screen.findByRole('button', { name: 'Recommend to subscribers' }));
    await waitFor(() => expect(api.createCreatorPick).toHaveBeenCalledWith({ pick_type: 'video', video_id: 31 }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Creator's Choice/i);
  });

  it('hides recommend on the viewer’s own videos', async () => {
    const user = userEvent.setup();
    api.getMyChannel.mockResolvedValue({ data: { channel_id: 9, handle: 'nine', display_name: 'Creator Nine' } });
    render(<VideosPage />);
    await openMenu(user);

    expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recommend to subscribers' })).not.toBeInTheDocument();
  });

  // Share used to quietly copy the link. It now opens the same dialog the watch page has always
  // shown, so the networks are reachable from a card too.
  it('opens the full share dialog on share', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await openMenu(user);

    await user.click(await screen.findByRole('button', { name: 'Share' }));

    expect(await screen.findByRole('heading', { name: 'Share' })).toBeInTheDocument();
    for (const network of ['WhatsApp', 'X', 'Facebook', 'LinkedIn', 'Reddit', 'Email']) {
      expect(screen.getByRole('button', { name: network })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('copies the video link from the share dialog', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await openMenu(user);

    // userEvent.setup() installs its own navigator.clipboard, so the spy has to go on afterwards.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');

    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await user.click(await screen.findByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('/v/');
  });

  // A card has no playback position, so the timestamp option is offered but inert — the same
  // control the watch page enables once the video is past its first second.
  it('offers the start-at option disabled from a card', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Share' }));

    expect(await screen.findByRole('button', { name: /Start at 0:00/ })).toBeDisabled();
  });

  it('closes the share dialog again, leaving the browse view intact', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('heading', { name: 'Share' })).not.toBeInTheDocument();
    expect(bar()).toBeInTheDocument();
    expect(api.getVideo).not.toHaveBeenCalled();
  });

  it('saves to watch later, and offers to undo it afterwards', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await openMenu(user);

    await user.click(await screen.findByRole('button', { name: 'Watch Later' }));
    expect(api.toggleWatchLater).toHaveBeenCalledWith(31);

    await openMenu(user);
    expect(await screen.findByRole('button', { name: 'Remove from Watch later' })).toBeInTheDocument();
  });

  it('opens the playlist picker', async () => {
    const user = userEvent.setup();
    api.getPlaylists.mockResolvedValue({ data: [{ playlist_id: 3, name: 'Watch On A Plane', videos: [] }] });
    render(<VideosPage />);
    await openMenu(user);

    await user.click(await screen.findByRole('button', { name: 'Save to playlist' }));

    expect(await screen.findByText('Watch On A Plane')).toBeInTheDocument();
  });

  it('creates a Mix when the playlist name is left blank', async () => {
    const user = userEvent.setup();
    api.createPlaylist.mockResolvedValue({ data: { playlist_id: 4, name: 'Mix', videos: [{ video_id: 31 }] } });
    render(<VideosPage />);
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Save to playlist' }));
    await user.click(await screen.findByRole('button', { name: 'Create' }));
    expect(api.createPlaylist).toHaveBeenCalledWith('Mix', 31, { isPublic: false });
    expect(await screen.findByText('Saved to Mix')).toBeInTheDocument();
  });

  it('lists Mix playlists above the rest in the picker', async () => {
    const user = userEvent.setup();
    api.getPlaylists.mockResolvedValue({
      data: [
        { playlist_id: 3, name: 'Watch On A Plane', videos: [] },
        { playlist_id: 4, name: 'Mix', videos: [] },
      ],
    });
    render(<VideosPage />);
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Save to playlist' }));
    const mix = await screen.findByText('Mix');
    const custom = screen.getByText('Watch On A Plane');
    expect(mix.compareDocumentPosition(custom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The three-dot used to live inside the card's <a href>, so opening it needed preventDefault
  // or the browser followed the link. The button now sits OUTSIDE that <a> (mobile browsers drop
  // a nested <button> inside an <a>), so there is no ancestor link to follow.
  it('does not follow the card link when the menu is opened', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    const buttons = await screen.findAllByRole('button', { name: 'More actions' });
    expect(buttons[0].closest('a')).toBeNull();

    await user.click(buttons[0]);

    expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(bar()).toBeInTheDocument();
    expect(api.getVideo).not.toHaveBeenCalled();
  });

  // A portal's events bubble through the REACT tree, not the DOM one — so a click on a menu item
  // still travels up to the card that rendered the menu.
  it('does not open the video when a menu item is clicked', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await openMenu(user);

    await user.click(await screen.findByRole('button', { name: 'Watch Later' }));

    expect(bar()).toBeInTheDocument();
    expect(api.getVideo).not.toHaveBeenCalled();
  });

  it('stops the hover preview while the menu is open', async () => {
    const user = userEvent.setup();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    api.getVideo.mockResolvedValue({ ...vid(31, 'Menu Me'), hls_url: 'https://cdn.test/31/master.m3u8' });
    render(<VideosPage />);

    const buttons = await screen.findAllByRole('button', { name: 'More actions' });
    await user.hover(buttons[0]);
    await user.click(buttons[0]);

    // Reaching the button means hovering the card; the preview must not start under the menu.
    await new Promise((r) => setTimeout(r, 700));
    expect(document.querySelector('video')).toBeNull();
  });

  it('does not open the video when the menu is used', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await openMenu(user);

    // The browse chip bar is still on screen — the watch view never took over.
    expect(bar()).toBeInTheDocument();
    expect(api.getVideo).not.toHaveBeenCalled();
  });
});

describe('Videos section tabs — Home / Clips', () => {
  it('shows both sections with Home selected first', async () => {
    render(<VideosPage />);
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Home', 'Clips']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('hides the category bar on Clips — categories do not apply to short-form', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: 'Clips' }));

    await waitFor(() => expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Clips' })).toHaveAttribute('aria-selected', 'true');
  });

  it('brings the category bar back on Home', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Clips' }));
    await waitFor(() => expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: 'Home' }));

    await waitFor(() => expect(bar()).toBeInTheDocument());
  });

  it('renders only short-form videos on the Shorts tab', async () => {
    const user = userEvent.setup();
    api.getShorts.mockResolvedValue(feed([
      { ...vid(11, 'Short One'), video_type: 'shorts', duration_sec: 20 },
      { ...vid(12, 'Short Two'), video_type: 'shorts', duration_sec: 30 },
    ]));
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: 'Clips' }));

    expect(await screen.findByText('Short One')).toBeInTheDocument();
    expect(screen.getByText('Short Two')).toBeInTheDocument();
    // The long-form editorial card must not leak into the short-form grid.
    expect(screen.queryByText('Editorial One')).not.toBeInTheDocument();
  });
});

// Mobile Videos section owns its own bottom bar (YouTube-style). Top Home/Clips tabs hide;
// Explore opens History / Choice / Subs / Circle — not Library.
describe('Videos mobile bottom nav', () => {
  beforeEach(() => {
    viewport.isMobile = true;
    viewport.width = 390;
    viewport.isTablet = false;
    viewport.isDesktopWide = false;
  });

  afterEach(() => {
    viewport.isMobile = false;
    viewport.width = 1280;
    viewport.isTablet = false;
    viewport.isDesktopWide = true;
  });

  it('shows the Videos bottom nav and hides the top Home/Clips tabs', async () => {
    mockEditorialFeed([vid(1, 'Mobile Clip')]);
    render(<VideosPage />);
    await screen.findByText('Mobile Clip');
    expect(screen.getByTestId('videos-mobile-bottom-nav')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('keeps mobile feed cards constrained when horizontal shelves are interleaved', async () => {
    mockEditorialFeed([
      vid(1, 'First Mobile Video'),
      vid(2, 'Second Mobile Video'),
      vid(3, 'Third Mobile Video'),
      vid(4, 'Fourth Mobile Video'),
    ]);
    render(<VideosPage />);
    await screen.findByText('First Mobile Video');

    for (const grid of screen.getAllByTestId('video-section-grid')) {
      expect(grid).toHaveStyle({ width: '100%', minWidth: '0', maxWidth: '100%' });
      expect(grid.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    }
    for (const media of screen.getAllByTestId('video-card-media')) {
      expect(media).toHaveStyle({ width: '100%', maxWidth: '100%', aspectRatio: '16 / 9' });
      expect(media.style.marginLeft).toBe('');
    }
  });

  it('keeps Watch History cards inside the mobile viewport', async () => {
    const user = userEvent.setup();
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [
        { watched_at: '2026-08-12T00:00:00Z', video: vid(31, 'Mobile History One') },
        { watched_at: '2026-08-11T00:00:00Z', video: vid(32, 'Mobile History Two') },
      ],
    });
    render(<VideosPage />);

    await user.click(await screen.findByRole('button', { name: 'Library' }));
    await user.click(await screen.findByText('Watch History'));
    await screen.findByText('Mobile History One');

    const historyGrid = screen.getByTestId('watch-history-grid');
    expect(historyGrid).toHaveStyle({ width: '100%', minWidth: '0', maxWidth: '100%' });
    expect(historyGrid.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    for (const media of within(historyGrid).getAllByTestId('video-card-media')) {
      expect(media).toHaveStyle({ width: '100%', maxWidth: '100%', aspectRatio: '16 / 9' });
      expect(media.style.marginLeft).toBe('');
    }
  });

  it('opens the immersive Clips player from the bottom nav', async () => {
    const user = userEvent.setup();
    api.getShorts.mockResolvedValue(feed([
      { ...vid(11, 'Short One'), video_type: 'shorts', duration_sec: 20 },
      { ...vid(12, 'Short Two'), video_type: 'shorts', duration_sec: 30 },
    ]));
    mockEditorialFeed([vid(1, 'Mobile Clip')]);
    render(<VideosPage />);
    await screen.findByText('Mobile Clip');
    await user.click(screen.getByRole('button', { name: 'Clips' }));
    // Full-screen ShortsPlayer — back control only, no thumbnail grid / bottom nav. The clip count
    // is deliberately absent: a "1 / 12" over the video reads like a slideshow, not a feed.
    expect(await screen.findByRole('button', { name: /Videos/i })).toBeInTheDocument();
    expect(screen.queryByText('1 / 2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('videos-mobile-bottom-nav')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick clips')).not.toBeInTheDocument();
  });

  it('Explore opens History / Choice / Subs / Circle', async () => {
    const user = userEvent.setup();
    mockEditorialFeed([vid(1, 'Mobile Clip')]);
    render(<VideosPage />);
    await screen.findByText('Mobile Clip');
    await user.click(screen.getByRole('button', { name: 'Explore' }));
    expect(screen.getByTestId('videos-explore-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('videos-explore-history')).toBeInTheDocument();
    expect(screen.getByTestId('videos-explore-choice')).toBeInTheDocument();
    expect(screen.getByTestId('videos-explore-subs')).toBeInTheDocument();
    expect(screen.getByTestId('videos-explore-circle')).toBeInTheDocument();
    expect(screen.queryByText(/Watch Later/i)).not.toBeInTheDocument();
  });

  // The count on Explore is what is unwatched behind it, so the panel it opens has to agree —
  // a badge of 1 over a list of 2 is the drawer telling the viewer two different things.
  it('leaves a watched upload out of the Subs panel, like the desktop drawer', async () => {
    const user = userEvent.setup();
    mockEditorialFeed([vid(1, 'Mobile Clip')]);
    api.getSubscriptionUploads.mockResolvedValue({
      successful: true,
      data: [
        { ...vid(501, 'Already Seen'), created_at: new Date().toISOString() },
        { ...vid(502, 'Still New'), created_at: new Date().toISOString() },
      ],
    });
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [{ watched_at: '2026-08-12T00:00:00Z', video: vid(501, 'Already Seen') }],
    });
    render(<VideosPage />);
    await screen.findByText('Mobile Clip');

    await user.click(screen.getByRole('button', { name: /^Explore/ }));
    await user.click(screen.getByTestId('videos-explore-subs'));

    // Scoped to the panel: the home rail behind it lists watched videos on purpose.
    const panel = within(await screen.findByTestId('videos-explore-panel'));
    expect(await panel.findByText('Still New')).toBeInTheDocument();
    expect(panel.queryByText('Already Seen')).not.toBeInTheDocument();
  });
});

// The rail over a playing video: chips for the creator and the category, so more of what you are
// already watching is one click away. Like the browse bar, this is unreachable by hand in a
// logged-out preview, so the page-level test is the only pass it gets.
describe('watch page — Up next chips', () => {
  /** Answer each rail probe separately: the creator's other videos, the category's, the browse feed. */
  const railFeeds = ({ channel = [], category = [], editorial = [vid(41, 'Watch Me', { category: 'Music' })] }) => {
    mockEditorialFeed(editorial);
    api.getVideoFeed.mockImplementation((params) => {
      if (params?.channel_id) return Promise.resolve(feed(channel));
      if (params?.category) return Promise.resolve(feed(category));
      return Promise.resolve(feed(editorial));
    });
  };
  const openVideo = async (user) => {
    api.getVideoRecommendations.mockResolvedValue(feed([vid(42, 'Recommended One')]));
    render(<VideosPage />);
    // The same feed backs several browse sections, so the title is on screen more than once.
    await user.click((await screen.findAllByText('Watch Me'))[0]);
    await screen.findByText('Recommended One');
  };
  /** The rail's chips are the only radiogroup left once the browse bar unmounts. */
  const railChip = (name) => within(screen.getByRole('radiogroup', { name: 'Up Next' })).getByRole('radio', { name });

  it('shows a direct Recommend action for an eligible creator and submits only once', async () => {
    const user = userEvent.setup();
    api.getMyChannel.mockResolvedValue({ data: { channel_id: 42, handle: 'me', display_name: 'Me' } });
    railFeeds({});
    await openVideo(user);

    const recommend = await screen.findByTestId('watch-recommend');
    expect(recommend).toHaveAccessibleName('Recommend to subscribers');
    await user.click(recommend);
    expect(api.createCreatorPick).toHaveBeenCalledTimes(1);
    expect(api.createCreatorPick).toHaveBeenCalledWith({ pick_type: 'video', video_id: 41 });
  });

  it('renders the mobile end suggestion inside the player and opens its selected video', async () => {
    const user = userEvent.setup();
    viewport.isMobile = true;
    viewport.width = 390;
    railFeeds({ editorial: [vid(41, 'Watch Me', { category: 'Music', processed_video_url: 'https://cdn.test/41.mp4' })] });
    await openVideo(user);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    const player = document.querySelector('video[controlslist="nodownload"]');
    expect(player).not.toBeNull();
    Object.defineProperty(player, 'duration', { configurable: true, value: 90 });
    Object.defineProperty(player, 'currentTime', { configurable: true, writable: true, value: 90 });
    fireEvent.ended(player);

    const suggestion = await screen.findByTestId('mobile-end-suggestion');
    expect(within(suggestion).getAllByRole('button')).toHaveLength(3);
    expect(suggestion.parentElement).toHaveStyle({ position: 'relative' });
    await user.click(within(suggestion).getByRole('button', { name: 'Play now' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recommended One' })).toBeInTheDocument();
  });

  it('offers All, the creator and the category', async () => {
    const user = userEvent.setup();
    railFeeds({ channel: [vid(43, 'Also By Nine')], category: [vid(44, 'Another Music One')] });
    await openVideo(user);

    expect(railChip('All')).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByRole('radio', { name: 'From Creator Nine' })).toBeInTheDocument();
    expect(railChip('Music')).toBeInTheDocument();
  });

  it('shows that creator’s videos when the creator chip is picked', async () => {
    const user = userEvent.setup();
    railFeeds({ channel: [vid(43, 'Also By Nine')] });
    await openVideo(user);

    await user.click(await screen.findByRole('radio', { name: 'From Creator Nine' }));

    expect(await screen.findByText('Also By Nine')).toBeInTheDocument();
    expect(api.getVideoFeed.mock.calls.some(([p]) => p?.channel_id === 9)).toBe(true);
  });

  it('shows the category’s videos when that chip is picked', async () => {
    const user = userEvent.setup();
    railFeeds({ category: [vid(44, 'Another Music One')] });
    await openVideo(user);

    await user.click(await screen.findByRole('radio', { name: 'Music' }));

    expect(await screen.findByText('Another Music One')).toBeInTheDocument();
    expect(api.getVideoFeed.mock.calls.some(([p]) => p?.category === 'Music')).toBe(true);
  });

  // A creator with nothing but the video you are watching must not get a chip that leads nowhere.
  it('hides the creator chip when this is their only video', async () => {
    const user = userEvent.setup();
    railFeeds({ channel: [vid(41, 'Watch Me', { category: 'Music' })], category: [vid(44, 'Another Music One')] });
    await openVideo(user);

    // The category chip proves the probes have come back — the creator's simply had nothing left.
    expect(await screen.findByRole('radio', { name: 'Music' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'From Creator Nine' })).not.toBeInTheDocument();
  });

  it('leaves only All when the video stands alone', async () => {
    const user = userEvent.setup();
    railFeeds({ channel: [], category: [] });
    await openVideo(user);

    await waitFor(() => expect(api.getVideoFeed.mock.calls.some(([p]) => p?.category === 'Music')).toBe(true));
    expect(within(screen.getByRole('radiogroup', { name: 'Up Next' })).getAllByRole('radio')).toHaveLength(1);
    // The recommendations still fill the rail — losing the chips costs nothing.
    expect(screen.getByText('Recommended One')).toBeInTheDocument();
  });

  // Whatever the feed returns, the video already on screen must not be offered as somewhere to go.
  it('keeps the playing video out of its own rail', async () => {
    const user = userEvent.setup();
    railFeeds({ channel: [vid(41, 'Watch Me', { category: 'Music' }), vid(45, 'Sibling')] });
    await openVideo(user);

    await user.click(await screen.findByRole('radio', { name: 'From Creator Nine' }));

    expect(await screen.findByText('Sibling')).toBeInTheDocument();
    // Scoped to the rail: the browse page stays mounted behind the watch page now, so its own
    // card for this video is still in the document and would be counted otherwise.
    const rail = screen.getByRole('radiogroup', { name: 'Up Next' }).parentElement.parentElement;
    expect(within(rail).queryByText('Watch Me')).toBeNull();
  });

  // Picking a chip narrows the top of the rail, it does not empty it — the ordinary
  // recommendations carry on underneath so there is always a next video.
  it('keeps the recommendations under the chip’s own videos', async () => {
    const user = userEvent.setup();
    railFeeds({ channel: [vid(47, 'Also By Nine')] });
    await openVideo(user);

    await user.click(await screen.findByRole('radio', { name: 'From Creator Nine' }));

    expect(await screen.findByText('Also By Nine')).toBeInTheDocument();
    expect(screen.getByText('Recommended One')).toBeInTheDocument();
  });

  it('goes back to the recommendations when All is picked again', async () => {
    const user = userEvent.setup();
    railFeeds({ channel: [vid(46, 'Sibling Two')] });
    await openVideo(user);
    await user.click(await screen.findByRole('radio', { name: 'From Creator Nine' }));
    await screen.findByText('Sibling Two');

    await user.click(railChip('All'));

    expect(await screen.findByText('Recommended One')).toBeInTheDocument();
    expect(screen.queryByText('Sibling Two')).not.toBeInTheDocument();
  });
});

describe('watch page — edge drawer Subs tab', () => {
  /** Same open path as the Up Next chips suite — feed card → watch page. */
  const openVideo = async (user) => {
    mockEditorialFeed([vid(41, 'Watch Me', { category: 'Music' })]);
    api.getVideoRecommendations.mockResolvedValue(feed([vid(42, 'Recommended One')]));
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Watch Me'))[0]);
    await screen.findByText('Recommended One');
  };

  it('shows History, Circle, and Subs edge tabs on the browse feed', async () => {
    mockEditorialFeed([vid(40, 'Browse Clip', { category: 'Music' })]);
    render(<VideosPage />);
    await screen.findByText('Browse Clip');

    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your Circle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subs' })).toBeInTheDocument();
  });

  it('shows History, Circle, and Subs edge tabs and loads subscription uploads', async () => {
    const user = userEvent.setup();
    api.getSubscriptionUploads.mockResolvedValue({
      successful: true,
      data: [{
        video_id: 501,
        title: 'Sub Channel Drop',
        thumbnail_url: 'https://cdn.test/501.jpg',
        duration_sec: 120,
        views_count: 40,
        created_at: new Date().toISOString(),
        channel: { channel_id: 70, display_name: 'Sub Channel', handle: 'subch' },
        is_new: true,
      }],
    });
    await openVideo(user);

    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your Circle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subs' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Subs' }));

    await waitFor(() => expect(api.getSubscriptionUploads).toHaveBeenCalled());
    const call = api.getSubscriptionUploads.mock.calls.at(-1)?.[0] || {};
    expect(call.limit).toBe(DRAWER_SUB_UPLOAD_CAP);
    expect(call.exclude).toBe(41);
    expect(await screen.findByText('Sub Channel Drop')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText(/New from Sub Channel/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Subscribers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your Circle' })).toBeInTheDocument();
  });

  // The badge is only useful if it fires for content that arrives AFTER the viewer's first visit,
  // including on a tab that was empty then — the case every new account starts in. That path used
  // to re-seed the empty tab on every poll, so the first upload ever was marked as already seen.
  it('badges the first upload to arrive on a tab that started empty', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      localStorage.clear();
      mockEditorialFeed([vid(40, 'Browse Clip')]);
      api.getSubscriptionUploads.mockResolvedValue({ successful: true, data: [] });
      render(<VideosPage />);

      const subsTab = await screen.findByRole('button', { name: 'Subs' });
      expect(subsTab).toBeInTheDocument();

      api.getSubscriptionUploads.mockResolvedValue({
        successful: true,
        data: [{
          video_id: 777,
          title: 'Brand New Drop',
          duration_sec: 100,
          views_count: 3,
          created_at: new Date().toISOString(),
          channel: { channel_id: 70, display_name: 'Sub Channel', handle: 'subch' },
        }],
      });
      await vi.advanceTimersByTimeAsync(125_000);

      await waitFor(() => {
        const badges = screen.getAllByTestId('slide-out-edge-tab').map((t) => t.getAttribute('data-edge-tab-unseen'));
        expect(badges).toContain('1');
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // Coming back to the tab fires focus AND visibilitychange. Both used to poll, so one alt-tab cost
  // eight requests instead of four — at scale that is the difference that matters.
  it('polls once when the window regains focus, not twice', async () => {
    localStorage.clear();
    mockEditorialFeed([vid(40, 'Browse Clip')]);
    api.getSubscriptionUploads.mockResolvedValue({ successful: true, data: [] });
    render(<VideosPage />);
    await screen.findByRole('button', { name: 'Subs' });
    await waitFor(() => expect(api.getSubscriptionUploads).toHaveBeenCalled());
    const afterFirstPoll = api.getSubscriptionUploads.mock.calls.length;

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(api.getSubscriptionUploads.mock.calls.length).toBe(afterFirstPoll);
  });

  it('does not mount edge drawer tabs on mobile (separate concept later)', async () => {
    const user = userEvent.setup();
    viewport.isMobile = true;
    viewport.width = 390;
    mockEditorialFeed([vid(41, 'Watch Me', { category: 'Music' })]);
    api.getVideoRecommendations.mockResolvedValue(feed([vid(42, 'Recommended One')]));
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Watch Me'))[0]);
    await screen.findByText('Recommended One');

    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Your Circle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subs' })).not.toBeInTheDocument();
    // No drawer panel on a phone, so nothing loads a panel's list. The three signals behind
    // Explore are still polled: that is what puts the unseen count on the Explore tab.
    expect(api.getFriendChannelOverlap).not.toHaveBeenCalled();
  });
});

// Clips shelves on the landing page. They replaced the full-width featured video, which spent a
// whole screen on a single title.
describe('landing page clips shelves', () => {
  const clip = (id, title) => ({
    video_id: id, title, thumbnail_url: `https://cdn.test/s${id}.jpg`, duration_sec: 28,
    views_count: 500 * id, video_type: 'short',
    channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
  });

  it('shows a clips row inside the feed', async () => {
    api.getShorts.mockResolvedValue(feed([clip(61, 'Clip One'), clip(62, 'Clip Two')]));
    // Enough videos to reach the first break, three rows down.
    mockEditorialFeed(Array.from({ length: 16 }, (_, i) => vid(200 + i, `Grid ${i}`)));
    render(<VideosPage />);

    expect(await screen.findByText('Clip One')).toBeInTheDocument();
    expect(screen.getByText('Clip Two')).toBeInTheDocument();
  });

  // Clips are a break in the feed, not its opening act: the first thing on the page is a video.
  it('puts no clips above the first video', async () => {
    api.getShorts.mockResolvedValue(feed([clip(61, 'Clip One')]));
    mockEditorialFeed(Array.from({ length: 16 }, (_, i) => vid(200 + i, `Grid ${i}`)));
    render(<VideosPage />);
    await screen.findByText('Clip One');

    const firstVideo = screen.getByText('Grid 0');
    const clipOne = screen.getByText('Clip One');
    // Node.compareDocumentPosition: 4 means the argument comes later in the document.
    expect(firstVideo.compareDocumentPosition(clipOne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Shelves are spaced through the grid rather than stacked at the top, and each takes the next
  // slice: two shelves on one page must never be the same clips twice over.
  it('gives each shelf a different slice', async () => {
    const clips = Array.from({ length: 24 }, (_, i) => clip(100 + i, `Clip ${i}`));
    api.getShorts.mockResolvedValue(feed(clips));
    // Breaks fall three rows in and again five rows after that, so this reaches two of them.
    mockEditorialFeed(Array.from({ length: 36 }, (_, i) => vid(200 + i, `Grid ${i}`)));
    render(<VideosPage />);

    // Ten to a shelf: the first ends at Clip 9, so Clip 10 can only be on the second.
    expect(await screen.findByText('Clip 0')).toBeInTheDocument();
    expect(await screen.findByText('Clip 10')).toBeInTheDocument();
    expect(screen.queryByText('Clip 20')).not.toBeInTheDocument();
  });

  // A short grid never reaches a break, so no shelf appears at all rather than one being forced in.
  it('leaves the grid alone when it is too short for a break', async () => {
    const clips = Array.from({ length: 24 }, (_, i) => clip(100 + i, `Clip ${i}`));
    api.getShorts.mockResolvedValue(feed(clips));
    mockEditorialFeed([vid(201, 'Lonely Video')]);
    render(<VideosPage />);
    await screen.findByText('Lonely Video');

    expect(screen.queryByText('Clip 0')).not.toBeInTheDocument();
  });

  it('opens the clip player on the clip that was clicked', async () => {
    const user = userEvent.setup();
    api.getShorts.mockResolvedValue(feed([clip(61, 'Clip One'), clip(62, 'Clip Two')]));
    mockEditorialFeed(Array.from({ length: 16 }, (_, i) => vid(200 + i, `Grid ${i}`)));
    render(<VideosPage />);

    await user.click(await screen.findByText('Clip Two'));

    // The player takes over the page, so the browse chip row is gone.
    await waitFor(() => expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument());
  });

  it('starts playback on the first tap once the clip URL hydrates', async () => {
    const user = userEvent.setup();
    const play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.play = play;
    HTMLMediaElement.prototype.pause = vi.fn();
    api.getShorts.mockResolvedValue(feed([clip(61, 'Clip One'), clip(62, 'Clip Two')]));
    mockEditorialFeed(Array.from({ length: 16 }, (_, i) => vid(200 + i, `Grid ${i}`)));
    // Feed shorts omit hls_url — play payload supplies it after open (same as production).
    api.getVideo.mockImplementation(async (id) => ({
      ...vid(id, `Clip ${id}`),
      video_type: 'short',
      hls_url: `https://cdn.test/${id}/master.m3u8`,
    }));
    render(<VideosPage />);

    await user.click(await screen.findByText('Clip One'));

    await waitFor(() => expect(api.getVideo).toHaveBeenCalled());
    await waitFor(() => expect(play).toHaveBeenCalled());
  });

  it('keeps playback exclusive while swiping between hydrated clips', async () => {
    viewport.isMobile = true;
    viewport.width = 390;
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    api.getShorts.mockResolvedValue(feed([
      clip(61, 'Clip One'), clip(62, 'Clip Two'), clip(63, 'Clip Three'),
    ]));
    api.getVideo.mockImplementation(async (id) => ({
      ...vid(id, `Clip ${id}`),
      video_type: 'short',
      hls_url: `https://cdn.test/${id}/master.m3u8`,
    }));
    render(<VideosPage />);

    // Mobile Clips opens as an immersive swipe feed. Neighbours may hydrate their URLs, but only
    // the visible row may attach a media source; otherwise a late HLS response starts two audios.
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Clips' }));
    const back = await screen.findByRole('button', { name: 'Videos' });
    const player = back.parentElement;
    await waitFor(() => {
      const attached = [...player.querySelectorAll('video')].filter((el) => el.getAttribute('src'));
      expect(attached).toHaveLength(1);
      expect(attached[0].getAttribute('src')).toContain('/61/');
    });

    const firstVideo = player.querySelector('video');
    const scroller = firstVideo.parentElement.parentElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 800 });
    scroller.scrollTop = 800;
    fireEvent.scroll(scroller);

    await waitFor(() => {
      const attached = [...player.querySelectorAll('video')].filter((el) => el.getAttribute('src'));
      expect(attached).toHaveLength(1);
      expect(attached[0].getAttribute('src')).toContain('/62/');
    });
  });

  it('renders nothing when there are no clips', async () => {
    api.getShorts.mockResolvedValue(feed([]));
    render(<VideosPage />);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Play clip' })).not.toBeInTheDocument();
  });
});

// Playlists on the home feed, the way YouTube surfaces Mixes between video rows.
describe('landing page playlists shelf', () => {
  it('shows the viewer\'s playlists on home when there are at least two', async () => {
    api.getPlaylists.mockResolvedValue({
      data: [
        {
          playlist_id: 9,
          name: 'Mix · Education',
          videos: [{ video_id: 1, title: 'Lesson one', thumbnail_url: 'https://cdn.test/1.jpg' }],
        },
        {
          playlist_id: 10,
          name: 'Mix · Music',
          videos: [{ video_id: 2, title: 'Track one', thumbnail_url: 'https://cdn.test/2.jpg' }],
        },
      ],
    });
    render(<VideosPage />);
    expect(await screen.findByRole('heading', { name: 'Your Playlists' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mix · Education' })).toBeInTheDocument();
  });

  it('does not carve an empty playlist row for a single playlist', async () => {
    api.getPlaylists.mockResolvedValue({
      data: [{
        playlist_id: 9,
        name: 'Mix · Education',
        videos: [{ video_id: 1, title: 'Lesson one', thumbnail_url: 'https://cdn.test/1.jpg' }],
      }],
    });
    render(<VideosPage />);
    await screen.findByText('Editorial One');
    expect(screen.queryByRole('heading', { name: 'Your Playlists' })).not.toBeInTheDocument();
  });

  it('does not show an empty playlist shelf', async () => {
    api.getPlaylists.mockResolvedValue({ data: [{ playlist_id: 9, name: 'Empty', videos: [] }] });
    render(<VideosPage />);
    await screen.findByText('Editorial One');
    expect(screen.queryByRole('heading', { name: 'Your Playlists' })).not.toBeInTheDocument();
  });

  it('does not name a blank New Playlist Mix', async () => {
    const user = userEvent.setup();
    api.getPlaylists.mockResolvedValue({
      data: [
        {
          playlist_id: 9,
          name: 'Gym',
          videos: [{ video_id: 1, title: 'Lesson one', thumbnail_url: 'https://cdn.test/1.jpg' }],
        },
        {
          playlist_id: 11,
          name: 'Run',
          videos: [{ video_id: 2, title: 'Track', thumbnail_url: 'https://cdn.test/2.jpg' }],
        },
      ],
    });
    api.createPlaylist.mockResolvedValue({ data: { playlist_id: 10, name: 'Playlist', videos: [] } });
    render(<VideosPage />);
    await user.click(await screen.findByRole('button', { name: 'See All' }));
    await user.click(await screen.findByRole('button', { name: 'New Playlist' }));
    await user.click(await screen.findByRole('button', { name: 'Create' }));
    expect(api.createPlaylist).toHaveBeenCalledWith('Playlist', undefined, { isPublic: false });
  });
});

// The client asked for the "Home / Videos" strip to give its space to the video on a phone. The
// shell owns that strip, so the watch page asks for it by event; this covers the asking.
describe('mobile watch page — breadcrumb strip', () => {
  const events = [];
  const listen = () => {
    const handler = (e) => events.push(e.detail);
    window.addEventListener('strug:hide-breadcrumb', handler);
    return () => window.removeEventListener('strug:hide-breadcrumb', handler);
  };

  beforeEach(() => {
    events.length = 0;
    mockEditorialFeed([vid(71, 'Phone Video')]);
  });

  it('asks for the strip when a video opens on a phone', async () => {
    viewport.isMobile = true;
    const stop = listen();
    const user = userEvent.setup();
    render(<VideosPage />);

    await user.click((await screen.findAllByText('Phone Video'))[0]);

    await waitFor(() => expect(events).toContain(true));
    stop();
  });

  // Leaving the video must hand the strip back, or the breadcrumb is gone for the rest of the session.
  it('hands the strip back when the video closes', async () => {
    viewport.isMobile = true;
    const stop = listen();
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Phone Video'))[0]);
    await waitFor(() => expect(events).toContain(true));

    await user.click(await screen.findByRole('button', { name: 'Back' }));

    await waitFor(() => expect(events.at(-1)).toBe(false));
    stop();
  });

  it('leaves the desktop breadcrumb alone', async () => {
    viewport.isMobile = false;
    const stop = listen();
    const user = userEvent.setup();
    render(<VideosPage />);

    await user.click((await screen.findAllByText('Phone Video'))[0]);
    await screen.findByRole('radiogroup');

    expect(events).toHaveLength(0);
    stop();
  });
});

// Creator avatar/name on the watch page must not tear down playback — dock to the corner instead.
describe('watch page — creator profile keeps playback', () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    mockEditorialFeed([
      vid(72, 'Playing Clip', {
        channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
      }),
    ]);
    const full = vid(72, 'Playing Clip', {
      channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
    });
    api.getVideo.mockResolvedValue(full);
    api.getChannelByHandle.mockResolvedValue({
      data: { channel_id: 9, handle: 'nine', display_name: 'Creator Nine', description: 'Welcome.', _count: { subscriptions: 12 } },
    });
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([full]));
      }
      return Promise.resolve(feed([]));
    });
  });

  it('docks the player instead of stopping when the creator row is tapped', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Playing Clip'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    const video = await waitFor(() => {
      const el = document.querySelector('video[controlslist]');
      expect(el).toBeTruthy();
      return el;
    });

    const channelOnWatch = screen.getAllByText('Creator Nine').find((el) => el.closest('button'));
    expect(channelOnWatch).toBeTruthy();
    await user.click(channelOnWatch.closest('button'));

    await waitFor(() => expect(screen.getByTestId('channel-subscribe')).toBeInTheDocument());
    expect(document.body.contains(video)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByTestId('channel-subscribe')).not.toBeInTheDocument());
    expect(document.body.contains(video)).toBe(true);
    expect(screen.getByRole('heading', { name: 'Playing Clip' })).toBeInTheDocument();
  });

  // Exact user report: play → tap the creator → the corner card. Tapping that card used to expand
  // the video on top of the profile, both pages at once, with the creator's URL still in the bar.
  it('leaves the creator profile when the corner player is tapped', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Playing Clip'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    const video = await waitFor(() => {
      const el = document.querySelector('video[controlslist]');
      expect(el).toBeTruthy();
      return el;
    });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });

    const channelOnWatch = screen.getAllByText('Creator Nine').find((el) => el.closest('button'));
    await user.click(channelOnWatch.closest('button'));
    await waitFor(() => expect(screen.getByTestId('channel-subscribe')).toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Expand' }));

    await waitFor(() => expect(screen.queryByTestId('channel-subscribe')).not.toBeInTheDocument());
    expect(document.body.contains(video)).toBe(true);
    expect(screen.getByRole('heading', { name: 'Playing Clip' })).toBeInTheDocument();
  });
});

// Turning a phone sideways makes the viewport ~900px wide, past the 767px mobile breakpoint, so the
// page re-renders into its desktop tree and the player remounts. The turn BACK still has to leave
// fullscreen: the client hit a video that went fullscreen on the rotate and could then not be
// exited at all.
describe('mobile watch page — rotating back leaves fullscreen', () => {
  let fsElement = null;
  const pausedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused');
  const realMatchMedia = window.matchMedia;

  /** Both halves of a rotation: the window size the app reads, and the media query the player reads. */
  const rotateTo = (orientation) => {
    const landscape = orientation === 'landscape';
    window.innerWidth = landscape ? 900 : 390;
    window.innerHeight = landscape ? 390 : 900;
    window.matchMedia = (q) => ({
      matches: q.includes('orientation') ? q.includes('landscape') === landscape : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });
    window.dispatchEvent(new Event('orientationchange'));
  };

  beforeEach(() => {
    fsElement = null;
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    // The rotate only fullscreens a video that is PLAYING, and jsdom's media element never leaves
    // its paused state on its own.
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => false });
    HTMLElement.prototype.requestFullscreen = vi.fn(function requestFs() {
      fsElement = this;
      return Promise.resolve();
    });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsElement });
    document.exitFullscreen = vi.fn(() => { fsElement = null; return Promise.resolve(); });
    const rotating = vid(74, 'Rotate Video');
    mockEditorialFeed([rotating]);
    api.getVideo.mockResolvedValue(rotating);
  });

  afterEach(() => {
    if (pausedDescriptor) Object.defineProperty(HTMLMediaElement.prototype, 'paused', pausedDescriptor);
    delete HTMLElement.prototype.requestFullscreen;
    delete document.exitFullscreen;
    window.matchMedia = realMatchMedia;
  });

  it('exits fullscreen after the player has remounted past the breakpoint', async () => {
    viewport.isMobile = true;
    rotateTo('portrait');
    const user = userEvent.setup();
    const view = render(<VideosPage />);

    await user.click((await screen.findAllByText('Rotate Video'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));

    rotateTo('landscape');
    await waitFor(() => expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalled());

    // What crossing the breakpoint does to the tree: this player is gone, a desktop one takes over.
    view.unmount();
    viewport.isMobile = false;
    render(<VideosPage />);
    await screen.findAllByText('Rotate Video');

    rotateTo('portrait');
    await waitFor(() => expect(document.exitFullscreen).toHaveBeenCalled());
  });
});

// The landing page is one feed now, not Trending / Recently Uploaded / Most Popular stacked with
// a heading over each, and it keeps going instead of ending.
describe('landing page — one continuous feed', () => {
  it('drops the section headings', async () => {
    mockEditorialFeed([vid(81, 'Only Video')]);
    render(<VideosPage />);
    await screen.findByText('Only Video');

    expect(screen.queryByRole('heading', { name: /Trending Now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Recently Uploaded/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Most Popular/i })).not.toBeInTheDocument();
  });

  // The three pools overlap by design, and the same title twice in one column is what made the
  // old landing look thin.
  it('shows a video once even when every pool returns it', async () => {
    mockEditorialFeed([vid(82, 'Shared Video')]);
    render(<VideosPage />);

    expect(await screen.findAllByText('Shared Video')).toHaveLength(1);
  });

  it('fills a terminal personalized page with public uploads', async () => {
    api.getHomeFeed.mockResolvedValue(homeFeed([vid(86, 'Personal Head')]));
    api.getVideoFeed.mockImplementation((params = {}) => Promise.resolve(feed([
      params.sort === 'latest' ? vid(87, 'Public Tail') : vid(88, 'Public Extra'),
    ])));
    render(<VideosPage />);

    expect(await screen.findByText('Personal Head')).toBeInTheDocument();
    expect(await screen.findByText('Public Tail')).toBeInTheDocument();
    expect(screen.getByText('Public Extra')).toBeInTheDocument();
  });

  // jsdom ships no IntersectionObserver, so the page's sentinel would never fire. This stands in
  // for one that is already on screen: observing an element reports it as visible straight away.
  const alwaysVisibleObserver = () => {
    const real = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
      unobserve() {}
      disconnect() {}
    };
    return () => { globalThis.IntersectionObserver = real; };
  };

  it('pulls the next page in when the bottom comes into view', async () => {
    const restore = alwaysVisibleObserver();
    api.getHomeFeed.mockImplementation((params) =>
      Promise.resolve(
        params?.cursor
          ? homeFeed([vid(84, 'Second Page')])
          : homeFeed([vid(83, 'First Page')], 24),
      ),
    );
    render(<VideosPage />);
    await screen.findByText('First Page');

    expect(await screen.findByText('Second Page')).toBeInTheDocument();
    await waitFor(() => expect(api.getHomeFeed.mock.calls.some(([p]) => p?.cursor === 24)).toBe(true));
    restore();
  });

  // No cursor back means the catalogue is exhausted; the page must stop asking rather than loop.
  it('stops asking once the feed runs out', async () => {
    const restore = alwaysVisibleObserver();
    api.getHomeFeed.mockResolvedValue(homeFeed([vid(85, 'Last Page')]));
    render(<VideosPage />);
    await screen.findByText('Last Page');

    await waitFor(() => expect(api.getHomeFeed.mock.calls.some(([p]) => p?.limit === 24)).toBe(true));
    const afterFirst = api.getHomeFeed.mock.calls.filter(([p]) => p?.limit === 24).length;
    await new Promise((r) => setTimeout(r, 300));
    expect(api.getHomeFeed.mock.calls.filter(([p]) => p?.limit === 24).length).toBe(afterFirst);
    restore();
  });
});

// Thumbnails carry a progress line for anything part-watched, built from the history the page
// already fetches for chip ordering.
describe('watched progress on thumbnails', () => {
  const historyRow = (id, position, duration) => ({
    id, video_id: id, last_position: position, watched_at: '2026-08-12T00:00:00Z',
    video: { video_id: id, title: `Watched ${id}`, duration_sec: duration, thumbnail_url: `https://cdn.test/${id}.jpg`, channel: { channel_id: 9, display_name: 'Creator Nine' } },
  });

  it('draws the line at how far the viewer got', async () => {
    mockEditorialFeed([vid(91, 'Half Watched')]);
    api.getWatchHistory.mockResolvedValue({ successful: true, data: [historyRow(91, 45, 90)] });
    render(<VideosPage />);
    await screen.findByText('Half Watched');

    await waitFor(() => {
      const bar = document.querySelector('div[style*="background: rgb(37, 99, 235)"]');
      expect(bar).toBeTruthy();
      expect(bar.style.width).toBe('50%');
    });
  });

  it('leaves an unwatched video unmarked', async () => {
    mockEditorialFeed([vid(92, 'Never Opened')]);
    api.getWatchHistory.mockResolvedValue({ successful: true, data: [] });
    render(<VideosPage />);
    await screen.findByText('Never Opened');

    expect(document.querySelector('div[style*="background: rgb(37, 99, 235)"]')).toBeNull();
  });

  // Opening a video and leaving straight away is not "watching" — a sliver there is just noise.
  it('ignores a video barely started', async () => {
    mockEditorialFeed([vid(93, 'Barely Started')]);
    api.getWatchHistory.mockResolvedValue({ successful: true, data: [historyRow(93, 1, 600)] });
    render(<VideosPage />);
    await screen.findByText('Barely Started');

    expect(document.querySelector('div[style*="background: rgb(37, 99, 235)"]')).toBeNull();
  });
});

// Everything a viewer saved or already watched used to be handed to the player as the raw MP4
// while the feed handed it HLS: one fixed quality whatever the connection, a slower start and
// heavy seeking. Those are exactly the videos someone reopens, so it is what "playback is bad"
// felt like.
describe('saved and watched videos get the adaptive stream', () => {
  const withBoth = (id, title) => ({
    ...vid(id, title),
    hls_url: `https://cdn.test/${id}/master.m3u8`,
    processed_video_url: `https://cdn.test/${id}/source.mp4`,
  });

  beforeEach(() => {
    // Opening a card puts the pointer over it, and jsdom has no media playback of its own.
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  /**
   * hls.js reports itself unsupported in this suite, so whichever URL was chosen lands on the
   * player's own <video src>. Matched on controlsList, which only the watch page's player sets —
   * a hover preview is a <video> too.
   */
  const playerSrc = async (user) => {
    // The watch page shows the poster until it is pressed; the player only mounts after that.
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(document.querySelector('video[controlslist]')).toBeTruthy());
    return document.querySelector('video[controlslist]').getAttribute('src');
  };

  it('plays a video from history over HLS, not the MP4', async () => {
    const user = userEvent.setup();
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [{ video: withBoth(101, 'Seen Before'), watched_at: '2026-08-12T00:00:00Z' }],
    });
    render(<VideosPage />);

    await user.click(chip('Watched'));
    await user.click((await screen.findAllByText('Seen Before'))[0]);

    expect(await playerSrc(user)).toContain('.m3u8');
  });

  it('plays a saved video over HLS, not the MP4', async () => {
    const user = userEvent.setup();
    api.getWatchLater.mockResolvedValue({ data: [{ video: withBoth(102, 'Saved For Later') }] });
    render(<VideosPage />);

    await user.click(await screen.findByRole('button', { name: 'Library' }));
    await user.click(await screen.findByText('Watch Later'));
    await user.click((await screen.findAllByText('Saved For Later'))[0]);

    expect(await playerSrc(user)).toContain('.m3u8');
  });
});

// Going back used to end the video. It now shrinks into the corner and plays on until the viewer
// closes it, which is what the client asked for.
describe('the video keeps playing in the corner', () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    mockEditorialFeed([vid(111, 'Keeps Playing')]);
  });

  /**
   * jsdom has no media playback, so a <video> here reports itself paused however hard it is
   * pressed. Real playback is the state the page reads to decide whether leaving should leave a
   * corner player behind, so the harness has to finish the impression the play() stub started.
   */
  const markPlaying = () => {
    const el = document.querySelector('video[controlslist]');
    Object.defineProperty(el, 'paused', { value: false, configurable: true });
    return el;
  };

  const openAndPlay = async (user) => {
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Keeps Playing'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(document.querySelector('video[controlslist]')).toBeTruthy());
    markPlaying();
  };

  /** The browse chips; the watch page's Up next chips are a radiogroup too, hence the name. */
  const browseBar = () => screen.queryByRole('radiogroup', { name: 'Filter videos by category' });

  it('leaves the video playing after going back to the list', async () => {
    const user = userEvent.setup();
    await openAndPlay(user);
    // The point of the feature is that this exact element carries on, rather than a fresh one
    // starting from zero, so identity is what the test holds onto.
    const before = document.querySelector('video[controlslist]');

    await user.click(screen.getByRole('button', { name: 'Videos' }));

    await waitFor(() => expect(browseBar()).toBeInTheDocument());
    expect(document.querySelector('video[controlslist]')).toBe(before);
  });

  it('keeps the same element again on the way back up', async () => {
    const user = userEvent.setup();
    await openAndPlay(user);
    const before = document.querySelector('video[controlslist]');
    await user.click(screen.getByRole('button', { name: 'Videos' }));
    await waitFor(() => expect(browseBar()).toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Expand' }));

    await waitFor(() => expect(browseBar()).not.toBeInTheDocument());
    expect(document.querySelector('video[controlslist]')).toBe(before);
  });

  // A video that was opened and never started leaves nothing behind: a corner card holding a
  // still poster is clutter, not a player.
  it('leaves no corner card when the video was never played', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Keeps Playing'))[0]);
    await screen.findByRole('button', { name: 'Play' });

    await user.click(screen.getByRole('button', { name: 'Videos' }));

    await waitFor(() => expect(browseBar()).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Close mini player' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument();
  });

  // Pausing and walking away means done with it. The corner card is for a video still running,
  // not for a still frame parked over the list.
  it('leaves no corner card when the video was paused first', async () => {
    const user = userEvent.setup();
    await openAndPlay(user);
    // Back to paused: what a viewer pressing pause leaves behind.
    Object.defineProperty(document.querySelector('video[controlslist]'), 'paused', { value: true, configurable: true });

    await user.click(screen.getByRole('button', { name: 'Videos' }));

    await waitFor(() => expect(browseBar()).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Close mini player' })).not.toBeInTheDocument();
  });

  it('ends the video when the corner player is closed', async () => {
    const user = userEvent.setup();
    await openAndPlay(user);
    await user.click(screen.getByRole('button', { name: 'Videos' }));

    await user.click(await screen.findByRole('button', { name: 'Close mini player' }));

    await waitFor(() => expect(document.querySelector('video[controlslist]')).toBeNull());
    expect(browseBar()).toBeInTheDocument();
  });

  it('goes back to the full page from the corner', async () => {
    const user = userEvent.setup();
    await openAndPlay(user);
    await user.click(screen.getByRole('button', { name: 'Videos' }));

    await user.click(await screen.findByRole('button', { name: 'Expand' }));

    // The watch page has the screen again, so the browse chips are out of sight.
    await waitFor(() => expect(browseBar()).not.toBeInTheDocument());
    expect(document.querySelector('video[controlslist]')).toBeTruthy();
  });

  // Client report: coming back to a video took 5-10s on a phone. Tapping the card of the video
  // already in the corner rebuilt the player, so a stream that was buffered and running went
  // black while a fresh manifest loaded. It must be the same element, and no second play fetch.
  it('reuses the running player when the video already open is tapped again', async () => {
    const user = userEvent.setup();
    api.getVideo.mockResolvedValue({ ...vid(111, 'Keeps Playing'), hls_url: 'https://cdn.test/111/master.m3u8' });
    await openAndPlay(user);
    const before = document.querySelector('video[controlslist]');
    await user.click(screen.getByRole('button', { name: 'Videos' }));
    await waitFor(() => expect(browseBar()).toBeInTheDocument());
    const playFetches = api.getVideo.mock.calls.length;

    await user.click((await screen.findAllByText('Keeps Playing'))[0]);

    await waitFor(() => expect(browseBar()).not.toBeInTheDocument());
    expect(document.querySelector('video[controlslist]')).toBe(before);
    expect(api.getVideo.mock.calls.length).toBe(playFetches);
  });

  // A feed row carries no playable URL, so a reopen used to sit on the poster until /video/play
  // answered. The URL the route returns is stable, so a recent one is replayed straight away.
  it('starts loading a reopened video before the play request answers', async () => {
    const user = userEvent.setup();
    api.getVideo.mockResolvedValue({ ...vid(111, 'Keeps Playing'), hls_url: 'https://cdn.test/111/master.m3u8' });
    await openAndPlay(user);
    await user.click(screen.getByRole('button', { name: 'Videos' }));
    await user.click(await screen.findByRole('button', { name: 'Close mini player' }));
    await waitFor(() => expect(document.querySelector('video[controlslist]')).toBeNull());
    // Second open: the play request never settles, so any src can only come from what we kept.
    api.getVideo.mockReturnValue(new Promise(() => {}));

    await user.click((await screen.findAllByText('Keeps Playing'))[0]);

    const el = await waitFor(() => {
      const v = document.querySelector('video[controlslist]');
      expect(v?.getAttribute('src')).toBeTruthy();
      return v;
    });
    expect(el.getAttribute('src')).toContain('/111/master.m3u8');
  });

  // A video opened while another is in the corner must take the screen, not join it there.
  it('opens the next video full size, not in the corner', async () => {
    const user = userEvent.setup();
    await openAndPlay(user);
    await user.click(screen.getByRole('button', { name: 'Videos' }));
    await waitFor(() => expect(browseBar()).toBeInTheDocument());

    await user.click((await screen.findAllByText('Keeps Playing'))[0]);

    await waitFor(() => expect(browseBar()).not.toBeInTheDocument());
  });
});

// On a phone the corner player is a small picture-in-picture card (title and controls on the
// video), and OS media controls preserve playback without opting phones into automatic next video.
describe('the corner player on a phone', () => {
  beforeEach(() => {
    viewport.isMobile = true;
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    mockEditorialFeed([vid(121, 'First Video'), vid(122, 'Second Video')]);
  });

  const openAndPlay = async (user, title) => {
    render(<VideosPage />);
    await user.click((await screen.findAllByText(title))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(document.querySelector('video[controlslist]')).toBeTruthy());
    // See the note on markPlaying above: jsdom never leaves the paused state on its own.
    Object.defineProperty(document.querySelector('video[controlslist]'), 'paused', { value: false, configurable: true });
  };

  it('keeps description disclosure accessible without remounting the player', async () => {
    const user = userEvent.setup();
    await openAndPlay(user, 'First Video');
    const player = document.querySelector('video[controlslist]');
    const toggle = document.querySelector('button[aria-controls][aria-expanded="false"]');
    expect(toggle).toBeTruthy();
    const description = document.getElementById(toggle.getAttribute('aria-controls'));
    expect(description).toHaveTextContent('About First Video');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(description.style.webkitLineClamp).toBe('unset');
    expect(document.querySelector('video[controlslist]')).toBe(player);
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('video[controlslist]')).toBe(player);
  });

  it('puts the title and the controls in the strip', async () => {
    const user = userEvent.setup();
    await openAndPlay(user, 'First Video');

    await user.click(screen.getByRole('button', { name: 'Back' }));

    const strip = (await screen.findByRole('button', { name: 'Close mini player' })).closest('div[style*="position: fixed"]');
    // Labelled for what pressing it does, and jsdom never actually plays, so it reads "Play" here.
    expect(within(strip).getByRole('button', { name: /Play|Pause/ })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'Expand' })).toBeInTheDocument();
    expect(within(strip).getByText('First Video')).toBeInTheDocument();
  });

  it('leaves no mini player when the video was paused first', async () => {
    const user = userEvent.setup();
    await openAndPlay(user, 'First Video');
    Object.defineProperty(document.querySelector('video[controlslist]'), 'paused', { value: true, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close mini player' })).not.toBeInTheDocument());
  });

  // Next is offered only when there is somewhere to go. The page shuffles the list it draws that
  // from, so Math.random is pinned here to make the order knowable — the shuffle itself is not
  // what is under test.
  it('offers Next when another video follows, and not otherwise', async () => {
    const user = userEvent.setup();
    // Editorial home-feed keeps backend order (no shuffle); First leads Second in the mock.
    await openAndPlay(user, 'First Video');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    const leading = (await screen.findByRole('button', { name: 'Close mini player' })).closest('div[style*="position: fixed"]');
    expect(within(leading).getByRole('button', { name: 'Next' })).toBeInTheDocument();

    await user.click(within(leading).getByRole('button', { name: 'Close mini player' }));
    await user.click((await screen.findAllByText('Second Video'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    Object.defineProperty(document.querySelector('video[controlslist]'), 'paused', { value: false, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Back' }));

    const trailing = (await screen.findByRole('button', { name: 'Close mini player' })).closest('div[style*="position: fixed"]');
    expect(within(trailing).queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('stops at the end while locked instead of automatically starting the next video', async () => {
    const user = userEvent.setup();
    await openAndPlay(user, 'First Video');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('First Video');

    const player = document.querySelector('video[controlslist]');
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    try {
      await act(async () => { player.dispatchEvent(new Event('ended')); });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('First Video');
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    } finally {
      if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
      else delete document.hidden;
    }
  });

  it('keeps the watch title to one line with ...more', async () => {
    const user = userEvent.setup();
    await openAndPlay(user, 'First Video');
    const heading = screen.getByTestId('watch-video-title');
    expect(heading).toHaveClass('watch-video-title');
    expect(heading).toHaveStyle({ fontSize: '18px', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
    const more = screen.getByTestId('watch-title-more');
    expect(more).toHaveTextContent('...more');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(heading).toHaveStyle({ whiteSpace: 'normal' });
  });

  it('exposes playback, seek, and available-track lock-screen controls', async () => {
    const user = userEvent.setup();
    const mediaSessionDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');
    const mediaMetadataDescriptor = Object.getOwnPropertyDescriptor(window, 'MediaMetadata');
    const handlers = new Map();
    const mediaSession = {
      playbackState: 'none',
      metadata: null,
      setActionHandler: vi.fn((action, handler) => {
        if (handler) handlers.set(action, handler);
        else handlers.delete(action);
      }),
      setPositionState: vi.fn(),
    };
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: mediaSession });
    Object.defineProperty(window, 'MediaMetadata', { configurable: true, value: class MediaMetadata { constructor(data) { Object.assign(this, data); } } });

    try {
      await openAndPlay(user, 'First Video');
      await waitFor(() => expect(handlers.has('nexttrack')).toBe(true));
      expect([...handlers.keys()]).toEqual(expect.arrayContaining([
        'play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'nexttrack',
      ]));
      expect(handlers.has('previoustrack')).toBe(false);
      expect(mediaSession.metadata).toMatchObject({ title: 'First Video', artist: 'Creator Nine' });

      const player = document.querySelector('video[controlslist]');
      Object.defineProperty(player, 'duration', { configurable: true, value: 90 });
      Object.defineProperty(player, 'currentTime', { configurable: true, writable: true, value: 30 });
      Object.defineProperty(player, 'playbackRate', { configurable: true, writable: true, value: 1.25 });
      await act(async () => { player.dispatchEvent(new Event('timeupdate')); });
      expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({ duration: 90, playbackRate: 1.25, position: 30 });

      await act(async () => { handlers.get('pause')(); });
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
      await act(async () => { handlers.get('play')(); });
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
      await act(async () => { handlers.get('nexttrack')(); });
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Second Video'));
    } finally {
      if (mediaSessionDescriptor) Object.defineProperty(navigator, 'mediaSession', mediaSessionDescriptor);
      else delete navigator.mediaSession;
      if (mediaMetadataDescriptor) Object.defineProperty(window, 'MediaMetadata', mediaMetadataDescriptor);
      else delete window.MediaMetadata;
    }
  });

});

// Mobile home feed: a recent watched rail on top of the default cards, and a shuffled copy
// after them. Empty history must not leave a bare "Watched" row — new viewers see the default
// feed only. Desktop is unchanged.
describe('mobile home — watched swipe rails', () => {
  const watched = (id, title, extra = {}) => ({
    watched_at: '2026-08-12T00:00:00Z',
    video: vid(id, title, extra),
  });

  beforeEach(() => {
    viewport.isMobile = true;
    mockEditorialFeed([vid(201, 'Grid Video')]);
  });

  it('shows no rails when the viewer has never watched anything', async () => {
    api.getWatchHistory.mockResolvedValue({ successful: true, data: [] });
    render(<VideosPage />);
    await screen.findByText('Grid Video');
    expect(screen.queryByRole('heading', { name: 'Recently watched' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Watched' })).not.toBeInTheDocument();
  });

  it('puts the recent rail above the default feed once there is history', async () => {
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [watched(301, 'Watched Alpha'), watched(302, 'Watched Beta')],
    });
    render(<VideosPage />);
    const heading = await screen.findByRole('heading', { name: 'Recently watched' });
    const grid = await screen.findByText('Grid Video');
    expect(heading.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('Watched Alpha').length).toBeGreaterThan(0);
  });

  it('puts a second rail after the feed once history runs past the top rail', async () => {
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: Array.from({ length: 14 }, (_, i) => watched(301 + i, `Watched ${i + 1}`)),
    });
    render(<VideosPage />);
    const grid = await screen.findByText('Grid Video');
    const lower = await screen.findByRole('heading', { name: 'Watched' });
    expect(grid.compareDocumentPosition(lower) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not repeat the top rail underneath when history fits in one rail', async () => {
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [watched(301, 'Watched Alpha'), watched(302, 'Watched Beta')],
    });
    render(<VideosPage />);
    await screen.findByRole('heading', { name: 'Recently watched' });
    expect(screen.queryByRole('heading', { name: 'Watched' })).not.toBeInTheDocument();
  });

  it('does not add a second rail for a single watched video', async () => {
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [watched(301, 'Watched Alpha')],
    });
    render(<VideosPage />);
    expect(await screen.findByRole('heading', { name: 'Recently watched' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Watched' })).not.toBeInTheDocument();
  });

  it('leaves desktop home without the rails', async () => {
    viewport.isMobile = false;
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [watched(301, 'Watched Alpha'), watched(302, 'Watched Beta')],
    });
    render(<VideosPage />);
    await screen.findByText('Grid Video');
    expect(screen.queryByRole('heading', { name: 'Recently watched' })).not.toBeInTheDocument();
  });

  it('does not put an unsafe history row on the rail', async () => {
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [
        watched(301, 'Ready One', { status: 'safe' }),
        watched(302, 'Unsafe One', { status: 'pending' }),
      ],
    });
    render(<VideosPage />);
    expect(await screen.findByRole('heading', { name: 'Recently watched' })).toBeInTheDocument();
    expect(screen.getByText('Ready One')).toBeInTheDocument();
    expect(screen.queryByText('Unsafe One')).not.toBeInTheDocument();
  });

  it('shows no rail when every history row is still processing', async () => {
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [watched(302, 'Unsafe One', { status: 'pending' })],
    });
    render(<VideosPage />);
    await screen.findByText('Grid Video');
    expect(screen.queryByRole('heading', { name: 'Recently watched' })).not.toBeInTheDocument();
    expect(screen.queryByText('Unsafe One')).not.toBeInTheDocument();
  });

  it('shows the watched video duration on the rail', async () => {
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [watched(301, 'Watched Alpha', { duration_sec: 77 })],
    });
    render(<VideosPage />);
    expect(await screen.findByRole('heading', { name: 'Recently watched' })).toBeInTheDocument();
    expect(screen.getByText('1:17')).toBeInTheDocument();
  });

  it('keeps the rails off filtered browse', async () => {
    const user = userEvent.setup();
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [watched(301, 'Watched Alpha'), watched(302, 'Watched Beta')],
    });
    render(<VideosPage />);
    await screen.findByRole('heading', { name: 'Recently watched' });
    await user.click(chip('Trending'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Recently watched' })).not.toBeInTheDocument());
  });

  it('opens Watch History from See All on the recent rail', async () => {
    const user = userEvent.setup();
    api.getWatchHistory.mockResolvedValue({
      successful: true,
      data: [watched(301, 'Watched Alpha'), watched(302, 'Watched Beta')],
    });
    render(<VideosPage />);
    await screen.findByRole('heading', { name: 'Recently watched' });
    await user.click(screen.getByRole('button', { name: 'See All' }));
    await waitFor(() => expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument());
  });
});

// Settings gear: 0.5 / 0.75 / Normal / 1.25x / 1.5x / 2x write HTMLMediaElement.playbackRate.
// HLS attach used to drop the element back to 1 while the chips still looked selected.
describe('playback speed', () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    const clip = vid(111, 'Speed Clip', { hls_url: 'https://cdn.test/111/master.m3u8' });
    mockEditorialFeed([clip]);
    api.getVideo.mockResolvedValue(clip);
  });

  it('applies 1.25x and 1.5x to the playing element', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Speed Clip'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    const player = await waitFor(() => {
      const el = document.querySelector('video[controlslist]');
      expect(el).toBeTruthy();
      return el;
    });

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quality' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Playback speed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1.25x' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Playback speed' }));
    await user.click(screen.getByRole('button', { name: '1.25x' }));
    expect(player.playbackRate).toBe(1.25);

    await user.click(screen.getByRole('button', { name: '1.5x' }));
    expect(player.playbackRate).toBe(1.5);

    await user.click(screen.getByRole('button', { name: 'Normal' }));
    expect(player.playbackRate).toBe(1);
  });

  it('keeps the settings panel open after the 3s chrome auto-hide', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Speed Clip'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Playback speed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quality' })).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 3500));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Playback speed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quality' })).toBeInTheDocument();
  });

  it('closes settings on Escape', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Speed Clip'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
  });
});

describe('playback settings on a phone', () => {
  beforeEach(() => {
    viewport.isMobile = true;
    viewport.width = 390;
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    const clip = vid(112, 'Phone Speed Clip', { hls_url: 'https://cdn.test/112/master.m3u8' });
    mockEditorialFeed([clip]);
    api.getVideo.mockResolvedValue(clip);
  });

  it('opens settings from the gear after tapping Play', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Phone Speed Clip'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quality' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Playback speed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1.25x' })).not.toBeInTheDocument();
  });
});

describe('watch page comments on a phone', () => {
  beforeEach(() => {
    viewport.isMobile = true;
    viewport.width = 390;
    const watching = vid(121, 'Open Video');
    mockEditorialFeed([watching]);
    api.getVideo.mockResolvedValue(watching);
    api.getVideoRecommendations.mockResolvedValue(feed([vid(200, 'Suggested Clip')]));
  });

  it('puts the comments bar above the suggestions list', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);
    await user.click((await screen.findAllByText('Open Video'))[0]);
    const comments = await screen.findByRole('button', { name: /Comments/ });
    const suggested = await screen.findByText('Suggested Clip');
    expect(comments.compareDocumentPosition(suggested) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('creator channel page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/c/9');
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([
          vid(301, 'Long Talk On Air', { video_type: 'long', duration_sec: 3600, views_count: 61298, description: 'About Long Talk On Air' }),
          vid(302, 'Quick Take', { video_type: 'shorts', duration_sec: 28, views_count: 4100 }),
        ]));
      }
      if (Number(params?.channel_id) === 4) {
        return Promise.resolve(feed([
          vid(401, 'Morning Routine for Peak Energy', { video_type: 'long', duration_sec: 23, views_count: 45500 }),
          vid(402, 'Clip Take', { video_type: 'shorts', duration_sec: 12, views_count: 900 }),
        ]));
      }
      return Promise.resolve(feed([]));
    });
    api.getChannelByHandle.mockResolvedValue({
      data: { channel_id: 9, handle: 'nine', display_name: 'Creator Nine', description: 'Welcome to the channel.', _count: { subscriptions: 12 } },
    });
    api.getVideo.mockImplementation((id) => Promise.resolve({
      ...vid(id, `Play ${id}`),
      hls_url: `https://cdn.test/${id}/master.m3u8`,
      description: id === 301 ? 'About Long Talk On Air' : undefined,
    }));
  });

  it('shows a YouTube-style header, home tabs, featured long video, and a clips shelf', async () => {
    const user = userEvent.setup();
    render(<VideosPage />);

    await waitFor(() => expect(api.getVideoFeed).toHaveBeenCalledWith(expect.objectContaining({ channel_id: 9, include_shorts: true })));
    expect(await screen.findByRole('heading', { name: 'Creator Nine' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Creator Nine' }).parentElement).toHaveTextContent('@nine');
    expect(screen.getByTestId('channel-subscribe')).toBeInTheDocument();
    expect(screen.getByTestId('channel-tab-home')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('channel-tab-videos')).toBeInTheDocument();
    expect(screen.getByTestId('channel-tab-shorts')).toBeInTheDocument();
    expect(screen.getByTestId('channel-tab-playlists')).toBeInTheDocument();
    expect(screen.getByTestId('channel-featured')).toHaveTextContent('Long Talk On Air');
    expect(screen.getByTestId('channel-featured')).toHaveTextContent('About Long Talk On Air');
    expect(screen.getByText('Quick Take')).toBeInTheDocument();
    // Featured is a thumb + play CTA that opens the full watch page — not an in-profile player.
    expect(screen.getByTestId('channel-featured-open')).toBeInTheDocument();
    expect(screen.getByTestId('channel-featured').querySelector('video')).toBeNull();

    await user.click(screen.getByTestId('channel-tab-shorts'));
    expect(screen.getByTestId('channel-tab-shorts')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Quick Take')).toBeInTheDocument();
    expect(screen.queryByTestId('channel-featured')).not.toBeInTheDocument();
    // No own channel → no recommend CTA (Subscribe alone).
    expect(screen.queryByTestId('channel-recommend')).not.toBeInTheDocument();
  });

  it('recommends the channel to subscribers when the viewer has a channel', async () => {
    const user = userEvent.setup();
    api.getMyChannel.mockResolvedValue({ data: { channel_id: 42, handle: 'me', display_name: 'Me' } });
    api.createCreatorPick.mockResolvedValue({ successful: true, data: { pick_id: 3 } });
    render(<VideosPage />);
    expect(await screen.findByTestId('channel-recommend')).toBeInTheDocument();
    await user.click(screen.getByTestId('channel-recommend'));
    await waitFor(() => expect(api.createCreatorPick).toHaveBeenCalledWith({
      pick_type: 'channel',
      target_channel_id: 9,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Creator's Choice/i);
  });

  it('stacks Recommend channel below Subscribe on mobile', async () => {
    viewport.isMobile = true;
    api.getMyChannel.mockResolvedValue({ data: { channel_id: 42, handle: 'me', display_name: 'Me' } });
    render(<VideosPage />);

    const recommend = await screen.findByTestId('channel-recommend');
    const subscribe = screen.getByTestId('channel-subscribe');
    expect(recommend).toHaveStyle({ order: '2' });
    expect(subscribe).toHaveStyle({ order: '1' });
    expect(recommend.parentElement).toHaveStyle({ flex: '0 0 100%', flexDirection: 'column' });
  });

  it('keeps long channel names and bios contained on mobile', async () => {
    viewport.isMobile = true;
    const longName = 'CreatorName'.repeat(12);
    const longBio = 'https://example.test/'.repeat(12);
    api.getChannelByHandle.mockResolvedValue({
      data: { channel_id: 9, handle: 'nine', display_name: longName, description: longBio, _count: { subscriptions: 12 } },
    });
    window.history.replaceState({}, '', '/c/nine');
    render(<VideosPage />);

    const heading = await screen.findByRole('heading', { name: longName });
    expect(heading).toHaveStyle({ overflowWrap: 'anywhere' });
    expect(screen.getByText(longBio)).toHaveStyle({ overflowWrap: 'anywhere' });
  });

  it('does not offer recommend on the viewer’s own channel', async () => {
    api.getMyChannel.mockResolvedValue({ data: { channel_id: 9, handle: 'nine', display_name: 'Creator Nine' } });
    render(<VideosPage />);
    expect(await screen.findByTestId('channel-own')).toBeInTheDocument();
    expect(screen.queryByTestId('channel-recommend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('channel-subscribe')).not.toBeInTheDocument();
  });

  it('highlights the latest long video; Play opens the full watch page with that creator in Up Next', async () => {
    const user = userEvent.setup();
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([
          vid(310, 'Older Long', { video_type: 'long', created_at: '2026-01-01T00:00:00Z', views_count: 10, description: 'Older desc' }),
          vid(311, 'Newest Long', { video_type: 'long', created_at: '2026-08-01T00:00:00Z', views_count: 50, description: 'Newest desc' }),
        ]));
      }
      return Promise.resolve(feed([]));
    });
    api.getVideoRecommendations.mockResolvedValue(feed([vid(999, 'Other Creator Rec')]));
    render(<VideosPage />);
    expect(await screen.findByTestId('channel-featured')).toHaveTextContent('Newest Long');
    expect(screen.getByText('Older Long')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Play$/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Play 311' })).toBeInTheDocument();
    expect(screen.queryByTestId('channel-featured')).not.toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: /From Creator Nine/i })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('Older Long')).toBeInTheDocument();
  });

  it('on phone opens the featured video in the full watch page (no in-profile player)', async () => {
    const user = userEvent.setup();
    viewport.isMobile = true;
    viewport.width = 390;
    render(<VideosPage />);
    expect(await screen.findByTestId('channel-featured')).toHaveTextContent('Long Talk On Air');
    expect(screen.getByTestId('channel-featured').querySelector('video')).toBeNull();
    await user.click(screen.getByTestId('channel-featured-open'));
    // getVideo mock titles as `Play ${id}`; watch page must replace the channel profile.
    expect(await screen.findByRole('heading', { level: 1, name: 'Play 301' })).toBeInTheDocument();
    expect(screen.queryByTestId('channel-featured')).not.toBeInTheDocument();
  });

  it('on phone opens a home shelf card in the full watch page instead of swapping the highlight', async () => {
    const user = userEvent.setup();
    viewport.isMobile = true;
    viewport.width = 390;
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([
          vid(310, 'Older Long', { video_type: 'long', created_at: '2026-01-01T00:00:00Z', views_count: 10 }),
          vid(311, 'Newest Long', { video_type: 'long', created_at: '2026-08-01T00:00:00Z', views_count: 50 }),
        ]));
      }
      return Promise.resolve(feed([]));
    });
    render(<VideosPage />);
    expect(await screen.findByTestId('channel-featured')).toHaveTextContent('Newest Long');
    await user.click(screen.getByText('Older Long'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Play 310' })).toBeInTheDocument();
    expect(screen.queryByTestId('channel-featured')).not.toBeInTheDocument();
  });

  it('unwraps /channel/profile on a handle URL so the name and videos load', async () => {
    window.history.replaceState({}, '', '/c/fitwithmorgan');
    api.getChannelByHandle.mockResolvedValue({
      successful: true,
      data: {
        channel_id: 4,
        handle: 'fitwithmorgan',
        display_name: 'FitWithMorgan',
        description: 'Fitness journey, workout routines, and wellness content.',
        _count: { subscriptions: 0, videos: 3 },
      },
    });
    api.getVideoFeed.mockImplementation((params) => {
      if (params?.channel_id === 4) {
        return Promise.resolve(feed([
          vid(401, 'Morning Routine for Peak Energy', { video_type: 'long', duration_sec: 23, views_count: 45500 }),
          vid(402, 'Clip Take', { video_type: 'shorts', duration_sec: 12, views_count: 900 }),
        ]));
      }
      return Promise.resolve(feed([]));
    });

    render(<VideosPage />);

    expect(await screen.findByRole('heading', { name: 'FitWithMorgan' })).toBeInTheDocument();
    await waitFor(() => expect(api.getVideoFeed).toHaveBeenCalledWith(expect.objectContaining({ channel_id: 4, include_shorts: true })));
    expect(await screen.findByTestId('channel-featured')).toHaveTextContent('Morning Routine for Peak Energy');
    expect(screen.getByText('Clip Take')).toBeInTheDocument();
  });

  it('sorts the Videos tab with Latest, Popular, and Oldest chips', async () => {
    const user = userEvent.setup();
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([
          vid(301, 'Old Quiet', { video_type: 'long', created_at: '2026-01-01T00:00:00Z', views_count: 10 }),
          vid(302, 'New Medium', { video_type: 'long', created_at: '2026-08-01T00:00:00Z', views_count: 500 }),
          vid(303, 'Mid Viral', { video_type: 'long', created_at: '2026-04-01T00:00:00Z', views_count: 9000 }),
        ]));
      }
      return Promise.resolve(feed([]));
    });

    render(<VideosPage />);
    await screen.findByRole('heading', { name: 'Creator Nine' });
    await user.click(screen.getByTestId('channel-tab-videos'));

    expect(screen.getByTestId('channel-sort-latest')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('channel-sort-popular')).toBeInTheDocument();
    expect(screen.getByTestId('channel-sort-oldest')).toBeInTheDocument();

    const orderedTitles = () => [...['Old Quiet', 'New Medium', 'Mid Viral'].map((name) => screen.getByText(name))]
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((el) => el.textContent);
    expect(orderedTitles()).toEqual(['New Medium', 'Mid Viral', 'Old Quiet']);

    await user.click(screen.getByTestId('channel-sort-popular'));
    expect(orderedTitles()).toEqual(['Mid Viral', 'New Medium', 'Old Quiet']);

    await user.click(screen.getByTestId('channel-sort-oldest'));
    expect(orderedTitles()).toEqual(['Old Quiet', 'Mid Viral', 'New Medium']);
  });

  it('loads public playlists on the Playlists tab', async () => {
    const user = userEvent.setup();
    api.getChannelPlaylists.mockResolvedValue([
      { playlist_id: 8, name: 'Gym Hits', videos: [] },
    ]);

    render(<VideosPage />);
    await screen.findByRole('heading', { name: 'Creator Nine' });
    await user.click(screen.getByTestId('channel-tab-playlists'));

    await waitFor(() => expect(api.getChannelPlaylists).toHaveBeenCalledWith(9));
    expect(await screen.findByRole('button', { name: 'Gym Hits' })).toBeInTheDocument();
  });

  it('opens a channel playlist instead of staying on the channel page', async () => {
    const user = userEvent.setup();
    api.getChannelPlaylists.mockResolvedValue([
      { playlist_id: 8, name: 'Gym Hits', videos: [{ video_id: 31, title: 'Lesson one', thumbnail_url: 'https://cdn.test/31.jpg' }] },
    ]);

    render(<VideosPage />);
    await screen.findByRole('heading', { name: 'Creator Nine' });
    await user.click(screen.getByTestId('channel-tab-playlists'));
    await user.click(await screen.findByRole('button', { name: 'Gym Hits' }));

    expect(await screen.findByRole('heading', { name: 'Gym Hits' })).toBeInTheDocument();
    expect(screen.queryByTestId('channel-tab-home')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove from playlist')).not.toBeInTheDocument();
  });

  it('replaces the previous creator when another channel profile is opened', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/videos');
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([vid(301, 'Nine Long', { video_type: 'long' })]));
      }
      if (Number(params?.channel_id) === 4) {
        return Promise.resolve(feed([
          vid(401, 'Four Long', {
            video_type: 'long',
            channel: { channel_id: 4, display_name: 'FitWithMorgan', handle: 'fitwithmorgan' },
          }),
        ]));
      }
      return Promise.resolve(feed([vid(1, 'Editorial One')]));
    });
    api.getChannelByHandle.mockImplementation((handle) => {
      const h = String(handle || '').replace(/^@/, '');
      if (h === 'fitwithmorgan') {
        return Promise.resolve({
          data: {
            channel_id: 4,
            handle: 'fitwithmorgan',
            display_name: 'FitWithMorgan',
            description: 'Fit bio',
            _count: { subscriptions: 3 },
          },
        });
      }
      return Promise.resolve({
        data: {
          channel_id: 9,
          handle: 'nine',
          display_name: 'Creator Nine',
          description: 'Welcome to the channel.',
          _count: { subscriptions: 12 },
        },
      });
    });
    api.suggestVideos.mockImplementation((q) => {
      const s = String(q || '').toLowerCase();
      if (s.includes('fit')) {
        return Promise.resolve({
          suggestions: [],
          videos: [],
          channels: [{ channel_id: 4, display_name: 'FitWithMorgan', handle: 'fitwithmorgan', profile_pic_url: null }],
        });
      }
      return Promise.resolve({
        suggestions: [],
        videos: [],
        channels: [{ channel_id: 9, display_name: 'Creator Nine', handle: 'nine', profile_pic_url: null }],
      });
    });

    render(<VideosPage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Search')).toBeInTheDocument());

    const box = screen.getByPlaceholderText('Search');
    await user.click(box);
    await user.type(box, 'nine');
    await user.click(await screen.findByText('@nine'));
    expect(await screen.findByRole('heading', { name: 'Creator Nine' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Search')).toBeInTheDocument());

    const box2 = screen.getByPlaceholderText('Search');
    await user.click(box2);
    await user.clear(box2);
    await user.type(box2, 'fit');
    await user.click(await screen.findByText('@fitwithmorgan'));

    expect(await screen.findByRole('heading', { name: 'FitWithMorgan' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Creator Nine' })).not.toBeInTheDocument();
    await waitFor(() => expect(api.getVideoFeed).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: 4, include_shorts: true }),
    ));
  });

  // Exact user report: watch creator A → open profile → back → watch creator B → open profile
  // must show B, not stick on A.
  it('opens the watched video\'s channel after a previous profile visit', async () => {
    const user = userEvent.setup();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    window.history.replaceState({}, '', '/videos');
    const browseVideos = [
      vid(201, 'From Nine', { channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' } }),
      vid(202, 'From Four', { channel: { channel_id: 4, display_name: 'FitWithMorgan', handle: 'fitwithmorgan' } }),
    ];
    mockEditorialFeed(browseVideos);
    api.getVideoFeed.mockImplementation((params) => {
      if (Number(params?.channel_id) === 9) {
        return Promise.resolve(feed([vid(301, 'Nine Long', { video_type: 'long' })]));
      }
      if (Number(params?.channel_id) === 4) {
        return Promise.resolve(feed([
          vid(401, 'Four Long', {
            video_type: 'long',
            channel: { channel_id: 4, display_name: 'FitWithMorgan', handle: 'fitwithmorgan' },
          }),
        ]));
      }
      return Promise.resolve(feed(browseVideos));
    });
    api.getChannelByHandle.mockImplementation((handle) => {
      const h = String(handle || '').replace(/^@/, '');
      if (h === 'fitwithmorgan') {
        return Promise.resolve({
          data: {
            channel_id: 4,
            handle: 'fitwithmorgan',
            display_name: 'FitWithMorgan',
            description: 'Fit bio',
            _count: { subscriptions: 3 },
          },
        });
      }
      return Promise.resolve({
        data: {
          channel_id: 9,
          handle: 'nine',
          display_name: 'Creator Nine',
          description: 'Welcome to the channel.',
          _count: { subscriptions: 12 },
        },
      });
    });
    api.getVideo.mockImplementation((id) => {
      const n = Number(id);
      if (n === 202 || n === 401) {
        return Promise.resolve({
          ...vid(n, n === 202 ? 'From Four' : 'Four Long', {
            channel: { channel_id: 4, display_name: 'FitWithMorgan', handle: 'fitwithmorgan' },
          }),
          hls_url: `https://cdn.test/${n}/master.m3u8`,
        });
      }
      return Promise.resolve({
        ...vid(n, n === 201 ? 'From Nine' : `Play ${n}`, {
          channel: { channel_id: 9, display_name: 'Creator Nine', handle: 'nine' },
        }),
        hls_url: `https://cdn.test/${n}/master.m3u8`,
      });
    });

    render(<VideosPage />);
    await user.click((await screen.findAllByText('From Nine'))[0]);
    await screen.findByRole('heading', { level: 1, name: 'From Nine' });
    await user.click(screen.getByRole('button', { name: 'Creator Nine' }));
    expect(await screen.findByRole('heading', { name: 'Creator Nine' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getAllByText('From Four').length).toBeGreaterThan(0));

    await user.click(screen.getAllByText('From Four')[0]);
    await screen.findByRole('heading', { level: 1, name: 'From Four' });
    await user.click(screen.getByRole('button', { name: 'FitWithMorgan' }));

    expect(await screen.findByRole('heading', { name: 'FitWithMorgan' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Creator Nine' })).not.toBeInTheDocument();
  });

  it('falls back to the signed-in user playlists when the public channel list fails on your own channel', async () => {
    const user = userEvent.setup();
    api.getMyChannel.mockResolvedValue({ data: { channel_id: 9, handle: 'nine', display_name: 'Creator Nine' } });
    api.getChannelPlaylists.mockRejectedValue(new Error('not found'));
    api.getPlaylists.mockResolvedValue({ data: [{ playlist_id: 8, name: 'My Gym', videos: [] }] });

    render(<VideosPage />);
    expect(await screen.findByTestId('channel-own')).toBeInTheDocument();
    await user.click(screen.getByTestId('channel-tab-playlists'));
    expect(await screen.findByRole('button', { name: 'My Gym' })).toBeInTheDocument();
  });

  it('keeps Videos chips and Playlists on one phone-width row', async () => {
    const user = userEvent.setup();
    viewport.isMobile = true;
    viewport.width = 390;
    api.getChannelPlaylists.mockResolvedValue([
      { playlist_id: 8, name: 'Gym Hits', videos: [] },
    ]);

    render(<VideosPage />);
    await screen.findByRole('heading', { name: 'Creator Nine' });
    expect(screen.getByTestId('channel-tab-playlists')).toBeInTheDocument();

    await user.click(screen.getByTestId('channel-tab-videos'));
    expect(screen.getByTestId('channel-sort-latest')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('channel-sort-popular')).toBeInTheDocument();
    expect(screen.getByTestId('channel-sort-oldest')).toBeInTheDocument();

    await user.click(screen.getByTestId('channel-tab-playlists'));
    expect(await screen.findByRole('button', { name: 'Gym Hits' })).toBeInTheDocument();
  });
});

