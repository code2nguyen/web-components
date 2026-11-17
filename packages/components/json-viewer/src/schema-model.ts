import { html, nothing, type TemplateResult } from 'lit'
import { pointerOf, type JsonPathSegment, type JsonRow } from './json-model.js'
import type { JsonViewerMessages } from './messages.js'

// The schema mode of `c2-schema-tree`, loaded the first time a schema is given. It turns a JSON Schema (or an OpenAPI
// schema object) into a tree of plain objects that `c2-json-viewer` flattens, searches and pages as it does any JSON:
// each property is a key, a schema with properties or options is a branch, any other schema a leaf whose value is its
// type. What a line says about its schema (type, required, constraints, description) is kept beside it, by pointer and
// by parent object.

/** A keyword limiting a value, with the message that writes it. */
export type SchemaConstraintKey =
  | 'minimum'
  | 'exclusiveMinimum'
  | 'maximum'
  | 'exclusiveMaximum'
  | 'multipleOf'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'minItems'
  | 'maxItems'
  | 'uniqueItems'
  | 'minProperties'
  | 'maxProperties'
  | 'const'
  | 'default'

/** What one line of `c2-schema-tree` shows. */
export interface SchemaLine {
  /** A property, an option of `oneOf`/`anyOf`, the item at a tuple position, `additionalProperties` or a `patternProperties` entry. */
  kind: 'property' | 'option' | 'position' | 'other' | 'pattern'
  /** The property name, the option's title, the tuple position or the pattern; unset for an untitled option. */
  name?: string
  /** Position of an option, from 1. */
  position?: number
  /** The type as written in TypeScript style: `string`, `integer | null`, `Tag[]`, `Address`. Empty for a bare `oneOf`. */
  type: string
  format?: string
  /** `oneOf` or `anyOf` when the schema is a choice of options, which are its child lines. */
  choice?: 'oneOf' | 'anyOf'
  required: boolean
  deprecated: boolean
  readOnly: boolean
  writeOnly: boolean
  /** Refers back to an ancestor: the line has no children. */
  recursive: boolean
  constraints: [SchemaConstraintKey, string][]
  /** The allowed values, written as JSON. */
  enum?: string[]
  description?: string
  /**
   * The keyword location of the line: the path from the root schema through `properties`, `items`, `oneOf`, `allOf` and
   * `$ref` (`/properties/address/$ref/properties/city`), unique to the line even when two properties share a schema.
   */
  path: JsonPathSegment[]
  /** The schema itself, as "copy value" writes it. */
  schema: unknown
}

export interface SchemaTreeModel {
  /** The value `c2-json-viewer` shows; `undefined` when `pointer` names nothing. */
  root: unknown
  /** The line of each built node, by its pointer in `root`. */
  lines: Map<string, SchemaLine>
  /** The line of a child, by the object of its parent line and its key: what search reads. */
  children: WeakMap<object, Map<string, SchemaLine>>
}

type SchemaObject = Record<string, unknown>
interface Located {
  raw: unknown
  /** Where the schema sits in the document. */
  path: JsonPathSegment[]
  /** How the walk from the root reached it: its keyword location. */
  walk: JsonPathSegment[]
}
interface Entry extends Located {
  key: string
  line: Pick<SchemaLine, 'kind' | 'name' | 'position' | 'required'>
}

/** A schema with its `$ref`s followed and its `allOf` merged: what a line describes and its children come from. */
interface View {
  raw: unknown
  path: JsonPathSegment[]
  walk: JsonPathSegment[]
  /** The object reached, for spotting a schema that contains itself. */
  identity: object | undefined
  refName?: string
  /** A `$ref` that could not be followed: outside the document, or to nothing. */
  unresolved?: string
  recursive: boolean
  keywords: SchemaObject
  properties: Map<string, Located>
  patterns: Map<string, Located>
  required: Set<string>
  items?: Located
  tuple: Located[]
  other?: Located
  choice?: 'oneOf' | 'anyOf'
  options: Located[]
}

// Keywords that shape the children rather than describe the value.
const STRUCTURAL = new Set(['$ref', 'properties', 'patternProperties', 'required', 'items', 'prefixItems', 'additionalProperties', 'oneOf', 'anyOf', 'allOf'])
/** Keys of the lines that are not properties start with a private-use character, which no real property name does, so they never collide. */
const SPECIAL = '\uE000'
const MAX_HOPS = 32
/** Lines built at most, so a document reusing its schemas in many places cannot freeze the page when searched. */
const MAX_LINES = 20_000
const ENUM_LIMIT = 10

/** A key of a non-property line, padded so `sort-keys` keeps options and positions in order. */
const special = (text: string | number) => `${SPECIAL}${typeof text === 'number' ? String(text).padStart(6, '0') : text}`

const isObject = (value: unknown): value is SchemaObject => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Reads a JSON Pointer (`/components/schemas/Order`), also in its URI fragment form (`%7B`). */
export function parsePointer(pointer: string): string[] {
  if (!pointer) return []
  return pointer
    .replace(/^\//, '')
    .split('/')
    .map((segment) => {
      let text = segment
      try {
        text = decodeURIComponent(segment)
      } catch {
        // A lone `%` is a literal character.
      }
      return text.replace(/~1/g, '/').replace(/~0/g, '~')
    })
}

function at(document: unknown, path: readonly string[]): unknown {
  let node = document
  for (const segment of path) {
    if (Array.isArray(node)) node = /^\d+$/.test(segment) ? node[Number(segment)] : undefined
    else if (isObject(node) && Object.prototype.hasOwnProperty.call(node, segment)) node = node[segment]
    else return undefined
  }
  return node
}

const json = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Builds the tree `c2-schema-tree` shows for the schema at `pointer` in `document`. Children are built when first read. */
export function buildSchemaTree(document: unknown, pointer = ''): SchemaTreeModel {
  const lines = new Map<string, SchemaLine>()
  const start = parsePointer(pointer)

  const children = new WeakMap<object, Map<string, SchemaLine>>()

  const follow = (located: Located): Located & { refName?: string; unresolved?: string; overlay: SchemaObject; outer: Located } => {
    let { raw, path, walk } = located
    let overlay: SchemaObject = {}
    let refName: string | undefined
    for (let hop = 0; isObject(raw) && typeof raw.$ref === 'string' && hop < MAX_HOPS; hop++) {
      const ref = raw.$ref
      // Keywords beside a `$ref` (a description, `deprecated`) describe this use of it; the outermost wins.
      const siblings = { ...raw }
      delete siblings.$ref
      overlay = { ...siblings, ...overlay }
      const target = ref.startsWith('#') ? parsePointer(ref.slice(1)) : undefined
      const resolved = target && at(document, target)
      if (!target || resolved === undefined) return { raw, path, walk, refName, unresolved: ref, overlay, outer: located }
      refName = target[target.length - 1]
      raw = resolved
      path = target
      walk = [...walk, '$ref']
    }
    return { raw, path, walk, refName, overlay, outer: located }
  }

  const absorb = (view: View, raw: unknown, from: Located, merged: Set<object>) => {
    if (!isObject(raw)) return
    const located = (key: string, value: unknown, ...segments: JsonPathSegment[]): Located => ({
      raw: value,
      path: [...from.path, key, ...segments],
      walk: [...from.walk, key, ...segments],
    })
    for (const key of Object.keys(raw)) if (!STRUCTURAL.has(key) && !(key in view.keywords)) view.keywords[key] = raw[key]
    if (isObject(raw.properties)) {
      for (const name of Object.keys(raw.properties))
        if (!view.properties.has(name)) view.properties.set(name, located('properties', raw.properties[name], name))
    }
    if (isObject(raw.patternProperties)) {
      for (const pattern of Object.keys(raw.patternProperties)) {
        if (!view.patterns.has(pattern)) view.patterns.set(pattern, located('patternProperties', raw.patternProperties[pattern], pattern))
      }
    }
    if (Array.isArray(raw.required)) for (const name of raw.required) if (typeof name === 'string') view.required.add(name)
    const tuple = Array.isArray(raw.prefixItems) ? 'prefixItems' : Array.isArray(raw.items) ? 'items' : undefined
    if (tuple && !view.tuple.length) view.tuple = (raw[tuple] as unknown[]).map((item, index) => located(tuple, item, index))
    if (!view.items && raw.items !== undefined && !Array.isArray(raw.items)) view.items = located('items', raw.items)
    if (!view.other && isObject(raw.additionalProperties)) view.other = located('additionalProperties', raw.additionalProperties)
    for (const choice of ['oneOf', 'anyOf'] as const) {
      const options = raw[choice]
      if (!view.choice && Array.isArray(options)) {
        view.choice = choice
        view.options = options.map((option, index) => located(choice, option, index))
      }
    }
    if (Array.isArray(raw.allOf)) {
      raw.allOf.forEach((member, index) => {
        const target = follow(located('allOf', member, index))
        // Each schema is merged once: a member met again (the schema itself, a cycle, a repeat) adds nothing new.
        if (target.unresolved || !isObject(target.raw) || merged.has(target.raw)) return
        merged.add(target.raw)
        absorb(view, target.overlay, target.outer, merged)
        absorb(view, target.raw, target, merged)
      })
    }
  }

  const viewOf = (located: Located, ancestors: readonly object[]): View => {
    const target = follow(located)
    const identity = isObject(target.raw) ? target.raw : undefined
    const view: View = {
      raw: target.raw,
      path: target.path,
      walk: target.walk,
      identity,
      refName: target.refName,
      unresolved: target.unresolved,
      recursive: !!identity && ancestors.includes(identity),
      keywords: {},
      properties: new Map(),
      patterns: new Map(),
      required: new Set(),
      tuple: [],
      options: [],
    }
    const merged = new Set<object>(identity ? [identity] : [])
    absorb(view, target.overlay, target.outer, merged)
    if (!view.unresolved && !view.recursive) absorb(view, target.raw, target, merged)
    return view
  }

  /** The child lines of a schema: its properties, patterns, other keys, tuple positions and options. */
  const entriesOf = (view: View): Entry[] => {
    const entries: Entry[] = []
    for (const [name, located] of view.properties) entries.push({ ...located, key: name, line: { kind: 'property', name, required: view.required.has(name) } })
    for (const [pattern, located] of view.patterns)
      entries.push({ ...located, key: special(`/${pattern}`), line: { kind: 'pattern', name: pattern, required: false } })
    if (view.other) entries.push({ ...view.other, key: special('*'), line: { kind: 'other', required: false } })
    view.tuple.forEach((located, index) => entries.push({ ...located, key: special(index), line: { kind: 'position', name: `[${index}]`, required: false } }))
    view.options.forEach((located, index) => {
      const option = follow(located)
      const title = isObject(option.raw) && typeof option.raw.title === 'string' ? option.raw.title : option.refName
      // Options come after the tuple positions, so their keys start past them.
      entries.push({ ...located, key: special(view.tuple.length + index), line: { kind: 'option', name: title, position: index + 1, required: false } })
    })
    return entries
  }

  /** The type in TypeScript style: `string`, `integer | null`, `Tag[]`, or the name of the object schema it refers to. */
  const typeOf = (view: View, items: View | undefined, ancestors: readonly object[], depth = 0): string => {
    if (view.unresolved) return view.unresolved
    if (view.recursive) return view.refName ?? 'object'
    if (view.raw === true) return 'any'
    if (view.raw === false) return 'never'
    const keywords = view.keywords
    let types = Array.isArray(keywords.type)
      ? keywords.type.filter((type): type is string => typeof type === 'string')
      : typeof keywords.type === 'string'
        ? [keywords.type]
        : []
    if (!types.length) {
      if (view.properties.size || view.patterns.size || view.other) types = ['object']
      else if (view.items || view.tuple.length) types = ['array']
      else if ('const' in keywords) types = [jsonType(keywords.const)]
      else if (Array.isArray(keywords.enum)) types = [...new Set(keywords.enum.map(jsonType))]
    }
    if (keywords.nullable === true && !types.includes('null')) types.push('null')
    return types
      .map((type) => {
        if (type === 'object' && view.refName) return view.refName
        if (type !== 'array' || !items || depth > 3) return type
        const inner = items.items && !items.recursive ? viewOf(items.items, ancestors) : undefined
        const name = typeOf(items, inner, ancestors, depth + 1) || 'any'
        return name.includes(' ') ? `(${name})[]` : `${name}[]`
      })
      .join(' | ')
  }

  const hasLines = (view: View) => !!(view.properties.size || view.patterns.size || view.other || view.tuple.length || view.options.length)

  const make = (id: string, located: Located, ancestors: readonly object[], base: Entry['line'], siblings?: Map<string, SchemaLine>, key = ''): unknown => {
    const view = viewOf(located, ancestors)
    const within = view.identity ? [...ancestors, view.identity] : ancestors
    const items = view.items && !view.recursive && !view.unresolved ? viewOf(view.items, within) : undefined
    // An array whose items have lines of their own shows them directly, as the documentation of an API does.
    const through = items && !items.recursive && !hasLines(view) && hasLines(items) ? items : view
    const entries = view.recursive || view.unresolved || lines.size >= MAX_LINES ? [] : entriesOf(through)
    const line = describe(view, items, within, base, located.walk)
    lines.set(id, line)
    siblings?.set(key, line)
    if (!entries.length) return line.type
    const branch: Record<string, unknown> = Object.create(null)
    const own = new Map<string, SchemaLine>()
    children.set(branch, own)
    const below = through.identity && through !== view ? [...within, through.identity] : within
    for (const entry of entries) {
      let child: unknown
      let built = false
      Object.defineProperty(branch, entry.key, {
        enumerable: true,
        get: () => {
          if (!built) {
            built = true
            child = make(id + pointerOf([entry.key]), entry, below, entry.line, own, entry.key)
          }
          return child
        },
      })
    }
    return branch
  }

  const describe = (view: View, items: View | undefined, ancestors: readonly object[], base: Entry['line'], walk: JsonPathSegment[]): SchemaLine => {
    const keywords = view.keywords
    const line: SchemaLine = {
      ...base,
      type: typeOf(view, items, ancestors),
      format: typeof keywords.format === 'string' ? keywords.format : undefined,
      choice: view.choice,
      deprecated: keywords.deprecated === true,
      readOnly: keywords.readOnly === true,
      writeOnly: keywords.writeOnly === true,
      recursive: view.recursive || !!items?.recursive,
      constraints: [],
      description:
        typeof keywords.description === 'string'
          ? keywords.description
          : typeof keywords.title === 'string' && base.kind !== 'option'
            ? keywords.title
            : undefined,
      path: walk,
      schema: view.raw,
    }
    // An option named after the schema it refers to need not repeat the name as its type.
    if (base.kind === 'option' && view.refName && line.type === base.name) line.type = 'object'
    // A list of plain values shows the limits of its items too: a `string[]` of an enum lists the values.
    const limits = items && !hasLines(items) ? [keywords, items.keywords] : [keywords]
    for (const source of limits) {
      for (const key of ['minimum', 'maximum'] as const) {
        const value = source[key]
        const exclusive = key === 'minimum' ? 'exclusiveMinimum' : 'exclusiveMaximum'
        // Draft 4 and OpenAPI 3.0 write exclusivity as a boolean beside the bound.
        if (typeof value === 'number') line.constraints.push([source[exclusive] === true ? exclusive : key, json(value)])
        if (typeof source[exclusive] === 'number') line.constraints.push([exclusive, json(source[exclusive])])
      }
      for (const key of ['multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties'] as const) {
        if (typeof source[key] === 'number') line.constraints.push([key, json(source[key])])
      }
      if (typeof source.pattern === 'string') line.constraints.push(['pattern', source.pattern])
      if (source.uniqueItems === true) line.constraints.push(['uniqueItems', ''])
      if ('const' in source) line.constraints.push(['const', json(source.const)])
      if ('default' in source) line.constraints.push(['default', json(source.default)])
      if (Array.isArray(source.enum) && !line.enum) line.enum = source.enum.map(json)
    }
    return line
  }

  const raw = at(document, start)
  if (raw === undefined) return { root: undefined, lines, children }
  return { root: make('', { raw, path: start, walk: start }, [], { kind: 'property', required: false }), lines, children }
}

function jsonType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

/** What `c2-schema-tree` needs to write a line: its messages and the search highlight. */
export interface SchemaRenderContext {
  t: <K extends keyof JsonViewerMessages & string>(key: K, ...args: JsonViewerMessages[K] extends (...args: infer A) => string ? A : []) => string
  highlight: (text: string) => TemplateResult | string
}

/** The name a line shows: the property, an option's title, a tuple position, a pattern or "other keys". */
export function keyText(line: SchemaLine, t: SchemaRenderContext['t']): string {
  if (line.kind === 'other') return t('otherKeys')
  if (line.kind === 'pattern') return `/${line.name}/`
  return line.name ?? t('option', line.position ?? 1)
}

/** The type a line shows: its type, or "one of" for a bare choice. */
export function typeText(line: SchemaLine, t: SchemaRenderContext['t']): string {
  return line.type || (line.choice ? t(line.choice) : '')
}

/** The name at the start of a line; nothing for a root schema shown as a single line. */
export function renderSchemaKey(row: JsonRow, line: SchemaLine, context: SchemaRenderContext): TemplateResult | typeof nothing {
  if (row.key === undefined) return nothing
  return html`<span class="key ${line.kind} ${line.deprecated ? 'deprecated' : ''}" part="key">${context.highlight(keyText(line, context.t))}</span>`
}

/** What follows the name: the type, the marks, the constraints, the allowed values and the description. */
export function renderSchemaValue(line: SchemaLine, context: SchemaRenderContext): TemplateResult {
  const { t } = context
  const type = typeText(line, t)
  const marks = [
    line.required ? html`<span class="mark required" part="required">${t('required')}</span>` : nothing,
    line.deprecated ? html`<span class="mark" part="mark">${t('deprecated')}</span>` : nothing,
    line.readOnly ? html`<span class="mark" part="mark">${t('readOnly')}</span>` : nothing,
    line.writeOnly ? html`<span class="mark" part="mark">${t('writeOnly')}</span>` : nothing,
    line.recursive ? html`<span class="mark" part="mark">↻ ${t('recursive')}</span>` : nothing,
  ].filter((mark) => mark !== nothing)
  const constraints = line.constraints.map(([key, value]) => (key === 'uniqueItems' ? t(key) : t(key, value)))
  const values = line.enum ? [...line.enum.slice(0, ENUM_LIMIT), ...(line.enum.length > ENUM_LIMIT ? ['…'] : [])] : []
  // A choice that also has a type says both: `object · one of`.
  const choice = line.choice && line.type ? html`<span class="choice">${t(line.choice)}</span>` : nothing
  const title = [line.description, values.length ? line.enum?.join(' | ') : ''].filter(Boolean).join('\n') || nothing
  return html`<span class="value schema" part="value" title=${title}
    >${type ? html`<span class="type" part="type">${context.highlight(type)}${line.format ? html`<span class="format">&lt;${line.format}&gt;</span>` : nothing}</span>` : nothing}
    ${choice} ${marks.map((mark, index) => html`${index ? ' ' : ''}${mark}`)}
    ${constraints.length ? html`<span class="constraints" part="constraints">${constraints.join(' · ')}</span>` : nothing}
    ${values.length ? html`<span class="enum" part="enum">${values.map((value, index) => html`${index ? ' | ' : ''}<code>${value}</code>`)}</span>` : nothing}
    ${line.description ? html`<span class="description" part="description">${line.description}</span>` : nothing}</span
  >`
}
