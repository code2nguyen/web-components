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
    cacheDir: `${root}node_modules/.vite-hydration-test-video-player`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as { renderPlayer(): Promise<string> }
    markup = await server.renderPlayer()
  } finally {
    await vite.close()
  }
})

test('draws no full screen or picture-in-picture button on the server, then adds what the browser supports once hydrated', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  // The server cannot know what the visitor's browser supports.
  expect(markup).not.toContain('Full screen')
  expect(markup).not.toContain('Picture in picture')

  const problems: string[] = []
  page.on('console', (message) => {
    // The page has no favicon: a missing resource is not an error of the component.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(message.text())
    if (/mismatch/i.test(message.text())) problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  await page.goto('/packages/components/video-player/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  const supports = await page.evaluate(() => ({
    fullscreen: !!document.fullscreenEnabled,
    pip: !!document.pictureInPictureEnabled && 'requestPictureInPicture' in HTMLVideoElement.prototype,
  }))
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveCount(supports.fullscreen ? 1 : 0)
  await expect(page.getByRole('button', { name: 'Picture in picture' })).toHaveCount(supports.pip ? 1 : 0)
  expect(problems).toEqual([])
})
