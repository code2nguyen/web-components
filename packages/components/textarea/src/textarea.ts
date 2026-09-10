import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import styles from './textarea.scss?inline'

/**
 * Multiline text input with native resizing, helper text, error feedback and a character counter.
 * @tag c2-textarea
 * @slot supporting-text - Rich helper content below the field; error-text takes precedence when invalid.
 * @event {InputEvent} input - Fired on each edit, after value is updated.
 * @event {Event} change - Fired when an edit is committed.
 * @event {Event} select - Fired when text is selected.
 * @cssproperty {pixel} [--c2-textarea__container--min-height=80px]
 * @cssproperty {padding} [--c2-textarea__container--padding=10px 12px]
 * @cssproperty {border} [--c2-textarea__container--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-textarea__container--border-radius=6px]
 * @cssproperty {color} [--c2-textarea__container--background=#ffffff]
 * @cssproperty {color} [--c2-textarea__container--color=#18181b]
 * @cssproperty {font-family} [--c2-textarea__container--font-family=inherit]
 * @cssproperty {font-size} [--c2-textarea__container--font-size=14px]
 * @cssproperty {pixel} [--c2-textarea__container--line-height=20px]
 * @cssproperty {border} [--c2-textarea__container__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-textarea__container__focus--border=1px solid #476ef9]
 * @cssproperty {outline} [--c2-textarea__container__focus--outline=3px solid rgba(71, 110, 249, 0.2)]
 * @cssproperty {border} [--c2-textarea__container__error--border=1px solid #dc2626]
 * @cssproperty {outline} [--c2-textarea__container__error__focus--outline=3px solid rgba(220, 38, 38, 0.2)]
 * @cssproperty {color} [--c2-textarea__container__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-textarea__container__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-textarea__placeholder--color=#71717a]
 * @cssproperty {pixel} [--c2-textarea__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-textarea__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-textarea__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-textarea__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-textarea__supporting-text__error--color=#dc2626]
 */
@customElement('c2-textarea')
export class Textarea extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Current text. Set this property to update the value programmatically. */
  @property() value = ''
  /** Name forwarded to the native control. */
  @property() name = ''
  /** Accessible name for the native textarea. */
  @property() label = ''
  /** Accessible name forwarded from the host. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null
  /** Hint shown when empty. */
  @property() placeholder = ''
  /** Visible number of text lines. */
  @property({ type: Number }) rows = 3
  /** Native width hint, used when no CSS width is set. */
  @property({ type: Number }) cols = 20
  /** Allowed user resize directions. */
  @property({ reflect: true }) resize: 'none' | 'vertical' | 'horizontal' | 'both' = 'vertical'
  /** Native line wrapping mode. */
  @property() wrap: 'soft' | 'hard' | 'off' = 'soft'
  /** Browser autocomplete hint. */
  @property() autocomplete = ''
  /** Prevents editing and removes the control from keyboard navigation. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Prevents editing while allowing selection. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Requires a nonempty value for native validation. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Maximum character count; -1 means unlimited. */
  @property({ type: Number }) maxLength = -1
  /** Minimum character count; -1 means no minimum. */
  @property({ type: Number }) minLength = -1
  /** Displays the error border and error text. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Message displayed when error is true. */
  @property({ attribute: 'error-text' }) errorText = ''
  /** Helper text below the control. */
  @property() help = ''

  @state() private dirty = false
  @state() private hasSupportingSlot = false
  @query('textarea') private input?: HTMLTextAreaElement

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
  /** Selects all text. */
  select() {
    this.input?.select()
  }
  /** Selects a range of text using native UTF-16 character offsets. */
  setSelectionRange(start: number, end: number, direction?: 'forward' | 'backward' | 'none') {
    this.input?.setSelectionRange(start, end, direction)
  }
  /** Whether the user has edited the value since the last reset. */
  isDirty() {
    return this.dirty
  }
  /** Restores the value attribute and clears the error state. */
  reset() {
    this.dirty = false
    this.value = this.getAttribute('value') ?? ''
    this.error = false
  }
  /** Checks the native textarea constraints. Await updateComplete after changing properties. */
  checkValidity() {
    return this.input?.checkValidity() ?? true
  }
  /** Shows the browser's validation feedback. */
  reportValidity() {
    return this.input?.reportValidity() ?? true
  }
  /** Sets or clears the native validation message. */
  setCustomValidity(message: string) {
    this.input?.setCustomValidity(message)
  }

  private handleInput(event: Event) {
    this.dirty = true
    this.value = (event.target as HTMLTextAreaElement).value
    redispatchEvent(this, event)
  }
  private handleChange(event: Event) {
    this.value = (event.target as HTMLTextAreaElement).value
    redispatchEvent(this, event)
  }
  private handleSelect(event: Event) {
    redispatchEvent(this, event)
  }
  private handleSlotChange(event: Event) {
    this.hasSupportingSlot = (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).length > 0
  }

  override render() {
    const invalid = this.error && !this.disabled
    const showError = invalid && !!this.errorText
    const supporting = !!this.help || this.hasSupportingSlot || showError || this.maxLength >= 0
    return html` <textarea
        part="textarea"
        name=${ifDefined(this.name || undefined)}
        aria-label=${ifDefined(this.label || this.ariaLabel || undefined)}
        aria-describedby=${supporting ? 'supporting-text' : nothing}
        aria-invalid=${invalid ? 'true' : nothing}
        placeholder=${this.placeholder}
        rows=${this.rows > 0 ? this.rows : 3}
        cols=${this.cols > 0 ? this.cols : 20}
        wrap=${this.wrap}
        autocomplete=${ifDefined(this.autocomplete || undefined)}
        maxlength=${ifDefined(this.maxLength >= 0 ? this.maxLength : undefined)}
        minlength=${ifDefined(this.minLength >= 0 ? this.minLength : undefined)}
        ?disabled=${this.disabled}
        ?readonly=${this.readOnly}
        ?required=${this.required}
        .value=${live(this.value)}
        @input=${this.handleInput}
        @change=${this.handleChange}
        @select=${this.handleSelect}
      ></textarea>
      <div id="supporting-text" part="supporting-text" class="supporting-text" ?hidden=${!supporting}>
        <span class="message">
          <slot name="supporting-text" ?hidden=${showError} @slotchange=${this.handleSlotChange}>${this.help}</slot>
          ${showError ? html`<span role="alert">${this.errorText}</span>` : nothing}
        </span>
        ${this.maxLength >= 0 ? html`<span class="counter">${this.value.length} / ${this.maxLength}</span>` : nothing}
      </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-textarea': Textarea
  }
}
