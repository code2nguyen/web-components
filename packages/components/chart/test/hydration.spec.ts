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
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderCharts(): Promise<string> }
    markup = await server.renderCharts()
  } finally {
    await vite.close()
  }
})

test('a chart whose series are children renders its state, not a series error, on the server and after hydration', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  // The server cannot see the `c2-chart-series` children: it must not report that the chart has too few series.
  expect(markup).not.toContain('needs two series')

  const errors: string[] = []
  page.on('console', (message) => {
    // The page has no favicon: a missing resource is not an error of the component.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/chart/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  for (const [id, slot] of [
    ['loading', 'loading'],
    ['empty', 'empty'],
  ]) {
    const chart = page.locator(`#${id}`)
    // The state shows the author's slotted content, and the legend lists the declared series.
    await expect(chart.locator(`[part="state"] slot[name="${slot}"]`)).toHaveCount(1)
    await expect(chart.locator(`[slot="${slot}"]`)).toBeVisible()
    await expect(chart.getByText('needs two series')).toHaveCount(0)
  }
  // A chart that really has one series hydrates the server's state, then shows its error.
  await expect(page.locator('#invalid').getByText('needs two series')).toBeVisible()
  expect(errors).toEqual([])
})
