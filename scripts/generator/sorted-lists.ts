/**
 * Alphabetical insertion into the hand-kept registries a new component is added to.
 *
 * Every component PR adds one line to the same lists (the root wireit build, the docs app's manifest imports, previews,
 * module imports, dependencies). Prepending each line after the list's opening made two open PRs touch the same spot,
 * which git reports as a conflict; a sorted list puts `confirm-dialog` and `password-field` in different places, so
 * they merge on their own. Keep these lists sorted when editing them by hand: an insertion is only as stable as the
 * order around it (`sortTextList`/`sortJsonList` restore it).
 *
 * Erasable TypeScript only: the plopfile compiles it, and Node runs it unbuilt to re-sort the lists.
 */
import { readFileSync, writeFileSync } from 'node:fs'

/** A list inside a source file: the lines after `after`, each item starting with a line matching `item`. */
export interface TextList {
  /** Matches the line right before the first item. */
  after: RegExp
  /** Matches the first line of an item; group 1 is its sort key. */
  item: RegExp
  /**
   * Matches the first line after the list. When set, every other line before it belongs to the item above it
   * (multi-line values, an `./*-examples` import kept next to its component); when unset the list ends at the first
   * line that is not an item.
   */
  end?: RegExp
}

interface Parsed {
  head: string[]
  items: { key: string; lines: string[] }[]
  tail: string[]
}

function parse(text: string, list: TextList): Parsed {
  const lines = text.split('\n')
  const anchor = lines.findIndex((line) => list.after.test(line))
  if (anchor === -1) throw new Error(`sorted-lists: no line matches ${list.after}`)
  const items: Parsed['items'] = []
  let index = anchor + 1
  for (; index < lines.length; index++) {
    const line = lines[index]
    if (list.end ? list.end.test(line) : !list.item.test(line)) break
    const key = list.item.exec(line)?.[1]
    if (key !== undefined) items.push({ key, lines: [line] })
    else if (items.length > 0) items[items.length - 1].lines.push(line)
    else throw new Error(`sorted-lists: "${line}" precedes the first item after ${list.after}`)
  }
  return { head: lines.slice(0, anchor + 1), items, tail: lines.slice(index) }
}

const join = ({ head, items, tail }: Parsed) => [...head, ...items.flatMap((item) => item.lines), ...tail].join('\n')

/** Inserts `entry` (one or more lines) before the first item whose key sorts after its own; a present key is kept. */
export function insertIntoText(text: string, list: TextList, entry: string): string {
  const parsed = parse(text, list)
  const lines = entry.replace(/\n$/, '').split('\n')
  const key = list.item.exec(lines[0])?.[1]
  if (key === undefined) throw new Error(`sorted-lists: "${lines[0]}" does not match ${list.item}`)
  if (parsed.items.some((item) => item.key === key)) return text
  const at = parsed.items.findIndex((item) => item.key > key)
  parsed.items.splice(at === -1 ? parsed.items.length : at, 0, { key, lines })
  return join(parsed)
}

export function sortTextList(text: string, list: TextList): string {
  const parsed = parse(text, list)
  parsed.items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return join(parsed)
}

/** A list inside a JSON file: an array of strings or an object, at `path`. */
export type JsonList = string[]

function locate(data: Record<string, unknown>, path: JsonList): { parent: Record<string, unknown>; key: string } {
  let parent = data
  for (const segment of path.slice(0, -1)) parent = parent[segment] as Record<string, unknown>
  return { parent, key: path[path.length - 1] }
}

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value].sort()
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/** Adds a string to the array, or a key to the object, at `path`, then sorts it. JSON files keep npm's formatting. */
export function insertIntoJson(text: string, path: JsonList, entry: string | [string, unknown]): string {
  const data = JSON.parse(text) as Record<string, unknown>
  const { parent, key } = locate(data, path)
  const value = parent[key]
  if (Array.isArray(value)) {
    if (typeof entry !== 'string') throw new Error(`sorted-lists: ${path.join('.')} is an array, expected a string entry`)
    if (!value.includes(entry)) value.push(entry)
  } else {
    if (typeof entry === 'string') throw new Error(`sorted-lists: ${path.join('.')} is an object, expected a [key, value] entry`)
    const object = value as Record<string, unknown>
    if (!(entry[0] in object)) object[entry[0]] = entry[1]
  }
  parent[key] = sortedValue(parent[key])
  return `${JSON.stringify(data, null, 2)}\n`
}

export function sortJsonList(text: string, path: JsonList): string {
  const data = JSON.parse(text) as Record<string, unknown>
  const { parent, key } = locate(data, path)
  parent[key] = sortedValue(parent[key])
  return `${JSON.stringify(data, null, 2)}\n`
}

/** The registries a new component (or example app) is added to, relative to the repository root. */
export const registries = {
  manifestImports: {
    file: 'apps/ui/src/store/component-manifests.ts',
    list: { after: /^import type \{ Package, CustomElement \}/, item: /^import \w+ from '(@c2n\/[^']+)'/ },
  },
  normalizedManifests: {
    file: 'apps/ui/src/store/component-manifests.ts',
    list: { after: /const normalizedManifests: ComponentManifests = \[/, item: /^ {4}(\w+),$/ },
  },
  componentModules: {
    file: 'apps/ui/src/data/component-modules.ts',
    list: { after: /^ \*\/$/, item: /^import '(@c2n\/components\/[^']+)'/, end: /^$/ },
  },
  componentPreviews: {
    file: 'apps/ui/src/data/component-previews.ts',
    list: { after: /^export const componentPreviews: Record<string, string> = \{/, item: /^ {2}'?([\w-]+)'?: /, end: /^\}/ },
  },
  uiDependencies: { file: 'apps/ui/package.json', path: ['dependencies'] },
  rootBuild: { file: 'package.json', path: ['wireit', 'build', 'dependencies'] },
  examplesBuild: { file: 'package.json', path: ['wireit', 'examples:build', 'dependencies'] },
  themeBuild: { file: 'packages/tools/theme/package.json', path: ['wireit', 'build', 'dependencies'] },
} satisfies Record<string, { file: string; list: TextList } | { file: string; path: JsonList }>

/** `node scripts/generator/sorted-lists.ts [root]` re-sorts every registry in place, e.g. after a hand edit. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? new URL('../..', import.meta.url).pathname
  for (const registry of Object.values(registries)) {
    const file = `${root.replace(/\/$/, '')}/${registry.file}`
    const text = readFileSync(file, 'utf8')
    writeFileSync(file, 'list' in registry ? sortTextList(text, registry.list) : sortJsonList(text, registry.path))
  }
}
