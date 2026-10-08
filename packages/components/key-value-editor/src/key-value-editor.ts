import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { formatEnv, parseEnv, type KeyValueEntry } from './dotenv.js'
import styles from './key-value-editor.scss?inline'

export { formatEnv, parseEnv, type KeyValueEntry } from './dotenv.js'

/** Why a row's key is refused: another row has it, or it does not match `key-pattern`. */
export type KeyValueKeyError = 'duplicate' | 'pattern'

/** Events fired by {@link KeyValueEditor}, keyed for `addEventListener`. */
export interface KeyValueEditorEventMap {
  input: Event
  change: Event
}

export interface KeyValueEditor {
  addEventListener: TypedAddEventListener<KeyValueEditor, KeyValueEditorEventMap>
  removeEventListener: TypedRemoveEventListener<KeyValueEditor, KeyValueEditorEventMap>
}

type Field = 'key' | 'value'

let nextRowId = 0

/**
 * Editable `KEY=value` rows, the environment-variable form of Vercel, Netlify and Supabase. Each row has a key field,
 * a value field and a remove button; **Add** appends a row. Pasting a `.env` file into any key field (or several
 * `KEY=value` lines into a value field) splits it into rows: a pasted key that already has a row updates its value,
 * and a blank row is filled rather than kept. **Enter** moves from a key to its value and from a value to the next
 * row, adding one after the last; **Backspace** in an empty row removes it.
 *
 * `masked` hides every value behind a password field with a show/hide toggle per row; an entry's own `masked` flag
 * overrides it for that row. Keys that appear twice, or that do not match `key-pattern`, are marked invalid with a
 * message under the row.
 *
 * `entries` holds the rows, blank ones included, and is replaced (never mutated) on every edit. With no entries one
 * blank row is shown, which joins `entries` once typed into. The element is form-associated: `name` submits the rows
 * as `.env` text (rows without a key are left out), and the form is invalid while a key is refused, or with
 * `required` while no row has a key. `toEnv()` returns the same text, and `parseEnv` / `formatEnv` are exported.
 *
 * The host exposes `:state(empty)`, `:state(invalid)`, `:state(read-only)` and `:state(disabled)`.
 *
 * @tag c2-key-value-editor
 *
 * @slot actions - Extra controls next to the add button, e.g. an "Import .env" button.
 * @slot hint - Help text under the rows, e.g. "Paste a .env file into a key field to add several variables at once."
 * @slot add-icon - Replaces the plus of the add button.
 * @slot remove-icon - Replaces the cross of each row's remove button.
 * @slot show-icon - Replaces the eye of the reveal toggle while a value is hidden.
 * @slot hide-icon - Replaces the crossed eye of the reveal toggle while a value is shown.
 *
 * @event {Event} input - Fired on every edit: typing in a field, adding, removing or pasting rows.
 * @event {Event} change - Fired when an edit is committed: a field loses focus after a change, or rows are added, removed or pasted.
 *
 * @cssproperty {pixel} [--c2-key-value-editor--row-gap=8px] - Space between rows.
 * @cssproperty {pixel} [--c2-key-value-editor--column-gap=8px] - Space between the key, the value and the remove button.
 * @cssproperty {length} [--c2-key-value-editor--key-width=minmax(0, 2fr)] - Grid track of the key column.
 * @cssproperty {length} [--c2-key-value-editor--value-width=minmax(0, 3fr)] - Grid track of the value column.
 * @cssproperty {color} [--c2-key-value-editor--color=#18181b]
 * @cssproperty {font-size} [--c2-key-value-editor--font-size=14px]
 * @cssproperty {font-family} --c2-key-value-editor--font-family - Font of the labels and buttons. Inherited when unset.
 *
 * @cssproperty {display} [--c2-key-value-editor__header--display=grid] - Set `none` to hide the column headers.
 * @cssproperty {color} [--c2-key-value-editor__header--color=#71717a]
 * @cssproperty {font-size} [--c2-key-value-editor__header--font-size=12px]
 * @cssproperty {font-weight} [--c2-key-value-editor__header--font-weight=500]
 *
 * @cssproperty {pixel} [--c2-key-value-editor__field--height=32px]
 * @cssproperty {padding} [--c2-key-value-editor__field--padding-inline=8px]
 * @cssproperty {border} [--c2-key-value-editor__field--border=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-key-value-editor__field__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-key-value-editor__field__focus--border=1px solid #476ef9]
 * @cssproperty {border} [--c2-key-value-editor__field__error--border=1px solid #dc2626] - Border of a refused key.
 * @cssproperty {border} [--c2-key-value-editor__field__read-only--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-key-value-editor__field--border-radius=6px]
 * @cssproperty {color} [--c2-key-value-editor__field--background=#ffffff]
 * @cssproperty {color} [--c2-key-value-editor__field--color=#18181b]
 * @cssproperty {color} [--c2-key-value-editor__field__placeholder--color=#71717a]
 * @cssproperty {font-family} [--c2-key-value-editor__field--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace] - Font of the key and value fields.
 * @cssproperty {font-size} [--c2-key-value-editor__field--font-size=13px]
 *
 * @cssproperty {color} [--c2-key-value-editor__error--color=#dc2626] - Text of the message under a refused key.
 * @cssproperty {font-size} [--c2-key-value-editor__error--font-size=12px]
 *
 * @cssproperty {pixel} [--c2-key-value-editor__button--size=32px] - Size of the remove button.
 * @cssproperty {pixel} [--c2-key-value-editor__button__icon--size=16px]
 * @cssproperty {border-radius} [--c2-key-value-editor__button--border-radius=6px]
 * @cssproperty {color} [--c2-key-value-editor__button--color=#71717a]
 * @cssproperty {color} [--c2-key-value-editor__button__hover--color=#18181b]
 * @cssproperty {color} [--c2-key-value-editor__button__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-key-value-editor__button__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the buttons.
 *
 * @cssproperty {color} [--c2-key-value-editor__add--color=rgb(2, 101, 220)] - Text of the add button.
 * @cssproperty {font-weight} [--c2-key-value-editor__add--font-weight=500]
 *
 * @cssproperty {color} [--c2-key-value-editor__hint--color=#71717a]
 * @cssproperty {font-size} [--c2-key-value-editor__hint--font-size=12px]
 *
 * @cssproperty {opacity} [--c2-key-value-editor__disabled--opacity=0.38]
 */
@customElement('c2-key-value-editor')
export class KeyValueEditor extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  // Data

  /** The rows, blank ones included. Set as JSON in the attribute or as an array; edits assign a new array. */
  @property({ converter: jsonPropertyConverter }) entries: KeyValueEntry[] = []

  /** Form field name. The rows are submitted under it as `.env` text. */
  @property({ type: String, reflect: true }) name = ''

  // Labels

  /** Accessible name of the whole editor, e.g. `Environment variables`. */
  @property({ type: String }) label = ''

  /** Header of the key column, and the start of each key field's accessible name (`Key 1`). */
  @property({ type: String, attribute: 'key-label' }) keyLabel = 'Key'

  /** Header of the value column, and the start of each value field's accessible name (`Value 1`). */
  @property({ type: String, attribute: 'value-label' }) valueLabel = 'Value'

  /** Placeholder of the key fields. */
  @property({ type: String, attribute: 'key-placeholder' }) keyPlaceholder = 'KEY'

  /** Placeholder of the value fields. */
  @property({ type: String, attribute: 'value-placeholder' }) valuePlaceholder = 'value'

  /** Text of the add button. */
  @property({ type: String, attribute: 'add-label' }) addLabel = 'Add another'

  /** Message under a key another row also has. */
  @property({ type: String, attribute: 'duplicate-message' }) duplicateMessage = 'This key is already used.'

  /** Message under a key that does not match `key-pattern`. */
  @property({ type: String, attribute: 'pattern-message' }) patternMessage = 'This key is not valid.'

  // Behaviour

  /** Hides every value behind a password field with a show/hide toggle. An entry's own `masked` wins for its row. */
  @property({ type: Boolean }) masked = false

  /** A regular expression (without slashes) the whole key must match, e.g. `[A-Z_][A-Z0-9_]*`. Checked on non-empty keys. */
  @property({ type: String, attribute: 'key-pattern' }) keyPattern = ''

  /** Makes the form invalid while no row has a key. */
  @property({ type: Boolean }) required = false

  /** Shows the rows without editing: no add, remove or paste. Masked values can still be revealed. */
  @property({ type: Boolean, attribute: 'readonly' }) readOnly = false

  /** Disables every field and button and dims the element. */
  @property({ type: Boolean }) disabled = false

  @state() private disabledByForm = false
  @state() private revealed = new Set<number>()

  /** Stable row identity across edits, so focus and reveal state follow a row when another is removed. */
  private readonly rowIds = new WeakMap<KeyValueEntry, number>()

  /** The row shown while `entries` is empty. */
  private readonly blankRow: KeyValueEntry = { key: '', value: '' }

  private defaultEntries: KeyValueEntry[] | null = null

  /** Whether a field changed since it took focus, so blur fires `change` only after an edit. */
  private fieldDirty = false

  /** The entries as `.env` text, rows without a key left out. */
  toEnv(): string {
    return formatEnv(this.entries)
  }

  /** Appends a row (blank by default) and focuses its key field, or its value field when the key is given. */
  async addEntry(entry: KeyValueEntry = { key: '', value: '' }): Promise<void> {
    const rows = this.realRows
    this.commitRows([...rows, { ...entry }])
    await this.updateComplete
    this.focusField(rows.length, entry.key ? 'value' : 'key')
  }

  /** The containing form, when this control is associated with one. */
  get form() {
    return this.internals.form
  }

  /** Labels associated with this form control. */
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

  formResetCallback() {
    this.entries = (this.defaultEntries ?? []).map((entry) => ({ ...entry }))
    this.revealed = new Set()
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.entries = parseEnv(state) ?? []
  }

  override focus(options?: FocusOptions): void {
    this.renderRoot.querySelector<HTMLInputElement>('input')?.focus(options)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.defaultEntries ??= this.entries.map((entry) => ({ ...entry }))
  }

  private get isDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get editable() {
    return !this.isDisabled && !this.readOnly
  }

  /** `entries`, ignoring anything that is not an object with a key, so a malformed attribute renders nothing broken. */
  private get realRows(): KeyValueEntry[] {
    return Array.isArray(this.entries) ? this.entries.filter((entry) => entry && typeof entry === 'object') : []
  }

  /** The rows on screen: the entries, or one blank row when there are none. */
  private get rows(): KeyValueEntry[] {
    const rows = this.realRows
    return rows.length ? rows : [this.blankRow]
  }

  private idOf(entry: KeyValueEntry): number {
    let id = this.rowIds.get(entry)
    if (id === undefined) {
      id = nextRowId++
      this.rowIds.set(entry, id)
    }
    return id
  }

  private isMasked(entry: KeyValueEntry) {
    return entry.masked ?? this.masked
  }

  private get keyRegExp(): RegExp | null {
    if (!this.keyPattern) return null
    try {
      return new RegExp(`^(?:${this.keyPattern})$`)
    } catch {
      return null
    }
  }

  /** The refusal of every row whose key is refused, by index. */
  private keyErrors(rows: readonly KeyValueEntry[]): Map<number, KeyValueKeyError> {
    const errors = new Map<number, KeyValueKeyError>()
    const pattern = this.keyRegExp
    const seen = new Map<string, number[]>()
    rows.forEach((entry, index) => {
      const key = String(entry.key ?? '').trim()
      if (!key) return
      if (pattern && !pattern.test(key)) errors.set(index, 'pattern')
      seen.set(key, [...(seen.get(key) ?? []), index])
    })
    for (const indexes of seen.values()) {
      if (indexes.length > 1) for (const index of indexes) errors.set(index, 'duplicate')
    }
    return errors
  }

  /** Replaces the rows and fires `input` then `change`, for edits that are complete as they happen. */
  private commitRows(rows: KeyValueEntry[]) {
    this.entries = rows
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  /** A copy of the row at `index` with `patch` applied, keeping its identity. */
  private patchRow(index: number, patch: Partial<KeyValueEntry>): KeyValueEntry[] {
    return this.rows.map((entry, at) => {
      if (at !== index) return entry
      const next = { ...entry, ...patch }
      this.rowIds.set(next, this.idOf(entry))
      return next
    })
  }

  private focusField(index: number, field: Field) {
    const row = this.renderRoot.querySelectorAll('.row')[index]
    const input = row?.querySelector<HTMLInputElement>(`input.${field}`)
    input?.focus()
    if (input && field === 'key') input.setSelectionRange(input.value.length, input.value.length)
  }

  private handleInput(event: Event, index: number, field: Field) {
    // The native `input` is composed and would reach the host's listeners before `entries` updates; the host fires its own.
    event.stopPropagation()
    this.fieldDirty = true
    this.entries = this.patchRow(index, { [field]: (event.target as HTMLInputElement).value })
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  }

  private handleChange = (event: Event) => {
    event.stopPropagation()
    if (!this.fieldDirty) return
    this.fieldDirty = false
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private handleFocusin = () => {
    this.fieldDirty = false
  }

  private async handleKeydown(event: KeyboardEvent, index: number, field: Field) {
    if (event.defaultPrevented || event.isComposing || !this.editable) return
    const input = event.target as HTMLInputElement
    if (event.key === 'Enter') {
      event.preventDefault()
      if (field === 'key') {
        this.focusField(index, 'value')
        return
      }
      if (index === this.rows.length - 1) {
        await this.addEntry()
        return
      }
      this.focusField(index + 1, 'key')
      return
    }
    if (event.key === 'Backspace' && field === 'key' && input.value === '' && input.selectionStart === 0) {
      const rows = this.realRows
      const entry = rows[index]
      if (rows.length < 2 || !entry || entry.value !== '') return
      event.preventDefault()
      this.fieldDirty = false
      this.commitRows(rows.filter((_, at) => at !== index))
      await this.updateComplete
      this.focusField(Math.max(0, index - 1), 'value')
    }
  }

  private async handlePaste(event: ClipboardEvent, index: number, field: Field) {
    if (!this.editable) return
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (!text.includes('=')) return
    const pasted = parseEnv(text)
    // A value may well contain `=`; only several `KEY=value` lines in a value field are read as a file.
    if (!pasted || pasted.length === 0 || (field === 'value' && pasted.length < 2)) return
    event.preventDefault()

    const rows = [...this.rows]
    const current = rows[index]
    const added: KeyValueEntry[] = []
    let lastIndex = -1
    for (const entry of pasted) {
      const existing = rows.findIndex((row, at) => at !== index && row.key.trim() === entry.key)
      if (existing !== -1) {
        const next = { ...rows[existing], value: entry.value }
        this.rowIds.set(next, this.idOf(rows[existing]))
        rows[existing] = next
        lastIndex = existing
      } else {
        added.push(entry)
      }
    }
    if (added.length) {
      const blank = current !== undefined && current.key.trim() === '' && current.value === ''
      rows.splice(blank ? index : index + 1, blank ? 1 : 0, ...added)
      lastIndex = (blank ? index : index + 1) + added.length - 1
    }
    this.fieldDirty = false
    this.commitRows(rows.filter((row) => row !== this.blankRow))
    await this.updateComplete
    if (lastIndex !== -1) this.focusField(Math.min(lastIndex, this.rows.length - 1), 'value')
  }

  private async handleRemove(index: number) {
    const rows = this.realRows
    const next = rows.filter((_, at) => at !== index)
    this.commitRows(next)
    await this.updateComplete
    if (next.length === 0) this.focusField(0, 'key')
    else this.focusField(Math.min(index, next.length - 1), 'key')
  }

  private handleAdd = () => {
    void this.addEntry()
  }

  private toggleReveal(id: number) {
    const revealed = new Set(this.revealed)
    if (revealed.has(id)) revealed.delete(id)
    else revealed.add(id)
    this.revealed = revealed
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    const rows = this.realRows
    const keyed = rows.some((entry) => String(entry.key ?? '').trim() !== '')
    const errors = this.keyErrors(rows)
    this.internals.setFormValue(this.isDisabled ? null : formatEnv(rows))

    const firstError = errors.entries().next().value
    if (this.isDisabled) {
      this.internals.setValidity({})
    } else if (firstError) {
      const [index, error] = firstError
      const anchor = this.renderRoot.querySelectorAll('.row')[index]?.querySelector<HTMLInputElement>('input.key') ?? undefined
      this.internals.setValidity({ customError: true }, error === 'duplicate' ? this.duplicateMessage : this.patternMessage, anchor)
    } else if (this.required && !keyed) {
      const anchor = this.renderRoot.querySelector<HTMLInputElement>('input.key') ?? undefined
      this.internals.setValidity({ valueMissing: true }, 'Please add at least one variable.', anchor)
    } else {
      this.internals.setValidity({})
    }

    const states: Record<string, boolean> = {
      empty: !keyed,
      invalid: errors.size > 0,
      'read-only': this.readOnly,
      disabled: this.isDisabled,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
  }

  private renderRow(entry: KeyValueEntry, index: number, error: KeyValueKeyError | undefined) {
    const id = this.idOf(entry)
    const number = index + 1
    const masked = this.isMasked(entry)
    const hidden = masked && !this.revealed.has(id)
    const errorId = `error-${id}`
    const key = String(entry.key ?? '')
    const value = String(entry.value ?? '')
    return html`<div class="row ${classMap({ invalid: error !== undefined, masked })}">
      <input
        class="key"
        type="text"
        aria-label="${this.keyLabel} ${number}"
        aria-invalid=${error ? 'true' : nothing}
        aria-describedby=${ifDefined(error ? errorId : undefined)}
        placeholder=${this.keyPlaceholder || nothing}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        ?disabled=${this.isDisabled}
        ?readonly=${this.readOnly}
        .value=${live(key)}
        @input=${(event: Event) => this.handleInput(event, index, 'key')}
        @change=${this.handleChange}
        @keydown=${(event: KeyboardEvent) => this.handleKeydown(event, index, 'key')}
        @paste=${(event: ClipboardEvent) => this.handlePaste(event, index, 'key')}
      />
      <span class="value-box">
        <input
          class="value"
          type=${hidden ? 'password' : 'text'}
          aria-label="${this.valueLabel} ${number}"
          placeholder=${this.valuePlaceholder || nothing}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          ?disabled=${this.isDisabled}
          ?readonly=${this.readOnly}
          .value=${live(value)}
          @input=${(event: Event) => this.handleInput(event, index, 'value')}
          @change=${this.handleChange}
          @keydown=${(event: KeyboardEvent) => this.handleKeydown(event, index, 'value')}
          @paste=${(event: ClipboardEvent) => this.handlePaste(event, index, 'value')}
        />
        ${
          masked
            ? html`<button
                class="button reveal"
                type="button"
                aria-label="${hidden ? 'Show' : 'Hide'} ${this.valueLabel.toLowerCase()} ${number}"
                aria-pressed=${hidden ? 'false' : 'true'}
                ?disabled=${this.isDisabled}
                @click=${() => this.toggleReveal(id)}
              >
                ${
                  hidden
                    ? html`<slot name="show-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </slot>`
                    : html`<slot name="hide-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path
                            d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                          ></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      </slot>`
                }
              </button>`
            : nothing
        }
      </span>
      ${
        this.readOnly
          ? nothing
          : html`<button
              class="button remove"
              type="button"
              aria-label=${key.trim() ? `Remove ${key.trim()}` : `Remove row ${number}`}
              ?disabled=${this.isDisabled}
              @click=${() => this.handleRemove(index)}
            >
              <slot name="remove-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </slot>
            </button>`
      }
      ${error ? html`<span class="error" id=${errorId}>${error === 'duplicate' ? this.duplicateMessage : this.patternMessage}</span>` : nothing}
    </div>`
  }

  override render() {
    const rows = this.rows
    const errors = this.keyErrors(this.realRows)
    return html`<div
      class="editor ${classMap({ 'read-only': this.readOnly })}"
      role="group"
      aria-label=${ifDefined(this.label || undefined)}
      @focusin=${this.handleFocusin}
    >
      <div class="header" aria-hidden="true">
        <span>${this.keyLabel}</span>
        <span>${this.valueLabel}</span>
      </div>
      <div class="rows">
        ${repeat(
          rows,
          (entry) => this.idOf(entry),
          (entry, index) => this.renderRow(entry, index, errors.get(index)),
        )}
      </div>
      <div class="footer">
        ${
          this.readOnly
            ? nothing
            : html`<button class="button add" type="button" ?disabled=${this.isDisabled} @click=${this.handleAdd}>
                <slot name="add-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </slot>
                <span>${this.addLabel}</span>
              </button>`
        }
        <slot name="actions"></slot>
      </div>
      <slot name="hint" class="hint"></slot>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-key-value-editor': KeyValueEditor
  }
}
