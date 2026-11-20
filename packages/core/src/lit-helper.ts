import { property as litProperty, type PropertyDecorator as LitPropertyDecorator } from '@lit/reactive-element/decorators/property.js'
import type { PropertyDeclaration } from '@lit/reactive-element'
import { isServer, noChange, type ReactiveController, type ReactiveControllerHost } from 'lit'
import { Directive, directive, PartType, type ElementPart, type PartInfo } from 'lit/directive.js'

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

/**
 * Converter for `type: Number` properties: Lit's own attribute parsing, plus a numeric **string assigned to the
 * property** parsed the same way.
 *
 * A framework that sees a property of the same name assigns the property rather than the attribute, and a static
 * value arrives as the string the author wrote: Svelte 5 turns `<c2-comparison-bar precision="0">` into
 * `bar.precision = "0"`. Lit's `type: Number` only converts attributes, so the property held `"0"` and every
 * `Number.isFinite` check on it failed. A blank string unsets the property (`undefined`), as a framework clearing an
 * optional bound means it, rather than becoming `0`. Any other value (a number, `null`, `undefined`) passes through.
 */
export const numberPropertyConverter = {
  toAttribute: (value: unknown) => value,
  fromAttribute: (value: string | null) => (value === null ? null : Number(value)),
  fromProperty: (value: unknown) => (typeof value !== 'string' ? value : value.trim() === '' ? undefined : Number(value)),
} satisfies StringTolerantConverter & Record<string, unknown>

/**
 * Reads a list attribute: `;`-separated (`EUR;USD`), or a JSON array of strings (`["EUR","USD"]`), which is how
 * data attributes such as a table's `rows` are written and so what an author reaches for first. A value that only
 * looks like JSON (`[draft]`, `[1]`, an array holding objects) is split on `;` as before, so it stays one item.
 */
function parseList(value: string | null | undefined): string[] {
  if (!value) return []
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed
    } catch {
      // Not JSON: a plain `;`-separated value that happens to start with a bracket.
    }
  }
  return value.split(';')
}

export const arrayPropertyConverter = {
  // An item holding `;` would split when read back, so such a list is written as JSON.
  toAttribute: (value: string[]) => {
    if (!Array.isArray(value)) return ''
    return value.some((item) => String(item).includes(';')) ? JSON.stringify(value) : value.join(';')
  },
  fromAttribute: (value: string | null) => parseList(value),
  fromProperty: (value: unknown) => (typeof value === 'string' ? parseList(value) : value),
} satisfies StringTolerantConverter & Record<string, unknown>

/**
 * Converter for a list whose items are strings or small objects (`disabled-dates`: a day, or `{ date, label }`). The
 * attribute is `;`-separated strings, as for {@link arrayPropertyConverter}, or a JSON array whose items may be
 * objects. A string assigned to the property is read the same way.
 */
export const itemListPropertyConverter = {
  toAttribute: (value: unknown[]) => {
    if (!Array.isArray(value)) return ''
    return value.every((item) => typeof item === 'string' && !item.includes(';')) ? value.join(';') : JSON.stringify(value)
  },
  fromAttribute: (value: string | null) => parseItemList(value),
  fromProperty: (value: unknown) => (typeof value === 'string' ? parseItemList(value) : value),
} satisfies StringTolerantConverter & Record<string, unknown>

/**
 * Reads a `disabled-dates` list (days as `YYYY-MM-DD`, or `{ date, label }` objects) into the closed days, each with
 * its reason (`''` for none). Days are trimmed; when a day is listed twice, a reason wins over none, then the first.
 */
export function readDisabledDates(list: unknown): Map<string, string> {
  const days = new Map<string, string>()
  for (const item of Array.isArray(list) ? list : []) {
    const entry = (typeof item === 'string' ? { date: item } : item) as { date?: unknown; label?: unknown } | null
    const date = entry && typeof entry.date === 'string' ? entry.date.trim() : ''
    if (date && !days.get(date)) days.set(date, typeof entry!.label === 'string' ? entry!.label : '')
  }
  return days
}

function parseItemList(value: string | null | undefined): unknown[] {
  if (!value) return []
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // Not JSON: a plain `;`-separated value that happens to start with a bracket.
    }
  }
  return value.split(';')
}

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
      warnStringifiedObject(value)
      return undefined
    }
  },
  fromProperty: (value: unknown) => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      warnStringifiedObject(value)
      return value
    }
  },
} satisfies StringTolerantConverter & Record<string, unknown>

/**
 * An object or array written as an attribute by a template that cannot set properties (a server render, or a
 * framework binding made before the element was registered) arrives as `[object Object]`, which parses to nothing:
 * the component silently shows no data or goes read-only. Say so once per page.
 */
let warnedStringifiedObject = false
function warnStringifiedObject(value: string): void {
  if (warnedStringifiedObject || !value.startsWith('[object ')) return
  warnedStringifiedObject = true
  console.warn(`c2n: a JSON attribute received ${value.slice(0, 40)}. Pass the value through JSON.stringify(), or set it as a property.`)
}

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

/** The converter {@link property} installs for a `type` when the declaration names none. */
function defaultConverter(type: unknown) {
  if (type === Boolean) return booleanPropertyConverter
  if (type === Number) return numberPropertyConverter
  return undefined
}

/**
 * `@property`, but with the conversions a component library needs and Lit's defaults do not provide.
 *
 * - `type: Boolean` gets {@link booleanPropertyConverter}, so `disabled="false"` is false rather than true.
 * - `type: Number` gets {@link numberPropertyConverter}, so `precision = "0"` (what Svelte 5 assigns for a static
 *   attribute) is stored as `0`.
 * - A converter that declares `fromProperty` ({@link jsonPropertyConverter}, {@link arrayPropertyConverter})
 *   also parses a string assigned directly to the property, so the same value works as an attribute on the
 *   server and as a property on the client.
 *
 * An explicit `converter` always wins, so a property that needs Lit's presence-based boolean can still ask for
 * it. Import this instead of `property` from `lit/decorators.js` in every c2n component.
 */
export function property(options?: PropertyDeclaration): LitPropertyDecorator {
  const converter = options?.converter === undefined ? defaultConverter(options?.type) : undefined
  const declaration = converter ? { ...options, converter } : options
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

class AssignSlotDirective extends Directive {
  constructor(partInfo: PartInfo) {
    super(partInfo)
    if (partInfo.type !== PartType.ELEMENT) throw new Error('assignSlot() must be placed on a <slot> element.')
  }

  render(_nodes: readonly (Element | Text)[]) {
    return noChange
  }

  override update(part: ElementPart, [nodes]: [readonly (Element | Text)[]]) {
    const slot = part.element
    if (!(slot instanceof HTMLSlotElement)) throw new Error('assignSlot() must be placed on a <slot> element.')
    // A new template instance is still a detached fragment here, and an assignment made before the slot is in the
    // shadow tree does not take effect; Lit inserts the fragment before the microtask runs.
    if (slot.getRootNode() instanceof ShadowRoot) assignNodes(slot, nodes)
    else queueMicrotask(() => assignNodes(slot, nodes))
    return noChange
  }
}

function assignNodes(slot: HTMLSlotElement, nodes: readonly (Element | Text)[]): void {
  // A named-mode root (declarative shadow DOM) routes by `slot` attribute and ignores `assign()`.
  const root = slot.getRootNode()
  if (!(root instanceof ShadowRoot) || root.slotAssignment !== 'manual') return
  const assigned = slot.assignedNodes()
  if (assigned.length !== nodes.length || nodes.some((node, index) => node !== assigned[index])) slot.assign(...nodes)
}

/**
 * Assigns light-DOM children to the `<slot>` it is placed on, for a shadow root created with
 * `slotAssignment: 'manual'`: `<slot ${assignSlot([item])}></slot>`.
 *
 * A component that routes its children into per-item slots must not write `slot` on them: under server rendering
 * (Next.js, React Router) the element upgrades before React hydrates, and React reports the attribute it never
 * rendered as a hydration mismatch. The assignment is only redone when the slot holds other nodes, so rendering the
 * same items again (every frame of a drag) costs one `assignedNodes()` read per slot. In a named-mode shadow root
 * (declarative shadow DOM always is one) `assign()` has no effect and the component must fall back to `slot`
 * attributes; check `shadowRoot.slotAssignment`.
 */
export const assignSlot = directive(AssignSlotDirective)

/** What {@link SlotReplayController} needs of its host: a Lit element. */
export type SlotReplayHost = ReactiveControllerHost & HTMLElement & { readonly hasUpdated: boolean }

export interface SlotReplayOptions {
  /**
   * Call the handler after the first update of a client-rendered host too, not only of a server-rendered one. For a
   * handler that also reads state no `slotchange` reports on the client (an empty slot fires none). Default `false`.
   */
  always?: boolean
  /**
   * Call the handler from the first update itself, where `firstUpdated` would (just before it), rather than once that
   * update has completed. State the handler sets then schedules a second update from inside the first, which Lit
   * warns about in development; the default waits for `updateComplete` instead. Default `false`.
   */
  immediate?: boolean
}

/**
 * Calls a slot's handler once after the host hydrates, standing in for the `slotchange` a server-rendered element
 * never hears.
 *
 * A declarative shadow root (server rendering) has its slots assigned by the parser, before the element upgrades and
 * before Lit binds `@slotchange` on the server's `<slot>`: the event has already fired, and no other follows for the
 * children that were there. A component that learns about its children from `slotchange` (its rows, its actions, its
 * label) would never see them. The hydrating render itself must match the server's, which saw no light DOM, so the
 * children are read after it: by default once the first update has completed.
 *
 * `serverRendered` and `hydrating` answer the questions a component asks around it: whether the shadow root came from
 * the server, and whether the hydrating first update is still to come (work that changes what the first render draws
 * must wait for the replay). Construct it as a class field, so `shadowRoot` is read before Lit attaches a client root.
 *
 * ```ts
 * private readonly hydration = new SlotReplayController(this, () => this.handleSlotChange())
 * ```
 */
export class SlotReplayController implements ReactiveController {
  /** Whether the shadow root came from the server (declarative shadow DOM), read when the host was constructed. */
  readonly serverRendered: boolean
  readonly #host: SlotReplayHost
  readonly #handler: (() => void) | undefined
  readonly #options: SlotReplayOptions
  #replayed = false

  constructor(host: SlotReplayHost, handler?: () => void, options: SlotReplayOptions = {}) {
    this.#host = host
    this.#handler = handler
    this.#options = options
    this.serverRendered = !isServer && !!host.shadowRoot
    host.addController(this)
  }

  /** Server-rendered and not hydrated yet: the first update, which must draw what the server drew, is still to come. */
  get hydrating(): boolean {
    // `#replayed` too: Lit runs `hostUpdated`, and so an `immediate` handler, before it sets `hasUpdated`.
    return this.serverRendered && !this.#host.hasUpdated && !this.#replayed
  }

  hostUpdated(): void {
    if (this.#replayed) return
    this.#replayed = true
    const handler = this.#handler
    if (!handler || (!this.serverRendered && !this.#options.always)) return
    if (this.#options.immediate) handler()
    else void this.#host.updateComplete.then(() => handler())
  }
}
