import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * Size-reporting protocol between a group container (`c2-chip-group`) and the items it lays out (`c2-chip`,
 * `c2-badge`). An item adds a {@link GroupItemSizeController}; while its parent is a group it observes its own border
 * box and fires {@link GROUP_ITEM_SIZE_EVENT} on every change, and the group reads the last size back through
 * {@link groupItemOf}. The group decides how many items fit from those sizes alone, without measuring its children.
 *
 * The keys are registered symbols so two copies of `@c2n/core` in one page still understand each other.
 */
export const GROUP_ITEM_SIZE_EVENT = 'c2-group-item-size'

export interface GroupItemSize {
  /** Border-box width in CSS pixels. */
  width: number
  /** Border-box height in CSS pixels. */
  height: number
}

const ITEM_KEY = Symbol.for('c2n.group-item')
const GROUP_KEY = Symbol.for('c2n.group-item-consumer')

type ItemHost = ReactiveControllerHost & HTMLElement
type Keyed = { [ITEM_KEY]?: GroupItemSizeController; [GROUP_KEY]?: true }

/** Marks `element` as a group, so items connected inside it start reporting their size. */
export function markGroupItemConsumer(element: HTMLElement): void {
  ;(element as Keyed)[GROUP_KEY] = true
}

/** The size reporter of `node`, when it is a group item. */
export function groupItemOf(node: Node): GroupItemSizeController | undefined {
  return (node as Keyed)[ITEM_KEY]
}

function isGroup(node: Node | null): boolean {
  return !!node && (node as Keyed)[GROUP_KEY] === true
}

/** Reports the host's size to the group it is a direct child of. Does nothing outside a group. */
export class GroupItemSizeController implements ReactiveController {
  private observer?: ResizeObserver
  private lastSize?: GroupItemSize

  constructor(private readonly host: ItemHost) {
    ;(host as Keyed)[ITEM_KEY] = this
    host.addController(this)
  }

  /** The last measured border-box size, or `undefined` before the first measurement. */
  get size(): GroupItemSize | undefined {
    return this.lastSize
  }

  hostConnected(): void {
    if (isGroup(this.host.parentElement)) this.observe()
  }

  hostDisconnected(): void {
    this.observer?.disconnect()
    this.observer = undefined
  }

  /**
   * Starts observing. Called on connect when the parent is already a group, and by the group itself for an item that
   * upgraded before the group did.
   */
  observe(): void {
    if (this.observer || !this.host.isConnected) return
    this.observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0]
      const size = box ? { width: box.inlineSize, height: box.blockSize } : { width: entry.contentRect.width, height: entry.contentRect.height }
      if (this.lastSize && this.lastSize.width === size.width && this.lastSize.height === size.height) return
      this.lastSize = size
      if (!isGroup(this.host.parentElement)) return
      this.host.dispatchEvent(new CustomEvent<GroupItemSize>(GROUP_ITEM_SIZE_EVENT, { bubbles: true, detail: size }))
    })
    this.observer.observe(this.host)
  }
}
