import { LitElement, html, unsafeCSS } from 'lit'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './celebration.scss?inline'

/** What a celebration throws. */
export type CelebrationKind = 'confetti' | 'burst' | 'emoji'

/** Where and how `fire()` plays. */
export interface CelebrationOptions {
  /** The origin, in viewport pixels. The element's centre without it. */
  x?: number
  y?: number
  /** Overrides `kind` for this one. */
  kind?: CelebrationKind
}

/** Events fired by {@link Celebration}, keyed for `addEventListener`. */
export interface CelebrationEventMap {
  'celebration-end': CustomEvent<void>
}

export interface Celebration {
  addEventListener: TypedAddEventListener<Celebration, CelebrationEventMap>
  removeEventListener: TypedRemoveEventListener<Celebration, CelebrationEventMap>
}

interface Particle {
  kind: CelebrationKind
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  spin: number
  size: number
  color: string
  glyph: string
  born: number
  life: number
  shape: number
}

const DEFAULT_EMOJI = ['🎉', '✨', '👏']

/** Splits a comma-separated list of colours, leaving the commas inside `rgb(…)` alone. */
function splitColors(value: string): string[] {
  const colors: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      if (current.trim()) colors.push(current.trim())
      current = ''
    } else current += char
  }
  if (current.trim()) colors.push(current.trim())
  return colors
}

/**
 * Confetti, a burst of sparks or rising emoji for a moment worth marking: a goal reached, a deal won, a first project
 * shipped.
 *
 * Call `fire()` to play it from the element's centre, or from `{ x, y }` in viewport pixels; or set `trigger="click"`
 * and wrap a button, and it plays from wherever the reader clicks. `kind` picks `confetti` (thrown up, then falling
 * with gravity, drift and spin), `burst` (a ring of sparks that fade fast) or `emoji` (the `emoji` list rises and
 * fades; each call adds more, so it also streams reactions). `celebration-end` fires when the last particle is gone.
 *
 * It draws on one canvas in the top layer, shown only while particles are alive, so a dialog or an `overflow: hidden`
 * parent never clips it, and the pointer goes through. Colours, count, spread and duration are CSS variables. It is
 * decorative, and says nothing to assistive technology: announce the success in your own words. Under reduced motion
 * nothing is drawn, and `celebration-end` still fires.
 *
 * @tag c2-celebration
 *
 * @slot - The content it wraps, such as the button that fires it with `trigger="click"`.
 *
 * @event {CustomEvent<void>} celebration-end - Fired when the last particle is gone. Does not bubble.
 *
 * @cssproperty {color} [--c2-celebration--colors=rgb(2, 101, 220), #f59e0b, #10b981, #ec4899, #8b5cf6] - A comma-separated list the confetti and sparks take their colours from.
 * @cssproperty {number} [--c2-celebration--count=80] - Particles per confetti fire; a burst throws a third, emoji a tenth.
 * @cssproperty {angle} [--c2-celebration--spread=70deg] - How wide the confetti is thrown.
 * @cssproperty {time} [--c2-celebration--duration=2500ms] - How long a particle lives.
 * @cssproperty {pixel} [--c2-celebration__emoji--size=28px]
 * @cssproperty {pixel} [--c2-celebration__confetti--size=8px]
 */
@customElement('c2-celebration')
export class Celebration extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `confetti`, `burst` or `emoji`. */
  @property() kind: CelebrationKind = 'confetti'

  /** `click` plays it from wherever the reader clicks inside the element; `none` waits for `fire()`. */
  @property() trigger: 'none' | 'click' = 'none'

  /** The emoji that `kind="emoji"` throws. Default: 🎉 ✨ 👏. */
  @property({ converter: arrayPropertyConverter }) emoji: string[] = []

  private particles: Particle[] = []
  private frame = 0
  private ratio = 1

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener('click', this.handleClick)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('click', this.handleClick)
    this.particles = []
    this.finish(false)
  }

  /** Whether particles are on screen. */
  get playing(): boolean {
    return this.particles.length > 0
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.trigger !== 'click') return
    // A click from the keyboard has no pointer position: play from the centre.
    const fromPointer = event.detail > 0 && (event.clientX !== 0 || event.clientY !== 0)
    this.fire(fromPointer ? { x: event.clientX, y: event.clientY } : {})
  }

  private number(name: string, fallback: number): number {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }

  private duration(): number {
    const value = getComputedStyle(this).getPropertyValue('--c2-celebration--duration').trim()
    const number = Number.parseFloat(value)
    if (!Number.isFinite(number)) return 2500
    return value.endsWith('ms') ? number : value.endsWith('s') ? number * 1000 : number
  }

  /** Plays the celebration from the element's centre, or from `options.x`/`options.y`. */
  fire(options: CelebrationOptions = {}): void {
    if (!this.isConnected) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      queueMicrotask(() => this.dispatchEvent(new CustomEvent('celebration-end')))
      return
    }
    const box = this.getBoundingClientRect()
    const x = options.x ?? box.left + box.width / 2
    const y = options.y ?? box.top + box.height / 2
    const kind = options.kind ?? this.kind
    const now = performance.now()
    const life = this.duration()
    const style = getComputedStyle(this)
    const colors = splitColors(style.getPropertyValue('--c2-celebration--colors'))
    const palette = colors.length ? colors : ['rgb(2, 101, 220)', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']
    const count = Math.max(1, Math.min(400, Math.round(this.number('--c2-celebration--count', 80))))
    const spread = (this.number('--c2-celebration--spread', 70) * Math.PI) / 180
    const confettiSize = this.number('--c2-celebration__confetti--size', 8)
    const emojiSize = this.number('--c2-celebration__emoji--size', 28)
    const glyphs = this.emoji.length ? this.emoji : DEFAULT_EMOJI
    const random = (from: number, to: number) => from + Math.random() * (to - from)
    if (kind === 'confetti') {
      for (let index = 0; index < count; index += 1) {
        const angle = -Math.PI / 2 + random(-spread, spread)
        const speed = random(7, 15)
        this.particles.push({
          kind,
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          angle: random(0, Math.PI * 2),
          spin: random(-0.3, 0.3),
          size: confettiSize * random(0.7, 1.2),
          color: palette[index % palette.length],
          glyph: '',
          born: now,
          life: life * random(0.8, 1.1),
          shape: index % 3,
        })
      }
    } else if (kind === 'burst') {
      const sparks = Math.max(8, Math.round(count / 3))
      for (let index = 0; index < sparks; index += 1) {
        const angle = (index / sparks) * Math.PI * 2
        const speed = random(4, 6)
        this.particles.push({
          kind,
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          angle,
          spin: 0,
          size: confettiSize * 2,
          color: palette[index % palette.length],
          glyph: '',
          born: now,
          life: life * 0.3,
          shape: 0,
        })
      }
    } else {
      const rising = Math.max(3, Math.round(count / 10))
      for (let index = 0; index < rising; index += 1) {
        this.particles.push({
          kind,
          x: x + random(-16, 16),
          y,
          vx: random(-0.6, 0.6),
          vy: random(-3.2, -2),
          angle: random(0, Math.PI * 2),
          spin: random(0.03, 0.08),
          size: emojiSize * random(0.85, 1.15),
          color: '',
          glyph: glyphs[index % glyphs.length],
          born: now + index * 90,
          life: life * 0.9,
          shape: 0,
        })
      }
    }
    this.show()
  }

  private get canvas(): HTMLCanvasElement | null {
    return this.renderRoot?.querySelector('canvas') ?? null
  }

  private show(): void {
    const canvas = this.canvas
    // Fired before the first render: draw once there is a canvas.
    if (!canvas) {
      void this.updateComplete.then(() => {
        if (this.canvas && this.particles.length) this.show()
      })
      return
    }
    this.ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(window.innerWidth * this.ratio)
    canvas.height = Math.round(window.innerHeight * this.ratio)
    try {
      if (!canvas.matches(':popover-open')) canvas.showPopover()
    } catch {
      // Without popover support the canvas is fixed on top by its own styles.
    }
    canvas.classList.add('active')
    if (!this.frame) this.frame = requestAnimationFrame(this.tick)
  }

  private finish(notify: boolean): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    const canvas = this.canvas
    if (canvas) {
      canvas.classList.remove('active')
      try {
        if (canvas.matches(':popover-open')) canvas.hidePopover()
      } catch {
        // No popover support.
      }
    }
    if (notify) this.dispatchEvent(new CustomEvent('celebration-end'))
  }

  private readonly tick = (time: number): void => {
    this.frame = 0
    const canvas = this.canvas
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = this.ratio
    context.clearRect(0, 0, canvas.width, canvas.height)
    this.particles = this.particles.filter((particle) => time - particle.born < particle.life)
    for (const particle of this.particles) {
      const age = time - particle.born
      if (age < 0) continue
      const progress = age / particle.life
      if (particle.kind === 'confetti') {
        particle.vy += 0.32
        particle.vx *= 0.985
        particle.vy *= 0.985
        particle.x += particle.vx + Math.sin(age / 180 + particle.angle) * 0.6
        particle.y += particle.vy
        particle.angle += particle.spin
        context.save()
        context.globalAlpha = progress > 0.75 ? (1 - progress) / 0.25 : 1
        context.translate(particle.x * ratio, particle.y * ratio)
        context.rotate(particle.angle)
        // Flat ribbons tilt through their spin, which reads as a 3D flutter.
        context.scale(1, Math.cos(particle.angle * 2))
        context.fillStyle = particle.color
        const size = particle.size * ratio
        if (particle.shape === 0) context.fillRect(-size / 4, -size, size / 2, size * 2)
        else if (particle.shape === 1) context.fillRect(-size / 2, -size / 2, size, size)
        else {
          context.beginPath()
          context.arc(0, 0, size / 2, 0, Math.PI * 2)
          context.fill()
        }
        context.restore()
      } else if (particle.kind === 'burst') {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vx *= 0.9
        particle.vy *= 0.9
        context.save()
        context.globalAlpha = 1 - progress
        context.strokeStyle = particle.color
        context.lineWidth = 3 * ratio
        context.lineCap = 'round'
        context.beginPath()
        context.moveTo(particle.x * ratio, particle.y * ratio)
        context.lineTo((particle.x - particle.vx * 3) * ratio, (particle.y - particle.vy * 3) * ratio)
        context.stroke()
        context.restore()
      } else {
        particle.x += particle.vx + Math.sin(age / 240 + particle.angle) * 0.5
        particle.y += particle.vy
        context.save()
        context.globalAlpha = progress < 0.7 ? 1 : (1 - progress) / 0.3
        context.font = `${particle.size * ratio}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(particle.glyph, particle.x * ratio, particle.y * ratio)
        context.restore()
      }
    }
    if (this.particles.length) this.frame = requestAnimationFrame(this.tick)
    else this.finish(true)
  }

  override render() {
    return html`<slot></slot><canvas class="stage" popover="manual" aria-hidden="true"></canvas>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-celebration': Celebration
  }
}
