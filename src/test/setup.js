import '@testing-library/jest-dom/vitest';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server.js';

// Node 26 exposes a configurable global `localStorage` getter that returns undefined unless
// Node is launched with --localstorage-file. In Vitest 4 this also prevents jsdom from installing
// its storage object. Provide deterministic per-worker Storage implementations for browser tests.
function createMemoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(String(key)); },
    setItem(key, value) { values.set(String(key), String(value)); },
  };
}

const testLocalStorage = createMemoryStorage();
const testSessionStorage = createMemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: testSessionStorage,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: testLocalStorage });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: testSessionStorage });
}

// jsdom implements none of the observer APIs. Components that measure themselves (scroll-fade
// category bars, lazy media, sticky chrome) construct these during layout effects, so without
// stubs the component throws ReferenceError and the test reports a crash that does not exist in
// a browser. Inert stubs: they never fire, which is the correct default for a zero-layout DOM.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = NoopObserver;
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = NoopObserver;
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

// MSW: intercept all HTTP for the test run. Unhandled requests error so a wrong path/method
// in an API test is caught rather than silently hanging.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Unmount React trees, reset auth/per-user storage, and clear request handlers between tests.
afterEach(() => {
  cleanup();
  if (typeof localStorage !== 'undefined') localStorage.clear();
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  server.resetHandlers();
});

afterAll(() => server.close());
