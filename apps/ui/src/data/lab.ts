/**
 * The component lab's data for the /lab pages, read at build time from the repository's lab/ directory: run records
 * (`labRuns`), specs (`labSpecs`), build reports (`labReports`) and the capability vocabulary. Everything here is a
 * view of files the lab writes; the site never runs the lab. lab/README.md documents the formats.
 */
import { getCollection, type CollectionEntry } from 'astro:content'
import capabilitiesMarkdown from '../../../../lab/capabilities.md?raw'
// The lab's own parsers, so the site and lab/scripts/gaps.mjs read specs and reports the same way.
import { OUTCOMES, capabilityVocabulary, reportRows, specRequirements } from '../../../../lab/scripts/lib/markdown.mjs'
import changelog from './changelog.json'
import { LAB_OUTCOMES } from '../schemas'

export type LabRun = CollectionEntry<'labRuns'>['data']
export type LabOutcome = (typeof LAB_OUTCOMES)[number]

export const REPOSITORY: string = changelog.repository
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

export function parseRequirements(body: string): Requirement[] {
  return specRequirements(body) as Requirement[]
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

/** A build report's `| R1 | outcome | components | notes |` rows; a row whose outcome is not one the lab knows is left out (`gaps.mjs --check` reports it). */
export function parseReportRows(body: string): Map<string, ReportRow> {
  const rows = new Map<string, ReportRow>()
  for (const [id, row] of reportRows(body) as Map<string, ReportRow>) {
    if (OUTCOMES.includes(row.outcome)) rows.set(id, { outcome: row.outcome, components: row.components, notes: row.notes.replaceAll('`', '') })
  }
  return rows
}

/** The capability vocabulary: tag → group and description. */
export const capabilities: Map<string, { group: string; description: string }> = capabilityVocabulary(capabilitiesMarkdown)

/** Everything the lab pages need, gathered once per build and shared by every lab page. */
let cached: ReturnType<typeof buildLab> | undefined
export const loadLab = () => (cached ??= buildLab())

async function buildLab() {
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
      const latestRuns = builds.map((build) => build.latestRun).filter((run): run is LabRun => Boolean(run))
      return {
        ...entry.data,
        path: entry.filePath ?? `lab/specs/${entry.data.size}s/${entry.data.id}.md`,
        requirements: parseRequirements(body),
        tasks: parseTasks(body),
        purpose: /## Purpose\n\n([\s\S]*?)\n\n/.exec(body)?.[1].replace(/\n/g, ' ') ?? '',
        builds,
        // The newest run of any direction, and the first build with a report (whose notes the page shows).
        latest: latestRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0],
        firstReported: builds.find((build) => build.report),
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

  const personas = new Set([...latestByTarget.values()].flatMap((run) => run.runner.personas))

  return {
    specs,
    runs,
    personas,
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
