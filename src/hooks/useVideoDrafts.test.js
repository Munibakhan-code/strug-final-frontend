import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoDrafts } from './useVideoDrafts.js';
import { deleteVideoDraft, saveDraftMedia, saveVideoDraft } from '../utils/videoDrafts.js';

vi.mock('../utils/videoDrafts.js', () => ({
  DRAFT_EVENT: 'strug-video-drafts-changed',
  createDraftId: vi.fn()
    .mockReturnValueOnce('draft-a')
    .mockReturnValueOnce('draft-b')
    .mockReturnValue('draft-next'),
  deleteVideoDraft: vi.fn(() => Promise.resolve()),
  listVideoDrafts: vi.fn(() => []),
  saveDraftMedia: vi.fn(() => Promise.resolve(true)),
  saveVideoDraft: vi.fn(),
}));

describe('useVideoDrafts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps draft identity with its file when a bulk item is removed', async () => {
    const first = new File(['a'], 'first.mp4', { type: 'video/mp4' });
    const second = new File(['b'], 'second.mp4', { type: 'video/mp4' });
    const { rerender } = renderHook(
      ({ items }) => useVideoDrafts({ owner: 'channel-1', open: true, items, visibility: 'public' }),
      { initialProps: { items: [{ file: first }, { file: second }] } },
    );
    await waitFor(() => expect(saveDraftMedia).toHaveBeenCalledTimes(2));
    rerender({ items: [{ file: second }] });
    await waitFor(() => expect(deleteVideoDraft).toHaveBeenCalledWith('channel-1', 'draft-a'));
    expect(saveVideoDraft).toHaveBeenLastCalledWith('channel-1', 'draft-b', { file: second }, 'public');
  });

  it('preserves a resumed metadata-only draft that needs file reselection', async () => {
    const item = { draftId: 'resumed', originalFileName: 'large.mp4' };
    const { result } = renderHook(() => useVideoDrafts({ owner: 'channel-1', open: true, items: [item], visibility: 'unlisted' }));
    expect(result.current.hasDraft).toBe(true);
    await waitFor(() => expect(saveVideoDraft).toHaveBeenCalledWith('channel-1', 'resumed', item, 'unlisted'));
    expect(deleteVideoDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe('reselect'));
  });

  it('does not copy or delete drafts when the active channel changes', async () => {
    const items = [{ title: 'Private work' }];
    const { result, rerender } = renderHook(({ owner }) => useVideoDrafts({ owner, open: true, items, visibility: 'unlisted' }), { initialProps: { owner: 'original' } });
    await waitFor(() => expect(result.current.status).toBe('saved'));
    saveVideoDraft.mockClear();
    rerender({ owner: 'different' });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(saveVideoDraft).not.toHaveBeenCalled();
    expect(deleteVideoDraft).not.toHaveBeenCalled();
  });
});
