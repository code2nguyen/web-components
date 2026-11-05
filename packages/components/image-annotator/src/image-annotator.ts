import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues, type SVGTemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/icon-button'
import { imageAnnotatorMessages } from './messages.js'
import styles from './image-annotator.scss?inline'

/** A drawing tool, or `select` to move, resize and delete. */
export type AnnotatorTool = 'select' | 'arrow' | 'line' | 'rect' | 'ellipse' | 'pen' | 'text' | 'number' | 'blur' | 'redact'

/** The kind of a shape. */
export type AnnotatorShapeType = Exclude<AnnotatorTool, 'select'>

/**
 * A shape, in the image's own pixels. Arrows and lines run from (`x`, `y`) to (`x + w`, `y + h`); boxes have a
 * positive `w` and `h`; a pen stroke keeps its `points`; text sits at its top left; a number is centred on (`x`, `y`).
 */
export interface AnnotatorShape {
  id: string
  type: AnnotatorShapeType
  x: number
  y: number
  w: number
  h: number
  points?: [number, number][]
  text?: string
  /** A number badge's value. */
  n?: number
  color: string
  /** Line width, in image pixels. */
  stroke: number
}

export interface AnnotationChangeEventDetail {
  shapes: AnnotatorShape[]
}

export interface AnnotatorErrorEventDetail {
  error: Error
}

/** Events fired by {@link ImageAnnotator}, keyed for `addEventListener`. */
export interface ImageAnnotatorEventMap {
  'annotation-change': CustomEvent<AnnotationChangeEventDetail>
  'annotator-error': CustomEvent<AnnotatorErrorEventDetail>
}

export interface ImageAnnotator {
  addEventListener: TypedAddEventListener<ImageAnnotator, ImageAnnotatorEventMap>
  removeEventListener: TypedRemoveEventListener<ImageAnnotator, ImageAnnotatorEventMap>
}

const TOOLS: AnnotatorTool[] = ['select', 'arrow', 'line', 'rect', 'ellipse', 'pen', 'text', 'number', 'blur', 'redact']
const BOXES: AnnotatorShapeType[] = ['rect', 'ellipse', 'blur', 'redact']
const SHAPE_NAME = {
  arrow: 'shapeArrow',
  line: 'shapeLine',
  rect: 'shapeRect',
  ellipse: 'shapeEllipse',
  pen: 'shapePen',
  text: 'shapeText',
  number: 'shapeNumber',
  blur: 'shapeBlur',
  redact: 'shapeRedact',
} as const
const REDACT_COLOR = '#000000'

const ICONS: Record<AnnotatorTool | 'undo' | 'redo' | 'delete', SVGTemplateResult> = {
  select: svg`<path d="m5 4 6 15 2-6 6-2z" />`,
  arrow: svg`<path d="M5 19 19 5M10 5h9v9" />`,
  line: svg`<path d="M5 19 19 5" />`,
  rect: svg`<rect x="4" y="6" width="16" height="12" rx="1" />`,
  ellipse: svg`<ellipse cx="12" cy="12" rx="8" ry="6" />`,
  pen: svg`<path d="M4 17c3-6 5 2 8-3s4-6 8-4" />`,
  text: svg`<path d="M6 6h12M12 6v13" />`,
  number: svg`<circle cx="12" cy="12" r="8" /><path d="M11 9l1.5-1v8" />`,
  blur: svg`<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />`,
  redact: svg`<rect x="4" y="9" width="16" height="6" fill="currentColor" />`,
  undo: svg`<path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />`,
  redo: svg`<path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" />`,
  delete: svg`<path d="M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />`,
}

let uid = 0

/** The bounding box of a shape, in image pixels, for selection and hit areas. */
function bounds(shape: AnnotatorShape): { x: number; y: number; w: number; h: number } {
  if (shape.type === 'arrow' || shape.type === 'line') {
    return { x: Math.min(shape.x, shape.x + shape.w), y: Math.min(shape.y, shape.y + shape.h), w: Math.abs(shape.w), h: Math.abs(shape.h) }
  }
  if (shape.type === 'number') {
    const r = numberRadius(shape)
    return { x: shape.x - r, y: shape.y - r, w: r * 2, h: r * 2 }
  }
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
}

function numberRadius(shape: AnnotatorShape): number {
  return Math.max(10, shape.stroke * 4)
}

function textSize(shape: AnnotatorShape): number {
  return Math.max(12, shape.stroke * 5)
}

/** The arrow head as two short strokes back from the tip. */
function arrowHead(shape: AnnotatorShape): [number, number][] {
  const tipX = shape.x + shape.w
  const tipY = shape.y + shape.h
  const angle = Math.atan2(shape.h, shape.w)
  const size = Math.max(10, shape.stroke * 4)
  return [
    [tipX - size * Math.cos(angle - Math.PI / 6), tipY - size * Math.sin(angle - Math.PI / 6)],
    [tipX - size * Math.cos(angle + Math.PI / 6), tipY - size * Math.sin(angle + Math.PI / 6)],
  ]
}

/**
 * Draws arrows, boxes, text, numbered steps, blur and redaction over an image, then exports a PNG and the shapes:
 * the markup step of a bug report, a support ticket or a design review.
 *
 * Pick a tool from the toolbar and drag on the image (click for text and numbers); Shift keeps lines at 45° steps and
 * boxes square. `select` moves and resizes shapes by their handles. Colours come from `colors`, and three stroke
 * widths are offered. Undo and redo are buttons, and Ctrl/⌘+Z and Shift+Ctrl/⌘+Z.
 *
 * Shapes are plain objects in the image's own pixels (`shapes`, JSON as an attribute), so they stay in place at any
 * display size; `annotation-change` gives them after every edit. `toBlob()` and `toDataURL()` draw the image at its
 * natural size with the shapes. Redactions are drawn above every other shape. In the export, a redaction replaces the
 * pixels and a blur is a coarse pixelation, so
 * text under either cannot be recovered; use redaction for secrets. An image from another origin needs CORS
 * (`crossorigin`) to be exported: otherwise the export rejects and `annotator-error` says why.
 *
 * Every tool works from the keyboard: with a drawing tool chosen, Enter on the image adds a shape in the middle; with
 * `select`, Tab reaches each shape, the arrow keys nudge it (Shift for 10 px) and Delete removes it. `readonly` shows
 * the shapes with no toolbar.
 *
 * @tag c2-image-annotator
 *
 * @event {CustomEvent<AnnotationChangeEventDetail>} annotation-change - The shapes changed: drawn, moved, resized, edited, deleted, undone or redone.
 * @event {CustomEvent<AnnotatorErrorEventDetail>} annotator-error - An export failed, for example on a cross-origin image without CORS.
 *
 * @csspart toolbar - The toolbar.
 * @csspart stage - The image and its shapes.
 * @csspart image - The image.
 *
 * @cssproperty {color} [--c2-image-annotator__toolbar--background-color=#ffffff]
 * @cssproperty {border} [--c2-image-annotator__toolbar--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-image-annotator--border-radius=8px]
 * @cssproperty {color} [--c2-image-annotator__stage--background-color=#f4f4f5] - Behind the image, seen through transparent pixels.
 * @cssproperty {color} [--c2-image-annotator__selection--color=rgb(2, 101, 220)] - The selected shape's outline and handles.
 * @cssproperty {pixel} [--c2-image-annotator__handle--size=8px]
 * @cssproperty {color} [--c2-image-annotator__swatch__selected--outline-color=rgb(2, 101, 220)]
 * @cssproperty {font-family} [--c2-image-annotator__text--font-family=system-ui, sans-serif] - Text shapes, on screen and in the export.
 * @cssproperty {color} [--c2-image-annotator__number--color=#ffffff] - The digit in a number badge.
 */
@customElement('c2-image-annotator')
export class ImageAnnotator extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The image to annotate. */
  @property() src = ''

  /** Passed to the image; `anonymous` lets an image from another origin with CORS be exported. */
  @property() crossorigin: '' | 'anonymous' | 'use-credentials' | undefined = undefined

  /** The shapes, in image pixels. */
  @property({ converter: jsonPropertyConverter }) shapes: AnnotatorShape[] = []

  /** The tool in use. */
  @property() tool: AnnotatorTool = 'arrow'

  /** The colours offered; the first is chosen to start. */
  @property({ converter: arrayPropertyConverter }) colors: string[] = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#18181b']

  /** Shows the shapes with no toolbar and no editing. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** The image's accessible description, read before its shapes. */
  @property() alt = ''

  @state() private color = ''
  @state() private stroke = 4
  @state() private selected: string | null = null
  @state() private natural = { width: 0, height: 0 }
  @state() private draft: AnnotatorShape | null = null
  @state() private editing: string | null = null
  @state() private announcement = ''
  @state() private history: AnnotatorShape[][] = []
  @state() private future: AnnotatorShape[][] = []

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, imageAnnotatorMessages)
  /** The shapes before the text being edited was added or changed: the edit commits against them. */
  private editOrigin: AnnotatorShape[] | null = null
  private gesture: { kind: 'draw' | 'move' | 'handle'; startX: number; startY: number; origin: AnnotatorShape; handle?: number; moved: boolean } | null = null

  constructor() {
    super()
    this.internals.role = 'group'
  }

  // ------------------------------------------------------------------------------------------------------- public

  /** Clears the history, so a new image starts with nothing to undo. */
  clearHistory(): void {
    this.history = []
    this.future = []
  }

  undo(): void {
    const previous = this.history[this.history.length - 1]
    if (!previous) return
    this.future = [...this.future, this.shapes]
    this.history = this.history.slice(0, -1)
    this.shapes = previous
    this.selected = null
    this.changed()
  }

  redo(): void {
    const next = this.future[this.future.length - 1]
    if (!next) return
    this.history = [...this.history, this.shapes]
    this.future = this.future.slice(0, -1)
    this.shapes = next
    this.selected = null
    this.changed()
  }

  /** The image at its natural size with the shapes drawn on it, redactions and blurs flattened into the pixels. */
  async toCanvas(): Promise<HTMLCanvasElement> {
    const image = await this.loadedImage()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is unavailable.')
    context.drawImage(image, 0, 0)
    // Redactions last, so nothing drawn after them (a blur samples the original image) shows what they hide.
    for (const shape of this.layered()) this.paint(context, shape, image)
    return canvas
  }

  /** The annotated image as a `Blob`; `image/png` unless another type is given. */
  async toBlob(type = 'image/png', quality?: number): Promise<Blob> {
    try {
      const canvas = await this.toCanvas()
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))), type, quality),
      )
    } catch (cause) {
      throw this.fail(cause)
    }
  }

  /** The annotated image as a data URL. */
  async toDataURL(type = 'image/png', quality?: number): Promise<string> {
    try {
      return (await this.toCanvas()).toDataURL(type, quality)
    } catch (cause) {
      throw this.fail(cause)
    }
  }

  // ------------------------------------------------------------------------------------------------------- export

  private fail(cause: unknown): Error {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    this.dispatchEvent(new CustomEvent<AnnotatorErrorEventDetail>('annotator-error', { detail: { error }, bubbles: true, composed: true }))
    return error
  }

  private loadedImage(): Promise<HTMLImageElement> {
    const image = this.renderRoot.querySelector<HTMLImageElement>('img')
    if (!image) return Promise.reject(new Error('There is no image to export.'))
    if (image.complete && image.naturalWidth) return Promise.resolve(image)
    return image.decode().then(() => image)
  }

  private textFont(shape: AnnotatorShape): string {
    const family = getComputedStyle(this).getPropertyValue('--_text-font').trim() || 'system-ui, sans-serif'
    return `600 ${textSize(shape)}px ${family}`
  }

  /** Draws one shape onto the export canvas, the same geometry as the SVG. */
  private paint(context: CanvasRenderingContext2D, shape: AnnotatorShape, image: HTMLImageElement): void {
    context.save()
    context.strokeStyle = shape.color
    context.fillStyle = shape.color
    context.lineWidth = shape.stroke
    context.lineCap = 'round'
    context.lineJoin = 'round'
    const box = bounds(shape)
    switch (shape.type) {
      case 'redact':
        context.fillStyle = REDACT_COLOR
        context.fillRect(box.x, box.y, box.w, box.h)
        break
      case 'blur': {
        // A coarse pixelation, so the region cannot be sharpened back.
        const cell = Math.max(8, Math.round(Math.min(box.w, box.h) / 6))
        const width = Math.max(1, Math.round(box.w / cell))
        const height = Math.max(1, Math.round(box.h / cell))
        const small = document.createElement('canvas')
        small.width = width
        small.height = height
        small.getContext('2d')?.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, width, height)
        context.imageSmoothingEnabled = false
        context.drawImage(small, 0, 0, width, height, box.x, box.y, box.w, box.h)
        break
      }
      case 'rect':
        context.strokeRect(box.x, box.y, box.w, box.h)
        break
      case 'ellipse':
        context.beginPath()
        context.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2)
        context.stroke()
        break
      case 'line':
      case 'arrow': {
        context.beginPath()
        context.moveTo(shape.x, shape.y)
        context.lineTo(shape.x + shape.w, shape.y + shape.h)
        if (shape.type === 'arrow') {
          for (const [x, y] of arrowHead(shape)) {
            context.moveTo(shape.x + shape.w, shape.y + shape.h)
            context.lineTo(x, y)
          }
        }
        context.stroke()
        break
      }
      case 'pen': {
        const points = shape.points ?? []
        context.beginPath()
        points.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)))
        context.stroke()
        break
      }
      case 'text': {
        context.font = this.textFont(shape)
        context.textBaseline = 'top'
        context.fillText(shape.text ?? '', shape.x, shape.y)
        break
      }
      case 'number': {
        const r = numberRadius(shape)
        context.beginPath()
        context.arc(shape.x, shape.y, r, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = getComputedStyle(this).getPropertyValue('--_number-color').trim() || '#ffffff'
        context.font = `700 ${Math.round(r * 1.1)}px ${getComputedStyle(this).getPropertyValue('--_text-font').trim() || 'system-ui, sans-serif'}`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(String(shape.n ?? 1), shape.x, shape.y + 1)
        break
      }
    }
    context.restore()
  }

  /** The shapes in drawing order: as drawn, with every redaction on top. */
  private layered(): AnnotatorShape[] {
    return [...this.shapes.filter((shape) => shape.type !== 'redact'), ...this.shapes.filter((shape) => shape.type === 'redact')]
  }

  // ------------------------------------------------------------------------------------------------------- state

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.msg.t('stage')
    if (!Array.isArray(this.shapes)) this.shapes = []
    if (changed.has('colors') && (!this.color || !this.colors.includes(this.color))) this.color = this.colors[0] ?? '#e11d48'
    if (changed.has('src')) this.natural = { width: 0, height: 0 }
    if (changed.has('readonly') && this.readonly) this.selected = null
  }

  private commit(next: AnnotatorShape[], announce?: string): void {
    this.history = [...this.history.slice(-99), this.shapes]
    this.future = []
    this.shapes = next
    if (announce) this.announcement = announce
    this.changed()
  }

  private changed(): void {
    this.dispatchEvent(
      new CustomEvent<AnnotationChangeEventDetail>('annotation-change', {
        detail: { shapes: this.shapes.map((shape) => ({ ...shape })) },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private kind(shape: AnnotatorShape): string {
    return this.msg.t(SHAPE_NAME[shape.type])
  }

  private nextNumber(): number {
    return this.shapes.reduce((max, shape) => (shape.type === 'number' ? Math.max(max, shape.n ?? 0) : max), 0) + 1
  }

  private create(type: AnnotatorShapeType, x: number, y: number): AnnotatorShape {
    uid += 1
    return {
      id: `s${Date.now().toString(36)}${uid}`,
      type,
      x,
      y,
      w: 0,
      h: 0,
      color: type === 'redact' ? REDACT_COLOR : this.color,
      stroke: this.stroke,
      ...(type === 'pen' ? { points: [[x, y] as [number, number]] } : {}),
      ...(type === 'number' ? { n: this.nextNumber() } : {}),
      ...(type === 'text' ? { text: '' } : {}),
    }
  }

  private add(shape: AnnotatorShape): void {
    this.selected = shape.id
    if (shape.type === 'text') {
      // A text joins the history when it is finished, as one entry, and not at all if it is left empty.
      this.editOrigin = this.shapes
      this.shapes = [...this.shapes, shape]
      this.editing = shape.id
      return
    }
    this.commit([...this.shapes, shape], this.msg.t('added', this.kind(shape)))
  }

  /** Starts editing a text shape. */
  private edit(id: string): void {
    this.editOrigin = this.shapes
    this.editing = id
  }

  private removeShape(id: string): void {
    const shape = this.shapes.find((candidate) => candidate.id === id)
    if (!shape) return
    this.commit(
      this.shapes.filter((candidate) => candidate.id !== id),
      this.msg.t('deleted', this.kind(shape)),
    )
    if (this.selected === id) this.selected = null
  }

  private patch(id: string, change: Partial<AnnotatorShape>, record = true): void {
    const next = this.shapes.map((shape) => (shape.id === id ? { ...shape, ...change } : shape))
    if (record) this.commit(next)
    else this.shapes = next
  }

  // ----------------------------------------------------------------------------------------------------- pointer

  /** A pointer position in image pixels. */
  private point(event: PointerEvent | MouseEvent): [number, number] {
    const svg = this.renderRoot.querySelector('svg.overlay')
    const rect = svg?.getBoundingClientRect()
    if (!rect || !rect.width || !this.natural.width) return [0, 0]
    // Hundredths of an image pixel: enough precision, and shapes that read cleanly when saved.
    const round = (value: number) => Math.round(value * 100) / 100
    return [round(((event.clientX - rect.left) / rect.width) * this.natural.width), round(((event.clientY - rect.top) / rect.height) * this.natural.height)]
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.readonly || event.button !== 0 || !this.natural.width) return
    if (this.editing) this.finishText()
    // The pointer default is prevented (no text selection, no image drag), so focus the stage by hand: the keys that
    // follow (Delete, the arrows, undo) are for it.
    this.stageElement?.focus({ preventScroll: true })
    const [x, y] = this.point(event)
    const target = (event.composedPath() as Element[]).find((node) => node instanceof Element && (node as Element).getAttribute?.('data-id'))
    const handle = (event.composedPath() as Element[]).find((node) => node instanceof Element && node.getAttribute?.('data-handle'))
    const overlay = event.currentTarget as Element
    if (this.tool === 'select') {
      if (handle && this.selected) {
        const origin = this.shapes.find((shape) => shape.id === this.selected)
        if (origin)
          this.gesture = { kind: 'handle', startX: x, startY: y, origin: { ...origin }, handle: Number(handle.getAttribute('data-handle')), moved: false }
      } else if (target) {
        const id = target.getAttribute('data-id')!
        this.selected = id
        const origin = this.shapes.find((shape) => shape.id === id)
        if (origin) this.gesture = { kind: 'move', startX: x, startY: y, origin: { ...origin }, moved: false }
      } else {
        this.selected = null
      }
    } else if (this.tool === 'number' || this.tool === 'text') {
      this.add(this.create(this.tool, x, y))
      event.preventDefault()
      return
    } else {
      this.draft = this.create(this.tool, x, y)
      this.gesture = { kind: 'draw', startX: x, startY: y, origin: this.draft, moved: false }
    }
    if (this.gesture) overlay.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  private onPointerMove(event: PointerEvent): void {
    const gesture = this.gesture
    if (!gesture) return
    const [x, y] = this.point(event)
    const origin = gesture.origin
    gesture.moved = gesture.moved || Math.hypot(x - gesture.startX, y - gesture.startY) > 2
    if (gesture.kind === 'draw' && this.draft) {
      if (this.draft.type === 'pen') {
        this.draft = { ...this.draft, points: [...(this.draft.points ?? []), [x, y]] }
        return
      }
      let w = x - gesture.startX
      let h = y - gesture.startY
      if (event.shiftKey) {
        if (this.draft.type === 'arrow' || this.draft.type === 'line') {
          // Snap to 45° steps.
          const angle = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4)
          const length = Math.hypot(w, h)
          w = Math.cos(angle) * length
          h = Math.sin(angle) * length
        } else {
          const side = Math.max(Math.abs(w), Math.abs(h))
          w = Math.sign(w || 1) * side
          h = Math.sign(h || 1) * side
        }
      }
      this.draft = { ...this.draft, w, h }
      return
    }
    const dx = x - gesture.startX
    const dy = y - gesture.startY
    if (gesture.kind === 'move') {
      const moved = { x: origin.x + dx, y: origin.y + dy, points: origin.points?.map(([px, py]) => [px + dx, py + dy] as [number, number]) }
      this.patch(origin.id, moved, false)
    } else if (gesture.kind === 'handle') {
      this.patch(origin.id, this.resized(origin, gesture.handle ?? 0, x, y), false)
    }
  }

  /** The shape after dragging handle `handle` to (`x`, `y`): the two ends of a line, else the four corners. */
  private resized(origin: AnnotatorShape, handle: number, x: number, y: number): Partial<AnnotatorShape> {
    if (origin.type === 'arrow' || origin.type === 'line') {
      return handle === 0 ? { x, y, w: origin.x + origin.w - x, h: origin.y + origin.h - y } : { w: x - origin.x, h: y - origin.y }
    }
    const box = bounds(origin)
    const left = handle === 0 || handle === 2 ? x : box.x
    const right = handle === 1 || handle === 3 ? x : box.x + box.w
    const top = handle === 0 || handle === 1 ? y : box.y
    const bottom = handle === 2 || handle === 3 ? y : box.y + box.h
    const next = { x: Math.min(left, right), y: Math.min(top, bottom), w: Math.abs(right - left), h: Math.abs(bottom - top) }
    if (origin.type === 'pen' && origin.points && box.w && box.h) {
      const sx = next.w / box.w
      const sy = next.h / box.h
      return { ...next, points: origin.points.map(([px, py]) => [next.x + (px - box.x) * sx, next.y + (py - box.y) * sy]) }
    }
    return next
  }

  private onPointerUp(): void {
    const gesture = this.gesture
    this.gesture = null
    if (!gesture) return
    if (gesture.kind === 'draw' && this.draft) {
      const draft = this.draft
      this.draft = null
      if (!gesture.moved) return
      let shape = draft
      if (BOXES.includes(draft.type)) {
        const box = { x: Math.min(draft.x, draft.x + draft.w), y: Math.min(draft.y, draft.y + draft.h), w: Math.abs(draft.w), h: Math.abs(draft.h) }
        if (box.w < 3 || box.h < 3) return
        shape = { ...draft, ...box }
      }
      if (draft.type === 'pen') {
        const xs = (draft.points ?? []).map(([x]) => x)
        const ys = (draft.points ?? []).map(([, y]) => y)
        shape = { ...draft, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      }
      this.add(shape)
      return
    }
    // A move or a resize: one history entry for the whole drag.
    if (gesture.moved) {
      const now = this.shapes
      this.shapes = this.shapes.map((shape) => (shape.id === gesture.origin.id ? gesture.origin : shape))
      this.commit(now)
    }
  }

  /** Undo or redo from the toolbar; when that empties its stack the button turns off, so focus moves to the image. */
  private step(direction: 'undo' | 'redo'): void {
    if (direction === 'undo') this.undo()
    else this.redo()
    if (!(direction === 'undo' ? this.history : this.future).length) this.updateComplete.then(() => this.stageElement?.focus())
  }

  // ---------------------------------------------------------------------------------------------------- keyboard

  private onKeydown(event: KeyboardEvent): void {
    if (this.readonly || this.editing) return
    const meta = event.ctrlKey || event.metaKey
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) this.redo()
      else this.undo()
      return
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      this.redo()
      return
    }
    // The rest is for the image and its shapes, not for a key pressed on the toolbar.
    if (!(event.composedPath() as EventTarget[]).includes(this.stageElement as EventTarget)) return
    const selected = this.shapes.find((shape) => shape.id === this.selected)
    if (selected) {
      const step = event.shiftKey ? 10 : 1
      const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
      if (nudge) {
        event.preventDefault()
        const [dx, dy] = nudge
        this.patch(selected.id, { x: selected.x + dx, y: selected.y + dy, points: selected.points?.map(([px, py]) => [px + dx, py + dy] as [number, number]) })
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        this.removeShape(selected.id)
        this.updateComplete.then(() => this.stageElement?.focus())
        return
      }
      if (event.key === 'Enter' && selected.type === 'text') {
        event.preventDefault()
        this.edit(selected.id)
        return
      }
      if (event.key === 'Escape') {
        this.selected = null
        this.stageElement?.focus()
        return
      }
    }
    // Enter on the image with a drawing tool adds a shape in the middle.
    if (event.key === 'Enter' && this.tool !== 'select' && event.target === this.stageElement && this.natural.width) {
      event.preventDefault()
      const { width, height } = this.natural
      const size = Math.min(width, height) / 5
      const shape = this.create(this.tool, width / 2 - size / 2, height / 2 - size / 4)
      if (this.tool === 'number' || this.tool === 'text') {
        shape.x = width / 2
        shape.y = height / 2
      } else if (this.tool === 'pen') {
        shape.points = [
          [shape.x, shape.y + size / 4],
          [shape.x + size / 2, shape.y],
          [shape.x + size, shape.y + size / 4],
        ]
        shape.w = size
        shape.h = size / 4
      } else {
        shape.w = size
        shape.h = size / 2
      }
      this.add(shape)
    }
  }

  private get stageElement(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.stage') ?? null
  }

  // ------------------------------------------------------------------------------------------------------- text

  /** Ends the text edit with `value` (the editor's text when left out): one history entry, or none if nothing changed. */
  private finishText(value?: string): void {
    const id = this.editing
    if (!id) return
    const editor = this.renderRoot.querySelector<HTMLInputElement>('.text-editor')
    // The editor is about to go: keep the keyboard on the image rather than drop it to the page.
    if (editor && this.shadowRoot?.activeElement === editor) this.updateComplete.then(() => this.stageElement?.focus({ preventScroll: true }))
    this.editing = null
    const origin = this.editOrigin ?? this.shapes
    this.editOrigin = null
    const shape = this.shapes.find((candidate) => candidate.id === id)
    if (!shape) return
    const text = (value ?? editor?.value ?? shape.text ?? '').trim()
    const before = origin.find((candidate) => candidate.id === id)
    let next: AnnotatorShape[]
    if (!text) {
      next = this.shapes.filter((candidate) => candidate.id !== id)
      this.selected = null
    } else {
      next = this.shapes.map((candidate) =>
        candidate.id === id ? { ...candidate, text, w: text.length * textSize(shape) * 0.6, h: textSize(shape) * 1.2 } : candidate,
      )
    }
    // Back to how it was: a new text left empty, or an edit that changed nothing.
    if ((!text && !before) || (before && before.text === text)) {
      this.shapes = origin
      return
    }
    this.shapes = origin
    this.commit(next, !before ? this.msg.t('added', this.kind(shape)) : !text ? this.msg.t('deleted', this.kind(shape)) : undefined)
  }

  private renderEditor() {
    const shape = this.shapes.find((candidate) => candidate.id === this.editing)
    if (!shape || !this.natural.width) return nothing
    const left = (shape.x / this.natural.width) * 100
    const top = (shape.y / this.natural.height) * 100
    return html`<input
      class="text-editor"
      aria-label=${this.msg.t('textInput')}
      style="left: ${left}%; top: ${top}%; color: ${shape.color}; --_size: ${textSize(shape) / this.natural.width}"
      .value=${shape.text ?? ''}
      @keydown=${(event: KeyboardEvent) => {
        event.stopPropagation()
        if (event.key === 'Enter') this.finishText((event.target as HTMLInputElement).value)
        if (event.key === 'Escape') this.finishText(shape.text ? shape.text : '')
      }}
      @blur=${(event: FocusEvent) => this.finishText((event.target as HTMLInputElement).value)}
    />`
  }

  protected override firstUpdated(): void {
    // A server-rendered page loads the image before the element hydrates, so its `load` has already fired.
    const image = this.renderRoot.querySelector<HTMLImageElement>('img')
    if (image?.complete && image.naturalWidth) this.natural = { width: image.naturalWidth, height: image.naturalHeight }
  }

  protected override updated(): void {
    const editor = this.renderRoot.querySelector<HTMLInputElement>('.text-editor')
    if (editor && this.shadowRoot?.activeElement !== editor) editor.focus()
  }

  // ------------------------------------------------------------------------------------------------------ render

  private renderShape(shape: AnnotatorShape, index: number, count: number, draft = false): SVGTemplateResult {
    const stroke = { stroke: shape.color, 'stroke-width': shape.stroke }
    const box = bounds(shape)
    let body: SVGTemplateResult
    switch (shape.type) {
      case 'redact':
        body = svg`<rect x=${box.x} y=${box.y} width=${box.w} height=${box.h} fill=${REDACT_COLOR}></rect>`
        break
      case 'blur':
        body = svg`<clipPath id="clip-${shape.id}"><rect x=${box.x} y=${box.y} width=${box.w} height=${box.h}></rect></clipPath>
          <image href=${this.src} width=${this.natural.width} height=${this.natural.height} clip-path="url(#clip-${shape.id})" filter="url(#blur)"></image>`
        break
      case 'rect':
        body = svg`<rect x=${box.x} y=${box.y} width=${box.w} height=${box.h} fill="none" stroke=${stroke.stroke} stroke-width=${stroke['stroke-width']}></rect>`
        break
      case 'ellipse':
        body = svg`<ellipse cx=${box.x + box.w / 2} cy=${box.y + box.h / 2} rx=${box.w / 2} ry=${box.h / 2} fill="none" stroke=${stroke.stroke} stroke-width=${stroke['stroke-width']}></ellipse>`
        break
      case 'line':
      case 'arrow': {
        const head = shape.type === 'arrow' ? arrowHead(shape) : []
        const tip = `${shape.x + shape.w} ${shape.y + shape.h}`
        const d = `M${shape.x} ${shape.y} L${tip}` + head.map(([x, y]) => ` M${tip} L${x} ${y}`).join('')
        body = svg`<path d=${d} fill="none" stroke=${stroke.stroke} stroke-width=${stroke['stroke-width']}></path>`
        break
      }
      case 'pen':
        body = svg`<polyline points=${(shape.points ?? []).map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke=${stroke.stroke} stroke-width=${stroke['stroke-width']}></polyline>`
        break
      case 'text':
        body = svg`<text x=${shape.x} y=${shape.y} fill=${shape.color} font-size=${textSize(shape)} class="label" dominant-baseline="hanging">${this.editing === shape.id ? '' : shape.text}</text>`
        break
      case 'number': {
        const r = numberRadius(shape)
        body = svg`<circle cx=${shape.x} cy=${shape.y} r=${r} fill=${shape.color}></circle>
          <text x=${shape.x} y=${shape.y + 1} class="digit" font-size=${Math.round(r * 1.1)} text-anchor="middle" dominant-baseline="middle">${shape.n ?? 1}</text>`
        break
      }
    }
    if (draft) return svg`<g class="draft">${body}</g>`
    const selectable = !this.readonly && this.tool === 'select'
    return svg`<g
      class="shape ${this.selected === shape.id ? 'selected' : ''}"
      data-id=${shape.id}
      role="img"
      aria-label=${this.msg.t('shapeOf', this.kind(shape), index + 1, count) + (shape.type === 'text' && shape.text ? `: ${shape.text}` : '')}
      tabindex=${selectable ? 0 : -1}
      @focus=${() => {
        if (selectable) this.selected = shape.id
      }}
    >
      ${body}
      <rect class="hit" x=${box.x - 6} y=${box.y - 6} width=${box.w + 12} height=${box.h + 12}></rect>
    </g>`
  }

  private renderSelection() {
    const shape = this.shapes.find((candidate) => candidate.id === this.selected)
    if (!shape || this.readonly) return nothing
    const box = bounds(shape)
    const size = Math.max(6, this.natural.width / 120)
    const points: [number, number][] =
      shape.type === 'arrow' || shape.type === 'line'
        ? [
            [shape.x, shape.y],
            [shape.x + shape.w, shape.y + shape.h],
          ]
        : [
            [box.x, box.y],
            [box.x + box.w, box.y],
            [box.x, box.y + box.h],
            [box.x + box.w, box.y + box.h],
          ]
    const resizable = shape.type !== 'number' && shape.type !== 'text'
    return svg`<g class="selection">
      <rect class="outline" x=${box.x - 2} y=${box.y - 2} width=${box.w + 4} height=${box.h + 4}></rect>
      ${resizable ? points.map(([x, y], index) => svg`<rect class="handle" data-handle=${index} x=${x - size / 2} y=${y - size / 2} width=${size} height=${size}></rect>`) : nothing}
    </g>`
  }

  private renderToolbar() {
    const widths: [number, 'thin' | 'medium' | 'thick'][] = [
      [2, 'thin'],
      [4, 'medium'],
      [8, 'thick'],
    ]
    const icon = (name: keyof typeof ICONS) => html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`
    return html`<div class="toolbar" part="toolbar" role="toolbar" aria-label=${this.msg.t('toolbar')}>
      ${TOOLS.map(
        (tool) =>
          html`<c2-icon-button
            toggle
            ?selected=${this.tool === tool}
            aria-label=${this.msg.t(tool)}
            tooltip=${this.msg.t(tool)}
            data-tool=${tool}
            @click=${() => {
              this.tool = tool
              if (tool !== 'select') this.selected = null
            }}
            >${icon(tool)}</c2-icon-button
          >`,
      )}
      <span class="separator"></span>
      <span class="swatches" role="radiogroup" aria-label=${this.msg.t('color')}>
        ${this.colors.map(
          (color, index) =>
            html`<button
              type="button"
              class="swatch ${this.color === color ? 'on' : ''}"
              role="radio"
              aria-checked=${String(this.color === color)}
              aria-label=${this.msg.t('colorN', index + 1)}
              style="--_swatch: ${color}"
              @click=${() => {
                this.color = color
                const selected = this.shapes.find((shape) => shape.id === this.selected)
                if (selected && selected.type !== 'redact' && selected.type !== 'blur') this.patch(selected.id, { color })
              }}
            ></button>`,
        )}
      </span>
      <span class="separator"></span>
      <span class="widths" role="radiogroup" aria-label=${this.msg.t('stroke')}>
        ${widths.map(
          ([width, name]) =>
            html`<button
              type="button"
              class="width ${this.stroke === width ? 'on' : ''}"
              role="radio"
              aria-checked=${String(this.stroke === width)}
              aria-label=${this.msg.t(name)}
              style="--_width: ${Math.min(6, width)}px"
              @click=${() => {
                this.stroke = width
                const selected = this.shapes.find((shape) => shape.id === this.selected)
                if (selected) this.patch(selected.id, { stroke: width })
              }}
            ></button>`,
        )}
      </span>
      <span class="grow"></span>
      ${
        this.selected
          ? html`<c2-icon-button
              aria-label=${this.msg.t('delete')}
              tooltip=${this.msg.t('delete')}
              @click=${() => this.selected && this.removeShape(this.selected)}
              >${icon('delete')}</c2-icon-button
            >`
          : nothing
      }
      <c2-icon-button aria-label=${this.msg.t('undo')} tooltip=${this.msg.t('undo')} ?disabled=${!this.history.length} @click=${() => this.step('undo')}
        >${icon('undo')}</c2-icon-button
      >
      <c2-icon-button aria-label=${this.msg.t('redo')} tooltip=${this.msg.t('redo')} ?disabled=${!this.future.length} @click=${() => this.step('redo')}
        >${icon('redo')}</c2-icon-button
      >
    </div>`
  }

  override render() {
    const { width, height } = this.natural
    const count = this.shapes.length
    return html`<div class="frame" @keydown=${this.onKeydown}>
      ${this.readonly ? nothing : this.renderToolbar()}
      <div class="stage tool-${this.tool}" part="stage" role="group" tabindex=${this.readonly ? -1 : 0} aria-label=${this.alt || this.msg.t('stage')}>
        <img
          part="image"
          src=${this.src}
          alt=""
          crossorigin=${this.crossorigin ?? nothing}
          draggable="false"
          @load=${(event: Event) => {
            const image = event.target as HTMLImageElement
            this.natural = { width: image.naturalWidth, height: image.naturalHeight }
          }}
        />
        ${
          width
            ? html`<svg
                class="overlay"
                viewBox="0 0 ${width} ${height}"
                preserveAspectRatio="none"
                @pointerdown=${this.onPointerDown}
                @pointermove=${this.onPointerMove}
                @pointerup=${this.onPointerUp}
                @pointercancel=${this.onPointerUp}
              >
                <defs>
                  <filter id="blur"><feGaussianBlur stdDeviation=${Math.max(4, width / 120)}></feGaussianBlur></filter>
                </defs>
                ${this.layered().map((shape) => this.renderShape(shape, this.shapes.indexOf(shape), count))}
                ${this.draft ? this.renderShape(this.draft, 0, 0, true) : nothing} ${this.renderSelection()}
              </svg>`
            : nothing
        }
        ${this.renderEditor()}
      </div>
      <div class="live" role="status">${this.announcement}</div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-image-annotator': ImageAnnotator
  }
}
