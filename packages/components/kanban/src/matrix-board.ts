import { html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { Kanban, KanbanColumn, type KanbanCardMoveDetail, type KanbanDirection, type KanbanEventMap, type KanbanItem } from './kanban'
import type { KanbanTextArgs, KanbanTextKey } from './kanban-text'
import { matrixBoardMessages } from './matrix-board-messages'
import styles from './matrix-board.scss?inline'

/** One value of an axis: a row or a column of the grid. A plain string or number is its own label. */
export type MatrixBoardAxisValue = string | number | { id: string | number; label?: string }

/** What a cell shows besides its cards: a name, and a band that colours it. */
export interface MatrixBoardCell {
  /** `id` of the cell's row. */
  row: string | number
  /** `id` of the cell's column. */
  column: string | number
  /** The cell's name, shown in its header and read with its position: "Star", "Critical". */
  label?: string
  /** Colour band, 1 to 5, drawn from `--c2-matrix-board__band-<n>--background-color`. */
  band?: number
}

/** Detail of the matrix board's `card-move` event: the kanban detail, with the row and the column of each cell. */
export interface MatrixBoardCardMoveDetail<T extends KanbanItem = KanbanItem> extends KanbanCardMoveDetail<T> {
  /** `id` (as a string) of the row the card left. */
  fromRow: string
  /** `id` (as a string) of the row the card landed in. */
  toRow: string
}

/** Events fired by {@link MatrixBoard}, keyed for `addEventListener`. */
export interface MatrixBoardEventMap extends KanbanEventMap {
  'card-move': CustomEvent<MatrixBoardCardMoveDetail>
}

export interface MatrixBoard {
  addEventListener: TypedAddEventListener<MatrixBoard, MatrixBoardEventMap>
  removeEventListener: TypedRemoveEventListener<MatrixBoard, MatrixBoardEventMap>
}

interface Axis {
  /** The value as the application wrote it, which a move writes back into the item. */
  id: unknown
  key: string
  label: string
}

interface CellPlace {
  row: number
  column: number
}

const cellId = (row: string, column: string): string => JSON.stringify([row, column])

const axisOf = (values: unknown): Axis[] => {
  const axis: Axis[] = []
  const seen = new Set<string>()
  for (const value of Array.isArray(values) ? values : []) {
    const record: { id?: unknown; label?: unknown } = value !== null && typeof value === 'object' ? value : { id: value }
    if (record.id === undefined || record.id === null) continue
    const key = String(record.id)
    if (seen.has(key)) continue
    seen.add(key)
    axis.push({ id: record.id, key, label: record.label === undefined || record.label === null ? key : String(record.label) })
  }
  return axis
}

/**
 * A board of cells in a grid of rows and columns, whose cards people move between cells with a pointer or the
 * keyboard: a 9-box talent grid, a 5 by 5 risk matrix, an Eisenhower matrix. An item sits in the cell its
 * `row-field` and `column-field` name; the axes come from `rows` (top to bottom) and `columns` (left to right), and
 * `cells` names cells and gives them a colour band. Every cell shows its card count.
 *
 * It is a `c2-kanban` whose columns are the cells, so cards, `renderItem`, `card-move` and `editable` work the same,
 * and the cards take the `--c2-kanban-column__card*` variables. With the keyboard, the arrow keys move between cells
 * as well as within one: Up from a cell's first card reaches the cell above. Give the board an accessible name with
 * `aria-label` or `aria-labelledby`.
 *
 * @tag c2-matrix-board
 *
 * @slot - Content under the grid, such as a legend of the bands.
 *
 * @csspart matrix - Grid of the axis titles, the axis labels and the cells.
 * @csspart row-title - Title of the vertical axis, read bottom to top on the left.
 * @csspart column-title - Title of the horizontal axis, under the column labels.
 * @csspart row-label - Label of one row, left of its cells.
 * @csspart column-label - Label of one column, under its cells.
 * @csspart cell - One cell: a `c2-kanban-column` holding the cell's cards.
 * @csspart cell-header - Component-owned region at the top of a cell: its name and count.
 * @csspart cell-label - Name of a cell given in `cells`.
 * @csspart cell-count - Number of cards in a cell.
 * @csspart card - Box around one card's rendered content.
 * @csspart placeholder - Gap marking where a dragged card will land.
 * @csspart footer - Component-owned region wrapping the default slot under the grid; styles placement, not assigned content.
 *
 * @event {CustomEvent<MatrixBoardCardMoveDetail>} card-move - Fired when the user drops a card in a new place, before `items` changes. `fromRow`/`toRow` and `fromColumn`/`toColumn` are the axis ids of the two cells. Cancelable: `preventDefault()` keeps the card where it was. Bubbles and crosses shadow boundaries.
 *
 * @cssproperty {length} [--c2-matrix-board--gap=6px] - Space between cells and around the labels.
 * @cssproperty {length} [--c2-matrix-board__cell--min-width=150px] - Narrowest a column of cells gets; the grid scrolls sideways below it.
 * @cssproperty {length} [--c2-matrix-board__cell--min-height=96px] - Lowest a cell gets.
 * @cssproperty {padding} [--c2-matrix-board__cell--padding=6px] - Padding inside a cell.
 * @cssproperty {length} [--c2-matrix-board__cell-header--gap=6px] - Space between a cell's name and its count.
 * @cssproperty {color} [--c2-matrix-board__cell--background-color=#f4f4f5] - Background of every cell; a band is drawn over it.
 * @cssproperty {color} [--c2-matrix-board__band-1--background-color=rgba(22, 163, 74, 0.14)] - Background of band 1 cells.
 * @cssproperty {color} [--c2-matrix-board__band-2--background-color=rgba(101, 163, 13, 0.16)] - Background of band 2 cells.
 * @cssproperty {color} [--c2-matrix-board__band-3--background-color=rgba(217, 119, 6, 0.16)] - Background of band 3 cells.
 * @cssproperty {color} [--c2-matrix-board__band-4--background-color=rgba(234, 88, 12, 0.18)] - Background of band 4 cells.
 * @cssproperty {color} [--c2-matrix-board__band-5--background-color=rgba(220, 38, 38, 0.16)] - Background of band 5 cells.
 * @cssproperty {color} [--c2-matrix-board__cell-label--color=#18181b] - Colour of a cell's name.
 * @cssproperty {font-size} [--c2-matrix-board__cell-label--font-size=12px] - Font size of a cell's name.
 * @cssproperty {font-weight} [--c2-matrix-board__cell-label--font-weight=600] - Weight of a cell's name.
 * @cssproperty {color} [--c2-matrix-board__cell-count--color=#71717a] - Colour of a cell's count.
 * @cssproperty {font-size} [--c2-matrix-board__cell-count--font-size=12px] - Font size of a cell's count.
 * @cssproperty {color} [--c2-matrix-board__label--color=#71717a] - Colour of the row and column labels.
 * @cssproperty {font-size} [--c2-matrix-board__label--font-size=12px] - Font size of the row and column labels.
 * @cssproperty {font-weight} [--c2-matrix-board__label--font-weight=500] - Weight of the row and column labels.
 * @cssproperty {length} [--c2-matrix-board__row-label--max-width=120px] - Widest a row label gets before it wraps.
 * @cssproperty {color} [--c2-matrix-board__title--color=#18181b] - Colour of the axis titles.
 * @cssproperty {font-size} [--c2-matrix-board__title--font-size=12px] - Font size of the axis titles.
 * @cssproperty {font-weight} [--c2-matrix-board__title--font-weight=600] - Weight of the axis titles.
 */
@customElement('c2-matrix-board')
export class MatrixBoard extends Kanban {
  static override styles = [Kanban.styles, unsafeCSS(styles)]

  /** The rows, top to bottom: `{ id, label }` objects, or plain values that are their own label. An array in the property, JSON in the attribute. */
  @property({ converter: jsonPropertyConverter }) rows: MatrixBoardAxisValue[] = []

  /** The columns, left to right, in the same shape as `rows`. */
  @property({ converter: jsonPropertyConverter }) columns: MatrixBoardAxisValue[] = []

  /** Names and colour bands of cells. A cell left out has neither. */
  @property({ converter: jsonPropertyConverter }) cells: MatrixBoardCell[] = []

  /** Field holding the `id` of an item's row. An item whose row or column matches none is not shown. */
  @property({ type: String, attribute: 'row-field' }) rowField = 'row'

  /** Title of the vertical axis ("Potential", "Likelihood"), shown beside the row labels and read in each cell's name. */
  @property({ type: String, attribute: 'row-title' }) rowTitle = ''

  /** Title of the horizontal axis ("Performance", "Impact"), shown under the column labels and read in each cell's name. */
  @property({ type: String, attribute: 'column-title' }) columnTitle = ''

  private readonly msg = new LocalizeController(this, matrixBoardMessages)
  private readonly footer = new SlotPresenceController(this, [''])

  private rowAxis: Axis[] = []
  private columnAxis: Axis[] = []
  private places = new Map<string, CellPlace>()
  private details = new Map<string, MatrixBoardCell>()
  private cellsChanged = true
  /** Server-rendered cells hydrate after the board: the board waits for them before handing them cards. */
  private hydrating = !isServer && this.shadowRoot !== null

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    if (changed.has('rows') || changed.has('columns')) {
      this.rowAxis = axisOf(this.rows)
      this.columnAxis = axisOf(this.columns)
      this.places = new Map()
      this.rowAxis.forEach((row, r) => this.columnAxis.forEach((column, c) => this.places.set(cellId(row.key, column.key), { row: r, column: c })))
      this.cellsChanged = true
    }
    if (changed.has('cells')) {
      this.details = new Map()
      for (const cell of Array.isArray(this.cells) ? this.cells : []) {
        if (cell && typeof cell === 'object') this.details.set(cellId(String(cell.row), String(cell.column)), cell)
      }
    }
  }

  protected override update(changed: PropertyValues<this>): void {
    super.update(changed)
    if (!this.cellsChanged) return
    this.cellsChanged = false
    // The cells are rendered, not slotted: the board reads them back once they are in the shadow root.
    const cells = [...this.renderRoot.querySelectorAll<KanbanColumn>('c2-kanban-column.cell')]
    if (!this.hydrating) {
      this.columnElements = cells
      return
    }
    this.hydrating = false
    // Handing a server-rendered cell its cards before its own first update would make that update differ from the server's.
    void Promise.all(cells.map((cell) => cell.updateComplete)).then(() => {
      this.columnElements = cells
      this.requestUpdate()
    })
  }

  protected override renderColumns(): unknown {
    const rows = this.rowAxis
    const columns = this.columnAxis
    const lead = this.rowTitle ? 2 : 1
    const counts = new Map<string, number>()
    for (const item of this.shownItems) {
      const id = this.columnOf(item)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const titled = (title: string, value: string) => (title ? this.msg.t('axisValue', title, value) : value)
    const instructions = this.msg.t('instructions')
    return html`
      <div part="matrix" class="matrix" style=${styleMap({ '--_lead': String(lead), '--_columns': String(Math.max(1, columns.length)) })}>
        ${
          this.rowTitle && rows.length
            ? html`<div part="row-title" class="title title--row" aria-hidden="true" style=${styleMap({ gridRow: `1 / span ${rows.length}` })}>
                ${this.rowTitle}
              </div>`
            : nothing
        }
        ${rows.map(
          (row, r) => html`
            <div part="row-label" class="label label--row" aria-hidden="true" style=${styleMap({ gridRow: String(r + 1), gridColumn: String(lead) })}>
              ${row.label}
            </div>
            ${columns.map((column, c) => {
              const id = cellId(row.key, column.key)
              const detail = this.details.get(id)
              const band = Number(detail?.band)
              const label = detail?.label ? String(detail.label) : ''
              const rowName = titled(this.rowTitle, row.label)
              const columnName = titled(this.columnTitle, column.label)
              return html`<c2-kanban-column
                part="cell"
                exportparts="card, placeholder"
                class=${Number.isInteger(band) && band >= 1 && band <= 5 ? `cell band-${band}` : 'cell'}
                style=${styleMap({ gridRow: String(r + 1), gridColumn: String(lead + c + 1) })}
                column-id=${id}
                .label=${label ? this.msg.t('namedCell', label, rowName, columnName) : this.msg.t('cell', rowName, columnName)}
                .instructions=${instructions}
              >
                <div slot="header" part="cell-header" class="cell-header" aria-hidden="true">
                  ${label ? html`<span part="cell-label" class="cell-label">${label}</span>` : nothing}
                  <span part="cell-count" class="cell-count">${counts.get(id) ?? 0}</span>
                </div>
              </c2-kanban-column>`
            })}
          `,
        )}
        ${columns.map(
          (column, c) =>
            html`<div
              part="column-label"
              class="label label--column"
              aria-hidden="true"
              style=${styleMap({ gridRow: String(rows.length + 1), gridColumn: String(lead + c + 1) })}
            >
              ${column.label}
            </div>`,
        )}
        ${
          this.columnTitle && columns.length
            ? html`<div
                part="column-title"
                class="title title--column"
                aria-hidden="true"
                style=${styleMap({ gridRow: String(rows.length + 2), gridColumn: `${lead + 1} / span ${columns.length}` })}
              >
                ${this.columnTitle}
              </div>`
            : nothing
        }
      </div>
      <div part="footer" class="footer" ?hidden=${!this.footer.has()}><slot @slotchange=${this.footer.handleSlotChange}></slot></div>
    `
  }

  protected override text<K extends KanbanTextKey>(key: K, ...args: KanbanTextArgs<K>): string {
    return (this.msg.t as (key: string, ...values: unknown[]) => string)(key, ...args)
  }

  protected override columnOf(item: KanbanItem): string {
    const value = (field: string) => {
      const raw = item?.[field]
      return raw === undefined || raw === null ? '' : String(raw)
    }
    return cellId(value(this.rowField), value(this.columnField))
  }

  protected override withColumn(item: KanbanItem, column: string): KanbanItem {
    const place = this.places.get(column)
    if (!place) return { ...item }
    return { ...item, [this.rowField]: this.rowAxis[place.row].id, [this.columnField]: this.columnAxis[place.column].id }
  }

  protected override neighbourColumn(column: string, direction: KanbanDirection): string | undefined {
    const place = this.places.get(column)
    if (!place) return undefined
    const row = this.rowAxis[place.row + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0)]
    const next = this.columnAxis[place.column + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0)]
    return row && next ? cellId(row.key, next.key) : undefined
  }

  /** The cell under the pointer, or the nearest one: a drop in a gap between cells still lands. */
  protected override columnAt(point: { x: number; y: number }): KanbanColumn | null {
    let best: { cell: KanbanColumn; distance: number } | null = null
    for (const cell of this.columnElements) {
      const rect = cell.getBoundingClientRect()
      const dx = Math.max(rect.left - point.x, 0, point.x - rect.right)
      const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom)
      const distance = dx * dx + dy * dy
      if (!best || distance < best.distance) best = { cell, distance }
      if (!distance) break
    }
    return best?.cell ?? null
  }

  protected override moveDetail(detail: KanbanCardMoveDetail): MatrixBoardCardMoveDetail {
    const from = this.places.get(detail.fromColumn)
    const to = this.places.get(detail.toColumn)
    return {
      ...detail,
      fromRow: from ? this.rowAxis[from.row].key : '',
      toRow: to ? this.rowAxis[to.row].key : '',
      fromColumn: from ? this.columnAxis[from.column].key : '',
      toColumn: to ? this.columnAxis[to.column].key : '',
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-matrix-board': MatrixBoard
  }
}
