import { property as litProperty, type PropertyDecorator as LitPropertyDecorator } from '@lit/reactive-element/decorators/property.js'
import type { PropertyDeclaration } from '@lit/reactive-element'

export { html, svg, nothing } from 'lit'
export type { TemplateResult, SVGTemplateResult } from 'lit'

/**
 * A converter that also understands the value being assigned straight to the property rather than parsed out of
 * the attribute. `fromProperty` is what {@link property} installs a setter for; see its documentation for why.
 */
interface StringTolerantConverter {
  fromProperty: (value: unknown) => unknown
}

/**
 * Converter for `type: Boolean` properties, replacing Lit's presence-based default.
 *
 * Lit's default is `fromAttribute: (value) => value !== null`, so *any* attribute that is present is true —
 * including `disabled="false"`. Frameworks that render a non-boolean attribute name by stringifying its value
 * (Svelte 5 does this for every name outside the HTML boolean list, and so does any server renderer) therefore
 * turn the flag **on** when the application asked for it to be off, silently.
 *
 * The literal strings `"false"` and `"0"` are read as false; everything else, the empty string included, stays
 * true, so `<c2-button disabled>` and `disabled=""` are unchanged. Reflection matches Lit exactly: true writes
 * an empty attribute, false removes it.
 */
export const booleanPropertyConverter = {
  toAttribute: (value: unknown) => (value ? '' : null),
  fromAttribute: (value: string | null) => value !== null && value !== 'false' && value !== '0',
}

export const arrayPropertyConverter = {
  toAttribute: (value: string[]) => {
    return Array.isArray(value) ? value.join(';') : ''
  },
  fromAttribute: (value: string) => {
    return value ? value.split(';') : []
  },
  fromProperty: (value: unknown) => {
    if (typeof value !== 'string') return value
    return value ? value.split(';') : []
  },
} satisfies StringTolerantConverter & Record<string, unknown>

/**
 * Converter for properties whose value is a plain object or array and whose attribute is JSON, so data-driven
 * components (a table's rows and columns, for instance) can be authored in markup as well as from script.
 * Invalid JSON parses to `undefined` rather than throwing, and never round-trips back to the attribute.
 *
 * A JSON **string assigned to the property** is parsed as well, which is what makes such a property survive
 * server rendering. A server writes attributes only, so the application hands the component
 * `JSON.stringify(rows)`; on the client the same binding usually lands as a property assignment instead, and
 * without `fromProperty` that string would simply be stored. A string that is not valid JSON is left alone.
 */
export const jsonPropertyConverter = {
  toAttribute: (value: unknown) => {
    if (value === undefined || value === null) return null
    return JSON.stringify(value)
  },
  fromAttribute: (value: string | null) => {
    if (!value) return undefined
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  },
  fromProperty: (value: unknown) => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  },
} satisfies StringTolerantConverter & Record<string, unknown>

/** The `fromProperty` of a declaration's converter, when it has one. */
function propertyCoercion(options?: PropertyDeclaration): ((value: unknown) => unknown) | undefined {
  const converter = options?.converter
  if (!converter || typeof converter === 'function') return undefined
  return (converter as Partial<StringTolerantConverter>).fromProperty
}

/**
 * Wraps the accessor Lit installed so the value is coerced before Lit's setter records it and requests an
 * update. Lit's own setter stays the one that calls `requestUpdate`, so reflection and change detection are
 * untouched.
 *
 * Only reachable under experimental decorators, where `createProperty` has already defined the accessor on the
 * prototype by the time the decorator returns. Under standard decorators the accessor does not exist yet and
 * the coercion is skipped; this repository compiles with `experimentalDecorators`.
 */
function wrapPropertySetter(prototype: object, name: PropertyKey, coerce: (value: unknown) => unknown): void {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
  const set = descriptor?.set
  if (!set) return
  Object.defineProperty(prototype, name, {
    ...descriptor,
    set(this: object, value: unknown) {
      set.call(this, coerce(value))
    },
  })
}

/**
 * `@property`, but with the two conversions a component library needs and Lit's defaults do not provide.
 *
 * - `type: Boolean` gets {@link booleanPropertyConverter}, so `disabled="false"` is false rather than true.
 * - A converter that declares `fromProperty` ({@link jsonPropertyConverter}, {@link arrayPropertyConverter})
 *   also parses a string assigned directly to the property, so the same value works as an attribute on the
 *   server and as a property on the client.
 *
 * An explicit `converter` always wins, so a property that needs Lit's presence-based boolean can still ask for
 * it. Import this instead of `property` from `lit/decorators.js` in every c2n component.
 */
export function property(options?: PropertyDeclaration): LitPropertyDecorator {
  const declaration = options?.type === Boolean && options.converter === undefined ? { ...options, converter: booleanPropertyConverter } : options
  const decorate = litProperty(declaration)
  const coerce = propertyCoercion(declaration)
  if (!coerce) return decorate

  const legacyDecorate = decorate as (prototype: object, name: PropertyKey, descriptor?: PropertyDescriptor) => unknown
  return ((prototype: object, name: PropertyKey, descriptor?: PropertyDescriptor) => {
    const result = legacyDecorate(prototype, name, descriptor)
    if (typeof name !== 'object') wrapPropertySetter(prototype, name, coerce)
    return result
  }) as LitPropertyDecorator
}
