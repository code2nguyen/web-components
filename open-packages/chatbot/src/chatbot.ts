import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './chatbot.scss?inline'
import '@c2n/avatar'
/**
 * @tag c2-chatbot
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-chatbot')
export class Chatbot extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html`
      <div class="c2-chatbot">
        <section class="c2-chatbot__header-container">
          <c2-avatar name="Elisa Jasmin" initialCount="2"></c2-avatar>
          <div>Elisa Jasmin</div>
        </section>
        <section class="c2-chatbot__message-container"></section>
        <section class="c2-chatbot__input-container"></section>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chatbot': Chatbot
  }
}
