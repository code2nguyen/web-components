import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { assignSlot, property } from '@c2n/core/lit-helper.js'
import styles from './marquee.scss?inline'

export type MarqueeOrientation = 'horizontal' | 'vertical'

/** Where one item travels: the cycle it shares with every item, and its own start and end of that cycle. */
interface ItemTrack {
  from: number
  to: number
  phase: number
}

/**
 * Continuous strip that scrolls its children in a loop: logo walls, testimonials, ticker tapes. Each child element
 * is one item. Items keep their own DOM (no copies are made), so page styles, links and listeners keep working; a
 * child that leaves one edge re-enters at the other. When the items are shorter than the strip, the gap that leaves
 * shows as empty space before the first item comes round again.
 *
 * Motion pauses while the pointer is over the strip or focus is inside it, and while `paused` is set. Keyboard focus
 * and a request for reduced motion both stop the strip and lay it out as a row that scrolls by hand, so the focused
 * item is always in view.
 *
 * @tag c2-marquee
 *
 * @slot - The items, one per child element. Text directly inside the element is not shown.
 *
 * @csspart viewport - The clipping window around the moving items.
 * @csspart item - The moving wrapper around each child of the default slot; one child is assigned to each wrapper.
 *
 * @cssproperty {number} [--c2-marquee--speed=40] - Speed in pixels per second (a positive number without a unit).
 * @cssproperty {pixel} [--c2-marquee__item--gap=32px] - Space after each item.
 * @cssproperty {pixel} [--c2-marquee__viewport--fade=0px] - Length of the fade to transparent at both ends of the strip.
 * @cssproperty {pixel} [--c2-marquee__viewport--height=240px] - Height of a vertical strip.
 * @cssproperty {alignment} [--c2-marquee__item--align=center] - Cross-axis alignment of items of different sizes: start, center, end or stretch. A vertical strip stretches its items until this is set.
 */
@customElement('c2-marquee')
export class Marquee extends LitElement {
  static override styles = unsafeCSS(styles)

  // Items pick their child by hand instead of writing `slot` on it: an attribute written on a child while the page
  // upgrades is one the server never rendered, which React reports as a hydration mismatch.
  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, slotAssignment: 'manual' }

  /** Direction of travel: `horizontal` moves toward the inline start (left in a left-to-right page), `vertical` moves up. */
  @property({ reflect: true }) orientation: MarqueeOrientation = 'horizontal'

  /** Moves the items the other way: toward the inline end, or down. */
  @property({ type: Boolean, reflect: true }) reverse = false

  /** Stops the motion where it is. */
  @property({ type: Boolean, reflect: true }) paused = false

  @state() private items: Element[] = []
  @state() private tracks: ItemTrack[] = []
  @state() private distance = 0
  /** Keyboard focus is inside: the strip stops at rest so the focused item can be scrolled into view. */
  @state() private browsing = false

  private readonly internals = this.attachInternals()
  private mutationObserver?: MutationObserver
  private resizeObserver?: ResizeObserver
  private measureFrame = 0

  constructor() {
    super()
    this.internals.role = 'marquee'
    this.addEventListener('focusin', this.onFocusIn)
    this.addEventListener('focusout', this.onFocusOut)
  }

  // A moving item can hold focus while it is outside the clipped strip, where the focus ring cannot be seen. Keyboard
  // focus therefore lays the strip out at rest, as reduced motion does, and scrolls the item into view. Pointer focus
  // is left alone: moving the layout under a click would send it to another item.
  private readonly onFocusIn = (event: FocusEvent) => {
    const target = event.target
    if (!(target instanceof Element) || !target.matches(':focus-visible')) return
    this.browsing = true
    void this.updateComplete.then(() => target.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  }

  private readonly onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Node && this.contains(next)) return
    if (!this.browsing) return
    this.browsing = false
    const viewport = this.renderRoot.querySelector('.viewport')
    viewport?.scrollTo({ left: 0, top: 0 })
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.mutationObserver = new MutationObserver(() => this.collectItems())
    this.mutationObserver.observe(this, { childList: true })
    this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure())
    // The first render draws no items, as the server did: a server-rendered strip that drew its children in its
    // first client render would not match the markup it hydrates.
    if (this.hasUpdated) {
      this.collectItems()
      // Back in the page with the same children: the new observer has nothing to watch until told.
      this.observeLayout()
    }
  }

  protected override firstUpdated(): void {
    this.collectItems()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mutationObserver?.disconnect()
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.measureFrame)
  }

  private get vertical(): boolean {
    return this.orientation === 'vertical'
  }

  /** False only when the shadow root came from declarative shadow DOM, which is always in named mode. */
  private get manualSlots(): boolean {
    return (this.renderRoot as ShadowRoot).slotAssignment === 'manual'
  }

  private collectItems(): void {
    // Elements that never render (and framework anchors, which are not elements) do not take a place in the loop.
    const items = Array.from(this.children).filter((child) => !NON_RENDERING.has(child.localName))
    // Re-inserting the same children, as a framework re-render may, must not restart the strip.
    if (items.length === this.items.length && items.every((item, index) => item === this.items[index])) return
    this.items = items
  }

  private scheduleMeasure(): void {
    cancelAnimationFrame(this.measureFrame)
    this.measureFrame = requestAnimationFrame(() => this.measure())
  }

  protected override willUpdate(changes: PropertyValues): void {
    // A new set of items or a new axis is laid out again from rest before it moves.
    if (changes.has('items') || changes.has('orientation')) this.tracks = []
  }

  protected override updated(changes: PropertyValues): void {
    if (changes.has('items') || changes.has('orientation')) {
      if (!this.manualSlots) this.items.forEach((item, index) => (item.slot = `item-${index}`))
      this.observeLayout()
    }
    if (changes.has('reverse')) this.scheduleMeasure()
  }

  /** Watches the strip and every item wrapper for size changes, and measures them on the next frame. */
  private observeLayout(): void {
    this.resizeObserver?.disconnect()
    const viewport = this.renderRoot.querySelector('.viewport')
    if (viewport) this.resizeObserver?.observe(viewport)
    this.renderRoot.querySelectorAll('.item').forEach((wrapper) => this.resizeObserver?.observe(wrapper))
    this.scheduleMeasure()
  }

  private measure(): void {
    const viewport = this.renderRoot.querySelector<HTMLElement>('.viewport')
    const wrappers = Array.from(this.renderRoot.querySelectorAll<HTMLElement>('.item'))
    if (!viewport || wrappers.length === 0) return
    // Measured boxes are in screen pixels; the transforms are in the strip's own pixels, which differ under a scaled
    // ancestor.
    const viewBox = viewport.getBoundingClientRect()
    const local = this.vertical ? viewport.offsetHeight : viewport.offsetWidth
    const screen = this.vertical ? viewBox.height : viewBox.width
    const scale = local > 0 && screen > 0 ? screen / local : 1
    const axis = (element: HTMLElement) => {
      const box = element.getBoundingClientRect()
      return (this.vertical ? box.height : box.width) / scale
    }
    const sizes = wrappers.map(axis)
    const view = axis(viewport)
    if (view <= 0 || sizes.every((size) => size <= 0)) return

    const content = sizes.reduce((sum, size) => sum + size, 0)
    // An item must leave the strip completely before it re-enters at the far end, or it would pop into view.
    const cycle = Math.max(content, view + Math.max(...sizes))
    let start = 0
    const tracks = sizes.map((size) => {
      const track = this.reverse
        ? { from: -size, to: cycle - size, phase: ((start + size) / cycle) % 1 }
        : { from: cycle - size, to: -size, phase: ((cycle - size - start) / cycle) % 1 }
      start += size
      return track
    })
    const unchanged = cycle === this.distance && tracks.every((track, index) => sameTrack(track, this.tracks[index]))
    if (unchanged) return
    this.distance = cycle
    this.tracks = tracks
  }

  override render() {
    const running = !this.browsing && this.tracks.length === this.items.length && this.items.length > 0
    return html`
      <div class="viewport ${this.browsing ? 'browsing' : ''}" part="viewport">
        <div class="track ${running ? 'running' : ''}" style=${styleMap({ '--_distance': String(this.distance) })}>
          ${this.items.map((item, index) => {
            const track = running ? this.tracks[index] : undefined
            const position = track ? { '--_from': String(track.from), '--_to': String(track.to), '--_phase': String(track.phase) } : {}
            return html`<div class="item" part="item" style=${styleMap(position)}>
              <slot name=${`item-${index}`} ${assignSlot([item])}></slot>
            </div>`
          })}
        </div>
      </div>
    `
  }
}

const NON_RENDERING = new Set(['template', 'script', 'style', 'link', 'meta'])

function sameTrack(a: ItemTrack, b: ItemTrack | undefined): boolean {
  return !!b && Math.abs(a.from - b.from) < 0.5 && Math.abs(a.to - b.to) < 0.5 && Math.abs(a.phase - b.phase) < 0.0005
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-marquee': Marquee
  }
}
