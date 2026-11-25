import { describe, it, expect } from 'vitest';

// Phase 0 sanity check: Vitest + jsdom + setup file are wired up.
// Real coverage starts in Phase 1 (utils/*, store/auth) and Phase 3 (MSW components).
describe('vitest harness', () => {
  it('runs and asserts', () => {
    expect(1 + 1).toBe(2);
  });

  it('has a jsdom DOM + working localStorage', () => {
    expect(typeof document).toBe('object');
    localStorage.setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
  });
});
