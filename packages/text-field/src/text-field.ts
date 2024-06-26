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
 * @cssproperty {border-radius} [--c2-text-field--border-top-left-radius=4px]
 * @cssproperty {border-radius} [--c2-text-field--border-top-right-radius=4px]
 * @cssproperty {border-radius} [--c2-text-field--border-bottom-left-radius=4px]
 * @cssproperty {border-radius} [--c2-text-field--border-bottom-right-radius=4px]
 *
 * @cssproperty {padding} [--c2-text-field--padding-top=8px]
 * @cssproperty {padding} [--c2-text-field--padding-right=8px]
 * @cssproperty {padding} [--c2-text-field--padding-bottom=8px]
 * @cssproperty {padding} [--c2-text-field--padding-left=8px]
 *
 * @cssproperty {border} [--c2-text-field--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-text-field--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-text-field--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-text-field--border-left=1px solid rgb(177, 177, 177)]
 *
 * @cssproperty {color} --c2-text-field--color
 * @cssproperty {background} [--c2-text-field--background=field]
 *
 * @cssproperty {font-size} --c2-text-field--font-size
 * @cssproperty {font-weight} --c2-text-field--font-weight
 * @cssproperty {font-style} --c2-text-field--font-style
 * @cssproperty {font-family} --c2-text-field--font-family
 *
 * @cssproperty {opacity} [--c2-text-field__placeholder--opacity=0.5]
 * @cssproperty {font-weight} --c2-text-field__placeholder--font-weight
 * @cssproperty {font-style} --c2-text-field__placeholder--font-style
 * @cssproperty {color} --c2-text-field__placeholder--color
 *
 * @cssproperty {border} [--c2-text-field__focus--border-top=1px solid rgb(2, 101, 220)]
 * @cssproperty {border} [--c2-text-field__focus--border-right=1px solid rgb(2, 101, 220)]
 * @cssproperty {border} [--c2-text-field__focus--border-bottom=1px solid rgb(2, 101, 220)]
 * @cssproperty {border} [--c2-text-field__focus--border-left=1px solid rgb(2, 101, 220)]
 *
 * @cssproperty {color} --c2-text-field__focus--color
 * @cssproperty {background} --c2-text-field__focus--background
 *
 * @cssproperty {border} [--c2-text-field__error--border-top=1px solid rgb(211, 21, 16)]
 * @cssproperty {border} [--c2-text-field__error--border-right=1px solid rgb(211, 21, 16)]
 * @cssproperty {border} [--c2-text-field__error--border-bottom=1px solid rgb(211, 21, 16)]
 * @cssproperty {border} [--c2-text-field__error--border-left=1px solid rgb(211, 21, 16)]
 *
 * @cssproperty {color} [--c2-text-field__error--color=rgb(211, 21, 16)]
 * @cssproperty {background} --c2-text-field__error--background
 *
 * @cssproperty {border} [--c2-text-field__read-only--border-top=unset]
 * @cssproperty {border} [--c2-text-field__read-only--border-right=unset]
 * @cssproperty {border} [--c2-text-field__read-only--border-bottom=unset]
 * @cssproperty {border} [--c2-text-field__read-only--border-left=unset]
 *
 * @cssproperty {color} --c2-text-field__read-only--color
 * @cssproperty {background} [--c2-text-field__read-only--background=transparent]
 *
 *
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
    this.input?.focus(options)
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
