#!/usr/bin/env node
/**
 * Captures every gallery card of the built docs site as a PNG, in the light and the dark theme, at the paths the
 * `@c2n/mcp` registry already names (`gallery-shots/<component>/<slug>.<theme>.png`), so an agent that reads images
 * can see a look before choosing it. The images are served by GitHub Pages next to the site: they are never
 * committed and never shipped in an npm package.
 *
 * Runs after `npm run ui:build` (it serves `apps/ui/dist/`) and `npm run build:tools` (the registry lists each
 * component's cards, in page order, with their slugs). `deploy.yml` runs it before uploading the Pages artifact.
 *
 *   node apps/ui/scripts/gallery-shots.mjs [component-id…]
 */
import { chromium } from '@playwright/test'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const uiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(uiRoot, 'dist')
const registryFile = resolve(uiRoot, '../../packages/tools/mcp/data/registry.json')
const base = '/web-components/'
const themes = ['light', 'dark']
const concurrency = 4

if (!existsSync(join(dist, 'index.html'))) throw new Error('apps/ui/dist is missing: run `npm run ui:build` first')
if (!existsSync(registryFile)) throw new Error('The MCP registry is missing: run `npm run build:tools` first')

const registry = JSON.parse(readFileSync(registryFile, 'utf8'))
const only = new Set(process.argv.slice(2))
const galleries = Object.values(registry.components)
  .filter((component) => !only.size || only.has(component.id))
  .map((component) => ({ id: component.id, cards: component.examples.filter((example) => example.kind === 'gallery') }))
  .filter((gallery) => gallery.cards.length)

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  let file = path.startsWith(base) ? join(dist, path.slice(base.length)) : ''
  if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!file || !file.startsWith(dist) || !existsSync(file)) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`

// `CHROMIUM_PATH` points at a browser installed outside Playwright's cache (a container with a pinned Chromium).
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const failures = []
let written = 0

async function capture(gallery, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' })
  // The site resolves its theme from localStorage before first paint (Main.astro).
  await context.addInitScript((value) => localStorage.setItem('c2n-theme', value), theme)
  const page = await context.newPage()
  try {
    await page.goto(`${origin}${base}components/${gallery.id}/gallery`, { waitUntil: 'networkidle' })
    const figures = page.locator('figure.example[data-label]:not(.example--offscreen)')
    const labels = await figures.evaluateAll((nodes) => nodes.map((node) => node.dataset.label))
    // The registry reads the same MDX in the same order; a mismatch means the page and the registry disagree, and a
    // wrong picture is worse than none.
    if (labels.length !== gallery.cards.length || labels.some((label, index) => label !== gallery.cards[index].label)) {
      failures.push(`${gallery.id}: page shows ${labels.length} cards, registry lists ${gallery.cards.length}; skipped`)
      return
    }
    mkdirSync(join(dist, 'gallery-shots', gallery.id), { recursive: true })
    for (const [index, card] of gallery.cards.entries()) {
      const canvas = figures.nth(index).locator('.example__canvas')
      await canvas.scrollIntoViewIfNeeded()
      // Islands hydrate on load or when visible; wait until every c2 element in the card is defined.
      await canvas
        .evaluate(
          (node) =>
            new Promise((done) => {
              const ready = () => ![...node.querySelectorAll('*')].some((el) => el.localName.startsWith('c2-') && !customElements.get(el.localName))
              const deadline = Date.now() + 5000
              const poll = () => (ready() || Date.now() > deadline ? requestAnimationFrame(() => done()) : setTimeout(poll, 50))
              poll()
            }),
        )
        .catch(() => {})
      await canvas.screenshot({ path: join(dist, 'gallery-shots', gallery.id, `${card.slug}.${theme}.png`), animations: 'disabled' })
      written++
    }
  } catch (error) {
    failures.push(`${gallery.id} (${theme}): ${error instanceof Error ? error.message.split('\n')[0] : error}`)
  } finally {
    await context.close()
  }
}

const queue = galleries.flatMap((gallery) => themes.map((theme) => () => capture(gallery, theme)))
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length) await queue.shift()()
  }),
)
await browser.close()
server.close()

console.log(`[gallery-shots] ${written} screenshots of ${galleries.length} galleries → ${join(dist, 'gallery-shots')}`)
if (failures.length) console.warn(`[gallery-shots] ${failures.length} problem(s):\n  ${failures.join('\n  ')}`)
