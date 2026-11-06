import type { MindMapNode } from './mind-map-types'

// Immutable edits of a mind-map tree: each returns a new root and copies only the nodes on the path to the change, so
// an undo step is just the previous root.

/** Reads a `children` value that may not be an array, as JSON from an attribute can be. */
export function childrenOf(node: MindMapNode | null | undefined): MindMapNode[] {
  return Array.isArray(node?.children) ? node.children : []
}

let generated = 0

/** A fresh id for a new topic. */
export function newId(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `topic-${random}-${++generated}`
}

/**
 * A copy of `data` the map can edit: every node gets a string `id` (generated when missing or already taken) and a
 * string `label`; unknown fields are kept.
 */
export function normalize(data: unknown): MindMapNode | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const seen = new Set<string>()
  const walk = (raw: Record<string, unknown>): MindMapNode => {
    let id = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id) : ''
    if (!id || seen.has(id)) {
      if (id) console.warn(`c2-mind-map: the id "${id}" is used by more than one node; a new id is given to the second.`)
      id = newId()
    }
    seen.add(id)
    const node: MindMapNode = { ...raw, id, label: raw.label == null ? '' : String(raw.label) }
    if (Array.isArray(raw.children)) {
      node.children = raw.children.filter((child): child is Record<string, unknown> => !!child && typeof child === 'object').map(walk)
    } else delete node.children
    return node
  }
  return walk(data as Record<string, unknown>)
}

/** The nodes from the root down to the node with `id`, or `null`. */
export function pathTo(root: MindMapNode, id: string): MindMapNode[] | null {
  if (root.id === id) return [root]
  for (const child of childrenOf(root)) {
    const path = pathTo(child, id)
    if (path) return [root, ...path]
  }
  return null
}

/** Every node below `node`, at any depth. */
export function countDescendants(node: MindMapNode): number {
  return childrenOf(node).reduce((sum, child) => sum + 1 + countDescendants(child), 0)
}

/** A new root with the node `id` replaced by `update(node)`. */
export function updateNode(root: MindMapNode, id: string, update: (node: MindMapNode) => MindMapNode): MindMapNode {
  if (root.id === id) return update(root)
  const children = childrenOf(root)
  let changed = false
  const next = children.map((child) => {
    const updated = updateNode(child, id, update)
    if (updated !== child) changed = true
    return updated
  })
  return changed ? { ...root, children: next } : root
}

/** A new root without the node `id` and its subtree. */
export function removeNode(root: MindMapNode, id: string): MindMapNode {
  const path = pathTo(root, id)
  if (!path || path.length < 2) return root
  const parent = path[path.length - 2]
  return updateNode(root, parent.id, (node) => ({ ...node, children: childrenOf(node).filter((child) => child.id !== id) }))
}

/** A new root with `nodes` inserted into the children of `parentId` at `index` (clamped). */
export function insertNodes(root: MindMapNode, parentId: string, index: number, nodes: MindMapNode[]): MindMapNode {
  return updateNode(root, parentId, (parent) => {
    const children = [...childrenOf(parent)]
    const at = Math.max(0, Math.min(index, children.length))
    children.splice(at, 0, ...nodes)
    return { ...parent, children }
  })
}

/**
 * A new root with the node `id` moved under `parentId` at `index`, counted in the children as they are before the
 * move. Moving a node into its own subtree returns the root unchanged.
 */
export function moveNode(root: MindMapNode, id: string, parentId: string, index: number): MindMapNode {
  const path = pathTo(root, id)
  if (!path || path.length < 2) return root
  const node = path[path.length - 1]
  if (pathTo(node, parentId)) return root
  const oldParent = path[path.length - 2]
  const oldIndex = childrenOf(oldParent).indexOf(node)
  const at = oldParent.id === parentId && oldIndex < index ? index - 1 : index
  return insertNodes(removeNode(root, id), parentId, at, [node])
}

/** A copy of `node` and its subtree with fresh ids, for a paste. */
export function withNewIds(node: MindMapNode): MindMapNode {
  const copy: MindMapNode = { ...node, id: newId() }
  if (node.children) copy.children = childrenOf(node).map(withNewIds)
  return copy
}

// Outlines: a map as an indented Markdown list and back.

/**
 * A topic and its subtopics as an indented Markdown list, two spaces a level:
 *
 * ```md
 * - Q3 launch
 *   - Marketing
 *     - Paid ads
 * ```
 *
 * A line break inside a label becomes a space. Folded subtopics are included.
 */
export function toOutline(data: MindMapNode | null | undefined): string {
  if (!data) return ''
  const lines: string[] = []
  const walk = (node: MindMapNode, depth: number) => {
    lines.push(`${'  '.repeat(depth)}- ${String(node.label ?? '').replace(/\s*\n\s*/g, ' ')}`)
    for (const child of childrenOf(node)) walk(child, depth + 1)
  }
  walk(data, 0)
  return lines.join('\n')
}

/**
 * The topics of an indented list, as a forest: one node per top-level line. Bullets (`-`, `*`, `+`, `1.`) are
 * optional, indentation is by spaces or tabs, and blank lines are skipped. New topics get fresh ids.
 */
export function parseOutline(text: string): MindMapNode[] {
  const roots: MindMapNode[] = []
  const stack: { indent: number; node: MindMapNode }[] = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (!raw.trim()) continue
    const indent = (raw.match(/^[ \t]*/)?.[0] ?? '').replace(/\t/g, '    ').length
    const label = raw
      .trim()
      .replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
      .trim()
    const node: MindMapNode = { id: newId(), label }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1]?.node
    if (parent) parent.children = [...childrenOf(parent), node]
    else roots.push(node)
    stack.push({ indent, node })
  }
  return roots
}

/**
 * A map from an indented list (see {@link toOutline}). One top-level line is the central topic; several become the
 * subtopics of an untitled central topic. Returns `null` for empty text.
 */
export function fromOutline(text: string): MindMapNode | null {
  const roots = parseOutline(text)
  if (!roots.length) return null
  return roots.length === 1 ? roots[0] : { id: newId(), label: '', children: roots }
}
