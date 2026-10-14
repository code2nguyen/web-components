import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { live } from 'lit/directives/live.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './spreadsheet.scss?inline'
import {
  CellError,
  SheetModel,
  cellRef,
  columnName,
  insertIntoFormula,
  isCellError,
  parseCellRef,
  parseFormula,
  parseRange,
  rangeRef,
  shiftFormula,
  toText,
  type CellInput,
  type CellPosition,
  type CellValue,
  type SpreadsheetFunction,
} from './formula.js'

export {
  CellError,
  cellRef,
  columnName,
  insertIntoFormula,
  isCellError,
  parseCellRef,
  parseRange,
  rangeRef,
  shiftFormula,
  type CellErrorCode,
  type CellInput,
  type CellPosition,
  type CellRange,
  type CellValue,
  type FormulaArgument,
  type SpreadsheetFunction,
} from './formula.js'

/** How a column shows numbers. The format changes the display only, never the stored value. */
export type SpreadsheetColumnFormat = 'general' | 'number' | 'currency' | 'percent' | 'text'

/** Options for one column. Every field is optional. */
export interface SpreadsheetColumn {
  /** Header text shown after the column letter. Formulas still use the letter. */
  label?: string
  /** Width in pixels. Defaults to `--c2-spreadsheet__cell--width`. */
  width?: number
  /** `general` (default) shows numbers as typed, `number` groups thousands with up to two decimals. */
  format?: SpreadsheetColumnFormat
  /** Overrides the alignment chosen from the value (numbers at the end, text at the start). */
  align?: 'start' | 'center' | 'end'
  /** Lets the user drag the column's edge. Absent inherits the spreadsheet's `resizable`. */
  resizable?: boolean
  /** Narrowest width in pixels the user can drag the column to. Defaults to 32. */
  minWidth?: number
}

/** One changed cell in a `cell-change` event. */
export interface SpreadsheetCellChange {
  /** Address of the cell, such as `D3`. */
  ref: string
  /** The new raw input, `''` when the cell was cleared. */
  input: string
  /** The new computed value. */
  value: CellValue
  /** The raw input before the change. */
  previous: string
}

export interface SpreadsheetCellChangeEventDetail {
  changes: SpreadsheetCellChange[]
}

export interface SpreadsheetColumnResizeEventDetail {
  /** The column letter, such as `B`. */
  column: string
  /** Zero-based column index. */
  index: number
  /** The new width in pixels, also written to `columns`. */
  width: number
}

export interface SpreadsheetSelectionChangeEventDetail {
  /** The selected range, such as `B1:E5`, or one address. */
  range: string
  /** The current cell: the one the formula bar shows and typing edits. */
  active: string
}

/** Events fired by {@link Spreadsheet}, keyed for `addEventListener`. */
export interface SpreadsheetEventMap {
  'cell-change': CustomEvent<SpreadsheetCellChangeEventDetail>
  'selection-change': CustomEvent<SpreadsheetSelectionChangeEventDetail>
  'column-resize': CustomEvent<SpreadsheetColumnResizeEventDetail>
}

export interface Spreadsheet {
  addEventListener: TypedAddEventListener<Spreadsheet, SpreadsheetEventMap>
  removeEventListener: TypedRemoveEventListener<Spreadsheet, SpreadsheetEventMap>
}

/** `columns` is a count in markup (`columns="5"`) or JSON for full column options. */
const columnsConverter = {
  fromAttribute: (value: string | null) => parseColumns(value),
  fromProperty: (value: unknown) => (typeof value === 'string' ? parseColumns(value) : value),
}

function parseColumns(value: string | null): number | SpreadsheetColumn[] | undefined {
  if (!value) return undefined
  if (/^\s*\d+\s*$/.test(value)) return Number(value)
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) || typeof parsed === 'number' ? (parsed as number | SpreadsheetColumn[]) : undefined
  } catch {
    return undefined
  }
}

interface EditState {
  row: number
  column: number
  value: string
  original: string
  /** The editor sits in the cell; otherwise the user is typing in the formula bar. */
  inCell: boolean
  /** Editing started by typing over the cell, so arrow keys commit and move like in Sheets. */
  typed: boolean
}

interface CopiedRange {
  text: string
  origin: CellPosition
  inputs: string[][]
}

type Change = { key: string; input: string }
type HistoryStep = { key: string; before: string; after: string }[]

/** Narrowest a column can be dragged, unless it sets `minWidth`. */
const MIN_COLUMN_WIDTH = 32

const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }

/**
 * A small editable grid with basic formulas: budgets, quotes, price lists, score sheets. One sheet, about twenty
 * functions, keyboard editing that works like Sheets and Excel, and copy and paste with both. It is not a
 * spreadsheet application: there is no cell styling, no second sheet and no file import.
 *
 * `data` holds the raw inputs row by row. A string starting with `=` is a formula (`=SUM(D1:D5)`); a leading `'`
 * keeps the rest as text. Typing `10%` or `$12` keeps that look in the cell. Formulas support `+ - * / ^ &`,
 * comparisons, `%`, `A1` references and `A1:B5` ranges, and the functions `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`,
 * `COUNTA`, `ROUND`, `ABS`, `IF`, `IFERROR`, `AND`, `OR`, `NOT`, `SUMIF`, `CONCAT`, `LEN`, `UPPER`, `LOWER`,
 * `TRIM` and `TODAY`. Add your own through `functions`. Errors show in the cell (`#DIV/0!`, `#REF!`, `#NAME?`,
 * `#VALUE!`, `#NUM!`, `#CIRC!`, `#ERROR!`) with the reason in a tooltip.
 *
 * Keyboard: arrows move, Shift+arrows extend the range, typing replaces the cell, Enter, F2 or a double-click edit
 * it, Enter and Tab commit and move, Escape cancels, Delete clears, Ctrl/⌘+C, X, V copy, cut and paste as
 * tab-separated text, Ctrl/⌘+Z and Y undo and redo, Ctrl/⌘+A selects every cell. Tab outside an edit leaves the grid.
 *
 * A paste larger than the space left grows the sheet to fit. `insertRows` and `insertColumns` add empty rows and
 * columns, and formulas keep pointing at the cells they read.
 *
 * Drag the right edge of a column header to resize the column, or double-click it to fit the column to its content.
 * The new width is written to `columns` and reported by `column-resize`.
 *
 * @tag c2-spreadsheet
 *
 * @event {CustomEvent<SpreadsheetCellChangeEventDetail>} cell-change - Fired once per edit, paste, cut, delete, undo or redo with every cell the user changed (`detail.changes`: `ref`, `input`, `value`, `previous`). Cells that only recalculated are not listed.
 * @event {CustomEvent<SpreadsheetSelectionChangeEventDetail>} selection-change - Fired after the user moves the selection. `detail.range` is the selected range and `detail.active` the current cell. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself.
 * @event {CustomEvent<SpreadsheetColumnResizeEventDetail>} column-resize - Fired when the user releases a column's resize handle or double-clicks it to fit the content. `detail.column` is the letter, `detail.index` the zero-based index and `detail.width` the new width in pixels, which is also written to `columns`.
 * @event {Event} input - Fired with every `cell-change`, for generic two-way bindings.
 * @event {Event} change - Fired with every `cell-change`, for generic two-way bindings.
 *
 * @csspart resizer - The grab area at a column header's right edge.
 *
 * @cssproperty {color} [--c2-spreadsheet--background-color=#ffffff]
 * @cssproperty {color} [--c2-spreadsheet--color=#18181b]
 * @cssproperty {font-family} --c2-spreadsheet--font-family
 * @cssproperty {font-size} [--c2-spreadsheet--font-size=14px]
 * @cssproperty {border} [--c2-spreadsheet--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-spreadsheet--border-radius=8px]
 * @cssproperty {pixel} --c2-spreadsheet--max-height - The grid scrolls when it is taller than this.
 * @cssproperty {outline} [--c2-spreadsheet__grid__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Ring around the grid when it has keyboard focus.
 *
 * @cssproperty {pixel} [--c2-spreadsheet__cell--width=112px] - Width of a column without its own `width`.
 * @cssproperty {pixel} [--c2-spreadsheet__cell--height=32px]
 * @cssproperty {padding} [--c2-spreadsheet__cell--padding=0 10px]
 * @cssproperty {color} [--c2-spreadsheet__cell--border-color=#e4e4e7]
 * @cssproperty {color} [--c2-spreadsheet__cell__selected--background-color=rgba(2, 101, 220, 0.08)] - Cells in a selected range.
 * @cssproperty {outline} [--c2-spreadsheet__cell__active--outline=2px solid rgb(2, 101, 220)] - Ring on the current cell.
 * @cssproperty {color} [--c2-spreadsheet__cell__error--color=#dc2626]
 *
 * @cssproperty {color} [--c2-spreadsheet__header--background-color=#fafafa] - Column and row headers.
 * @cssproperty {color} [--c2-spreadsheet__header--color=#71717a]
 * @cssproperty {font-size} [--c2-spreadsheet__header--font-size=12px]
 * @cssproperty {font-weight} [--c2-spreadsheet__header--font-weight=500]
 * @cssproperty {color} [--c2-spreadsheet__header__selected--background-color=#edf1fe] - Headers of the selected rows and columns.
 * @cssproperty {color} [--c2-spreadsheet__header__selected--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-spreadsheet__column-label--color=#18181b] - Column label shown after the letter.
 * @cssproperty {pixel} [--c2-spreadsheet__row-header--width=44px]
 *
 * @cssproperty {pixel} [--c2-spreadsheet__resizer--width=9px] - Width of a column's resize grab area, not of the visible line.
 * @cssproperty {color} [--c2-spreadsheet__resizer__hover--color=rgb(2, 101, 220)] - The line drawn at a column's edge while its handle is hovered or dragged.
 * @cssproperty {pixel} [--c2-spreadsheet__resizer__hover--line-width=2px]
 *
 * @cssproperty {color} [--c2-spreadsheet__editor--background-color=#ffffff] - The input over a cell being edited.
 * @cssproperty {font-family} [--c2-spreadsheet__editor--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {box-shadow} [--c2-spreadsheet__editor--box-shadow=0 4px 14px rgba(24, 24, 27, 0.14)]
 *
 * @cssproperty {pixel} [--c2-spreadsheet__formula-bar--height=38px]
 * @cssproperty {color} [--c2-spreadsheet__formula-bar--background-color=#ffffff]
 * @cssproperty {font-family} [--c2-spreadsheet__formula-bar--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {pixel} [--c2-spreadsheet__name-box--width=72px] - The box showing the current cell or range.
 * @cssproperty {color} [--c2-spreadsheet__fx--color=#71717a] - The `fx` mark before the formula.
 *
 * @cssproperty {color} [--c2-spreadsheet__summary--background-color=#fafafa] - The Sum / Average / Count line.
 * @cssproperty {color} [--c2-spreadsheet__summary--color=#71717a]
 * @cssproperty {font-size} [--c2-spreadsheet__summary--font-size=12px]
 * @cssproperty {color} [--c2-spreadsheet__summary-value--color=#18181b]
 *
 * @cssproperty {color} [--c2-spreadsheet__reference-1--color=rgb(2, 101, 220)] - Outline of the first cell or range a formula being edited reads; the next three references use colours 2 to 4.
 * @cssproperty {color} [--c2-spreadsheet__reference-2--color=#c2410c]
 * @cssproperty {color} [--c2-spreadsheet__reference-3--color=#7c3aed]
 * @cssproperty {color} [--c2-spreadsheet__reference-4--color=#0f766e]
 */
@customElement('c2-spreadsheet')
export class Spreadsheet extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * Raw inputs, row by row: numbers, booleans, text, or formulas as strings starting with `=`. JSON in markup.
   * Edits write a new array here, so it always holds the current inputs.
   */
  @property({ converter: jsonPropertyConverter }) data: CellInput[][] = []

  /** Number of rows. Grows to fit `data`, a paste past the last row and `insertRows`. */
  @property({ type: Number }) rows = 20

  /**
   * Number of columns, or one options object per column (`label`, `width`, `format`, `align`, `resizable`, `minWidth`). JSON
   * in markup. Grows to fit `data`, a paste past the last column and `insertColumns`. Resizing a column writes a new
   * array here with its `width`.
   */
  @property({ converter: columnsConverter }) columns: number | SpreadsheetColumn[] = 8

  /**
   * Lets the user drag a column header's edge to resize the column, and double-click it to fit the content. On by
   * default; `resizable="false"` turns it off. A column's own `resizable` still wins.
   */
  @property({ type: Boolean }) resizable = true

  /** Shows the current cell's address and raw input above the grid. The formula bar is editable. */
  @property({ type: Boolean, attribute: 'formula-bar' }) formulaBar = false

  /** Shows Sum, Average and Count of the selected cells below the grid. */
  @property({ type: Boolean }) summary = false

  /** Selection and copy work; editing, paste, cut and delete do not. */
  @property({ type: Boolean }) readonly = false

  /** Accessible name of the grid. */
  @property() label = ''

  /** Locale for number and currency display. Defaults to the browser's. Formulas always use `,` between arguments. */
  @property() locale?: string

  /** ISO currency code for the `currency` format and for amounts typed with `$`. */
  @property() currency = 'USD'

  /** Extra formula functions, keyed by name: `{ TAX: ([amount]) => … }`. Names are case-insensitive. */
  @property({ attribute: false }) functions: Record<string, SpreadsheetFunction> = {}

  @state() private cursor: CellPosition = { row: 0, column: 0 }
  @state() private extent: CellPosition = { row: 0, column: 0 }
  @state() private editing: EditState | null = null
  @state() private announcement = ''

  private readonly model = new SheetModel(20, 8)
  /** The array this element last wrote to `data`, so its own write is not reloaded. */
  private ownData: CellInput[][] | undefined
  private columnDefs: SpreadsheetColumn[] = []
  private undoStack: HistoryStep[] = []
  private redoStack: HistoryStep[] = []
  private copied: CopiedRange | undefined
  private dragging = false
  private focusEditor = false
  private revealCursor = false
  private formatters = new Map<string, Intl.NumberFormat>()

  // ---------------------------------------------------------------------------------------------------------------
  // Public API

  /** The computed value of a cell (`'D3'`). Errors are `CellError` objects. */
  getValue(ref: string): CellValue {
    const key = normaliseRef(ref)
    return key ? this.model.getValue(key) : null
  }

  /** The raw input of a cell, `''` when it is empty. */
  getInput(ref: string): string {
    const key = normaliseRef(ref)
    return key ? this.model.getInput(key) : ''
  }

  /** Writes one cell and recalculates. The change goes into the undo history but fires no event. */
  setInput(ref: string, input: CellInput): void {
    const key = normaliseRef(ref)
    if (!key) return
    this.applyChanges([{ key, input: input === null || input === undefined ? '' : String(input) }], { record: true, notify: false })
  }

  /** Selects `'A1'` or `'A1:C4'` and scrolls it into view. The first cell becomes the current cell. */
  select(range: string): void {
    const parsed = parseRange(range)
    if (!parsed) return
    this.cursor = this.clamp(parsed.start)
    this.extent = this.clamp(parsed.end)
    this.revealCursor = true
  }

  /** The selected range, such as `B1:E5`. */
  get selection(): string {
    return rangeRef(this.selectedBox())
  }

  /** Computed values of the used cells as comma-separated text. */
  toCSV(): string {
    return this.exportRows()
      .map((row) => row.map((cell) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
      .join('\n')
  }

  /** Computed values of the used cells as tab-separated text, as the clipboard holds them. */
  toTSV(): string {
    return this.exportRows()
      .map((row) => row.map(tsvField).join('\t'))
      .join('\n')
  }

  /** Reverts the last change. */
  undo(): void {
    const step = this.undoStack.pop()
    if (!step) return
    this.redoStack.push(step)
    this.applyChanges(
      step.map(({ key, before }) => ({ key, input: before })),
      { record: false, notify: true },
    )
  }

  /** Re-applies the last undone change. */
  redo(): void {
    const step = this.redoStack.pop()
    if (!step) return
    this.undoStack.push(step)
    this.applyChanges(
      step.map(({ key, after }) => ({ key, input: after })),
      { record: false, notify: true },
    )
  }

  /**
   * Inserts `count` empty rows before the zero-based row `index`: `0` adds them at the top, `rows` at the bottom.
   * The rows below move down and every formula follows the cells it reads, so `=SUM(B1:B5)` becomes `=SUM(B1:B6)`
   * when a row goes in inside the range. Writes `data` and `rows`, clears the undo history and fires no event.
   */
  insertRows(index: number, count = 1): void {
    this.insert('row', index, count)
  }

  /**
   * Inserts `count` empty columns before the zero-based column `index`: `0` adds them first, the column count last.
   * The columns to the right move over with their options (`label`, `width`, `format`, `align`), and every formula
   * follows the cells it reads. Writes `data` and `columns`, clears the undo history and fires no event.
   */
  insertColumns(index: number, count = 1): void {
    this.insert('column', index, count)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Lifecycle

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('columns') || changed.has('data') || changed.has('rows')) {
      const declared = typeof this.columns === 'number' ? this.columns : Array.isArray(this.columns) ? this.columns.length : 8
      const widest = Math.max(0, ...(this.data ?? []).map((row) => (Array.isArray(row) ? row.length : 0)))
      const count = Math.max(1, declared, widest)
      const options = Array.isArray(this.columns) ? this.columns : []
      this.columnDefs = Array.from({ length: count }, (_, index) => options[index] ?? {})
      this.model.resize(Math.max(1, this.rows, this.data?.length ?? 0), count)
    }
    if (changed.has('data') && this.data !== this.ownData) {
      this.model.load(dataEntries(this.data))
      this.undoStack = []
      this.redoStack = []
      this.editing = null
    }
    if (changed.has('functions')) this.model.setFunctions(this.functions ?? {})
    if (changed.has('locale') || changed.has('currency')) this.formatters.clear()
    this.cursor = this.clamp(this.cursor)
    this.extent = this.clamp(this.extent)
  }

  protected override updated(): void {
    if (this.focusEditor) {
      this.focusEditor = false
      const editor = this.renderRoot.querySelector<HTMLInputElement>('.editor')
      if (editor) {
        editor.focus()
        editor.setSelectionRange(editor.value.length, editor.value.length)
      }
    }
    if (this.revealCursor) {
      this.revealCursor = false
      this.cellElement(this.extent)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('pointerup', this.stopDragging)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Rendering

  override render() {
    const box = this.selectedBox()
    const multi = box.start.row !== box.end.row || box.start.column !== box.end.column
    const references = this.editing ? this.referencedCells(this.editing.value) : new Map<string, number>()
    const columns = this.columnDefs
    const template = `var(--_row-header-width) ${this.columnTracks().join(' ')}`
    const activeKey = cellRef(this.cursor.row, this.cursor.column)

    const rows = []
    for (let row = 0; row < this.model.rows; row++) {
      const rowSelected = row >= box.start.row && row <= box.end.row
      const cells = []
      for (let column = 0; column < columns.length; column++) {
        const key = cellRef(row, column)
        const selected = rowSelected && column >= box.start.column && column <= box.end.column
        const active = row === this.cursor.row && column === this.cursor.column
        const editingHere = this.editing && this.editing.row === row && this.editing.column === column
        const reference = references.get(key)
        const shown = editingHere ? { text: this.editing!.value, kind: 'text' as const } : this.display(key, column)
        cells.push(
          html`<div
            role="gridcell"
            id=${`cell-${key}`}
            class=${classMap({
              cell: true,
              [`kind-${shown.kind}`]: true,
              [`align-${columns[column].align ?? ''}`]: Boolean(columns[column].align),
              selected: multi && selected,
              active,
              editing: Boolean(editingHere && this.editing!.inCell),
              reference: reference !== undefined,
              [`reference-${reference}`]: reference !== undefined,
            })}
            aria-selected=${selected ? 'true' : 'false'}
            title=${shown.title ?? nothing}
            data-row=${row}
            data-column=${column}
          >
            ${
              editingHere && this.editing!.inCell
                ? html`<input
                    class="editor"
                    aria-label=${`Edit ${key}`}
                    spellcheck="false"
                    autocomplete="off"
                    .value=${live(this.editing!.value)}
                    @input=${this.onEditorInput}
                    @keydown=${this.onEditorKeyDown}
                    @blur=${this.onEditorBlur}
                  />`
                : shown.text
            }
          </div>`,
        )
      }
      rows.push(
        html`<div role="row" class="row">
          <div role="rowheader" class=${classMap({ header: true, 'row-header': true, selected: rowSelected })} data-row=${row}>${row + 1}</div>
          ${cells}
        </div>`,
      )
    }

    return html`
      <div class=${classMap({ spreadsheet: true, readonly: this.readonly })}>
        ${
          this.formulaBar
            ? html`<div class="formula-bar">
                <div class="name-box">${rangeRef(box)}</div>
                <div class="fx" aria-hidden="true">fx</div>
                <input
                  class="formula-input"
                  aria-label=${`Formula bar, ${activeKey}`}
                  spellcheck="false"
                  autocomplete="off"
                  ?readonly=${this.readonly}
                  .value=${live(this.editing ? this.editing.value : this.model.getInput(activeKey))}
                  @focus=${this.onFormulaBarFocus}
                  @input=${this.onEditorInput}
                  @keydown=${this.onEditorKeyDown}
                  @blur=${this.onEditorBlur}
                />
              </div>`
            : nothing
        }
        <div class="scroller">
          <div
            class="grid"
            role="grid"
            tabindex="0"
            aria-label=${this.label || nothing}
            aria-readonly=${this.readonly ? 'true' : 'false'}
            aria-multiselectable="true"
            aria-activedescendant=${`cell-${activeKey}`}
            style=${styleMap({ gridTemplateColumns: template })}
            @keydown=${this.onGridKeyDown}
            @pointerdown=${this.onPointerDown}
            @pointerover=${this.onPointerOver}
            @dblclick=${this.onDoubleClick}
            @copy=${this.onCopy}
            @cut=${this.onCut}
            @paste=${this.onPaste}
          >
            <div role="row" class="row">
              <div role="columnheader" class="header corner" data-corner><span class="visually-hidden">Row</span></div>
              ${columns.map(
                (column, index) =>
                  html`<div
                    role="columnheader"
                    class=${classMap({ header: true, 'column-header': true, selected: index >= box.start.column && index <= box.end.column })}
                    data-column=${index}
                  >
                    <span class="column-letter">${columnName(index)}</span>${column.label ? html`<span class="column-label">${column.label}</span>` : nothing}
                    ${
                      (column.resizable ?? this.resizable)
                        ? html`<span
                            class="resizer"
                            part="resizer"
                            aria-hidden="true"
                            @pointerdown=${(event: PointerEvent) => this.startResize(event, index)}
                            @dblclick=${(event: MouseEvent) => this.fitColumn(event, index)}
                          ></span>`
                        : nothing
                    }
                  </div>`,
              )}
            </div>
            ${rows}
          </div>
        </div>
        ${this.summary ? html`<div class="summary">${this.renderSummary(box)}</div>` : nothing}
        <div class="visually-hidden" role="status">${this.announcement}</div>
      </div>
    `
  }

  private columnTracks(): string[] {
    return this.columnDefs.map((column) => (column.width ? `${column.width}px` : 'var(--_cell-width)'))
  }

  private renderSummary(box: { start: CellPosition; end: CellPosition }) {
    const numbers: number[] = []
    let count = 0
    for (let row = box.start.row; row <= box.end.row; row++)
      for (let column = box.start.column; column <= box.end.column; column++) {
        const value = this.model.getValue(cellRef(row, column))
        if (value !== null && value !== '') count++
        if (typeof value === 'number') numbers.push(value)
      }
    if (!count) return html`<span>Select cells to see their sum</span>`
    if (!numbers.length) return html`<span>Count <b>${count}</b></span>`
    const total = numbers.reduce((sum, n) => sum + n, 0)
    const format = this.formatter('number')
    return html`<span>Sum <b>${format.format(total)}</b></span
      ><span>Average <b>${format.format(total / numbers.length)}</b></span
      ><span>Count <b>${count}</b></span>`
  }

  private display(key: string, column: number): { text: string; kind: 'empty' | 'number' | 'text' | 'boolean' | 'error'; title?: string } {
    const value = this.model.getValue(key)
    if (value === null || value === '') return { text: '', kind: 'empty' }
    if (isCellError(value)) return { text: value.error, kind: 'error', title: value.message }
    if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE', kind: 'boolean' }
    if (typeof value === 'string') return { text: value, kind: 'text' }
    const format = this.model.getFormatHint(key) ?? this.columnDefs[column]?.format ?? 'general'
    return { text: this.formatter(format).format(value), kind: format === 'text' ? 'text' : 'number' }
  }

  private formatter(format: SpreadsheetColumnFormat): Intl.NumberFormat {
    let formatter = this.formatters.get(format)
    if (!formatter) {
      const options: Intl.NumberFormatOptions =
        format === 'currency'
          ? { style: 'currency', currency: this.currency || 'USD' }
          : format === 'percent'
            ? { style: 'percent', maximumFractionDigits: 2 }
            : format === 'number'
              ? { maximumFractionDigits: 2 }
              : { maximumFractionDigits: 10, useGrouping: false }
      try {
        formatter = new Intl.NumberFormat(this.locale || undefined, options)
      } catch {
        formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 10, useGrouping: false })
      }
      this.formatters.set(format, formatter)
    }
    return formatter
  }

  /** Cells read by the formula being edited, each with its reference colour (1 to 4). */
  private referencedCells(text: string): Map<string, number> {
    const cells = new Map<string, number>()
    if (!text.startsWith('=')) return cells
    const body = text.slice(1).replace(/"(?:[^"]|"")*"?/g, (quoted) => ' '.repeat(quoted.length))
    const pattern = /(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?(?![A-Za-z0-9_.(])/g
    let match: RegExpExecArray | null
    let index = 0
    while ((match = pattern.exec(body))) {
      const range = parseRange(match[2] ? `${match[1]}:${match[2]}` : match[1])
      if (!range) continue
      const colour = (index++ % 4) + 1
      for (let row = range.start.row; row <= Math.min(range.end.row, this.model.rows - 1); row++)
        for (let column = range.start.column; column <= Math.min(range.end.column, this.columnDefs.length - 1); column++) {
          const key = cellRef(row, column)
          if (!cells.has(key)) cells.set(key, colour)
        }
    }
    return cells
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Selection

  private clamp(position: CellPosition): CellPosition {
    return {
      row: Math.max(0, Math.min(this.model.rows - 1, position.row)),
      column: Math.max(0, Math.min(this.columnDefs.length - 1, position.column)),
    }
  }

  private selectedBox(): { start: CellPosition; end: CellPosition } {
    return {
      start: { row: Math.min(this.cursor.row, this.extent.row), column: Math.min(this.cursor.column, this.extent.column) },
      end: { row: Math.max(this.cursor.row, this.extent.row), column: Math.max(this.cursor.column, this.extent.column) },
    }
  }

  private cellElement(position: CellPosition): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`#cell-${cellRef(position.row, position.column)}`)
  }

  /** Moves the selection as the user asked, and fires `selection-change` when it changed. */
  private userSelect(cursor: CellPosition, extent: CellPosition = cursor): void {
    const before = `${rangeRef(this.selectedBox())}|${cellRef(this.cursor.row, this.cursor.column)}`
    this.cursor = this.clamp(cursor)
    this.extent = this.clamp(extent)
    this.revealCursor = true
    const range = rangeRef(this.selectedBox())
    const active = cellRef(this.cursor.row, this.cursor.column)
    if (`${range}|${active}` === before) return
    this.dispatchEvent(new CustomEvent<SpreadsheetSelectionChangeEventDetail>('selection-change', { detail: { range, active } }))
  }

  private focusGrid(): void {
    this.renderRoot.querySelector<HTMLElement>('.grid')?.focus({ preventScroll: true })
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Editing

  private startEdit(typed: boolean, initial?: string): void {
    if (this.readonly) return
    const key = cellRef(this.cursor.row, this.cursor.column)
    const original = this.model.getInput(key)
    this.extent = this.cursor
    this.editing = { row: this.cursor.row, column: this.cursor.column, value: typed ? (initial ?? '') : original, original, inCell: true, typed }
    this.focusEditor = true
  }

  private commitEdit(rowStep = 0, columnStep = 0, refocus = true): void {
    const editing = this.editing
    if (!editing) return
    this.editing = null
    if (editing.value !== editing.original)
      this.applyChanges([{ key: cellRef(editing.row, editing.column), input: editing.value }], { record: true, notify: true })
    if (rowStep || columnStep) {
      const next = { row: editing.row + rowStep, column: editing.column + columnStep }
      this.userSelect(next)
    }
    if (refocus) this.focusGrid()
  }

  private cancelEdit(): void {
    if (!this.editing) return
    this.editing = null
    this.focusGrid()
  }

  private onFormulaBarFocus = (): void => {
    if (this.readonly || this.editing) return
    const key = cellRef(this.cursor.row, this.cursor.column)
    const original = this.model.getInput(key)
    this.editing = { row: this.cursor.row, column: this.cursor.column, value: original, original, inCell: false, typed: false }
  }

  private onEditorInput = (event: Event): void => {
    // The inner input's own `input` event is not this element's: it fires `input` once a change is committed.
    event.stopPropagation()
    if (!this.editing) return
    this.editing = { ...this.editing, value: (event.target as HTMLInputElement).value }
  }

  private onEditorKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation()
    const editing = this.editing
    if (!editing || event.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      this.commitEdit(event.shiftKey ? -1 : 1, 0)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      this.commitEdit(0, event.shiftKey ? -1 : 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.cancelEdit()
    } else if (ARROWS[event.key] && editing.inCell && editing.typed && !editing.value.startsWith('=')) {
      event.preventDefault()
      const [rowStep, columnStep] = ARROWS[event.key]
      this.commitEdit(rowStep, columnStep)
    }
  }

  private onEditorBlur = (event: FocusEvent): void => {
    const next = event.relatedTarget as Element | null
    if (next && (next.classList.contains('editor') || next.classList.contains('formula-input'))) return
    this.commitEdit(0, 0, false)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Sheet size

  /** Sets the size now rather than at the next update, so the writes that follow land inside the sheet. */
  private resizeSheet(rows: number, columns: SpreadsheetColumn[]): void {
    this.rows = rows
    this.columns = Array.isArray(this.columns) ? columns : columns.length
    this.columnDefs = columns
    this.model.resize(rows, columns.length)
  }

  private insert(axis: 'row' | 'column', index: number, count: number): void {
    count = Math.floor(count)
    if (!Number.isFinite(index) || !(count >= 1)) return
    const size = axis === 'row' ? this.model.rows : this.columnDefs.length
    const at = Math.max(0, Math.min(size, Math.floor(index)))
    if (this.editing) this.commitEdit(0, 0, false)

    const move = (position: CellPosition): CellPosition =>
      axis === 'row'
        ? { row: position.row >= at ? position.row + count : position.row, column: position.column }
        : { row: position.row, column: position.column >= at ? position.column + count : position.column }
    const entries: [string, string][] = []
    for (const key of this.model.keys()) {
      const position = parseCellRef(key)
      if (!position) continue
      const input = this.model.getInput(key)
      const moved = move(position)
      entries.push([cellRef(moved.row, moved.column), this.model.isFormula(key) ? insertIntoFormula(input, axis, at, count) : input])
    }

    const columns = [...this.columnDefs]
    if (axis === 'column') columns.splice(at, 0, ...Array.from({ length: count }, () => ({})))
    this.resizeSheet(this.model.rows + (axis === 'row' ? count : 0), columns)
    this.model.load(entries)
    // History steps name cells by address, which the insertion just changed.
    this.undoStack = []
    this.redoStack = []
    this.ownData = this.serialise()
    this.data = this.ownData
    this.cursor = move(this.cursor)
    this.extent = move(this.extent)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Changes and history

  private applyChanges(changes: Change[], { record, notify }: { record: boolean; notify: boolean }): void {
    const step: HistoryStep = []
    const seen = new Set<string>()
    for (const { key, input } of changes) {
      if (seen.has(key)) continue
      seen.add(key)
      const before = this.model.getInput(key)
      if (before === input) continue
      this.model.setInput(key, input)
      step.push({ key, before, after: input })
    }
    if (!step.length) return
    if (record) {
      this.undoStack.push(step)
      this.redoStack = []
    }
    this.ownData = this.serialise()
    this.data = this.ownData

    const errors = step.map(({ key }) => [key, this.model.getValue(key)] as const).filter(([, value]) => isCellError(value))
    this.announcement = errors.length === 1 ? `${errors[0][0]}: ${(errors[0][1] as CellError).message}` : ''

    if (!notify) return
    const detail: SpreadsheetCellChangeEventDetail = {
      changes: step.map(({ key, before, after }) => ({ ref: key, input: after, value: this.model.getValue(key), previous: before })),
    }
    this.dispatchEvent(new CustomEvent<SpreadsheetCellChangeEventDetail>('cell-change', { detail, bubbles: true, composed: true }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private clearSelection(): void {
    const box = this.selectedBox()
    const changes: Change[] = []
    for (let row = box.start.row; row <= box.end.row; row++)
      for (let column = box.start.column; column <= box.end.column; column++) changes.push({ key: cellRef(row, column), input: '' })
    this.applyChanges(changes, { record: true, notify: true })
  }

  /** The inputs as `data` holds them: trailing empty rows and cells trimmed, plain numbers and booleans typed. */
  private serialise(): CellInput[][] {
    const rows: CellInput[][] = []
    for (const key of this.model.keys()) {
      const position = parseCellRef(key)
      if (!position) continue
      const row = (rows[position.row] ??= [])
      row[position.column] = toCellInput(this.model.getInput(key))
    }
    return Array.from(rows, (row) => Array.from(row ?? [], (cell) => cell ?? null))
  }

  /** Computed values of the used range as text, row by row. */
  private exportRows(): string[][] {
    let lastRow = -1
    let lastColumn = -1
    for (const key of this.model.keys()) {
      const position = parseCellRef(key)
      if (!position) continue
      lastRow = Math.max(lastRow, position.row)
      lastColumn = Math.max(lastColumn, position.column)
    }
    const rows: string[][] = []
    for (let row = 0; row <= lastRow; row++) {
      const cells: string[] = []
      for (let column = 0; column <= lastColumn; column++) cells.push(valueText(this.model.getValue(cellRef(row, column))))
      rows.push(cells)
    }
    return rows
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Pointer

  private positionOf(target: EventTarget | null): CellPosition | 'corner' | { row: number } | { column: number } | undefined {
    const element = (target as Element | null)?.closest?.('[data-row], [data-column], [data-corner]') as HTMLElement | null
    if (!element) return undefined
    if (element.hasAttribute('data-corner')) return 'corner'
    const { row, column } = element.dataset
    if (row !== undefined && column !== undefined) return { row: +row, column: +column }
    if (row !== undefined) return { row: +row }
    if (column !== undefined) return { column: +column }
    return undefined
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || (event.target as Element).classList.contains('editor')) return
    const position = this.positionOf(event.target)
    if (!position) return
    if (this.editing) this.commitEdit(0, 0, false)
    event.preventDefault()
    this.focusGrid()
    const lastRow = this.model.rows - 1
    const lastColumn = this.columnDefs.length - 1
    if (position === 'corner') this.userSelect({ row: 0, column: 0 }, { row: lastRow, column: lastColumn })
    else if (!('column' in position)) this.userSelect({ row: position.row, column: 0 }, { row: position.row, column: lastColumn })
    else if (!('row' in position)) this.userSelect({ row: 0, column: position.column }, { row: lastRow, column: position.column })
    else {
      if (event.shiftKey) this.userSelect(this.cursor, position)
      else this.userSelect(position)
      this.dragging = true
      window.addEventListener('pointerup', this.stopDragging, { once: true })
    }
  }

  private onPointerOver = (event: PointerEvent): void => {
    if (!this.dragging || !(event.buttons & 1)) return
    const position = this.positionOf(event.target)
    if (position && position !== 'corner' && 'row' in position && 'column' in position) this.userSelect(this.cursor, position)
  }

  private stopDragging = (): void => {
    this.dragging = false
  }

  private onDoubleClick = (event: MouseEvent): void => {
    const position = this.positionOf(event.target)
    if (position && position !== 'corner' && 'row' in position && 'column' in position && !this.editing) this.startEdit(false)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Column resizing

  private startResize(event: PointerEvent, index: number): void {
    if (event.button !== 0) return
    // The header underneath would select the whole column.
    event.preventDefault()
    event.stopPropagation()
    if (this.editing) this.commitEdit(0, 0, false)
    const handle = event.currentTarget as HTMLElement
    const header = handle.parentElement
    if (!header) return
    const startWidth = header.getBoundingClientRect().width
    const startX = event.clientX
    const minWidth = this.columnDefs[index]?.minWidth ?? MIN_COLUMN_WIDTH
    let width = Math.round(startWidth)

    const move = (moveEvent: PointerEvent) => {
      width = Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX))
      this.writeColumnWidth(index, width)
    }
    const finish = (upEvent: PointerEvent) => {
      if (handle.hasPointerCapture(upEvent.pointerId)) handle.releasePointerCapture(upEvent.pointerId)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
      handle.classList.remove('resizer--active')
      if (width !== Math.round(startWidth)) this.dispatchColumnResize(index, width)
    }

    handle.setPointerCapture(event.pointerId)
    handle.classList.add('resizer--active')
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  /** Fits a column to its widest header or cell, as a double-click on the edge does in Sheets and Excel. */
  private fitColumn(event: MouseEvent, index: number): void {
    event.preventDefault()
    event.stopPropagation()
    const grid = this.renderRoot.querySelector<HTMLElement>('.grid')
    const header = (event.currentTarget as HTMLElement).parentElement
    if (!grid || !header) return
    // A `max-content` track is as wide as the column's widest header or cell, padding and border included.
    const template = grid.style.gridTemplateColumns
    const tracks = this.columnTracks().map((track, column) => (column === index ? 'max-content' : track))
    grid.style.gridTemplateColumns = `var(--_row-header-width) ${tracks.join(' ')}`
    const content = header.getBoundingClientRect().width
    grid.style.gridTemplateColumns = template
    const width = Math.max(this.columnDefs[index]?.minWidth ?? MIN_COLUMN_WIDTH, Math.ceil(content))
    if (width === this.columnDefs[index]?.width) return
    this.writeColumnWidth(index, width)
    this.dispatchColumnResize(index, width)
  }

  /** Writes a new `columns` array with the column's width, as edits write `data`. */
  private writeColumnWidth(index: number, width: number): void {
    if (this.columnDefs[index]?.width === width) return
    this.columns = this.columnDefs.map((column, other) => (other === index ? { ...column, width } : column))
  }

  private dispatchColumnResize(index: number, width: number): void {
    this.dispatchEvent(
      new CustomEvent<SpreadsheetColumnResizeEventDetail>('column-resize', {
        detail: { column: columnName(index), index, width },
        bubbles: true,
        composed: true,
      }),
    )
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Keyboard

  private onGridKeyDown = (event: KeyboardEvent): void => {
    if (this.editing || event.target !== event.currentTarget || event.isComposing) return
    const command = event.ctrlKey || event.metaKey
    const lastRow = this.model.rows - 1
    const lastColumn = this.columnDefs.length - 1
    const key = event.key

    if (ARROWS[key]) {
      event.preventDefault()
      const [rowStep, columnStep] = ARROWS[key]
      const from = event.shiftKey ? this.extent : this.cursor
      const to = command
        ? { row: rowStep ? (rowStep < 0 ? 0 : lastRow) : from.row, column: columnStep ? (columnStep < 0 ? 0 : lastColumn) : from.column }
        : { row: from.row + rowStep, column: from.column + columnStep }
      if (event.shiftKey) this.userSelect(this.cursor, to)
      else this.userSelect(to)
      return
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault()
      const to = command
        ? key === 'Home'
          ? { row: 0, column: 0 }
          : { row: lastRow, column: lastColumn }
        : { row: this.cursor.row, column: key === 'Home' ? 0 : lastColumn }
      if (event.shiftKey) this.userSelect(this.cursor, to)
      else this.userSelect(to)
      return
    }
    if (command) {
      const letter = key.toLowerCase()
      if (letter === 'a') {
        event.preventDefault()
        this.userSelect({ row: 0, column: 0 }, { row: lastRow, column: lastColumn })
      } else if (letter === 'z' && !this.readonly) {
        event.preventDefault()
        if (event.shiftKey) this.redo()
        else this.undo()
      } else if (letter === 'y' && !this.readonly) {
        event.preventDefault()
        this.redo()
      }
      return
    }
    if (key === 'Escape') {
      if (this.extent.row !== this.cursor.row || this.extent.column !== this.cursor.column) this.userSelect(this.cursor)
      return
    }
    if (this.readonly) return
    if (key === 'Enter' || key === 'F2') {
      event.preventDefault()
      this.startEdit(false)
    } else if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault()
      this.clearSelection()
    } else if (key.length === 1 && !event.altKey) {
      event.preventDefault()
      this.startEdit(true, key)
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Clipboard

  private onCopy = (event: ClipboardEvent): void => {
    if (this.editing || !event.clipboardData) return
    event.preventDefault()
    const box = this.selectedBox()
    const values: string[][] = []
    const inputs: string[][] = []
    for (let row = box.start.row; row <= box.end.row; row++) {
      const valueRow: string[] = []
      const inputRow: string[] = []
      for (let column = box.start.column; column <= box.end.column; column++) {
        const key = cellRef(row, column)
        valueRow.push(valueText(this.model.getValue(key)))
        inputRow.push(this.model.getInput(key))
      }
      values.push(valueRow)
      inputs.push(inputRow)
    }
    const text = values.map((row) => row.map(tsvField).join('\t')).join('\n')
    event.clipboardData.setData('text/plain', text)
    this.copied = { text, origin: box.start, inputs }
  }

  private onCut = (event: ClipboardEvent): void => {
    if (this.editing) return
    this.onCopy(event)
    if (!this.readonly) this.clearSelection()
  }

  private onPaste = (event: ClipboardEvent): void => {
    if (this.editing || this.readonly || !event.clipboardData) return
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    if (!text) return
    const target = this.selectedBox().start
    // A range copied from this grid pastes its inputs, so formulas move with it; anything else pastes as values.
    const own = this.copied && this.copied.text === text.replace(/\r\n?/g, '\n').replace(/\n$/, '') ? this.copied : undefined
    const grid = own
      ? own.inputs.map((row) =>
          row.map((input) => (input.startsWith('=') ? shiftFormula(input, target.row - own.origin.row, target.column - own.origin.column) : input)),
        )
      : parseTsv(text)
    const height = Math.max(1, grid.length)
    const width = Math.max(1, ...grid.map((row) => row.length))
    // A paste past the edge grows the sheet, as in Sheets and Excel, rather than dropping what does not fit.
    const missing = target.column + width - this.columnDefs.length
    if (target.row + height > this.model.rows || missing > 0)
      this.resizeSheet(Math.max(this.model.rows, target.row + height), [...this.columnDefs, ...Array.from({ length: Math.max(0, missing) }, () => ({}))])
    const changes: Change[] = []
    grid.forEach((cells, rowOffset) =>
      cells.forEach((input, columnOffset) => changes.push({ key: cellRef(target.row + rowOffset, target.column + columnOffset), input })),
    )
    this.applyChanges(changes, { record: true, notify: true })
    this.userSelect(target, { row: target.row + height - 1, column: target.column + width - 1 })
  }
}

function normaliseRef(ref: string): string | undefined {
  const position = parseCellRef(ref)
  return position ? cellRef(position.row, position.column) : undefined
}

function dataEntries(data: CellInput[][] | undefined): [string, string][] {
  const entries: [string, string][] = []
  if (!Array.isArray(data)) return entries
  data.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return
    row.forEach((input, column) => {
      if (input === null || input === undefined || input === '') return
      entries.push([cellRef(rowIndex, column), String(input)])
    })
  })
  return entries
}

/** A typed input back as `data` holds it: plain numbers as numbers, `TRUE`/`FALSE` as booleans, the rest as text. */
function toCellInput(input: string): CellInput {
  if (input === '') return null
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(input) && String(Number(input)) === input) return Number(input)
  if (input === 'TRUE' || input === 'FALSE') return input === 'TRUE'
  return input
}

function valueText(value: CellValue): string {
  return isCellError(value) ? value.error : toText(value)
}

function tsvField(text: string): string {
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Tab-separated text as Excel and Sheets write it: quoted fields may hold tabs, newlines and `""`. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [[]]
  let field = ''
  let index = 0
  const source = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  while (index < source.length) {
    const char = source[index]
    if (char === '"' && field === '') {
      let end = index + 1
      let quoted = ''
      while (end < source.length) {
        if (source[end] === '"') {
          if (source[end + 1] === '"') {
            quoted += '"'
            end += 2
            continue
          }
          break
        }
        quoted += source[end++]
      }
      const after = source[end + 1]
      if (end < source.length && (after === undefined || after === '\t' || after === '\n')) {
        field = quoted
        index = end + 1
        continue
      }
    }
    if (char === '\t') {
      rows[rows.length - 1].push(field)
      field = ''
    } else if (char === '\n') {
      rows[rows.length - 1].push(field)
      rows.push([])
      field = ''
    } else field += char
    index++
  }
  rows[rows.length - 1].push(field)
  return rows
}

// Re-exported for apps that validate formulas before writing them.
export { parseFormula }

declare global {
  interface HTMLElementTagNameMap {
    'c2-spreadsheet': Spreadsheet
  }
}
