// Run records: one JSON file per lab run in lab/runs/, committed, so the lab's history lives next to the code it
// tested. A record says which library version was tested, which journeys passed for which persona, which findings
// were seen, and (for a target built from a spec) the outcomes of the build report at the time. Comparing a record
// with the target's previous one shows what a library change fixed or broke.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { frontMatter, reportRows } from './markdown.mjs'

export const SCHEMA = 1

function git(root, ...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** The library under test: the released version line, the commit, and whether component sources had local edits. */
export function libraryVersion(root) {
  const lerna = JSON.parse(readFileSync(join(root, 'lerna.json'), 'utf8'))
  const changed = git(root, 'status', '--porcelain', '--', 'packages', 'open-packages')
  return { version: lerna.version, commit: git(root, 'rev-parse', 'HEAD'), branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), dirty: Boolean(changed) }
}

/** `lab/apps/<spec>/<direction>` names its spec and direction; an example app is its own thing. */
function specAndDirection(target) {
  const match = /^lab\/apps\/([^/]+)\/([^/]+)/.exec(target.app ?? '')
  if (match) return { spec: match[1], direction: match[2] }
  return { spec: target.specId ?? null, direction: target.app ? 'example' : null }
}

/** The build report behind the target, as it reads now: front matter and each requirement's outcome. */
function buildSnapshot(root, spec, direction) {
  if (!spec || !direction || direction === 'example') return null
  const file = join(root, 'lab', 'reports', spec, `${direction}.md`)
  if (!existsSync(file)) return null
  const { data, body } = frontMatter(readFileSync(file, 'utf8'))
  const outcomes = Object.fromEntries([...reportRows(body)].map(([id, row]) => [id, { outcome: row.outcome, component: row.components[0] ?? null }]))
  return { report: relative(root, file), builder: data.builder ?? null, date: data.date ?? null, outcomes }
}

export function buildRecord({ root, target, mode, options, personas, results, findings, startedAt, finishedAt }) {
  const { spec, direction } = specAndDirection(target)
  const journeys = new Map()
  for (const result of results) {
    const key = `${result.persona}/${result.journey}`
    const entry = journeys.get(key) ?? { persona: result.persona, journey: result.journey, runs: 0, passed: 0, failedStep: null }
    entry.runs++
    if (result.status === 'passed') entry.passed++
    else entry.failedStep ??= result.failedStep
    journeys.set(key, entry)
  }
  const journeyList = [...journeys.values()]
  return {
    schema: SCHEMA,
    id: `${startedAt.toISOString().slice(0, 16).replace(':', '')}-${target.name}`,
    startedAt: startedAt.toISOString(),
    durationSeconds: Math.round((finishedAt - startedAt) / 1000),
    mode,
    target: target.name,
    spec,
    direction,
    library: libraryVersion(root),
    runner: {
      personas,
      repeat: options.repeat,
      journeys: [...new Set(results.map((result) => result.journey))],
      // Only a full run (every persona, every journey, no ad-hoc steps) can say that a finding is gone.
      full: !options.personas && !options.journeys && !options.steps,
    },
    build: buildSnapshot(root, spec, direction),
    summary: {
      journeys: journeyList.length,
      passed: journeyList.filter((entry) => entry.passed === entry.runs).length,
      flakyJourneys: journeyList.filter((entry) => entry.passed > 0 && entry.passed < entry.runs).length,
      failed: journeyList.filter((entry) => entry.passed === 0).length,
      findings: {
        new: findings.filter((finding) => finding.status === 'new' && finding.reproducible).length,
        known: findings.filter((finding) => finding.status === 'known').length,
        flaky: findings.filter((finding) => finding.status === 'new' && !finding.reproducible).length,
      },
    },
    journeys: journeyList,
    findings: findings.map((finding) => ({
      key: finding.key,
      kind: finding.kind,
      severity: finding.severity,
      component: finding.component,
      rule: finding.rule,
      status: finding.status,
      reproducible: finding.reproducible,
      seen: finding.seen,
      message: String(finding.message).split('\n')[0].slice(0, 300),
    })),
  }
}

export function loadRecords(root, targetName) {
  const dir = join(root, 'lab', 'runs')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')))
    .filter((record) => !targetName || record.target === targetName)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/**
 * What changed since the target's previous full run: findings that appeared, findings that are gone (fixed, or the
 * check stopped seeing them), and journeys that started or stopped passing. Partial runs are compared with nothing.
 */
export function compare(previous, current) {
  if (!previous || !previous.runner.full || !current.runner.full) return null
  const keys = (record) => new Set(record.findings.filter((finding) => finding.reproducible).map((finding) => finding.key))
  const before = keys(previous)
  const after = keys(current)
  const passing = (record) => new Set(record.journeys.filter((entry) => entry.passed === entry.runs).map((entry) => `${entry.persona}/${entry.journey}`))
  const passedBefore = passing(previous)
  const passedAfter = passing(current)
  const journeysNow = new Set(current.journeys.map((entry) => `${entry.persona}/${entry.journey}`))
  return {
    previous: previous.id,
    previousLibrary: previous.library,
    appeared: [...after].filter((key) => !before.has(key)),
    gone: [...before].filter((key) => !after.has(key)),
    nowPassing: [...passedAfter].filter((key) => !passedBefore.has(key)),
    nowFailing: [...passedBefore].filter((key) => journeysNow.has(key) && !passedAfter.has(key)),
  }
}

export function writeRecord(root, record) {
  const dir = join(root, 'lab', 'runs')
  mkdirSync(dir, { recursive: true })
  let file = join(dir, `${record.id}.json`)
  for (let n = 2; existsSync(file); n++) file = join(dir, `${record.id}-${n}.json`)
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n')
  return relative(root, file)
}
