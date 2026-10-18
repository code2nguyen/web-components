import type { JsonSchema, JsonSchemaType, UiControl, UiElement } from './types'

export type DataPath = (string | number)[]

/** `['billing', 'zip']` → `/billing/zip`, escaped as RFC 6901 requires. */
export function toPointer(path: DataPath): string {
  return path.map((segment) => '/' + String(segment).replace(/~/g, '~0').replace(/\//g, '~1')).join('')
}

/** True when `pointer` is `ancestor` or lies under it. */
export function isUnder(pointer: string, ancestor: string): boolean {
  return pointer === ancestor || pointer.startsWith(ancestor + '/')
}

/** Follows a local `$ref` (`#/$defs/address`). A ref the schema cannot resolve leaves the schema as it is. */
export function deref(schema: JsonSchema | undefined, root: JsonSchema): JsonSchema | undefined {
  let current = schema
  const seen = new Set<string>()
  while (current?.$ref && current.$ref.startsWith('#') && !seen.has(current.$ref)) {
    seen.add(current.$ref)
    const target = current.$ref
      .slice(1)
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce<unknown>((node, segment) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined), root)
    if (!target || typeof target !== 'object') break
    const rest: JsonSchema = { ...current }
    delete rest.$ref
    current = { ...(target as JsonSchema), ...rest }
  }
  return current
}

/** The first type a schema names, or one inferred from its keywords. */
export function schemaType(schema: JsonSchema | undefined): JsonSchemaType | undefined {
  if (!schema) return undefined
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type
  if (type) return type
  if (schema.properties) return 'object'
  if (schema.items) return 'array'
  const sample = schema.const ?? schema.enum?.[0] ?? schema.oneOf?.[0]?.const
  if (typeof sample === 'string') return 'string'
  if (typeof sample === 'number') return 'number'
  if (typeof sample === 'boolean') return 'boolean'
  return undefined
}

/** The schema of the value at `path`, `$ref`s resolved. */
export function schemaAt(root: JsonSchema, path: DataPath): JsonSchema | undefined {
  let schema = deref(root, root)
  for (const segment of path) {
    if (!schema) return undefined
    schema = deref(typeof segment === 'number' ? schema.items : schema.properties?.[segment], root)
  }
  return schema
}

/** True when the object holding `path` lists its last segment in `required`. */
export function isRequired(root: JsonSchema, path: DataPath): boolean {
  if (path.length === 0) return false
  const key = path[path.length - 1]
  if (typeof key === 'number') return false
  return !!schemaAt(root, path.slice(0, -1))?.required?.includes(key)
}

/**
 * Turns a scope into a data path relative to `base`: `#/properties/a/properties/b` and `a.b` both give
 * `[...base, 'a', 'b']`, and `#` gives `base`.
 */
export function scopeToPath(scope: string, base: DataPath = []): DataPath {
  if (scope === '#' || scope === '') return base
  if (scope.startsWith('#/')) {
    const segments = scope.slice(2).split('/')
    const path: DataPath = []
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === 'properties' && i + 1 < segments.length) {
        path.push(segments[++i].replace(/~1/g, '/').replace(/~0/g, '~'))
      }
    }
    return [...base, ...path]
  }
  return [...base, ...scope.split('.').filter(Boolean)]
}

export function getAt(value: unknown, path: DataPath): unknown {
  let current = value
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

/** Returns a copy of `value` with `next` at `path`, creating objects and arrays on the way. `undefined` removes the key. */
export function setAt(value: unknown, path: DataPath, next: unknown): unknown {
  if (path.length === 0) return next
  const [head, ...rest] = path
  if (typeof head === 'number') {
    const array = Array.isArray(value) ? [...value] : []
    array[head] = setAt(array[head], rest, next)
    return array
  }
  const object = value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
  const child = setAt(object[head], rest, next)
  if (child === undefined) delete object[head]
  else object[head] = child
  return object
}

/** `firstName` → `First name`, `billing_address` → `Billing address`. */
export function humanize(key: string | number): string {
  if (typeof key === 'number') return String(key + 1)
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Fills in `default` values for properties the value does not have. Objects are created only where the value has a parent. */
export function applyDefaults(schema: JsonSchema, value: unknown, root: JsonSchema = schema): unknown {
  const resolved = deref(schema, root)
  if (!resolved) return value
  if (value === undefined && resolved.default !== undefined) return structuredClone(resolved.default)
  if (schemaType(resolved) === 'object' && resolved.properties) {
    if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) return value
    const object = { ...((value as Record<string, unknown>) ?? {}) }
    for (const [key, property] of Object.entries(resolved.properties)) {
      const child = applyDefaults(property, object[key], root)
      if (child !== undefined) object[key] = child
    }
    return object
  }
  if (Array.isArray(value) && resolved.items) return value.map((item) => applyDefaults(resolved.items!, item, root))
  return value
}

/** The layout used when no UI schema is given: one control per property, in schema order. */
export function generateLayout(schema: JsonSchema | undefined, root: JsonSchema): UiElement {
  const resolved = deref(schema, root)
  const elements: UiControl[] = Object.keys(resolved?.properties ?? {}).map((key) => ({
    type: 'Control',
    scope: `#/properties/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
  }))
  return { type: 'VerticalLayout', elements }
}

/** Every data path a UI schema places with a `Control`, relative to `base`. `*` places nothing. */
export function placedPaths(element: UiElement | undefined, base: DataPath = []): DataPath[] {
  if (!element) return []
  const own = element.type === 'Control' && typeof element.scope === 'string' && element.scope !== '*' ? [scopeToPath(element.scope, base)] : []
  const children = Array.isArray(element.elements) ? (element.elements as UiElement[]).flatMap((child) => placedPaths(child, base)) : []
  return [...own, ...children]
}
