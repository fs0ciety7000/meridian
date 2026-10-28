import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', testIgnore: /perf\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    // Frame-time measurements run alone, after everything else: parallel tests would
    // compete for the (software) rasteriser and distort the numbers.
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      dependencies: ['desktop', 'mobile'],
      // Timing noise (one doubled frame) is not a regression: retry, never relax the threshold.
      retries: 2,
      use: { ...devices['Pixel 7'] },
    },
  ],
  // Production-like: the real Hono server (CSP, cache headers) serving the built app.
  // Requires `pnpm build` first (CI does it; `pnpm test:e2e` at the root too).
  webServer: {
    command: 'node ../server/dist/server.mjs',
    env: { STATIC_DIR: 'dist', PORT: String(port) },
    port,
    reuseExistingServer: !process.env.CI,
  },
});
