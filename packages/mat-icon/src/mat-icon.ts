import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './mat-icon.scss?inline'
/**
 * MatIcon component
 *
 * @slot 
 * @csspart 
 */
@customElement('c2-mat-icon')
export class MatIcon extends LitElement {

  static override styles = unsafeCSS(styles)

  override render() {
    return html`<slot></slot>`
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'c2-mat-icon': MatIcon
  }
}
