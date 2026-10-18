import { deref, toPointer, type DataPath } from './schema'
import type { JsonFormError, JsonSchema } from './types'

const FORMATS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^[a-z][a-z0-9+.-]*:\S+$/i,
  url: /^[a-z][a-z0-9+.-]*:\S+$/i,
  date: /^\d{4}-\d{2}-\d{2}$/,
  // The time and date-time inputs write minutes without seconds or an offset; both are accepted.
  time: /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i,
  'date-time': /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i,
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value)
  return actual === type || (type === 'number' && actual === 'integer')
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  return keysA.length === keysB.length && keysA.every((key) => equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

function visit(schema: JsonSchema | undefined, value: unknown, path: DataPath, root: JsonSchema, errors: JsonFormError[]) {
  const s = deref(schema, root)
  if (!s) return
  const pointer = toPointer(path)
  const fail = (keyword: string, params?: Record<string, unknown>) => errors.push({ path: pointer, keyword, params })

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type]
    if (!types.some((type) => matchesType(value, type))) {
      fail('type', { type: types.join(', ') })
      return
    }
  }
  if (s.const !== undefined && !equal(value, s.const)) fail('const', { const: s.const })
  if (s.enum && !s.enum.some((item) => equal(item, value))) fail('enum', { values: s.enum })

  for (const part of s.allOf ?? []) visit(part, value, path, root, errors)
  if (s.anyOf && !s.anyOf.some((part) => validateSchema(part, value, root).length === 0)) fail('anyOf')
  if (s.oneOf && s.oneOf.filter((part) => validateSchema(part, value, root).length === 0).length !== 1) fail('oneOf')
  if (s.not && validateSchema(s.not, value, root).length === 0) fail('not')
  if (s.if) {
    const branch = validateSchema(s.if, value, root).length === 0 ? s.then : s.else
    if (branch) visit(branch, value, path, root, errors)
  }

  if (typeof value === 'string') {
    const length = [...value].length
    if (s.minLength !== undefined && length < s.minLength) fail('minLength', { limit: s.minLength })
    if (s.maxLength !== undefined && length > s.maxLength) fail('maxLength', { limit: s.maxLength })
    if (s.pattern !== undefined && !new RegExp(s.pattern, 'u').test(value)) fail('pattern', { pattern: s.pattern })
    if (s.format && FORMATS[s.format] && !FORMATS[s.format].test(value)) fail('format', { format: s.format })
  }

  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) fail('minimum', { limit: s.minimum })
    if (s.maximum !== undefined && value > s.maximum) fail('maximum', { limit: s.maximum })
    if (s.exclusiveMinimum !== undefined && value <= s.exclusiveMinimum) fail('exclusiveMinimum', { limit: s.exclusiveMinimum })
    if (s.exclusiveMaximum !== undefined && value >= s.exclusiveMaximum) fail('exclusiveMaximum', { limit: s.exclusiveMaximum })
    if (s.multipleOf !== undefined && Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) > 1e-9) fail('multipleOf', { limit: s.multipleOf })
  }

  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) fail('minItems', { limit: s.minItems })
    if (s.maxItems !== undefined && value.length > s.maxItems) fail('maxItems', { limit: s.maxItems })
    if (s.uniqueItems && value.some((item, i) => value.findIndex((other) => equal(other, item)) !== i)) fail('uniqueItems')
    if (s.items) value.forEach((item, i) => visit(s.items, item, [...path, i], root, errors))
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>
    // A required property is reported on the property itself, so the error shows on its control.
    for (const key of s.required ?? []) {
      if (object[key] === undefined) errors.push({ path: toPointer([...path, key]), keyword: 'required' })
    }
    for (const [key, dependents] of Object.entries(s.dependentRequired ?? {})) {
      if (object[key] === undefined) continue
      for (const dependent of dependents) {
        if (object[dependent] === undefined) errors.push({ path: toPointer([...path, dependent]), keyword: 'required' })
      }
    }
    for (const [key, property] of Object.entries(s.properties ?? {})) {
      if (object[key] !== undefined) visit(property, object[key], [...path, key], root, errors)
    }
  }
}

/**
 * The built-in validator. It covers the keywords a form needs (types, `required`, `enum`/`const`, string length,
 * `pattern`, the common `format`s, number ranges, array bounds, `allOf`/`anyOf`/`oneOf`/`not`, `if`/`then`/`else`,
 * `dependentRequired` and local `$ref`s), without generating code, so it works under a strict Content Security
 * Policy. Hand the form another validator, such as Ajv through `fromAjvErrors`, for full JSON Schema support.
 */
export function validateSchema(schema: JsonSchema, value: unknown, root: JsonSchema = schema): JsonFormError[] {
  const errors: JsonFormError[] = []
  visit(schema, value, [], root, errors)
  return errors
}

interface AjvLikeError {
  instancePath: string
  keyword: string
  params?: Record<string, unknown>
  message?: string
}

/**
 * Converts Ajv's `errors` to the form's errors. A `required` failure moves onto the missing property, so it shows on
 * that property's control. Ajv's messages are dropped in favour of the form's translated ones unless `keepMessages`.
 */
export function fromAjvErrors(errors: readonly AjvLikeError[] | null | undefined, keepMessages = false): JsonFormError[] {
  return (errors ?? []).map((error) => {
    const missing = error.keyword === 'required' ? error.params?.missingProperty : undefined
    const path = typeof missing === 'string' ? `${error.instancePath}/${missing.replace(/~/g, '~0').replace(/\//g, '~1')}` : error.instancePath
    return { path, keyword: error.keyword, params: error.params, message: keepMessages ? error.message : undefined }
  })
}
