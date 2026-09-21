import { html, LitElement, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { animate, type Options as MotionOptions } from '@lit-labs/motion'
import styles from './reorder-list.scss?inline'

export type ReorderInputMethod = 'mouse' | 'touch' | 'pen' | 'keyboard'

export interface ReorderItemReference {
  element: HTMLElement
  key?: string
}

export interface ReorderEventDetail {
  item: ReorderItemReference
  fromIndex: number
  toIndex: number
  order: readonly ReorderItemReference[]
  inputMethod: ReorderInputMethod
}

export interface ReorderErrorEventDetail {
  reason: 'duplicate-key'
  key: string
  elements: readonly HTMLElement[]
}

/** Events fired by {@link ReorderList}, keyed for `addEventListener`. */
export interface ReorderListEventMap {
  reorder: CustomEvent<ReorderEventDetail>
  'reorder-error': CustomEvent<ReorderErrorEventDetail>
  /** @deprecated Listen for `reorder`. */
  change: CustomEvent<number[]>
}

export interface ReorderList {
  addEventListener: TypedAddEventListener<ReorderList, ReorderListEventMap>
  removeEventListener: TypedRemoveEventListener<ReorderList, ReorderListEventMap>
}

interface Point {
  x: number
  y: number
}

type SessionPhase = 'armed-pointer' | 'dragging-pointer' | 'reordering-keyboard'

interface ReorderSession {
  phase: SessionPhase
  inputMethod: ReorderInputMethod
  item: HTMLElement
  originalOrder: readonly HTMLElement[]
  candidateOrder: readonly HTMLElement[]
  fromIndex: number
  candidateIndex: number
  pointerId?: number
  originPoint?: Point
  latestPoint?: Point
  pickupOffset?: Point
}

const SPECIAL_SLOTS = new Set(['placeholder', 'dragging-item'])
const INTERACTIVE_SELECTOR = 'a[href],button,input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),[draggable="true"]'
const DEFAULT_DRAG_THRESHOLD = 10
const EDGE_SCROLL_ZONE = 40
const EDGE_SCROLL_STEP = 8
let componentId = 0

function parseMotionDuration(value: string): number {
  const duration = Number.parseFloat(value)
  if (!Number.isFinite(duration)) return 0
  return value.trim().endsWith('ms') ? duration : duration * 1000
}

/**
 * Presents consumer-owned direct children as one vertical list and lets users reorder movable items with pointer or
 * keyboard input when `editable`. The component commits visual order immediately without moving consumer-owned light
 * DOM. Applications persist the typed `reorder` result and may later reconcile their authored children.
 *
 * Use `data-fixed` to pin an item at its absolute position, `data-reorder-key` for optional stable application
 * identity, and `data-reorder-label` for announcements. Non-empty keys must be unique. Editable lists need an
 * accessible name through `aria-label` or `aria-labelledby`. Whole-row touch reordering owns the vertical gesture;
 * interactive descendants retain their native behavior and never arm a reorder.
 *
 * @tag c2-reorder-list
 *
 * @slot - Ordinary direct-child items. Numeric or private slot metadata is assigned internally and is not consumer API.
 * @slot placeholder - Optional destination feedback shown only during pointer reordering.
 * @slot dragging-item - Optional pointer preview shown only during pointer reordering.
 *
 * @csspart container - Ordered-list layout and component-owned spacing boundary.
 * @csspart item - Repeated component-owned placement wrapper around the default slot's assigned ordinary item; styles placement, not assigned content.
 * @csspart placeholder - Component-owned destination marker wrapping the `placeholder` slot or its visible fallback; styles placement, not assigned content.
 * @csspart dragging-item - Fixed-position component-owned preview region wrapping the `dragging-item` slot or its recognizable fallback; styles placement, not assigned content.
 *
 * @event {CustomEvent<ReorderEventDetail>} reorder - Fired once after a real committed user reorder. Bubbles and crosses shadow boundaries; not cancelable.
 * @event {CustomEvent<ReorderErrorEventDetail>} reorder-error - Fired when duplicate non-empty item keys prevent pickup.
 * @event {CustomEvent<number[]>} change - Deprecated numeric permutation emitted with `reorder` during the compatibility window.
 *
 * @cssproperty {length} [--c2-reorder-list--container-border-width=0px] - Container border width.
 * @cssproperty {color} [--c2-reorder-list--container-border-color=#bcbcc6] - Container border color.
 * @cssproperty {length} [--c2-reorder-list--container-border-radius=8px] - Container corner radius.
 * @cssproperty {length} [--c2-reorder-list--container-padding=0px] - Container padding.
 * @cssproperty {length} [--c2-reorder-list--container-margin=0px] - Container margin.
 * @cssproperty {length} [--c2-reorder-list--container-gap=0px] - Space between item placements.
 * @cssproperty {color} [--c2-reorder-list--item-background=transparent] - Item placement background.
 * @cssproperty {length} [--c2-reorder-list--item-padding=0px] - Item placement padding.
 * @cssproperty {length} [--c2-reorder-list--divider-height=0px] - Divider thickness.
 * @cssproperty {color} [--c2-reorder-list--divider-color=#bcbcc6] - Divider color.
 * @cssproperty {color} [--c2-reorder-list--placeholder-background=rgb(37 99 235 / 8%)] - Placeholder background.
 * @cssproperty {color} [--c2-reorder-list--dragging-item-background=transparent] - Pointer-preview background.
 * @cssproperty {length} [--c2-reorder-list__item__focus--outline-width=2px] - Keyboard focus-ring width.
 * @cssproperty {color} [--c2-reorder-list__item__focus--outline-color=#2563eb] - Keyboard focus-ring color.
 * @cssproperty {length} [--c2-reorder-list__item__focus--outline-offset=2px] - Keyboard focus-ring offset.
 * @cssproperty {number} [--c2-reorder-list__item__active--opacity=0.45] - Active source opacity.
 * @cssproperty {length} [--c2-reorder-list__placeholder--border-width=2px] - Destination border width.
 * @cssproperty {string} [--c2-reorder-list__placeholder--border-style=dashed] - Destination border style.
 * @cssproperty {color} [--c2-reorder-list__placeholder--border-color=#2563eb] - Destination border color.
 * @cssproperty {number} [--c2-reorder-list__dragging-item--opacity=0.92] - Pointer-preview opacity.
 * @cssproperty {box-shadow} [--c2-reorder-list__dragging-item--box-shadow=0 12px 28px rgb(15 23 42 / 24%)] - Pointer-preview shadow.
 * @cssproperty {time} [--c2-reorder-list__motion--duration=160ms] - Decorative transition duration; zero under reduced motion.
 * @cssproperty {easing-function} [--c2-reorder-list__motion--timing-function=ease] - Decorative transition easing.
 */
@customElement('c2-reorder-list')
export class ReorderList extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Enables pointer and keyboard reordering. */
  @property({ type: Boolean, reflect: true }) editable = false

  /** Minimum summed pointer movement in CSS pixels before pickup. Invalid values use 10. */
  @property({ type: Number }) dragStartThreshold: number = 10

  /** Prevents component-driven scrolling of the nearest eligible vertical ancestor. */
  @property({ type: Boolean }) autoScrollDisabled = false

  @query('.c2-reorder-list-container') private containerElement?: HTMLElement
  @query('.dragging-item') private draggingElement?: HTMLElement

  @state() private visualOrder: readonly HTMLElement[] = []
  @state() private session: ReorderSession | null = null
  @state() private announcement = ''
  @state() private placeholderSize = { width: '0px', height: '0px' }

  private readonly assignmentIds = new WeakMap<HTMLElement, string>()
  private assignmentCounter = 0
  private readonly instructionsId = `c2-reorder-list-instructions-${++componentId}`
  private childListObserver?: MutationObserver
  private resizeObserver?: ResizeObserver
  private visibilityObserver?: MutationObserver
  private focusedItem: HTMLElement | null = null
  private pendingFocus: HTMLElement | 'host' | null = null
  private scrollContainer: HTMLElement | null = null
  private scrollFrame = 0
  private scrollDirection: -1 | 0 | 1 = 0
  private releasingCapture = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.reconcileAuthoredOrder()
    this.observeChildren()
  }

  override disconnectedCallback(): void {
    this.childListObserver?.disconnect()
    this.resizeObserver?.disconnect()
    this.visibilityObserver?.disconnect()
    this.finishSession()
    super.disconnectedCallback()
  }

  protected override willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('editable') && !this.editable && this.session) this.cancelSession('Reordering canceled because editing is no longer available.')
  }

  protected override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    this.observeRenderedSize()
    if (this.session) this.observeSessionVisibility()
    this.restorePendingFocus()
    if (this.session?.phase === 'dragging-pointer') this.positionPointerPreview()
  }

  protected override render(): TemplateResult {
    const order = this.session?.candidateOrder ?? this.visualOrder
    const pointerItem = this.session?.phase === 'dragging-pointer' ? this.session.item : null
    const entries: Array<HTMLElement | 'placeholder'> = order.map((item) => (item === pointerItem ? 'placeholder' : item))
    const activeLabel = this.session ? this.getItemLabel(this.session.item) : ''

    return html`
      <p id=${this.instructionsId} class="visually-hidden">
        Press Space to pick up an item. Use Arrow keys, Home, or End to move it; Space drops and Escape cancels.
      </p>
      <div
        part="container"
        class="c2-reorder-list-container"
        role="list"
        aria-label=${this.getAccessibleName() || nothing}
        @pointerdown=${this.handlePointerDown}
        @pointermove=${this.handlePointerMove}
        @pointerup=${this.handlePointerUp}
        @pointercancel=${this.handlePointerCancel}
        @lostpointercapture=${this.handleLostPointerCapture}
      >
        ${repeat(
          entries,
          (entry) => (entry === 'placeholder' ? '__placeholder' : this.getAssignmentId(entry)),
          (entry) => (entry === 'placeholder' ? this.renderPlaceholder() : this.renderItem(entry, order)),
        )}
      </div>
      <div part="dragging-item" class=${classMap({ 'dragging-item': true, 'dragging-item--active': pointerItem !== null })} aria-hidden="true" inert>
        <slot name="dragging-item"><span class="dragging-item__fallback">${activeLabel}</span></slot>
      </div>
      <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">${this.announcement}</p>
    `
  }

  private renderItem(item: HTMLElement, order: readonly HTMLElement[]): TemplateResult {
    const index = order.indexOf(item)
    const fixed = this.isFixedItem(item)
    const active = this.session?.item === item
    const tabbable = this.editable && !fixed && (this.focusedItem === item || (!this.focusedItem && this.firstMovable(order) === item))
    return html`
      <div
        ${animate(() => this.itemMotionOptions())}
        part="item"
        class=${classMap({ 'list-item': true, 'list-item--reorderable': this.editable && !fixed, 'list-item--active': active })}
        data-assignment-id=${this.getAssignmentId(item)}
        role="listitem"
        aria-posinset=${index + 1}
        aria-setsize=${order.length}
        aria-describedby=${this.editable && !fixed ? this.instructionsId : nothing}
        .tabIndex=${tabbable ? 0 : -1}
        @focus=${() => this.handleItemFocus(item)}
        @keydown=${(event: KeyboardEvent) => this.handleKeyDown(event, item)}
      >
        <slot name=${this.getAssignmentId(item)}></slot>
      </div>
    `
  }

  private itemMotionOptions(): MotionOptions {
    if (typeof getComputedStyle !== 'function') return { disabled: true }
    const style = getComputedStyle(this)
    const duration = parseMotionDuration(style.getPropertyValue('--c2-reorder-list__motion--duration') || '160ms')
    const easing = style.getPropertyValue('--c2-reorder-list__motion--timing-function').trim() || 'ease'
    return {
      disabled: duration <= 0,
      keyframeOptions: { duration, easing },
      properties: ['left', 'top'],
      skipInitial: true,
    }
  }

  private renderPlaceholder(): TemplateResult {
    return html`
      <div part="placeholder" class="list-item placeholder" style=${styleMap(this.placeholderSize)} aria-hidden="true" inert>
        <slot name="placeholder"><span class="dragging-placeholder"></span></slot>
      </div>
    `
  }

  private observeChildren(): void {
    this.childListObserver?.disconnect()
    this.childListObserver = new MutationObserver(() => {
      const activeItem = this.session?.item ?? null
      const previousIndex = activeItem ? (this.session?.candidateIndex ?? 0) : 0
      if (this.session) this.cancelSession('Items changed. Reordering canceled.')
      this.reconcileAuthoredOrder()
      if (activeItem && !activeItem.isConnected) {
        const movable = this.visualOrder.filter((item) => !this.isFixedItem(item))
        this.pendingFocus = movable[Math.min(previousIndex, Math.max(0, movable.length - 1))] ?? 'host'
        this.requestUpdate()
      }
    })
    this.childListObserver.observe(this, { childList: true })
  }

  private reconcileAuthoredOrder(): void {
    const authored = this.getAuthoredItems()
    for (const item of authored) item.setAttribute('slot', this.getAssignmentId(item))
    this.visualOrder = authored
    if (this.focusedItem && !authored.includes(this.focusedItem)) this.focusedItem = this.firstMovable(authored)
  }

  private getAuthoredItems(): HTMLElement[] {
    const result: HTMLElement[] = []
    for (const child of this.children ?? []) {
      if (!(child instanceof HTMLElement) || SPECIAL_SLOTS.has(child.slot)) continue
      result.push(child)
    }
    return result
  }

  private getAssignmentId(item: HTMLElement): string {
    let id = this.assignmentIds.get(item)
    if (!id) {
      id = `c2-reorder-item-${++this.assignmentCounter}`
      this.assignmentIds.set(item, id)
    }
    return id
  }

  private handlePointerDown(event: PointerEvent): void {
    if (!this.editable || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || this.session) return
    const wrapper = this.getWrapperFromEvent(event)
    const item = wrapper ? this.getItemByAssignmentId(wrapper.dataset.assignmentId) : null
    if (!item || this.isFixedItem(item) || this.hasInteractiveOrigin(event, wrapper)) return

    const point = { x: event.clientX, y: event.clientY }
    this.session = {
      phase: 'armed-pointer',
      inputMethod: this.pointerInputMethod(event.pointerType),
      item,
      originalOrder: [...this.visualOrder],
      candidateOrder: [...this.visualOrder],
      fromIndex: this.visualOrder.indexOf(item),
      candidateIndex: this.visualOrder.indexOf(item),
      pointerId: event.pointerId,
      originPoint: point,
      latestPoint: point,
    }
    this.observeSessionVisibility()
    document.addEventListener('keydown', this.handleDocumentKeyDown)
  }

  private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || (this.session?.phase !== 'armed-pointer' && this.session?.phase !== 'dragging-pointer')) return
    event.preventDefault()
    this.cancelSession('Reordering canceled. The item returned to its original position.')
  }

  private handlePointerMove(event: PointerEvent): void {
    const session = this.session
    if (!session || session.pointerId !== event.pointerId || !session.originPoint) return
    session.latestPoint = { x: event.clientX, y: event.clientY }

    if (session.phase === 'armed-pointer') {
      const distance = Math.abs(event.clientX - session.originPoint.x) + Math.abs(event.clientY - session.originPoint.y)
      if (distance < this.normalizedThreshold) return
      if (!this.validateKeys()) {
        this.finishSession()
        return
      }
      const itemRect = this.getWrapperForItem(session.item)?.getBoundingClientRect()
      if (!itemRect || itemRect.width <= 0 || itemRect.height <= 0) {
        this.cancelSession('Reordering canceled because the item is not visible.')
        return
      }
      session.phase = 'dragging-pointer'
      session.pickupOffset = { x: event.clientX - itemRect.left, y: event.clientY - itemRect.top }
      this.placeholderSize = { width: `${itemRect.width}px`, height: `${itemRect.height}px` }
      this.scrollContainer = this.findScrollContainer()
      this.releasingCapture = false
      this.containerElement?.setPointerCapture(event.pointerId)
      this.requestUpdate()
    }

    if (session.phase !== 'dragging-pointer') return
    event.preventDefault()
    this.positionPointerPreview()
    this.updatePointerDestination(event.clientY)
    this.updateAutoScroll(event.clientY)
  }

  private handlePointerUp(event: PointerEvent): void {
    const session = this.session
    if (!session || session.pointerId !== event.pointerId) return
    if (session.phase === 'dragging-pointer') {
      const rect = this.containerElement?.getBoundingClientRect()
      const inside = !!rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      if (inside) this.commitSession()
      else this.cancelSession('Reordering canceled. The item returned to its original position.')
      return
    }
    this.finishSession()
  }

  private handlePointerCancel(event: PointerEvent): void {
    if (this.session?.pointerId === event.pointerId) this.cancelSession('Reordering canceled. The item returned to its original position.')
  }

  private handleLostPointerCapture(event: PointerEvent): void {
    if (!this.releasingCapture && this.session?.phase === 'dragging-pointer' && this.session.pointerId === event.pointerId) {
      this.cancelSession('Reordering canceled because pointer control was lost.')
    }
  }

  private updatePointerDestination(pointerY: number): void {
    const session = this.session
    if (!session || session.phase !== 'dragging-pointer') return
    const movableWithoutActive = session.candidateOrder.filter((item) => item !== session.item && !this.isFixedItem(item))
    let targetOrdinal = movableWithoutActive.length
    for (let index = 0; index < movableWithoutActive.length; index++) {
      const rect = this.getWrapperForItem(movableWithoutActive[index])?.getBoundingClientRect()
      if (rect && pointerY < rect.top + rect.height / 2) {
        targetOrdinal = index
        break
      }
    }
    const nextOrder = this.orderAtMovableOrdinal(session.originalOrder, session.item, targetOrdinal)
    const nextIndex = nextOrder.indexOf(session.item)
    if (nextIndex === session.candidateIndex && this.sameOrder(nextOrder, session.candidateOrder)) return
    session.candidateOrder = nextOrder
    session.candidateIndex = nextIndex
    this.requestUpdate()
  }

  private handleItemFocus(item: HTMLElement): void {
    if (!this.isFixedItem(item) && this.focusedItem !== item) {
      this.focusedItem = item
      this.requestUpdate()
    }
  }

  private handleKeyDown(event: KeyboardEvent, item: HTMLElement): void {
    if (!this.editable || this.isFixedItem(item) || this.hasInteractiveOrigin(event, event.currentTarget as HTMLElement)) return
    const session = this.session
    if (!session) {
      if (event.code !== 'Space') return
      event.preventDefault()
      if (!this.validateKeys()) return
      const index = this.visualOrder.indexOf(item)
      this.session = {
        phase: 'reordering-keyboard',
        inputMethod: 'keyboard',
        item,
        originalOrder: [...this.visualOrder],
        candidateOrder: [...this.visualOrder],
        fromIndex: index,
        candidateIndex: index,
      }
      this.observeSessionVisibility()
      this.announcement = `${this.getItemLabel(item)} picked up, position ${index + 1} of ${this.visualOrder.length}. Use Arrow keys, Home, or End to move; Space drops and Escape cancels.`
      return
    }
    if (session.phase !== 'reordering-keyboard' || session.item !== item) return

    if (event.code === 'Space') {
      event.preventDefault()
      this.commitSession()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      this.cancelSession(`${this.getItemLabel(item)} returned to position ${session.fromIndex + 1}.`)
      this.pendingFocus = item
      return
    }

    const movable = session.candidateOrder.filter((candidate) => !this.isFixedItem(candidate))
    const currentOrdinal = movable.indexOf(item)
    let targetOrdinal = currentOrdinal
    if (event.key === 'ArrowUp') targetOrdinal--
    else if (event.key === 'ArrowDown') targetOrdinal++
    else if (event.key === 'Home') targetOrdinal = 0
    else if (event.key === 'End') targetOrdinal = movable.length - 1
    else return
    event.preventDefault()

    const boundedOrdinal = Math.max(0, Math.min(movable.length - 1, targetOrdinal))
    if (boundedOrdinal === currentOrdinal) {
      this.announcement = `${this.getItemLabel(item)} is already at the ${currentOrdinal === 0 ? 'first' : 'last'} permitted position.`
      return
    }
    const nextOrder = this.orderAtMovableOrdinal(session.originalOrder, item, boundedOrdinal)
    session.candidateOrder = nextOrder
    session.candidateIndex = nextOrder.indexOf(item)
    this.announcement = `${this.getItemLabel(item)} moved to position ${session.candidateIndex + 1} of ${nextOrder.length}.`
    this.pendingFocus = item
    this.requestUpdate()
  }

  private orderAtMovableOrdinal(baseOrder: readonly HTMLElement[], item: HTMLElement, targetOrdinal: number): readonly HTMLElement[] {
    const movable = baseOrder.filter((candidate) => !this.isFixedItem(candidate) && candidate !== item)
    movable.splice(Math.max(0, Math.min(movable.length, targetOrdinal)), 0, item)
    let movableIndex = 0
    return baseOrder.map((candidate) => (this.isFixedItem(candidate) ? candidate : movable[movableIndex++]))
  }

  private commitSession(): void {
    const session = this.session
    if (!session) return
    if (session.candidateIndex === session.fromIndex || this.sameOrder(session.originalOrder, session.candidateOrder)) {
      this.finishSession()
      this.pendingFocus = session.inputMethod === 'keyboard' ? session.item : null
      return
    }

    this.visualOrder = [...session.candidateOrder]
    const order = Object.freeze(session.candidateOrder.map((item) => Object.freeze(this.itemReference(item))))
    const detail: ReorderEventDetail = Object.freeze({
      item: Object.freeze(this.itemReference(session.item)),
      fromIndex: session.fromIndex,
      toIndex: session.candidateIndex,
      order,
      inputMethod: session.inputMethod,
    })
    const legacyOrder = this.getAuthoredItems().map((item) => session.candidateOrder.indexOf(item))
    const label = this.getItemLabel(session.item)
    this.finishSession()
    this.announcement = `${label} moved from position ${detail.fromIndex + 1} to ${detail.toIndex + 1}.`
    this.pendingFocus = detail.inputMethod === 'keyboard' ? detail.item.element : null
    this.dispatchEvent(new CustomEvent<ReorderEventDetail>('reorder', { bubbles: true, composed: true, detail }))
    this.dispatchEvent(new CustomEvent<number[]>('change', { bubbles: true, cancelable: true, detail: legacyOrder }))
  }

  private cancelSession(message: string): void {
    const item = this.session?.item ?? null
    const keyboard = this.session?.phase === 'reordering-keyboard'
    this.finishSession()
    this.announcement = message
    if (keyboard && item?.isConnected) this.pendingFocus = item
  }

  private finishSession(): void {
    document.removeEventListener('keydown', this.handleDocumentKeyDown)
    this.visibilityObserver?.disconnect()
    this.stopAutoScroll()
    const pointerId = this.session?.pointerId
    if (pointerId !== undefined && this.containerElement?.hasPointerCapture(pointerId)) {
      this.releasingCapture = true
      this.containerElement.releasePointerCapture(pointerId)
    }
    this.session = null
    this.scrollContainer = null
    if (this.draggingElement) {
      this.draggingElement.style.removeProperty('left')
      this.draggingElement.style.removeProperty('top')
      this.draggingElement.style.removeProperty('width')
      this.draggingElement.style.removeProperty('height')
    }
  }

  private validateKeys(): boolean {
    const keyed = new Map<string, HTMLElement[]>()
    for (const item of this.visualOrder) {
      const key = item.dataset.reorderKey?.trim()
      if (!key) continue
      const elements = keyed.get(key) ?? []
      elements.push(item)
      keyed.set(key, elements)
    }
    const duplicate = [...keyed].find(([, elements]) => elements.length > 1)
    if (!duplicate) return true
    const [key, elements] = duplicate
    const detail: ReorderErrorEventDetail = Object.freeze({ reason: 'duplicate-key', key, elements: Object.freeze([...elements]) })
    this.announcement = `Reordering is unavailable because the item key ${key} is used more than once.`
    this.dispatchEvent(new CustomEvent<ReorderErrorEventDetail>('reorder-error', { bubbles: true, composed: true, detail }))
    return false
  }

  private itemReference(item: HTMLElement): ReorderItemReference {
    const key = item.dataset.reorderKey?.trim()
    return key ? { element: item, key } : { element: item }
  }

  private getItemLabel(item: HTMLElement): string {
    return item.dataset.reorderLabel?.trim() || item.getAttribute('aria-label')?.trim() || item.textContent?.replace(/\s+/g, ' ').trim() || 'Item'
  }

  private getAccessibleName(): string {
    const direct = this.getAttribute('aria-label')?.trim()
    if (direct) return direct
    const ids = this.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? []
    return ids
      .map((id) => this.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
  }

  private isFixedItem(item: HTMLElement): boolean {
    const value = item.getAttribute('data-fixed')
    return value !== null && value !== 'false' && value !== '0'
  }

  private firstMovable(order: readonly HTMLElement[]): HTMLElement | null {
    return order.find((item) => !this.isFixedItem(item)) ?? null
  }

  private getWrapperFromEvent(event: Event): HTMLElement | null {
    return (
      (event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('list-item') && node.dataset.assignmentId) as HTMLElement) ??
      null
    )
  }

  private getItemByAssignmentId(id?: string): HTMLElement | null {
    if (!id) return null
    return this.visualOrder.find((item) => this.getAssignmentId(item) === id) ?? null
  }

  private getWrapperForItem(item: HTMLElement): HTMLElement | null {
    const id = this.getAssignmentId(item)
    return this.renderRoot.querySelector<HTMLElement>(`.list-item[data-assignment-id="${id}"]`)
  }

  private hasInteractiveOrigin(event: Event, wrapper: HTMLElement | null): boolean {
    for (const node of event.composedPath()) {
      if (node === wrapper) return false
      if (node instanceof Element && node.matches(INTERACTIVE_SELECTOR)) return true
    }
    return false
  }

  private pointerInputMethod(pointerType: string): ReorderInputMethod {
    if (pointerType === 'touch' || pointerType === 'pen') return pointerType
    return 'mouse'
  }

  private get normalizedThreshold(): number {
    return Number.isFinite(this.dragStartThreshold) && this.dragStartThreshold >= 0 ? this.dragStartThreshold : DEFAULT_DRAG_THRESHOLD
  }

  private sameOrder(left: readonly HTMLElement[], right: readonly HTMLElement[]): boolean {
    return left.length === right.length && left.every((item, index) => item === right[index])
  }

  private positionPointerPreview(): void {
    const session = this.session
    const preview = this.draggingElement
    const point = session?.latestPoint
    const offset = session?.pickupOffset
    if (!session || session.phase !== 'dragging-pointer' || !preview || !point || !offset) return
    preview.style.left = `${Math.round(point.x - offset.x)}px`
    preview.style.top = `${Math.round(point.y - offset.y)}px`
    preview.style.width = this.placeholderSize.width
    preview.style.height = this.placeholderSize.height
  }

  private findScrollContainer(): HTMLElement | null {
    let ancestor = this.parentElement
    while (ancestor) {
      const overflowY = getComputedStyle(ancestor).overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && ancestor.scrollHeight > ancestor.clientHeight) return ancestor
      ancestor = ancestor.parentElement
    }
    return null
  }

  private updateAutoScroll(pointerY: number): void {
    if (this.autoScrollDisabled || !this.scrollContainer) {
      this.stopAutoScroll()
      return
    }
    const rect = this.scrollContainer.getBoundingClientRect()
    const nextDirection: -1 | 0 | 1 = pointerY < rect.top + EDGE_SCROLL_ZONE ? -1 : pointerY > rect.bottom - EDGE_SCROLL_ZONE ? 1 : 0
    if (nextDirection === this.scrollDirection && (nextDirection === 0 || this.scrollFrame)) return
    this.scrollDirection = nextDirection
    if (nextDirection === 0) this.stopAutoScroll()
    else this.startAutoScroll()
  }

  private startAutoScroll(): void {
    if (this.scrollFrame || !this.scrollDirection || !this.scrollContainer) return
    const step = () => {
      this.scrollFrame = 0
      const container = this.scrollContainer
      const session = this.session
      if (!container || session?.phase !== 'dragging-pointer' || !this.scrollDirection) return
      const before = container.scrollTop
      container.scrollBy(0, this.scrollDirection * EDGE_SCROLL_STEP)
      if (container.scrollTop === before) {
        this.stopAutoScroll()
        return
      }
      if (session.latestPoint) this.updatePointerDestination(session.latestPoint.y)
      this.scrollFrame = requestAnimationFrame(step)
    }
    this.scrollFrame = requestAnimationFrame(step)
  }

  private stopAutoScroll(): void {
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame)
    this.scrollFrame = 0
    this.scrollDirection = 0
  }

  private observeRenderedSize(): void {
    if (typeof ResizeObserver === 'undefined' || !this.containerElement) return
    this.resizeObserver ??= new ResizeObserver(() => {
      if (!this.cancelInvalidVisibility()) return
      const point = this.session?.latestPoint
      if (this.session?.phase === 'dragging-pointer' && point) this.updatePointerDestination(point.y)
    })
    this.resizeObserver.disconnect()
    this.resizeObserver.observe(this.containerElement)
    for (const wrapper of this.renderRoot.querySelectorAll<HTMLElement>('.list-item[data-assignment-id]')) this.resizeObserver.observe(wrapper)
  }

  private observeSessionVisibility(): void {
    this.visibilityObserver?.disconnect()
    this.visibilityObserver ??= new MutationObserver(() => this.cancelInvalidVisibility())
    this.visibilityObserver.observe(this, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden', 'style'] })
    if (this.containerElement) this.visibilityObserver.observe(this.containerElement, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] })
    if (this.session) this.visibilityObserver.observe(this.session.item, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] })
    const activeWrapper =
      this.session?.phase === 'dragging-pointer'
        ? this.renderRoot.querySelector<HTMLElement>('[part="placeholder"]')
        : this.session
          ? this.getWrapperForItem(this.session.item)
          : null
    if (activeWrapper) this.visibilityObserver.observe(activeWrapper, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] })
    let ancestor = this.parentElement
    while (ancestor) {
      this.visibilityObserver.observe(ancestor, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] })
      ancestor = ancestor.parentElement
    }
  }

  private cancelInvalidVisibility(): boolean {
    const session = this.session
    if (!session) return true
    const wrapper =
      session.phase === 'dragging-pointer' ? this.renderRoot.querySelector<HTMLElement>('[part="placeholder"]') : this.getWrapperForItem(session.item)
    const requiredSizedElements =
      session.phase === 'dragging-pointer' ? [this, this.containerElement, wrapper] : [this, this.containerElement, session.item, wrapper]
    const visibleElements = [this, this.containerElement, session.item, ...(wrapper ? [wrapper] : [])]
    const visiblyStyled = visibleElements.every((element) => {
      if (!element?.isConnected) return false
      const style = getComputedStyle(element)
      return (
        !element.hidden &&
        element.style.display !== 'none' &&
        element.style.visibility !== 'hidden' &&
        element.style.visibility !== 'collapse' &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.visibility !== 'collapse'
      )
    })
    const pointerItemExplicitlyZeroSized = session.phase === 'dragging-pointer' && session.item.style.width === '0px' && session.item.style.height === '0px'
    const sized = requiredSizedElements.every((element) => {
      if (!element?.isConnected) return false
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    if (visiblyStyled && sized && !pointerItemExplicitlyZeroSized) return true
    this.cancelSession('Reordering canceled because the item or list is not visible.')
    return false
  }

  private restorePendingFocus(): void {
    const target = this.pendingFocus
    if (!target) return
    this.pendingFocus = null
    if (target === 'host') {
      if (!this.hasAttribute('tabindex')) this.tabIndex = -1
      this.focus()
      return
    }
    this.focusedItem = target
    this.getWrapperForItem(target)?.focus()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-reorder-list': ReorderList
  }
}
