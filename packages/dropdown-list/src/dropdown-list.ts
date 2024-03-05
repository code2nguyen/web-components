import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { arrayPropertyConverter } from '@c2n/wc-utils/lit-helper.js'

import styles from './dropdown-list.scss?inline'
/**
 * @tag c2-dropdown-list
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-dropdown-list')
export class DropdownList extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ converter: arrayPropertyConverter, reflect: true }) value: string[] = []

  data: unknown[] = []

  private handleInputClick() {}

  private handleSelectionChange() {}

  protected renderInputSlot() {
    return html`<slot name="input"> </slot>`
  }

  override render() {
    return html`
      <div class="c2-dropdown-list">
        <div class="input-container" popovertarget="single-select-menu" @click=${this.handleInputClick}>${this.renderInputSlot()}</div>
        <div class="menu-container" id="single-select-menu" @selection-change=${this.handleSelectionChange}>
          <slot></slot>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-dropdown-list': DropdownList
  }
}
