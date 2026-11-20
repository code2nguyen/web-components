import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { expect, test } from '@playwright/test'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

let markup = ''
let emptyMarkup = ''

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
    cacheDir: `${root}node_modules/.vite-hydration-test-tree`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as {
      renderTree(): Promise<string>
      renderEmptyTree(): Promise<string>
    }
    markup = await server.renderTree()
    emptyMarkup = await server.renderEmptyTree()
  } finally {
    await vite.close()
  }
})

test('a row server-rendered with no label shows the label it is given after hydration', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/tree/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  const item = page.locator('c2-tree-item')
  await item.evaluate(async (element) => {
    const row = element as HTMLElement & { label: string; updateComplete: Promise<unknown> }
    row.label = 'Documents'
    await row.updateComplete
  })
  await expect(item.locator('.label')).toHaveText('Documents')
  // The server cannot see the authored row, so it draws no empty state that hydration would keep under it.
  await expect(page.locator('c2-tree').locator('.empty')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a server-rendered tree with only empty-state content hydrates, then shows its empty state', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/tree/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('scheduled an update')) warnings.push(message.text())
  })
  await page.evaluate((html) => window.hydrate(html), emptyMarkup)
  await expect(page.locator('c2-tree').locator('.empty')).toHaveCount(1)
  await expect(page.getByText('Nothing yet')).toBeVisible()
  expect(errors).toEqual([])
  expect(warnings).toEqual([])
})
