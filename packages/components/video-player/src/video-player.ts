import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { live } from 'lit/directives/live.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/menu'
import type { Menu, MenuSelectEventDetail } from '@c2n/menu'
import { videoPlayerMessages } from './messages.js'
import { chapterAt, formatTime, parseVtt, thumbnailFromCue, type VideoChapter, type VideoThumbnail } from './vtt.js'
import styles from './video-player.scss?inline'

export type { VideoChapter, VideoThumbnail, VttCue } from './vtt.js'
export { parseVtt, formatTime } from './vtt.js'
export { videoPlayerMessages } from './messages.js'

/** Gives the thumbnail for a time, in seconds: a URL, a region of a sprite, or nothing. */
export type VideoThumbnailResolver = (time: number) => string | VideoThumbnail | null | undefined

export interface VideoPlayerChapterChangeDetail {
  /** The chapter's index in the chapter list. */
  index: number
  chapter: VideoChapter
}

/** Events fired by {@link VideoPlayer}, keyed for `addEventListener`. */
export interface VideoPlayerEventMap {
  'chapter-change': CustomEvent<VideoPlayerChapterChangeDetail>
}

export interface VideoPlayer {
  addEventListener: TypedAddEventListener<VideoPlayer, VideoPlayerEventMap>
  removeEventListener: TypedRemoveEventListener<VideoPlayer, VideoPlayerEventMap>
}

interface CaptionTrack {
  track: TextTrack
  label: string
}

interface ThumbnailCue {
  start: number
  end: number
  thumbnail: VideoThumbnail
}

const HIDE_DELAY = 2500
const MEDIA_EVENTS = [
  'play',
  'pause',
  'playing',
  'waiting',
  'canplay',
  'seeking',
  'seeked',
  'timeupdate',
  'durationchange',
  'loadedmetadata',
  'progress',
  'volumechange',
  'ratechange',
  'ended',
  'error',
  'emptied',
  'enterpictureinpicture',
  'leavepictureinpicture',
] as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Themed controls over a real `<video>`: chapters on the seek bar, a thumbnail while scrubbing, captions, speed,
 * picture-in-picture and full screen, the way Loom and YouTube draw them.
 *
 * Put the `<video>` inside the player, with its `<source>` and `<track>` children, and leave its `controls` off: every
 * native feature keeps working (several sources, captions, `crossorigin`, an HLS or DASH library attached to it), and
 * the player never writes an attribute on it. For a single file, `src` and `poster` are a shortcut that renders the
 * player's own video. `media` gives the video element, to hand to `c2-transcript` or an analytics SDK.
 *
 * The seek bar shows the buffered range and the played part, split into one segment per chapter. The chapters come
 * from `chapters` or from a `<track kind="chapters">`; `chapter-change` fires as playback enters one. Hovering or
 * dragging over the bar shows the time, the chapter and, with `thumbnails` (a WebVTT file of `sprite.jpg#xywh=` cues,
 * or a function of the time), a thumbnail. The settings menu (a `c2-menu`) holds the speed and the caption track; the
 * captions button turns the last track on and off. Full screen covers the whole player, so the controls stay.
 *
 * The controls hide 2.5 s after the pointer stops while the video plays, and come back on any movement, on focus and
 * on pause. A big play button covers the poster until the first play, a spinner shows while the video waits for
 * data, and an error panel names what went wrong with a button to try again.
 *
 * Keyboard, anywhere in the player: Space or K plays and pauses, ← and → seek 5 s, J and L seek 10 s, ↑ and ↓ change
 * the volume (on the seek bar they seek), M mutes, C toggles captions, F toggles full screen, 0–9 jump to that tenth
 * of the video, Home and End go to the start and the end. The seek bar is a `slider` read as "1:23 of 4:56,
 * Dashboards". The host is a group named by `label`; it matches `:state(playing)`, `:state(fullscreen)` and
 * `:state(idle)` (controls hidden).
 *
 * @tag c2-video-player
 *
 * @slot - The `<video>` element, with its sources and tracks.
 *
 * @csspart player - The box holding the video, the overlays and the controls.
 * @csspart controls - The bottom bar: the seek bar and the row of buttons.
 * @csspart seek - The seek bar.
 * @csspart preview - The time, chapter and thumbnail shown over the seek bar.
 * @csspart big-play - The play button over the poster.
 *
 * @event chapter-change - Playback entered another chapter. `detail` is `{ index, chapter }`.
 *
 * @cssproperty {length} [--c2-video-player--width=100%] - The player's width; it keeps it as a flex item too.
 * @cssproperty {string} [--c2-video-player--aspect-ratio=16 / 9] - The player's shape before the video reports its own.
 * @cssproperty {color} [--c2-video-player--background-color=#000000] - Behind the video (letterbox bars).
 * @cssproperty {color} [--c2-video-player--color=#ffffff] - Text and icons of the controls.
 * @cssproperty {length} [--c2-video-player--border-radius=8px] - The player's corners (none in full screen).
 * @cssproperty {color} [--c2-video-player__accent--color=rgb(2, 101, 220)] - The played part of the seek bar and its handle.
 * @cssproperty {color} [--c2-video-player__track--color=rgba(255, 255, 255, 0.28)] - The seek bar not yet loaded.
 * @cssproperty {color} [--c2-video-player__buffered--color=rgba(255, 255, 255, 0.5)] - The loaded part of the seek bar.
 * @cssproperty {length} [--c2-video-player__chapter--gap=3px] - The gap between chapter segments.
 * @cssproperty {background} [--c2-video-player__controls--background=linear-gradient(to top, rgba(0, 0, 0, 0.78), rgba(0, 0, 0, 0.35) 60%, transparent)] - Behind the controls, so they read over a bright frame.
 * @cssproperty {length} [--c2-video-player__control--size=36px] - The size of each control button.
 * @cssproperty {color} [--c2-video-player__control__hover--background-color=rgba(255, 255, 255, 0.14)] - A control button under the pointer.
 * @cssproperty {length} [--c2-video-player__thumbnail--width=160px] - A whole-image thumbnail's width (a sprite region keeps its own size).
 * @cssproperty {color} [--c2-video-player__tooltip--background-color=rgba(24, 24, 27, 0.9)] - Behind the preview's time and chapter, and the menu.
 * @cssproperty {length} [--c2-video-player__big-play--size=68px] - The play button over the poster.
 * @cssproperty {outline} [--c2-video-player__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focused controls.
 * @cssproperty {time} [--c2-video-player__transition--duration=200ms] - The controls fading in and out.
 */
@customElement('c2-video-player')
export class VideoPlayer extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Names the player (its group and the big play button), such as the video's title. */
  @property() label = ''

  /** A single video file, played by the player's own `<video>`. Leave it out when you slot a `<video>`. */
  @property() src?: string

  /** The image shown before the first frame, with `src`. */
  @property() poster?: string

  /** Chapters as `[{ "start": 0, "title": "Intro" }, …]`, sorted by `start` (seconds). Without it, a `<track kind="chapters">` gives them. */
  @property({ converter: jsonPropertyConverter }) chapters: VideoChapter[] = []

  /**
   * Thumbnails shown while scrubbing: the URL of a WebVTT file whose cues are images or sprite regions
   * (`thumbs.jpg#xywh=0,0,160,90`), or, as a property, a function of the time.
   */
  @property() thumbnails?: string | VideoThumbnailResolver

  /** The speeds the settings menu offers. */
  @property({ converter: jsonPropertyConverter }) rates: number[] = [0.5, 0.75, 1, 1.25, 1.5, 2]

  /** The `<video>` the controls drive: the slotted one, or the player's own. */
  get media(): HTMLVideoElement | null {
    return this.video
  }

  @state() private playing = false
  @state() private started = false
  @state() private time = 0
  @state() private duration = 0
  @state() private bufferedEnd = 0
  @state() private volume = 1
  @state() private muted = false
  @state() private rate = 1
  @state() private waiting = false
  @state() private errorCode = 0
  @state() private fullscreen = false
  @state() private pip = false
  @state() private idle = false
  @state() private hoverTime: number | null = null
  @state() private scrubbing = false
  @state() private trackChapters: VideoChapter[] = []
  @state() private captionTracks: CaptionTrack[] = []
  @state() private activeCaption = -1
  @state() private thumbnailCues: ThumbnailCue[] = []
  @state() private announcement = ''
  /** Set from the first client update: what the browser supports is unknown on the server. */
  @state() private pipSupported = false
  @state() private fullscreenSupported = false

  @query('.seek') private seekBar?: HTMLElement
  @query('.settings-menu') private settingsMenu?: Menu

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, videoPlayerMessages)
  private video: HTMLVideoElement | null = null
  private lastCaption = -1
  private chapterIndex = -1
  private hideTimer?: ReturnType<typeof setTimeout>
  private thumbnailsRequest = 0

  constructor() {
    super()
    this.internals.role = 'group'
  }

  override connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('fullscreenchange', this.onFullscreenChange)
    if (this.hasUpdated) this.attachMedia()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('fullscreenchange', this.onFullscreenChange)
    clearTimeout(this.hideTimer)
    this.detachMedia()
  }

  // ------------------------------------------------------------------------------------------------- the media

  private findMedia(): HTMLVideoElement | null {
    const slotted = [...this.children].find((child): child is HTMLVideoElement => child instanceof HTMLVideoElement)
    return slotted ?? this.renderRoot.querySelector<HTMLVideoElement>('video.own')
  }

  private attachMedia(): void {
    const next = this.findMedia()
    if (next === this.video) return
    this.detachMedia()
    this.video = next
    if (!next) return
    for (const name of MEDIA_EVENTS) next.addEventListener(name, this.onMediaEvent)
    next.textTracks.addEventListener('addtrack', this.onTracksChange)
    next.textTracks.addEventListener('removetrack', this.onTracksChange)
    next.textTracks.addEventListener('change', this.onTracksChange)
    next.addEventListener('load', this.onTrackLoad, true)
    // A failed <source> fires `error` on itself, not on the video, and leaves `video.error` empty.
    next.addEventListener('error', this.onSourceError, true)
    // The video may have loaded, or even played, before the player upgraded or hydrated.
    this.syncFromMedia()
    this.onTracksChange()
  }

  private detachMedia(): void {
    const video = this.video
    if (!video) return
    for (const name of MEDIA_EVENTS) video.removeEventListener(name, this.onMediaEvent)
    video.textTracks.removeEventListener('addtrack', this.onTracksChange)
    video.textTracks.removeEventListener('removetrack', this.onTracksChange)
    video.textTracks.removeEventListener('change', this.onTracksChange)
    video.removeEventListener('load', this.onTrackLoad, true)
    video.removeEventListener('error', this.onSourceError, true)
    clearTimeout(this.sourceErrorTimer)
    this.video = null
    // Nothing of that video stays on screen: the controls start over for the next one.
    this.stopPlaying()
    this.started = false
    this.waiting = false
    this.errorCode = 0
    this.time = 0
    this.duration = 0
    this.bufferedEnd = 0
    this.trackChapters = []
    this.chapterIndex = -1
    this.captionTracks = []
    this.activeCaption = -1
    this.lastCaption = -1
  }

  private syncFromMedia(): void {
    const video = this.video
    if (!video) return
    this.playing = !video.paused && !video.ended
    if (this.playing || video.currentTime > 0) this.started = true
    this.time = video.currentTime
    this.duration = Number.isFinite(video.duration) ? video.duration : 0
    this.volume = video.volume
    this.muted = video.muted
    this.rate = video.playbackRate
    this.errorCode = video.error?.code ?? (this.noSource(video) ? MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED : 0)
    this.pip = typeof document !== 'undefined' && document.pictureInPictureElement === video
    this.updateBuffered()
    this.updateChapter()
  }

  private sourceErrorTimer?: ReturnType<typeof setTimeout>

  /** Every `<source>` failed: the video gave up looking (`NETWORK_NO_SOURCE`) and has no `error` of its own. */
  private noSource(video: HTMLVideoElement): boolean {
    return (
      !video.error &&
      video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE &&
      video.readyState === HTMLMediaElement.HAVE_NOTHING &&
      !!video.querySelector('source')
    )
  }

  private onSourceError = (event: Event): void => {
    const video = this.video
    if (!video || event.target === video) return
    // The video moves on to the next source, or gives up, after this event: look once it has.
    clearTimeout(this.sourceErrorTimer)
    this.sourceErrorTimer = setTimeout(() => {
      if (this.video !== video || !this.noSource(video)) return
      this.errorCode = MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      this.waiting = false
      this.stopPlaying()
    })
  }

  /** Playback stopped without a `pause` event (an error, a new source): the controls stop hiding. */
  private stopPlaying(): void {
    this.playing = false
    this.idle = false
    clearTimeout(this.hideTimer)
  }

  private onMediaEvent = (event: Event): void => {
    const video = this.video
    if (!video) return
    switch (event.type) {
      case 'play':
        this.started = true
        this.playing = true
        this.errorCode = 0
        this.wake()
        break
      case 'pause':
      case 'ended':
        this.playing = false
        this.waiting = false
        this.idle = false
        clearTimeout(this.hideTimer)
        break
      case 'playing':
      case 'canplay':
      case 'seeked':
        this.waiting = false
        break
      case 'loadedmetadata':
        // Media that loads did not fail, whatever an early look at its state suggested.
        if (!video.error) this.errorCode = 0
        break
      case 'waiting':
        this.waiting = true
        break
      case 'error':
        this.errorCode = video.error?.code ?? 4
        this.waiting = false
        this.stopPlaying()
        break
      case 'emptied':
        // A new source (or `load()`) resets the media without a `pause` event.
        this.stopPlaying()
        this.waiting = false
        this.started = false
        this.time = 0
        this.bufferedEnd = 0
        break
      case 'enterpictureinpicture':
        this.pip = true
        break
      case 'leavepictureinpicture':
        this.pip = false
        break
    }
    this.time = video.currentTime
    this.duration = Number.isFinite(video.duration) ? video.duration : 0
    this.volume = video.volume
    this.muted = video.muted
    this.rate = video.playbackRate
    this.updateBuffered()
    this.updateChapter()
  }

  private updateBuffered(): void {
    const video = this.video
    if (!video) return
    const ranges = video.buffered
    let end = 0
    for (let index = 0; index < ranges.length; index += 1) {
      if (ranges.start(index) <= video.currentTime + 0.5) end = Math.max(end, ranges.end(index))
    }
    this.bufferedEnd = end
  }

  private onTrackLoad = (event: Event): void => {
    if (event.target instanceof HTMLTrackElement) this.onTracksChange()
  }

  private onTracksChange = (): void => {
    const video = this.video
    if (!video) return
    const tracks = [...video.textTracks]
    const captions = tracks.filter((track) => track.kind === 'captions' || track.kind === 'subtitles')
    this.captionTracks = captions.map((track, index) => ({ track, label: track.label || track.language || `${index + 1}` }))
    this.activeCaption = captions.findIndex((track) => track.mode === 'showing')
    if (this.activeCaption >= 0) this.lastCaption = this.activeCaption
    // A chapters track only loads its cues once it is not disabled; hidden loads them without drawing anything.
    const chapters = tracks.find((track) => track.kind === 'chapters')
    if (chapters) {
      if (chapters.mode === 'disabled') chapters.mode = 'hidden'
      const cues = chapters.cues ? [...chapters.cues] : []
      this.trackChapters = cues.map((cue) => ({ start: cue.startTime, title: (cue as VTTCue).text ?? '' }))
      this.updateChapter()
    } else if (this.trackChapters.length) {
      // The chapters track went away: its chapters go with it.
      this.trackChapters = []
      this.updateChapter()
    }
  }

  private get chapterList(): VideoChapter[] {
    const list = this.chapters.length ? this.chapters : this.trackChapters
    return [...list].filter((chapter) => Number.isFinite(chapter.start)).sort((a, b) => a.start - b.start)
  }

  private updateChapter(): void {
    const chapters = this.chapterList
    const index = chapterAt(chapters, this.time)
    if (index === this.chapterIndex) return
    this.chapterIndex = index
    if (index >= 0) {
      this.dispatchEvent(new CustomEvent('chapter-change', { detail: { index, chapter: chapters[index] }, bubbles: true, composed: true }))
    }
  }

  // ---------------------------------------------------------------------------------------------- the commands

  /** Plays the video. */
  play(): void {
    void this.video?.play().catch(() => undefined)
  }

  /** Pauses the video. */
  pause(): void {
    this.video?.pause()
  }

  private togglePlay(): void {
    const video = this.video
    if (!video) return
    if (video.paused || video.ended) this.play()
    else this.pause()
  }

  private seekTo(time: number): void {
    const video = this.video
    if (!video || !this.duration) return
    video.currentTime = clamp(time, 0, this.duration)
    this.time = video.currentTime
    this.updateChapter()
  }

  private setVolume(value: number): void {
    const video = this.video
    if (!video) return
    video.volume = clamp(value, 0, 1)
    video.muted = video.volume === 0
  }

  private toggleMute(): void {
    const video = this.video
    if (!video) return
    if (video.muted || video.volume === 0) {
      video.muted = false
      if (video.volume === 0) video.volume = 0.5
    } else video.muted = true
  }

  private setRate(rate: number): void {
    if (!this.video) return
    this.video.playbackRate = rate
    this.say(this.msg.t('speedChanged', this.rateLabel(rate)))
  }

  private setCaption(index: number): void {
    this.captionTracks.forEach(({ track }, position) => (track.mode = position === index ? 'showing' : 'disabled'))
    this.activeCaption = index
    if (index >= 0) this.lastCaption = index
    this.say(this.msg.t('captionsChanged', index >= 0 ? this.captionTracks[index].label : this.msg.t('off')))
  }

  private toggleCaptions(): void {
    if (!this.captionTracks.length) return
    if (this.activeCaption >= 0) this.setCaption(-1)
    else this.setCaption(this.lastCaption >= 0 && this.lastCaption < this.captionTracks.length ? this.lastCaption : 0)
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement === this) await document.exitFullscreen()
      else await this.requestFullscreen()
    } catch {
      // Refused (no user gesture, or not allowed in this frame): nothing changes.
    }
  }

  private async togglePip(): Promise<void> {
    const video = this.video
    if (!video) return
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      // Refused: nothing changes.
    }
  }

  private retry(): void {
    this.errorCode = 0
    this.video?.load()
  }

  private onFullscreenChange = (): void => {
    this.fullscreen = document.fullscreenElement === this
  }

  private say(text: string): void {
    this.announcement = ''
    requestAnimationFrame(() => (this.announcement = text))
  }

  // ---------------------------------------------------------------------------------------- showing the controls

  private wake = (): void => {
    this.idle = false
    clearTimeout(this.hideTimer)
    if (this.playing) this.hideTimer = setTimeout(() => this.hideControls(), HIDE_DELAY)
  }

  private hideControls(): void {
    // Keyboard focus in the bar keeps it up; a button focused by a mouse click does not.
    const keyboardFocus = !!this.renderRoot.querySelector('.chrome :focus-visible')
    if (!this.playing || this.scrubbing || this.settingsMenu?.open || keyboardFocus) return
    this.idle = true
  }

  // ------------------------------------------------------------------------------------------------- the seek bar

  /** Whether the player lays out right to left: the seek bar then fills from the right, and ← moves forward. */
  private get rtl(): boolean {
    if (!this.isConnected || typeof getComputedStyle !== 'function') return false
    return getComputedStyle(this).direction === 'rtl'
  }

  private timeAtPointer(event: PointerEvent): number {
    const box = this.seekBar?.getBoundingClientRect()
    if (!box || !box.width) return 0
    const x = (event.clientX - box.left) / box.width
    return clamp(this.rtl ? 1 - x : x, 0, 1) * this.duration
  }

  private onSeekPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.duration) return
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    this.scrubbing = true
    this.hoverTime = this.timeAtPointer(event)
    this.seekTo(this.hoverTime)
  }

  private onSeekPointerMove(event: PointerEvent): void {
    if (!this.duration) return
    this.hoverTime = this.timeAtPointer(event)
    if (this.scrubbing) this.seekTo(this.hoverTime)
    this.wake()
  }

  private onSeekPointerUp(): void {
    this.scrubbing = false
  }

  private onSeekPointerLeave(): void {
    if (!this.scrubbing) this.hoverTime = null
  }

  // -------------------------------------------------------------------------------------------------- keyboard

  private onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    const path = event.composedPath()
    const origin = path[0]
    // The open settings menu has its own keys; its closed trigger is one of the player's controls.
    if (this.settingsMenu?.open && path.some((node) => node instanceof HTMLElement && node.localName === 'c2-menu')) return
    const onButton = origin instanceof HTMLButtonElement
    const onVolume = origin instanceof HTMLInputElement
    const onSeek = origin === this.seekBar
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    // modern-web-ignore: ime-enter the only inputs in the player are range sliders (volume, seek); no text field composes here
    if ((key === ' ' || key === 'Enter') && onButton) return
    if (onVolume && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key)) return
    let handled = true
    switch (key) {
      case ' ':
      case 'k':
        this.togglePlay()
        break
      case 'ArrowLeft':
        this.seekTo(this.time + (this.rtl ? 5 : -5))
        break
      case 'ArrowRight':
        this.seekTo(this.time + (this.rtl ? -5 : 5))
        break
      case 'j':
        this.seekTo(this.time - 10)
        break
      case 'l':
        this.seekTo(this.time + 10)
        break
      case 'PageDown':
        this.seekTo(this.time - 10)
        break
      case 'PageUp':
        this.seekTo(this.time + 10)
        break
      case 'ArrowUp':
        if (onSeek) this.seekTo(this.time + 5)
        else this.setVolume((this.muted ? 0 : this.volume) + 0.1)
        break
      case 'ArrowDown':
        if (onSeek) this.seekTo(this.time - 5)
        else this.setVolume((this.muted ? 0 : this.volume) - 0.1)
        break
      case 'Home':
        this.seekTo(0)
        break
      case 'End':
        this.seekTo(this.duration)
        break
      case 'm':
        this.toggleMute()
        break
      case 'c':
        this.toggleCaptions()
        break
      case 'f':
        void this.toggleFullscreen()
        break
      default:
        if (/^[0-9]$/.test(key)) this.seekTo((Number(key) / 10) * this.duration)
        else handled = false
    }
    if (handled) {
      event.preventDefault()
      this.wake()
    }
  }

  // --------------------------------------------------------------------------------------------------- the menu

  private onMenuSelect(event: CustomEvent<MenuSelectEventDetail>): void {
    event.stopPropagation()
    const [kind, value] = String(event.detail.value).split(':')
    if (kind === 'rate') this.setRate(Number(value))
    else if (kind === 'cc') this.setCaption(Number(value))
  }

  private rateLabel(rate: number): string {
    return rate === 1 ? this.msg.t('normalRate') : this.msg.t('rate', new Intl.NumberFormat(this.msg.locale).format(rate))
  }

  // ---------------------------------------------------------------------------------------------- the thumbnails

  private async loadThumbnails(url: string): Promise<void> {
    const request = ++this.thumbnailsRequest
    try {
      const base = new URL(url, document.baseURI).href
      const response = await fetch(base)
      if (!response.ok) throw new Error(String(response.status))
      const cues = parseVtt(await response.text()).flatMap((cue) => {
        const thumbnail = thumbnailFromCue(cue.text, base)
        return thumbnail ? [{ start: cue.start, end: cue.end, thumbnail }] : []
      })
      if (request === this.thumbnailsRequest) this.thumbnailCues = cues
    } catch {
      if (request === this.thumbnailsRequest) this.thumbnailCues = []
    }
  }

  private thumbnailAt(time: number): VideoThumbnail | null {
    if (typeof this.thumbnails === 'function') {
      const result = this.thumbnails(time)
      return typeof result === 'string' ? { url: result } : (result ?? null)
    }
    return this.thumbnailCues.find((cue) => time >= cue.start && time < cue.end)?.thumbnail ?? null
  }

  // -------------------------------------------------------------------------------------------------- lifecycle

  protected override willUpdate(changed: PropertyValues<this>): void {
    // A new `src` starts over, paused: the old video's `pause` may never come.
    if (changed.has('src') && this.hasUpdated) this.stopPlaying()
    if (changed.has('thumbnails') && typeof this.thumbnails === 'string' && this.hasUpdated) void this.loadThumbnails(this.thumbnails)
    if (changed.has('thumbnails') && typeof this.thumbnails !== 'string') {
      // A file still loading for the old value must not fill the previews in.
      this.thumbnailsRequest += 1
      this.thumbnailCues = []
    }
  }

  protected override firstUpdated(): void {
    this.pipSupported = typeof document !== 'undefined' && !!document.pictureInPictureEnabled && 'requestPictureInPicture' in HTMLVideoElement.prototype
    this.fullscreenSupported = typeof document !== 'undefined' && !!document.fullscreenEnabled
    if (typeof this.thumbnails === 'string') void this.loadThumbnails(this.thumbnails)
    this.attachMedia()
  }

  protected override updated(changed: PropertyValues<this>): void {
    // Every update, once the language is resolved for it: the fallback name follows `lang` as well as `label`.
    this.internals.ariaLabel = this.label || this.msg.t('player')
    if (changed.has('src')) this.attachMedia()
    if (changed.has('chapters')) {
      this.chapterIndex = -1
      this.updateChapter()
    }
    const states = this.internals.states as Set<string> | undefined
    if (states) {
      const toggle = (name: string, on: boolean) => (on ? states.add(name) : states.delete(name))
      toggle('playing', this.playing)
      toggle('fullscreen', this.fullscreen)
      toggle('idle', this.idle)
    }
  }

  // ------------------------------------------------------------------------------------------------- rendering

  private icon(name: string): TemplateResult {
    const paths: Record<string, TemplateResult> = {
      play: html`<path d="M7 4.5v15l12-7.5z" class="fill" />`,
      pause: html`<path d="M6 4h4v16H6zM14 4h4v16h-4z" class="fill" />`,
      volume: html`<path d="M4 9h4l5-4v14l-5-4H4z" class="fill" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />`,
      muted: html`<path d="M4 9h4l5-4v14l-5-4H4z" class="fill" /><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />`,
      cc: html`<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10.5 10.2a2 2 0 1 0 0 3.6M17 10.2a2 2 0 1 0 0 3.6" />`,
      gear: html`<circle cx="12" cy="12" r="3" /><path
          d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
        />`,
      pip: html`<rect x="3" y="5" width="18" height="14" rx="2" /><rect x="12" y="11" width="7" height="6" rx="1" class="fill" />`,
      full: html`<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />`,
      exitFull: html`<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />`,
      alert: html`<circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" />`,
    }
    return html`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`
  }

  private renderSeek(): TemplateResult {
    const duration = this.duration
    const chapters = this.chapterList
    const withHours = duration >= 3600
    // One segment per chapter, plus a leading one when the first chapter starts after 0.
    const starts = duration && chapters.length ? chapters.map((chapter) => chapter.start).filter((start) => start < duration) : []
    if (starts.length && starts[0] > 0) starts.unshift(0)
    const bounds = starts.length ? starts.map((start, index) => [start, starts[index + 1] ?? duration]) : [[0, duration || 1]]
    const fill = (until: number, [start, end]: number[]) => `${clamp(((until - start) / (end - start || 1)) * 100, 0, 100)}%`
    const hover = this.hoverTime
    const chapterIndex = chapterAt(chapters, this.time)
    const chapterTitle = chapterIndex >= 0 ? chapters[chapterIndex].title : ''
    const valueText = chapterTitle
      ? this.msg.t('timeOfInChapter', formatTime(this.time, withHours), formatTime(duration, withHours), chapterTitle)
      : this.msg.t('timeOf', formatTime(this.time, withHours), formatTime(duration, withHours))
    const percent = duration ? clamp((this.time / duration) * 100, 0, 100) : 0
    const rtl = this.rtl
    return html`<div
      class="seek ${classMap({ scrubbing: this.scrubbing })}"
      part="seek"
      role="slider"
      tabindex="0"
      aria-label=${this.msg.t('seek')}
      aria-valuemin="0"
      aria-valuemax=${Math.floor(duration)}
      aria-valuenow=${Math.floor(this.time)}
      aria-valuetext=${valueText}
      @pointerdown=${this.onSeekPointerDown}
      @pointermove=${this.onSeekPointerMove}
      @pointerup=${this.onSeekPointerUp}
      @pointercancel=${this.onSeekPointerUp}
      @pointerleave=${this.onSeekPointerLeave}
    >
      <div class="segments">
        ${bounds.map(
          (range) =>
            html`<div
              class="segment ${classMap({ hovered: hover !== null && hover >= range[0] && hover < range[1] })}"
              style=${styleMap({ flexGrow: String(range[1] - range[0]) })}
            >
              <div class="buffered" style=${styleMap({ width: fill(this.bufferedEnd, range) })}></div>
              <div class="played" style=${styleMap({ width: fill(this.time, range) })}></div>
            </div>`,
        )}
      </div>
      <div class="handle" style=${styleMap({ left: `${rtl ? 100 - percent : percent}%` })}></div>
      ${hover !== null && duration ? this.renderPreview(hover, chapters, withHours) : nothing}
    </div>`
  }

  private renderPreview(time: number, chapters: VideoChapter[], withHours: boolean): TemplateResult {
    const index = chapterAt(chapters, time)
    const thumbnail = this.thumbnailAt(time)
    const at = clamp((time / this.duration) * 100, 0, 100)
    const left = this.rtl ? 100 - at : at
    const sized = thumbnail && thumbnail.w && thumbnail.h
    return html`<div class="preview" part="preview" aria-hidden="true" style=${styleMap({ '--_left': `${left}%` })}>
      ${
        thumbnail
          ? html`<img
              class="thumb ${classMap({ region: !!sized })}"
              alt=""
              src=${thumbnail.url}
              style=${styleMap(
                sized ? { width: `${thumbnail.w}px`, height: `${thumbnail.h}px`, objectPosition: `-${thumbnail.x ?? 0}px -${thumbnail.y ?? 0}px` } : {},
              )}
            />`
          : nothing
      }
      <span class="label">${index >= 0 ? html`<b>${chapters[index].title}</b> · ` : nothing}${formatTime(time, withHours)}</span>
    </div>`
  }

  private renderControls(): TemplateResult {
    const withHours = this.duration >= 3600
    const chapters = this.chapterList
    const chapterIndex = chapterAt(chapters, this.time)
    const quiet = this.muted || this.volume === 0
    const caption = this.captionTracks[this.activeCaption >= 0 ? this.activeCaption : Math.max(0, this.lastCaption)]
    // One text node, so a line break in the template never splits "0:00 / 0:24".
    const timeText = `${formatTime(this.time, withHours)} / ${formatTime(this.duration, withHours)}`
    return html`<div class="controls">
      <button class="ctl play" type="button" aria-label=${this.msg.t(this.playing ? 'pause' : 'play')} @click=${this.togglePlay}>
        ${this.icon(this.playing ? 'pause' : 'play')}
      </button>
      <span class="volume">
        <button class="ctl" type="button" aria-label=${this.msg.t(quiet ? 'unmute' : 'mute')} @click=${this.toggleMute}>
          ${this.icon(quiet ? 'muted' : 'volume')}
        </button>
        <input
          class="volume-range"
          type="range"
          min="0"
          max="1"
          step="0.05"
          aria-label=${this.msg.t('volume')}
          .value=${live(String(quiet ? 0 : this.volume))}
          style=${styleMap({ '--_level': `${(quiet ? 0 : this.volume) * 100}%` })}
          @input=${(event: Event) => this.setVolume(Number((event.target as HTMLInputElement).value))}
        />
      </span>
      <span class="time">${timeText}${chapterIndex >= 0 ? html`<span class="chapter-name"> · ${chapters[chapterIndex].title}</span>` : nothing}</span>
      <span class="spacer"></span>
      ${
        this.captionTracks.length
          ? html`<button
              class="ctl cc ${classMap({ on: this.activeCaption >= 0 })}"
              type="button"
              aria-pressed=${this.activeCaption >= 0 ? 'true' : 'false'}
              aria-label=${this.activeCaption >= 0 ? this.msg.t('captionsOff', caption?.label ?? '') : this.msg.t('captionsOn', caption?.label ?? '')}
              @click=${this.toggleCaptions}
            >
              ${this.icon('cc')}
            </button>`
          : nothing
      }
      <c2-menu class="settings-menu" aria-label=${this.msg.t('settings')} placement="top-end" @menu-select=${this.onMenuSelect}>
        <button slot="trigger" class="ctl" type="button" aria-label=${this.msg.t('settings')}>${this.icon('gear')}</button>
        <h6>${this.msg.t('speed')}</h6>
        ${this.rates.map(
          (rate) =>
            html`<c2-menu-item type="radio" name="rate" value=${`rate:${rate}`} ?checked=${Math.abs(rate - this.rate) < 0.001}
              >${this.rateLabel(rate)}</c2-menu-item
            >`,
        )}
        ${
          this.captionTracks.length
            ? html`<hr />
                <h6>${this.msg.t('captions')}</h6>
                <c2-menu-item type="radio" name="captions" value="cc:-1" ?checked=${this.activeCaption < 0}>${this.msg.t('off')}</c2-menu-item>
                ${this.captionTracks.map(
                  (track, index) =>
                    html`<c2-menu-item type="radio" name="captions" value=${`cc:${index}`} ?checked=${index === this.activeCaption}
                      >${track.label}</c2-menu-item
                    >`,
                )}`
            : nothing
        }
      </c2-menu>
      ${
        this.pipSupported
          ? html`<button class="ctl pip" type="button" aria-label=${this.msg.t(this.pip ? 'exitPip' : 'pip')} @click=${this.togglePip}>
              ${this.icon('pip')}
            </button>`
          : nothing
      }
      ${
        this.fullscreenSupported
          ? html`<button
              class="ctl"
              type="button"
              aria-label=${this.msg.t(this.fullscreen ? 'exitFullscreen' : 'fullscreen')}
              @click=${() => void this.toggleFullscreen()}
            >
              ${this.icon(this.fullscreen ? 'exitFull' : 'full')}
            </button>`
          : nothing
      }
    </div>`
  }

  private renderError(): TemplateResult {
    const reasons: Record<number, string> = {
      1: this.msg.t('errorAborted'),
      2: this.msg.t('errorNetwork'),
      3: this.msg.t('errorDecode'),
      4: this.msg.t('errorSource'),
    }
    return html`<div class="error" role="alert">
      ${this.icon('alert')}
      <span class="message">${this.msg.t('error')}</span>
      <span class="detail">${reasons[this.errorCode] ?? reasons[4]}</span>
      <button class="retry" type="button" @click=${this.retry}>${this.msg.t('retry')}</button>
    </div>`
  }

  override render(): TemplateResult {
    const error = this.errorCode > 0
    return html`<div
      class="player ${classMap({ idle: this.idle, started: this.started, playing: this.playing, fullscreen: this.fullscreen })}"
      part="player"
      @pointermove=${this.wake}
      @pointerdown=${this.wake}
      @focusin=${this.wake}
      @keydown=${this.onKeyDown}
    >
      <div class="stage" @click=${() => this.started && !error && this.togglePlay()} @dblclick=${() => void this.toggleFullscreen()}>
        <slot @slotchange=${() => this.attachMedia()}></slot>
        ${this.src ? html`<video class="own" src=${this.src} poster=${ifDefined(this.poster)} playsinline preload="metadata"></video>` : nothing}
      </div>
      ${
        !this.started && !error
          ? html`<button class="big-play" part="big-play" type="button" aria-label=${this.msg.t('playVideo', this.label)} @click=${() => this.play()}>
              ${this.icon('play')}
            </button>`
          : nothing
      }
      ${this.waiting && !error ? html`<div class="spinner" role="status" aria-label=${this.msg.t('loading')}></div>` : nothing}
      ${error ? this.renderError() : nothing}
      <div class="chrome" part="controls">${this.renderSeek()} ${this.renderControls()}</div>
      <div class="announcement" role="status" aria-live="polite">${this.announcement}</div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-video-player': VideoPlayer
  }
}
