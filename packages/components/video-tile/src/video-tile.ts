import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/avatar'
import '@c2n/audio-visualizer'
import { videoTileMessages } from './messages'
import styles from './video-tile.scss?inline'

export { videoTileMessages } from './messages'

/** What the tile shows: a participant's camera or a screen they share. */
export type VideoTileKind = 'camera' | 'screen'

/** The quality of a participant's connection, as the call SDK reports it. */
export type VideoTileConnection = 'good' | 'fair' | 'poor'

/** Events fired by {@link VideoTile}, keyed for `addEventListener`. */
export interface VideoTileEventMap {
  'speaking-change': CustomEvent<{ speaking: boolean }>
}

export interface VideoTile {
  addEventListener: TypedAddEventListener<VideoTile, VideoTileEventMap>
  removeEventListener: TypedRemoveEventListener<VideoTile, VideoTileEventMap>
}

const micOffIcon = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
  <line x1="1" y1="1" x2="23" y2="23"></line>
  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
  <line x1="12" y1="19" x2="12" y2="23"></line>
</svg>`

const handIcon = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"></path>
  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
</svg>`

const pinIcon = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
  <line x1="12" y1="17" x2="12" y2="22"></line>
  <path
    d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"
  ></path>
</svg>`

/**
 * One participant of a call, as Meet, Zoom and Teams draw them: their video, or their avatar while the camera is off,
 * with their name, a live microphone meter and their status.
 *
 * `stream` (a `MediaStream`, property only) plays in an inner `<video>`, always muted: the call's audio is the app's to
 * play, as every call SDK does, and playing it twice echoes. An SDK that attaches its own `<video>` element puts it in
 * the default slot instead. `local` mirrors the reader's own camera and adds "(You)" to the name; `kind="screen"` shows
 * a screen share, fitted inside the tile and never mirrored. Without a live video track, or with `video-off`, the tile
 * shows a `c2-avatar` of `avatar-src` or the name's initials.
 *
 * The name pill ends with the microphone: a three-bar `c2-audio-visualizer` of `stream`'s audio (or of `level`, from the
 * SDK), or a struck-through microphone when `muted`. `speaking` draws the accent outline; set it from the SDK's active
 * speaker, or set `detect-speaking` to let the tile's meter decide. `hand-raised`, `pinned` and a `fair` or `poor`
 * `connection` add their badges, and the `badge` slot adds the app's own (recording, host). The `actions` slot shows on
 * hover and focus, for a menu of tile actions.
 *
 * The tile is a group named by the participant and their state ("Ana Ruiz, muted, hand raised"). Speaking is not part
 * of it, as it changes several times a second; a raised hand is announced once.
 *
 * @tag c2-video-tile
 *
 * @slot - A `<video>` element the call SDK attached, used instead of `stream`.
 * @slot badge - More badges beside the hand and the pin, top left.
 * @slot actions - Buttons shown on hover and focus, top right: typically a `c2-menu` of tile actions.
 *
 * @event {CustomEvent<{ speaking: boolean }>} speaking-change - Fired when the tile starts or stops showing the participant as speaking, from `speaking` or its own meter. Does not bubble.
 *
 * @csspart video - The inner `<video>`.
 * @csspart name - The name pill.
 * @csspart surface - The camera-off surface around the avatar.
 *
 * @internalcomponent c2-avatar
 * @internalcomponent c2-audio-visualizer
 *
 * @cssproperty {number} [--c2-video-tile--aspect-ratio=16 / 9]
 * @cssproperty {border-radius} [--c2-video-tile--border-radius=8px]
 * @cssproperty {color} [--c2-video-tile--background=#27272a] - Behind the video, seen around a screen share.
 * @cssproperty {string} [--c2-video-tile__video--object-fit=cover] - How a camera fills the tile.
 * @cssproperty {string} [--c2-video-tile__screen--object-fit=contain] - How a screen share fits the tile.
 * @cssproperty {color} [--c2-video-tile__surface--background=light-dark(#e4e4e7, #27272a)] - The camera-off surface.
 * @cssproperty {pixel} [--c2-video-tile__avatar--size=clamp(20px, 28cqh, 96px)] - The avatar on the camera-off surface.
 * @cssproperty {color} [--c2-video-tile__name--background=rgba(0, 0, 0, 0.55)]
 * @cssproperty {color} [--c2-video-tile__name--color=#ffffff]
 * @cssproperty {font-size} [--c2-video-tile__name--font-size=12px]
 * @cssproperty {font-weight} [--c2-video-tile__name--font-weight=500]
 * @cssproperty {border-radius} [--c2-video-tile__name--border-radius=6px]
 * @cssproperty {pixel} [--c2-video-tile__overlay--inset=8px] - Distance of the name pill and the badges from the edges.
 * @cssproperty {color} [--c2-video-tile__speaking--color=rgb(2, 101, 220)] - The outline of a speaking participant.
 * @cssproperty {pixel} [--c2-video-tile__speaking--width=3px]
 * @cssproperty {color} [--c2-video-tile__badge--background=rgba(0, 0, 0, 0.55)]
 * @cssproperty {color} [--c2-video-tile__badge--color=#ffffff]
 * @cssproperty {color} [--c2-video-tile__hand--background=#fbbf24]
 * @cssproperty {color} [--c2-video-tile__hand--color=#1c1917]
 * @cssproperty {color} [--c2-video-tile__signal__fair--color=#fbbf24]
 * @cssproperty {color} [--c2-video-tile__signal__poor--color=#f87171]
 */
@customElement('c2-video-tile')
export class VideoTile extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The participant's name. */
  @property({ reflect: true }) name = ''

  /** The participant's video (and audio, for the meter). Property only. */
  @property({ attribute: false }) stream: MediaStream | null = null

  /** The picture on the camera-off surface. The name's initials without it. */
  @property({ attribute: 'avatar-src' }) avatarSrc = ''

  /** The participant's microphone is off. */
  @property({ type: Boolean }) muted = false

  /** The participant's camera is off, whatever `stream` holds. */
  @property({ type: Boolean, attribute: 'video-off' }) videoOff = false

  /** The reader's own tile: mirrored, and "(You)" after the name. */
  @property({ type: Boolean }) local = false

  /** `camera`, or `screen` for a screen share. */
  @property({ reflect: true }) kind: VideoTileKind = 'camera'

  /** The participant is speaking: the accent outline. */
  @property({ type: Boolean, reflect: true }) speaking = false

  /** Lets the tile's own meter decide when the participant speaks, from `stream` or `level`. */
  @property({ type: Boolean, attribute: 'detect-speaking' }) detectSpeaking = false

  /** An audio level from 0 to 1 for the meter, for an SDK that reports one; `stream` wins over it. */
  @property({ type: Number }) level?: number

  /** The participant raised a hand. */
  @property({ type: Boolean, attribute: 'hand-raised' }) handRaised = false

  /** The tile is pinned. */
  @property({ type: Boolean, reflect: true }) pinned = false

  /** Connection quality; `fair` and `poor` show signal bars. */
  @property() connection: VideoTileConnection = 'good'

  @state() private detected = false
  @state() private slotted = false
  @state() private announcement = ''
  /** Bumped when a track of `stream` starts, ends, mutes or unmutes, so liveness is read again. */
  @state() private trackRevision = 0

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, videoTileMessages)
  private watchedStream: MediaStream | null = null
  /** What `speaking-change` last said. */
  private reportedSpeaking = false
  private readonly watchedTracks = new Set<MediaStreamTrack>()

  constructor() {
    super()
    this.internals.role = 'group'
  }

  /** Whether the tile shows the participant as speaking, from `speaking` or its own meter. */
  get isSpeaking(): boolean {
    return this.speaking || (this.detectSpeaking && this.detected)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.watchStream(null)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.hasUpdated) this.watchStream(this.stream)
  }

  /** Whether there is a video to show: a slotted element, or a live, enabled video track. */
  private get hasVideo(): boolean {
    if (this.videoOff) return false
    if (this.slotted) return true
    void this.trackRevision
    return !!this.stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled && !track.muted)
  }

  private get displayName(): string {
    const name = this.name.trim() || this.msg.t('participant')
    if (this.kind === 'screen') return this.msg.t('screen', name)
    return this.local ? this.msg.t('you', name) : name
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!isServer && changed.has('stream')) this.watchStream(this.stream)
    // Without a meter (muted, a screen share) nothing is detected.
    if (!this.detectSpeaking || this.muted || this.kind === 'screen') this.detected = false
    const states: string[] = []
    if (this.muted && this.kind !== 'screen') states.push(this.msg.t('muted'))
    if (this.handRaised) states.push(this.msg.t('handRaised'))
    if (this.pinned) states.push(this.msg.t('pinned'))
    if (this.connection === 'fair') states.push(this.msg.t('fairConnection'))
    if (this.connection === 'poor') states.push(this.msg.t('poorConnection'))
    this.internals.ariaLabel = states.length ? this.msg.t('described', this.displayName, states.join(', ')) : this.displayName
    // A hand raised after the tile first drew is news; one that was already up when it appeared is not.
    if (changed.has('handRaised') && this.hasUpdated && this.handRaised) this.announce(this.msg.t('raisedHand', this.name.trim() || this.msg.t('participant')))
    try {
      if (this.isSpeaking) this.internals.states.add('speaking')
      else this.internals.states.delete('speaking')
    } catch {
      // A browser without custom states still draws the outline.
    }
  }

  protected override firstUpdated(): void {
    this.readSlot()
  }

  protected override updated(): void {
    const speaking = this.isSpeaking
    if (speaking !== this.reportedSpeaking) {
      this.reportedSpeaking = speaking
      this.dispatchEvent(new CustomEvent('speaking-change', { detail: { speaking } }))
    }
  }

  /** Says `text` in the live region; the same text twice is said twice. */
  private announce(text: string): void {
    this.announcement = ''
    requestAnimationFrame(() => (this.announcement = text))
  }

  /** Follows the tracks of the stream, so a camera turned off or a track ended swaps the video for the avatar. */
  private watchStream(stream: MediaStream | null): void {
    if (this.watchedStream && this.watchedStream !== stream) {
      this.watchedStream.removeEventListener('addtrack', this.handleTracks)
      this.watchedStream.removeEventListener('removetrack', this.handleTracks)
    }
    for (const track of this.watchedTracks) {
      track.removeEventListener('ended', this.handleTrackState)
      track.removeEventListener('mute', this.handleTrackState)
      track.removeEventListener('unmute', this.handleTrackState)
    }
    this.watchedTracks.clear()
    this.watchedStream = stream
    if (!stream) return
    stream.addEventListener('addtrack', this.handleTracks)
    stream.addEventListener('removetrack', this.handleTracks)
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', this.handleTrackState)
      track.addEventListener('mute', this.handleTrackState)
      track.addEventListener('unmute', this.handleTrackState)
      this.watchedTracks.add(track)
    }
  }

  private readonly handleTracks = (): void => {
    this.watchStream(this.stream)
    this.trackRevision += 1
  }

  private readonly handleTrackState = (): void => {
    this.trackRevision += 1
  }

  private readSlot(): void {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot:not([name])')
    this.slotted = !!slot?.assignedElements().length
  }

  private handleSpeaking(event: CustomEvent<{ speaking: boolean }>): void {
    event.stopPropagation()
    this.detected = event.detail.speaking
  }

  private renderMic() {
    if (this.kind === 'screen') return nothing
    if (this.muted) return micOffIcon
    const audio = this.stream?.getAudioTracks().length ? this.stream : null
    return html`<c2-audio-visualizer
      class="meter"
      bars="3"
      .stream=${audio}
      .level=${audio ? undefined : this.level}
      @speaking-change=${this.handleSpeaking}
    ></c2-audio-visualizer>`
  }

  override render() {
    const video = this.hasVideo
    const classes = `tile kind-${this.kind}${this.local && this.kind === 'camera' ? ' mirrored' : ''}${this.isSpeaking ? ' speaking' : ''}${video ? '' : ' no-video'}`
    const showSignal = this.connection === 'fair' || this.connection === 'poor'
    return html`<div class=${classes}>
      <div class="media">
        <slot @slotchange=${this.readSlot}></slot>
        ${this.slotted ? nothing : html`<video part="video" autoplay playsinline muted .muted=${true} .srcObject=${isServer ? null : this.stream}></video>`}
      </div>
      ${
        video
          ? nothing
          : html`<div class="surface" part="surface">
              <c2-avatar class="avatar" aria-hidden="true" name=${this.name} src=${this.avatarSrc || nothing} initial-count="2" auto-color></c2-avatar>
            </div>`
      }
      <div class="badges">
        ${this.handRaised ? html`<span class="badge hand">${handIcon}</span>` : nothing} ${this.pinned ? html`<span class="badge">${pinIcon}</span>` : nothing}
        <slot name="badge"></slot>
      </div>
      <div class="corner">
        <div class="actions"><slot name="actions"></slot></div>
        ${showSignal ? html`<span class="signal ${this.connection}" aria-hidden="true"><i></i><i></i><i></i></span>` : nothing}
      </div>
      <div class="name" part="name"><span class="label">${this.displayName}</span>${this.renderMic()}</div>
      <span class="announce" aria-live="polite">${this.announcement}</span>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-video-tile': VideoTile
  }
}
