/** The JSON Schema keywords the form reads. Any other keyword is kept and handed to a custom validator untouched. */
export interface JsonSchema {
  $ref?: string
  $defs?: Record<string, JsonSchema>
  definitions?: Record<string, JsonSchema>
  type?: JsonSchemaType | JsonSchemaType[]
  title?: string
  description?: string
  default?: unknown
  const?: unknown
  enum?: unknown[]
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  allOf?: JsonSchema[]
  not?: JsonSchema
  if?: JsonSchema
  then?: JsonSchema
  else?: JsonSchema
  readOnly?: boolean
  // string
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  // number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  // object
  properties?: Record<string, JsonSchema>
  required?: string[]
  dependentRequired?: Record<string, string[]>
  // array
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  [keyword: string]: unknown
}

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null'

/** Shows, hides, enables or disables a layout element while its condition holds. */
export interface UiRule {
  effect: 'HIDE' | 'SHOW' | 'DISABLE' | 'ENABLE'
  condition: UiCondition
}

/**
 * `{ scope, schema }` holds when the value at `scope` validates against `schema` (an absent value fails every
 * schema that names a `type`, `const` or `enum`). `AND` and `OR` combine conditions.
 */
export type UiCondition = { scope: string; schema: JsonSchema } | { type: 'AND' | 'OR'; conditions: UiCondition[] }

/** Options every element accepts. Renderers read their own options from the same object. */
export interface UiOptions {
  /** Column span inside a `GridLayout`. */
  span?: number
  /** Extra `part` names on the rendered element, so `c2-json-form::part(<name>)` can style it. */
  part?: string
  [option: string]: unknown
}

export interface UiElementBase {
  type: string
  rule?: UiRule
  options?: UiOptions
  /** The children of a layout. */
  elements?: UiElement[]
  /** A layout's heading, or a control's label (`false` for none). */
  label?: string | false
}

export interface UiControl extends UiElementBase {
  type: 'Control'
  /** `#/properties/a/properties/b`, the shorthand `a.b`, `#` for the current object or `*` for every field not placed elsewhere. */
  scope: string
}

export interface UiLayout extends UiElementBase {
  type: 'VerticalLayout' | 'HorizontalLayout' | 'GridLayout' | 'Group' | 'Categorization' | 'Category'
  elements: UiElement[]
}

export interface UiLabel extends UiElementBase {
  type: 'Label'
  text: string
}

/** A UI schema element. Custom renderers may introduce their own `type`. */
export type UiElement = UiControl | UiLayout | UiLabel | (UiElementBase & { scope?: string; [key: string]: unknown })

/** One validation failure. `path` is a JSON pointer into the value (`/billing/zip`), `''` for the root. */
export interface JsonFormError {
  path: string
  keyword: string
  params?: Record<string, unknown>
  /** Shown as is. Without it the form writes a translated message from `keyword` and `params`. */
  message?: string
}

/** Validates a value against a schema. The default is the built-in validator; `fromAjvErrors` adapts Ajv. */
export type JsonFormValidator = (schema: JsonSchema, value: unknown) => JsonFormError[]
