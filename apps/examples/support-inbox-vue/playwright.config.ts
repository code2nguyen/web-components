import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'test',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4176/web-components/demo/support-inbox-vue/',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4176',
    url: 'http://127.0.0.1:4176/web-components/demo/support-inbox-vue/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
