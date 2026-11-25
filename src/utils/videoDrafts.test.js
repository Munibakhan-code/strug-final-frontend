import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDraftId, deleteVideoDraft, listVideoDrafts, saveVideoDraft } from './videoDrafts.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('video draft metadata', () => {
  it('keeps drafts private to their creator channel and orders recent work first', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValueOnce(20);
    saveVideoDraft(11, 'older', { title: 'First' }, 'public');
    saveVideoDraft(11, 'newer', { title: 'Second' }, 'unlisted');
    saveVideoDraft(22, 'private', { title: 'Another creator' }, 'public');
    expect(listVideoDrafts(11).map(row => row.title)).toEqual(['Second', 'First']);
    expect(listVideoDrafts(11).some(row => row.title === 'Another creator')).toBe(false);
  });

  it('preserves file identity metadata and removes discarded drafts', async () => {
    const file = new File(['video'], 'lesson.mp4', { type: 'video/mp4', lastModified: 123 });
    saveVideoDraft(11, 'lesson', { title: 'Lesson', file, category: 'Education' }, 'unlisted');
    expect(listVideoDrafts(11)[0]).toMatchObject({
      title: 'Lesson', fileName: 'lesson.mp4', fileSize: 5, fileModified: 123,
      category: 'Education', visibility: 'unlisted',
    });
    await deleteVideoDraft(11, 'lesson');
    expect(listVideoDrafts(11)).toEqual([]);
  });

  it('repairs an invalid saved record instead of failing the upload flow', () => {
    localStorage.setItem('strug:video-draft:v1:11:broken', '{invalid');
    expect(() => saveVideoDraft(11, 'broken', { title: 'Recovered' }, 'public')).not.toThrow();
    expect(listVideoDrafts(11)[0].title).toBe('Recovered');
  });

  it('creates a usable id when randomUUID is unavailable', () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined });
    try { expect(createDraftId()).toMatch(/^draft-/); }
    finally { Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: original }); }
  });
});
