import assert from 'node:assert/strict'
import { test } from 'node:test'

import { controlLimits, markViolations, runRules, spcReferenceLines, type SpcLimits, type SpcRule } from './spc.ts'

/** Limits centred on 0 with sigma 1, so a value reads directly as its z score. */
const unit: SpcLimits = { center: 0, sigma: 1, ucl: 3, lcl: -3, count: 0 }

/** The indices `rule` flags in `values` against the unit limits, evaluating that rule alone. */
const flagged = (values: (number | null)[], rule: SpcRule) => runRules(values, unit, { rules: [rule] }).map((violation) => violation.index)

test('limits: the moving-range estimate, the standard deviation, and known values', () => {
  const values = [10, 12, 11, 13, 12, 14]
  const limits = controlLimits(values)!
  assert.equal(limits.center, 12)
  // Moving ranges 2, 1, 2, 1, 2: mean 1.6, over d2 = 1.128.
  assert.ok(Math.abs(limits.sigma - 1.6 / 1.128) < 1e-12)
  assert.ok(Math.abs(limits.ucl - (12 + 3 * limits.sigma)) < 1e-12)
  assert.ok(Math.abs(limits.lcl - (12 - 3 * limits.sigma)) < 1e-12)
  assert.equal(limits.count, 6)

  const sd = controlLimits(values, { method: 'standard-deviation' })!
  assert.ok(Math.abs(sd.sigma - Math.sqrt(10 / 5)) < 1e-12)

  assert.deepEqual(controlLimits(values, { center: 11, sigma: 0.5, sigmas: 2 }), { center: 11, sigma: 0.5, ucl: 12, lcl: 10, count: 6 })
})

test('limits: gaps are skipped, nothing finite gives null and a single value a zero sigma', () => {
  assert.equal(controlLimits([10, null, 12, Number.NaN, undefined])!.center, 11)
  assert.equal(controlLimits([10, null, 12])!.sigma, 2 / 1.128)
  assert.equal(controlLimits([]), null)
  assert.equal(controlLimits([null, Number.NaN]), null)
  assert.deepEqual(controlLimits([5]), { center: 5, sigma: 0, ucl: 5, lcl: 5, count: 1 })
})

test('rule 1: a point beyond either control limit', () => {
  assert.deepEqual(flagged([0, 3.5, 0, -3.1, 3], 1), [1, 3])
})

test('rule 2: the ninth point in a row on one side, and every one after it', () => {
  const above = Array.from({ length: 10 }, () => 0.5)
  assert.deepEqual(flagged(above, 2), [8, 9])
  // A point on the centre line breaks the run.
  assert.deepEqual(flagged([...above.slice(0, 5), 0, ...above.slice(0, 8)], 2), [])
  assert.deepEqual(flagged([...above.slice(0, 5), -0.5, ...above.slice(0, 9)], 2), [14])
})

test('rule 2: the run length is an option, eight for the Western Electric rules', () => {
  const above = Array.from({ length: 8 }, () => 0.5)
  assert.deepEqual(flagged(above, 2), [])
  assert.deepEqual(
    runRules(above, unit, { rules: [2], sameSideRun: 8 }).map((violation) => violation.index),
    [7],
  )
})

test('rule 3: six points steadily increasing or decreasing', () => {
  assert.deepEqual(flagged([0, 0.1, 0.2, 0.3, 0.4, 0.5], 3), [5])
  assert.deepEqual(flagged([0.5, 0.4, 0.3, 0.2, 0.1, 0, -0.1], 3), [5, 6])
  assert.deepEqual(flagged([0, 0.1, 0.2, 0.2, 0.3, 0.4, 0.5], 3), [])
})

test('rule 4: fourteen points alternating up and down', () => {
  const zigzag = Array.from({ length: 14 }, (_item, index) => (index % 2 ? 0.5 : -0.5))
  assert.deepEqual(flagged(zigzag, 4), [13])
  assert.deepEqual(flagged(zigzag.slice(0, 13), 4), [])
})

test('rules 5 and 6: two of three beyond 2 sigma, four of five beyond 1 sigma, on one side', () => {
  assert.deepEqual(flagged([0, 2.5, 0, 2.2], 5), [3])
  // The two extreme points are on opposite sides.
  assert.deepEqual(flagged([0, 2.5, 0, -2.2], 5), [])
  // The window's last point is inside 2 sigma: the pattern is completed by an extreme point, so that one is flagged.
  assert.deepEqual(flagged([2.5, 2.2, 0], 5), [1])
  assert.deepEqual(flagged([1.5, 1.2, 0, 1.1, 1.4], 6), [4])
  assert.deepEqual(flagged([1.5, 1.2, 0, 1.1, -1.4], 6), [])
})

test('rules 7 and 8: fifteen in a row within 1 sigma, eight in a row beyond it on either side', () => {
  const hugging = Array.from({ length: 15 }, (_item, index) => (index % 2 ? 0.2 : -0.3))
  assert.deepEqual(flagged(hugging, 7), [14])
  const avoiding = Array.from({ length: 8 }, (_item, index) => (index % 2 ? 1.5 : -1.5))
  assert.deepEqual(flagged(avoiding, 8), [7])
  // Eight beyond 1 sigma on one side is a shift, not a mixture.
  assert.deepEqual(
    flagged(
      Array.from({ length: 8 }, () => 1.5),
      8,
    ),
    [],
  )
})

test('rules: indices are those of the input, gaps continue a run, and a point lists every rule it breaks', () => {
  assert.deepEqual(runRules([0, null, 3.5], unit, { rules: [1] }), [{ index: 2, rules: [1] }])
  const run = [0.5, 0.5, null, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 3.5]
  assert.deepEqual(runRules(run, unit, { rules: [2, 1] }), [{ index: 9, rules: [1, 2] }])
  assert.deepEqual(runRules([1, 2, 3], null), [])
})

test('rules: a zero sigma skips the zone rules but keeps the limits', () => {
  const flat: SpcLimits = { center: 5, sigma: 0, ucl: 5, lcl: 5, count: 3 }
  assert.deepEqual(runRules([5, 5, 6], flat), [{ index: 2, rules: [1] }])
})

test('reference lines: zones, control limits and spec limits in their tones', () => {
  const lines = spcReferenceLines({ center: 10, sigma: 1, ucl: 13, lcl: 7, count: 20 }, { spec: { lsl: 6, usl: 14, target: 10 } })
  assert.deepEqual(
    lines.filter((line) => line.value2 !== undefined),
    [
      { value: 12, value2: 13, tone: 'danger' },
      { value: 11, value2: 12, tone: 'warning' },
      { value: 9, value2: 11, tone: 'success' },
      { value: 8, value2: 9, tone: 'warning' },
      { value: 7, value2: 8, tone: 'danger' },
    ],
  )
  assert.deepEqual(
    lines.filter((line) => line.value2 === undefined),
    [
      { value: 13, label: 'UCL', tone: 'danger' },
      { value: 10, label: 'CL', tone: 'neutral' },
      { value: 7, label: 'LCL', tone: 'danger' },
      { value: 14, label: 'USL', tone: 'info' },
      { value: 10, label: 'Target', tone: 'success' },
      { value: 6, label: 'LSL', tone: 'info' },
    ],
  )
  const plain = spcReferenceLines({ center: 10, sigma: 1, ucl: 13, lcl: 7, count: 20 }, { zones: false, labels: { center: 'Mean' } })
  assert.deepEqual(
    plain.map((line) => line.label),
    ['UCL', 'Mean', 'LCL'],
  )
  assert.deepEqual(spcReferenceLines(null), [])
  // Limits at 2 sigma: the zones split the distance to them in thirds, so zone A ends on the drawn limits.
  const narrow = spcReferenceLines({ center: 10, sigma: 1.5, ucl: 13, lcl: 7, count: 20 })
  assert.deepEqual(
    narrow.filter((line) => line.value2 !== undefined).map((line) => [line.value, line.value2]),
    [
      [12, 13],
      [11, 12],
      [9, 11],
      [8, 9],
      [7, 8],
    ],
  )
})

test('mark violations: a copy of each row with the flagged value in its own field', () => {
  const rows = [
    { t: 1, v: 10 },
    { t: 2, v: 20 },
    { t: 3, v: 30 },
  ]
  const marked = markViolations(rows, 'v', [{ index: 1, rules: [1] }], 'ooc')
  assert.deepEqual(marked, [
    { t: 1, v: 10, ooc: null },
    { t: 2, v: 20, ooc: 20 },
    { t: 3, v: 30, ooc: null },
  ])
  assert.equal('ooc' in rows[1], false)
  assert.deepEqual(markViolations(rows, 'v', [{ index: 0, rules: [1] }])[0], { t: 1, v: 10, violation: 10 })
})
