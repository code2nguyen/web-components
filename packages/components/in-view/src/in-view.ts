import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './in-view.scss?inline'

/** Events fired by {@link InView}, keyed for `addEventListener`. */
export interface InViewEventMap {
  enter: CustomEvent<{ ratio: number }>
  leave: CustomEvent<{ ratio: number }>
}

export interface InView {
  addEventListener: TypedAddEventListener<InView, InViewEventMap>
  removeEventListener: TypedRemoveEventListener<InView, InViewEventMap>
}

/**
 * Reacts when its content scrolls into view, like Web Awesome's intersection observer, Framer Motion's `whileInView`
 * and the "load more" sentinels of feeds: `enter` fires when it comes into view, `leave` when it goes, each with the
 * ratio of it that shows.
 *
 * `threshold` is how much of it must show (0 to 1), `root-margin` grows or shrinks the viewport (`"200px"` to start
 * loading before it shows), and `once` stops watching after the first entry, for a reveal or a one-time load.
 * Content inside a scrolling container (a `c2-scroll-area`) is clipped by it, so it counts as in view only where the
 * container shows it; `root-margin` applies to the page's viewport, not to that container's edge.
 *
 * Its state is a CSS custom state, never a written attribute: style it with `c2-in-view:state(in-view)`, or let the
 * built-in reveal do it: set `--c2-in-view__hidden--opacity: 0` and `--c2-in-view__hidden--transform:
 * translateY(16px)` and the content fades and rises as it enters. There is no motion under `prefers-reduced-motion`.
 *
 * @tag c2-in-view
 *
 * @slot - The content that is watched.
 *
 * @event {CustomEvent<{ ratio: number }>} enter - Fired when it comes into view. Does not bubble.
 * @event {CustomEvent<{ ratio: number }>} leave - Fired when it goes out of view. Does not bubble.
 *
 * @cssproperty {opacity} [--c2-in-view__hidden--opacity=1] - The content's opacity while out of view: 0 makes it fade in.
 * @cssproperty {transform} [--c2-in-view__hidden--transform=none] - Its transform while out of view (`translateY(16px)`, `scale(0.96)`).
 * @cssproperty {duration} [--c2-in-view--transition-duration=500ms]
 * @cssproperty {easing} [--c2-in-view--transition-timing-function=cubic-bezier(0.2, 0.7, 0.2, 1)]
 * @cssproperty {duration} [--c2-in-view--transition-delay=0ms] - Staggers a row of reveals.
 */
@customElement('c2-in-view')
export class InView extends LitElement {
  static override styles = unsafeCSS(styles)

  /** How much of it must show to count as in view, from 0 (any of it) to 1 (all of it). */
  @property({ type: Number }) threshold = 0

  /** Grows or shrinks the viewport, as CSS margins (`"200px"`, `"0px 0px -20% 0px"`). */
  @property({ attribute: 'root-margin' }) rootMargin = '0px'

  /** Stops watching after the first entry. */
  @property({ type: Boolean }) once = false

  /** Stops watching. */
  @property({ type: Boolean, reflect: true }) disabled = false

  private readonly internals = this.attachInternals()
  private observer: IntersectionObserver | null = null
  private entered = false
  private seen = false

  /** Whether it is in view now. */
  get inView(): boolean {
    return this.entered
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // The first observe runs after the first update; this one is for an element moved in the page.
    if (this.hasUpdated) this.observe()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.observer = null
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('threshold') || changed.has('rootMargin') || changed.has('disabled') || changed.has('once')) this.observe()
  }

  private observe(): void {
    this.observer?.disconnect()
    this.observer = null
    const watching = !this.disabled && !(this.once && this.seen) && typeof IntersectionObserver !== 'undefined'
    // Not watched, and never seen: the reveal must not leave the content hidden for good.
    if (!watching && !this.entered) this.internals.states.add('unwatched')
    else this.internals.states.delete('unwatched')
    if (!watching) return
    const threshold = Number.isFinite(this.threshold) ? Math.min(1, Math.max(0, this.threshold)) : 0
    let rootMargin = this.rootMargin || '0px'
    try {
      this.observer = new IntersectionObserver((entries) => this.handle(entries), { threshold, rootMargin })
    } catch {
      // A malformed margin: watch with none rather than not at all.
      rootMargin = '0px'
      this.observer = new IntersectionObserver((entries) => this.handle(entries), { threshold, rootMargin })
    }
    this.observer.observe(this)
  }

  private handle(entries: IntersectionObserverEntry[]): void {
    const entry = entries[entries.length - 1]
    if (!entry) return
    const threshold = Number.isFinite(this.threshold) ? Math.min(1, Math.max(0, this.threshold)) : 0
    // isIntersecting is true for a zero-area touch; with a threshold, the ratio has to reach it.
    const inside = entry.isIntersecting && entry.intersectionRatio >= threshold
    if (inside === this.entered) return
    this.entered = inside
    if (inside) this.internals.states.add('in-view')
    else this.internals.states.delete('in-view')
    const ratio = Math.round(entry.intersectionRatio * 1000) / 1000
    // Not bubbling: an in-view nested in another does not fire the outer one's listeners.
    const options = { detail: { ratio } }
    this.dispatchEvent(inside ? new CustomEvent('enter', options) : new CustomEvent('leave', options))
    if (inside && this.once) {
      this.seen = true
      this.observer?.disconnect()
      this.observer = null
    }
  }

  override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-in-view': InView
  }
}
