import { nothing } from 'lit'
import { generateLayout, getAt, humanize, isRequired, isUnder, placedPaths, schemaAt, scopeToPath, toPointer, type DataPath } from './schema'
import { pickRenderer, type JsonFormRenderContext, type JsonFormRenderer } from './registry'
import type { JsonSchema, UiCondition, UiElement } from './types'

/** Which category of which categorization a control sits in, outermost first. */
export interface CategoryStep {
  key: string
  index: number
}

/** What the engine needs from the element it renders for (`c2-json-form`, or a `c2-json-field` through its form). */
export interface EngineHost {
  readonly host: HTMLElement
  readonly rootSchema: JsonSchema
  readonly data: unknown
  readonly renderers: readonly JsonFormRenderer[]
  readonly formDisabled: boolean
  readonly formReadOnly: boolean
  t: JsonFormRenderContext['t']
  setValueAt(path: DataPath, value: unknown, commit: boolean): void
  errorFor(path: DataPath, deep: boolean): string
  matches(schema: JsonSchema, value: unknown): boolean
  /** Records a path a rule hid: its errors do not block the form. */
  hidePath(pointer: string): void
  recordCategory(pointer: string, steps: readonly CategoryStep[]): void
}

export interface RenderState {
  base: DataPath
  disabled: boolean
  categories: readonly CategoryStep[]
  /** Paths placed elsewhere, which a `*` control skips. */
  placed: readonly DataPath[]
  ids: { prefix: string; next: number }
}

export function createState(prefix: string, placed: readonly DataPath[]): RenderState {
  return { base: [], disabled: false, categories: [], placed, ids: { prefix, next: 0 } }
}

function conditionHolds(engine: EngineHost, condition: UiCondition, base: DataPath): boolean {
  if ('conditions' in condition) {
    const results = condition.conditions.map((inner) => conditionHolds(engine, inner, base))
    return condition.type === 'AND' ? results.every(Boolean) : results.some(Boolean)
  }
  return engine.matches(condition.schema, getAt(engine.data, scopeToPath(condition.scope, base)))
}

const warned = new Set<string>()

/** The controls `*` stands for: every property of the base object that no other control places. */
function restElements(engine: EngineHost, element: UiElement, state: RenderState): UiElement[] {
  const schema = schemaAt(engine.rootSchema, state.base)
  return Object.keys(schema?.properties ?? {})
    .filter((key) => {
      const pointer = toPointer([...state.base, key])
      return !state.placed.some((placed) => {
        const other = toPointer(placed)
        return isUnder(other, pointer) || isUnder(pointer, other)
      })
    })
    .map((key) => ({ ...element, scope: `#/properties/${key.replace(/~/g, '~0').replace(/\//g, '~1')}` }))
}

export function renderUiElement(engine: EngineHost, element: UiElement, state: RenderState): unknown {
  if (element.type === 'Control' && element.scope === '*') {
    return restElements(engine, element, state).map((child) => renderUiElement(engine, child, state))
  }

  let disabled = state.disabled
  if (element.rule) {
    const holds = conditionHolds(engine, element.rule.condition, state.base)
    const { effect } = element.rule
    if ((effect === 'HIDE' && holds) || (effect === 'SHOW' && !holds)) {
      for (const path of placedPaths(element, state.base)) engine.hidePath(toPointer(path))
      return nothing
    }
    if ((effect === 'DISABLE' && holds) || (effect === 'ENABLE' && !holds)) disabled = true
  }

  const isControl = element.type === 'Control' && typeof element.scope === 'string'
  const path = isControl ? scopeToPath(element.scope as string, state.base) : state.base
  const pointer = toPointer(path)
  const schema = schemaAt(engine.rootSchema, path)
  const options = element.options ?? {}
  const id = `${state.ids.prefix}${state.ids.next++}`
  if (isControl) engine.recordCategory(pointer, state.categories)

  const renderer = pickRenderer(element, schema, { rootSchema: engine.rootSchema, path }, engine.renderers)
  if (!renderer) {
    const key = `${element.type}:${pointer}`
    if (!warned.has(key)) {
      warned.add(key)
      console.warn(`c2-json-form: no renderer for the ${element.type} at "${pointer || '#'}".`)
    }
    return nothing
  }

  const key = path[path.length - 1]
  const elementLabel = element.label
  const label = elementLabel === false ? '' : (elementLabel ?? (isControl ? (schema?.title ?? (typeof key === 'string' ? humanize(key) : '')) : ''))
  const childState: RenderState = { ...state, base: path, disabled }

  const context: JsonFormRenderContext = {
    host: engine.host,
    element,
    path,
    pointer,
    schema,
    rootSchema: engine.rootSchema,
    value: getAt(engine.data, path),
    label,
    hint: isControl ? (schema?.description ?? '') : '',
    required: isControl && isRequired(engine.rootSchema, path),
    disabled: disabled || engine.formDisabled,
    readOnly: engine.formReadOnly || !!schema?.readOnly || options.readonly === true,
    error: isControl ? engine.errorFor(path, false) : '',
    options,
    id,
    parts: (base) => [base, typeof key === 'string' && isControl ? `${base}-${key}` : '', options.part ?? ''].filter(Boolean).join(' '),
    setValue: (value, commit = false) => engine.setValueAt(path, value, commit),
    errorFor: (target, deep = false) => engine.errorFor(target, deep),
    renderElements: (elements) =>
      elements.map((child, index) =>
        renderUiElement(engine, child, child.type === 'Category' ? { ...childState, categories: [...childState.categories, { key: id, index }] } : childState),
      ),
    renderDetail: (target, detail) => {
      const targetSchema = schemaAt(engine.rootSchema, target)
      const layout =
        detail ??
        (targetSchema?.properties ? generateLayout(targetSchema, engine.rootSchema) : ({ type: 'Control', scope: '#', label: false } satisfies UiElement))
      return renderUiElement(engine, layout, { ...childState, base: target, placed: placedPaths(layout, target) })
    },
    t: engine.t,
  }
  return renderer.render(context)
}
