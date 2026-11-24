import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeLifecycleSource, analyzeSlotPresenceSource, compareWithKnown } from './check-component-lifecycle.mjs'

test('rejects requestUpdate inside firstUpdated', () => {
  const findings = analyzeLifecycleSource('class Example { firstUpdated() { this.requestUpdate() } }')
  assert.equal(findings.length, 1)
  assert.match(findings[0].reason, /requestUpdate/)
})

test('rejects reactive property writes inside firstUpdated', () => {
  const findings = analyzeLifecycleSource('class Example { @state() private ready = false; firstUpdated() { this.ready = true } }')
  assert.equal(findings.length, 1)
  assert.match(findings[0].reason, /ready/)
})

test('allows non-reactive DOM cache writes inside firstUpdated', () => {
  const findings = analyzeLifecycleSource('class Example { private node; firstUpdated() { this.node = this.querySelector("div") } }')
  assert.deepEqual(findings, [])
})

test('rejects slotchange-only reactive presence state', () => {
  const findings = analyzeSlotPresenceSource(
    'class Example { @state() private hasLabel = false; render() { return html`<slot @slotchange=${this.changed}></slot>` } }',
  )
  assert.equal(findings.length, 1)
})

test('accepts an explicit shared slot-presence policy', () => {
  const findings = analyzeSlotPresenceSource(
    'class Example { @state() private hasLabel = false; private presence = new SlotPresenceController(this, [""]); render() { return html`<slot @slotchange=${this.changed}></slot>` } }',
  )
  assert.deepEqual(findings, [])
})

const finding = (file, reason = 'reason') => ({ file, line: 1, reason })

test('known violations pass, whatever line they moved to', () => {
  assert.deepEqual(compareWithKnown([{ ...finding('a.ts'), line: 40 }], ['a.ts reason']), { added: [], stale: [] })
})

test('a violation the known list does not cover is reported', () => {
  const { added, stale } = compareWithKnown([finding('a.ts'), finding('b.ts')], ['a.ts reason'])
  assert.deepEqual(added, [finding('b.ts')])
  assert.deepEqual(stale, [])
})

test('a known entry that no longer occurs is reported as stale', () => {
  assert.deepEqual(compareWithKnown([], ['a.ts reason']), { added: [], stale: ['a.ts reason'] })
})

test('a second violation of the same rule in one file is not covered by one entry', () => {
  const { added } = compareWithKnown([finding('a.ts'), finding('a.ts')], ['a.ts reason'])
  assert.equal(added.length, 1)
})
