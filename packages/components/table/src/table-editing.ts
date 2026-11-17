import { html, nothing } from 'lit'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { isComposingKey } from '@c2n/core/dom-helper.js'
import type { Table } from './table.js'
import type {
  TableCellChangeEventDetail,
  TableCellContext,
  TableCellError,
  TableCellOption,
  TableChanges,
  TableColumnConfig,
  TableRow,
  TableRowsChangeEventDetail,
  TableRowsChangeReason,
} from './table-types.js'

/**
 * The editing half of `c2-table` (`editable`), loaded the first time a cell is edited, a block is pasted or a row is
 * added, as `c2-image` loads `@c2n/modal` for its preview. The table keeps only the hooks: which keys and gestures
 * start an edit, and asking this module for a cell's state and editor while it renders.
 *
 * One editor exists at a time, drawn in the cell being edited; every other cell renders as it does without
 * `editable`, so windowing and scrolling cost the same. Rows are never mutated: an edit replaces the row with a copy
 * and `rows` with a new array, and the changes are tracked by row identity, so they need no `row-key`.
 */

/** What the table hands the module: its private geometry, behind functions so the module never reaches into it. */
export interface TableEditingHost {
  table: Table
  /** The rendered columns, the checkbox column included. */
  columns(): TableColumnConfig[]
  /** The data row on display line `line`. */
  rowAt(line: number): { row: TableRow; index: number; key: string } | undefined
  /** Whether the cell on `line` and `column` can be edited now. */
  canEdit(line: number, column: number): boolean
  /** Moves the keyboard focus to a cell and scrolls it into view. */
  focus(line: number, column: number): void
  /** Whether rows can be appended at the end: not while grouped or a tree. */
  flat(): boolean
  /** The field holding a row's child rows, or `''` without a tree. */
  childrenField(): string
  /** The table's message in its language. */
  message(key: 'editCell' | 'errorRequired' | 'errorNumber' | 'errorDate' | 'errorUrl' | 'errorOption', ...args: string[]): string
}

interface ActiveCell {
  row: TableRow
  column: string
  line: number
  columnIndex: number
  draft: unknown
}

/** How an edit started: a key that opens the editor on the current value, a character typed into it, or Delete. */
export type EditTrigger = 'edit' | 'clear' | { text: string }

/** A column's identity, as the table keys it: a framework may hand over new column objects on every render. */
function columnId(column: TableColumnConfig): string {
  return ('columnId' in column && typeof column.columnId === 'string' && column.columnId) || (column instanceof Element ? '' : column.id) || column.field
}

const EMPTY = (value: unknown) => value === null || value === undefined || value === ''

/** Values compare by content for dates, so re-entering the same date is not a change. */
function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return Object.is(a, b) || (EMPTY(a) && EMPTY(b))
}

/** A copy of `row` with `field` (a dotted path is fine) set to `value`; the objects on the path are copied too. */
export function setFieldValue(row: TableRow, field: string, value: unknown): TableRow {
  const [head, ...rest] = field.split('.')
  const next = { ...row }
  next[head] = rest.length ? setFieldValue((row[head] as TableRow) ?? {}, rest.join('.'), value) : value
  return next
}

function optionValue(option: TableCellOption): unknown {
  return typeof option === 'object' ? option.value : option
}

function optionLabel(option: TableCellOption): string {
  return typeof option === 'object' ? (option.label ?? String(option.value)) : String(option)
}

function isUrl(text: string): boolean {
  try {
    new URL(text)
    return true
  } catch {
    return false
  }
}

/** A date value as the `yyyy-mm-dd` an `<input type="date">` takes, in local time for a `Date`. */
function isoDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  return typeof value === 'string' ? value.slice(0, 10) : ''
}

/**
 * Splits text copied from a spreadsheet into rows of cells: tabs between cells, line breaks between rows, and a cell
 * that holds either inside double quotes, as Excel, Numbers and Google Sheets write it.
 */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === '\t') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export class TableEditing {
  /** The row each edited row replaced, by identity of the row as it is now. */
  #original = new Map<TableRow, TableRow>()
  #added = new Set<TableRow>()
  #removed: TableRow[] = []
  #errors = new Map<TableRow, Map<string, string>>()
  /** The rows as they were given or last accepted, which `revertChanges()` puts back as they were. */
  #baseline: TableRow[]
  /** The array the module last wrote to `rows`; any other means the application replaced the rows itself. */
  #written?: TableRow[]
  #active?: ActiveCell
  #warned = false

  constructor(private readonly host: TableEditingHost) {
    this.#baseline = host.table.rows
  }

  /** Rows the application replaced itself are a new baseline: the old tracking is about rows that are gone. */
  #sync() {
    const rows = this.#table.rows
    if (rows === this.#written || rows === this.#baseline) return
    this.#baseline = rows
    this.#written = undefined
    this.#original.clear()
    this.#added.clear()
    this.#removed = []
    this.#errors.clear()
  }

  get #table() {
    return this.host.table
  }

  /** The display lines of the page on show, end exclusive. */
  #lines(): [number, number] {
    const table = this.#table
    const first = table.paginated ? (table.page - 1) * table.pageSize : 0
    return [first, first + table.rowCount]
  }

  /** A double click on a body cell edits it; a paste writes its block from the focused cell. */
  gesture(path: EventTarget[], text: string | undefined, focused: { row: number; column: number }) {
    if (text) {
      this.paste(text, focused.row, focused.column)
      return
    }
    for (const node of path) {
      if (!(node instanceof HTMLElement) || !node.matches('.row--body > .cell')) continue
      const line = Number(node.parentElement?.getAttribute('aria-rowindex')) - 2
      void this.begin(line, Number(node.getAttribute('aria-colindex')) - 1, 'edit')
      return
    }
  }

  // ---- What the table asks while it renders -------------------------------------------------------------------------

  /** The dirty and error state of a cell, or nothing for a cell as it was given. */
  cellState(row: TableRow, column: TableColumnConfig): { dirty: boolean; error?: string } | undefined {
    const error = this.#errors.get(row)?.get(columnId(column))
    const original = this.#original.get(row)
    const dirty = original !== undefined && Boolean(column.field) && !same(getFieldValue(original, column.field), getFieldValue(row, column.field))
    return dirty || error ? { dirty, error } : undefined
  }

  /** Whether `row` was added since the rows were given. */
  isNew(row: TableRow): boolean {
    return this.#added.has(row)
  }

  /** The editor of the cell being edited, drawn in place of its content; nothing for any other cell. */
  editor(row: TableRow, column: TableColumnConfig, rowIndex: number): unknown {
    const active = this.#active
    if (!active || active.row !== row || active.column !== columnId(column)) return undefined
    const label = this.host.message('editCell', column.header ?? column.field)
    const keydown = (event: KeyboardEvent) => this.#handleEditorKey(event)
    // A click in the editor is not a click on the row: it must not change the selection or open the row.
    const stop = (event: Event) => event.stopPropagation()
    // Leaving the cell commits, as a spreadsheet does. A click on another cell lands here first, before it moves the focus.
    const focusout = (event: FocusEvent) => {
      const next = event.relatedTarget
      if (next instanceof Node && (event.currentTarget as Element).contains(next)) return
      if (this.#active === active) this.#commitActive(false)
    }
    if (column.renderEditor) {
      const content = column.renderEditor({
        value: getFieldValue(row, column.field),
        row,
        rowIndex,
        column,
        key: this.#table.keyOf(row) ?? '',
        draft: active.draft,
        setDraft: (value) => (active.draft = value),
        commit: (value) => {
          active.draft = value
          this.#commitActive()
        },
        cancel: () => this.#close(true),
      })
      return html`<div class="editor-host" part="editor" @keydown=${keydown} @focusout=${focusout} @click=${stop} @dblclick=${stop}>${content}</div>`
    }
    const draft = active.draft
    const input = (event: Event) => (active.draft = (event.target as HTMLInputElement | HTMLSelectElement).value)
    if (column.editor === 'select') {
      const options = column.options ?? []
      const selected = options.findIndex((option) => same(optionValue(option), draft))
      return html`<div class="editor-host" part="editor" @keydown=${keydown} @focusout=${focusout} @click=${stop} @dblclick=${stop}>
        <select
          class="editor"
          aria-label=${label}
          @change=${(event: Event) => {
            const option = options[Number((event.target as HTMLSelectElement).value)]
            active.draft = option === undefined ? null : optionValue(option)
          }}
        >
          ${selected < 0 ? html`<option value="-1" selected></option>` : nothing}
          ${options.map((option, index) => html`<option value=${index} ?selected=${index === selected}>${optionLabel(option)}</option>`)}
        </select>
      </div>`
    }
    // A number is typed into a text input: `type="number"` would drop a first `-` or `.` typed to open the editor.
    const type = column.editor === 'date' ? 'date' : column.editor === 'url' ? 'url' : 'text'
    const text = draft === null || draft === undefined ? '' : type === 'date' ? isoDate(draft) || String(draft) : String(draft)
    return html`<div class="editor-host" part="editor" @keydown=${keydown} @focusout=${focusout} @click=${stop} @dblclick=${stop}>
      <input class="editor" type=${type} aria-label=${label} inputmode=${column.editor === 'number' ? 'decimal' : nothing} .value=${text} @input=${input} />
    </div>`
  }

  // ---- Starting and ending an edit ----------------------------------------------------------------------------------

  /** Starts editing the cell on `line` and `column`, from a key, a double click or a checkbox's change. */
  async begin(line: number, columnIndex: number, trigger: EditTrigger) {
    if (this.#table.dataSource) {
      if (!this.#warned) console.warn('[c2-table] editable is ignored with a dataSource: edit the rows in rows, or save each change from cell-change.')
      this.#warned = true
      return
    }
    const active = this.#active
    if (active) {
      // Characters typed before the editor had the focus belong to the edit that is opening.
      if (active.line === line && active.columnIndex === columnIndex) {
        // Enter (or F2) reaching the grid before the editor had the focus commits what was typed, as it would there.
        if (trigger === 'edit') this.#commitActive()
        else {
          if (typeof trigger === 'object' && typeof active.draft === 'string') active.draft += trigger.text
          this.#table.requestUpdate()
        }
        return
      }
      this.#commitActive(false)
      // The committed row is only in the table's rows once it has updated.
      await this.#table.updateComplete
    }
    this.#sync()
    if (!this.host.canEdit(line, columnIndex)) return
    const target = this.host.rowAt(line)
    const column = this.host.columns()[columnIndex]
    if (!target || !column) return
    const value = getFieldValue(target.row, column.field)
    if (column.editor === 'checkbox' && !column.renderEditor) {
      // A checkbox has nothing to type into: every way of starting an edit toggles it, Delete clears it.
      this.#commit(target.row, column, trigger === 'clear' ? false : !value, 'edit')
      // A cancelled change leaves the row as it was: draw the checkbox again from it.
      this.#table.requestUpdate()
      return
    }
    if (trigger === 'clear') {
      this.#commit(target.row, column, null, 'edit')
      return
    }
    this.#active = { row: target.row, column: columnId(column), line, columnIndex, draft: typeof trigger === 'object' ? trigger.text : value }
    this.#table.requestUpdate()
    await this.#table.updateComplete
    const root = this.#table.shadowRoot
    const editor = root?.querySelector<HTMLElement>('.editor-host .editor') ?? this.#firstFocusable(root?.querySelector('.editor-host'))
    // A component made into an editor focuses its input once it has rendered it.
    await (editor as { updateComplete?: Promise<unknown> } | undefined)?.updateComplete
    editor?.focus()
    // Typing replaces the value; F2, Enter and a double click keep it and put the caret at its end, as a spreadsheet does.
    if (editor instanceof HTMLInputElement && editor.type !== 'date') {
      const end = editor.value.length
      editor.setSelectionRange(end, end)
    }
  }

  /**
   * The element of a custom editor to focus: its first focusable element, else its first element, whose `focus()` a
   * component forwards to the input in its shadow root.
   */
  #firstFocusable(container: Element | null | undefined): HTMLElement | undefined {
    if (!container) return undefined
    const focusable = [...container.querySelectorAll<HTMLElement>('*')].find((element) => element.tabIndex >= 0)
    return focusable ?? (container.firstElementChild as HTMLElement | null) ?? undefined
  }

  #handleEditorKey(event: KeyboardEvent) {
    // Every key in the editor is the editor's: arrows move in a picker, letters type ahead, none of it moves the grid.
    event.stopPropagation()
    const active = this.#active
    if (!active) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.#close(true)
      return
    }
    // Enter commits and moves down (Shift+Enter up), Tab commits and moves across, as in a spreadsheet.
    if ((event.key === 'Enter' && !isComposingKey(event)) || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const { line, columnIndex } = active
      this.#commitActive(false)
      const [first, end] = this.#lines()
      if (event.key === 'Enter') this.host.focus(Math.min(end - 1, Math.max(first, line + (event.shiftKey ? -1 : 1))), columnIndex)
      else this.host.focus(line, this.#nextEditableColumn(line, columnIndex, event.shiftKey ? -1 : 1))
    }
  }

  /** The next editable column of the line in `step` direction, or the same one at the edge. */
  #nextEditableColumn(line: number, from: number, step: number): number {
    const count = this.host.columns().length
    for (let column = from + step; column >= 0 && column < count; column += step) if (this.host.canEdit(line, column)) return column
    return from
  }

  /** Commits the draft of the cell being edited; with `refocus`, the focus goes back to that cell. */
  #commitActive(refocus = true) {
    const active = this.#active
    if (!active) return
    this.#active = undefined
    // The column as it is now: a framework may have handed the table new column objects while the editor was open.
    const column = this.host.columns().find((candidate) => columnId(candidate) === active.column)
    if (column) this.#commit(active.row, column, this.#fromDraft(column, active.draft, getFieldValue(active.row, column.field)), 'edit')
    if (refocus) this.host.focus(active.line, active.columnIndex)
    this.#table.requestUpdate()
  }

  #close(refocus: boolean) {
    const active = this.#active
    if (!active) return
    this.#active = undefined
    this.#table.requestUpdate()
    if (refocus) this.host.focus(active.line, active.columnIndex)
  }

  /** The value an input's text stands for, of the type the cell held: a number, a `Date` if it was one. */
  #fromDraft(column: TableColumnConfig, draft: unknown, previous: unknown): unknown {
    if (typeof draft !== 'string') return draft
    if (column.editor === 'number') {
      if (draft.trim() === '') return null
      const number = Number(draft)
      return Number.isNaN(number) ? draft : number
    }
    if (column.editor === 'date') {
      if (draft === '') return null
      if (previous instanceof Date && /^\d{4}-\d{2}-\d{2}$/.test(draft)) {
        const [year, month, day] = draft.split('-').map(Number)
        return new Date(year, month - 1, day)
      }
    }
    return draft
  }

  // ---- Changing rows ------------------------------------------------------------------------------------------------

  /** Changes one cell: fires the cancelable `cell-change`, applies `rowRule`, then replaces the row in `rows`. */
  #commit(row: TableRow, column: TableColumnConfig, value: unknown, reason: TableRowsChangeReason) {
    const next = this.#change(row, column, value)
    if (next) this.#replaceRows(new Map([[row, next]]), reason)
  }

  /** The row with the change applied, or nothing when the value is the same or `cell-change` was cancelled. */
  #change(row: TableRow, column: TableColumnConfig, value: unknown): TableRow | undefined {
    const field = column.field
    if (!field) return undefined
    const previousValue = getFieldValue(row, field)
    if (same(previousValue, value)) return undefined
    const table = this.#table
    const event = new CustomEvent<TableCellChangeEventDetail>('cell-change', {
      detail: { key: table.keyOf(row) ?? '', row, column, field, value, previousValue },
      cancelable: true,
    })
    if (!table.dispatchEvent(event)) return undefined
    const changed = setFieldValue(row, field, value)
    return table.rowRule?.({ row: changed, previousRow: row, column, field, value, previousValue }) ?? changed
  }

  /** Puts `next` in place of each row of `replaced`, carries their tracking over, and fires `rows-change`. */
  #replaceRows(replaced: Map<TableRow, TableRow>, reason: TableRowsChangeReason, appended: TableRow[] = []) {
    if (!replaced.size && !appended.length) return
    for (const [row, next] of replaced) {
      if (this.#added.delete(row)) this.#added.add(next)
      else {
        const original = this.#original.get(row) ?? row
        this.#original.delete(row)
        this.#original.set(next, original)
      }
      this.#errors.delete(row)
      this.#check(next)
    }
    for (const row of appended) {
      this.#added.add(row)
      this.#check(row)
    }
    this.#setRows([...this.#map(this.#table.rows, (row) => replaced.get(row)), ...appended], reason)
  }

  /** `rows` with each row `swap` answers for replaced, through the children of a tree too. */
  #map(rows: TableRow[], swap: (row: TableRow) => TableRow | undefined): TableRow[] {
    const field = this.host.childrenField()
    return rows.map((row) => {
      const next = swap(row)
      if (next) return next
      const children = field ? getFieldValue(row, field) : undefined
      if (!Array.isArray(children)) return row
      const mapped = this.#map(children as TableRow[], swap)
      return mapped.some((child, index) => child !== children[index]) ? setFieldValue(row, field, mapped) : row
    })
  }

  /** `rows` without the rows of `drop`, through the children of a tree too. */
  #filter(rows: TableRow[], drop: Set<TableRow>): TableRow[] {
    const field = this.host.childrenField()
    return rows
      .filter((row) => !drop.has(row))
      .map((row) => {
        const children = field ? getFieldValue(row, field) : undefined
        if (!Array.isArray(children)) return row
        const kept = this.#filter(children as TableRow[], drop)
        return kept.length === children.length ? row : setFieldValue(row, field, kept)
      })
  }

  #setRows(rows: TableRow[], reason: TableRowsChangeReason) {
    const table = this.#table
    table.rows = rows
    this.#written = table.rows
    table.dispatchEvent(new CustomEvent<TableRowsChangeEventDetail>('rows-change', { detail: { rows, reason } }))
  }

  addRow(row: TableRow, index?: number): TableRow {
    this.#sync()
    const rows = [...this.#table.rows]
    rows.splice(index === undefined ? rows.length : Math.max(0, Math.min(rows.length, index)), 0, row)
    // Not checked yet: a blank row is not an error until someone edits it or the app calls validate().
    this.#added.add(row)
    this.#setRows(rows, 'add')
    return row
  }

  duplicateRow(row: TableRow, overrides: TableRow = {}): TableRow | undefined {
    this.#sync()
    const rows = this.#table.rows
    const index = rows.indexOf(row)
    if (index < 0) return undefined
    let copy: TableRow
    try {
      copy = structuredClone(row)
    } catch {
      copy = { ...row }
    }
    // A copy cannot keep the key of the row it copies, or both would be one row to selection and the update animation:
    // the `row-key` field is dropped, and `overrides` (a new id, or whatever `getRowKey` reads) is written over the copy.
    const keyField = this.#table.rowKey
    if (keyField && !this.#table.getRowKey) delete copy[keyField]
    Object.assign(copy, overrides)
    if (this.#table.getRowKey && this.#table.keyOf(copy) === this.#table.keyOf(row))
      console.warn('[c2-table] duplicateRow: the copy has the key of the row it copies. Pass the fields that make its key in overrides.')
    const next = [...rows]
    next.splice(index + 1, 0, copy)
    this.#added.add(copy)
    this.#check(copy)
    this.#setRows(next, 'duplicate')
    return copy
  }

  deleteRows(rows: TableRow[]) {
    this.#sync()
    const drop = new Set(rows)
    for (const row of drop) {
      if (this.#added.delete(row)) continue
      this.#removed.push(this.#original.get(row) ?? row)
      this.#original.delete(row)
      this.#errors.delete(row)
    }
    if (this.#active && drop.has(this.#active.row)) this.#active = undefined
    this.#setRows(this.#filter(this.#table.rows, drop), 'delete')
  }

  /** Writes a block of text copied from a spreadsheet from the focused cell rightward and down, adding rows past the last. */
  paste(text: string, line: number, columnIndex: number) {
    const block = parseClipboard(text)
    if (!block.length || this.#table.dataSource) return
    this.#sync()
    const columns = this.host.columns()
    // Lines on the next pages of a paged table hold rows too: only past the very last line does a paste add rows.
    const end = !this.host.flat() ? Number.POSITIVE_INFINITY : this.#table.totalRows
    const replaced = new Map<TableRow, TableRow>()
    const appended: TableRow[] = []
    block.forEach((cells, offset) => {
      const target = line + offset
      let row: TableRow | undefined
      if (target < end) {
        const found = this.host.rowAt(target)
        if (!found) return
        row = replaced.get(found.row) ?? found.row
        cells.forEach((text, step) => {
          const column = columns[columnIndex + step]
          if (!column || !this.host.canEdit(target, columnIndex + step)) return
          const next = this.#change(row!, column, this.#parse(column, text, row!))
          if (next) row = next
        })
        if (row !== found.row) replaced.set(found.row, row)
      } else {
        // Past the last row the paste adds rows, filling the editable columns through cell-change and rowRule as an edit does.
        row = {}
        cells.forEach((text, step) => {
          const column = columns[columnIndex + step]
          if (!column?.field || !(column.editor || column.renderEditor)) return
          const next = this.#change(row!, column, this.#parse(column, text, row!))
          if (next) row = next
        })
        appended.push(row)
      }
    })
    this.#replaceRows(replaced, 'paste', appended)
  }

  /** The value pasted text stands for in `column`: the column's own `parseValue`, else by its editor. */
  #parse(column: TableColumnConfig, text: string, row: TableRow): unknown {
    const value = text.trim()
    if (column.parseValue) return column.parseValue(value, { row, column })
    if (value === '') return null
    switch (column.editor) {
      case 'number': {
        // Commas count as thousands separators only in groups of three: `1,5` is no number in this locale.
        const plain = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(value) ? value.replace(/,/g, '') : value
        const number = Number(plain)
        return Number.isNaN(number) ? value : number
      }
      case 'checkbox':
        return /^(true|yes|y|1|x|✓)$/i.test(value)
      case 'date': {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
        const time = Date.parse(value)
        return Number.isNaN(time) ? value : isoDate(new Date(time))
      }
      case 'select': {
        const option = (column.options ?? []).find(
          (option) => String(optionValue(option)) === value || optionLabel(option).toLowerCase() === value.toLowerCase(),
        )
        return option === undefined ? value : optionValue(option)
      }
      default:
        return value
    }
  }

  // ---- Tracking -----------------------------------------------------------------------------------------------------

  /** In the order of the rows; rows the application replaced itself since are no longer the table's changes. */
  changes(): TableChanges {
    this.#sync()
    const changes: TableChanges = { added: [], updated: [], removed: [...this.#removed] }
    const visit = (rows: TableRow[]) => {
      const field = this.host.childrenField()
      for (const row of rows) {
        if (this.#added.has(row)) changes.added.push(row)
        const original = this.#original.get(row)
        if (original) changes.updated.push({ row, original })
        const children = field ? getFieldValue(row, field) : undefined
        if (Array.isArray(children)) visit(children as TableRow[])
      }
    }
    visit(this.#table.rows)
    return changes
  }

  /** Takes the rows as they are as the new baseline: nothing is dirty, added or removed any more. */
  accept() {
    this.#baseline = this.#table.rows
    this.#written = undefined
    this.#original.clear()
    this.#added.clear()
    this.#removed = []
    this.#table.requestUpdate()
  }

  /** Puts back the rows as they were given: edits undone, added rows dropped, deleted rows restored at the end. */
  revert() {
    this.#sync()
    // The rows as they were given, in their order and their place in a tree: nothing to rebuild from the changes.
    const restored = this.#baseline
    this.#original.clear()
    this.#added = new Set()
    this.#removed = []
    this.#errors.clear()
    this.#active = undefined
    this.#setRows(restored, 'revert')
  }

  /** Checks every row, marks the invalid cells and returns them. */
  validate(): TableCellError[] {
    this.#sync()
    this.#errors.clear()
    const errors: TableCellError[] = []
    const visit = (rows: TableRow[]) => {
      const field = this.host.childrenField()
      for (const row of rows) {
        const columns = this.host.columns()
        for (const [id, message] of this.#check(row)) {
          const column = columns.find((candidate) => columnId(candidate) === id)
          if (column) errors.push({ key: this.#table.keyOf(row) ?? '', row, column, message })
        }
        const children = field ? getFieldValue(row, field) : undefined
        if (Array.isArray(children)) visit(children as TableRow[])
      }
    }
    visit(this.#table.rows)
    this.#table.requestUpdate()
    return errors
  }

  /** Validates every editable column of `row` and records the result; a row rule may make one cell depend on another. */
  #check(row: TableRow): Map<string, string> {
    const found = new Map<string, string>()
    for (const column of this.host.columns()) {
      if (!column.editor && !column.renderEditor && !column.validate) continue
      const message = this.#messageFor(column, row)
      if (message) found.set(columnId(column), message)
    }
    if (found.size) this.#errors.set(row, found)
    else this.#errors.delete(row)
    return found
  }

  #messageFor(column: TableColumnConfig, row: TableRow): string | undefined {
    const value = getFieldValue(row, column.field)
    if (EMPTY(value) && column.required) return this.host.message('errorRequired')
    // The type checks are for a value that is there; `validate` sees empty cells too (a day with no hours).
    if (!EMPTY(value) && !column.renderEditor) {
      if (column.editor === 'number' && typeof value !== 'number') return this.host.message('errorNumber')
      if (column.editor === 'date' && !(value instanceof Date) && Number.isNaN(Date.parse(String(value)))) return this.host.message('errorDate')
      if (column.editor === 'url' && !isUrl(String(value))) return this.host.message('errorUrl')
      if (column.editor === 'select' && column.options && !column.options.some((option) => same(optionValue(option), value)))
        return this.host.message('errorOption')
    }
    const context: TableCellContext = { value, row, rowIndex: -1, column }
    return column.validate?.(context) ?? undefined
  }
}
