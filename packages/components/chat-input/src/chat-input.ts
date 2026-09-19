import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import styles from './chat-input.scss?inline'

/** Events fired by {@link ChatInput}, keyed for `addEventListener`. */
export interface ChatInputEventMap {
  input: InputEvent
  change: Event
  select: Event
  'submit-message': CustomEvent<string>
}

export interface ChatInput {
  addEventListener: TypedAddEventListener<ChatInput, ChatInputEventMap>
  removeEventListener: TypedRemoveEventListener<ChatInput, ChatInputEventMap>
}

/**
 * Auto-growing message composer with slotted actions and an accessible send button.
 *
 * @tag c2-chat-input
 * @slot toolbar - Actions displayed before the send button, such as attachment or voice controls.
 * @slot send-icon - Icon displayed inside the send button.
 * @event {InputEvent} input - Fired on each edit, after `value` is updated.
 * @event {Event} change - Fired when an edit is committed.
 * @event {Event} select - Fired when text is selected.
 * @event {CustomEvent<string>} submit-message - Fired with the current message. Cancel the event to keep the value in the composer.
 * @cssproperty {border} [--c2-chat-input__container--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-chat-input__container--border-radius=16px]
 * @cssproperty {color} [--c2-chat-input__container--background=#ffffff]
 * @cssproperty {color} [--c2-chat-input__container--color=#18181b]
 * @cssproperty {padding} [--c2-chat-input__container--padding=10px]
 * @cssproperty {pixel} [--c2-chat-input__container--gap=8px]
 * @cssproperty {border} [--c2-chat-input__container__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-chat-input__container__focus--border=1px solid #476ef9]
 * @cssproperty {box-shadow} [--c2-chat-input__container__focus--box-shadow=0 0 0 3px rgba(71, 110, 249, 0.2)]
 * @cssproperty {border} [--c2-chat-input__container__invalid--border=1px solid #dc2626]
 * @cssproperty {box-shadow} [--c2-chat-input__container__invalid__focus--box-shadow=0 0 0 3px rgba(220, 38, 38, 0.2)]
 * @cssproperty {opacity} [--c2-chat-input__container__disabled--opacity=0.5]
 * @cssproperty {pixel} [--c2-chat-input__textarea--max-height=192px]
 * @cssproperty {padding} [--c2-chat-input__textarea--padding=2px]
 * @cssproperty {font-family} [--c2-chat-input__textarea--font-family=inherit]
 * @cssproperty {font-size} [--c2-chat-input__textarea--font-size=14px]
 * @cssproperty {pixel} [--c2-chat-input__textarea--line-height=22px]
 * @cssproperty {color} [--c2-chat-input__textarea--caret-color=currentColor]
 * @cssproperty {color} [--c2-chat-input__placeholder--color=#71717a]
 * @cssproperty {pixel} [--c2-chat-input__actions--gap=6px]
 * @cssproperty {pixel} [--c2-chat-input__send-button--size=32px]
 * @cssproperty {border-radius} [--c2-chat-input__send-button--border-radius=10px]
 * @cssproperty {color} [--c2-chat-input__send-button--background=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-chat-input__send-button--color=#ffffff]
 * @cssproperty {color} [--c2-chat-input__send-button__hover--background=rgb(1, 84, 184)]
 * @cssproperty {color} [--c2-chat-input__send-button__active--background=rgb(1, 70, 154)]
 * @cssproperty {outline} [--c2-chat-input__send-button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {opacity} [--c2-chat-input__send-button__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-chat-input__send-icon--size=18px]
 */
@customElement('c2-chat-input')
export class ChatInput extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)
  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''

  /** Hint shown while the composer is empty. */
  @property() placeholder = ''
  /** Current message text. Set this property to update the composer programmatically. */
  @property() value = ''
  /** Name used when the composer participates in a form. */
  @property() name = ''
  /** Disables editing, sending, and form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Requires a nonempty message for form validation. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Maximum message length; -1 means unlimited. */
  @property({ type: Number }) maxLength = -1
  /** Minimum message length; -1 means no minimum. */
  @property({ type: Number }) minLength = -1
  /** Minimum number of visible text rows before the composer grows. */
  @property({ type: Number, attribute: 'min-rows' }) minRows = 1
  /** Controls whether unmodified Enter submits or inserts a newline. */
  @property({ attribute: 'enter-behavior' }) enterBehavior: 'submit' | 'newline' = 'submit'
  /** Accessible name forwarded to the inner textarea. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null
  /** Accessible name for the send button. */
  @property({ attribute: 'send-label' }) sendLabel = 'Send message'

  @state() private dirty = false
  @state() private disabledByForm = false
  @query('textarea') private input?: HTMLTextAreaElement
  private resizeFrame = 0

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

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (name === 'value' && this.dirty) return
    super.attributeChangedCallback(name, oldValue, newValue)
  }

  /** Focuses the native textarea. */
  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }
  override blur() {
    this.input?.blur()
  }
  /** Selects all message text. */
  select() {
    this.input?.select()
  }
  /** Selects a range using native UTF-16 character offsets. */
  setSelectionRange(start: number, end: number, direction?: 'forward' | 'backward' | 'none') {
    this.input?.setSelectionRange(start, end, direction)
  }
  /** Whether the user has edited the value since the last reset. */
  isDirty() {
    return this.dirty
  }
  /** Restores the initial `value` attribute and clears the dirty state. */
  reset() {
    this.dirty = false
    this.value = this.getAttribute('value') ?? ''
  }
  formResetCallback() {
    this.reset()
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }
  /** Checks the native textarea constraints. Await `updateComplete` after changing properties. */
  checkValidity() {
    return this.internals.checkValidity()
  }
  /** Shows the browser's native validation feedback. */
  reportValidity() {
    return this.internals.reportValidity()
  }
  /** Sets or clears the native validation message. */
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.input?.setCustomValidity(message)
    this.syncFormState()
    this.requestUpdate()
  }

  protected override updated(changed: PropertyValues<this>) {
    this.syncFormState()
    if (changed.has('value') || changed.has('minRows')) this.scheduleInputHeightUpdate()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    cancelAnimationFrame(this.resizeFrame)
  }

  private syncFormState() {
    this.internals.setFormValue(this.effectiveDisabled ? null : this.value, this.value)
    if (!this.input || this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    this.input.setCustomValidity(this.customValidityMessage)
    this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input)
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get canSubmit() {
    const lengthIsValid = (this.minLength < 0 || this.value.length >= this.minLength) && (this.maxLength < 0 || this.value.length <= this.maxLength)
    return !this.effectiveDisabled && !!this.value.trim() && !this.customValidityMessage && lengthIsValid && (this.input?.validity.valid ?? true)
  }

  private handleInput(event: InputEvent) {
    this.dirty = true
    this.value = (event.target as HTMLTextAreaElement).value
    this.updateInputHeight()
    redispatchEvent(this, event)
  }

  private handleChange(event: Event) {
    redispatchEvent(this, event)
  }

  private handleSelect(event: Event) {
    redispatchEvent(this, event)
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return
    if (event.altKey) {
      event.preventDefault()
      const input = this.input
      if (!input) return
      input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end')
      input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: '\n', inputType: 'insertLineBreak' }))
      return
    }
    if (this.enterBehavior !== 'submit' || event.shiftKey) return
    event.preventDefault()
    void this.submitMessage()
  }

  private async submitMessage() {
    if (!this.canSubmit) return
    const accepted = this.dispatchEvent(
      new CustomEvent('submit-message', {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: this.value,
      }),
    )
    if (!accepted) return

    this.dirty = true
    this.value = ''
    await this.updateComplete
    this.updateInputHeight()
    this.focus()
  }

  private updateInputHeight() {
    if (!this.input) return
    this.input.style.height = 'auto'
    const height = this.input.scrollHeight
    if (height > 0) this.input.style.height = `${height}px`
  }

  private scheduleInputHeightUpdate() {
    cancelAnimationFrame(this.resizeFrame)
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0
      this.updateInputHeight()
    })
  }

  override render() {
    return html`
      <div class="container" part="container">
        <textarea
          class="textarea"
          part="textarea"
          name=${ifDefined(this.name || undefined)}
          aria-label=${ifDefined(this.ariaLabel || undefined)}
          .value=${live(this.value)}
          placeholder=${this.placeholder}
          rows=${Math.max(1, this.minRows)}
          autocomplete="off"
          enterkeyhint=${this.enterBehavior === 'submit' ? 'send' : 'enter'}
          maxlength=${ifDefined(this.maxLength >= 0 ? this.maxLength : undefined)}
          minlength=${ifDefined(this.minLength >= 0 ? this.minLength : undefined)}
          ?disabled=${this.effectiveDisabled}
          ?required=${this.required}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @select=${this.handleSelect}
          @keydown=${this.handleKeydown}
        ></textarea>
        <div class="actions" part="actions">
          <div class="toolbar" part="toolbar">
            <slot name="toolbar"></slot>
          </div>
          <button
            class="send-button"
            part="send-button"
            type="button"
            aria-label=${this.sendLabel}
            title=${this.sendLabel}
            ?disabled=${!this.canSubmit}
            @click=${this.submitMessage}
          >
            <slot name="send-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m22 2-7 20-4-9-9-4Z"></path>
                <path d="M22 2 11 13"></path>
              </svg>
            </slot>
          </button>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chat-input': ChatInput
  }
}
