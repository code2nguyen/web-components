import { html, nothing, unsafeCSS, type CSSResultGroup } from 'lit'
import { live } from 'lit/directives/live.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { choiceMatrixMessages } from './messages'
import styles from './choice-matrix.scss?inline'
import { MatrixBase, type ChoiceMatrixColumn, type ChoiceMatrixRow } from './matrix-base'

export { choiceMatrixMessages } from './messages'
export type { ChoiceMatrixColumn, ChoiceMatrixRow } from './matrix-base'

/** What `renderCell` is handed for each cell. */
export interface ChoiceMatrixCellContext {
  row: ChoiceMatrixRow
  column: ChoiceMatrixColumn
  checked: boolean
  disabled: boolean
}

/** Draws the content of a cell beside its control: anything Lit can render. */
export type ChoiceMatrixCellRenderer = (context: ChoiceMatrixCellContext) => unknown

/** What `renderRowDetail` is handed for each row. */
export interface ChoiceMatrixRowDetailContext {
  row: ChoiceMatrixRow
  /** The columns chosen in the row. */
  chosen: string[]
}

/** Draws what goes under a row, across the whole matrix: a comment field, a note, a photo. Return nothing to leave the row without. */
export type ChoiceMatrixRowDetailRenderer = (context: ChoiceMatrixRowDetailContext) => unknown

/** Text shown in each cell beside its control, by row value then column value. */
export type ChoiceMatrixCells = Record<string, Record<string, string>>

/** The choices: for each row's `value`, the checked columns' values (`checkbox`) or the chosen column's value (`radio`). */
export type ChoiceMatrixValue = Record<string, string[] | string>

/** Events fired by {@link ChoiceMatrix}, keyed for `addEventListener`. */
export interface ChoiceMatrixEventMap {
  input: Event
  change: CustomEvent<{ value: ChoiceMatrixValue }>
}

export interface ChoiceMatrix {
  addEventListener: TypedAddEventListener<ChoiceMatrix, ChoiceMatrixEventMap>
  removeEventListener: TypedRemoveEventListener<ChoiceMatrix, ChoiceMatrixEventMap>
}

type Mixed = 'all' | 'some' | 'none'

/**
 * Rows × columns of checkboxes or radio buttons in one form control: the permissions of GitHub and Okta (resources ×
 * read, write, admin), notification preferences (events × email, push, SMS) or a survey's agreement scale.
 *
 * With `type="checkbox"` each row takes any number of columns; with `type="radio"` exactly one, and the arrow keys move
 * along the row. `toggles` adds tri-state checkboxes that check or clear a whole row, a whole column, or a column within
 * a group of rows (rows that share a `group` are listed under a header row). A disabled row or column keeps its
 * choices and is skipped by the toggles. With `type="radio"`, `use-all` puts a "Use all" button under each column
 * title, which chooses that column in every row.
 *
 * A cell can hold content beside its control, which also names the control: text from `cells`
 * (`{"email":{"a":"ada@example.com"}}`) or anything `renderCell` draws. That is how a cell shows the value it stands
 * for, as a merge of duplicate records does (`c2-record-merge`).
 *
 * Under a row, a line across the matrix can hold a comment field, a note or a photo: put an element in the row's slot,
 * `detail-<row value>` (`<c2-textarea slot="detail-q1">`), or set `renderRowDetail`. A row with neither has no line.
 *
 * `value` maps each row's `value` to the checked columns' values (a string for radio rows). Under a `name`, a form
 * receives one `name[row]=column` entry per choice. `required` asks for at least one choice, or for every row to be
 * answered with `type="radio"`. The control takes part in `c2-form-field`, which names and describes it.
 *
 * Each choice is named by its row and column, and the matrix is a table: a screen reader reads the column title as it
 * moves along a row. On a narrow screen the table scrolls sideways with its first column held in place.
 *
 * @tag c2-choice-matrix
 *
 * @slot detail-<row> - Content under the row whose value follows `detail-`, across the matrix: a comment, a note, a photo. Wins over `renderRowDetail`.
 *
 * @event {Event} input - Fired when the user changes a choice, before `change`. Read `value`.
 * @event {CustomEvent<{ value: ChoiceMatrixValue }>} change - Fired after the user changes a choice. `detail.value` is the new `value`. Not fired for programmatic changes.
 *
 * @csspart table - The table.
 * @csspart column-header - A column's title cell.
 * @csspart row-header - A row's title cell, holding its label and description.
 * @csspart description - A row's description.
 * @csspart group-header - The header row of a group.
 * @csspart cell - The cell of one choice.
 * @csspart control - A checkbox or radio button, the toggles included.
 * @csspart cell-content - The content of a cell beside its control (`cells`, `renderCell`); the control and it form one label.
 * @csspart column-action - The "Use all" button under a column title of a radio matrix (`use-all`).
 * @csspart row-detail - Cell under a row, across the matrix, containing the row's `detail-<row>` slot (fallback: what `renderRowDetail` draws); a row with neither has no such cell.
 *
 * @cssproperty {padding} [--c2-choice-matrix__cell--padding=10px 12px]
 * @cssproperty {border} [--c2-choice-matrix__row--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-choice-matrix__row__hover--background-color=#fafafa]
 * @cssproperty {color} [--c2-choice-matrix--background-color=#ffffff] - Behind the table, and behind the first column while it is held during a sideways scroll.
 * @cssproperty {color} [--c2-choice-matrix__column-header--color=#71717a]
 * @cssproperty {font-size} [--c2-choice-matrix__column-header--font-size=12px]
 * @cssproperty {font-weight} [--c2-choice-matrix__column-header--font-weight=500]
 * @cssproperty {color} [--c2-choice-matrix__row-header--color=#18181b]
 * @cssproperty {font-size} [--c2-choice-matrix__row-header--font-size=14px]
 * @cssproperty {font-weight} [--c2-choice-matrix__row-header--font-weight=400]
 * @cssproperty {color} [--c2-choice-matrix__description--color=#71717a]
 * @cssproperty {font-size} [--c2-choice-matrix__description--font-size=12px]
 * @cssproperty {color} [--c2-choice-matrix__group-header--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-choice-matrix__group-header--color=#18181b]
 * @cssproperty {font-weight} [--c2-choice-matrix__group-header--font-weight=600]
 *
 * @cssproperty {pixel} [--c2-choice-matrix__control--size=18px] - Width and height of the control button.
 * @cssproperty {border} [--c2-choice-matrix__control--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-choice-matrix__control--border-radius=4px] - A checkbox's corners; radio buttons are round.
 * @cssproperty {color} [--c2-choice-matrix__control--background-color=#ffffff]
 * @cssproperty {color} [--c2-choice-matrix__control__hover--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-choice-matrix__control__selected--background-color=#476ef9] - A checked checkbox or a chosen radio button.
 * @cssproperty {color} [--c2-choice-matrix__control__selected--mark-color=#ffffff] - The check, the dash and the dot drawn on a selected control.
 * @cssproperty {color} [--c2-choice-matrix__control__error--border-color=#dc2626]
 * @cssproperty {outline} [--c2-choice-matrix__control__focus--outline=2px solid rgba(71, 110, 249, 0.4)]
 * @cssproperty {opacity} [--c2-choice-matrix__control__disabled--opacity=0.38]
 *
 * @cssproperty {color} [--c2-choice-matrix__cell-content--color=#18181b]
 * @cssproperty {font-size} [--c2-choice-matrix__cell-content--font-size=14px]
 * @cssproperty {color} [--c2-choice-matrix__cell__selected--background-color=rgba(71, 110, 249, 0.08)] - A cell with content whose control is chosen.
 * @cssproperty {color} [--c2-choice-matrix__column-action--color=#0265dc]
 * @cssproperty {font-size} [--c2-choice-matrix__column-action--font-size=12px]
 * @cssproperty {padding} [--c2-choice-matrix__row-detail--padding=0 12px 12px] - The line under a row (`detail-<row>`, `renderRowDetail`).
 */
@customElement('c2-choice-matrix')
export class ChoiceMatrix extends MatrixBase<ChoiceMatrixValue> {
  static override styles: CSSResultGroup = unsafeCSS(styles)

  /** The choices, by row value. As an attribute, JSON: `{"issues":["read","write"]}`, or `{"q1":"agree"}` for radio rows. */
  @property({ converter: jsonPropertyConverter }) value: ChoiceMatrixValue = {}

  /** Any number of columns per row, or exactly one. */
  @property() type: 'checkbox' | 'radio' = 'checkbox'

  /** Tri-state checkboxes that check or clear a whole row, a whole column (and a column within each group), or both. Checkbox matrices only. */
  @property() toggles: 'none' | 'rows' | 'columns' | 'both' = 'none'

  /** A "Use all" button under each column title that chooses that column in every row. Radio matrices only. */
  @property({ type: Boolean, attribute: 'use-all' }) useAll = false

  /** Asks for at least one choice, or for every row to be answered with `type="radio"`. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Text shown in each cell beside its control, by row then column. As an attribute, JSON: `{"email":{"a":"ada@example.com"}}`. */
  @property({ converter: jsonPropertyConverter }) cells?: ChoiceMatrixCells

  /** Draws each cell's content beside its control; wins over `cells`. */
  @property({ attribute: false }) renderCell?: ChoiceMatrixCellRenderer

  /** Draws a line under a row, across the matrix: a comment field or a note. A row's `detail-<row>` slot wins. */
  @property({ attribute: false }) renderRowDetail?: ChoiceMatrixRowDetailRenderer

  /** The rows with a `detail-<row>` child, kept in step with the children. */
  #detailSlots = new Set<string>()
  #children?: MutationObserver
  /**
   * Rendered on the server: the server saw no children, so its rows have no detail line, and the first client render
   * must draw the same to hydrate. The children are read once it has.
   */
  #hydrating = this.shadowRoot !== null

  override connectedCallback() {
    super.connectedCallback()
    if (!this.#hydrating) this.#readDetailSlots()
    this.#children ??= new MutationObserver(() => this.#readDetailSlots())
    // `subtree` so a child's own `slot` changing is seen too; only the direct children are read.
    this.#children.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['slot'] })
  }

  protected override firstUpdated(): void {
    super.firstUpdated()
    if (!this.#hydrating) return
    this.#hydrating = false
    this.#readDetailSlots()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.#children?.disconnect()
  }

  #readDetailSlots() {
    const next = new Set<string>()
    for (const child of Array.from(this.children ?? [])) {
      const slot = child.getAttribute('slot')
      if (slot?.startsWith('detail-')) next.add(slot.slice('detail-'.length))
    }
    if (next.size === this.#detailSlots.size && [...next].every((key) => this.#detailSlots.has(key))) return
    this.#detailSlots = next
    this.requestUpdate()
  }

  protected readonly msg = new LocalizeController(this, choiceMatrixMessages)
  protected readonly field = new FieldContextConsumer(this, { kind: 'choice' })

  protected copy(value: ChoiceMatrixValue): ChoiceMatrixValue {
    return Object.fromEntries(Object.entries(value ?? {}).map(([row, choice]) => [row, Array.isArray(choice) ? [...choice] : choice]))
  }

  protected get radio(): boolean {
    return this.type === 'radio'
  }

  /** The columns chosen for a row, always as a list. */
  protected chosen(row: string): string[] {
    const choice = Object.prototype.hasOwnProperty.call(this.value, row) ? this.value[row] : undefined
    if (Array.isArray(choice)) return choice.filter((item) => typeof item === 'string')
    return typeof choice === 'string' && choice ? [choice] : []
  }

  protected isChecked(row: string, column: string): boolean {
    const chosen = this.chosen(row)
    return this.radio ? chosen[0] === column : chosen.includes(column)
  }

  protected cellDisabled(row: ChoiceMatrixRow, column: ChoiceMatrixColumn): boolean {
    return this.effectiveDisabled || !!row.disabled || !!column.disabled
  }

  /** How many of the enabled cells among `cells` are checked. */
  private mixed(cells: [ChoiceMatrixRow, ChoiceMatrixColumn][]): Mixed {
    const enabled = cells.filter(([row, column]) => !this.cellDisabled(row, column))
    const checked = enabled.filter(([row, column]) => this.isChecked(row.value, column.value)).length
    return !enabled.length || checked === 0 ? 'none' : checked === enabled.length ? 'all' : 'some'
  }

  protected syncFormState(): void {
    const rows = this.rowList
    const entries = this.name ? new FormData() : null
    for (const row of rows) {
      // A radio row submits the one choice it shows, even when `value` holds a list.
      const chosen = this.radio ? this.chosen(row.value).slice(0, 1) : this.chosen(row.value)
      for (const column of chosen) entries?.append(`${this.name}[${row.value}]`, column)
    }
    this.internals.setFormValue(this.effectiveDisabled ? null : entries, JSON.stringify(this.value))
    const answered = (row: ChoiceMatrixRow) => this.chosen(row.value).length > 0
    const missing = this.required && (this.radio ? rows.some((row) => !row.disabled && !answered(row)) : !rows.some(answered))
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? this.msg.t(this.radio ? 'rowsMissing' : 'valueMissing') : '')
    const anchor = this.renderRoot?.querySelector<HTMLInputElement>('input.cell-control:not(:disabled)') ?? undefined
    this.internals.setValidity(flags, message, anchor)
  }

  /** Sets the checked state of `cells`, then announces the change. */
  protected commit(cells: [ChoiceMatrixRow, ChoiceMatrixColumn][], checked: boolean): void {
    const next = this.copy(this.value)
    for (const [row, column] of cells) {
      if (this.cellDisabled(row, column)) continue
      if (this.radio) {
        if (checked) next[row.value] = column.value
        continue
      }
      const current = next[row.value]
      const chosen = new Set(Array.isArray(current) ? current : typeof current === 'string' ? [current] : [])
      if (checked) chosen.add(column.value)
      else chosen.delete(column.value)
      // Keep the columns in their order, whatever order they were checked in, and any value that is not a column (one
      // hidden from this user, say) where it was.
      const known = this.columnList.map((item) => item.value)
      next[row.value] = [...known.filter((value) => chosen.has(value)), ...[...chosen].filter((value) => !known.includes(value))]
      if (!(next[row.value] as string[]).length) delete next[row.value]
    }
    this.value = next
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent('change', { detail: { value: this.copy(next) }, bubbles: true, composed: true }))
  }

  override render() {
    const rows = this.rowList
    const columns = this.columnList
    const toggles = this.radio ? 'none' : this.toggles
    const rowToggles = toggles === 'rows' || toggles === 'both'
    const useAll = this.radio && this.useAll
    // The column toggles, or the "Use all" buttons of a radio matrix, sit in a row of their own under the titles.
    const columnToggles = useAll || toggles === 'columns' || toggles === 'both'
    const groups = this.groupRows(rows)
    const invalid = this.field.invalid
    let rowIndex = 0
    return html`<div
        class="matrix ${invalid ? 'matrix--invalid' : ''}"
        role="group"
        aria-label=${this.label || this.field.label || this.defaultLabel}
        aria-describedby=${this.field.describedBy()}
        aria-invalid=${invalid ? 'true' : nothing}
      >
        <table class="table" part="table">
          <thead>
            <tr>
              ${rowToggles ? html`<td class="toggle-cell"></td>` : nothing}
              <th class="corner" scope="col">${this.rowHeader}</th>
              ${columns.map(
                (column, at) =>
                  html`<th class="column-header" part="column-header" scope="col"><span class="column-label" id="column-${at}">${column.label}</span></th>`,
              )}
              ${this.renderTrailing('header')}
            </tr>
            ${
              // The column toggles get a row of their own, so a column title is named by its text alone.
              columnToggles
                ? html`<tr class="toggle-row">
                    ${rowToggles ? html`<td class="toggle-cell"></td>` : nothing}
                    <td class="corner"></td>
                    ${columns.map(
                      (column) =>
                        html`<td class="cell">
                          ${
                            useAll
                              ? this.renderUseAll(column, rows)
                              : this.renderToggle(
                                  rows.map((row) => [row, column]),
                                  this.msg.t('toggleColumn', column.label),
                                )
                          }
                        </td>`,
                    )}
                    ${this.renderTrailing('toggle')}
                  </tr>`
                : nothing
            }
          </thead>
          ${[...groups].map(
            ([group, groupRows]) =>
              html`<tbody>
                ${
                  group
                    ? html`<tr class="group-header" part="group-header">
                        ${rowToggles ? html`<td class="toggle-cell"></td>` : nothing}
                        <th scope="rowgroup" class="group-title">${group}</th>
                        ${columns.map(
                          (column) =>
                            html`<td class="cell">
                              ${
                                columnToggles && !useAll
                                  ? this.renderToggle(
                                      groupRows.map((row) => [row, column]),
                                      this.msg.t('toggleGroup', column.label, group),
                                    )
                                  : nothing
                              }
                            </td>`,
                        )}
                        ${this.renderTrailing('group', groupRows[0])}
                      </tr>`
                    : nothing
                }
                ${groupRows.map((row) => [this.renderRow(row, rowIndex++, columns, rowToggles), this.renderDetail(row, columns.length + 1 + (rowToggles ? 1 : 0))])}
              </tbody>`,
          )}
        </table>
      </div>
      ${this.renderSummary()} ${this.field.renderDescription()}`
  }

  private renderRow(row: ChoiceMatrixRow, index: number, columns: ChoiceMatrixColumn[], rowToggle: boolean) {
    const headerId = `row-${index}`
    return html`<tr class="row ${row.disabled ? 'row--disabled' : ''}">
      ${
        // The row toggle sits in a cell of its own, so the row title is named by its text alone.
        rowToggle
          ? html`<td class="toggle-cell">
              ${this.renderToggle(
                columns.map((column) => [row, column]),
                this.msg.t('toggleRow', row.label),
              )}
            </td>`
          : nothing
      }
      ${this.renderRowHeader(row, headerId)}
      ${columns.map((column, at) => {
        const checked = this.isChecked(row.value, column.value)
        const disabled = this.cellDisabled(row, column)
        const content = this.cellContent({ row, column, checked, disabled })
        const hasContent = content !== undefined && content !== null && content !== '' && content !== nothing
        const contentId = `cell-${index}-${at}`
        const control = html`<input
          class="control cell-control ${this.radio ? 'control--radio' : ''}"
          part="control"
          type=${this.radio ? 'radio' : 'checkbox'}
          name=${this.radio ? `row-${index}` : nothing}
          aria-labelledby="${headerId} column-${at}${hasContent ? ` ${contentId}` : ''}"
          .checked=${live(checked)}
          ?disabled=${disabled}
          aria-invalid=${this.field.invalid ? 'true' : nothing}
          @input=${this.stopNativeInput}
          @change=${(event: Event) => this.commit([[row, column]], (event.target as HTMLInputElement).checked)}
        />`
        // With content, the control and it form one label, so the content is a target too.
        return hasContent
          ? html`<td class="cell cell--content ${checked ? 'cell--checked' : ''}" part="cell">
              <label class="cell-choice">${control}<span class="cell-content" part="cell-content" id=${contentId}>${content}</span></label>
            </td>`
          : html`<td class="cell" part="cell">${control}</td>`
      })}
      ${this.renderTrailing('row', row)}
    </tr>`
  }

  /** The line under a row: its `detail-<row>` slot, else what `renderRowDetail` draws; nothing when it has neither. */
  private renderDetail(row: ChoiceMatrixRow, span: number) {
    const slotted = this.#detailSlots.has(row.value)
    const drawn = slotted || !this.renderRowDetail ? undefined : this.renderRowDetail({ row, chosen: this.chosen(row.value) })
    if (!slotted && (drawn === undefined || drawn === null || drawn === '' || drawn === nothing)) return nothing
    return html`<tr class="row-detail-line">
      <td class="row-detail" part="row-detail" colspan=${span + this.trailingColumns}><slot name="detail-${row.value}">${drawn}</slot></td>
    </tr>`
  }

  /** How many cells `renderTrailing` adds to each row, which the line under a row spans too. */
  protected get trailingColumns(): number {
    return 0
  }

  /** Drawn after the matrix, outside its sideways scroll: a variant's totals or verdict. Nothing here. */
  protected renderSummary(): unknown {
    return nothing
  }

  /** What a cell shows beside its control: `renderCell`'s content, else the text in `cells`. A variant draws its own. */
  protected cellContent(context: ChoiceMatrixCellContext): unknown {
    return this.renderCell ? this.renderCell(context) : this.cells?.[context.row.value]?.[context.column.value]
  }

  /** The accessible name when there is no `label` and no field label. */
  protected get defaultLabel(): string {
    return this.msg.t('label')
  }

  /** Cells after the last column, in each kind of row (a group header is handed its first row); none here. A variant adds a column of its own this way. */
  protected renderTrailing(_kind: 'header' | 'toggle' | 'group' | 'row', _row?: ChoiceMatrixRow): unknown {
    return nothing
  }

  /** The "Use all" button of a radio matrix's column: chooses it in every row where it can be chosen. */
  private renderUseAll(column: ChoiceMatrixColumn, rows: ChoiceMatrixRow[]) {
    const cells = rows.map((row): [ChoiceMatrixRow, ChoiceMatrixColumn] => [row, column])
    const enabled = cells.some(([row]) => !this.cellDisabled(row, column))
    return html`<button
      class="column-action"
      part="column-action"
      type="button"
      aria-label=${this.msg.t('useAllFrom', column.label)}
      ?disabled=${!enabled}
      @click=${() => this.commit(cells, true)}
    >
      ${this.msg.t('useAll')}
    </button>`
  }

  /** A tri-state checkbox over `cells`: checked when all are, mixed when some are. Pressing it checks them all, or clears them all when all were. */
  private renderToggle(cells: [ChoiceMatrixRow, ChoiceMatrixColumn][], label: string) {
    const state = this.mixed(cells)
    const enabled = cells.some(([row, column]) => !this.cellDisabled(row, column))
    return html`<input
      class="control toggle-control"
      part="control"
      type="checkbox"
      aria-label=${label}
      .checked=${live(state === 'all')}
      .indeterminate=${live(state === 'some')}
      ?disabled=${!enabled}
      @input=${this.stopNativeInput}
      @change=${() => this.commit(cells, state !== 'all')}
    />`
  }

  /** The inner input's own `input` is composed and would reach listeners before `value` changes; the host fires its own after. */
  private stopNativeInput(event: Event): void {
    event.stopPropagation()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-choice-matrix': ChoiceMatrix
  }
}
