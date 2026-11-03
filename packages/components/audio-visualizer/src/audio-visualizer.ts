import { LitElement, html, svg, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './audio-visualizer.scss?inline'

/** How the level is drawn. */
export type AudioVisualizerVariant = 'bars' | 'wave' | 'orb'

/** What the visualizer shows when it has no audio to draw: an agent's state, as a voice assistant shows it. */
export type AudioVisualizerState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** Events fired by {@link AudioVisualizer}, keyed for `addEventListener`. */
export interface AudioVisualizerEventMap {
  'speaking-change': CustomEvent<{ speaking: boolean }>
}

export interface AudioVisualizer {
  addEventListener: TypedAddEventListener<AudioVisualizer, AudioVisualizerEventMap>
  removeEventListener: TypedRemoveEventListener<AudioVisualizer, AudioVisualizerEventMap>
}

/** Points of the waveform across the width. */
const WAVE_POINTS = 48
/** How long the level must stay under the threshold before speaking ends, so pauses between words do not flicker. */
const SPEAKING_HOLD = 300
/** Frames a second under reduced motion: a steady meter rather than an animation. */
const REDUCED_INTERVAL = 250

let sharedContext: AudioContext | undefined
/**
 * Whether a media element's audio can be read. Web Audio reads a cross-origin element without CORS as silence, and
 * routing it there would silence its playback for good, so such an element is left alone.
 */
function readable(element: HTMLMediaElement): boolean {
  if (element.crossOrigin !== null) return true
  const source = element.currentSrc || element.src
  // Without a source yet there is no telling where it will come from.
  if (!source) return false
  if (source.startsWith('blob:') || source.startsWith('data:')) return true
  try {
    return new URL(source, location.href).origin === location.origin
  } catch {
    return false
  }
}

/** A media element can be routed into Web Audio only once, ever: its source node is kept for every later visualizer. */
const mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()

/**
 * The one `AudioContext` every visualizer analyses through. A browser starts it suspended until the page has had a
 * user gesture, and a suspended context reads silence, so it resumes on the first one.
 */
function audioContext(): AudioContext {
  if (!sharedContext) {
    const context = new AudioContext()
    sharedContext = context
    if (context.state === 'suspended') {
      const resume = () => {
        context.resume().then(
          () => {
            document.removeEventListener('pointerdown', resume, true)
            document.removeEventListener('keydown', resume, true)
          },
          () => {
            // Still not allowed: the next gesture tries again.
          },
        )
      }
      resume()
      document.addEventListener('pointerdown', resume, true)
      document.addEventListener('keydown', resume, true)
    }
  }
  return sharedContext
}

/** Order of the bars by loudness: the loudest band in the middle, quieter ones toward both ends, as a mic meter. */
function centreOrder(count: number): number[] {
  const middle = (count - 1) / 2
  return Array.from({ length: count }, (_value, index) => index).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b)
}

/** A smooth path through `values` (each -1 to 1) across a 100 × 100 box. */
function wavePath(values: readonly number[]): string {
  const step = 100 / (values.length - 1)
  const y = (value: number) => 50 - Math.max(-1, Math.min(1, value)) * 46
  let path = `M0 ${y(values[0]).toFixed(2)}`
  for (let index = 1; index < values.length; index += 1) {
    const x0 = (index - 1) * step
    const x1 = index * step
    const middle = (x0 + x1) / 2
    path += ` C${middle.toFixed(2)} ${y(values[index - 1]).toFixed(2)} ${middle.toFixed(2)} ${y(values[index]).toFixed(2)} ${x1.toFixed(2)} ${y(values[index]).toFixed(2)}`
  }
  return path
}

const FLAT_WAVE = wavePath(Array.from({ length: WAVE_POINTS }, () => 0))

/**
 * Live audio level as bars, a waveform or an orb: the mic meter of a call, the waveform of a voice message, the orb of
 * a voice assistant.
 *
 * The level comes from the first source set: `stream`, a `MediaStream` (a microphone, a call participant's track),
 * analysed through Web Audio; `media`, an `<audio>` or `<video>` element that plays (same-origin, or served with CORS
 * and `crossorigin`, and given its source first: Web Audio cannot read another one, which is then left alone); or `level`, a number from 0 to 1
 * an app already has from its call SDK. With no source, `state` (`idle`, `listening`, `thinking`, `speaking`) animates
 * what an agent is doing while its audio plays elsewhere. `muted` draws a flat, greyed meter.
 *
 * `speaking-change` fires when the level of a source crosses `speaking-threshold`, held for 300 ms so the pauses between
 * words do not flicker; `:state(speaking)` matches meanwhile. The visualizer draws only while it is on screen and the
 * page is visible. Under reduced motion it is a steady meter, updated four times a second, with no breathing or
 * travelling animation.
 *
 * It is decorative (hidden from assistive technology) unless it has a `label`, which makes it an image of that name, for
 * an orb that stands on its own.
 *
 * @tag c2-audio-visualizer
 *
 * @event {CustomEvent<{ speaking: boolean }>} speaking-change - Fired when the source starts or stops speaking. Does not bubble.
 *
 * @csspart bar - Each bar.
 * @csspart wave - The waveform's SVG.
 * @csspart orb - The orb.
 *
 * @cssproperty {pixel} [--c2-audio-visualizer--height=32px] - Height of the bars and the waveform.
 * @cssproperty {pixel} [--c2-audio-visualizer__wave--width=240px]
 * @cssproperty {color} [--c2-audio-visualizer__bar--color=rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-audio-visualizer__bar--width=4px]
 * @cssproperty {pixel} [--c2-audio-visualizer__bar--gap=3px]
 * @cssproperty {pixel} [--c2-audio-visualizer__bar--min-height=4px] - Height of a silent bar.
 * @cssproperty {border-radius} [--c2-audio-visualizer__bar--border-radius=999px]
 * @cssproperty {color} [--c2-audio-visualizer__wave--color=rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-audio-visualizer__wave--stroke-width=2px]
 * @cssproperty {pixel} [--c2-audio-visualizer__orb--size=96px]
 * @cssproperty {color} [--c2-audio-visualizer__orb--color=rgb(2, 101, 220)] - The orb's body; its highlight and shade are mixed from it.
 * @cssproperty {pixel} [--c2-audio-visualizer__orb--glow=32px] - The glow at full level.
 * @cssproperty {color} [--c2-audio-visualizer__muted--color=#a1a1aa] - The bars, wave or orb of a muted source.
 */
@customElement('c2-audio-visualizer')
export class AudioVisualizer extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `bars`, `wave` or `orb`. */
  @property() variant: AudioVisualizerVariant = 'bars'

  /** Number of bars. */
  @property({ type: Number }) bars = 5

  /** A level from 0 to 1, for an app that has it from its call SDK. `stream` and `media` win over it. */
  @property({ type: Number }) level?: number

  /** A `MediaStream` to analyse, such as a microphone or a call participant's audio track. Property only. */
  @property({ attribute: false }) stream: MediaStream | null = null

  /** An `<audio>` or `<video>` element to analyse while it plays, set once it has its source. Property only. */
  @property({ attribute: false }) media: HTMLMediaElement | null = null

  /** What to animate when there is no source. */
  @property() state: AudioVisualizerState = 'idle'

  /** A muted source: a flat, greyed meter. */
  @property({ type: Boolean }) muted = false

  /** Level from which the source counts as speaking. */
  @property({ type: Number, attribute: 'speaking-threshold' }) speakingThreshold = 0.08

  /** Makes the visualizer an image of this name, for one that stands on its own. Decorative without it. */
  @property() label = ''

  private readonly internals = this.attachInternals()

  private analyser: AnalyserNode | null = null
  private sourceNode: AudioNode | null = null
  private connectedTo: MediaStream | HTMLMediaElement | null = null
  /** The slower loop that keeps reading an unseen source, so that speaking still starts and ends. */
  private listenTimer: ReturnType<typeof setTimeout> | undefined
  private frequency: Uint8Array<ArrayBuffer> | null = null
  private timeDomain: Float32Array<ArrayBuffer> | null = null
  /** The smoothed level of each bar, and of the whole source. */
  private smoothed: number[] = []
  private smoothedLevel = 0
  private frame = 0
  private lastDraw = 0
  private onScreen = true
  private reduced = false
  private reducedQuery: MediaQueryList | null = null
  private observer: IntersectionObserver | null = null
  private speakingNow = false
  private quietSince = 0

  /** Whether the source is speaking, as `speaking-change` last said. */
  get speaking(): boolean {
    return this.speakingNow
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
    this.reduced = this.reducedQuery.matches
    this.reducedQuery.addEventListener('change', this.handleMotion)
    document.addEventListener('visibilitychange', this.schedule)
    this.observer = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((entry) => entry.isIntersecting)
      this.schedule()
    })
    this.observer.observe(this)
    this.connectSource()
    this.schedule()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.reducedQuery?.removeEventListener('change', this.handleMotion)
    document.removeEventListener('visibilitychange', this.schedule)
    this.observer?.disconnect()
    this.observer = null
    this.stop()
    this.disconnectSource()
    if (this.speakingNow) this.setSpeaking(false)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('label')) {
      this.internals.role = this.label ? 'img' : null
      this.internals.ariaLabel = this.label || null
      this.internals.ariaHidden = this.label ? null : 'true'
    }
    if (changed.has('bars')) this.smoothed = Array.from({ length: this.barCount }, (_value, index) => this.smoothed[index] ?? 0)
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (isServer) return
    if ((changed.has('stream') || changed.has('media')) && this.isConnected) {
      const live = this.analyser !== null
      this.connectSource()
      // The look of the visualizer depends on whether a source is connected: draw it again when that changed.
      if (live !== (this.analyser !== null)) this.requestUpdate()
    }
    // A source that went away, or went quiet by being muted, no longer speaks.
    if ((!this.hasSource || this.muted) && this.speakingNow) this.setSpeaking(false)
    this.schedule()
  }

  private get barCount(): number {
    return Math.max(1, Math.min(64, Math.round(this.bars) || 1))
  }

  /** A real source, as opposed to the animated `state`. */
  private get hasSource(): boolean {
    return this.analyser !== null || typeof this.level === 'number'
  }

  private readonly handleMotion = (): void => {
    this.reduced = this.reducedQuery?.matches ?? false
    this.schedule()
  }

  private connectSource(): void {
    const stream = this.stream
    const media = this.media
    // Already analysing this source.
    if (this.analyser && this.connectedTo === (stream ?? media)) return
    this.disconnectSource()
    if (!stream && !media) return
    if (!stream && media && !readable(media)) return
    try {
      const context = audioContext()
      let source: AudioNode
      if (stream) {
        if (stream.getAudioTracks().length === 0) return
        source = context.createMediaStreamSource(stream)
      } else {
        const element = media as HTMLMediaElement
        let node = mediaSources.get(element)
        if (!node) {
          node = context.createMediaElementSource(element)
          // Routed into Web Audio, the element is heard only through the context: keep it playing out loud.
          node.connect(context.destination)
          mediaSources.set(element, node)
        }
        source = node
      }
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      this.sourceNode = source
      this.connectedTo = stream ?? media
      this.analyser = analyser
      this.frequency = new Uint8Array(analyser.frequencyBinCount)
      this.timeDomain = new Float32Array(analyser.fftSize)
    } catch {
      // No Web Audio: the visualizer falls back to `level` or `state`.
      this.disconnectSource()
    }
  }

  private disconnectSource(): void {
    if (this.sourceNode && this.analyser) {
      try {
        this.sourceNode.disconnect(this.analyser)
      } catch {
        // Already disconnected.
      }
    }
    this.sourceNode = null
    this.connectedTo = null
    this.analyser = null
    this.frequency = null
    this.timeDomain = null
  }

  /** Starts the frame loop when there is something to animate and the visualizer can be seen; draws once otherwise. */
  private readonly schedule = (): void => {
    if (!this.isConnected) return
    const visible = this.onScreen && document.visibilityState !== 'hidden'
    const animated = !this.muted && (this.hasSource || this.state !== 'idle')
    if (visible && animated) {
      this.stopListening()
      if (!this.frame) this.frame = requestAnimationFrame(this.tick)
    } else {
      this.stop()
      if (this.hasUpdated) this.draw(performance.now(), true)
      // Off screen or in a hidden page a source still speaks, and whoever shows the speaker must hear it stop.
      if (animated && this.hasSource) this.listen()
      else this.stopListening()
    }
  }

  private stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.stopListening()
  }

  private listen(): void {
    if (this.listenTimer !== undefined) return
    this.listenTimer = setTimeout(() => {
      this.listenTimer = undefined
      if (!this.isConnected) return
      const now = performance.now()
      this.detectSpeaking(this.sample(now).level, now)
      this.schedule()
    }, REDUCED_INTERVAL)
  }

  private stopListening(): void {
    if (this.listenTimer !== undefined) clearTimeout(this.listenTimer)
    this.listenTimer = undefined
  }

  private readonly tick = (time: number): void => {
    this.frame = 0
    if (!this.reduced || time - this.lastDraw >= REDUCED_INTERVAL) {
      this.lastDraw = time
      this.draw(time, false)
    }
    this.schedule()
  }

  /** Reads the source (or the state) for this frame: the level of each bar, the waveform and the overall level. */
  private sample(time: number): { bars: number[]; wave: number[]; level: number } {
    const count = this.barCount
    const t = time / 1000
    if (this.muted) return { bars: new Array(count).fill(0), wave: new Array(WAVE_POINTS).fill(0), level: 0 }
    const analyser = this.analyser
    if (analyser && this.frequency && this.timeDomain) {
      analyser.getByteFrequencyData(this.frequency)
      analyser.getFloatTimeDomainData(this.timeDomain)
      let sum = 0
      for (const value of this.timeDomain) sum += value * value
      // Speech RMS rarely passes 0.3, so it is scaled into a meter that reads full when someone speaks up.
      const level = Math.min(1, Math.sqrt(sum / this.timeDomain.length) * 4)
      // Voice sits in the lower third of the spectrum: its bands, loudest in the middle.
      const voiced = Math.max(count, Math.floor(this.frequency.length / 3))
      const bands = Array.from({ length: count }, (_value, band) => {
        const from = Math.floor((band * voiced) / count)
        const to = Math.max(from + 1, Math.floor(((band + 1) * voiced) / count))
        let total = 0
        for (let index = from; index < to; index += 1) total += this.frequency![index]
        return total / (to - from) / 255
      })
      const bars = new Array<number>(count)
      centreOrder(count).forEach((slot, rank) => (bars[slot] = bands[rank]))
      const step = this.timeDomain.length / WAVE_POINTS
      const wave = Array.from({ length: WAVE_POINTS }, (_value, index) => (this.timeDomain![Math.floor(index * step)] ?? 0) * 3)
      return { bars, wave, level }
    }
    let level: number
    let shape: (index: number) => number
    if (typeof this.level === 'number') {
      level = Math.max(0, Math.min(1, this.level))
      // A centre-weighted profile with a little movement, so a level the app sets reads as a live meter.
      shape = (index) => {
        const centre = 1 - Math.abs(index - (count - 1) / 2) / Math.max(1, count / 2) / 1.6
        const jitter = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 9 + index * 1.7)
        return level * centre * jitter
      }
    } else {
      const state = this.state
      const still = this.reduced
      if (state === 'listening') {
        level = still ? 0.15 : 0.12 + 0.06 * Math.sin(t * 2)
        shape = () => level
      } else if (state === 'thinking') {
        level = 0.3
        shape = (index) => (still ? 0.3 : 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 6 - index * 0.9)))
      } else if (state === 'speaking') {
        level = still ? 0.6 : 0.45 + 0.25 * Math.sin(t * 7) * Math.sin(t * 2.3)
        shape = (index) => (still ? 0.6 - Math.abs(index - (count - 1) / 2) * 0.08 : level * (0.6 + 0.4 * Math.abs(Math.sin(t * 5 + index * 1.3))))
      } else {
        level = 0
        shape = () => 0
      }
    }
    const bars = Array.from({ length: count }, (_value, index) => shape(index))
    const wave = Array.from({ length: WAVE_POINTS }, (_value, index) => {
      const x = index / (WAVE_POINTS - 1)
      const envelope = Math.sin(Math.PI * x)
      return level * envelope * Math.sin(index * 0.55 + (this.reduced ? 0 : t * 8))
    })
    return { bars, wave, level }
  }

  /** Writes a frame straight to the rendered nodes, without a Lit update. `settle` skips the smoothing. */
  private draw(time: number, settle: boolean): void {
    const root = this.renderRoot
    if (!root) return
    const { bars, wave, level } = this.sample(time)
    const ease = (from: number, to: number) => (settle || this.reduced ? to : from + (to - from) * (to > from ? 0.5 : 0.2))
    this.smoothedLevel = ease(this.smoothedLevel, level)
    if (this.variant === 'wave') {
      root.querySelector('.wave path')?.setAttribute('d', wavePath(wave))
    } else if (this.variant === 'orb') {
      root.querySelector<HTMLElement>('.orb')?.style.setProperty('--_level', this.smoothedLevel.toFixed(3))
    } else {
      root.querySelectorAll<HTMLElement>('.bar').forEach((bar, index) => {
        const value = ease(this.smoothed[index] ?? 0, Math.max(0, Math.min(1, bars[index] ?? 0)))
        this.smoothed[index] = value
        bar.style.setProperty('--_level', value.toFixed(3))
      })
    }
    if (this.hasSource) this.detectSpeaking(level, time)
  }

  private detectSpeaking(level: number, time: number): void {
    if (level >= this.speakingThreshold) {
      this.quietSince = 0
      if (!this.speakingNow) this.setSpeaking(true)
    } else if (this.speakingNow) {
      if (!this.quietSince) this.quietSince = time
      else if (time - this.quietSince >= SPEAKING_HOLD) this.setSpeaking(false)
    }
  }

  private setSpeaking(speaking: boolean): void {
    this.speakingNow = speaking
    this.quietSince = 0
    try {
      if (speaking) this.internals.states.add('speaking')
      else this.internals.states.delete('speaking')
    } catch {
      // A browser without custom states still gets the event.
    }
    this.dispatchEvent(new CustomEvent('speaking-change', { detail: { speaking } }))
  }

  override render() {
    const classes = `visualizer ${this.variant} state-${this.hasSource ? 'live' : this.state}${this.muted ? ' muted' : ''}`
    if (this.variant === 'wave') {
      return html`<svg class=${classes} part="wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        ${svg`<path d=${FLAT_WAVE} vector-effect="non-scaling-stroke"></path>`}
      </svg>`
    }
    if (this.variant === 'orb') return html`<div class=${classes} part="orb"></div>`
    const bars = Array.from({ length: this.barCount }, (_value, index) => index)
    return html`<div class=${classes}>
      ${repeat(
        bars,
        (index) => index,
        (index) => html`<span class="bar" part="bar" style="--_index: ${index}"></span>`,
      )}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-audio-visualizer': AudioVisualizer
  }
}
