import { LitElement, html, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { KanbanColumn, KANBAN_COLUMN_CHANGE_EVENT, type KanbanCardView } from './kanban-column'
import {
  DropZoneController,
  endItemDrag,
  itemDropTargetAt,
  itemDropTargetOf,
  startItemDrag,
  startNativeItemDrag,
  writeItemPayload,
  type DropZoneItems,
  type ItemDrag,
  type ItemDropTarget,
} from '@c2n/core/controllers/drop-zone.js'
import type { KanbanTextArgs, KanbanTextKey } from './kanban-text'
import { LocalizeController } from '@c2n/core/localize.js'
import { kanbanMessages } from './messages.js'
import styles from './kanban.scss?inline'

export { KanbanColumn } from './kanban-column'

/** One card's data. The board reads its key, its column and (for the default renderer) its title and description. */
export type KanbanItem = Record<string, unknown>

export type KanbanInputMethod = 'mouse' | 'touch' | 'pen' | 'keyboard'

/** A direction the arrow keys move in, as `neighbourColumn` receives it. */
export type KanbanDirection = 'left' | 'right' | 'up' | 'down'

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

/** Detail of the `item-drop` event: cards dropped on the board from outside it, before `items` changes. */
export interface KanbanItemDropDetail<T extends KanbanItem = KanbanItem> {
  /** The payload kind of the drop: the board's `drop-kind`. */
  kind: string
  /** The cards the board adds, as copies placed in `toColumn`, in the order of the payload. */
  added: T[]
  /** The dropped entries the board turns away: not an object, or a key the board already holds. */
  refused: unknown[]
  /** `column-id` of the column the cards land in. */
  toColumn: string
  /** Position of the first added card in that column, starting at 0. */
  toIndex: number
  /** The whole `items` array after the drop. */
  items: T[]
}

/** Detail of the `item-move-out` event: cards that another place took, before they leave `items`. */
export interface KanbanItemMoveOutDetail<T extends KanbanItem = KanbanItem> {
  /** The payload kind they left as: the board's `drag-kind`. */
  kind: string
  /** The cards that leave, as they were. */
  removed: T[]
  /**
   * The c2n element that took them (another board, a list, a tree). A drop anywhere else (a text field, a page's own drop area, another
   * window) takes a copy, and they stay.
   */
  target: Element
  /** The whole `items` array once they have left. */
  items: T[]
}

/** Events fired by {@link Kanban}, keyed for `addEventListener`. */
export interface KanbanEventMap {
  'card-move': CustomEvent<KanbanCardMoveDetail>
  'item-drop': CustomEvent<KanbanItemDropDetail>
  'item-move-out': CustomEvent<KanbanItemMoveOutDetail>
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
  /** The card carried off the board (`drag-kind`), and the zone under the pointer that would take it. */
  out?: { drag: ItemDrag; target: ItemDropTarget | null }
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
 * @event {CustomEvent<KanbanItemMoveOutDetail>} item-move-out - Fired when another place took cards of the `drag-kind` payload from the board (a pointer drag carried off it, the drag handle's drag ending in a move, or `moveItemTo`), before they leave `items`. Cancelable: `preventDefault()` keeps them, which makes the move a copy. Does not bubble.
 * @event {CustomEvent<KanbanItemDropDetail>} item-drop - Fired when cards of the `drop-kind` payload are dropped on the board from outside it, before `items` changes. Cancelable: `preventDefault()` adds none of them. Does not bubble: each of `c2-kanban`, `c2-reorder-list` and `c2-tree` sends its own `detail`, so a drop on one nested in another must not reach the outer one's listeners. Listen on the element itself.
 *
 * @cssproperty {length} [--c2-kanban--gap=12px] - Space between columns.
 * @cssproperty {padding} [--c2-kanban--padding=4px] - Padding inside the scrolling row; keeps focus rings clear of its clipping edge.
 * @cssproperty {string} [--c2-kanban--scroll-snap-type=none] - Scroll snapping of the row; `x mandatory` snaps to columns.
 * @cssproperty {color} [--c2-kanban__board__drop-target--outline-color=#0265dc] - Outline of the board while cards of its `drop-kind` are dragged over it.
 * @cssproperty {string} [--c2-kanban__board__drop-target--outline-style=dashed] - Outline style while a drop is possible.
 * @cssproperty {length} [--c2-kanban__board__drop-target--outline-width=2px] - Outline width while a drag is over the board.
 * @cssproperty {length} [--c2-kanban__board__drop-target--outline-offset=-2px] - Outline offset; negative keeps it inside the scrolling row.
 * @cssproperty {color} [--c2-kanban__board__drop-refused--outline-color=#dc2626] - Outline of the board while another kind of item is dragged over it, which it refuses.
 */
@customElement('c2-kanban')
export class Kanban extends LitElement {
  /** ES-private, so a variant may keep a `msg` of its own. */
  readonly #msg = new LocalizeController(this, kanbanMessages)

  static override styles: CSSResultGroup = unsafeCSS(styles)

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

  /**
   * The kind of item payload the board takes from outside (another board, a list in the page, another window), as a
   * source writes it with `writeItemPayload(dataTransfer, kind, items)` from `@c2n/core/controllers/drop-zone.js`
   * (MIME type `application/x-c2n-<kind>+json`). Empty (the default) takes none. Needs `editable`. A drop adds the
   * cards to the column under the pointer, at the position under it, fires `item-drop` and announces how many were
   * added; a card whose key the board already holds is not added.
   */
  @property({ type: String, attribute: 'drop-kind' }) dropKind = ''

  /**
   * The kind of item payload cards leave the board as, for a board, list or tree whose `drop-kind` is the same. Empty
   * (the default), cards stay on the board. Set, on an `editable` board: a pointer drag carried off the board drops
   * the card on the zone under the pointer that takes this kind; each card shows a drag handle (the `drag-handle`
   * part) whose drag the browser carries as JSON and a line of text (dropped back on the board, it moves the card there; a drop
   * outside c2n, in another window too, is a copy); and `moveItemTo` moves a
   * card from code, the keyboard path an application wires to a command. A card another place took leaves `items` (a
   * move) and `item-move-out` fires first.
   */
  @property({ type: String, attribute: 'drag-kind' }) dragKind = ''

  @query('.board') private boardElement?: HTMLElement

  /** The columns the board lays cards out in, in display order. A variant that renders its own columns sets it in `update()`. */
  protected columnElements: readonly KanbanColumn[] = []
  @state() private session: MoveSession | null = null
  @state() private announcement = ''
  @state() private focusedKey: string | null = null

  private readonly generatedKeys = new WeakMap<object, string>()
  private readonly dropZone = new DropZoneController(this, {
    itemKind: () => this.dropKind,
    disabled: () => !this.editable || !!this.session,
    onItems: (drop) => this.receiveDrop(drop),
    onOwnDrop: ({ point }) => this.dropOwnCard(point),
  })
  private dropAnnouncement = ''
  private keyCounter = 0
  private pendingFocus: string | null = null
  private scrollFrame = 0
  private releasingCapture = false
  /** The card the browser carries from its drag handle: the drag, and the card's key read when it started. */
  private nativeDrag: { drag: ItemDrag; key: string } | null = null

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener(KANBAN_COLUMN_CHANGE_EVENT, this.handleColumnChange)
  }

  override disconnectedCallback(): void {
    this.removeEventListener(KANBAN_COLUMN_CHANGE_EVENT, this.handleColumnChange)
    this.finishSession()
    // A browser drag from a handle ends with the board too, once it is still out of the page a task later (moved, it is
    // back by then): the drop it may still make elsewhere is a copy.
    const carried = this.nativeDrag
    if (carried)
      setTimeout(() => {
        if (this.isConnected || this.nativeDrag !== carried) return
        this.nativeDrag = null
        endItemDrag(carried.drag)
      })
    super.disconnectedCallback()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('editable') && !this.editable && this.session) this.cancelSession(this.text('readOnly'))
    if (changed.has('items') && this.session && changed.get('items') !== undefined) this.cancelSession(this.text('itemsChanged'))
    // What the drop zone announces after a drop from outside goes through the board's one live region, clear included,
    // so the same sentence twice is read again.
    if (this.dropZone.announcement !== this.dropAnnouncement) {
      this.dropAnnouncement = this.dropZone.announcement
      this.announcement = this.dropAnnouncement
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    this.syncColumns()
    if (this.session?.phase === 'dragging') this.positionDraggedCard()
    if (this.pendingFocus) {
      const key = this.pendingFocus
      this.pendingFocus = null
      void Promise.all(this.columnElements.map((column) => column.updateComplete)).then(() => this.wrapperFor(key)?.focus())
    }
  }

  protected override render(): TemplateResult {
    return html`
      <div
        part="board"
        class=${this.dropZone.over ? (this.dropZone.acceptable ? 'board board--drop-target' : 'board board--drop-refused') : 'board'}
        role="group"
        aria-label=${this.accessibleName() || nothing}
        @pointerdown=${this.handlePointerDown}
        @pointermove=${this.handlePointerMove}
        @pointerup=${this.handlePointerUp}
        @pointercancel=${this.handlePointerCancel}
        @lostpointercapture=${this.handleLostPointerCapture}
        @keydown=${this.handleKeyDown}
        @focusin=${this.handleFocusIn}
        @dragenter=${this.dropZone.handleDragEnter}
        @dragover=${this.dropZone.handleDragOver}
        @dragleave=${this.dropZone.handleDragLeave}
        @drop=${this.dropZone.handleDrop}
        @dragstart=${this.handleHandleDragStart}
        @dragend=${this.handleHandleDragEnd}
      >
        ${this.renderColumns()}
      </div>
      <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">${this.announcement || nothing}</p>
    `
  }

  /** What goes inside the board's scrolling row: the slot of `c2-kanban-column` children. */
  protected renderColumns(): unknown {
    return html`<slot @slotchange=${this.handleSlotChange}></slot>`
  }

  /** An announcement in the page's language, from the `kanban` catalog; a variant overrides it to read its own. */
  protected text<K extends KanbanTextKey>(key: K, ...args: KanbanTextArgs<K>): string {
    return (this.#msg.t as (key: string, ...values: unknown[]) => string)(key, ...args)
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

  /** The id of the column an item belongs in. */
  protected columnOf(item: KanbanItem): string {
    const value = item?.[this.columnField]
    return value === undefined || value === null ? '' : String(value)
  }

  private get sourceItems(): KanbanItem[] {
    return Array.isArray(this.items) ? this.items : []
  }

  /** The items as the board shows them: with a card mid-move at its current destination. */
  protected get shownItems(): KanbanItem[] {
    return this.session?.candidate ?? this.sourceItems
  }

  /** Items of every column, in display order, keyed by `column-id`. */
  protected layoutOf(items: readonly KanbanItem[]): Map<string, KanbanItem[]> {
    const layout = new Map<string, KanbanItem[]>()
    for (const column of this.columnElements) if (!layout.has(column.columnId)) layout.set(column.columnId, [])
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
      moved = this.withColumn(item, column)
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

  /** A copy of the item placed in another column. */
  protected withColumn(item: KanbanItem, column: string): KanbanItem {
    return { ...item, [this.columnField]: column }
  }

  /** The column next to another one in a direction, or `undefined` at the edge: a board's columns sit side by side. */
  protected neighbourColumn(column: string, direction: KanbanDirection): string | undefined {
    if (direction === 'up' || direction === 'down') return undefined
    const ids = this.columnElements.map((element) => element.columnId)
    return ids[ids.indexOf(column) + (direction === 'left' ? -1 : 1)]
  }

  /** The column a dragged card is over: the nearest one horizontally. */
  protected columnAt(point: { x: number; y: number }): KanbanColumn | null {
    let best: { column: KanbanColumn; distance: number } | null = null
    for (const column of this.columnElements) {
      const rect = column.getBoundingClientRect()
      const distance = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0
      if (!best || distance < best.distance) best = { column, distance }
    }
    return best?.column ?? null
  }

  /** The `card-move` detail as the board reports it; a variant adds its own fields. */
  protected moveDetail(detail: KanbanCardMoveDetail): KanbanCardMoveDetail {
    return detail
  }

  // ---- columns ----

  private handleSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this.columnElements = slot.assignedElements().filter((element): element is KanbanColumn => element instanceof KanbanColumn)
    this.requestUpdate()
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
    for (const column of this.columnElements) {
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
          handle: this.editable && !!this.dragKind,
        }
      })
      const draggedItem = dragging && dragging.from.column === column.columnId ? this.itemByKey(items, dragging.key) : undefined
      column.dragged = draggedItem
        ? { key: dragging!.key, content: this.renderContent(draggedItem, dragging!.from.index, column.columnId), handle: this.editable && !!this.dragKind }
        : null
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
    for (const column of this.columnElements) {
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
      this.announcement = this.text('pickedUp', this.labelFor(key), this.columnLabel(from.column), from.index + 1, count)
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
    /** Cards of the nearest column that has any, going one way from the card's column. */
    const along = (direction: KanbanDirection): KanbanItem[] | undefined => {
      for (let id = this.neighbourColumn(position.column, direction); id !== undefined; id = this.neighbourColumn(id, direction)) {
        const next = layout.get(id) ?? []
        if (next.length) return next
      }
      return undefined
    }
    if (keyName === 'ArrowUp') return position.index > 0 ? pick(cards[position.index - 1]) : pick(along('up')?.slice(-1)[0])
    if (keyName === 'ArrowDown') return position.index < cards.length - 1 ? pick(cards[position.index + 1]) : pick(along('down')?.[0])
    if (keyName === 'Home') return pick(cards[0])
    if (keyName === 'End') return pick(cards[cards.length - 1])
    if (keyName !== 'ArrowLeft' && keyName !== 'ArrowRight') return undefined
    const next = along(keyName === 'ArrowLeft' ? 'left' : 'right')
    return next ? pick(next[Math.min(position.index, next.length - 1)]) : null
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
      this.cancelSession(this.text('returned', this.labelFor(key), this.columnLabel(session.from.column), session.from.index + 1))
      return
    }
    const position = this.positionOf(session.candidate, key)
    if (!position) return
    const layout = this.layoutOf(session.candidate)
    const count = layout.get(position.column)?.length ?? 0
    let column = position.column
    let index = position.index
    let edge: 'atTop' | 'atBottom' | 'atStart' | 'atEnd' | '' = ''
    if (event.key === 'ArrowUp') {
      const above = index > 0 ? undefined : this.neighbourColumn(column, 'up')
      if (index > 0) index--
      else if (above === undefined) edge = 'atTop'
      else {
        column = above
        index = layout.get(above)?.length ?? 0
      }
    } else if (event.key === 'ArrowDown') {
      const below = index < count - 1 ? undefined : this.neighbourColumn(column, 'down')
      if (index < count - 1) index++
      else if (below === undefined) edge = 'atBottom'
      else {
        column = below
        index = 0
      }
    } else if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = count - 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const next = this.neighbourColumn(position.column, event.key === 'ArrowLeft' ? 'left' : 'right')
      if (next === undefined) edge = event.key === 'ArrowLeft' ? 'atStart' : 'atEnd'
      else {
        column = next
        index = Math.min(position.index, (layout.get(next) ?? []).length)
      }
    } else return
    event.preventDefault()
    if (edge) {
      this.announcement = this.text(edge, this.labelFor(key))
      return
    }
    if (column === position.column && index === position.index) return
    session.candidate = this.placeItem(session.candidate, key, column, index)
    this.pendingFocus = key
    this.announcement = this.text('moved', this.labelFor(key), this.columnLabel(column), index + 1, this.layoutOf(session.candidate).get(column)?.length ?? 0)
    this.requestUpdate()
  }

  private focusCard(key: string): void {
    this.focusedKey = key
    this.pendingFocus = key
    this.requestUpdate()
  }

  // ---- pointer ----

  /** The pointer of the last press on the board: what an own drop by the browser's drag reports as its input. */
  private lastPointerType: KanbanInputMethod = 'mouse'

  private handlePointerDown(event: PointerEvent): void {
    if (event.isPrimary) this.lastPointerType = event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse'
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
      this.announcement = this.text('dragStarted', this.labelFor(session.key))
      this.requestUpdate()
    }
    if (session.phase !== 'dragging') return
    event.preventDefault()
    this.positionDraggedCard()
    if (this.carryOut(session)) {
      // Carried off the board: it neither scrolls nor moves the card's place on it any more.
      if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame)
      this.scrollFrame = 0
      return
    }
    this.updatePointerDestination()
    this.startAutoScroll()
  }

  /**
   * Off the board with a `drag-kind`: finds the zone under the pointer that takes the card and shows the drag over it.
   * Returns whether the drag is off the board, where the card's place on the board stays as it was: over a zone that
   * takes it, or past the margin around the board that still counts as a drop on it. A zone under the pointer wins over
   * the board's box and that margin: a board drawn right next to this one takes the card from its first pixel, and a
   * drawer drawn over the board takes what is dropped on it.
   */
  private carryOut(session: MoveSession): boolean {
    const point = session.latest
    const clear = (): false => {
      if (session.out?.target) {
        session.out.target.hover(null)
        session.out.target = null
      }
      return false
    }
    if (!this.dragKind || !point) return clear()
    if (!session.out) {
      const drag = this.dragOutOf(session.key)
      // The card can no longer leave (it is gone from `items`): off the board, the release returns it.
      if (!drag) return !this.nearBoard(point)
      startItemDrag(drag)
      session.out = { drag, target: null }
    }
    const carried = session.out
    const target = itemDropTargetAt(point, carried.drag)
    if (!target && this.nearBoard(point)) return clear()
    if (target !== carried.target) carried.target?.hover(null)
    carried.target = target
    target?.hover(point)
    return true
  }

  /** Whether a point is on the board or within `margin` of it (by default, the margin that still counts as a drop on it). */
  private nearBoard(point: Point, margin = EDGE_SCROLL_ZONE): boolean {
    const rect = this.boardElement?.getBoundingClientRect()
    return !!rect && point.x >= rect.left - margin && point.x <= rect.right + margin && point.y >= rect.top - margin && point.y <= rect.bottom + margin
  }

  private handlePointerUp(event: PointerEvent): void {
    const session = this.session
    if (!session || session.pointerId !== event.pointerId) return
    if (session.phase !== 'dragging') {
      this.finishSession()
      return
    }
    // A margin around the board forgives a drop just past its edge, which moves as columns grow and shrink, unless the
    // drag is over another zone there.
    const point = { x: event.clientX, y: event.clientY }
    session.latest = point
    if (this.dragKind ? !this.carryOut(session) : this.nearBoard(point)) {
      // Back on the board with no move since it left: the place under the pointer, not the one it left from.
      if (this.dragKind) this.updatePointerDestination()
      this.commitSession()
      return
    }
    const out = session.out
    const label = this.labelFor(session.key)
    this.finishSession()
    // Carried off the board onto a zone that takes it: the card moves there.
    if (out?.target && out.target.take(out.drag, point) > 0) this.moveOut(out.drag, out.target.host, session.key)
    else this.announcement = this.text('returnedInPlace', label)
  }

  // ---- leaving the board ----

  /** The drag that carries a card off the board, or `null` when the board lets none leave. */
  private dragOutOf(key: string): ItemDrag | null {
    const item = this.itemByKey(this.sourceItems, key)
    return item && this.editable && this.dragKind ? { kind: this.dragKind, items: [item], source: this } : null
  }

  /**
   * Moves a card to another board, list or tree whose `drop-kind` is the board's `drag-kind`, without a pointer: the
   * keyboard path to another instance, which an application wires to a command (a "Move to…" menu in the card).
   * The card lands at the target's natural place (the end, in the column it comes from when a board has it). Returns
   * whether it moved: not when the board has no `drag-kind`, is not `editable`, the target takes no such card, or a
   * listener cancelled `item-drop` (nothing moves) or `item-move-out` (the target then holds a copy).
   */
  moveItemTo(target: Element, key: string): boolean {
    if (this.session) return false
    const drag = this.dragOutOf(key)
    const zone = drag ? itemDropTargetOf(target, drag) : null
    if (!drag || !zone) return false
    // No page drag to start: the zone takes the items straight away, and a drag in flight elsewhere is left alone.
    if (zone.take(drag) === 0) return false
    return this.moveOut(drag, target, key)
  }

  /**
   * Takes the card of `key` out of `items` once another place took it, unless `item-move-out` is cancelled. By the key
   * read when the move started: `items` may hold new objects by now (an application's immutable update).
   */
  private moveOut(drag: ItemDrag, target: Element, key: string): boolean {
    let keys = new Set([key])
    let removed = this.sourceItems.filter((item) => keys.has(this.keyOf(item)))
    // A card with no key field is known by its object, which an immutable update replaces: then by its content.
    if (!removed.length) {
      const content = safeJson(drag.items[0])
      const matches = content === undefined ? [] : this.sourceItems.filter((item) => safeJson(item) === content)
      // Only a card no other shares the content of: of two alike, which one left cannot be told, so both stay (a copy).
      if (matches.length > 1) return false
      if (matches.length === 1) {
        keys = new Set([this.keyOf(matches[0])])
        removed = [matches[0]]
      }
    }
    // Gone already (the application took the card out of `items` itself while the target added it): it has moved. A
    // keyless card found by neither its object nor its content may have been edited instead: it stays (a copy).
    if (!removed.length) {
      const moved = drag.items[0] as KanbanItem | undefined
      const keyed = moved?.[this.itemKey] !== undefined && moved?.[this.itemKey] !== null && moved?.[this.itemKey] !== ''
      if (!keyed) return false
      this.announcement = this.text('movedOut', this.itemLabel(drag.items[0] as KanbanItem) || this.text('card'))
      return true
    }
    const items = this.sourceItems.filter((item) => !keys.has(this.keyOf(item)))
    const detail: KanbanItemMoveOutDetail = { kind: drag.kind, removed, target, items }
    if (!this.dispatchEvent(new CustomEvent<KanbanItemMoveOutDetail>('item-move-out', { cancelable: true, detail }))) return false
    // Focus inside a card that leaves (the command that moved it) goes to its neighbour in the column, not to the page.
    const focused = removed.map((item) => this.keyOf(item)).find((key) => this.wrapperFor(key)?.matches(':focus-within'))
    if (focused) {
      const position = this.positionOf(this.sourceItems, focused)
      const column = position ? (this.layoutOf(items).get(position.column) ?? []) : []
      // The card that takes its place in the column, the one before it, else the first card left on the board.
      const neighbour = position ? (column[position.index] ?? column[position.index - 1] ?? items[0]) : items[0]
      if (neighbour) this.pendingFocus = this.keyOf(neighbour)
    }
    this.items = items
    this.announcement = this.text('movedOut', this.itemLabel(removed[0]) || this.text('card'))
    return true
  }

  /** A card's drag handle: the browser carries the card, as JSON under the `drag-kind` and a line of text. */
  private readonly handleHandleDragStart = (event: DragEvent): void => {
    // The grip of one of this board's columns only: an app's element of the same class in a card, or a board nested in
    // a card, keeps its own drag.
    const fromHandle = event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element && node.part.contains('drag-handle') && this.columnElements.includes((node.getRootNode() as ShadowRoot).host as KanbanColumn),
      )
    if (!fromHandle || !event.dataTransfer) return
    const wrapper = this.wrapperFromEvent(event)
    const drag = wrapper?.dataset.key && !this.session ? this.dragOutOf(wrapper.dataset.key) : null
    if (!drag || !wrapper) {
      event.preventDefault()
      return
    }
    try {
      writeItemPayload(event.dataTransfer, drag.kind, drag.items)
    } catch {
      // A card that cannot be written as JSON (a cycle, a BigInt) does not leave by the browser's drag.
      event.preventDefault()
      return
    }
    // Move by default: a zone that takes the card moves it; a text field or another app may still copy its text.
    event.dataTransfer.effectAllowed = 'copyMove'
    const rect = wrapper.getBoundingClientRect()
    event.dataTransfer.setDragImage(wrapper, event.clientX - rect.left, event.clientY - rect.top)
    const carried = { drag, key: wrapper.dataset.key! }
    this.nativeDrag = carried
    // A `dragend` that never reached the board (its card left the page): the drag is finished all the same.
    startNativeItemDrag(event, drag, () => {
      if (this.nativeDrag === carried) this.handleHandleDragEnd()
    })
  }

  private readonly handleHandleDragEnd = (): void => {
    const carried = this.nativeDrag
    if (!carried) return
    this.nativeDrag = null
    const { drag, key } = carried
    endItemDrag(drag)
    // Only a c2n zone that took the card moves it, and it says so in `drag.target`. Anything else that took the drop (a
    // text field, a page's own drop area, another window) got a copy: the browser's `dropEffect` cannot tell a place
    // that moved it from one that merely accepted the drop, and WebKit reports `none` here either way.
    // A board made read-only during the drag keeps its cards: the move becomes a copy.
    if (drag.target && this.editable) this.moveOut(drag, drag.target, key)
  }

  private handlePointerCancel(event: PointerEvent): void {
    if (this.session?.pointerId === event.pointerId) this.cancelSession(this.text('returnedInPlace', this.labelFor(this.session.key)))
  }

  private handleLostPointerCapture(event: PointerEvent): void {
    if (!this.releasingCapture && this.session?.phase === 'dragging' && this.session.pointerId === event.pointerId) {
      this.cancelSession(this.text('returnedInPlace', this.labelFor(this.session.key)))
    }
  }

  private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
    const session = this.session
    if (event.key !== 'Escape' || !session || session.phase === 'keyboard') return
    event.preventDefault()
    this.cancelSession(this.text('returnedInPlace', this.labelFor(session.key)))
  }

  /** Column under a point (the nearest one horizontally), then the slot among its cards by vertical midpoint. */
  private destinationAt(point: Point, skip?: string): Position | null {
    const target = this.columnAt(point)
    if (!target) return null
    // Counted without `skip`, the card being moved, whose place is not yet given up.
    const wrappers = [...(target.cardsElement?.querySelectorAll<HTMLElement>(':scope > .card[data-key]') ?? [])].filter(
      (wrapper) => wrapper.dataset.key !== skip,
    )
    let index = wrappers.length
    for (let position = 0; position < wrappers.length; position++) {
      const rect = wrappers[position].getBoundingClientRect()
      if (point.y < rect.top + rect.height / 2) {
        index = position
        break
      }
    }
    return { column: target.columnId, index }
  }

  /** Where the dragged card lands: the destination under the pointer. */
  private updatePointerDestination(): void {
    const session = this.session
    const point = session?.latest
    if (!session || session.phase !== 'dragging' || !point) return
    const destination = this.destinationAt(point)
    if (!destination) return
    const { column, index } = destination
    const current = this.positionOf(session.candidate, session.key)
    if (current?.column === column && current.index === index) return
    session.candidate = this.placeItem(session.candidate, session.key, column, index)
    this.requestUpdate()
  }

  private positionDraggedCard(): void {
    const session = this.session
    const element = this.columnElements.find((column) => column.columnId === session?.from.column)?.draggedElement
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
      const list = this.columnElements.find((column) => column.columnId === target)?.cardsElement
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

  // ---- drops from outside ----

  /** Adds the cards of an item payload dropped on the board at the place under the pointer; returns how many it took. */
  private receiveDrop({ kind, items: dropped, point }: DropZoneItems): number {
    const destination = point ? this.destinationAt(point) : this.endDestinationFor(dropped)
    if (!destination) return 0
    const source = this.sourceItems
    const keys = new Set(source.map((item) => this.keyOf(item)))
    const added: KanbanItem[] = []
    const refused: unknown[] = []
    for (const entry of dropped) {
      const key = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as KanbanItem)[this.itemKey] : undefined
      const hasKey = key !== undefined && key !== null && key !== ''
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || (hasKey && keys.has(String(key)))) {
        refused.push(entry)
        continue
      }
      if (hasKey) keys.add(String(key))
      added.push(this.withColumn(entry as KanbanItem, destination.column))
    }
    if (!added.length) return 0
    const next = this.insertItems(source, destination.column, destination.index, added)
    const detail: KanbanItemDropDetail = { kind, added, refused, toColumn: destination.column, toIndex: destination.index, items: next }
    if (!this.dispatchEvent(new CustomEvent<KanbanItemDropDetail>('item-drop', { cancelable: true, detail }))) return 0
    this.items = next
    return added.length
  }

  /**
   * Where cards moved in without a pointer (`moveItemTo` on another board) land: the end of the column they all come
   * from when this board has it, else of the first column.
   */
  private endDestinationFor(dropped: readonly unknown[]): Position | null {
    const columns = this.columnElements.map((column) => column.columnId)
    const from = new Set(dropped.map((entry) => (entry && typeof entry === 'object' ? this.columnOf(entry as KanbanItem) : undefined)))
    const [only] = from
    const column = from.size === 1 && only !== undefined && columns.includes(only) ? only : columns[0]
    if (column === undefined) return null
    return { column, index: this.layoutOf(this.sourceItems).get(column)?.length ?? 0 }
  }

  /** `items` with new cards inserted into `column` at `index`, in order. */
  private insertItems(items: readonly KanbanItem[], column: string, index: number, added: readonly KanbanItem[]): KanbanItem[] {
    const next = [...items]
    const siblings = next.filter((candidate) => this.columnOf(candidate) === column)
    const bounded = Math.max(0, Math.min(siblings.length, index))
    let at: number
    if (bounded < siblings.length) at = next.indexOf(siblings[bounded])
    else if (siblings.length) at = next.indexOf(siblings[siblings.length - 1]) + 1
    else at = next.length
    next.splice(at, 0, ...added)
    return next
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
      if (keyboard) this.announcement = this.text('droppedInPlace', label)
      return
    }
    const item = this.itemByKey(this.sourceItems, session.key)
    if (!item) return
    const detail = this.moveDetail({
      item,
      key: session.key,
      fromColumn: session.from.column,
      toColumn: to.column,
      fromIndex: session.from.index,
      toIndex: to.index,
      inputMethod: session.inputMethod,
      items: session.candidate,
    })
    const accepted = this.dispatchEvent(new CustomEvent<KanbanCardMoveDetail>('card-move', { bubbles: true, composed: true, cancelable: true, detail }))
    if (!accepted) {
      this.announcement = this.text('refused', label, this.columnLabel(to.column))
      return
    }
    this.items = session.candidate
    this.announcement = this.text('dropped', label, this.columnLabel(to.column), to.index + 1, this.layoutOf(session.candidate).get(to.column)?.length ?? 0)
  }

  /** A card's drag handle dropped back on the board: the card moves to the drop point, as a pointer drag would put it. */
  private dropOwnCard(point: Point): void {
    const key = this.nativeDrag?.key
    const from = key ? this.positionOf(this.sourceItems, key) : null
    const to = key ? this.destinationAt(point, key) : null
    if (!key || !from || !to || this.session || (to.column === from.column && to.index === from.index)) return
    this.session = { phase: 'keyboard', inputMethod: this.lastPointerType, key, from, candidate: this.placeItem(this.sourceItems, key, to.column, to.index) }
    this.commitSession()
  }

  private cancelSession(message: string): void {
    this.finishSession()
    this.announcement = message
  }

  private finishSession(): void {
    const out = this.session?.out
    if (out) {
      out.target?.hover(null)
      endItemDrag(out.drag)
    }
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
    for (const column of this.columnElements) {
      const wrapper = [...(column.cardsElement?.querySelectorAll<HTMLElement>(':scope > .card[data-key]') ?? [])].find((element) => element.dataset.key === key)
      if (wrapper) return wrapper
    }
    return null
  }

  private hasInteractiveOrigin(event: Event, wrapper: HTMLElement): boolean {
    // A finger or a pen on the board's own grip starts the board's drag, which carries the card off it too: few touch browsers
    // run the browser's drag, and the grip neither scrolls nor would do anything else.
    const byHand = event instanceof PointerEvent && event.pointerType !== 'mouse'
    for (const node of event.composedPath()) {
      if (node === wrapper) return false
      if (
        byHand &&
        node instanceof Element &&
        node.part.contains('drag-handle') &&
        this.columnElements.includes((node.getRootNode() as ShadowRoot).host as KanbanColumn)
      )
        continue
      if (node instanceof Element && node.matches(INTERACTIVE_SELECTOR)) return true
    }
    return false
  }

  private itemLabel(item: KanbanItem | undefined): string {
    const value = item?.[this.labelField]
    return value === undefined || value === null ? '' : String(value)
  }

  private labelFor(key: string): string {
    return this.itemLabel(this.itemByKey(this.shownItems, key)) || this.text('card')
  }

  private columnLabel(id: string): string {
    const column = this.columnElements.find((candidate) => candidate.columnId === id)
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

/** `value` as JSON, or `undefined` when it cannot be written (a cycle, a BigInt). */
function safeJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}
