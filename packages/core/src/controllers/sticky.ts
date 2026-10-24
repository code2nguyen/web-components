import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'

export type StickyEdge = 'top' | 'bottom'

export interface StickyState {
  /** The element is pinned to its edge of the scroll container, with content scrolling beneath it. */
  stuck: boolean
  /** The element is stuck and slid out of view because the reader scrolled down (`hideOnScroll`). */
  retracted: boolean
}

/** Events a host using {@link StickyController} fires; merge them into the component's event map. */
export interface StickyEventMap {
  'stuck-change': CustomEvent<{ stuck: boolean }>
  'retract-change': CustomEvent<{ retracted: boolean }>
}

export interface StickyControllerOptions {
  /** The host's internals: the controller mirrors the state onto its `stuck` and `retracted` custom states. */
  internals: ElementInternals
  /** The edge the element sticks to; its offset is read from the host's computed `top` or `bottom`. */
  edge: () => StickyEdge
  /** Whether to observe at all. While false no listener is attached and the state stays off. Defaults to always. */
  enabled?: () => boolean
  /** Whether scrolling down slides the stuck element out of view and scrolling up brings it back. */
  hideOnScroll?: () => boolean
}

/** Distance the reader must scroll in one direction before a retractable element hides or reappears. */
const SCROLL_TOLERANCE = 8
/** Sub-pixel slack when comparing the element's edge to the scrollport's. */
const EPSILON = 1

/**
 * Tracks whether a `position: sticky` host is currently stuck to its edge of the nearest scroll container, and
 * optionally retracts it while the reader scrolls down (the "headroom" pattern). The state is mirrored onto the host's
 * `stuck` and `retracted` custom states and announced with the non-bubbling `stuck-change` and `retract-change`
 * events; nothing is written on the host.
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

  /** The bound scroll container (`null`: the viewport), or `undefined` while nothing is bound. */
  private scroller: HTMLElement | null | undefined = undefined
  private resizeObserver?: ResizeObserver
  private mutationObserver?: MutationObserver
  private frame = 0
  private lastScrollTop = 0
  /** Scroll distance travelled in the current direction (positive down, negative up). */
  private travel = 0
  /** Set when the scroll container must be looked up again before the next measurement. */
  private stale = true

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly options: StickyControllerOptions,
  ) {
    host.addController(this)
  }

  hostConnected(): void {
    if (typeof window === 'undefined') return
    this.host.addEventListener('focusin', this.reveal)
    this.stale = true
    this.schedule()
  }

  hostDisconnected(): void {
    if (typeof window === 'undefined') return
    this.host.removeEventListener('focusin', this.reveal)
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.unbind()
  }

  hostUpdated(): void {
    // `edge`, `enabled` or `hideOnScroll` may have changed, and a parent may have rendered the scroller around us.
    this.stale = true
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
    if (this.frame || typeof window === 'undefined') return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.update()
    })
  }

  private relayout = (): void => {
    // A resize can change which ancestor scrolls (a breakpoint switching `overflow`) as well as the geometry.
    this.stale = true
    this.schedule()
  }

  private update(): void {
    if (!this.host.isConnected) return
    if (this.options.enabled && !this.options.enabled()) {
      this.unbind()
      this.travel = 0
      this.set(false, false)
      return
    }
    if (this.stale) this.bind()

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
    // Only scrolling done while already stuck counts, so the scroll that pins the element does not also hide it.
    if (stuck && this.stuck && this.options.hideOnScroll?.() && !this.host.matches(':focus-within')) {
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

  /** Looks the scroll container up again and moves the listeners to it if it changed. */
  private bind(): void {
    this.stale = false
    const scroller = findScrollContainer(this.host)
    if (scroller === this.scroller) return
    this.unbind()
    this.scroller = scroller
    this.scrollTarget(scroller).addEventListener('scroll', this.schedule, { passive: true })
    window.addEventListener('resize', this.relayout, { passive: true })
    // Content that loads or collapses changes what is scrollable without a scroll or a window resize; the scroll box
    // itself keeps its size then, so the content beside the host is observed, and re-observed as siblings come and go.
    this.resizeObserver = new ResizeObserver(this.schedule)
    this.observeLayout()
    if (this.host.parentElement) {
      this.mutationObserver = new MutationObserver(() => {
        this.observeLayout()
        this.schedule()
      })
      this.mutationObserver.observe(this.host.parentElement, { childList: true })
    }
    this.lastScrollTop = this.metrics().scrollTop
  }

  private observeLayout(): void {
    const observer = this.resizeObserver
    if (!observer || this.scroller === undefined) return
    observer.disconnect()
    observer.observe(this.scroller ?? document.documentElement)
    const parent = this.host.parentElement
    if (!parent) return
    observer.observe(parent)
    for (const sibling of parent.children) if (sibling !== this.host) observer.observe(sibling)
  }

  private unbind(): void {
    if (this.scroller === undefined) return
    this.scrollTarget(this.scroller).removeEventListener('scroll', this.schedule)
    window.removeEventListener('resize', this.relayout)
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.mutationObserver?.disconnect()
    this.mutationObserver = undefined
    this.scroller = undefined
    this.stale = true
  }

  private set(stuck: boolean, retracted: boolean): void {
    if (stuck === this.stuck && retracted === this.retracted) return
    const previous = { stuck: this.stuck, retracted: this.retracted }
    this.stuck = stuck
    this.retracted = retracted
    const { states } = this.options.internals
    if (stuck) states.add('stuck')
    else states.delete('stuck')
    if (retracted) states.add('retracted')
    else states.delete('retracted')
    if (stuck !== previous.stuck) this.host.dispatchEvent(new CustomEvent('stuck-change', { detail: { stuck } }))
    if (retracted !== previous.retracted) this.host.dispatchEvent(new CustomEvent('retract-change', { detail: { retracted } }))
  }

  private scrollTarget(scroller: HTMLElement | null): HTMLElement | Window {
    return scroller ?? window
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

const scrolls = (element: Element) => {
  const overflow = getComputedStyle(element).overflowY
  return overflow !== 'visible' && overflow !== 'clip'
}

/**
 * The element a sticky box sticks within: the nearest ancestor in the flat tree (through slots and shadow roots)
 * whose vertical overflow gives it a scrolling mechanism. `null` stands for the viewport (the document scroller).
 */
export function findScrollContainer(element: Element): HTMLElement | null {
  let node: Node | null = composedParent(element)
  while (node && node instanceof HTMLElement) {
    if (node === document.documentElement) return null
    if (node === document.body) {
      // The body's overflow moves to the viewport unless the root element has overflow of its own; only then does the
      // body scroll by itself (the `html { overflow: hidden } body { overflow: auto }` app shell).
      return scrolls(document.documentElement) && scrolls(node) ? node : null
    }
    if (scrolls(node)) return node
    node = composedParent(node)
  }
  return null
}

function composedParent(node: Node): Node | null {
  if (node instanceof Element && node.assignedSlot) return node.assignedSlot
  const parent = node.parentNode
  return parent instanceof ShadowRoot ? parent.host : parent
}
