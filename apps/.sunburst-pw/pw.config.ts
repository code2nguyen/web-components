import base from "../../playwright.config.ts"
import { defineConfig } from '@playwright/test'
export default defineConfig({
  ...base,
  testDir: '/home/user/web-components',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4213' },
  webServer: { command: 'npx vite --config tests/vite.config.ts --port 4213 --strictPort', cwd: '/home/user/web-components', url: 'http://127.0.0.1:4213/tests/health.html', reuseExistingServer: true, timeout: 60_000 },
})
