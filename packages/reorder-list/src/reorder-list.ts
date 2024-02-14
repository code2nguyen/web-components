import { animate, type Options } from '@lit-labs/motion'
import { html, LitElement, type PropertyValueMap, type TemplateResult, unsafeCSS } from 'lit'
import { customElement, eventOptions, property, query, queryAll, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './reorder-list.scss?inline'

export interface Point {
  x: number
  y: number
}
export interface MutateMouseEvent {
  pageX: number
  pageY: number
}

@customElement('c2-reorder-list')
export class ReorderList extends LitElement {
  @query('.dragging-item') protected draggingElement!: HTMLElement
  @query('.placeholder') protected placeholderElement!: HTMLElement
  @query('.c2-reorder-list-container') protected containerElement!: HTMLElement
  @queryAll('.list-item') protected listItemElements!: NodeListOf<HTMLDivElement>

  @property({ type: Boolean, reflect: true }) editable = false
  @property({ type: Number }) dragStartThreshold = 10
  @property({ type: Boolean }) autoScrollDisabled = false

  @state()
  private placeholderSlotIndex = -1

  @state()
  private placeholderSize = { width: '0px', height: '0px' }

  private childListObserver: MutationObserver | null = null
  private hostBoundingClientRect: DOMRect | null = null
  private scrollableParent: HTMLElement | null = null
  private scrollableParentRect: DOMRect | undefined = undefined
  private pickupPosition: Point = { x: 0, y: 0 }
  private itemPositions: Array<DOMRect & { isFixed?: boolean }> = []

  private currentDraggingItem: Element | null = null
  private currentDraggingSlotIndex = -1

  private skipAnimation = false
  private hasStartedDragging = false
  private scrollingTimer = 0
  private cacheMouseEvent: MutateMouseEvent | null = null

  override connectedCallback(): void {
    super.connectedCallback()
    this.observeChildList()
    this.updateSlotMapping()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    // this.parentPositions.clear()
    if (this.childListObserver) {
      this.childListObserver.disconnect()
    }
  }

  renderSlots() {
    const itemClasses = { 'list-item--reorderable': this.editable }
    const placeholder = this.createPlaceHolder(itemClasses)
    const childElementCount = this.getChildItems().length
    const renderBlocks: TemplateResult[] = Array.from({ length: childElementCount }).map((_, slotIndex) => {
      const animateOptions: Options = {
        id: slotIndex,
        inId: slotIndex,
        skipInitial: true,
        disabled: this.skipAnimation || slotIndex === childElementCount - 1,
      }
      if (this.placeholderSlotIndex !== -1 && this.currentDraggingSlotIndex === slotIndex) {
        return html``
      }
      return html`<div class="list-item ${classMap(itemClasses)}" ${animate(animateOptions)}>
        <slot name="${slotIndex}"></slot>
      </div>`
    })

    if (this.placeholderSlotIndex !== -1) {
      if (this.placeholderSlotIndex === this.currentDraggingSlotIndex) {
        renderBlocks[this.placeholderSlotIndex] = placeholder
      } else {
        if (this.placeholderSlotIndex <= this.currentDraggingSlotIndex) {
          renderBlocks.splice(this.placeholderSlotIndex, 0, placeholder)
        } else {
          renderBlocks.splice(this.placeholderSlotIndex + 1, 0, placeholder)
        }
      }
    }
    return renderBlocks
  }

  private createPlaceHolder(itemClasses: { 'list-item--reorderable': boolean }) {
    return html` <div class="list-item placeholder ${classMap(itemClasses)}">
      <slot name="placeholder">
        <div class="dragging-placeholder" style=${styleMap(this.placeholderSize)}></div>
      </slot>
    </div>`
  }

  override render() {
    const draggingItemClasses = { 'dragging-item--active': this.placeholderSlotIndex > -1 }
    return html`
      <div class="c2-reorder-list-container" @mousedown=${this.handleMouseDown}>${this.renderSlots()}</div>
      <div class="dragging-item ${classMap(draggingItemClasses)}">
        <slot name="dragging-item"></slot>
      </div>
    `
  }

  @eventOptions({ passive: true })
  private handleMouseDown(event: MouseEvent) {
    const targetIndex = this.getSlottedTargetIndex(event)
    if (targetIndex == -1) return

    const target = event.composedPath()[targetIndex] as HTMLElement
    const slot = target.getAttribute('slot')
    if (slot && !this.isFixedItem(target)) {
      this.hostBoundingClientRect = this.getBoundingClientRect()
      this.pickupPosition = this.getPointerPosition(event)
      document.addEventListener('mousemove', this.handleMouseMove, { passive: true })
      document.addEventListener('mouseup', this.handleMouseUp, { passive: true })
    }
  }

  private isFixedItem(item: HTMLElement) {
    return !!item && !!item.dataset.fixed
  }

  handleMouseMove = async (event: MouseEvent) => {
    if (this.isUpdatePending) return
    if (!this.hasStartedDragging) {
      const pointerPosition = this.getPointerPosition(event)
      const distanceX = Math.abs(pointerPosition.x - this.pickupPosition.x)
      const distanceY = Math.abs(pointerPosition.y - this.pickupPosition.y)
      const isOverThreshold = distanceX + distanceY >= this.dragStartThreshold
      if (!isOverThreshold) return
      this.hasStartedDragging = true
      this.skipAnimation = true
      const targetIndex = this.getSlottedTargetIndex(event)
      if (targetIndex == -1) return

      const target = event.composedPath()[targetIndex] as HTMLElement
      const slot = target.getAttribute('slot')
      const listItem = event.composedPath()[targetIndex + 2] as HTMLElement
      if (!slot) {
        this.stopDrag()
        return
      }
      this.pickupPosition = this.getPointerPosition(event)
      const listItemboundraryRect = listItem.getBoundingClientRect()
      const targetItemboundraryRect = target.getBoundingClientRect()
      this.currentDraggingItem = target
      this.placeholderSlotIndex = parseInt(slot)
      this.currentDraggingSlotIndex = parseInt(slot)
      this.placeholderSize = { width: `${targetItemboundraryRect.width}px`, height: `${targetItemboundraryRect.height}px` }
      this.draggingElement.style.width = `${listItemboundraryRect.width}px`
      this.draggingElement.style.height = `${listItemboundraryRect.height}px`
      this.draggingElement.style.top = `${listItemboundraryRect.top}px`
      this.draggingElement.style.left = `${listItemboundraryRect.left}px`
      target.setAttribute('slot', 'dragging-item')
      this.applyTransform(event)
      this.updateItemPositions()
      this.scrollableParent = this.getNearestScrollableParent()
      this.scrollableParentRect = this.scrollableParent?.getBoundingClientRect()
      if (this.scrollableParent) this.scrollableParent.addEventListener('scroll', this.handleScroll, { passive: true })
    } else {
      this.cacheMouseEvent = { pageX: event.pageX, pageY: event.pageY }
      this.applyTransform(event)
      const newSlotIndex = this.getItemIndexFromPointerPosition(event)
      if (newSlotIndex > -1) {
        if (newSlotIndex !== this.placeholderSlotIndex) {
          this.placeholderSlotIndex = newSlotIndex
        }
      }
    }
  }

  handleScroll = () => {
    if (this.cacheMouseEvent) {
      this.updateItemPositions()
      this.applyTransform(this.cacheMouseEvent)
      const newSlotIndex = this.getItemIndexFromPointerPosition(this.cacheMouseEvent)
      if (newSlotIndex > -1) {
        if (newSlotIndex !== this.placeholderSlotIndex) {
          this.placeholderSlotIndex = newSlotIndex
        }
      }
    }
  }

  private getItemIndexFromPointerPosition(event: MutateMouseEvent) {
    const padding = 5
    const index = this.itemPositions.findIndex((item) => {
      if (item.isFixed) return false
      const x = item.x + padding
      const y = item.y + padding
      const width = item.width - padding
      const height = item.height - padding
      return x < event.pageX && y < event.pageY && x + width > event.pageX && y + height > event.pageY
    })
    return index
  }

  handleMouseUp = () => {
    if (this.hasStartedDragging && this.currentDraggingItem) {
      const sortedChildren = this.getSortChildrenBySlot()
      const newSlotIndex = this.placeholderSlotIndex
      for (let i = 0; i < sortedChildren.length; i++) {
        const slot = parseInt(sortedChildren[i].getAttribute('slot')!)
        if (newSlotIndex > this.currentDraggingSlotIndex && slot > this.currentDraggingSlotIndex && slot <= newSlotIndex) {
          sortedChildren[i].setAttribute('slot', (slot - 1).toString())
        }
        if (newSlotIndex < this.currentDraggingSlotIndex && slot >= newSlotIndex && slot < this.currentDraggingSlotIndex) {
          sortedChildren[i].setAttribute('slot', (slot + 1).toString())
        }
      }
      this.currentDraggingItem.setAttribute('slot', this.placeholderSlotIndex.toString())
      this.skipAnimation = true
      this.dispatchChangeEvent()
    }
    this.stopDrag()
  }

  private dispatchChangeEvent() {
    const data = this.getChildItems().map((item) => {
      return parseInt(item.getAttribute('slot')!)
    })
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        cancelable: true,
        detail: data,
      }),
    )
  }

  private stopDrag() {
    document.removeEventListener('mousemove', this.handleMouseMove)
    document.removeEventListener('mouseup', this.handleMouseUp)
    if (this.scrollableParent) this.scrollableParent.removeEventListener('scroll', this.handleScroll)

    this.pickupPosition = { x: 0, y: 0 }
    this.itemPositions = []
    this.hasStartedDragging = false
    this.placeholderSlotIndex = -1
    this.scrollableParent = null
    this.cacheMouseEvent = null
  }

  private getPointerPosition(event: MutateMouseEvent): Point {
    const x = event.pageX - (this.hostBoundingClientRect?.left || 0)
    const y = event.pageY - (this.hostBoundingClientRect?.top || 0)
    return { x, y }
  }

  private observeChildList() {
    this.childListObserver = new MutationObserver(() => {
      this.updateSlotMapping()
    })
    this.childListObserver.observe(this, { subtree: false, childList: true })
  }

  protected override async firstUpdated() {
    this.updateSlotMapping()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    if (_changedProperties.has('placeholderSlotIndex')) {
      this.skipAnimation = false
      this.startScrollingIfNecessary()
      this.updateItemPositions()
    }
    super.updated(_changedProperties)
  }

  private startScrollingIfNecessary() {
    if (this.placeholderElement && this.scrollableParent) {
      const placeholderRect = this.placeholderElement.getBoundingClientRect()
      const placeholderTop = placeholderRect.top
      if (placeholderTop < this.scrollableParentRect!.top) {
        this.startScrollInterval('up')
      } else if (placeholderTop + placeholderRect.height > this.scrollableParentRect!.bottom) {
        this.startScrollInterval('down')
      } else {
        this.stopScrolling()
      }
    }
  }

  private startScrollInterval = (direction: 'up' | 'down') => {
    this.stopScrolling()
    const scrollStep = 2
    this.scrollingTimer = window.requestAnimationFrame(() => {
      this.skipAnimation = true
      this.scrollableParent?.scrollBy(0, direction === 'up' ? -scrollStep : scrollStep)
      this.startScrollInterval(direction)
    })
  }

  private stopScrolling() {
    window.cancelAnimationFrame(this.scrollingTimer)
  }

  private updateSlotMapping() {
    const items = this.getChildItems()
    const internalSlotMapping = new Map<number, number>()
    let index = 0
    let needToUpdate = false
    for (const item of items) {
      const slotName = item.getAttribute('slot')
      if (slotName) {
        if (!Number.isNaN(parseInt(slotName))) {
          internalSlotMapping.set(index, parseInt(slotName))
        } else if (slotName === 'dragging-item') {
          internalSlotMapping.set(index, this.currentDraggingSlotIndex)
        }
      }
      index++
    }
    const sortedMapping = Array.from(internalSlotMapping.keys()).sort(
      (itemIndex1, itemIndex2) => internalSlotMapping.get(itemIndex1)! - internalSlotMapping.get(itemIndex2)!,
    )
    sortedMapping.forEach((itemIndex, index) => {
      internalSlotMapping.get(itemIndex) !== index
      items[itemIndex].setAttribute('slot', index.toString())
      needToUpdate = true
    })

    let avaiableSlotIndex = sortedMapping.length
    for (const item of items) {
      const slotName = item.getAttribute('slot')
      if (!slotName) {
        item.setAttribute('slot', avaiableSlotIndex.toString())
        avaiableSlotIndex++
        needToUpdate = true
      }
    }

    if (needToUpdate) {
      this.requestUpdate()
      this.dispatchChangeEvent()
    }
  }

  private updateItemPositions() {
    this.itemPositions = []
    this.listItemElements.forEach((item) => {
      const slot = item.querySelector('slot') as HTMLSlotElement
      this.itemPositions.push({
        ...getMutableClientRect(item),
        isFixed: slot ? this.isFixedItem(slot.assignedNodes()[0] as HTMLElement) : false,
      })
    })
    console.log(this.itemPositions)
  }

  private applyTransform(event: MutateMouseEvent) {
    const mousePoint = this.getPointerPosition(event)

    const x = mousePoint.x - this.pickupPosition.x
    const y = mousePoint.y - this.pickupPosition.y

    this.draggingElement.style.transform = this.getTransform(x, y)
  }

  private getTransform(x: number, y: number): string {
    return `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  }

  private getSlottedTargetIndex(event: MouseEvent): number {
    return event.composedPath().findIndex((item) => item instanceof Element && !!(item as Element).getAttribute('slot'))
  }

  private getChildItems(): Element[] {
    const items: Element[] = []
    for (const item of this.children) {
      const slotName = item.getAttribute('slot')
      if (slotName === 'dragging-item' || !slotName || !Number.isNaN(parseInt(slotName))) {
        items.push(item)
      }
    }
    return items
  }

  private getSortChildrenBySlot(): Element[] {
    return this.getChildItems()
      .filter((item) => item !== this.currentDraggingItem)
      .sort((a, b) => {
        const aSlot = a.getAttribute('slot')
        const bSlot = b.getAttribute('slot')
        return parseInt(aSlot || '') - parseInt(bSlot || '')
      })
  }

  private getNearestScrollableParent(node: HTMLElement | null = this): HTMLElement | null {
    if (node == null) {
      return null
    }

    if (node.scrollHeight > node.clientHeight) {
      return node
    } else {
      return this.getNearestScrollableParent(node.parentNode as HTMLElement)
    }
  }
  static override styles = unsafeCSS(styles)
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-reorder-list': ReorderList
  }
}

export function getMutableClientRect(element: Element): DOMRect {
  const clientRect = element.getBoundingClientRect()
  return {
    top: clientRect.top,
    right: clientRect.right,
    bottom: clientRect.bottom,
    left: clientRect.left,
    width: clientRect.width,
    height: clientRect.height,
    x: clientRect.x,
    y: clientRect.y,
  } as DOMRect
}
