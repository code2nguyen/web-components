import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
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
 * @tag c2-scroll-area
 *
 * @slot - The content that scrolls.
 *
 * @event {CustomEvent<{ edge: 'top' | 'bottom' | 'start' | 'end' }>} scroll-edge - Fired when a scroll reaches an edge. Does not bubble, so a scroll area nested in another does not trigger the outer one's listener.
 *
 * @csspart viewport - The element that scrolls.
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
 * @cssproperty {pixel} [--c2-scroll-area__shadow--size=12px]
 * @cssproperty {pixel} [--c2-scroll-area__fade--size=0px] - Above 0, the content fades into each edge with more beyond it.
 * @cssproperty {outline} [--c2-scroll-area__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-scroll-area')
export class ScrollArea extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The axes that scroll. */
  @property({ reflect: true }) orientation: 'vertical' | 'horizontal' | 'both' = 'vertical'

  /** The accessible name of the scroll region. */
  @property() label = ''

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

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.frame)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // Moved in the page: watch the same viewport again.
    if (this.hasUpdated) this.watch()
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
    for (const edge of ['top', 'bottom', 'start', 'end'] as ScrollEdge[]) {
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
    const edges = (['top', 'bottom', 'start', 'end'] as ScrollEdge[]).filter((edge) => this.beyond[edge])
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
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-scroll-area': ScrollArea
  }
}
