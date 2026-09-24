import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './chatbot.scss?inline'
import '@c2n/avatar'
/**
 * Minimal chatbot shell that greets a named user and renders application-provided conversation content.
 *
 * @tag c2-chatbot
 *
 * @slot - Conversation content rendered inside the chatbot shell.
 *
 * @csspart messages - Always-present conversation container around the default slot; controls assigned-content placement, has no fallback, and does not style inside assigned nodes.
 *
 * @cssproperty {border-radius} [--c2-chatbot--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-chatbot--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-chatbot--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-chatbot--border-bottom-right-radius=8px]
 * @cssproperty {border} [--c2-chatbot--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-chatbot--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-chatbot--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-chatbot--border-left=1px solid rgb(177, 177, 177)]
 * @cssproperty {padding} [--c2-chatbot__header--padding=16px]
 * @cssproperty {color} [--c2-chatbot__header--background=rgb(248, 248, 248)]
 * @cssproperty {border} [--c2-chatbot__header--border-bottom=1px solid rgb(177, 177, 177)]
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
        <section class="c2-chatbot__message-container" part="messages"><slot></slot></section>
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
