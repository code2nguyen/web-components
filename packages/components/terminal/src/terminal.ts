import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './terminal.scss?inline'
/**
 * @tag c2-terminal
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-terminal')
export class Terminal extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html` <div class="c2-terminal">${this.name}</div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-terminal': Terminal
  }
}
