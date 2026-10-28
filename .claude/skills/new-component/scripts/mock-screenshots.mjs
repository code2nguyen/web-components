#!/usr/bin/env node
// Screenshots a design mock (design-mocks/<name>.html, ignored by Git) in the light and the dark theme, so a complex
// component's look is reviewed, and shown to the user, before it is built. Serves the repo with the test Vite server
// (tests/vite.config.ts), which resolves every @c2n/* import to source, so a mock can use the real elements it composes.
//
//   node .claude/skills/new-component/scripts/mock-screenshots.mjs <name> [--init] [--mobile] [--port 4175]
//
// --init copies the template to design-mocks/<name>.html when there is none yet. Writes test-results/design-mocks/<name>/:
// <state>-<theme>.png for each <section data-mock="State">, page-<theme>.png, page-mobile.png with --mobile (390px wide,
// light), and report.json. Exits 1 on a page error, a console error or a mock with no data-mock section.
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const args = process.argv.slice(2)
const name = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--port')
if (!name) {
  console.error('usage: mock-screenshots.mjs <name> [--init] [--mobile] [--port 4175]')
  process.exit(2)
}
const flag = (option) => args.includes(`--${option}`)
const portIndex = args.indexOf('--port')
const port = Number(portIndex >= 0 ? args[portIndex + 1] : 4175)
const mock = join(root, 'design-mocks', `${name}.html`)

if (flag('init')) {
  if (existsSync(mock)) {
    console.log(`[mock-screenshots] ${mock} already exists; left as is`)
  } else {
    mkdirSync(join(root, 'design-mocks'), { recursive: true })
    const template = join(root, '.claude/skills/new-component/templates/mock.html')
    copyFileSync(template, mock)
    writeFileSync(mock, readFileSync(mock, 'utf8').replaceAll('__NAME__', name))
    console.log(`[mock-screenshots] wrote ${mock}; draw the states, then run without --init`)
  }
  process.exit(0)
}
if (!existsSync(mock)) {
  console.error(`[mock-screenshots] no ${mock}; start one with --init`)
  process.exit(2)
}
if (!existsSync(join(root, 'packages/tools/theme/dist/theme.css'))) {
  console.warn(
    '[mock-screenshots] packages/tools/theme/dist/theme.css is missing (npm run build -w packages/tools/theme): the tokens fall back to their light literals',
  )
}

const base = `http://127.0.0.1:${port}`
const out = join(root, 'test-results/design-mocks', name)
mkdirSync(out, { recursive: true })

async function reachable(url) {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

// Reuse a running test server (npm run test:serve); otherwise start one and stop it at the end.
let server
if (!(await reachable(`${base}/tests/health.html`))) {
  // The Vite binary itself, not npx: killing npx would leave its Vite child holding the port.
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--config', 'tests/vite.config.ts', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  })
  process.on('exit', () => server.kill())
  let up = false
  for (let attempt = 0; attempt < 60 && !up; attempt++) {
    up = await reachable(`${base}/tests/health.html`)
    if (!up) await new Promise((done) => setTimeout(done, 500))
  }
  if (!up) throw new Error(`the test Vite server did not answer on ${base}`)
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const shots = []
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'state'

async function open(theme, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme })
  page.on('pageerror', (error) => errors.push(`${theme}: ${error.message}`))
  page.on(
    'console',
    (message) => message.type() === 'error' && !message.text().startsWith('Failed to load resource') && errors.push(`${theme} console: ${message.text()}`),
  )
  // A missing stylesheet or module is an error; the favicon the browser asks for is not.
  page.on(
    'response',
    (response) => response.status() >= 400 && !response.url().endsWith('/favicon.ico') && errors.push(`${theme}: ${response.status()} ${response.url()}`),
  )
  await page.goto(`${base}/design-mocks/${name}.html`, { waitUntil: 'networkidle' })
  // colorScheme covers the tokens' prefers-color-scheme fallback; data-theme is what an app sets.
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
  // Composed c2-* elements upgrade after the module graph loads.
  await page.waitForTimeout(600)
  return page
}

let states = 0
for (const theme of ['light', 'dark']) {
  const page = await open(theme, 1280)
  const sections = page.locator('section[data-mock]')
  states = await sections.count()
  const seen = new Map()
  for (let index = 0; index < states; index++) {
    const section = sections.nth(index)
    const label = slug((await section.getAttribute('data-mock')) ?? '')
    const count = (seen.get(label) ?? 0) + 1
    seen.set(label, count)
    const file = `${count > 1 ? `${label}-${count}` : label}-${theme}.png`
    await section.screenshot({ path: join(out, file) })
    shots.push(file)
  }
  await page.screenshot({ path: join(out, `page-${theme}.png`), fullPage: true })
  shots.push(`page-${theme}.png`)
  await page.close()
}
if (flag('mobile')) {
  const page = await open('light', 390)
  await page.screenshot({ path: join(out, 'page-mobile.png'), fullPage: true })
  shots.push('page-mobile.png')
  await page.close()
}

await browser.close()
server?.kill()
if (!states) errors.push('no <section data-mock="…"> in the mock')
writeFileSync(join(out, 'report.json'), JSON.stringify({ name, states, shots, errors }, null, 2))
console.log(`[mock-screenshots] ${shots.length} screenshots in ${out}`)
if (errors.length) {
  console.error(`[mock-screenshots] ${errors.length} errors:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
process.exit(0)
