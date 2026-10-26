#!/usr/bin/env node
// Screenshots one component's pages in the built docs site, in the light and the dark theme, for a visual review
// before a pull request. Run `npm run ui:build` first; this serves `apps/ui/dist` with `astro preview` itself.
//
//   node .claude/skills/new-component/scripts/doc-screenshots.mjs <component-id> [--press "<button name>"]… [--port 4321]
//
// Writes test-results/doc-screenshots/<id>/: docs-usage-<theme>.png, gallery-<theme>.png, api.png, landing-card.png,
// pressed-<n>.png for each --press (the usage card after clicking the first button with that accessible name),
// aria.txt (accessibility snapshot of the usage card) and report.json. Exits 1 on a page error or a console error.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const args = process.argv.slice(2)
const id = args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'))
if (!id) {
  console.error('usage: doc-screenshots.mjs <component-id> [--press "<button name>"]… [--port 4321]')
  process.exit(2)
}
const option = (name) => args.flatMap((arg, index) => (arg === `--${name}` && args[index + 1] ? [args[index + 1]] : []))
const port = Number(option('port')[0] ?? 4321)
const presses = option('press')
const base = `http://localhost:${port}/web-components`
const out = join(root, 'test-results/doc-screenshots', id)
mkdirSync(out, { recursive: true })

const preview = spawn('npx', ['astro', 'preview', '--port', String(port)], { cwd: join(root, 'apps/ui'), stdio: 'ignore' })
const stop = () => preview.kill()
process.on('exit', stop)

async function reachable(url) {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await reachable(`${base}/`)) return
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`astro preview did not answer on ${base}; run npm run ui:build first`)
}

await waitForServer()
if (!(await reachable(`${base}/components/${id}/`))) throw new Error(`no docs page at /components/${id}/`)
const hasGallery = await reachable(`${base}/components/${id}/gallery/`)

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const shots = []

async function open(theme, path) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (error) => errors.push(`${theme} ${path}: ${error.message}`))
  page.on('console', (message) => message.type() === 'error' && errors.push(`${theme} ${path} console: ${message.text()}`))
  await page.addInitScript((value) => localStorage.setItem('c2n-theme', value), theme)
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  // Islands hydrate and gallery cards upgrade after network idle.
  await page.waitForTimeout(800)
  return page
}

async function shot(target, name, options = {}) {
  await target.screenshot({ path: join(out, name), ...options })
  shots.push(name)
}

for (const theme of ['light', 'dark']) {
  const page = await open(theme, `/components/${id}/`)
  const usage = page.locator('section.usage').first()
  await usage.scrollIntoViewIfNeeded()
  await shot(usage, `docs-usage-${theme}.png`)
  if (theme === 'light') {
    writeFileSync(join(out, 'aria.txt'), await usage.locator('.usage__canvas').ariaSnapshot())
    for (const [index, name] of presses.entries()) {
      await page.getByRole('button', { name }).first().click()
      await page.waitForTimeout(400)
      await shot(page, `pressed-${index + 1}.png`)
      await page.keyboard.press('Escape')
    }
  }
  await page.close()

  if (hasGallery) {
    const gallery = await open(theme, `/components/${id}/gallery/`)
    await shot(gallery, `gallery-${theme}.png`, { fullPage: true })
    await gallery.close()
  }
}

const api = await open('light', `/components/${id}/api/`)
await shot(api, 'api.png', { fullPage: true })
await api.close()

const landing = await open('light', '/')
const card = landing.locator('c2-card', { has: landing.locator(`a[href$="/components/${id}/"], a[href$="/components/${id}"]`) }).first()
if (await card.count()) {
  await card.scrollIntoViewIfNeeded()
  await landing.waitForTimeout(800)
  await shot(card, 'landing-card.png')
}
await landing.close()

await browser.close()
stop()
writeFileSync(join(out, 'report.json'), JSON.stringify({ id, hasGallery, shots, errors }, null, 2))
console.log(`[doc-screenshots] ${shots.length} screenshots in ${out}`)
if (errors.length) {
  console.error(`[doc-screenshots] ${errors.length} errors:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
process.exit(0)
