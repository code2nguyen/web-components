import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './quantity-picker.scss?inline'
/**
 * @tag c2-quantity-picker
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-quantity-picker')
export class QuantityPicker extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html` <div class="c2-quantity-picker">${this.name}</div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-quantity-picker': QuantityPicker
  }
}
