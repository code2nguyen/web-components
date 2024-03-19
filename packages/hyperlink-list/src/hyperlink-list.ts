import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './hyperlink-list.scss?inline'
/**
 * @tag c2-hyperlink-list
 *
 * @cssproperty {pixel} [--c2-hyperlink-list__item--gap=0px]
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
