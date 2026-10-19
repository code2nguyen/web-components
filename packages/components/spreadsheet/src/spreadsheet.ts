import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { provideContextMenuData } from '@c2n/core/context-menu-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { isApplePlatform } from '@c2n/core/shortcut-helper.js'
import '@c2n/overlay'
import { spreadsheetMessages } from './messages'
import { MENU_ICONS } from './menu-icons'
import { FUNCTION_ORDER, closeFormula, formulaContext, type BuiltinFunctionName } from './formula-help'
import styles from './spreadsheet.scss?inline'
import {
  CellError,
  SheetModel,
  cellRef,
  columnName,
  deleteFromFormula,
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
  deleteFromFormula,
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

/** The named colours a cell's text or background can take. Each is a CSS variable, so themes and dark mode recolour them. */
export const SPREADSHEET_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'red'] as const
export type SpreadsheetColor = (typeof SPREADSHEET_COLORS)[number]

/** How one cell looks. Every field is optional; a cell with none is drawn as the sheet's text. */
export interface SpreadsheetCellStyle {
  /** Named text colour. */
  color?: SpreadsheetColor
  /** Named background colour. */
  background?: SpreadsheetColor
  /** Smaller or larger text than the sheet's. */
  size?: 'small' | 'large'
  bold?: boolean
}

/** A change `setStyle` applies to a range: a value sets that part, `null` removes it (as do `size: 'normal'` and `bold: false`). */
export interface SpreadsheetStyleChange {
  color?: SpreadsheetColor | null
  background?: SpreadsheetColor | null
  size?: 'small' | 'normal' | 'large' | null
  bold?: boolean | null
}

/** One restyled cell in a `style-change` event. */
export interface SpreadsheetStyleChangeItem {
  /** Address of the cell, such as `D3`. */
  ref: string
  /** The new style, `undefined` when the cell has none left. */
  style: SpreadsheetCellStyle | undefined
  /** The style before. */
  previous: SpreadsheetCellStyle | undefined
}

export interface SpreadsheetStyleChangeEventDetail {
  changes: SpreadsheetStyleChangeItem[]
}

/** A total `insertTotal` writes. `COUNTA` counts every cell that is not empty, as the totals bar does. */
export type SpreadsheetTotal = 'SUM' | 'AVERAGE' | 'COUNT' | 'COUNTA' | 'MIN' | 'MAX'

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

export interface SpreadsheetColumnRenameEventDetail {
  /** The column letter, such as `B`. */
  column: string
  /** Zero-based column index. */
  index: number
  /** The new name, `''` when it was cleared; also written to `columns` as the column's `label`. */
  label: string
  /** The name before. */
  previous: string
}

export interface SpreadsheetColumnResizeEventDetail {
  /** The column letter, such as `B`. */
  column: string
  /** Zero-based column index. */
  index: number
  /** The new width in pixels, also written to `columns`. */
  width: number
}

/**
 * What a right click (or long press, or the context-menu key) landed on, handed to an enclosing `c2-context-menu` as
 * `context.data`. The selection has already moved there, so `start` and `end` are what an insert or delete acts on.
 */
export interface SpreadsheetContextMenuData {
  /** A cell, a row header, a column header, or the corner that selects everything. */
  area: 'cell' | 'row' | 'column' | 'corner'
  /** The selected range, such as `B2:C4`. */
  range: string
  /** The current cell, such as `B2`. */
  active: string
  /** Zero-based top-left of the selection. */
  start: CellPosition
  /** Zero-based bottom-right of the selection. */
  end: CellPosition
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
  'column-rename': CustomEvent<SpreadsheetColumnRenameEventDetail>
  'style-change': CustomEvent<SpreadsheetStyleChangeEventDetail>
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
  styles: (SpreadsheetCellStyle | undefined)[][]
}

type Change = { key: string; input: string }
type StyleUpdate = { key: string; style: SpreadsheetCellStyle | undefined }
type InputEntry = { key: string; before: string; after: string }
type StyleEntry = { key: string; style: true; before: SpreadsheetCellStyle | undefined; after: SpreadsheetCellStyle | undefined }
/** One undoable change: the inputs and the styles it changed, cell by cell. */
type HistoryStep = (InputEntry | StyleEntry)[]

/** The default look of each named colour, for the menu's swatches, which the element's stylesheet does not reach. */
const COLOR_DEFAULTS: Record<SpreadsheetColor, string> = {
  gray: '#91918e',
  brown: '#a27763',
  orange: '#d9730d',
  yellow: '#cb912f',
  green: '#448361',
  blue: '#337ea9',
  purple: '#9065b0',
  red: '#d44c47',
}
const BACKGROUND_DEFAULTS: Record<SpreadsheetColor, string> = {
  gray: 'rgba(145, 145, 142, 0.2)',
  brown: 'rgba(162, 119, 99, 0.2)',
  orange: 'rgba(217, 115, 13, 0.18)',
  yellow: 'rgba(223, 171, 1, 0.22)',
  green: 'rgba(68, 131, 97, 0.18)',
  blue: 'rgba(51, 126, 169, 0.18)',
  purple: 'rgba(144, 101, 176, 0.18)',
  red: 'rgba(212, 76, 71, 0.18)',
}
const SWATCH =
  'display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: 4px; font-size: 13px; font-weight: 600; line-height: 1;'

let contextMenuLoaded: Promise<unknown> | undefined
/** The right-click menu loads with the first sheet that asks for one. */
const loadContextMenu = () => (contextMenuLoaded ??= import('@c2n/context-menu'))

const isStyleEntry = (entry: InputEntry | StyleEntry): entry is StyleEntry => 'style' in entry

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
 * Typing a formula is guided: after `=`, or on a name, a list offers the functions with what they take and do (↑↓
 * chooses, Tab or Enter inserts `SUM(`); inside a call, a hint names its arguments with the current one in bold, and
 * the result shows before Enter. Where a reference can go, clicking a cell puts it in the formula and dragging makes a
 * range. A formula left open is closed on Enter. The formula bar's fx button lists every function.
 *
 * With `context-menu`, a right-click opens a menu of its own (loaded with the first sheet that asks): insert and
 * delete rows and columns, rename a column, add a total, and make the selected cells bold, coloured or larger. Its
 * changes fire `input` and `change` like an edit.
 *
 * The totals bar (`summary`) adds up the selection; each total is a button that writes its formula under the range
 * (`=SUM(C1:C4)` in C5), as `insertTotal()` does.
 *
 * Keyboard: arrows move, Shift+arrows extend the range, typing replaces the cell, Enter, F2 or a double-click edit
 * it, Enter and Tab commit and move, Escape cancels, Delete clears, Ctrl/⌘+C, X, V copy, cut and paste as
 * tab-separated text, Ctrl/⌘+Z and Y undo and redo, Ctrl/⌘+A selects every cell. Tab outside an edit leaves the grid.
 *
 * A paste larger than the space left grows the sheet to fit. `insertRows`, `insertColumns`, `deleteRows` and
 * `deleteColumns` change the sheet's shape, and formulas keep pointing at the cells they read.
 *
 * Wrapped in a `c2-context-menu`, a right-clicked cell, row header or column header selects itself (unless it is
 * already selected) and answers the menu's request with a `SpreadsheetContextMenuData` (`area`, `range`, `active`,
 * `start`, `end`), which `renderContextMenu` receives as `context.data` with this element as `context.source`: enough
 * to offer "Insert row above" or "Delete columns" and call the methods above.
 *
 * Drag the right edge of a column header to resize the column, or double-click it to fit the column to its content.
 * The new width is written to `columns` and reported by `column-resize`.
 *
 * Cells take a style, in `styles` or through `setStyle()`: one of eight named text and background colours, a smaller
 * or larger size, and bold (Ctrl/⌘+B toggles it on the selection). Styles move with their cells when rows and
 * columns are inserted, deleted, cut or pasted, and undo with the inputs. A user's change is reported by `style-change`.
 *
 * With `rename-columns`, double-clicking a column header names the column in place, and `renameColumn()` does the same
 * from a menu or a button: Enter or leaving the field saves the name, Escape cancels, and Tab saves it and goes on to
 * the next column. The name is written to `columns` as the column's `label` and reported by `column-rename`.
 *
 * @tag c2-spreadsheet
 *
 * @event {CustomEvent<SpreadsheetCellChangeEventDetail>} cell-change - Fired once per edit, paste, cut, delete, undo or redo with every cell the user changed (`detail.changes`: `ref`, `input`, `value`, `previous`). Cells that only recalculated are not listed.
 * @event {CustomEvent<SpreadsheetSelectionChangeEventDetail>} selection-change - Fired after the user moves the selection. `detail.range` is the selected range and `detail.active` the current cell. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself.
 * @event {CustomEvent<SpreadsheetStyleChangeEventDetail>} style-change - Fired when the user restyles cells (Ctrl/⌘+B, a paste or a cut, undo or redo) with every cell whose style changed (`detail.changes`: `ref`, `style`, `previous`). `setStyle()` fires none.
 * @event {CustomEvent<SpreadsheetColumnRenameEventDetail>} column-rename - Fired when the user saves a new name for a column. `detail.column` is the letter, `detail.index` the zero-based index, `detail.label` the new name (`''` when cleared) and `detail.previous` the old one. The name is also written to `columns`.
 * @event {CustomEvent<SpreadsheetColumnResizeEventDetail>} column-resize - Fired when the user releases a column's resize handle or double-clicks it to fit the content. `detail.column` is the letter, `detail.index` the zero-based index and `detail.width` the new width in pixels, which is also written to `columns`.
 * @event {Event} input - Fired with every `cell-change`, for generic two-way bindings.
 * @event {Event} change - Fired with every `cell-change`, for generic two-way bindings.
 * @attr styles - Cell styles keyed by address (`{"D5": {"bold": true, "background": "yellow"}}`), as JSON. Edits write a new object to the `styles` property, so it always holds the current styles.
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
 * @cssproperty {font-family} [--c2-spreadsheet__editor--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace] - A formula being edited in its cell; text keeps the cell's font.
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
 * @cssproperty {color} [--c2-spreadsheet__fx__hover--background-color=#edf1fe] - The fx button (it lists the functions) under the pointer.
 * @cssproperty {color} [--c2-spreadsheet__fx__hover--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-spreadsheet__total__hover--background-color=rgba(2, 101, 220, 0.08)] - A total in the totals bar under the pointer.
 * @cssproperty {color} [--c2-spreadsheet__help--background-color=#ffffff] - The formula help: function suggestions and the argument hint.
 * @cssproperty {color} [--c2-spreadsheet__help--color=#18181b]
 * @cssproperty {border} [--c2-spreadsheet__help--border=1px solid #e4e4e7]
 * @cssproperty {length} [--c2-spreadsheet__help--border-radius=10px]
 * @cssproperty {shadow} [--c2-spreadsheet__help--box-shadow=0 12px 32px rgba(24, 24, 27, 0.16)]
 * @cssproperty {length} [--c2-spreadsheet__help--width=340px]
 * @cssproperty {color} [--c2-spreadsheet__help-muted--color=#71717a] - Argument names and descriptions in the help.
 * @cssproperty {color} [--c2-spreadsheet__help-option__active--background-color=#edf1fe] - The suggestion Tab would insert.
 * @cssproperty {color} [--c2-spreadsheet__help-accent--color=rgb(2, 101, 220)] - The typed part of a suggested name.
 * @cssproperty {color} [--c2-spreadsheet--color-gray=#91918e] - Text of a cell styled `color: 'gray'`.
 * @cssproperty {color} [--c2-spreadsheet--color-brown=#a27763] - Text of a cell styled `color: 'brown'`.
 * @cssproperty {color} [--c2-spreadsheet--color-orange=#d9730d] - Text of a cell styled `color: 'orange'`.
 * @cssproperty {color} [--c2-spreadsheet--color-yellow=#cb912f] - Text of a cell styled `color: 'yellow'`.
 * @cssproperty {color} [--c2-spreadsheet--color-green=#448361] - Text of a cell styled `color: 'green'`.
 * @cssproperty {color} [--c2-spreadsheet--color-blue=#337ea9] - Text of a cell styled `color: 'blue'`.
 * @cssproperty {color} [--c2-spreadsheet--color-purple=#9065b0] - Text of a cell styled `color: 'purple'`.
 * @cssproperty {color} [--c2-spreadsheet--color-red=#d44c47] - Text of a cell styled `color: 'red'`.
 * @cssproperty {color} [--c2-spreadsheet--background-gray=rgba(145, 145, 142, 0.2)] - Background of a cell styled `background: 'gray'`.
 * @cssproperty {color} [--c2-spreadsheet--background-brown=rgba(162, 119, 99, 0.2)] - Background of a cell styled `background: 'brown'`.
 * @cssproperty {color} [--c2-spreadsheet--background-orange=rgba(217, 115, 13, 0.18)] - Background of a cell styled `background: 'orange'`.
 * @cssproperty {color} [--c2-spreadsheet--background-yellow=rgba(223, 171, 1, 0.22)] - Background of a cell styled `background: 'yellow'`.
 * @cssproperty {color} [--c2-spreadsheet--background-green=rgba(68, 131, 97, 0.18)] - Background of a cell styled `background: 'green'`.
 * @cssproperty {color} [--c2-spreadsheet--background-blue=rgba(51, 126, 169, 0.18)] - Background of a cell styled `background: 'blue'`.
 * @cssproperty {color} [--c2-spreadsheet--background-purple=rgba(144, 101, 176, 0.18)] - Background of a cell styled `background: 'purple'`.
 * @cssproperty {color} [--c2-spreadsheet--background-red=rgba(212, 76, 71, 0.18)] - Background of a cell styled `background: 'red'`.
 * @cssproperty {font-size} [--c2-spreadsheet__cell__small--font-size=0.86em] - Text of a cell styled `size: 'small'`.
 * @cssproperty {font-size} [--c2-spreadsheet__cell__large--font-size=1.25em] - Text of a cell styled `size: 'large'`.
 * @cssproperty {font-weight} [--c2-spreadsheet__cell__bold--font-weight=600] - Text of a bold cell.
 */
@customElement('c2-spreadsheet')
export class Spreadsheet extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * Raw inputs, row by row: numbers, booleans, text, or formulas as strings starting with `=`. JSON in markup.
   * Edits write a new array here, so it always holds the current inputs.
   */
  @property({ converter: jsonPropertyConverter }) data: CellInput[][] = []

  /**
   * Cell styles keyed by address (`{"D5": {"bold": true, "background": "yellow"}}`). JSON in markup. Edits write a
   * new object here, so it always holds the current styles.
   */
  @property({ converter: jsonPropertyConverter }) styles: Record<string, SpreadsheetCellStyle> = {}

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

  /** Lets the user name a column by double-clicking its header. `renameColumn()` works without it. */
  @property({ type: Boolean, attribute: 'rename-columns' }) renameColumns = false

  /**
   * A right-click menu of its own: insert and delete rows and columns, rename a column, add a total, and make the
   * selected cells bold, coloured or larger. Its changes fire `input` and `change` like an edit. Leave it off when an
   * enclosing `c2-context-menu` builds the menu (it gets `SpreadsheetContextMenuData`).
   */
  @property({ type: Boolean, attribute: 'context-menu' }) contextMenu = false

  /**
   * Shows the selection and the current cell only while the sheet has the focus or its menu is open (its own, or a
   * `c2-context-menu` it sits in), for a sheet among other content (a card on a board, a table in a page) where a
   * highlight left behind reads as still being there.
   */
  @property({ type: Boolean, attribute: 'hide-selection-on-blur' }) hideSelectionOnBlur = false

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
  /** The column whose name is being edited in its header, and the text typed so far. */
  @state() private renaming: { index: number; value: string } | null = null
  /** Where the caret is in the formula being typed, for the suggestions and the argument hint. */
  @state() private caret = 0
  @state() private suggestionIndex = 0
  /** Escape closed the suggestions; typing opens them again. */
  @state() private helpClosed = false
  /** The fx button asked for every function. */
  @state() private showAllFunctions = false
  /** The focus is in the sheet (its grid, an editor, its menu). */
  @state() private focusWithin = false
  /** The sheet's own right-click menu, or the c2-context-menu around it, is open. */
  @state() private cellMenuOpen = false
  /** The c2-context-menu the sheet sits in, whose menu acts on the sheet's selection as its own does. */
  private outerMenu: Element | null = null

  private readonly msg = new LocalizeController(this, spreadsheetMessages)

  private readonly model = new SheetModel(20, 8)
  /** The array this element last wrote to `data`, so its own write is not reloaded. */
  private ownData: CellInput[][] | undefined
  private columnDefs: SpreadsheetColumn[] = []
  /** Styles by normalised address. */
  private readonly cellStyles = new Map<string, SpreadsheetCellStyle>()
  /** The object this element last wrote to `styles`, so its own write is not reloaded. */
  private ownStyles: Record<string, SpreadsheetCellStyle> | undefined
  private undoStack: HistoryStep[] = []
  private redoStack: HistoryStep[] = []
  private copied: CopiedRange | undefined
  private dragging = false
  private focusEditor = false
  private focusRename = false
  /** A caret to put in the editor once it renders, after a function or a reference went in. */
  private pendingCaret: number | undefined
  /** The reference a click on the sheet put in the formula: a drag or another click replaces it. */
  private pointing: { start: number; end: number; anchor: CellPosition } | null = null
  private pointingDrag = false
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

  /** The style of a cell (`'D3'`), `undefined` when it has none. */
  getStyle(ref: string): SpreadsheetCellStyle | undefined {
    const key = normaliseRef(ref)
    const style = key ? this.cellStyles.get(key) : undefined
    return style ? { ...style } : undefined
  }

  /**
   * Restyles every cell of `'A1'` or `'A1:C4'`: each field of `change` sets that part of the style, `null` removes it
   * (as do `size: 'normal'` and `bold: false`), and the parts it leaves out stay. The change goes into the undo
   * history but fires no event.
   */
  setStyle(range: string, change: SpreadsheetStyleChange): void {
    const box = parseRange(range)
    if (!box) return
    this.restyle(box, change, false)
  }

  /** Reverts the last change. */
  undo(): void {
    const step = this.undoStack.pop()
    if (!step) return
    this.redoStack.push(step)
    this.replay(step, 'before')
  }

  /** Re-applies the last undone change. */
  redo(): void {
    const step = this.redoStack.pop()
    if (!step) return
    this.undoStack.push(step)
    this.replay(step, 'after')
  }

  /**
   * Inserts `count` empty rows before the zero-based row `index`: `0` adds them at the top, `rows` at the bottom.
   * The rows below move down and every formula follows the cells it reads, so `=SUM(B1:B5)` becomes `=SUM(B1:B6)`
   * when a row goes in inside the range. Writes `data` and `rows`, clears the undo history and fires no event.
   */
  insertRows(index: number, count = 1): void {
    this.restructure('row', index, count, false)
  }

  /**
   * Inserts `count` empty columns before the zero-based column `index`: `0` adds them first, the column count last.
   * The columns to the right move over with their options (`label`, `width`, `format`, `align`), and every formula
   * follows the cells it reads. Writes `data` and `columns`, clears the undo history and fires no event.
   */
  insertColumns(index: number, count = 1): void {
    this.restructure('column', index, count, false)
  }

  /**
   * Deletes `count` rows from the zero-based row `index`. The rows below move up and formulas follow them: a
   * reference to a deleted cell becomes `#REF!` and a range that loses rows shrinks (`=SUM(B1:B5)` becomes
   * `=SUM(B1:B4)`). At least one row always stays. Writes `data` and `rows`, clears the undo history and fires no event.
   */
  deleteRows(index: number, count = 1): void {
    this.restructure('row', index, count, true)
  }

  /**
   * Deletes `count` columns from the zero-based column `index`, with their options. The columns to the right move
   * over and formulas follow them, as `deleteRows` describes. At least one column always stays. Writes `data` and
   * `columns`, clears the undo history and fires no event.
   */
  deleteColumns(index: number, count = 1): void {
    this.restructure('column', index, count, true)
  }

  /**
   * Writes a total of `range` (the selection when left out) as a formula, as the totals bar's buttons do: under each
   * column of a range taller than one row (`=SUM(C1:C4)` in C5), or after a one-row range. A row or column is inserted
   * first when that place is taken or past the sheet. Returns the cells written, `''` for a single cell. Fires no event.
   */
  insertTotal(total: SpreadsheetTotal, range?: string): string {
    const box = range ? parseRange(range) : this.selectedBox()
    return box ? this.writeTotal(total, { start: this.clamp(box.start), end: this.clamp(box.end) }, false) : ''
  }

  /**
   * Opens the name of the zero-based column `index` for editing, in its header: Enter or leaving the field saves it,
   * Escape cancels, Tab saves it and goes on to the next column. Does nothing on a read-only sheet.
   */
  renameColumn(index: number): void {
    if (this.readonly || !(index >= 0 && index < this.columnDefs.length)) return
    if (this.editing) this.commitEdit(0, 0, false)
    this.renaming = { index, value: this.columnDefs[index]?.label ?? '' }
    this.focusRename = true
  }

  /** Focuses the grid on its current cell, ready for the arrow keys and typing. */
  override focus(options?: FocusOptions): void {
    const grid = this.renderRoot?.querySelector<HTMLElement>('.grid')
    if (grid) grid.focus(options)
    else super.focus(options)
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
    if (changed.has('styles') && this.styles !== this.ownStyles) {
      this.cellStyles.clear()
      for (const [ref, style] of Object.entries(this.styles ?? {})) {
        const key = normaliseRef(ref)
        const clean = cleanStyle(style)
        if (key && clean) this.cellStyles.set(key, clean)
      }
      this.undoStack = []
      this.redoStack = []
    }
    if (changed.has('functions')) this.model.setFunctions(this.functions ?? {})
    if (this.contextMenu) void loadContextMenu()
    if (changed.has('locale') || changed.has('currency')) this.formatters.clear()
    this.cursor = this.clamp(this.cursor)
    this.extent = this.clamp(this.extent)
  }

  protected override updated(): void {
    if (this.focusRename) {
      this.focusRename = false
      const field = this.renderRoot.querySelector<HTMLInputElement>('.label-editor')
      field?.focus()
      field?.select()
    }
    if (this.focusEditor) {
      this.focusEditor = false
      const editor = this.renderRoot.querySelector<HTMLInputElement>('.editor')
      if (editor) {
        editor.focus()
        editor.setSelectionRange(editor.value.length, editor.value.length)
      }
    }
    if (this.pendingCaret !== undefined) {
      const caret = this.pendingCaret
      this.pendingCaret = undefined
      const input = this.activeInput()
      if (input) {
        input.focus()
        input.setSelectionRange(caret, caret)
      }
    }
    if (this.revealCursor) {
      this.revealCursor = false
      this.cellElement(this.extent)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener('focusin', this.onFocusIn)
    this.addEventListener('focusout', this.onFocusOut)
    this.outerMenu = this.closest('c2-context-menu')
    this.outerMenu?.addEventListener('toggle', this.onOuterMenuToggle)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('pointerup', this.stopDragging)
    this.removeEventListener('focusin', this.onFocusIn)
    this.removeEventListener('focusout', this.onFocusOut)
    this.outerMenu?.removeEventListener('toggle', this.onOuterMenuToggle)
    this.outerMenu = null
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
    const suggestions = this.suggestions()
    const suggestionIndex = Math.min(this.suggestionIndex, suggestions.length - 1)

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
              ...styleClasses(this.cellStyles.get(key)),
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
                    class=${this.editing!.value.startsWith('=') ? 'editor formula' : 'editor'}
                    role="combobox"
                    aria-label=${`Edit ${key}`}
                    aria-autocomplete="list"
                    aria-controls="formula-functions"
                    aria-expanded=${suggestions.length ? 'true' : 'false'}
                    aria-activedescendant=${ifDefined(suggestions.length ? `function-${suggestionIndex}` : undefined)}
                    spellcheck="false"
                    autocomplete="off"
                    .value=${live(this.editing!.value)}
                    @input=${this.onEditorInput}
                    @keydown=${this.onEditorKeyDown}
                    @keyup=${this.onEditorCaret}
                    @pointerup=${this.onEditorCaret}
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

    const scroller = html`<div class="scroller">
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
        @c2-context-menu-request=${this.onContextMenuRequest}
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
                <span class="column-letter">${columnName(index)}</span>${
                  this.renaming?.index === index
                    ? html`<input
                        class="label-editor"
                        aria-label=${this.msg.t('columnName', columnName(index))}
                        spellcheck="false"
                        autocomplete="off"
                        data-index=${index}
                        .value=${live(this.renaming.value)}
                        @input=${this.onRenameInput}
                        @keydown=${this.onRenameKeyDown}
                        @blur=${this.onRenameBlur}
                      />`
                    : column.label
                      ? html`<span class="column-label">${column.label}</span>`
                      : nothing
                }
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
    </div>`

    return html`
      <div
        class=${classMap({
          spreadsheet: true,
          readonly: this.readonly,
          blurred: this.hideSelectionOnBlur && !this.focusWithin && !this.cellMenuOpen && !this.editing,
        })}
      >
        ${
          this.formulaBar
            ? html`<div class="formula-bar">
                <div class="name-box">${rangeRef(box)}</div>
                ${
                  this.readonly
                    ? html`<div class="fx" aria-hidden="true">fx</div>`
                    : html`<button
                        type="button"
                        class="fx"
                        aria-label=${this.msg.t('showFunctions')}
                        title=${this.msg.t('showFunctions')}
                        @pointerdown=${(event: Event) => event.preventDefault()}
                        @click=${this.onFxClick}
                      >
                        fx
                      </button>`
                }
                <input
                  class="formula-input"
                  role="combobox"
                  aria-label=${`Formula bar, ${activeKey}`}
                  aria-autocomplete="list"
                  aria-controls="formula-functions"
                  aria-expanded=${suggestions.length && this.editing && !this.editing.inCell ? 'true' : 'false'}
                  aria-activedescendant=${ifDefined(suggestions.length && this.editing && !this.editing.inCell ? `function-${suggestionIndex}` : undefined)}
                  spellcheck="false"
                  autocomplete="off"
                  ?readonly=${this.readonly}
                  .value=${live(this.editing ? this.editing.value : this.model.getInput(activeKey))}
                  @focus=${this.onFormulaBarFocus}
                  @input=${this.onEditorInput}
                  @keydown=${this.onEditorKeyDown}
                  @keyup=${this.onEditorCaret}
                  @pointerup=${this.onEditorCaret}
                  @blur=${this.onEditorBlur}
                />
              </div>`
            : nothing
        }
        ${
          this.contextMenu && !this.readonly
            ? html`<c2-context-menu
                class="cell-menu"
                .renderContextMenu=${this.renderCellMenu}
                @context-menu-select=${this.onCellMenuSelect}
                @toggle=${this.onCellMenuToggle}
                >${scroller}</c2-context-menu
              >`
            : scroller
        }
        ${this.summary ? html`<div class="summary">${this.renderSummary(box)}</div>` : nothing} ${this.renderHelp(suggestions, suggestionIndex)}
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
    if (!count) return html`<span>${this.msg.t('selectToSum')}</span>`
    // Each total is a button that writes its formula next to the range, unless there is nowhere sensible to put it.
    const targets = this.readonly ? [] : this.totalTargets(box)
    const item = (label: string, total: SpreadsheetTotal, value: string | number) => {
      if (!targets.length) return html`<span>${label} <b>${value}</b></span>`
      const where = targets.length === 1 ? targets[0].key : `${targets[0].key}:${targets[targets.length - 1].key}`
      const title = this.msg.t('insertTotal', `=${total}(${targets[0].range})`, where)
      return html`<button
        type="button"
        class="total"
        title=${title}
        aria-label=${`${label} ${value}. ${title}`}
        @click=${() => this.writeTotal(total, box, true)}
      >
        ${label} <b>${value}</b>
      </button>`
    }
    if (!numbers.length) return item(this.msg.t('count'), 'COUNTA', count)
    const total = numbers.reduce((sum, n) => sum + n, 0)
    const format = this.formatter('number')
    return html`${item(this.msg.t('sum'), 'SUM', format.format(total))}${item(this.msg.t('average'), 'AVERAGE', format.format(total / numbers.length))}${item(
      this.msg.t('count'),
      'COUNTA',
      count,
    )}`
  }

  /** The built-in right-click menu, for the cells the request selected (`context-menu`). */
  private renderCellMenu = ({ data }: { data?: unknown }) => {
    if (this.readonly || !data) return nothing
    const { area, start, end, active } = data as SpreadsheetContextMenuData
    const t = this.msg.t.bind(this.msg)
    const rows = area !== 'column'
    const columns = area !== 'row'
    const several = start.row !== end.row || start.column !== end.column
    const style = this.cellStyles.get(normaliseRef(active) ?? '') ?? {}
    const swatch = (kind: 'color' | 'background', color: SpreadsheetColor | null) => {
      const paint = color
        ? kind === 'color'
          ? `color: var(--c2-spreadsheet--color-${color}, ${COLOR_DEFAULTS[color]});`
          : `background: var(--c2-spreadsheet--background-${color}, ${BACKGROUND_DEFAULTS[color]});`
        : ''
      return html`<span slot="prefix-icon" aria-hidden="true" style=${SWATCH + paint}>A</span>`
    }
    // The menu renders in the context menu's shadow root, out of reach of this element's styles: swatches are styled inline.
    const palette = (kind: 'color' | 'background', current: SpreadsheetColor | undefined) =>
      html`<c2-menu slot="submenu">
        <c2-menu-row>
          <c2-menu-item
            type="radio"
            name=${kind}
            value=${`${kind}-default`}
            label=${t(kind === 'color' ? 'defaultColour' : 'noBackground')}
            ?checked=${!current}
            >${swatch(kind, null)}</c2-menu-item
          >
          ${SPREADSHEET_COLORS.map(
            (color) =>
              html`<c2-menu-item type="radio" name=${kind} value=${`${kind}-${color}`} label=${t(color)} ?checked=${current === color}
                >${swatch(kind, color)}</c2-menu-item
              >`,
          )}
        </c2-menu-row>
      </c2-menu>`
    return html`
      ${rows ? html`<c2-menu-item value="row-above">${MENU_ICONS.rowAbove}${t('insertRowAbove')}</c2-menu-item><c2-menu-item value="row-below">${MENU_ICONS.rowBelow}${t('insertRowBelow')}</c2-menu-item>` : nothing}
      ${
        columns
          ? html`<c2-menu-item value="column-left">${MENU_ICONS.columnLeft}${t('insertColumnLeft')}</c2-menu-item
              ><c2-menu-item value="column-right">${MENU_ICONS.columnRight}${t('insertColumnRight')}</c2-menu-item>`
          : nothing
      }
      ${columns && this.renameColumns ? html`<c2-menu-item value="rename-column">${MENU_ICONS.rename}${t('renameColumn')}</c2-menu-item>` : nothing}
      ${
        several
          ? html`<c2-menu-item value="total"
              >${MENU_ICONS.total}${t('addTotal')}
              <c2-menu slot="submenu">
                <c2-menu-item value="total-SUM">${t('sum')}</c2-menu-item>
                <c2-menu-item value="total-AVERAGE">${t('average')}</c2-menu-item>
                <c2-menu-item value="total-COUNTA">${t('count')}</c2-menu-item>
                <c2-menu-item value="total-MIN">${t('minimum')}</c2-menu-item>
                <c2-menu-item value="total-MAX">${t('maximum')}</c2-menu-item>
              </c2-menu>
            </c2-menu-item>`
          : nothing
      }
      <hr />
      <c2-menu-item type="checkbox" value="bold" ?checked=${Boolean(style.bold)}>${MENU_ICONS.bold}${t('bold')}</c2-menu-item>
      <c2-menu-item value="text-colour">${MENU_ICONS.textColour}${t('textColour')}${palette('color', style.color)}</c2-menu-item>
      <c2-menu-item value="background-colour">${MENU_ICONS.background}${t('backgroundColour')}${palette('background', style.background)}</c2-menu-item>
      <c2-menu-item value="text-size"
        >${MENU_ICONS.size}${t('textSize')}
        <c2-menu slot="submenu">
          ${(['small', 'normal', 'large'] as const).map(
            (size) =>
              html`<c2-menu-item type="radio" name="size" value=${`size-${size}`} ?checked=${(style.size ?? 'normal') === size}
                >${t(size === 'small' ? 'sizeSmall' : size === 'large' ? 'sizeLarge' : 'sizeNormal')}</c2-menu-item
              >`,
          )}
        </c2-menu>
      </c2-menu-item>
      <hr />
      ${rows ? html`<c2-menu-item value="delete-rows" destructive>${MENU_ICONS.delete}${t('deleteRows')}</c2-menu-item>` : nothing}
      ${columns ? html`<c2-menu-item value="delete-columns" destructive>${MENU_ICONS.delete}${t('deleteColumns')}</c2-menu-item>` : nothing}
    `
  }

  private onCellMenuSelect = (event: Event): void => {
    event.stopPropagation()
    const { value, context } = (event as CustomEvent<{ value: string; context: { data?: unknown } }>).detail
    const data = context?.data as SpreadsheetContextMenuData | undefined
    if (!data || this.readonly) return
    const { start, end, range, active } = data
    const rowCount = end.row - start.row + 1
    const columnCount = end.column - start.column + 1
    const format = /^(bold|color|background|size)(?:-(\w+))?$/.exec(value)
    if (value === 'rename-column') return this.renameColumn(start.column)
    if (format) {
      const [, kind, name] = format
      const change: SpreadsheetStyleChange =
        kind === 'bold'
          ? { bold: !this.getStyle(active)?.bold }
          : kind === 'size'
            ? { size: name as 'small' | 'normal' | 'large' }
            : { [kind]: name === 'default' ? null : (name as SpreadsheetColor) }
      const box = parseRange(range)
      if (box) this.restyle(box, change, true)
      this.notifyChanged()
    } else if (value.startsWith('total-')) {
      const box = parseRange(range)
      if (box) this.writeTotal(value.slice(6) as SpreadsheetTotal, box, true)
    } else {
      if (value === 'row-above') this.insertRows(start.row, rowCount)
      else if (value === 'row-below') this.insertRows(end.row + 1, rowCount)
      else if (value === 'column-left') this.insertColumns(start.column, columnCount)
      else if (value === 'column-right') this.insertColumns(end.column + 1, columnCount)
      else if (value === 'delete-rows') this.deleteRows(start.row, rowCount)
      else if (value === 'delete-columns') this.deleteColumns(start.column, columnCount)
      else return
      this.notifyChanged()
    }
    this.focusGrid()
  }

  private onCellMenuToggle = (event: Event): void => {
    this.cellMenuOpen = (event as ToggleEvent).newState === 'open'
  }

  /** The menu around the sheet: its own toggle, not that of a menu or popover inside the sheet bubbling up to it. */
  private onOuterMenuToggle = (event: Event): void => {
    if (event.target === this.outerMenu) this.onCellMenuToggle(event)
  }

  /** The focus came in, or left: checked once it has landed, as it may only be moving within the sheet. */
  private onFocusIn = (): void => {
    this.focusWithin = true
  }

  private onFocusOut = (): void => {
    setTimeout(() => (this.focusWithin = this.matches(':focus-within')))
  }

  /** A change from the built-in menu, reported as an edit is. */
  private notifyChanged(): void {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /** Where the totals of a range go: under each column of a taller range, after a one-row range. */
  private totalTargets(box: { start: CellPosition; end: CellPosition }): { key: string; range: string; position: CellPosition }[] {
    if (box.start.row === box.end.row && box.start.column !== box.end.column) {
      const position = { row: box.start.row, column: box.end.column + 1 }
      return [{ key: cellRef(position.row, position.column), range: rangeRef(box), position }]
    }
    if (box.start.row === box.end.row) return []
    const targets = []
    for (let column = box.start.column; column <= box.end.column; column++) {
      const position = { row: box.end.row + 1, column }
      targets.push({
        key: cellRef(position.row, column),
        range: rangeRef({ start: { row: box.start.row, column }, end: { row: box.end.row, column } }),
        position,
      })
    }
    return targets
  }

  private writeTotal(total: SpreadsheetTotal, box: { start: CellPosition; end: CellPosition }, notify: boolean): string {
    const targets = this.totalTargets(box)
    if (!targets.length) return ''
    const below = targets[0].position.row > box.end.row
    const taken = targets.some(
      ({ position }) =>
        position.row >= this.model.rows || position.column >= this.columnDefs.length || this.model.getInput(cellRef(position.row, position.column)) !== '',
    )
    if (taken) {
      if (below) this.insertRows(box.end.row + 1)
      else this.insertColumns(box.end.column + 1)
    }
    this.applyChanges(
      targets.map(({ key, range }) => ({ key, input: `=${total}(${range})` })),
      { record: true, notify },
    )
    const first = targets[0].position
    const last = targets[targets.length - 1].position
    if (notify) this.userSelect(first, last)
    else {
      this.cursor = first
      this.extent = last
    }
    return targets.length === 1 ? targets[0].key : `${targets[0].key}:${targets[targets.length - 1].key}`
  }

  /** The functions whose name starts with the one typed at the caret; every function after `=` or from fx. */
  private suggestions(): { name: string; builtin: boolean }[] {
    const editing = this.editing
    if (!editing || this.helpClosed || !editing.value.startsWith('=')) return []
    const context = formulaContext(editing.value, this.caret)
    const typed = context.name ?? (this.showAllFunctions ? { start: this.caret, text: '' } : undefined)
    if (!typed) return []
    const prefix = typed.text.toUpperCase()
    const extra = Object.keys(this.functions ?? {})
      .map((name) => name.toUpperCase())
      .filter((name) => !(FUNCTION_ORDER as readonly string[]).includes(name))
      .sort()
    return [...FUNCTION_ORDER.map((name) => ({ name, builtin: true })), ...extra.map((name) => ({ name, builtin: false }))].filter(({ name }) =>
      name.startsWith(prefix),
    )
  }

  /** The suggestions, or else the hint for the call the caret is in with the formula's result so far. */
  private renderHelp(suggestions: { name: string; builtin: boolean }[], active: number) {
    const editing = this.editing
    let content: unknown = nothing
    if (editing && suggestions.length) {
      const prefix = formulaContext(editing.value, this.caret).name?.text.length ?? 0
      content = html`<div class="help" @pointerdown=${(event: Event) => event.preventDefault()}>
        <div class="help-header" id="formula-functions-label">${this.msg.t('functions')}</div>
        <div id="formula-functions" class="help-list" role="listbox" aria-labelledby="formula-functions-label">
          ${suggestions.map(
            ({ name, builtin }, index) =>
              html`<div
                id=${`function-${index}`}
                class="help-option"
                role="option"
                aria-selected=${index === active ? 'true' : 'false'}
                @pointerenter=${() => (this.suggestionIndex = index)}
                @click=${() => this.insertFunction(name)}
              >
                <span class="signature"
                  ><b class="typed">${name.slice(0, prefix)}</b>${name.slice(prefix)}<span class="args"
                    >(${builtin ? this.functionArgs(name) : '…'})</span
                  ></span
                >
                ${builtin ? html`<span class="description">${this.msg.t(`help${name as BuiltinFunctionName}`)}</span>` : nothing}
              </div>`,
          )}
        </div>
        <div class="help-footer">${this.msg.t('suggestionKeys')}</div>
      </div>`
    } else if (editing?.value.startsWith('=')) {
      const context = formulaContext(editing.value, this.caret)
      const call = context.call && (FUNCTION_ORDER as readonly string[]).includes(context.call.name) ? context.call : undefined
      const result = this.previewText(editing.value, editing.column)
      if (call || result !== undefined)
        content = html`<div class="help hint" @pointerdown=${(event: Event) => event.preventDefault()}>
          ${call ? this.renderSignature(call.name as BuiltinFunctionName, call.argument) : nothing}
          ${call && context.referable ? html`<div class="point-hint">${this.msg.t('pointHint')}</div>` : nothing}
          ${result !== undefined ? html`<div class="result">${this.msg.t('result')} <b>${result}</b></div>` : nothing}
        </div>`
    }
    const anchor = editing ? (editing.inCell ? this.cellElement(editing) : this.renderRoot.querySelector<HTMLElement>('.formula-input')) : null
    return html`<c2-overlay popover="manual" placement="bottom-start" free-width .anchor=${anchor ?? undefined} .open=${content !== nothing && Boolean(anchor)}>
      ${content}
    </c2-overlay>`
  }

  private functionArgs(name: string): string {
    return this.msg.t(`args${name as BuiltinFunctionName}`)
  }

  /** `SUM(value1, [value2, …])` with the argument the caret is on in bold; past the last, a repeating one stays bold. */
  private renderSignature(name: BuiltinFunctionName, argument: number) {
    const args = this.functionArgs(name)
      .split(/,\s*(?![^[]*\])/)
      .filter(Boolean)
    const current = Math.min(argument, args.length - 1)
    return html`<div class="signature">
        ${name}(${args.map((arg, index) => html`${index ? ', ' : ''}${index === current ? html`<b class="current">${arg}</b>` : arg}`)})
      </div>
      <div class="description">${this.msg.t(`help${name}`)}</div>`
  }

  /** The formula's result so far, its parentheses closed; nothing while it is incomplete or an error. */
  private previewText(input: string, column: number): string | undefined {
    const value = this.model.preview(closeFormula(input))
    if (value === null || value === '' || isCellError(value)) return undefined
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    if (typeof value === 'string') return value
    const format = this.columnDefs[column]?.format
    return this.formatter(format && format !== 'text' && format !== 'general' ? format : 'number').format(value)
  }

  private activeInput(): HTMLInputElement | null {
    if (!this.editing) return null
    return this.renderRoot.querySelector<HTMLInputElement>(this.editing.inCell ? '.editor' : '.formula-input')
  }

  /** Puts `NAME(` in place of the name typed at the caret. */
  private insertFunction(name: string): void {
    const editing = this.editing
    if (!editing) return
    const start = formulaContext(editing.value, this.caret).name?.start ?? this.caret
    const after = editing.value.slice(this.caret)
    const call = after.startsWith('(')
      ? name
      : this.functionArgs(name) === '' && FUNCTION_ORDER.includes(name as BuiltinFunctionName)
        ? `${name}()`
        : `${name}(`
    this.editing = { ...editing, value: editing.value.slice(0, start) + call + after }
    this.caret = start + call.length + (after.startsWith('(') ? 1 : 0)
    this.pendingCaret = this.caret
    this.showAllFunctions = false
    this.suggestionIndex = 0
    this.pointing = null
  }

  private resetHelp(): void {
    this.showAllFunctions = false
    this.helpClosed = false
    this.suggestionIndex = 0
    this.pointing = null
    this.pointingDrag = false
  }

  /** fx: every function, for the current cell. A cell without a formula starts one. */
  private onFxClick = (): void => {
    if (this.readonly) return
    if (!this.editing) {
      const key = cellRef(this.cursor.row, this.cursor.column)
      const original = this.model.getInput(key)
      this.extent = this.cursor
      this.editing = {
        row: this.cursor.row,
        column: this.cursor.column,
        value: original.startsWith('=') ? original : '=',
        original,
        inCell: false,
        typed: false,
      }
      this.caret = this.editing.value.length
    } else if (!this.editing.value.startsWith('=')) {
      this.editing = { ...this.editing, value: '=' }
      this.caret = 1
    }
    this.resetHelp()
    this.showAllFunctions = true
    this.pendingCaret = this.caret
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
    this.caret = this.editing.value.length
    this.resetHelp()
    this.focusEditor = true
  }

  private commitEdit(rowStep = 0, columnStep = 0, refocus = true): void {
    const editing = this.editing
    if (!editing) return
    this.editing = null
    this.resetHelp()
    // A formula left open (`=SUM(C1:C4`) is closed, as Sheets does.
    const value = editing.value.startsWith('=') ? closeFormula(editing.value) : editing.value
    if (value !== editing.original) this.applyChanges([{ key: cellRef(editing.row, editing.column), input: value }], { record: true, notify: true })
    if (rowStep || columnStep) {
      const next = { row: editing.row + rowStep, column: editing.column + columnStep }
      this.userSelect(next)
    }
    if (refocus) this.focusGrid()
  }

  private cancelEdit(): void {
    if (!this.editing) return
    this.editing = null
    this.resetHelp()
    this.focusGrid()
  }

  private onFormulaBarFocus = (): void => {
    if (this.readonly || this.editing) return
    const key = cellRef(this.cursor.row, this.cursor.column)
    const original = this.model.getInput(key)
    this.editing = { row: this.cursor.row, column: this.cursor.column, value: original, original, inCell: false, typed: false }
    this.resetHelp()
  }

  private onEditorInput = (event: Event): void => {
    // The inner input's own `input` event is not this element's: it fires `input` once a change is committed.
    event.stopPropagation()
    if (!this.editing) return
    const input = event.target as HTMLInputElement
    this.editing = { ...this.editing, value: input.value }
    this.caret = input.selectionStart ?? input.value.length
    this.resetHelp()
  }

  /** The caret moved without typing (arrows, a click in the text). */
  private onEditorCaret = (event: Event): void => {
    const input = event.target as HTMLInputElement
    const caret = input.selectionStart ?? input.value.length
    if (caret === this.caret) return
    this.caret = caret
    this.pointing = null
  }

  private onEditorKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation()
    const editing = this.editing
    if (!editing || event.isComposing) return
    const suggestions = this.suggestions()
    if (suggestions.length && ['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(event.key) && !event.altKey) {
      event.preventDefault()
      const index = Math.min(this.suggestionIndex, suggestions.length - 1)
      if (event.key === 'ArrowDown') this.suggestionIndex = (index + 1) % suggestions.length
      else if (event.key === 'ArrowUp') this.suggestionIndex = (index - 1 + suggestions.length) % suggestions.length
      else if (event.key === 'Escape') this.helpClosed = true
      else this.insertFunction(suggestions[index].name)
      return
    }
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

  /** Inserts or deletes rows or columns, moving every cell after them and rewriting the formulas that read them. */
  private restructure(axis: 'row' | 'column', index: number, count: number, remove: boolean): void {
    count = Math.floor(count)
    if (!Number.isFinite(index) || !(count >= 1)) return
    const size = axis === 'row' ? this.model.rows : this.columnDefs.length
    const at = Math.max(0, Math.min(size, Math.floor(index)))
    if (remove) {
      if (at >= size) return
      count = Math.min(count, size - at, size - 1)
      if (count < 1) return
    }
    if (this.editing) this.commitEdit(0, 0, false)

    const end = at + count
    /** Where an index lands, or `undefined` for a deleted one. */
    const place = (i: number): number | undefined => (remove ? (i < at ? i : i >= end ? i - count : undefined) : i >= at ? i + count : i)
    const entries: [string, string][] = []
    for (const key of this.model.keys()) {
      const position = parseCellRef(key)
      if (!position) continue
      const row = axis === 'row' ? place(position.row) : position.row
      const column = axis === 'column' ? place(position.column) : position.column
      if (row === undefined || column === undefined) continue
      const input = this.model.getInput(key)
      const rewrite = remove ? deleteFromFormula : insertIntoFormula
      entries.push([cellRef(row, column), this.model.isFormula(key) ? rewrite(input, axis, at, count) : input])
    }

    const columns = [...this.columnDefs]
    if (axis === 'column') {
      if (remove) columns.splice(at, count)
      else columns.splice(at, 0, ...Array.from({ length: count }, () => ({})))
    }
    const styles = new Map<string, SpreadsheetCellStyle>()
    for (const [key, style] of this.cellStyles) {
      const position = parseCellRef(key)
      if (!position) continue
      const row = axis === 'row' ? place(position.row) : position.row
      const column = axis === 'column' ? place(position.column) : position.column
      if (row !== undefined && column !== undefined) styles.set(cellRef(row, column), style)
    }
    this.resizeSheet(this.model.rows + (axis === 'row' ? (remove ? -count : count) : 0), columns)
    this.model.load(entries)
    this.cellStyles.clear()
    for (const [key, style] of styles) this.cellStyles.set(key, style)
    this.writeStyles()
    // History steps name cells by address, which the change just moved.
    this.undoStack = []
    this.redoStack = []
    this.ownData = this.serialise()
    this.data = this.ownData
    // The selection follows its cells; on a deleted row or column it moves to the one that took its place.
    const move = (position: CellPosition): CellPosition =>
      this.clamp(axis === 'row' ? { ...position, row: place(position.row) ?? at } : { ...position, column: place(position.column) ?? at })
    this.cursor = move(this.cursor)
    this.extent = move(this.extent)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Changes and history

  /** Writes inputs and recalculates. Returns whether anything changed. */
  private applyChanges(changes: Change[], { record, notify }: { record: boolean; notify: boolean }): boolean {
    const step: InputEntry[] = []
    const seen = new Set<string>()
    for (const { key, input } of changes) {
      if (seen.has(key)) continue
      seen.add(key)
      const before = this.model.getInput(key)
      if (before === input) continue
      this.model.setInput(key, input)
      step.push({ key, before, after: input })
    }
    if (!step.length) return false
    if (record) {
      this.undoStack.push(step)
      this.redoStack = []
    }
    this.ownData = this.serialise()
    this.data = this.ownData

    const errors = step.map(({ key }) => [key, this.model.getValue(key)] as const).filter(([, value]) => isCellError(value))
    this.announcement = errors.length === 1 ? `${errors[0][0]}: ${(errors[0][1] as CellError).message}` : ''

    if (!notify) return true
    const detail: SpreadsheetCellChangeEventDetail = {
      changes: step.map(({ key, before, after }) => ({ ref: key, input: after, value: this.model.getValue(key), previous: before })),
    }
    this.dispatchEvent(new CustomEvent<SpreadsheetCellChangeEventDetail>('cell-change', { detail, bubbles: true, composed: true }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  /**
   * Writes styles. With `join`, the change goes into the last undo step (a paste's styles undo with its values).
   * Returns whether anything changed.
   */
  private applyStyles(updates: StyleUpdate[], { record, notify, join = false }: { record: boolean; notify: boolean; join?: boolean }): boolean {
    const step: StyleEntry[] = []
    const seen = new Set<string>()
    for (const { key, style } of updates) {
      if (seen.has(key)) continue
      seen.add(key)
      const before = this.cellStyles.get(key)
      const after = cleanStyle(style)
      if (sameStyle(before, after)) continue
      if (after) this.cellStyles.set(key, after)
      else this.cellStyles.delete(key)
      step.push({ key, style: true, before, after })
    }
    if (!step.length) return false
    if (record) {
      const last = join ? this.undoStack[this.undoStack.length - 1] : undefined
      if (last) last.push(...step)
      else this.undoStack.push(step)
      this.redoStack = []
    }
    this.writeStyles()
    if (notify) {
      const detail: SpreadsheetStyleChangeEventDetail = { changes: step.map(({ key, before, after }) => ({ ref: key, style: after, previous: before })) }
      this.dispatchEvent(new CustomEvent<SpreadsheetStyleChangeEventDetail>('style-change', { detail, bubbles: true, composed: true }))
    }
    return true
  }

  private writeStyles(): void {
    this.ownStyles = Object.fromEntries([...this.cellStyles].map(([key, style]) => [key, { ...style }]))
    this.styles = this.ownStyles
  }

  /** Undoes or redoes a step: its inputs, then its styles. */
  private replay(step: HistoryStep, side: 'before' | 'after'): void {
    const inputs: Change[] = []
    const styles: StyleUpdate[] = []
    for (const entry of step) {
      if (isStyleEntry(entry)) styles.push({ key: entry.key, style: entry[side] })
      else inputs.push({ key: entry.key, input: entry[side] })
    }
    if (inputs.length) this.applyChanges(inputs, { record: false, notify: true })
    if (styles.length) this.applyStyles(styles, { record: false, notify: true })
  }

  /** Applies a style change to every cell of a range. */
  private restyle(box: { start: CellPosition; end: CellPosition }, change: SpreadsheetStyleChange, notify: boolean): void {
    const start = this.clamp(box.start)
    const end = this.clamp(box.end)
    const updates: StyleUpdate[] = []
    for (let row = start.row; row <= end.row; row++)
      for (let column = start.column; column <= end.column; column++) {
        const key = cellRef(row, column)
        updates.push({ key, style: mergeStyle(this.cellStyles.get(key), change) })
      }
    this.applyStyles(updates, { record: true, notify })
  }

  /** Ctrl/⌘+B: bold on, unless every selected cell is bold already. */
  private toggleBold(): void {
    const box = this.selectedBox()
    let all = true
    for (let row = box.start.row; row <= box.end.row && all; row++)
      for (let column = box.start.column; column <= box.end.column && all; column++) all = Boolean(this.cellStyles.get(cellRef(row, column))?.bold)
    this.restyle(box, { bold: !all }, true)
  }

  /** Empties the selected cells, keeping their styles (as Delete does in Sheets). Returns whether anything changed. */
  private clearSelection(): boolean {
    const box = this.selectedBox()
    const changes: Change[] = []
    for (let row = box.start.row; row <= box.end.row; row++)
      for (let column = box.start.column; column <= box.end.column; column++) changes.push({ key: cellRef(row, column), input: '' })
    return this.applyChanges(changes, { record: true, notify: true })
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
    // On a Mac, Control+click is a right-click: it opens the context menu on the selection rather than moving it.
    if (event.button !== 0 || (event.ctrlKey && isApplePlatform()) || (event.target as Element).matches('input')) return
    const position = this.positionOf(event.target)
    if (!position) return
    // Typing a formula where a reference can go: the click puts the cell in it, and a drag makes it a range.
    if (position !== 'corner' && 'row' in position && 'column' in position && this.canPoint()) {
      event.preventDefault()
      this.pointAt(position, position)
      this.pointingDrag = true
      window.addEventListener('pointerup', this.stopDragging, { once: true })
      return
    }
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
    if (this.pointingDrag && this.pointing && event.buttons & 1) {
      const position = this.positionOf(event.target)
      if (position && position !== 'corner' && 'row' in position && 'column' in position) this.pointAt(this.pointing.anchor, position)
      return
    }
    if (!this.dragging || !(event.buttons & 1)) return
    const position = this.positionOf(event.target)
    if (position && position !== 'corner' && 'row' in position && 'column' in position) this.userSelect(this.cursor, position)
  }

  /**
   * An enclosing `c2-context-menu` asks what was right-clicked. Outside the selection, the click selects what it
   * landed on first, as in Sheets and Excel; the keyboard's context-menu key keeps the selection.
   */
  private onContextMenuRequest = (event: Event): void => {
    let node = event.composedPath()[0] as Node | undefined
    if (node && !(node instanceof Element)) node = node.parentElement ?? undefined
    const position = this.positionOf(node ?? null)
    if (this.editing) this.commitEdit(0, 0, false)
    const box = this.selectedBox()
    const lastRow = this.model.rows - 1
    const lastColumn = this.columnDefs.length - 1
    const within = (row: number, column: number) => row >= box.start.row && row <= box.end.row && column >= box.start.column && column <= box.end.column
    let area: SpreadsheetContextMenuData['area'] = 'cell'
    if (position === 'corner') {
      area = 'corner'
      this.userSelect({ row: 0, column: 0 }, { row: lastRow, column: lastColumn })
    } else if (position && !('column' in position)) {
      area = 'row'
      if (!(within(position.row, 0) && box.start.column === 0 && box.end.column === lastColumn))
        this.userSelect({ row: position.row, column: 0 }, { row: position.row, column: lastColumn })
    } else if (position && !('row' in position)) {
      area = 'column'
      if (!(within(0, position.column) && box.start.row === 0 && box.end.row === lastRow))
        this.userSelect({ row: 0, column: position.column }, { row: lastRow, column: position.column })
    } else if (position && !within(position.row, position.column)) this.userSelect(position)
    this.focusGrid()
    const selected = this.selectedBox()
    provideContextMenuData(event, this, {
      area,
      range: rangeRef(selected),
      active: cellRef(this.cursor.row, this.cursor.column),
      start: selected.start,
      end: selected.end,
    } satisfies SpreadsheetContextMenuData)
  }

  private stopDragging = (): void => {
    this.dragging = false
    this.pointingDrag = false
  }

  private canPoint(): boolean {
    const editing = this.editing
    if (!editing?.value.startsWith('=')) return false
    if (this.pointing) return this.pointing.end === this.caret
    return formulaContext(editing.value, this.caret).referable
  }

  /** Writes the cell or range from `anchor` to `extent` at the caret, in place of the one pointed at before. */
  private pointAt(anchor: CellPosition, extent: CellPosition): void {
    const editing = this.editing
    if (!editing) return
    const ref = rangeRef({
      start: { row: Math.min(anchor.row, extent.row), column: Math.min(anchor.column, extent.column) },
      end: { row: Math.max(anchor.row, extent.row), column: Math.max(anchor.column, extent.column) },
    })
    const start = this.pointing?.start ?? this.caret
    const end = this.pointing?.end ?? this.caret
    this.editing = { ...editing, value: editing.value.slice(0, start) + ref + editing.value.slice(end) }
    this.pointing = { start, end: start + ref.length, anchor }
    this.caret = start + ref.length
    this.pendingCaret = this.caret
    this.helpClosed = true
  }

  private onDoubleClick = (event: MouseEvent): void => {
    if ((event.target as Element).matches('input')) return
    const position = this.positionOf(event.target)
    if (position && position !== 'corner' && 'row' in position && 'column' in position && !this.editing) this.startEdit(false)
    else if (position && position !== 'corner' && !('row' in position) && this.renameColumns) this.renameColumn(position.column)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Column names

  private onRenameInput = (event: Event): void => {
    // The field's own `input` is not the sheet's.
    event.stopPropagation()
    if (this.renaming) this.renaming = { ...this.renaming, value: (event.target as HTMLInputElement).value }
  }

  private onRenameKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation()
    const renaming = this.renaming
    if (!renaming || event.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      this.commitRename()
      this.focusGrid()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.renaming = null
      this.focusGrid()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      this.commitRename()
      const next = renaming.index + (event.shiftKey ? -1 : 1)
      if (next >= 0 && next < this.columnDefs.length) this.renameColumn(next)
      else this.focusGrid()
    }
  }

  private onRenameBlur = (event: FocusEvent): void => {
    // Tab already saved this name and opened the next one.
    if (Number((event.target as HTMLElement).dataset.index) === this.renaming?.index) this.commitRename()
  }

  /** Writes the name being edited to `columns` and reports it, when it changed. */
  private commitRename(): void {
    const renaming = this.renaming
    if (!renaming) return
    this.renaming = null
    const previous = this.columnDefs[renaming.index]?.label ?? ''
    const label = renaming.value.trim()
    if (label === previous) return
    this.columns = this.columnDefs.map((column, other) => {
      if (other !== renaming.index) return column
      const renamed: SpreadsheetColumn = { ...column, label }
      if (!label) delete renamed.label
      return renamed
    })
    this.dispatchEvent(
      new CustomEvent<SpreadsheetColumnRenameEventDetail>('column-rename', {
        detail: { column: columnName(renaming.index), index: renaming.index, label, previous },
        bubbles: true,
        composed: true,
      }),
    )
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
      } else if (letter === 'b' && !this.readonly) {
        event.preventDefault()
        this.toggleBold()
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
    const styles: (SpreadsheetCellStyle | undefined)[][] = []
    for (let row = box.start.row; row <= box.end.row; row++) {
      const valueRow: string[] = []
      const inputRow: string[] = []
      const styleRow: (SpreadsheetCellStyle | undefined)[] = []
      for (let column = box.start.column; column <= box.end.column; column++) {
        const key = cellRef(row, column)
        valueRow.push(valueText(this.model.getValue(key)))
        inputRow.push(this.model.getInput(key))
        styleRow.push(this.cellStyles.get(key))
      }
      values.push(valueRow)
      inputs.push(inputRow)
      styles.push(styleRow)
    }
    const text = values.map((row) => row.map(tsvField).join('\t')).join('\n')
    event.clipboardData.setData('text/plain', text)
    this.copied = { text, origin: box.start, inputs, styles }
  }

  private onCut = (event: ClipboardEvent): void => {
    if (this.editing) return
    this.onCopy(event)
    if (this.readonly) return
    // A cut takes the styles along: the cells it leaves are plain.
    const box = this.selectedBox()
    const cleared = this.clearSelection()
    const updates: StyleUpdate[] = []
    for (let row = box.start.row; row <= box.end.row; row++)
      for (let column = box.start.column; column <= box.end.column; column++) updates.push({ key: cellRef(row, column), style: undefined })
    this.applyStyles(updates, { record: true, notify: true, join: cleared })
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
    const pasted = this.applyChanges(changes, { record: true, notify: true })
    // A range copied from this grid brings its styles too, undone with its values.
    if (own) {
      const styles: StyleUpdate[] = []
      own.styles.forEach((cells, rowOffset) =>
        cells.forEach((style, columnOffset) => styles.push({ key: cellRef(target.row + rowOffset, target.column + columnOffset), style })),
      )
      this.applyStyles(styles, { record: true, notify: true, join: pasted })
    }
    this.userSelect(target, { row: target.row + height - 1, column: target.column + width - 1 })
  }
}

/** A style with only known, set parts, or `undefined` when none is left. */
function cleanStyle(style: SpreadsheetCellStyle | undefined): SpreadsheetCellStyle | undefined {
  if (!style || typeof style !== 'object') return undefined
  const clean: SpreadsheetCellStyle = {}
  if (SPREADSHEET_COLORS.includes(style.color as SpreadsheetColor)) clean.color = style.color
  if (SPREADSHEET_COLORS.includes(style.background as SpreadsheetColor)) clean.background = style.background
  if (style.size === 'small' || style.size === 'large') clean.size = style.size
  if (style.bold === true) clean.bold = true
  return Object.keys(clean).length ? clean : undefined
}

function mergeStyle(style: SpreadsheetCellStyle | undefined, change: SpreadsheetStyleChange): SpreadsheetCellStyle | undefined {
  const next: SpreadsheetCellStyle = { ...style }
  if (change.color !== undefined) next.color = change.color ?? undefined
  if (change.background !== undefined) next.background = change.background ?? undefined
  if (change.size !== undefined) next.size = change.size === 'small' || change.size === 'large' ? change.size : undefined
  if (change.bold !== undefined) next.bold = change.bold === true ? true : undefined
  return cleanStyle(next)
}

const sameStyle = (a: SpreadsheetCellStyle | undefined, b: SpreadsheetCellStyle | undefined) =>
  a?.color === b?.color && a?.background === b?.background && a?.size === b?.size && Boolean(a?.bold) === Boolean(b?.bold)

/** The classes that draw a style on a cell. */
function styleClasses(style: SpreadsheetCellStyle | undefined): Record<string, boolean> {
  if (!style) return {}
  return {
    [`color-${style.color}`]: Boolean(style.color),
    [`background-${style.background}`]: Boolean(style.background),
    [`size-${style.size}`]: Boolean(style.size),
    bold: Boolean(style.bold),
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
