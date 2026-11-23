// Screenshots single usage rows and gallery cards of the built docs site, in the light and the dark theme, so a fix
// made for the AI readiness score can be checked by eye: a row that looks like its neighbour, a card cut off, a
// console error. Run `pnpm run ui:build` first; this serves `apps/ui/dist` with `astro preview` itself.
//
//   node .claude/skills/ai-readiness/scripts/shots.mjs <id>[:<label>]… [--gallery] [--port 4394]
//
// `<id>` alone takes every usage row of the component's Docs page (or every gallery card with `--gallery`);
// `<id>:<label>` one row or card. Writes test-results/ai-readiness/shots/<id>--<label>.<theme>.png and prints the
// console errors per page. Exits 1 on a page error.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(join(root, 'package.json'))
const { chromium } = require('playwright')
const args = process.argv.slice(2)
const gallery = args.includes('--gallery')
const port = Number(args[args.indexOf('--port') + 1]) || 4394
const targets = args
  .filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port')
  .map((a) => {
    const [id, ...label] = a.split(':')
    return { id, label: label.join(':') || undefined }
  })
if (targets.length === 0) {
  console.error('usage: shots.mjs <id>[:<label>]… [--gallery]')
  process.exit(2)
}
const out = join(root, 'test-results/ai-readiness/shots')
mkdirSync(out, { recursive: true })
const base = `http://localhost:${port}/web-components`

// Astro 7 backgrounds `astro preview` for an AI agent unless ASTRO_PREVIEW_BACKGROUND is set: keep it in the foreground.
const preview = spawn('pnpm', ['exec', 'astro', 'preview', '--port', String(port)], {
  cwd: join(root, 'apps/ui'),
  stdio: 'ignore',
  detached: true,
  env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: '1' },
})
const stop = () => {
  try {
    process.kill(-preview.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}
process.on('exit', stop)
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${base}/`)).ok) break
  } catch {
    // not up yet
  }
  await new Promise((done) => setTimeout(done, 500))
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
let failed = false
for (const theme of ['light', 'dark']) {
  for (const { id, label } of targets) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => message.type() === 'error' && !message.text().startsWith('Failed to load resource') && errors.push(message.text()))
    await page.addInitScript((value) => {
      try {
        localStorage.setItem('c2n-theme', value)
      } catch {
        // no storage in this frame
      }
    }, theme)
    const path = gallery ? `/components/${id}/gallery/` : `/components/${id}/`
    const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' }).catch(() => null)
    if (!response?.ok()) {
      // An icon set is documented under /icons/.
      await page.goto(`${base}/icons/${id}/`, { waitUntil: 'networkidle' })
    }
    await page.waitForTimeout(1200)
    const named = label ? `[data-label=${JSON.stringify(label)}]` : '[data-label]'
    // A Docs page's usage rows, or the example frames (gallery cards, icon-page examples).
    const items = page.locator(gallery ? `figure.example${named}` : `section.usage ${named}, figure.example${named}`)
    const count = await items.count()
    if (count === 0) console.log(`${theme} ${id}: nothing matches ${label ? `"${label}"` : 'on the page'}`)
    for (let i = 0; i < count; i++) {
      const item = items.nth(i)
      const name = (await item.getAttribute('data-label')) ?? `item-${i + 1}`
      await item.scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      await item.screenshot({ path: join(out, `${id}--${name.replace(/[^a-z0-9]+/gi, '-')}.${theme}.png`) })
    }
    if (errors.length) {
      failed = true
      console.log(`${theme} ${id}: ${errors.slice(0, 3).join(' | ')}`)
    }
    await page.close()
  }
}
await browser.close()
console.log(`Screenshots in ${out}`)
stop()
process.exit(failed ? 1 : 0)
