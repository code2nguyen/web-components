import { LitElement, html, nothing, unsafeCSS } from 'lit'
import type { PropertyValues, TemplateResult } from 'lit'
import { jsonPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './working-indicator.scss?inline'

export type WorkingIndicatorIndicator = 'glyph' | 'dots' | 'ring' | 'pulse' | 'orbit' | 'none'
export type WorkingIndicatorEffect = 'shimmer' | 'wave' | 'pulse' | 'fill' | 'none'
export type WorkingIndicatorEllipsis = 'fade' | 'bounce' | 'static' | 'none'
export type WorkingIndicatorState = 'running' | 'paused' | 'done' | 'error'

/** Characters the `glyph` indicator steps through, out and back, so the loop has no visible seam. */
const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']

/** Keyframes whose iterations advance `messages` (the fade, and its still twin under reduced motion). Other animations bubble the same event. */
const ROTATE_ANIMATIONS = new Set(['c2-working-indicator-rotate', 'c2-working-indicator-hold'])

const DEFAULT_LABEL = 'Working'

/** `12s`, `1m 05s`, `1h 02m`. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/**
 * A live "work in progress" line: an animated indicator, a label that shimmers, waves or fills while the work runs,
 * trailing dots and an optional elapsed-time counter, like an agent's "✻ Scheming… 12s". Give it several `messages`
 * and it rotates through them. When the work ends, set `state` to `done` or `error`: the animations stop, the
 * indicator turns into a check or a cross, and the line stays as a record.
 *
 * The element is a polite live region (`role="status"`) that announces the label and state changes only, never the
 * rotating messages or the counter. With a `value` it becomes a progress bar whose label fills to that fraction.
 * Every animation stops under `prefers-reduced-motion`.
 *
 * @tag c2-working-indicator
 *
 * @slot - Label content, used instead of `label`/`messages`. The `wave` effect needs plain `label` text to split into letters.
 * @slot indicator - Custom indicator replacing the built-in one while the work is running or paused.
 * @slot done-icon - Mark shown in the `done` state. Defaults to a check.
 * @slot error-icon - Mark shown in the `error` state. Defaults to a cross.
 * @slot meta - Supporting text after the label and the elapsed time, e.g. "esc to interrupt".
 *
 * @csspart indicator - Box around the built-in indicator, the indicator slot that replaces it, and the done-icon and error-icon slots.
 * @csspart label - Text container of the label: it wraps the label text, or the default slot content that replaces it.
 * @csspart ellipsis - The trailing dots.
 * @csspart meta - Container placed after the label, wrapping the elapsed time and the meta slot.
 * @csspart elapsed - The elapsed-time counter.
 *
 * @cssproperty {pixel} [--c2-working-indicator--gap=8px] - Space between the indicator, the label and the meta text.
 * @cssproperty {font-size} [--c2-working-indicator--font-size=14px]
 * @cssproperty {font-weight} [--c2-working-indicator--font-weight=500]
 * @cssproperty {color} [--c2-working-indicator__indicator--color=#0265dc] - Colour of the running indicator.
 * @cssproperty {pixel} [--c2-working-indicator__indicator--size=16px] - Width and height of the indicator box.
 * @cssproperty {time} [--c2-working-indicator__indicator--animation-duration=1.2s] - One indicator cycle.
 * @cssproperty {color} [--c2-working-indicator__label--color=#71717a] - Resting colour of the label.
 * @cssproperty {color} [--c2-working-indicator__label--highlight-color=#18181b] - Shimmer band, wave crest and filled part of the label.
 * @cssproperty {time} [--c2-working-indicator__label--animation-duration=2s] - One shimmer, wave, pulse or fill cycle.
 * @cssproperty {time} [--c2-working-indicator__label--stagger=0.06s] - Delay between two letters of the `wave` effect.
 * @cssproperty {time} [--c2-working-indicator__label--rotate-duration=3s] - How long each of the `messages` stays on screen.
 * @cssproperty {time} [--c2-working-indicator__ellipsis--animation-duration=1.4s] - One cycle of the trailing dots.
 * @cssproperty {color} [--c2-working-indicator__meta--color=#71717a] - Colour of the elapsed time and the meta text.
 * @cssproperty {font-size} [--c2-working-indicator__meta--font-size=12px]
 * @cssproperty {color} [--c2-working-indicator__done--color=#16a34a] - Colour of the done mark.
 * @cssproperty {color} [--c2-working-indicator__error--color=#dc2626] - Colour of the error mark.
 */
@customElement('c2-working-indicator')
export class WorkingIndicator extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Text of the line. Defaults to "Working" when neither `messages` nor slotted content is given. */
  @property() label = ''

  /** Labels to rotate through while running, e.g. `["Scheming","Pondering"]`. Overrides `label` while running. */
  @property({ converter: jsonPropertyConverter }) messages: string[] | undefined = undefined

  /** Animated mark before the label: `glyph`, `dots`, `ring`, `pulse`, `orbit` or `none`. */
  @property({ reflect: true }) indicator: WorkingIndicatorIndicator = 'glyph'

  /** How the label animates while running: `shimmer`, `wave`, `pulse`, `fill` or `none`. */
  @property({ reflect: true }) effect: WorkingIndicatorEffect = 'shimmer'

  /** Trailing dots: `fade`, `bounce`, `static` (a still "…") or `none`. */
  @property({ reflect: true }) ellipsis: WorkingIndicatorEllipsis = 'fade'

  /** `running`, `paused` (animations and counter freeze), `done` or `error`. */
  @property({ reflect: true }) state: WorkingIndicatorState = 'running'

  /** Label shown in the `done` and `error` states, e.g. "Schemed for 14s". Defaults to the running label. */
  @property({ attribute: 'done-label' }) doneLabel = ''

  /** Shows the time spent running after the label. */
  @property({ type: Boolean }) elapsed = false

  /** Start of the work as a millisecond timestamp, so a re-rendered line keeps counting from the real start. */
  @property({ type: Number }) started: number | undefined = undefined

  /** Progress between `0` and `max`. Makes the line a progress bar; the `fill` effect then fills to this fraction. */
  @property({ type: Number }) value: number | undefined = undefined

  /** Value that fills the whole label. */
  @property({ type: Number }) max = 100

  private readonly internals = this.attachInternals()
  private readonly slotPresence = new SlotPresenceController(this, ['', 'meta'])

  private messageIndex = 0
  private seconds = 0
  /** Timestamp the counter measures from; moved forward on resume so paused time is not counted. */
  private startedAt: number | undefined = undefined
  private timer: ReturnType<typeof setInterval> | undefined = undefined

  /** Completed fraction, `0` to `1`; `undefined` without a `value`. */
  get fraction(): number | undefined {
    if (this.value === undefined || this.value === null || Number.isNaN(this.value)) return undefined
    const max = this.max > 0 ? this.max : 100
    return Math.min(1, Math.max(0, this.value / max))
  }

  /** The label currently on screen. */
  get currentLabel(): string {
    const finished = this.state === 'done' || this.state === 'error'
    if (finished && this.doneLabel) return this.doneLabel
    const messages = this.messages?.filter((message) => typeof message === 'string' && message) ?? []
    if (messages.length && !finished) return messages[this.messageIndex % messages.length]
    return this.label || messages[0] || DEFAULT_LABEL
  }

  override connectedCallback() {
    super.connectedCallback()
    this.syncTimer()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.stopTimer()
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('messages')) this.messageIndex = 0
    if (changed.has('state') || changed.has('elapsed') || changed.has('started')) {
      const previous = changed.get('state') as WorkingIndicatorState | undefined
      if (changed.has('started') || (this.state === 'running' && previous !== undefined && previous !== 'paused')) this.startedAt = undefined
      if (this.state === 'running' && previous === 'paused' && this.startedAt !== undefined) this.startedAt = Date.now() - this.seconds * 1000
      this.syncTimer()
    }
    this.syncInternals()
  }

  private syncInternals() {
    const fraction = this.fraction
    const max = this.max > 0 ? this.max : 100
    this.internals.role = fraction === undefined ? 'status' : 'progressbar'
    this.internals.ariaValueMin = fraction === undefined ? null : '0'
    this.internals.ariaValueMax = fraction === undefined ? null : String(max)
    this.internals.ariaValueNow = fraction === undefined ? null : String(fraction * max)
    this.internals.ariaBusy = this.state === 'running' ? 'true' : 'false'
  }

  private syncTimer() {
    if (!this.isConnected || !this.elapsed) {
      this.stopTimer()
      return
    }
    if (this.startedAt === undefined && this.state !== 'paused') this.startedAt = this.started ?? Date.now()
    this.tick()
    if (this.state === 'running') {
      if (this.timer === undefined) this.timer = setInterval(() => this.tick(), 1000)
    } else {
      this.stopTimer()
    }
  }

  private stopTimer() {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  private tick() {
    if (this.state !== 'running' || this.startedAt === undefined) return
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000)
    if (seconds !== this.seconds) {
      this.seconds = seconds
      this.requestUpdate()
    }
  }

  private handleIteration(event: AnimationEvent) {
    if (!ROTATE_ANIMATIONS.has(event.animationName) || event.target !== event.currentTarget) return
    this.messageIndex += 1
    this.requestUpdate()
  }

  private handleSlotChange(event: Event) {
    this.slotPresence.handleSlotChange(event)
  }

  private renderIndicator(): TemplateResult | typeof nothing {
    if (this.state === 'done') {
      return html`<slot name="done-icon"
        ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" /></svg
      ></slot>`
    }
    if (this.state === 'error') {
      return html`<slot name="error-icon"
        ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4.5 4.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" /></svg
      ></slot>`
    }
    switch (this.indicator) {
      case 'none':
        return nothing
      case 'dots':
        return html`<span class="dots"><i></i><i></i><i></i></span>`
      case 'ring':
        return html`<span class="ring"></span>`
      case 'pulse':
        return html`<span class="pulse"></span>`
      case 'orbit':
        return html`<span class="orbit"><i></i></span>`
      default:
        return html`<span class="glyph"><span class="glyph-strip">${GLYPHS.map((glyph) => html`<span>${glyph}</span>`)}</span></span>`
    }
  }

  private renderText(label: string) {
    if (this.effect !== 'wave') return label
    return Array.from(label).map((char, index) => html`<span class="char" style=${styleMap({ '--c2-working-indicator-index': String(index) })}>${char}</span>`)
  }

  private renderEllipsis() {
    if (this.ellipsis === 'none') return nothing
    if (this.ellipsis === 'static') return html`<span class="ellipsis" part="ellipsis" aria-hidden="true">…</span>`
    return html`<span class="ellipsis" part="ellipsis" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>`
  }

  override render() {
    const label = this.currentLabel
    const fraction = this.fraction
    const slotted = this.slotPresence.state('') === 'present'
    const hasMeta = this.slotPresence.has('meta')
    const finished = this.state === 'done' || this.state === 'error'
    const rotating = this.state === 'running' && !slotted && (this.messages?.length ?? 0) > 1
    const textStyle = fraction === undefined ? nothing : styleMap({ '--c2-working-indicator-fill': `${(1 - fraction) * 100}%` })
    // The visible label is hidden from assistive technology (letters split by `wave`, rotating text) and a stable
    // copy announces it instead: the running label, then the outcome.
    const announced = finished || !this.messages?.length ? label : this.label || DEFAULT_LABEL
    return html`
      <div
        class=${classMap({
          'c2-working-indicator': true,
          [`is-${this.state}`]: true,
          [`effect-${this.effect}`]: !finished,
          [`indicator-${this.indicator}`]: true,
          [`ellipsis-${this.ellipsis}`]: true,
          'is-determinate': fraction !== undefined,
          'is-rotating': rotating,
          'has-separator': this.elapsed && this.slotPresence.state('meta') === 'present',
        })}
      >
        ${
          this.indicator === 'none' && !finished
            ? nothing
            : html`<span class="indicator" part="indicator" aria-hidden="true"
                >${finished ? this.renderIndicator() : html`<slot name="indicator">${this.renderIndicator()}</slot>`}</span
              >`
        }
        <span class="label" @animationiteration=${this.handleIteration}>
          <span class="text" part="label" style=${textStyle} aria-hidden=${slotted ? nothing : 'true'}
            >${slotted ? nothing : this.renderText(label)}<slot @slotchange=${this.handleSlotChange}></slot></span
          >${this.renderEllipsis()}
        </span>
        <span class="visually-hidden">${slotted ? nothing : announced}</span>
        <span class="meta" part="meta" ?hidden=${!this.elapsed && !hasMeta}>
          ${this.elapsed ? html`<span class="elapsed" part="elapsed" aria-hidden="true">${formatElapsed(this.seconds)}</span>` : nothing}
          <span class="meta-text"><slot name="meta" @slotchange=${this.handleSlotChange}></slot></span>
        </span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-working-indicator': WorkingIndicator
  }
}
