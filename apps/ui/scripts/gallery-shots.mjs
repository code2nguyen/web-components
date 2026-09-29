#!/usr/bin/env node
/**
 * Walks every gallery card of the built docs site in the light and the dark theme. Two jobs share the walk:
 *
 * - **Screenshots** (default): a PNG per card and theme at the paths the `@c2n/mcp` registry already names
 *   (`gallery-shots/<component>/<slug>.<theme>.png`), so an agent that reads images can see a look before choosing
 *   it. `deploy.yml` writes them into `apps/ui/dist/` for GitHub Pages; they are never committed or shipped in npm.
 * - **Audit** (`--audit`): checks a person would otherwise have to eyeball on 700 cards — text contrast (axe-core's
 *   `color-contrast`, which reads into shadow roots), tags that never registered, cards that render nothing, content
 *   wider than its frame, and console errors on the page. The findings go to `test-results/gallery-audit/`
 *   (`report.json`, `report.md`) and are compared with `apps/ui/gallery-audit.known.json`, the problems that predate
 *   the audit: a finding not on that list fails the run, and so does an entry that no longer occurs (delete it). Like
 *   the dogfood list, it only shrinks.
 *
 * The audit is opt-in (slow: the whole site is built first): `.github/workflows/gallery-audit.yml` runs it from the
 * Actions tab or on a PR labelled `gallery-audit`, and `.claude/skills/gallery-audit` tells an agent how to run it.
 *
 * Runs after `npm run ui:build` (it serves `apps/ui/dist/`) and `npm run build:tools` (the registry lists each
 * component's cards, in page order, with their slugs).
 *
 *   node apps/ui/scripts/gallery-shots.mjs [--audit] [--no-shots] [--shots-dir <dir>] [component-id…]
 */
import { chromium } from '@playwright/test'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const uiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(uiRoot, '../..')
const dist = join(uiRoot, 'dist')
const registryFile = join(repoRoot, 'packages/tools/mcp/data/registry.json')
const knownFile = join(uiRoot, 'gallery-audit.known.json')
const reportDir = join(repoRoot, 'test-results/gallery-audit')
const base = '/web-components/'
const themes = ['light', 'dark']
const concurrency = 4

const args = process.argv.slice(2)
const audit = args.includes('--audit')
const shots = !args.includes('--no-shots')
const shotsDirIndex = args.indexOf('--shots-dir')
const shotsDir = shotsDirIndex >= 0 ? resolve(args[shotsDirIndex + 1]) : join(dist, 'gallery-shots')
const only = new Set(args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--shots-dir'))

if (!existsSync(join(dist, 'index.html'))) throw new Error('apps/ui/dist is missing: run `npm run ui:build` first')
if (!existsSync(registryFile)) throw new Error('The MCP registry is missing: run `npm run build:tools` first')

const registry = JSON.parse(readFileSync(registryFile, 'utf8'))
const galleries = Object.values(registry.components)
  .filter((component) => !only.size || only.has(component.id))
  .map((component) => ({ id: component.id, cards: component.examples.filter((example) => example.kind === 'gallery') }))
  .filter((gallery) => gallery.cards.length)
const axeSource = audit ? readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8') : ''

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}
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
/** @type {{ key: string, gallery: string, card: string, label: string, theme: string, kind: string, detail: string }[]} */
const issues = []
/** Text nodes axe could not judge, per card: reported as a total, never failed. */
const unmeasuredTotal = []
let written = 0

function report(gallery, card, theme, kind, detail) {
  const slug = card?.slug ?? '*'
  issues.push({ key: `${gallery.id}/${slug}/${theme}/${kind}`, gallery: gallery.id, card: slug, label: card?.label ?? '', theme, kind, detail })
}

/** Resolves once every c2 element in the card is defined (islands hydrate on load or when visible), or after 5s. */
const waitForElements = (node) =>
  new Promise((done) => {
    const ready = () => ![...node.querySelectorAll('*')].some((el) => el.localName.startsWith('c2-') && !customElements.get(el.localName))
    const deadline = Date.now() + 5000
    const poll = () => (ready() || Date.now() > deadline ? requestAnimationFrame(() => done()) : setTimeout(poll, 50))
    poll()
  })

/** Structural checks on one card: what never registered, whether anything rendered, whether it fits its frame. */
const inspectCard = (canvas) => {
  const unregistered = [
    ...new Set([...canvas.querySelectorAll('*')].map((el) => el.localName).filter((tag) => tag.startsWith('c2-') && !customElements.get(tag))),
  ]
  const content = [...canvas.children].filter((el) => !['style', 'script', 'template'].includes(el.localName))
  const painted = (el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width >= 1 && rect.height >= 1) return true
    // `display: contents` hosts have no box of their own; their children do.
    return getComputedStyle(el).display === 'contents' && [...el.children, ...(el.shadowRoot?.children ?? [])].some(painted)
  }
  return {
    unregistered,
    empty: content.length > 0 && !content.some(painted),
    overflow: canvas.scrollWidth - canvas.clientWidth > 1 ? `${canvas.scrollWidth}px of content in a ${canvas.clientWidth}px frame` : '',
  }
}

/** axe-core's `color-contrast` over every card of the page, attributed back to the card it sits in. */
const contrastByCard = async () => {
  const canvases = [...document.querySelectorAll('figure.example[data-label]:not(.example--offscreen) .example__canvas')]
  const result = await globalThis.axe.run(
    { include: canvases },
    { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations', 'incomplete'], elementRef: true },
  )
  const byCard = {}
  const unmeasured = {}
  // Text axe could not measure (over an image, a gradient the card paints, overlapping elements) is counted, not
  // failed: a count that grows is the sign a check has gone blind, as it had over the canvas pattern.
  for (const node of result.incomplete.flatMap((entry) => entry.nodes)) {
    let el = node.element
    while (el && !canvases.includes(el)) el = el.parentElement ?? el.getRootNode()?.host
    if (el) unmeasured[canvases.indexOf(el)] = (unmeasured[canvases.indexOf(el)] ?? 0) + 1
  }
  for (const node of result.violations.flatMap((violation) => violation.nodes)) {
    let el = node.element
    while (el && !canvases.includes(el)) el = el.parentElement ?? el.getRootNode()?.host
    if (!el) continue
    const index = canvases.indexOf(el)
    const data = node.any[0]?.data ?? {}
    // A failing node inside a shadow root is often a wrapper whose text is slotted in: climb to the first ancestor
    // (across hosts) that has some, so the finding says which words are hard to read.
    let named = node.element
    while (named && !(named.textContent ?? '').trim()) named = named.parentElement ?? named.getRootNode()?.host
    const text = (named?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    ;(byCard[index] ??= []).push(
      `"${text}" ${data.fgColor ?? '?'} on ${data.bgColor ?? '?'} = ${data.contrastRatio ?? '?'}:1 (needs ${data.expectedContrastRatio ?? '4.5:1'})`,
    )
  }
  return { byCard, unmeasured }
}

async function walk(gallery, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' })
  // The site resolves its theme from localStorage before first paint (Main.astro).
  await context.addInitScript((value) => localStorage.setItem('c2n-theme', value), theme)
  const page = await context.newPage()
  const consoleErrors = new Set()
  page.on('console', (message) => message.type() === 'error' && consoleErrors.add(message.text().slice(0, 200)))
  page.on('pageerror', (error) => consoleErrors.add(`uncaught: ${error.message.slice(0, 200)}`))
  try {
    await page.goto(`${origin}${base}components/${gallery.id}/gallery`, { waitUntil: 'networkidle' })
    const figures = page.locator('figure.example[data-label]:not(.example--offscreen)')
    const labels = await figures.evaluateAll((nodes) => nodes.map((node) => node.dataset.label))
    // The registry reads the same MDX in the same order; a mismatch means the page and the registry disagree, and a
    // wrong picture is worse than none.
    if (labels.length !== gallery.cards.length || labels.some((label, index) => label !== gallery.cards[index].label)) {
      report(gallery, undefined, theme, 'mismatch', `page shows ${labels.length} cards, registry lists ${gallery.cards.length}`)
      return
    }
    if (shots) mkdirSync(join(shotsDir, gallery.id), { recursive: true })
    for (const [index, card] of gallery.cards.entries()) {
      const canvas = figures.nth(index).locator('.example__canvas')
      await canvas.scrollIntoViewIfNeeded()
      await canvas.evaluate(waitForElements).catch(() => {})
      if (shots) {
        await canvas.screenshot({ path: join(shotsDir, gallery.id, `${card.slug}.${theme}.png`), animations: 'disabled' })
        written++
      }
      if (!audit) continue
      const found = await canvas.evaluate(inspectCard)
      if (found.unregistered.length) report(gallery, card, theme, 'unregistered', found.unregistered.join(', '))
      if (found.empty) report(gallery, card, theme, 'empty', 'no content with a visible box')
      if (found.overflow) report(gallery, card, theme, 'overflow', found.overflow)
    }
    if (audit) {
      // The canvas dots are a background gradient, and axe cannot measure text over a gradient: it reports every such
      // node as "incomplete" and passes it. Contrast is judged against the canvas colour, so the pattern goes.
      await page.addStyleTag({ content: '.example__canvas { background-image: none !important; }' })
      await page.addScriptTag({ content: axeSource })
      const { byCard, unmeasured } = await page.evaluate(contrastByCard)
      for (const [index, count] of Object.entries(unmeasured))
        unmeasuredTotal.push({ gallery: gallery.id, card: gallery.cards[Number(index)].slug, theme, count })
      for (const [index, failures] of Object.entries(byCard)) {
        report(gallery, gallery.cards[Number(index)], theme, 'contrast', `${failures.length} text node(s): ${failures.slice(0, 3).join('; ')}`)
      }
      if (consoleErrors.size) report(gallery, undefined, theme, 'console', [...consoleErrors].slice(0, 3).join(' | '))
    }
  } catch (error) {
    report(gallery, undefined, theme, 'crash', error instanceof Error ? error.message.split('\n')[0] : String(error))
  } finally {
    await context.close()
  }
}

const queue = galleries.flatMap((gallery) => themes.map((theme) => () => walk(gallery, theme)))
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length) await queue.shift()()
  }),
)
await browser.close()
server.close()

if (shots) console.log(`[gallery-shots] ${written} screenshots of ${galleries.length} galleries → ${shotsDir}`)

if (!audit) {
  if (issues.length) console.warn(`[gallery-shots] ${issues.length} problem(s):\n  ${issues.map((issue) => `${issue.key}: ${issue.detail}`).join('\n  ')}`)
} else {
  const known = existsSync(knownFile) ? JSON.parse(readFileSync(knownFile, 'utf8')) : {}
  const audited = new Set(galleries.map((gallery) => gallery.id))
  const found = new Set(issues.map((issue) => issue.key))
  const fresh = issues.filter((issue) => !(issue.key in known))
  // Only entries for the galleries this run looked at can be stale; a filtered run says nothing about the rest.
  const stale = Object.keys(known).filter((key) => audited.has(key.split('/')[0]) && !found.has(key))
  const line = (issue) => `- \`${issue.key}\` ${issue.label ? `(${issue.label}) ` : ''}— ${issue.detail}`
  const markdown = [
    `## Gallery audit`,
    '',
    `${galleries.length} galleries, ${galleries.reduce((n, g) => n + g.cards.length, 0)} cards, light and dark: ${issues.length} finding(s), ${fresh.length} new, ${issues.length - fresh.length} known, ${stale.length} fixed.`,
    `Contrast not measurable (text over an image, a gradient or overlapping boxes): ${unmeasuredTotal.reduce((n, entry) => n + entry.count, 0)} text node(s) in ${unmeasuredTotal.length} card view(s).`,
    ...(fresh.length ? ['', '### New', ...fresh.map(line)] : []),
    ...(stale.length ? ['', '### Fixed: delete from `apps/ui/gallery-audit.known.json`', ...stale.map((key) => `- \`${key}\``)] : []),
  ].join('\n')
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(
    join(reportDir, 'report.json'),
    JSON.stringify({ issues, fresh: fresh.map((issue) => issue.key), stale, unmeasured: unmeasuredTotal }, null, 2) + '\n',
  )
  writeFileSync(join(reportDir, 'report.md'), markdown + '\n')
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n')
  console.log(markdown)
  if (fresh.length || stale.length) {
    console.error(
      `\n[gallery-audit] ${fresh.length} new finding(s), ${stale.length} fixed entr${stale.length === 1 ? 'y' : 'ies'}. Fix the card, or delete fixed entries from apps/ui/gallery-audit.known.json. Add a new entry only for a problem you are deliberately deferring, with the reason as its value.`,
    )
    process.exitCode = 1
  }
}
