import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['packages/components/*/test/*.spec.ts', 'open-packages/*/test/*.spec.ts', 'packages/umbrella/test/*.spec.ts', 'tests/style-contracts/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
  },
  projects: [
    // `CHROMIUM_PATH` points at a browser installed outside Playwright's cache (a container with a pinned Chromium).
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Lets Web Audio run in CI, as it does in Chromium and WebKit: the media suites feed an oscillator stream into an
        // AudioContext, which Firefox keeps suspended on a machine with no audio device (the null backend stands in
        // for one) and, without a click, under its autoplay policy.
        launchOptions: {
          firefoxUserPrefs: { 'media.cubeb.force_null_context': true, 'media.autoplay.default': 0, 'media.autoplay.block-webaudio': false },
        },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'reorder-touch',
      testMatch: ['packages/components/reorder-list/test/*.spec.ts'],
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run test:serve',
    url: 'http://127.0.0.1:4175/tests/health.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
