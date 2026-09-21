import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import styles from './chat-message.scss?inline'

export type ChatMessageAlign = 'left' | 'right'

/**
 * Flexible message row for conversations, assistant answers and activity updates.
 *
 * @tag c2-chat-message
 *
 * @slot - Main message body. Prefer this slot for new usage.
 * @slot avatar - Sender avatar shown beside the message.
 * @slot title - Sender name or message heading.
 * @slot header-time - Timestamp displayed beside the title.
 * @slot message - Named main message body, retained for compatibility.
 * @slot emotion - Reactions or sentiment controls below the message.
 * @slot footer-time - Timestamp displayed below the message.
 *
 * @csspart base - The complete message row.
 * @csspart avatar - Component-owned region wrapping the assigned `avatar` slot.
 * @csspart body - Component-owned column wrapping the default slot between the header and footer.
 * @csspart header - Title and header timestamp row.
 * @csspart content - Main message content.
 * @csspart footer - Reactions and footer timestamp row.
 * @csspart actions - Reaction/action region.
 *
 * @cssproperty {pixel} [--c2-chat-message--gap=12px]
 * @cssproperty {font-size} [--c2-chat-message--font-size=14px]
 * @cssproperty {font-weight} [--c2-chat-message--font-weight=400]
 * @cssproperty {font-family} [--c2-chat-message--font-family=inherit]
 * @cssproperty {line-height} [--c2-chat-message--line-height=1.55]
 * @cssproperty {pixel} [--c2-chat-message__avatar--margin-top=2px]
 * @cssproperty {pixel} [--c2-chat-message__message--gap=6px]
 * @cssproperty {length} [--c2-chat-message__message--max-width=44rem]
 *
 * @cssproperty {border} [--c2-chat-message__message--border-top=0 solid transparent]
 * @cssproperty {border} [--c2-chat-message__message--border-right=0 solid transparent]
 * @cssproperty {border} [--c2-chat-message__message--border-bottom=0 solid transparent]
 * @cssproperty {border} [--c2-chat-message__message--border-left=0 solid transparent]
 *
 * @cssproperty {border-radius} [--c2-chat-message__message--border-top-left-radius=0]
 * @cssproperty {border-radius} [--c2-chat-message__message--border-top-right-radius=0]
 * @cssproperty {border-radius} [--c2-chat-message__message--border-bottom-left-radius=0]
 * @cssproperty {border-radius} [--c2-chat-message__message--border-bottom-right-radius=0]
 *
 * @cssproperty {padding} [--c2-chat-message__message--padding-top=0]
 * @cssproperty {padding} [--c2-chat-message__message--padding-right=0]
 * @cssproperty {padding} [--c2-chat-message__message--padding-bottom=0]
 * @cssproperty {padding} [--c2-chat-message__message--padding-left=0]
 *
 * @cssproperty {color} [--c2-chat-message__message--color=#27272a]
 * @cssproperty {background} [--c2-chat-message__message--background=transparent]
 *
 * @cssproperty {pixel} [--c2-chat-message__header--gap=8px]
 * @cssproperty {color} [--c2-chat-message__header__title--color=#18181b]
 * @cssproperty {font-size} [--c2-chat-message__header__title--font-size=13px]
 * @cssproperty {font-weight} [--c2-chat-message__header__title--font-weight=600]
 * @cssproperty {font-style} [--c2-chat-message__header__title--font-style=normal]
 *
 * @cssproperty {color} [--c2-chat-message__time--color=#71717a]
 * @cssproperty {font-size} [--c2-chat-message__time--font-size=12px]
 * @cssproperty {font-weight} [--c2-chat-message__time--font-weight=400]
 * @cssproperty {font-style} [--c2-chat-message__time--font-style=normal]
 * @cssproperty {pixel} [--c2-chat-message__footer--gap=8px]
 *
 * @slotcomponent c2-avatar
 */
@customElement('c2-chat-message')
export class ChatMessage extends LitElement {
  /** Places the avatar and message on the left or right side of the row. */
  @property({ reflect: true }) align: ChatMessageAlign = 'left'

  private readonly slotPresence = new SlotPresenceController(this, ['title', 'header-time', 'emotion', 'footer-time'])

  static override styles = unsafeCSS(styles)

  override render() {
    return html`
      <article class="c2-chat-message" part="base">
        <div class="c2-chat-message__avatar" part="avatar"><slot name="avatar"></slot></div>
        <div class="c2-chat-message__body" part="body">
          <header class="c2-chat-message__header" part="header" ?hidden=${!this.slotPresence.has('title') && !this.slotPresence.has('header-time')}>
            <slot name="title" @slotchange=${this.slotPresence.handleSlotChange}></slot>
            <slot name="header-time" @slotchange=${this.slotPresence.handleSlotChange}></slot>
          </header>
          <div class="c2-chat-message__content" part="content"><slot name="message"></slot><slot></slot></div>
          <footer class="c2-chat-message__footer" part="footer" ?hidden=${!this.slotPresence.has('emotion') && !this.slotPresence.has('footer-time')}>
            <div class="c2-chat-message__emotion" part="actions"><slot name="emotion" @slotchange=${this.slotPresence.handleSlotChange}></slot></div>
            <div class="c2-chat-message__footer-time"><slot name="footer-time" @slotchange=${this.slotPresence.handleSlotChange}></slot></div>
          </footer>
        </div>
      </article>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chat-message': ChatMessage
  }
}
