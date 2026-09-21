import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeLifecycleSource, analyzeSlotPresenceSource } from './check-component-lifecycle.mjs'

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
