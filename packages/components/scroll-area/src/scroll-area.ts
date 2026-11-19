import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { scrollAreaMessages } from './messages'
import styles from './scroll-area.scss?inline'

export { scrollAreaMessages } from './messages'

/** An edge of the scroll area. */
export type ScrollEdge = 'top' | 'bottom' | 'start' | 'end'

/** Events fired by {@link ScrollArea}, keyed for `addEventListener`. */
export interface ScrollAreaEventMap {
  'scroll-edge': CustomEvent<{ edge: ScrollEdge }>
}

export interface ScrollArea {
  addEventListener: TypedAddEventListener<ScrollArea, ScrollAreaEventMap>
  removeEventListener: TypedRemoveEventListener<ScrollArea, ScrollAreaEventMap>
}

/** How close to an edge, in pixels, counts as at it: sub-pixel scroll positions never reach it exactly. */
const EDGE = 1
/** The share of the viewport a `controls` button scrolls, so a little of what was in view stays in view as context. */
const PAGE = 0.8
const EDGES: ScrollEdge[] = ['top', 'bottom', 'start', 'end']

/** Points to the inline end; each control turns it towards its own edge. */
const chevron = html`<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 18 15 12 9 6"></polyline>
</svg>`

/**
 * A scroll container with themed scrollbars and edge shadows, like the ScrollArea of Mantine, Chakra and PrimeVue and
 * the side panels of Slack and Linear. Scrolling stays native (wheel, touch, keys, momentum, scroll snapping), so it
 * keeps the platform's feel; the scrollbar is themed through CSS (`scrollbar-width`, `scrollbar-color`, and the
 * WebKit pseudo-elements), and its thumb can fade in only while the pointer is over the area.
 *
 * A shadow shows on each edge with content hidden behind it, and disappears once that edge is reached, so a list at
 * its top has no shadow above it. Set the shadow colour to `transparent` to turn shadows off, or a fade size above 0 to
 * fade the content into the edges instead. `orientation` picks the axes that scroll.
 *
 * The region has a tab stop and a name (`label`), because a region that scrolls must be reachable by keyboard.
 * `scroll-edge` fires when a scroll reaches an edge: the hook for loading more in a feed or a chat. `viewport` is the
 * element that scrolls, for code that needs the real scroller; `scrollToEdge()` jumps to an edge.
 *
 * `controls` turns the area into a row scroller: a button over each edge with more beyond it scrolls most of a page
 * towards that edge, and hides once the edge is reached. The buttons are for the pointer: they are named but kept out
 * of the tab order, because the area itself is the tab stop and its arrow and page keys already scroll it.
 * `scrollPage()` is what they call, for an app's own buttons. `mouse-drag` lets a mouse drag the content to scroll it,
 * as touch does natively; the click that ends a drag does not reach a link or a button in the content.
 *
 * @tag c2-scroll-area
 *
 * @slot - The content that scrolls.
 * @slot top-icon - Icon of the `controls` button on the top edge. Defaults to a chevron.
 * @slot bottom-icon - Icon of the `controls` button on the bottom edge. Defaults to a chevron.
 * @slot start-icon - Icon of the `controls` button on the inline start edge. Defaults to a chevron.
 * @slot end-icon - Icon of the `controls` button on the inline end edge. Defaults to a chevron.
 *
 * @event {CustomEvent<{ edge: 'top' | 'bottom' | 'start' | 'end' }>} scroll-edge - Fired when a scroll reaches an edge. Does not bubble, so a scroll area nested in another does not trigger the outer one's listener.
 *
 * @csspart viewport - The element that scrolls.
 * @csspart control - Every `controls` button.
 * @csspart top-control - The `controls` button on the top edge, around the `top-icon` slot.
 * @csspart bottom-control - The `controls` button on the bottom edge, around the `bottom-icon` slot.
 * @csspart start-control - The `controls` button on the inline start edge, around the `start-icon` slot.
 * @csspart end-control - The `controls` button on the inline end edge, around the `end-icon` slot.
 *
 * @cssproperty {pixel} [--c2-scroll-area--max-height=none] - The tallest the area grows before it scrolls.
 * @cssproperty {pixel} [--c2-scroll-area--max-width=none]
 * @cssproperty {padding} [--c2-scroll-area--padding=0]
 * @cssproperty {border-radius} [--c2-scroll-area--border-radius=0]
 * @cssproperty {string} [--c2-scroll-area__scrollbar--width=thin] - `thin`, `auto` or `none`.
 * @cssproperty {pixel} [--c2-scroll-area__scrollbar--size=8px] - The scrollbar's thickness where it can be set (WebKit).
 * @cssproperty {color} [--c2-scroll-area__thumb--color=rgba(113, 113, 122, 0.4)]
 * @cssproperty {color} [--c2-scroll-area__thumb__hover--color=rgba(113, 113, 122, 0.4)] - The thumb while the pointer is over the area; with a transparent thumb, the bar fades in on hover.
 * @cssproperty {color} [--c2-scroll-area__track--color=transparent]
 * @cssproperty {color} [--c2-scroll-area__shadow--color=rgba(0, 0, 0, 0.12)] - `transparent` turns the edge shadows off.
 * @cssproperty {pixel} [--c2-scroll-area__shadow--size=12px] - Width and height of the shadow.
 * @cssproperty {pixel} [--c2-scroll-area__fade--size=0px] - Above 0, the content fades into each edge with more beyond it.
 * @cssproperty {outline} [--c2-scroll-area__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-scroll-area__control--size=32px] - Width and height of a `controls` button.
 * @cssproperty {pixel} [--c2-scroll-area__control--inset=8px] - Distance from a `controls` button to its edge.
 * @cssproperty {pixel} [--c2-scroll-area__control__icon--size=16px] - Width and height of the control icon.
 * @cssproperty {color} [--c2-scroll-area__control--color=#18181b]
 * @cssproperty {color} [--c2-scroll-area__control--background-color=#ffffff]
 * @cssproperty {color} [--c2-scroll-area__control__hover--background-color=#f4f4f5]
 * @cssproperty {border} [--c2-scroll-area__control--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-scroll-area__control--border-radius=999px]
 * @cssproperty {shadow} [--c2-scroll-area__control--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {opacity} [--c2-scroll-area__control--opacity=1] - Opacity of a shown `controls` button while the pointer is off the area and focus is outside it; `0` shows the buttons only on hover. Ignored on devices that cannot hover.
 * @cssproperty {outline} [--c2-scroll-area__control__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-scroll-area')
export class ScrollArea extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The axes that scroll. */
  @property({ reflect: true }) orientation: 'vertical' | 'horizontal' | 'both' = 'vertical'

  /** The accessible name of the scroll region. */
  @property() label = ''

  /** Show a button over each edge with more beyond it, which scrolls most of a page towards that edge. */
  @property({ type: Boolean, reflect: true }) controls = false

  /** Let a mouse drag the content to scroll it. Touch scrolls by dragging natively either way. */
  @property({ type: Boolean, reflect: true, attribute: 'mouse-drag' }) mouseDrag = false

  /** Edges with content hidden behind them. */
  @state() private beyond = { top: false, bottom: false, start: false, end: false }
  /** Whether a fade size is set: the mask is only applied then. */
  @state() private fading = false

  private readonly msg = new LocalizeController(this, scrollAreaMessages)
  private readonly resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.measure())
  /** Edges reached at the last measure, so `scroll-edge` fires once per arrival. */
  private reached = new Set<ScrollEdge>()
  private frame = 0
  /** The first measure records where the area starts without announcing it. */
  private measuredOnce = false
  /** Detaches `mouse-drag` (`./mouse-drag.js`, loaded the first time it is on). */
  private stopDrag?: () => void

  /** The element that scrolls. */
  get viewport(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.viewport') ?? null
  }

  /** Scrolls the viewport, as `Element.scrollTo`. */
  override scrollTo(options?: ScrollToOptions): void
  override scrollTo(x: number, y: number): void
  override scrollTo(first?: ScrollToOptions | number, y?: number): void {
    const viewport = this.viewport
    if (!viewport) return
    if (typeof first === 'number') viewport.scrollTo(first, y ?? 0)
    else viewport.scrollTo(first)
  }

  /** Scrolls to an edge: `top`, `bottom`, or `start` / `end` on the inline axis (which follow the writing direction). */
  scrollToEdge(edge: ScrollEdge, behavior: ScrollBehavior = 'auto'): void {
    const viewport = this.viewport
    if (!viewport) return
    const rtl = getComputedStyle(viewport).direction === 'rtl'
    const inlineEnd = (rtl ? -1 : 1) * viewport.scrollWidth
    const positions: Record<ScrollEdge, ScrollToOptions> = {
      top: { top: 0 },
      bottom: { top: viewport.scrollHeight },
      start: { left: 0 },
      end: { left: inlineEnd },
    }
    viewport.scrollTo({ ...positions[edge], behavior })
  }

  /**
   * Scrolls most of a page towards an edge, as the `controls` buttons do; `start` / `end` follow the writing direction.
   * Smooth unless the user prefers reduced motion. Scroll snapping set on the `viewport` part still applies.
   */
  scrollPage(edge: ScrollEdge): void {
    const viewport = this.viewport
    if (!viewport) return
    const block = edge === 'top' || edge === 'bottom'
    // An axis the area does not scroll is clipped: moving it from script would hide content the user cannot bring back.
    if (this.orientation !== 'both' && block !== (this.orientation === 'vertical')) return
    const toward = edge === 'top' || edge === 'start' ? -1 : 1
    const distance = toward * PAGE * (block ? viewport.clientHeight : viewport.clientWidth)
    const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    const rtl = getComputedStyle(viewport).direction === 'rtl'
    viewport.scrollBy(block ? { top: distance, behavior } : { left: rtl ? -distance : distance, behavior })
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.frame)
    this.stopDrag?.()
    this.stopDrag = undefined
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // Moved in the page: watch the same viewport again.
    if (this.hasUpdated) {
      this.watch()
      this.syncDrag()
    }
  }

  protected override firstUpdated(): void {
    this.watch()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('orientation') && changed.get('orientation') !== undefined) {
      this.reached.clear()
      this.measuredOnce = false
      this.measure()
    }
    if (changed.has('mouseDrag')) this.syncDrag()
    // A clicked control keeps focus; once its edge is reached it hides, so focus moves to the area rather than the page.
    const edge = (this.shadowRoot?.activeElement as HTMLElement | null)?.dataset.edge as ScrollEdge | undefined
    if (edge && !this.beyond[edge]) this.viewport?.focus({ preventScroll: true })
  }

  private watch(): void {
    const viewport = this.viewport
    if (viewport && this.resizeObserver) {
      this.resizeObserver.observe(viewport)
      // The content changing size (more items, an image loading) moves the edges too.
      const content = viewport.querySelector('.content')
      if (content) this.resizeObserver.observe(content)
    }
    this.measure()
  }

  private syncDrag(): void {
    const viewport = this.viewport
    if (!this.mouseDrag || !viewport) {
      this.stopDrag?.()
      this.stopDrag = undefined
    } else if (!this.stopDrag) {
      let stop: (() => void) | undefined
      let cancelled = false
      this.stopDrag = () => (stop ? stop() : (cancelled = true))
      void import('./mouse-drag.js').then(({ dragToScroll }) => {
        if (!cancelled) stop = dragToScroll(viewport, () => this.orientation)
      })
    }
  }

  private handleScroll(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.measure(true))
  }

  /** Works out which edges have content behind them, and fires `scroll-edge` for an edge just reached by a scroll. */
  private measure(fromScroll = false): void {
    const viewport = this.viewport
    if (!viewport) return
    const { scrollTop, scrollHeight, clientHeight, scrollWidth, clientWidth } = viewport
    // In a right-to-left area, scrollLeft runs from 0 down to negative values.
    const left = Math.abs(viewport.scrollLeft)
    const vertical = this.orientation !== 'horizontal'
    const horizontal = this.orientation !== 'vertical'
    const next = {
      top: vertical && scrollTop > EDGE,
      bottom: vertical && scrollTop + clientHeight < scrollHeight - EDGE,
      start: horizontal && left > EDGE,
      end: horizontal && left + clientWidth < scrollWidth - EDGE,
    }
    const scrollable = { vertical: scrollHeight > clientHeight + EDGE, horizontal: scrollWidth > clientWidth + EDGE }
    for (const edge of EDGES) {
      const axisScrolls = edge === 'top' || edge === 'bottom' ? vertical && scrollable.vertical : horizontal && scrollable.horizontal
      const atEdge = axisScrolls && !next[edge]
      if (atEdge && !this.reached.has(edge)) {
        this.reached.add(edge)
        // Only a scroll arrives at an edge: where the area starts, or content growing or shrinking, is not news.
        if (fromScroll && this.measuredOnce) this.dispatchEvent(new CustomEvent('scroll-edge', { detail: { edge } }))
      } else if (!atEdge) this.reached.delete(edge)
    }
    this.measuredOnce = true
    const fade = parseFloat(getComputedStyle(this).getPropertyValue('--c2-scroll-area__fade--size')) > 0
    if (fade !== this.fading) this.fading = fade
    const current = this.beyond
    if (current.top !== next.top || current.bottom !== next.bottom || current.start !== next.start || current.end !== next.end) this.beyond = next
  }

  override render() {
    const edges = EDGES.filter((edge) => this.beyond[edge])
    // Named, it is a landmark; unnamed, a group, so several scroll areas do not make landmarks with the same name.
    return html`<div class="frame ${edges.map((edge) => `more-${edge}`).join(' ')} ${this.fading ? 'fade' : ''}">
      <div
        class="viewport"
        part="viewport"
        tabindex="0"
        role=${this.label ? 'region' : 'group'}
        aria-label=${this.label || this.msg.t('label')}
        @scroll=${this.handleScroll}
      >
        <div class="content"><slot @slotchange=${() => this.measure()}></slot></div>
      </div>
      <span class="shadow shadow--top" aria-hidden="true"></span>
      <span class="shadow shadow--bottom" aria-hidden="true"></span>
      <span class="shadow shadow--start" aria-hidden="true"></span>
      <span class="shadow shadow--end" aria-hidden="true"></span>
      ${
        this.controls
          ? EDGES.map(
              (edge) =>
                html`<button
                  class="control control--${edge}"
                  part="control ${edge}-control"
                  type="button"
                  tabindex="-1"
                  data-edge=${edge}
                  aria-label=${this.msg.t(edge)}
                  @click=${() => this.scrollPage(edge)}
                >
                  <slot name="${edge}-icon">${chevron}</slot>
                </button>`,
            )
          : nothing
      }
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-scroll-area': ScrollArea
  }
}
