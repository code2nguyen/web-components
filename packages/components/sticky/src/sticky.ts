import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { StickyController, type StickyEdge, type StickyEventMap as StickyControllerEventMap } from '@c2n/core/controllers/sticky.js'
import styles from './sticky.scss?inline'

export type { StickyEdge }

/** Events fired by {@link Sticky}, keyed for `addEventListener`. */
export interface StickyEventMap {
  'stuck-change': StickyControllerEventMap['stuck-change']
  'retract-change': StickyControllerEventMap['retract-change']
  'conceal-change': CustomEvent<{ concealed: boolean }>
}

export interface Sticky {
  addEventListener: TypedAddEventListener<Sticky, StickyEventMap>
  removeEventListener: TypedRemoveEventListener<Sticky, StickyEventMap>
}

/**
 * Keeps its content pinned to the top or bottom edge of the nearest scroll container while the rest scrolls past, and
 * tells you when it is stuck: the host matches `:state(stuck)` and fires `stuck-change`, so the surface can gain a
 * background and shadow only once content runs beneath it. With `hide-on-scroll` it slides out of view while the reader
 * scrolls down and comes back on the way up or when focus moves into it (`:state(retracted)`). With `show-when-hidden`
 * it stays out of view while a watched element (the page's main Buy or Apply button) is on screen and slides in once
 * that element is scrolled out of view, as a sticky call to action that mirrors it (`:state(concealed)`).
 *
 * Stickiness is CSS `position: sticky` on the host, so the usual rules apply: the host sticks within its parent, and
 * an ancestor with `overflow` set becomes the scroll container it sticks to. Turn it off with
 * `--c2-sticky--position: static`, which also switches the stuck state off.
 *
 * @tag c2-sticky
 * @slot - Content to keep in view: a toolbar, tabs, a table header, a section heading.
 * @event {CustomEvent<{ stuck: boolean }>} stuck-change - Fired when the element becomes stuck to its edge or leaves it.
 * @event {CustomEvent<{ retracted: boolean }>} retract-change - Fired when `hide-on-scroll` slides the element out of view or back in.
 * @event {CustomEvent<{ concealed: boolean }>} conceal-change - Fired when `show-when-hidden` slides the element out of view because the watched element came into view, or back in once it left.
 * @csspart surface - Box wrapping the assigned default slot: it draws the padding, background and shadow around the slotted content, does not style inside it, and slides out of view while retracted or concealed.
 *
 * @cssproperty {string} [--c2-sticky--position=sticky] - `sticky` pins the element; `static` turns pinning off, e.g. under a breakpoint.
 * @cssproperty {pixel} [--c2-sticky--offset=0px] - Distance kept from the edge, e.g. the height of a sticky header above.
 * @cssproperty {number} [--c2-sticky--z-index=10]
 * @cssproperty {color} [--c2-sticky--background=transparent]
 * @cssproperty {box-shadow} [--c2-sticky--box-shadow=none]
 * @cssproperty {padding} [--c2-sticky--padding=0px]
 * @cssproperty {pixel} [--c2-sticky--border-radius=0px]
 * @cssproperty {color} [--c2-sticky__stuck--background=#ffffff] - Background while stuck, so scrolled content does not show through.
 * @cssproperty {box-shadow} [--c2-sticky__stuck--box-shadow=0 1px 3px rgba(0, 0, 0, 0.18)] - Shadow while stuck, separating the surface from the content beneath it.
 * @cssproperty {backdrop-filter} [--c2-sticky__stuck--backdrop-filter=none] - Backdrop filter while stuck, e.g. `blur(12px)` with a translucent stuck background.
 * @cssproperty {time} [--c2-sticky--transition-duration=200ms] - Duration of the stuck and retract transitions.
 */
@customElement('c2-sticky')
export class Sticky extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The edge of the scroll container the content sticks to. */
  @property({ reflect: true }) edge: StickyEdge = 'top'

  /** Slides the stuck content out of view while the reader scrolls down, and back in on the way up. */
  @property({ type: Boolean, attribute: 'hide-on-scroll' }) hideOnScroll = false

  /**
   * Id of an element, in the same document or shadow root, that this one stands in for: the content stays out of view
   * while that element is on screen and slides in while it is scrolled out of view, e.g. a sticky Buy bar mirroring
   * the page's main Buy button. An id that matches nothing leaves the content in view. `showWhenHiddenElement` wins.
   */
  @property({ attribute: 'show-when-hidden' }) showWhenHidden = ''

  /** The element to watch, as a reference: use it for an element in another shadow root or one added later. Wins over `show-when-hidden`. */
  @property({ attribute: false }) showWhenHiddenElement: Element | null = null

  private readonly internals = this.attachInternals()

  private readonly sticky = new StickyController(this, {
    internals: this.internals,
    edge: () => this.edge,
    hideOnScroll: () => this.hideOnScroll,
  })

  /** Whether the content is currently pinned to its edge with content scrolling beneath it. */
  get stuck(): boolean {
    return this.sticky.stuck
  }

  /** Whether `hide-on-scroll` has currently slid the content out of view. */
  get retracted(): boolean {
    return this.sticky.retracted
  }

  private watching = false

  /** Whether `show-when-hidden` currently keeps the content out of view because the watched element is on screen. */
  get concealed(): boolean {
    return this.internals.states.has('concealed')
  }

  /** Brings retracted content back into view. */
  reveal(): void {
    this.sticky.reveal()
  }

  protected override updated(): void {
    if (this.watching || !(this.showWhenHidden || this.showWhenHiddenElement)) return
    this.watching = true
    // The watched element counts as on screen until the watcher, loaded on first use, reports: no flash on load.
    this.internals.states.add('concealed')
    import('./sticky-watch.js').then(
      ({ StickyWatch }) => new StickyWatch(this, this.internals),
      () => {
        // A failed load (offline, a stale deploy) leaves the action in view and is tried again on the next update.
        this.watching = false
        this.internals.states.delete('concealed')
      },
    )
  }

  override render() {
    return html`<div class="surface" part="surface"><slot></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-sticky': Sticky
  }
}
