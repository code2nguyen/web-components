import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './quick-time-menu.scss?inline'
/**
 * @tag c2-quick-time-menu
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-quick-time-menu')
export class QuickTimeMenu extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html` <div class="c2-quick-time-menu">${this.name}</div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-quick-time-menu': QuickTimeMenu
  }
}
