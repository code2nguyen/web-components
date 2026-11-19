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
    cacheDir: `${root}node_modules/.vite-hydration-test-command`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderCommand(): Promise<string> }
    markup = await server.renderCommand()
  } finally {
    await vite.close()
  }
})

test('a group server-rendered with no heading shows the heading it is given after hydration', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/command/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  const group = page.locator('c2-command-group')
  await group.evaluate(async (element) => {
    const host = element as HTMLElement & { heading: string; updateComplete: Promise<unknown> }
    host.heading = 'Recent files'
    await host.updateComplete
  })
  await expect(group.locator('.heading')).toHaveText('Recent files')
  expect(errors).toEqual([])
})
