import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { KanbanColumn, KANBAN_COLUMN_CHANGE_EVENT, type KanbanCardView } from './kanban-column'
import styles from './kanban.scss?inline'

export { KanbanColumn } from './kanban-column'

/** One card's data. The board reads its key, its column and (for the default renderer) its title and description. */
export type KanbanItem = Record<string, unknown>

export type KanbanInputMethod = 'mouse' | 'touch' | 'pen' | 'keyboard'

/** What `renderItem` receives for each card. */
export interface KanbanRenderContext<T extends KanbanItem = KanbanItem> {
  item: T
  /** Position of the card in its column, starting at 0. */
  index: number
  /** `column-id` of the column showing the card. */
  column: string
}

/** Renders a card's content: a Lit template, a DOM node or a string. The board draws the card box around it. */
export type KanbanItemRenderer<T extends KanbanItem = KanbanItem> = (context: KanbanRenderContext<T>) => unknown

/** Detail of the `card-move` event. Indexes count the cards of one column, starting at 0. */
export interface KanbanCardMoveDetail<T extends KanbanItem = KanbanItem> {
  /** The moved item, as it was before the move. */
  item: T
  /** The item's key (`item-key` field). */
  key: string
  /** `column-id` of the column the card left. */
  fromColumn: string
  /** `column-id` of the column the card landed in; equal to `fromColumn` for a move within a column. */
  toColumn: string
  fromIndex: number
  toIndex: number
  inputMethod: KanbanInputMethod
  /** The whole `items` array after the move: the moved item is a copy with its column field updated. */
  items: T[]
}

/** Events fired by {@link Kanban}, keyed for `addEventListener`. */
export interface KanbanEventMap {
  'card-move': CustomEvent<KanbanCardMoveDetail>
}

export interface Kanban {
  addEventListener: TypedAddEventListener<Kanban, KanbanEventMap>
  removeEventListener: TypedRemoveEventListener<Kanban, KanbanEventMap>
}

interface Point {
  x: number
  y: number
}

interface Position {
  column: string
  index: number
}

interface MoveSession {
  phase: 'armed' | 'dragging' | 'keyboard'
  inputMethod: KanbanInputMethod
  key: string
  from: Position
  /** `items` with the card at its current destination. */
  candidate: KanbanItem[]
  pointerId?: number
  origin?: Point
  latest?: Point
  offset?: Point
  size?: { width: number; height: number }
  /** Viewport position of `left: 0; top: 0` for the dragged card, which an ancestor's transform, filter or containment moves. */
  fixedOrigin?: Point
}

const INTERACTIVE_SELECTOR = 'a[href],button,input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),[draggable="true"]'
const DRAG_THRESHOLD = 8
const EDGE_SCROLL_ZONE = 48
const EDGE_SCROLL_STEP = 10

/**
 * A board of `c2-kanban-column` columns whose cards people move with a pointer or the keyboard. The board owns the
 * layout and the interaction only: the cards come from `items` and are drawn by `renderItem` (by default, a title and
 * a description read from `label-field` and `description-field`). Each column lays out its own header, cards and
 * footer, and offers `header`, `footer` and `empty` slots.
 *
 * A move updates `items` (the moved item becomes a copy with its column field set) and fires `card-move`, which an
 * application listens to in order to save it; calling `preventDefault()` on the event keeps the card where it was.
 * Moving needs `editable`. With the keyboard, Tab reaches the board's one focusable card and the arrow keys move
 * between cards; Space picks a card up, the arrow keys, Home and End move it, Space drops it and Escape cancels. Give
 * the board an accessible name with `aria-label` or `aria-labelledby`.
 *
 * @tag c2-kanban
 *
 * @slotcomponent c2-kanban-column
 *
 * @slot - `c2-kanban-column` elements, in display order.
 *
 * @csspart board - Scrolling row that holds the columns.
 *
 * @event {CustomEvent<KanbanCardMoveDetail>} card-move - Fired when the user drops a card in a new place, before `items` changes. Cancelable: `preventDefault()` keeps the card where it was. Bubbles and crosses shadow boundaries.
 *
 * @cssproperty {length} [--c2-kanban--gap=12px] - Space between columns.
 * @cssproperty {padding} [--c2-kanban--padding=4px] - Padding inside the scrolling row; keeps focus rings clear of its clipping edge.
 * @cssproperty {string} [--c2-kanban--scroll-snap-type=none] - Scroll snapping of the row; `x mandatory` snaps to columns.
 */
@customElement('c2-kanban')
export class Kanban extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The cards' data, in display order within each column. An array in the property, JSON in the attribute. */
  @property({ converter: jsonPropertyConverter }) items: KanbanItem[] = []

  /** Field holding an item's unique key. */
  @property({ type: String, attribute: 'item-key' }) itemKey = 'id'

  /** Field holding the `column-id` of an item's column. An item whose column matches no column is not shown. */
  @property({ type: String, attribute: 'column-field' }) columnField = 'column'

  /** Field the default renderer shows as the card's title, and the label used in announcements. */
  @property({ type: String, attribute: 'label-field' }) labelField = 'title'

  /** Field the default renderer shows as a muted second line. */
  @property({ type: String, attribute: 'description-field' }) descriptionField = 'description'

  /** Renders a card's content, replacing the default title and description. */
  @property({ attribute: false }) renderItem?: KanbanItemRenderer

  /** Lets people move cards with a pointer or the keyboard. */
  @property({ type: Boolean, reflect: true }) editable = false

  @query('.board') private boardElement?: HTMLElement

  @state() private columns: readonly KanbanColumn[] = []
  @state() private session: MoveSession | null = null
  @state() private announcement = ''
  @state() private focusedKey: string | null = null

  private readonly generatedKeys = new WeakMap<object, string>()
  private keyCounter = 0
  private pendingFocus: string | null = null
  private scrollFrame = 0
  private releasingCapture = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener(KANBAN_COLUMN_CHANGE_EVENT, this.handleColumnChange)
  }

  override disconnectedCallback(): void {
    this.removeEventListener(KANBAN_COLUMN_CHANGE_EVENT, this.handleColumnChange)
    this.finishSession()
    super.disconnectedCallback()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('editable') && !this.editable && this.session) this.cancelSession('Moving canceled because the board is no longer editable.')
    if (changed.has('items') && this.session && changed.get('items') !== undefined) this.cancelSession('Cards changed. Moving canceled.')
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    this.syncColumns()
    if (this.session?.phase === 'dragging') this.positionDraggedCard()
    if (this.pendingFocus) {
      const key = this.pendingFocus
      this.pendingFocus = null
      void Promise.all(this.columns.map((column) => column.updateComplete)).then(() => this.wrapperFor(key)?.focus())
    }
  }

  protected override render(): TemplateResult {
    return html`
      <div
        part="board"
        class="board"
        role="group"
        aria-label=${this.accessibleName() || nothing}
        @pointerdown=${this.handlePointerDown}
        @pointermove=${this.handlePointerMove}
        @pointerup=${this.handlePointerUp}
        @pointercancel=${this.handlePointerCancel}
        @lostpointercapture=${this.handleLostPointerCapture}
        @keydown=${this.handleKeyDown}
        @focusin=${this.handleFocusIn}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
      <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">${this.announcement}</p>
    `
  }

  // ---- data ----

  private keyOf(item: KanbanItem): string {
    const value = item?.[this.itemKey]
    if (value !== undefined && value !== null && value !== '') return String(value)
    let key = this.generatedKeys.get(item)
    if (!key) {
      key = `c2-kanban-item-${++this.keyCounter}`
      this.generatedKeys.set(item, key)
    }
    return key
  }

  private columnOf(item: KanbanItem): string {
    const value = item?.[this.columnField]
    return value === undefined || value === null ? '' : String(value)
  }

  private get sourceItems(): KanbanItem[] {
    return Array.isArray(this.items) ? this.items : []
  }

  /** Items of every column, in display order, keyed by `column-id`. */
  private layoutOf(items: readonly KanbanItem[]): Map<string, KanbanItem[]> {
    const layout = new Map<string, KanbanItem[]>()
    for (const column of this.columns) if (!layout.has(column.columnId)) layout.set(column.columnId, [])
    for (const item of items) layout.get(this.columnOf(item))?.push(item)
    return layout
  }

  private positionOf(items: readonly KanbanItem[], key: string): Position | null {
    for (const [column, list] of this.layoutOf(items)) {
      const index = list.findIndex((item) => this.keyOf(item) === key)
      if (index >= 0) return { column, index }
    }
    return null
  }

  private itemByKey(items: readonly KanbanItem[], key: string): KanbanItem | undefined {
    return items.find((item) => this.keyOf(item) === key)
  }

  /** `items` with the item taken out and put back into `column` at `index`; a column change copies the item. */
  private placeItem(items: readonly KanbanItem[], key: string, column: string, index: number): KanbanItem[] {
    const item = this.itemByKey(items, key)
    if (!item) return [...items]
    const rest = items.filter((candidate) => candidate !== item)
    let moved = item
    if (this.columnOf(item) !== column) {
      moved = { ...item, [this.columnField]: column }
      const generated = this.generatedKeys.get(item)
      if (generated) this.generatedKeys.set(moved, generated)
    }
    const siblings = rest.filter((candidate) => this.columnOf(candidate) === column)
    const bounded = Math.max(0, Math.min(siblings.length, index))
    let at: number
    if (bounded < siblings.length) at = rest.indexOf(siblings[bounded])
    else if (siblings.length) at = rest.indexOf(siblings[siblings.length - 1]) + 1
    else at = rest.length
    rest.splice(at, 0, moved)
    return rest
  }

  // ---- columns ----

  private handleSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this.columns = slot.assignedElements().filter((element): element is KanbanColumn => element instanceof KanbanColumn)
  }

  private readonly handleColumnChange = (event: Event): void => {
    if (event.target !== this) this.requestUpdate()
  }

  /** Hands each column the cards it shows. */
  private syncColumns(): void {
    const session = this.session
    const items = session?.candidate ?? this.sourceItems
    const layout = this.layoutOf(items)
    const dragging = session?.phase === 'dragging' ? session : null
    const tabbable = this.tabbableKey(layout)
    for (const column of this.columns) {
      const list = layout.get(column.columnId) ?? []
      column.editable = this.editable
      column.target = !!dragging && this.positionOf(items, dragging.key)?.column === column.columnId
      column.cards = list.map((item, index): KanbanCardView => {
        const key = this.keyOf(item)
        if (dragging?.key === key) return { key: `${key}::placeholder`, content: nothing, placeholder: true, height: dragging.size?.height }
        return {
          key,
          content: this.renderContent(item, index, column.columnId),
          tabbable: key === tabbable,
          picked: session?.phase === 'keyboard' && session.key === key,
        }
      })
      const draggedItem = dragging && dragging.from.column === column.columnId ? this.itemByKey(items, dragging.key) : undefined
      column.dragged = draggedItem ? { key: dragging!.key, content: this.renderContent(draggedItem, dragging!.from.index, column.columnId) } : null
    }
  }

  private renderContent(item: KanbanItem, index: number, column: string): unknown {
    if (this.renderItem) return this.renderItem({ item, index, column })
    const description = this.descriptionField ? item?.[this.descriptionField] : undefined
    return html`<div class="card__title">${this.itemLabel(item)}</div>
      ${description !== undefined && description !== null && description !== '' ? html`<div class="card__description">${String(description)}</div>` : nothing}`
  }

  // ---- keyboard ----

  private tabbableKey(layout: Map<string, KanbanItem[]>): string | null {
    const keys = [...layout.values()].flat().map((item) => this.keyOf(item))
    if (this.focusedKey && keys.includes(this.focusedKey)) return this.focusedKey
    for (const column of this.columns) {
      const first = layout.get(column.columnId)?.[0]
      if (first) return this.keyOf(first)
    }
    return null
  }

  private handleFocusIn(event: FocusEvent): void {
    const key = this.wrapperFromEvent(event)?.dataset.key
    if (key && !key.endsWith('::placeholder') && this.focusedKey !== key) this.focusedKey = key
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const wrapper = this.wrapperFromEvent(event)
    const key = wrapper?.dataset.key
    if (!this.editable || !wrapper || !key || this.hasInteractiveOrigin(event, wrapper)) return
    const session = this.session
    if (session?.phase === 'keyboard' && session.key === key) {
      this.handleKeyboardMove(event, session)
      return
    }
    if (session) return

    if (event.code === 'Space') {
      event.preventDefault()
      const from = this.positionOf(this.sourceItems, key)
      if (!from) return
      this.session = { phase: 'keyboard', inputMethod: 'keyboard', key, from, candidate: [...this.sourceItems] }
      const count = this.layoutOf(this.sourceItems).get(from.column)?.length ?? 0
      this.announcement = `${this.labelFor(key)} picked up in ${this.columnLabel(from.column)}, position ${from.index + 1} of ${count}. Use the arrow keys to move it, Space to drop it, Escape to cancel.`
      return
    }
    const target = this.navigationTarget(event.key, key)
    if (target === undefined) return
    event.preventDefault()
    if (target) this.focusCard(target)
  }

  /** Key of the card the arrow, Home and End keys move focus to; `undefined` for any other key. */
  private navigationTarget(keyName: string, key: string): string | null | undefined {
    const layout = this.layoutOf(this.sourceItems)
    const position = this.positionOf(this.sourceItems, key)
    if (!position) return undefined
    const cards = layout.get(position.column) ?? []
    const pick = (item: KanbanItem | undefined) => (item ? this.keyOf(item) : null)
    if (keyName === 'ArrowUp') return pick(cards[position.index - 1])
    if (keyName === 'ArrowDown') return pick(cards[position.index + 1])
    if (keyName === 'Home') return pick(cards[0])
    if (keyName === 'End') return pick(cards[cards.length - 1])
    if (keyName !== 'ArrowLeft' && keyName !== 'ArrowRight') return undefined
    const step = keyName === 'ArrowLeft' ? -1 : 1
    const ids = this.columns.map((column) => column.columnId)
    for (let index = ids.indexOf(position.column) + step; index >= 0 && index < ids.length; index += step) {
      const next = layout.get(ids[index]) ?? []
      if (next.length) return pick(next[Math.min(position.index, next.length - 1)])
    }
    return null
  }

  private handleKeyboardMove(event: KeyboardEvent, session: MoveSession): void {
    const key = session.key
    if (event.code === 'Space') {
      event.preventDefault()
      this.commitSession()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      this.pendingFocus = key
      this.cancelSession(`${this.labelFor(key)} returned to ${this.columnLabel(session.from.column)}, position ${session.from.index + 1}.`)
      return
    }
    const position = this.positionOf(session.candidate, key)
    if (!position) return
    const layout = this.layoutOf(session.candidate)
    const ids = this.columns.map((column) => column.columnId)
    const count = layout.get(position.column)?.length ?? 0
    let column = position.column
    let index = position.index
    let edge = ''
    if (event.key === 'ArrowUp') {
      if (index > 0) index--
      else edge = 'at the top of its column'
    } else if (event.key === 'ArrowDown') {
      if (index < count - 1) index++
      else edge = 'at the bottom of its column'
    } else if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = count - 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const next = ids[ids.indexOf(position.column) + (event.key === 'ArrowLeft' ? -1 : 1)]
      if (next === undefined) edge = `in the ${event.key === 'ArrowLeft' ? 'first' : 'last'} column`
      else {
        column = next
        index = Math.min(position.index, (layout.get(next) ?? []).length)
      }
    } else return
    event.preventDefault()
    if (edge) {
      this.announcement = `${this.labelFor(key)} is already ${edge}.`
      return
    }
    if (column === position.column && index === position.index) return
    session.candidate = this.placeItem(session.candidate, key, column, index)
    this.pendingFocus = key
    this.announcement = `${this.labelFor(key)} moved to ${this.columnLabel(column)}, position ${index + 1} of ${this.layoutOf(session.candidate).get(column)?.length}.`
    this.requestUpdate()
  }

  private focusCard(key: string): void {
    this.focusedKey = key
    this.pendingFocus = key
    this.requestUpdate()
  }

  // ---- pointer ----

  private handlePointerDown(event: PointerEvent): void {
    if (!this.editable || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || this.session) return
    const wrapper = this.wrapperFromEvent(event)
    const key = wrapper?.dataset.key
    if (!wrapper || !key || this.hasInteractiveOrigin(event, wrapper)) return
    const from = this.positionOf(this.sourceItems, key)
    if (!from) return
    const point = { x: event.clientX, y: event.clientY }
    this.session = {
      phase: 'armed',
      inputMethod: event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse',
      key,
      from,
      candidate: [...this.sourceItems],
      pointerId: event.pointerId,
      origin: point,
      latest: point,
    }
    document.addEventListener('keydown', this.handleDocumentKeyDown)
  }

  private handlePointerMove(event: PointerEvent): void {
    const session = this.session
    if (!session || session.pointerId !== event.pointerId || !session.origin) return
    session.latest = { x: event.clientX, y: event.clientY }
    if (session.phase === 'armed') {
      if (Math.abs(event.clientX - session.origin.x) + Math.abs(event.clientY - session.origin.y) < DRAG_THRESHOLD) return
      const rect = this.wrapperFor(session.key)?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.finishSession()
        return
      }
      session.phase = 'dragging'
      // Measured from the press, not from where the pointer crossed the threshold, so the card stays where it was grabbed.
      session.offset = { x: session.origin.x - rect.left, y: session.origin.y - rect.top }
      session.size = { width: rect.width, height: rect.height }
      this.releasingCapture = false
      this.boardElement?.setPointerCapture(event.pointerId)
      this.announcement = `${this.labelFor(session.key)} picked up.`
      this.requestUpdate()
    }
    if (session.phase !== 'dragging') return
    event.preventDefault()
    this.positionDraggedCard()
    this.updatePointerDestination()
    this.startAutoScroll()
  }

  private handlePointerUp(event: PointerEvent): void {
    const session = this.session
    if (!session || session.pointerId !== event.pointerId) return
    if (session.phase !== 'dragging') {
      this.finishSession()
      return
    }
    // A margin around the board forgives a drop just past its edge, which moves as columns grow and shrink.
    const rect = this.boardElement?.getBoundingClientRect()
    const margin = EDGE_SCROLL_ZONE
    const inside =
      !!rect &&
      event.clientX >= rect.left - margin &&
      event.clientX <= rect.right + margin &&
      event.clientY >= rect.top - margin &&
      event.clientY <= rect.bottom + margin
    if (inside) this.commitSession()
    else this.cancelSession(`${this.labelFor(session.key)} returned to where it was.`)
  }

  private handlePointerCancel(event: PointerEvent): void {
    if (this.session?.pointerId === event.pointerId) this.cancelSession(`${this.labelFor(this.session.key)} returned to where it was.`)
  }

  private handleLostPointerCapture(event: PointerEvent): void {
    if (!this.releasingCapture && this.session?.phase === 'dragging' && this.session.pointerId === event.pointerId) {
      this.cancelSession(`${this.labelFor(this.session.key)} returned to where it was.`)
    }
  }

  private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
    const session = this.session
    if (event.key !== 'Escape' || !session || session.phase === 'keyboard') return
    event.preventDefault()
    this.cancelSession(`${this.labelFor(session.key)} returned to where it was.`)
  }

  /** Column under the pointer (the nearest one horizontally), then the slot among its other cards by vertical midpoint. */
  private updatePointerDestination(): void {
    const session = this.session
    const point = session?.latest
    if (!session || session.phase !== 'dragging' || !point) return
    let best: { column: KanbanColumn; distance: number } | null = null
    for (const column of this.columns) {
      const rect = column.getBoundingClientRect()
      const distance = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0
      if (!best || distance < best.distance) best = { column, distance }
    }
    if (!best) return
    const wrappers = [...(best.column.cardsElement?.querySelectorAll<HTMLElement>(':scope > .card[data-key]') ?? [])]
    let index = wrappers.length
    for (let position = 0; position < wrappers.length; position++) {
      const rect = wrappers[position].getBoundingClientRect()
      if (point.y < rect.top + rect.height / 2) {
        index = position
        break
      }
    }
    const column = best.column.columnId
    const current = this.positionOf(session.candidate, session.key)
    if (current?.column === column && current.index === index) return
    session.candidate = this.placeItem(session.candidate, session.key, column, index)
    this.requestUpdate()
  }

  private positionDraggedCard(): void {
    const session = this.session
    const element = this.columns.find((column) => column.columnId === session?.from.column)?.draggedElement
    if (!session?.latest || !session.offset || !session.size || !element) return
    if (!session.fixedOrigin) {
      // `position: fixed` is relative to the viewport only while no ancestor creates a containing block.
      element.style.left = '0px'
      element.style.top = '0px'
      element.style.transform = 'none'
      const origin = element.getBoundingClientRect()
      element.style.removeProperty('transform')
      session.fixedOrigin = { x: origin.left, y: origin.top }
    }
    element.style.left = `${Math.round(session.latest.x - session.offset.x - session.fixedOrigin.x)}px`
    element.style.top = `${Math.round(session.latest.y - session.offset.y - session.fixedOrigin.y)}px`
    element.style.width = `${session.size.width}px`
  }

  /** Scrolls the board sideways, and the column under the pointer up or down, while the pointer is near an edge. */
  private startAutoScroll(): void {
    if (this.scrollFrame) return
    const step = () => {
      this.scrollFrame = 0
      const session = this.session
      const point = session?.latest
      const board = this.boardElement
      if (!session || session.phase !== 'dragging' || !point || !board) return
      let moved = false
      const rect = board.getBoundingClientRect()
      const dx = point.x < rect.left + EDGE_SCROLL_ZONE ? -1 : point.x > rect.right - EDGE_SCROLL_ZONE ? 1 : 0
      if (dx) {
        const before = board.scrollLeft
        board.scrollLeft += dx * EDGE_SCROLL_STEP
        moved ||= board.scrollLeft !== before
      }
      const target = this.positionOf(session.candidate, session.key)?.column
      const list = this.columns.find((column) => column.columnId === target)?.cardsElement
      if (list && list.scrollHeight > list.clientHeight) {
        const listRect = list.getBoundingClientRect()
        const dy = point.y < listRect.top + EDGE_SCROLL_ZONE ? -1 : point.y > listRect.bottom - EDGE_SCROLL_ZONE ? 1 : 0
        if (dy) {
          const before = list.scrollTop
          list.scrollTop += dy * EDGE_SCROLL_STEP
          moved ||= list.scrollTop !== before
        }
      }
      if (!moved) return
      this.updatePointerDestination()
      this.scrollFrame = requestAnimationFrame(step)
    }
    this.scrollFrame = requestAnimationFrame(step)
  }

  // ---- session ----

  private commitSession(): void {
    const session = this.session
    if (!session) return
    const to = this.positionOf(session.candidate, session.key)
    const keyboard = session.inputMethod === 'keyboard'
    const label = this.labelFor(session.key)
    this.finishSession()
    this.focusedKey = session.key
    if (keyboard) this.pendingFocus = session.key
    if (!to || (to.column === session.from.column && to.index === session.from.index)) {
      if (keyboard) this.announcement = `${label} dropped where it was.`
      return
    }
    const item = this.itemByKey(this.sourceItems, session.key)
    if (!item) return
    const detail: KanbanCardMoveDetail = {
      item,
      key: session.key,
      fromColumn: session.from.column,
      toColumn: to.column,
      fromIndex: session.from.index,
      toIndex: to.index,
      inputMethod: session.inputMethod,
      items: session.candidate,
    }
    const accepted = this.dispatchEvent(new CustomEvent<KanbanCardMoveDetail>('card-move', { bubbles: true, composed: true, cancelable: true, detail }))
    if (!accepted) {
      this.announcement = `${label} could not move to ${this.columnLabel(to.column)} and returned to where it was.`
      return
    }
    this.items = session.candidate
    this.announcement = `${label} dropped in ${this.columnLabel(to.column)}, position ${to.index + 1} of ${this.layoutOf(session.candidate).get(to.column)?.length}.`
  }

  private cancelSession(message: string): void {
    this.finishSession()
    this.announcement = message
  }

  private finishSession(): void {
    document.removeEventListener('keydown', this.handleDocumentKeyDown)
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame)
    this.scrollFrame = 0
    const pointerId = this.session?.pointerId
    if (pointerId !== undefined && this.boardElement?.hasPointerCapture(pointerId)) {
      this.releasingCapture = true
      this.boardElement.releasePointerCapture(pointerId)
    }
    this.session = null
  }

  // ---- helpers ----

  /** The card box an event came from, inside one of the columns' shadow roots. */
  private wrapperFromEvent(event: Event): HTMLElement | null {
    return (event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('card') && node.dataset.key) as HTMLElement) ?? null
  }

  private wrapperFor(key: string): HTMLElement | null {
    for (const column of this.columns) {
      const wrapper = [...(column.cardsElement?.querySelectorAll<HTMLElement>(':scope > .card[data-key]') ?? [])].find((element) => element.dataset.key === key)
      if (wrapper) return wrapper
    }
    return null
  }

  private hasInteractiveOrigin(event: Event, wrapper: HTMLElement): boolean {
    for (const node of event.composedPath()) {
      if (node === wrapper) return false
      if (node instanceof Element && node.matches(INTERACTIVE_SELECTOR)) return true
    }
    return false
  }

  private itemLabel(item: KanbanItem | undefined): string {
    const value = item?.[this.labelField]
    return value === undefined || value === null ? '' : String(value)
  }

  private labelFor(key: string): string {
    return this.itemLabel(this.itemByKey(this.session?.candidate ?? this.sourceItems, key)) || 'Card'
  }

  private columnLabel(id: string): string {
    const column = this.columns.find((candidate) => candidate.columnId === id)
    return column?.label || id
  }

  private accessibleName(): string {
    const direct = this.getAttribute('aria-label')?.trim()
    if (direct) return direct
    const ids = this.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? []
    return ids
      .map((id) => this.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-kanban': Kanban
  }
}
