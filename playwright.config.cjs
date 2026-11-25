// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './scripts/tests',
  timeout: 30000,
  retries: 1,
  globalSetup: require.resolve('./scripts/playwright-auth-setup.cjs'),
  use: {
    // CI gates against staging via E2E_BASE_URL=https://app.staging.strug.ca; defaults to a
    // local preview server for ad-hoc runs.
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5185',
    headless: true,
    viewport: { width: 1280, height: 800 },
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // storageState provides localStorage with auth keys already set by the URL-ingestion flow
    storageState: 'scripts/auth-state.json',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
