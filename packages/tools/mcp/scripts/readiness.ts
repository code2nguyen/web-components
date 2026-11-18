/**
 * AI readiness report: `npm run readiness -w packages/tools/mcp [-- <component ids…>] [--min <score>]`.
 *
 * Scores every component in `data/registry.json` (what `@c2n/mcp` serves an agent) on the six dimensions of
 * `readiness/score.ts`, runs the discovery benchmark of `readiness/tasks.json` against `search_components`, and folds
 * in the last agent run (`readiness:agent`) when there is one. Writes `test-results/ai-readiness/report.{json,md}` at
 * the repository root and prints the summary. `--min` exits 1 when the library score is below it.
 *
 * Needs the root build (manifests, framework declarations) and the registry: `npm run build && npm run build:tools`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRegistry } from '../src/registry.ts'
import { DIMENSIONS, grade, runDiscovery, scoreComponent, type ComponentReadiness, type Sources, type Task } from './readiness/score.ts'
import type { AgentReport } from './readiness/agent-types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../../..')
const outDir = join(repoRoot, 'test-results/ai-readiness')

// ---------------------------------------------------------------------------------------------------------------------
// Sources: the files an agent's tooling reads besides the registry

function packageDirs(): Map<string, string> {
  const dirs = new Map<string, string>()
  for (const group of ['packages/components', 'packages/icons', 'open-packages']) {
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
  agent?: AgentReport
}

function build(only: string[]): ReadinessReport {
  const registry = loadRegistry()
  const sources = fileSources()
  const components = Object.values(registry.components)
    .filter((c) => only.length === 0 || only.includes(c.id))
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
    agent,
  }
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
    ...report.discovery.tasks.filter((t) => t.rank !== 1).map((t) => `| ${t.requirement} | ${t.expect.join(', ')} | ${t.rank ?? '—'} | ${t.top.join(', ')} |`),
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

function main() {
  const args = process.argv.slice(2)
  const minIndex = args.indexOf('--min')
  const min = minIndex >= 0 ? Number(args[minIndex + 1]) : undefined
  const only = args.filter((a, i) => !a.startsWith('--') && (minIndex < 0 || i !== minIndex + 1))
  const report = build(only)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(outDir, 'report.md'), markdown(report))

  console.log(`AI readiness — c2n ${report.c2nVersion}\n`)
  console.log(`  AI READINESS         ${bar(report.overall)} ${report.overall}/100 (${report.overallGrade})\n`)
  console.log(`  Component readiness  ${bar(report.score)} ${report.score}/100 (${report.grade}) over ${report.components.length} components`)
  console.log(
    `  Discovery            ${bar(report.discovery.score)} ${report.discovery.score}/100 (hit@1 ${pct(report.discovery.hitAt1)}, hit@3 ${pct(report.discovery.hitAt3)}, ${report.discovery.tasks.length} requirements)`,
  )
  if (report.agent)
    console.log(`  Agent                ${bar(report.agent.score)} ${report.agent.score}/100 (${report.agent.passed}/${report.agent.tasks.length} tasks)`)
  console.log('')
  for (const d of report.dimensions) console.log(`  ${d.label.padEnd(24)} ${String(d.weight).padStart(3)}%  ${bar(d.score)} ${d.score}`)
  console.log(
    `\n  Grades: ${Object.entries(report.grades)
      .map(([g, n]) => `${g} ${n}`)
      .join('  ')}`,
  )
  console.log('\n  Weakest checks (library points lost):')
  for (const w of report.weakest.slice(0, 6))
    console.log(`    ${w.pointsLost.toFixed(2).padStart(5)}  ${w.dimension} · ${w.label} (${w.components} components)`)
  console.log(
    `\n  Lowest: ${report.components
      .slice(0, 8)
      .map((c) => `${c.id} ${c.score}`)
      .join(', ')}`,
  )
  console.log(`\n  Report: ${join(outDir, 'report.md')}`)
  if (min !== undefined && report.score < min) {
    console.error(`\nComponent readiness ${report.score} is below --min ${min}.`)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
