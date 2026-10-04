import assert from 'node:assert/strict'
import test from 'node:test'

import { analyze, attributeLift, isProblem, journeyLift } from '../../lib/analysis.ts'
import { applyFocus } from '../../lib/focus.ts'
import { placeOfFailure, quickAnswers } from '../../lib/insights.ts'
import { parseOtlpLogs } from '../../lib/otlp.ts'
import { createSampleDocument, createSampleJsonl } from '../../lib/sample.ts'

const { records } = parseOtlpLogs(createSampleJsonl())
const analysis = analyze(records)
const template = (id: string | undefined) => (id ? analysis.patternById.get(id)?.template : undefined)

test('the sample is deterministic and both encodings parse to the same records', () => {
  assert.equal(createSampleJsonl(), createSampleJsonl())
  assert.deepEqual(parseOtlpLogs(JSON.stringify(createSampleDocument())).records, records)
  assert.ok(records.length > 5000)
})

test('the story finds the surge, its trigger, the recovery and the silent service', () => {
  const kinds = analysis.chapters.map((chapter) => chapter.kind)
  assert.equal(kinds[0], 'opening')
  assert.equal(kinds[kinds.length - 1], 'closing')

  const surge = analysis.chapters.find((chapter) => chapter.kind === 'surge')
  assert.ok(surge, 'an error surge is detected')
  assert.match(surge.title, /payment/)
  assert.match(surge.text, /config reloaded/)
  assert.match(surge.text, /likely trigger/)

  const recovery = analysis.chapters.find((chapter) => chapter.kind === 'recovery')
  assert.ok(recovery && recovery.start > surge.start)

  const silence = analysis.chapters.find((chapter) => chapter.kind === 'silence')
  assert.ok(silence)
  assert.equal(silence.title, 'inventory goes quiet')
  assert.match(silence.text, /SIGTERM/)
  assert.match(silence.text, /restart/)

  const reaction = analysis.chapters.find((chapter) => chapter.kind === 'new-behaviour' && /reservation skipped/.test(chapter.text))
  assert.ok(reaction, 'the checkout fallback is attributed to the silence')
  assert.match(reaction.text, /inventory went silent/)
})

test('failing checkouts are compared with healthy checkouts only', () => {
  const { divergence } = analysis
  assert.match(template(divergence.entry) ?? '', /^POST \/api\/checkout received/)
  assert.ok(divergence.failed > 20 && divergence.ok > 300)
  assert.ok(divergence.sharedPath.length >= 3, 'both share the first steps')
  assert.match(template(divergence.signatures[0]?.patternId) ?? '', /timed out/)
  assert.ok(divergence.missing.some((signature) => /payment authorized/.test(template(signature.patternId) ?? '')))
})

test('the differences point at the payment pod', () => {
  const place = placeOfFailure(analysis)
  assert.equal(place?.key, 'k8s.pod.name')
  assert.equal(place?.value, 'payment-5f7c9-x2k')
  assert.equal(place?.targetShare, 1)

  const lifts = journeyLift(analysis.records, analysis.journeys, analysis.divergence.entry)
  assert.ok(lifts.every((lift) => lift.lift >= 1.5))
  const recordLevel = attributeLift(analysis.records, (record) => isProblem(record.severity))
  assert.ok(recordLevel.some((lift) => lift.key === 'k8s.pod.name' && lift.value === 'payment-5f7c9-x2k'))
  // Identifiers are never offered as an explanation.
  assert.ok(!recordLevel.some((lift) => lift.key === 'order.id'))
})

test('quick answers and the lens agree with the story', () => {
  const answers = quickAnswers(analysis)
  assert.deepEqual(
    answers.map((answer) => answer.question),
    ['What fails most?', 'When did it go wrong?', 'What changed right before?', 'Where does it happen?', 'Did anything stop logging?'],
  )
  const where = answers.find((answer) => answer.question === 'Where does it happen?')
  const inLens = applyFocus(analysis.records, where?.focus ?? {}, analysis.patternOf)
  assert.ok(inLens.length > 0 && inLens.every((record) => record.resource['k8s.pod.name'] === 'payment-5f7c9-x2k'))
})

test('a calm file gets a calm story', () => {
  const calm = analyze(records.filter((record) => !isProblem(record.severity)))
  assert.ok(!calm.chapters.some((chapter) => chapter.kind === 'surge'))
  assert.equal(calm.chapters[calm.chapters.length - 1].title, 'A quiet file')
})
