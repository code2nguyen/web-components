import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './inline-edit.scss?inline'

/** How the read view enters edit mode: a single click, a double click, or only through {@link InlineEdit.edit}. */
export type InlineEditActivation = 'click' | 'dblclick' | 'none'

/** What losing focus does while editing: keep the draft, throw it away, or stay in edit mode. */
export type InlineEditBlurAction = 'commit' | 'cancel' | 'none'

export interface InlineEditCommitEventDetail {
  /** The value about to be committed. */
  value: string
  /** The value before this edit. */
  previousValue: string
}

/** Events fired by {@link InlineEdit}, keyed for `addEventListener`. */
export interface InlineEditEventMap {
  'edit-start': Event
  'edit-commit': CustomEvent<InlineEditCommitEventDetail>
  'edit-cancel': Event
  input: Event
  change: Event
}

export interface InlineEdit {
  addEventListener: TypedAddEventListener<InlineEdit, InlineEditEventMap>
  removeEventListener: TypedRemoveEventListener<InlineEdit, InlineEditEventMap>
}

/** A control slotted as `editor`: anything with a `value` (`c2-select`, `c2-number-input`, a native `<select>`, …). */
type EditorElement = HTMLElement & { value?: unknown }

/**
 * Text that turns into a field when clicked: the edit-in-place pattern of Notion titles, Airtable cells and Linear
 * issue fields. The read view is a button showing the value (or the `placeholder`), with a pencil on hover. Clicking it,
 * or pressing Enter or Space on it, swaps in an input with the text selected. **Enter** commits, **Escape** cancels and
 * focus returns to the read view; with `multiline` the editor is a textarea and **Ctrl/⌘+Enter** commits. Leaving the
 * field commits by default (`blur-action`), and `controls` adds save and cancel buttons.
 *
 * Any control can replace the built-in input through the `editor` slot: put a `c2-select`, a `c2-number-input` or a
 * native `<select>` there. Its `value` is set from the inline edit when editing starts, its `change` event commits,
 * and the read view shows the label of the option whose `value` matches (or `formatValue`). A slotted control's own
 * `input` and `change` events stay inside the inline edit; the host fires its own once the value is committed.
 *
 * `value` always holds the committed value. Each commit that changes it fires `edit-commit` first, which is
 * cancelable: call `preventDefault()` to reject the draft and keep the editor open (validation, a failed save).
 * Then `value` updates and `input` and `change` fire. The element is form-associated: `name` submits the committed
 * value and `required` refuses to commit an empty one.
 *
 * The host exposes its state as custom states: `:state(editing)`, `:state(empty)`, `:state(invalid)`,
 * `:state(read-only)` and `:state(disabled)`. Give the host a `width` (or `display: block`) to make the read view
 * and the field fill a cell; otherwise it sizes to its text.
 *
 * @tag c2-inline-edit
 *
 * @slot editor - A control used instead of the built-in input while editing. It must expose `value` and fire `change` when a choice is made, and carry its own accessible name (`aria-label`): `label` names only the built-in field and the read view. It gets `aria-invalid` while a `required` draft is refused.
 * @slot preview - Content shown in the read view instead of the value text, e.g. a badge. Update it yourself on `change`.
 * @slot edit-icon - Replaces the pencil shown next to the value on hover and focus.
 * @slot save-icon - Replaces the check mark of the save button (`controls`).
 * @slot cancel-icon - Replaces the cross of the cancel button (`controls`).
 *
 * @event {Event} edit-start - Fired before the editor opens. Cancelable: `preventDefault()` keeps the read view.
 * @event {CustomEvent<InlineEditCommitEventDetail>} edit-commit - Fired when a changed draft is committed, before `value` updates. Cancelable: `preventDefault()` keeps the editor open with the draft.
 * @event {Event} edit-cancel - Fired when editing ends without committing (Escape, the cancel button, or blur with `blur-action="cancel"`).
 * @event {Event} input - Fired after a commit changed `value`.
 * @event {Event} change - Fired after a commit changed `value`, right after `input`.
 *
 * @cssproperty {pixel} [--c2-inline-edit--min-width=48px] - Smallest width of the read view and the field, so an empty value stays clickable.
 * @cssproperty {padding} [--c2-inline-edit--padding-block=2px]
 * @cssproperty {padding} [--c2-inline-edit--padding-inline=6px]
 * @cssproperty {border-radius} [--c2-inline-edit--border-radius=6px]
 * @cssproperty {color} --c2-inline-edit--color - Text colour. Inherited from the page when unset.
 * @cssproperty {font-size} --c2-inline-edit--font-size - Inherited from the page when unset, so the element fits a heading or a table cell.
 * @cssproperty {font-weight} --c2-inline-edit--font-weight
 * @cssproperty {font-family} --c2-inline-edit--font-family
 * @cssproperty {pixel} --c2-inline-edit--line-height
 *
 * @cssproperty {color} [--c2-inline-edit__placeholder--color=#71717a]
 * @cssproperty {color} [--c2-inline-edit__hover--background=#f4f4f5] - Read view background under the pointer.
 * @cssproperty {outline} [--c2-inline-edit__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the read view and the buttons.
 *
 * @cssproperty {pixel} [--c2-inline-edit__edit-icon--size=14px]
 * @cssproperty {color} [--c2-inline-edit__edit-icon--color=#71717a]
 * @cssproperty {pixel} [--c2-inline-edit__edit-icon--gap=6px] - Space between the value and the pencil.
 * @cssproperty {opacity} [--c2-inline-edit__edit-icon--opacity=0] - Pencil opacity at rest. Set `1` to always show it.
 * @cssproperty {opacity} [--c2-inline-edit__edit-icon__hover--opacity=1] - Pencil opacity on hover and keyboard focus.
 *
 * @cssproperty {color} [--c2-inline-edit__editor--background=#ffffff]
 * @cssproperty {border} [--c2-inline-edit__editor--border=1px solid #0265dc]
 * @cssproperty {border} [--c2-inline-edit__editor__error--border=1px solid #dc2626] - Field border while the draft is refused (`required` and empty); drawn as an outline around a slotted `editor`.
 *
 * @cssproperty {pixel} [--c2-inline-edit__controls--gap=4px] - Space between the field and the save and cancel buttons.
 * @cssproperty {pixel} [--c2-inline-edit__control--size=24px]
 * @cssproperty {pixel} [--c2-inline-edit__control__icon--size=16px]
 * @cssproperty {border-radius} [--c2-inline-edit__control--border-radius=4px]
 * @cssproperty {color} [--c2-inline-edit__control--color=#71717a]
 * @cssproperty {color} [--c2-inline-edit__control__hover--color=#18181b]
 * @cssproperty {color} [--c2-inline-edit__control__hover--background=#f4f4f5]
 *
 * @cssproperty {opacity} [--c2-inline-edit__disabled--opacity=0.38]
 */
@customElement('c2-inline-edit')
export class InlineEdit extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  // Data

  /** The committed value. Typing only changes the draft; `value` updates when the draft is committed. */
  @property({ type: String }) value = ''

  /** Text shown in the read view and the field while the value is empty. */
  @property({ type: String }) placeholder = ''

  /** Accessible name of the built-in field and of the read view, e.g. `Project name`. A slotted `editor` needs its own. */
  @property({ type: String }) label = ''

  /** Form field name. The committed value is submitted under it. */
  @property({ type: String, reflect: true }) name = ''

  /**
   * Turns the value into the read view's text, e.g. a currency or a date. Without it, the read view shows the label
   * of the matching option in a slotted `editor`, or else the value itself.
   */
  @property({ attribute: false }) formatValue?: (value: string) => string

  // Behaviour

  /** Edits in a textarea: Enter adds a line, Ctrl/⌘+Enter commits, and the read view keeps line breaks. */
  @property({ type: Boolean }) multiline = false

  /** What enters edit mode from the read view: `click` (default), `dblclick`, or `none` (only `edit()`). Enter and Space always work in `click` and `dblclick`. */
  @property({ type: String }) activation: InlineEditActivation = 'click'

  /** What leaving the field does: `commit` (default; a refused draft stays open with its text), `cancel`, or `none` (stay in edit mode). */
  @property({ type: String, attribute: 'blur-action' }) blurAction: InlineEditBlurAction = 'commit'

  /** Shows save and cancel buttons next to the field while editing. */
  @property({ type: Boolean }) controls = false

  /** Selects the whole text when the built-in field opens. Set `select-on-edit="false"` to put the caret at the end. */
  @property({ type: Boolean, attribute: 'select-on-edit' }) selectOnEdit = true

  // Validation

  /** Refuses to commit an empty draft: the field stays open and is marked invalid. */
  @property({ type: Boolean }) required = false

  /** Maximum number of characters, forwarded to the built-in field. */
  @property({ type: Number, attribute: 'maxlength' }) maxLength = -1

  // State

  /** Shows the value without the edit affordance. */
  @property({ type: Boolean, attribute: 'readonly' }) readOnly = false

  /** Disables editing and dims the element. */
  @property({ type: Boolean }) disabled = false

  /** Whether the editor is open. Settable: `true` opens it with the committed value, `false` closes it without committing. No events fire. */
  @property({ type: Boolean }) editing = false

  @state() private draft = ''
  @state() private invalid = false
  @state() private disabledByForm = false
  @state() private hasEditor = false

  @query('.field') private readonly field?: HTMLInputElement | HTMLTextAreaElement | null
  @query('.display') private readonly display?: HTMLElement | null

  /** The slotted editor this element marked `aria-invalid`, so the mark can be removed again. */
  private markedEditor: HTMLElement | null = null

  /** The value as it stood when the element was created or last reset by its form. */
  private defaultValue: string | null = null

  constructor() {
    super()
    if (!isServer) this.addEventListener('focusout', this.handleFocusout)
  }

  /** The text being edited. Equal to `value` outside edit mode. */
  get draftValue(): string {
    return this.editing ? this.readDraft() : this.value
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
    this.editing = false
    this.invalid = false
    this.value = this.defaultValue ?? this.getAttribute('value') ?? ''
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  /** Opens the editor with the current value. Does nothing while disabled or read-only. */
  edit(): boolean {
    if (this.editing) return true
    if (!this.interactive) return false
    if (!this.dispatchEvent(new Event('edit-start', { bubbles: true, composed: true, cancelable: true }))) return false
    this.openEditor()
    return true
  }

  /**
   * Commits the draft. Returns `false` when it was refused (`required` and empty, or `edit-commit` was canceled), in
   * which case the editor stays open.
   */
  commit(): boolean {
    if (!this.editing) return true
    const next = this.readDraft()
    if (this.required && next.trim() === '') {
      this.invalid = true
      return false
    }
    const previous = this.value
    if (next !== previous) {
      const detail: InlineEditCommitEventDetail = { value: next, previousValue: previous }
      const accepted = this.dispatchEvent(new CustomEvent('edit-commit', { detail, bubbles: true, composed: true, cancelable: true }))
      if (!accepted) return false
    }
    this.closeEditor()
    if (next !== previous) {
      this.value = next
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
    return true
  }

  /** Closes the editor and throws the draft away. */
  cancel(): void {
    if (!this.editing) return
    this.closeEditor()
    this.dispatchEvent(new Event('edit-cancel', { bubbles: true, composed: true }))
  }

  override focus(options?: FocusOptions): void {
    if (this.editing) this.editorTarget?.focus(options)
    else this.display?.focus(options)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // A value assigned as a property before connection counts as the authored one when there is no attribute.
    this.defaultValue ??= this.getAttribute('value') ?? this.value
    this.syncSlots()
  }

  private get interactive() {
    return !this.disabled && !this.disabledByForm && !this.readOnly
  }

  private get slottedEditor(): EditorElement | null {
    // The server has no light DOM to read: it renders the plain value, and the client picks the label up on hydration.
    if (isServer) return null
    return this.querySelector<EditorElement>(':scope > [slot="editor"]')
  }

  private get editorTarget(): HTMLElement | null | undefined {
    return this.hasEditor ? this.slottedEditor : this.field
  }

  /** Whether focus should come back to the read view after the editor closes. */
  private get focusInside() {
    const active = this.shadowRoot?.activeElement ?? null
    return active !== null || this.contains(document.activeElement)
  }

  private openEditor() {
    this.editing = true
  }

  private closeEditor() {
    const refocus = this.focusInside
    this.editing = false
    this.invalid = false
    if (refocus) this.updateComplete.then(() => this.display?.focus())
  }

  private readDraft(): string {
    if (!this.hasEditor) return this.draft
    const raw = this.slottedEditor?.value
    if (Array.isArray(raw)) return raw.join(';')
    return raw === undefined || raw === null ? '' : String(raw)
  }

  private writeEditorValue(editor: EditorElement) {
    const current = editor.value
    if (Array.isArray(current)) editor.value = this.value ? this.value.split(';') : []
    else if (typeof current === 'number') editor.value = this.value === '' ? Number.NaN : Number(this.value)
    else editor.value = this.value
  }

  private syncSlots() {
    this.hasEditor = this.slottedEditor !== null
  }

  /** The text the read view shows for the committed value. */
  private get displayText(): string {
    if (this.value === '') return ''
    if (this.formatValue) return this.formatValue(this.value)
    const editor = this.slottedEditor
    if (editor) {
      for (const option of editor.querySelectorAll<HTMLElement & { value?: unknown }>('[value], option')) {
        const optionValue = option.getAttribute('value') ?? String(option.value ?? '')
        if (optionValue === this.value) {
          // `label` is the short text a `c2-list-item` gives its select; read from the light DOM, never from an option's render.
          const text = option.getAttribute('label') || option.textContent || ''
          if (text.trim()) return text.trim()
        }
      }
    }
    return this.value
  }

  private handleDisplayClick = (event: MouseEvent) => {
    // `detail` is 0 for a click synthesized by Enter or Space, which opens the editor in every activation mode.
    if (this.activation === 'click' || event.detail === 0) this.edit()
  }

  private handleDisplayDblclick = () => {
    if (this.activation === 'dblclick') this.edit()
  }

  private handleFieldInput = (event: Event) => {
    // The native `input` is composed and would leave the shadow root as the host's own; the host fires `input` on commit.
    event.stopPropagation()
    this.draft = (event.target as HTMLInputElement).value
    if (this.invalid && this.draft.trim() !== '') this.invalid = false
  }

  private stopEvent = (event: Event) => {
    event.stopPropagation()
  }

  private handleEditorChange = (event: Event) => {
    event.stopPropagation()
    if (this.editing) this.commit()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (!this.editing || event.defaultPrevented || event.isComposing) return
    if (event.key === 'Escape') {
      // A popup inside a slotted control (the `c2-select` menu) closes on Escape first.
      if (event.composedPath().some((node) => node instanceof Element && node !== this && node.matches(':popover-open'))) return
      event.preventDefault()
      this.cancel()
      return
    }
    if (event.key !== 'Enter' || this.hasEditor) return
    if (this.multiline && !(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    this.commit()
  }

  private handleFocusout = (event: FocusEvent) => {
    if (!this.editing || this.blurAction === 'none') return
    // The read view losing focus as the editor replaces it is not the user leaving.
    if (event.composedPath()[0] === this.display) return
    const next = event.relatedTarget as Node | null
    if (next && (this.contains(next) || this.shadowRoot?.contains(next))) return
    if (this.blurAction === 'cancel') {
      this.cancel()
      return
    }
    // A refused draft (`required` and empty, or a canceled `edit-commit`) stays open with its text, without taking
    // focus back: the user returns to fix it, or presses Escape.
    this.commit()
  }

  /** Keeps focus in the field while a control button is pressed, so blur does not commit first. */
  private keepFocus = (event: Event) => {
    event.preventDefault()
  }

  private handleSave = () => {
    this.commit()
  }

  private handleCancel = () => {
    this.cancel()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // Disabling, making read-only or disabling the fieldset closes an open editor without committing.
    if (this.editing && !this.interactive) this.editing = false
    if (changed.has('editing') && this.editing && !changed.get('editing')) {
      // Every way into edit mode (`edit()`, a click, the property) starts from the committed value.
      this.draft = this.value
      this.invalid = false
    }
  }

  protected override updated(changed: PropertyValues): void {
    this.internals.setFormValue(this.value)
    if (this.required && this.value.trim() === '') {
      this.internals.setValidity({ valueMissing: true }, 'Please fill in this field.', this.display ?? undefined)
    } else {
      this.internals.setValidity({})
    }

    const editor = this.hasEditor ? this.slottedEditor : null
    if (editor && (changed.has('invalid') || changed.has('editing'))) {
      // The slotted control is the field the user is on, so it carries the refusal; only a mark this element set is removed.
      if (this.invalid && this.editing) {
        if (!editor.hasAttribute('aria-invalid')) {
          editor.setAttribute('aria-invalid', 'true')
          this.markedEditor = editor
        }
      } else if (this.markedEditor) {
        this.markedEditor.removeAttribute('aria-invalid')
        this.markedEditor = null
      }
    }

    const states: Record<string, boolean> = {
      editing: this.editing,
      empty: this.value === '',
      invalid: this.invalid,
      'read-only': this.readOnly,
      disabled: this.disabled || this.disabledByForm,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }

    if (changed.has('editing') && this.editing && changed.get('editing') !== undefined) {
      const editor = this.hasEditor ? this.slottedEditor : null
      if (editor) {
        this.writeEditorValue(editor)
        Promise.resolve((editor as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete).then(() => editor.focus())
        return
      }
      const field = this.field
      if (!field) return
      field.focus()
      if (this.selectOnEdit) field.select()
      else field.setSelectionRange(field.value.length, field.value.length)
    }
  }

  private renderDisplay() {
    const text = this.displayText
    const content = html`<span class="text ${classMap({ placeholder: !text })}"
      ><slot name="preview" @slotchange=${this.syncSlots}>${text || this.placeholder}</slot></span
    >`
    const disabled = this.disabled || this.disabledByForm
    if (this.readOnly || this.activation === 'none') {
      return html`<span class="display static" aria-label=${ifDefined(this.label ? `${this.label}: ${text || this.placeholder}` : undefined)}>${content}</span>`
    }
    return html`<button
      class="display"
      type="button"
      ?disabled=${disabled}
      aria-label=${ifDefined(this.label ? `${this.label}: ${text || this.placeholder}` : undefined)}
      @click=${this.handleDisplayClick}
      @dblclick=${this.handleDisplayDblclick}
    >
      ${content}
      <span class="edit-icon" aria-hidden="true">
        <slot name="edit-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </slot>
      </span>
    </button>`
  }

  private renderField() {
    const maxLength = this.maxLength > -1 ? this.maxLength : undefined
    if (this.multiline) {
      return html`<textarea
        class="field"
        rows="1"
        aria-label=${ifDefined(this.label || undefined)}
        aria-invalid=${this.invalid ? 'true' : nothing}
        maxlength=${ifDefined(maxLength)}
        placeholder=${this.placeholder || nothing}
        ?required=${this.required}
        .value=${live(this.draft)}
        @input=${this.handleFieldInput}
        @change=${this.stopEvent}
      ></textarea>`
    }
    return html`<input
      class="field"
      type="text"
      aria-label=${ifDefined(this.label || undefined)}
      aria-invalid=${this.invalid ? 'true' : nothing}
      maxlength=${ifDefined(maxLength)}
      placeholder=${this.placeholder || nothing}
      ?required=${this.required}
      .value=${live(this.draft)}
      @input=${this.handleFieldInput}
      @change=${this.stopEvent}
    />`
  }

  private renderControls() {
    if (!this.controls) return nothing
    return html`<span class="controls">
      <button class="control save" type="button" aria-label="Save" @pointerdown=${this.keepFocus} @click=${this.handleSave}>
        <slot name="save-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </slot>
      </button>
      <button class="control cancel" type="button" aria-label="Cancel" @pointerdown=${this.keepFocus} @click=${this.handleCancel}>
        <slot name="cancel-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </slot>
      </button>
    </span>`
  }

  override render() {
    const editorSlot = html`<slot name="editor" @slotchange=${this.syncSlots} @input=${this.stopEvent} @change=${this.handleEditorChange}></slot>`
    if (!this.editing) {
      // The slot stays rendered (hidden) so `slotchange` keeps `hasEditor` current and option labels stay readable.
      return html`${this.renderDisplay()}<span class="editor-host" hidden>${editorSlot}</span>`
    }
    return html`<span class="editor ${classMap({ invalid: this.invalid, multiline: this.multiline })}" @keydown=${this.handleKeydown}>
      <span class="editor-host ${classMap({ custom: this.hasEditor })}">${this.hasEditor ? editorSlot : this.renderField()}</span>
      ${this.renderControls()}
    </span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-inline-edit': InlineEdit
  }
}
