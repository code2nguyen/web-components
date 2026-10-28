import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { choiceMatrixMessages } from './messages'
import styles from './choice-matrix.scss?inline'

export { choiceMatrixMessages } from './messages'

/** One row: a thing to choose for, such as a resource, a notification or a statement. */
export interface ChoiceMatrixRow {
  value: string
  label: string
  /** A second line under the label. */
  description?: string
  /** Rows with the same group are listed together under a header row with that title. */
  group?: string
  disabled?: boolean
}

/** One column: a choice offered for every row, such as a permission, a channel or a point of a scale. */
export interface ChoiceMatrixColumn {
  value: string
  label: string
  disabled?: boolean
}

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
 * choices and is skipped by the toggles.
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
 * @cssproperty {pixel} [--c2-choice-matrix__control--size=18px]
 * @cssproperty {border} [--c2-choice-matrix__control--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-choice-matrix__control--border-radius=4px] - A checkbox's corners; radio buttons are round.
 * @cssproperty {color} [--c2-choice-matrix__control--background-color=#ffffff]
 * @cssproperty {color} [--c2-choice-matrix__control__hover--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-choice-matrix__control__selected--background-color=#476ef9] - A checked checkbox or a chosen radio button.
 * @cssproperty {color} [--c2-choice-matrix__control__selected--mark-color=#ffffff] - The check, the dash and the dot drawn on a selected control.
 * @cssproperty {color} [--c2-choice-matrix__control__error--border-color=#dc2626]
 * @cssproperty {outline} [--c2-choice-matrix__control__focus--outline=2px solid rgba(71, 110, 249, 0.4)]
 * @cssproperty {opacity} [--c2-choice-matrix__control__disabled--opacity=0.38]
 */
@customElement('c2-choice-matrix')
export class ChoiceMatrix extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** The rows. As an attribute, a JSON array of `{ value, label, description, group, disabled }`. */
  @property({ converter: jsonPropertyConverter }) rows: ChoiceMatrixRow[] = []

  /** The columns. As an attribute, a JSON array of `{ value, label, disabled }`. */
  @property({ converter: jsonPropertyConverter }) columns: ChoiceMatrixColumn[] = []

  /** The choices, by row value. As an attribute, JSON: `{"issues":["read","write"]}`, or `{"q1":"agree"}` for radio rows. */
  @property({ converter: jsonPropertyConverter }) value: ChoiceMatrixValue = {}

  /** Any number of columns per row, or exactly one. */
  @property() type: 'checkbox' | 'radio' = 'checkbox'

  /** Tri-state checkboxes that check or clear a whole row, a whole column (and a column within each group), or both. Checkbox matrices only. */
  @property() toggles: 'none' | 'rows' | 'columns' | 'both' = 'none'

  /** Form field name: the form receives `name[row]=column` for each choice. */
  @property({ reflect: true }) name = ''

  /** Asks for at least one choice, or for every row to be answered with `type="radio"`. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns every choice and toggle off; the value is kept and, as for a disabled form control, not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The title above the row labels. */
  @property({ attribute: 'row-header' }) rowHeader = ''

  /** The accessible name of the matrix. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  @state() private disabledByForm = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, choiceMatrixMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private customValidityMessage = ''
  private defaultValue: ChoiceMatrixValue | undefined

  protected override firstUpdated(): void {
    // A value a framework binds right after inserting the element is in place by the first update, so it is the default a form reset returns to.
    this.defaultValue ??= this.copy(this.value)
  }

  get form() {
    return this.internals.form
  }

  get labels() {
    return this.internals.labels
  }

  get validity() {
    return this.internals.validity
  }

  get validationMessage() {
    return this.internals.validationMessage
  }

  get willValidate() {
    return this.internals.willValidate
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

  formResetCallback() {
    this.value = this.copy(this.defaultValue ?? {})
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state !== 'string') return
    try {
      const restored: unknown = JSON.parse(state)
      if (restored && typeof restored === 'object' && !Array.isArray(restored)) this.value = restored as ChoiceMatrixValue
    } catch {
      // Not a state this element wrote; keep the current value.
    }
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') && (!this.value || typeof this.value !== 'object' || Array.isArray(this.value))) this.value = {}
  }

  protected override updated(): void {
    this.syncFormState()
  }

  private copy(value: ChoiceMatrixValue): ChoiceMatrixValue {
    return Object.fromEntries(Object.entries(value ?? {}).map(([row, choice]) => [row, Array.isArray(choice) ? [...choice] : choice]))
  }

  private get radio(): boolean {
    return this.type === 'radio'
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  private get rowList(): ChoiceMatrixRow[] {
    return Array.isArray(this.rows) ? this.rows.filter((row) => row && typeof row.value === 'string') : []
  }

  private get columnList(): ChoiceMatrixColumn[] {
    return Array.isArray(this.columns) ? this.columns.filter((column) => column && typeof column.value === 'string') : []
  }

  /** The columns chosen for a row, always as a list. */
  private chosen(row: string): string[] {
    const choice = Object.prototype.hasOwnProperty.call(this.value, row) ? this.value[row] : undefined
    if (Array.isArray(choice)) return choice.filter((item) => typeof item === 'string')
    return typeof choice === 'string' && choice ? [choice] : []
  }

  private isChecked(row: string, column: string): boolean {
    const chosen = this.chosen(row)
    return this.radio ? chosen[0] === column : chosen.includes(column)
  }

  private cellDisabled(row: ChoiceMatrixRow, column: ChoiceMatrixColumn): boolean {
    return this.effectiveDisabled || !!row.disabled || !!column.disabled
  }

  /** How many of the enabled cells among `cells` are checked. */
  private mixed(cells: [ChoiceMatrixRow, ChoiceMatrixColumn][]): Mixed {
    const enabled = cells.filter(([row, column]) => !this.cellDisabled(row, column))
    const checked = enabled.filter(([row, column]) => this.isChecked(row.value, column.value)).length
    return !enabled.length || checked === 0 ? 'none' : checked === enabled.length ? 'all' : 'some'
  }

  private syncFormState(): void {
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
  private commit(cells: [ChoiceMatrixRow, ChoiceMatrixColumn][], checked: boolean): void {
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
    const columnToggles = toggles === 'columns' || toggles === 'both'
    const groups = new Map<string, ChoiceMatrixRow[]>()
    for (const row of rows) {
      const key = row.group ?? ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }
    const invalid = this.field.invalid
    let rowIndex = 0
    return html`<div
        class="matrix ${invalid ? 'matrix--invalid' : ''}"
        role="group"
        aria-label=${this.label || this.field.label || this.msg.t('label')}
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
                          ${this.renderToggle(
                            rows.map((row) => [row, column]),
                            this.msg.t('toggleColumn', column.label),
                          )}
                        </td>`,
                    )}
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
                                columnToggles
                                  ? this.renderToggle(
                                      groupRows.map((row) => [row, column]),
                                      this.msg.t('toggleGroup', column.label, group),
                                    )
                                  : nothing
                              }
                            </td>`,
                        )}
                      </tr>`
                    : nothing
                }
                ${groupRows.map((row) => this.renderRow(row, rowIndex++, columns, rowToggles))}
              </tbody>`,
          )}
        </table>
      </div>
      ${this.field.renderDescription()}`
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
      <th class="row-header" part="row-header" scope="row">
        <span class="row-label" id=${headerId}>${row.label}</span>
        ${row.description ? html`<span class="description" part="description">${row.description}</span>` : nothing}
      </th>
      ${columns.map(
        (column, at) =>
          html`<td class="cell" part="cell">
            <input
              class="control cell-control ${this.radio ? 'control--radio' : ''}"
              part="control"
              type=${this.radio ? 'radio' : 'checkbox'}
              name=${this.radio ? `row-${index}` : nothing}
              aria-labelledby="${headerId} column-${at}"
              .checked=${live(this.isChecked(row.value, column.value))}
              ?disabled=${this.cellDisabled(row, column)}
              aria-invalid=${this.field.invalid ? 'true' : nothing}
              @input=${this.stopNativeInput}
              @change=${(event: Event) => this.commit([[row, column]], (event.target as HTMLInputElement).checked)}
            />
          </td>`,
      )}
    </tr>`
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
