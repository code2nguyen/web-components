import { CSSResult, html, nothing, unsafeCSS } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import styles from './text-field-clear.scss?inline'

import { TextField } from './text-field'

/**
 * A `c2-text-field` that always shows a clear button while it has a value. Prefer `c2-text-field` with the
 * `clearable` attribute; this element remains for markup that cannot toggle attributes. Inherits every attribute,
 * slot, event and CSS variable of `c2-text-field`.
 *
 * @tag c2-text-field-clear
 *
 * @slot clear-icon - Replaces the default cross icon.
 *
 * @cssproperty {pixel} [--c2-text-field-clear__clear-icon--size=24px]
 * @cssproperty {color} [--c2-text-field-clear__clear-icon--color=rgb(70, 70, 70)]
 */
@customElement('c2-text-field-clear')
export class TextFieldClear extends TextField {
  static override styles: CSSResult | CSSResult[] = [unsafeCSS(styles), TextField.styles as CSSResult]

  @state() showClear = false

  protected override handleInput(event: InputEvent) {
    super.handleInput(event)
    this.showClear = !!this.value
  }

  protected clearHandle = () => {
    this.value = ''
    this.showClear = false
  }

  renderClearIcon() {
    return this.showClear
      ? html`<div class="clear-icon" @click=${this.clearHandle}>
          <slot name="clear-icon">
            <svg
              viewBox="0 0 24 24"
              class="default-clear-icon"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </slot>
        </div>`
      : nothing
  }

  protected override renderSuffixSlot() {
    return html`${this.renderClearIcon()} ${super.renderSuffixSlot()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-text-field-clear': TextFieldClear
  }
}
