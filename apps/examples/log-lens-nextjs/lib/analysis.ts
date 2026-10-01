/**
 * Turns records and patterns into answers: a rhythm timeline, a written story of what happened, the journeys
 * reconstructed from trace ids, where failing journeys part ways with healthy ones, and which attributes are
 * over-represented in a set of records.
 */
import type { Focus } from './focus.ts'
import { attributeValue } from './focus.ts'
import { formatClock, formatDuration, formatNumber, formatPercent, plural, shorten } from './format.ts'
import type { LogRecord, SeverityBand } from './otlp.ts'
import { minePatterns, patternIndex, severityRank, worstSeverity, type Pattern } from './patterns.ts'

// ---------------------------------------------------------------------------------------------------------------
// Timeline

export interface Bucket {
  start: number
  end: number
  total: number
  problems: number
  warnings: number
  bySeverity: Partial<Record<SeverityBand, number>>
}

export interface Timeline {
  start: number
  end: number
  bucketMs: number
  buckets: Bucket[]
}

const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400].map((s) => s * 1000)

export function chooseBucketMs(span: number, target = 60): number {
  const raw = span / target
  if (raw <= 100) return Math.max(10, Math.ceil(raw / 10) * 10)
  return NICE_STEPS.find((step) => step >= raw) ?? NICE_STEPS[NICE_STEPS.length - 1]
}

export function isProblem(severity: SeverityBand): boolean {
  return severity === 'error' || severity === 'fatal'
}

export function buildTimeline(records: readonly LogRecord[], start: number, end: number, bucketMs = chooseBucketMs(Math.max(1, end - start))): Timeline {
  const count = Math.max(1, Math.ceil((end - start + 1) / bucketMs))
  const buckets: Bucket[] = Array.from({ length: count }, (_, i) => ({
    start: start + i * bucketMs,
    end: start + (i + 1) * bucketMs - 1,
    total: 0,
    problems: 0,
    warnings: 0,
    bySeverity: {},
  }))
  for (const record of records) {
    const bucket = buckets[Math.min(count - 1, Math.max(0, Math.floor((record.time - start) / bucketMs)))]
    bucket.total++
    bucket.bySeverity[record.severity] = (bucket.bySeverity[record.severity] ?? 0) + 1
    if (isProblem(record.severity)) bucket.problems++
    else if (record.severity === 'warn') bucket.warnings++
  }
  return { start, end, bucketMs, buckets }
}

// ---------------------------------------------------------------------------------------------------------------
// Journeys (records stitched by trace id)

export interface Journey {
  traceId: string
  records: number[]
  services: string[]
  start: number
  end: number
  duration: number
  failed: boolean
  severity: SeverityBand
  /** Pattern ids in order, consecutive repeats collapsed. */
  steps: string[]
  /** Root-ish label: the first record's pattern. */
  entry: string
}

export function buildJourneys(records: readonly LogRecord[], patternOf: readonly string[]): Journey[] {
  const byTrace = new Map<string, LogRecord[]>()
  for (const record of records) {
    if (!record.traceId) continue
    const list = byTrace.get(record.traceId)
    if (list) list.push(record)
    else byTrace.set(record.traceId, [record])
  }
  const journeys: Journey[] = []
  for (const [traceId, list] of byTrace) {
    const services: string[] = []
    const steps: string[] = []
    let severity: SeverityBand = 'unset'
    for (const record of list) {
      if (!services.includes(record.service)) services.push(record.service)
      const pattern = patternOf[record.index]
      if (steps[steps.length - 1] !== pattern) steps.push(pattern)
      severity = worstSeverity(severity, record.severity)
    }
    const start = list[0].time
    const end = list[list.length - 1].time
    journeys.push({
      traceId,
      records: list.map((record) => record.index),
      services,
      start,
      end,
      duration: end - start,
      failed: isProblem(severity),
      severity,
      steps,
      entry: steps[0],
    })
  }
  return journeys.sort((a, b) => a.start - b.start)
}

export interface DivergenceSignature {
  patternId: string
  failedShare: number
  okShare: number
  /** Median position of the pattern within failing journeys (0 = first step). */
  position: number
}

export interface Divergence {
  /** The kind of request compared: the first pattern of the journeys, e.g. "POST /api/checkout received…". */
  entry: string
  failed: number
  ok: number
  /** Steps both healthy and failing journeys usually go through before they part ways. */
  sharedPath: string[]
  /** Steps characteristic of failing journeys, earliest first: the first one is where they diverge. */
  signatures: DivergenceSignature[]
  /** Steps healthy journeys reach that failing ones usually never do. */
  missing: DivergenceSignature[]
}

function share(journeys: readonly Journey[], patternId: string): number {
  if (!journeys.length) return 0
  let hits = 0
  for (const journey of journeys) if (journey.steps.includes(patternId)) hits++
  return hits / journeys.length
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** The request kind (entry pattern) with the most failures; comparing like with like keeps browse traffic out of a checkout comparison. */
export function mainFailingEntry(journeys: readonly Journey[]): string {
  const failures = new Map<string, number>()
  for (const journey of journeys) if (journey.failed) failures.set(journey.entry, (failures.get(journey.entry) ?? 0) + 1)
  return [...failures].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

export function findDivergence(allJourneys: readonly Journey[], entry = mainFailingEntry(allJourneys)): Divergence {
  const journeys = entry ? allJourneys.filter((journey) => journey.entry === entry) : allJourneys
  const failed = journeys.filter((journey) => journey.failed)
  const ok = journeys.filter((journey) => !journey.failed)
  const candidates = new Set<string>()
  for (const journey of journeys) for (const step of journey.steps) candidates.add(step)

  const signatures: DivergenceSignature[] = []
  const missing: DivergenceSignature[] = []
  const sharedCandidates: DivergenceSignature[] = []
  for (const patternId of candidates) {
    const failedShare = share(failed, patternId)
    const okShare = share(ok, patternId)
    const positions = failed.flatMap((journey) => {
      const index = journey.steps.indexOf(patternId)
      return index < 0 ? [] : [index / Math.max(1, journey.steps.length - 1)]
    })
    const okPositions = ok.flatMap((journey) => {
      const index = journey.steps.indexOf(patternId)
      return index < 0 ? [] : [index / Math.max(1, journey.steps.length - 1)]
    })
    const entry = { patternId, failedShare, okShare, position: median(positions.length ? positions : okPositions) }
    if (failed.length && failedShare >= 0.3 && failedShare - okShare >= 0.3) signatures.push(entry)
    else if (failed.length && ok.length && okShare >= 0.5 && okShare - failedShare >= 0.4) missing.push(entry)
    else if (failedShare >= 0.6 && okShare >= 0.6) sharedCandidates.push(entry)
  }
  signatures.sort((a, b) => a.position - b.position || b.failedShare - a.failedShare)
  missing.sort((a, b) => a.position - b.position)
  const firstSignature = signatures[0]?.position ?? 1
  const sharedPath = sharedCandidates
    .filter((entry) => entry.position <= firstSignature)
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.patternId)
  return { entry, failed: failed.length, ok: ok.length, sharedPath, signatures: signatures.slice(0, 8), missing: missing.slice(0, 6) }
}

// ---------------------------------------------------------------------------------------------------------------
// Attribute lift: "what is different about these records?"

export interface AttributeLift {
  key: string
  value: string
  /** Share of the target set carrying key=value. */
  targetShare: number
  /** Share of everything else carrying key=value. */
  restShare: number
  targetCount: number
  lift: number
}

const IGNORED_KEYS = new Set(['message', 'log.iostream', 'log.file.path'])

/** One compared unit (a record, or a whole journey) and the key=value pairs it carries. */
interface LiftItem {
  target: boolean
  pairs: Map<string, Set<string>>
}

function recordPairs(record: LogRecord, into = new Map<string, Set<string>>()): Map<string, Set<string>> {
  const keys = new Set(['service.name', 'scope', ...Object.keys(record.resource), ...Object.keys(record.attributes)])
  for (const key of keys) {
    if (IGNORED_KEYS.has(key)) continue
    const value = attributeValue(record, key)
    if (value === undefined || value.length > 120) continue
    let values = into.get(key)
    if (!values) into.set(key, (values = new Set()))
    values.add(value)
  }
  return into
}

function liftOf(items: readonly LiftItem[], limit: number): AttributeLift[] {
  let targetTotal = 0
  let restTotal = 0
  const counts = new Map<string, Map<string, [number, number]>>()
  for (const item of items) {
    if (item.target) targetTotal++
    else restTotal++
    for (const [key, values] of item.pairs) {
      let tally = counts.get(key)
      if (!tally) counts.set(key, (tally = new Map()))
      for (const value of values) {
        if (tally.size > 400 && !tally.has(value)) continue
        const pair = tally.get(value) ?? [0, 0]
        pair[item.target ? 0 : 1]++
        tally.set(value, pair)
      }
    }
  }
  if (!targetTotal) return []
  const results: AttributeLift[] = []
  for (const [key, values] of counts) {
    // Ids (one value per record) explain nothing.
    if (values.size > Math.max(40, items.length * 0.3)) continue
    for (const [value, [targetCount, restCount]] of values) {
      const targetShare = targetCount / targetTotal
      const restShare = restTotal ? restCount / restTotal : 0
      const lift = targetShare / Math.max(restShare, 1 / Math.max(restTotal, 1) / 2)
      if (targetShare < 0.15 || lift < 1.5 || targetCount < 2) continue
      results.push({ key, value, targetShare, restShare, targetCount, lift })
    }
  }
  // Coverage gap first: an attribute on most of the target and little of the rest explains the most.
  results.sort((a, b) => b.targetShare - b.restShare - (a.targetShare - a.restShare) || b.lift - a.lift)
  // One line per key keeps the list readable.
  const seen = new Set<string>()
  return results.filter((result) => !seen.has(result.key) && seen.add(result.key)).slice(0, limit)
}

/** Record level: which key=value pairs are over-represented in the target records? */
export function attributeLift(records: readonly LogRecord[], isTarget: (record: LogRecord) => boolean, limit = 12): AttributeLift[] {
  return liftOf(
    records.map((record) => ({ target: isTarget(record), pairs: recordPairs(record) })),
    limit,
  )
}

/** Request level: which key=value pairs do failed journeys carry that successful journeys of the same kind do not? */
export function journeyLift(records: readonly LogRecord[], journeys: readonly Journey[], entry: string, limit = 12): AttributeLift[] {
  return liftOf(
    journeys
      .filter((journey) => !entry || journey.entry === entry)
      .map((journey) => {
        const pairs = new Map<string, Set<string>>()
        for (const index of journey.records) recordPairs(records[index], pairs)
        return { target: journey.failed, pairs }
      }),
    limit,
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Story

export type ChapterKind = 'opening' | 'surge' | 'new-behaviour' | 'silence' | 'recovery' | 'closing'
export type ChapterTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success'

export interface Chapter {
  id: string
  kind: ChapterKind
  tone: ChapterTone
  start: number
  end: number
  title: string
  /** Plain-language explanation. Backtick spans are rendered as code. */
  text: string
  /** Short facts rendered as chips. */
  facts: string[]
  focus?: Focus
  patternIds: string[]
}

export interface Analysis {
  records: LogRecord[]
  patterns: Pattern[]
  patternById: Map<string, Pattern>
  patternOf: string[]
  timeline: Timeline
  journeys: Journey[]
  divergence: Divergence
  chapters: Chapter[]
  services: Array<{ name: string; count: number; problems: number; warnings: number }>
  start: number
  end: number
  problems: number
  warnings: number
}

/**
 * Story text markup, rendered by the UI: `` `P07:template` `` is a pattern reference (the id lets the view link it),
 * `**text**` a fact worth highlighting.
 */
function quote(pattern: Pattern | undefined): string {
  return pattern ? `\`${pattern.id}:${shorten(pattern.template, 90)}\`` : 'an unknown message'
}

function mark(text: string): string {
  return `**${text}**`
}

function describeWindow(start: number, end: number, precise: boolean): string {
  return `${formatClock(start, precise)}–${formatClock(end, precise)}`
}

function topPatternsIn(
  records: readonly LogRecord[],
  patternOf: readonly string[],
  predicate: (record: LogRecord) => boolean,
  limit = 3,
): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const record of records) if (predicate(record)) counts.set(patternOf[record.index], (counts.get(patternOf[record.index]) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

export function writeStory(analysis: Omit<Analysis, 'chapters'>): Chapter[] {
  const { records, patterns, patternById, patternOf, timeline, journeys, start, end } = analysis
  const span = Math.max(1, end - start)
  const precise = span < 10 * 60_000
  const chapters: Chapter[] = []
  const buckets = timeline.buckets
  const per = formatDuration(timeline.bucketMs)
  const mentioned = new Set<string>()

  // Opening -----------------------------------------------------------------------------------------------------
  const top5 = patterns.slice(0, 5).reduce((sum, pattern) => sum + pattern.count, 0)
  chapters.push({
    id: 'opening',
    kind: 'opening',
    tone: 'neutral',
    start,
    end: start,
    title: 'What this file is',
    text:
      `${plural(records.length, 'record')} from ${plural(analysis.services.length, 'service')} over ${formatDuration(span)}. ` +
      `Read as message kinds, the file is just ${plural(patterns.length, 'pattern')} — the five most common alone are ${formatPercent(top5 / records.length)} of all lines` +
      (journeys.length ? `, and ${plural(journeys.length, 'request')} can be followed end to end through their trace ids.` : '.'),
    facts: [
      `${formatPercent(analysis.problems / records.length, 1)} errors`,
      `${formatPercent(analysis.warnings / records.length, 1)} warnings`,
      plural(patterns.length, 'pattern'),
    ],
    patternIds: patterns.slice(0, 5).map((pattern) => pattern.id),
  })

  // Surges ------------------------------------------------------------------------------------------------------
  const problemCounts = buckets.map((bucket) => bucket.problems)
  const base = median(problemCounts)
  const mad = median(problemCounts.map((value) => Math.abs(value - base)))
  const threshold = Math.max(3, base + 4 * Math.max(mad, 1))
  const surges: Array<{ from: number; to: number }> = []
  buckets.forEach((bucket, i) => {
    if (bucket.problems < threshold) return
    const last = surges[surges.length - 1]
    if (last && i - last.to <= 2) last.to = i
    else surges.push({ from: i, to: i })
  })

  const calmBuckets = buckets.filter((_, i) => !surges.some((surge) => i >= surge.from && i <= surge.to))
  const calmRate = calmBuckets.reduce((sum, bucket) => sum + bucket.problems, 0) / Math.max(1, calmBuckets.length)
  const usually = calmRate < 0.5 ? 'almost none' : `about ${calmRate.toFixed(1)}`

  surges.forEach((surge, n) => {
    const windowStart = buckets[surge.from].start
    const windowEnd = buckets[surge.to].end
    const inWindow = (record: LogRecord) => record.time >= windowStart && record.time <= windowEnd
    const problems = records.filter((record) => inWindow(record) && isProblem(record.severity))
    const peak = Math.max(...buckets.slice(surge.from, surge.to + 1).map((bucket) => bucket.problems))
    const [lead, ...rest] = topPatternsIn(records, patternOf, (record) => inWindow(record) && isProblem(record.severity))
    const leadPattern = lead ? patternById.get(lead[0]) : undefined
    const services = [...new Set(problems.map((record) => record.service))]
    const traces = new Set(problems.map((record) => record.traceId).filter(Boolean))

    // A message never seen before, logged just before the surge, is the most useful clue a log can give.
    const lookback = windowStart - Math.max(timeline.bucketMs * 3, span * 0.03)
    const precursor = patterns
      .filter((pattern) => pattern.first >= lookback && pattern.first <= windowStart + timeline.bucketMs && pattern.first > start + span * 0.05)
      .filter((pattern) => !isProblem(pattern.severity))
      .sort((a, b) => a.first - b.first)[0]
    const newcomers = patterns.filter(
      (pattern) => pattern.first >= lookback && pattern.first <= windowEnd && pattern.id !== precursor?.id && pattern.first > start + span * 0.05,
    )

    let text = `Errors jump to ${mark(`${formatNumber(peak)} per ${per}`)} between ${describeWindow(windowStart, windowEnd, precise)}, where there are usually ${usually}. `
    text += leadPattern
      ? `Most of them are ${leadPattern.services.join(', ')} saying ${quote(leadPattern)} (${formatNumber(lead[1])}×)`
      : 'Errors are spread over several messages'
    if (rest.length) text += `, echoed by ${rest.map(([id, count]) => `${quote(patternById.get(id))} (${formatNumber(count)}×)`).join(' and ')}`
    text += '. '
    if (precursor) text += `Shortly before, ${precursor.services[0]} logged ${quote(precursor)} for the first time — ${mark('the likely trigger')}. `
    const quietNewcomers = newcomers.filter((pattern) => !isProblem(pattern.severity))
    if (quietNewcomers.length)
      text += `The surge also brings ${plural(quietNewcomers.length, 'message')} never seen before, such as ${quote(quietNewcomers.sort((a, b) => b.count - a.count)[0])}. `
    if (traces.size) text += `${mark(`${plural(traces.size, 'request')} failed`)}.`

    const patternIds = [
      ...new Set([lead?.[0], ...rest.map(([id]) => id), precursor?.id, ...newcomers.map((pattern) => pattern.id)].filter((id): id is string => !!id)),
    ]
    patternIds.forEach((id) => mentioned.add(id))
    chapters.push({
      id: `surge-${n}`,
      kind: 'surge',
      tone: 'danger',
      start: windowStart,
      end: windowEnd,
      title: `Error surge in ${services.slice(0, 2).join(' and ')}${services.length > 2 ? ` +${services.length - 2}` : ''}`,
      text,
      facts: [`${formatNumber(problems.length)} errors`, `lasts ${formatDuration(windowEnd - windowStart)}`, plural(traces.size, 'failed request')],
      focus: { window: { start: windowStart, end: windowEnd, label: describeWindow(windowStart, windowEnd, precise) }, severities: ['error', 'fatal'] },
      patternIds,
    })

    // Recovery: first calm bucket after the surge, and what was said then.
    const after = buckets.slice(surge.to + 1)
    const calmIndex = after.findIndex((bucket) => bucket.problems <= Math.max(base, calmRate * 1.5, 1))
    if (calmIndex >= 0 && surge.to + 1 + calmIndex < buckets.length - 1) {
      const calmStart = after[calmIndex].start
      const recoveryPattern = patterns
        .filter(
          (pattern) => pattern.first >= windowEnd - timeline.bucketMs * 2 && pattern.first <= calmStart + timeline.bucketMs * 2 && !isProblem(pattern.severity),
        )
        .sort((a, b) => a.first - b.first)[0]
      const sameAsTrigger = recoveryPattern && precursor && recoveryPattern.id === precursor.id
      const fix = sameAsTrigger ? precursor : recoveryPattern
      chapters.push({
        id: `recovery-${n}`,
        kind: 'recovery',
        tone: 'success',
        start: calmStart,
        end: calmStart,
        title: 'Back to normal',
        text:
          `By ${formatClock(calmStart, precise)} errors are back to ${usually} per ${per}, ${mark(`${formatDuration(calmStart - windowStart)} after the surge began`)}.` +
          (fix
            ? ` The turn coincides with ${fix.services[0]} logging ${quote(fix)}${sameAsTrigger ? ' again — the same kind of message that preceded the surge' : ''}.`
            : ''),
        facts: [`${formatDuration(calmStart - windowStart)} to recover`],
        focus: fix ? { patternId: fix.id } : undefined,
        patternIds: fix ? [fix.id] : [],
      })
      if (fix) mentioned.add(fix.id)
    }
  })

  // Silence -----------------------------------------------------------------------------------------------------
  const silences: Array<{ service: string; from: number; to: number }> = []
  const byService = new Map<string, LogRecord[]>()
  for (const record of records) {
    const list = byService.get(record.service)
    if (list) list.push(record)
    else byService.set(record.service, [record])
  }
  for (const [service, list] of byService) {
    if (list.length < 20) continue
    const gaps: number[] = []
    let widest = { from: 0, to: 0, before: -1, after: -1 }
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].time - list[i - 1].time
      gaps.push(gap)
      if (gap > widest.to - widest.from) widest = { from: list[i - 1].time, to: list[i].time, before: i - 1, after: i }
    }
    // A service that stops before the end is silent until the end.
    if (end - list[list.length - 1].time > widest.to - widest.from) widest = { from: list[list.length - 1].time, to: end, before: list.length - 1, after: -1 }
    const usual = Math.max(1, median(gaps))
    const length = widest.to - widest.from
    if (length < usual * 15 || length < span * 0.08 || length < timeline.bucketMs * 3) continue
    silences.push({ service, from: widest.from, to: widest.to })
    const lastWords = list[widest.before]
    const lastPattern = patternById.get(patternOf[lastWords.index])
    const comeback = widest.after >= 0 ? list[widest.after] : undefined
    const comebackPattern = comeback ? patternById.get(patternOf[comeback.index]) : undefined
    const telling = (pattern: Pattern | undefined) => pattern && pattern.count <= 3
    let text = `${service} normally logs every ${formatDuration(usual)}, `
    text += comeback
      ? `but is ${mark(`silent for ${formatDuration(length)}`)} from ${formatClock(widest.from, precise)}. `
      : `but ${mark(`nothing arrives after ${formatClock(widest.from, precise)}`)} — the last ${formatDuration(length)} of the file. `
    if (telling(lastPattern)) text += `Its last words were ${quote(lastPattern)}. `
    if (comeback && telling(comebackPattern)) text += `It comes back with ${quote(comebackPattern)}, which reads like a restart. `
    else if (comeback) text += 'A pause like this usually means a restart, a stall or lost connectivity. '
    else text += 'Missing logs are easy to overlook and are often the real incident. '
    for (const pattern of [lastPattern, comebackPattern]) if (telling(pattern)) mentioned.add(pattern!.id)
    chapters.push({
      id: `silence-${service}`,
      kind: 'silence',
      tone: 'warning',
      start: widest.from,
      end: widest.to,
      title: `${service} goes quiet`,
      text,
      facts: [`${formatDuration(length)} silent`, `usual gap ${formatDuration(usual)}`],
      focus: { window: { start: widest.from - usual * 30, end: Math.min(end, widest.to + usual * 30), label: `around the ${service} gap` } },
      patternIds: [lastPattern, comebackPattern].filter((pattern): pattern is Pattern => telling(pattern) === true).map((pattern) => pattern.id),
    })
  }

  // New behaviour -----------------------------------------------------------------------------------------------
  const lateFirsts = patterns
    .filter((pattern) => !mentioned.has(pattern.id) && pattern.first > start + span * 0.2 && (pattern.count >= 3 || severityRank(pattern.severity) >= 4))
    .sort((a, b) => a.first - b.first)
  const groups: Pattern[][] = []
  for (const pattern of lateFirsts) {
    const last = groups[groups.length - 1]
    if (last && pattern.first - last[0].first <= timeline.bucketMs * 2) last.push(pattern)
    else groups.push([pattern])
  }
  groups.slice(0, 4).forEach((group, n) => {
    const [lead, ...others] = group.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.count - a.count)
    const during = silences.find((silence) => silence.service !== lead.services[0] && lead.first >= silence.from && lead.first <= silence.to)
    chapters.push({
      id: `new-${n}`,
      kind: 'new-behaviour',
      tone: severityRank(lead.severity) >= 4 ? 'warning' : 'info',
      start: lead.first,
      end: lead.last,
      title: `${lead.services[0]} starts saying something new`,
      text:
        `From ${formatClock(lead.first, precise)}, ${lead.services.join(', ')} logs ${quote(lead)} — absent from the first ${formatDuration(lead.first - start)} of the file, ` +
        `${plural(lead.count, 'time')} since` +
        (during ? `, starting just as ${mark(`${during.service} went silent`)}. It is probably reacting to that` : '') +
        '.' +
        (others.length ? ` ${plural(others.length, 'other new pattern')} appeared at the same moment.` : ''),
      facts: [lead.severity.toUpperCase(), `${formatNumber(lead.count)}×`, `first at ${formatClock(lead.first, precise)}`],
      focus: { patternId: lead.id },
      patternIds: [lead.id, ...others.map((pattern) => pattern.id)],
    })
  })

  // Closing -----------------------------------------------------------------------------------------------------
  const lastBuckets = buckets.slice(-Math.max(1, Math.round(buckets.length * 0.1)))
  const tailProblems = lastBuckets.reduce((sum, bucket) => sum + bucket.problems, 0) / lastBuckets.length
  const endsBad = tailProblems > Math.max(calmRate * 2, 1)
  chapters.push({
    id: 'closing',
    kind: 'closing',
    tone: endsBad ? 'danger' : surges.length ? 'success' : 'neutral',
    start: end,
    end,
    title: endsBad ? 'Still failing at the end' : surges.length ? 'Ends calm' : 'A quiet file',
    text: endsBad
      ? `The file ends with ${tailProblems.toFixed(1)} errors per ${per}, well above the usual ${usually} — the problem was not resolved within this capture.`
      : surges.length
        ? `The capture ends with errors at their usual level of ${usually} per ${per}.`
        : `No error surge stands out: errors stay at ${usually} per ${per} throughout.`,
    facts: [],
    patternIds: [],
  })

  const order: Record<ChapterKind, number> = { opening: 0, surge: 1, 'new-behaviour': 2, silence: 3, recovery: 4, closing: 5 }
  return chapters.sort((a, b) =>
    a.kind === 'opening'
      ? -1
      : b.kind === 'opening'
        ? 1
        : a.kind === 'closing'
          ? 1
          : b.kind === 'closing'
            ? -1
            : a.start - b.start || order[a.kind] - order[b.kind],
  )
}

// ---------------------------------------------------------------------------------------------------------------

export function analyze(input: LogRecord[]): Analysis {
  // Every index below addresses records by position; a filtered subset must be renumbered first.
  const records = input.every((record, index) => record.index === index) ? input : input.map((record, index) => ({ ...record, index }))
  const patterns = minePatterns(records)
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]))
  const patternOf = patternIndex(patterns, records.length)
  const start = records[0]?.time ?? 0
  const end = records[records.length - 1]?.time ?? 0
  const timeline = buildTimeline(records, start, end)
  const journeys = buildJourneys(records, patternOf)
  const divergence = findDivergence(journeys)
  const serviceMap = new Map<string, { name: string; count: number; problems: number; warnings: number }>()
  let problems = 0
  let warnings = 0
  for (const record of records) {
    const entry = serviceMap.get(record.service) ?? { name: record.service, count: 0, problems: 0, warnings: 0 }
    entry.count++
    if (isProblem(record.severity)) {
      entry.problems++
      problems++
    } else if (record.severity === 'warn') {
      entry.warnings++
      warnings++
    }
    serviceMap.set(record.service, entry)
  }
  const services = [...serviceMap.values()].sort((a, b) => b.count - a.count)
  const partial = { records, patterns, patternById, patternOf, timeline, journeys, divergence, services, start, end, problems, warnings }
  return { ...partial, chapters: writeStory(partial) }
}
