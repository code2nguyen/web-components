import { CSSResult, html, nothing, unsafeCSS } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import styles from './text-field-clear.scss?inline'

import { TextField } from './text-field'

@customElement('c2-text-field-clear')
export class TextFieldClear extends TextField {
  static override styles: CSSResult | CSSResult[] = [unsafeCSS(styles), TextField.styles as CSSResult]

  @state() showClear = false

  protected override handleInput(event: InputEvent) {
    super.handleInput(event);
    this.showClear = !!this.value
  }

  protected clearHandle = () => {
    this.value = ''
    this.showClear = false;
  }

  renderClearIcon() {
    return this.showClear
      ? html`<div class="clear-icon" @click=${this.clearHandle}>
          <slot name="clear-icon">
            <svg viewBox="0 0 24 24" class="default-clear-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
