import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { expect, test } from '@playwright/test'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const TEXT = 'Revenue grew 12% this quarter.'

let markup = ''
let streamingMarkup = ''

test.beforeAll(async () => {
  // A cold Vite transforms the component and its Sass before the first render.
  test.setTimeout(120_000)
  const vite = await createServer({
    configFile: `${root}tests/vite.config.ts`,
    // No HMR socket: parallel workers would each try to bind Vite's default port.
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, entries: [] },
    cacheDir: `${root}node_modules/.vite-hydration-test-streaming-text`,
  })
  try {
    const server = (await vite.ssrLoadModule(fileURLToPath(new URL('./hydration-server.ts', import.meta.url)))) as {
      renderStreamingText(): Promise<string>
      renderStreamingProperty(): Promise<string>
    }
    markup = await server.renderStreamingText()
    streamingMarkup = await server.renderStreamingProperty()
  } finally {
    await vite.close()
  }
})

test('server-rendered text is shown once after hydration, not twice', async ({ page }) => {
  expect(markup).toContain('shadowrootmode')
  expect(markup).toContain(TEXT)

  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/packages/components/streaming-text/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)

  const host = page.locator('c2-streaming-text')
  await expect.poll(() => host.evaluate((el) => el.shadowRoot!.querySelector('[part="text"]')!.textContent)).toBe(TEXT)
  // Later text still streams in after the hydrated text.
  await host.evaluate((el) => (el as HTMLElement & { appendText(chunk: string): void }).appendText(' Costs fell.'))
  await expect.poll(() => host.evaluate((el) => el.shadowRoot!.querySelector('[part="text"]')!.textContent)).toBe(`${TEXT} Costs fell.`)
  expect(errors).toEqual([])
})

test('a stream whose text a framework sets after hydration is never blank and never doubled', async ({ page }) => {
  expect(streamingMarkup).toContain(TEXT)
  await page.goto('/packages/components/streaming-text/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), streamingMarkup)
  // Set the property as a framework's commit does, then sample what is visible on every frame until it settles.
  const seen = await page.evaluate(async (text) => {
    const host = document.querySelector('c2-streaming-text') as HTMLElement & { value: string }
    host.value = text
    const visible = () => (host.shadowRoot!.querySelector('[part="text"]') as HTMLElement).innerText
    const samples: string[] = []
    for (let frame = 0; frame < 90; frame++) {
      samples.push(visible())
      await new Promise(requestAnimationFrame)
    }
    return samples
  }, TEXT)
  expect(seen.filter((sample) => !sample.trim().length || sample.includes(TEXT + TEXT.slice(0, 5))).slice(0, 3)).toEqual([])
  expect(seen.every((sample) => sample.trim().length > 0)).toBe(true)
  expect(seen.every((sample) => !sample.includes(TEXT + TEXT.slice(0, 5)))).toBe(true)
  expect(seen.at(-1)?.trim()).toBe(TEXT)
})

test('a hydrated element shows a shorter or different value the client sets', async ({ page }) => {
  await page.goto('/packages/components/streaming-text/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), markup)
  const host = page.locator('c2-streaming-text')
  await host.evaluate((el) => ((el as HTMLElement & { value: string }).value = 'Revenue grew 9%.'))
  await expect.poll(() => host.evaluate((el) => (el.shadowRoot!.querySelector('[part="text"]') as HTMLElement).innerText.trim())).toBe('Revenue grew 9%.')
})

test('clearing a hydrated element whose text the client never had removes the server text', async ({ page }) => {
  await page.goto('/packages/components/streaming-text/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), streamingMarkup)
  const host = page.locator('c2-streaming-text')
  await host.evaluate((el) => (el as HTMLElement & { clear(): void }).clear())
  await expect.poll(() => host.evaluate((el) => (el.shadowRoot!.querySelector('[part="text"]') as HTMLElement).innerText.trim())).toBe('')
})

test('at the hand-over no segment of the hydrated text fades in again', async ({ page }) => {
  await page.goto('/packages/components/streaming-text/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  await page.evaluate((html) => window.hydrate(html), streamingMarkup)
  const fading = await page.evaluate(async (text) => {
    const host = document.querySelector('c2-streaming-text') as HTMLElement & { value: string }
    host.style.setProperty('--c2-streaming-text__segment--enter-duration', '400ms')
    host.value = text
    const ssr = host.shadowRoot!.querySelector('.ssr')!
    // Wait for the hand-over, then count the segments still fading in the frame it happened.
    for (let frame = 0; frame < 120 && ssr.textContent; frame++) await new Promise(requestAnimationFrame)
    return {
      handedOver: !ssr.textContent && !(host.shadowRoot!.querySelector('.live') as HTMLElement).hidden,
      fading: host.shadowRoot!.querySelectorAll('.live .enter').length,
    }
  }, TEXT)
  expect(fading).toEqual({ handedOver: true, fading: 0 })
})

test('text cleared before the element upgrades does not leave the server text behind', async ({ page }) => {
  await page.goto('/packages/components/streaming-text/test/hydration.html')
  await page.waitForFunction(() => document.documentElement.dataset.modulesReady === 'true')
  const text = await page.evaluate(async (html) => {
    document.querySelector('main')!.setHTMLUnsafe(html)
    const host = document.querySelector('c2-streaming-text') as HTMLElement & { value: string; updateComplete: Promise<unknown> }
    // A parent's binding sets the client state (empty) before the element upgrades and finds the server's copy.
    host.value = ''
    await import('/packages/components/streaming-text/src/streaming-text.ts' as string)
    await host.updateComplete
    return (host.shadowRoot!.querySelector('[part="text"]') as HTMLElement).innerText.trim()
  }, streamingMarkup)
  expect(text).toBe('')
})
