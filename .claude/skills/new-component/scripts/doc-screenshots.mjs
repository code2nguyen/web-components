#!/usr/bin/env node
// Screenshots one component's pages in the built docs site, in the light and the dark theme, for a visual review
// before a pull request. Run `pnpm run ui:build` first; this serves `apps/ui/dist` with `astro preview` itself.
//
//   node .claude/skills/new-component/scripts/doc-screenshots.mjs <component-id> [--press "<button name>"]… [--port 4321]
//
// Writes test-results/doc-screenshots/<id>/: docs-usage-<theme>.png, gallery-<theme>.png, api.png, landing-card.png,
// pressed-<n>.png for each --press (the usage card after clicking the first button with that accessible name),
// aria.txt (accessibility snapshot of the usage card, then the buttons in it by accessible name, and after each
// --press the buttons it brought up anywhere on the page) and report.json. Exits 1 on a page error or a console
// error, and 2 when the port is already taken: another worktree's preview would otherwise be what gets screenshotted.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
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

/** Whether something already accepts connections on the port, over IPv4 or IPv6 (`localhost` may be either). */
function portTaken(host) {
  return new Promise((done) => {
    const socket = connect({ host, port })
    socket.setTimeout(1000)
    socket.once('connect', () => (socket.destroy(), done(true)))
    socket.once('timeout', () => (socket.destroy(), done(false)))
    socket.once('error', () => done(false))
  })
}

if ((await portTaken('127.0.0.1')) || (await portTaken('::1'))) {
  // astro preview would move to the next free port and keep running in the background, while this script
  // screenshotted whichever server answers here (another worktree's build).
  console.error(`[doc-screenshots] port ${port} is already in use; stop that server or pass --port <free port>`)
  process.exit(2)
}

// Its own process group, so stopping it also stops the node process pnpm starts for astro.
// Astro 7 moves `preview` to the background when it detects an AI coding agent: the command exits at once and the
// server outlives this script. `ASTRO_PREVIEW_BACKGROUND` is the variable Astro sets for that background process, so
// setting it keeps the server in the foreground, where this script can wait on it and stop it.
const preview = spawn('pnpm', ['exec', 'astro', 'preview', '--port', String(port)], {
  cwd: join(root, 'apps/ui'),
  stdio: 'ignore',
  detached: true,
  env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: '1' },
})
let previewExited = false
preview.once('exit', () => (previewExited = true))
function stop() {
  if (previewExited || preview.pid === undefined) return
  try {
    process.kill(-preview.pid, 'SIGTERM')
  } catch {
    preview.kill('SIGTERM')
  }
  previewExited = true
}
process.on('exit', stop)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
  process.on(signal, () => {
    stop()
    process.exit(130)
  })
for (const event of ['uncaughtException', 'unhandledRejection'])
  process.on(event, (error) => {
    console.error(`[doc-screenshots] ${error?.stack ?? error}`)
    stop()
    process.exit(1)
  })

async function reachable(url) {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (previewExited) throw new Error('astro preview exited before it answered; run pnpm run ui:build first')
    if (await reachable(`${base}/`)) return
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`astro preview did not answer on ${base}; run pnpm run ui:build first`)
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
  // The init script also runs in every frame, and a frame of a PDF or a sandbox has no storage: not a page error.
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('c2n-theme', value)
    } catch {
      // no storage in this frame
    }
  }, theme)
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  // Islands hydrate and gallery cards upgrade after network idle.
  await page.waitForTimeout(800)
  return page
}

/**
 * One line per button under `scope` (`- button "Name"`), by Playwright's role query, which pierces shadow roots and
 * sees a popover in the top layer: the usage canvas's ariaSnapshot leaves those buttons out.
 */
async function buttons(scope) {
  const lines = []
  for (const button of await scope.getByRole('button').all()) {
    try {
      lines.push((await button.ariaSnapshot({ timeout: 2000 })).split('\n')[0])
    } catch {
      // detached while we read it
    }
  }
  return lines
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
    const canvas = usage.locator('.usage__canvas')
    const aria = [await canvas.ariaSnapshot(), '', '# Buttons in the usage canvas (getByRole, shadow roots and top layer included)', ...(await buttons(canvas))]
    for (const [index, name] of presses.entries()) {
      const before = new Set(await buttons(page))
      await page.getByRole('button', { name }).first().click()
      await page.waitForTimeout(400)
      await shot(page, `pressed-${index + 1}.png`)
      // What the press brought up (a menu or a popover in the top layer), wherever it is in the page.
      const opened = (await buttons(page)).filter((line) => !before.has(line))
      aria.push('', `# Buttons shown after pressing "${name}" (pressed-${index + 1}.png)`, ...(opened.length ? opened : ['(none new)']))
      await page.keyboard.press('Escape')
    }
    writeFileSync(join(out, 'aria.txt'), `${aria.join('\n')}\n`)
  }
  await page.close()

  if (hasGallery) {
    const gallery = await open(theme, `/components/${id}/gallery/`)
    // A full-page shot does not scroll, so a card that draws only once on screen (an IntersectionObserver, a live
    // feed paused off-screen) would show empty below the fold. Scroll through the page once first.
    await gallery.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
        scrollTo(0, y)
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      scrollTo(0, 0)
    })
    await gallery.waitForTimeout(400)
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
