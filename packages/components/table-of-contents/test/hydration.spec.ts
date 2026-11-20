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
    cacheDir: `${root}node_modules/.vite-hydration-test-index-bar`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderIndexBar(): Promise<string> }
    markup = await server.renderIndexBar()
  } finally {
    await vite.close()
  }
})

// A behaviour check, not a regression test for the `|| nothing` guard: the bar renders again after hydration (its
// active section), which re-commits the bubble's empty part as `nothing` before a drag sets a key, so this passes on
// the old `''` too (the tree spec is the one that fails without its fix).
test('a server-rendered index bar at rest shows the key under the pointer in its bubble after hydration', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/table-of-contents/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  const bar = page.locator('c2-index-bar')
  // What a drag over the rail sets (`bubble` is the element's internal state).
  await bar.evaluate(async (element) => {
    const host = element as HTMLElement & { bubble: { key: string; y: number } | null; updateComplete: Promise<unknown> }
    host.bubble = { key: 'M', y: 20 }
    await host.updateComplete
  })
  await expect(bar.locator('.bubble')).toHaveText('M')
  expect(errors).toEqual([])
})
