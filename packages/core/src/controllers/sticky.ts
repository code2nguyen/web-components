import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'

export type StickyEdge = 'top' | 'bottom'

export interface StickyState {
  /** The element is pinned to its edge of the scroll container, with content scrolling beneath it. */
  stuck: boolean
  /** The element is stuck and slid out of view because the reader scrolled down (`hideOnScroll`). */
  retracted: boolean
}

export interface StickyControllerOptions {
  /** The edge the element sticks to; its offset is read from the host's computed `top` or `bottom`. */
  edge: () => StickyEdge
  /** Whether scrolling down slides the stuck element out of view and scrolling up brings it back. */
  hideOnScroll?: () => boolean
  /** Called after `stuck` or `retracted` changed, with the previous state. */
  onChange?: (state: StickyState, previous: StickyState) => void
}

/** Distance the reader must scroll in one direction before a retractable element hides or reappears. */
const SCROLL_TOLERANCE = 8
/** Sub-pixel slack when comparing the element's edge to the scrollport's. */
const EPSILON = 1

/**
 * Tracks whether a `position: sticky` host is currently stuck to its edge of the nearest scroll container, and
 * optionally retracts it while the reader scrolls down (the "headroom" pattern). Pure observation: the controller
 * never writes on the host; the component maps the state onto its custom states and events.
 *
 * Stuck means the host sits exactly at its sticky offset while the container has scrolled content beneath it
 * (top edge), or still has content to scroll into view below it (bottom edge). A host whose computed `position`
 * is not `sticky` is never stuck, so switching stickiness off through CSS also switches the state off.
 *
 * While retracted, the component is expected to slide an inner surface out of view rather than the host itself, so
 * the host's box keeps reporting the position the stuck check reads.
 */
export class StickyController implements ReactiveController {
  stuck = false
  retracted = false

  private scroller: HTMLElement | null = null
  private frame = 0
  private lastScrollTop = 0
  /** Scroll distance travelled in the current direction (positive down, negative up). */
  private travel = 0

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly options: StickyControllerOptions,
  ) {
    host.addController(this)
  }

  hostConnected(): void {
    if (typeof window === 'undefined') return
    this.scroller = findScrollContainer(this.host)
    this.scrollTarget().addEventListener('scroll', this.schedule, { passive: true })
    window.addEventListener('resize', this.schedule, { passive: true })
    this.host.addEventListener('focusin', this.reveal)
    this.lastScrollTop = this.metrics().scrollTop
    this.schedule()
  }

  hostDisconnected(): void {
    if (typeof window === 'undefined') return
    this.scrollTarget().removeEventListener('scroll', this.schedule)
    window.removeEventListener('resize', this.schedule)
    this.host.removeEventListener('focusin', this.reveal)
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.scroller = null
  }

  hostUpdated(): void {
    // `edge` or `hideOnScroll` may have changed.
    this.schedule()
  }

  /** Brings a retracted element back into view, e.g. when focus moves into it. */
  reveal = (): void => {
    this.travel = 0
    this.set(this.stuck, false)
  }

  /** Re-reads the state now rather than on the next animation frame. */
  measure(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.update()
  }

  private schedule = (): void => {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.update()
    })
  }

  private update(): void {
    if (!this.host.isConnected) return
    const style = getComputedStyle(this.host)
    const view = this.metrics()
    const delta = view.scrollTop - this.lastScrollTop
    this.lastScrollTop = view.scrollTop

    let stuck = false
    if (style.position === 'sticky') {
      const rect = this.host.getBoundingClientRect()
      if (this.options.edge() === 'bottom') {
        const line = view.bottom - (parseFloat(style.bottom) || 0)
        stuck = view.scrollTop < view.maxScrollTop - EPSILON && Math.abs(rect.bottom - line) <= EPSILON
      } else {
        const line = view.top + (parseFloat(style.top) || 0)
        stuck = view.scrollTop > EPSILON && Math.abs(rect.top - line) <= EPSILON
      }
    }

    let retracted = false
    if (stuck && this.options.hideOnScroll?.() && !this.host.matches(':focus-within')) {
      // Accumulate travel per direction, so a jittery scroll does not flip the element back and forth.
      if (delta !== 0) this.travel = Math.sign(delta) === Math.sign(this.travel) ? this.travel + delta : delta
      if (this.travel > SCROLL_TOLERANCE) retracted = true
      else if (this.travel < -SCROLL_TOLERANCE) retracted = false
      else retracted = this.retracted
    } else {
      this.travel = 0
    }
    this.set(stuck, retracted)
  }

  private set(stuck: boolean, retracted: boolean): void {
    if (stuck === this.stuck && retracted === this.retracted) return
    const previous = { stuck: this.stuck, retracted: this.retracted }
    this.stuck = stuck
    this.retracted = retracted
    this.options.onChange?.({ stuck, retracted }, previous)
  }

  private scrollTarget(): HTMLElement | Window {
    return this.scroller ?? window
  }

  private metrics(): { top: number; bottom: number; scrollTop: number; maxScrollTop: number } {
    const scroller = this.scroller
    if (!scroller) {
      const root = document.scrollingElement ?? document.documentElement
      return { top: 0, bottom: root.clientHeight, scrollTop: root.scrollTop, maxScrollTop: root.scrollHeight - root.clientHeight }
    }
    const rect = scroller.getBoundingClientRect()
    const top = rect.top + scroller.clientTop
    return { top, bottom: top + scroller.clientHeight, scrollTop: scroller.scrollTop, maxScrollTop: scroller.scrollHeight - scroller.clientHeight }
  }
}

/**
 * The element a sticky box sticks within: the nearest ancestor, across shadow boundaries, whose vertical overflow
 * gives it a scrolling mechanism. `null` stands for the viewport (the document scroller).
 */
export function findScrollContainer(element: Element): HTMLElement | null {
  let node: Node | null = composedParent(element)
  while (node && node instanceof HTMLElement) {
    if (node === document.body || node === document.documentElement) return null
    const overflow = getComputedStyle(node).overflowY
    if (overflow !== 'visible' && overflow !== 'clip') return node
    node = composedParent(node)
  }
  return null
}

function composedParent(node: Node): Node | null {
  if (node instanceof Element && node.assignedSlot) return node.assignedSlot
  const parent = node.parentNode
  return parent instanceof ShadowRoot ? parent.host : parent
}
