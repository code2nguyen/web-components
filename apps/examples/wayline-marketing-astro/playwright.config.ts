import { defineConfig, devices } from '@playwright/test'

const base = 'http://127.0.0.1:4184/web-components/demo/wayline-marketing-astro/'

export default defineConfig({
  testDir: 'test',
  fullyParallel: true,
  use: { baseURL: base },
  // `CHROMIUM_PATH` points at a browser installed outside Playwright's cache (a container with a pinned Chromium), as in the root config.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } } }],
  // The static production build, so the suite covers the page as deployed; build the app first.
  webServer: {
    command: 'npx astro preview --host 127.0.0.1 --port 4184',
    // Astro 7 moves `preview` to the background when it detects an AI coding agent, and Playwright then sees the
    // command exit. This is the variable Astro sets for its own background server process: it keeps the server here.
    env: { ASTRO_PREVIEW_BACKGROUND: '1' },
    url: base,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
