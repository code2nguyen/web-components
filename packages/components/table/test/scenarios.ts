import '../src/table'
import '../src/table-column'
import type { Table } from '../src/table'
import type { TableRow } from '../src/table-types'
import type { TableBenchApi, TableBenchStats } from './bench-api'

const TEAMS = ['Analytics', 'Compilers', 'Research', 'Flight', 'Networks']
const STATUSES = ['active', 'invited', 'paused']
const NAMES = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Radia Perlman', 'Barbara Liskov', 'Margaret Hamilton']

/** Deterministic rows: the same index always produces the same row, so runs are comparable. */
function makeRows(count: number, offset = 0): TableRow[] {
  const rows: TableRow[] = new Array(count)
  for (let index = 0; index < count; index++) {
    const seed = index + offset
    rows[index] = {
      id: String(seed + 1),
      name: `${NAMES[seed % NAMES.length]} ${seed + 1}`,
      team: TEAMS[seed % TEAMS.length],
      status: STATUSES[seed % STATUSES.length],
      score: ((seed * 7919) % 90000) + 10000,
      joined: `2024-${String((seed % 12) + 1).padStart(2, '0')}-${String((seed % 27) + 1).padStart(2, '0')}`,
    }
  }
  return rows
}

const main = document.querySelector('main')!
let table: Table
let rows: TableRow[] = []
let tick = 0
let marked: Element[] = []

function viewport(): HTMLElement {
  return table.shadowRoot!.querySelector<HTMLElement>('.viewport')!
}

function rowElements(): Element[] {
  return [...table.shadowRoot!.querySelectorAll('.row:not(.row--header):not(.row--state)')]
}

/**
 * Milliseconds of work an update costs: everything from the change through Lit's render to the layout it forces.
 * Reading `offsetHeight` makes the browser do style and layout right here instead of at the next frame, so the
 * number measures the table's own cost rather than the time until the next vsync.
 */
async function timed(action: () => void): Promise<number> {
  const start = performance.now()
  action()
  await table.updateComplete
  void viewport().offsetHeight
  return performance.now() - start
}

/** Waits until the table stops scheduling updates — it measures its own row height and re-renders once after mount. */
async function settle(): Promise<void> {
  let done = await table.updateComplete
  while (!done) done = await table.updateComplete
}

/** Scrolls for real and waits for the scroll event, which is what the controller listens for. */
async function scrollTo(top: number): Promise<number> {
  const element = viewport()
  if (Math.round(top) === Math.round(element.scrollTop)) return 0
  const start = performance.now()
  const scrolled = new Promise<void>((resolve) => element.addEventListener('scroll', () => resolve(), { once: true }))
  element.scrollTop = top
  await scrolled
  await settle()
  void element.offsetHeight
  return performance.now() - start
}

const api: TableBenchApi = {
  async mount(count) {
    // Building the array is the harness's cost, so it happens before the clock starts.
    rows = makeRows(count)
    tick = 0
    marked = []
    const start = performance.now()
    main.innerHTML = `
      <c2-table id="subject" row-key="id" virtual="always" row-height="36">
        <c2-table-column field="name" header="Name" width="2fr"></c2-table-column>
        <c2-table-column field="team" header="Team" width="1fr"></c2-table-column>
        <c2-table-column field="status" header="Status" width="120px"></c2-table-column>
        <c2-table-column field="score" header="Score" width="110px" align="end" format="number"></c2-table-column>
        <c2-table-column field="joined" header="Joined" width="130px"></c2-table-column>
      </c2-table>`
    table = main.querySelector<Table>('#subject')!
    await customElements.whenDefined('c2-table')
    table.rows = rows
    await table.updateComplete
    void viewport().offsetHeight
    const ms = performance.now() - start
    await settle()
    return ms
  },

  async patch(index) {
    tick++
    const next = rows.slice()
    next[index] = { ...next[index], score: 10000 + ((tick * 7919) % 90000), status: STATUSES[tick % STATUSES.length] }
    rows = next
    return timed(() => (table.rows = next))
  },

  async stream(ticks) {
    let total = 0
    for (let n = 0; n < ticks; n++) {
      // Walk across the dataset so the feed is not repeatedly touching one cached row.
      total += await api.patch((n * 977) % rows.length)
    }
    return total
  },

  async replace() {
    const next = makeRows(rows.length, ++tick * 1000)
    rows = next
    return timed(() => (table.rows = next))
  },

  async append(count) {
    const next = rows.concat(makeRows(count, rows.length))
    rows = next
    return timed(() => (table.rows = next))
  },

  async scrollToRatio(ratio) {
    const element = viewport()
    return scrollTo(Math.round((element.scrollHeight - element.clientHeight) * ratio))
  },

  async sort(field) {
    return timed(() => (table.sortModel = [{ field, direction: 'asc' }]))
  },

  async scrollToIndex(index) {
    const element = viewport()
    const before = element.scrollTop
    const start = performance.now()
    const scrolled = new Promise<void>((resolve) => element.addEventListener('scroll', () => resolve(), { once: true }))
    table.scrollToIndex(index)
    if (Math.round(element.scrollTop) !== Math.round(before)) await scrolled
    await settle()
    void element.offsetHeight
    return performance.now() - start
  },

  markRows() {
    marked = rowElements()
    return marked.length
  },

  reusedRows() {
    const current = new Set(rowElements())
    return marked.filter((element) => current.has(element)).length
  },

  stats(): TableBenchStats {
    if (!table) return { rowElements: 0, shadowElements: 0, firstIndex: -1, lastIndex: -1, scrollHeight: 0, scrollTop: 0, firstCellText: '' }
    const elements = rowElements()
    const indexOf = (element: Element | undefined) => Number(element?.getAttribute('aria-rowindex') ?? 0) - 2
    const element = viewport()
    return {
      rowElements: elements.length,
      shadowElements: table.shadowRoot!.querySelectorAll('*').length,
      firstIndex: indexOf(elements[0]),
      lastIndex: indexOf(elements.at(-1)),
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      firstCellText: elements[0]?.querySelector('.cell')?.textContent?.trim() ?? '',
    }
  },
}

window.tableBench = api
document.documentElement.dataset.benchReady = 'true'
