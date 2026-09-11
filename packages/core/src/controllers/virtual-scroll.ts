import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * Browsers silently cap how tall an element may be, and past that cap a spacer stops growing while the scrollbar
 * keeps tracking it. Beyond this many pixels the controller scales the scroll offset instead of spanning the whole
 * list, so the window stays correct at any item count. Value from the same ad-hoc Chrome/Safari/Firefox limit the
 * Lit virtualizer uses.
 */
const MAX_SCROLL_HEIGHT = 8_200_000

export interface VirtualScrollRange {
  /** Index of the first item to render. */
  start: number
  /** Index after the last item to render. */
  end: number
  /** Height in pixels of the spacer that replaces the items before `start`. */
  paddingTop: number
  /** Height in pixels of the spacer that replaces the items after `end`. */
  paddingBottom: number
}

export interface VirtualScrollOptions {
  /** The scrolling element. Read on every update, so it may be created by the host's first render. */
  scrollElement: () => HTMLElement | null | undefined
  /** Total number of items. */
  itemCount: () => number
  /** Height of a single item in pixels. Uniform: the controller does not measure items. */
  itemHeight: () => number
  /** Items rendered above and below the viewport. Defaults to 6. */
  overscan?: () => number
  /** When false the controller reports the full range, so the host renders every item. Defaults to true. */
  enabled?: () => boolean
  /** Viewport height used before the scroll element has been laid out. Defaults to 480. */
  estimatedViewportHeight?: number
}

/**
 * Windows a long, uniform-height list to the items that are visible in a scrolling element, plus an overscan margin.
 *
 * The host renders `range.start`…`range.end` and two spacers of `range.paddingTop` / `range.paddingBottom` pixels, so
 * the scrollbar keeps the size of the full list. The controller only ever reads layout (`scrollTop`, `clientHeight`),
 * never writes it, and requests a host update when the visible window changes.
 */
export class VirtualScrollController implements ReactiveController {
  #host: ReactiveControllerHost
  #options: VirtualScrollOptions
  #scrollElement: HTMLElement | null = null
  #resizeObserver: ResizeObserver | null = null
  #scrollTop = 0
  #viewportHeight = 0
  #range: VirtualScrollRange = { start: 0, end: 0, paddingTop: 0, paddingBottom: 0 }
  #hasComputed = false

  constructor(host: ReactiveControllerHost, options: VirtualScrollOptions) {
    this.#host = host
    this.#options = options
    host.addController(this)
  }

  get range(): VirtualScrollRange {
    // Compute on first read so a host that renders before it is attached (server-side rendering, the first paint)
    // still gets a usable window from the estimated viewport height instead of an empty one.
    if (!this.#hasComputed) this.#computeRange()
    return this.#range
  }

  get scrollTop(): number {
    return this.#scrollTop
  }

  hostConnected() {
    this.#resizeObserver ??= new ResizeObserver(() => this.#measure())
    // Lit does not request an update when an element reconnects, so `hostUpdated` may never run again after the host
    // is moved in the DOM. Re-bind here or scroll events stop reaching a host that is still perfectly alive.
    this.#attach(this.#options.scrollElement())
  }

  hostDisconnected() {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#detach()
  }

  /** Called by the host after every render: binds to the scroll element and recomputes the window. */
  hostUpdated() {
    this.#attach(this.#options.scrollElement())
    // The render that just happened used the window from before this update, so a changed item count or item height
    // leaves stale spacers on screen until the host renders once more.
    if (this.#computeRange()) this.#host.requestUpdate()
  }

  /** Scrolls the item at `index` into view, aligning it to the closest edge of the viewport. */
  scrollToIndex(index: number, offsetTop = 0) {
    const element = this.#scrollElement
    if (!element) return
    const itemHeight = this.#options.itemHeight()
    const count = Math.max(0, this.#options.itemCount())
    if (itemHeight <= 0 || count === 0) return

    // Work in the list's own coordinates: `offset` is where the top of the viewport sits in the full list, and
    // `offsetTop` is the part of that viewport a sticky header covers.
    const viewportHeight = element.clientHeight
    const scale = this.#scrollScale(count * itemHeight, viewportHeight)
    const offset = element.scrollTop * scale
    const top = Math.min(Math.max(index, 0), count - 1) * itemHeight
    const bottom = top + itemHeight

    if (top < offset) {
      element.scrollTop = top / scale
    } else if (bottom > offset + viewportHeight - offsetTop) {
      element.scrollTop = (bottom - viewportHeight + offsetTop) / scale
    }
  }

  #attach(element: HTMLElement | null | undefined) {
    if (element === this.#scrollElement) return
    this.#detach()
    if (!element) return
    this.#scrollElement = element
    element.addEventListener('scroll', this.#handleScroll, { passive: true })
    this.#resizeObserver?.observe(element)
    this.#measure()
  }

  #detach() {
    if (!this.#scrollElement) return
    this.#scrollElement.removeEventListener('scroll', this.#handleScroll)
    this.#resizeObserver?.unobserve(this.#scrollElement)
    this.#scrollElement = null
  }

  #handleScroll = () => {
    this.#measure()
  }

  #measure() {
    const element = this.#scrollElement
    if (!element) return
    this.#scrollTop = element.scrollTop
    this.#viewportHeight = element.clientHeight
    if (this.#computeRange()) this.#host.requestUpdate()
  }

  /**
   * Ratio between the height the list would have and the height its spacers can actually reach. 1 — the offset maps
   * straight through — for every list that fits under `MAX_SCROLL_HEIGHT`.
   */
  #scrollScale(contentHeight: number, viewportHeight: number): number {
    if (contentHeight <= MAX_SCROLL_HEIGHT) return 1
    const reachable = MAX_SCROLL_HEIGHT - viewportHeight
    return reachable > 0 ? (contentHeight - viewportHeight) / reachable : 1
  }

  /** Recomputes the window; returns true when it changed. */
  #computeRange(): boolean {
    this.#hasComputed = true
    const count = Math.max(0, this.#options.itemCount())
    const itemHeight = this.#options.itemHeight()
    const enabled = this.#options.enabled?.() ?? true
    let next: VirtualScrollRange

    if (!enabled || count === 0 || itemHeight <= 0) {
      next = { start: 0, end: count, paddingTop: 0, paddingBottom: 0 }
    } else {
      const overscan = Math.max(0, this.#options.overscan?.() ?? 6)
      const viewportHeight = this.#viewportHeight || (this.#options.estimatedViewportHeight ?? 480)
      const contentHeight = count * itemHeight
      const spannedHeight = Math.min(contentHeight, MAX_SCROLL_HEIGHT)
      // Past the cap the spacers no longer span the whole list, so the real scroll offset is scaled up to the offset
      // the list would have had and the top spacer is shifted to keep the rendered items under the viewport.
      const offset = this.#scrollTop * this.#scrollScale(contentHeight, viewportHeight)
      // The `+ 1` covers the item the viewport starts partway through, which it almost always does.
      const visible = Math.ceil(viewportHeight / itemHeight) + 1 + overscan * 2
      const start = Math.max(0, Math.floor(offset / itemHeight) - overscan)
      const end = Math.min(count, start + visible)
      const paddingTop = Math.max(0, start * itemHeight - (offset - this.#scrollTop))
      next = { start, end, paddingTop, paddingBottom: Math.max(0, spannedHeight - paddingTop - (end - start) * itemHeight) }
    }

    const current = this.#range
    if (current.start === next.start && current.end === next.end && current.paddingTop === next.paddingTop && current.paddingBottom === next.paddingBottom) {
      return false
    }
    this.#range = next
    return true
  }
}
