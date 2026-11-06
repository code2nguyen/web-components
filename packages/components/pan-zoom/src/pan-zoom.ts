import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { isApplePlatform } from '@c2n/core/shortcut-helper.js'
import {
  Glide,
  InertiaTracker,
  PinchTracker,
  centerOn as centerView,
  clampView,
  clampZoom,
  easeOutCubic,
  fitRect,
  fitZoom,
  interpolateView,
  panBy as panView,
  panZoomKeyAction,
  pinchView,
  prefersReducedMotion,
  revealRect,
  sameView,
  toContentPoint as contentPointOf,
  viewTransform,
  wheelPixels,
  wheelZoomFactor,
  zoomAround,
  type PanZoomFit,
  type PanZoomPoint,
  type PanZoomRect,
  type PanZoomSize,
  type PanZoomView,
} from '@c2n/core/pan-zoom.js'
import { panZoomMessages } from './messages'
import styles from './pan-zoom.scss?inline'

export type { PanZoomFit, PanZoomPoint, PanZoomRect, PanZoomView } from '@c2n/core/pan-zoom.js'

/** What the wheel and one finger do. */
export type PanZoomGestures = 'cooperative' | 'pan' | 'zoom' | 'none'

/** `content` keeps the content in view; `none` is a free canvas. */
export type PanZoomBounds = 'content' | 'none'

/** What moved the view. */
export type PanZoomReason = 'gesture' | 'wheel' | 'keyboard' | 'controls' | 'fit' | 'resize' | 'api'

/** Detail of `view-change` and `view-settle`. */
export interface PanZoomViewDetail extends PanZoomView {
  reason: PanZoomReason
}

/** Events fired by {@link PanZoom}, keyed for `addEventListener`. */
export interface PanZoomEventMap {
  'view-change': CustomEvent<PanZoomViewDetail>
  'view-settle': CustomEvent<PanZoomViewDetail>
}

export interface PanZoom {
  addEventListener: TypedAddEventListener<PanZoom, PanZoomEventMap>
  removeEventListener: TypedRemoveEventListener<PanZoom, PanZoomEventMap>
}

export interface PanZoomMoveOptions {
  /** Ease to the new view over `--c2-pan-zoom--transition-duration`. Off under `prefers-reduced-motion`. */
  animate?: boolean
}

export interface PanZoomZoomOptions extends PanZoomMoveOptions {
  /** The viewport point (CSS pixels from its top-left corner) that stays still. Default: the centre. */
  origin?: PanZoomPoint
}

export interface PanZoomCenterOptions extends PanZoomMoveOptions {
  /** The zoom to centre at. Default: the current zoom. */
  zoom?: number
}

export interface PanZoomRevealOptions extends PanZoomMoveOptions {
  /** Viewport pixels to leave round the target. Default: `--c2-pan-zoom--fit-padding`. */
  padding?: number
}

export interface PanZoomFrameOptions extends PanZoomRevealOptions {
  /** Highest zoom the framing may choose. Default: `max-zoom`. */
  maxZoom?: number
}

const FIT_MODES: readonly PanZoomFit[] = ['contain', 'cover', 'width', 'none']
const GESTURES: readonly PanZoomGestures[] = ['cooperative', 'pan', 'zoom', 'none']
const DEFAULT_MIN_ZOOM = 0.25
const DEFAULT_MAX_ZOOM = 4
const DEFAULT_ZOOM_STEP = 1.2
/** Pointer travel, in CSS pixels, before a press becomes a drag (so a click on the content stays a click). */
const DRAG_THRESHOLD = 3
/** Quiet time after the last wheel event before the view settles. */
const WHEEL_SETTLE = 150
const HINT_DURATION = 1500
/** Slowest release, in pixels per millisecond, that still glides. */
const GLIDE_MIN_SPEED = 0.05

/** The computed styles a minimap copy of a slotted SVG takes along, since the page's style sheets do not reach it. */
const PAINT_PROPERTIES = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'opacity',
  'display',
  'visibility',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
]

/** A press on one of these is left to it: a drag that starts there does not pan. */
const INTERACTIVE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'video[controls]',
  'audio[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[draggable="true"]',
  '[data-pan-zoom="ignore"]',
  '[role="button"]',
  '[role="link"]',
  '[role="slider"]',
  '[role="scrollbar"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
].join(', ')

const minZoomConverter = {
  fromAttribute: (value: string | null): number | 'fit' => (value?.trim() === 'fit' ? 'fit' : Number(value)),
}

const iconMinus = svg`<path d="M4 8h8" />`
const iconPlus = svg`<path d="M4 8h8M8 4v8" />`
const iconFit = svg`<path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />`
const icon = (paths: ReturnType<typeof svg>) =>
  html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${paths}
  </svg>`

type MinimapArt = 'slot' | 'img' | 'svg' | 'canvas' | 'rect'

interface Drag {
  id: number
  startX: number
  startY: number
  /** The view when the drag started: a move pans it by the pointer's whole travel since, so a repeated or reordered move event cannot add up. */
  view: PanZoomView
  lastX: number
  lastY: number
  moved: boolean
}

interface Animation {
  frame: number
  target: PanZoomView
}

/**
 * A viewport that pans and zooms whatever is slotted in it: an image, an SVG diagram, a floor plan, a board. The
 * content is laid out at its natural size and moved with one transform; `fit` chooses the first view (`contain` shows
 * all of it), `min-zoom` / `max-zoom` bound the zoom, and `bounds="content"` keeps the content in view while
 * `bounds="none"` makes a free canvas.
 *
 * A drag pans (not when it starts on a link, button, form control or `[data-pan-zoom="ignore"]`; Space + drag and a
 * middle-button drag pan from anywhere), Ctrl/⌘ + wheel and a pinch zoom to the pointer, a double-click zooms in one step,
 * and a released drag glides. `gestures` sets what the plain wheel and one finger do: `cooperative` (the default)
 * leaves them to the page and shows a hint, `pan` pans as in Figma, `zoom` zooms as in a map, `none` leaves only the
 * buttons, the keys and the methods. The viewport is one tab stop: the arrows pan (Shift for a quarter of the view),
 * `+` / `-` zoom, `0` fits and `1` goes to 100%; `no-keyboard` hands the keys to a component that draws its own
 * content. Focus moving to content out of view pans it into view.
 *
 * `controls` draws a toolbar (zoom out, the zoom percent, zoom in, fit) and `minimap` an overview that shows while the
 * content overflows: the `minimap` slot, else a copy of a single slotted `<img>`, `<svg>` or `<canvas>`, else a plain
 * rectangle. `view-change` reports every frame of a move and `view-settle` its end, which is where to save the view.
 *
 * @tag c2-pan-zoom
 *
 * @slot - The content, laid out at its natural size. Give it a size: an `<img>` or `<svg>` with `width` and `height`.
 * @slot minimap - Custom minimap content, drawn at the content's aspect ratio.
 * @slot controls - Extra buttons appended to the toolbar.
 *
 * @event {CustomEvent<PanZoomViewDetail>} view-change - `{ x, y, zoom, reason }` once per frame while the view moves. `x` and `y` are the content point at the top-left corner; `reason` is `gesture`, `wheel`, `keyboard`, `controls`, `fit`, `resize` or `api`. Not fired when `view` or `zoom` is set. Does not bubble.
 * @event {CustomEvent<PanZoomViewDetail>} view-settle - The same detail, once when a move and its glide end. Does not bubble.
 *
 * @csspart viewport - The pannable area: the tab stop, with the `group` role.
 * @csspart content - The wrapper the content is laid out in, and moved by the transform.
 * @csspart grid - The dot grid behind the content.
 * @csspart controls - The toolbar container: the zoom buttons and readout, with the `controls` slot's extra buttons placed inside it after them.
 * @csspart button - Each toolbar button.
 * @csspart readout - The zoom percent button.
 * @csspart minimap - The minimap box: it holds the `minimap` slot when one is assigned, else a drawn copy of the content as fallback.
 * @csspart minimap-frame - The viewport rectangle in the minimap.
 * @csspart hint - The hint a plain wheel shows in cooperative mode.
 *
 * @cssproperty {length} [--c2-pan-zoom--width=100%] - Width of the viewport; it is kept even as a flex item, which would otherwise shrink it to nothing.
 * @cssproperty {pixel} [--c2-pan-zoom--height=400px] - Height of the viewport.
 * @cssproperty {background} [--c2-pan-zoom--background=#fafafa]
 * @cssproperty {border} [--c2-pan-zoom--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-pan-zoom--border-radius=8px]
 * @cssproperty {cursor} [--c2-pan-zoom--cursor=grab]
 * @cssproperty {cursor} [--c2-pan-zoom__dragging--cursor=grabbing] - While dragging, and while Space is held.
 * @cssproperty {duration} [--c2-pan-zoom--transition-duration=200ms] - Duration of the moves made by the buttons, the keys and the methods. Gestures never animate.
 * @cssproperty {pixel} [--c2-pan-zoom--fit-padding=24px] - Space a fitted view leaves round the content.
 * @cssproperty {display} [--c2-pan-zoom__grid--display=none] - `block` draws a dot grid that scales with the zoom.
 * @cssproperty {color} [--c2-pan-zoom__grid--color=#d4d4d8]
 * @cssproperty {pixel} [--c2-pan-zoom__grid--gap=20px] - Gap between the dots at 100%.
 * @cssproperty {outline} [--c2-pan-zoom__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the viewport, drawn inside its edge, and of the toolbar buttons.
 * @cssproperty {inset} [--c2-pan-zoom__controls--inset=auto 12px 12px auto] - Where the toolbar sits: the bottom-right corner.
 * @cssproperty {background} [--c2-pan-zoom__controls--background=#ffffff]
 * @cssproperty {border} [--c2-pan-zoom__controls--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-pan-zoom__controls--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-pan-zoom__controls--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {color} [--c2-pan-zoom__controls--color=#18181b] - Icons and the zoom percent.
 * @cssproperty {pixel} [--c2-pan-zoom__controls--font-size=12px]
 * @cssproperty {pixel} [--c2-pan-zoom__button--size=28px]
 * @cssproperty {border-radius} [--c2-pan-zoom__button--border-radius=6px]
 * @cssproperty {background} [--c2-pan-zoom__button__hover--background=#f4f4f5]
 * @cssproperty {opacity} [--c2-pan-zoom__button__disabled--opacity=0.38] - Zoom in and zoom out at the zoom limits.
 * @cssproperty {inset} [--c2-pan-zoom__minimap--inset=auto auto 12px 12px] - Where the minimap sits: the bottom-left corner.
 * @cssproperty {pixel} [--c2-pan-zoom__minimap--width=160px]
 * @cssproperty {pixel} [--c2-pan-zoom__minimap--max-height=120px] - Tall content narrows the minimap to stay within this.
 * @cssproperty {background} [--c2-pan-zoom__minimap--background=#ffffff]
 * @cssproperty {border} [--c2-pan-zoom__minimap--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-pan-zoom__minimap--border-radius=6px]
 * @cssproperty {box-shadow} [--c2-pan-zoom__minimap--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {background} [--c2-pan-zoom__minimap-content--background=#e4e4e7] - The plain rectangle drawn for content the minimap cannot copy.
 * @cssproperty {border} [--c2-pan-zoom__minimap-frame--border=2px solid #0265dc] - The viewport rectangle.
 * @cssproperty {background} [--c2-pan-zoom__minimap-frame--background=rgba(2, 101, 220, 0.2)]
 * @cssproperty {background} [--c2-pan-zoom__hint--background=#18181b]
 * @cssproperty {color} [--c2-pan-zoom__hint--color=#fafafa]
 * @cssproperty {pixel} [--c2-pan-zoom__hint--font-size=14px]
 * @cssproperty {border-radius} [--c2-pan-zoom__hint--border-radius=8px]
 * @cssproperty {background} [--c2-pan-zoom__scrim--background=rgba(9, 9, 11, 0.45)] - Behind the hint.
 */
@customElement('c2-pan-zoom')
export class PanZoom extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Least zoom: a number, or `fit` to stop zooming out at the fitted view (for image previews). */
  @property({ attribute: 'min-zoom', converter: minZoomConverter }) minZoom: number | 'fit' = DEFAULT_MIN_ZOOM

  /** Greatest zoom (1 = 100%). */
  @property({ type: Number, attribute: 'max-zoom' }) maxZoom = DEFAULT_MAX_ZOOM

  /** The factor of one button press or key press. */
  @property({ type: Number, attribute: 'zoom-step' }) zoomStep = DEFAULT_ZOOM_STEP

  /**
   * The first view, and the view `reset()` and the `0` key go back to: `contain` shows the whole content, `cover` fills
   * the box, `width` fits the width and starts at the top, `none` starts at 100% in the centre. A fitted view never
   * zooms past 100%.
   */
  @property({ attribute: 'fit' }) fitMode: PanZoomFit = 'contain'

  /** `content` keeps the content in view (content smaller than the box stays centred); `none` is a free canvas. */
  @property() bounds: PanZoomBounds = 'content'

  /**
   * What the wheel and one finger do. `cooperative`: they scroll the page, and Ctrl/⌘ + wheel, a pinch, two fingers
   * or a mouse drag move the view. `pan`: the wheel pans and Ctrl/⌘ + wheel zooms. `zoom`: the wheel zooms to the
   * pointer (and one finger pans). `none`: no pointer gesture at all, not even Space + drag or a middle-button drag;
   * only the buttons, the keys and the methods move the view.
   */
  @property() gestures: PanZoomGestures = 'cooperative'

  /** Draws the toolbar: zoom out, the zoom percent, zoom in and fit. */
  @property({ type: Boolean }) controls = false

  /** Draws the minimap, which shows while the content overflows. */
  @property({ type: Boolean }) minimap = false

  /** A released drag stops at once instead of gliding. */
  @property({ type: Boolean, attribute: 'no-inertia' }) noInertia = false

  /** A double-click (or double tap) no longer zooms in. */
  @property({ type: Boolean, attribute: 'no-double-click-zoom' }) noDoubleClickZoom = false

  /** The viewport is not a tab stop and has no role; the component around it handles the keys. */
  @property({ type: Boolean, attribute: 'no-keyboard' }) noKeyboard = false

  /** Accessible name of the viewport. */
  @property() label = ''

  /** The current zoom (1 = 100%). Setting it zooms around the centre, without an event. */
  @property({ type: Number, noAccessor: true })
  get zoom(): number {
    return this.current.zoom
  }

  set zoom(value: number) {
    const zoom = Number(value)
    if (!Number.isFinite(zoom) || zoom <= 0) return
    const old = this.current.zoom
    this.stopMotion()
    // A zoom chosen by the page is kept: content that grows later does not refit it.
    this.touched = true
    if (!this.measured) {
      if (this.initial !== 'view') this.initial = 'zoom'
      this.current = { ...this.current, zoom }
    } else {
      this.current = this.constrain(zoomAround(this.current, this.clampZoom(zoom), this.centre()))
    }
    this.requestUpdate('zoom', old)
  }

  /**
   * The view: `{ x, y, zoom }`, where `x` and `y` are the content point at the top-left corner. Setting it (or the
   * `view` attribute, as JSON) moves the view without an event, so a saved view comes back with no jump, even from a
   * server render.
   */
  @property({ attribute: 'view', converter: jsonPropertyConverter, noAccessor: true })
  get view(): PanZoomView {
    return { ...this.current }
  }

  set view(value: PanZoomView | null | undefined) {
    if (!value || ![value.x, value.y, value.zoom].every(Number.isFinite) || value.zoom <= 0) return
    const old = this.view
    this.stopMotion()
    this.touched = true
    if (!this.measured) {
      this.initial = 'view'
      this.current = { x: value.x, y: value.y, zoom: value.zoom }
    } else {
      this.current = this.constrain({ x: value.x, y: value.y, zoom: this.clampZoom(value.zoom) })
    }
    this.requestUpdate('view', old)
  }

  @query('.viewport') private viewportEl!: HTMLElement
  @query('.content') private contentEl!: HTMLElement
  @query('.probe') private probeEl!: HTMLElement
  @query('.art-svg') private artSvgEl?: HTMLElement
  @query('.art canvas') private artCanvasEl?: HTMLCanvasElement

  private readonly msg = new LocalizeController(this, panZoomMessages)

  private current: PanZoomView = { x: 0, y: 0, zoom: 1 }
  /** Where the first view comes from: the fit, the `view` attribute, or the `zoom` attribute (centred). */
  private initial: 'fit' | 'view' | 'zoom' = 'fit'
  /** Sizes known: false on the server and until the first measurement. */
  private measured = false
  /** A resize came during a gesture: measure again when it ends. */
  private remeasure = false
  /** The view was moved since the last fit, so a resize keeps it rather than fitting again. */
  private touched = false
  private viewportSize: PanZoomSize = { width: 0, height: 0 }
  private contentSize: PanZoomSize = { width: 0, height: 0 }
  private padding = 24
  private minimapBox: PanZoomSize = { width: 160, height: 120 }
  private pending: (() => void)[] = []
  private resizeObserver?: ResizeObserver

  private frame = 0
  private reason: PanZoomReason = 'api'
  private changed = false
  private settledZoom = 1
  private animation: Animation | null = null
  private glide: { frame: number } | null = null
  private wheelTimer = 0
  private hintTimer = 0

  private drag: Drag | null = null
  private readonly pointers = new PinchTracker()
  private pinching = false
  private readonly inertia = new InertiaTracker()
  private suppressClick = false
  private lastPointerType = ''
  private lastTap: { x: number; y: number; time: number } | null = null
  private minimapPointer: number | null = null
  private gestureScale = 1

  private dragging = false
  private space = false
  private hint: 'wheel' | 'touch' | null = null
  private announcement = ''
  private art: MinimapArt = 'rect'
  private artSource: Element | null = null
  private artSrc = ''
  private artDrawn: Element | null = null
  /** The minimap element the art was last drawn into. */
  private artHost: Element | null = null
  /** The inherited colours the SVG copy was drawn with, to tell when a theme switch calls for a new copy. */
  private artLook = ''
  private artObserver?: MutationObserver
  private colorScheme?: MediaQueryList
  private focusIndex = 0

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.hasUpdated) return
    this.observe()
    // Disconnecting dropped the minimap's listeners: find the art again, which binds them afresh.
    this.artSource = null
    this.syncArt()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.stopMotion()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    clearTimeout(this.wheelTimer)
    clearTimeout(this.hintTimer)
    this.wheelTimer = 0
    this.hint = null
    this.artSource?.removeEventListener('load', this.handleArtLoad)
    this.artObserver?.disconnect()
    this.colorScheme?.removeEventListener('change', this.handleArtChange)
    this.colorScheme = undefined
  }

  protected override firstUpdated(): void {
    this.observe()
    this.viewportEl.addEventListener('gesturestart', this.handleGestureStart as EventListener)
    this.viewportEl.addEventListener('gesturechange', this.handleGestureChange as EventListener)
    this.viewportEl.addEventListener('gestureend', this.handleGestureEnd as EventListener)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!this.measured) return
    if (changed.has('minZoom') || changed.has('maxZoom') || changed.has('bounds')) {
      const zoom = this.clampZoom(this.current.zoom)
      this.current = this.constrain(zoom === this.current.zoom ? this.current : zoomAround(this.current, zoom, this.centre()))
    }
    if (changed.has('fitMode') && changed.get('fitMode') !== undefined && !this.touched) this.current = this.fitView(this.resolvedFit())
  }

  protected override updated(): void {
    // Drawn again for a new source, and into a new element when the minimap was turned off and on.
    if (this.art === 'svg' && this.artSvgEl && (this.artDrawn !== this.artSource || this.artHost !== this.artSvgEl)) this.drawSvgArt()
    if (this.art === 'canvas' && this.artCanvasEl && (this.artDrawn !== this.artSource || this.artHost !== this.artCanvasEl)) this.drawCanvasArt()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Public methods

  /** Zooms in one `zoom-step`, around the centre. */
  zoomIn(options: PanZoomZoomOptions = {}): void {
    this.stepZoom(this.resolvedStep(), 'api', options)
  }

  /** Zooms out one `zoom-step`, around the centre. */
  zoomOut(options: PanZoomZoomOptions = {}): void {
    this.stepZoom(1 / this.resolvedStep(), 'api', options)
  }

  /** Zooms to `zoom` (held to `min-zoom` / `max-zoom`) around `origin`, the centre by default; animated by default. */
  zoomTo(zoom: number, options: PanZoomZoomOptions = {}): void {
    if (this.defer(() => this.zoomTo(zoom, options))) return
    this.touched = true
    this.zoomToInternal(zoom, 'api', options)
  }

  /** Fits the content: `mode` is `contain`, `cover`, `width` or `none` (the `fit` attribute by default). */
  fit(mode: PanZoomFit = this.resolvedFit(), options: PanZoomMoveOptions = {}): void {
    if (this.defer(() => this.fit(mode, options))) return
    this.applyFit(mode, 'api', options)
  }

  /** Goes back to the first view, the `fit` attribute's. */
  reset(options: PanZoomMoveOptions = {}): void {
    this.fit(this.resolvedFit(), options)
  }

  /** Pans by `dx`, `dy` CSS pixels: positive values show content further right and down. Not animated by default. */
  panBy(dx: number, dy: number, options: PanZoomMoveOptions = {}): void {
    if (this.defer(() => this.panBy(dx, dy, options))) return
    this.touched = true
    this.moveTo(this.constrain(panView(this.base(), dx, dy)), 'api', { animate: options.animate ?? false })
  }

  /** Centres content point `point` (in the content's own pixels), at `options.zoom` when given; animated by default. */
  centerOn(point: PanZoomPoint, options: PanZoomCenterOptions = {}): void {
    if (this.defer(() => this.centerOn(point, options))) return
    this.touched = true
    const zoom = this.clampZoom(options.zoom ?? this.base().zoom)
    this.moveTo(this.constrain(centerView(this.base(), point, this.viewportSize, zoom)), 'api', options)
  }

  /**
   * Frames a part of the content: an element of it, or a rectangle in content pixels. It is fitted with `padding`
   * round it, up to `maxZoom`; animated by default.
   */
  zoomToElement(target: Element | PanZoomRect, options: PanZoomFrameOptions = {}): void {
    if (this.defer(() => this.zoomToElement(target, options))) return
    this.touched = true
    const rect = this.rectOf(target)
    if (!rect) return
    const maxZoom = Math.min(options.maxZoom ?? Infinity, this.resolvedMaxZoom())
    const view = fitRect(rect, this.viewportSize, { padding: options.padding ?? this.padding, maxZoom, minZoom: this.resolvedMinZoom() })
    this.moveTo(this.constrain(view), 'api', options)
  }

  /**
   * Pans the least distance that brings an element of the content, or a rectangle in content pixels, into view with
   * `padding` round it, without zooming; animated by default.
   */
  reveal(target: Element | PanZoomRect, options: PanZoomRevealOptions = {}): void {
    if (this.defer(() => this.reveal(target, options))) return
    // Even when nothing has to move: the caller now owns the view, so growing content must not refit it.
    this.touched = true
    const rect = this.rectOf(target)
    if (!rect) return
    this.revealInternal(rect, 'api', options)
  }

  /** The content point under a pointer position (`clientX`, `clientY`), for dropping things on a board. */
  toContentPoint(clientX: number, clientY: number): PanZoomPoint {
    return contentPointOf(this.current, this.viewportPoint(clientX, clientY))
  }

  // ---------------------------------------------------------------------------------------------------------------
  // View state

  private observe() {
    if (this.resizeObserver || typeof ResizeObserver === 'undefined') return
    this.resizeObserver = new ResizeObserver(() => this.measure())
    this.resizeObserver.observe(this.viewportEl)
    this.resizeObserver.observe(this.contentEl)
  }

  private measure() {
    const viewport = { width: this.viewportEl.clientWidth, height: this.viewportEl.clientHeight }
    if (!viewport.width || !viewport.height) return
    // A resize during a gesture is taken up once the gesture ends, from the sizes the gesture started with.
    if (this.measured && (this.dragging || this.pinching)) {
      this.remeasure = true
      return
    }
    this.remeasure = false
    const content = { width: this.contentEl.offsetWidth, height: this.contentEl.offsetHeight }
    const wasEmpty = !this.contentSize.width || !this.contentSize.height
    const previous = this.viewportSize
    const centre = this.measured ? contentPointOf(this.current, { x: previous.width / 2, y: previous.height / 2 }) : null
    this.viewportSize = viewport
    this.contentSize = content
    this.readTheme()
    if (!this.measured) {
      this.measured = true
      let view: PanZoomView
      if (this.initial === 'fit') view = this.fitView(this.resolvedFit())
      else if (this.initial === 'zoom') {
        const zoom = this.clampZoom(this.current.zoom)
        view = this.constrain(centerView(this.current, { x: content.width / 2, y: content.height / 2 }, viewport, zoom))
      } else view = this.constrain({ ...this.current, zoom: this.clampZoom(this.current.zoom) })
      this.settledZoom = view.zoom
      if (this.initial === 'fit') this.setView(view, 'fit')
      else this.current = view
      this.requestUpdate()
      const pending = this.pending
      this.pending = []
      for (const call of pending) call()
      return
    }
    if (wasEmpty && this.initial === 'zoom' && content.width && content.height) {
      // An image that had not loaded at the first measurement: centre the zoom set in markup on it now.
      this.setView(centerView(this.current, { x: content.width / 2, y: content.height / 2 }, viewport), 'resize')
    } else if (!this.touched) {
      this.stopMotion()
      this.setView(this.fitView(this.resolvedFit()), 'resize')
    } else if (centre) {
      this.setView(this.constrain(centerView(this.current, centre, viewport)), 'resize')
    }
    this.requestUpdate()
  }

  /** Reads what the theme sets in CSS: the fit padding and the minimap's size, resolved by the browser. */
  private readTheme() {
    const style = getComputedStyle(this.probeEl)
    const number = (value: string, fallback: number) => (Number.isFinite(parseFloat(value)) ? parseFloat(value) : fallback)
    this.padding = number(style.paddingTop, 24)
    this.minimapBox = { width: number(style.width, 160), height: number(style.height, 120) }
  }

  /** Duration of animated moves in milliseconds, from `--c2-pan-zoom--transition-duration`. */
  private duration() {
    const value = getComputedStyle(this.contentEl).transitionDuration.split(',')[0].trim()
    const amount = parseFloat(value)
    if (!Number.isFinite(amount)) return 200
    return value.endsWith('ms') ? amount : amount * 1000
  }

  /** Runs `call` once the first measurement is made; true when it had to wait. */
  private defer(call: () => void) {
    if (this.measured) return false
    this.pending.push(call)
    return true
  }

  private contentRect(): PanZoomRect {
    return { x: 0, y: 0, ...this.contentSize }
  }

  private centre(): PanZoomPoint {
    return { x: this.viewportSize.width / 2, y: this.viewportSize.height / 2 }
  }

  private resolvedFit(): PanZoomFit {
    return FIT_MODES.includes(this.fitMode) ? this.fitMode : 'contain'
  }

  private resolvedGestures(): PanZoomGestures {
    return GESTURES.includes(this.gestures) ? this.gestures : 'cooperative'
  }

  private resolvedStep() {
    const step = Number(this.zoomStep)
    return Number.isFinite(step) && step > 1 ? step : DEFAULT_ZOOM_STEP
  }

  private resolvedMaxZoom() {
    const max = Number(this.maxZoom)
    return Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_ZOOM
  }

  private resolvedMinZoom() {
    const max = this.resolvedMaxZoom()
    if (this.minZoom === 'fit') {
      if (!this.measured) return Math.min(DEFAULT_MIN_ZOOM, max)
      return Math.min(1, max, fitZoom(this.contentSize, this.viewportSize, 'contain', this.padding))
    }
    const min = Number(this.minZoom)
    return Math.min(Number.isFinite(min) && min > 0 ? min : DEFAULT_MIN_ZOOM, max)
  }

  private clampZoom(zoom: number) {
    return clampZoom(zoom, this.resolvedMinZoom(), this.resolvedMaxZoom())
  }

  private constrain(view: PanZoomView): PanZoomView {
    const next = { ...view, zoom: this.clampZoom(view.zoom) }
    if (this.bounds === 'none' || !this.measured || !this.contentSize.width || !this.contentSize.height) return next
    return clampView(next, this.contentRect(), this.viewportSize, this.padding)
  }

  private fitView(mode: PanZoomFit): PanZoomView {
    const view = fitRect(this.contentRect(), this.viewportSize, {
      mode,
      padding: this.padding,
      maxZoom: Math.min(1, this.resolvedMaxZoom()),
      minZoom: this.resolvedMinZoom(),
    })
    return this.constrain(view)
  }

  /** The view an incremental move starts from: the end of the running animation, else the current view. */
  private base(): PanZoomView {
    return this.animation ? { ...this.animation.target } : { ...this.current }
  }

  /** Sets the view, and reports it once per frame. `raw` skips the limits (an animation's steps are already held). */
  private setView(next: PanZoomView, reason: PanZoomReason, raw = false) {
    const view = raw ? next : this.constrain(next)
    const same = sameView(view, this.current)
    this.current = view
    this.requestUpdate()
    // Less than a hundredth of a pixel: not a move to report.
    if (same) return
    this.reason = reason
    this.changed = true
    this.requestUpdate()
    if (!this.frame && typeof requestAnimationFrame === 'function') this.frame = requestAnimationFrame(this.flush)
  }

  private flush = () => {
    this.frame = 0
    this.dispatchEvent(new CustomEvent<PanZoomViewDetail>('view-change', { detail: { ...this.current, reason: this.reason } }))
    this.maybeSettle()
  }

  /** Fires `view-settle` once nothing moves the view any more. */
  private maybeSettle() {
    if (this.frame || this.drag?.moved || this.pinching || this.animation || this.glide || this.wheelTimer || this.minimapPointer !== null) return
    if (!this.changed) return
    this.changed = false
    this.dispatchEvent(new CustomEvent<PanZoomViewDetail>('view-settle', { detail: { ...this.current, reason: this.reason } }))
    if (Math.abs(this.current.zoom - this.settledZoom) > 1e-4) this.announce(this.msg.t('zoomed', this.percent(this.current.zoom)))
    this.settledZoom = this.current.zoom
    // A canvas redraws; an SVG copy only when its colours may have changed with the theme.
    if (this.art === 'canvas') this.drawCanvasArt()
    if (this.art === 'svg' && this.minimap && this.artLook !== this.lookOf(this.artSource)) this.drawSvgArt()
  }

  private announce(text: string) {
    // Cleared first so the same text is read again.
    this.announcement = ''
    this.requestUpdate()
    requestAnimationFrame(() => {
      this.announcement = text
      this.requestUpdate()
    })
  }

  /** Moves to `target`, eased unless `animate` is false or the user prefers reduced motion. */
  private moveTo(target: PanZoomView, reason: PanZoomReason, options: PanZoomZoomOptions = {}) {
    this.stopMotion()
    const duration = options.animate === false || prefersReducedMotion() ? 0 : this.duration()
    if (duration <= 0 || sameView(target, this.current)) {
      this.setView(target, reason, true)
      this.maybeSettle()
      return
    }
    const from = { ...this.current }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      this.setView(t >= 1 ? target : interpolateView(from, target, easeOutCubic(t), this.viewportSize, options.origin), reason, true)
      if (t < 1) {
        if (this.animation) this.animation.frame = requestAnimationFrame(step)
        return
      }
      this.animation = null
      this.maybeSettle()
    }
    this.animation = { frame: requestAnimationFrame(step), target }
  }

  private stopMotion() {
    if (this.animation) cancelAnimationFrame(this.animation.frame)
    if (this.glide) cancelAnimationFrame(this.glide.frame)
    this.animation = null
    this.glide = null
  }

  private zoomToInternal(zoom: number, reason: PanZoomReason, options: PanZoomZoomOptions = {}) {
    const value = Number(zoom)
    if (!Number.isFinite(value) || value <= 0) return
    this.touched = true
    const origin = options.origin ?? this.centre()
    this.moveTo(this.constrain(zoomAround(this.base(), this.clampZoom(value), origin)), reason, { ...options, origin })
  }

  private stepZoom(factor: number, reason: PanZoomReason, options: PanZoomZoomOptions = {}) {
    if (this.defer(() => this.stepZoom(factor, reason, options))) return
    this.zoomToInternal(this.base().zoom * factor, reason, options)
  }

  private applyFit(mode: PanZoomFit, reason: PanZoomReason, options: PanZoomMoveOptions = {}) {
    this.moveTo(this.fitView(FIT_MODES.includes(mode) ? mode : 'contain'), reason, options)
    this.touched = false
  }

  private revealInternal(rect: PanZoomRect, reason: PanZoomReason, options: PanZoomRevealOptions = {}) {
    this.touched = true
    const next = this.constrain(revealRect(this.base(), rect, this.viewportSize, options.padding ?? this.padding))
    if (sameView(next, this.base())) return
    this.moveTo(next, reason, options)
  }

  /** An element's box in content pixels (from the view the DOM shows), or a rectangle passed through. */
  private rectOf(target: Element | PanZoomRect): PanZoomRect | null {
    if (!(target instanceof Element)) {
      const { x, y, width, height } = target
      return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null
    }
    // Measured against the content wrapper as drawn, so it holds whatever the DOM shows: a render still pending, the
    // centred layout before the first measurement, or a scroll the browser made to show a focused element.
    const box = target.getBoundingClientRect()
    const content = this.contentEl.getBoundingClientRect()
    const scale = this.contentEl.offsetWidth ? content.width / this.contentEl.offsetWidth : this.current.zoom
    if (!scale) return null
    return { x: (box.left - content.left) / scale, y: (box.top - content.top) / scale, width: box.width / scale, height: box.height / scale }
  }

  private viewportPoint(clientX: number, clientY: number): PanZoomPoint {
    const rect = this.viewportEl?.getBoundingClientRect()
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY }
  }

  /** A scroll the browser made to show a focused element becomes part of the view. */
  private foldScroll() {
    const viewport = this.viewportEl
    const { scrollLeft, scrollTop } = viewport
    if (!scrollLeft && !scrollTop) return
    viewport.scrollLeft = 0
    viewport.scrollTop = 0
    this.current = panView(this.current, scrollLeft, scrollTop)
    this.requestUpdate()
  }

  private percent(zoom: number) {
    return new Intl.NumberFormat(this.msg.locale, { style: 'percent', maximumFractionDigits: 0 }).format(zoom)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Pointer

  private fromInteractive(event: Event) {
    for (const target of event.composedPath()) {
      if (target === this.viewportEl) return false
      if (target instanceof Element && target.matches(INTERACTIVE)) return true
    }
    return false
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.lastPointerType = event.pointerType
    this.suppressClick = false
    const gestures = this.resolvedGestures()
    if (gestures === 'none' || !this.measured || event.defaultPrevented) return
    const forced = this.space || event.button === 1
    if (event.pointerType !== 'touch') {
      if (event.button !== 0 && event.button !== 1) return
      if (!forced && this.fromInteractive(event)) return
      // A middle button would start the browser's autoscroll; Space + drag would select text.
      if (forced) event.preventDefault()
      this.startDrag(event)
      return
    }
    if (!this.pointers.count && !forced && this.fromInteractive(event)) return
    this.pointers.down(event.pointerId, event.clientX, event.clientY)
    this.capture(event.pointerId)
    if (this.pointers.count === 2) {
      this.stopMotion()
      this.drag = null
      this.dragging = false
      this.pinching = true
      this.hideHint()
      this.requestUpdate()
    } else if (this.pointers.count === 1 && gestures !== 'cooperative') {
      this.startDrag(event)
    }
  }

  private startDrag(event: PointerEvent) {
    this.stopMotion()
    this.drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view: this.current,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    }
    this.inertia.reset()
    this.inertia.add(event.clientX, event.clientY, event.timeStamp)
  }

  private capture(id: number) {
    try {
      this.viewportEl.setPointerCapture(id)
    } catch {
      // A synthetic pointer, or one already released.
    }
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (this.pointers.has(event.pointerId)) {
      const step = this.pointers.move(event.pointerId, event.clientX, event.clientY)
      if (step && this.pinching) {
        this.touched = true
        const from = this.viewportPoint(step.from.x, step.from.y)
        const to = this.viewportPoint(step.to.x, step.to.y)
        this.setView(pinchView(this.current, { factor: step.factor, from, to }, this.resolvedMinZoom(), this.resolvedMaxZoom()), 'gesture')
        return
      }
    }
    const drag = this.drag
    if (!drag || drag.id !== event.pointerId) return
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return
      drag.moved = true
      // The baseline is the view as the drag takes over, so a change before the threshold (a resize, a method call) is
      // kept; the pointer's travel still counts from where it went down.
      drag.view = this.current
      this.dragging = true
      this.capture(event.pointerId)
      this.hideHint()
      this.requestUpdate()
    }
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    this.inertia.add(event.clientX, event.clientY, event.timeStamp)
    this.touched = true
    this.setView(panView(drag.view, -(event.clientX - drag.startX), -(event.clientY - drag.startY)), 'gesture')
  }

  private handlePointerUp = (event: PointerEvent) => {
    const cancelled = event.type === 'pointercancel'
    const gestures = this.resolvedGestures()
    if (this.pointers.has(event.pointerId)) {
      const wasPinching = this.pinching
      const alone = this.pointers.count === 1
      this.pointers.up(event.pointerId)
      // The browser took a one-finger swipe to scroll the page: say how to move the view instead.
      if (cancelled && alone && !wasPinching && gestures === 'cooperative') this.showHint('touch')
      if (wasPinching && this.pointers.count < 2) {
        this.pinching = false
        // The finger left down goes on panning, from where it is.
        const [rest] = this.pointers.ids
        const at = this.pointers.center()
        if (rest !== undefined && at && gestures !== 'cooperative') {
          this.drag = { id: rest, startX: at.x, startY: at.y, view: this.current, lastX: at.x, lastY: at.y, moved: true }
          this.inertia.reset()
        }
      }
    }
    const drag = this.drag
    if (drag && drag.id === event.pointerId) {
      this.drag = null
      this.dragging = false
      this.requestUpdate()
      if (drag.moved) {
        this.suppressClick = !cancelled
        if (!cancelled) this.startGlide(event.timeStamp)
      } else if (event.pointerType === 'touch' && !cancelled) {
        this.handleTap(event)
      }
    } else if (event.pointerType === 'touch' && !cancelled && !this.pinching && !this.pointers.count) {
      this.handleTap(event)
    }
    if (!this.pointers.count) this.pinching = false
    if (this.remeasure && !this.dragging && !this.pinching) this.measure()
    this.maybeSettle()
  }

  private handleTap(event: PointerEvent) {
    const now = event.timeStamp
    const last = this.lastTap
    if (last && now - last.time < 300 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 24) {
      this.lastTap = null
      this.doubleClickZoom(event)
      return
    }
    this.lastTap = { x: event.clientX, y: event.clientY, time: now }
  }

  private startGlide(time: number) {
    if (this.noInertia || prefersReducedMotion()) return
    const velocity = this.inertia.velocity(time)
    if (Math.hypot(velocity.x, velocity.y) < GLIDE_MIN_SPEED) return
    const glide = new Glide({ x: -velocity.x, y: -velocity.y })
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.max(0, now - last)
      last = now
      const delta = glide.step(dt)
      const wanted = panView(this.current, delta.x, delta.y)
      const view = this.constrain(wanted)
      // At a bound the glide stops along that axis.
      if (Math.abs(view.x - wanted.x) > 1e-6) glide.stopX()
      if (Math.abs(view.y - wanted.y) > 1e-6) glide.stopY()
      this.setView(view, 'gesture', true)
      if (glide.done) {
        this.glide = null
        this.maybeSettle()
        return
      }
      if (this.glide) this.glide.frame = requestAnimationFrame(step)
    }
    this.glide = { frame: requestAnimationFrame(step) }
  }

  private handleClick = (event: MouseEvent) => {
    if (!this.suppressClick) return
    // The click that ends a drag is not a click on the content.
    this.suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  private handleDoubleClick = (event: MouseEvent) => {
    if (this.lastPointerType === 'touch') return
    this.doubleClickZoom(event)
  }

  private doubleClickZoom(event: MouseEvent | PointerEvent) {
    if (this.noDoubleClickZoom || this.resolvedGestures() === 'none' || !this.measured || this.fromInteractive(event)) return
    const factor = event.shiftKey ? 1 / this.resolvedStep() : this.resolvedStep()
    this.zoomToInternal(this.base().zoom * factor, 'gesture', { origin: this.viewportPoint(event.clientX, event.clientY) })
  }

  private handleDragStart = (event: DragEvent) => {
    // A slotted image would otherwise be dragged out instead of panned.
    if (!this.fromInteractive(event)) event.preventDefault()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Wheel and trackpad

  private handleWheel = (event: WheelEvent) => {
    const gestures = this.resolvedGestures()
    if (gestures === 'none' || !this.measured) return
    const mod = event.ctrlKey || event.metaKey
    if (!mod && gestures === 'cooperative') {
      this.showHint('wheel')
      return
    }
    event.preventDefault()
    this.stopMotion()
    this.touched = true
    const page = this.viewportSize.height
    if (mod || gestures === 'zoom') {
      const delta = wheelPixels(event.deltaY || (event.shiftKey ? event.deltaX : 0), event.deltaMode, page)
      const zoom = this.clampZoom(this.current.zoom * wheelZoomFactor(delta))
      this.setView(zoomAround(this.current, zoom, this.viewportPoint(event.clientX, event.clientY)), 'wheel')
    } else {
      let dx = wheelPixels(event.deltaX, event.deltaMode, this.viewportSize.width)
      let dy = wheelPixels(event.deltaY, event.deltaMode, page)
      if (event.shiftKey && !dx) [dx, dy] = [dy, 0]
      this.setView(panView(this.current, dx, dy), 'wheel')
    }
    this.hideHint()
    clearTimeout(this.wheelTimer)
    this.wheelTimer = window.setTimeout(() => {
      this.wheelTimer = 0
      this.maybeSettle()
    }, WHEEL_SETTLE)
  }

  /** Safari's trackpad pinch, which it reports as gesture events rather than Ctrl + wheel. */
  private handleGestureStart = (event: Event & { scale?: number }) => {
    if (this.resolvedGestures() === 'none') return
    event.preventDefault()
    this.gestureScale = event.scale ?? 1
  }

  private handleGestureChange = (event: Event & { scale?: number; clientX?: number; clientY?: number }) => {
    if (this.resolvedGestures() === 'none' || !this.measured) return
    event.preventDefault()
    const scale = event.scale ?? 1
    const factor = scale / (this.gestureScale || 1)
    this.gestureScale = scale
    this.touched = true
    const origin = event.clientX === undefined ? this.centre() : this.viewportPoint(event.clientX, event.clientY ?? 0)
    this.setView(zoomAround(this.current, this.clampZoom(this.current.zoom * factor), origin), 'gesture')
  }

  private handleGestureEnd = (event: Event) => {
    if (this.resolvedGestures() !== 'none') event.preventDefault()
    this.gestureScale = 1
    this.maybeSettle()
  }

  private showHint(kind: 'wheel' | 'touch') {
    this.hint = kind
    this.requestUpdate()
    clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => this.hideHint(), HINT_DURATION)
  }

  private hideHint() {
    if (!this.hint) return
    clearTimeout(this.hintTimer)
    this.hint = null
    this.requestUpdate()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Keyboard and focus

  private handleKeyDown = (event: KeyboardEvent) => {
    if (this.noKeyboard || !this.measured) return
    // Keys pressed inside the content (a field on a board) are left to it.
    if (event.composedPath()[0] !== this.viewportEl) return
    if (event.key === ' ') {
      if (!this.space && this.resolvedGestures() !== 'none') {
        this.space = true
        this.requestUpdate()
      }
      event.preventDefault()
      return
    }
    const action = panZoomKeyAction(event, this.viewportSize)
    if (!action) return
    event.preventDefault()
    switch (action.type) {
      case 'pan':
        this.touched = true
        this.moveTo(this.constrain(panView(this.base(), action.dx, action.dy)), 'keyboard')
        return
      case 'zoom-in':
        this.stepZoom(this.resolvedStep(), 'keyboard')
        return
      case 'zoom-out':
        this.stepZoom(1 / this.resolvedStep(), 'keyboard')
        return
      case 'fit':
        this.applyFit(this.resolvedFit(), 'keyboard')
        return
      case 'actual-size':
        this.zoomToInternal(1, 'keyboard')
    }
  }

  private handleKeyUp = (event: KeyboardEvent) => {
    if (event.key !== ' ' || !this.space) return
    this.space = false
    this.requestUpdate()
  }

  private handleFocusOut = () => {
    if (!this.space) return
    this.space = false
    this.requestUpdate()
  }

  /** Focus moving to an element of the content that is out of view pans it into view. */
  private handleFocusIn = (event: FocusEvent) => {
    const target = event.composedPath()[0]
    if (!(target instanceof Element) || target === this.viewportEl || !this.measured) return
    const rect = this.rectOf(target)
    this.foldScroll()
    if (rect) this.revealInternal(rect, 'keyboard')
  }

  private handleScroll = () => this.foldScroll()

  // ---------------------------------------------------------------------------------------------------------------
  // Toolbar

  private handleControlsKeyDown = (event: KeyboardEvent) => {
    const buttons = [...(this.renderRoot as ShadowRoot).querySelectorAll<HTMLElement>('.controls > .button')]
    const index = buttons.indexOf(event.composedPath()[0] as HTMLElement)
    if (index < 0) return
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % buttons.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + buttons.length) % buttons.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : -1
    if (next < 0) return
    event.preventDefault()
    this.focusIndex = next
    this.requestUpdate()
    buttons[next].focus()
  }

  private handleControlsFocusIn = (event: FocusEvent) => {
    const buttons = [...(this.renderRoot as ShadowRoot).querySelectorAll<HTMLElement>('.controls > .button')]
    const index = buttons.indexOf(event.composedPath()[0] as HTMLElement)
    if (index >= 0 && index !== this.focusIndex) {
      this.focusIndex = index
      this.requestUpdate()
    }
  }

  private controlZoom(factor: number, atLimit: boolean) {
    if (atLimit) return
    this.stepZoom(factor, 'controls')
  }

  private handleExtraSlotChange = (event: Event) => {
    const slot = event.target as HTMLSlotElement
    slot.parentElement?.classList.toggle('filled', slot.assignedElements().length > 0)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Minimap

  private handleSlotChange = () => this.syncArt()

  /** Chooses what the minimap draws: its slot, a copy of a single image, SVG or canvas, else a rectangle. */
  private syncArt() {
    let art: MinimapArt = 'rect'
    let source: Element | null = null
    if ([...this.children].some((child) => child.getAttribute('slot') === 'minimap')) art = 'slot'
    else {
      const slot = this.renderRoot.querySelector<HTMLSlotElement>('.content > slot')
      const elements = slot?.assignedElements({ flatten: true }) ?? []
      let only = elements.length === 1 ? elements[0] : null
      // A wrapper that draws no box of its own (a framework's `display: contents` element round the content) is
      // looked through, down to its single child.
      while (only && only.childElementCount === 1 && !['img', 'svg', 'canvas'].includes(only.localName) && getComputedStyle(only).display === 'contents') {
        only = only.firstElementChild
      }
      if (only?.localName === 'img') art = 'img'
      else if (only?.localName === 'svg') art = 'svg'
      else if (only?.localName === 'canvas') art = 'canvas'
      if (art !== 'rect') source = only
    }
    if (source !== this.artSource) {
      this.artSource?.removeEventListener('load', this.handleArtLoad)
      this.artObserver?.disconnect()
      this.artSource = source
      this.artDrawn = null
      if (art === 'svg' && source && typeof MutationObserver !== 'undefined') {
        // An SVG copy is redrawn when the SVG changes, and when the colour scheme does; not on every move.
        this.artObserver ??= new MutationObserver(this.handleArtChange)
        this.artObserver.observe(source, { subtree: true, childList: true, attributes: true, characterData: true })
        if (!this.colorScheme && typeof matchMedia === 'function') {
          this.colorScheme = matchMedia('(prefers-color-scheme: dark)')
          this.colorScheme.addEventListener('change', this.handleArtChange)
        }
      }
      if (art === 'img') source?.addEventListener('load', this.handleArtLoad)
    }
    const src = art === 'img' ? (source as HTMLImageElement).currentSrc || (source as HTMLImageElement).src : ''
    if (art !== this.art || src !== this.artSrc) {
      this.art = art
      this.artSrc = src
    }
    this.requestUpdate()
  }

  private handleArtLoad = () => this.syncArt()

  private handleArtChange = () => {
    this.artDrawn = null
    this.requestUpdate()
  }

  /** The inherited colours an SVG is painted with: a cheap sign that the theme changed. */
  private lookOf(element: Element | null) {
    if (!element) return ''
    const style = getComputedStyle(element)
    return `${style.color}|${style.colorScheme}`
  }

  /** Copies the slotted SVG, without anything that could run or define elements. */
  private drawSvgArt() {
    const source = this.artSource as SVGSVGElement | null
    const host = this.artSvgEl
    if (!source || !host) return
    const copy = source.cloneNode(true) as SVGSVGElement
    // The copy lives in this shadow root, out of reach of the page's styles: carry the painted look over with it.
    const originals = [source, ...source.querySelectorAll('*')]
    const copies = [copy, ...copy.querySelectorAll('*')]
    originals.forEach((original, index) => {
      const style = getComputedStyle(original)
      const target = copies[index] as SVGElement
      for (const name of PAINT_PROPERTIES) target.style.setProperty(name, style.getPropertyValue(name))
    })
    for (const element of copies) {
      if (element.localName === 'foreignObject' || element.localName === 'script' || element.localName.includes('-')) element.remove()
    }
    copy.removeAttribute('id')
    if (!copy.hasAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${this.contentSize.width || 300} ${this.contentSize.height || 150}`)
    copy.setAttribute('width', '100%')
    copy.setAttribute('height', '100%')
    copy.setAttribute('aria-hidden', 'true')
    copy.setAttribute('focusable', 'false')
    host.replaceChildren(copy)
    this.artDrawn = source
    this.artHost = host
    this.artLook = this.lookOf(source)
  }

  /** Copies the slotted canvas; done again each time the view settles. */
  private drawCanvasArt() {
    const source = this.artSource as HTMLCanvasElement | null
    const canvas = this.artCanvasEl
    if (!source || !canvas) return
    const ratio = window.devicePixelRatio || 1
    const { width, height } = this.minimapSize()
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    try {
      canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
    } catch {
      // A canvas tainted by another origin's image cannot be read.
    }
    this.artDrawn = source
    this.artHost = canvas
  }

  private minimapSize(): PanZoomSize {
    const { width, height } = this.contentSize
    const box = this.minimapBox
    if (!width || !height) return box
    const scale = Math.min(box.width / width, box.height / height)
    return { width: Math.round(width * scale), height: Math.round(height * scale) }
  }

  private moveFromMinimap(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const x = ((event.clientX - rect.left - target.clientLeft) / target.clientWidth) * this.contentSize.width
    const y = ((event.clientY - rect.top - target.clientTop) / target.clientHeight) * this.contentSize.height
    this.touched = true
    this.setView(centerView(this.current, { x, y }, this.viewportSize), 'gesture')
  }

  private handleMinimapDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    this.stopMotion()
    this.minimapPointer = event.pointerId
    try {
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    } catch {
      // A synthetic pointer.
    }
    this.moveFromMinimap(event)
  }

  private handleMinimapMove = (event: PointerEvent) => {
    if (this.minimapPointer === event.pointerId) this.moveFromMinimap(event)
  }

  private handleMinimapUp = (event: PointerEvent) => {
    if (this.minimapPointer !== event.pointerId) return
    this.minimapPointer = null
    this.maybeSettle()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Render

  override render() {
    const view = this.current
    const keyboard = !this.noKeyboard
    const gestures = this.resolvedGestures()
    let contentStyle = `transform: ${viewTransform(view)}`
    if (!this.measured && this.initial !== 'view') {
      // The server cannot measure: the content shows at its natural size (or the zoom set in markup), centred.
      contentStyle = `left: 50%; top: 50%; transform: ${this.initial === 'zoom' ? `scale(${view.zoom}) ` : ''}translate(-50%, -50%)`
    }
    const tx = this.measured || this.initial === 'view' ? -view.x * view.zoom : 0
    const ty = this.measured || this.initial === 'view' ? -view.y * view.zoom : 0
    const hintText =
      this.hint === 'wheel' ? this.msg.t('wheelHint', isApplePlatform() ? '⌘' : this.msg.t('ctrlKey')) : this.hint === 'touch' ? this.msg.t('touchHint') : ''
    return html`
      <div class="box">
        <div
          class=${classMap({ viewport: true, [`gestures-${gestures}`]: true, dragging: this.dragging, space: this.space })}
          part="viewport"
          tabindex=${keyboard ? 0 : nothing}
          role=${keyboard ? 'group' : nothing}
          aria-roledescription=${keyboard ? this.msg.t('roleDescription') : nothing}
          aria-label=${keyboard && this.label ? this.label : nothing}
          aria-describedby=${keyboard ? 'key-help' : nothing}
          style=${`--_zoom: ${view.zoom}; --_tx: ${tx}px; --_ty: ${ty}px`}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerUp}
          @click=${{ handleEvent: this.handleClick, capture: true }}
          @dblclick=${this.handleDoubleClick}
          @dragstart=${this.handleDragStart}
          @wheel=${this.handleWheel}
          @keydown=${this.handleKeyDown}
          @keyup=${this.handleKeyUp}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
          @scroll=${this.handleScroll}
        >
          <div class="grid" part="grid"></div>
          <div class="content" part="content" style=${contentStyle}><slot @slotchange=${this.handleSlotChange}></slot></div>
        </div>
        ${this.minimap ? this.renderMinimap() : nothing} ${this.controls ? this.renderControls() : nothing}
        <div class=${classMap({ hint: true, shown: !!this.hint })} part="hint" aria-hidden="true"><span class="hint-text">${hintText}</span></div>
        ${keyboard ? html`<span id="key-help" hidden>${this.msg.t('keyHelp')}</span>` : nothing}
        <span class="visually-hidden" role="status">${this.announcement}</span>
        <span class="probe" aria-hidden="true"></span>
      </div>
    `
  }

  private renderControls() {
    const zoom = this.current.zoom
    const atMax = zoom >= this.resolvedMaxZoom() - 1e-4
    const atMin = zoom <= this.resolvedMinZoom() + 1e-4
    const percent = this.percent(zoom)
    const tab = (index: number) => (index === this.focusIndex ? 0 : -1)
    const zoomOut = this.msg.t('zoomOut')
    const zoomIn = this.msg.t('zoomIn')
    const fit = this.msg.t('fitView')
    return html`
      <div
        class="controls"
        part="controls"
        role="toolbar"
        aria-label=${this.msg.t('controls')}
        @keydown=${this.handleControlsKeyDown}
        @focusin=${this.handleControlsFocusIn}
      >
        <button
          type="button"
          class="button"
          part="button"
          tabindex=${tab(0)}
          aria-label=${zoomOut}
          title=${zoomOut}
          aria-disabled=${atMin ? 'true' : nothing}
          @click=${() => this.controlZoom(1 / this.resolvedStep(), atMin)}
        >
          ${icon(iconMinus)}
        </button>
        <button
          type="button"
          class="button readout"
          part="button readout"
          tabindex=${tab(1)}
          aria-label=${this.msg.t('resetZoom', percent, this.percent(1))}
          @click=${() => this.zoomToInternal(1, 'controls')}
        >
          ${percent}
        </button>
        <button
          type="button"
          class="button"
          part="button"
          tabindex=${tab(2)}
          aria-label=${zoomIn}
          title=${zoomIn}
          aria-disabled=${atMax ? 'true' : nothing}
          @click=${() => this.controlZoom(this.resolvedStep(), atMax)}
        >
          ${icon(iconPlus)}
        </button>
        <span class="separator" aria-hidden="true"></span>
        <button
          type="button"
          class="button"
          part="button"
          tabindex=${tab(3)}
          aria-label=${fit}
          title=${fit}
          @click=${() => this.applyFit(this.resolvedFit(), 'controls')}
        >
          ${icon(iconFit)}
        </button>
        <span class="extra"><slot name="controls" @slotchange=${this.handleExtraSlotChange}></slot></span>
      </div>
    `
  }

  private renderMinimap() {
    if (!this.measured || !this.contentSize.width || !this.contentSize.height) return nothing
    const { width, height } = this.contentSize
    const view = this.current
    const visible = { width: this.viewportSize.width / view.zoom, height: this.viewportSize.height / view.zoom }
    const overflows = width > visible.width + 0.5 || height > visible.height + 0.5
    const size = this.minimapSize()
    const percent = (value: number, of: number) => `${(value / of) * 100}%`
    const frame = `left: ${percent(view.x, width)}; top: ${percent(view.y, height)}; width: ${percent(visible.width, width)}; height: ${percent(visible.height, height)}`
    const art =
      this.art === 'slot'
        ? html`<slot name="minimap"></slot>`
        : this.art === 'img'
          ? html`<img src=${this.artSrc} alt="" draggable="false" />`
          : this.art === 'svg'
            ? html`<div class="art-svg"></div>`
            : this.art === 'canvas'
              ? html`<canvas></canvas>`
              : html`<div class="art-rect"></div>`
    return html`
      <div
        class=${classMap({ minimap: true, shown: overflows })}
        part="minimap"
        aria-hidden="true"
        style=${`width: ${size.width}px; height: ${size.height}px`}
        @pointerdown=${this.handleMinimapDown}
        @pointermove=${this.handleMinimapMove}
        @pointerup=${this.handleMinimapUp}
        @pointercancel=${this.handleMinimapUp}
      >
        <div class="art">${art}</div>
        <div class="frame" part="minimap-frame" style=${frame}></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-pan-zoom': PanZoom
  }
}
