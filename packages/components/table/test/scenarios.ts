import '../src/table'
import '../src/table-column'
// The pager is only ever slotted into the table; the table never imports it.
import '@c2n/pagination'
import type { Table } from '../src/table'
import type { TableRow } from '../src/table-types'
import type { PagedRequest, TableBenchApi, TableBenchStats, TableScenarioApi } from './bench-api'

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

// --- Paging -------------------------------------------------------------------------------------------------------
// A fake server the specs drive frame by frame. Requests park on a stored resolver rather than a timer, so nothing
// here depends on wall-clock timing — which is what keeps the suite honest on all three engines.

let serverRows: TableRow[] = []
let requestLog: PagedRequest[] = []
let parked: (() => void) | null = null

const scenarioApi: TableScenarioApi = {
  async usePagedSource({ total, failAt, manual, pageSize, pager = true }) {
    serverRows = makeRows(total)
    requestLog = []
    parked = null
    main.innerHTML = `
      <c2-table id="paged" row-key="id" sortable page-size="${pageSize}" style="height: 240px; width: 560px">
        <c2-table-column field="name" header="Name" width="2fr" sortable></c2-table-column>
        <c2-table-column field="score" header="Score" width="120px" align="end" sortable></c2-table-column>
        ${pager ? '<c2-pagination slot="footer" variant="compact" hide-page-size style="width: 100%"></c2-pagination>' : ''}
      </c2-table>`
    table = main.querySelector<Table>('c2-table')!
    table.dataSource = {
      async getRows(request) {
        requestLog.push({ start: request.start, count: request.count, sort: request.sort.map((entry) => ({ ...entry })) })
        if (manual) await new Promise<void>((resolve) => (parked = resolve))
        if (failAt !== undefined && request.start === failAt) throw new Error('The request failed')
        const sort = request.sort[0]
        const ordered = sort
          ? [...serverRows].sort((a, b) => {
              const direction = sort.direction === 'desc' ? -1 : 1
              return String(a[sort.field]).localeCompare(String(b[sort.field]), undefined, { numeric: true }) * direction
            })
          : serverRows
        return { rows: ordered.slice(request.start, request.start + request.count), total: serverRows.length }
      },
    }
    await customElements.whenDefined('c2-pagination')
    // Settle either way: with `manual` the render completes while the request stays parked, which is exactly the
    // state the loading assertions need — and it guarantees `release()` has something to release.
    await settle()
  },

  async release() {
    const resolve = parked
    parked = null
    resolve?.()
    await settle()
  },

  requests() {
    return requestLog.map((entry) => ({ ...entry }))
  },

  setTotal(total: number) {
    serverRows = makeRows(total)
  },
}

window.tableScenario = scenarioApi
document.documentElement.dataset.benchReady = 'true'
// The shared `renderScenario` fixture waits for this one.
document.documentElement.dataset.modulesReady = 'true'
