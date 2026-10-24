import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { StickyController, type StickyState } from '@c2n/core/controllers/sticky.js'
import styles from './header.scss?inline'

/** Events fired by {@link Header}, keyed for `addEventListener`. */
export interface HeaderEventMap {
  'stuck-change': CustomEvent<{ stuck: boolean }>
  'retract-change': CustomEvent<{ retracted: boolean }>
}

export interface Header {
  addEventListener: TypedAddEventListener<Header, HeaderEventMap>
  removeEventListener: TypedRemoveEventListener<Header, HeaderEventMap>
}

/**
 * A site-header shell that arranges branding, navigation, actions and an optional mobile trigger. Navigation behaviour
 * remains the responsibility of slotted controls such as `c2-navigation-menu`.
 *
 * A `sticky` header reports when page content scrolls beneath it: the host matches `:state(stuck)` and fires
 * `stuck-change`, and `--c2-header__stuck--box-shadow` applies. With `hide-on-scroll` it slides away while the reader
 * scrolls down and returns on the way up or when focus moves into it (`:state(retracted)`). The same behaviour is
 * available for any other content through `c2-sticky`.
 *
 * @tag c2-header
 * @slot brand - Logo, product name or home link.
 * @slot - Primary navigation.
 * @slot actions - Account and application actions aligned to the end.
 * @slot mobile-trigger - Responsive navigation trigger, placed after the actions.
 * @event {CustomEvent<{ stuck: boolean }>} stuck-change - Fired when a `sticky` header becomes stuck to the top or leaves it.
 * @event {CustomEvent<{ retracted: boolean }>} retract-change - Fired when `hide-on-scroll` slides the header out of view or back in.
 * @csspart header - The outer page-header landmark.
 * @csspart content - Inner layout container wrapping and aligning the assigned default slot.
 * @csspart brand - Container for the `brand` slot.
 * @csspart navigation - Primary navigation landmark containing the default slot.
 * @csspart actions - Container for the trailing `actions` slot.
 * @csspart mobile-trigger - Container for the responsive `mobile-trigger` slot.
 *
 * @cssproperty {pixel} [--c2-header--min-height=64px]
 * @cssproperty {padding} [--c2-header--padding=8px 24px]
 * @cssproperty {pixel} [--c2-header--gap=24px]
 * @cssproperty {color} [--c2-header--background=#ffffff]
 * @cssproperty {color} [--c2-header--color=#18181b]
 * @cssproperty {border} [--c2-header--border-bottom=1px solid #e4e4e7]
 * @cssproperty {box-shadow} [--c2-header--box-shadow=none]
 * @cssproperty {box-shadow} [--c2-header__stuck--box-shadow=none] - Shadow of a `sticky` header while content scrolls beneath it; falls back to `--c2-header--box-shadow`.
 * @cssproperty {time} [--c2-header--transition-duration=200ms] - Duration of the stuck and `hide-on-scroll` transitions.
 * @cssproperty {pixel} [--c2-header--sticky-top=0px]
 * @cssproperty {backdrop-filter} [--c2-header--backdrop-filter=blur(16px)]
 * @cssproperty {color} [--c2-header__blurred--background=rgba(255, 255, 255, 0.82)]
 * @cssproperty {max-width} [--c2-header__content--max-width=none] - Constrains the inner content while the header surface remains full-width.
 * @cssproperty {pixel} [--c2-header__brand--gap=8px]
 * @cssproperty {pixel} [--c2-header__actions--gap=8px]
 */
@customElement('c2-header')
export class Header extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Pins the header to the configured top offset. */
  @property({ type: Boolean, reflect: true }) sticky = false

  /** Slides a `sticky` header out of view while the reader scrolls down, and back in on the way up. */
  @property({ type: Boolean, attribute: 'hide-on-scroll' }) hideOnScroll = false

  /** Uses a translucent background and backdrop filter. */
  @property({ type: Boolean, reflect: true }) blurred = false

  /** Accessible name for the primary navigation landmark. */
  @property({ attribute: 'navigation-label' }) navigationLabel = 'Primary'

  private readonly internals = this.attachInternals()

  private readonly stickiness = new StickyController(this, {
    edge: () => 'top',
    hideOnScroll: () => this.hideOnScroll,
    onChange: (state, previous) => this.handleStickyChange(state, previous),
  })

  /** Whether a `sticky` header is currently pinned to the top with page content scrolling beneath it. */
  get stuck(): boolean {
    return this.stickiness.stuck
  }

  /** Whether `hide-on-scroll` has currently slid the header out of view. */
  get retracted(): boolean {
    return this.stickiness.retracted
  }

  /** Brings a retracted header back into view. */
  reveal(): void {
    this.stickiness.reveal()
  }

  private handleStickyChange(state: StickyState, previous: StickyState): void {
    if (state.stuck) this.internals.states.add('stuck')
    else this.internals.states.delete('stuck')
    if (state.retracted) this.internals.states.add('retracted')
    else this.internals.states.delete('retracted')
    if (state.stuck !== previous.stuck) this.dispatchEvent(new CustomEvent('stuck-change', { detail: { stuck: state.stuck } }))
    if (state.retracted !== previous.retracted) this.dispatchEvent(new CustomEvent('retract-change', { detail: { retracted: state.retracted } }))
  }

  override render() {
    return html`
      <header class="c2-header" part="header">
        <div class="content" part="content">
          <div class="brand" part="brand"><slot name="brand"></slot></div>
          <nav class="navigation" part="navigation" aria-label=${this.navigationLabel}><slot></slot></nav>
          <div class="actions" part="actions"><slot name="actions"></slot></div>
          <div class="mobile-trigger" part="mobile-trigger"><slot name="mobile-trigger"></slot></div>
        </div>
      </header>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-header': Header
  }
}
