import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import styles from './beam.scss?inline'

interface Point {
  x: number
  y: number
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface BeamGeometry {
  start: Point
  control: Point
  end: Point
}

/**
 * Animated connector between two elements: a line from one box to the other, with a light that travels along it.
 * Use it for data-flow and integration diagrams, where icons or cards are laid out with ordinary CSS and the beams
 * show how they connect.
 *
 * Put the beam inside the positioned container that holds both elements (`position: relative`); it covers that
 * container and lets the pointer through. `from` and `to` name the two elements by `id`, looked up in the same
 * document or shadow root. The line runs from edge to edge of the two boxes, so it never crosses their content.
 *
 * The beam redraws when the container or either element changes size, and finds an element added after it. Call
 * `redraw()` after moving an element without resizing anything, or after moving an `id` to another element. When the reader asks for reduced motion only the line is drawn.
 *
 * @tag c2-beam
 *
 * @csspart track - The resting line between the two elements.
 * @csspart beam - The light that travels along the line.
 *
 * @cssproperty {color} [--c2-beam__track--color=#e4e4e7] - Colour of the resting line.
 * @cssproperty {pixel} [--c2-beam__track--width=2px] - Thickness of the resting line.
 * @cssproperty {color} [--c2-beam__beam--color-from=#0265dc] - Colour of the light near the `from` element.
 * @cssproperty {color} [--c2-beam__beam--color-to=#60a5fa] - Colour of the light near the `to` element.
 * @cssproperty {pixel} [--c2-beam__beam--width=2px] - Thickness of the light.
 * @cssproperty {number} [--c2-beam__beam--length=20] - Length of the light as a share of the line, from 0 to 100.
 * @cssproperty {time} [--c2-beam__beam--duration=3s] - Time the light takes to travel the line once.
 * @cssproperty {time} [--c2-beam__beam--delay=0s] - Delay before the light starts; a negative value starts it partway along.
 * @cssproperty {integer} [--c2-beam--z-index=0] - Stacking level of the connector in its container.
 */
@customElement('c2-beam')
export class Beam extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `id` of the element the beam starts from. */
  @property() from = ''

  /** `id` of the element the beam ends at. */
  @property() to = ''

  /**
   * Bend of the line, in pixels: how far the curve's control point sits from the straight line's middle. The line
   * itself bulges about half that far. Positive values bend it to the left of the direction of travel (up for a beam
   * running left to right), negative values to the right.
   */
  @property({ type: Number }) curvature = 0

  /** Sends the light from `to` back to `from`. */
  @property({ type: Boolean, reflect: true }) reverse = false

  @state() private geometry?: BeamGeometry

  private fromElement: Element | null = null
  private toElement: Element | null = null
  private resizeObserver?: ResizeObserver
  private mutationObserver?: MutationObserver
  private frame = 0

  override connectedCallback(): void {
    super.connectedCallback()
    this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure())
    this.resizeObserver.observe(this)
    // Either element may be added after the beam (or removed and added back): look again while one is missing.
    this.mutationObserver = new MutationObserver(() => this.resolve())
    this.resolve()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.mutationObserver?.disconnect()
    cancelAnimationFrame(this.frame)
    this.fromElement = this.toElement = null
  }

  protected override updated(changes: PropertyValues<this>): void {
    if (changes.has('from') || changes.has('to')) this.resolve()
    else if (changes.has('curvature')) this.scheduleMeasure()
  }

  /**
   * Looks both elements up by `id` again, measures them and redraws the line on the next animation frame. Call it
   * after moving an element without resizing anything, or after giving an `id` to a different element.
   */
  redraw(): void {
    this.resolve()
  }

  private scheduleMeasure(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.measure())
  }

  private lookup(id: string): Element | null {
    if (!id) return null
    const root = this.getRootNode()
    return root instanceof Document || root instanceof ShadowRoot ? root.getElementById(id) : null
  }

  private resolve(): void {
    const from = this.lookup(this.from)
    const to = this.lookup(this.to)
    if (from !== this.fromElement || to !== this.toElement) {
      for (const element of [this.fromElement, this.toElement]) if (element) this.resizeObserver?.unobserve(element)
      this.fromElement = from
      this.toElement = to
      for (const element of [from, to]) if (element) this.resizeObserver?.observe(element)
    }
    // Watching the whole root costs a lookup per mutation, so it runs only while an end is missing.
    this.mutationObserver?.disconnect()
    const root = this.getRootNode()
    const missing = (this.from && !from) || (this.to && !to)
    if (missing && this.isConnected && (root instanceof Document || root instanceof ShadowRoot)) {
      this.mutationObserver?.observe(root, { childList: true, subtree: true })
    }
    this.scheduleMeasure()
  }

  private measure(): void {
    const from = this.fromElement?.getBoundingClientRect()
    const to = this.toElement?.getBoundingClientRect()
    if (!from || !to || isEmpty(from) || isEmpty(to)) {
      this.geometry = undefined
      return
    }
    // Boxes are measured in screen pixels and the line is drawn in the beam's own, which differ under a scaled
    // ancestor.
    const origin = this.getBoundingClientRect()
    const scaleX = this.offsetWidth > 0 && origin.width > 0 ? origin.width / this.offsetWidth : 1
    const scaleY = this.offsetHeight > 0 && origin.height > 0 ? origin.height / this.offsetHeight : 1
    const local = (rect: DOMRect): Box => ({
      x: (rect.x - origin.x) / scaleX,
      y: (rect.y - origin.y) / scaleY,
      width: rect.width / scaleX,
      height: rect.height / scaleY,
    })
    const fromBox = local(from)
    const toBox = local(to)
    const a = { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fromBox.height / 2 }
    const b = { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height / 2 }
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy) || 1
    const bend = Number.isFinite(this.curvature) ? this.curvature : 0
    // The normal on the left of the direction of travel, in screen coordinates (y grows downward).
    const control = { x: (a.x + b.x) / 2 + (dy / length) * bend, y: (a.y + b.y) / 2 - (dx / length) * bend }
    this.geometry = {
      start: edgePoint(a, fromBox, control),
      control,
      end: edgePoint(b, toBox, control),
    }
  }

  override render() {
    const geometry = this.geometry
    if (!geometry) return nothing
    const { start, control, end } = geometry
    const d = `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`
    return html`
      <svg class="beam-layer" aria-hidden="true" focusable="false">
        <defs>
          ${svg`<linearGradient
            id="gradient"
            gradientUnits="userSpaceOnUse"
            x1=${round(start.x)}
            y1=${round(start.y)}
            x2=${round(end.x)}
            y2=${round(end.y)}
          >
            <stop class="stop-from" offset="0"></stop>
            <stop class="stop-to" offset="1"></stop>
          </linearGradient>`}
        </defs>
        ${svg`<path class="track" part="track" d=${d}></path>`} ${svg`<path class="beam" part="beam" d=${d} pathLength="100" stroke="url(#gradient)"></path>`}
      </svg>
    `
  }
}

function isEmpty(rect: DOMRect): boolean {
  return rect.width === 0 && rect.height === 0
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** Where a ray from the centre of `box` toward `target` leaves the box. */
function edgePoint(center: Point, box: Box, target: Point): Point {
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (dx === 0 && dy === 0) return center
  const tx = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx)
  const ty = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy)
  const t = Math.min(tx, ty, 1)
  return { x: center.x + dx * t, y: center.y + dy * t }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-beam': Beam
  }
}
