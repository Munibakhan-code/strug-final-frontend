import { setupServer } from 'msw/node';

// No default handlers — each test registers what it needs via server.use(...).
// Lifecycle (listen/resetHandlers/close) is wired in src/test/setup.js.
export const server = setupServer();
