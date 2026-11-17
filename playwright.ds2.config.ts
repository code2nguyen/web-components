import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4391' },
  projects: base.projects!.filter((project) => project.name === 'chromium'),
  webServer: {
    command: 'npx vite --config tests/vite.config.ts --port 4391 --strictPort',
    url: 'http://127.0.0.1:4391/tests/health.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
