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
 * Motion pauses while the pointer is over the strip or focus is inside it, and while `paused` is set. When the
 * reader asks for reduced motion the strip stops and becomes a row that scrolls by hand.
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
 * @cssproperty {alignment} [--c2-marquee__item--align=center] - Cross-axis alignment of items of different sizes: start, center or end.
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

  private readonly internals = this.attachInternals()
  private mutationObserver?: MutationObserver
  private resizeObserver?: ResizeObserver
  private measureFrame = 0

  constructor() {
    super()
    this.internals.role = 'marquee'
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.mutationObserver = new MutationObserver(() => this.collectItems())
    this.mutationObserver.observe(this, { childList: true })
    this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure())
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
    this.items = Array.from(this.children)
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
      this.resizeObserver?.disconnect()
      const viewport = this.renderRoot.querySelector('.viewport')
      if (viewport) this.resizeObserver?.observe(viewport)
      this.renderRoot.querySelectorAll('.item').forEach((wrapper) => this.resizeObserver?.observe(wrapper))
      this.scheduleMeasure()
    }
    if (changes.has('reverse')) this.scheduleMeasure()
  }

  private measure(): void {
    const viewport = this.renderRoot.querySelector<HTMLElement>('.viewport')
    const wrappers = Array.from(this.renderRoot.querySelectorAll<HTMLElement>('.item'))
    if (!viewport || wrappers.length === 0) return
    const axis = (element: HTMLElement) => {
      const box = element.getBoundingClientRect()
      return this.vertical ? box.height : box.width
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
    const running = this.tracks.length === this.items.length && this.items.length > 0
    return html`
      <div class="viewport" part="viewport">
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

function sameTrack(a: ItemTrack, b: ItemTrack | undefined): boolean {
  return !!b && Math.abs(a.from - b.from) < 0.5 && Math.abs(a.to - b.to) < 0.5 && Math.abs(a.phase - b.phase) < 0.0005
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-marquee': Marquee
  }
}
