import { html } from 'lit'
import type { Flow, FlowNode } from '@c2n/flow'

/**
 * Makes the flow examples live. `[data-flow-demo="events"]` reports clicks and layout changes into the `output` next
 * to it; `[data-flow-demo="custom"]` draws its nodes with `renderNode` (a kind, the step's metric and a progress bar);
 * `[data-flow-demo="editable"]` plays the application of an editable flow, applying every edit to `nodes` and `edges`.
 */

interface TrainingStep {
  kind: string
  progress: number
  metric: string
}

const seeded = new WeakSet<Element>()

function renderTrainingNode({ node, status }: { node: FlowNode; status: string }) {
  const step = node.data as TrainingStep
  const fill = status === 'success' ? '#16a34a' : 'var(--c2-theme--color-primary, #0265dc)'
  return html`<div style="display:grid;gap:6px">
    <span style="font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:var(--c2-theme--color-on-surface-variant, #71717a)">${step.kind}</span>
    <strong style="font-size:14px;font-weight:600">${node.label}</strong>
    <span style="height:4px;border-radius:2px;overflow:hidden;background:var(--c2-theme--color-surface-container, #f4f4f5)">
      <span style="display:block;height:100%;width:${step.progress}%;background:${fill}"></span>
    </span>
    <span style="display:flex;justify-content:space-between;font-size:12px;color:var(--c2-theme--color-on-surface-variant, #71717a)">
      <span>${step.metric}</span><span>${step.progress}%</span>
    </span>
  </div>`
}

/** What an application does with an editable flow: apply each edit, then let the user name a new node. */
function wireEditable(flow: Flow, say: (text: string) => void) {
  let next = 1
  flow.addEventListener('node-add', async ({ detail }) => {
    const id = `note-${next++}`
    flow.nodes = [...flow.nodes, { id, label: 'New note', position: detail.position }]
    if (detail.source) flow.edges = [...flow.edges, { source: detail.source, target: id }]
    say(`node-add${detail.source ? ` after ${detail.source}` : ''} at ${detail.position.x}, ${detail.position.y}`)
    await flow.updateComplete
    void flow.editLabel(id)
  })
  flow.addEventListener('node-edit', ({ detail }) => {
    flow.nodes = flow.nodes.map((node) => (node.id === detail.id ? { ...node, label: detail.label } : node))
    say(`node-edit: ${detail.label}`)
  })
  flow.addEventListener('node-delete', ({ detail }) => {
    flow.nodes = flow.nodes.filter((node) => node.id !== detail.id)
    flow.edges = flow.edges.filter((edge) => edge.source !== detail.id && edge.target !== detail.id)
    say(`node-delete: ${detail.id}`)
  })
  flow.addEventListener('edge-add', ({ detail }) => {
    flow.edges = [...flow.edges, { source: detail.source, target: detail.target }]
    say(`edge-add: ${detail.source} → ${detail.target}`)
  })
  flow.addEventListener('edge-delete', ({ detail }) => {
    flow.edges = flow.edges.filter((edge) => edge.source !== detail.source || edge.target !== detail.target)
    say(`edge-delete: ${detail.source} → ${detail.target}`)
  })
}

function seedExamples(): void {
  document.querySelectorAll<Flow>('c2-flow[data-flow-demo]').forEach((flow) => {
    if (seeded.has(flow)) return
    seeded.add(flow)
    const output = flow.parentElement?.querySelector('output')
    const say = (text: string) => {
      if (output) output.textContent = text
    }
    if (flow.dataset.flowDemo === 'custom') {
      flow.renderNode = renderTrainingNode
      return
    }
    if (flow.dataset.flowDemo === 'editable') {
      wireEditable(flow, say)
      return
    }
    flow.addEventListener('node-click', ({ detail }) => say(`node-click: ${detail.node.label}`))
    flow.addEventListener('layout-change', ({ detail }) =>
      say(`layout-change: ${detail.reason}, ${detail.direction}${detail.positions ? ', saved in this browser' : ''}`),
    )
  })
}

void customElements.whenDefined('c2-flow').then(() => {
  seedExamples()
  new MutationObserver(seedExamples).observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('astro:page-load', seedExamples)
})
