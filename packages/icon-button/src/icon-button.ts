import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './icon-button.scss?inline'

import '@c2n/tooltip';

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
      <div class="c2-icon-button" data-tooltip=${this.dataset.tooltip}>
        <slot></slot>
        ${this.dataset.tooltip ? html`<c2-tooltip delay="800"></c2-tooltip>` : nothing}
      </div>
    `
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'c2-icon-button': IconButton
  }
}
