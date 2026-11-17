/**
 * The component lab's data for the /lab pages, read at build time from the repository's lab/ directory: run records
 * (`labRuns`), specs (`labSpecs`), build reports (`labReports`) and the capability vocabulary. Everything here is a
 * view of files the lab writes; the site never runs the lab. lab/README.md documents the formats.
 */
import { getCollection, type CollectionEntry } from 'astro:content'
import capabilitiesMarkdown from '../../../../lab/capabilities.md?raw'
import { LAB_OUTCOMES } from '../schemas'

export type LabRun = CollectionEntry<'labRuns'>['data']
export type LabOutcome = (typeof LAB_OUTCOMES)[number]

export const REPOSITORY = 'https://github.com/code2nguyen/web-components'
export const SIZE_LABELS = { scenario: 'Scenario', feature: 'Feature', app: 'App' } as const
export const SIZE_ORDER = ['scenario', 'feature', 'app'] as const

/** Outcome colours for `c2-table` status columns and badges; the same palette everywhere on the lab pages. */
export const OUTCOME_OPTIONS = [
  { value: 'met', label: 'Met', color: '#16a34a', glyph: '✓' },
  { value: 'workaround', label: 'Workaround', color: '#d97706', glyph: '~' },
  { value: 'hand-rolled', label: 'Hand-rolled', color: '#dc2626', glyph: '✎' },
  { value: 'failed', label: 'Failed', color: '#7f1d1d', glyph: '✕' },
  { value: 'not-built', label: 'Not built', color: '#a1a1aa', glyph: '○' },
]
export const OUTCOME_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  met: 'success',
  workaround: 'warning',
  'hand-rolled': 'danger',
  failed: 'danger',
}

export interface Requirement {
  id: string
  tags: string[]
  text: string
}

export interface Task {
  id: string
  title: string
  requirements: string[]
}

export interface ReportRow {
  outcome: string
  components: string[]
  notes: string
}

/** `- R1 [tag, tag] text` lines, with the indented lines that continue them. */
export function parseRequirements(body: string): Requirement[] {
  const requirements: Requirement[] = []
  let current: Requirement | undefined
  for (const line of body.split('\n')) {
    const start = /^- (R\d+) \[([^\]]+)\] (.*)$/.exec(line)
    if (start) {
      current = { id: start[1], tags: start[2].split(',').map((tag) => tag.trim()), text: start[3].trim() }
      requirements.push(current)
    } else if (current && /^\s{2,}\S/.test(line)) {
      current.text += ` ${line.trim()}`
    } else {
      current = undefined
    }
  }
  return requirements
}

/** `### T1 · Title (R1, R2)` headings. */
export function parseTasks(body: string): Task[] {
  return [...body.matchAll(/^### (T\d+) · (.+?)(?: \(([^)]*)\))?$/gm)].map((match) => ({
    id: match[1],
    title: match[2].trim(),
    requirements: (match[3] ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  }))
}

/** A build report's `| R1 | outcome | components | notes |` rows. */
export function parseReportRows(body: string): Map<string, ReportRow> {
  const rows = new Map<string, ReportRow>()
  for (const line of body.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length < 5 || !/^R\d+$/.test(cells[1])) continue
    rows.set(cells[1], {
      outcome: cells[2].replace(/[^a-z-]/g, ''),
      components: [...cells[3].matchAll(/c2-[a-z0-9-]+|@c2n\/[a-z0-9-]+/g)].map((match) => match[0]),
      notes: cells[4].replace(/`/g, ''),
    })
  }
  return rows
}

/** The capability vocabulary: tag → group and description. */
export const capabilities: Map<string, { group: string; description: string }> = (() => {
  const map = new Map<string, { group: string; description: string }>()
  let group = ''
  for (const line of capabilitiesMarkdown.split('\n')) {
    if (line.startsWith('## ')) group = line.slice(3).trim()
    const entry = /^- `([a-z0-9.-]+)`:\s*(.*)$/.exec(line)
    if (entry) map.set(entry[1], { group, description: entry[2] })
  }
  return map
})()

/** Everything the lab pages need, gathered once per build. */
export async function loadLab() {
  const [specEntries, reportEntries, runEntries, componentEntries] = await Promise.all([
    getCollection('labSpecs'),
    getCollection('labReports'),
    getCollection('labRuns'),
    getCollection('components'),
  ])

  const runs = runEntries.map((entry) => entry.data).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const latestByTarget = new Map<string, LabRun>()
  for (const run of runs) latestByTarget.set(run.target, run)

  const reports = reportEntries.map((entry) => ({ ...entry.data, id: entry.id, rows: parseReportRows(entry.body ?? '') }))

  const specs = specEntries
    .map((entry) => {
      const body = entry.body ?? ''
      const builds = entry.data.directions.map((direction) => {
        const report = reports.find((candidate) => candidate.spec === entry.data.id && candidate.direction === direction)
        const target = report?.target
        return { direction, report, target, latestRun: target ? latestByTarget.get(target) : undefined }
      })
      return {
        ...entry.data,
        path: entry.filePath ?? `lab/specs/${entry.data.size}s/${entry.data.id}.md`,
        requirements: parseRequirements(body),
        tasks: parseTasks(body),
        purpose: /## Purpose\n\n([\s\S]*?)\n\n/.exec(body)?.[1].replace(/\n/g, ' ') ?? '',
        builds,
        runs: runs.filter((run) => run.spec === entry.data.id),
      }
    })
    .sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size) || a.id.localeCompare(b.id))

  // Gap matrix: every report row adds its outcome to each capability its requirement carries.
  const byCapability = new Map<string, { specs: Set<string>; counts: Record<LabOutcome, number>; components: Set<string>; short: string[] }>()
  for (const report of reports) {
    const spec = specs.find((candidate) => candidate.id === report.spec)
    if (!spec) continue
    for (const [id, row] of report.rows) {
      const requirement = spec.requirements.find((candidate) => candidate.id === id)
      for (const tag of requirement?.tags ?? []) {
        const entry = byCapability.get(tag) ?? {
          specs: new Set(),
          counts: { met: 0, workaround: 0, 'hand-rolled': 0, failed: 0 },
          components: new Set(),
          short: [],
        }
        entry.specs.add(spec.id)
        if (row.outcome in entry.counts) entry.counts[row.outcome as LabOutcome]++
        row.components.forEach((component) => entry.components.add(component))
        if (row.outcome !== 'met') entry.short.push(`${spec.id} ${id}`)
        byCapability.set(tag, entry)
      }
    }
  }
  const shortfall = (counts: Record<LabOutcome, number>) => counts.failed * 3 + counts['hand-rolled'] * 2 + counts.workaround
  const gapRows = [...byCapability]
    .map(([tag, entry]) => ({
      capability: tag,
      group: capabilities.get(tag)?.group ?? '',
      specs: entry.specs.size,
      met: entry.counts.met,
      workaround: entry.counts.workaround,
      handRolled: entry.counts['hand-rolled'],
      failed: entry.counts.failed,
      shortfall: shortfall(entry.counts),
      components: [...entry.components].join(', '),
      short: entry.short.join(', '),
    }))
    .sort((a, b) => b.shortfall - a.shortfall || a.capability.localeCompare(b.capability))

  const requiredTags = new Set(specs.flatMap((spec) => spec.requirements.flatMap((requirement) => requirement.tags)))
  const builtTags = new Set(byCapability.keys())

  // Doc pages by element tag, so a finding or a report row can link to its component.
  const docPages = new Map<string, string>()
  for (const entry of componentEntries) {
    docPages.set(entry.data.tag ?? `c2-${entry.id}`, entry.id)
    for (const tag of entry.data.apiTags ?? []) if (!docPages.has(tag)) docPages.set(tag, entry.id)
  }

  // Open findings: what the latest run of every target still sees, reproducible, grouped by component.
  const openFindings = [...latestByTarget.values()]
    .flatMap((run) => run.findings.filter((finding) => finding.reproducible).map((finding) => ({ ...finding, target: run.target, runId: run.id })))
    .sort((a, b) => (a.component ?? '~').localeCompare(b.component ?? '~') || a.key.localeCompare(b.key))

  return {
    specs,
    runs,
    latestByTarget,
    gapRows,
    openFindings,
    docPages,
    coverage: {
      capabilities: capabilities.size,
      required: requiredTags.size,
      built: builtTags.size,
      unbuilt: [...requiredTags].filter((tag) => !builtTags.has(tag)).sort(),
    },
  }
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** "34/34 journeys" style summary of a run. */
export const passSummary = (run: LabRun) => `${run.summary.passed}/${run.summary.journeys}`

/** GitHub link to a file of the repository. */
export const repoFile = (path: string) => `${REPOSITORY}/blob/develop/${path.replace(/^.*?(lab\/)/, '$1')}`
