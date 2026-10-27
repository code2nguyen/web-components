import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { query, state } from 'lit/decorators.js'
import '@c2n/overlay'
import type { Overlay } from '@c2n/overlay'
import { reactionBarMessages } from './messages'
import styles from './reaction-bar.scss?inline'

export { reactionBarMessages } from './messages'

/** One reaction on the bar. */
export interface Reaction {
  /** The emoji, or any short text for a custom reaction. */
  emoji: string
  /** How many people reacted with it. */
  count: number
  /** Whether the current user is one of them. */
  reacted?: boolean
}

/** What `reaction-change` carries: the reaction as it is about to become. */
export interface ReactionChangeDetail {
  emoji: string
  /** Whether the current user now reacts with it. */
  reacted: boolean
  /** Its new count. */
  count: number
}

/** Events fired by {@link ReactionBar}, keyed for `addEventListener`. */
export interface ReactionBarEventMap {
  'reaction-change': CustomEvent<ReactionChangeDetail>
}

export interface ReactionBar {
  addEventListener: TypedAddEventListener<ReactionBar, ReactionBarEventMap>
  removeEventListener: TypedRemoveEventListener<ReactionBar, ReactionBarEventMap>
}

/** Reads `quick` from an attribute as emoji separated by spaces. */
const emojiListConverter = {
  fromAttribute: (value: string | null) => (value ?? '').split(/\s+/).filter(Boolean),
  toAttribute: (value: string[]) => (Array.isArray(value) ? value.join(' ') : ''),
}

const DEFAULT_QUICK = ['👍', '❤️', '😂', '🎉', '😮', '😢']

/**
 * The emoji reactions under a message, comment or post, like those of Slack, GitHub and Discord: one pill per emoji
 * with its count, pressed when the current user is among those who reacted. Pressing a pill adds or removes the user's
 * reaction; the button at the end opens a popup of quick reactions and, when one is given in the `picker` slot, a full
 * `c2-emoji-picker`.
 *
 * Every change fires a cancelable `reaction-change` with the reaction as it is about to become, then updates
 * `reactions` itself: a count reaching 0 removes the pill, a new emoji is added at the end. Cancel the event to keep
 * the bar controlled, for example to wait for a server, and set `reactions` yourself.
 *
 * A screen reader hears each pill as its emoji and count, with whether you reacted as its pressed state. `readonly`
 * shows the reactions without the add button or the toggling.
 *
 * @tag c2-reaction-bar
 *
 * @slot picker - A `c2-emoji-picker` shown in the popup under the quick reactions. Its `emoji-select` adds that reaction and closes the popup.
 *
 * @event {CustomEvent<ReactionChangeDetail>} reaction-change - The current user added or removed a reaction. Cancelable: cancel it to leave `reactions` unchanged.
 *
 * @csspart reaction - One reaction pill.
 * @csspart emoji - The emoji in a pill.
 * @csspart count - The count in a pill.
 * @csspart add - The button that opens the popup.
 * @csspart menu - The popup's box, holding the quick reactions and the `picker` slot.
 * @csspart quick - The row of quick reactions in the popup.
 *
 * @cssproperty {pixel} [--c2-reaction-bar--gap=4px] - Space between the pills.
 * @cssproperty {pixel} [--c2-reaction-bar__reaction--height=28px]
 * @cssproperty {padding} [--c2-reaction-bar__reaction--padding=0 8px]
 * @cssproperty {border} [--c2-reaction-bar__reaction--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-reaction-bar__reaction--border-radius=999px]
 * @cssproperty {color} [--c2-reaction-bar__reaction--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-reaction-bar__reaction__hover--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-reaction-bar__reaction__reacted--background-color=#edf1fe] - A pill the current user reacted with.
 * @cssproperty {color} [--c2-reaction-bar__reaction__reacted--border-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-reaction-bar__reaction__reacted--color=rgb(2, 101, 220)] - The count of a pill the current user reacted with.
 * @cssproperty {outline} [--c2-reaction-bar__reaction__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {font-size} [--c2-reaction-bar__emoji--font-size=16px]
 * @cssproperty {font-family} [--c2-reaction-bar__emoji--font-family=Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif]
 * @cssproperty {color} [--c2-reaction-bar__count--color=#52525b]
 * @cssproperty {font-size} [--c2-reaction-bar__count--font-size=12px]
 * @cssproperty {font-weight} [--c2-reaction-bar__count--font-weight=500]
 * @cssproperty {color} [--c2-reaction-bar__add--color=#71717a] - The add button's icon.
 * @cssproperty {color} [--c2-reaction-bar__add__hover--color=#18181b]
 *
 * @cssproperty {color} [--c2-reaction-bar__menu--background-color=#ffffff]
 * @cssproperty {border} [--c2-reaction-bar__menu--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-reaction-bar__menu--border-radius=8px]
 * @cssproperty {shadow} [--c2-reaction-bar__menu--box-shadow=0 4px 12px rgba(0, 0, 0, 0.12)]
 * @cssproperty {padding} [--c2-reaction-bar__menu--padding=6px]
 * @cssproperty {pixel} [--c2-reaction-bar__quick--size=32px] - Width and height of each quick reaction.
 * @cssproperty {font-size} [--c2-reaction-bar__quick--font-size=20px]
 * @cssproperty {color} [--c2-reaction-bar__quick__hover--background-color=#f4f4f5]
 */
@customElement('c2-reaction-bar')
export class ReactionBar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The reactions, in the order they are shown. As an attribute, a JSON array of `{ emoji, count, reacted }`. */
  @property({ converter: jsonPropertyConverter }) reactions: Reaction[] = []

  /** The reactions offered first in the popup. As an attribute, emoji separated by spaces. */
  @property({ converter: emojiListConverter }) quick: string[] = DEFAULT_QUICK

  /** Shows the reactions without the add button, and pressing them does nothing. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** The accessible name of the bar. Defaults to "Reactions" in the page's language. */
  @property() label = ''

  @query('c2-overlay') private menu?: Overlay
  @state() private menuOpen = false

  private readonly msg = new LocalizeController(this, reactionBarMessages)
  private readonly internals = this.attachInternals()

  override connectedCallback(): void {
    super.connectedCallback()
    this.internals.role = 'group'
  }

  protected override updated(): void {
    this.internals.ariaLabel = this.label || this.msg.t('label')
  }

  private get list(): Reaction[] {
    return Array.isArray(this.reactions) ? this.reactions.filter((reaction) => reaction && typeof reaction.emoji === 'string' && reaction.count > 0) : []
  }

  private formatCount(count: number): string {
    try {
      return new Intl.NumberFormat(this.msg.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(count)
    } catch {
      return String(count)
    }
  }

  override render() {
    const list = this.list
    return html`${list.map((reaction) => this.renderReaction(reaction))}${this.readonly ? nothing : this.renderAdd()}`
  }

  private renderReaction(reaction: Reaction) {
    const count = this.formatCount(reaction.count)
    const content = html`<span class="emoji" part="emoji" aria-hidden="true">${reaction.emoji}</span
      ><span class="count" part="count" aria-hidden="true">${count}</span>`
    if (this.readonly) {
      return html`<span
        class="reaction ${reaction.reacted ? 'reaction--reacted' : ''}"
        part="reaction"
        role="img"
        aria-label=${this.msg.t('readonlyReaction', reaction.emoji, reaction.count, !!reaction.reacted)}
        >${content}</span
      >`
    }
    return html`<button
      class="reaction ${reaction.reacted ? 'reaction--reacted' : ''}"
      part="reaction"
      type="button"
      aria-pressed=${reaction.reacted ? 'true' : 'false'}
      aria-label=${this.msg.t('reaction', reaction.emoji, reaction.count)}
      @click=${() => this.toggle(reaction.emoji)}
    >
      ${content}
    </button>`
  }

  private renderAdd() {
    const quick = Array.isArray(this.quick) ? this.quick : DEFAULT_QUICK
    return html`<button
        class="add"
        part="add"
        type="button"
        aria-label=${this.msg.t('add')}
        aria-haspopup="dialog"
        aria-expanded=${this.menuOpen ? 'true' : 'false'}
        popovertarget="menu"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M16.9 9.2a7 7 0 1 1-6.1-6.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <path d="M7 12.2a4 4 0 0 0 6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <circle cx="7.5" cy="8.3" r="1" fill="currentColor" />
          <circle cx="12.5" cy="8.3" r="1" fill="currentColor" />
          <path d="M16 1.8v4.4M13.8 4h4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
      <c2-overlay id="menu" placement="top-start" free-width @toggle=${this.handleMenuToggle}>
        <div class="menu" part="menu" role="dialog" aria-label=${this.msg.t('add')} @emoji-select=${this.handlePickerSelect}>
          <div class="quick" part="quick" role="group" aria-label=${this.msg.t('quick')}>
            ${quick.map(
              (emoji) =>
                html`<button class="quick-emoji" type="button" aria-label=${emoji} @click=${() => this.addFromMenu(emoji)}>
                  <span aria-hidden="true">${emoji}</span>
                </button>`,
            )}
          </div>
          <slot name="picker"></slot>
        </div>
      </c2-overlay>`
  }

  private handleMenuToggle(event: ToggleEvent): void {
    this.menuOpen = event.newState === 'open'
    if (event.newState === 'open') this.renderRoot.querySelector<HTMLButtonElement>('.quick-emoji')?.focus()
  }

  private handlePickerSelect(event: CustomEvent<{ emoji?: string }>): void {
    const emoji = event.detail?.emoji
    if (typeof emoji === 'string' && emoji) this.addFromMenu(emoji)
  }

  private addFromMenu(emoji: string): void {
    if (this.menu) this.menu.open = false
    this.renderRoot.querySelector<HTMLButtonElement>('.add')?.focus()
    const existing = this.list.find((reaction) => reaction.emoji === emoji)
    if (existing?.reacted) return
    this.toggle(emoji)
  }

  /** Adds the current user's reaction with `emoji`, or removes it when they already reacted with it. */
  private toggle(emoji: string): void {
    if (this.readonly) return
    const list = this.list
    const existing = list.find((reaction) => reaction.emoji === emoji)
    const reacted = !existing?.reacted
    const count = Math.max(0, (existing?.count ?? 0) + (reacted ? 1 : -1))
    const allowed = this.dispatchEvent(new CustomEvent<ReactionChangeDetail>('reaction-change', { cancelable: true, detail: { emoji, reacted, count } }))
    if (!allowed) return
    const next = existing
      ? list.map((reaction) => (reaction === existing ? { ...reaction, reacted, count } : reaction)).filter((reaction) => reaction.count > 0)
      : [...list, { emoji, count, reacted }]
    this.reactions = next
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-reaction-bar': ReactionBar
  }
}
