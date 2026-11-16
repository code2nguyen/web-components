import type { ReactiveController } from 'lit'
import type { Sticky } from './sticky.js'

/**
 * The `show-when-hidden` behaviour of `c2-sticky`, loaded the first time an element uses it: watches the element the
 * sticky content stands in for with one `IntersectionObserver` and keeps the host's `concealed` state while that
 * element is on screen. The host has already set `concealed` when this loads, so the content does not flash in.
 */
export class StickyWatch implements ReactiveController {
  private observer?: IntersectionObserver
  /** `undefined` until the first watch, so a first lookup that finds nothing still settles the state. */
  private target?: Element | null
  /** On a first watch the element counts as on screen; after a change the state stands until the first entry. */
  private inView = true

  constructor(
    private readonly host: Sticky,
    private readonly internals: ElementInternals,
  ) {
    host.addEventListener('focusin', () => this.conceal())
    host.addEventListener('focusout', (event) => {
      const next = event.relatedTarget
      if (!(next instanceof Node && host.contains(next))) this.conceal(true)
    })
    // Calls hostConnected at once when the host is already connected.
    host.addController(this)
  }

  hostConnected(): void {
    this.watch()
  }

  hostUpdated(): void {
    this.watch()
  }

  hostDisconnected(): void {
    this.observer?.disconnect()
    this.observer = undefined
  }

  private watch(): void {
    const { host } = this
    if (!host.isConnected) return
    const target = host.showWhenHiddenElement ?? ((host.showWhenHidden && (host.getRootNode() as Document).getElementById?.(host.showWhenHidden)) || null)
    if (target === this.target && (this.observer || !target)) return
    this.observer?.disconnect()
    this.observer = undefined
    this.target = target
    if (target) {
      this.observer = new IntersectionObserver((entries) => {
        this.inView = entries[entries.length - 1].isIntersecting
        this.conceal()
      })
      this.observer.observe(target)
    } else {
      // Nothing to stand in for (an id that matches nothing): the action stays reachable.
      this.inView = false
    }
    this.conceal()
  }

  /** Content holding keyboard focus stays in view, so the watched element scrolling in never hides the focused control. */
  private conceal(focusLeft = false): void {
    const { host } = this
    let focused = document.activeElement
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement
    const held = !focusLeft && host.matches(':focus-within') && !!focused?.matches(':focus-visible')
    const concealed = this.inView && !held
    if (concealed === host.concealed) return
    this.internals.states[concealed ? 'add' : 'delete']('concealed')
    host.dispatchEvent(new CustomEvent('conceal-change', { detail: { concealed } }))
  }
}
