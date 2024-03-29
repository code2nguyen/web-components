import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './chat-message.scss?inline'
/**
 * @tag c2-chat-message
 *
 * @slot avatar
 * @slot title
 * @slot header-time
 * @slot message
 * @slot emotion
 * @slot footer-time
 *
 * @cssproperty {pixel} [--c2-chat-message--gap=16]
 * @cssproperty {font-size} [--c2-chat-message--font-size=14px]
 * @cssproperty {font-weight} --c2-chat-message--font-weight
 * @cssproperty {font-family} --c2-chat-message--font-family
 * @cssproperty {line-height} --c2-chat-message--line-height
 * @cssproperty {pixel} [--c2-chat-message__message--gap=4px]
 *
 * @cssproperty {border} --c2-chat-message__message--border-top
 * @cssproperty {border} --c2-chat-message__message--border-right
 * @cssproperty {border} --c2-chat-message__message--border-bottom
 * @cssproperty {border} --c2-chat-message__message--border-left
 *
 * @cssproperty {border-radius} --c2-chat-message__message--border-top-left-radius
 * @cssproperty {border-radius} --c2-chat-message__message--border-top-right-radius
 * @cssproperty {border-radius} --c2-chat-message__message--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-chat-message__message--border-bottom-right-radius
 *
 * @cssproperty {padding} --c2-chat-message__message--padding-top
 * @cssproperty {padding} --c2-chat-message__message--padding-right
 * @cssproperty {padding} --c2-chat-message__message--padding-bottom
 * @cssproperty {padding} --c2-chat-message__message--padding-left
 *
 * @cssproperty {color} --c2-chat-message__message--color
 * @cssproperty {background} --c2-chat-message__message--background
 *
 * @cssproperty {pixel} [--c2-chat-message__header--gap=8px]
 * @cssproperty {color} --c2-chat-message__header__title---color
 * @cssproperty {font-size} [--c2-chat-message__header__title---font-size=15px]
 * @cssproperty {font-weight} [--c2-chat-message__header__title---font-weight=600]
 * @cssproperty {font-style} --c2-chat-message__header__title---font-style
 *
 * @cssproperty {color} --c2-chat-message__time--color
 * @cssproperty {font-size} [--c2-chat-message__time--font-size=12px]
 * @cssproperty {font-weight} --c2-chat-message__time--font-weight
 * @cssproperty {font-style} --c2-chat-message__time--font-style
 *
 * @slotcomponent c2-avatar
 */
@customElement('c2-chat-message')
export class ChatMessage extends LitElement {
  @property() align: 'left' | 'right' = 'left'

  static override styles = unsafeCSS(styles)

  override render() {
    return html`
      <div class="c2-chat-message">
        <div class="c2-chat-message__avatar">
          <slot name="avatar"></slot>
        </div>
        <div class="c2-chat-message-container">
          <div class="c2-chat-message__header">
            <slot name="title"></slot>
            <slot name="header-time"></slot>
          </div>
          <div class="c2-chat-message__content">
            <slot name="message"></slot>
          </div>
          <div class="c2-chat-message__footer">
            <div class="c2-chat-message__emotion">
              <slot name="emotion"></slot>
            </div>
            <div class="c2-chat-message__footer-time">
              <slot name="footer-time"></slot>
            </div>
          </div>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chat-message': ChatMessage
  }
}
