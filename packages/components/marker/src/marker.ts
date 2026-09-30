import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './marker.scss?inline'

export type MarkerVariant = 'highlight' | 'underline' | 'strike-through' | 'box' | 'circle'

const MARKER_VARIANTS: MarkerVariant[] = ['highlight', 'underline', 'strike-through', 'box', 'circle']

// Both outlines are drawn in a 100×40 box stretched over the text; `pathLength="1"` lets one dash offset draw either.
const BOX_PATH = 'M 1 1 H 99 V 39 H 1 Z'
const CIRCLE_PATH = 'M 86 5 C 60 -1, 16 1, 5 15 C -3 27, 22 39, 54 38 C 86 37, 101 26, 95 13 C 91 5, 72 2, 48 3'

/**
 * Inline marker that draws attention to a run of text the way a pen would: a highlighter stroke behind it, a line
 * under or through it, or a box or loose circle around it. The highlight, underline and strike-through wrap with the
 * text across lines; the box and circle keep the text on one line so the outline encloses it. With `animated`, the mark
 * is drawn the first time the element scrolls into view; it appears without motion when the user prefers reduced
 * motion.
 *
 * The host is announced as a `mark` (a `deletion` for `strike-through`); the drawn outline is decorative.
 *
 * @tag c2-marker
 *
 * @slot - The marked text.
 *
 * @csspart mark - The inline wrapper around the text that carries the highlight, underline and strike-through strokes.
 * @csspart outline - The SVG drawn around the text by the `box` and `circle` variants.
 *
 * @cssproperty {color} [--c2-marker__mark--background-color=rgba(250, 204, 21, 0.4)] - Fill of the `highlight` stroke.
 * @cssproperty {border-radius} [--c2-marker__mark--border-radius=4px] - Corner radius of the `highlight` stroke.
 * @cssproperty {padding} [--c2-marker__mark--padding=0 2px] - Space between the text and the edges of the mark.
 * @cssproperty {color} [--c2-marker__mark--color=inherit] - Text colour of the marked text.
 * @cssproperty {color} [--c2-marker__stroke--color=rgb(2, 101, 220)] - Colour of the underline, strike-through, box and circle strokes.
 * @cssproperty {pixel} [--c2-marker__stroke--width=2px] - Thickness of the underline, strike-through, box and circle strokes.
 * @cssproperty {pixel} [--c2-marker__stroke--offset=4px] - Gap between the text and the box or circle outline.
 * @cssproperty {time} [--c2-marker__mark--transition-duration=600ms] - Time taken to draw the mark when `animated` is set.
 * @cssproperty {time} [--c2-marker__mark--transition-delay=0s] - Delay before the mark starts drawing when `animated` is set.
 * @cssproperty {easing} [--c2-marker__mark--transition-timing-function=cubic-bezier(0.25, 1, 0.5, 1)] - Easing of the drawing motion.
 */
@customElement('c2-marker')
export class Marker extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Kind of mark drawn on the text: `highlight`, `underline`, `strike-through`, `box` or `circle`. */
  @property() variant: MarkerVariant = 'highlight'

  /** Draws the mark the first time the element scrolls into view instead of showing it from the start. */
  @property({ type: Boolean }) animated = false

  /** Whether the mark is drawn. Always true without `animated`; with it, true once the element has been seen. */
  @state() private revealed = false

  private readonly internals = this.attachInternals()

  private observer?: IntersectionObserver

  private get visibleVariant(): MarkerVariant {
    return MARKER_VARIANTS.includes(this.variant) ? this.variant : 'highlight'
  }

  override connectedCallback() {
    super.connectedCallback()
    this.observe()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.stopObserving()
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('variant')) this.internals.role = this.visibleVariant === 'strike-through' ? 'deletion' : 'mark'
    if (changed.has('animated') && this.isConnected) this.observe()
  }

  private observe() {
    this.stopObserving()
    if (!this.animated || this.revealed) return
    if (typeof IntersectionObserver === 'undefined') {
      this.revealed = true
      return
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        this.revealed = true
        this.stopObserving()
      },
      { threshold: 0.5 },
    )
    this.observer.observe(this)
  }

  private stopObserving() {
    this.observer?.disconnect()
    this.observer = undefined
  }

  override render() {
    const variant = this.visibleVariant
    const drawn = !this.animated || this.revealed
    const outline = variant === 'box' ? BOX_PATH : variant === 'circle' ? CIRCLE_PATH : undefined

    return html`<span class="mark mark--${variant}${drawn ? ' is-drawn' : ''}${this.animated ? ' is-animated' : ''}" part="mark"
      ><slot></slot>${
        outline
          ? html`<svg class="outline" part="outline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              ${svg`<path d=${outline} pathLength="1" />`}
            </svg>`
          : nothing
      }</span
    >`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-marker': Marker
  }
}
