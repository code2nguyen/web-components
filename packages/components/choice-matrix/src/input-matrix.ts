import { html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { live } from 'lit/directives/live.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { isComposingKey } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { MatrixBase, type ChoiceMatrixColumn, type ChoiceMatrixRow } from './matrix-base'
import { inputMatrixMessages } from './input-matrix-messages'

export { inputMatrixMessages } from './input-matrix-messages'
import styles from './input-matrix.scss?inline'

/** What a column's cells take: a number, a duration (minutes, typed `1:30`, `1h 30m` or `90`), a date, a time, text or a choice from `options`. */
export type InputMatrixCellType = 'number' | 'duration' | 'date' | 'time' | 'text' | 'select'

/** One column of a `c2-input-matrix`: a `c2-choice-matrix` column with the type of its cells. */
export interface InputMatrixColumn extends ChoiceMatrixColumn {
  /** The type of the column's cells; the matrix's `cell-type` when left out. */
  type?: InputMatrixCellType
  /** The choices of a `select` column. */
  options?: Array<string | { value: string; label: string }>
  /** The smallest number a `number` column takes. */
  min?: number
  /** The largest number a `number` column takes. */
  max?: number
  /** A hint shown in an empty cell. */
  placeholder?: string
}

/** A cell's value: a number for `number` and `duration` (minutes) cells, a string for the others. */
export type InputMatrixCellValue = number | string

/** The values, by row value then column value. A cell with no value has no key. */
export type InputMatrixValue = Record<string, Record<string, InputMatrixCellValue>>

/** Events fired by {@link InputMatrix}, keyed for `addEventListener`. */
export interface InputMatrixEventMap {
  input: Event
  change: CustomEvent<{ value: InputMatrixValue }>
}

export interface InputMatrix {
  addEventListener: TypedAddEventListener<InputMatrix, InputMatrixEventMap>
  removeEventListener: TypedRemoveEventListener<InputMatrix, InputMatrixEventMap>
}

const summable = (type: InputMatrixCellType) => type === 'number' || type === 'duration'

/**
 * Rows × columns of typed inputs in one form control, with totals: sizes by colour quantities, hours per person and
 * day, SLA targets per priority and channel, a survey's grid of numbers.
 *
 * Each column's `type` says what its cells take: `number`, `duration` (stored in minutes, typed `1:30`, `1h 30m` or
 * `90`), `date`, `time`, `text`, or `select` with its `options`; `cell-type` is the type of the columns that name none.
 * Numbers are read and written in the page's language. `totals` adds a column with each row's total, a row with each
 * column's total, or both with the grand total where they meet; only `number` and `duration` columns are summed.
 *
 * The keys travel like a sheet: Enter moves down (Shift+Enter up), the up and down arrows move between rows in a text
 * cell, and left and right move between columns once the caret is at the edge. Pasting cells copied from a sheet
 * (tab-separated) fills the cells from the one pasted into, one change for all of them.
 *
 * `value` maps each row's `value` to its cells by column value (`{"s":{"red":4}}`); an empty cell has no key. Under a
 * `name`, a form receives one `name[row][column]=value` entry per value. A number outside its column's `min` or `max`,
 * or text that is not a value of its column, makes the matrix invalid; `required` asks for at least one value. Rows and
 * columns are those of `c2-choice-matrix`: groups, descriptions and disabled rows or columns work the same way.
 *
 * @tag c2-input-matrix
 *
 * @event {Event} input - Fired as the user edits a cell. Read `value`.
 * @event {CustomEvent<{ value: InputMatrixValue }>} change - Fired when the user commits a cell (leaves it, presses Enter) or pastes. `detail.value` is the new `value`.
 *
 * @csspart table - The table.
 * @csspart column-header - A column's title cell, the totals column's included.
 * @csspart row-header - A row's title cell, holding its label and description.
 * @csspart description - A row's description.
 * @csspart group-header - The header row of a group.
 * @csspart cell - The cell holding one input.
 * @csspart input - The input (or select) of a cell.
 * @csspart total - A total: of a row, of a column, or the grand total.
 * @csspart totals-row - The row of column totals.
 *
 * @cssproperty {padding} [--c2-input-matrix__cell--padding=4px 6px]
 * @cssproperty {padding} [--c2-input-matrix__header--padding=8px 6px] - The title cells: column titles, row titles and totals.
 * @cssproperty {border} [--c2-input-matrix__row--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-input-matrix__row__hover--background-color=#fafafa]
 * @cssproperty {color} [--c2-input-matrix--background-color=#ffffff] - Behind the table, and behind the first column while it is held during a sideways scroll.
 * @cssproperty {color} [--c2-input-matrix__column-header--color=#71717a]
 * @cssproperty {font-size} [--c2-input-matrix__column-header--font-size=12px]
 * @cssproperty {font-weight} [--c2-input-matrix__column-header--font-weight=500]
 * @cssproperty {color} [--c2-input-matrix__row-header--color=#18181b]
 * @cssproperty {font-size} [--c2-input-matrix__row-header--font-size=14px]
 * @cssproperty {font-weight} [--c2-input-matrix__row-header--font-weight=400]
 * @cssproperty {color} [--c2-input-matrix__description--color=#71717a]
 * @cssproperty {font-size} [--c2-input-matrix__description--font-size=12px]
 * @cssproperty {color} [--c2-input-matrix__group-header--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-input-matrix__group-header--color=#18181b]
 * @cssproperty {font-weight} [--c2-input-matrix__group-header--font-weight=600]
 * @cssproperty {pixel} [--c2-input-matrix__input--min-width=72px]
 * @cssproperty {pixel} [--c2-input-matrix__input--height=32px]
 * @cssproperty {padding} [--c2-input-matrix__input--padding=0 8px]
 * @cssproperty {border} [--c2-input-matrix__input--border=1px solid #d4d4d8]
 * @cssproperty {border-radius} [--c2-input-matrix__input--border-radius=6px]
 * @cssproperty {color} [--c2-input-matrix__input--background-color=#ffffff]
 * @cssproperty {color} [--c2-input-matrix__input--color=#18181b]
 * @cssproperty {font-size} [--c2-input-matrix__input--font-size=14px]
 * @cssproperty {color} [--c2-input-matrix__input__hover--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-input-matrix__input__focus--border-color=#476ef9]
 * @cssproperty {outline} [--c2-input-matrix__input__focus--outline=2px solid rgba(71, 110, 249, 0.4)]
 * @cssproperty {color} [--c2-input-matrix__input__error--border-color=#dc2626]
 * @cssproperty {opacity} [--c2-input-matrix__input__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-input-matrix__total--color=#18181b]
 * @cssproperty {font-weight} [--c2-input-matrix__total--font-weight=600]
 * @cssproperty {color} [--c2-input-matrix__total--background-color=#f4f4f5]
 */
@customElement('c2-input-matrix')
export class InputMatrix extends MatrixBase<InputMatrixValue> {
  static override styles = unsafeCSS(styles)

  /** The columns. As an attribute, a JSON array of `{ value, label, type, options, min, max, placeholder, disabled }`. */
  @property({ converter: jsonPropertyConverter }) override columns: InputMatrixColumn[] = []

  /** The values, by row then column. As an attribute, JSON: `{"s":{"red":4,"blue":2}}`. */
  @property({ converter: jsonPropertyConverter }) value: InputMatrixValue = {}

  /** The type of the cells of a column that names none. */
  @property({ attribute: 'cell-type' }) cellType: InputMatrixCellType = 'number'

  /** A column with each row's total, a row with each column's total, or both (with the grand total). `number` and `duration` columns only. */
  @property() totals: 'none' | 'rows' | 'columns' | 'both' = 'none'

  /** Asks for at least one value. */
  @property({ type: Boolean, reflect: true }) required = false

  private readonly msg = new LocalizeController(this, inputMatrixMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })

  /** The text of a cell while it is edited, by cell key: shown as typed until the cell is left. */
  #drafts = new Map<string, string>()
  /** Cells whose text is not a value of their column. */
  #bad = new Set<string>()
  /** The rows in the order they are drawn (groups together), which the keys travel in. */
  #order: ChoiceMatrixRow[] = []
  /** `value` is being written by the user's edit, which keeps the typed text; any other write replaces it. */
  #editing = false

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    // A new value from the app, a form reset or a restore is shown as it is: text typed before it is gone.
    if (changed.has('value') && !this.#editing) {
      this.#drafts.clear()
      this.#bad.clear()
    }
    this.#editing = false
  }

  protected copy(value: InputMatrixValue): InputMatrixValue {
    return Object.fromEntries(Object.entries(value ?? {}).map(([row, cells]) => [row, { ...cells }]))
  }

  #key(row: ChoiceMatrixRow, column: ChoiceMatrixColumn) {
    return JSON.stringify([row.value, column.value])
  }

  #typeOf(column: InputMatrixColumn): InputMatrixCellType {
    return column.type ?? this.cellType
  }

  #cellDisabled(row: ChoiceMatrixRow, column: ChoiceMatrixColumn): boolean {
    return this.effectiveDisabled || !!row.disabled || !!column.disabled
  }

  #stored(row: ChoiceMatrixRow, column: ChoiceMatrixColumn): InputMatrixCellValue | undefined {
    const cells = this.value?.[row.value]
    return cells && Object.prototype.hasOwnProperty.call(cells, column.value) ? cells[column.value] : undefined
  }

  /** The page language's group and decimal marks, which typed numbers are read with. */
  #marks(): { group: string; decimal: string } {
    const parts = new Intl.NumberFormat(this.msg.locale).formatToParts(12345.6)
    return { group: parts.find((part) => part.type === 'group')?.value ?? ',', decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.' }
  }

  /** Reads typed text as a value of `column`: `undefined` for an empty cell, `null` for text that is not a value. */
  #parse(column: InputMatrixColumn, text: string): InputMatrixCellValue | undefined | null {
    const trimmed = text.trim()
    if (!trimmed) return undefined
    const type = this.#typeOf(column)
    if (type === 'number') {
      const { group, decimal } = this.#marks()
      const plain = trimmed.split(group).join('').replace(/\s/g, '').replace(decimal, '.').replace('−', '-')
      return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(plain) ? Number(plain) : null
    }
    if (type === 'duration') {
      const lower = trimmed.toLowerCase()
      const clock = /^(\d+):([0-5]?\d)$/.exec(lower)
      if (clock) return Number(clock[1]) * 60 + Number(clock[2])
      if (/^\d+$/.test(lower)) return Number(lower)
      // `1h 30m`, `1.5h`, `45min`, and hours followed by bare minutes (`1 h 30`, as some languages write a duration).
      const units = /^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*(?:m(?:in)?)?)?$/.exec(lower)
      if (units && (units[1] || units[2])) return Math.round(Number((units[1] ?? '0').replace(',', '.')) * 60) + Number(units[2] ?? 0)
      return null
    }
    // What a native date or time input writes; anything else (pasted `12/31/2026`) is not a value of the column.
    if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null
    if (type === 'time') return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(trimmed) ? trimmed : null
    return trimmed
  }

  /** A stored value as its cell shows it. */
  #format(column: InputMatrixColumn, value: InputMatrixCellValue | undefined): string {
    if (value === undefined || value === null) return ''
    const type = this.#typeOf(column)
    if (type === 'duration' && typeof value === 'number') return this.#formatDuration(value)
    if (type === 'number' && typeof value === 'number')
      return new Intl.NumberFormat(this.msg.locale, { useGrouping: false, maximumFractionDigits: 20 }).format(value)
    return String(value)
  }

  #formatDuration(minutes: number): string {
    const sign = minutes < 0 ? '-' : ''
    const whole = Math.round(Math.abs(minutes))
    return sign + this.msg.t('duration', String(Math.floor(whole / 60)), String(whole % 60).padStart(2, '0'))
  }

  /** The sum of the cells of `columns` in `rows` that hold a number, written as a duration when every summed column is one. */
  #total(rows: ChoiceMatrixRow[], columns: InputMatrixColumn[]): string {
    const summed = columns.filter((column) => summable(this.#typeOf(column)))
    let sum = 0
    let any = false
    for (const row of rows) {
      for (const column of summed) {
        const value = this.#stored(row, column)
        if (typeof value !== 'number' || !Number.isFinite(value)) continue
        sum += value
        any = true
      }
    }
    if (!any) return ''
    if (summed.every((column) => this.#typeOf(column) === 'duration')) return this.#formatDuration(sum)
    return new Intl.NumberFormat(this.msg.locale, { maximumFractionDigits: 10 }).format(Number(sum.toFixed(10)))
  }

  /** The first problem with a cell, as validity flags and a message; undefined when it is fine. */
  #problem(row: ChoiceMatrixRow, column: InputMatrixColumn): { flags: ValidityStateFlags; message: string } | undefined {
    if (this.#bad.has(this.#key(row, column))) return { flags: { badInput: true }, message: this.msg.t('badInput', row.label, column.label) }
    const value = this.#stored(row, column)
    if (this.#typeOf(column) !== 'number' || typeof value !== 'number') return undefined
    const format = (limit: number) => new Intl.NumberFormat(this.msg.locale).format(limit)
    if (typeof column.min === 'number' && value < column.min) {
      return { flags: { rangeUnderflow: true }, message: this.msg.t('rangeUnderflow', row.label, column.label, format(column.min)) }
    }
    if (typeof column.max === 'number' && value > column.max) {
      return { flags: { rangeOverflow: true }, message: this.msg.t('rangeOverflow', row.label, column.label, format(column.max)) }
    }
    return undefined
  }

  protected syncFormState(): void {
    const rows = this.rowList
    const columns = this.columnList as InputMatrixColumn[]
    const entries = this.name ? new FormData() : null
    for (const row of rows) {
      for (const column of columns) {
        const value = this.#stored(row, column)
        if (value !== undefined && value !== null && value !== '') entries?.append(`${this.name}[${row.value}][${column.value}]`, String(value))
      }
    }
    this.internals.setFormValue(this.effectiveDisabled ? null : entries, JSON.stringify(this.value))
    let flags: ValidityStateFlags = {}
    let message = ''
    let anchor: HTMLElement | undefined
    if (this.customValidityMessage) {
      flags = { customError: true }
      message = this.customValidityMessage
    } else {
      search: for (const [r, row] of this.#order.entries()) {
        for (const [c, column] of columns.entries()) {
          if (this.#cellDisabled(row, column)) continue
          const problem = this.#problem(row, column)
          if (!problem) continue
          ;({ flags, message } = problem)
          anchor = this.renderRoot?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`) ?? undefined
          break search
        }
      }
      if (!message && this.required && !rows.some((row) => columns.some((column) => this.#stored(row, column) !== undefined))) {
        flags = { valueMissing: true }
        message = this.msg.t('inputMissing')
      }
    }
    anchor ??= this.renderRoot?.querySelector<HTMLElement>('.input:not(:disabled)') ?? undefined
    this.internals.setValidity(flags, message, anchor)
  }

  /** Writes cells into a copy of `value`; `undefined` empties a cell. */
  #write(next: InputMatrixValue, row: ChoiceMatrixRow, column: ChoiceMatrixColumn, value: InputMatrixCellValue | undefined) {
    const cells = { ...next[row.value] }
    if (value === undefined) delete cells[column.value]
    else cells[column.value] = value
    if (Object.keys(cells).length) next[row.value] = cells
    else delete next[row.value]
  }

  #announce(change: boolean) {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    if (change) this.dispatchEvent(new CustomEvent('change', { detail: { value: this.copy(this.value) }, bubbles: true, composed: true }))
  }

  /** A cell's text changed: kept as typed, and written to `value` when it reads as a value of the column. */
  #edit(row: ChoiceMatrixRow, column: InputMatrixColumn, event: Event) {
    event.stopPropagation()
    const key = this.#key(row, column)
    const text = (event.target as HTMLInputElement | HTMLSelectElement).value
    const parsed = this.#parse(column, text)
    if (event.target instanceof HTMLInputElement && event.target.type === 'text') this.#drafts.set(key, text)
    if (parsed === null) {
      this.#bad.add(key)
      this.requestUpdate()
    } else {
      this.#bad.delete(key)
      const next = this.copy(this.value)
      this.#write(next, row, column, parsed)
      this.#editing = true
      this.value = next
    }
    this.#announce(false)
  }

  /** A cell was committed: shown as its value from now on, unless its text is not one. */
  #commit(row: ChoiceMatrixRow, column: InputMatrixColumn, event: Event) {
    event.stopPropagation()
    const key = this.#key(row, column)
    if (!this.#bad.has(key)) this.#drafts.delete(key)
    this.requestUpdate()
    this.dispatchEvent(new CustomEvent('change', { detail: { value: this.copy(this.value) }, bubbles: true, composed: true }))
  }

  #keydown(event: KeyboardEvent, r: number, c: number) {
    if (isComposingKey(event) || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target as HTMLInputElement
    const text = target instanceof HTMLInputElement && target.type === 'text'
    let rows = 0
    let columns = 0
    if (event.key === 'Enter') rows = event.shiftKey ? -1 : 1
    else if (text && event.key === 'ArrowUp') rows = -1
    else if (text && event.key === 'ArrowDown') rows = 1
    else if (text && event.key === 'ArrowLeft' && target.selectionStart === 0 && target.selectionEnd === 0) columns = -1
    else if (text && event.key === 'ArrowRight' && target.selectionStart === target.value.length && target.selectionEnd === target.value.length) columns = 1
    if (!rows && !columns) return
    // The next cell that takes input in that direction; none at the edge.
    for (let row = r + rows, column = c + columns; ; row += rows, column += columns) {
      const cell = this.renderRoot.querySelector<HTMLInputElement>(`[data-cell="${row}-${column}"]`)
      if (!cell) return
      if (cell.disabled) continue
      event.preventDefault()
      cell.focus()
      if (cell.type === 'text') cell.select()
      return
    }
  }

  /** Cells copied from a sheet fill the matrix from the cell pasted into; anything else pastes as usual. */
  #paste(event: ClipboardEvent, r: number, c: number) {
    const text = event.clipboardData?.getData('text/plain') ?? ''
    const grid = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
    if (!/[\t\n]/.test(grid)) return
    event.preventDefault()
    const columns = this.columnList as InputMatrixColumn[]
    const next = this.copy(this.value)
    grid.split('\n').forEach((line, i) => {
      const row = this.#order[r + i]
      if (!row) return
      line.split('\t').forEach((cellText, j) => {
        const column = columns[c + j]
        if (!column || this.#cellDisabled(row, column)) return
        const type = this.#typeOf(column)
        let parsed = this.#parse(column, cellText)
        // A select takes an option's value or its label.
        if (type === 'select' && typeof parsed === 'string')
          parsed = this.#options(column).find((option) => option.value === parsed || option.label === parsed)?.value ?? null
        if (parsed === null) return
        const key = this.#key(row, column)
        this.#drafts.delete(key)
        this.#bad.delete(key)
        this.#write(next, row, column, parsed)
      })
    })
    this.#editing = true
    this.value = next
    this.#announce(true)
  }

  #options(column: InputMatrixColumn): { value: string; label: string }[] {
    return (Array.isArray(column.options) ? column.options : []).map((option) => (typeof option === 'string' ? { value: option, label: option } : option))
  }

  override render() {
    const rows = this.rowList
    const columns = this.columnList as InputMatrixColumn[]
    const groups = this.groupRows(rows)
    this.#order = [...groups.values()].flat()
    const anySummable = columns.some((column) => summable(this.#typeOf(column)))
    const rowTotals = anySummable && (this.totals === 'rows' || this.totals === 'both')
    const columnTotals = anySummable && (this.totals === 'columns' || this.totals === 'both')
    const invalid = this.field.invalid
    let index = 0
    return html`<div
        class="matrix"
        role="group"
        aria-label=${this.label || this.field.label || this.msg.t('label')}
        aria-describedby=${this.field.describedBy()}
        aria-invalid=${invalid ? 'true' : nothing}
      >
        <table class="table" part="table">
          <thead>
            <tr>
              <th class="corner" scope="col">${this.rowHeader}</th>
              ${columns.map(
                (column, at) =>
                  html`<th class="column-header" part="column-header" scope="col"><span class="column-label" id="column-${at}">${column.label}</span></th>`,
              )}
              ${rowTotals ? html`<th class="column-header total-header" part="column-header" scope="col">${this.msg.t('total')}</th>` : nothing}
            </tr>
          </thead>
          ${[...groups].map(
            ([group, groupRows]) =>
              html`<tbody>
                ${
                  group
                    ? html`<tr class="group-header" part="group-header">
                        <th scope="rowgroup" class="group-title" colspan=${columns.length + 1 + (rowTotals ? 1 : 0)}>${group}</th>
                      </tr>`
                    : nothing
                }
                ${groupRows.map((row) => {
                  const r = index++
                  return html`<tr class="row ${row.disabled ? 'row--disabled' : ''}">
                    ${this.renderRowHeader(row, `row-${r}`)}
                    ${columns.map((column, c) => html`<td class="cell" part="cell">${this.#renderInput(row, column, r, c)}</td>`)}
                    ${rowTotals ? html`<td class="total" part="total">${this.#total([row], columns)}</td>` : nothing}
                  </tr>`
                })}
              </tbody>`,
          )}
          ${
            columnTotals
              ? html`<tfoot>
                  <tr class="totals-row" part="totals-row">
                    <th class="row-header total-header" part="row-header" scope="row">${this.msg.t('total')}</th>
                    ${columns.map((column) => html`<td class="total" part="total">${summable(this.#typeOf(column)) ? this.#total(rows, [column]) : ''}</td>`)}
                    ${rowTotals ? html`<td class="total" part="total">${this.#total(rows, columns)}</td>` : nothing}
                  </tr>
                </tfoot>`
              : nothing
          }
        </table>
      </div>
      ${this.field.renderDescription()}`
  }

  #renderInput(row: ChoiceMatrixRow, column: InputMatrixColumn, r: number, c: number) {
    const type = this.#typeOf(column)
    const stored = this.#stored(row, column)
    const disabled = this.#cellDisabled(row, column)
    const invalid = this.field.invalid || (!disabled && !!this.#problem(row, column))
    const labelledBy = `row-${r} column-${c}`
    if (type === 'select') {
      const current = stored === undefined ? '' : String(stored)
      return html`<select
        class="input input--select"
        part="input"
        data-cell="${r}-${c}"
        aria-labelledby=${labelledBy}
        aria-invalid=${invalid ? 'true' : nothing}
        ?disabled=${disabled}
        @input=${(event: Event) => this.#edit(row, column, event)}
        @change=${(event: Event) => this.#commit(row, column, event)}
        @keydown=${(event: KeyboardEvent) => this.#keydown(event, r, c)}
        @paste=${(event: ClipboardEvent) => this.#paste(event, r, c)}
      >
        <option value="" .selected=${live(current === '')}></option>
        ${this.#options(column).map((option) => html`<option value=${option.value} .selected=${live(option.value === current)}>${option.label}</option>`)}
      </select>`
    }
    const native = type === 'date' || type === 'time'
    const draft = this.#drafts.get(this.#key(row, column))
    return html`<input
      class="input ${type === 'number' || type === 'duration' ? 'input--number' : ''}"
      part="input"
      type=${native ? type : 'text'}
      inputmode=${type === 'number' ? 'decimal' : nothing}
      data-cell="${r}-${c}"
      aria-labelledby=${labelledBy}
      aria-invalid=${invalid ? 'true' : nothing}
      placeholder=${column.placeholder ?? nothing}
      autocomplete="off"
      .value=${live(native ? String(stored ?? '') : (draft ?? this.#format(column, stored)))}
      ?disabled=${disabled}
      @input=${(event: Event) => this.#edit(row, column, event)}
      @change=${(event: Event) => this.#commit(row, column, event)}
      @keydown=${(event: KeyboardEvent) => this.#keydown(event, r, c)}
      @paste=${(event: ClipboardEvent) => this.#paste(event, r, c)}
    />`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-input-matrix': InputMatrix
  }
}
