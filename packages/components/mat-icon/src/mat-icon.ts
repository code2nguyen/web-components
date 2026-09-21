import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './mat-icon.scss?inline'
/**
 * Renders a Material Symbols ligature supplied as consumer-owned text.
 *
 * @tag c2-mat-icon
 * @slot - Material Symbols ligature text; style the assigned text through the host's inherited typography.
 *
 * @cssproperty {font-size} [--c2-mat-icon--font-size=24px]
 * @cssproperty {font-weight} [--c2-mat-icon--font-weight=400]
 * @cssproperty {color} --c2-mat-icon--color
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
