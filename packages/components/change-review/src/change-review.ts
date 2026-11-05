import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './change-review.scss?inline'
/**
 * @tag c2-change-review
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-change-review')
export class ChangeReview extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html` <div class="c2-change-review">${this.name}</div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-change-review': ChangeReview
  }
}
