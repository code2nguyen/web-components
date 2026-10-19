import { html } from 'lit'
import type { Flow, FlowEdge, FlowNode } from '@c2n/components/flow'
import '@c2n/feather-icons/icons/key.js'
import '@c2n/feather-icons/icons/link.js'

/**
 * Makes the flow examples live. `[data-flow-demo="events"]` reports clicks and layout changes into the `output` next
 * to it; `[data-flow-demo="custom"]` draws its nodes with `renderNode` (a kind, the step's metric and a progress bar);
 * `[data-flow-demo="editable"]` plays the application of an editable flow, applying every edit to `nodes` and `edges`;
 * `[data-flow-demo="schema"]` is a database schema: key and link icons on the columns, and the edits of an editable
 * flow applied to tables and foreign keys.
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

/** The edge an event names: its nodes, and its rows, since two nodes can be joined between several pairs of rows. */
const same = (edge: FlowEdge, detail: Pick<FlowEdge, 'source' | 'target' | 'sourcePort' | 'targetPort'>) =>
  edge.source === detail.source && edge.target === detail.target && edge.sourcePort === detail.sourcePort && edge.targetPort === detail.targetPort

/** What an application does with an editable flow: apply each edit, then let the user name a new node. */
function wireEditable(flow: Flow, say: (text: string) => void) {
  let next = 1
  // The toolbar slotted into `actions`: each button names the flow method it runs.
  const actions: Record<string, () => void> = { add: () => flow.addNode(), layout: () => flow.resetLayout(), fit: () => flow.fitView() }
  flow.addEventListener('click', (event) => {
    const action = (event.target as Element).closest<HTMLElement>('[data-flow-action]')?.dataset.flowAction
    if (action) actions[action]?.()
  })
  flow.addEventListener('node-add', async ({ detail }) => {
    const id = `note-${next++}`
    flow.nodes = [...flow.nodes, { id, label: 'New note', position: detail.position }]
    if (detail.source) flow.edges = [...flow.edges, { source: detail.source, target: id, sourceSide: detail.sourceSide, targetSide: detail.targetSide }]
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
    flow.edges = [...flow.edges, { source: detail.source, target: detail.target, sourceSide: detail.sourceSide, targetSide: detail.targetSide }]
    say(`edge-add: ${detail.source} (${detail.sourceSide}) → ${detail.target} (${detail.targetSide})`)
  })
  flow.addEventListener('edge-delete', ({ detail }) => {
    flow.edges = flow.edges.filter((edge) => !same(edge, detail))
    say(`edge-delete: ${detail.source} → ${detail.target}`)
  })
  flow.addEventListener('edge-edit', ({ detail }) => {
    flow.edges = flow.edges.map((edge) => {
      if (!same(edge, detail)) return edge
      const next: FlowEdge = { ...edge, label: detail.label }
      if (!detail.label) delete next.label
      return next
    })
    say(`edge-edit: ${detail.source} → ${detail.target}${detail.label ? `, "${detail.label}"` : ', label removed'}`)
  })
}

/** A table's primary key gets a key icon and every column a foreign key arrives at a link icon. */
function withKeyIcons(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const foreign = new Set(edges.map((edge) => `${edge.target}\u0000${edge.targetPort ?? ''}`))
  return nodes.map((node) => ({
    ...node,
    rows: node.rows?.map((row) => ({
      ...row,
      icon:
        row.id === 'id'
          ? html`<c2-feather-key class="schema-key"></c2-feather-key>`
          : foreign.has(`${node.id}\u0000${row.id}`)
            ? html`<c2-feather-link></c2-feather-link>`
            : undefined,
    })),
  }))
}

/** What an application does with an editable schema: tables are nodes, foreign keys are edges between two columns. */
function wireSchema(flow: Flow, say: (text: string) => void) {
  let next = 1
  const update = (nodes: FlowNode[], edges: FlowEdge[]) => {
    flow.edges = edges
    flow.nodes = withKeyIcons(nodes, edges)
  }
  update(flow.nodes, flow.edges)
  flow.addEventListener('edge-add', ({ detail }) => {
    // The application picks the cardinality: one row of the source to many rows of the target.
    update(flow.nodes, [...flow.edges, { ...detail, sourceMarker: 'one', targetMarker: 'many' }])
    say(`edge-add: ${detail.source}.${detail.sourcePort ?? ''} → ${detail.target}.${detail.targetPort ?? ''}`)
  })
  flow.addEventListener('edge-delete', ({ detail }) => {
    update(
      flow.nodes,
      flow.edges.filter((edge) => !same(edge, detail)),
    )
    say(`edge-delete: ${detail.source}.${detail.sourcePort ?? ''} → ${detail.target}.${detail.targetPort ?? ''}`)
  })
  flow.addEventListener('node-add', ({ detail }) => {
    const id = `table_${next++}`
    const nodes = [...flow.nodes, { id, label: id, meta: 'public', position: detail.position, rows: [{ id: 'id', label: 'id', meta: 'uuid' }] }]
    update(nodes, flow.edges)
    say(`node-add: ${id}`)
  })
  flow.addEventListener('node-edit', ({ detail }) => {
    update(
      flow.nodes.map((node) => (node.id === detail.id ? { ...node, label: detail.label } : node)),
      flow.edges,
    )
  })
  flow.addEventListener('row-move', ({ detail }) => {
    const nodes = flow.nodes.map((node) => {
      if (node.id !== detail.id || !node.rows) return node
      const rows = [...node.rows]
      const [moved] = rows.splice(detail.from, 1)
      rows.splice(detail.to, 0, moved)
      return { ...node, rows }
    })
    update(nodes, flow.edges)
    say(`row-move: ${detail.id}.${detail.row} from ${detail.from} to ${detail.to}`)
  })
  flow.addEventListener('node-delete', ({ detail }) => {
    update(
      flow.nodes.filter((node) => node.id !== detail.id),
      flow.edges.filter((edge) => edge.source !== detail.id && edge.target !== detail.id),
    )
    say(`node-delete: ${detail.id}`)
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
    if (flow.dataset.flowDemo === 'schema') {
      wireSchema(flow, say)
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
