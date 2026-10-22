import { useEffect, useMemo, useRef, useState } from 'react'
import type { Table } from '@c2n/components/table'
import type { Select } from '@c2n/components/select'
import type { TextField } from '@c2n/components/text-field'
import type { Switch } from '@c2n/components/switch'
import { useCustomEvent } from './hooks/useCustomEvent'
import { useRenderedRows } from '@c2n/components/react'
import { SECTORS, changePct, initialPositions, marketValue, tick, type Position } from './data/positions'
import { OrderTicket, type Order } from './OrderTicket'
import type { ActionBar } from '@c2n/components/action-bar'

// `TableRow` is `Record<string, unknown>`, so a row type handed to `rows` has to carry an index signature.
type Row = Position & { value: number; change: number } & Record<string, unknown>

/**
 * A cell rendered by React rather than by the table.
 *
 * `renderCell` is handed to Lit, so it cannot return JSX — it would have to build DOM nodes by hand. A column
 * marked `cellSlot` puts a `<slot name="cell:<line>:<field>">` in each rendered cell instead — `line` being the
 * row's display line after sort and filter — and anything the app renders into that slot is the cell body. The
 * element stays in this document's light DOM, so ordinary CSS reaches it.
 */
function Delta({ line, row }: { line: number; row: Row }) {
  return (
    <span slot={`cell:${line}:change`} className={row.change >= 0 ? 'delta delta--up' : 'delta delta--down'}>
      {row.change >= 0 ? '▲' : '▼'} <c2-format-number value={Math.abs(row.change)} type="percent" minimumFractionDigits={2} />
    </span>
  )
}

export function App() {
  const [positions, setPositions] = useState<Position[]>(initialPositions)
  const [live, setLive] = useState(true)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  // The ticket mounts on open, so it prices itself from the current quotes each time.
  const [ticketOpen, setTicketOpen] = useState(false)

  const tableRef = useRef<Table>(null)
  const searchRef = useRef<TextField>(null)
  const sectorRef = useRef<Select>(null)
  const liveRef = useRef<Switch>(null)
  const actionBarRef = useRef<ActionBar>(null)

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

  // The table keeps a hidden row's key selected, so the bar, the total and the ticket count the checked rows the
  // filter still shows: a search must not leave a holding the user cannot see in an order.
  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.symbol)), [rows, selected])

  // Emptying the selection hides the action bar and the buttons in it, so focus goes back to the table's current
  // cell rather than dropping to the page.
  const clearSelection = () => {
    // `clearSelection()` fires `selection-change`, which empties `selected` through the listener below.
    tableRef.current?.clearSelection()
    tableRef.current?.focus()
  }

  // A filled order moves the holding at the limit price; selling a whole position closes it.
  const place = (order: Order) => {
    setPositions((current) =>
      current
        .map((position) =>
          position.symbol === order.symbol
            ? { ...position, quantity: position.quantity + (order.side === 'buy' ? order.quantity : -order.quantity), price: order.limit / 100 }
            : position,
        )
        .filter((position) => position.quantity > 0),
    )
  }

  // The selection is cleared once the ticket has closed: focus then returns to the table, not to the hidden bar.
  const closeTicket = (placed: boolean) => {
    setTicketOpen(false)
    if (placed) clearSelection()
  }

  // The lines the table rendered, and which row sits on each. The row is looked up in this render's `rows` by key,
  // so a price tick shows straight away rather than one `range-change` later.
  const rendered = useRenderedRows(tableRef)
  const rowsBySymbol = useMemo(() => new Map(rows.map((row) => [row.symbol, row])), [rows])

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
  useCustomEvent(actionBarRef, 'clear', clearSelection)

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

      {/* `c2-format-number` formats in the page's locale (the nearest `lang`), so the stats need no formatter of their own. */}
      <section className="stats">
        <c2-stat label="Market value">
          <c2-format-number slot="value" value={totals.value} type="currency" currency="USD" maximumFractionDigits={0} />
        </c2-stat>
        <c2-stat label="Day change">
          <c2-format-number
            slot="value"
            className={totals.change >= 0 ? 'delta delta--up' : 'delta delta--down'}
            value={totals.change}
            type="percent"
            signDisplay="exceptZero"
            minimumFractionDigits={2}
          />
        </c2-stat>
        <c2-stat label="Selected">
          {selectedRows.length ? (
            <c2-format-number
              slot="value"
              value={selectedRows.reduce((sum, row) => sum + row.value, 0)}
              type="currency"
              currency="USD"
              maximumFractionDigits={0}
            />
          ) : (
            <span slot="value">—</span>
          )}
        </c2-stat>
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

        {/* One child per rendered line, keyed by line and field: a sort moves rows between lines, not children. */}
        {rendered.map(({ line, key }) => {
          const row = rowsBySymbol.get(key)
          return row ? <Delta key={`${line}:change`} line={line} row={row} /> : null
        })}
      </c2-table>

      <footer className="app__foot">
        <c2-button className="ghost" onClick={() => setPositions(initialPositions)}>
          Reset portfolio
        </c2-button>
      </footer>

      {/* Shows while rows are checked and floats over the bottom of the page. The app owns the selection: the bar's
          × button and Escape fire `clear`, and emptying the selection there hides it again. */}
      <c2-action-bar ref={actionBarRef} count={selectedRows.length}>
        <c2-button onClick={() => setTicketOpen(true)}>Trade…</c2-button>
      </c2-action-bar>

      {ticketOpen && <OrderTicket open positions={selectedRows} onClose={closeTicket} onPlace={place} />}
    </div>
  )
}
