import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { expect, test } from '@playwright/test'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

let markup = ''

test.beforeAll(async () => {
  // A cold Vite transforms the component, its siblings and their Sass before the first render.
  test.setTimeout(120_000)
  const vite = await createServer({
    configFile: `${root}tests/vite.config.ts`,
    // No HMR socket: parallel workers would each try to bind Vite's default port.
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
    // Node loads the dependencies itself: no browser pre-bundling, and a cache of its own so the test server's
    // pre-bundled dependencies are never touched.
    optimizeDeps: { noDiscovery: true, entries: [] },
    cacheDir: `${root}node_modules/.vite-hydration-test`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderTagInput(): Promise<string> }
    markup = await server.renderTagInput()
  } finally {
    await vite.close()
  }
})

test('after hydration every tag shows the slotted remove icon, without a mismatch', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  const errors: string[] = []
  page.on('console', (message) => {
    // The page has no favicon: a missing resource is not an error of the component.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/tag-input/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  // The slot's `slotchange` fired before hydration bound its listener: the copies come from reading it after.
  await expect(page.locator('c2-tag-input [part="remove-button"] .custom-remove')).toHaveCount(3)
  expect(errors).toEqual([])
})
