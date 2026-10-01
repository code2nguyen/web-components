import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { KanbanColumn, KANBAN_COLUMN_CHANGE_EVENT } from './kanban-column'
import styles from './kanban.scss?inline'

export { KanbanColumn } from './kanban-column'

export type KanbanInputMethod = 'mouse' | 'touch' | 'pen' | 'keyboard'

/** Detail of the `card-move` event. Indexes count the cards of one column, starting at 0. */
export interface KanbanCardMoveDetail {
  /** The moved card element. */
  card: HTMLElement
  /** The card's `data-kanban-key`, when it has one. */
  key?: string
  /** `column-id` of the column the card left. */
  fromColumn: string
  /** `column-id` of the column the card landed in; equal to `fromColumn` for a move within a column. */
  toColumn: string
  fromIndex: number
  toIndex: number
  inputMethod: KanbanInputMethod
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

/** Cards of every column, in visual order, keyed by `column-id`. */
type Layout = ReadonlyMap<string, readonly HTMLElement[]>

interface Position {
  column: string
  index: number
}

interface MoveSession {
  phase: 'armed' | 'dragging' | 'keyboard'
  inputMethod: KanbanInputMethod
  card: HTMLElement
  from: Position
  original: Layout
  candidate: Layout
  pointerId?: number
  origin?: Point
  latest?: Point
  offset?: Point
  size?: { width: number; height: number }
}

const INTERACTIVE_SELECTOR = 'a[href],button,input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),[draggable="true"]'
const DRAG_THRESHOLD = 8
const EDGE_SCROLL_ZONE = 48
const EDGE_SCROLL_STEP = 10
let instanceCount = 0

/** The layout with `card` taken out of wherever it is and inserted into `column` at `index`. */
function placeCard(layout: Layout, card: HTMLElement, column: string, index: number): Layout {
  const next = new Map<string, readonly HTMLElement[]>()
  for (const [id, cards] of layout)
    next.set(
      id,
      cards.filter((candidate) => candidate !== card),
    )
  const target = [...(next.get(column) ?? [])]
  target.splice(Math.max(0, Math.min(target.length, index)), 0, card)
  next.set(column, target)
  return next
}

function findCard(layout: Layout, card: HTMLElement): Position | null {
  for (const [column, cards] of layout) {
    const index = cards.indexOf(card)
    if (index >= 0) return { column, index }
  }
  return null
}

function sameMembers(left: readonly HTMLElement[] = [], right: readonly HTMLElement[] = []): boolean {
  return left.length === right.length && left.every((card) => right.includes(card))
}

/**
 * A board of columns whose cards people move with a pointer or the keyboard. Columns are `c2-kanban-column`
 * children; cards are any other direct children and name their column with `data-column`, so a move never re-parents
 * an element the application rendered. The board shows the move immediately and reports it in `card-move`; the
 * application saves it, typically by updating the card's `data-column` and its order. A card whose `data-column`
 * matches no column is not shown.
 *
 * Moving needs `editable`. With the keyboard, Tab reaches the board's one focusable card and the arrow keys move
 * between cards; Space picks a card up, the arrow keys, Home and End move it, Space drops it and Escape cancels.
 * Give the board an accessible name with `aria-label` or `aria-labelledby`.
 *
 * @tag c2-kanban
 *
 * @slotcomponent c2-kanban-column
 *
 * @slot - `c2-kanban-column` elements, then the cards. Card slots are assigned internally and are not consumer API.
 *
 * @csspart board - Scrolling row that holds the columns.
 * @csspart column - Box of one column: its header followed by its cards.
 * @csspart cards - List of the cards of one column.
 * @csspart card - Repeated component-owned placement wrapper around one card assigned from the default slot; carries the focus ring and the drag lift and styles placement, not assigned content.
 * @csspart placeholder - Gap marking where a dragged card will land.
 *
 * @event {CustomEvent<KanbanCardMoveDetail>} card-move - Fired once after the user drops a card in a new place. Bubbles and crosses shadow boundaries.
 *
 * @cssproperty {length} [--c2-kanban__board--gap=12px] - Space between columns.
 * @cssproperty {padding} [--c2-kanban__board--padding=4px] - Padding inside the scrolling row; keeps focus rings clear of its clipping edge.
 * @cssproperty {string} [--c2-kanban__board--scroll-snap-type=none] - Scroll snapping of the row; `x mandatory` snaps to columns.
 * @cssproperty {length} [--c2-kanban__column--width=272px] - Column width.
 * @cssproperty {length} [--c2-kanban__column--max-height=none] - Maximum column height. Pair it with `--c2-kanban__cards--overflow-y: auto` so a long card list scrolls.
 * @cssproperty {padding} [--c2-kanban__column--padding=8px] - Column padding.
 * @cssproperty {length} [--c2-kanban__column--gap=8px] - Space between the header and the cards.
 * @cssproperty {color} [--c2-kanban__column--background-color=#f4f4f5] - Column background.
 * @cssproperty {border} [--c2-kanban__column--border=1px solid transparent] - Column border.
 * @cssproperty {border-radius} [--c2-kanban__column--border-radius=8px] - Column radius.
 * @cssproperty {color} [--c2-kanban__column__target--border-color=rgb(2, 101, 220)] - Border colour of the column a dragged card is over.
 * @cssproperty {color} [--c2-kanban__column__target--background-color=#edf1fe] - Background of the column a dragged card is over.
 * @cssproperty {color} [--c2-kanban__column__over--border-color=#dc2626] - Border colour of a column holding more cards than its limit.
 * @cssproperty {length} [--c2-kanban__cards--gap=8px] - Space between cards.
 * @cssproperty {length} [--c2-kanban__cards--min-height=40px] - Minimum height of a card list, the drop area of an empty column.
 * @cssproperty {string} [--c2-kanban__cards--overflow-y=visible] - Vertical overflow of a card list; `auto` scrolls it inside a column with a max height (and clips the cards' shadows).
 * @cssproperty {border-radius} [--c2-kanban__card--border-radius=6px] - Radius of the card wrapper, matching the cards it holds.
 * @cssproperty {outline} [--c2-kanban__card__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Keyboard focus ring.
 * @cssproperty {length} [--c2-kanban__card__focus--outline-offset=2px] - Keyboard focus ring offset.
 * @cssproperty {outline} [--c2-kanban__card__picked--outline=2px solid rgb(2, 101, 220)] - Outline of a card picked up with the keyboard.
 * @cssproperty {box-shadow} [--c2-kanban__card__picked--box-shadow=0 12px 28px rgba(15, 23, 42, 0.24)] - Shadow of a picked-up or dragged card.
 * @cssproperty {transform} [--c2-kanban__card__dragging--transform=rotate(2deg)] - Tilt of a card while it follows the pointer.
 * @cssproperty {number} [--c2-kanban__card__dragging--opacity=0.94] - Opacity of a card while it follows the pointer.
 * @cssproperty {border} [--c2-kanban__placeholder--border=2px dashed rgb(2, 101, 220)] - Border of the drop gap.
 * @cssproperty {color} [--c2-kanban__placeholder--background-color=rgba(2, 101, 220, 0.08)] - Background of the drop gap.
 */
@customElement('c2-kanban')
export class Kanban extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Lets people move cards with a pointer or the keyboard. */
  @property({ type: Boolean, reflect: true }) editable = false

  @query('.board') private boardElement?: HTMLElement

  @state() private columns: readonly KanbanColumn[] = []
  @state() private layout: Layout = new Map()
  @state() private session: MoveSession | null = null
  @state() private announcement = ''
  @state() private focusedCard: HTMLElement | null = null

  private readonly instructionsId = `c2-kanban-instructions-${++instanceCount}`
  private readonly slotNames = new WeakMap<HTMLElement, string>()
  private slotCounter = 0
  private observer?: MutationObserver
  private pendingFocus: HTMLElement | null = null
  private scrollFrame = 0
  private releasingCapture = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener(KANBAN_COLUMN_CHANGE_EVENT, this.handleColumnChange)
    this.observer = new MutationObserver((records) => {
      // Only the board's own children matter: edits inside a card must not cancel a move in progress.
      if (records.some((record) => (record.type === 'childList' ? record.target === this : (record.target as Element).parentElement === this))) this.reconcile()
    })
    this.observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-column'] })
    this.reconcile()
  }

  override disconnectedCallback(): void {
    this.removeEventListener(KANBAN_COLUMN_CHANGE_EVENT, this.handleColumnChange)
    this.observer?.disconnect()
    this.finishSession()
    super.disconnectedCallback()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('editable') && !this.editable && this.session) this.cancelSession('Moving canceled because the board is no longer editable.')
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    const shown = this.session?.candidate ?? this.layout
    for (const column of this.columns) column.cardCount = shown.get(column.columnId)?.length ?? 0
    if (this.session?.phase === 'dragging') this.positionDraggedCard()
    if (this.pendingFocus) {
      const card = this.pendingFocus
      this.pendingFocus = null
      this.wrapperFor(card)?.focus()
    }
  }

  protected override render(): TemplateResult {
    const session = this.session
    const shown = session?.candidate ?? this.layout
    const dragged = session?.phase === 'dragging' ? session.card : null
    const targetColumn = dragged ? findCard(shown, dragged)?.column : undefined
    const tabbable = this.tabbableCard(shown)

    return html`
      <p id=${this.instructionsId} class="visually-hidden">
        Press Space to pick up a card. Use the arrow keys, Home or End to move it; Space drops it and Escape cancels.
      </p>
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
      >
        ${repeat(
          this.columns,
          (column) => this.slotName(column),
          (column) => {
            const cards = shown.get(column.columnId) ?? []
            const over = column.limit > 0 && cards.length > column.limit
            return html`
              <section
                part="column"
                class=${classMap({ column: true, 'column--target': targetColumn === column.columnId, 'column--over': over })}
                data-column-id=${column.columnId}
              >
                <slot name=${this.slotName(column)}></slot>
                <div part="cards" class="cards" role="list" aria-label=${column.label || column.columnId}>
                  ${repeat(
                    cards,
                    (card) => (card === dragged ? '__placeholder' : this.slotName(card)),
                    (card, index) => (card === dragged ? this.renderPlaceholder() : this.renderCard(card, index, cards.length, card === tabbable)),
                  )}
                </div>
              </section>
            `
          },
        )}
      </div>
      ${dragged ? this.renderDraggedCard(dragged) : nothing}
      <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">${this.announcement}</p>
    `
  }

  private renderCard(card: HTMLElement, index: number, count: number, tabbable: boolean): TemplateResult {
    const picked = this.session?.phase === 'keyboard' && this.session.card === card
    return html`
      <div
        part="card"
        class=${classMap({ card: true, 'card--movable': this.editable, 'card--picked': picked })}
        data-slot=${this.slotName(card)}
        role="listitem"
        aria-posinset=${index + 1}
        aria-setsize=${count}
        aria-describedby=${this.editable ? this.instructionsId : nothing}
        tabindex=${this.editable ? (tabbable ? 0 : -1) : nothing}
        @focus=${() => this.handleCardFocus(card)}
        @keydown=${(event: KeyboardEvent) => this.handleKeyDown(event, card)}
      >
        <slot name=${this.slotName(card)}></slot>
      </div>
    `
  }

  private renderPlaceholder(): TemplateResult {
    const size = this.session?.size
    return html`<div part="placeholder" class="placeholder" style=${styleMap({ height: size ? `${size.height}px` : null })} aria-hidden="true"></div>`
  }

  private renderDraggedCard(card: HTMLElement): TemplateResult {
    return html`
      <div part="card" class="card card--dragging" data-slot=${this.slotName(card)} aria-hidden="true">
        <slot name=${this.slotName(card)}></slot>
      </div>
    `
  }

  // ---- light DOM ----

  private readonly handleColumnChange = (event: Event): void => {
    if (event.target !== this) this.reconcile()
  }

  /** Reads columns and cards from the light DOM. A user's move survives as long as every column keeps the same cards. */
  private reconcile(): void {
    const columns: KanbanColumn[] = []
    const cards: HTMLElement[] = []
    for (const child of this.children) {
      if (child instanceof KanbanColumn) columns.push(child)
      else if (child instanceof HTMLElement) cards.push(child)
    }
    const authored = new Map<string, HTMLElement[]>()
    for (const column of columns) if (!authored.has(column.columnId)) authored.set(column.columnId, [])
    for (const card of cards) authored.get(card.dataset.column ?? '')?.push(card)

    if (this.session) this.cancelSession('Cards changed. Moving canceled.')
    for (const element of [...columns, ...cards]) {
      const name = this.slotName(element)
      if (element.getAttribute('slot') !== name) element.setAttribute('slot', name)
    }
    // A column keeps the order the user gave it while it holds the same cards; any other column follows DOM order.
    const layout = new Map<string, readonly HTMLElement[]>()
    for (const [id, list] of authored) {
      const current = this.layout.get(id)
      layout.set(id, current && sameMembers(list, current) ? current : list)
    }
    this.columns = columns
    this.layout = layout
    if (this.focusedCard && !findCard(this.layout, this.focusedCard)) this.focusedCard = null
  }

  private slotName(element: HTMLElement): string {
    let name = this.slotNames.get(element)
    if (!name) {
      name = `c2-kanban-${++this.slotCounter}`
      this.slotNames.set(element, name)
    }
    return name
  }

  // ---- keyboard ----

  private tabbableCard(layout: Layout): HTMLElement | null {
    if (this.focusedCard && findCard(layout, this.focusedCard)) return this.focusedCard
    for (const column of this.columns) {
      const first = layout.get(column.columnId)?.[0]
      if (first) return first
    }
    return null
  }

  private handleCardFocus(card: HTMLElement): void {
    if (this.focusedCard !== card) this.focusedCard = card
  }

  private handleKeyDown(event: KeyboardEvent, card: HTMLElement): void {
    if (!this.editable || this.hasInteractiveOrigin(event, event.currentTarget as HTMLElement)) return
    const session = this.session
    if (session?.phase === 'keyboard' && session.card === card) {
      this.handleKeyboardMove(event, session)
      return
    }
    if (session) return

    if (event.code === 'Space') {
      event.preventDefault()
      const from = findCard(this.layout, card)
      if (!from) return
      this.session = { phase: 'keyboard', inputMethod: 'keyboard', card, from, original: this.layout, candidate: this.layout }
      this.announcement = `${this.cardLabel(card)} picked up in ${this.columnLabel(from.column)}, position ${from.index + 1} of ${this.layout.get(from.column)?.length}. Use the arrow keys to move it, Space to drop it, Escape to cancel.`
      return
    }
    const target = this.navigationTarget(event.key, card)
    if (target === undefined) return
    event.preventDefault()
    if (target) this.focusCard(target)
  }

  /** Card the arrow, Home and End keys move focus to; `undefined` for any other key. */
  private navigationTarget(key: string, card: HTMLElement): HTMLElement | null | undefined {
    const position = findCard(this.layout, card)
    if (!position) return undefined
    const cards = this.layout.get(position.column) ?? []
    if (key === 'ArrowUp') return cards[position.index - 1] ?? null
    if (key === 'ArrowDown') return cards[position.index + 1] ?? null
    if (key === 'Home') return cards[0] ?? null
    if (key === 'End') return cards[cards.length - 1] ?? null
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return undefined
    const step = key === 'ArrowLeft' ? -1 : 1
    const ids = this.columns.map((column) => column.columnId)
    for (let index = ids.indexOf(position.column) + step; index >= 0 && index < ids.length; index += step) {
      const next = this.layout.get(ids[index]) ?? []
      if (next.length) return next[Math.min(position.index, next.length - 1)]
    }
    return null
  }

  private handleKeyboardMove(event: KeyboardEvent, session: MoveSession): void {
    const card = session.card
    if (event.code === 'Space') {
      event.preventDefault()
      this.commitSession()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      this.pendingFocus = card
      this.cancelSession(`${this.cardLabel(card)} returned to ${this.columnLabel(session.from.column)}, position ${session.from.index + 1}.`)
      return
    }
    const position = findCard(session.candidate, card)
    if (!position) return
    const ids = this.columns.map((column) => column.columnId)
    const columnIndex = ids.indexOf(position.column)
    const count = session.candidate.get(position.column)?.length ?? 0
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
      const next = ids[columnIndex + (event.key === 'ArrowLeft' ? -1 : 1)]
      if (next === undefined) edge = `in the ${event.key === 'ArrowLeft' ? 'first' : 'last'} column`
      else {
        column = next
        index = Math.min(position.index, (session.candidate.get(next) ?? []).length)
      }
    } else return
    event.preventDefault()
    if (edge) {
      this.announcement = `${this.cardLabel(card)} is already ${edge}.`
      return
    }
    if (column === position.column && index === position.index) return
    session.candidate = placeCard(session.candidate, card, column, index)
    this.pendingFocus = card
    this.announcement = `${this.cardLabel(card)} moved to ${this.columnLabel(column)}, position ${index + 1} of ${session.candidate.get(column)?.length}.`
    this.requestUpdate()
  }

  private focusCard(card: HTMLElement): void {
    this.focusedCard = card
    this.pendingFocus = card
    this.requestUpdate()
  }

  // ---- pointer ----

  private handlePointerDown(event: PointerEvent): void {
    if (!this.editable || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || this.session) return
    const wrapper = this.wrapperFromEvent(event)
    const card = wrapper ? this.cardForWrapper(wrapper) : null
    if (!wrapper || !card || this.hasInteractiveOrigin(event, wrapper)) return
    const from = findCard(this.layout, card)
    if (!from) return
    const point = { x: event.clientX, y: event.clientY }
    this.session = {
      phase: 'armed',
      inputMethod: event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse',
      card,
      from,
      original: this.layout,
      candidate: this.layout,
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
      const rect = this.wrapperFor(session.card)?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.finishSession()
        return
      }
      session.phase = 'dragging'
      session.offset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      session.size = { width: rect.width, height: rect.height }
      this.releasingCapture = false
      this.boardElement?.setPointerCapture(event.pointerId)
      this.announcement = `${this.cardLabel(session.card)} picked up.`
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
    else this.cancelSession(`${this.cardLabel(session.card)} returned to where it was.`)
  }

  private handlePointerCancel(event: PointerEvent): void {
    if (this.session?.pointerId === event.pointerId) this.cancelSession(`${this.cardLabel(this.session.card)} returned to where it was.`)
  }

  private handleLostPointerCapture(event: PointerEvent): void {
    if (!this.releasingCapture && this.session?.phase === 'dragging' && this.session.pointerId === event.pointerId) {
      this.cancelSession(`${this.cardLabel(this.session.card)} returned to where it was.`)
    }
  }

  private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
    const session = this.session
    if (event.key !== 'Escape' || !session || session.phase === 'keyboard') return
    event.preventDefault()
    this.cancelSession(`${this.cardLabel(session.card)} returned to where it was.`)
  }

  /** Column under the pointer (the nearest one horizontally), then the slot among its other cards by vertical midpoint. */
  private updatePointerDestination(): void {
    const session = this.session
    const point = session?.latest
    if (!session || session.phase !== 'dragging' || !point) return
    let best: { element: HTMLElement; distance: number } | null = null
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>('.column')) {
      const rect = element.getBoundingClientRect()
      const distance = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0
      if (!best || distance < best.distance) best = { element, distance }
    }
    if (!best) return
    const column = best.element.dataset.columnId ?? ''
    const wrappers = [...best.element.querySelectorAll<HTMLElement>('.card[data-slot]')]
    let index = wrappers.length
    for (let position = 0; position < wrappers.length; position++) {
      const rect = wrappers[position].getBoundingClientRect()
      if (point.y < rect.top + rect.height / 2) {
        index = position
        break
      }
    }
    const current = findCard(session.candidate, session.card)
    if (current?.column === column && current.index === index) return
    session.candidate = placeCard(session.candidate, session.card, column, index)
    this.requestUpdate()
  }

  private positionDraggedCard(): void {
    const session = this.session
    const element = this.renderRoot.querySelector<HTMLElement>('.card--dragging')
    if (!session?.latest || !session.offset || !session.size || !element) return
    element.style.left = `${Math.round(session.latest.x - session.offset.x)}px`
    element.style.top = `${Math.round(session.latest.y - session.offset.y)}px`
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
      const column = this.renderRoot.querySelector<HTMLElement>('.column--target .cards')
      if (column && column.scrollHeight > column.clientHeight) {
        const columnRect = column.getBoundingClientRect()
        const dy = point.y < columnRect.top + EDGE_SCROLL_ZONE ? -1 : point.y > columnRect.bottom - EDGE_SCROLL_ZONE ? 1 : 0
        if (dy) {
          const before = column.scrollTop
          column.scrollTop += dy * EDGE_SCROLL_STEP
          moved ||= column.scrollTop !== before
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
    const to = findCard(session.candidate, session.card)
    const keyboard = session.inputMethod === 'keyboard'
    if (!to || (to.column === session.from.column && to.index === session.from.index)) {
      this.finishSession()
      if (keyboard) {
        this.pendingFocus = session.card
        this.announcement = `${this.cardLabel(session.card)} dropped where it was.`
      }
      return
    }
    this.layout = session.candidate
    this.finishSession()
    const key = session.card.dataset.kanbanKey?.trim()
    const detail: KanbanCardMoveDetail = {
      card: session.card,
      ...(key ? { key } : {}),
      fromColumn: session.from.column,
      toColumn: to.column,
      fromIndex: session.from.index,
      toIndex: to.index,
      inputMethod: session.inputMethod,
    }
    this.focusedCard = session.card
    if (keyboard) this.pendingFocus = session.card
    this.announcement = `${this.cardLabel(session.card)} dropped in ${this.columnLabel(to.column)}, position ${to.index + 1} of ${this.layout.get(to.column)?.length}.`
    this.dispatchEvent(new CustomEvent<KanbanCardMoveDetail>('card-move', { bubbles: true, composed: true, detail }))
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

  private wrapperFromEvent(event: Event): HTMLElement | null {
    return (event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('card') && node.dataset.slot) as HTMLElement) ?? null
  }

  private cardForWrapper(wrapper: HTMLElement): HTMLElement | null {
    for (const cards of this.layout.values()) {
      const card = cards.find((candidate) => this.slotName(candidate) === wrapper.dataset.slot)
      if (card) return card
    }
    return null
  }

  private wrapperFor(card: HTMLElement): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`.cards .card[data-slot="${this.slotName(card)}"]`)
  }

  private hasInteractiveOrigin(event: Event, wrapper: HTMLElement | null): boolean {
    for (const node of event.composedPath()) {
      if (node === wrapper) return false
      if (node instanceof Element && node.matches(INTERACTIVE_SELECTOR)) return true
    }
    return false
  }

  private cardLabel(card: HTMLElement): string {
    return card.dataset.kanbanLabel?.trim() || card.getAttribute('aria-label')?.trim() || card.textContent?.replace(/\s+/g, ' ').trim() || 'Card'
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
