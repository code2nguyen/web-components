import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { CameraController, cameraErrorKind, browserCameraSource, coverRegion, type CameraErrorKind, type CameraFacing, type CameraStreamSource } from './camera'
import { analyzeFrame, assessFrame as builtInAssessor, luma, type CameraFrameAssessor, type CameraQualityHint } from './frame-analysis'
import { cameraCaptureMessages } from './messages'
import styles from './camera-capture.scss?inline'

export { cameraCaptureMessages } from './messages'
export { cameraErrorKind, browserCameraSource } from './camera'
export type { CameraErrorKind, CameraFacing, CameraStreamRequest, CameraStreamSource } from './camera'
export { analyzeFrame, assessFrame, luma } from './frame-analysis'
export type { CameraFrameAssessor, CameraFrameMetrics, CameraQualityHint } from './frame-analysis'

/** The framing guide drawn over the picture: none, a sheet of paper, an ID-1 card, or an oval for a face. */
export type CameraGuide = 'none' | 'document' | 'card' | 'face'

/** One photo of a required-shot list. */
export interface CameraShot {
  /** Names the photo in events and in the form of a file name. Defaults to `shot-<n>`. */
  id?: string
  /** What to photograph, shown in the list and read with the shot. Defaults to "Photo <n>". */
  label?: string
  /** The guide for this shot; defaults to the element's `guide`. */
  guide?: CameraGuide
  /** The camera for this shot; defaults to the element's `facing`. */
  facing?: CameraFacing
  /** The instruction shown while the picture is fine; defaults to the guide's own. */
  hint?: string
}

/** A photo taken by the camera. */
export interface CameraPhoto {
  /** The shot's id (`photo` without a shot list). */
  id: string
  /** The shot's label. */
  label: string
  /** The shot's position in the list, from 0. */
  index: number
  /** The image, in `image-type`. */
  blob: Blob
  /** Its size in pixels. */
  width: number
  height: number
}

/** Where the component is: before the camera, opening it, showing it, reviewing a photo, finished, or failed. */
export type CameraCaptureStatus = 'idle' | 'starting' | 'live' | 'review' | 'done' | 'error'

/** Events fired by {@link CameraCapture}, keyed for `addEventListener`. */
export interface CameraCaptureEventMap {
  'camera-start': CustomEvent<{ facing: CameraFacing }>
  'camera-error': CustomEvent<{ kind: CameraErrorKind; error: unknown }>
  capture: CustomEvent<CameraPhoto>
  retake: CustomEvent<{ id: string; index: number }>
  accept: CustomEvent<CameraPhoto>
  complete: CustomEvent<{ photos: CameraPhoto[] }>
}

export interface CameraCapture {
  addEventListener: TypedAddEventListener<CameraCapture, CameraCaptureEventMap>
  removeEventListener: TypedRemoveEventListener<CameraCapture, CameraCaptureEventMap>
}

interface ResolvedShot {
  id: string
  label: string
  guide: CameraGuide
  facing: CameraFacing
  hint: string
}

const GUIDES: readonly CameraGuide[] = ['none', 'document', 'card', 'face']
/** How often the picture is sampled for the quality hints and auto-capture, in milliseconds. */
const SAMPLE_INTERVAL = 150
/** The width of the sample: enough for light, glare, motion and focus, cheap to read back. */
const SAMPLE_WIDTH = 96
/** A hint must hold for this many samples before it shows, so it does not flicker. */
const HINT_SAMPLES = 2

const guideOf = (value: unknown): CameraGuide | undefined => (GUIDES.includes(value as CameraGuide) ? (value as CameraGuide) : undefined)
const facingOf = (value: unknown): CameraFacing | undefined => (value === 'user' || value === 'environment' ? value : undefined)

const cameraIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/></svg>`
const switchIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10a8 8 0 0 0-14.9-3M4 4v3h3"/><path d="M4 14a8 8 0 0 0 14.9 3M20 20v-3h-3"/></svg>`
const checkIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`
const alertIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>`

/**
 * A camera viewfinder for taking a photo of a document, a card or a face, as in a bank's cheque deposit, an identity
 * check (KYC) or a receipt scanner. It shows the camera with a framing guide, tells the user what is wrong with the
 * picture (too dark, glare, moving, blurry), can take the photo by itself once the picture holds steady, and lets the
 * user retake or keep each photo. A list of required shots (`shots`: front of the card, back, a selfie) walks the user
 * through them in order. Each photo is handed over as a `Blob`.
 *
 * The camera does not open on its own: the user presses **Start camera** (the browser then asks for permission), or
 * the app calls `start()`, or sets `autostart`. It closes when every photo is taken, on `stop()`, and when the element
 * leaves the page. The front camera is shown mirrored, as a mirror is; the photo is not. Without a camera, or with
 * access refused, the error screen says why and offers to try again. A camera needs a secure page (HTTPS).
 *
 * `streamSource` replaces `getUserMedia` (a chosen device, a WebRTC stream, a canvas in a demo or a test), and
 * `assessFrame` replaces the built-in quality rules.
 *
 * @tag c2-camera-capture
 *
 * @slot idle - Replaces the screen shown before the camera starts (an icon, a sentence and the Start camera button). Call `start()` from your own button.
 * @slot error - Replaces the screen shown when the camera cannot start. Read the reason from the `camera-error` event.
 * @slot guide - Replaces the drawing of the framing guide; the guide's box (`part="guide"`) stays, and is the area `crop` keeps.
 * @slot actions - Action zone beside the shutter, for the app's own commands: upload a file instead, cancel.
 * @slot done - Replaces the summary shown once every photo is taken (the photos, each with a Retake button).
 *
 * The events do not bubble: listen on the element itself.
 *
 * @event {CustomEvent<{ facing: 'user' | 'environment' }>} camera-start - Fired when the camera shows its first picture.
 * @event {CustomEvent<{ kind: 'denied' | 'not-found' | 'busy' | 'unsupported' | 'ended' | 'unknown'; error: unknown }>} camera-error - Fired when the camera cannot start, or stops while open (`ended`: unplugged, permission revoked); `kind` says why.
 * @event {CustomEvent<CameraPhoto>} capture - Fired when a photo is taken, before the user keeps or retakes it. `detail.blob` is the image.
 * @event {CustomEvent<{ id: string; index: number }>} retake - Fired when the user throws a photo away to take it again.
 * @event {CustomEvent<CameraPhoto>} accept - Fired when the user keeps a photo.
 * @event {CustomEvent<{ photos: CameraPhoto[] }>} complete - Fired once every shot has a photo kept; the camera then closes.
 *
 * @csspart stage - The dark box that holds the picture and the idle, error and done screens.
 * @csspart video - The camera picture.
 * @csspart guide - The box of the framing guide, wrapping the `guide` slot and its default drawing; `crop` keeps its area.
 * @csspart frame - The default drawing of the guide.
 * @csspart hint - The instruction or quality hint over the picture.
 * @csspart preview - The photo under review.
 * @csspart shots - The list of required shots.
 * @csspart shot - One shot of the list.
 * @csspart controls - The bar under the picture.
 * @csspart actions - The wrapper of the `actions` slot.
 * @csspart shutter - The button that takes the photo.
 * @csspart switch - The button that switches camera, shown when the device has more than one.
 * @csspart button - The Start camera, Try again, Retake and Use photo buttons.
 * @csspart accept - The Use photo button.
 * @csspart idle - The region of the idle screen, wrapping the `idle` slot and its default content.
 * @csspart error - The region of the error screen, wrapping the `error` slot and its default content.
 * @csspart done - The region of the summary, wrapping the `done` slot and its default photos.
 * @csspart thumbnail - A photo of the summary.
 *
 * @cssproperty {length} [--c2-camera-capture--width=480px] - Width of the component, never wider than its container; `100%` fills it.
 * @cssproperty {aspect-ratio} [--c2-camera-capture__stage--aspect-ratio=4 / 3] - Shape of the picture; the camera is cropped to fill it.
 * @cssproperty {background} [--c2-camera-capture__stage--background=#18181b] - Behind the picture, and of the idle, error and done screens. Dark in both themes, like a viewfinder.
 * @cssproperty {color} [--c2-camera-capture__stage--color=#fafafa] - Text on the stage.
 * @cssproperty {color} [--c2-camera-capture__stage__muted--color=#a1a1aa] - Secondary text on the stage.
 * @cssproperty {border-radius} [--c2-camera-capture__stage--border-radius=8px]
 * @cssproperty {length} [--c2-camera-capture__guide--width=82%] - The most of the stage's width the document and card guides take. The guide keeps its shape and fits both this and the height.
 * @cssproperty {length} [--c2-camera-capture__guide--height=86%] - The most of the stage's height a guide takes.
 * @cssproperty {length} [--c2-camera-capture__guide__face--width=52%] - The most of the stage's width the face oval takes.
 * @cssproperty {number} [--c2-camera-capture__guide__document--aspect-ratio=0.707] - Width over height, as a number: 0.707 is A4 upright. A cheque wants about 2.3, a receipt about 0.4.
 * @cssproperty {number} [--c2-camera-capture__guide__card--aspect-ratio=1.586] - An ID-1 card: a bank card, a driving licence.
 * @cssproperty {number} [--c2-camera-capture__guide__face--aspect-ratio=0.75]
 * @cssproperty {border-radius} [--c2-camera-capture__guide--border-radius=14px] - Corners of the document and card guides.
 * @cssproperty {pixel} [--c2-camera-capture__guide--border-width=3px]
 * @cssproperty {color} [--c2-camera-capture__guide--border-color=#ffffff]
 * @cssproperty {color} [--c2-camera-capture__guide__ready--border-color=#16a34a] - The guide while the picture is fine.
 * @cssproperty {color} [--c2-camera-capture__guide__scrim--color=rgba(0, 0, 0, 0.45)] - Darkens the picture outside the guide.
 * @cssproperty {background} [--c2-camera-capture__hint--background=rgba(24, 24, 27, 0.72)]
 * @cssproperty {background} [--c2-camera-capture__hint__issue--background=rgba(180, 83, 9, 0.92)] - The hint while the picture has a problem.
 * @cssproperty {color} [--c2-camera-capture__hint--color=#fafafa]
 * @cssproperty {font-size} [--c2-camera-capture__hint--font-size=14px]
 * @cssproperty {border-radius} [--c2-camera-capture__hint--border-radius=999px]
 * @cssproperty {display} [--c2-camera-capture__hint--display=block] - `none` hides the instructions and quality hints.
 * @cssproperty {color} [--c2-camera-capture__shot--color=#71717a]
 * @cssproperty {color} [--c2-camera-capture__shot__current--color=#18181b]
 * @cssproperty {background} [--c2-camera-capture__mark__done--background=#16a34a] - The disc behind the check of a shot already taken.
 * @cssproperty {color} [--c2-camera-capture__mark__done--color=#ffffff] - The check of a shot already taken.
 * @cssproperty {font-size} [--c2-camera-capture__shot--font-size=12px]
 * @cssproperty {font-weight} [--c2-camera-capture__shot__current--font-weight=600]
 * @cssproperty {font-size} [--c2-camera-capture__screen--font-size=14px] - Text of the idle, starting and error screens.
 * @cssproperty {length} [--c2-camera-capture__controls--padding=12px 0 0]
 * @cssproperty {length} [--c2-camera-capture__controls--gap=12px]
 * @cssproperty {pixel} [--c2-camera-capture__shutter--size=60px]
 * @cssproperty {background} [--c2-camera-capture__shutter--background=rgb(2, 101, 220)]
 * @cssproperty {background} [--c2-camera-capture__shutter__hover--background=rgb(1, 84, 184)]
 * @cssproperty {color} [--c2-camera-capture__shutter--ring-color=#ffffff] - The inner ring of the shutter.
 * @cssproperty {color} [--c2-camera-capture__shutter__progress--color=#16a34a] - The ring that fills while auto-capture waits for a steady picture.
 * @cssproperty {pixel} [--c2-camera-capture__switch--size=40px] - The Switch camera button.
 * @cssproperty {background} [--c2-camera-capture__button--background=#ffffff]
 * @cssproperty {background} [--c2-camera-capture__button__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-camera-capture__button--color=#18181b]
 * @cssproperty {border} [--c2-camera-capture__button--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-camera-capture__button--border-radius=6px]
 * @cssproperty {pixel} [--c2-camera-capture__button--height=36px]
 * @cssproperty {font-size} [--c2-camera-capture__button--font-size=14px]
 * @cssproperty {font-weight} [--c2-camera-capture__button--font-weight=500]
 * @cssproperty {background} [--c2-camera-capture__accept--background=rgb(2, 101, 220)] - The Use photo and Start camera buttons.
 * @cssproperty {background} [--c2-camera-capture__accept__hover--background=rgb(1, 84, 184)]
 * @cssproperty {color} [--c2-camera-capture__accept--color=#ffffff]
 * @cssproperty {border-radius} [--c2-camera-capture__thumbnail--border-radius=6px]
 * @cssproperty {length} [--c2-camera-capture__thumbnail--min-width=140px] - The summary fits as many photos of at least this width per row as it can.
 * @cssproperty {pixel} [--c2-camera-capture__thumbnail__button--height=28px] - The Retake button on a photo of the summary.
 * @cssproperty {font-size} [--c2-camera-capture__thumbnail__button--font-size=12px]
 * @cssproperty {outline} [--c2-camera-capture__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-camera-capture')
export class CameraCapture extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The framing guide: `none`, `document`, `card` or `face`. A shot of `shots` may choose its own. */
  @property() guide: CameraGuide = 'none'

  /** The camera to open: `environment` (the back one, the default) or `user` (the front one). Switching camera updates it. */
  @property() facing: CameraFacing = 'environment'

  /**
   * The photos to take, in order: `[{ "id": "front", "label": "Front of the card", "guide": "card" }, …]`. As an
   * attribute, JSON. Empty takes a single photo. Setting a list with other content starts it over; the same content
   * again (a framework re-rendering a new array literal) changes nothing.
   */
  @property({ converter: jsonPropertyConverter, hasChanged: (value: unknown, old: unknown) => JSON.stringify(value) !== JSON.stringify(old) })
  shots: CameraShot[] = []

  /** Takes the photo by itself once the picture has no problem and holds steady for `steady-time`. The shutter still works. */
  @property({ type: Boolean, attribute: 'auto-capture' }) autoCapture = false

  /** How long, in milliseconds, the picture must hold steady before auto-capture takes it. */
  @property({ type: Number, attribute: 'steady-time' }) steadyTime = 1200

  /** Keeps only the area inside the guide in the photo. Without it, the photo is the camera's whole frame. */
  @property({ type: Boolean }) crop = false

  /** The image format of the photos. A browser that cannot write it gives PNG. */
  @property({ attribute: 'image-type' }) imageType = 'image/jpeg'

  /** The quality of a JPEG or WebP photo, from 0 to 1. */
  @property({ type: Number, attribute: 'image-quality' }) imageQuality = 0.92

  /** Opens the camera as soon as the element is on the page, without waiting for the Start camera button. */
  @property({ type: Boolean }) autostart = false

  /** The accessible name of the component. Empty uses the built-in "Camera". */
  @property() label = ''

  /** Supplies the video stream instead of `getUserMedia`. Set it before the camera starts. */
  @property({ attribute: false }) streamSource?: CameraStreamSource

  /** Decides the quality hint of each sampled frame instead of the built-in rules ({@link assessFrame}). */
  @property({ attribute: false }) assessFrame?: CameraFrameAssessor

  @state() private _status: CameraCaptureStatus = 'idle'
  @state() private errorKind: CameraErrorKind = 'unknown'
  @state() private current = 0
  @state() private taken: (CameraPhoto | undefined)[] = []
  @state() private pending: CameraPhoto | undefined
  @state() private hint: CameraQualityHint | undefined
  @state() private steadyProgress = 0
  /** The camera actually open: `facing`, or the shot's own. */
  @state() private openFacing: CameraFacing = 'environment'

  @query('video') private video?: HTMLVideoElement
  @query('.stage') private stage?: HTMLElement
  @query('.guide') private guideBox?: HTMLElement

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, cameraCaptureMessages)
  private readonly camera = new CameraController(
    this,
    () => this.video,
    () => this.lost(),
  )
  private readonly urls = new Map<Blob, string>()
  private sampleTimer: ReturnType<typeof setTimeout> | undefined
  /** Frames the video has presented, counted through `requestVideoFrameCallback` where the engine has it. */
  private frames = 0
  private sampledFrame = -1
  private frameHandle: { video: HTMLVideoElement; id: number } | undefined
  private sampleCanvas: HTMLCanvasElement | undefined
  private previousSample: Uint8Array | undefined
  private candidateHint: CameraQualityHint | undefined
  private candidateCount = 0
  private steadySince: number | undefined
  private capturing = false

  /** Where the component is: `idle`, `starting`, `live`, `review`, `done` or `error`. Also a custom state, `:state(live)`. */
  get status(): CameraCaptureStatus {
    return this._status
  }

  /** The photos kept so far, in the order of the shots. */
  get photos(): CameraPhoto[] {
    return this.taken.filter((photo): photo is CameraPhoto => photo !== undefined)
  }

  /** The open camera's stream, for an app that also records or analyses it; null while the camera is closed. */
  get stream(): MediaStream | null {
    return this.camera.stream
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.autostart && this._status === 'idle')
      void this.updateComplete.then(() => {
        if (this.isConnected) void this.start()
      })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    // The camera controller closes the stream; a page that brings the element back finds it ready to start again.
    this.stopSampling()
    if (this._status === 'starting' || this._status === 'live' || this._status === 'review') {
      this.discardPending()
      this._status = 'idle'
    }
    // The photos' object URLs keep their blobs alive: free them, and draw new ones if the element comes back.
    for (const url of this.urls.values()) URL.revokeObjectURL(url)
    this.urls.clear()
  }

  /** Opens the camera. Does nothing while it is open or opening, under review or finished. */
  async start(): Promise<void> {
    // Called as soon as the element is defined, a server-rendered element has not hydrated yet: a state change before
    // that first update would render something other than the server's markup (a Lit hydration mismatch).
    if (!this.hasUpdated) await this.updateComplete
    if (this._status !== 'idle' && this._status !== 'error') return
    await this.open(this.shot().facing)
  }

  /** Closes the camera and goes back to the idle screen, keeping the photos taken. */
  stop(): void {
    this.camera.stop()
    this.stopSampling()
    this.discardPending()
    if (this._status !== 'done') this._status = 'idle'
  }

  /** Takes the photo now. Resolves with it, or `undefined` when the camera shows no picture. */
  async capture(): Promise<CameraPhoto | undefined> {
    if (this._status !== 'live' || this.capturing) return undefined
    this.capturing = true
    try {
      const photo = await this.grab()
      if (!photo || this._status !== 'live') return undefined
      this.stopSampling()
      this.pending = photo
      this._status = 'review'
      this.emit('capture', photo)
      return photo
    } finally {
      this.capturing = false
    }
  }

  /** Throws the photo under review away and goes back to the camera; or, once finished, takes shot `index` again. */
  async retake(index?: number): Promise<void> {
    if (this._status === 'review' && this.pending) {
      const { id, index: at } = this.pending
      this.discardPending()
      this._status = 'live'
      this.emit('retake', { id, index: at })
      this.startSampling()
      return
    }
    if (this._status !== 'done') return
    const at = Math.min(Math.max(0, index ?? 0), this.resolvedShots().length - 1)
    this.current = at
    this.emit('retake', { id: this.shot().id, index: at })
    await this.open(this.shot().facing)
  }

  /** Keeps the photo under review and moves on to the next shot still missing, or finishes. */
  async accept(): Promise<void> {
    if (this._status !== 'review' || !this.pending) return
    const photo = this.pending
    this.pending = undefined
    const taken = [...this.taken]
    const replaced = taken[photo.index]
    if (replaced) this.revoke(replaced.blob)
    taken[photo.index] = photo
    this.taken = taken
    this.emit('accept', photo)
    const shots = this.resolvedShots()
    const next = shots.findIndex((_, i) => !taken[i])
    if (next === -1) {
      this.camera.stop()
      this._status = 'done'
      this.emit('complete', { photos: this.photos })
      return
    }
    this.current = next
    const { facing } = this.shot()
    if (facing !== this.openFacing) {
      this._status = 'idle'
      await this.open(facing)
    } else {
      this._status = 'live'
      this.startSampling()
    }
  }

  /** Switches between the front and the back camera. */
  async switchCamera(): Promise<void> {
    if (this._status !== 'live') return
    this.facing = this.openFacing === 'user' ? 'environment' : 'user'
    this._status = 'idle'
    await this.open(this.facing)
  }

  /** Closes the camera and forgets every photo: the list starts over. */
  reset(): void {
    this.camera.stop()
    this.stopSampling()
    this.discardPending()
    for (const photo of this.photos) this.revoke(photo.blob)
    this.taken = []
    this.current = 0
    this._status = 'idle'
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    // A new list starts over; the camera stays as it is, unless the list was finished.
    if (changed.has('shots') && changed.get('shots') !== undefined) {
      this.discardPending()
      for (const photo of this.photos) this.revoke(photo.blob)
      this.taken = []
      this.current = 0
      if (this._status === 'done' || this._status === 'review') {
        if (this.camera.stream) {
          this._status = 'live'
          this.startSampling()
        } else this._status = 'idle'
      }
    }
  }

  protected override updated() {
    this.internals.ariaLabel = this.label || this.msg.t('label')
    this.syncStates()
  }

  override firstUpdated() {
    this.internals.role = 'group'
  }

  private syncStates() {
    const states = (this.internals as ElementInternals & { states?: Set<string> }).states
    if (!states) return
    for (const name of ['idle', 'starting', 'live', 'review', 'done', 'error']) {
      try {
        if (name === this._status) states.add(name)
        else states.delete(name)
      } catch {
        // A browser that only takes `--name` custom states: styling by state is then unavailable.
      }
    }
  }

  private async open(facing: CameraFacing) {
    this.stopSampling()
    this.discardPending()
    this.openFacing = facing
    this._status = 'starting'
    try {
      const opened = await this.camera.start({ facing, width: 1920, height: 1080 }, this.streamSource ?? browserCameraSource)
      if (!opened) return
      this._status = 'live'
      this.emit('camera-start', { facing })
      this.startSampling()
    } catch (error) {
      if (!this.isConnected) return
      this.errorKind = cameraErrorKind(error)
      this._status = 'error'
      this.emit('camera-error', { kind: this.errorKind, error })
    }
  }

  /** The camera went away while open: unplugged, permission revoked, or taken by another application. */
  private lost() {
    if (this._status !== 'live' && this._status !== 'review' && this._status !== 'starting') return
    this.camera.stop()
    this.stopSampling()
    this.discardPending()
    this.errorKind = 'ended'
    this._status = 'error'
    this.emit('camera-error', { kind: 'ended', error: undefined })
  }

  private emit<K extends keyof CameraCaptureEventMap>(type: K, detail: CameraCaptureEventMap[K]['detail']) {
    // Not bubbling: `complete`, `accept` and `capture` are names other components fire too, so a listener goes on this element.
    const event = new CustomEvent(type, { detail })
    this.dispatchEvent(event)
  }

  private resolvedShots(): ResolvedShot[] {
    const list = Array.isArray(this.shots) ? this.shots.filter((shot) => shot && typeof shot === 'object') : []
    const guide = guideOf(this.guide) ?? 'none'
    const facing = facingOf(this.facing) ?? 'environment'
    if (!list.length) return [{ id: 'photo', label: this.msg.t('shot', 1), guide, facing, hint: '' }]
    return list.map((shot, i) => ({
      id: typeof shot.id === 'string' && shot.id ? shot.id : `shot-${i + 1}`,
      label: typeof shot.label === 'string' && shot.label ? shot.label : this.msg.t('shot', i + 1),
      guide: guideOf(shot.guide) ?? guide,
      facing: facingOf(shot.facing) ?? facing,
      hint: typeof shot.hint === 'string' ? shot.hint : '',
    }))
  }

  private shot(): ResolvedShot {
    const shots = this.resolvedShots()
    return shots[Math.min(this.current, shots.length - 1)]
  }

  /** The guide's box in the video's own pixels. */
  private guideRegion(video: HTMLVideoElement) {
    return coverRegion(video, this.stage, this.guideBox, this.mirrored)
  }

  private get mirrored() {
    return this.openFacing === 'user'
  }

  private async grab(): Promise<CameraPhoto | undefined> {
    const video = this.video
    if (!video || !video.videoWidth || !video.videoHeight) return undefined
    const shot = this.shot()
    const region = this.crop && shot.guide !== 'none' ? this.guideRegion(video) : undefined
    const sx = region?.x ?? 0
    const sy = region?.y ?? 0
    const width = Math.max(1, Math.round(region?.width ?? video.videoWidth))
    const height = Math.max(1, Math.round(region?.height ?? video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.drawImage(video, sx, sy, width, height, 0, 0, width, height)
    const quality = Number.isFinite(this.imageQuality) ? Math.min(1, Math.max(0, this.imageQuality)) : 0.92
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, this.imageType || 'image/jpeg', quality))
    if (!blob) return undefined
    return { id: shot.id, label: shot.label, index: Math.min(this.current, this.resolvedShots().length - 1), blob, width, height }
  }

  private startSampling() {
    this.stopSampling()
    this.previousSample = undefined
    this.candidateHint = undefined
    this.candidateCount = 0
    this.watchFrames()
    this.sampleTimer = setTimeout(() => this.sample(), SAMPLE_INTERVAL)
  }

  /**
   * Counts the frames the video presents. A sample is only compared with the previous one when a new frame came
   * in between: an engine that repeats a frame (a slow or stalled stream) would otherwise read as perfectly still.
   */
  private watchFrames() {
    const video = this.video
    if (!video || typeof video.requestVideoFrameCallback !== 'function') return
    const tick = () => {
      this.frames++
      if (this.frameHandle?.video === video) this.frameHandle.id = video.requestVideoFrameCallback(tick)
    }
    this.frameHandle = { video, id: video.requestVideoFrameCallback(tick) }
  }

  private stopSampling() {
    if (this.sampleTimer !== undefined) clearTimeout(this.sampleTimer)
    this.sampleTimer = undefined
    if (this.frameHandle) this.frameHandle.video.cancelVideoFrameCallback(this.frameHandle.id)
    this.frameHandle = undefined
    this.steadySince = undefined
    this.steadyProgress = 0
    this.hint = undefined
  }

  /** Samples one frame for the hints and auto-capture, then schedules the next while the camera is live. */
  private sample() {
    this.sampleTimer = undefined
    if (this._status !== 'live' || !this.isConnected) return
    // Not every engine fires `ended` on a track that stops by itself, so the sampler also reads its state.
    if (this.camera.ended) {
      this.lost()
      return
    }
    const video = this.video
    if (video && video.videoWidth && !document.hidden) this.assess(video)
    if (this._status === 'live') this.sampleTimer = setTimeout(() => this.sample(), SAMPLE_INTERVAL)
  }

  private assess(video: HTMLVideoElement) {
    if (this.frameHandle) {
      // No new frame since the last sample: nothing to compare, and nothing new to say.
      if (this.frames === this.sampledFrame) return
      this.sampledFrame = this.frames
    }
    const shot = this.shot()
    const region = shot.guide !== 'none' ? this.guideRegion(video) : undefined
    const sx = region?.x ?? 0
    const sy = region?.y ?? 0
    const sw = region?.width ?? video.videoWidth
    const sh = region?.height ?? video.videoHeight
    const width = SAMPLE_WIDTH
    const height = Math.max(8, Math.round((SAMPLE_WIDTH * sh) / sw))
    this.sampleCanvas ??= document.createElement('canvas')
    const canvas = this.sampleCanvas
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      this.previousSample = undefined
    }
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    let gray: Uint8Array
    try {
      context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
      gray = luma(context.getImageData(0, 0, width, height).data)
    } catch {
      // A cross-origin stream cannot be read back: no hints, no auto-capture.
      return
    }
    const previous = this.previousSample
    this.previousSample = gray
    // The first sample has nothing to compare with: movement is unknown, so nothing is said yet.
    if (!previous) return
    const metrics = analyzeFrame(gray, width, previous)
    let hint: CameraQualityHint = 'moving'
    try {
      hint = (this.assessFrame ?? builtInAssessor)(metrics, { guide: shot.guide })
    } catch (error) {
      console.error(error)
    }
    // A hint shows once it holds for a few samples, so a single noisy frame does not flash it.
    if (hint === this.candidateHint) this.candidateCount++
    else {
      this.candidateHint = hint
      this.candidateCount = 1
    }
    if (this.candidateCount >= HINT_SAMPLES || this.hint === undefined) this.hint = hint
    if (!this.autoCapture) return
    const now = performance.now()
    // The countdown needs every sample ready: one moving frame starts it over, even if the hint shown stays the same.
    if (hint !== 'ready' || this.hint !== 'ready') {
      this.steadySince = undefined
      this.steadyProgress = 0
      return
    }
    this.steadySince ??= now
    const wait = Number.isFinite(this.steadyTime) ? Math.max(0, this.steadyTime) : 1200
    this.steadyProgress = wait ? Math.min(1, (now - this.steadySince) / wait) : 1
    if (this.steadyProgress >= 1) void this.capture()
  }

  private discardPending() {
    if (this.pending) this.revoke(this.pending.blob)
    this.pending = undefined
  }

  private url(blob: Blob): string {
    let url = this.urls.get(blob)
    if (!url) {
      url = URL.createObjectURL(blob)
      this.urls.set(blob, url)
    }
    return url
  }

  private revoke(blob: Blob) {
    const url = this.urls.get(blob)
    if (url) URL.revokeObjectURL(url)
    this.urls.delete(blob)
  }

  private hintText(shot: ResolvedShot): { text: string; issue: boolean } {
    const hint = this.hint
    if (hint && hint !== 'ready') return { text: this.msg.t(hint), issue: true }
    if (this.autoCapture && hint === 'ready') return { text: this.msg.t('holdStill'), issue: false }
    if (shot.hint) return { text: shot.hint, issue: false }
    if (shot.guide === 'document') return { text: this.msg.t('guideDocument'), issue: false }
    if (shot.guide === 'card') return { text: this.msg.t('guideCard'), issue: false }
    if (shot.guide === 'face') return { text: this.msg.t('guideFace'), issue: false }
    return { text: '', issue: false }
  }

  private errorText(): string {
    switch (this.errorKind) {
      case 'denied':
        return this.msg.t('errorDenied')
      case 'not-found':
        return this.msg.t('errorNotFound')
      case 'busy':
        return this.msg.t('errorBusy')
      case 'unsupported':
        return this.msg.t('errorUnsupported')
      case 'ended':
        return this.msg.t('errorEnded')
      default:
        return this.msg.t('errorUnknown')
    }
  }

  private renderShots(shots: ResolvedShot[]) {
    if (shots.length < 2) return nothing
    const finished = this._status === 'done'
    return html`<ol class="shots" part="shots" aria-label=${this.msg.t('shots')}>
      ${shots.map((shot, i) => {
        const done = !!this.taken[i]
        const current = !finished && i === this.current
        return html`<li class="shot ${current ? 'shot--current' : ''} ${done ? 'shot--done' : ''}" part="shot" aria-current=${current ? 'step' : nothing}>
          <span class="shot__mark" aria-hidden="true">${done ? checkIcon : i + 1}</span>
          <span class="shot__label">${shot.label}</span>
          ${done ? html`<span class="visually-hidden">${this.msg.t('shotDone')}</span>` : nothing}
        </li>`
      })}
    </ol>`
  }

  private renderGuide(shot: ResolvedShot) {
    if (shot.guide === 'none') return nothing
    const ready = this.hint === 'ready'
    return html`<div class="guide-area guide-area--${shot.guide}" aria-hidden="true">
      <div class="guide guide--${shot.guide} ${ready ? 'guide--ready' : ''}" part="guide">
        <slot name="guide"><span class="frame" part="frame"></span></slot>
      </div>
    </div>`
  }

  private renderStage(shot: ResolvedShot, shots: ResolvedShot[]) {
    const status = this._status
    const showVideo = status === 'live' || status === 'review' || status === 'starting'
    const { text, issue } = this.hintText(shot)
    return html`<div class="stage stage--${status}" part="stage">
      <video
        class="video ${this.mirrored ? 'video--mirrored' : ''}"
        part="video"
        ?hidden=${!showVideo}
        muted
        playsinline
        autoplay
        disablepictureinpicture
        aria-hidden="true"
      ></video>
      ${status === 'live' ? this.renderGuide(shot) : nothing}
      ${status === 'live' && text ? html`<p class="hint ${issue ? 'hint--issue' : ''}" part="hint" aria-hidden="true">${text}</p>` : nothing}
      ${
        status === 'review' && this.pending
          ? html`<img class="preview" part="preview" src=${this.url(this.pending.blob)} alt=${this.msg.t('preview')} />`
          : nothing
      }
      ${
        status === 'idle'
          ? html`<div class="screen" part="idle">
              <slot name="idle" @slotchange=${this.handleSlotChange}>
                ${
                  this.slotted('idle')
                    ? nothing
                    : html`<span class="screen__icon">${cameraIcon}</span>
                        <p class="screen__text">${this.msg.t('idle')}</p>
                        <button class="button button--accept" part="button accept" type="button" @click=${() => this.start()}>${this.msg.t('start')}</button>`
                }
              </slot>
            </div>`
          : nothing
      }
      ${status === 'starting' ? html`<div class="screen screen--quiet"><p class="screen__text screen__text--muted">${this.msg.t('starting')}</p></div>` : nothing}
      ${
        status === 'error'
          ? html`<div class="screen" part="error">
              <slot name="error" @slotchange=${this.handleSlotChange}>
                ${
                  this.slotted('error')
                    ? nothing
                    : html`<span class="screen__icon">${alertIcon}</span>
                        <p class="screen__text">${this.errorText()}</p>
                        <button class="button" part="button" type="button" @click=${() => this.start()}>${this.msg.t('retry')}</button>`
                }
              </slot>
            </div>`
          : nothing
      }
      ${
        status === 'done'
          ? html`<div class="done" part="done">
              <slot name="done" @slotchange=${this.handleSlotChange}> ${this.slotted('done') ? nothing : this.renderSummary(shots)} </slot>
            </div>`
          : nothing
      }
    </div>`
  }

  private renderSummary(shots: ResolvedShot[]) {
    return html`<ul class="thumbnails">
      ${shots.map((s, i) => {
        const photo = this.taken[i]
        return photo
          ? html`<li class="thumbnail">
              <img part="thumbnail" src=${this.url(photo.blob)} alt=${s.label} />
              <button class="button button--small" part="button" type="button" aria-label=${this.msg.t('retakeShot', s.label)} @click=${() => this.retake(i)}>
                ${this.msg.t('retake')}
              </button>
            </li>`
          : nothing
      })}
    </ul>`
  }

  /** True when the app put content in the named slot: the built-in default is then not drawn at all. */
  /**
   * Which screens the author replaced. A server cannot read the light DOM and draws every default, so a server-rendered
   * element keeps the defaults through hydration (a different first render is a Lit hydration mismatch) and drops them
   * right after; a client-created one reads its children before the first render.
   */
  private readonly screens = new SlotPresenceController(this, ['idle', 'error', 'done'])

  private slotted(name: string): boolean {
    return this.screens.state(name) === 'present'
  }

  /** Redraws when content enters or leaves a slot, so the default shows exactly while the slot is empty. */
  private readonly handleSlotChange = (event: Event) => this.screens.handleSlotChange(event)

  private renderControls() {
    const status = this._status
    const live = status === 'live'
    const review = status === 'review'
    const progress = this.autoCapture && live ? this.steadyProgress : 0
    return html`<div class="controls" part="controls">
      <div class="actions" part="actions"><slot name="actions"></slot></div>
      <div class="main-controls">
        ${
          review
            ? html`<button class="button" part="button" type="button" @click=${() => this.retake()}>${this.msg.t('retake')}</button>
                <button class="button button--accept" part="button accept" type="button" @click=${() => this.accept()}>${this.msg.t('accept')}</button>`
            : status === 'live' || status === 'starting'
              ? html`<button
                  class="shutter"
                  part="shutter"
                  type="button"
                  aria-label=${this.msg.t('capture')}
                  ?disabled=${!live}
                  style="--_progress: ${progress}"
                  @click=${() => this.capture()}
                >
                  <span class="shutter__ring" aria-hidden="true"></span>
                </button>`
              : nothing
        }
      </div>
      <div class="side-controls">
        ${
          live && this.camera.cameras > 1
            ? html`<button class="switch" part="switch" type="button" aria-label=${this.msg.t('switchCamera')} @click=${() => this.switchCamera()}>
                ${switchIcon}
              </button>`
            : nothing
        }
      </div>
    </div>`
  }

  private announcement(shot: ResolvedShot, shots: ResolvedShot[]): string {
    switch (this._status) {
      case 'starting':
        return this.msg.t('starting')
      case 'review':
        return this.msg.t('captured')
      case 'done':
        return this.msg.t('done')
      case 'error':
        return this.errorText()
      case 'live':
        return shots.length > 1 ? this.msg.t('progress', this.current + 1, shots.length, shot.label) : ''
      default:
        return ''
    }
  }

  override render() {
    const shots = this.resolvedShots()
    const shot = this.shot()
    const { text } = this._status === 'live' ? this.hintText(shot) : { text: '' }
    return html`<div class="camera">
      ${this.renderShots(shots)} ${this.renderStage(shot, shots)} ${this.renderControls()}
      <div class="visually-hidden" role="status">${this.announcement(shot, shots)}</div>
      <div class="visually-hidden" role="status">${text}</div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-camera-capture': CameraCapture
  }
}
