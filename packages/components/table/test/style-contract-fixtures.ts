/**
 * Table states the style-contract registry (`scripts/data/style-contract-cases.json`) cannot write as markup: a
 * pending `dataSource` block and a realtime update caught mid-animation. A context lists this module
 * in `modules` and marks its table with `data-style-fixture="<setup>"`; the setup runs when the table is inserted and
 * sets `data-style-fixture-ready` once the state is in place, which the context's `settledWhen` waits for.
 */
import type { Table } from '../src/table.js'
import type { TableRow, TableRowsRequest } from '../src/table-types.js'

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Where a realtime update's row animations are held: far enough in that the row is visible and tinted. */
const ANIMATION_PROGRESS = 0.3

const setups: Record<string, (table: Table) => Promise<void>> = {
  /** The first block arrives, the rest never does, so its rows keep their skeleton placeholders. */
  async 'pending-block'(table) {
    table.dataSource = {
      getRows: ({ start, count }: TableRowsRequest) =>
        start === 0
          ? Promise.resolve({ rows: Array.from({ length: count }, (_, index) => ({ id: String(index), name: `Row ${index}` })), total: count * 3 })
          : new Promise(() => {}),
    }
    await table.updateComplete
    while (!table.shadowRoot?.querySelector('.skeleton')) await nextFrame()
  },

  /** Replace `rows` with `data-next-rows`, then hold every row animation part-way through. */
  async 'live-update'(table) {
    await table.updateComplete
    await nextFrame()
    table.rows = JSON.parse(table.dataset.nextRows ?? '[]') as TableRow[]
    await table.updateComplete
    await nextFrame()
    for (const animation of table.shadowRoot?.getAnimations() ?? []) {
      const duration = Number(animation.effect?.getTiming().duration)
      animation.pause()
      animation.currentTime = duration * ANIMATION_PROGRESS
    }
  },
}

async function prepare(table: Table) {
  const setup = setups[table.dataset.styleFixture ?? '']
  if (!setup) throw new Error(`unknown table style fixture "${table.dataset.styleFixture}"`)
  await customElements.whenDefined('c2-table')
  await setup(table)
  table.dataset.styleFixtureReady = ''
}

const started = new WeakSet<Table>()
const pending = (root: ParentNode) =>
  root.querySelectorAll<Table>('c2-table[data-style-fixture]').forEach((table) => {
    if (started.has(table)) return
    started.add(table)
    void prepare(table)
  })

new MutationObserver((records) => {
  for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) pending(node.parentNode ?? node)
}).observe(document.documentElement, { childList: true, subtree: true })
pending(document)
