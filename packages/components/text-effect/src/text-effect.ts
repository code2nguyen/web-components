import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './text-effect.scss?inline'

/** How the text is animated. */
export type TextEffectKind = 'rotate' | 'typewriter' | 'scramble' | 'shimmer' | 'reveal'

/** When the effect starts. */
export type TextEffectPlay = 'load' | 'in-view' | 'hover'

/** Events fired by {@link TextEffect}, keyed for `addEventListener`. */
export interface TextEffectEventMap {
  'effect-end': CustomEvent<void>
}

export interface TextEffect {
  addEventListener: TypedAddEventListener<TextEffect, TextEffectEventMap>
  removeEventListener: TypedRemoveEventListener<TextEffect, TextEffectEventMap>
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=?!<>/'

/** A duration custom property in milliseconds: `250ms`, `0.25s` or a bare number of milliseconds. */
function readMs(element: Element, name: string, fallback: number): number {
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  if (!value) return fallback
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) return fallback
  return value.endsWith('ms') ? number : value.endsWith('s') ? number * 1000 : number
}

/**
 * Animated text for a hero line or a status: words that rotate, a typewriter, characters that unscramble, a light that
 * sweeps across the text, or words that rise into place.
 *
 * The text is the element's own text content, or the list in `words` for `rotate` and `typewriter` (`;`-separated or a
 * JSON array). `rotate` reserves the width of its widest word, so the line never jumps. `play` starts it on load, the
 * first time it scrolls into view, or on hover; `loop` repeats an effect that otherwise plays once (`typewriter` with
 * one text, `scramble`, `reveal`), and `replay()` starts it again. `effect-end` fires when a one-shot effect finishes.
 *
 * Timings are CSS variables: how long a word stays (`--c2-text-effect--interval`), how fast characters type or resolve
 * (`--c2-text-effect__char--duration`), the shimmer's sweep and the reveal's stagger. `--c2-text-effect__text--background`
 * with a transparent `--c2-text-effect__text--color` fills the text with a gradient, for any effect.
 *
 * Assistive technology reads the still text, never the animation: the full text, or the words joined with commas. It
 * is not a live region. Under reduced motion the effect shows its final state at once, and nothing animates while it is
 * off screen or the page is hidden.
 *
 * @tag c2-text-effect
 *
 * @slot - The text to animate, when `words` is not set.
 *
 * @event {CustomEvent<void>} effect-end - Fired when an effect that plays once has finished. Does not bubble.
 *
 * @csspart text - The animated text.
 * @csspart caret - The typewriter's caret.
 *
 * @cssproperty {time} [--c2-text-effect--interval=2500ms] - How long each word stays, and the pause before a loop repeats.
 * @cssproperty {time} [--c2-text-effect__char--duration=40ms] - Time per character for `typewriter` and `scramble`.
 * @cssproperty {time} [--c2-text-effect__rotate--duration=400ms] - How long a word takes to slide in and out.
 * @cssproperty {string} [--c2-text-effect__rotate--align=start] - Where a word narrower than the widest sits: `start`, `center` or `end`.
 * @cssproperty {time} [--c2-text-effect__shimmer--duration=2s] - One sweep of the shimmer.
 * @cssproperty {color} [--c2-text-effect__shimmer--color=#71717a] - The text under the shimmer.
 * @cssproperty {color} [--c2-text-effect__shimmer__highlight--color=#ffffff] - The sweeping light.
 * @cssproperty {time} [--c2-text-effect__reveal--duration=500ms] - How long each word takes to rise in.
 * @cssproperty {time} [--c2-text-effect__reveal--stagger=80ms] - The delay between two words.
 * @cssproperty {color} [--c2-text-effect__caret--color=currentColor]
 * @cssproperty {pixel} [--c2-text-effect__caret--width=2px]
 * @cssproperty {color} [--c2-text-effect__text--color=inherit] - The text colour; `transparent` with a background fill shows the fill.
 * @cssproperty {background} [--c2-text-effect__text--background=none] - A fill clipped to the text, such as a gradient.
 */
@customElement('c2-text-effect')
export class TextEffect extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `rotate`, `typewriter`, `scramble`, `shimmer` or `reveal`. */
  @property() effect: TextEffectKind = 'reveal'

  /** The words `rotate` cycles through and `typewriter` types in turn. Replaces the text content when set. */
  @property({ converter: arrayPropertyConverter }) words: string[] = []

  /** When the effect starts: `load`, `in-view` (the first time it is seen) or `hover`. */
  @property() play: TextEffectPlay = 'load'

  /** Repeats an effect that otherwise plays once. */
  @property({ type: Boolean }) loop = false

  /** Whether the effect has taken over from the plain text (after the first update, so hydration matches the server). */
  @state() private ready = false
  /** The text read from the light DOM. */
  @state() private text = ''
  /** `rotate`: the shown word and the one leaving. */
  @state() private index = 0
  @state() private leaving = -1
  /** `typewriter` and `scramble`: how many characters are shown or resolved. */
  @state() private shown = 0
  /** `scramble`: the glyphs drawn for the unresolved characters. */
  @state() private noise = ''
  /** `reveal`: bumped to restart the CSS animation. */
  @state() private run = 0

  private readonly internals = this.attachInternals()
  private timer: ReturnType<typeof setTimeout> | undefined
  private observer: IntersectionObserver | null = null
  private mutations: MutationObserver | null = null
  private onScreen = true
  /** Whether the effect has started: an in-view effect waits to be seen, a hover effect rests on its text. */
  @state() private started = false
  private deleting = false
  private reducedQuery: MediaQueryList | null = null

  private get reduced(): boolean {
    return this.reducedQuery?.matches ?? false
  }

  /** The texts the effect runs through: `words`, else the text content. */
  private get items(): string[] {
    const words = this.words.map((word) => word.trim()).filter(Boolean)
    return words.length ? words : [this.text]
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedQuery.addEventListener('change', this.handleMotion)
    document.addEventListener('visibilitychange', this.handleVisibility)
    this.mutations = new MutationObserver(() => this.readText())
    this.mutations.observe(this, { childList: true, characterData: true, subtree: true })
    this.observer = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((entry) => entry.isIntersecting)
      if (this.onScreen && this.play === 'in-view' && !this.started && this.ready) this.start()
      this.toggleAttributeState()
    })
    this.observer.observe(this)
    this.addEventListener('pointerenter', this.handleHover)
    this.addEventListener('focusin', this.handleHover)
    this.readText()
    // Moved in the page: start again where a first connection would have.
    if (this.ready && this.play === 'load') this.start()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stop()
    this.reducedQuery?.removeEventListener('change', this.handleMotion)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.mutations?.disconnect()
    this.observer?.disconnect()
    this.removeEventListener('pointerenter', this.handleHover)
    this.removeEventListener('focusin', this.handleHover)
    this.started = false
  }

  protected override firstUpdated(): void {
    this.readText()
    this.ready = true
    // A hover effect shows its text at rest, and plays from the start on each hover.
    if (this.play === 'hover') this.shown = this.items[0]?.length ?? 0
    if (this.play === 'load') this.start()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (isServer || !this.ready || changed.has('ready' as keyof TextEffect)) return
    // A new effect or new words start over.
    if (changed.has('effect') || changed.has('words') || changed.has('loop')) this.replay()
  }

  /** Starts the effect again from the beginning. */
  replay(): void {
    this.stop()
    this.started = false
    this.start()
  }

  private readText(): void {
    const text = (this.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text !== this.text) {
      this.text = text
      if (this.started) this.replay()
    }
  }

  private readonly handleMotion = (): void => this.replay()

  private readonly handleVisibility = (): void => this.toggleAttributeState()

  private readonly handleHover = (): void => {
    if (this.play === 'hover' && this.ready) this.replay()
  }

  /** Pauses the CSS animations (shimmer) while unseen. */
  private toggleAttributeState(): void {
    const paused = !this.onScreen || document.visibilityState === 'hidden'
    try {
      if (paused) this.internals.states.add('paused')
      else this.internals.states.delete('paused')
    } catch {
      // Without custom states the shimmer keeps running off screen; harmless.
    }
    this.renderRoot?.querySelector('.text')?.classList.toggle('paused', paused)
  }

  private stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  /** Schedules `step` after `ms`, waiting while the effect cannot be seen. */
  private schedule(ms: number, step: () => void): void {
    this.stop()
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.isConnected) return
      if (!this.onScreen || document.visibilityState === 'hidden') {
        this.schedule(250, step)
        return
      }
      step()
    }, ms)
  }

  private end(): void {
    this.dispatchEvent(new CustomEvent('effect-end'))
  }

  private start(): void {
    if (this.started || !this.isConnected) return
    if (this.play === 'in-view' && !this.onScreen) return
    this.started = true
    this.index = 0
    this.leaving = -1
    this.deleting = false
    const interval = readMs(this, '--c2-text-effect--interval', 2500)
    const char = Math.max(5, readMs(this, '--c2-text-effect__char--duration', 40))
    const items = this.items
    if (this.reduced) {
      // The final, still state: the first word in full, every character resolved.
      this.shown = items[0]?.length ?? 0
      this.noise = ''
      if (this.effect !== 'rotate' && this.effect !== 'shimmer') this.end()
      return
    }
    switch (this.effect) {
      case 'rotate': {
        const next = () => {
          if (items.length < 2) return
          this.leaving = this.index
          this.index = (this.index + 1) % items.length
          this.schedule(interval, next)
        }
        this.schedule(interval, next)
        break
      }
      case 'typewriter': {
        this.shown = 0
        const type = () => {
          const word = items[this.index] ?? ''
          if (!this.deleting) {
            if (this.shown < word.length) {
              this.shown += 1
              this.schedule(char, type)
              return
            }
            // The last text, without `loop`, stays typed.
            if (this.index === items.length - 1 && !this.loop) {
              this.end()
              return
            }
            this.deleting = true
            this.schedule(interval, type)
            return
          }
          if (this.shown > 0) {
            this.shown -= 1
            this.schedule(char / 2, type)
            return
          }
          this.deleting = false
          this.index = (this.index + 1) % items.length
          this.schedule(char * 4, type)
        }
        this.schedule(char, type)
        break
      }
      case 'scramble': {
        const word = items[0] ?? ''
        this.shown = 0
        // The resolved characters and the noise after them always make up the word's length.
        const scramble = () => {
          this.noise = Array.from(word.slice(this.shown), (letter) => (letter === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join('')
          if (this.shown >= word.length) {
            this.end()
            if (this.loop) this.schedule(interval, () => this.replay())
            return
          }
          this.schedule(char, () => {
            this.shown += 1
            scramble()
          })
        }
        scramble()
        break
      }
      case 'reveal': {
        this.run += 1
        const words = (items[0] ?? '').split(' ').length
        const duration = readMs(this, '--c2-text-effect__reveal--duration', 500) + readMs(this, '--c2-text-effect__reveal--stagger', 80) * (words - 1)
        this.schedule(duration, () => {
          this.end()
          if (this.loop) this.schedule(interval, () => this.replay())
        })
        break
      }
      default:
        // shimmer is CSS only.
        break
    }
  }

  /** What assistive technology reads: the still text. */
  private renderAccessible() {
    const words = this.words.map((word) => word.trim()).filter(Boolean)
    if (words.length) return html`<span class="sr">${words.join(', ')}</span>`
    return html`<span class="sr"><slot></slot></span>`
  }

  /** Before it starts, an in-view effect waits unseen and a hover effect rests on its final text. */
  private get restClass(): string {
    if (this.started) return ''
    return this.play === 'in-view' ? 'waiting' : this.play === 'hover' ? 'resting' : ''
  }

  private renderEffect() {
    const items = this.items
    const first = items[0] ?? ''
    switch (this.effect) {
      case 'rotate':
        return html`<span class="text rotate" part="text" aria-hidden="true">
          ${items.map((word) => html`<span class="sizer">${word}</span>`)}
          ${
            this.leaving >= 0 && this.leaving !== this.index
              ? html`<span class="word out" @animationend=${() => (this.leaving = -1)}>${items[this.leaving]}</span>`
              : nothing
          }
          ${repeat(
            [this.index],
            (index) => index,
            (index) => html`<span class="word ${this.leaving >= 0 ? 'in' : ''}">${items[index]}</span>`,
          )}
        </span>`
      case 'typewriter':
        return html`<span class="text typewriter" part="text" aria-hidden="true"
          >${(items[this.index] ?? '').slice(0, this.shown)}<span class="caret" part="caret"></span
        ></span>`
      case 'scramble':
        return html`<span class="text scramble" part="text" aria-hidden="true">${first.slice(0, this.shown)}<span class="noise">${this.noise}</span></span>`
      case 'shimmer':
        return html`<span class="text shimmer ${this.restClass}" part="text" aria-hidden="true">${first}</span>`
      default: {
        const words = first.split(' ')
        return html`<span class="text reveal ${this.restClass}" part="text" aria-hidden="true">
          ${repeat(
            words.map((word, index) => `${this.run}:${index}:${word}`),
            (key) => key,
            (key, index) => html`<span class="piece" style="--_i: ${index}">${key.split(':').slice(2).join(':')}</span>${index < words.length - 1 ? ' ' : ''}`,
          )}
        </span>`
      }
    }
  }

  override render() {
    // Until the first update the plain text shows, as a server rendered it.
    if (!this.ready) return html`<slot></slot>`
    return html`${this.renderAccessible()}${this.renderEffect()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-text-effect': TextEffect
  }
}
