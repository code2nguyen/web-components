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
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    // Node loads the dependencies itself: no browser pre-bundling, and a cache of its own so the test server's
    // pre-bundled dependencies are never touched.
    optimizeDeps: { noDiscovery: true, entries: [] },
    cacheDir: `${root}node_modules/.vite-hydration-test-week-planner`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderPlanner(): Promise<string> }
    markup = await server.renderPlanner()
  } finally {
    await vite.close()
  }
})

test('a planner with its own locale is drawn in that language on the server and stays in it after hydration', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  // The server sees `locale="fr"`: its text is French already, which is what the hydrating render assumes.
  expect(markup).toContain('Semaine impaire')
  expect(markup).not.toContain('Odd week')

  const errors: string[] = []
  page.on('console', (message) => {
    // The page has no favicon: a missing resource is not an error of the component.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/week-planner/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  await expect(page.getByRole('radio', { name: /^Semaine impaire/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Odd week/ })).toHaveCount(0)
  expect(errors).toEqual([])
})
