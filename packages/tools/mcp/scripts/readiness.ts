/**
 * AI readiness: `npm run readiness -w packages/tools/mcp [-- --full] [--fail-on-regression] [--min <score>] [ids…]`.
 *
 * Scores the components in `data/registry.json` (what `@c2n/mcp` serves an agent) on the six dimensions of
 * `readiness/score.ts`, runs the discovery benchmark of `readiness/tasks.json` against `search_components`, and folds
 * in the last agent run (`readiness:agent`). Results are committed in `packages/tools/mcp/readiness/`:
 *
 * - `baseline.json`: the last run, per component and check, with the commit it measured.
 * - `report.md`: the last full run (`--full`, or when there is no baseline or the scoring code changed).
 * - `changes.md`: the last changed-only run (the default): the components new or modified since the baseline's commit
 *   (their package outside `test/`, docs page or gallery, committed or not), each compared with its last score. Their
 *   new scores go into the baseline; the other components keep theirs.
 *
 * The registry is rebuilt first (`--no-registry` skips it), so build the changed packages before running: their
 * manifests are what is scored. `--fail-on-regression` exits 1 when a scored component lost points; `--min` when the
 * library score is below it.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRegistry } from '../src/registry.ts'
import type { Registry } from '../src/registry-types.ts'
import { DIMENSIONS, grade, runDiscovery, scoreComponent, type ComponentReadiness, type Sources, type Task } from './readiness/score.ts'
import type { AgentReport } from './readiness/agent-types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../../..')
const packageRoot = resolve(here, '..')
/** Committed: the baseline, the last full report, the last changed-only comparison and the last agent run. */
const outDir = join(packageRoot, 'readiness')

// ---------------------------------------------------------------------------------------------------------------------
// Sources: the files an agent's tooling reads besides the registry

function packageDirs(): Map<string, string> {
  const dirs = new Map<string, string>()
  for (const group of ['packages/components', 'packages/icons']) {
    const base = join(repoRoot, group)
    if (!existsSync(base)) continue
    for (const name of readdirSync(base)) {
      const file = join(base, name, 'package.json')
      if (existsSync(file)) dirs.set((JSON.parse(readFileSync(file, 'utf8')) as { name: string }).name, join(base, name))
    }
  }
  return dirs
}

function walk(dir: string, test: (file: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, test, out)
    else if (test(entry.name)) out.push(path)
  }
  return out
}

function fileSources(): Sources {
  const dirs = packageDirs()
  const accessors = join(repoRoot, 'packages/adapters/angular/src/value-accessors.ts')
  const angularTags = new Set(existsSync(accessors) ? [...readFileSync(accessors, 'utf8').matchAll(/(c2-[a-z0-9-]+)\[ngModel\]/g)].map((m) => m[1]) : [])
  const declared = new Map<string, Set<string>>()
  return {
    frameworkFile(pkg, framework) {
      const dir = dirs.get(pkg)
      const file = dir && join(dir, `${framework}.d.ts`)
      return file && existsSync(file) ? readFileSync(file, 'utf8') : null
    },
    angularTags,
    declaredTags(pkg) {
      if (!declared.has(pkg)) {
        const tags = new Set<string>()
        const dir = dirs.get(pkg)
        for (const file of dir ? walk(join(dir, 'types'), (n) => n.endsWith('.d.ts')) : []) {
          const text = readFileSync(file, 'utf8')
          const map = text.indexOf('HTMLElementTagNameMap')
          if (map < 0) continue
          for (const m of text.slice(map).matchAll(/['"](c2-[a-z0-9-]+)['"]\s*:/g)) tags.add(m[1])
        }
        declared.set(pkg, tags)
      }
      return declared.get(pkg)!
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Report

export interface ReadinessReport {
  c2nVersion: string
  /**
   * 0–100, the headline: component readiness 70% and discovery 30%; with an agent run, 50% / 20% and the agent's 30%,
   * since the agent run is the only part that measures the whole question end to end.
   */
  overall: number
  overallGrade: string
  /** 0–100: mean of the component scores. */
  score: number
  grade: string
  components: ComponentReadiness[]
  dimensions: { id: string; label: string; weight: number; question: string; score: number }[]
  grades: Record<string, number>
  /** Checks costing the library the most points, summed over components. */
  weakest: { dimension: string; check: string; label: string; components: number; pointsLost: number }[]
  discovery: ReturnType<typeof runDiscovery>
  /** The same measure over the requirements of the component lab's builds (`readiness/lab.ts`); not in the headline. */
  lab: ReturnType<typeof runDiscovery>
  /** The same measure over `readiness/heldout.json`, written blind and never tuned against; not in the headline. */
  heldout: ReturnType<typeof runDiscovery>
  agent?: AgentReport
}

function build(only: string[], subset: boolean, labRequirements: Task[], heldout: ReturnType<typeof runDiscovery>): ReadinessReport {
  const registry = loadRegistry()
  const sources = fileSources()
  const components = Object.values(registry.components)
    .filter((c) => (!subset && only.length === 0) || only.includes(c.id))
    .map((c) => scoreComponent(registry, c, sources))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
  const n = components.length || 1
  const score = Math.round((components.reduce((s, c) => s + c.score, 0) / n) * 10) / 10
  const dimensions = DIMENSIONS.map((d) => ({
    ...d,
    score: Math.round((components.reduce((s, c) => s + c.dimensions.find((x) => x.id === d.id)!.score, 0) / n) * 1000) / 10,
  }))
  const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const c of components) grades[c.grade]++
  const lost = new Map<string, { dimension: string; check: string; label: string; components: number; pointsLost: number }>()
  for (const c of components)
    for (const d of c.dimensions) {
      const total = d.checks.reduce((s, x) => s + x.weight, 0)
      for (const x of d.checks) {
        if (x.score >= 1) continue
        const key = `${d.id}/${x.id}`
        const entry = lost.get(key) ?? { dimension: d.label, check: x.id, label: x.label, components: 0, pointsLost: 0 }
        entry.components++
        entry.pointsLost += ((1 - x.score) * x.weight * d.weight) / total
        lost.set(key, entry)
      }
    }
  const weakest = [...lost.values()]
    .map((w) => ({ ...w, pointsLost: Math.round((w.pointsLost / n) * 100) / 100 }))
    .sort((a, b) => b.pointsLost - a.pointsLost)
    .slice(0, 12)
  const tasks = (JSON.parse(readFileSync(join(here, 'readiness/tasks.json'), 'utf8')) as { tasks: Task[] }).tasks
  const agentFile = join(outDir, 'agent.json')
  const agent = existsSync(agentFile) ? (JSON.parse(readFileSync(agentFile, 'utf8')) as AgentReport) : undefined
  const discovery = runDiscovery(registry, tasks)
  const lab = runDiscovery(registry, labRequirements)
  const overall = Math.round((agent ? score * 0.5 + discovery.score * 0.2 + agent.score * 0.3 : score * 0.7 + discovery.score * 0.3) * 10) / 10
  return {
    c2nVersion: registry.c2nVersion,
    overall,
    overallGrade: grade(overall),
    score,
    grade: grade(score),
    components,
    dimensions,
    grades,
    weakest,
    discovery,
    lab,
    heldout,
    agent,
  }
}

/** The held-out requirements (`readiness/heldout.json`): their words were never seen by whoever tunes the search. */
function heldoutTasks(): Task[] {
  return (JSON.parse(readFileSync(join(here, 'readiness/heldout.json'), 'utf8')) as { tasks: Task[] }).tasks
}

/** The held-out result as the baseline stores it, with the set it was measured on: a score on another set is not comparable. */
function heldoutSummary(heldout: ReturnType<typeof runDiscovery>): Baseline['heldout'] {
  const set = createHash('sha256')
    // By id and answer, order-free: a reordered file or a fixed typo is the same set.
    .update(JSON.stringify(heldout.tasks.map((t) => JSON.stringify([t.id, t.expect])).sort()))
    .digest('hex')
    .slice(0, 12)
  return { score: heldout.score, hitAt1: round(heldout.hitAt1 * 100), hitAt3: round(heldout.hitAt3 * 100), tasks: heldout.tasks.length, set }
}

/** The held-out figure of a changes.md headline: its move since `before`, or "new set" when `before` measured another set. */
export function heldoutFigure(now: NonNullable<Baseline['heldout']>, before: Baseline['heldout']): string {
  if (!before) return ` · held-out ${now.score} (new)`
  // A baseline written before sets were recorded cannot say which set it measured.
  const same = before.set !== undefined && before.set === now.set
  return ` · held-out ${now.score} (${same ? signed(round(now.score - before.score)) : 'new set'})`
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const bar = (score: number, width = 20) => '█'.repeat(Math.round((score / 100) * width)).padEnd(width, '░')

function markdown(report: ReadinessReport): string {
  const lines = [
    `# AI readiness — c2n ${report.c2nVersion}`,
    '',
    '> Given a user requirement, can an AI independently find the correct c2n component, understand its API, generate valid code and use it correctly?',
    '',
    `## AI readiness: ${report.overall}/100 (${report.overallGrade})`,
    '',
    report.agent
      ? 'Component readiness 50% · discovery 20% · agent run 30%.'
      : 'Component readiness 70% · discovery 30% (run `readiness:agent` to add the end-to-end agent score).',
    '',
    `**Component readiness: ${report.score}/100 (${report.grade})** over ${report.components.length} components · **Discovery: ${report.discovery.score}/100** (hit@1 ${pct(report.discovery.hitAt1)}, hit@3 ${pct(report.discovery.hitAt3)} over ${report.discovery.tasks.length} requirements)` +
      (report.agent ? ` · **Agent: ${report.agent.score}/100** (${report.agent.passed}/${report.agent.tasks.length} tasks)` : ''),
    '',
    '## Dimensions',
    '',
    '| Dimension | Weight | Score | |',
    '| --- | ---: | ---: | --- |',
    ...report.dimensions.map((d) => `| ${d.label} — ${d.question} | ${d.weight}% | ${d.score} | \`${bar(d.score)}\` |`),
    '',
    `Grades: ${Object.entries(report.grades)
      .map(([g, n]) => `${g} ${n}`)
      .join(' · ')}`,
    '',
    '## Where the points go',
    '',
    'Library points lost per check (averaged over components). Fix the top rows first.',
    '',
    '| Dimension | Check | Components | Points lost |',
    '| --- | --- | ---: | ---: |',
    ...report.weakest.map((w) => `| ${w.dimension} | ${w.label} | ${w.components} | ${w.pointsLost} |`),
    '',
    '## Discovery misses',
    '',
    'Requirements where `search_components` did not rank an expected component first.',
    '',
    '| Requirement | Expected | Rank | Top 3 |',
    '| --- | --- | ---: | --- |',
    ...report.discovery.tasks
      .filter((t) => t.rank !== 1)
      .map((t) => `| ${t.requirement.replace(/\|/g, '\\|')} | ${t.expect.join(', ')} | ${t.rank ?? '—'} | ${t.top.join(', ')} |`),
    ...heldoutMarkdown(report.heldout),
    ...labMarkdown(report.lab),
  ]
  if (report.agent) {
    lines.push(
      '',
      '## Agent run',
      '',
      `${report.agent.model ?? 'default model'}, ${report.agent.date}. A task passes when the code uses an expected tag and attribute and \`validate_markup\` finds no error.`,
      '',
      '| Task | Found | Valid | Correct | c2n tool calls | Notes |',
      '| --- | :-: | :-: | :-: | ---: | --- |',
      ...report.agent.tasks.map(
        (t) => `| ${t.id} | ${t.found ? '✓' : '✗'} | ${t.valid ? '✓' : '✗'} | ${t.correct ? '✓' : '✗'} | ${t.tools.length} | ${t.notes.join('; ')} |`,
      ),
    )
  }
  lines.push('', '## Components (lowest first)', '', '| Component | Score | ' + DIMENSIONS.map((d) => d.label.split(' ')[0]).join(' | ') + ' |')
  lines.push('| --- | ---: | ' + DIMENSIONS.map(() => '---:').join(' | ') + ' |')
  for (const c of report.components) lines.push(`| ${c.id} | ${c.score} ${c.grade} | ${c.dimensions.map((d) => Math.round(d.score * 100)).join(' | ')} |`)
  lines.push('', '## Details (lowest 25)', '')
  for (const c of report.components.slice(0, 25)) {
    lines.push(`### ${c.id} — ${c.score} (${c.grade})`, '')
    for (const d of c.dimensions) for (const x of d.checks) if (x.score < 1) lines.push(`- **${d.label} · ${x.label}** (${pct(x.score)}): ${x.detail ?? ''}`)
    lines.push('')
  }
  return lines.join('\n') + '\n'
}

/** `report.md` with its "Lab requirements" section replaced by `lines` (inserted before the components table when missing). */
export function withLabSection(text: string, lines: string[]): string {
  const block = lines.join('\n').replace(/^\n+/, '') + '\n\n'
  const start = text.search(/^## Lab requirements$/m)
  if (start >= 0) {
    const end = text.indexOf('\n## ', start + 1)
    // The last section of the file ends in one newline, not a blank line.
    return end >= 0
      ? text.slice(0, start) + (lines.length ? block : '') + text.slice(end + 1)
      : `${text.slice(0, start)}${lines.length ? block : ''}`.trimEnd() + '\n'
  }
  const agent = text.search(/^## Agent run$/m)
  const anchor = agent >= 0 ? agent : text.search(/^## Components \(lowest first\)$/m)
  if (!lines.length) return text
  return anchor >= 0 ? text.slice(0, anchor) + block + text.slice(anchor) : `${text.trimEnd()}\n\n${block.trimEnd()}\n`
}

/**
 * The held-out discovery section: numbers only. Its misses are deliberately not listed, since a list of misses is what
 * someone would tune against.
 */
function heldoutMarkdown(heldout: ReturnType<typeof runDiscovery>): string[] {
  return [
    '',
    '## Held-out requirements',
    '',
    `Requirements written by an agent that never saw the components or the search (\`readiness/heldout.json\`), searched the same way: **${heldout.score}/100** (hit@1 ${pct(heldout.hitAt1)}, hit@3 ${pct(heldout.hitAt3)} over ${heldout.tasks.length} requirements). Not part of the headline, and its misses are deliberately not listed: it measures whether a change to the search, the keywords or the intents generalizes, which it stops doing once anyone tunes against it. A gain on the discovery benchmark above with none here is overfitting.`,
  ]
}

/** `report.md` with its "Held-out requirements" section replaced by `lines` (inserted before the lab section when missing). */
export function withHeldoutSection(text: string, lines: string[]): string {
  const block = lines.join('\n').replace(/^\n+/, '') + '\n\n'
  const start = text.search(/^## Held-out requirements$/m)
  if (start >= 0) {
    const end = text.indexOf('\n## ', start + 1)
    return end >= 0 ? text.slice(0, start) + block + text.slice(end + 1) : `${text.slice(0, start)}${block}`.trimEnd() + '\n'
  }
  const anchor = [/^## Lab requirements$/m, /^## Agent run$/m, /^## Components \(lowest first\)$/m].map((re) => text.search(re)).find((i) => i >= 0)
  return anchor !== undefined ? text.slice(0, anchor) + block + text.slice(anchor) : `${text.trimEnd()}\n\n${block.trimEnd()}\n`
}

/** The held-out result in the working tree's baseline (a run not yet committed included), else the committed one. */
function heldoutOnDisk(previous: Baseline | undefined): Baseline['heldout'] {
  const file = join(outDir, 'baseline.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Baseline).heldout : previous?.heldout
}

/** The lab discovery section: the requirements of real builds, worded for a product rather than for the benchmark. */
function labMarkdown(lab: ReturnType<typeof runDiscovery>, afterFullRun = false): string[] {
  if (lab.tasks.length === 0) return []
  return [
    '',
    '## Lab requirements',
    '',
    `The requirements the component lab's builds met with c2n components (\`lab/specs\` for the words, \`lab/reports\` for the components the build used), searched the same way: **${lab.score}/100** (hit@1 ${pct(lab.hitAt1)}, hit@3 ${pct(lab.hitAt3)} over ${lab.tasks.length} requirements). Not part of the headline: nobody tuned the search for these words, so a miss here is a word developers use that the docs do not.${afterFullRun ? " Measured by a later changed run than the rest of this report: a lab file or a component's docs moved it." : ''}`,
    '',
    '| Requirement | Build used | Rank | Top 3 |',
    '| --- | --- | ---: | --- |',
    ...lab.tasks
      .filter((t) => t.rank !== 1)
      .map((t) => `| ${t.id.slice(4)}: ${t.requirement.replace(/\|/g, '\\|')} | ${t.expect.join(', ')} | ${t.rank ?? '—'} | ${t.top.join(', ')} |`),
  ]
}

// ---------------------------------------------------------------------------------------------------------------------
// Baseline: the last run, kept in the repository

export interface BaselineComponent {
  score: number
  grade: string
  /** Dimension id → 0–100. */
  dimensions: Record<string, number>
  /** `dimension/check` → 0–100, for the checks that lose points; any other check passed in full. */
  checks: Record<string, number>
}

export interface Baseline {
  /** The commit the scores measure (the working tree on top of it may have been included). */
  commit: string
  c2nVersion: string
  overall: number
  score: number
  dimensions: Record<string, number>
  grades: Record<string, number>
  discovery: { score: number; hitAt1: number; hitAt3: number; tasks: number }
  /** Discovery over the component lab's requirements; not in `overall`. */
  lab?: { score: number; hitAt1: number; hitAt3: number; tasks: number }
  /** Discovery over the held-out requirements (`readiness/heldout.json`); not in `overall`. `set` identifies the set. */
  heldout?: { score: number; hitAt1: number; hitAt3: number; tasks: number; set?: string }
  agent?: { score: number; passed: number; tasks: number; date: string; model?: string }
  components: Record<string, BaselineComponent>
}

const round = (value: number) => Math.round(value * 10) / 10

export function toBaselineComponent(c: ComponentReadiness): BaselineComponent {
  const checks: Record<string, number> = {}
  // Only the checks that lose points: a check missing from the baseline passed in full.
  for (const d of c.dimensions) for (const x of d.checks) if (x.score < 1) checks[`${d.id}/${x.id}`] = round(x.score * 100)
  return { score: c.score, grade: c.grade, dimensions: Object.fromEntries(c.dimensions.map((d) => [d.id, round(d.score * 100)])), checks }
}

/** Library score, dimensions and grades from per-component results. */
export function aggregate(components: Record<string, BaselineComponent>): Pick<Baseline, 'score' | 'dimensions' | 'grades'> {
  const all = Object.values(components)
  const n = all.length || 1
  const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const c of all) grades[c.grade]++
  return {
    score: round(all.reduce((sum, c) => sum + c.score, 0) / n),
    dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d.id, round(all.reduce((sum, c) => sum + (c.dimensions[d.id] ?? 0), 0) / n)])),
    grades,
  }
}

/** What changed for one component since the baseline: points, and the checks that got better or worse. */
export function compare(before: BaselineComponent | undefined, now: BaselineComponent): { delta: number | null; fixed: string[]; worse: string[] } {
  if (!before) return { delta: null, fixed: [], worse: [] }
  const keys = new Set([...Object.keys(before.checks), ...Object.keys(now.checks)])
  const fixed: string[] = []
  const worse: string[] = []
  for (const key of keys) {
    const was = before.checks[key] ?? 100
    const is = now.checks[key] ?? 100
    if (is > was) fixed.push(key)
    else if (is < was) worse.push(key)
  }
  return { delta: round(now.score - before.score), fixed, worse }
}

/** Files whose change can move every score: the scoring itself, the registry builder and what the MCP server serves. */
const SCORING = [
  // Not the benchmark (tasks.json) nor the lab reader (lab.ts), which never feed a component score; not the call log.
  /^packages\/tools\/mcp\/scripts\/(readiness\/(?!tasks\.json|heldout\.json|lab\.ts)|readiness\.ts|build-registry\.ts|frontmatter\.ts|usage\.ts|gallery\.ts)/,
  /^packages\/tools\/mcp\/src\/(?!call-log\.ts)/,
  // Everything else build-registry reads into what an agent is served: previews, the theme tokens, the skill's guides.
  /^apps\/ui\/src\/data\/component-(presets|previews)\.ts$/,
  /^packages\/tools\/theme\/src\//,
  /^packages\/tools\/skill\/skills\/c2n-components\/references\/(?!component-catalog\.md)/,
]

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
}

/**
 * The components changed since `commit`, committed or not: their package (outside its tests), docs page or gallery.
 * `full` names the file that makes every score move, when one changed. The lab requirements are not decided here: the
 * run compares their result with the committed one, whatever moved it.
 */
export function changedComponents(registry: Registry, commit: string, files?: string[]): { ids: Set<string>; full?: string } {
  const changed =
    files ?? [...git(['diff', '--name-only', commit]).split('\n'), ...git(['ls-files', '--others', '--exclude-standard']).split('\n')].filter(Boolean)
  const full = changed.find((file) => SCORING.some((pattern) => pattern.test(file)))
  const byDirectory = new Map([...packageDirs()].map(([name, dir]) => [dir.slice(repoRoot.length + 1), name]))
  const ids = new Set<string>()
  for (const file of changed) {
    const docs = /^apps\/ui\/src\/content\/(?:components|gallery|icons)\/([a-z0-9-]+)\.mdx$/.exec(file)
    if (docs && registry.components[docs[1]]) ids.add(docs[1])
    const pkg = /^(packages\/(?:components|icons)\/[a-z0-9-]+)\/(.*)$/.exec(file)
    if (pkg && !pkg[2].startsWith('test/')) {
      const name = byDirectory.get(pkg[1])
      for (const c of Object.values(registry.components)) if (c.package === name) ids.add(c.id)
    }
  }
  return { ids, full }
}

/**
 * The commit to compare against: the one that committed the baseline, which holds the changes the baseline measured
 * (a run is committed together with them). Without a committed baseline, the commit the baseline measured.
 */
function referenceCommit(baseline: Baseline): string {
  const committed = git(['log', '-1', '--format=%H', '--', 'packages/tools/mcp/readiness/baseline.json']).trim()
  return committed || baseline.commit
}

/**
 * The last run that was kept: the committed baseline. A run rewrites the working copy, so comparing with that would
 * hide a regression on the second run; until the baseline is committed, every run compares with the committed one.
 */
function readBaseline(): Baseline | undefined {
  try {
    return JSON.parse(git(['show', 'HEAD:packages/tools/mcp/readiness/baseline.json'])) as Baseline
  } catch {
    const file = join(outDir, 'baseline.json')
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Baseline) : undefined
  }
}

function writeBaseline(baseline: Baseline): void {
  // One line per component, sorted, so a run's diff shows exactly the components it changed.
  const { components, ...summary } = baseline
  const head = JSON.stringify(summary, null, 2).replace(/\n}$/, '')
  const rows = Object.entries(components)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, c]) => `    ${JSON.stringify(id)}: ${JSON.stringify(c)}`)
  writeFileSync(join(outDir, 'baseline.json'), `${head},\n  "components": {\n${rows.join(',\n')}\n  }\n}\n`)
}

function headline(report: ReadinessReport, merged: Pick<Baseline, 'score'>): number {
  const { discovery, agent } = report
  return round(agent ? merged.score * 0.5 + discovery.score * 0.2 + agent.score * 0.3 : merged.score * 0.7 + discovery.score * 0.3)
}

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`)

function changesMarkdown(
  commit: string,
  rows: { c: ComponentReadiness; before?: BaselineComponent; cmp: ReturnType<typeof compare> }[],
  baseline: Baseline,
  previous?: Baseline,
  full = false,
  lab?: ReturnType<typeof runDiscovery>,
): string {
  const lines = [
    `# AI readiness — changes since ${commit.slice(0, 7)}`,
    '',
    full
      ? `Full run: every component scored; the ${rows.length} whose result moved are listed. Full report: [report.md](report.md).`
      : `Scored ${rows.length} new or modified component${rows.length === 1 ? '' : 's'}; the other ${Object.keys(baseline.components).length - rows.length} keep their last score. Full report: [report.md](report.md).`,
    '',
    `**AI readiness ${baseline.overall}/100** (${previous ? signed(round(baseline.overall - previous.overall)) : 'new'}) · component readiness ${baseline.score} (${previous ? signed(round(baseline.score - previous.score)) : 'new'}) · discovery ${baseline.discovery.score}${baseline.heldout ? heldoutFigure(baseline.heldout, previous?.heldout) : ''}${baseline.agent ? ` · agent ${baseline.agent.score}` : ''}${baseline.lab ? ` · lab requirements ${baseline.lab.score} (${previous?.lab ? signed(round(baseline.lab.score - previous.lab.score)) : 'new'}, ${baseline.lab.tasks} requirements)` : ''}`,
    '',
    '| Component | Score | Change | Got better | Got worse |',
    '| --- | ---: | ---: | --- | --- |',
    ...rows.map(
      ({ c, cmp }) =>
        `| ${c.id} | ${c.score} ${c.grade} | ${cmp.delta === null ? 'new' : signed(cmp.delta)} | ${cmp.fixed.join(', ') || '—'} | ${cmp.worse.join(', ') || '—'} |`,
    ),
    '',
    '## What is still missing',
    '',
  ]
  for (const { c } of rows) {
    const missing = c.dimensions.flatMap((d) =>
      d.checks.filter((x) => x.score < 1).map((x) => `- **${d.label} · ${x.label}** (${pct(x.score)}): ${x.detail ?? ''}`),
    )
    if (missing.length) lines.push(`### ${c.id} — ${c.score} (${c.grade})`, '', ...missing, '')
  }
  if (lab) lines.push(...labMarkdown(lab).slice(1))
  return lines.join('\n') + '\n'
}

function printSummary(report: ReadinessReport, merged: Baseline): void {
  console.log(`  AI READINESS         ${bar(merged.overall)} ${merged.overall}/100 (${grade(merged.overall)})\n`)
  console.log(
    `  Component readiness  ${bar(merged.score)} ${merged.score}/100 (${grade(merged.score)}) over ${Object.keys(merged.components).length} components`,
  )
  console.log(
    `  Discovery            ${bar(report.discovery.score)} ${report.discovery.score}/100 (hit@1 ${pct(report.discovery.hitAt1)}, hit@3 ${pct(report.discovery.hitAt3)}, ${report.discovery.tasks.length} requirements)`,
  )
  console.log(
    `  Held-out             ${bar(report.heldout.score)} ${report.heldout.score}/100 (hit@1 ${pct(report.heldout.hitAt1)}, hit@3 ${pct(report.heldout.hitAt3)}, ${report.heldout.tasks.length} requirements; not in the headline, never tune against it)`,
  )
  if (report.lab.tasks.length)
    console.log(
      `  Lab requirements     ${bar(report.lab.score)} ${report.lab.score}/100 (hit@1 ${pct(report.lab.hitAt1)}, hit@3 ${pct(report.lab.hitAt3)}, ${report.lab.tasks.length} requirements; not in the headline)`,
    )
  if (report.agent)
    console.log(
      `  Agent                ${bar(report.agent.score)} ${report.agent.score}/100 (${report.agent.passed}/${report.agent.tasks.length} tasks, ${report.agent.date})`,
    )
  console.log('')
  for (const d of DIMENSIONS)
    console.log(`  ${d.label.padEnd(24)} ${String(d.weight).padStart(3)}%  ${bar(merged.dimensions[d.id])} ${merged.dimensions[d.id]}`)
  console.log(
    `\n  Grades: ${Object.entries(merged.grades)
      .map(([g, n]) => `${g} ${n}`)
      .join('  ')}`,
  )
}

/**
 * The lab requirements (`readiness/lab.ts`), loaded on demand: they are a side measure, so a broken lab tree (a
 * duplicate spec id, a broken parser module) costs their section, never the run.
 */
async function loadLabTasks(registry: Registry): Promise<Task[] | undefined> {
  try {
    const { labTasks } = await import('./readiness/lab.ts')
    return labTasks(registry, repoRoot)
  } catch (error) {
    // Undefined, not empty: the committed lab result stands rather than being erased by a broken tree.
    console.warn(`Lab requirements skipped (the committed lab result is kept): ${(error as Error).message}`)
    return undefined
  }
}

/**
 * Whether the lab result differs from what the committed files show: its numbers in the baseline, or its table of
 * misses in `report.md` (a reworded requirement that still misses moves no number).
 */
function labResultDiffers(lab: ReturnType<typeof runDiscovery>, previous: Baseline | undefined): boolean {
  // Numbers and table from the same place, the working tree: a run not yet committed is what the next one compares with.
  if (JSON.stringify(labSummary(lab)) !== JSON.stringify(labOnDisk(previous))) return true
  const file = join(outDir, 'report.md')
  if (!existsSync(file)) return true
  // Line endings normalised, so a CRLF checkout finds its heading.
  const current = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const section = (text: string) => {
    const start = text.search(/^## Lab requirements$/m)
    return start < 0
      ? ''
      : text
          .slice(start)
          .split('\n## ')[0]
          .replace(/ Measured by a later changed run[^:]*: [^.]*\./, '')
  }
  return section(withLabSection(current, labMarkdown(lab))) !== section(current)
}

/** The lab result in the working tree's baseline (a run not yet committed included), else the committed one. */
function labOnDisk(previous: Baseline | undefined): Baseline['lab'] {
  const file = join(outDir, 'baseline.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Baseline).lab : previous?.lab
}

/** The lab result as the baseline stores it. */
function labSummary(lab: ReturnType<typeof runDiscovery>): Baseline['lab'] {
  return lab.tasks.length ? { score: lab.score, hitAt1: round(lab.hitAt1 * 100), hitAt3: round(lab.hitAt3 * 100), tasks: lab.tasks.length } : undefined
}

async function main() {
  const args = process.argv.slice(2)
  const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const min = value('--min') === undefined ? undefined : Number(value('--min'))
  const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--min')
  if (!args.includes('--no-registry')) execFileSync(process.execPath, [join(packageRoot, 'scripts/build-registry.ts')], { cwd: packageRoot, stdio: 'ignore' })
  const registry = loadRegistry()
  const previous = readBaseline()
  const commit = git(['rev-parse', 'HEAD']).trim()
  const since = previous ? referenceCommit(previous) : commit
  mkdirSync(outDir, { recursive: true })

  // Full when asked, without a baseline, or when the scoring itself changed; otherwise the changed components only.
  let full = args.includes('--full') ? 'asked with --full' : !previous ? 'no baseline yet' : undefined
  let ids: Set<string> | undefined
  if (!full && only.length) ids = new Set(only)
  else if (!full && previous) {
    const changed = changedComponents(registry, since)
    if (changed.full) full = `${changed.full} changed since ${since.slice(0, 7)}, and it can move every score`
    else {
      ids = changed.ids
      for (const id of Object.keys(registry.components)) if (!previous.components[id]) ids.add(id)
    }
  }

  const labRequirements = await loadLabTasks(registry)
  // Whether the lab result differs from the committed one decides, not which files changed: a lab file can change with
  // no effect (a note edited), and a registry input outside the components (component-previews.ts, the skill's guides)
  // can move it with no lab file touched.
  const labChanged = Boolean(labRequirements) && labResultDiffers(runDiscovery(registry, labRequirements), previous)
  // The held-out result moves with any docs edit (an intent, a description) and with a new heldout.json, as the lab's does.
  const heldout = runDiscovery(registry, heldoutTasks())
  const heldoutBefore = heldoutOnDisk(previous)
  const heldoutNow = heldoutSummary(heldout)!
  // A stored result from before sets were recorded counts as moved, so this run records its set.
  const heldoutMoved = JSON.stringify(heldoutBefore) !== JSON.stringify(heldoutNow)
  if (!full && ids && ids.size === 0 && !labChanged && !heldoutMoved) {
    // Nothing to score: the committed results stand, and the working tree stays clean.
    console.log(`AI readiness — c2n ${registry.c2nVersion} — no component changed since ${since.slice(0, 7)}; the committed results stand.`)
    console.log(
      `AI readiness ${previous!.overall}/100 · component readiness ${previous!.score} · discovery ${previous!.discovery.score}${previous!.agent ? ` · agent ${previous!.agent.score}` : ''}`,
    )
    return
  }
  const report = build(full ? [] : [...(ids ?? [])], !full, labRequirements ?? [], heldout)
  const scored = Object.fromEntries(report.components.map((c) => [c.id, toBaselineComponent(c)]))
  const components = full ? scored : Object.fromEntries(Object.entries({ ...previous!.components, ...scored }).filter(([id]) => registry.components[id]))
  const merged: Baseline = {
    commit,
    c2nVersion: registry.c2nVersion,
    overall: 0,
    ...aggregate(components),
    discovery: {
      score: report.discovery.score,
      hitAt1: round(report.discovery.hitAt1 * 100),
      hitAt3: round(report.discovery.hitAt3 * 100),
      tasks: report.discovery.tasks.length,
    },
    // A lab tree that failed to load keeps the last result.
    lab: labRequirements ? labSummary(report.lab) : labOnDisk(previous),
    heldout: heldoutSummary(report.heldout),
    agent: report.agent
      ? { score: report.agent.score, passed: report.agent.passed, tasks: report.agent.tasks.length, date: report.agent.date, model: report.agent.model }
      : undefined,
    components,
  }
  merged.overall = headline(report, merged)
  // Against the lab result on disk, as every other lab comparison here: an uncommitted full run already measured it.
  const labNumbersMoved = JSON.stringify(labOnDisk(previous)) !== JSON.stringify(merged.lab)
  // The table can move with no number moving (a missed requirement's rank or top 3, after a docs edit).
  const labMoved = Boolean(labRequirements) && (labChanged || labNumbersMoved || (!full && labResultDiffers(report.lab, previous)))

  const rows = report.components
    .map((c) => ({ c, before: previous?.components[c.id], cmp: compare(previous?.components[c.id], scored[c.id]) }))
    .sort((a, b) => (a.cmp.delta ?? 0) - (b.cmp.delta ?? 0) || a.c.id.localeCompare(b.c.id))
  console.log(
    `AI readiness — c2n ${registry.c2nVersion}${full ? ` — full run (${full})` : ` — ${rows.length} component(s) changed since ${since.slice(0, 7)}`}\n`,
  )
  printSummary(report, merged)

  // report.md is written by a full run, and by a changed run whose lab result moved.
  let reportRewritten = false
  if (full) {
    let text = markdown({ ...report, overall: merged.overall, overallGrade: grade(merged.overall) })
    // A lab tree that failed to load keeps its last section, as the baseline keeps its last result.
    const file = join(outDir, 'report.md')
    if (!labRequirements && existsSync(file)) {
      const old = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
      const start = old.search(/^## Lab requirements$/m)
      if (start >= 0) text = withLabSection(text, ['', ...old.slice(start).split('\n## ')[0].trimEnd().split('\n')])
    }
    writeFileSync(file, text)
    console.log('\n  Weakest checks (library points lost):')
    for (const w of report.weakest.slice(0, 6))
      console.log(`    ${w.pointsLost.toFixed(2).padStart(5)}  ${w.dimension} · ${w.label} (${w.components} components)`)
  } else if ((labMoved || heldoutMoved) && existsSync(join(outDir, 'report.md'))) {
    reportRewritten = true
    // The lab or held-out result moved (a lab file, heldout.json, or a component's docs changed): report.md's sections
    // follow baseline.json.
    const file = join(outDir, 'report.md')
    const current = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    let updated = labMoved ? withLabSection(current, labMarkdown(report.lab, true)) : current
    if (heldoutMoved) updated = withHeldoutSection(updated, heldoutMarkdown(report.heldout))
    if (updated !== current) writeFileSync(file, updated)
  }
  // A full run lists the components whose result moved; a changed run every component it scored.
  const moved = full ? rows.filter(({ cmp }) => cmp.delta !== 0 || cmp.fixed.length || cmp.worse.length) : rows
  // A run that scored no component (only the lab or held-out result moved) keeps changes.md's record of the last scored ones.
  const labOnly = !full && report.components.length === 0
  if (labOnly && existsSync(join(outDir, 'changes.md'))) {
    // Its headline still states the lab result, which this run moved: that line follows, the scored components stay.
    const file = join(outDir, 'changes.md')
    const current = readFileSync(file, 'utf8')
    const lab = merged.lab
      ? ` · lab requirements ${merged.lab.score} (${labOnDisk(previous) ? signed(round(merged.lab.score - labOnDisk(previous)!.score)) : 'new'}, ${merged.lab.tasks} requirements)`
      : ''
    // Replace the figure that moved (only that one: the other keeps its recorded change), or add it to the headline
    // when an earlier changes.md had none.
    let updated = current
    if (labMoved)
      updated = / · lab requirements /.test(updated)
        ? updated.replace(/ · lab requirements [^\n]*/, lab)
        : updated.replace(/^(\*\*AI readiness [^\n]*)$/m, `$1${lab}`)
    if (heldoutMoved && merged.heldout) {
      const figure = heldoutFigure(merged.heldout, heldoutOnDisk(previous))
      updated = / · held-out [\d.]+ \([^)]*\)/.test(updated)
        ? updated.replace(/ · held-out [\d.]+ \([^)]*\)/, figure)
        : updated.replace(/^(\*\*AI readiness [^\n]*?discovery [\d.]+)/m, `$1${figure}`)
    }
    if (updated !== current) writeFileSync(file, updated)
  }
  if (!labOnly)
    writeFileSync(
      join(outDir, 'changes.md'),
      changesMarkdown(since, moved, merged, previous, !!full, labRequirements && (full || labMoved) ? report.lab : undefined),
    )
  if (moved.length === 0) console.log(`\n  No component ${full ? 'moved' : 'changed'} since ${since.slice(0, 7)}.`)
  else console.log(`\n  ${full ? 'Moved' : 'Scored'} since ${since.slice(0, 7)}:`)
  for (const { c, cmp } of moved)
    console.log(
      `  ${(cmp.delta === null ? 'new' : signed(cmp.delta)).padStart(6)}  ${c.id.padEnd(22)} ${String(c.score).padStart(5)} ${c.grade}${cmp.worse.length ? `  worse: ${cmp.worse.join(', ')}` : ''}${cmp.fixed.length ? `  better: ${cmp.fixed.join(', ')}` : ''}`,
    )
  if (previous)
    console.log(
      `\n  Since ${since.slice(0, 7)}: AI readiness ${signed(round(merged.overall - previous.overall))}, component readiness ${signed(round(merged.score - previous.score))}`,
    )
  writeBaseline(merged)
  console.log(
    `\n  Written: ${full || reportRewritten ? `${join(outDir, 'report.md')}, ` : ''}${labOnly ? '' : `${join(outDir, 'changes.md')}, `}${join(outDir, 'baseline.json')}`,
  )

  const regressed = rows.filter(({ cmp }) => (cmp.delta ?? 0) < 0)
  if (args.includes('--fail-on-regression') && regressed.length) {
    console.error(`\nLost points: ${regressed.map(({ c, cmp }) => `${c.id} ${cmp.delta}`).join(', ')}`)
    process.exit(1)
  }
  if (min !== undefined && merged.score < min) {
    console.error(`\nComponent readiness ${merged.score} is below --min ${min}.`)
    process.exit(1)
  }
}

// A path compared as a path: a URL would percent-encode a space and never match.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
