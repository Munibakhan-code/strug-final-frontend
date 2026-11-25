/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

const locales = import.meta.glob('../i18n/locales/*.json', { eager: true, import: 'default' });

const requiredVideoKeys = {
  noVideosInCategory: [],
  videoUploadProgress: ['{{current}}', '{{total}}'],
  uploadVideos_one: ['{{count}}'],
  uploadVideos_other: ['{{count}}'],
  uploadingProgress: ['{{progress}}'],
  processingFailed: [],
  processingFailedHint: [],
  processingEllipsis: [],
  stillProcessingTitle: [],
  processingWatchHint: [],
  uploadedProcessing: [],
  uploadedProcessingBulk: ['{{count}}'],
};

describe('video locale coverage', () => {
  it('keeps the affected category, upload, and processing strings available in every locale', () => {
    expect(Object.keys(locales)).toHaveLength(57);
    for (const [path, locale] of Object.entries(locales)) {
      for (const [key, placeholders] of Object.entries(requiredVideoKeys)) {
        expect(locale?.videos?.[key], `${path}: videos.${key}`).toEqual(expect.any(String));
        expect(locale.videos[key].trim(), `${path}: videos.${key} is blank`).not.toBe('');
        for (const placeholder of placeholders) {
          expect(locale.videos[key], `${path}: videos.${key} lost ${placeholder}`).toContain(placeholder);
        }
      }
    }
  });
});
