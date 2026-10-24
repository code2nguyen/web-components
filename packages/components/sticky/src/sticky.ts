import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { StickyController, type StickyEdge, type StickyState } from '@c2n/core/controllers/sticky.js'
import styles from './sticky.scss?inline'

export type { StickyEdge, StickyState }

/** Events fired by {@link Sticky}, keyed for `addEventListener`. */
export interface StickyEventMap {
  'stuck-change': CustomEvent<{ stuck: boolean }>
  'retract-change': CustomEvent<{ retracted: boolean }>
}

export interface Sticky {
  addEventListener: TypedAddEventListener<Sticky, StickyEventMap>
  removeEventListener: TypedRemoveEventListener<Sticky, StickyEventMap>
}

/**
 * Keeps its content pinned to the top or bottom edge of the nearest scroll container while the rest scrolls past, and
 * tells you when it is stuck: the host matches `:state(stuck)` and fires `stuck-change`, so the surface can gain a
 * background and shadow only once content runs beneath it. With `hide-on-scroll` it slides out of view while the reader
 * scrolls down and comes back on the way up or when focus moves into it (`:state(retracted)`).
 *
 * Stickiness is CSS `position: sticky` on the host, so the usual rules apply: the host sticks within its parent, and
 * an ancestor with `overflow` set becomes the scroll container it sticks to. Turn it off with
 * `--c2-sticky--position: static`, which also switches the stuck state off.
 *
 * @tag c2-sticky
 * @slot - Content to keep in view: a toolbar, tabs, a table header, a section heading.
 * @event {CustomEvent<{ stuck: boolean }>} stuck-change - Fired when the element becomes stuck to its edge or leaves it.
 * @event {CustomEvent<{ retracted: boolean }>} retract-change - Fired when `hide-on-scroll` slides the element out of view or back in.
 * @csspart surface - Box wrapping the assigned default slot: it draws the padding, background and shadow around the slotted content, does not style inside it, and slides out of view while retracted.
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

  private readonly internals = this.attachInternals()

  private readonly sticky = new StickyController(this, {
    edge: () => this.edge,
    hideOnScroll: () => this.hideOnScroll,
    onChange: (state, previous) => this.handleStickyChange(state, previous),
  })

  /** Whether the content is currently pinned to its edge with content scrolling beneath it. */
  get stuck(): boolean {
    return this.sticky.stuck
  }

  /** Whether `hide-on-scroll` has currently slid the content out of view. */
  get retracted(): boolean {
    return this.sticky.retracted
  }

  /** Brings retracted content back into view. */
  reveal(): void {
    this.sticky.reveal()
  }

  private handleStickyChange(state: StickyState, previous: StickyState): void {
    toggleState(this.internals, 'stuck', state.stuck)
    toggleState(this.internals, 'retracted', state.retracted)
    if (state.stuck !== previous.stuck) this.dispatchEvent(new CustomEvent('stuck-change', { detail: { stuck: state.stuck } }))
    if (state.retracted !== previous.retracted) this.dispatchEvent(new CustomEvent('retract-change', { detail: { retracted: state.retracted } }))
  }

  override render() {
    return html`<div class="surface" part="surface"><slot></slot></div>`
  }
}

function toggleState(internals: ElementInternals, name: string, on: boolean): void {
  if (on) internals.states.add(name)
  else internals.states.delete(name)
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-sticky': Sticky
  }
}
