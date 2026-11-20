import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { expect, test } from '@playwright/test'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

let markup = ''

// The server formats in its own language: it cannot see the `lang` around the element.
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
    cacheDir: `${root}node_modules/.vite-hydration-test-format-number`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderNumbers(): Promise<string> }
    markup = await server.renderNumbers()
  } finally {
    await vite.close()
  }
})

test('hydrates a number the server formatted in another language, then formats it in the page language', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  // Formatted in English on the server: the decimal point is a part of its own.
  expect(markup).toContain('<!--lit-part-->.<!--/lit-part-->')

  const errors: string[] = []
  page.on('console', (message) => {
    // The page has no favicon: a missing resource is not an error of the component.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/format-number/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  // French has one more part than English ("12,4 %"): drawn once, in French, with no hydration error.
  await expect(page.locator('#number [part="number"]')).toHaveText(/^12,4\s%$/)
  await expect(page.locator('#delta [part="number"]')).toHaveText(/^\+12,4\s%$/)
  await expect(page.locator('#delta [part="unit"]')).toHaveCount(1)
  expect(errors).toEqual([])
})
