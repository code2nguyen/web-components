import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4180/web-components/demo/observability-nextjs/'
// `CHROMIUM_PATH` points at a browser installed outside Playwright's cache (a container with a pinned Chromium), as in the root config.
const launchOptions = { executablePath: process.env.CHROMIUM_PATH || undefined }

export default defineConfig({
  testDir: 'test',
  // `test/unit/*.test.ts` are node:test suites (`npm run test:unit`); Playwright's default match would import them too.
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, launchOptions } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run preview',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
