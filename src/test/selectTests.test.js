/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { matchesGlob, selectFromChangedFiles } from '../../scripts/select-tests.js';

const manifest = {
  fullSuiteTriggers: ['package-lock.json', 'src/App.jsx', '.github/**'],
  verticals: {
    core: {
      always: true,
      watch: ['src/api/client.js'],
      tests: ['src/api/client.test.js'],
    },
    food: {
      watch: ['src/pages/Food.jsx', 'src/api/food.js'],
      tests: ['src/api/food.test.js'],
    },
    platform: {
      watch: ['src/api/**', 'src/utils/**'],
      tests: ['src/utils/format.test.js'],
    },
  },
};

describe('select-tests', () => {
  it('food page change runs food + core, not the whole platform bucket', () => {
    const r = selectFromChangedFiles(['src/pages/Food.jsx'], manifest);
    expect(r.runFull).toBe(false);
    expect(r.verticals).toEqual(['core', 'food']);
    expect(r.tests).toEqual(['src/api/client.test.js', 'src/api/food.test.js']);
  });

  it('App.jsx forces the full suite', () => {
    expect(selectFromChangedFiles(['src/App.jsx'], manifest).runFull).toBe(true);
  });

  it('unmapped source file forces the full suite', () => {
    const r = selectFromChangedFiles(['src/pages/Unknown.jsx'], manifest);
    expect(r.runFull).toBe(true);
  });

  it('food API file is not classified as platform even though src/api/** would match', () => {
    const r = selectFromChangedFiles(['src/api/food.js'], manifest);
    expect(r.verticals).toEqual(['core', 'food']);
    expect(r.tests).not.toContain('src/utils/format.test.js');
  });
});
