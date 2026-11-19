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
    cacheDir: `${root}node_modules/.vite-hydration-test-month-planner`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderPlanners(): Promise<string> }
    markup = await server.renderPlanners()
  } finally {
    await vite.close()
  }
})

test('draws no today marker on the server, then marks the visitor’s today once hydrated', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  // The server's clock is not the visitor's: whatever day it is there, nothing is marked.
  expect(markup).not.toContain('aria-current="date"')

  const problems: string[] = []
  page.on('console', (message) => {
    // The page has no favicon: a missing resource is not an error of the component.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(message.text())
    if (/mismatch/i.test(message.text())) problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  // The visitor's today is in the month shown, on a day the server did not mark.
  await page.clock.install({ time: new Date(2026, 8, 15, 10) })
  await page.goto('/packages/components/month-planner/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  await expect(page.locator('#grid .date.today')).toHaveText('15')
  await expect(page.locator('#grid [aria-current="date"]')).toHaveCount(1)
  await expect(page.locator('#agenda .agenda-day.today')).toHaveAttribute('data-date', '2026-09-15')
  expect(problems).toEqual([])
})

test('a planner with no month hydrates on the server’s month, then shows the visitor’s', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(message.text())
    if (/mismatch/i.test(message.text())) problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  // The server drew September (30 days); the visitor is already in October (31), a grid of another length.
  await page.clock.install({ time: new Date(2026, 9, 2, 10) })
  await page.goto('/packages/components/month-planner/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate(() => {
    window.addEventListener('month-change', (event) =>
      document.documentElement.setAttribute('data-month-change', (event as CustomEvent<{ month: string }>).detail.month),
    )
  })
  await page.evaluate((html) => window.hydrate(html), markup)

  await expect(page.locator('#current .title')).toHaveText(/October 2026/)
  await expect(page.locator('html')).toHaveAttribute('data-month-change', '2026-10')
  await expect(page.locator('#current .date.today')).toHaveText('2')
  // The planners with a month keep it.
  await expect(page.locator('#grid .title')).toHaveText(/September 2026/)
  expect(problems).toEqual([])
})
