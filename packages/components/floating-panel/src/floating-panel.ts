import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './floating-panel.scss?inline'
/**
 * @tag c2-floating-panel
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-floating-panel')
export class FloatingPanel extends LitElement {

  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html`
      <div class="c2-floating-panel">
        ${this.name}
      </div>
    `
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'c2-floating-panel': FloatingPanel
  }
}
