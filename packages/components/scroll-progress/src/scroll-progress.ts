import { LitElement, html, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { scrollProgressMessages } from './messages'
import styles from './scroll-progress.scss?inline'

export { scrollProgressMessages } from './messages'

/** How many frames to keep looking for a `for` target that is not in the page yet (rendered after this element). */
const LOOKUP_FRAMES = 30

/**
 * How far the reader got, like the reading-progress bars of Medium and Magic UI and the ring around a "back to top"
 * button: a bar that fills, or a ring that closes, as the page or a container scrolls.
 *
 * Without `for` it follows the page; `for` names the id of a scroll container instead, and for a `c2-scroll-area` it
 * follows the area's own viewport. `variant` draws a `bar` or a `ring`; the ring's centre is a slot (an "↑" button
 * that scrolls back to the top). It does not place itself: pin a bar with `position: sticky` or `fixed` in your own
 * CSS. Progress is read once per frame while scrolling and on resize.
 *
 * It is a progress bar for assistive technology, named by `label` ("Reading progress"), whose value moves in whole
 * percents so a screen reader is not flooded.
 *
 * @tag c2-scroll-progress
 *
 * @slot - The centre of a ring (an icon, a "back to top" button).
 *
 * @csspart track - The unfilled part.
 * @csspart fill - The filled part.
 *
 * @cssproperty {pixel} [--c2-scroll-progress--thickness=3px] - The bar's height.
 * @cssproperty {color} [--c2-scroll-progress__track--color=#e4e4e7] - `transparent` hides the unfilled part.
 * @cssproperty {color} [--c2-scroll-progress__fill--color=#0265dc]
 * @cssproperty {border-radius} [--c2-scroll-progress--border-radius=0]
 * @cssproperty {pixel} [--c2-scroll-progress__ring--size=40px]
 * @cssproperty {pixel} [--c2-scroll-progress__ring--stroke-width=3]
 * @cssproperty {color} [--c2-scroll-progress__ring__track--color=#e4e4e7]
 */
@customElement('c2-scroll-progress')
export class ScrollProgress extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The id of the scroll container to follow (a `c2-scroll-area` works). Without it: the page. */
  @property() for = ''

  /** A thin bar that fills, or a ring that closes. */
  @property({ reflect: true }) variant: 'bar' | 'ring' = 'bar'

  /** The accessible name. */
  @property() label = ''

  /** Progress, from 0 to 1. */
  @state() private progress = 0

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, scrollProgressMessages)
  private readonly resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.schedule())
  /** The element that scrolls, or `null` for the page. */
  private scroller: HTMLElement | null = null
  private frame = 0
  private lookup = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private percent = -1
  /** Whether it is following something (the page, or the container found for `for`). */
  private attached = false

  constructor() {
    super()
    this.internals.role = 'progressbar'
    this.internals.ariaValueMin = '0'
    this.internals.ariaValueMax = '100'
  }

  /** Progress, from 0 (at the top) to 1 (at the bottom). */
  get value(): number {
    return this.progress
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // The first attach waits for the first update, so a `for` set right after insertion is the one followed.
    if (this.hasUpdated) this.attach()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detach()
    cancelAnimationFrame(this.lookup)
    clearTimeout(this.retry)
  }

  protected override willUpdate(): void {
    this.internals.ariaLabel = this.label || this.msg.t('label')
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('for') || !this.attached) this.attach()
  }

  private readonly schedule = () => {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.read())
  }

  /** The container named by `for`, looked up in this element's tree, then in the document. */
  private target(): HTMLElement | null {
    if (!this.for) return null
    const root = this.getRootNode() as Document | ShadowRoot
    const found = root.getElementById?.(this.for) ?? document.getElementById(this.for)
    if (!found) return null
    // A custom element that has not upgraded yet (it comes after this one, or its module loads later) is looked at again.
    const definition = found.localName.includes('-') ? customElements.get(found.localName) : undefined
    if (found.localName.includes('-') && (!definition || !(found instanceof definition))) return null
    // A c2-scroll-area scrolls inside its shadow root: follow its viewport, once it has rendered one.
    if (found.localName === 'c2-scroll-area') {
      const viewport = (found as HTMLElement & { viewport?: unknown }).viewport
      return viewport instanceof HTMLElement ? viewport : null
    }
    return found instanceof HTMLElement ? found : null
  }

  private attach(tries = 0): void {
    this.detach()
    cancelAnimationFrame(this.lookup)
    clearTimeout(this.retry)
    if (this.for) {
      const scroller = this.target()
      if (!scroller) {
        // Not in the page yet, not upgraded, or its viewport not rendered: look again every frame for a while, then
        // every half second, for as long as this element is connected.
        if (tries < LOOKUP_FRAMES) this.lookup = requestAnimationFrame(() => this.attach(tries + 1))
        else this.retry = setTimeout(() => this.attach(tries + 1), 500)
        return
      }
      this.scroller = scroller
      scroller.addEventListener('scroll', this.schedule, { passive: true })
      this.resizeObserver?.observe(scroller)
      const content = scroller.firstElementChild
      if (content) this.resizeObserver?.observe(content)
    } else {
      window.addEventListener('scroll', this.schedule, { passive: true })
      window.addEventListener('resize', this.schedule, { passive: true })
      this.resizeObserver?.observe(document.documentElement)
    }
    this.attached = true
    this.schedule()
  }

  private detach(): void {
    this.attached = false
    this.scroller?.removeEventListener('scroll', this.schedule)
    this.scroller = null
    window.removeEventListener('scroll', this.schedule)
    window.removeEventListener('resize', this.schedule)
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.frame)
  }

  private read(): void {
    const element = this.scroller ?? document.scrollingElement ?? document.documentElement
    const range = element.scrollHeight - element.clientHeight
    const progress = range > 1 ? Math.min(1, Math.max(0, element.scrollTop / range)) : 0
    if (progress !== this.progress) this.progress = progress
    const percent = Math.round(progress * 100)
    if (percent !== this.percent) {
      this.percent = percent
      this.internals.ariaValueNow = String(percent)
    }
  }

  override render() {
    if (this.variant === 'ring') {
      return html`<span class="ring" style="--_progress: ${this.progress}">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          ${svg`<circle class="ring__track" part="track" cx="18" cy="18" r="16" pathLength="100"></circle>
            <circle class="ring__fill" part="fill" cx="18" cy="18" r="16" pathLength="100"></circle>`}
        </svg>
        <span class="ring__centre"><slot></slot></span>
      </span>`
    }
    return html`<span class="bar" part="track" style="--_progress: ${this.progress}"><span class="bar__fill" part="fill"></span></span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-scroll-progress': ScrollProgress
  }
}
