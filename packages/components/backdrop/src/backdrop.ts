import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './backdrop.scss?inline'

/** What the backdrop draws. */
export type BackdropPattern = 'dots' | 'grid' | 'stripes' | 'flicker' | 'aurora' | 'meteors'

/** A meteor's start, as a share of the box, and its timing. */
interface Meteor {
  left: number
  top: number
  delay: number
  duration: number
}

/**
 * A container that draws a decorative background behind its content: a hero, a landing section, an empty state. The
 * content sits above the pattern, in normal flow.
 *
 * `pattern` picks what is drawn: `dots`, `grid` and `stripes` are still; `flicker` lights squares of a fine grid at
 * random, `aurora` drifts soft colour, and `meteors` sends streaks across now and then. Colours, spacing and the fade
 * are CSS variables: by default the pattern fades toward the edges (`--c2-backdrop__mask--image`), and its colour is a
 * grey that reads in both themes.
 *
 * The pattern is hidden from assistive technology and never takes focus or the pointer. A moving pattern stops while
 * it is off screen or the page is hidden, and under reduced motion it stays still.
 *
 * @tag c2-backdrop
 *
 * @slot - The content drawn above the pattern.
 *
 * @csspart pattern - The pattern layer.
 * @csspart content - The box around the content.
 *
 * @cssproperty {color} [--c2-backdrop--color=rgba(113, 113, 122, 0.35)] - The dots, lines and squares.
 * @cssproperty {pixel} [--c2-backdrop--size=16px] - The spacing of the dots, grid, stripes and flicker squares.
 * @cssproperty {pixel} [--c2-backdrop__dot--size=1px] - The radius of a dot.
 * @cssproperty {pixel} [--c2-backdrop__line--width=1px] - The width of a grid or stripe line.
 * @cssproperty {background} [--c2-backdrop__mask--image=radial-gradient(ellipse at center, #000 35%, transparent 80%)] - Fades the pattern; `none` keeps it even.
 * @cssproperty {color} [--c2-backdrop--background=transparent] - Behind the pattern.
 * @cssproperty {color} [--c2-backdrop__flicker--color=rgb(2, 101, 220)] - The squares that light up.
 * @cssproperty {number} [--c2-backdrop__flicker--opacity=0.6] - The brightest a square gets.
 * @cssproperty {color} [--c2-backdrop__aurora--color-1=#60a5fa]
 * @cssproperty {color} [--c2-backdrop__aurora--color-2=#c084fc]
 * @cssproperty {color} [--c2-backdrop__aurora--color-3=#34d399]
 * @cssproperty {number} [--c2-backdrop__aurora--opacity=0.5]
 * @cssproperty {pixel} [--c2-backdrop__aurora--blur=48px]
 * @cssproperty {time} [--c2-backdrop__aurora--duration=18s] - One drift of the aurora.
 * @cssproperty {color} [--c2-backdrop__meteor--color=#71717a]
 * @cssproperty {number} [--c2-backdrop__meteor--count=12] - How many meteors there are.
 * @cssproperty {pixel} [--c2-backdrop__meteor--length=80px]
 * @cssproperty {padding} [--c2-backdrop--padding=0px] - Space around the content.
 */
@customElement('c2-backdrop')
export class Backdrop extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `dots`, `grid`, `stripes`, `flicker`, `aurora` or `meteors`. */
  @property() pattern: BackdropPattern = 'dots'

  /** The meteors, made on the client so a server render stays the same as the first client render. */
  @state() private meteors: Meteor[] = []
  @state() private paused = false

  private observer: IntersectionObserver | null = null
  private resizes: ResizeObserver | null = null
  private reducedQuery: MediaQueryList | null = null
  private onScreen = true
  private frame = 0
  private lastFlicker = 0
  /** The flicker grid: one opacity per square, and the target each eases toward. */
  private cells: { value: number; target: number }[] = []
  private columns = 0
  private rows = 0

  override connectedCallback(): void {
    super.connectedCallback()
    this.reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedQuery.addEventListener('change', this.sync)
    document.addEventListener('visibilitychange', this.sync)
    this.observer = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((entry) => entry.isIntersecting)
      this.sync()
    })
    this.observer.observe(this)
    this.resizes = new ResizeObserver(() => this.layoutFlicker())
    this.resizes.observe(this)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.reducedQuery?.removeEventListener('change', this.sync)
    document.removeEventListener('visibilitychange', this.sync)
    this.observer?.disconnect()
    this.resizes?.disconnect()
    this.stopFlicker()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('pattern')) {
      if (this.pattern === 'meteors' && !this.meteors.length) this.makeMeteors()
      this.layoutFlicker()
      this.sync()
    }
  }

  private get reduced(): boolean {
    return this.reducedQuery?.matches ?? false
  }

  /** Runs or pauses the moving patterns. */
  private readonly sync = (): void => {
    const paused = !this.onScreen || document.visibilityState === 'hidden' || this.reduced
    if (paused !== this.paused) this.paused = paused
    if (this.pattern === 'flicker' && !paused) this.startFlicker()
    else this.stopFlicker()
    if (this.pattern === 'flicker') this.drawFlicker()
  }

  private makeMeteors(): void {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue('--c2-backdrop__meteor--count'))
    const count = Math.max(0, Math.min(60, Math.round(Number.isFinite(value) ? value : 12)))
    this.meteors = Array.from({ length: count }, () => ({
      left: Math.random() * 110,
      top: Math.random() * 60 - 20,
      delay: Math.random() * 8,
      duration: 3 + Math.random() * 6,
    }))
  }

  private get canvas(): HTMLCanvasElement | null {
    return this.renderRoot?.querySelector('canvas') ?? null
  }

  /** The flicker's look, read once per layout rather than every frame. */
  private look = { size: 16, color: 'rgba(113, 113, 122, 0.35)', lit: 'rgb(2, 101, 220)', opacity: 0.6 }

  /** Sizes the flicker canvas to the box, one cell per `--c2-backdrop--size`, and reads its colours. */
  private layoutFlicker(): void {
    const canvas = this.canvas
    if (!canvas || this.pattern !== 'flicker') return
    // The probe resolves the size in any unit (`1rem`, `2em`) to pixels; cells under 4px would be thousands a row.
    const probe = this.renderRoot.querySelector<HTMLElement>('.probe')
    const size = Math.max(4, probe?.getBoundingClientRect().width || 16)
    const style = getComputedStyle(canvas)
    const opacity = Number.parseFloat(style.getPropertyValue('--_lit-opacity'))
    this.look = {
      size,
      color: style.color,
      lit: style.getPropertyValue('--_lit').trim() || 'rgb(2, 101, 220)',
      opacity: Number.isFinite(opacity) ? opacity : 0.6,
    }
    const ratio = window.devicePixelRatio || 1
    const width = this.clientWidth
    const height = this.clientHeight
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    this.columns = Math.ceil(width / size)
    this.rows = Math.ceil(height / size)
    this.cells = Array.from({ length: this.columns * this.rows }, (_value, index) => this.cells[index] ?? { value: 0, target: 0 })
    this.drawFlicker()
  }

  private startFlicker(): void {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick)
  }

  private stopFlicker(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private readonly tick = (time: number): void => {
    this.frame = 0
    // A few squares change target ten times a second; every square eases toward its target each frame.
    if (time - this.lastFlicker > 100) {
      this.lastFlicker = time
      for (let pick = 0; pick < Math.max(1, this.cells.length / 40); pick += 1) {
        const cell = this.cells[Math.floor(Math.random() * this.cells.length)]
        if (cell) cell.target = Math.random() < 0.5 ? 0 : Math.random()
      }
    }
    for (const cell of this.cells) cell.value += (cell.target - cell.value) * 0.08
    this.drawFlicker()
    if (!this.paused) this.startFlicker()
  }

  private drawFlicker(): void {
    const canvas = this.canvas
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const { size, color, lit, opacity } = this.look
    const ratio = window.devicePixelRatio || 1
    const square = Math.max(2, size / 4) * ratio
    const at = (index: number) => (index * size + size / 2) * ratio - square / 2
    context.clearRect(0, 0, canvas.width, canvas.height)
    // Resting squares in the pattern colour, then the lit ones over them in the flicker colour.
    context.fillStyle = color
    for (let row = 0; row < this.rows; row += 1) for (let column = 0; column < this.columns; column += 1) context.fillRect(at(column), at(row), square, square)
    context.fillStyle = lit
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const cell = this.cells[row * this.columns + column]
        if (!cell || cell.value <= 0.02) continue
        context.globalAlpha = Math.min(1, cell.value) * opacity
        context.fillRect(at(column), at(row), square, square)
      }
    }
    context.globalAlpha = 1
  }

  private renderPattern() {
    const classes = `pattern ${this.pattern}${this.paused ? ' paused' : ''}`
    switch (this.pattern) {
      case 'flicker':
        return html`<div class=${classes} part="pattern" aria-hidden="true"><canvas></canvas><span class="probe"></span></div>`
      case 'aurora':
        return html`<div class=${classes} part="pattern" aria-hidden="true">
          <div class="blobs"><span class="blob one"></span><span class="blob two"></span><span class="blob three"></span></div>
        </div>`
      case 'meteors':
        return html`<div class=${classes} part="pattern" aria-hidden="true">
          ${this.meteors.map(
            (meteor) =>
              html`<span
                class="meteor"
                style="left: ${meteor.left.toFixed(1)}%; top: ${meteor.top.toFixed(1)}%; animation-delay: ${meteor.delay.toFixed(2)}s; animation-duration: ${meteor.duration.toFixed(2)}s"
              ></span>`,
          )}
        </div>`
      default:
        return html`<div class=${classes} part="pattern" aria-hidden="true"></div>`
    }
  }

  override render() {
    return html`${this.renderPattern()}
      <div class="content" part="content"><slot></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-backdrop': Backdrop
  }
}
