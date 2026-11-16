import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { expect, test } from '@playwright/test'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

let markup = ''

// The server renders in the default language: it cannot see the `lang` around the element, nor the app's translations.
test.beforeAll(async () => {
  // A cold Vite transforms the component, its siblings and their Sass before the first render.
  test.setTimeout(120_000)
  const vite = await createServer({
    configFile: `${root}tests/vite.config.ts`,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    // Node loads the dependencies itself: no browser pre-bundling, and a cache of its own so the test server's
    // pre-bundled dependencies are never touched.
    optimizeDeps: { noDiscovery: true, entries: [] },
    cacheDir: `${root}node_modules/.vite-hydration-test`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderUnitInput(): Promise<string> }
    markup = await server.renderUnitInput()
  } finally {
    await vite.close()
  }
})

test('hydration rewrites the text and attributes the server rendered in another language', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  expect(markup).toContain('1.13')
  expect(markup).toContain('aria-label="Decrease value"')

  const errors: string[] = []
  page.on('console', (message) => {
    // The page has no favicon: a missing resource is not an error of the component.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/number-input/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  const host = page.locator('c2-unit-input')
  // A number formatted with the page's language (text), and a translated message (attribute).
  await expect(host.locator('[part="equivalent"]')).toHaveText('= 1,13 kg')
  await expect(host.locator('[aria-label="Diminuer la valeur"]')).toHaveCount(1)
  await expect(host.locator('[aria-label="Decrease value"]')).toHaveCount(0)
  // Rewritten after hydration, not instead of it: no mismatch error.
  expect(errors).toEqual([])
})
