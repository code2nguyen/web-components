/**
 * Statistical process control for `c2-line-chart`: the functions that turn a column of measurements into a control
 * chart. They are plain functions over arrays, imported on their own (`@c2n/chart/spc.js`), and run when the data
 * changes, never on the chart's draw path:
 *
 * - {@link controlLimits} computes the centre line, sigma and the control limits;
 * - {@link runRules} evaluates the Nelson rules, or the Western Electric ones with `sameSideRun: 8`;
 * - {@link spcReferenceLines} turns the limits into the chart's `reference-lines` (limits, sigma zones, spec limits);
 * - {@link markViolations} copies the flagged values into a field of their own, drawn by a `points="only"` series.
 *
 * ```ts
 * import { controlLimits, runRules, spcReferenceLines, markViolations } from '@c2n/components/chart/spc'
 *
 * const values = rows.map((row) => row.diameter)
 * const limits = controlLimits(values)
 * chart.referenceLines = spcReferenceLines(limits, { spec: { lsl: 9.4, usl: 10.6 } })
 * chart.data = markViolations(rows, 'diameter', runRules(values, limits), 'outOfControl')
 * ```
 *
 * @module
 */
import type { ChartReferenceLine, ChartRow } from './chart-types.js'

/** How sigma is estimated from the data. */
export type SpcSigmaMethod = 'moving-range' | 'standard-deviation'

export interface ControlLimitsOptions {
  /**
   * `moving-range` (the default) is the individuals chart's estimate, the mean moving range over 1.128, which is not
   * inflated by a shift in the process. `standard-deviation` is the sample standard deviation.
   */
  method?: SpcSigmaMethod
  /** How many sigmas the control limits sit from the centre line. Defaults to 3. */
  sigmas?: number
  /** A known centre line, such as a historical mean, instead of the mean of the data. */
  center?: number
  /** A known sigma instead of the estimate. */
  sigma?: number
}

/** The centre line, sigma and control limits of a series. */
export interface SpcLimits {
  center: number
  sigma: number
  /** Upper control limit: `center + sigmas × sigma`. */
  ucl: number
  /** Lower control limit: `center − sigmas × sigma`. */
  lcl: number
  /** How many finite values the limits were computed from. */
  count: number
}

/** A Nelson rule, by number. */
export type SpcRule = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * What each rule tests, in English, for a tooltip or a legend. An app that translates its interface supplies its own.
 * Zone C is within 1 sigma of the centre line, B from 1 to 2 and A from 2 to the limit (thirds of the way to the limits
 * set at another width). The point a rule flags is the one that completes the pattern.
 */
export const SPC_RULES: Readonly<Record<SpcRule, string>> = {
  1: 'One point beyond a control limit',
  2: 'A run of points on one side of the centre line (nine by default)',
  3: 'Six points in a row steadily increasing or decreasing',
  4: 'Fourteen points in a row alternating up and down',
  5: 'Two of three points in zone A or beyond, on one side',
  6: 'Four of five points in zone B or beyond, on one side',
  7: 'Fifteen points in a row in zone C',
  8: 'Eight points in a row outside zone C, on both sides of the centre line',
}

/** One flagged point: its index in the values handed to {@link runRules}, and every rule it breaks. */
export interface SpcViolation {
  index: number
  rules: SpcRule[]
}

export interface RunRulesOptions {
  /** The rules to evaluate. Defaults to all eight. */
  rules?: readonly SpcRule[]
  /**
   * How many points in a row on one side of the centre line rule 2 flags. Defaults to 9 (Nelson); the Western Electric
   * rules are `{ rules: [1, 2, 5, 6], sameSideRun: 8 }`.
   */
  sameSideRun?: number
}

/** d2 for a moving range of two consecutive points. */
const D2 = 1.128

type Values = readonly (number | null | undefined)[]

/** The finite values with the index each came from. A gap is skipped: a run continues across it. */
function finite(values: Values): { index: number; value: number }[] {
  const points: { index: number; value: number }[] = []
  values.forEach((value, index) => {
    if (typeof value === 'number' && Number.isFinite(value)) points.push({ index, value })
  })
  return points
}

/**
 * The centre line, sigma and control limits of `values`. Gaps (`null`, `undefined`, `NaN`) are skipped. Returns `null`
 * when there is no finite value; with a single one, sigma is 0 unless it is given.
 */
export function controlLimits(values: Values, options: ControlLimitsOptions = {}): SpcLimits | null {
  const points = finite(values).map((point) => point.value)
  if (points.length === 0) return null
  const center = options.center ?? points.reduce((sum, value) => sum + value, 0) / points.length
  let sigma = options.sigma
  if (sigma === undefined) {
    if (points.length < 2) sigma = 0
    else if (options.method === 'standard-deviation') {
      const mean = points.reduce((sum, value) => sum + value, 0) / points.length
      sigma = Math.sqrt(points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (points.length - 1))
    } else {
      let ranges = 0
      for (let index = 1; index < points.length; index += 1) ranges += Math.abs(points[index] - points[index - 1])
      sigma = ranges / (points.length - 1) / D2
    }
  }
  const sigmas = options.sigmas ?? 3
  return { center, sigma, ucl: center + sigmas * sigma, lcl: center - sigmas * sigma, count: points.length }
}

/**
 * Evaluates the Nelson rules over `values` against `limits` and returns the flagged points in index order. Rule 1 reads
 * the limits' `ucl` and `lcl`, so limits set by hand are honoured. The zone rules (5 to 8) read the zones
 * {@link spcReferenceLines} draws, thirds of the distance to each limit (1, 2 and 3 sigma with 3-sigma limits), and are
 * skipped when sigma is 0. Gaps are skipped, and a run continues across them.
 */
export function runRules(values: Values, limits: SpcLimits | null, options: RunRulesOptions = {}): SpcViolation[] {
  if (!limits) return []
  const rules = new Set<SpcRule>(options.rules ?? [1, 2, 3, 4, 5, 6, 7, 8])
  const sameSideRun = Math.max(1, options.sameSideRun ?? 9)
  const points = finite(values)
  const { center, sigma, ucl, lcl } = limits
  // A zone is a third of the way to the control limit on its side (1 sigma with 3-sigma limits), as spcReferenceLines draws it.
  const up = (ucl - center) / 3
  const down = (center - lcl) / 3
  const zoned = sigma > 0 && up > 0 && down > 0
  const z = (value: number) => (value - center) / (value >= center ? up : down)
  const found = new Map<number, Set<SpcRule>>()
  const flag = (position: number, rule: SpcRule) => {
    const index = points[position].index
    const set = found.get(index) ?? new Set<SpcRule>()
    set.add(rule)
    found.set(index, set)
  }
  /** Of the last `size` points ending at `position`, how many sit beyond `bound` sigma on `side`. */
  const beyond = (position: number, size: number, bound: number, side: 1 | -1) => {
    let count = 0
    for (let back = Math.max(0, position - size + 1); back <= position; back += 1) if (side * z(points[back].value) > bound) count += 1
    return count
  }

  let sameSide = 0
  let side = 0
  let trend = 0
  let direction = 0
  let alternating = 0
  let lastDelta = 0
  let inside = 0
  let outside = 0
  points.forEach(({ value }, position) => {
    if (rules.has(1) && (value > ucl || value < lcl)) flag(position, 1)

    const currentSide = Math.sign(value - center)
    sameSide = currentSide !== 0 && currentSide === side ? sameSide + 1 : currentSide === 0 ? 0 : 1
    side = currentSide
    if (rules.has(2) && sameSide >= sameSideRun) flag(position, 2)

    const delta = position > 0 ? Math.sign(value - points[position - 1].value) : 0
    trend = delta !== 0 && delta === direction ? trend + 1 : delta === 0 ? 0 : 1
    direction = delta
    if (rules.has(3) && trend >= 5) flag(position, 3)

    alternating = delta !== 0 && delta === -lastDelta ? alternating + 1 : delta === 0 ? 0 : 1
    lastDelta = delta
    if (rules.has(4) && alternating >= 13) flag(position, 4)

    if (!zoned) return
    const score = z(value)
    const pointSide: 1 | -1 = score >= 0 ? 1 : -1
    // A two-of-three or four-of-five pattern flags its last point only when that point is one of the extreme ones.
    if (rules.has(5) && Math.abs(score) > 2 && beyond(position, 3, 2, pointSide) >= 2) flag(position, 5)
    if (rules.has(6) && Math.abs(score) > 1 && beyond(position, 5, 1, pointSide) >= 4) flag(position, 6)

    inside = Math.abs(score) < 1 ? inside + 1 : 0
    if (rules.has(7) && inside >= 15) flag(position, 7)
    outside = Math.abs(score) > 1 ? outside + 1 : 0
    // Eight in a row avoiding zone C and crossing the centre line: a mixture, not a shift (which rules 2 and 6 catch).
    if (rules.has(8) && outside >= 8 && beyond(position, 8, 1, 1) > 0 && beyond(position, 8, 1, -1) > 0) flag(position, 8)
  })

  return [...found.entries()].sort(([a], [b]) => a - b).map(([index, set]) => ({ index, rules: [...set].sort((a, b) => a - b) }))
}

export interface SpcReferenceLinesOptions {
  /**
   * Shades the zones: C within a third of the way to each control limit, B to two thirds, A up to the limit, which with
   * 3-sigma limits is 1, 2 and 3 sigma. Defaults to `true`.
   */
  zones?: boolean
  /** Specification limits and target, which come from the design rather than the process. */
  spec?: { lsl?: number; usl?: number; target?: number }
  /** The labels of the rules, in English by default. */
  labels?: Partial<Record<'center' | 'ucl' | 'lcl' | 'usl' | 'lsl' | 'target', string>>
}

/**
 * The `reference-lines` of a control chart: the centre line, the control limits in the `danger` tone, the sigma zones
 * as unlabelled bands (A `danger`, B `warning`, C `success`), and the spec limits (`info`) and target (`success`).
 */
export function spcReferenceLines(limits: SpcLimits | null, options: SpcReferenceLinesOptions = {}): ChartReferenceLine[] {
  const lines: ChartReferenceLine[] = []
  const label = { center: 'CL', ucl: 'UCL', lcl: 'LCL', usl: 'USL', lsl: 'LSL', target: 'Target', ...options.labels }
  if (limits) {
    const { center, sigma } = limits
    // The zones split the distance to each drawn limit in thirds, so they meet the limits whatever width they were set at.
    const up = (limits.ucl - center) / 3
    const down = (center - limits.lcl) / 3
    if ((options.zones ?? true) && sigma > 0 && up > 0 && down > 0) {
      lines.push(
        { value: center + 2 * up, value2: limits.ucl, tone: 'danger' },
        { value: center + up, value2: center + 2 * up, tone: 'warning' },
        { value: center - down, value2: center + up, tone: 'success' },
        { value: center - 2 * down, value2: center - down, tone: 'warning' },
        { value: limits.lcl, value2: center - 2 * down, tone: 'danger' },
      )
    }
    lines.push(
      { value: limits.ucl, label: label.ucl, tone: 'danger' },
      { value: center, label: label.center, tone: 'neutral' },
      { value: limits.lcl, label: label.lcl, tone: 'danger' },
    )
  }
  const spec = options.spec ?? {}
  if (spec.usl !== undefined) lines.push({ value: spec.usl, label: label.usl, tone: 'info' })
  if (spec.target !== undefined) lines.push({ value: spec.target, label: label.target, tone: 'success' })
  if (spec.lsl !== undefined) lines.push({ value: spec.lsl, label: label.lsl, tone: 'info' })
  return lines
}

/**
 * Copies of `rows` with `markField` holding the value of `field` on each flagged row and `null` elsewhere, for a
 * `c2-chart-series field="<markField>" points="only"` that draws the violations over the line. `field` is read as a
 * top-level key. The rows themselves are not changed.
 */
export function markViolations<Row extends ChartRow>(
  rows: readonly Row[],
  field: string,
  violations: readonly SpcViolation[],
  markField = 'violation',
): (Row & Record<string, unknown>)[] {
  const flagged = new Set(violations.map((violation) => violation.index))
  return rows.map((row, index) => ({ ...row, [markField]: flagged.has(index) ? (row[field] ?? null) : null }))
}
