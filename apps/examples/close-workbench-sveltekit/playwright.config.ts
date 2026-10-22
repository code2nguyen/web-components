import { defineConfig, devices } from '@playwright/test'

const base = 'http://127.0.0.1:4182/web-components/demo/close-workbench-sveltekit/'

export default defineConfig({
  testDir: 'test/browser',
  fullyParallel: true,
  use: { baseURL: base },
  // `CHROMIUM_PATH` points at a browser installed outside Playwright's cache (a container with a pinned Chromium), as in the root config.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } } }],
  // The prerendered production build, so the suite covers hydration of server-rendered markup; build the app first.
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4182 --strictPort',
    url: base,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
