import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { expect, test } from '@playwright/test'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

let markup = ''

test.beforeAll(async () => {
  // A cold Vite transforms the components and their Sass before the first render.
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
    cacheDir: `${root}node_modules/.vite-hydration-test-menu`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderMenuItem(): Promise<string> }
    markup = await server.renderMenuItem()
  } finally {
    await vite.close()
  }
})

// A behaviour check, not a regression test for the `|| nothing` guard: the element renders again after hydration, which
// re-commits an empty part as `nothing` before the label arrives, so this passes on the old `''` too (the tree spec fails).
test('a server-rendered c2-menu-item with no label shows a label set after hydration', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/menu/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  const item = page.locator('c2-menu-item')
  await item.evaluate(async (element) => {
    const row = element as HTMLElement & { label: string; updateComplete: Promise<unknown> }
    row.label = 'Documents'
    await row.updateComplete
  })
  await expect(item.locator('.text')).toHaveText('Documents')
  expect(errors).toEqual([])
})
