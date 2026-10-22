import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'test',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4178/web-components/demo/trading-dashboard-react/',
  },
  // `CHROMIUM_PATH` points at a browser installed outside Playwright's cache (a container with a pinned Chromium), as in the root config.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4178',
    url: 'http://127.0.0.1:4178/web-components/demo/trading-dashboard-react/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
