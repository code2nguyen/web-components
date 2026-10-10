import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { classMap } from 'lit/directives/class-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { DEFAULT_FLUSH_DURATION, DEFAULT_MAX_LAG, StreamRevealController, parseCssTime, type RevealSegment } from '@c2n/core/stream-reveal.js'
import styles from './streaming-text.scss?inline'

export type { RevealSegment } from '@c2n/core/stream-reveal.js'

/** Whether the display may trail the received text (`smooth`) or prints each chunk as it arrives (`instant`). */
export type RevealMode = 'smooth' | 'instant'

/** Events fired by {@link StreamingText}, keyed for `addEventListener`. */
export interface StreamingTextEventMap {
  'reveal-end': Event
}

export interface StreamingText {
  addEventListener: TypedAddEventListener<StreamingText, StreamingTextEventMap>
  removeEventListener: TypedRemoveEventListener<StreamingText, StreamingTextEventMap>
}

/** Segments still fading in before the oldest ones are settled early, which bounds the DOM of a long answer. */
const MAX_ENTERING = 24

/**
 * Plain text that arrives in bursts, such as an LLM answer, revealed at a steady pace behind a caret. Chunks are
 * buffered and released word by word so the display never trails the received text by more than
 * `--c2-streaming-text__reveal--max-lag`; when `streaming` turns false the rest is released within
 * `--c2-streaming-text__reveal--flush-duration` and `reveal-end` fires. Released words fade in, then merge back into
 * a single text node, so a long answer stays cheap and selectable. `prefers-reduced-motion` prints each chunk at once.
 *
 * Feed it with `appendText(chunk)`, or by setting `value` to the text received so far.
 *
 * @tag c2-streaming-text
 *
 * @csspart text - Container of the revealed text and the caret.
 * @csspart caret - Caret shown after the text while it streams or is still being revealed. Draws `--c2-streaming-text__caret--content`.
 *
 * @event {Event} reveal-end - Fired once per stream, when `streaming` is false and the display has caught up with the received text.
 *
 * @cssproperty {color} [--c2-streaming-text--color=inherit]
 * @cssproperty {font-family} [--c2-streaming-text--font-family=inherit]
 * @cssproperty {pixel} [--c2-streaming-text--font-size=inherit]
 * @cssproperty {line-height} [--c2-streaming-text--line-height=inherit]
 * @cssproperty {white-space} [--c2-streaming-text--white-space=pre-wrap] - Keeps the newlines of the received text.
 *
 * @cssproperty {content} [--c2-streaming-text__caret--content='▍'] - Caret glyph. `none` hides the caret.
 * @cssproperty {color} [--c2-streaming-text__caret--color=rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-streaming-text__caret--margin-left=1px]
 * @cssproperty {time} [--c2-streaming-text__caret--blink-duration=1s] - `0s` keeps the caret solid.
 *
 * @cssproperty {time} [--c2-streaming-text__segment--enter-duration=150ms] - Fade-in of each released word. `0s` turns the fade off.
 * @cssproperty {time} [--c2-streaming-text__reveal--max-lag=600ms] - Longest the display may trail the received text while streaming.
 * @cssproperty {time} [--c2-streaming-text__reveal--flush-duration=300ms] - Time to release the rest once `streaming` turns false.
 */
@customElement('c2-streaming-text')
export class StreamingText extends LitElement {
  static override styles = unsafeCSS(styles)

  /** More text is coming: shows the caret and marks the element busy. Setting it back to false flushes the backlog. */
  @property({ type: Boolean }) streaming = false

  /** `smooth` paces the text; `instant` prints each chunk as it arrives. Reduced motion always behaves as `instant`. */
  @property() reveal: RevealMode = 'smooth'

  /** Unit released and faded in: `word` (the default, also right for CJK) or `grapheme` for a per-character look. */
  @property() segment: RevealSegment = 'word'

  private readonly internals = this.attachInternals()

  private readonly controller = new StreamRevealController(this, {
    maxLag: DEFAULT_MAX_LAG,
    flushDuration: DEFAULT_FLUSH_DURATION,
    onRevealEnd: () => this.dispatchEvent(new Event('reveal-end', { bubbles: true, composed: true })),
  })

  private live: HTMLElement | null = null
  private settled: Text | null = null
  private entering: HTMLSpanElement[] = []
  private shown = 0
  private shownEpoch = -1
  private fadeDuration = 0
  private reducedMotion: MediaQueryList | null = null

  /** The full text received so far, including the part not revealed yet. Setting a value that extends it appends. */
  @property({ noAccessor: true })
  get value(): string {
    return this.controller.text
  }

  set value(next: string | null | undefined) {
    const old = this.controller.text
    this.controller.set(next ?? '')
    this.requestUpdate('value', old)
  }

  /** The full text received so far (same as `value`). */
  get text(): string {
    return this.controller.text
  }

  /** Adds a chunk to the stream. */
  appendText(chunk: string): void {
    const old = this.controller.text
    this.controller.push(chunk)
    this.requestUpdate('value', old)
  }

  /** Clears the text and the reveal. */
  clear(): void {
    this.value = ''
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    this.reducedMotion ??= window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion.addEventListener('change', this.handleMotionChange)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.reducedMotion?.removeEventListener('change', this.handleMotionChange)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.controller.segment = this.segment === 'grapheme' ? 'grapheme' : 'word'
    this.controller.smooth = this.reveal !== 'instant' && !this.reducedMotion?.matches
    if (changed.has('streaming')) {
      if (this.streaming) {
        this.readTimings()
        this.controller.start()
      } else if (changed.get('streaming') !== undefined) this.controller.end()
    }
  }

  override render() {
    const active = this.streaming || this.controller.pending
    return html`<span class="text" part="text"
      ><span class="ssr">${isServer ? this.controller.text : nothing}</span><span class="live"></span
      ><span class=${classMap({ caret: true, 'caret--active': active })} part="caret" aria-hidden="true"></span
    ></span>`
  }

  protected override firstUpdated(): void {
    this.live = this.renderRoot.querySelector('.live')
    this.live?.addEventListener('animationend', this.handleAnimationEnd)
    this.readTimings()
  }

  protected override updated(): void {
    this.syncText()
    this.internals.ariaBusy = this.streaming || this.controller.pending ? 'true' : null
  }

  private readonly handleMotionChange = () => this.requestUpdate()

  /** Reads the pacing and fade timings from the element's CSS variables (resolved on the live container). */
  private readTimings(): void {
    if (!this.live) return
    const computed = getComputedStyle(this.live)
    this.controller.maxLag = parseCssTime(computed.getPropertyValue('--_max-lag'), DEFAULT_MAX_LAG)
    this.controller.flushDuration = parseCssTime(computed.getPropertyValue('--_flush-duration'), DEFAULT_FLUSH_DURATION)
    this.fadeDuration = parseCssTime(computed.getPropertyValue('--_enter-duration'), 0)
  }

  /** Brings the live container up to the controller's revealed length. */
  private syncText(): void {
    const live = this.live
    if (!live) return
    const { text, revealed, epoch } = this.controller
    if (epoch !== this.shownEpoch || revealed < this.shown || !this.settled) {
      this.settled = document.createTextNode(text.slice(0, revealed))
      live.replaceChildren(this.settled)
      this.entering = []
      this.shown = revealed
      this.shownEpoch = epoch
      return
    }
    if (revealed === this.shown) return
    const chunk = text.slice(this.shown, revealed)
    this.shown = revealed
    if (this.fadeDuration > 0 && this.controller.smooth) {
      const span = document.createElement('span')
      span.className = 'enter'
      span.textContent = chunk
      live.append(span)
      this.entering.push(span)
      if (this.entering.length > MAX_ENTERING) this.settle(this.entering.length - MAX_ENTERING)
    } else {
      this.settle(this.entering.length)
      this.settled.appendData(chunk)
    }
  }

  /** Moves the first `count` fading segments into the settled text node, in order. */
  private settle(count: number): void {
    for (const span of this.entering.splice(0, count)) {
      this.settled?.appendData(span.textContent ?? '')
      span.remove()
    }
  }

  private readonly handleAnimationEnd = (event: AnimationEvent) => {
    const span = event.target as HTMLElement
    if (!span.classList.contains('enter')) return
    span.dataset.done = ''
    let count = 0
    while (count < this.entering.length && 'done' in this.entering[count].dataset) count++
    this.settle(count)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-streaming-text': StreamingText
  }
}
