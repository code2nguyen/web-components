/** One step of a path: an object key or an array index. */
export type JsonPathSegment = string | number

/** How `c2-json-viewer` writes a path: JSONPath (`$.items[0].name`) or JSON Pointer (`/items/0/name`). */
export type JsonPathFormat = 'jsonpath' | 'pointer'

export type JsonValueKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'circular' | 'other'

/** A visible line of the viewer. */
export interface JsonRow {
  /** JSON Pointer of the node: unique, used as the row's identity. */
  id: string
  path: JsonPathSegment[]
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

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

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

/** The children of an object or array as `[key, value]` pairs, in order. */
export function entriesOf(value: unknown, sortKeys = false): [JsonPathSegment, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [index, item])
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    if (sortKeys) keys.sort((a, b) => a.localeCompare(b))
    return keys.map((key) => [key, (value as Record<string, unknown>)[key]])
  }
  return []
}

function escapePointer(segment: JsonPathSegment): string {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1')
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

/** The visible lines of `root` for the current expansion. The root of an object or array is not a line itself. */
export function flatten(root: unknown, options: FlattenOptions, sortKeys = false): JsonRow[] {
  const rows: JsonRow[] = []
  const rootKind = kindOf(root)
  if (!isBranch(rootKind)) {
    if (root === undefined) return rows
    rows.push({ id: '', path: [], key: undefined, value: root, kind: rootKind, level: 1, size: 0, expanded: false, posinset: 1, setsize: 1 })
    return rows
  }
  const ancestors = new Set<unknown>([root])
  const walk = (parent: unknown, parentPath: JsonPathSegment[], parentId: string, level: number) => {
    let entries = entriesOf(parent, sortKeys)
    if (options.visible) entries = entries.filter(([key]) => options.visible!.has(`${parentId}/${escapePointer(key)}`))
    const limit = Math.min(entries.length, Math.max(1, options.limit(parentId)))
    const shown = entries.length > limit ? limit : entries.length
    const setsize = shown < entries.length ? shown + 1 : shown
    for (let index = 0; index < shown; index++) {
      const [key, value] = entries[index]
      const path = [...parentPath, key]
      const id = `${parentId}/${escapePointer(key)}`
      let kind = kindOf(value)
      if (isBranch(kind) && ancestors.has(value)) kind = 'circular'
      const size = isBranch(kind) ? entriesOf(value).length : 0
      const expanded = isBranch(kind) && size > 0 && options.isExpanded(id, level)
      rows.push({ id, path, key, value, kind, level, size, expanded, posinset: index + 1, setsize })
      if (expanded) {
        ancestors.add(value)
        walk(value, path, id, level + 1)
        ancestors.delete(value)
      }
    }
    if (shown < entries.length) {
      rows.push({
        id: `${parentId}/#more`,
        path: parentPath,
        key: undefined,
        value: undefined,
        kind: 'other',
        level,
        size: 0,
        expanded: false,
        posinset: setsize,
        setsize,
        more: entries.length - shown,
      })
    }
  }
  walk(root, [], '', 1)
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
  const visit = (value: unknown, key: JsonPathSegment | undefined, id: string): boolean => {
    let kind = kindOf(value)
    if (isBranch(kind) && ancestors.has(value)) kind = 'circular'
    const keyHit = key !== undefined && String(key).toLowerCase().includes(needle)
    const valueHit = !isBranch(kind) && value !== undefined && leafText(value, kind).toLowerCase().includes(needle)
    const hit = keyHit || valueHit
    // Pushed before the children are visited, so the matches come out in document order.
    if (hit && (key !== undefined || !isBranch(kind))) result.matches.push(id)
    let found = hit
    if (isBranch(kind)) {
      ancestors.add(value)
      entriesOf(value, sortKeys).forEach(([childKey, child], index) => {
        if (visit(child, childKey, `${id}/${escapePointer(childKey)}`)) {
          found = true
          result.deepest.set(id, index)
        }
      })
      ancestors.delete(value)
    }
    if (found) result.revealed.add(id)
    return found
  }
  visit(root, undefined, '')
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
    for (const [key, child] of entriesOf(value, sortKeys)) {
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
    for (const [key, child] of entriesOf(value, sortKeys)) {
      const childId = `${id}/${escapePointer(key)}`
      if (visible.has(childId)) visit(child, childId)
    }
    ancestors.delete(value)
  }
  visit(root, '')
  return visible
}
