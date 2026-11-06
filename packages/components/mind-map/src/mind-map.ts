import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './mind-map.scss?inline'
/**
 * @tag c2-mind-map
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-mind-map')
export class MindMap extends LitElement {

  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html`
      <div class="c2-mind-map">
        ${this.name}
      </div>
    `
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'c2-mind-map': MindMap
  }
}
