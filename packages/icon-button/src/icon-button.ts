import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './icon-button.scss?inline'
/**
 * IconButton component
 *
 * @slot 
 * @csspart 
 */
@customElement('c2-icon-button')
export class IconButton extends LitElement {

  static override styles = unsafeCSS(styles)


  override render() {
    return html`
      <div class="c2-icon-button">
        <slot></slot>
      </div>
    `
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'c2-icon-button': IconButton
  }
}
