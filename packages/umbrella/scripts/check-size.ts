/**
 * Guards the size of the built `@c2n/components` bundle against accidents: a dependency that stops being external
 * (Lit, ECharts or CodeMirror inlined into a shared chunk), a component pulled into another one's import graph, or a
 * module duplicated across chunks. Each shows up as a jump in what an entry costs to load.
 *
 * For every entry in `dist/` it measures the entry plus every chunk it reaches through static imports (what a page
 * pays to import it; dynamic `import()`s are lazy and left out), gzipped, and compares it with the committed
 * `size-budget.json`. `lazy` budgets the rest of `dist/`: the chunks only a dynamic `import()` reaches (map outlines,
 * editor languages), which no entry's closure counts. `index` re-exports every entry, so adding a component grows
 * `index` and its own entry but never `lazy`; that keeps the budget free of a line every component PR would edit.
 * A budget may grow by GROWTH_RATIO plus GROWTH_SLACK bytes before the check fails. A new entry with no budget yet is
 * reported, not failed.
 *
 *   node scripts/check-size.ts            check against the budget
 *   node scripts/check-size.ts --add      record the entries that have no budget yet, leaving the others alone
 *   node scripts/check-size.ts --update   rewrite the whole budget from the current build (commit it with the change)
 *
 * Plain node on Node 24 type stripping, so keep this to erasable TypeScript syntax only.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

interface Budget {
  lazy: number
  entries: Record<string, number>
}

const GROWTH_RATIO = 0.1
const GROWTH_SLACK = 2048

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(packageDir, 'dist')
const budgetFile = join(packageDir, 'size-budget.json')
const update = process.argv.includes('--update')
const add = process.argv.includes('--add')

if (!existsSync(distDir)) throw new Error('dist/ is missing: run `npm run build -w packages/umbrella` first')

const jsFiles = (readdirSync(distDir, { recursive: true }) as string[]).map((file) => file.split(sep).join('/')).filter((file) => file.endsWith('.js'))
const entries = jsFiles.filter((file) => !file.startsWith('chunks/') && !file.startsWith('types/')).sort()

const gzipped = new Map<string, number>()
const sizeOf = (file: string) => {
  let size = gzipped.get(file)
  if (size === undefined) gzipped.set(file, (size = gzipSync(readFileSync(join(distDir, file)), { level: 9 }).length))
  return size
}

/** The relative modules `file` imports statically, as paths inside `dist/`. */
function staticImports(file: string): string[] {
  const source = readFileSync(join(distDir, file), 'utf8')
  const statements = /^\s*(?:import|export)\b[^;'"]*?(?:from\s*)?['"](\.{1,2}\/[^'"]+)['"]/gm
  return [...source.matchAll(statements)].map(([, specifier]) =>
    relative(distDir, resolve(dirname(join(distDir, file)), specifier))
      .split(sep)
      .join('/'),
  )
}

/** Gzipped bytes of `entry` and everything it reaches through static imports. */
function closureSize(entry: string): number {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    queue.push(...staticImports(file))
  }
  return [...seen].reduce((sum, file) => sum + sizeOf(file), 0)
}

const total = jsFiles.filter((file) => !file.startsWith('types/')).reduce((sum, file) => sum + sizeOf(file), 0)
const currentEntries = Object.fromEntries(entries.map((entry) => [entry.slice(0, -'.js'.length), closureSize(entry)]))
if (currentEntries.index === undefined) throw new Error('dist/index.js is missing: the lazy budget is measured against it')
const current: Budget = { lazy: total - currentEntries.index, entries: currentEntries }

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`
const write = (budget: Budget) => writeFileSync(budgetFile, `${JSON.stringify(budget, null, 2)}\n`)

if (update) {
  write(current)
  console.log(`[@c2n/components] size budget written: ${entries.length} entries, ${kb(current.lazy)} lazy, ${kb(total)} gzipped in total`)
  process.exit(0)
}

if (!existsSync(budgetFile)) throw new Error('size-budget.json is missing: run `node scripts/check-size.ts --update`')
const budget = JSON.parse(readFileSync(budgetFile, 'utf8')) as Budget

if (add) {
  const missing = Object.keys(current.entries).filter((name) => budget.entries[name] === undefined)
  const merged = { ...budget.entries, ...Object.fromEntries(missing.map((name) => [name, current.entries[name]])) }
  write({
    lazy: budget.lazy,
    entries: Object.fromEntries(
      Object.keys(merged)
        .sort()
        .map((name) => [name, merged[name]]),
    ),
  })
  console.log(`[@c2n/components] size budget: ${missing.length > 0 ? `added ${missing.join(', ')}` : 'no new entries'}`)
  process.exit(0)
}
const allowed = (baseline: number) => Math.round(baseline * (1 + GROWTH_RATIO) + GROWTH_SLACK)

const failures: string[] = []
const added: string[] = []
const rows: string[] = []
for (const [name, size] of Object.entries(current.entries)) {
  const baseline = budget.entries[name]
  if (baseline === undefined) {
    added.push(`${name} (${kb(size)})`)
    continue
  }
  if (size > allowed(baseline)) failures.push(`${name}: ${kb(size)}, budget ${kb(baseline)} (+${Math.round((size / baseline - 1) * 100)}%)`)
  if (size !== baseline) rows.push(`| ${name} | ${kb(baseline)} | ${kb(size)} | ${size > baseline ? '+' : ''}${kb(size - baseline)} |`)
}
if (current.lazy > allowed(budget.lazy)) failures.push(`lazy chunks: ${kb(current.lazy)}, budget ${kb(budget.lazy)}`)

const largest = Object.entries(current.entries)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([name, size]) => `${name} ${kb(size)}`)
console.log(
  `[@c2n/components] ${entries.length} entries, ${kb(total)} gzipped in total, ${kb(current.lazy)} lazy (budget ${kb(budget.lazy)}). Largest: ${largest.join(', ')}`,
)
if (added.length > 0) console.log(`New entries without a budget (run \`npm run size:add -w packages/umbrella\` to record them): ${added.join(', ')}`)

if (process.env.GITHUB_STEP_SUMMARY && rows.length > 0) {
  const table = ['### @c2n/components bundle size', '', '| Entry | Budget | Now | Change |', '| --- | ---: | ---: | ---: |', ...rows, ''].join('\n')
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`)
}

if (failures.length > 0) {
  console.error(`\nBundle size grew past its budget (+${GROWTH_RATIO * 100}% and ${kb(GROWTH_SLACK)} allowed):\n  ${failures.join('\n  ')}`)
  console.error('\nLook for a dependency that is no longer external or a component that now imports another one.')
  console.error('If the growth is intended, run `npm run size:update -w packages/umbrella` and commit size-budget.json.')
  process.exit(1)
}
