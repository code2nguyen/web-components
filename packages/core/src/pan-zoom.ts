/**
 * View math for a surface that pans and zooms (`c2-pan-zoom`, and the canvases built on it): zooming around a point,
 * fitting a rectangle, keeping content in view, revealing a part of it, easing between two views, the keys that move
 * a view, and two small trackers for the pointer: the velocity of a drag (for inertia) and a two-finger pinch.
 *
 * A view is `{ x, y, zoom }`: `x` and `y` are the content point drawn at the top-left corner of the viewport, and
 * `zoom` the scale (1 = 100%). A content point `p` is drawn at `(p - x) * zoom` in the viewport, so the content is
 * moved with `transform: translate(-x * zoom, -y * zoom) scale(zoom)` and `transform-origin: 0 0`. Viewport points are
 * CSS pixels from the viewport's top-left corner; content points are the content's own, unscaled pixels.
 *
 * Every function is pure and DOM-free, except `prefersReducedMotion()`, which reads a media query.
 */

/** What the viewport shows: the content point at its top-left corner, and the scale. */
export interface PanZoomView {
  x: number
  y: number
  zoom: number
}

export interface PanZoomPoint {
  x: number
  y: number
}

export interface PanZoomSize {
  width: number
  height: number
}

export interface PanZoomRect extends PanZoomPoint, PanZoomSize {}

/**
 * How a view fits a rectangle: `contain` shows all of it, `cover` fills the viewport with it, `width` fits its width
 * and starts at its top, `none` shows it at 100%, centred.
 */
export type PanZoomFit = 'contain' | 'cover' | 'width' | 'none'

/** Holds `value` to `[min, max]`. */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/** Holds a zoom to `[min, max]`; a `min` above `max` gives `max`. */
export function clampZoom(zoom: number, min: number, max: number): number {
  return clamp(zoom, Math.min(min, max), max)
}

/** The content point drawn at viewport point `point`. */
export function toContentPoint(view: PanZoomView, point: PanZoomPoint): PanZoomPoint {
  return { x: view.x + point.x / view.zoom, y: view.y + point.y / view.zoom }
}

/** The viewport point where content point `point` is drawn. */
export function toViewportPoint(view: PanZoomView, point: PanZoomPoint): PanZoomPoint {
  return { x: (point.x - view.x) * view.zoom, y: (point.y - view.y) * view.zoom }
}

/** The CSS transform that draws the content for `view` (with `transform-origin: 0 0`). */
export function viewTransform(view: PanZoomView): string {
  return `translate(${-view.x * view.zoom}px, ${-view.y * view.zoom}px) scale(${view.zoom})`
}

/** The view at `zoom` that keeps the content under viewport point `origin` where it is. */
export function zoomAround(view: PanZoomView, zoom: number, origin: PanZoomPoint): PanZoomView {
  const anchor = toContentPoint(view, origin)
  return { x: anchor.x - origin.x / zoom, y: anchor.y - origin.y / zoom, zoom }
}

/** The view moved by `dx`, `dy` viewport pixels: positive values show content further right and down. */
export function panBy(view: PanZoomView, dx: number, dy: number): PanZoomView {
  return { x: view.x + dx / view.zoom, y: view.y + dy / view.zoom, zoom: view.zoom }
}

/** The view at `zoom` (the current one by default) with content point `point` in the middle of the viewport. */
export function centerOn(view: PanZoomView, point: PanZoomPoint, viewport: PanZoomSize, zoom = view.zoom): PanZoomView {
  return { x: point.x - viewport.width / 2 / zoom, y: point.y - viewport.height / 2 / zoom, zoom }
}

/** The visible part of the content, in content points. */
export function visibleRect(view: PanZoomView, viewport: PanZoomSize): PanZoomRect {
  return { x: view.x, y: view.y, width: viewport.width / view.zoom, height: viewport.height / view.zoom }
}

export interface FitOptions {
  /** `contain` (default), `cover`, `width` or `none`. */
  mode?: PanZoomFit
  /** Viewport pixels left round the rectangle (not used by `cover`). Default 0. */
  padding?: number
  /** Highest zoom the fit may choose. Default 1, so a small image is never blown up. */
  maxZoom?: number
  /** Lowest zoom the fit may choose. Default 0. */
  minZoom?: number
}

/** The zoom a fit of `rect` in `viewport` chooses, before `minZoom` / `maxZoom`. */
export function fitZoom(rect: PanZoomSize, viewport: PanZoomSize, mode: PanZoomFit = 'contain', padding = 0): number {
  if (mode === 'none' || rect.width <= 0 || rect.height <= 0) return 1
  const pad = mode === 'cover' ? 0 : padding
  const sx = Math.max(1, viewport.width - pad * 2) / rect.width
  const sy = Math.max(1, viewport.height - pad * 2) / rect.height
  if (mode === 'cover') return Math.max(sx, sy)
  if (mode === 'width') return sx
  return Math.min(sx, sy)
}

/**
 * The view that fits `rect` in `viewport`: centred, except that `width` starts at the top of a rectangle taller than
 * the viewport.
 */
export function fitRect(rect: PanZoomRect, viewport: PanZoomSize, options: FitOptions = {}): PanZoomView {
  const { mode = 'contain', padding = 0, maxZoom = 1, minZoom = 0 } = options
  const zoom = clampZoom(fitZoom(rect, viewport, mode, padding), minZoom, maxZoom)
  const view = centerOn({ x: 0, y: 0, zoom }, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, viewport)
  if (mode === 'width' && rect.height * zoom > viewport.height - padding * 2) view.y = rect.y - padding / zoom
  return view
}

/**
 * The view moved as little as possible to keep `content` in view: along an axis where the content is smaller than the
 * viewport it is centred, and where it is larger no edge of it comes further in than `margin` viewport pixels.
 */
export function clampView(view: PanZoomView, content: PanZoomRect, viewport: PanZoomSize, margin = 0): PanZoomView {
  const axis = (start: number, origin: number, length: number, room: number) => {
    const scaled = length * view.zoom
    if (scaled <= room) return origin + length / 2 - room / 2 / view.zoom
    const pad = margin / view.zoom
    return clamp(start, origin - pad, origin + length - room / view.zoom + pad)
  }
  return {
    x: axis(view.x, content.x, content.width, viewport.width),
    y: axis(view.y, content.y, content.height, viewport.height),
    zoom: view.zoom,
  }
}

/**
 * The view panned the least distance that brings `rect` (content points) into view with `padding` viewport pixels
 * round it; the zoom stays. A rectangle too large to fit shows its top-left corner.
 */
export function revealRect(view: PanZoomView, rect: PanZoomRect, viewport: PanZoomSize, padding = 0): PanZoomView {
  const shift = (start: number, length: number, room: number) => {
    if (length > room - padding * 2 || start < padding) return start - padding
    const end = start + length
    return end > room - padding ? end - (room - padding) : 0
  }
  const at = toViewportPoint(view, rect)
  const dx = shift(at.x, rect.width * view.zoom, viewport.width)
  const dy = shift(at.y, rect.height * view.zoom, viewport.height)
  return dx || dy ? panBy(view, dx, dy) : view
}

/** Whether two views draw the same thing, to within a hundredth of a pixel. */
export function sameView(a: PanZoomView, b: PanZoomView): boolean {
  const near = (p: number, q: number) => Math.abs(p - q) < 0.01
  return near(a.zoom, b.zoom) && near(a.x * a.zoom, b.x * b.zoom) && near(a.y * a.zoom, b.y * b.zoom)
}

/**
 * Whether the user asked for reduced motion: then a view jumps instead of easing and a released drag does not glide.
 * False where there is no `matchMedia` (a server).
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Ease-out cubic: fast at the start, settling at the end. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3)

/**
 * The view `t` of the way (0–1, already eased) from `from` to `to`. The zoom moves geometrically, so each step looks
 * the same size, and the viewport point `origin` (the centre by default) stays on the same content point all the
 * way, apart from the share of the pan that `to` adds on top of a pure zoom around it.
 */
export function interpolateView(from: PanZoomView, to: PanZoomView, t: number, viewport: PanZoomSize, origin?: PanZoomPoint): PanZoomView {
  if (t <= 0) return { ...from }
  if (t >= 1) return { ...to }
  const point = origin ?? { x: viewport.width / 2, y: viewport.height / 2 }
  const zoom = from.zoom * Math.pow(to.zoom / from.zoom, t)
  const end = zoomAround(from, to.zoom, point)
  const at = zoomAround(from, zoom, point)
  // The pan beyond the pure zoom, in viewport pixels, eased in alongside it.
  const dx = (to.x - end.x) * to.zoom * t
  const dy = (to.y - end.y) * to.zoom * t
  return panBy(at, dx, dy)
}

/** The zoom factor of one wheel event: `deltaY` in pixels (100 for a mouse notch, a few for a trackpad pinch). */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-clamp(deltaY, -300, 300) * 0.0022)
}

/** A wheel delta in pixels: lines count 16px and pages one `page` (the viewport's height). */
export function wheelPixels(delta: number, deltaMode: number, page: number): number {
  if (deltaMode === 1) return delta * 16
  if (deltaMode === 2) return delta * page
  return delta
}

/** What a key does to a view. */
export type PanZoomKeyAction = { type: 'pan'; dx: number; dy: number } | { type: 'zoom-in' } | { type: 'zoom-out' } | { type: 'fit' } | { type: 'actual-size' }

/** The fields of a `KeyboardEvent` {@link panZoomKeyAction} reads. */
export interface PanZoomKey {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface PanZoomKeyOptions {
  /** Viewport pixels an arrow pans. Default 48. */
  step?: number
  /** Share of the viewport an arrow pans with Shift. Default 0.25. */
  largeStep?: number
}

/**
 * The action of a key on a focused view, or `null`: the arrows pan (`step` pixels, `largeStep` of the viewport with
 * Shift), `+` / `=` zoom in, `-` / `_` zoom out, `0` fits and `1` goes to 100%. The zoom keys also work with Ctrl or ⌘,
 * so the page does not zoom while the view has focus; Alt, and Ctrl or ⌘ on an arrow, are left to the browser.
 */
export function panZoomKeyAction(event: PanZoomKey, viewport: PanZoomSize, options: PanZoomKeyOptions = {}): PanZoomKeyAction | null {
  const { step = 48, largeStep = 0.25 } = options
  if (event.altKey) return null
  const mod = !!(event.ctrlKey || event.metaKey)
  switch (event.key) {
    case '+':
    case '=':
      return { type: 'zoom-in' }
    case '-':
    case '_':
      return { type: 'zoom-out' }
    case '0':
      return { type: 'fit' }
    case '1':
      return mod ? null : { type: 'actual-size' }
  }
  if (mod) return null
  const x = event.shiftKey ? viewport.width * largeStep : step
  const y = event.shiftKey ? viewport.height * largeStep : step
  switch (event.key) {
    case 'ArrowLeft':
      return { type: 'pan', dx: -x, dy: 0 }
    case 'ArrowRight':
      return { type: 'pan', dx: x, dy: 0 }
    case 'ArrowUp':
      return { type: 'pan', dx: 0, dy: -y }
    case 'ArrowDown':
      return { type: 'pan', dx: 0, dy: y }
  }
  return null
}

/**
 * The velocity of a drag, from its last moves: `add()` each pointer position with its time stamp, then `velocity()`
 * on release. Only the moves of the last `window` milliseconds count, so a drag that stopped before the release does
 * not glide.
 */
export class InertiaTracker {
  private samples: { x: number; y: number; time: number }[] = []
  private readonly window: number

  constructor(window = 100) {
    this.window = window
  }

  reset(): void {
    this.samples = []
  }

  add(x: number, y: number, time: number): void {
    this.samples.push({ x, y, time })
    const since = time - this.window
    while (this.samples.length > 2 && this.samples[0].time < since) this.samples.shift()
  }

  /** Pixels per millisecond at `now` (the last sample's time by default). */
  velocity(now?: number): PanZoomPoint {
    const last = this.samples[this.samples.length - 1]
    if (!last) return { x: 0, y: 0 }
    const since = (now ?? last.time) - this.window
    const first = this.samples.find((sample) => sample.time >= since) ?? last
    const elapsed = last.time - first.time
    if (elapsed <= 0 || (now ?? last.time) - last.time > this.window / 2) return { x: 0, y: 0 }
    return { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed }
  }
}

/**
 * A glide after a released drag: `step(dt)` gives the distance to move in the next `dt` milliseconds, slowing down
 * exponentially (`timeConstant` ms, so a glide travels `velocity × timeConstant` in all), and `done` turns true once
 * it is slower than `minSpeed` pixels per millisecond. `stopX()` / `stopY()` end one axis, at a bound.
 */
export class Glide {
  private vx: number
  private vy: number
  private readonly timeConstant: number
  private readonly minSpeed: number

  constructor(velocity: PanZoomPoint, timeConstant = 325, minSpeed = 0.02) {
    this.vx = velocity.x
    this.vy = velocity.y
    this.timeConstant = timeConstant
    this.minSpeed = minSpeed
  }

  get done(): boolean {
    return Math.hypot(this.vx, this.vy) < this.minSpeed
  }

  stopX(): void {
    this.vx = 0
  }

  stopY(): void {
    this.vy = 0
  }

  step(dt: number): PanZoomPoint {
    const decay = Math.exp(-dt / this.timeConstant)
    const travel = this.timeConstant * (1 - decay)
    const delta = { x: this.vx * travel, y: this.vy * travel }
    this.vx *= decay
    this.vy *= decay
    return delta
  }
}

/** One step of a pinch: the zoom factor, and where the pinch centre was and is, in the coordinates pointers use. */
export interface PinchStep {
  factor: number
  from: PanZoomPoint
  to: PanZoomPoint
}

/**
 * Follows the pointers on a surface and turns two of them into pinch steps: `down()` / `up()` as pointers come and
 * go, then `move()` for each move, which returns a step while exactly two are down (and `null` otherwise).
 */
export class PinchTracker {
  private readonly pointers = new Map<number, PanZoomPoint>()

  get count(): number {
    return this.pointers.size
  }

  /** The ids of the pointers that are down, in the order they came. */
  get ids(): number[] {
    return [...this.pointers.keys()]
  }

  has(id: number): boolean {
    return this.pointers.has(id)
  }

  down(id: number, x: number, y: number): void {
    this.pointers.set(id, { x, y })
  }

  up(id: number): void {
    this.pointers.delete(id)
  }

  reset(): void {
    this.pointers.clear()
  }

  /** The centre of the pointers that are down, or `null`. */
  center(): PanZoomPoint | null {
    if (!this.pointers.size) return null
    let x = 0
    let y = 0
    for (const point of this.pointers.values()) {
      x += point.x
      y += point.y
    }
    return { x: x / this.pointers.size, y: y / this.pointers.size }
  }

  move(id: number, x: number, y: number): PinchStep | null {
    if (!this.pointers.has(id)) return null
    const pinching = this.pointers.size === 2
    const before = pinching ? this.measure() : null
    this.pointers.set(id, { x, y })
    if (!before) return null
    const after = this.measure()
    return { factor: before.distance > 0 ? after.distance / before.distance : 1, from: before.center, to: after.center }
  }

  private measure() {
    const [a, b] = [...this.pointers.values()]
    return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) }
  }
}

/**
 * The view after one pinch step: the content under the old centre ends under the new one, scaled by the step's
 * factor (held to `[minZoom, maxZoom]`). `from` and `to` are viewport points.
 */
export function pinchView(view: PanZoomView, step: PinchStep, minZoom: number, maxZoom: number): PanZoomView {
  const zoomed = zoomAround(view, clampZoom(view.zoom * step.factor, minZoom, maxZoom), step.from)
  return panBy(zoomed, step.from.x - step.to.x, step.from.y - step.to.y)
}
