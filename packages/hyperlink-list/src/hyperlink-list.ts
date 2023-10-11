import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './hyperlink-list.scss?inline'
/**
 * HyperlinkList component
 *
 * @slot
 * @csspart
 */
@customElement('c2-hyperlink-list')
export class HyperlinkList extends LitElement {
  static override styles = unsafeCSS(styles)

  override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-hyperlink-list': HyperlinkList
  }
}
