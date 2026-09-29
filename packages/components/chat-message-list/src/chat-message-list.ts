import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { hasSlottedContent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './chat-message-list.scss?inline'

/** Distance from the bottom, in pixels, that still counts as reading the latest message. */
const BOTTOM_THRESHOLD = 24
/** Distance from the top, in pixels, at which `load-older` is requested. */
const TOP_THRESHOLD = 64

/** Events fired by {@link ChatMessageList}, keyed for `addEventListener`. */
export interface ChatMessageListEventMap {
  'load-older': CustomEvent<void>
  'at-bottom-change': CustomEvent<boolean>
}

export interface ChatMessageList {
  addEventListener: TypedAddEventListener<ChatMessageList, ChatMessageListEventMap>
  removeEventListener: TypedRemoveEventListener<ChatMessageList, ChatMessageListEventMap>
}

/**
 * Scrolling conversation log that keeps the latest message in view, offers a jump back to it with an unread count,
 * and requests older history when the reader scrolls to the top. Compose it with `c2-chat-message` rows and a
 * `c2-chat-input` to build a chat room or chatbot.
 *
 * Give the element a height (or place it in a flex column); it scrolls its own content.
 *
 * @tag c2-chat-message-list
 *
 * @slot - Conversation rows, usually `c2-chat-message` elements. Any element counts as one message.
 * @slot start - Content above the first message, such as a "Load earlier messages" button or a conversation intro.
 * @slot loading - Indicator shown above the messages while `loading` is set.
 * @slot empty - Content shown while the list has no messages.
 * @slot jump-icon - Icon inside the jump-to-latest button.
 *
 * @event {CustomEvent<void>} load-older - Fired once when the reader scrolls near the top while `has-more` is set and `loading` is not. Does not bubble.
 * @event {CustomEvent<boolean>} at-bottom-change - Fired when the list starts or stops following the latest message; `detail` is `true` at the bottom. Does not bubble.
 *
 * @csspart scroller - The focusable scrolling `log` region.
 * @csspart content - Column wrapping the start slot, the loading indicator, the default slot of messages and the empty region; sets their spacing and does not style inside assigned messages.
 * @csspart loading - Region wrapping the `loading` slot and its text fallback.
 * @csspart empty - Region wrapping the `empty` slot, shown only while no messages are assigned.
 * @csspart jump-button - Floating button that scrolls to the latest message.
 * @csspart badge - Unread message count inside the jump button.
 *
 * @cssproperty {color} [--c2-chat-message-list--background=transparent]
 * @cssproperty {outline} [--c2-chat-message-list__scroller__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {scrollbar-width} [--c2-chat-message-list__scrollbar--width=thin] - `scrollbar-width` of the log: `thin`, `auto` or `none`.
 * @cssproperty {pixel} [--c2-chat-message-list__scrollbar--size=8px] - Scrollbar thickness in browsers without `scrollbar-color` (Safari before 26).
 * @cssproperty {color} [--c2-chat-message-list__scrollbar__track--color=transparent]
 * @cssproperty {color} [--c2-chat-message-list__scrollbar__thumb--color=color-mix(in srgb, currentColor 22%, transparent)]
 * @cssproperty {color} [--c2-chat-message-list__scrollbar__thumb__hover--color=color-mix(in srgb, currentColor 40%, transparent)]
 * @cssproperty {padding} [--c2-chat-message-list__content--padding=16px]
 * @cssproperty {pixel} [--c2-chat-message-list__content--gap=16px]
 * @cssproperty {margin} [--c2-chat-message-list__content--margin-top=auto]
 * @cssproperty {color} [--c2-chat-message-list__loading--color=#71717a]
 * @cssproperty {font-size} [--c2-chat-message-list__loading--font-size=12px]
 * @cssproperty {color} [--c2-chat-message-list__empty--color=#71717a]
 * @cssproperty {font-size} [--c2-chat-message-list__empty--font-size=14px]
 * @cssproperty {pixel} [--c2-chat-message-list__jump-button--size=32px]
 * @cssproperty {pixel} [--c2-chat-message-list__jump-button--bottom=16px]
 * @cssproperty {border} [--c2-chat-message-list__jump-button--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-chat-message-list__jump-button--border-radius=999px]
 * @cssproperty {color} [--c2-chat-message-list__jump-button--background=#ffffff]
 * @cssproperty {color} [--c2-chat-message-list__jump-button--color=#18181b]
 * @cssproperty {box-shadow} [--c2-chat-message-list__jump-button--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {color} [--c2-chat-message-list__jump-button__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-chat-message-list__jump-button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-chat-message-list__jump-icon--size=18px]
 * @cssproperty {color} [--c2-chat-message-list__badge--background=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-chat-message-list__badge--color=#ffffff]
 * @cssproperty {font-size} [--c2-chat-message-list__badge--font-size=12px]
 * @cssproperty {font-weight} [--c2-chat-message-list__badge--font-weight=600]
 *
 * @slotcomponent c2-chat-message
 */
@customElement('c2-chat-message-list')
export class ChatMessageList extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Accessible name of the conversation log. */
  @property() label = 'Conversation'
  /** Whether older messages can be requested; enables the `load-older` event. */
  @property({ type: Boolean, reflect: true, attribute: 'has-more' }) hasMore = false
  /** Shows the `loading` slot, marks the log busy and holds back further `load-older` events. */
  @property({ type: Boolean, reflect: true }) loading = false
  /** Accessible name of the jump-to-latest button. */
  @property({ attribute: 'jump-label' }) jumpLabel = 'Jump to latest message'

  /** Whether the list follows new messages, i.e. the reader is at the bottom. */
  @state() private following = true
  @state() private unread = 0
  @state() private empty = true

  @query('.c2-chat-message-list__scroller') private scroller?: HTMLElement
  @query('.c2-chat-message-list__content') private content?: HTMLElement

  private resizeObserver?: ResizeObserver
  private lastScrollTop = 0
  private lastScrollHeight = 0
  private firstMessage: Element | null = null
  private lastMessage: Element | null = null
  private prependPending = false
  private loadRequested = false

  /** Whether the list is at the bottom and follows new messages. */
  get atBottom() {
    return this.following
  }

  /** Number of messages appended since the reader scrolled away from the bottom. */
  get unreadCount() {
    return this.unread
  }

  /** Scrolls to the latest message and follows new ones again. */
  scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const scroller = this.scroller
    if (!scroller) return
    this.setFollowing(true)
    scroller.scrollTo({ top: scroller.scrollHeight, behavior })
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.hasUpdated) this.observe()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (!this.hasUpdated) this.empty = !hasSlottedContent(this)
    if (changed.has('loading') && this.hasUpdated) {
      if (!this.loading) this.loadRequested = false
      // The indicator sits above the messages; showing or hiding it must not move them.
      this.expectPrepend()
    }
  }

  protected override firstUpdated() {
    this.observe()
    this.scrollToBottom()
  }

  private observe() {
    if (typeof ResizeObserver === 'undefined' || this.resizeObserver || !this.scroller || !this.content) return
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(this.scroller)
    this.resizeObserver.observe(this.content)
  }

  private handleResize() {
    const scroller = this.scroller
    if (!scroller) return
    if (this.following) {
      scroller.scrollTop = scroller.scrollHeight
    } else if (this.prependPending) {
      // Older messages were inserted above the viewport: keep the messages being read in place.
      scroller.scrollTop = this.lastScrollTop + scroller.scrollHeight - this.lastScrollHeight
    }
    this.prependPending = false
    this.lastScrollTop = scroller.scrollTop
    this.lastScrollHeight = scroller.scrollHeight
  }

  private handleScroll() {
    const scroller = this.scroller
    if (!scroller) return
    const { scrollTop, scrollHeight, clientHeight } = scroller
    const atBottom = scrollHeight - scrollTop - clientHeight <= BOTTOM_THRESHOLD
    const movedUp = scrollTop < this.lastScrollTop
    // Content growth or a smooth scroll towards the bottom never unpins the list, only the reader scrolling up.
    this.setFollowing(atBottom || (this.following && !movedUp))

    if (scrollTop > TOP_THRESHOLD) {
      this.loadRequested = false
    } else if (movedUp && this.hasMore && !this.loading && !this.loadRequested) {
      this.loadRequested = true
      this.dispatchEvent(new CustomEvent('load-older'))
    }
    this.lastScrollTop = scrollTop
    this.lastScrollHeight = scrollHeight
  }

  private handleSlotChange(event: Event) {
    const messages = (event.target as HTMLSlotElement).assignedElements()
    const previousFirst = this.firstMessage
    const previousLast = this.lastMessage
    if (previousFirst && messages[0] !== previousFirst && messages.includes(previousFirst)) {
      this.expectPrepend()
    }
    if (!this.following && previousLast) {
      const index = messages.indexOf(previousLast)
      if (index >= 0) this.unread += messages.length - 1 - index
    }
    this.firstMessage = messages[0] ?? null
    this.lastMessage = messages[messages.length - 1] ?? null
    this.empty = messages.length === 0
    this.loadRequested = false
  }

  /** Marks the next resize as content inserted above the viewport. */
  private expectPrepend() {
    if (this.following || this.prependPending) return
    this.prependPending = true
    // A prepend that changes no size produces no resize callback; drop the flag before the next unrelated one.
    requestAnimationFrame(() => requestAnimationFrame(() => (this.prependPending = false)))
  }

  private setFollowing(following: boolean) {
    if (following) this.unread = 0
    if (following === this.following) return
    this.following = following
    this.dispatchEvent(new CustomEvent('at-bottom-change', { detail: following }))
  }

  private handleJump() {
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    this.scrollToBottom(reduceMotion ? 'auto' : 'smooth')
    // The button hides once the list follows again; keep focus inside the conversation.
    this.scroller?.focus({ preventScroll: true })
  }

  override render() {
    return html`
      <div
        class="c2-chat-message-list__scroller"
        part="scroller"
        role="log"
        aria-label=${this.label}
        aria-live="polite"
        aria-relevant="additions"
        aria-busy=${this.loading ? 'true' : 'false'}
        tabindex="0"
        @scroll=${this.handleScroll}
      >
        <div class="c2-chat-message-list__content" part="content">
          <slot name="start"></slot>
          ${
            this.loading ? html`<div class="c2-chat-message-list__loading" part="loading"><slot name="loading">Loading earlier messages…</slot></div>` : nothing
          }
          <slot @slotchange=${this.handleSlotChange}></slot>
          <div class="c2-chat-message-list__empty" part="empty" ?hidden=${!this.empty}><slot name="empty"></slot></div>
        </div>
      </div>
      <button class="c2-chat-message-list__jump-button" part="jump-button" type="button" ?hidden=${this.following} @click=${this.handleJump}>
        <span class="c2-chat-message-list__visually-hidden">${this.jumpLabel}</span>
        <span class="c2-chat-message-list__jump-icon" aria-hidden="true">
          <slot name="jump-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </slot>
        </span>
        ${this.unread > 0 ? html`<span class="c2-chat-message-list__badge" part="badge">${this.unread}</span>` : nothing}
      </button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chat-message-list': ChatMessageList
  }
}
