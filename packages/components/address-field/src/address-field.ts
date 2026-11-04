import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './address-field.scss?inline'
/**
 * @tag c2-address-field
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-address-field')
export class AddressField extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html` <div class="c2-address-field">${this.name}</div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-address-field': AddressField
  }
}
