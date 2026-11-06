import type { MindMapLayout, MindMapSide } from './mind-map-types'

/** A drawn topic and its drawn subtopics (a folded topic has none), for the layout. */
export interface LayoutTopic {
  id: string
  children: LayoutTopic[]
  /** First-level topics only: the side asked for, if any. */
  side?: MindMapSide
  /** First-level topics only: how much the branch weighs when the sides are balanced (its topic count). */
  weight?: number
}

export interface TopicSize {
  width: number
  height: number
}

/** Where a topic is drawn, relative to the centre of the central topic. */
export interface TopicBox {
  x: number
  y: number
  width: number
  height: number
  side: MindMapSide | 'center'
  /** 0 for the central topic. */
  level: number
  parent: string | null
}

export interface LayoutOptions {
  layout: MindMapLayout
  /** Horizontal room between a topic and its subtopics. */
  levelGap: number
  /** Vertical room between two neighbouring subtrees. */
  siblingGap: number
}

/**
 * The side of each first-level topic. `left` and `right` put them all on one side. `both` honours an explicit `side`
 * and puts each other topic, in order, on the lighter side (the right on a tie), as XMind balances a map.
 */
export function resolveSides(children: readonly Pick<LayoutTopic, 'side' | 'weight'>[], layout: MindMapLayout): MindMapSide[] {
  if (layout === 'left' || layout === 'right') return children.map(() => layout)
  const weight = { left: 0, right: 0 }
  for (const child of children) if (child.side === 'left' || child.side === 'right') weight[child.side] += child.weight ?? 1
  return children.map((child) => {
    const side: MindMapSide = child.side === 'left' || child.side === 'right' ? child.side : weight.left < weight.right ? 'left' : 'right'
    if (child.side !== 'left' && child.side !== 'right') weight[side] += child.weight ?? 1
    return side
  })
}

/**
 * A tidy tree on each side of the central topic. A subtree is as tall as its subtopics plus the sibling gap between
 * them (or as the topic itself, if taller), and a topic is centred on its subtopics. Topics grow outwards from the
 * centre: on the right side a topic's left edge is `levelGap` past its parent's right edge, mirrored on the left.
 */
export function layoutMindMap(root: LayoutTopic, sizeOf: (id: string) => TopicSize, options: LayoutOptions): Map<string, TopicBox> {
  const boxes = new Map<string, TopicBox>()
  const heights = new Map<string, number>()
  const { levelGap, siblingGap } = options

  const subtreeHeight = (topic: LayoutTopic): number => {
    const own = sizeOf(topic.id).height
    let total = 0
    topic.children.forEach((child, index) => (total += subtreeHeight(child) + (index ? siblingGap : 0)))
    const height = Math.max(own, total)
    heights.set(topic.id, height)
    return height
  }

  const place = (topic: LayoutTopic, side: MindMapSide, edge: number, centre: number, level: number, parent: string) => {
    const size = sizeOf(topic.id)
    const x = side === 'right' ? edge : edge - size.width
    boxes.set(topic.id, { x, y: centre - size.height / 2, width: size.width, height: size.height, side, level, parent })
    placeChildren(topic.children, side, side === 'right' ? x + size.width + levelGap : x - levelGap, centre, level + 1, topic.id)
  }

  const placeChildren = (children: LayoutTopic[], side: MindMapSide, edge: number, centre: number, level: number, parent: string) => {
    if (!children.length) return
    const total = children.reduce((sum, child, index) => sum + (heights.get(child.id) ?? 0) + (index ? siblingGap : 0), 0)
    let top = centre - total / 2
    for (const child of children) {
      const height = heights.get(child.id) ?? 0
      place(child, side, edge, top + height / 2, level, parent)
      top += height + siblingGap
    }
  }

  const rootSize = sizeOf(root.id)
  boxes.set(root.id, {
    x: -rootSize.width / 2,
    y: -rootSize.height / 2,
    width: rootSize.width,
    height: rootSize.height,
    side: 'center',
    level: 0,
    parent: null,
  })
  for (const child of root.children) subtreeHeight(child)
  const sides = resolveSides(root.children, options.layout)
  for (const side of ['right', 'left'] as const) {
    const children = root.children.filter((_, index) => sides[index] === side)
    placeChildren(children, side, side === 'right' ? rootSize.width / 2 + levelGap : -rootSize.width / 2 - levelGap, 0, 1, root.id)
  }
  return boxes
}

/** The smallest rectangle holding every box. */
export function boundsOf(boxes: Iterable<TopicBox>): { x: number; y: number; width: number; height: number } {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const box of boxes) {
    left = Math.min(left, box.x)
    top = Math.min(top, box.y)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  if (!Number.isFinite(left)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: left, y: top, width: right - left, height: bottom - top }
}
