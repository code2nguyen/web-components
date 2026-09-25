import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { packMasonry } from './masonry-pack'
import {
  cloneSnapshot,
  normalizeAuthoredTiles,
  rangeForWidth,
  reconcileSnapshot,
  resolveColumns,
  validateSnapshot,
  MASONRY_COLUMN_COUNT,
} from './masonry-model'
import type {
  MasonryAction,
  MasonryEditSession,
  MasonryInputMethod,
  MasonryLayoutChangeDetail,
  MasonryLayoutErrorDetail,
  MasonryLayoutItem,
  MasonryLayoutSnapshot,
  MasonryPlacement,
  MasonryRange,
} from './masonry-model'
import type { MasonryItem } from './masonry-item'
import './masonry-item'
import styles from './masonry.scss?inline'

export type { MasonryColumns, MasonryLayoutItem, MasonryLayoutSnapshot, MasonryLayoutChangeDetail, MasonryLayoutErrorDetail } from './masonry-model'

/** Typed events fired by a masonry container. */
export interface MasonryEventMap {
  'layout-change': CustomEvent<MasonryLayoutChangeDetail>
  'layout-error': CustomEvent<MasonryLayoutErrorDetail>
}

export interface Masonry {
  addEventListener: TypedAddEventListener<Masonry, MasonryEventMap>
  removeEventListener: TypedRemoveEventListener<Masonry, MasonryEventMap>
}

interface RenderedTile extends MasonryPlacement {
  slot: string
}

interface PointerSession {
  pointerId: number
  control: HTMLElement
  resizeEdge?: 'right' | 'bottom'
  startX: number
  startY: number
  lastX: number
  lastY: number
  moveTargets: { id: string; x: number; y: number }[]
}

/**
 * Automatically packs direct `c2-masonry-item` children into the first available grid cells.
 * Use `c2-dashboard` when the application must choose fixed coordinates instead.
 *
 * @tag c2-masonry
 * @slot default - Direct `c2-masonry-item` children to pack.
 * @slotcomponent c2-masonry-item
 * @event {CustomEvent<MasonryLayoutChangeDetail>} layout-change - Fired exactly once after a real user move or resize commit; does not bubble. Detail includes a complete restorable snapshot.
 * @event {CustomEvent<MasonryLayoutErrorDetail>} layout-error - Invalid tile identities, spans, or supplied snapshot; does not bubble.
 * @csspart grid - Packed grid region.
 * @csspart placeholder - Candidate occupied area during an edit session.
 * @cssproperty {pixel} [--c2-masonry--gap=8px] - Gap between cells and tiles.
 * @cssproperty {pixel} [--c2-masonry--row-height=8px] - Height of one grid row.
 * @cssproperty {padding} [--c2-masonry--padding=0px] - Inset around the grid.
 * @cssproperty {color} [--c2-masonry--background=transparent] - Grid background.
 * @cssproperty {border} [--c2-masonry--border=none] - Outer border.
 * @cssproperty {border-radius} [--c2-masonry--border-radius=0px] - Outer corner radius.
 * @cssproperty {color} [--c2-masonry__placeholder--background=rgb(37 99 235 / 8%)] - Candidate tile fill.
 * @cssproperty {border} [--c2-masonry__placeholder--border=2px dashed #2563eb] - Candidate tile edge.
 * @cssproperty {border-radius} [--c2-masonry__placeholder--border-radius=6px] - Candidate corners.
 * @cssproperty {time} [--c2-masonry__motion--duration=160ms] - Decorative movement duration.
 * @cssproperty {timing-function} [--c2-masonry__motion--timing-function=ease] - Decorative movement easing.
 */
@customElement('c2-masonry')
export class Masonry extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Shows separate move and resize controls when every tile has a unique identity. */
  @property({ type: Boolean }) editable = false

  /** Saves committed user layouts to localStorage and restores them on load. Use `save-layout="false"` to opt out. */
  @property({ type: Boolean, attribute: 'save-layout' }) saveLayout = true

  /** Optional stable localStorage key; otherwise the page URL and element ID or position identify this container. */
  @property({ attribute: 'storage-key' }) storageKey?: string

  /** Optional application-owned saved arrangement; assignment never emits `layout-change`. */
  @property({ attribute: false }) layout?: MasonryLayoutSnapshot

  @state() private renderedTiles: RenderedTile[] = []
  @state() private columnCount = 1
  @state() private statusMessage = ''
  private activeRange: MasonryRange = 'xs'
  private committed: MasonryLayoutSnapshot = { version: 1, items: [] }
  private appliedLayout?: MasonryLayoutSnapshot
  private loadedStorageKey?: string
  private readonly authoredSignatures = new Map<string, string>()
  private readonly itemById = new Map<string, MasonryItem>()
  private readonly slotById = new Map<string, string>()
  private resizeObserver?: ResizeObserver
  private resizeFrame = 0
  private observedWidth = -1
  private authoredElements: MasonryItem[] = []
  private authoredValues: string[] = []
  private mutationObserver?: MutationObserver
  private syncQueued = false
  private canEdit = false
  private session?: MasonryEditSession
  private pointer?: PointerSession
  private pointerFrame = 0
  private scrollFrame = 0
  private previousTilePositions?: Map<string, DOMRect>
  private readonly tileAnimations = new Map<string, Animation>()
  private readonly reportedErrors = new Set<string>()

  private readonly onPointerDown = (event: PointerEvent) => this.startPointer(event)
  private readonly onPointerMove = (event: PointerEvent) => this.movePointer(event)
  private readonly onPointerUp = (event: PointerEvent) => this.endPointer(event)
  private readonly onPointerCancel = (event: PointerEvent) => {
    if (this.pointer?.pointerId === event.pointerId) this.cancelSession()
  }
  private readonly onLostCapture = (event: PointerEvent) => {
    if (this.pointer?.pointerId === event.pointerId) this.cancelSession()
  }
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKey(event)

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1
    this.addEventListener('pointerdown', this.onPointerDown)
    this.addEventListener('pointermove', this.onPointerMove)
    this.addEventListener('pointerup', this.onPointerUp)
    this.addEventListener('pointercancel', this.onPointerCancel)
    this.addEventListener('lostpointercapture', this.onLostCapture)
    this.addEventListener('keydown', this.onKeyDown)
    this.resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width !== this.observedWidth) {
        this.observedWidth = width
        cancelAnimationFrame(this.resizeFrame)
        this.resizeFrame = requestAnimationFrame(() => this.scheduleSync())
      }
    })
    this.resizeObserver.observe(this)
    this.mutationObserver = new MutationObserver(() => this.scheduleSync())
    this.mutationObserver.observe(this, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ['item-id', 'rows', 'cols', 'cols-xs', 'cols-sm', 'cols-md', 'cols-lg'],
    })
    this.scheduleSync()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.cancelSession()
    this.removeEventListener('pointerdown', this.onPointerDown)
    this.removeEventListener('pointermove', this.onPointerMove)
    this.removeEventListener('pointerup', this.onPointerUp)
    this.removeEventListener('pointercancel', this.onPointerCancel)
    this.removeEventListener('lostpointercapture', this.onLostCapture)
    this.removeEventListener('keydown', this.onKeyDown)
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.resizeFrame)
    this.mutationObserver?.disconnect()
    for (const animation of this.tileAnimations.values()) animation.cancel()
    this.tileAnimations.clear()
    this.previousTilePositions = undefined
  }

  protected override updated(changes: PropertyValues<this>): void {
    super.updated(changes)
    if (changes.has('editable') || changes.has('layout') || changes.has('saveLayout') || changes.has('storageKey')) this.scheduleSync()
    this.animateRelocatedTiles()
  }

  private scheduleSync(): void {
    if (this.syncQueued) return
    this.syncQueued = true
    queueMicrotask(() => {
      this.syncQueued = false
      if (this.isConnected) this.sync()
    })
  }

  private reportError(detail: MasonryLayoutErrorDetail): void {
    const key = `${detail.reason}:${detail.itemId ?? ''}`
    if (this.reportedErrors.has(key)) return
    this.reportedErrors.add(key)
    this.dispatchEvent(new CustomEvent<MasonryLayoutErrorDetail>('layout-error', { detail }))
  }

  private resolveStorageKey(): string {
    const explicit = this.storageKey?.trim()
    if (explicit) return explicit
    const root = this.getRootNode()
    const containers = root instanceof Document || root instanceof ShadowRoot ? root.querySelectorAll('c2-masonry') : document.querySelectorAll('c2-masonry')
    const identity = this.id.trim() || String(Array.from(containers).indexOf(this))
    return `c2-masonry:${location.pathname}:${identity}`
  }

  private readStoredLayout(key: string): MasonryLayoutSnapshot | undefined {
    try {
      const saved = localStorage.getItem(key)
      if (!saved) return undefined
      const parsed: unknown = JSON.parse(saved)
      return validateSnapshot(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }

  private saveCommittedLayout(): void {
    if (!this.saveLayout) return
    try {
      localStorage.setItem(this.resolveStorageKey(), JSON.stringify(this.committed))
    } catch {
      // Storage can be disabled or full; the user edit and layout-change event still succeed.
    }
  }

  private sync(): void {
    const width = this.observedWidth
    if (width <= 0) return
    const { range, columns } = rangeForWidth(width)
    const items = Array.from(this.children).filter((child): child is MasonryItem => child.localName === 'c2-masonry-item')
    const signatures = items.map((item) => JSON.stringify([item.itemId, item.rows, item.cols, item.colsXs, item.colsSm, item.colsMd, item.colsLg]))
    const authoredChanged =
      items.length !== this.authoredElements.length ||
      items.some((item, index) => item !== this.authoredElements[index] || signatures[index] !== this.authoredValues[index])
    const reordered =
      items.length === this.authoredElements.length &&
      items.some((item, index) => item !== this.authoredElements[index]) &&
      items.every((item) => this.authoredElements.includes(item))
    if (authoredChanged && this.session) this.cancelSession()
    this.authoredElements = items
    this.authoredValues = signatures
    const normalized = normalizeAuthoredTiles(items.map((item) => ({ id: item.itemId, rows: item.rows, cols: item.cols })))
    for (const error of normalized.errors) this.reportError(error)
    this.canEdit = normalized.canEdit
    const nextById = new Map<string, MasonryItem>()
    const nextSlots = new Map<string, string>()
    const authored: MasonryLayoutItem[] = []
    const seen = new Set<string>()

    for (const [index, item] of items.entries()) {
      const tile = normalized.tiles[index]
      let id = tile.id
      if (seen.has(id)) id = `__invalid-${index}`
      seen.add(id)
      const slot = `masonry-tile-${index}`
      if (item.slot !== slot) item.slot = slot
      nextById.set(id, item)
      nextSlots.set(id, slot)
      for (const value of [item.colsXs, item.colsSm, item.colsMd, item.colsLg]) {
        if (value !== undefined && (!Number.isInteger(value) || value <= 0)) this.reportError({ reason: 'invalid-span', itemId: item.itemId })
      }
      const raw = {
        cols: tile.cols,
        colsXs: item.colsXs,
        colsSm: item.colsSm,
        colsMd: item.colsMd,
        colsLg: item.colsLg,
      }
      const columnsByRange = {
        xs: resolveColumns(raw, 'xs'),
        sm: resolveColumns(raw, 'sm'),
        md: resolveColumns(raw, 'md'),
        lg: resolveColumns(raw, 'lg'),
      }
      authored.push({ id, rows: tile.rows, columns: columnsByRange })
      const signature = signatures[index]
      const previous = this.authoredSignatures.get(id)
      if (previous !== undefined && previous !== signature) {
        const existing = this.committed.items.find((entry) => entry.id === id)
        if (existing) {
          existing.rows = tile.rows
          existing.columns = columnsByRange
        }
      }
      this.authoredSignatures.set(id, signature)
      item.editing = this.editable && normalized.canEdit
    }
    for (const key of this.authoredSignatures.keys()) if (!nextById.has(key)) this.authoredSignatures.delete(key)
    this.itemById.clear()
    this.slotById.clear()
    for (const [id, item] of nextById) this.itemById.set(id, item)
    for (const [id, slot] of nextSlots) this.slotById.set(id, slot)
    const authoredSnapshot: MasonryLayoutSnapshot = { version: 1, items: authored }
    if (this.saveLayout) {
      const key = this.resolveStorageKey()
      if (key !== this.loadedStorageKey) {
        this.loadedStorageKey = key
        if (this.layout === undefined) this.committed = this.readStoredLayout(key) ?? this.committed
      }
    }
    this.committed = reconcileSnapshot(authoredSnapshot, this.committed)
    if (reordered && this.layout === undefined) {
      const current = new Map(this.committed.items.map((item) => [item.id, item]))
      this.committed = { version: 1, items: authored.map((item) => current.get(item.id) ?? item) }
    }
    if (this.layout !== this.appliedLayout) {
      this.appliedLayout = this.layout
      if (this.layout === undefined) this.committed = reconcileSnapshot(authoredSnapshot)
      else if (validateSnapshot(this.layout)) this.committed = reconcileSnapshot(authoredSnapshot, this.layout)
      else this.reportError({ reason: 'invalid-layout' })
    }
    if (this.session && (!this.editable || !this.canEdit || range !== this.activeRange || !this.itemById.has(this.session.itemId))) this.cancelSession()
    this.activeRange = range
    this.columnCount = columns
    this.draw()
  }

  private draw(): void {
    if (!this.previousTilePositions) {
      const positions = new Map<string, DOMRect>()
      for (const tile of this.shadowRoot?.querySelectorAll<HTMLElement>('.tile[data-item-id]') ?? []) {
        const id = tile.dataset.itemId
        if (id) positions.set(id, tile.getBoundingClientRect())
      }
      if (positions.size) this.previousTilePositions = positions
    }
    for (const animation of this.tileAnimations.values()) animation.cancel()
    this.tileAnimations.clear()
    const snapshot = this.session?.candidate ?? this.committed
    const inputs = snapshot.items.map((item) => ({ id: item.id, columnSpan: item.columns[this.activeRange], rowSpan: item.rows }))
    const { placements } = packMasonry(inputs, this.columnCount)
    this.renderedTiles = placements.map((placement) => ({ ...placement, slot: this.slotById.get(placement.id) ?? '' }))
  }

  private animateRelocatedTiles(): void {
    const previous = this.previousTilePositions
    this.previousTilePositions = undefined
    if (!previous || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const tile of this.shadowRoot?.querySelectorAll<HTMLElement>('.tile[data-item-id]') ?? []) {
      const id = tile.dataset.itemId
      const from = id && previous.get(id)
      if (!id || !from) continue
      const to = tile.getBoundingClientRect()
      const dx = from.left - to.left
      const dy = from.top - to.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      const style = getComputedStyle(tile)
      const time = style.transitionDuration.split(',')[0].trim()
      const duration = parseFloat(time) * (time.endsWith('ms') ? 1 : 1000)
      if (!duration) continue
      const animation = tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration,
        easing: style.transitionTimingFunction.split(',')[0].trim(),
      })
      this.tileAnimations.set(id, animation)
      animation.onfinish = () => {
        if (this.tileAnimations.get(id) === animation) this.tileAnimations.delete(id)
      }
    }
  }

  private controlFromEvent(event: Event): { control: HTMLElement; item: MasonryItem; action: MasonryAction } | undefined {
    const path = event.composedPath()
    const control = path.find((node): node is HTMLElement => node instanceof HTMLElement && !!node.dataset.masonryAction)
    const item = path.find((node): node is MasonryItem => node instanceof HTMLElement && node.localName === 'c2-masonry-item')
    const action = control?.dataset.masonryAction
    if (!control || !item || (action !== 'move' && action !== 'resize')) return undefined
    return { control, item, action }
  }

  private beginSession(item: MasonryItem, kind: MasonryAction, inputMethod: MasonryInputMethod, phase: 'armed' | 'active'): boolean {
    if (!this.editable || !this.canEdit || !item.itemId || !this.committed.items.some((entry) => entry.id === item.itemId)) return false
    this.cancelSession()
    this.session = { kind, inputMethod, itemId: item.itemId, original: cloneSnapshot(this.committed), candidate: cloneSnapshot(this.committed), phase }
    item.toggleAttribute('data-dragging', true)
    this.statusMessage = `${item.label || item.itemId} ${kind} started. Use arrow keys; Enter saves and Escape cancels.`
    this.draw()
    return true
  }

  private startPointer(event: PointerEvent): void {
    const target = this.controlFromEvent(event)
    if (
      !target ||
      !this.beginSession(target.item, target.action, event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse', 'armed')
    )
      return
    event.preventDefault()
    target.control.setPointerCapture(event.pointerId)
    this.pointer = {
      pointerId: event.pointerId,
      control: target.control,
      resizeEdge: target.action === 'resize' ? (target.control.dataset.masonryEdge as PointerSession['resizeEdge']) : undefined,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moveTargets: this.committed.items.flatMap((item) => {
        const rect = this.itemById.get(item.id)?.getBoundingClientRect()
        return rect ? [{ id: item.id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }] : []
      }),
    }
  }

  private movePointer(event: PointerEvent): void {
    const pointer = this.pointer
    if (!pointer || pointer.pointerId !== event.pointerId) return
    pointer.lastX = event.clientX
    pointer.lastY = event.clientY
    if (this.pointerFrame) return
    this.pointerFrame = requestAnimationFrame(() => {
      this.pointerFrame = 0
      this.applyPointerCandidate()
    })
  }

  private applyPointerCandidate(): void {
    const pointer = this.pointer
    const session = this.session
    if (!pointer || !session) return
    if (Math.hypot(pointer.lastX - pointer.startX, pointer.lastY - pointer.startY) < 4) {
      if (session.phase === 'active') {
        session.candidate = cloneSnapshot(session.original)
        this.draw()
      }
      return
    }
    session.phase = 'active'
    if (session.kind === 'move') {
      const closest = pointer.moveTargets
        .map((target) => ({ id: target.id, distance: Math.hypot(pointer.lastX - target.x, pointer.lastY - target.y) }))
        .sort((a, b) => a.distance - b.distance)[0]
      if (closest) this.moveCandidate(this.committed.items.findIndex((item) => item.id === closest.id))
    } else {
      const cellWidth = Math.max(1, this.clientWidth / this.columnCount)
      const rowHeight = parseFloat(getComputedStyle(this).getPropertyValue('--c2-masonry--row-height')) || 8
      const deltaX = Math.round((pointer.lastX - pointer.startX) / cellWidth)
      const deltaY = Math.round((pointer.lastY - pointer.startY) / rowHeight)
      this.resizeCandidate(pointer.resizeEdge === 'right' ? deltaX : 0, pointer.resizeEdge === 'bottom' ? deltaY : 0)
    }
    this.updateAutoScroll(pointer.lastY)
  }

  private endPointer(event: PointerEvent): void {
    if (!this.pointer || this.pointer.pointerId !== event.pointerId) return
    this.pointer.lastX = event.clientX
    this.pointer.lastY = event.clientY
    cancelAnimationFrame(this.pointerFrame)
    this.pointerFrame = 0
    this.applyPointerCandidate()
    const control = this.pointer.control
    this.pointer = undefined
    if (control.hasPointerCapture(event.pointerId)) control.releasePointerCapture(event.pointerId)
    this.commitSession()
  }

  private handleKey(event: KeyboardEvent): void {
    const target = this.controlFromEvent(event)
    if (!target || !this.editable || !this.canEdit) return
    if (!this.session) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      this.beginSession(target.item, target.action, 'keyboard', 'active')
      return
    }
    if (this.session.inputMethod !== 'keyboard' || this.session.itemId !== target.item.itemId || this.session.kind !== target.action) return
    if (event.key === 'Escape') {
      event.preventDefault()
      this.cancelSession()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.commitSession()
      return
    }
    const index = this.session.candidate.items.findIndex((item) => item.id === this.session?.itemId)
    if (target.action === 'move') {
      const last = this.session.candidate.items.length - 1
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? index - 1
              : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? index + 1
                : index
      if (next === index && !['Home', 'End', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      this.moveCandidate(Math.max(0, Math.min(last, next)))
    } else {
      const columnDelta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      const rowDelta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      if (!columnDelta && !rowDelta) return
      event.preventDefault()
      const base = this.session.original.items.find((item) => item.id === this.session?.itemId)
      const current = this.session.candidate.items.find((item) => item.id === this.session?.itemId)
      if (!base || !current) return
      current.columns[this.activeRange] = Math.max(1, Math.min(MASONRY_COLUMN_COUNT[this.activeRange], current.columns[this.activeRange] + columnDelta))
      current.rows = Math.max(1, current.rows + rowDelta)
      this.statusMessage = `${target.item.label || target.item.itemId}: ${current.columns[this.activeRange]} columns, ${current.rows} rows.`
      this.draw()
    }
  }

  private moveCandidate(targetIndex: number): void {
    if (!this.session) return
    const candidate = cloneSnapshot(this.session.original)
    const from = candidate.items.findIndex((item) => item.id === this.session?.itemId)
    if (from < 0) return
    const [item] = candidate.items.splice(from, 1)
    candidate.items.splice(Math.max(0, Math.min(candidate.items.length, targetIndex)), 0, item)
    this.session.candidate = candidate
    this.statusMessage = `${this.itemById.get(item.id)?.label || item.id}: position ${candidate.items.findIndex((entry) => entry.id === item.id) + 1} of ${candidate.items.length}.`
    this.draw()
  }

  private resizeCandidate(columnDelta: number, rowDelta: number): void {
    if (!this.session) return
    const candidate = cloneSnapshot(this.session.original)
    const item = candidate.items.find((entry) => entry.id === this.session?.itemId)
    if (!item) return
    item.columns[this.activeRange] = Math.max(1, Math.min(MASONRY_COLUMN_COUNT[this.activeRange], item.columns[this.activeRange] + columnDelta))
    item.rows = Math.max(1, item.rows + rowDelta)
    this.session.candidate = candidate
    this.statusMessage = `${this.itemById.get(item.id)?.label || item.id}: ${item.columns[this.activeRange]} columns, ${item.rows} rows.`
    this.draw()
  }

  private commitSession(): void {
    const session = this.session
    if (!session) return
    const changed = JSON.stringify(session.original) !== JSON.stringify(session.candidate)
    this.finishSession()
    if (!changed) {
      this.statusMessage = 'No layout change.'
      return
    }
    this.committed = cloneSnapshot(session.candidate)
    this.saveCommittedLayout()
    this.draw()
    this.statusMessage = `${this.itemById.get(session.itemId)?.label || session.itemId} ${session.kind} saved.`
    const detail: MasonryLayoutChangeDetail = {
      layout: cloneSnapshot(this.committed),
      itemId: session.itemId,
      action: session.kind,
      inputMethod: session.inputMethod,
    }
    this.dispatchEvent(new CustomEvent<MasonryLayoutChangeDetail>('layout-change', { detail }))
  }

  private cancelSession(): void {
    if (!this.session) return
    const item = this.itemById.get(this.session.itemId)
    const label = item?.label || this.session.itemId
    this.finishSession()
    this.draw()
    this.statusMessage = `${label} edit canceled.`
    if (!item?.isConnected) this.focus()
  }

  private finishSession(): void {
    cancelAnimationFrame(this.pointerFrame)
    this.pointerFrame = 0
    const id = this.session?.itemId
    if (id) this.itemById.get(id)?.removeAttribute('data-dragging')
    this.session = undefined
    if (this.pointer) {
      const { control, pointerId } = this.pointer
      this.pointer = undefined
      if (control.hasPointerCapture(pointerId)) control.releasePointerCapture(pointerId)
    }
    cancelAnimationFrame(this.scrollFrame)
    this.scrollFrame = 0
  }

  private updateAutoScroll(clientY: number): void {
    cancelAnimationFrame(this.scrollFrame)
    let scroller: HTMLElement | null = this.parentElement
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
    scroller ??= document.scrollingElement as HTMLElement | null
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    const direction = clientY < rect.top + 48 ? -1 : clientY > rect.bottom - 48 ? 1 : 0
    if (!direction) return
    const tick = () => {
      if (!this.pointer || !this.session) return
      scroller.scrollTop += direction * 12
      this.scrollFrame = requestAnimationFrame(tick)
    }
    this.scrollFrame = requestAnimationFrame(tick)
  }

  override render() {
    const activeId = this.session?.itemId
    return html`<div part="grid" class="grid" style="--masonry-columns:${this.columnCount}">
        ${repeat(
          this.renderedTiles,
          (placement) => placement.id,
          (placement) =>
            html`<div
              class="tile"
              data-item-id=${placement.id}
              style="grid-column:${placement.columnStart + 1} / span ${placement.columnSpan};grid-row:${placement.rowStart + 1} / span ${placement.rowSpan}"
            >
              <slot name=${placement.slot}></slot>
            </div>`,
        )}
        ${
          activeId && this.session?.phase === 'active'
            ? this.renderedTiles
                .filter((tile) => tile.id === activeId)
                .map(
                  (tile) =>
                    html`<div
                      part="placeholder"
                      class="placeholder"
                      style="grid-column:${tile.columnStart + 1} / span ${tile.columnSpan};grid-row:${tile.rowStart + 1} / span ${tile.rowSpan}"
                      aria-hidden="true"
                    ></div>`,
                )
            : null
        }
      </div>
      <span class="sr-only" role="status" aria-live="polite">${this.statusMessage}</span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-masonry': Masonry
  }
}
