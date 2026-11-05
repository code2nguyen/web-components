import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { jsonPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { audioPlayerMessages } from './messages.js'
import styles from './audio-player.scss?inline'

export { audioPlayerMessages } from './messages.js'

export type AudioPlayerVariant = 'default' | 'bubble'

/** The speeds the speed button cycles through. */
const SPEEDS = [1, 1.5, 2]
/** How far an arrow key seeks, in seconds. */
const STEP = 5
/** The players with `exclusive` that are on the page: starting one pauses the others. */
const exclusivePlayers = new Set<AudioPlayer>()

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function formatAudioTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/** `count` peaks from 0 to 1, each the loudest sample of its slice of `samples`. */
export function computePeaks(samples: Float32Array, count: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / count))
  const peaks: number[] = []
  for (let bar = 0; bar < count; bar += 1) {
    let peak = 0
    const end = Math.min(samples.length, (bar + 1) * size)
    for (let index = bar * size; index < end; index += 1) {
      const value = Math.abs(samples[index])
      if (value > peak) peak = value
    }
    peaks.push(peak)
  }
  const loudest = Math.max(...peaks, 0)
  return loudest > 0 ? peaks.map((peak) => Math.round((peak / loudest) * 100) / 100) : peaks
}

/** `peaks` brought to `count` bars: each bar the loudest of the peaks it covers. */
function resample(peaks: readonly number[], count: number): number[] {
  if (!peaks.length) return []
  if (peaks.length === count) return peaks.map(clamp)
  return Array.from({ length: count }, (_, bar) => {
    const from = Math.floor((bar * peaks.length) / count)
    const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / count))
    return clamp(Math.max(...peaks.slice(from, to)))
  })
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

const playIcon = svg`<path d="M7 4.5v15l12-7.5z" />`
const pauseIcon = svg`<path d="M6 4h4v16H6zM14 4h4v16h-4z" />`
const chevronIcon = svg`<path d="M6 9l6 6 6-6" />`

/**
 * Waveform playback for voice notes and recordings, as Slack clips and WhatsApp voice messages play them: a play
 * button, the waveform as the seek bar, the time and a speed toggle.
 *
 * The audio is `src`, played by an `<audio>` of the player's own, or an `<audio>` the author puts in the default slot
 * (with its `<source>`s; leave `controls` off). The player never writes on a slotted element. `media` is the element
 * either way, to hand to `c2-transcript` or `c2-audio-visualizer`.
 *
 * The waveform comes from `peaks`, numbers from 0 to 1 usually stored with the recording, brought to `bars` bars (fewer
 * when the waveform is too narrow for them: as many as fit at the bar width and gap).
 * Without `peaks`, the player fetches and decodes `src` once with Web Audio (it must be same-origin, or served with
 * CORS) and computes them; when that fails the bars stay flat. With `preload="none"` it waits for the first play.
 * `duration` (seconds) shows the length before any metadata loads, so a list of voice notes need not fetch every file.
 *
 * The waveform is the seek bar: click or drag on it, or focus it and use the arrow keys (5 seconds), Home and End;
 * Space plays and pauses. The played bars take the accent colour. The speed button cycles 1×, 1.5× and 2×.
 * `exclusive` pauses any other exclusive player on the page when this one starts, as in a chat. `transcript` (text) or
 * the `transcript` slot adds a toggle that shows the transcript below. `variant="bubble"` is the compact chat look,
 * with the time under the waveform; the `avatar` slot sits before the play button.
 *
 * The player is a group named by `label`. `play`, `pause`, `ended` and `ratechange` are re-fired on the host.
 *
 * @tag c2-audio-player
 *
 * @slot - An `<audio>` to play instead of `src`.
 * @slot avatar - Shown before the play button: the sender of a voice message.
 * @slot transcript - The transcript, shown below the player when opened (a `c2-transcript` given this player's `media`, or text).
 *
 * @csspart player - The row that holds the controls.
 * @csspart play - The play and pause button.
 * @csspart waveform - The waveform, which is the seek bar.
 * @csspart time - The time.
 * @csspart speed - The speed button.
 * @csspart transcript - The transcript box.
 *
 * @event play - The audio started playing.
 * @event pause - The audio paused.
 * @event ended - The audio played to its end.
 * @event ratechange - The speed changed.
 *
 * @cssproperty {length} [--c2-audio-player--width=100%] - The player's width.
 * @cssproperty {color} [--c2-audio-player--background-color=#ffffff] - The player's background.
 * @cssproperty {border} [--c2-audio-player--border=1px solid #e4e4e7] - The player's border.
 * @cssproperty {pixel} [--c2-audio-player--border-radius=8px] - The player's corners.
 * @cssproperty {length} [--c2-audio-player--padding=10px 12px] - Space inside the player.
 * @cssproperty {pixel} [--c2-audio-player--gap=12px] - Space between the play button, the waveform, the time and the speed.
 * @cssproperty {color} [--c2-audio-player--color=#18181b] - The text colour.
 * @cssproperty {pixel} [--c2-audio-player__play--size=36px] - The play button's size.
 * @cssproperty {color} [--c2-audio-player__play--background-color=rgb(2, 101, 220)] - The play button's fill.
 * @cssproperty {color} [--c2-audio-player__play--color=#ffffff] - The play and pause icon.
 * @cssproperty {pixel} [--c2-audio-player__waveform--height=32px] - The waveform's height.
 * @cssproperty {pixel} [--c2-audio-player__bar--width=3px] - The width of a bar.
 * @cssproperty {pixel} [--c2-audio-player__bar--gap=2px] - The space between bars.
 * @cssproperty {color} [--c2-audio-player__bar--color=#d4d4d8] - A bar not played yet.
 * @cssproperty {color} [--c2-audio-player__bar__played--color=rgb(2, 101, 220)] - A played bar.
 * @cssproperty {color} [--c2-audio-player__time--color=#71717a] - The time.
 * @cssproperty {pixel} [--c2-audio-player__time--font-size=12px] - The time's size.
 * @cssproperty {color} [--c2-audio-player__speed--background-color=#f4f4f5] - The speed button's fill.
 * @cssproperty {color} [--c2-audio-player__speed--color=#18181b] - The speed button's text.
 * @cssproperty {pixel} [--c2-audio-player__speed--font-size=12px] - The speed button's text size.
 * @cssproperty {color} [--c2-audio-player__toggle--color=rgb(2, 101, 220)] - The transcript toggle.
 * @cssproperty {color} [--c2-audio-player__transcript--background-color=#f4f4f5] - The transcript box.
 * @cssproperty {pixel} [--c2-audio-player__transcript--font-size=13px] - The transcript's text size.
 * @cssproperty {color} [--c2-audio-player__error--color=#dc2626] - The message shown when the audio cannot play.
 * @cssproperty {outline} [--c2-audio-player__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - The focus ring.
 * @cssproperty {color} [--c2-audio-player__bubble--background-color=#ffffff] - The bubble variant's fill.
 * @cssproperty {length} [--c2-audio-player__bubble--border-radius=16px 16px 16px 4px] - The bubble variant's corners.
 * @cssproperty {shadow} [--c2-audio-player__bubble--box-shadow=0 1px 2px rgba(24, 24, 27, 0.08)] - The bubble variant's shadow.
 * @cssproperty {length} [--c2-audio-player__bubble--max-width=320px] - The bubble variant's widest.
 * @cssproperty {number} [--c2-audio-player--disabled-opacity=0.38] - The opacity of a player that cannot play.
 */
@customElement('c2-audio-player')
export class AudioPlayer extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The audio file, played by an `<audio>` of the player's own. Ignored while an `<audio>` is slotted. */
  @property() src = ''

  /** Names the player and its play button ("Play voice note from Ana"). */
  @property() label = ''

  /** The waveform: numbers from 0 to 1. Without it, the player computes it from `src` when it can fetch the file. */
  @property({ converter: jsonPropertyConverter }) peaks: number[] | undefined = undefined

  /** The most bars the waveform draws; a narrow waveform draws as many as fit. */
  @property({ type: Number }) bars = 48

  /** The length in seconds, shown before the audio's metadata has loaded. */
  @property({ type: Number }) duration: number | undefined = undefined

  /** Pauses every other `exclusive` player on the page when this one starts. */
  @property({ type: Boolean }) exclusive = false

  /** A text transcript, shown below the player behind a toggle. The `transcript` slot takes richer content. */
  @property() transcript = ''

  /** `bubble` is the compact chat-message look. */
  @property() variant: AudioPlayerVariant = 'default'

  /** How much of the player's own `<audio>` loads up front, as on `<audio>`. `none` also waits for a play to compute the waveform. */
  @property() preload: 'none' | 'metadata' | 'auto' = 'metadata'

  @state() private playing = false
  @state() private currentTime = 0
  @state() private mediaDuration = Number.NaN
  @state() private rate = 1
  @state() private failed = false
  @state() private transcriptOpen = false
  @state() private hasTranscriptSlot = false
  @state() private hasAvatar = false
  @state() private decodedPeaks: number[] | null = null
  @state() private decoding = false
  @state() private slotted: HTMLAudioElement | null = null
  /** How many bars fit the waveform, measured after the first render (which draws `bars`, as the server does). */
  @state() private fitted: number | null = null

  @query('audio.own') private ownAudio?: HTMLAudioElement | null
  @query('.waveform') private waveform?: HTMLElement | null

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, audioPlayerMessages)
  private bound: HTMLAudioElement | null = null
  private frame = 0
  private decodeAbort?: AbortController
  private decodedFor = ''
  private pendingSeek: number | null = null
  private dragging = false
  private resizeObserver?: ResizeObserver

  /** The `<audio>` that plays: the slotted one, or the player's own. */
  get media(): HTMLAudioElement | null {
    return this.slotted ?? this.ownAudio ?? null
  }

  /** Plays the audio. */
  play(): Promise<void> {
    return this.media?.play().catch(() => undefined) ?? Promise.resolve()
  }

  /** Pauses the audio. */
  pause(): void {
    this.media?.pause()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.exclusive) exclusivePlayers.add(this)
    if (this.hasUpdated) this.bindMedia()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    exclusivePlayers.delete(this)
    this.decodeAbort?.abort()
    this.decodeAbort = undefined
    this.decodedFor = ''
    this.decoding = false
    cancelAnimationFrame(this.frame)
    this.unbindMedia()
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('exclusive')) {
      if (this.exclusive && this.isConnected) exclusivePlayers.add(this)
      else exclusivePlayers.delete(this)
    }
    if (changed.has('src') && changed.get('src') !== undefined) {
      this.decodedPeaks = null
      this.failed = false
      this.currentTime = 0
      this.mediaDuration = Number.NaN
    }
  }

  protected override firstUpdated(): void {
    // The slotted `<audio>` may have loaded, even played, before this element upgraded or hydrated: read its state now.
    this.readSlot()
    this.bindMedia()
    this.observeSize()
  }

  private observeSize(): void {
    if (typeof ResizeObserver === 'undefined' || this.resizeObserver || !this.waveform) return
    this.resizeObserver = new ResizeObserver(() => this.measure())
    this.resizeObserver.observe(this.waveform)
  }

  /** As many bars as fit the waveform's width at the bar width and gap the theme sets, up to `bars`. */
  private measure(): void {
    const waveform = this.waveform
    const bar = waveform?.querySelector<HTMLElement>('.bar')
    if (!waveform || !bar) return
    const width = waveform.clientWidth
    const barWidth = parseFloat(getComputedStyle(bar).width) || 3
    const gap = parseFloat(getComputedStyle(waveform).columnGap) || 0
    const max = Math.max(1, Math.round(this.bars))
    const fits = width > 0 ? Math.max(8, Math.floor((width + gap) / (barWidth + gap))) : max
    const count = Math.min(max, fits)
    if (count !== this.fitted) this.fitted = count
  }

  protected override updated(changed: PropertyValues): void {
    this.internals.role = 'group'
    this.internals.ariaLabel = this.label || this.msg.t('player')
    if (changed.has('slotted') || changed.has('src')) this.bindMedia()
    if (changed.has('bars') && this.hasUpdated) this.measure()
    this.observeSize()
    if (changed.has('peaks') || changed.has('src') || changed.has('slotted') || changed.has('preload')) this.maybeDecode()
  }

  // ------------------------------------------------------------------------------------------------------- media

  private readSlot(): void {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot:not([name])')
    const audio = slot?.assignedElements({ flatten: true }).find((element): element is HTMLAudioElement => element instanceof HTMLAudioElement) ?? null
    if (audio !== this.slotted) this.slotted = audio
  }

  private readonly onMediaEvent = (event: Event): void => {
    const media = event.currentTarget as HTMLAudioElement
    switch (event.type) {
      case 'play':
        this.playing = true
        if (this.exclusive) for (const other of exclusivePlayers) if (other !== this) other.pause()
        this.tick()
        this.maybeDecode()
        break
      case 'pause':
      case 'ended':
        this.playing = false
        this.currentTime = media.currentTime
        break
      case 'timeupdate':
      case 'seeked':
        if (!this.dragging) this.currentTime = media.currentTime
        return
      case 'loadedmetadata':
      case 'durationchange':
        this.mediaDuration = media.duration
        if (this.pendingSeek !== null && Number.isFinite(media.duration)) {
          media.currentTime = Math.min(this.pendingSeek, media.duration)
          this.pendingSeek = null
        }
        return
      case 'ratechange':
        this.rate = media.playbackRate
        break
      case 'error':
        this.failed = true
        this.playing = false
        return
      case 'loadstart':
        this.failed = false
        return
    }
    // play, pause, ended and ratechange are the host's events too: a media event does not leave the shadow root.
    this.dispatchEvent(new Event(event.type))
  }

  private static readonly mediaEvents = ['play', 'pause', 'ended', 'timeupdate', 'seeked', 'loadedmetadata', 'durationchange', 'ratechange', 'error', 'loadstart']

  private bindMedia(): void {
    const media = this.media
    if (media === this.bound) return
    this.unbindMedia()
    if (!media) return
    this.bound = media
    for (const type of AudioPlayer.mediaEvents) media.addEventListener(type, this.onMediaEvent)
    this.playing = !media.paused && !media.ended
    this.currentTime = media.currentTime
    this.mediaDuration = media.duration
    this.failed = media.error !== null
    // A speed chosen before the media was there carries over.
    if (media.playbackRate !== this.rate) media.playbackRate = this.rate
    if (this.playing) this.tick()
  }

  private unbindMedia(): void {
    if (!this.bound) return
    for (const type of AudioPlayer.mediaEvents) this.bound.removeEventListener(type, this.onMediaEvent)
    this.bound = null
  }

  /** Follows the playhead every frame while playing, so the played bars advance smoothly. */
  private tick(): void {
    cancelAnimationFrame(this.frame)
    const step = () => {
      const media = this.media
      if (!media || media.paused || !this.isConnected) return
      if (!this.dragging) this.currentTime = media.currentTime
      this.frame = requestAnimationFrame(step)
    }
    this.frame = requestAnimationFrame(step)
  }

  private get length(): number {
    return Number.isFinite(this.mediaDuration) && this.mediaDuration > 0 ? this.mediaDuration : (this.duration ?? 0)
  }

  private seek(seconds: number): void {
    const length = this.length
    const time = Math.max(0, length ? Math.min(length, seconds) : seconds)
    this.currentTime = time
    const media = this.media
    if (!media) return
    if (Number.isFinite(media.duration)) media.currentTime = time
    else {
      // No metadata yet: seek once it arrives.
      this.pendingSeek = time
      if (media.preload === 'none' || media.readyState === 0) media.load()
    }
  }

  private toggle(): void {
    const media = this.media
    if (!media || this.failed) return
    if (media.paused) void this.play()
    else media.pause()
  }

  private cycleSpeed(): void {
    const index = SPEEDS.indexOf(this.rate)
    const next = SPEEDS[(index + 1) % SPEEDS.length]
    this.rate = next
    if (this.media) this.media.playbackRate = next
  }

  // ---------------------------------------------------------------------------------------------------- waveform

  /** Fetches and decodes the audio once to draw its waveform, when no `peaks` are given. */
  private maybeDecode(): void {
    if (this.peaks?.length) return
    const url = this.media?.currentSrc || this.media?.src || this.slotted?.querySelector('source')?.src || (this.src ? new URL(this.src, document.baseURI).href : '')
    if (!url || url === this.decodedFor) return
    if (this.preload === 'none' && !this.playing && !this.slotted) return
    this.decodedFor = url
    this.decodeAbort?.abort()
    const abort = new AbortController()
    this.decodeAbort = abort
    this.decoding = true
    void (async () => {
      try {
        const response = await fetch(url, { signal: abort.signal })
        if (!response.ok) throw new Error(String(response.status))
        const buffer = await response.arrayBuffer()
        const context = new OfflineAudioContext(1, 1, 44100)
        const audio = await context.decodeAudioData(buffer)
        if (abort.signal.aborted) return
        this.decodedPeaks = computePeaks(audio.getChannelData(0), Math.max(Math.round(this.bars), 16) * 4)
      } catch {
        // Another origin without CORS, an unsupported format, or aborted: the bars stay flat.
      } finally {
        if (this.decodeAbort === abort) {
          this.decoding = false
          this.decodeAbort = undefined
        }
      }
    })()
  }

  private get shownPeaks(): number[] | null {
    const peaks = this.peaks?.length ? this.peaks : this.decodedPeaks
    return peaks?.length ? resample(peaks, this.barCount) : null
  }

  private get barCount(): number {
    return Math.max(1, Math.min(this.fitted ?? Infinity, Math.round(this.bars)))
  }

  private fractionAt(event: PointerEvent): number {
    const box = this.waveform!.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width
    return Math.min(1, Math.max(0, getComputedStyle(this.waveform!).direction === 'rtl' ? 1 - x : x))
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.failed || !this.length) return
    event.preventDefault()
    this.waveform!.focus()
    this.waveform!.setPointerCapture(event.pointerId)
    this.dragging = true
    this.currentTime = this.fractionAt(event) * this.length
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return
    this.currentTime = this.fractionAt(event) * this.length
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.dragging) return
    this.dragging = false
    this.seek(this.fractionAt(event) * this.length)
  }

  private onPointerCancel(): void {
    this.dragging = false
    this.currentTime = this.media?.currentTime ?? this.currentTime
  }

  private onWaveformKey(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const step = { ArrowRight: STEP, ArrowUp: STEP, ArrowLeft: -STEP, ArrowDown: -STEP }[event.key]
    if (step !== undefined) {
      event.preventDefault()
      // Arrows move along the reading direction: in a right-to-left page, Right goes back.
      const rtl = getComputedStyle(this.waveform!).direction === 'rtl'
      const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft'
      this.seek(this.currentTime + (rtl && horizontal ? -step : step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      this.seek(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      this.seek(this.length)
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      this.toggle()
    }
  }

  // ------------------------------------------------------------------------------------------------------- slots

  private onDefaultSlot(): void {
    this.readSlot()
  }

  private onTranscriptSlot(event: Event): void {
    this.hasTranscriptSlot = (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).some(
      (node) => node.nodeType === Node.ELEMENT_NODE || !!node.textContent?.trim(),
    )
  }

  private onAvatarSlot(event: Event): void {
    this.hasAvatar = (event.target as HTMLSlotElement).assignedElements({ flatten: true }).length > 0
  }

  // ------------------------------------------------------------------------------------------------------ render

  private speedText(rate: number): string {
    return `${new Intl.NumberFormat(this.msg.locale, { maximumFractionDigits: 2 }).format(rate)}×`
  }

  private renderWaveform(length: number) {
    const peaks = this.shownPeaks
    const count = this.barCount
    const fraction = length ? Math.min(1, this.currentTime / length) : 0
    const played = fraction * count
    const time = formatAudioTime(this.currentTime)
    const total = formatAudioTime(length)
    return html`<div
      class=${classMap({ waveform: true, flat: !peaks, loading: this.decoding })}
      part="waveform"
      role="slider"
      tabindex=${this.failed ? '-1' : '0'}
      aria-label=${this.msg.t('seek')}
      aria-valuemin="0"
      aria-valuemax=${Math.round(length)}
      aria-valuenow=${Math.round(this.currentTime)}
      aria-valuetext=${this.msg.t('position', time, total)}
      aria-disabled=${this.failed ? 'true' : nothing}
      @pointerdown=${this.onPointerDown}
      @pointermove=${this.onPointerMove}
      @pointerup=${this.onPointerUp}
      @pointercancel=${this.onPointerCancel}
      @keydown=${this.onWaveformKey}
    >
      ${Array.from({ length: count }, (_, bar) => {
        const height = peaks ? Math.max(0.12, peaks[bar] ?? 0) : 0.12
        return html`<span class=${classMap({ bar: true, played: bar < played })} style=${styleMap({ height: `${Math.round(height * 100)}%` })}></span>`
      })}
    </div>`
  }

  private renderTime(length: number) {
    if (this.failed) return html`<span class="time error" part="time" role="status">${this.msg.t('error')}</span>`
    const started = this.playing || this.currentTime > 0
    const bubble = this.variant === 'bubble'
    const total = formatAudioTime(length)
    const text = bubble ? formatAudioTime(started ? this.currentTime : length) : started ? `${formatAudioTime(this.currentTime)} / ${total}` : total
    // The sizer holds the widest text the time can show, so starting to play never narrows the waveform under the pointer.
    const widest = bubble ? total : `${total} / ${total}`
    return html`<span class="time" part="time" aria-hidden="true"><span class="sizer">${widest}</span><span class="text">${text}</span></span>`
  }

  override render() {
    const length = this.length
    const bubble = this.variant === 'bubble'
    const label = this.label
    const action = this.playing ? (label ? this.msg.t('pauseLabel', label) : this.msg.t('pause')) : label ? this.msg.t('playLabel', label) : this.msg.t('play')
    const hasTranscript = !!this.transcript || this.hasTranscriptSlot
    const speed = this.speedText(this.rate)
    const play = html`<button
      type="button"
      class="play"
      part="play"
      aria-label=${action}
      ?disabled=${this.failed}
      @click=${() => this.toggle()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">${this.playing ? pauseIcon : playIcon}</svg>
    </button>`
    const speedButton = html`<button type="button" class="speed" part="speed" aria-label=${this.msg.t('speed', speed)} ?disabled=${this.failed} @click=${() => this.cycleSpeed()}>
      ${speed}
    </button>`
    return html`
      <div class=${classMap({ player: true, bubble, failed: this.failed, 'has-avatar': this.hasAvatar })} part="player">
        <span class="avatar" ?hidden=${!this.hasAvatar}><slot name="avatar" @slotchange=${this.onAvatarSlot}></slot></span>
        ${play}
        ${
          bubble
            ? html`<div class="body">${this.renderWaveform(length)}<div class="meta">${this.renderTime(length)}${speedButton}</div></div>`
            : html`${this.renderWaveform(length)}${this.renderTime(length)}${speedButton}`
        }
        ${
          hasTranscript
            ? html`<button
                type="button"
                class="toggle"
                aria-expanded=${this.transcriptOpen ? 'true' : 'false'}
                aria-controls="transcript"
                @click=${() => (this.transcriptOpen = !this.transcriptOpen)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" class=${this.transcriptOpen ? 'open' : ''}>${chevronIcon}</svg>${
                  this.transcriptOpen ? this.msg.t('hideTranscript') : this.msg.t('showTranscript')
                }
              </button>`
            : nothing
        }
        <div id="transcript" class="transcript" part="transcript" ?hidden=${!hasTranscript || !this.transcriptOpen}>
          ${this.transcript && !this.hasTranscriptSlot ? html`<p>${this.transcript}</p>` : nothing}<slot name="transcript" @slotchange=${this.onTranscriptSlot}></slot>
        </div>
      </div>
      <slot @slotchange=${this.onDefaultSlot}></slot>
      ${this.slotted || !this.src ? nothing : html`<audio class="own" src=${this.src} preload=${this.preload}></audio>`}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-audio-player': AudioPlayer
  }
}
