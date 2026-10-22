import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { imageCropperMessages } from './messages'
import styles from './image-cropper.scss?inline'

/** A rectangle in the image's natural (intrinsic) pixels. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type ImageCropperShape = 'rectangle' | 'ellipse'

/** Size of the image `toCanvas` and `toBlob` draw. Give one side to keep the selection's proportions. */
export interface ImageCropperOutputOptions {
  width?: number
  height?: number
}

/** Events fired by {@link ImageCropper}, keyed for `addEventListener`. */
export interface ImageCropperEventMap {
  'crop-input': CustomEvent<{ crop: CropRect }>
  'crop-change': CustomEvent<{ crop: CropRect }>
  load: Event
  error: Event
}

export interface ImageCropper {
  addEventListener: TypedAddEventListener<ImageCropper, ImageCropperEventMap>
  removeEventListener: TypedRemoveEventListener<ImageCropper, ImageCropperEventMap>
}

type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
type Point = { x: number; y: number }

interface Gesture {
  pointerId: number
  /** `move` drags the selection, a handle resizes it, `draw` starts a new one from the pointer. */
  kind: 'move' | 'draw' | Handle
  start: Point
  startCrop: CropRect
  moved: boolean
}

const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se']
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** Smallest selection the pointer or the keyboard can make, in rendered pixels. */
const MIN_SIZE = 24
/** Share of the image the initial selection covers. */
const INITIAL_COVERAGE = 0.8

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Reads `16/9`, `16:9` or `1.5`; anything else, zero included, means a free selection. */
function parseRatio(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0
  if (typeof value !== 'string' || !value.trim()) return 0
  const [a, b] = value.split(/[/:]/).map((part) => parseFloat(part))
  const ratio = b === undefined ? a : a / b
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 0
}

const ratioConverter = {
  fromAttribute: (value: string | null) => parseRatio(value),
  toAttribute: (value: number) => (value ? String(value) : null),
  fromProperty: (value: unknown) => parseRatio(value),
}

/**
 * Lets the reader choose the part of an image to keep — an avatar from a photo, a banner from a screenshot — and
 * hands the app that part as a canvas or a blob. The selection is drawn over the image with the rest dimmed; drag it
 * to move it, drag a handle to resize it, or drag on the image outside it to draw a new one. Escape cancels a drag.
 *
 * The selection is one tab stop. Arrow keys move it (Shift for ten times the step), Alt + Arrow keys move its right or
 * bottom edge, and `+`/`-` scale it around its centre; the new size and position are announced.
 *
 * `crop` is the selection in the image's natural pixels, whatever size it renders at. Leave it unset and the cropper
 * selects the centred 80% of the image once it loads. `aspect-ratio` locks the proportions (`1`, `16/9`, `4:3`);
 * `shape="ellipse"` rounds the selection and clips the output to it, for avatars. `toCanvas()` and `toBlob()` draw the
 * selection at its natural size, or at the size you give. A cross-origin image needs `crossorigin` and CORS headers,
 * or the browser refuses to read the canvas back.
 *
 * @tag c2-image-cropper
 *
 * @slot placeholder - Shown while there is no `src`; put an upload control here.
 *
 * @event {CustomEvent<{ crop: CropRect }>} crop-input - Fired while the reader changes the selection (every step of a drag). Not fired for changes made by script. Does not bubble.
 * @event {CustomEvent<{ crop: CropRect }>} crop-change - Fired when the reader commits a change: the pointer is released or a key moved the selection. Does not bubble.
 * @event {Event} load - The image has loaded (re-dispatched from the inner image).
 * @event {Event} error - The image failed to load (re-dispatched from the inner image).
 *
 * @csspart frame - Box around the image; centres it and draws the background behind transparent pixels. Without a `src` it wraps the `placeholder` slot instead (no fallback content).
 * @csspart image - The image being cropped.
 * @csspart selection - The selected area: its outline, guides and handles.
 * @csspart handle - Each resize handle. Edge handles are hidden while `aspect-ratio` is set.
 *
 * @cssproperty {pixel} [--c2-image-cropper__image--max-height=360px] - Largest height the image renders at; it is scaled down to fit the width as well.
 * @cssproperty {pixel} [--c2-image-cropper__frame--min-height=160px] - Height of the frame while there is no image.
 * @cssproperty {background} [--c2-image-cropper__frame--background=#f4f4f5] - Shows through transparent pixels and around an image narrower than the host.
 * @cssproperty {border} [--c2-image-cropper__frame--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-image-cropper__frame--border-radius=8px]
 * @cssproperty {pixel} [--c2-image-cropper__frame--padding=0px] - Room around the image, so the handles on its edges stay inside the frame.
 * @cssproperty {color} [--c2-image-cropper__overlay--color=rgba(0, 0, 0, 0.55)] - Dims the image outside the selection.
 * @cssproperty {border} [--c2-image-cropper__selection--border=1px solid #ffffff]
 * @cssproperty {outline} [--c2-image-cropper__selection__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Drawn around the selection while it is keyboard-focused.
 * @cssproperty {display} [--c2-image-cropper__guides--display=block] - `none` hides the rule-of-thirds lines.
 * @cssproperty {color} [--c2-image-cropper__guides--color=rgba(255, 255, 255, 0.5)]
 * @cssproperty {pixel} [--c2-image-cropper__handle--size=12px]
 * @cssproperty {color} [--c2-image-cropper__handle--background=#ffffff]
 * @cssproperty {border} [--c2-image-cropper__handle--border=1px solid #a1a1aa]
 * @cssproperty {border-radius} [--c2-image-cropper__handle--border-radius=999px]
 * @cssproperty {box-shadow} [--c2-image-cropper__handle--box-shadow=0 1px 2px rgba(0, 0, 0, 0.3)]
 */
@customElement('c2-image-cropper')
export class ImageCropper extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly msg = new LocalizeController(this, imageCropperMessages)

  /** URL of the image to crop. Replacing it selects the centred 80% of the new image, unless `crop` changes too. */
  @property() src = ''

  /** Alternative text of the image. */
  @property() alt = ''

  /** CORS mode of the image request (`anonymous`, `use-credentials`); needed to read a cross-origin image back with `toCanvas`/`toBlob`. */
  @property({ attribute: 'crossorigin' }) crossOrigin: string | undefined = undefined

  /** Locks the selection's width-to-height ratio: `1`, `16/9`, `4:3` or `1.5`. Unset or `0` leaves it free. */
  @property({ attribute: 'aspect-ratio', converter: ratioConverter }) aspectRatio = 0

  /** `ellipse` rounds the selection and makes `toCanvas`/`toBlob` clip to it (transparent corners in a PNG). */
  @property() shape: ImageCropperShape = 'rectangle'

  /** The selection, in the image's natural pixels (JSON in markup). Set by the cropper once the image loads when left unset. */
  @property({ converter: jsonPropertyConverter }) crop: CropRect | undefined = undefined

  /** Locks the selection: no dragging, no keyboard, not focusable. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Accessible name of the selection. Defaults to "Crop area" in the nearest `lang` (English, or a language the app adds). */
  @property() label = ''

  @state() private loaded = false
  @state() private dragging = false
  @state() private announcement = ''
  /** The selection was focused by a pointer: no focus ring until a key is pressed. */
  @state() private pointerFocus = false

  @query('img') private image?: HTMLImageElement
  @query('.stage') private stage?: HTMLElement
  @query('[part~="selection"]') private selection?: HTMLElement

  private gesture?: Gesture

  /** Width of the loaded image in its natural pixels; `0` until it loads. */
  get naturalWidth() {
    return this.loaded ? (this.image?.naturalWidth ?? 0) : 0
  }

  /** Height of the loaded image in its natural pixels; `0` until it loads. */
  get naturalHeight() {
    return this.loaded ? (this.image?.naturalHeight ?? 0) : 0
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('src') && changed.get('src')) {
      this.loaded = false
      if (!changed.has('crop')) this.crop = undefined
    }
    if (!this.loaded) return
    if (changed.has('aspectRatio') && changed.get('aspectRatio') !== undefined && this.aspectRatio && this.crop) {
      this.crop = this.fitRatio(this.crop)
    } else if (changed.has('crop')) {
      const crop = this.crop ? this.bounded(this.crop) : this.initialCrop()
      if (!this.crop || !sameRect(crop, this.crop)) this.crop = crop
    }
  }

  protected override firstUpdated() {
    // A server-rendered or cached image can finish loading before the listener is attached.
    if (this.image?.complete && this.image.naturalWidth) this.handleLoad()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.gesture = undefined
    this.dragging = false
  }

  /** Selects the centred 80% of the image again, at the current `aspect-ratio`. */
  reset() {
    if (this.loaded) this.crop = this.initialCrop()
  }

  /**
   * Draws the selection on a new canvas, at its natural size unless `width` and/or `height` say otherwise. Throws an
   * `InvalidStateError` until the image has loaded; reading a cross-origin image back needs `crossorigin`.
   */
  toCanvas(options: ImageCropperOutputOptions = {}): HTMLCanvasElement {
    const image = this.image
    const crop = this.crop
    if (!this.loaded || !image || !crop) throw new DOMException('c2-image-cropper: the image has not loaded', 'InvalidStateError')
    let { width, height } = options
    if (width && !height) height = (width * crop.height) / crop.width
    else if (height && !width) width = (height * crop.width) / crop.height
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width ?? crop.width))
    canvas.height = Math.max(1, Math.round(height ?? crop.height))
    const context = canvas.getContext('2d')
    if (!context) return canvas
    context.imageSmoothingQuality = 'high'
    if (this.shape === 'ellipse') {
      context.beginPath()
      context.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2)
      context.clip()
    }
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
    return canvas
  }

  /** The selection as an image file (PNG unless `type` says otherwise; `quality` from 0 to 1 for JPEG and WebP). */
  toBlob(type = 'image/png', quality?: number, options?: ImageCropperOutputOptions): Promise<Blob> {
    const canvas = this.toCanvas(options)
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new DOMException('c2-image-cropper: the canvas could not be encoded', 'EncodingError'))),
        type,
        quality,
      ),
    )
  }

  private handleLoad(event?: Event) {
    this.loaded = true
    this.crop = this.crop ? this.bounded(this.crop) : this.initialCrop()
    if (event) redispatchEvent(this, event)
  }

  private handleError(event: Event) {
    this.loaded = false
    redispatchEvent(this, event)
  }

  /** The largest rectangle at `aspect-ratio` inside the image, scaled to the initial coverage and centred. */
  private initialCrop(): CropRect {
    const W = this.naturalWidth
    const H = this.naturalHeight
    let width = W
    let height = H
    if (this.aspectRatio) {
      width = Math.min(W, H * this.aspectRatio)
      height = width / this.aspectRatio
    }
    width *= INITIAL_COVERAGE
    height *= INITIAL_COVERAGE
    return { x: (W - width) / 2, y: (H - height) / 2, width, height }
  }

  /** Keeps a rectangle inside the image, shrinking it first if it is larger. */
  private bounded(crop: CropRect): CropRect {
    const W = this.naturalWidth
    const H = this.naturalHeight
    const width = clamp(Number(crop.width) || 0, 1, W)
    const height = clamp(Number(crop.height) || 0, 1, H)
    return { x: clamp(Number(crop.x) || 0, 0, W - width), y: clamp(Number(crop.y) || 0, 0, H - height), width, height }
  }

  /** The rectangle at `aspect-ratio` with the same area and centre as `crop`, made to fit the image. */
  private fitRatio(crop: CropRect): CropRect {
    const ratio = this.aspectRatio
    let width = Math.sqrt(crop.width * crop.height * ratio)
    let height = width / ratio
    const scale = Math.min(1, this.naturalWidth / width, this.naturalHeight / height)
    width *= scale
    height *= scale
    return this.bounded({ x: crop.x + (crop.width - width) / 2, y: crop.y + (crop.height - height) / 2, width, height })
  }

  /** Natural pixels per rendered pixel. */
  private scale() {
    const width = this.stage?.getBoundingClientRect().width
    return width ? this.naturalWidth / width : 1
  }

  private minSize() {
    return Math.min(MIN_SIZE * this.scale(), this.naturalWidth, this.naturalHeight)
  }

  private pointFrom(event: PointerEvent): Point {
    const rect = this.stage!.getBoundingClientRect()
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * this.naturalWidth, 0, this.naturalWidth),
      y: clamp(((event.clientY - rect.top) / rect.height) * this.naturalHeight, 0, this.naturalHeight),
    }
  }

  /**
   * The rectangle spanned by a fixed `anchor` and the `point` the pointer drags, flipping when the point crosses the
   * anchor. `axes` limits which sides follow the pointer (an edge handle moves one); the others keep `base`.
   */
  private spanned(anchor: Point, point: Point, base: CropRect, axes: { x: boolean; y: boolean }): CropRect {
    const W = this.naturalWidth
    const H = this.naturalHeight
    const min = this.minSize()
    const ratio = this.aspectRatio
    const sx = point.x < anchor.x ? -1 : 1
    const sy = point.y < anchor.y ? -1 : 1
    let width = axes.x ? Math.max(min, Math.abs(point.x - anchor.x)) : base.width
    let height = axes.y ? Math.max(min, Math.abs(point.y - anchor.y)) : base.height
    const maxWidth = axes.x ? (sx > 0 ? W - anchor.x : anchor.x) : W
    const maxHeight = axes.y ? (sy > 0 ? H - anchor.y : anchor.y) : H
    if (ratio) {
      if (width / height > ratio) height = width / ratio
      else width = height * ratio
      const fit = Math.min(1, maxWidth / width, maxHeight / height)
      width *= fit
      height *= fit
    } else {
      width = Math.min(width, maxWidth)
      height = Math.min(height, maxHeight)
    }
    const x = axes.x ? (sx > 0 ? anchor.x : anchor.x - width) : base.x
    const y = axes.y ? (sy > 0 ? anchor.y : anchor.y - height) : base.y
    return this.bounded({ x, y, width, height })
  }

  private cropFor(gesture: Gesture, point: Point): CropRect {
    const start = gesture.startCrop
    const dx = point.x - gesture.start.x
    const dy = point.y - gesture.start.y
    if (gesture.kind === 'move') return this.bounded({ ...start, x: start.x + dx, y: start.y + dy })
    if (gesture.kind === 'draw') return this.spanned(gesture.start, point, start, { x: true, y: true })
    const handle = gesture.kind
    const left = start.x
    const top = start.y
    const right = start.x + start.width
    const bottom = start.y + start.height
    const anchor = { x: handle.includes('w') ? right : left, y: handle.includes('n') ? bottom : top }
    const moving = { x: (handle.includes('w') ? left : right) + dx, y: (handle.includes('n') ? top : bottom) + dy }
    return this.spanned(anchor, moving, start, { x: /[ew]/.test(handle), y: /[ns]/.test(handle) })
  }

  private handlePointerDown(event: PointerEvent) {
    if (this.disabled || !this.loaded || !this.crop || this.gesture || (event.pointerType === 'mouse' && event.button !== 0)) return
    const target = event.target as HTMLElement
    const handle = target.dataset?.handle as Handle | undefined
    const kind = handle ?? (this.selection?.contains(target) ? 'move' : 'draw')
    event.preventDefault()
    this.stage!.setPointerCapture(event.pointerId)
    this.gesture = { pointerId: event.pointerId, kind, start: this.pointFrom(event), startCrop: this.crop, moved: false }
    this.dragging = true
    this.pointerFocus = true
    // The selection takes focus so Escape cancels the drag and the keyboard carries on from it.
    this.selection?.focus({ preventScroll: true })
  }

  private handlePointerMove(event: PointerEvent) {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const point = this.pointFrom(event)
    // A press on the image is a click until the pointer travels a few pixels.
    if (gesture.kind === 'draw' && !gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < 3 * this.scale()) return
    gesture.moved = true
    this.commit(this.cropFor(gesture, point), 'crop-input')
  }

  private handlePointerUp(event: PointerEvent) {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    this.endGesture(event.pointerId)
    if (gesture.moved && this.crop && !sameRect(this.crop, gesture.startCrop)) this.emit('crop-change')
  }

  private endGesture(pointerId: number) {
    this.gesture = undefined
    this.dragging = false
    if (this.stage?.hasPointerCapture(pointerId)) this.stage.releasePointerCapture(pointerId)
  }

  private handleKeyDown(event: KeyboardEvent) {
    this.pointerFocus = false
    if (this.disabled || !this.crop) return
    if (event.key === 'Escape' && this.gesture) {
      event.preventDefault()
      const { startCrop, pointerId, moved } = this.gesture
      this.endGesture(pointerId)
      if (moved) this.commit(startCrop, 'crop-input')
      return
    }
    const crop = this.keyboardCrop(event, this.crop)
    if (!crop) return
    event.preventDefault()
    if (this.commit(crop, 'crop-input')) this.emit('crop-change')
    const c = this.crop
    this.announcement = this.msg.t('status', Math.round(c.width), Math.round(c.height), Math.round(c.x), Math.round(c.y))
  }

  private keyboardCrop(event: KeyboardEvent, crop: CropRect): CropRect | undefined {
    const step = (event.shiftKey ? 10 : 1) * this.scale()
    const rtl = getComputedStyle(this).direction === 'rtl'
    const directions: Record<string, Point> = {
      ArrowLeft: { x: rtl ? step : -step, y: 0 },
      ArrowRight: { x: rtl ? -step : step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const direction = directions[event.key]
    if (direction && event.altKey) {
      const corner = { x: crop.x + crop.width + direction.x, y: crop.y + crop.height + direction.y }
      const axes = { x: direction.x !== 0 || !!this.aspectRatio, y: direction.y !== 0 || !!this.aspectRatio }
      if (this.aspectRatio) {
        // One axis drives the other: grow or shrink both by the step along the pressed one.
        const delta = direction.x || direction.y
        corner.x = crop.x + crop.width + (direction.x ? delta : delta * this.aspectRatio)
        corner.y = crop.y + crop.height + (direction.y ? delta : delta / this.aspectRatio)
      }
      return this.spanned({ x: crop.x, y: crop.y }, { x: Math.max(corner.x, crop.x), y: Math.max(corner.y, crop.y) }, crop, axes)
    }
    if (direction) return this.bounded({ ...crop, x: crop.x + direction.x, y: crop.y + direction.y })
    const grow = event.key === '+' || event.key === '=' ? 1 : event.key === '-' || event.key === '_' ? -1 : 0
    if (!grow) return undefined
    const factor = 1 + grow * 0.05
    const min = this.minSize()
    let width = Math.max(min, crop.width * factor)
    let height = Math.max(min, crop.height * factor)
    if (this.aspectRatio) height = width / this.aspectRatio
    const fit = Math.min(1, this.naturalWidth / width, this.naturalHeight / height)
    width *= fit
    height *= fit
    return this.bounded({ x: crop.x + (crop.width - width) / 2, y: crop.y + (crop.height - height) / 2, width, height })
  }

  /** Sets the selection and fires `type` when it changed. */
  private commit(crop: CropRect, type: 'crop-input'): boolean {
    if (this.crop && sameRect(crop, this.crop)) return false
    this.crop = crop
    this.emit(type)
    return true
  }

  private emit(type: 'crop-input' | 'crop-change') {
    const init = { detail: { crop: { ...this.crop! } } }
    // Spelled out so the manifest records both names.
    this.dispatchEvent(type === 'crop-input' ? new CustomEvent('crop-input', init) : new CustomEvent('crop-change', init))
  }

  private renderSelection() {
    const crop = this.crop
    const W = this.naturalWidth
    const H = this.naturalHeight
    if (!this.loaded || !crop || !W || !H) return nothing
    const box = {
      left: `${(crop.x / W) * 100}%`,
      top: `${(crop.y / H) * 100}%`,
      width: `${(crop.width / W) * 100}%`,
      height: `${(crop.height / H) * 100}%`,
    }
    const handles = this.aspectRatio ? CORNERS : HANDLES
    return html`
      <div class="shade" aria-hidden="true"><div class="hole" style=${styleMap(box)}></div></div>
      <div
        part="selection"
        role="group"
        tabindex=${this.disabled ? -1 : 0}
        aria-label=${this.label || this.msg.t('label')}
        aria-roledescription=${this.msg.t('roleDescription')}
        aria-describedby="instructions"
        aria-disabled=${this.disabled ? 'true' : 'false'}
        style=${styleMap(box)}
        @keydown=${this.handleKeyDown}
        @blur=${() => (this.pointerFocus = false)}
      >
        <span class="guides" aria-hidden="true"></span>
        ${this.disabled ? nothing : handles.map((handle) => html`<span part="handle" class="handle ${handle}" data-handle=${handle} aria-hidden="true"></span>`)}
      </div>
    `
  }

  override render() {
    if (!this.src) {
      return html`<div part="frame" class="frame empty"><slot name="placeholder"></slot></div>`
    }
    const classes = {
      stage: true,
      dragging: this.dragging,
      ellipse: this.shape === 'ellipse',
      disabled: this.disabled,
      loaded: this.loaded,
      'pointer-focus': this.pointerFocus,
    }
    return html`
      <div part="frame" class="frame">
        <div
          class=${classMap(classes)}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerUp}
          @lostpointercapture=${this.handlePointerUp}
        >
          <img
            part="image"
            src=${this.src}
            alt=${this.alt}
            crossorigin=${ifDefined(this.crossOrigin)}
            draggable="false"
            @load=${this.handleLoad}
            @error=${this.handleError}
          />
          ${this.renderSelection()}
        </div>
      </div>
      <span id="instructions" hidden>${this.msg.t('instructions')}</span>
      <span class="visually-hidden" aria-live="polite">${this.announcement}</span>
    `
  }
}

function sameRect(a: CropRect, b: CropRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-image-cropper': ImageCropper
  }
}
