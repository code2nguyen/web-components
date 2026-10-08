/** Prefix of the id of a "show more" line, followed by the pointer of its branch. */
export const MORE_PREFIX = 'more:'

/** One step of a path: an object key or an array index. */
export type JsonPathSegment = string | number

/** How `c2-json-viewer` writes a path: JSONPath (`$.items[0].name`) or JSON Pointer (`/items/0/name`). */
export type JsonPathFormat = 'jsonpath' | 'pointer'

export type JsonValueKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'circular' | 'other'

/** A visible line of the viewer. */
export interface JsonRow {
  /** JSON Pointer of the node: unique, used as the row's identity. */
  id: string
  /** Position of the line in the list `flatten` returned. */
  index: number
  /** The line of the enclosing branch, `undefined` at the top level. Read the full path with {@link pathOf}. */
  parent: JsonRow | undefined
  /** Key in the parent, `undefined` for the root. */
  key: JsonPathSegment | undefined
  value: unknown
  kind: JsonValueKind
  /** 1 for the top-level entries. */
  level: number
  /** Children count of an object or array. */
  size: number
  expanded: boolean
  posinset: number
  setsize: number
  /** Set on the "show more" line of a long branch: how many children it still hides. */
  more?: number
}

export interface FlattenOptions {
  /** Whether the branch with this pointer is open. */
  isExpanded: (id: string, level: number) => boolean
  /** How many children of the branch with this pointer are shown before a "show more" line. */
  limit: (id: string) => number
  /** When set, only these pointers are shown (search filtering). */
  visible?: Set<string>
}

// JSONPath (RFC 9535) shorthand names: a letter or `_`, then letters, digits or `_`. Anything else is bracketed.
const IDENTIFIER = /^[A-Za-z_]\w*$/

export function kindOf(value: unknown): JsonValueKind {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  switch (typeof value) {
    case 'object':
      return 'object'
    case 'string':
      return 'string'
    case 'number':
    case 'bigint':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return 'other'
  }
}

export function isBranch(kind: JsonValueKind): boolean {
  return kind === 'object' || kind === 'array'
}

// Keys are read once per object and kept for as long as the object lives: re-rendering a branch with 50k keys must not
// call `Object.keys` (or sort them) again. This is why `data` is treated as immutable — replace it, don't mutate it.
const keyCache = new WeakMap<object, string[]>()
const sortedKeyCache = new WeakMap<object, string[]>()

function keysOf(value: object, sortKeys: boolean): string[] {
  const cache = sortKeys ? sortedKeyCache : keyCache
  let keys = cache.get(value)
  if (!keys) {
    keys = sortKeys ? [...keysOf(value, false)].sort((a, b) => a.localeCompare(b)) : Object.keys(value)
    cache.set(value, keys)
  }
  return keys
}

/** How many children an object or array has, without building them. */
export function sizeOf(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value !== null && typeof value === 'object') return keysOf(value, false).length
  return 0
}

/** The keys of an object's children in display order, or `undefined` for an array (its keys are its indexes). */
export function childKeys(value: unknown, sortKeys = false): string[] | undefined {
  return Array.isArray(value) ? undefined : keysOf(value as object, sortKeys)
}

/** The `index`-th child of an object or array as a `[key, value]` pair; `keys` comes from {@link childKeys}. */
export function childAt(value: unknown, index: number, keys: string[] | undefined): [JsonPathSegment, unknown] {
  if (!keys) return [index, (value as unknown[])[index]]
  const key = keys[index]
  return [key, (value as Record<string, unknown>)[key]]
}

/** The path of a line, from the top level down. */
export function pathOf(row: JsonRow | undefined): JsonPathSegment[] {
  const path: JsonPathSegment[] = []
  for (let node = row; node; node = node.parent) if (node.key !== undefined) path.push(node.key)
  return path.reverse()
}

function escapePointer(segment: JsonPathSegment): string {
  if (typeof segment === 'number') return String(segment)
  // Most keys need no escaping; skipping the two replaces matters across a million lines.
  if (!segment.includes('~') && !segment.includes('/')) return segment
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function pointerOf(path: readonly JsonPathSegment[]): string {
  return path.map((segment) => `/${escapePointer(segment)}`).join('')
}

/** Writes a path in the given format. The root is `$` in JSONPath and the empty string in JSON Pointer. */
export function formatPath(path: readonly JsonPathSegment[], format: JsonPathFormat = 'jsonpath'): string {
  if (format === 'pointer') return pointerOf(path)
  return path.reduce<string>((out, segment) => {
    if (typeof segment === 'number') return `${out}[${segment}]`
    return IDENTIFIER.test(segment) ? `${out}.${segment}` : `${out}[${JSON.stringify(segment)}]`
  }, '$')
}

/** The text a leaf shows, without quotes for strings: the part search runs against. */
export function leafText(value: unknown, kind: JsonValueKind): string {
  switch (kind) {
    case 'string':
      return JSON.stringify(value).slice(1, -1)
    case 'number':
      return typeof value === 'bigint' ? `${value}n` : String(value)
    case 'boolean':
      return String(value)
    case 'null':
      return 'null'
    case 'circular':
      return '[Circular]'
    default:
      return String(value)
  }
}

/** What "copy value" puts on the clipboard: a string as-is, anything else as JSON. */
export function copyText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'bigint') return String(value)
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * The visible lines of `root` for the current expansion. The root of an object or array is not a line itself.
 * Cost is proportional to the lines returned, not to the size of the document: a collapsed branch is never walked and
 * a long one is only read up to its page limit.
 */
export function flatten(root: unknown, options: FlattenOptions, sortKeys = false): JsonRow[] {
  const rows: JsonRow[] = []
  const rootKind = kindOf(root)
  if (!isBranch(rootKind)) {
    if (root === undefined || (options.visible && !options.visible.has(''))) return rows
    rows.push({ id: '', index: 0, parent: undefined, key: undefined, value: root, kind: rootKind, level: 1, size: 0, expanded: false, posinset: 1, setsize: 1 })
    return rows
  }
  const ancestors = new Set<unknown>([root])
  const walk = (value: unknown, parent: JsonRow | undefined, parentId: string, level: number) => {
    const total = sizeOf(value)
    const keys = childKeys(value, sortKeys)
    // Filtering has to look at every child to know which survive; the unfiltered walk only reads the ones it shows.
    let children: number[] | undefined
    if (options.visible) {
      children = []
      for (let i = 0; i < total; i++) if (options.visible.has(`${parentId}/${escapePointer(childAt(value, i, keys)[0])}`)) children.push(i)
    }
    const count = children ? children.length : total
    const shown = Math.min(count, Math.max(1, options.limit(parentId)))
    const setsize = shown < count ? shown + 1 : shown
    for (let index = 0; index < shown; index++) {
      const [key, child] = childAt(value, children ? children[index] : index, keys)
      const id = `${parentId}/${escapePointer(key)}`
      let kind = kindOf(child)
      if (isBranch(kind) && ancestors.has(child)) kind = 'circular'
      const size = isBranch(kind) ? sizeOf(child) : 0
      const expanded = size > 0 && options.isExpanded(id, level)
      const row: JsonRow = { id, index: rows.length, parent, key, value: child, kind, level, size, expanded, posinset: index + 1, setsize }
      rows.push(row)
      if (expanded) {
        ancestors.add(child)
        walk(child, row, id, level + 1)
        ancestors.delete(child)
      }
    }
    if (shown < count) {
      rows.push({
        // Not a pointer (those are empty or start with `/`), so no key can collide with it.
        id: `${MORE_PREFIX}${parentId}`,
        index: rows.length,
        parent,
        key: undefined,
        value: undefined,
        kind: 'other',
        level,
        size: 0,
        expanded: false,
        posinset: setsize,
        setsize,
        more: count - shown,
      })
    }
  }
  walk(root, undefined, '', 1)
  return rows
}

export interface SearchResult {
  /** Pointers of the nodes whose key or value contains the query. */
  matches: string[]
  /** Pointers of every match and of each of their ancestors. */
  revealed: Set<string>
  /** For each branch, the index of the last child on the way to a match, so paging can show it. */
  deepest: Map<string, number>
}

/** Finds every node whose key or leaf text contains `query`, case-insensitively. */
export function search(root: unknown, query: string, sortKeys = false): SearchResult {
  const result: SearchResult = { matches: [], revealed: new Set(), deepest: new Map() }
  const needle = query.toLowerCase()
  if (!needle) return result
  const ancestors = new Set<unknown>()
  // The pointer is built from this stack only for nodes that match or lead to a match, not for every node visited.
  const segments: string[] = []
  const pointer = () => (segments.length ? `/${segments.join('/')}` : '')
  const visit = (value: unknown, key: JsonPathSegment | undefined): boolean => {
    let kind = kindOf(value)
    if (isBranch(kind) && ancestors.has(value)) kind = 'circular'
    const keyHit = key !== undefined && String(key).toLowerCase().includes(needle)
    const valueHit = !isBranch(kind) && value !== undefined && leafText(value, kind).toLowerCase().includes(needle)
    const hit = keyHit || valueHit
    // Pushed before the children are visited, so the matches come out in document order.
    if (hit && (key !== undefined || !isBranch(kind))) result.matches.push(pointer())
    let found = hit
    let id: string | undefined
    if (isBranch(kind)) {
      ancestors.add(value)
      const keys = childKeys(value, sortKeys)
      for (let index = 0, size = sizeOf(value); index < size; index++) {
        const [childKey, child] = childAt(value, index, keys)
        segments.push(escapePointer(childKey))
        const childFound = visit(child, childKey)
        segments.pop()
        if (childFound) {
          found = true
          result.deepest.set((id ??= pointer()), index)
        }
      }
      ancestors.delete(value)
    }
    if (found) result.revealed.add(id ?? pointer())
    return found
  }
  visit(root, undefined)
  return result
}

/** Every pointer under the revealed matches, so a filtered view keeps a matching branch's own contents. */
export function filterVisible(root: unknown, result: SearchResult, sortKeys = false): Set<string> {
  const visible = new Set(result.revealed)
  const matched = new Set(result.matches)
  const ancestors = new Set<unknown>()
  const addAll = (value: unknown, id: string) => {
    if (!isBranch(kindOf(value)) || ancestors.has(value)) return
    ancestors.add(value)
    const keys = childKeys(value, sortKeys)
    for (let index = 0, size = sizeOf(value); index < size; index++) {
      const [key, child] = childAt(value, index, keys)
      const childId = `${id}/${escapePointer(key)}`
      visible.add(childId)
      addAll(child, childId)
    }
    ancestors.delete(value)
  }
  const visit = (value: unknown, id: string) => {
    if (matched.has(id)) return addAll(value, id)
    if (!isBranch(kindOf(value)) || ancestors.has(value)) return
    ancestors.add(value)
    const keys = childKeys(value, sortKeys)
    for (let index = 0, size = sizeOf(value); index < size; index++) {
      const [key, child] = childAt(value, index, keys)
      const childId = `${id}/${escapePointer(key)}`
      if (visible.has(childId)) visit(child, childId)
    }
    ancestors.delete(value)
  }
  visit(root, '')
  return visible
}
