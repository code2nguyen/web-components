import { LitElement, unsafeCSS, type PropertyValues } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './table-column.scss?inline'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type {
  ColumnAlign,
  ColumnFormat,
  ColumnPin,
  TableCellEditor,
  TableCellEditorRenderer,
  TableCellOption,
  TableCellParser,
  TableCellRenderer,
  TableCellValidator,
  TableColumnConfig,
  TableCompare,
  TableHeaderRenderer,
  TableSummaryAggregate,
  TableSummaryFunction,
  TableSummaryRenderer,
} from './table-types.js'

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

  /**
   * Stable identity of the column; defaults to `field`. Set it when two columns show the same field, or for a
   * computed column with no field. Widths, pinning, the `cell-<id>` parts and the summary row are keyed by it. Not the
   * HTML `id`, which has to be unique in the whole document rather than in one table.
   */
  @property({ type: String, attribute: 'column-id' }) columnId = ''

  /** Key of the value in the row object; may be a dotted path such as `user.name`. */
  @property({ type: String }) field = ''

  /** Header label. Falls back to the field name. */
  @property({ type: String }) header?: string

  /** Grid track for the column: `1fr`, `160px`, `minmax(120px, 1fr)`… */
  @property({ type: String }) width = '1fr'

  /** Lower bound in pixels: the floor of a flexible (`fr`) track on a narrow table, and while the column is resized. */
  @property({ type: Number, attribute: 'min-width' }) minWidth = 64

  /** Horizontal alignment of the header and the cells. */
  @property({ type: String }) align: ColumnAlign = 'start'

  /** Lets the user sort by this column. Absent inherits the table's `sortable`; `sortable="false"` opts out. */
  @property({ type: Boolean }) sortable?: boolean

  /** Lets the user drag the column's trailing edge. Absent inherits the table's `resizable`; `resizable="false"` opts out. */
  @property({ type: Boolean }) resizable?: boolean

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

  /**
   * Renders each cell from a light-DOM child of the table rather than from `renderCell`: the cell holds a
   * `<slot name="cell:<line>:<field>">`, `line` being the row's display line, so a framework can build the body with
   * its own template language. Render children only for the lines the table's `range-change` reports (`detail.rows`);
   * after a sort, filter or page change the same line holds another row, so re-render from the next `range-change`.
   */
  @property({ type: Boolean, attribute: 'cell-slot' }) cellSlot = false

  /** Renders the cell body. Property only. */
  @property({ attribute: false }) renderCell?: TableCellRenderer

  /** Renders the header body. Property only. */
  @property({ attribute: false }) renderHeader?: TableHeaderRenderer

  /** Value of the column in the table's summary row: `sum`, `avg`, `min`, `max` or `count`, or a function of the rows (property only). */
  @property({ type: String }) summary?: TableSummaryAggregate | TableSummaryFunction

  /** Text shown in the column's summary cell when it has no value, such as `Total`. */
  @property({ type: String, attribute: 'summary-label' }) summaryLabel?: string

  /**
   * The value the summary must reach, such as `1` for a `percent` column whose rows must add up to 100%: while the
   * summary is another number, its cell is marked (`summary-cell-off-target`) and says what it should be.
   */
  @property({ type: Number, attribute: 'summary-target' }) summaryTarget?: number

  /** Alignment of the summary cell. Defaults to `align`. */
  @property({ type: String, attribute: 'summary-align' }) summaryAlign?: ColumnAlign

  /** Number of columns the summary cell spans, starting at this one; the spanned columns' summaries are not shown. */
  @property({ type: Number, attribute: 'summary-span' }) summarySpan?: number

  /** Renders the summary cell body instead of the formatted value. Property only. */
  @property({ attribute: false }) renderSummary?: TableSummaryRenderer

  /**
   * In a tree (`children-field`), what a parent row shows in this column: `sum`, `avg`, `min`, `max` or `count` of the
   * leaf rows under it, or a function of those rows (property only). The parent's own value is not used.
   */
  @property({ type: String }) rollup?: TableSummaryAggregate | TableSummaryFunction

  /** Client-side sort comparator for this column's values. Property only. */
  @property({ attribute: false }) comparator?: (a: unknown, b: unknown) => number

  /**
   * Puts the group tree (chevron, group label and count, indentation) in this column while the table is grouped, and
   * each row's chevron and indentation in a tree (`children-field`). Defaults to the first column.
   */
  @property({ type: Boolean, attribute: 'group-column' }) groupColumn = false

  /** Adds a filter of the column's values to its header. Absent inherits the table's `filterable`; `filterable="false"` opts out. */
  @property({ type: Boolean }) filterable?: boolean

  /**
   * Shows each cell's change from the matching row of the table's `baseline` (the last payroll run, the previous
   * period): `delta` as a number in the column's format, `percent` as a share. The previous value is its tooltip.
   */
  @property({ type: String }) compare?: TableCompare

  /**
   * Marks a cell whose value moved from the `baseline` by more than this share of it (`0.1` is 10%) with the
   * `cell-variance` part. A cell whose baseline is 0 is marked on any change.
   */
  @property({ type: Number, attribute: 'variance-threshold' }) varianceThreshold?: number

  /**
   * Makes the column a running total, such as a balance: each row shows `opening` plus the fields named here, added up
   * over the rows in their sorted order. Comma-separated, and a `-` subtracts a field: `running="credit,-debit"`. A row
   * with none of them shows nothing and leaves the total as it is. Give the column a `column-id`; it needs no `field`.
   */
  @property({ type: String }) running?: string

  /** The value a `running` column starts from, such as an opening balance. */
  @property({ type: Number }) opening?: number

  /** Makes the column count, in each row, the cells of the `status` columns that hold this value: the failing controls of a row. */
  @property({ type: String, attribute: 'count-value' }) countValue?: string

  /**
   * Makes the cells editable while the table is `editable`: `text`, `number`, `date`, `url` and `select` open one input
   * over the cell being edited, `checkbox` shows a checkbox in every cell and toggles it.
   */
  @property({ type: String }) editor?: TableCellEditor

  /**
   * The column's legend, as JSON in the attribute: values, or `{ "value", "label", "color", "glyph" }` objects. The cell
   * shows the label, a `select` editor offers them, and `format="status"` paints each value's mark with its `color`.
   */
  @property({ converter: jsonPropertyConverter }) options?: TableCellOption[]

  /** An empty value marks the cell invalid while the table is `editable`. */
  @property({ type: Boolean }) required = false

  /** Checks a cell's value after an edit, a paste or the table's `validate()`: returns the message, or nothing. Property only. */
  @property({ attribute: false }) validate?: TableCellValidator

  /** Draws the cell's editor in place of the built-in `editor`, and makes the column editable. Property only. */
  @property({ attribute: false }) renderEditor?: TableCellEditorRenderer

  /** Turns text pasted from a spreadsheet into the column's value; the default follows `editor`. Property only. */
  @property({ attribute: false }) parseValue?: TableCellParser

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
