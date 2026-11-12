import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import {
  CameraController,
  cameraErrorKind,
  browserCameraSource,
  coverRegion,
  type CameraErrorKind,
  type CameraFacing,
  type CameraStreamSource,
} from '@c2n/camera-capture/camera.js'
import { createBarcodeDecoder, type BarcodeDecoder, type BarcodeScanResult } from './barcode-decoder'
import { barcodeScannerMessages } from './messages'
import styles from './barcode-scanner.scss?inline'

export { barcodeScannerMessages } from './messages'
export { BarcodeDecoderUnavailableError, createBarcodeDecoder } from './barcode-decoder'
export type { BarcodeDecoder, BarcodeDecoderContext, BarcodeScanFormat, BarcodeScanResult } from './barcode-decoder'
export type { CameraErrorKind, CameraFacing, CameraStreamRequest, CameraStreamSource } from '@c2n/camera-capture/camera.js'

/** Where the scanner is: before the camera, opening it, reading the picture, finished with a code, or failed. */
export type BarcodeScannerStatus = 'idle' | 'starting' | 'scanning' | 'done' | 'error'

/** Why the scanner failed: a camera reason, or `decoder` when nothing here can read a barcode. */
export type BarcodeScannerErrorKind = CameraErrorKind | 'decoder'

/** Events fired by {@link BarcodeScanner}, keyed for `addEventListener`. */
export interface BarcodeScannerEventMap {
  'camera-start': CustomEvent<{ facing: CameraFacing }>
  'camera-error': CustomEvent<{ kind: BarcodeScannerErrorKind; error: unknown }>
  scan: CustomEvent<BarcodeScanResult>
}

export interface BarcodeScanner {
  addEventListener: TypedAddEventListener<BarcodeScanner, BarcodeScannerEventMap>
  removeEventListener: TypedRemoveEventListener<BarcodeScanner, BarcodeScannerEventMap>
}

/** How long the scanner waits between two readings of the picture, in milliseconds. */
const SCAN_INTERVAL = 120
/** The longest side of the picture handed to the decoder: enough for the narrow bars of a 1D code, cheap to read back. */
const FRAME_SIZE = 800
/** How long the scan window keeps its "found" look after a code is read, in milliseconds. */
const FOUND_TIME = 700
const STATUSES: readonly BarcodeScannerStatus[] = ['idle', 'starting', 'scanning', 'done', 'error']

/** The formats' own names, which are not translated. */
const FORMAT_NAMES: Record<string, string> = {
  aztec: 'Aztec',
  codabar: 'Codabar',
  code_39: 'Code 39',
  code_93: 'Code 93',
  code_128: 'Code 128',
  data_matrix: 'Data Matrix',
  ean_8: 'EAN-8',
  ean_13: 'EAN-13',
  itf: 'ITF',
  pdf417: 'PDF417',
  qr_code: 'QR Code',
  upc_a: 'UPC-A',
  upc_e: 'UPC-E',
}

const facingOf = (value: unknown): CameraFacing => (value === 'user' ? 'user' : 'environment')

const scanIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M7 8v8M10.5 8v8M13.5 8v8M17 8v8"/></svg>`
const checkIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>`
const alertIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>`
const switchIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10a8 8 0 0 0-14.9-3M4 4v3h3"/><path d="M4 14a8 8 0 0 0 14.9 3M20 20v-3h-3"/></svg>`
const torchIcon = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2h8v4l-2 3v11a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V9L8 6z"/><path d="M8 6h8M12 12v2"/></svg>`

/**
 * Reads barcodes and QR codes with the device's camera, as a point of sale, a warehouse app or a ticket check-in
 * does. It shows the camera with a scan window, reads the picture inside the window several times a second, and fires
 * `scan` with the code's value and format. By default it stops at the first code and shows it with a **Scan again**
 * button; `continuous` keeps the camera open and fires for each new code. `beep` sounds on every scan, and the light
 * button shows on a device whose camera has a torch.
 *
 * Codes are read by the browser's `BarcodeDetector` where it knows the formats asked for, and otherwise by
 * `@zxing/library`, an optional peer dependency imported on the first scan. `decoder` replaces both. `formats` narrows
 * what is read, which is faster and avoids a wrong reading: `formats="ean_13;upc_a"`.
 *
 * The camera does not open on its own: the user presses **Start camera** (the browser then asks for permission), or
 * the app calls `start()`, or sets `autostart`. It closes on a scan (unless `continuous`), on `stop()`, and when the
 * element leaves the page; reading pauses while the scanner is off screen. A camera needs a secure page (HTTPS).
 * The value of a code is shown as text and never followed as a link: what to do with it is the app's decision.
 *
 * A handheld (keyboard-wedge) scanner needs no element: it types the code into the focused `c2-text-field`.
 *
 * @tag c2-barcode-scanner
 *
 * @slot idle - Replaces the screen shown before the camera starts (an icon, a sentence and the Start camera button). Call `start()` from your own button.
 * @slot error - Replaces the screen shown when the camera or the decoder cannot start. Read the reason from the `camera-error` event.
 * @slot window - Replaces the drawing of the scan window; the window's box (`part="window"`) stays, and is the area that is read.
 * @slot done - Replaces the screen shown once a code is read (its value, its format and the Scan again button). Read the code from the `scan` event.
 * @slot torch-icon - Replaces the icon of the light button.
 * @slot switch-icon - Replaces the icon of the Switch camera button.
 * @slot actions - Action zone under the picture, for the app's own commands: type the code instead, read a picture of it (`scanImage()`), cancel.
 *
 * The events do not bubble: listen on the element itself.
 *
 * @event {CustomEvent<{ facing: 'user' | 'environment' }>} camera-start - Fired when the camera shows its first picture.
 * @event {CustomEvent<{ kind: 'denied' | 'not-found' | 'busy' | 'unsupported' | 'ended' | 'decoder' | 'unknown'; error: unknown }>} camera-error - Fired when the camera cannot start or stops while open, or (`decoder`) when nothing here can read a barcode.
 * @event {CustomEvent<BarcodeScanResult>} scan - Fired when a code is read. `detail.value` is its text, `detail.format` its format (`qr_code`, `ean_13`…), `detail.corners` its corners in the camera frame when known.
 *
 * @csspart stage - The dark box that holds the picture and the idle, error and done screens.
 * @csspart video - The camera picture.
 * @csspart window - The box of the scan window, wrapping the `window` slot and its default drawing; only its area is read.
 * @csspart frame - The default drawing of the scan window.
 * @csspart line - The line that sweeps the scan window.
 * @csspart hint - The instruction over the picture.
 * @csspart result - The last code read, over the picture, in `continuous` mode.
 * @csspart controls - The bar under the picture.
 * @csspart actions - The wrapper of the `actions` slot.
 * @csspart torch - The button that turns the camera's light on and off, shown when the camera has one. It wraps the `torch-icon` slot: the built-in icon shows as the slot's fallback, and assigned content replaces it at the same size.
 * @csspart switch - The button that switches camera, shown when the device has more than one. It wraps the `switch-icon` slot: the built-in icon shows as the slot's fallback, and assigned content replaces it at the same size.
 * @csspart button - The Start camera, Try again and Scan again buttons.
 * @csspart idle - The region of the idle screen, wrapping the `idle` slot and its default content.
 * @csspart error - The region of the error screen, wrapping the `error` slot and its default content.
 * @csspart done - The region of the done screen, wrapping the `done` slot and its default content.
 * @csspart value - The value of the code on the done screen.
 * @csspart format - The format of the code on the done screen.
 *
 * @cssproperty {length} [--c2-barcode-scanner--width=480px] - Width of the component, never wider than its container; `100%` fills it.
 * @cssproperty {aspect-ratio} [--c2-barcode-scanner__stage--aspect-ratio=4 / 3] - Shape of the picture; the camera is cropped to fill it.
 * @cssproperty {background} [--c2-barcode-scanner__stage--background=#18181b] - Behind the picture, and of the idle, error and done screens. Dark in both themes, like a viewfinder.
 * @cssproperty {color} [--c2-barcode-scanner__stage--color=#fafafa] - Text on the stage.
 * @cssproperty {color} [--c2-barcode-scanner__stage__muted--color=#a1a1aa] - Secondary text on the stage.
 * @cssproperty {border-radius} [--c2-barcode-scanner__stage--border-radius=8px]
 * @cssproperty {length} [--c2-barcode-scanner__window--width=70%] - The most of the stage's width the scan window takes. The window keeps its shape and fits both this and the height.
 * @cssproperty {length} [--c2-barcode-scanner__window--height=70%] - The most of the stage's height the scan window takes.
 * @cssproperty {number} [--c2-barcode-scanner__window--aspect-ratio=1] - Width over height, as a number: 1 suits a QR code, about 2.4 a 1D barcode.
 * @cssproperty {border-radius} [--c2-barcode-scanner__window--border-radius=14px]
 * @cssproperty {pixel} [--c2-barcode-scanner__window--border-width=3px]
 * @cssproperty {color} [--c2-barcode-scanner__window--border-color=#ffffff]
 * @cssproperty {color} [--c2-barcode-scanner__window__found--border-color=#16a34a] - The window just after a code is read.
 * @cssproperty {color} [--c2-barcode-scanner__window__scrim--color=rgba(0, 0, 0, 0.45)] - Darkens the picture outside the window.
 * @cssproperty {color} [--c2-barcode-scanner__line--color=#ef4444] - The line that sweeps the window.
 * @cssproperty {pixel} [--c2-barcode-scanner__line--height=2px]
 * @cssproperty {time} [--c2-barcode-scanner__line--duration=2s] - One sweep down and back. The line stands still under reduced motion.
 * @cssproperty {display} [--c2-barcode-scanner__line--display=block] - `none` hides the line.
 * @cssproperty {background} [--c2-barcode-scanner__hint--background=rgba(24, 24, 27, 0.72)] - Of the instruction and of the last code read.
 * @cssproperty {color} [--c2-barcode-scanner__hint--color=#fafafa]
 * @cssproperty {font-size} [--c2-barcode-scanner__hint--font-size=14px]
 * @cssproperty {border-radius} [--c2-barcode-scanner__hint--border-radius=999px]
 * @cssproperty {display} [--c2-barcode-scanner__hint--display=block] - `none` hides the instruction.
 * @cssproperty {background} [--c2-barcode-scanner__result--background=rgba(21, 128, 61, 0.92)] - The last code read, in `continuous` mode.
 * @cssproperty {font-size} [--c2-barcode-scanner__screen--font-size=14px] - Text of the idle, starting and error screens.
 * @cssproperty {font-size} [--c2-barcode-scanner__value--font-size=18px] - The value on the done screen.
 * @cssproperty {font-weight} [--c2-barcode-scanner__value--font-weight=600]
 * @cssproperty {font-family} [--c2-barcode-scanner__value--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {color} [--c2-barcode-scanner__done__icon--color=#4ade80] - The check of the done screen.
 * @cssproperty {length} [--c2-barcode-scanner__controls--padding=12px 0 0]
 * @cssproperty {length} [--c2-barcode-scanner__controls--gap=12px]
 * @cssproperty {pixel} [--c2-barcode-scanner__switch--size=40px] - The light and Switch camera buttons.
 * @cssproperty {background} [--c2-barcode-scanner__torch__on--background=#fde047] - The light button while the light is on.
 * @cssproperty {color} [--c2-barcode-scanner__torch__on--color=#18181b]
 * @cssproperty {background} [--c2-barcode-scanner__button--background=#ffffff]
 * @cssproperty {background} [--c2-barcode-scanner__button__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-barcode-scanner__button--color=#18181b]
 * @cssproperty {border} [--c2-barcode-scanner__button--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-barcode-scanner__button--border-radius=6px]
 * @cssproperty {pixel} [--c2-barcode-scanner__button--height=36px]
 * @cssproperty {font-size} [--c2-barcode-scanner__button--font-size=14px]
 * @cssproperty {font-weight} [--c2-barcode-scanner__button--font-weight=500]
 * @cssproperty {background} [--c2-barcode-scanner__accept--background=rgb(2, 101, 220)] - The Start camera and Scan again buttons.
 * @cssproperty {background} [--c2-barcode-scanner__accept__hover--background=rgb(1, 84, 184)]
 * @cssproperty {color} [--c2-barcode-scanner__accept--color=#ffffff]
 * @cssproperty {outline} [--c2-barcode-scanner__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-barcode-scanner')
export class BarcodeScanner extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * The formats to read, as `BarcodeDetector` names them: `qr_code`, `ean_13`, `ean_8`, `upc_a`, `upc_e`, `code_128`,
   * `code_39`, `code_93`, `codabar`, `itf`, `data_matrix`, `aztec`, `pdf417`. As an attribute, separated by `;`.
   * Empty reads every format the decoder knows.
   */
  @property({ converter: arrayPropertyConverter }) formats: string[] = []

  /** Keeps the camera open after a code is read and fires `scan` for each new one, instead of stopping at the first. */
  @property({ type: Boolean }) continuous = false

  /**
   * In `continuous` mode, how long in milliseconds a code must be out of the picture before reading it again fires
   * `scan` again. A code that stays in the window fires once.
   */
  @property({ type: Number, attribute: 'repeat-delay' }) repeatDelay = 1500

  /** Sounds a short beep when a code is read. */
  @property({ type: Boolean }) beep = false

  /** The camera's light. It only turns on while the camera is open and has one; the light button toggles it. */
  @property({ type: Boolean }) torch = false

  /** The camera to open: `environment` (the back one, the default) or `user` (the front one). Switching camera updates it. */
  @property() facing: CameraFacing = 'environment'

  /** Opens the camera as soon as the element is on the page, without waiting for the Start camera button. */
  @property({ type: Boolean }) autostart = false

  /** The accessible name of the component. Empty uses the built-in "Barcode scanner". */
  @property() label = ''

  /** Supplies the video stream instead of `getUserMedia`. Set it before the camera starts. */
  @property({ attribute: false }) streamSource?: CameraStreamSource

  /** Reads the codes of a picture instead of the built-in decoder (`BarcodeDetector`, else `@zxing/library`). */
  @property({ attribute: false }) decoder?: BarcodeDecoder

  @state() private _status: BarcodeScannerStatus = 'idle'
  @state() private errorKind: BarcodeScannerErrorKind = 'unknown'
  @state() private last: BarcodeScanResult | undefined
  @state() private found = false
  @state() private torchAvailable = false
  @state() private openFacing: CameraFacing = 'environment'

  @query('video') private video?: HTMLVideoElement
  @query('.stage') private stage?: HTMLElement
  @query('.window') private windowBox?: HTMLElement

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, barcodeScannerMessages)
  private readonly camera = new CameraController(
    this,
    () => this.video,
    () => this.lost(),
  )
  private readonly screens = new SlotPresenceController(this, ['idle', 'error', 'done', 'actions'])
  private readonly builtInDecoder = createBarcodeDecoder()
  private scanTimer: ReturnType<typeof setTimeout> | undefined
  private foundTimer: ReturnType<typeof setTimeout> | undefined
  /** Changes whenever scanning starts or stops: a reading that comes back for an older run is dropped. */
  private run = 0
  private canvas: HTMLCanvasElement | undefined
  /** When each code was last in the picture, by format and value: a code still in view does not fire again. */
  private readonly seen = new Map<string, number>()
  private opening = 0
  private warnedFormats = ''
  /** Focus was inside the component when its screen changed: it moves to the new screen instead of being lost. */
  private keepFocus = false
  private onScreen = true
  private visibility: IntersectionObserver | undefined
  private audio: AudioContext | undefined

  /** Where the scanner is: `idle`, `starting`, `scanning`, `done` or `error`. Also a custom state, `:state(scanning)`. */
  get status(): BarcodeScannerStatus {
    return this._status
  }

  /** The last code read, or `undefined` before the first one and after `start()`. */
  get result(): BarcodeScanResult | undefined {
    return this.last
  }

  /** The open camera's stream; null while the camera is closed. */
  get stream(): MediaStream | null {
    return this.camera.stream
  }

  override connectedCallback() {
    super.connectedCallback()
    if (typeof IntersectionObserver === 'function') {
      // A scanner scrolled out of view keeps its camera, but stops reading the picture.
      this.visibility = new IntersectionObserver((entries) => (this.onScreen = entries[entries.length - 1].isIntersecting))
      this.visibility.observe(this)
    }
    if (this.autostart && this._status === 'idle')
      void this.updateComplete.then(() => {
        if (this.isConnected) void this.start()
      })
    // Started while off the page, the camera is open but nothing reads it yet.
    else if (this._status === 'scanning' && this.scanTimer === undefined) this.startScanning()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.visibility?.disconnect()
    this.visibility = undefined
    this.onScreen = true
    // The camera controller closes the stream; a page that brings the element back finds it ready to start again.
    this.stopScanning()
    if (this._status === 'starting' || this._status === 'scanning') this._status = 'idle'
    void this.audio?.close().catch(() => undefined)
    this.audio = undefined
  }

  /** Opens the camera and starts reading. Does nothing while it is open or opening; after a scan, it scans again. */
  async start(): Promise<void> {
    // Called as soon as the element is defined, a server-rendered element has not hydrated yet: a state change before
    // that first update would render something other than the server's markup (a Lit hydration mismatch).
    if (!this.hasUpdated) await this.updateComplete
    if (this._status === 'starting' || this._status === 'scanning') return
    this.last = undefined
    this.seen.clear()
    // Called from a click, this is where a browser lets the page start its sound.
    if (this.beep) this.wakeSound()
    await this.open(facingOf(this.facing))
  }

  /** Closes the camera and goes back to the idle screen. */
  stop(): void {
    this.opening++
    this.camera.stop()
    this.stopScanning()
    this._status = 'idle'
  }

  /** Switches between the front and the back camera. */
  async switchCamera(): Promise<void> {
    if (this._status !== 'scanning') return
    this.facing = this.openFacing === 'user' ? 'environment' : 'user'
    await this.open(this.facing)
  }

  /**
   * Reads the codes of a still picture (a file the user chose, a pasted image) with the scanner's decoder and formats.
   * The first code fires `scan` as one read by the camera does; the promise resolves with every code found.
   */
  async scanImage(image: Blob | ImageBitmapSource): Promise<BarcodeScanResult[]> {
    const bitmap = await createImageBitmap(image as ImageBitmapSource)
    try {
      const scale = Math.min(1, (FRAME_SIZE * 2) / Math.max(bitmap.width, bitmap.height))
      const frame = this.draw(bitmap, 0, 0, bitmap.width, bitmap.height, scale)
      if (!frame) return []
      const codes = (await this.decode(frame, true)).map((code) => this.inFrame(code, 0, 0, scale))
      if (codes.length) this.accept(codes.slice(0, 1))
      return codes
    } finally {
      bitmap.close()
    }
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if ((changed as Map<PropertyKey, unknown>).has('_status') && this.hasUpdated) this.keepFocus = !!this.shadowRoot?.activeElement
    if (changed.has('continuous') && !this.continuous && this._status === 'scanning' && this.last) this.finish()
  }

  protected override updated(changed: PropertyValues<this>) {
    this.internals.ariaLabel = this.label || this.msg.t('label')
    const states = (this.internals as ElementInternals & { states?: Set<string> }).states
    if (states)
      for (const name of STATUSES) {
        try {
          if (name === this._status) states.add(name)
          else states.delete(name)
        } catch {
          // A browser that only takes `--name` custom states: styling by state is then unavailable.
        }
      }
    if (changed.has('torch')) void this.applyTorch()
    if (this.keepFocus) {
      this.keepFocus = false
      // The button that was pressed is gone with its screen: the new screen's button takes the focus, or the picture.
      const active = this.shadowRoot?.activeElement
      if (!active || active === this.stage) (this.renderRoot.querySelector<HTMLElement>('.screen .button') ?? this.stage)?.focus()
    }
  }

  override firstUpdated() {
    this.internals.role = 'group'
  }

  private async open(facing: CameraFacing) {
    this.stopScanning()
    this.openFacing = facing
    this.torchAvailable = false
    this._status = 'starting'
    const attempt = ++this.opening
    try {
      const opened = await this.camera.start({ facing, width: 1280, height: 720 }, this.streamSource ?? browserCameraSource)
      if (!opened) {
        // Nothing to show the camera in (the element is not on the page yet), and no later start took over.
        if (attempt === this.opening && this._status === 'starting' && !this.camera.stream) this._status = 'idle'
        return
      }
      this._status = 'scanning'
      this.emit('camera-start', { facing })
      this.torchAvailable = !!(this.track()?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch
      void this.applyTorch()
      this.startScanning()
    } catch (error) {
      if (!this.isConnected) return
      this.fail(cameraErrorKind(error), error)
    }
  }

  private fail(kind: BarcodeScannerErrorKind, error: unknown) {
    this.camera.stop()
    this.stopScanning()
    this.errorKind = kind
    this._status = 'error'
    this.emit('camera-error', { kind, error })
  }

  /** The camera went away while open: unplugged, permission revoked, or taken by another application. */
  private lost() {
    if (this._status !== 'scanning' && this._status !== 'starting') return
    this.fail('ended', undefined)
  }

  private emit<K extends keyof BarcodeScannerEventMap>(type: K, detail: BarcodeScannerEventMap[K]['detail']) {
    // Not bubbling: a listener goes on this element, as with `c2-camera-capture`.
    const event = new CustomEvent(type, { detail })
    this.dispatchEvent(event)
  }

  private track(): MediaStreamTrack | undefined {
    return this.camera.stream?.getVideoTracks()[0]
  }

  /** Turns the light on or off. A camera without one, or a browser that cannot drive it, leaves it as it is. */
  private async applyTorch() {
    if (!this.torchAvailable) return
    try {
      await this.track()?.applyConstraints({ advanced: [{ torch: this.torch } as MediaTrackConstraintSet] })
    } catch {
      this.torchAvailable = false
    }
  }

  private startScanning() {
    this.stopScanning()
    const run = this.run
    this.scanTimer = setTimeout(() => void this.scan(run), SCAN_INTERVAL)
  }

  private stopScanning() {
    this.run++
    if (this.scanTimer !== undefined) clearTimeout(this.scanTimer)
    this.scanTimer = undefined
    if (this.foundTimer !== undefined) clearTimeout(this.foundTimer)
    this.foundTimer = undefined
    this.found = false
  }

  /** Reads the picture inside the window once, then schedules the next reading while the camera is open. */
  private async scan(run: number) {
    this.scanTimer = undefined
    if (run !== this.run || this._status !== 'scanning' || !this.isConnected) return
    // Not every engine fires `ended` on a track that stops by itself, so the scanner also reads its state.
    if (this.camera.ended) {
      this.lost()
      return
    }
    const video = this.video
    let wait = SCAN_INTERVAL
    if (video && video.videoWidth && this.onScreen && !document.hidden) {
      const region = coverRegion(video, this.stage, this.windowBox, this.openFacing === 'user') ?? {
        x: 0,
        y: 0,
        width: video.videoWidth,
        height: video.videoHeight,
      }
      const scale = Math.min(1, FRAME_SIZE / Math.max(region.width, region.height))
      const frame = this.draw(video, region.x, region.y, region.width, region.height, scale)
      if (frame) {
        const began = performance.now()
        try {
          const codes = await this.decode(frame, false)
          if (run !== this.run) return
          if (codes.length) this.accept(codes.map((code) => this.inFrame(code, region.x, region.y, scale)))
        } catch (error) {
          if (run !== this.run) return
          // By name: an app's decoder may throw the class of another copy of this package.
          if (error instanceof Error && error.name === 'BarcodeDecoderUnavailableError') {
            console.warn(error.message)
            this.fail('decoder', error)
            return
          }
          // A decoder that fails on one picture reads the next one.
        }
        // A slow decoder (the fallback on a modest phone) leaves the page as much time as it took.
        wait = Math.max(SCAN_INTERVAL, performance.now() - began)
      }
    }
    if (run === this.run && this._status === 'scanning') this.scanTimer = setTimeout(() => void this.scan(run), wait)
  }

  private async decode(frame: ImageData, still: boolean): Promise<BarcodeScanResult[]> {
    const formats = Array.isArray(this.formats) ? this.formats.map((format) => String(format).trim()).filter(Boolean) : []
    if (!this.decoder) {
      // The built-in decoder reads nothing for a name it does not know (`ean13` for `ean_13`): say so, once per list.
      const unknown = formats.filter((format) => !Object.prototype.hasOwnProperty.call(FORMAT_NAMES, format))
      if (unknown.length && this.warnedFormats !== unknown.join(' ')) {
        this.warnedFormats = unknown.join(' ')
        console.warn(
          `c2-barcode-scanner: unknown format ${unknown.map((format) => `"${format}"`).join(', ')}. Formats are: ${Object.keys(FORMAT_NAMES).join(', ')}.`,
        )
      }
    }
    const codes = await (this.decoder ?? this.builtInDecoder)(frame, { formats, still })
    return Array.isArray(codes) ? codes.filter((code) => code && typeof code.value === 'string' && code.value !== '') : []
  }

  /** Draws part of a picture, scaled, and reads its pixels back; `undefined` when they cannot be read (a cross-origin stream). */
  private draw(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, scale: number): ImageData | undefined {
    const width = Math.max(1, Math.round(sw * scale))
    const height = Math.max(1, Math.round(sh * scale))
    this.canvas ??= document.createElement('canvas')
    const canvas = this.canvas
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return undefined
    try {
      context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)
      return context.getImageData(0, 0, width, height)
    } catch {
      return undefined
    }
  }

  /** A code with its corners moved from the picture the decoder read to the camera's own frame. */
  private inFrame(code: BarcodeScanResult, x: number, y: number, scale: number): BarcodeScanResult {
    const corners = Array.isArray(code.corners) ? code.corners.map((point) => ({ x: x + point.x / scale, y: y + point.y / scale })) : undefined
    return { value: code.value, format: String(code.format ?? ''), ...(corners ? { corners } : {}) }
  }

  /** Takes the codes read from one picture: fires `scan` for each, unless it is a code already in the picture. */
  private accept(codes: BarcodeScanResult[]) {
    const now = performance.now()
    const delay = Number.isFinite(this.repeatDelay) ? Math.max(0, this.repeatDelay) : 1500
    const live = this.continuous && this._status === 'scanning'
    for (const code of live ? codes : codes.slice(0, 1)) {
      const key = `${code.format} ${code.value}`
      const before = this.seen.get(key)
      this.seen.set(key, now)
      // Two codes side by side are each remembered, so neither fires again while both stay in view.
      if (live && before !== undefined && now - before < delay) continue
      this.last = code
      if (this.beep) this.sound()
      if (live) {
        this.found = true
        if (this.foundTimer !== undefined) clearTimeout(this.foundTimer)
        this.foundTimer = setTimeout(() => (this.found = false), FOUND_TIME)
      } else this.finish()
      this.emit('scan', code)
    }
    for (const [key, at] of this.seen) if (now - at >= delay) this.seen.delete(key)
  }

  /** Closes the camera on the code that was read. */
  private finish() {
    this.camera.stop()
    this.stopScanning()
    this._status = 'done'
  }

  /** Creates the sound output, or wakes one the browser suspended: only allowed while handling a user's action. */
  private wakeSound(): AudioContext | undefined {
    try {
      this.audio ??= new AudioContext()
      if (this.audio.state === 'suspended') void this.audio.resume().catch(() => undefined)
      return this.audio
    } catch {
      return undefined
    }
  }

  private sound() {
    try {
      const audio = this.wakeSound()
      if (!audio) return
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.frequency.value = 1040
      gain.gain.setValueAtTime(0.15, audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.14)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start()
      oscillator.stop(audio.currentTime + 0.15)
    } catch {
      // No audio output, or the page may not play sound yet: the scan itself is unaffected.
    }
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
      case 'decoder':
        return this.msg.t('errorDecoder')
      default:
        return this.msg.t('errorUnknown')
    }
  }

  private slotted(name: string): boolean {
    return this.screens.state(name) === 'present'
  }

  private readonly handleSlotChange = (event: Event) => this.screens.handleSlotChange(event)

  private renderStage() {
    const status = this._status
    const scanning = status === 'scanning'
    const last = this.last
    return html`<div class="stage stage--${status}" part="stage" tabindex="-1">
      <video
        class="video ${this.openFacing === 'user' ? 'video--mirrored' : ''}"
        part="video"
        ?hidden=${!scanning && status !== 'starting'}
        muted
        playsinline
        autoplay
        disablepictureinpicture
        aria-hidden="true"
      ></video>
      ${
        scanning
          ? html`<div class="window-area" aria-hidden="true">
                <div class="window ${this.found ? 'window--found' : ''}" part="window">
                  <slot name="window"
                    ><span class="frame" part="frame"><span class="line" part="line"></span></span
                  ></slot>
                </div>
              </div>
              ${
                last
                  ? html`<p class="hint hint--result" part="result" aria-hidden="true">${last.value}</p>`
                  : html`<p class="hint" part="hint" aria-hidden="true">${this.msg.t('hint')}</p>`
              }`
          : nothing
      }
      ${
        status === 'idle'
          ? html`<div class="screen" part="idle">
              <slot name="idle" @slotchange=${this.handleSlotChange}>
                ${
                  this.slotted('idle')
                    ? nothing
                    : html`<span class="screen__icon">${scanIcon}</span>
                        <p class="screen__text">${this.msg.t('idle')}</p>
                        <button class="button button--accept" part="button" type="button" @click=${() => this.start()}>${this.msg.t('start')}</button>`
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
          ? html`<div class="screen" part="done">
              <slot name="done" @slotchange=${this.handleSlotChange}>
                ${
                  this.slotted('done')
                    ? nothing
                    : html`<span class="screen__icon screen__icon--done">${checkIcon}</span>
                        <p class="value" part="value">${last?.value ?? ''}</p>
                        ${last?.format ? html`<p class="format" part="format">${FORMAT_NAMES[last.format] ?? last.format}</p>` : nothing}
                        <button class="button button--accept" part="button" type="button" @click=${() => this.start()}>${this.msg.t('scanAgain')}</button>`
                }
              </slot>
            </div>`
          : nothing
      }
    </div>`
  }

  private renderControls() {
    const scanning = this._status === 'scanning'
    const torch = scanning && this.torchAvailable
    const cameras = scanning && this.camera.cameras > 1
    return html`<div class="controls ${torch || cameras || this.screens.has('actions') ? '' : 'controls--empty'}" part="controls">
      <div class="actions" part="actions"><slot name="actions" @slotchange=${this.handleSlotChange}></slot></div>
      <div class="side-controls">
        ${
          torch
            ? html`<button
                class="round ${this.torch ? 'round--on' : ''}"
                part="torch"
                type="button"
                aria-label=${this.msg.t('torch')}
                aria-pressed=${this.torch ? 'true' : 'false'}
                @click=${() => (this.torch = !this.torch)}
              >
                <slot name="torch-icon">${torchIcon}</slot>
              </button>`
            : nothing
        }
        ${
          cameras
            ? html`<button class="round" part="switch" type="button" aria-label=${this.msg.t('switchCamera')} @click=${() => this.switchCamera()}>
                <slot name="switch-icon">${switchIcon}</slot>
              </button>`
            : nothing
        }
      </div>
    </div>`
  }

  private announcement(): string {
    switch (this._status) {
      case 'starting':
        return this.msg.t('starting')
      case 'error':
        return this.errorText()
      case 'scanning':
        return this.last ? '' : this.msg.t('hint')
      default:
        return ''
    }
  }

  override render() {
    const last = this.last
    return html`<div class="scanner">
      ${this.renderStage()} ${this.renderControls()}
      <div class="visually-hidden" role="status">${this.announcement()}</div>
      <div class="visually-hidden" role="status">
        ${last && (this._status === 'scanning' || this._status === 'done') ? this.msg.t('scanned', last.value) : ''}
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-barcode-scanner': BarcodeScanner
  }
}
