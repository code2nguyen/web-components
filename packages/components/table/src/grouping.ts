/**
 * The group tree behind `group-by`: bucketing rows into nested groups, the display list a grouped body is drawn from,
 * and which groups are open. Pure functions over plain data (type imports only), so `grouping.test.ts` runs them under
 * `node --test` without a browser; `c2-table` supplies the parts that depend on its columns and its data.
 */
import type { TableGroupBy, TableRow } from './table-types.js'

/** One group of the row tree, built from the sorted rows whenever they or `groupBy` change. */
export interface GroupNode {
  key: string
  level: number
  field: string
  value: unknown
  /** Indices of the group's rows, sub-groups included, in the array the tree was built from. Empty for a remote group. */
  rowIndices: number[]
  /** Number of rows in the group, sub-groups included: `rowIndices.length`, or the count a data source reported. */
  count: number
  /** A remote group's rows: a contiguous range of the sparse source array, filled as blocks arrive. */
  range?: { start: number; count: number }
  children: GroupNode[]
  parent?: GroupNode
  /** Where the group's own row sits in the display list; -1 while a closed parent hides it. */
  position: number
  /** The aggregates a data source sent with a remote group, keyed by column id. */
  remoteSummary?: Record<string, unknown>
  /** The rows, their keys and the aggregates, computed on first use: the tree is rebuilt whenever the rows change. */
  rows?: TableRow[]
  keys?: string[]
  selection?: { value: string[]; count: number }
  summary?: { inputs: unknown[]; values: Map<string, unknown> }
}

/** One line of a grouped body: a group row, or a data row pointing into the array the tree was built from. */
export type DisplayItem = { kind: 'group'; node: GroupNode } | { kind: 'row'; rowIndex: number; parent: GroupNode }

export interface GroupTree {
  levels: TableGroupBy[]
  /** The rows the tree indexes into: the sorted rows, or for a data source a sparse array of the rows fetched so far. */
  source: (TableRow | undefined)[]
  roots: GroupNode[]
  nodes: Map<string, GroupNode>
}

export interface Grouping extends GroupTree {
  items: DisplayItem[]
  /** Whether a data source groups the rows, so rows load per group and aggregates come from the source. */
  remote: boolean
}

/** Group keys are `field=value` pairs joined by `/`, so those characters (and `;`, the list separator) are escaped. */
export function encodeGroupPart(value: string): string {
  return value.replace(/[%/=;]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** Groups rows by the string form of their value: `1` and `"1"` share a group, and an empty value is its own. */
export function groupBucketId(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** The key of the group of `field = value` under `parent`: `region=EMEA/status=Paid`. */
export function groupKey(parent: GroupNode | undefined, field: string, value: unknown): string {
  const part = `${encodeGroupPart(field)}=${encodeGroupPart(groupBucketId(value))}`
  return parent ? `${parent.key}/${part}` : part
}

/** Orders one level's sibling groups; called once their own sub-groups are built, so a group's rows are known. */
export type GroupOrder = (level: TableGroupBy, nodes: GroupNode[]) => GroupNode[]

/**
 * Buckets `source` level by level. Rows keep their order inside a bucket; `order` sorts the buckets of each level.
 * `valueOf` reads the value a row is grouped by at a level (its field, or the level's `getValue`).
 */
export function buildGroupTree(
  source: TableRow[],
  levels: TableGroupBy[],
  valueOf: (row: TableRow, level: TableGroupBy) => unknown,
  order: GroupOrder,
): GroupTree {
  const nodes = new Map<string, GroupNode>()
  const build = (indices: number[], level: number, parent: GroupNode | undefined): GroupNode[] => {
    const spec = levels[level]
    const buckets = new Map<string, { value: unknown; indices: number[] }>()
    for (const index of indices) {
      const value = valueOf(source[index], spec)
      const id = groupBucketId(value)
      const bucket = buckets.get(id)
      if (bucket) bucket.indices.push(index)
      else buckets.set(id, { value, indices: [index] })
    }
    const children = [...buckets.values()].map((bucket) => {
      const node: GroupNode = {
        key: groupKey(parent, spec.field, bucket.value),
        level,
        field: spec.field,
        value: bucket.value,
        rowIndices: bucket.indices,
        count: bucket.indices.length,
        children: [],
        parent,
        position: -1,
      }
      nodes.set(node.key, node)
      if (level + 1 < levels.length) node.children = build(bucket.indices, level + 1, node)
      return node
    })
    return order(spec, children)
  }
  const roots = build(
    source.map((_, index) => index),
    0,
    undefined,
  )
  return { levels, source, roots, nodes }
}

/** One group as a data source reports it: its value, its number of rows and, optionally, its aggregates by column id. */
export interface RemoteGroup {
  value: unknown
  count: number
  summary?: Record<string, unknown>
}

/**
 * The tree of the groups a data source has listed so far. `lists` holds the sub-groups of each group whose sub-groups
 * were fetched, by the parent's key (`''` for the top level). Every group gets a contiguous range of a sparse source
 * array, nested inside its parent's; `rowsOf` hands back the rows fetched for a bottom-level group by block, and they
 * are written into that range.
 */
export function buildRemoteGroupTree(
  levels: TableGroupBy[],
  lists: ReadonlyMap<string, readonly RemoteGroup[]>,
  rowsOf: (key: string) => ReadonlyMap<number, readonly TableRow[]> | undefined,
  blockSize: number,
): GroupTree {
  const nodes = new Map<string, GroupNode>()
  const top = lists.get('') ?? []
  const total = top.reduce((sum, group) => sum + Math.max(0, Math.floor(group.count) || 0), 0)
  const source: (TableRow | undefined)[] = new Array(total)
  const build = (groups: readonly RemoteGroup[], level: number, parent: GroupNode | undefined, start: number): GroupNode[] => {
    const spec = levels[level]
    let offset = start
    return groups.map((group) => {
      const count = Math.max(0, Math.floor(group.count) || 0)
      const node: GroupNode = {
        key: groupKey(parent, spec.field, group.value),
        level,
        field: spec.field,
        value: group.value,
        rowIndices: [],
        count,
        range: { start: offset, count },
        children: [],
        parent,
        position: -1,
        remoteSummary: group.summary,
      }
      nodes.set(node.key, node)
      if (level + 1 < levels.length) {
        const children = lists.get(node.key)
        if (children) node.children = build(children, level + 1, node, offset)
      } else {
        for (const [block, rows] of rowsOf(node.key) ?? []) {
          rows.forEach((row, index) => {
            const at = block * blockSize + index
            if (at < count) source[offset + at] = row
          })
        }
      }
      offset += count
      return node
    })
  }
  const roots = build(top, 0, undefined, 0)
  return { levels, source, roots, nodes }
}

/**
 * The display list: each visible group followed, when open, by its sub-groups or (at the bottom level) its rows.
 * Sets every node's `position`, -1 for a group a closed parent hides. A remote group whose sub-groups have not been
 * fetched yet shows nothing under it.
 */
export function flattenGroups(tree: GroupTree, isExpanded: (node: GroupNode) => boolean): DisplayItem[] {
  const items: DisplayItem[] = []
  const bottom = tree.levels.length - 1
  const visit = (node: GroupNode) => {
    node.position = items.length
    items.push({ kind: 'group', node })
    if (!isExpanded(node)) return
    if (node.level < bottom) node.children.forEach(visit)
    else if (node.range)
      for (let rowIndex = node.range.start; rowIndex < node.range.start + node.range.count; rowIndex++) items.push({ kind: 'row', rowIndex, parent: node })
    else for (const rowIndex of node.rowIndices) items.push({ kind: 'row', rowIndex, parent: node })
  }
  for (const node of tree.nodes.values()) node.position = -1
  tree.roots.forEach(visit)
  return items
}

/** The item on a display line: its group, or the group at `level` above it. */
export function groupAtLevel(item: DisplayItem | undefined, level: number): GroupNode | undefined {
  let node: GroupNode | undefined = item?.kind === 'group' ? item.node : item?.parent
  while (node && node.level > level) node = node.parent
  return node?.level === level ? node : undefined
}

/** How many group levels a line sits under: the number of groups that can be stuck above it. */
export function depthOf(item: DisplayItem | undefined): number {
  if (!item) return 0
  return item.kind === 'group' ? item.node.level : item.parent.level + 1
}

/**
 * Which groups are open. `expanded`, when set, lists the open groups and every other group is closed. Otherwise every
 * group follows the default — open, or closed with `collapsedByDefault` — except those listed in `collapsed`.
 */
export interface GroupExpansion {
  expanded?: readonly string[]
  collapsed?: readonly string[]
  collapsedByDefault: boolean
}

/** A lookup for `expansion`, with the lists turned into sets once: a table can have thousands of groups. */
export function expansionResolver(expansion: GroupExpansion): (key: string) => boolean {
  if (expansion.expanded) {
    const open = new Set(expansion.expanded)
    return (key) => open.has(key)
  }
  if (expansion.collapsedByDefault) return () => false
  const closed = new Set(expansion.collapsed ?? [])
  return (key) => !closed.has(key)
}

/**
 * The lists to write so that the group `key` is `open`, recording only the exception to the default: a group that
 * appears later (new rows, another filter) then follows the default instead of the state of a stale list.
 */
export function toggleExpansion(expansion: GroupExpansion, key: string, open: boolean): Pick<GroupExpansion, 'expanded' | 'collapsed'> {
  if (expansion.expanded || expansion.collapsedByDefault) {
    const current = expansion.expanded ?? []
    return { expanded: open ? [...current.filter((entry) => entry !== key), key] : current.filter((entry) => entry !== key), collapsed: expansion.collapsed }
  }
  const current = expansion.collapsed ?? []
  return { expanded: undefined, collapsed: open ? current.filter((entry) => entry !== key) : [...current.filter((entry) => entry !== key), key] }
}
