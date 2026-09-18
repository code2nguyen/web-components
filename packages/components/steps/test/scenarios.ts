import '../src/steps'
import type { StepNode } from '../src/step-types'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

// A stage with sub-steps: the group. `pagination` authors no status, so it takes one from its children.
const TRACE = `
  <c2-step status="success" label="goto" detail="[0].goto" trailing="500 ms"></c2-step>
  <c2-step label="pagination" detail="[2].pagination" trailing="1.53 s">
    <c2-step status="success" label="collect" trailing="1 ms"></c2-step>
    <c2-step status="success" label="append" trailing="1 ms"></c2-step>
  </c2-step>
  <c2-step status="skipped" label="notify" detail="[3].notify"></c2-step>
`

const WIZARD = `
  <c2-step label="Account"></c2-step>
  <c2-step label="Plan"></c2-step>
  <c2-step label="Payment"></c2-step>
  <c2-step label="Done"></c2-step>
`

const markup: Record<string, string> = {
  default: `<c2-steps id="subject" aria-label="Run trace">${TRACE}</c2-steps>`,
  number: `<c2-steps id="subject" marker="number" aria-label="Run trace">${TRACE}</c2-steps>`,
  none: `<c2-steps id="subject" marker="none" aria-label="Run trace">${TRACE}</c2-steps>`,
  // No group anywhere, so no chevron column.
  flat: `<c2-steps id="subject" aria-label="Checkout">${WIZARD}</c2-steps>`,
  wizard: `<c2-steps id="subject" marker="number" current="1" aria-label="Checkout">${WIZARD}</c2-steps>`,
  statuses: `<c2-steps id="subject" aria-label="Statuses">
    <c2-step status="pending" label="Pending"></c2-step>
    <c2-step status="current" label="Current"></c2-step>
    <c2-step status="running" label="Running"></c2-step>
    <c2-step status="success" label="Success"></c2-step>
    <c2-step status="error" label="Error"></c2-step>
    <c2-step status="warning" label="Warning"></c2-step>
    <c2-step status="skipped" label="Skipped"></c2-step>
  </c2-steps>`,
  // Every stage starts pending and closed; the spec drives the statuses and watches the disclosures follow.
  run: `<c2-steps id="subject" aria-label="Pipeline">
    <c2-step label="build" id="build">
      <c2-step status="pending" label="install" id="install"></c2-step>
      <c2-step status="pending" label="compile" id="compile"></c2-step>
    </c2-step>
    <c2-step label="test" id="test">
      <c2-step status="pending" label="unit" id="unit"></c2-step>
      <c2-step status="pending" label="e2e" id="e2e"></c2-step>
    </c2-step>
  </c2-steps>`,
  // `collapsed` in the markup starts a stage folded, and a pending one has no reason to reopen.
  'authored-collapsed': `<c2-steps id="subject" aria-label="Pipeline">
    <c2-step label="build" collapsed>
      <c2-step status="pending" label="install"></c2-step>
    </c2-step>
  </c2-steps>`,
  hierarchy: `<c2-steps id="subject" marker="number" aria-label="Plan">
    <c2-step label="Prepare">
      <c2-step status="success" label="Install"></c2-step>
      <c2-step label="Configure">
        <c2-step status="success" label="Secrets"></c2-step>
      </c2-step>
    </c2-step>
    <c2-step status="current" label="Migrate"></c2-step>
  </c2-steps>`,
  // Exactly the shape Astro produces: every island wrapped in a `display: contents` element.
  wrapped: `<c2-steps id="subject" marker="number" aria-label="Wrapped">
    <astro-island style="display:contents"><c2-step label="Account"></c2-step></astro-island>
    <astro-island style="display:contents"><c2-step label="Plan">
      <astro-island style="display:contents"><c2-step status="success" label="Card"></c2-step></astro-island>
      <astro-island style="display:contents"><c2-step status="error" label="Invoice"></c2-step></astro-island>
    </c2-step></astro-island>
  </c2-steps>`,
  // Exactly what server-side rendering emits: `status` reflects, so every step arrives with the default stamped
  // on it. That must not read as "the author set this", or a stage never rolls its children up.
  'ssr-pending': `<c2-steps id="subject" aria-label="Pipeline">
    <c2-step label="build" status="pending">
      <c2-step status="success" label="compile" id="compile"></c2-step>
      <c2-step status="pending" label="bundle" id="bundle"></c2-step>
    </c2-step>
    <c2-step label="ship" status="pending"></c2-step>
  </c2-steps>`,
  // The disclosure affordance is opt-in: fill the `toggle` slot and every row gets a column for it.
  'toggle-slot': `<c2-steps id="subject" aria-label="Pipeline">
    <c2-step label="build">
      <span slot="toggle" data-testid="chevron">&gt;</span>
      <c2-step status="success" label="compile"></c2-step>
    </c2-step>
    <c2-step status="pending" label="ship"></c2-step>
  </c2-steps>`,
  // Only `text--flex-direction` set: does the detail land under the label, left-aligned, on its own?
  stacked: `<c2-steps id="subject" style="width:420px;--c2-step__text--flex-direction:column" aria-label="Stacked">
    <c2-step status="success" label="Account" detail="Signed in as ada@example.com" trailing="1.2 s"></c2-step>
    <c2-step status="running" label="Plan" detail="Team, billed yearly"></c2-step>
  </c2-steps>`,
  // Long text and deep nesting: a row must stay one line at every depth.
  long: `<c2-steps id="subject" style="width:420px" aria-label="Long">
    <c2-step status="success" label="short" trailing="1 ms"></c2-step>
    <c2-step label="a stage with a label long enough to run past the width of the list" trailing="1.53 s">
      <c2-step status="success" label="a sub-step whose label is also far too long to fit on one line here" detail="/very/long/detail/path/that/keeps/going/and/going" trailing="1 ms"></c2-step>
      <c2-step label="deeper" trailing="620 ms">
        <c2-step status="running" label="deepest — this one is nested three levels down and still has a long label" trailing="2 ms"></c2-step>
      </c2-step>
    </c2-step>
  </c2-steps>`,
  slots: `<c2-steps id="subject" aria-label="Slotted">
    <c2-step status="success">
      <span slot="label">Slotted label</span>
      <span slot="detail">Slotted detail</span>
      <span slot="trailing">Slotted trailing</span>
    </c2-step>
    <c2-step status="pending" label="Custom marker">
      <svg slot="marker" data-testid="custom-marker" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16" stroke="currentColor" /></svg>
    </c2-step>
  </c2-steps>`,
  data: `<c2-steps id="subject" aria-label="Run trace from data"></c2-steps>`,
  'data-wizard': `<c2-steps id="subject" marker="number" current="1" aria-label="Checkout from data"></c2-steps>`,
  renderers: `<c2-steps id="subject" aria-label="Rendered"></c2-steps>`,
  'render-item': `<c2-steps id="subject" aria-label="Rendered whole"></c2-steps>`,
}

main.innerHTML = `
  <button id="before">Before</button>
  ${markup[scenario] ?? markup.default}
  <button id="after">After</button>
`

const subject = document.querySelector('c2-steps')!

if (scenario === 'data' || scenario === 'renderers' || scenario === 'render-item') {
  const nodes: StepNode[] = [
    { id: 'goto', status: 'success', label: 'goto', detail: '[0].goto', trailing: '500 ms' },
    {
      id: 'pagination',
      label: 'pagination',
      detail: '[2].pagination',
      trailing: '1.53 s',
      children: [
        { id: 'collect', status: 'success', label: 'collect', trailing: '1 ms' },
        { id: 'append', status: 'success', label: 'append', trailing: '1 ms' },
      ],
    },
    { id: 'notify', status: 'skipped', label: 'notify', detail: '[3].notify' },
  ]
  subject.steps = nodes
}

if (scenario === 'data-wizard') {
  subject.steps = [{ label: 'Account' }, { label: 'Plan' }, { label: 'Payment' }, { label: 'Confirm' }]
}

if (scenario === 'renderers') {
  subject.renderLabel = (context) => `${context.path} ${String(context.node.label).toUpperCase()}`
  subject.renderTrailing = (context) => `${context.status} · ${context.node.trailing ?? ''}`
  subject.renderMarker = (context) => (context.status === 'error' ? '!' : '✓')
  subject.renderToggle = (context) => (context.node.children?.length ? '›' : '')
}

if (scenario === 'render-item') {
  subject.renderItem = (context) => `${context.path}/${context.level} ${context.node.label} (${context.status})`
  // The marker is its own column, not part of the row's text, so it keeps its own renderer alongside `renderItem`.
  subject.renderMarker = () => 'i'
}

// The spec drives a run by id rather than by reaching into the DOM, which is how a task runner would.
declare global {
  interface Window {
    setStatus: (id: string, status: string) => void
    /** Filled by the spec that watches `step-toggle`; the harness only declares it. */
    __toggles: string[]
  }
}
window.setStatus = (id, status) => {
  const step = document.getElementById(id) ?? subject.shadowRoot?.querySelector(`#${id}`)
  step?.setAttribute('status', status)
}

await subject.updateComplete
// The container writes level/position onto its steps after render, so wait a frame for the sync pass to land.
await new Promise((resolve) => requestAnimationFrame(resolve))
main.dataset.ready = 'true'
