import { CSSResult, LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './text-field.scss?inline'
import { classMap } from 'lit/directives/class-map.js'
import { live } from 'lit/directives/live.js'
import { addClasses } from '@c2n/core/css-helper.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'

export type TextFieldType = 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'number'

/** Events fired by {@link TextField}, keyed for `addEventListener`. */
export interface TextFieldEventMap {
  input: InputEvent
  change: Event
  clear: Event
}

export interface TextField {
  addEventListener: TypedAddEventListener<TextField, TextFieldEventMap>
  removeEventListener: TypedRemoveEventListener<TextField, TextFieldEventMap>
}

/**
 * A single-line input wrapped in a themeable field. The native `<input>` keeps its behaviour (`type`, `name`,
 * `autocomplete`, `maxlength`, `pattern`, `input`/`change` events); the field adds `prefix-icon` / `suffix-icon` slots
 * sized by `--c2-text-field__icon--size`, an optional clear button (`clearable`), helper text (`help`), an error
 * message (`error` + `error-text`), a character counter when `maxlength` is set, and a `help-icon` slot beside the
 * field. Pair it with `c2-label` for a caption. Give the host a `width`: the field fills it.
 *
 * @tag c2-text-field
 *
 * @slot prefix-icon - Icon (or short adornment text) at the start of the field: an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon`. Icons are sized by `--c2-text-field__icon--size`; an adornment keeps its own width.
 * @slot suffix-icon - Icon or adornment at the end of the field, after the clear button.
 * @slot clear-icon - Replaces the default cross of the clear button.
 * @slot help-icon - Icon shown beside the field, outside the border, e.g. a tooltip trigger.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are the plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched from the inner input on every keystroke; `value` is already updated.
 * @event {Event} change - Re-dispatched from the inner input when the value is committed (blur or Enter).
 * @event {Event} clear - Fired after the clear button emptied the field (an `input` and a `change` event follow).
 *
 * @cssproperty {pixel} [--c2-text-field--min-height=36px]
 * @cssproperty {pixel} [--c2-text-field--gap=8px] - Space between the icons and the text.
 *
 * @cssproperty {border-radius} [--c2-text-field--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-text-field--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-text-field--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-text-field--border-bottom-right-radius=6px]
 *
 * @cssproperty {padding} [--c2-text-field--padding-top=6px]
 * @cssproperty {padding} [--c2-text-field--padding-right=10px]
 * @cssproperty {padding} [--c2-text-field--padding-bottom=6px]
 * @cssproperty {padding} [--c2-text-field--padding-left=12px]
 *
 * @cssproperty {border} [--c2-text-field--border-top=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-text-field--border-right=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-text-field--border-bottom=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-text-field--border-left=1px solid #bcbcc6]
 *
 * @cssproperty {color} [--c2-text-field--color=#18181b]
 * @cssproperty {color} [--c2-text-field--background=#ffffff]
 *
 * @cssproperty {font-size} [--c2-text-field--font-size=14px]
 * @cssproperty {font-weight} --c2-text-field--font-weight
 * @cssproperty {font-style} --c2-text-field--font-style
 * @cssproperty {font-family} --c2-text-field--font-family
 * @cssproperty {pixel} [--c2-text-field--line-height=20px]
 *
 * @cssproperty {color} [--c2-text-field__placeholder--color=#71717a]
 * @cssproperty {opacity} [--c2-text-field__placeholder--opacity=1]
 * @cssproperty {font-weight} --c2-text-field__placeholder--font-weight
 * @cssproperty {font-style} --c2-text-field__placeholder--font-style
 *
 * @cssproperty {border} [--c2-text-field__hover--border-top=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-text-field__hover--border-right=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-text-field__hover--border-bottom=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-text-field__hover--border-left=1px solid #a1a1aa]
 *
 * @cssproperty {border} [--c2-text-field__focus--border-top=1px solid #476ef9]
 * @cssproperty {border} [--c2-text-field__focus--border-right=1px solid #476ef9]
 * @cssproperty {border} [--c2-text-field__focus--border-bottom=1px solid #476ef9]
 * @cssproperty {border} [--c2-text-field__focus--border-left=1px solid #476ef9]
 * @cssproperty {color} --c2-text-field__focus--color
 * @cssproperty {color} --c2-text-field__focus--background
 * @cssproperty {outline} [--c2-text-field__focus--outline=3px solid rgba(71, 110, 249, 0.2)]
 * @cssproperty {pixel} [--c2-text-field__focus--outline-offset=0px]
 *
 * @cssproperty {border} [--c2-text-field__error--border-top=1px solid #dc2626]
 * @cssproperty {border} [--c2-text-field__error--border-right=1px solid #dc2626]
 * @cssproperty {border} [--c2-text-field__error--border-bottom=1px solid #dc2626]
 * @cssproperty {border} [--c2-text-field__error--border-left=1px solid #dc2626]
 * @cssproperty {color} --c2-text-field__error--color
 * @cssproperty {color} --c2-text-field__error--background
 * @cssproperty {outline} [--c2-text-field__error__focus--outline=3px solid rgba(220, 38, 38, 0.2)]
 *
 * @cssproperty {border} [--c2-text-field__read-only--border-top=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-text-field__read-only--border-right=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-text-field__read-only--border-bottom=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-text-field__read-only--border-left=1px solid #e4e4e7]
 * @cssproperty {color} --c2-text-field__read-only--color
 * @cssproperty {color} [--c2-text-field__read-only--background=#fafafa]
 *
 * @cssproperty {opacity} [--c2-text-field__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-text-field__icon--size=16px]
 * @cssproperty {color} [--c2-text-field__icon--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-text-field__clear-icon--size=16px]
 * @cssproperty {color} [--c2-text-field__clear-icon--color=#a1a1aa]
 * @cssproperty {color} [--c2-text-field__clear-icon__hover--color=#18181b]
 *
 * @cssproperty {pixel} [--c2-text-field__help-icon--size=16px]
 * @cssproperty {color} [--c2-text-field__help-icon--color=#71717a]
 * @cssproperty {pixel} [--c2-text-field__help-icon--gap=8px] - Space between the field and the help icon.
 *
 * @cssproperty {pixel} [--c2-text-field__supporting-text--gap=4px] - Space between the field and the helper line.
 * @cssproperty {font-size} [--c2-text-field__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-text-field__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-text-field__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-text-field__supporting-text__error--color=#dc2626]
 */
@customElement('c2-text-field')
export class TextField extends LitElement {
  static formAssociated = true

  static override styles: CSSResult | CSSResult[] = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  @state() private disabledByForm = false

  // State

  /** Shows the value but refuses edits. Rendered on a light grey background. */
  @property({ type: Boolean, reflect: true }) readOnly = false

  /** Disables the input and dims the field. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Marks the field invalid: red border and, when set, `error-text` replaces the helper text. */
  @property({ type: Boolean, reflect: true }) error = false

  // Validation

  /** Maximum number of characters. Forwarded to the input and shown as a `n / max` counter under the field. */
  @property({ type: Number }) maxLength = -1

  /** Minimum number of characters, forwarded to the input. */
  @property({ type: Number }) minLength = -1

  /** Regular expression the value must match, forwarded to the input. */
  @property({ type: String }) pattern = ''

  /** Marks the input required (native validation). Pair with a `required` `c2-label` to show the indicator. */
  @property({ type: Boolean, reflect: true }) required = false

  // Data

  /** Input type: `text`, `email`, `password`, `search`, `tel`, `url` or `number`. */
  @property({ type: String }) type: TextFieldType = 'text'

  /** Form field name forwarded to the input. */
  @property({ type: String }) name = ''

  /** `autocomplete` hint forwarded to the input, e.g. `email` or `current-password`. */
  @property({ type: String }) autocomplete = ''

  /** Text shown while the field is empty. */
  @property({ type: String }) placeholder = ''

  /** Accessible name forwarded to the native input. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** The current text. Setting the attribute after the user has typed no longer updates it, like a native input. */
  @property({ type: String }) value = ''

  /** Message shown under the field while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''

  // Decoration

  /** Helper text shown under the field. */
  @property({ type: String }) help = ''

  /** Shows a clear button at the end of the field while it has a value. */
  @property({ type: Boolean, reflect: true }) clearable = false

  // Internal state
  @state() private dirty = false
  @state() private focused = false
  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])

  // Query
  @query('.input') private readonly input?: HTMLInputElement | null

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

  /** Restores the initial value (the `value` attribute) and clears the dirty and error flags. */
  reset() {
    this.dirty = false
    this.value = this.getAttribute('value') ?? ''
    this.error = false
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

  /** Checks all current constraints and fires `invalid` on this element when they fail. */
  checkValidity() {
    return this.internals.checkValidity()
  }

  /** Checks all current constraints and asks the browser to show validation feedback. */
  reportValidity() {
    return this.internals.reportValidity()
  }

  /** Sets or clears a custom validation error. */
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.input?.setCustomValidity(message)
    this.syncFormState()
  }

  handleFocus = () => {
    this.focus()
  }

  /** True once the user has typed in the field. */
  isDirty() {
    return this.dirty
  }

  override attributeChangedCallback(attribute: string, newValue: string | null, oldValue: string | null) {
    if (attribute === 'value' && this.dirty) {
      // After user input, changing the value attribute no longer updates the
      // text field's value (until reset). This matches native <input> behavior.
      return
    }

    super.attributeChangedCallback(attribute, newValue, oldValue)
  }

  override focus(options?: FocusOptions | undefined): void {
    this.input?.focus(options)
    this.focused = true
  }

  override blur(): void {
    this.input?.blur()
    this.focused = false
  }

  /** Selects the whole text. */
  select(): void {
    this.input?.select()
  }

  protected handleInput(event: InputEvent) {
    this.dirty = true
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }

  protected handleFocusin(event: Event) {
    this.focused = true
    redispatchEvent(this, event)
  }

  /** A click anywhere on the field (icons, padding) focuses the input. */
  protected forwardFocusin(event: Event) {
    if (event.defaultPrevented || event.target === this.input) return
    this.input?.focus()
  }

  protected handleFocusout(event: Event) {
    this.focused = false
    redispatchEvent(this, event)
  }

  protected handleClear = (event: Event) => {
    event.stopPropagation()
    if (!this.input) return
    this.input.value = ''
    this.value = ''
    this.dirty = true
    this.input.focus()
    this.dispatchEvent(new Event('clear', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  protected renderPrefixSlot() {
    return html`<slot name="prefix-icon"></slot>`
  }

  protected renderSuffixSlot() {
    return html`<slot name="suffix-icon"></slot>`
  }

  protected renderHelpIconSlot() {
    return html`<slot name="help-icon"></slot>`
  }

  protected renderClearButton() {
    if (!this.clearable || !this.value || this.effectiveDisabled || this.readOnly) return nothing
    return html`<button class="clear-button" type="button" aria-label="Clear" tabindex="-1" @click=${this.handleClear}>
      <slot name="clear-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </slot>
    </button>`
  }

  protected renderSupportingText() {
    const showError = this.error && !this.disabled && !!this.errorText
    const message = showError ? this.errorText : this.help
    const counter = this.maxLength > 0 ? `${this.value.length} / ${this.maxLength}` : ''
    if (!message && !counter && !this.slotPresence.has('supporting-text')) {
      return html`<slot name="supporting-text" hidden @slotchange=${this.slotPresence.handleSlotChange}></slot>`
    }
    return html`<div class="supporting-text ${classMap({ error: this.error && !this.disabled })}">
      <div class="supporting-text__message">
        <slot name="supporting-text" @slotchange=${this.slotPresence.handleSlotChange}>${message}</slot>
      </div>
      ${counter ? html`<span class="supporting-text__counter">${counter}</span>` : nothing}
    </div>`
  }

  private redispatchEvent(event: Event) {
    redispatchEvent(this, event)
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('disabled') || changed.has('error') || changed.has('readOnly') || changed.has('focused')) {
      addClasses(this, this.stateClasses)
    }
    this.syncFormState()
  }

  private syncFormState() {
    this.internals.setFormValue(this.value, this.value)
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

  private get stateClasses() {
    return {
      disabled: this.effectiveDisabled,
      error: !this.effectiveDisabled && this.error,
      'read-only': this.readOnly,
      'focus-within': this.focused,
    }
  }

  override render() {
    const classes = this.stateClasses
    return html`<div class="c2-text-field-row">
        <div class="c2-text-field ${classMap(classes)}" @click=${this.forwardFocusin}>
          ${this.renderPrefixSlot()}
          <input
            aria-label=${ifDefined(this.ariaLabel || undefined)}
            type=${this.type}
            class="input"
            name=${ifDefined(this.name || undefined)}
            autocomplete=${ifDefined(this.autocomplete || undefined)}
            maxlength=${ifDefined(this.maxLength > -1 ? this.maxLength : undefined)}
            minlength=${ifDefined(this.minLength > -1 ? this.minLength : undefined)}
            pattern=${ifDefined(this.pattern || undefined)}
            ?disabled=${this.effectiveDisabled}
            ?readonly=${this.readOnly}
            ?required=${this.required}
            aria-invalid=${this.error ? 'true' : nothing}
            placeholder=${this.placeholder || nothing}
            .value=${live(this.value)}
            @change=${this.redispatchEvent}
            @select=${this.redispatchEvent}
            @focusin=${this.handleFocusin}
            @focusout=${this.handleFocusout}
            @input=${this.handleInput}
          />
          ${this.renderClearButton()} ${this.renderSuffixSlot()}
        </div>
        ${this.renderHelpIconSlot()}
      </div>
      ${this.renderSupportingText()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-text-field': TextField
  }
}
