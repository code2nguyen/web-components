import type { DataPath } from './schema'
import { schemaType } from './schema'
import type { JsonSchema, UiElement, UiOptions } from './types'
import type { jsonFormMessages } from './messages'

export type JsonFormMessages = (typeof jsonFormMessages)['en']
type MessageArgs<V> = V extends (...args: infer A) => string ? A : []

/** What a renderer gets for one element of the UI schema. */
export interface JsonFormRenderContext {
  /** The `c2-json-form` being rendered. */
  host: HTMLElement
  element: UiElement
  /** A control's data path; for a layout, the path its scopes resolve against. */
  path: DataPath
  /** `path` as a JSON pointer (`/billing/zip`). */
  pointer: string
  /** The schema at `path`, `$ref`s resolved. */
  schema: JsonSchema | undefined
  rootSchema: JsonSchema
  value: unknown
  /** The element's `label`, else the schema's `title`, else the humanised key; `''` when the element sets `label: false`. */
  label: string
  /** The schema's `description`. */
  hint: string
  required: boolean
  /** True when the form, a `DISABLE` rule or an enclosing element disables this one. */
  disabled: boolean
  readOnly: boolean
  /** The error shown for exactly this path, or `''` while it is valid or not yet touched. */
  error: string
  options: UiOptions
  /** An id unique within the render root, stable across renders. */
  id: string
  /** `part` names for the rendered element: `base` plus the element's `options.part`. */
  parts(base: string): string
  /**
   * Writes the value at `path`. `commit` marks a finished edit (the control's `change`): the form fires `change` as
   * well as `input`, and the field's errors start to show.
   */
  setValue(value: unknown, commit?: boolean): void
  /** The error shown for a path; `deep` includes errors under it, for a control that edits a whole array. */
  errorFor(path: DataPath, deep?: boolean): string
  /** Renders child elements against this element's path. */
  renderElements(elements: UiElement[]): unknown[]
  /** Renders the value at `path`: `element` if given, else a generated layout for an object, else a control. */
  renderDetail(path: DataPath, element?: UiElement): unknown
  /** The form's interface text in the reader's language. */
  t<K extends keyof JsonFormMessages & string>(key: K, ...args: MessageArgs<JsonFormMessages[K]>): string
}

export interface JsonFormTesterContext {
  rootSchema: JsonSchema
  path: DataPath
}

/** Returns how well a renderer fits an element; a negative rank means it does not apply. */
export type JsonFormTester = (element: UiElement, schema: JsonSchema | undefined, context: JsonFormTesterContext) => number

export interface JsonFormRenderer {
  /** Shown in warnings; not used for matching. */
  name: string
  tester: JsonFormTester
  render(context: JsonFormRenderContext): unknown
}

const registry: JsonFormRenderer[] = []

/**
 * Adds a renderer for every form on the page. The highest rank wins, and a later registration wins a tie, so a
 * renderer registered with the built-in rank replaces the built-in one. Built-in renderers rank 1 to 3. A control's
 * `options.widget` adds 100 to the rank of the renderer with that `name`, among those whose tester accepts it.
 */
export function registerRenderer(renderer: JsonFormRenderer): void {
  registry.push(renderer)
}

/** Picks the renderer for an element among the global ones, then `extra` (a form's own `renderers`). */
export function pickRenderer(
  element: UiElement,
  schema: JsonSchema | undefined,
  context: JsonFormTesterContext,
  extra: readonly JsonFormRenderer[] = [],
): JsonFormRenderer | undefined {
  let best: JsonFormRenderer | undefined
  let bestRank = -1
  for (const renderer of [...registry, ...extra]) {
    let rank = renderer.tester(element, schema, context)
    // `options.widget` names the renderer to use, among those that can render the element.
    if (rank >= 0 && element.options?.widget === renderer.name) rank += 100
    if (rank >= 0 && rank >= bestRank) {
      best = renderer
      bestRank = rank
    }
  }
  return best
}

// Tester helpers, in the style of JSON Forms: `rankWith(10, and(isControl, formatIs('color')))`.

type Predicate = (element: UiElement, schema: JsonSchema | undefined, context: JsonFormTesterContext) => boolean

export const rankWith =
  (rank: number, predicate: Predicate): JsonFormTester =>
  (element, schema, context) =>
    predicate(element, schema, context) ? rank : -1

export const and =
  (...predicates: Predicate[]): Predicate =>
  (element, schema, context) =>
    predicates.every((predicate) => predicate(element, schema, context))

export const or =
  (...predicates: Predicate[]): Predicate =>
  (element, schema, context) =>
    predicates.some((predicate) => predicate(element, schema, context))

export const uiTypeIs =
  (type: string): Predicate =>
  (element) =>
    element.type === type

export const isControl: Predicate = uiTypeIs('Control')

export const schemaTypeIs =
  (type: string): Predicate =>
  (_element, schema) =>
    schemaType(schema) === type

export const formatIs =
  (format: string): Predicate =>
  (_element, schema) =>
    schema?.format === format

export const optionIs =
  (option: string, value: unknown = true): Predicate =>
  (element) =>
    element.options?.[option] === value

/** True for a control whose `options.widget` names `widget`. */
export const widgetIs = (widget: string): Predicate => and(isControl, optionIs('widget', widget))

export const schemaMatches =
  (test: (schema: JsonSchema) => boolean): Predicate =>
  (_element, schema) =>
    !!schema && test(schema)
