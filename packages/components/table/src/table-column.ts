import { LitElement, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './table-column.scss?inline'
import { jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { ColumnAlign, ColumnFormat, ColumnPin, TableCellRenderer, TableColumnConfig, TableHeaderRenderer } from './table-types.js'

/** Fired at the parent table whenever a column definition changes. */
export const COLUMN_CHANGE_EVENT = 'c2-table-column-change'

/**
 * One column of a `c2-table`, declared as a light-DOM child. The element renders nothing: it is a definition the
 * table reads, the same way `c2-select` reads its `c2-list-item` children. Everything it exposes as an attribute can
 * also be set as a property, and the function-valued properties (`renderCell`, `renderHeader`, `comparator`) are
 * property-only.
 *
 * ```html
 * <c2-table rows='[{ "name": "Ada", "score": 12 }]'>
 *   <c2-table-column field="name" header="Name" width="2fr" sortable pinned="start"></c2-table-column>
 *   <c2-table-column field="score" header="Score" width="120px" align="end" format="number" sortable></c2-table-column>
 * </c2-table>
 * ```
 *
 * @tag c2-table-column
 */
@customElement('c2-table-column')
export class TableColumn extends LitElement implements TableColumnConfig {
  static override styles = unsafeCSS(styles)

  /** Key of the value in the row object; may be a dotted path such as `user.name`. */
  @property({ type: String }) field = ''

  /** Header label. Falls back to the field name. */
  @property({ type: String }) header?: string

  /** Grid track for the column: `1fr`, `160px`, `minmax(120px, 1fr)`… */
  @property({ type: String }) width = '1fr'

  /** Lower bound in pixels while the column is resized. */
  @property({ type: Number, attribute: 'min-width' }) minWidth = 64

  /** Horizontal alignment of the header and the cells. */
  @property({ type: String }) align: ColumnAlign = 'start'

  /** Lets the user sort by this column. */
  @property({ type: Boolean }) sortable = false

  /** Lets the user drag the column's trailing edge. Defaults to the table's `resizable`. */
  @property({ type: Boolean, converter: { fromAttribute: (value: string | null) => value !== null } }) resizable?: boolean

  /** Freezes the column against the leading or trailing edge while scrolling horizontally. */
  @property({ type: String }) pinned?: ColumnPin

  /** Leaves the column out of the table without removing the definition. */
  @property({ type: Boolean, reflect: true }) override hidden = false

  /** Built-in `Intl` formatting applied when no `renderCell` is set. */
  @property({ type: String }) format: ColumnFormat = 'text'

  /** Options handed to the `Intl` formatter of `format`, as JSON in the attribute. */
  @property({ converter: jsonPropertyConverter, attribute: 'format-options' }) formatOptions?: Record<string, unknown>

  /** Currency code used by `format="currency"`. */
  @property({ type: String }) currency?: string

  /** BCP 47 locale used by `format`. Defaults to the browser locale. */
  @property({ type: String }) locale?: string

  /** Class set on every cell of this column, so light-DOM CSS can target it through `::part(cell)`. */
  @property({ type: String, attribute: 'cell-class' }) cellClass?: string

  /** Renders the cell body. Property only. */
  @property({ attribute: false }) renderCell?: TableCellRenderer

  /** Renders the header body. Property only. */
  @property({ attribute: false }) renderHeader?: TableHeaderRenderer

  /** Client-side sort comparator for this column's values. Property only. */
  @property({ attribute: false }) comparator?: (a: unknown, b: unknown) => number

  override connectedCallback() {
    super.connectedCallback()
    this.#notify()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.#notify()
  }

  protected override updated(_changed: PropertyValues) {
    this.#notify()
  }

  #notify() {
    this.dispatchEvent(new CustomEvent(COLUMN_CHANGE_EVENT, { bubbles: true, composed: true }))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-table-column': TableColumn
  }
}
