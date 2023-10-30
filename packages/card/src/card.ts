import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './card.scss?inline'
/**
 * Card component
 *
 * @slot
 * @csspart
 */
@customElement('c2-card')
export class Card extends LitElement {
  static override styles = unsafeCSS(styles)

  override render() {
    return html`
      <div class="c2-card">
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-card': Card
  }
}
