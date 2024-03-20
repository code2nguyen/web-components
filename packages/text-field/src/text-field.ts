import { CSSResult, LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import styles from './text-field.scss?inline'
import { classMap } from 'lit/directives/class-map.js'
import { live } from 'lit/directives/live.js'
import { addClasses } from '@c2n/wc-utils/css-helper.js'
import { redispatchEvent } from '@c2n/wc-utils/dom-helper.js'
/**
 * @tag c2-text-field
 *
 * @slot
 * @csspart
 */
@customElement('c2-text-field')
export class TextField extends LitElement {
  static override styles: CSSResult | CSSResult[] = unsafeCSS(styles)

  // State
  @property({ type: Boolean, reflect: true }) readOnly = false
  @property({ type: Boolean, reflect: true }) disabled = false
  @property({ type: Boolean, reflect: true }) error = false

  // Validation
  @property({ type: Number }) maxLength = -1
  @property({ type: Number }) minLength = -1
  @property({ type: String }) pattern = ''
  @property({ type: Boolean, reflect: true }) required = false

  // Data
  @property({ type: String }) placeholder = ''
  @property({ type: String }) value = ''
  @property({ attribute: 'error-text' }) errorText = ''

  // Decoration
  @property({ type: String }) help = ''

  // State
  @state() private dirty = false
  @state() private focused = false

  // Query
  @query('.input') private readonly input?: HTMLInputElement | null

  constructor() {
    super()
  }

  reset() {
    this.dirty = false
    this.value = this.getAttribute('value') ?? ''
    this.error = false
  }

  handleFocus = () => {
    this.focus()
  }

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
    super.focus(options)
    this.focused = true
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

  protected forwardFocusin(event: Event) {
    if (!event.defaultPrevented) this.input?.focus()
  }

  protected handleFocusout(event: Event) {
    this.focused = false
    redispatchEvent(this, event)
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

  protected renderSupportingTextSlot() {
    return html`<slot name="supporting-icon"></slot>`
  }

  private redispatchEvent(event: Event) {
    redispatchEvent(this, event)
  }

  override render() {
    const classes = {
      disabled: this.disabled,
      error: !this.disabled && this.error,
      'read-only': this.readOnly,
      'focus-within': this.focused,
    }
    addClasses(this, classes)
    return html`<div class="c2-text-field ${classMap(classes)}">
        <div class="prefix-icon" @click=${this.forwardFocusin}>${this.renderPrefixSlot()}</div>
        <input
          type="text"
          class="input"
          ?disabled=${this.disabled}
          ?readonly=${this.readOnly}
          ?required=${this.required}
          placeholder=${this.placeholder || nothing}
          .value=${live(this.value)}
          @change=${this.redispatchEvent}
          @select=${this.redispatchEvent}
          @focusin=${this.handleFocusin}
          @focusout=${this.handleFocusout}
          @input=${this.handleInput}
        />
        <div class="suffix-icon" @click=${this.forwardFocusin}>${this.renderSuffixSlot()}</div>
      </div>
      <div class="help-icon">${this.renderHelpIconSlot()}</div>
      <div class="supporting-text">${this.renderSupportingTextSlot()}</div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-text-field': TextField
  }
}
