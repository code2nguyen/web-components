import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  testDir: 'test',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4177/web-components/',
  },
  // `CHROMIUM_PATH` points at a browser installed outside Playwright's cache, as in the root config.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } } }],
  webServer: {
    command: 'npm run build -w apps/ui && node node_modules/vite/bin/vite.js preview apps/ui --base /web-components/ --host 127.0.0.1 --port 4177',
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    url: 'http://127.0.0.1:4177/web-components/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
