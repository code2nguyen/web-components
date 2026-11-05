/**
 * The hierarchy the treemap and the sunburst draw: rows read into a tree of groups and leaves, each with its path,
 * value and shares. Plain functions, so a table view or an export can build the same tree without a chart.
 */
import { getFieldValue } from '@c2n/core/data-helper.js'

/** One leaf or group of a hierarchy, as the tooltip, the events and a chart's `nodes` describe it. */
export interface HierarchyNode {
  /** The names from the top-level group down to this node. */
  path: string[]
  /** The node's own name: the last entry of `path`. */
  label: string
  /** The leaf's value, or the sum of a group's leaves. */
  value: number
  /** The `color-field` value of a leaf, or the value-weighted mean of a group's; `null` without `color-field`. */
  colorValue: number | null
  /** `1` for a top-level node, `2` for its children, and so on. */
  depth: number
  /** `value` as a share of the whole hierarchy, from 0 to 1. */
  share: number
  /** `value` as a share of the node's group, from 0 to 1; the same as `share` at the top level. */
  parentShare: number
  /** Whether the node is a leaf rather than a group. */
  leaf: boolean
}

/** How {@link buildHierarchy} reads the rows. */
export interface HierarchyOptions {
  labelField: string
  valueField: string
  /** Fields naming the groups a row belongs to, outermost first. */
  groupFields: readonly string[]
  /** Field holding a row's nested rows. */
  childrenField: string
  colorField: string
  /** Top-level names to leave out, as the legend's toggle does. */
  hidden?: ReadonlySet<string>
}

/** A node of the built tree: the public description plus its children, largest first. */
export interface HierarchyTreeNode extends HierarchyNode {
  children: HierarchyTreeNode[]
}

/**
 * Builds a tree from rows. A row is a leaf named by `labelField` and sized by `valueField`; the `groupFields` it
 * carries put it into groups, outermost first, and rows under `childrenField` nest inside it (a row with children is
 * a group, sized by them). Rows without a positive value are left out, and so are the groups left empty. Siblings are
 * ordered largest first.
 */
export function buildHierarchy(rows: readonly unknown[], options: HierarchyOptions): HierarchyTreeNode[] {
  interface Draft {
    label: string
    value: number
    weighted: number
    colored: number
    children: Map<string, Draft>
    leaf: boolean
  }
  const draft = (label: string, leaf: boolean): Draft => ({ label, value: 0, weighted: 0, colored: 0, children: new Map(), leaf })
  const root = draft('', false)

  const numberAt = (row: Record<string, unknown>, field: string): number | null => {
    if (!field) return null
    const raw = getFieldValue(row, field)
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    return Number.isFinite(value) ? value : null
  }
  const childAt = (parent: Draft, label: string, leaf: boolean): Draft => {
    // A leaf and a group may share a name in one group: they are different nodes, so the key tells them apart.
    const key = `${leaf ? 'leaf' : 'group'}:${label}`
    let node = parent.children.get(key)
    if (!node) {
      node = draft(label, leaf)
      parent.children.set(key, node)
    }
    return node
  }
  const add = (parent: Draft, row: unknown, depth: number): void => {
    if (!row || typeof row !== 'object') return
    const record = row as Record<string, unknown>
    const name = getFieldValue(record, options.labelField)
    const label = name === undefined || name === null ? '' : String(name)
    const nested = options.childrenField ? getFieldValue(record, options.childrenField) : undefined
    let target = parent
    if (depth === 0) {
      for (const field of options.groupFields) {
        const group = getFieldValue(record, field)
        if (group === undefined || group === null || String(group) === '') continue
        target = childAt(target, String(group), false)
      }
    }
    if (Array.isArray(nested) && nested.length > 0) {
      const group = childAt(target, label, false)
      for (const child of nested) add(group, child, depth + 1)
      return
    }
    const value = numberAt(record, options.valueField)
    if (value === null || value <= 0) return
    const leaf = childAt(target, label, true)
    leaf.value += value
    const color = numberAt(record, options.colorField)
    if (color !== null) {
      leaf.weighted += color * value
      leaf.colored += value
    }
  }
  for (const row of rows) add(root, row, 0)

  // Sums the groups bottom-up, drops the empty ones and orders siblings largest first.
  const settle = (node: Draft): void => {
    for (const [key, child] of node.children) {
      if (!child.leaf) settle(child)
      if (child.value <= 0) node.children.delete(key)
    }
    if (node.leaf) return
    node.value = 0
    node.weighted = 0
    node.colored = 0
    for (const child of node.children.values()) {
      node.value += child.value
      node.weighted += child.weighted
      node.colored += child.colored
    }
  }
  settle(root)
  // A share is of the whole data, so hiding a group from the legend does not change what the others are a share of.
  const total = [...root.children.values()].reduce((sum, child) => sum + child.value, 0)
  for (const name of options.hidden ?? []) {
    root.children.delete(`group:${name}`)
    root.children.delete(`leaf:${name}`)
  }

  const finish = (node: Draft, parentPath: string[], parentValue: number, depth: number): HierarchyTreeNode => {
    const path = [...parentPath, node.label]
    const children = [...node.children.values()].sort((a, b) => b.value - a.value).map((child) => finish(child, path, node.value, depth + 1))
    return {
      path,
      label: node.label,
      value: node.value,
      colorValue: node.colored > 0 ? node.weighted / node.colored : null,
      depth,
      share: total > 0 ? node.value / total : 0,
      parentShare: parentValue > 0 ? node.value / parentValue : 0,
      leaf: node.leaf,
      children,
    }
  }
  return [...root.children.values()].sort((a, b) => b.value - a.value).map((child) => finish(child, [], total, 1))
}

/**
 * The name a node is handed to ECharts under: its path, and whether it is a leaf, so two nodes never share one. The
 * labels are drawn from the model, so the engine never shows it.
 */
export function hierarchyEngineName(node: HierarchyNode): string {
  return `${node.leaf ? 'tile' : 'group'}\u001f${node.path.join('\u001f')}`
}

/** Every node depth first, a group before its children. */
export function preorderHierarchy(nodes: readonly HierarchyTreeNode[], out: HierarchyTreeNode[] = []): HierarchyTreeNode[] {
  for (const node of nodes) {
    out.push(node)
    preorderHierarchy(node.children, out)
  }
  return out
}

/** The deepest node along `path`, from the top level down; `undefined` when not even the first name matches. */
export function findHierarchyNode(nodes: readonly HierarchyTreeNode[], path: readonly string[], groupsOnly = false): HierarchyTreeNode | undefined {
  let found: HierarchyTreeNode | undefined
  let level = nodes
  for (const name of path) {
    // A group and a leaf may share a name; the group is the one a path goes on through.
    const next = level.find((node) => node.label === name && !node.leaf) ?? (groupsOnly ? undefined : level.find((node) => node.label === name))
    if (!next) break
    found = next
    level = next.children
  }
  return found
}

/** How many levels a tree has below the given nodes, counting them: `1` for leaves alone, `0` for no nodes. */
export function hierarchyHeight(nodes: readonly HierarchyTreeNode[]): number {
  let height = 0
  for (const node of nodes) height = Math.max(height, 1 + hierarchyHeight(node.children))
  return height
}
