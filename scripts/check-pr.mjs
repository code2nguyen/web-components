/**
 * `pnpm run check:pr [--fast]`: the gates of `deploy.yml` and `component-tests.yml` in one command, run before
 * opening or updating a pull request. Two things CI does that it does not: the changed component suites run in Chromium
 * only (CI also runs Firefox and WebKit: `pnpm run test:all` for those), and the gallery screenshots are not taken.
 *
 * Every step runs even after one fails, its output goes to `.check-pr/<step>.log` (not under `test-results/`, which
 * Playwright empties when the browser step starts), and the run ends with one table of results and timings; the exit
 * code is 1 when any step failed. `--fast` skips the builds and the browser suites; the registry and the size check
 * still rebuild whatever their wireit graphs find stale, so it is quicker, not build-free.
 *
 * "Generated files" regenerates what CI regenerates and fails when a generated path then differs from HEAD (modified
 * or new), as CI's `git diff --exit-code` would: commit what the generators wrote before pushing.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const fast = process.argv.includes('--fast')
// Not under test-results/: Playwright empties that folder when the browser step starts.
const logDir = join(root, '.check-pr')
// Emptied first, so a log left by an earlier run never reads as this run's result.
rmSync(logDir, { recursive: true, force: true })
mkdirSync(logDir, { recursive: true })

/** Every path deploy.yml and component-tests.yml regenerate and diff with `git diff --exit-code`; keep it in step with them. */
const GENERATED = [
  ':(glob)packages/components/*/custom-elements.json',
  ':(glob)packages/icons/*/custom-elements.json',
  'packages/umbrella',
  'packages/tools/skill/skills',
  'packages/tools/skill/.claude-plugin',
  'packages/tools/skill/.mcp.json',
  'packages/tools/skill/plugin.json',
  'packages/tools/skill/mcp.json',
  'packages/tools/framework-types/tsconfig.vue.json',
  ':(glob)packages/*/*/react.d.ts',
  ':(glob)packages/*/*/vue.d.ts',
  'scripts/data/slot-styling-audit.json',
  'lab/GAPS.md',
]
/** Generated paths that differ from HEAD (modified or untracked), as CI's `git diff --exit-code` sees them after regenerating. */
const generatedChanges = () =>
  spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...GENERATED], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.trim()

/** [name, command, { build?, browser?, generated? }]: a build or browser step is skipped under --fast; a generated step is followed by the HEAD comparison. */
const STEPS = [
  ['build', 'pnpm run build', { build: true }],
  ['build umbrella', 'pnpm --dir packages/umbrella run build', { build: true }],
  ['ui:build', 'pnpm run ui:build', { build: true }],
  ['build:tools', 'pnpm run build:tools', { build: true }],
  ['lint', 'pnpm run lint'],
  ['format:check', 'pnpm run format:check'],
  ['test:type-check', 'pnpm run test:type-check'],
  ['script unit tests', 'node --test scripts/*.test.mjs'],
  ['check:css-contracts', 'pnpm run check:css-contracts'],
  ['check:component-template', 'pnpm run check:component-template'],
  ['check:bundle-size', 'pnpm run check:bundle-size'],
  ['check:example-theme', 'pnpm run check:example-theme'],
  ['docs:check', 'pnpm run docs:check'],
  ['check:dogfood', 'pnpm run check:dogfood'],
  ['check:agent-docs', 'pnpm run check:agent-docs'],
  // What reachability, app markup, the lab and the gap matrix read: rebuilt even with --fast, as component-tests.yml does
  // (its wireit graph rebuilds a component package whose sources changed, so --fast is not build-free).
  ['build:registry', 'pnpm --dir packages/tools/mcp run build:registry'],
  ['check:reachability', 'pnpm run check:reachability'],
  ['check:app-markup', 'pnpm run check:app-markup'],
  ['lab readiness', 'node lab/scripts/readiness.mjs --check'],
  ['mcp tests', 'pnpm --dir packages/tools/mcp test'],
  ['skill installer tests', 'pnpm --dir packages/tools/skill test'],
  ['theme generator tests', 'pnpm --dir packages/tools/theme test'],
  ['mcp:smoke', 'pnpm run mcp:smoke'],
  ['generated files', 'node scripts/generate-slot-styling-audit.mjs && node lab/scripts/gaps.mjs > /dev/null', { generated: true }],
  ['changed component suites', 'pnpm test', { browser: true }],
]

const results = []
for (const [name, command, options = {}] of STEPS) {
  if (fast && (options.build || options.browser)) {
    results.push({ name, status: 'skipped', seconds: 0 })
    continue
  }
  process.stdout.write(`[check:pr] ${name} … `)
  const started = Date.now()
  const run = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 1 << 28 })
  let ok = run.status === 0
  let output = `$ ${command}\n${run.stdout ?? ''}${run.stderr ?? ''}`
  // A step that could not start, overflowed its buffer or was killed has no output of its own to explain it.
  if (run.error || run.signal) output += `\n${run.error?.message ?? ''}${run.signal ? ` (killed by ${run.signal})` : ''}\n`
  // Checked whatever the step's own exit code: the builds before it may have rewritten a generated file too.
  const changes = options.generated ? generatedChanges() : ''
  if (changes) {
    ok = false
    output += `\nGenerated paths differ from HEAD after regenerating (uncommitted edits of your own count too), which fails CI:\ncommit what the generators wrote.\n${changes}\n`
  }
  const log = join(logDir, `${name.replace(/[^a-z0-9]+/gi, '-')}.log`)
  mkdirSync(logDir, { recursive: true })
  writeFileSync(log, output)
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({ name, status: ok ? 'ok' : 'FAILED', seconds, log })
  console.log(`${ok ? 'ok' : 'FAILED'} (${seconds}s)`)
}

console.log('\n| Step | Result | Time |\n| --- | --- | ---: |')
for (const { name, status, seconds } of results) console.log(`| ${name} | ${status} | ${seconds}s |`)
const failed = results.filter(({ status }) => status === 'FAILED')
if (failed.length) {
  console.log(`\n${failed.length} step(s) failed. Logs:`)
  for (const { log } of failed) console.log(`  ${log.slice(root.length + 1)}`)
  process.exitCode = 1
} else console.log(`\nAll ${results.filter(({ status }) => status === 'ok').length} steps passed${fast ? ' (--fast: builds and browser suites skipped)' : ''}.`)
