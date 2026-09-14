import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './chatbot.scss?inline'
import '@c2n/avatar'
/**
 * Minimal chatbot shell that greets a named user and renders application-provided conversation content.
 *
 * @tag c2-chatbot
 *
 * @slot default - Conversation content rendered inside the chatbot shell.
 */
@customElement('c2-chatbot')
export class Chatbot extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Name included in the chatbot greeting. */
  @property({ type: String }) name = 'Example property'

  override render() {
    return html`
      <div class="c2-chatbot">
        <section class="c2-chatbot__header-container">
          <c2-avatar name="Elisa Jasmin" initial-count="2"></c2-avatar>
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
