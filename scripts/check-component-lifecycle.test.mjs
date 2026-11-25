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

test('follows the helpers firstUpdated calls, transitively', () => {
  const findings = analyzeLifecycleSource(
    'class Example { @state() private ready = false; firstUpdated() { this.setup() } private setup() { this.mark() } private mark() { this.ready = true } }',
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].via, 'through `setup()` → `mark()`')
  assert.doesNotMatch(findings[0].reason, /through/)
})

test('does not follow an async helper, a helper called from a callback, or the callbacks of a helper', () => {
  const findings = analyzeLifecycleSource(`class Example {
    @state() private ready = false
    firstUpdated() { void this.load(); this.addEventListener('x', () => this.mark()); this.listen() }
    private async load() { await fetch('/'); this.ready = true }
    private mark() { this.ready = true }
    private listen() { requestAnimationFrame(() => { this.ready = true }) }
  }`)
  assert.deepEqual(findings, [])
})

test('a helper that calls itself is followed once', () => {
  const findings = analyzeLifecycleSource(
    'class Example { @state() private n = 0; firstUpdated() { this.tick() } private tick() { this.n = this.n + 1; this.tick() } }',
  )
  assert.equal(findings.length, 1)
})

test('an increment is a write', () => {
  const findings = analyzeLifecycleSource('class Example { @state() private n = 0; firstUpdated() { this.n++; --this.n } }')
  assert.equal(findings.length, 2)
})

test('accepts a SlotReplayController beside the slotchange handler', () => {
  const findings = analyzeSlotPresenceSource(
    'class Example { @state() private hasActions = false; private hydration = new SlotReplayController(this, () => this.read()); render() { return html`<slot @slotchange=${this.read}></slot>` } }',
  )
  assert.deepEqual(findings, [])
})

test('a SlotReplayController that replays something other than the slots is no slot-presence policy', () => {
  const findings = analyzeSlotPresenceSource(
    'class Example { @state() private hasFooter = false; private hydration = new SlotReplayController(this, () => this.detectSupport()); private detectSupport() { this.pip = true } render() { return html`<slot name="footer" @slotchange=${this.onFooter}></slot>` } }',
  )
  assert.equal(findings.length, 1)
})

test('a SlotReplayController whose handler writes the presence state is a policy', () => {
  const findings = analyzeSlotPresenceSource(
    'class Example { @state() private hasActions = false; private hydration = new SlotReplayController(this, () => this.readActions()); private readActions() { this.hasActions = true } render() { return html`<slot name="actions" @slotchange=${(e) => (this.hasActions = true)}></slot>` } }',
  )
  assert.deepEqual(findings, [])
})

test('a write in a callback of firstUpdated() runs later and passes, unless an array method calls it on the spot', () => {
  const findings = analyzeLifecycleSource(`class Example {
    @state() private width = 0
    firstUpdated() {
      void this.updateComplete.then(() => { this.width = 1 })
      new ResizeObserver(() => { this.width = 2 }).observe(this)
      ;[1].forEach((n) => { this.width = n })
    }
  }`)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].line, 6)
})

test('follows a helper written as an arrow-function field', () => {
  const findings = analyzeLifecycleSource(
    'class Example { @state() private still = false; firstUpdated() { this.onMotion() } private onMotion = () => { this.still = true } }',
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].via, 'through `onMotion()`')
})

test('does not walk into a requestUpdate() override', () => {
  const findings = analyzeLifecycleSource('class Example { firstUpdated() { this.requestUpdate() } override requestUpdate() { super.requestUpdate() } }')
  assert.equal(findings.length, 1)
})

test('follows an ECMAScript-private helper', () => {
  const findings = analyzeLifecycleSource(
    'class Example { @state() private status = ""; firstUpdated() { this.#start() } #start() { this.status = "loading" } }',
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].via, 'through `#start()`')
})

test('functions invoked on the spot are not deferred; object-literal methods are', () => {
  const findings = analyzeLifecycleSource(`class Example {
    @state() private n = 0
    firstUpdated() {
      ;(() => { this.n = 1 })()
      new Promise((resolve) => { this.n = 2; resolve(0) })
      Array.from([1], (x) => (this.n = x))
      ;[1].reduceRight((a, x) => (this.n = x), 0)
      this.view = new EditorView({ handleDOMEvents: { focus() { this.n = 3 } } })
    }
  }`)
  assert.deepEqual(
    findings.map((finding) => finding.line),
    [4, 5, 6, 7],
  )
})

test('a replay handler that only compares a presence flag is no policy; a #private one that writes it is', () => {
  const reads = analyzeSlotPresenceSource(
    'class Example { @state() private hasA = false; h = new SlotReplayController(this, () => this.check()); check() { if (this.hasA === true) log() } render() { return html`<slot @slotchange=${this.onA}></slot>` } }',
  )
  assert.equal(reads.length, 1)
  const writes = analyzeSlotPresenceSource(
    'class Example { @state() private hasA = false; readonly #h = new SlotReplayController(this, () => void this.#onA()); #onA() { this.hasA = true } render() { return html`<slot @slotchange=${this.#onA}></slot>` } }',
  )
  assert.deepEqual(writes, [])
})

test('an async callback runs later, even an array method one', () => {
  const findings = analyzeLifecycleSource(
    'class Example { @state() private n = 0; firstUpdated() { void Promise.all([1].map(async (x) => { await load(x); this.n = x })) } }',
  )
  assert.deepEqual(findings, [])
})
