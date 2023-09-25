import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './text-button.scss?inline'
/**
 * TextButton component
 *
 * @slot 
 * @csspart 
 */
@customElement('c2-text-button')
export class TextButton extends LitElement {

  static override styles = unsafeCSS(styles)

  override render() {
    return html`
      <div class="c2-text-button">
        <slot></slot>
      </div>
    `
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'c2-text-button': TextButton
  }
}
