/**
 * Drag and keyboard reordering for `c2-tree`, loaded the first time a tree turns `reorderable` on.
 *
 * Nothing here runs for a read-only tree: the entry only holds the attribute and the `import()` that brings this
 * module in, so a tree that never reorders keeps its size and its hot paths. Once attached, every handler checks
 * `reorderable` again, so turning the attribute off makes the tree read-only without detaching anything.
 *
 * A move is computed against the rows the user can see. A drop lands in the gap between two visible rows, and the
 * pointer's horizontal travel picks the depth within what that gap allows: under the row above (drag right to
 * nest), beside it, or beside one of its ancestors (drag left to move out). The tree then fires a cancelable
 * `item-move` and applies the move itself: it rebuilds `items` in the data-driven mode and moves the element in a
 * tree authored in markup.
 */
import { formatMessage, localeOf } from '@c2n/core/localize.js'
import type { Tree } from './tree'
import { TreeItem } from './tree-item'
import type { TreeItemMoveEventDetail, TreeNode } from './tree-types'
import { treeMessages } from './messages'

/** Pointer travel, in pixels, before a press on a row becomes a drag. */
const DRAG_THRESHOLD = 4
/** How long a touch must rest on a row before it picks the row up; a shorter touch scrolls as usual. */
const TOUCH_DELAY = 350
/** How long a dragged row must hover a collapsed branch before the branch opens. */
const HOVER_EXPAND_DELAY = 700
/** Distance from the scrolling container's edge, in pixels, at which a drag scrolls it. */
const SCROLL_EDGE = 24
const SCROLL_STEP = 8

/** Where a row would land: under `parent` (`null` for the root), before `before` (`null` for last). */
interface Drop {
  parent: TreeItem | null
  before: TreeItem | null
  level: number
}

interface Press {
  item: TreeItem
  pointerId: number
  x: number
  y: number
  touch: boolean
  timer?: ReturnType<typeof setTimeout>
}

interface Drag {
  item: TreeItem
  pointerId: number
  x: number
  level: number
  height: number
  indent: number
  rtl: boolean
  drop?: Drop
  hover?: TreeItem
  hoverTimer?: ReturnType<typeof setTimeout>
}

/** Wires drag and keyboard reordering onto a tree. Called once per tree, by the tree itself. */
export function attachReorder(tree: Tree): void {
  const root = tree.renderRoot as ShadowRoot
  const indicator = document.createElement('div')
  indicator.className = 'drop-indicator'
  indicator.part.add('drop-indicator')
  indicator.hidden = true
  const live = document.createElement('div')
  live.className = 'live'
  live.setAttribute('aria-live', 'polite')
  root.append(indicator, live)

  let press: Press | undefined
  let drag: Drag | undefined
  let dropTarget: TreeItem | null = null

  const announce = (text: string) => {
    // Cleared first so the same sentence twice in a row is still read out.
    live.textContent = ''
    requestAnimationFrame(() => (live.textContent = text))
  }

  const inData = (item: TreeItem) => item.getRootNode() === root

  /** The row's parent row, or `null` at the root. Looks past the wrapper an Astro island puts around a row. */
  const parentOf = (item: TreeItem): TreeItem | null => {
    const parent = item.parentElement?.closest('c2-tree-item, c2-tree')
    return parent instanceof TreeItem ? parent : null
  }

  /** The rows a move would land among: a parent's children, or the roots authored the same way as `like`. */
  const siblingsOf = (parent: TreeItem | null, like: TreeItem) => (parent ? parent.childItems : tree.rootItems).filter((row) => inData(row) === inData(like))

  const contains = (ancestor: TreeItem, item: TreeItem) => ancestor !== item && ancestor.contains(item)

  /** Levels below the row: `0` for a leaf. Collapsed descendants count, since they move along. */
  const heightOf = (item: TreeItem): number => item.childItems.reduce((height, child) => Math.max(height, heightOf(child) + 1), 0)

  /** Whether a row can take children: not disabled, and not a branch whose children have not loaded yet. */
  const canNest = (row: TreeItem) => !row.disabled && !row.loading && !(row.hasChildren && row.childItems.length === 0)

  /** The element to move: the row, or the single-child wrapper an Astro island puts around it. */
  const outer = (item: TreeItem): Element => {
    const parent = item.parentElement
    return parent && parent !== tree && !(parent instanceof TreeItem) && parent.childElementCount === 1 ? parent : item
  }

  const rowBox = (item: TreeItem) => (item.renderRoot.querySelector('.row') ?? item).getBoundingClientRect()

  /** Whether `item` may sit under `parent`: never inside itself, never in a different authoring mode, within `max-depth`. */
  const allowed = (item: TreeItem, parent: TreeItem | null, before: TreeItem | null) => {
    if (parent && (parent === item || contains(item, parent) || !canNest(parent) || inData(parent) !== inData(item))) return false
    if (before && inData(before) !== inData(item)) return false
    const level = parent ? parent.level + 1 : 0
    return tree.maxDepth == null || level + heightOf(item) <= tree.maxDepth
  }

  const move = async (item: TreeItem, parent: TreeItem | null, before: TreeItem | null) => {
    const from = parentOf(item)
    const previousIndex = siblingsOf(from, item).indexOf(item)
    const siblings = siblingsOf(parent, item).filter((row) => row !== item)
    const index = before ? siblings.indexOf(before) : siblings.length
    if (from === parent && previousIndex === index) return

    const detail: TreeItemMoveEventDetail = {
      node: item.node,
      parent: parent?.node ?? null,
      index,
      previousParent: from?.node ?? null,
      previousIndex,
    }
    const event = new CustomEvent<TreeItemMoveEventDetail>('item-move', { detail, bubbles: true, composed: true, cancelable: true })
    if (!tree.dispatchEvent(event)) return

    const label = item.resolvedLabel
    const parentLabel = parent?.resolvedLabel
    const value = item.value
    if (inData(item)) tree.items = moveNode(tree.items, value, parent?.value ?? null, index)
    else (parent ?? tree).insertBefore(outer(item), before ? outer(before) : null)

    // `focusItem` opens the new parent, so the row the user just moved stays in view and keeps the focus.
    await tree.updateComplete
    tree.focusItem(value)
    const total = siblings.length + 1
    announce(
      parentLabel
        ? formatMessage(treeMessages, localeOf(tree), 'movedInto', label, parentLabel, index + 1, total)
        : formatMessage(treeMessages, localeOf(tree), 'moved', label, index + 1, total),
    )
  }

  // Keyboard -------------------------------------------------------------------------------------------------------

  // Capture on the host runs before the tree's own key handler in its shadow root, so Alt+Arrow moves the row
  // instead of also moving the focus.
  tree.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (!tree.reorderable || tree.disabled || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
      const item = itemOf(event)
      if (!item || item.disabled) return
      event.preventDefault()
      event.stopPropagation()
      if (drag) return

      const parent = parentOf(item)
      const siblings = siblingsOf(parent, item)
      const index = siblings.indexOf(item)
      let target: [TreeItem | null, TreeItem | null] | undefined
      if (event.key === 'ArrowUp' && index > 0) target = [parent, siblings[index - 1]]
      else if (event.key === 'ArrowDown' && index < siblings.length - 1) target = [parent, siblings[index + 2] ?? null]
      else if (event.key === 'ArrowRight' && index > 0) target = [siblings[index - 1], null]
      else if (event.key === 'ArrowLeft' && parent) {
        const grandparent = parentOf(parent)
        const aunts = siblingsOf(grandparent, parent)
        target = [grandparent, aunts[aunts.indexOf(parent) + 1] ?? null]
      }

      if (target && allowed(item, ...target)) void move(item, ...target)
      else announce(formatMessage(treeMessages, localeOf(tree), 'cannotMove', item.resolvedLabel))
    },
    true,
  )

  // Pointer --------------------------------------------------------------------------------------------------------

  tree.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!tree.reorderable || tree.disabled || press || drag || event.button !== 0 || !event.isPrimary) return
    const item = itemOf(event, true)
    if (!item || item.disabled) return
    press = { item, pointerId: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' }
    if (press.touch) press.timer = setTimeout(() => press && begin(press.x), TOUCH_DELAY)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('keydown', onEscape, true)
    // Only a drag that has started may stop the page from scrolling under a finger.
    document.addEventListener('touchmove', onTouchMove, { passive: false })
  })

  // A row that is a link, or holds an image, would otherwise start the browser's own drag and cancel ours.
  tree.addEventListener('dragstart', (event) => {
    if (tree.reorderable) event.preventDefault()
  })

  const begin = (x: number) => {
    if (!press) return
    const { item, pointerId } = press
    clearTimeout(press.timer)
    press = undefined
    const style = getComputedStyle(item)
    drag = {
      item,
      pointerId,
      x,
      level: item.level,
      height: heightOf(item),
      indent: parseFloat(style.getPropertyValue('--c2-tree-item__row--indent')) || 16,
      rtl: style.direction === 'rtl',
    }
    item.dragging = true
  }

  const onMove = (event: PointerEvent) => {
    if (press && event.pointerId === press.pointerId) {
      const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y)
      if (press.touch) {
        // The finger moved before the hold completed: the user is scrolling, not picking the row up.
        if (distance > DRAG_THRESHOLD * 2) end()
        return
      }
      if (distance < DRAG_THRESHOLD) return
      begin(press.x)
    }
    if (!drag || event.pointerId !== drag.pointerId) return
    event.preventDefault()
    autoscroll(event.clientY)
    update(event.clientX, event.clientY)
  }

  const onTouchMove = (event: TouchEvent) => {
    if (drag) event.preventDefault()
  }

  const onUp = (event: PointerEvent) => {
    if (drag && event.pointerId === drag.pointerId) {
      const { item, drop } = drag
      // The release would otherwise click the row it ends over, changing the selection or following a link.
      const swallow = (click: Event) => {
        click.stopPropagation()
        click.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, true))
      end()
      if (drop) void move(item, drop.parent, drop.before)
      return
    }
    if (press && event.pointerId === press.pointerId) end()
  }

  const onCancel = () => end()

  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !drag) return
    event.preventDefault()
    event.stopPropagation()
    const label = drag.item.resolvedLabel
    end()
    announce(formatMessage(treeMessages, localeOf(tree), 'cancelled', label))
  }

  const end = () => {
    if (press) clearTimeout(press.timer)
    if (drag) {
      clearTimeout(drag.hoverTimer)
      drag.item.dragging = false
    }
    press = undefined
    drag = undefined
    setDropTarget(null)
    indicator.hidden = true
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onCancel)
    document.removeEventListener('keydown', onEscape, true)
    document.removeEventListener('touchmove', onTouchMove)
  }

  const setDropTarget = (row: TreeItem | null) => {
    if (dropTarget === row) return
    if (dropTarget) dropTarget.dropTarget = false
    dropTarget = row
    if (row) row.dropTarget = true
  }

  const autoscroll = (y: number) => {
    const container = root.querySelector<HTMLElement>('.c2-tree')
    if (!container || container.scrollHeight <= container.clientHeight) return
    const box = container.getBoundingClientRect()
    if (y < box.top + SCROLL_EDGE) container.scrollTop -= SCROLL_STEP
    else if (y > box.bottom - SCROLL_EDGE) container.scrollTop += SCROLL_STEP
  }

  /** Recomputes the drop under the pointer, draws it, and opens a collapsed branch the pointer rests on. */
  const update = (x: number, y: number) => {
    if (!drag) return
    const { item } = drag
    const rows = tree.visibleItems.filter((row) => row !== item && !contains(item, row))
    const boxes = rows.map(rowBox)

    // The gap is before the first row whose middle is below the pointer.
    let gap = boxes.findIndex((box) => y < box.top + box.height / 2)
    if (gap === -1) gap = rows.length
    const above = rows[gap - 1]
    const below = rows[gap]

    const hovered = rows[boxes.findIndex((box) => y >= box.top && y < box.bottom)]
    if (hovered !== drag.hover) {
      clearTimeout(drag.hoverTimer)
      drag.hover = hovered
      if (hovered?.isBranch && !hovered.expanded && !hovered.disabled) {
        drag.hoverTimer = setTimeout(() => tree.expand(hovered.value), HOVER_EXPAND_DELAY)
      }
    }

    const drop = locate(above, below, drag.level + Math.round(((x - drag.x) * (drag.rtl ? -1 : 1)) / drag.indent))
    drag.drop = drop && allowed(item, drop.parent, drop.before) ? drop : undefined
    setDropTarget(drag.drop?.parent ?? null)
    draw(drag.drop, above ? rowBox(above) : below ? rowBox(below) : undefined, above ?? below, !!above)
  }

  /**
   * The drop for a gap between `above` and `below` at the depth closest to `wanted`. The gap allows any depth from
   * the row below's (the drop cannot pull that row out of its parent) to one under the row above, capped by
   * `max-depth`.
   */
  const locate = (above: TreeItem | undefined, below: TreeItem | undefined, wanted: number): Drop | undefined => {
    if (!drag) return undefined
    const max = Math.min(above ? above.level + (canNest(above) ? 1 : 0) : 0, tree.maxDepth == null ? Infinity : tree.maxDepth - drag.height)
    const min = below ? below.level : 0
    if (min > max) return undefined
    const level = Math.max(min, Math.min(max, wanted))
    if (!above) return { parent: null, before: below ?? null, level }
    if (level === above.level + 1) {
      // Under the row above: first among its open children, last in a collapsed branch.
      const first = above.expanded ? above.childItems.find((row) => row !== drag?.item) : undefined
      return { parent: above, before: first ?? null, level }
    }
    // Beside the row above, or beside the ancestor of it that sits at `level`.
    let sibling = above
    while (sibling.level > level) sibling = parentOf(sibling) ?? sibling
    const parent = parentOf(sibling)
    const siblings = siblingsOf(parent, drag.item).filter((row) => row !== drag?.item)
    return { parent, before: siblings[siblings.indexOf(sibling) + 1] ?? null, level }
  }

  const draw = (drop: Drop | undefined, box: DOMRect | undefined, reference: TreeItem | undefined, after: boolean) => {
    if (!drop || !box || !reference || !drag) {
      indicator.hidden = true
      return
    }
    const host = tree.getBoundingClientRect()
    const row = reference.renderRoot.querySelector('.row')
    const padding = row ? parseFloat(getComputedStyle(row).paddingInlineStart) - reference.level * drag.indent : 0
    const inset = Math.max(0, padding + drop.level * drag.indent)
    const left = drag.rtl ? box.left : box.left + inset
    indicator.hidden = false
    indicator.style.top = `${(after ? box.bottom : box.top) - host.top - tree.clientTop}px`
    indicator.style.left = `${left - host.left - tree.clientLeft}px`
    indicator.style.width = `${Math.max(0, box.width - inset)}px`
  }

  /** The row an event happened on. A press on the toggle, the checkbox or the actions is not a drag. */
  function itemOf(event: Event, pointer = false): TreeItem | undefined {
    for (const target of event.composedPath()) {
      if (target instanceof TreeItem) return target
      if (target === tree) return undefined
      if (pointer && target instanceof Element && (target.part.contains('toggle') || target.part.contains('checkbox') || target.part.contains('actions'))) {
        return undefined
      }
    }
    return undefined
  }
}

/** `items` with the node `value` moved under `parent` (`null` for the root) at `index`; untouched branches are kept. */
export function moveNode(items: TreeNode[], value: string, parent: string | null, index: number): TreeNode[] {
  const taken: { node?: TreeNode } = {}
  const rest = remove(items, value, taken)
  return taken.node ? insert(rest, parent, index, taken.node) : items
}

function remove(nodes: TreeNode[], value: string, taken: { node?: TreeNode }): TreeNode[] {
  const index = nodes.findIndex((node) => node.value === value)
  if (index !== -1) {
    taken.node = nodes[index]
    return nodes.filter((_, at) => at !== index)
  }
  return mapChildren(nodes, (children) => remove(children, value, taken))
}

function insert(nodes: TreeNode[], parent: string | null, index: number, node: TreeNode): TreeNode[] {
  if (parent === null) return [...nodes.slice(0, index), node, ...nodes.slice(index)]
  const at = nodes.findIndex((current) => current.value === parent)
  if (at === -1) return mapChildren(nodes, (children) => insert(children, parent, index, node))
  const children = nodes[at].children ?? []
  return nodes.map((current, position) => (position === at ? { ...current, children: [...children.slice(0, index), node, ...children.slice(index)] } : current))
}

/** Applies `change` to every node's children, rebuilding only the nodes whose children changed. */
function mapChildren(nodes: TreeNode[], change: (children: TreeNode[]) => TreeNode[]): TreeNode[] {
  let changed = false
  const next = nodes.map((node) => {
    if (!node.children) return node
    const children = change(node.children)
    if (children === node.children) return node
    changed = true
    return { ...node, children }
  })
  return changed ? next : nodes
}
