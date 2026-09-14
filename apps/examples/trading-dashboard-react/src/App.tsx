import { useEffect, useMemo, useRef, useState } from 'react'
import type { Table } from '@c2n/table'
import type { Select } from '@c2n/select'
import type { TextField } from '@c2n/text-field'
import type { Switch } from '@c2n/switch'
import { useCustomEvent } from './hooks/useCustomEvent'
import { SECTORS, changePct, initialPositions, marketValue, tick, type Position } from './data/positions'

// `TableRow` is `Record<string, unknown>`, so a row type handed to `rows` has to carry an index signature.
type Row = Position & { value: number; change: number } & Record<string, unknown>

const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2 })

/**
 * A cell rendered by React rather than by the table.
 *
 * `renderCell` is handed to Lit, so it cannot return JSX — it would have to build DOM nodes by hand. A column
 * marked `cellSlot` puts a `<slot name="cell:<row key>:<field>">` in each cell instead, and anything the app
 * renders into that slot is the cell body. The element stays in this document's light DOM, so ordinary CSS
 * reaches it.
 */
function Delta({ row }: { row: Row }) {
  return (
    <span slot={`cell:${row.symbol}:change`} className={row.change >= 0 ? 'delta delta--up' : 'delta delta--down'}>
      {row.change >= 0 ? '▲' : '▼'} {percent.format(Math.abs(row.change))}
    </span>
  )
}

export function App() {
  const [positions, setPositions] = useState<Position[]>(initialPositions)
  const [live, setLive] = useState(true)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const tableRef = useRef<Table>(null)
  const searchRef = useRef<TextField>(null)
  const sectorRef = useRef<Select>(null)
  const liveRef = useRef<Switch>(null)

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setPositions(tick), 1200)
    return () => clearInterval(id)
  }, [live])

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim().toLowerCase()
    return positions
      .filter((position) => !sector || position.sector === sector)
      .filter((position) => !needle || `${position.symbol} ${position.name}`.toLowerCase().includes(needle))
      .map((position) => ({ ...position, value: marketValue(position), change: changePct(position) }))
  }, [positions, query, sector])

  const totals = useMemo(() => {
    const value = rows.reduce((sum, row) => sum + row.value, 0)
    const open = rows.reduce((sum, row) => sum + row.open * row.quantity, 0)
    return { value, change: open ? (value - open) / open : 0, count: rows.length }
  }, [rows])

  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.symbol)), [rows, selected])

  // Kebab-case custom events have no `on*` spelling in JSX, so they are wired through refs. `input` and `change`
  // go the same way on purpose: React's `onChange` is its own synthetic event with form-control semantics that
  // these elements do not participate in.
  //
  // No cast on the event: each component declares its own event map, so the detail is already narrowed — and
  // narrowed differently for the same name on two components.
  useCustomEvent(tableRef, 'selection-change', (event) => setSelected(event.detail.value))
  useCustomEvent(searchRef, 'input', () => setQuery(searchRef.current?.value ?? ''))
  useCustomEvent(sectorRef, 'selection-change', (event) => setSector(event.detail.value[0] ?? ''))
  useCustomEvent(liveRef, 'change', () => setLive(liveRef.current?.checked ?? false))

  return (
    <div className="app">
      <header className="app__head">
        <div>
          <h1>Positions</h1>
          <p>
            {totals.count} holdings ·{' '}
            <c2-badge tone={live ? 'success' : 'neutral'} dot pulse={live || undefined}>
              {live ? 'Live' : 'Paused'}
            </c2-badge>
          </p>
        </div>

        <div className="app__controls">
          <c2-text-field ref={searchRef} type="search" clearable placeholder="Filter symbol or name" value={query} />
          <c2-select ref={sectorRef} placeholder="All sectors" value={sector ? [sector] : []}>
            <c2-list-item value="">All sectors</c2-list-item>
            {SECTORS.map((name) => (
              <c2-list-item key={name} value={name}>
                {name}
              </c2-list-item>
            ))}
          </c2-select>
          <c2-switch ref={liveRef} checked={live}>
            Live
          </c2-switch>
        </div>
      </header>

      <section className="stats">
        <c2-card>
          <span className="stats__label">Market value</span>
          <strong className="stats__value">{currency.format(totals.value)}</strong>
        </c2-card>
        <c2-card>
          <span className="stats__label">Day change</span>
          <strong className="stats__value" style={{ color: totals.change >= 0 ? 'var(--delta-up)' : 'var(--delta-down)' }}>
            {percent.format(totals.change)}
          </strong>
        </c2-card>
        <c2-card>
          <span className="stats__label">Selected</span>
          <strong className="stats__value">{selectedRows.length ? currency.format(selectedRows.reduce((sum, row) => sum + row.value, 0)) : '—'}</strong>
        </c2-card>
      </section>

      {/* `rows` is an array of objects. React 19 assigns a prop as a *property* when the property exists on the
          element — which it does, because the custom element was defined in main.tsx before React ever rendered. */}
      <c2-table
        ref={tableRef}
        className="positions"
        rows={rows}
        rowKey="symbol"
        selection="multiple"
        checkboxSelection
        sortable
        resizable
        stripe
        emptyMessage="No holdings match this filter"
      >
        <c2-table-column field="symbol" header="Symbol" width="110px" pinned="start" />
        <c2-table-column field="name" header="Name" width="minmax(160px, 2fr)" />
        <c2-table-column field="sector" header="Sector" width="140px" />
        <c2-table-column field="quantity" header="Qty" width="100px" align="end" format="number" />
        <c2-table-column field="price" header="Price" width="110px" align="end" format="currency" currency="USD" />
        <c2-table-column field="change" header="Day" width="120px" align="end" cellSlot />
        <c2-table-column field="value" header="Market value" width="150px" align="end" format="currency" currency="USD" />

        {/* One child per row; the table slots each into the cell whose key matches and ignores the rest. */}
        {rows.map((row) => (
          <Delta key={row.symbol} row={row} />
        ))}
      </c2-table>

      <footer className="app__foot">
        <c2-button onClick={() => setPositions(initialPositions)}>Reset prices</c2-button>
        <c2-button className="ghost" onClick={() => tableRef.current && (tableRef.current.value = [])}>
          Clear selection
        </c2-button>
      </footer>
    </div>
  )
}
