import { defineConfig } from '@playwright/test';

const port = process.env['UNIVA_TEST_PORT'] || '4200';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    reducedMotion: 'reduce',
    launchOptions: {
      executablePath: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] || undefined,
    },
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120000,
  },
});
