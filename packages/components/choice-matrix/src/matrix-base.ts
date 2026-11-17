import { LitElement, html, nothing, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { disabledByAncestor } from '@c2n/core/dom-helper.js'

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

/**
 * What `c2-choice-matrix` and `c2-input-matrix` share: rows by columns in a table whose first column stays in place,
 * rows listed by group, and a form-associated value keyed by row. Not an element on its own.
 */
export abstract class MatrixBase<V extends object> extends LitElement {
  static formAssociated = true

  /** The rows. As an attribute, a JSON array of `{ value, label, description, group, disabled }`. */
  @property({ converter: jsonPropertyConverter }) rows: ChoiceMatrixRow[] = []

  /** The columns. As an attribute, a JSON array of `{ value, label, disabled }`. */
  @property({ converter: jsonPropertyConverter }) columns: ChoiceMatrixColumn[] = []

  /** Form field name: the form receives one entry per row and column that holds a value. */
  @property({ reflect: true }) name = ''

  /** Turns every cell off; the value is kept and, as for a disabled form control, not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The title above the row labels. */
  @property({ attribute: 'row-header' }) rowHeader = ''

  /** The accessible name of the matrix. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  abstract value: V

  @state() protected disabledByForm = false

  protected readonly internals = this.attachInternals()
  protected customValidityMessage = ''
  private defaultValue: V | undefined

  /** A copy of `value` deep enough that changing it leaves the original alone. */
  protected abstract copy(value: V): V
  /** Writes the form value and the validity. */
  protected abstract syncFormState(): void

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
    this.value = this.copy(this.defaultValue ?? ({} as V))
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state !== 'string') return
    try {
      const restored: unknown = JSON.parse(state)
      if (restored && typeof restored === 'object' && !Array.isArray(restored)) this.value = restored as V
    } catch {
      // Not a state this element wrote; keep the current value.
    }
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') && (!this.value || typeof this.value !== 'object' || Array.isArray(this.value))) this.value = {} as V
  }

  protected override updated(): void {
    this.syncFormState()
  }

  protected get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  protected get rowList(): ChoiceMatrixRow[] {
    return Array.isArray(this.rows) ? this.rows.filter((row) => row && typeof row.value === 'string') : []
  }

  protected get columnList(): ChoiceMatrixColumn[] {
    return Array.isArray(this.columns) ? this.columns.filter((column) => column && typeof column.value === 'string') : []
  }

  /** The rows by group, in the order each group first appears; rows without a group under `''`. */
  protected groupRows(rows: ChoiceMatrixRow[]): Map<string, ChoiceMatrixRow[]> {
    const groups = new Map<string, ChoiceMatrixRow[]>()
    for (const row of rows) {
      const key = row.group ?? ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }
    return groups
  }

  /** A row's title cell; `id` names the label, which each cell's control is labelled by with its column's. */
  protected renderRowHeader(row: ChoiceMatrixRow, id: string) {
    return html`<th class="row-header" part="row-header" scope="row">
      <span class="row-label" id=${id}>${row.label}</span>
      ${row.description ? html`<span class="description" part="description">${row.description}</span>` : nothing}
    </th>`
  }
}
