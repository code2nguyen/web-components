import { html, nothing, type TemplateResult } from 'lit'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { styleMap } from 'lit/directives/style-map.js'
import '@c2n/button'
import '@c2n/card'
import '@c2n/checkbox/checkbox.js'
import '@c2n/checkbox/checkbox-group.js'
import '@c2n/date-input'
import '@c2n/date-time-picker'
import '@c2n/details'
import '@c2n/form-field'
import '@c2n/list-item'
import '@c2n/number-input'
import '@c2n/password-field'
import '@c2n/radio/radio.js'
import '@c2n/radio/radio-group.js'
import '@c2n/select'
import '@c2n/slider'
import '@c2n/steps'
import '@c2n/steps/step.js'
import '@c2n/switch'
import '@c2n/tabs'
import '@c2n/tag-input'
import '@c2n/text-field'
import '@c2n/textarea'
import '@c2n/time-input'
import { applyDefaults, deref, schemaType } from './schema'
import {
  and,
  formatIs,
  isControl,
  optionIs,
  or,
  rankWith,
  registerRenderer,
  schemaMatches,
  schemaTypeIs,
  uiTypeIs,
  type JsonFormRenderContext,
  type JsonFormRenderer,
} from './registry'
import type { JsonSchema, UiElement } from './types'

/** The categorization API the stepper and tabs renderers use on `c2-json-form`. */
interface CategoryHost {
  selectedCategory(key: string): number
  selectCategory(key: string, index: number): void
  /** Shows the errors of category `index` and returns true when it has none. */
  checkCategory(key: string, index: number): boolean
  categoryHasErrors(key: string, index: number): boolean
}

interface Choice {
  value: unknown
  label: string
}

/** The options of an `enum` or a `oneOf` of `const`s (with their `title`s). */
function choicesOf(schema: JsonSchema | undefined, root: JsonSchema): Choice[] {
  const s = deref(schema, root)
  if (!s) return []
  if (s.enum) return s.enum.map((value) => ({ value, label: String(value) }))
  const options = s.oneOf ?? s.anyOf
  if (options?.every((option) => option.const !== undefined))
    return options.map((option) => ({ value: option.const, label: option.title ?? String(option.const) }))
  return []
}

const hasChoices = (schema: JsonSchema) => !!schema.enum || !!(schema.oneOf ?? schema.anyOf)?.every((option) => option.const !== undefined)

function indexOfChoice(choices: Choice[], value: unknown): number {
  return choices.findIndex((choice) => choice.value === value)
}

/** An empty text value is no value, so `required` catches it. */
const textValue = (value: string) => (value === '' ? undefined : value)

const stop = (event: Event) => event.stopPropagation()

/** The control's `input`/`change` handlers: the form fires its own events, so the control's stop here. */
function handlers(ctx: JsonFormRenderContext, read: (target: HTMLElement & Record<string, unknown>) => unknown) {
  return {
    input: (event: Event) => {
      stop(event)
      ctx.setValue(read(event.currentTarget as HTMLElement & Record<string, unknown>), false)
    },
    change: (event: Event) => {
      stop(event)
      ctx.setValue(read(event.currentTarget as HTMLElement & Record<string, unknown>), true)
    },
  }
}

/** Wraps a control in a `c2-form-field`, which names and describes it and shows the error. */
function field(ctx: JsonFormRenderContext, control: TemplateResult, selfLabelled = false, error = ctx.error) {
  return html`<c2-form-field
    part=${ctx.parts('field')}
    class="field"
    style=${styleMap(spanStyle(ctx.element))}
    data-json-path=${ctx.pointer}
    label=${selfLabelled ? '' : ctx.label}
    hint=${ctx.hint}
    error-text=${error}
    necessity=${ifDefined(ctx.options.necessity as string | undefined)}
    >${control}</c2-form-field
  >`
}

function spanStyle(element: UiElement): Record<string, string> {
  const span = Number(element.options?.span)
  return span > 0 ? { 'grid-column': `span ${span}` } : {}
}

const placeholder = (ctx: JsonFormRenderContext) => ifDefined(ctx.options.placeholder as string | undefined)

// Controls --------------------------------------------------------------------------------------------------------

const TEXT_TYPES: Record<string, string> = { email: 'email', uri: 'url', url: 'url', tel: 'tel' }

const text: JsonFormRenderer = {
  name: 'text',
  tester: rankWith(
    1,
    and(
      isControl,
      or(schemaTypeIs('string'), (_e, schema) => schemaType(schema) === undefined),
    ),
  ),
  render(ctx) {
    const on = handlers(ctx, (el) => textValue(el.value as string))
    const type = (ctx.options.type as string | undefined) ?? TEXT_TYPES[ctx.schema?.format ?? ''] ?? 'text'
    return field(
      ctx,
      html`<c2-text-field
        type=${type}
        .value=${live((ctx.value as string | undefined) ?? '')}
        ?required=${ctx.required}
        ?disabled=${ctx.disabled}
        ?readonly=${ctx.readOnly}
        placeholder=${placeholder(ctx)}
        autocomplete=${ifDefined(ctx.options.autocomplete as string | undefined)}
        maxlength=${ifDefined(ctx.schema?.maxLength)}
        @input=${on.input}
        @change=${on.change}
      ></c2-text-field>`,
    )
  },
}

const textarea: JsonFormRenderer = {
  name: 'textarea',
  tester: rankWith(2, and(isControl, schemaTypeIs('string'), or(optionIs('multi'), optionIs('widget', 'textarea')))),
  render(ctx) {
    const on = handlers(ctx, (el) => textValue(el.value as string))
    return field(
      ctx,
      html`<c2-textarea
        .value=${live((ctx.value as string | undefined) ?? '')}
        rows=${ifDefined(ctx.options.rows as number | undefined)}
        ?required=${ctx.required}
        ?disabled=${ctx.disabled}
        ?readonly=${ctx.readOnly}
        placeholder=${placeholder(ctx)}
        maxlength=${ifDefined(ctx.schema?.maxLength)}
        @input=${on.input}
        @change=${on.change}
      ></c2-textarea>`,
    )
  },
}

const password: JsonFormRenderer = {
  name: 'password',
  tester: rankWith(2, and(isControl, schemaTypeIs('string'), or(formatIs('password'), optionIs('widget', 'password')))),
  render(ctx) {
    const on = handlers(ctx, (el) => textValue(el.value as string))
    return field(
      ctx,
      html`<c2-password-field
        .value=${live((ctx.value as string | undefined) ?? '')}
        ?required=${ctx.required}
        ?disabled=${ctx.disabled}
        placeholder=${placeholder(ctx)}
        autocomplete=${ifDefined(ctx.options.autocomplete as string | undefined)}
        @input=${on.input}
        @change=${on.change}
      ></c2-password-field>`,
    )
  },
}

function dateRenderer(format: 'date' | 'time' | 'date-time'): JsonFormRenderer {
  return {
    name: format,
    tester: rankWith(2, and(isControl, schemaTypeIs('string'), or(formatIs(format), optionIs('widget', format)))),
    render(ctx) {
      const on = handlers(ctx, (el) => textValue(el.value as string))
      const value = live((ctx.value as string | undefined) ?? '')
      const control =
        format === 'date'
          ? html`<c2-date-input
              .value=${value}
              ?required=${ctx.required}
              ?disabled=${ctx.disabled}
              ?readonly=${ctx.readOnly}
              @input=${on.input}
              @change=${on.change}
            ></c2-date-input>`
          : format === 'time'
            ? html`<c2-time-input
                .value=${value}
                ?required=${ctx.required}
                ?disabled=${ctx.disabled}
                ?readonly=${ctx.readOnly}
                @input=${on.input}
                @change=${on.change}
              ></c2-time-input>`
            : html`<c2-date-time-picker
                .value=${value}
                ?required=${ctx.required}
                ?disabled=${ctx.disabled}
                ?readonly=${ctx.readOnly}
                @input=${on.input}
                @change=${on.change}
              ></c2-date-time-picker>`
      return field(ctx, control)
    },
  }
}

function toNumber(raw: string): unknown {
  if (raw.trim() === '') return undefined
  const number = Number(raw)
  // A value that is not a number stays a string, so the type check reports it.
  return Number.isNaN(number) ? raw : number
}

const number: JsonFormRenderer = {
  name: 'number',
  tester: rankWith(1, and(isControl, or(schemaTypeIs('number'), schemaTypeIs('integer')))),
  render(ctx) {
    const integer = schemaType(ctx.schema) === 'integer'
    const on = handlers(ctx, (el) => toNumber(String(el.value ?? '')))
    const step = ctx.schema?.multipleOf ?? (integer ? 1 : 'any')
    return field(
      ctx,
      html`<c2-number-input
        .value=${live(ctx.value === undefined || ctx.value === null ? '' : String(ctx.value))}
        min=${ifDefined(ctx.schema?.minimum)}
        max=${ifDefined(ctx.schema?.maximum)}
        step=${String(step)}
        ?required=${ctx.required}
        ?disabled=${ctx.disabled}
        ?readonly=${ctx.readOnly}
        placeholder=${placeholder(ctx)}
        @input=${on.input}
        @change=${on.change}
      ></c2-number-input>`,
    )
  },
}

const slider: JsonFormRenderer = {
  name: 'slider',
  tester: rankWith(
    3,
    and(
      isControl,
      or(schemaTypeIs('number'), schemaTypeIs('integer')),
      optionIs('widget', 'slider'),
      schemaMatches((s) => s.minimum !== undefined && s.maximum !== undefined),
    ),
  ),
  render(ctx) {
    const on = handlers(ctx, (el) => el.value as number)
    const min = ctx.schema!.minimum!
    return field(
      ctx,
      html`<c2-slider
        .value=${live(typeof ctx.value === 'number' ? ctx.value : min)}
        min=${min}
        max=${ctx.schema!.maximum!}
        step=${ctx.schema?.multipleOf ?? (schemaType(ctx.schema) === 'integer' ? 1 : 0.1)}
        show-value
        ?disabled=${ctx.disabled || ctx.readOnly}
        @input=${on.input}
        @change=${on.change}
      ></c2-slider>`,
    )
  },
}

const checkbox: JsonFormRenderer = {
  name: 'checkbox',
  tester: rankWith(1, and(isControl, schemaTypeIs('boolean'))),
  render(ctx) {
    const on = handlers(ctx, (el) => el.checked as boolean)
    return field(
      ctx,
      html`<c2-checkbox .checked=${live(ctx.value === true)} ?required=${ctx.required} ?disabled=${ctx.disabled || ctx.readOnly} @change=${on.change}
        >${ctx.label}</c2-checkbox
      >`,
      true,
    )
  },
}

const toggle: JsonFormRenderer = {
  name: 'switch',
  tester: rankWith(2, and(isControl, schemaTypeIs('boolean'), or(optionIs('toggle'), optionIs('widget', 'switch')))),
  render(ctx) {
    const on = handlers(ctx, (el) => el.checked as boolean)
    return field(
      ctx,
      html`<c2-switch .checked=${live(ctx.value === true)} ?required=${ctx.required} ?disabled=${ctx.disabled || ctx.readOnly} @change=${on.change}
        >${ctx.label}</c2-switch
      >`,
      true,
    )
  },
}

const select: JsonFormRenderer = {
  name: 'select',
  tester: rankWith(2, and(isControl, schemaMatches(hasChoices))),
  render(ctx) {
    const choices = choicesOf(ctx.schema, ctx.rootSchema)
    if (choices.length <= 5 && ctx.options.widget !== 'select') return radio.render(ctx)
    const selected = indexOfChoice(choices, ctx.value)
    const on = handlers(ctx, (el) => {
      const value = (el.value as string[])[0]
      return value === undefined ? undefined : choices[Number(value)]?.value
    })
    return field(
      ctx,
      html`<c2-select
        .value=${live(selected >= 0 ? [String(selected)] : [])}
        placeholder=${(ctx.options.placeholder as string | undefined) ?? ctx.t('selectPlaceholder')}
        ?required=${ctx.required}
        ?disabled=${ctx.disabled}
        ?readonly=${ctx.readOnly}
        @selection-change=${stop}
        @input=${on.input}
        @change=${on.change}
        >${choices.map((choice, i) => html`<c2-list-item value=${String(i)}>${choice.label}</c2-list-item>`)}</c2-select
      >`,
    )
  },
}

const radio: JsonFormRenderer = {
  name: 'radio',
  tester: rankWith(3, and(isControl, schemaMatches(hasChoices), optionIs('widget', 'radio'))),
  render(ctx) {
    const choices = choicesOf(ctx.schema, ctx.rootSchema)
    const selected = indexOfChoice(choices, ctx.value)
    // The group fires only `change`: the form fires `input` with it.
    const on = handlers(ctx, (el) => choices[Number(el.value)]?.value)
    return field(
      ctx,
      html`<c2-radio-group
        .value=${live(selected >= 0 ? String(selected) : '')}
        orientation=${ifDefined(ctx.options.orientation as string | undefined)}
        ?required=${ctx.required}
        ?disabled=${ctx.disabled || ctx.readOnly}
        @change=${on.change}
        >${choices.map((choice, i) => html`<c2-radio value=${String(i)}>${choice.label}</c2-radio>`)}</c2-radio-group
      >`,
    )
  },
}

const itemsHaveChoices = (s: JsonSchema) => !!s.items && hasChoices(s.items)

const checkboxes: JsonFormRenderer = {
  name: 'checkboxes',
  tester: rankWith(3, and(isControl, schemaTypeIs('array'), schemaMatches(itemsHaveChoices))),
  render(ctx) {
    const choices = choicesOf(ctx.schema?.items, ctx.rootSchema)
    const values = Array.isArray(ctx.value) ? ctx.value : []
    const read = (el: HTMLElement & Record<string, unknown>) => {
      const picked = (el.value as string[]).map((value) => choices[Number(value)]?.value)
      return picked.length ? picked : undefined
    }
    const on = handlers(ctx, read)
    return field(
      ctx,
      html`<c2-checkbox-group
        .value=${live(values.map((value) => String(indexOfChoice(choices, value))).filter((value) => value !== '-1'))}
        orientation=${ifDefined(ctx.options.orientation as string | undefined)}
        ?required=${ctx.required}
        ?disabled=${ctx.disabled || ctx.readOnly}
        @input=${on.input}
        @change=${on.change}
        >${choices.map((choice, i) => html`<c2-checkbox value=${String(i)}>${choice.label}</c2-checkbox>`)}</c2-checkbox-group
      >`,
      false,
      ctx.errorFor(ctx.path, true),
    )
  },
}

const tags: JsonFormRenderer = {
  name: 'tags',
  tester: rankWith(
    2,
    and(
      isControl,
      schemaTypeIs('array'),
      schemaMatches((s) => schemaType(s.items) === 'string' && !itemsHaveChoices(s)),
    ),
  ),
  render(ctx) {
    const on = handlers(ctx, (el) => ((el.value as string[]).length ? [...(el.value as string[])] : undefined))
    return field(
      ctx,
      html`<c2-tag-input
        .value=${live(Array.isArray(ctx.value) ? (ctx.value as string[]) : [])}
        placeholder=${placeholder(ctx)}
        max=${ifDefined(ctx.schema?.maxItems)}
        ?allow-duplicates=${!ctx.schema?.uniqueItems}
        ?required=${ctx.required}
        ?disabled=${ctx.disabled}
        ?readonly=${ctx.readOnly}
        @input=${on.input}
        @change=${on.change}
      ></c2-tag-input>`,
      false,
      ctx.errorFor(ctx.path, true),
    )
  },
}

// Groups ----------------------------------------------------------------------------------------------------------

function groupError(message: string) {
  return message ? html`<div class="group-error" part="group-error">${message}</div>` : nothing
}

function group(ctx: JsonFormRenderContext, label: string, body: unknown) {
  const labelId = `${ctx.id}-label`
  if (ctx.options.collapsible) {
    return html`<c2-details
      part=${ctx.parts('group')}
      class="group"
      style=${styleMap(spanStyle(ctx.element))}
      label=${label}
      .expanded=${ctx.options.expanded !== false}
      ><div class="layout vertical">${body}</div></c2-details
    >`
  }
  return html`<c2-card
    part=${ctx.parts('group')}
    class="group"
    style=${styleMap(spanStyle(ctx.element))}
    role="group"
    aria-labelledby=${ifDefined(label ? labelId : undefined)}
    >${label ? html`<span slot="header" class="group-label" part="group-label" id=${labelId}>${label}</span>` : nothing}
    <div class="layout vertical">${body}</div></c2-card
  >`
}

const object: JsonFormRenderer = {
  name: 'object',
  tester: rankWith(1, and(isControl, schemaTypeIs('object'))),
  render(ctx) {
    const detail = ctx.options.detail as UiElement | undefined
    return group(ctx, ctx.label, html`${groupError(ctx.error)}${ctx.renderDetail(ctx.path, detail)}`)
  },
}

const array: JsonFormRenderer = {
  name: 'array',
  tester: rankWith(1, and(isControl, schemaTypeIs('array'))),
  render(ctx) {
    const items = Array.isArray(ctx.value) ? ctx.value : []
    const detail = ctx.options.detail as UiElement | undefined
    const itemSchema = ctx.schema?.items ?? {}
    const max = ctx.schema?.maxItems
    const add = () => {
      const created = applyDefaults(itemSchema, schemaType(deref(itemSchema, ctx.rootSchema)) === 'object' ? {} : undefined, ctx.rootSchema)
      ctx.setValue([...items, created], true)
    }
    const remove = (index: number) => {
      const next = items.filter((_item, i) => i !== index)
      ctx.setValue(next.length ? next : undefined, true)
    }
    const body = items.map(
      (_item, index) =>
        html`<div class="array-item" part="array-item" role="group" aria-labelledby="${ctx.id}-item-${index}">
          <div class="array-item-header" part="array-item-header">
            <span id="${ctx.id}-item-${index}">${ctx.t('item', index + 1)}</span>
            <c2-button type="button" ?disabled=${ctx.disabled || ctx.readOnly} @click=${() => remove(index)}>${ctx.t('removeItem')}</c2-button>
          </div>
          ${ctx.renderDetail([...ctx.path, index], detail)}
        </div>`,
    )
    const actions = html`<div class="array-actions" part="array-actions">
      <c2-button type="button" ?disabled=${ctx.disabled || ctx.readOnly || (max !== undefined && items.length >= max)} @click=${add}
        >${ctx.t('addItem')}</c2-button
      >
    </div>`
    return group(ctx, ctx.label, html`${groupError(ctx.error)}${body}${actions}`)
  },
}

// Layouts ---------------------------------------------------------------------------------------------------------

const vertical: JsonFormRenderer = {
  name: 'vertical',
  tester: rankWith(1, or(uiTypeIs('VerticalLayout'), uiTypeIs('Category'))),
  render: (ctx) =>
    html`<div part=${ctx.parts('layout')} class="layout vertical" style=${styleMap(spanStyle(ctx.element))}>
      ${ctx.renderElements(ctx.element.elements ?? [])}
    </div>`,
}

const horizontal: JsonFormRenderer = {
  name: 'horizontal',
  tester: rankWith(1, uiTypeIs('HorizontalLayout')),
  render: (ctx) =>
    html`<div part=${ctx.parts('layout')} class="layout horizontal" style=${styleMap(spanStyle(ctx.element))}>
      ${ctx.renderElements(ctx.element.elements ?? [])}
    </div>`,
}

const grid: JsonFormRenderer = {
  name: 'grid',
  tester: rankWith(1, uiTypeIs('GridLayout')),
  render(ctx) {
    const columns = Number(ctx.options.columns) || 2
    return html`<div class="grid-container" style=${styleMap(spanStyle(ctx.element))}>
      <div part=${ctx.parts('layout')} class="layout grid" style=${styleMap({ '--_columns': String(columns) })}>
        ${ctx.renderElements(ctx.element.elements ?? [])}
      </div>
    </div>`
  },
}

const groupLayout: JsonFormRenderer = {
  name: 'group',
  tester: rankWith(1, uiTypeIs('Group')),
  render: (ctx) => group(ctx, ctx.element.label || '', ctx.renderElements(ctx.element.elements ?? [])),
}

const label: JsonFormRenderer = {
  name: 'label',
  tester: rankWith(1, uiTypeIs('Label')),
  render: (ctx) => html`<p part=${ctx.parts('label')} class="label" style=${styleMap(spanStyle(ctx.element))}>${(ctx.element as { text?: string }).text}</p>`,
}

function categories(ctx: JsonFormRenderContext): UiElement[] {
  return (ctx.element.elements ?? []).filter((element) => element.type === 'Category')
}

const tabs: JsonFormRenderer = {
  name: 'tabs',
  tester: rankWith(1, uiTypeIs('Categorization')),
  render(ctx) {
    const host = ctx.host as HTMLElement & CategoryHost
    const items = categories(ctx)
    const selected = Math.min(host.selectedCategory(ctx.id), items.length - 1)
    const panels = ctx.renderElements(items)
    const panelId = (i: number) => `${ctx.id}-panel-${i}`
    const onSelect = (event: Event) => {
      const value = (event as CustomEvent<{ value: string }>).detail.value
      host.selectCategory(ctx.id, Number(value.slice(value.lastIndexOf('-') + 1)))
    }
    return html`<c2-tabs part=${ctx.parts('categorization')} class="categorization" selected-tab=${panelId(selected)} @selection-change=${onSelect}>
      ${items.map((item, i) => html`<c2-tab for=${panelId(i)} class=${host.categoryHasErrors(ctx.id, i) ? 'has-error' : ''}>${item.label || ''}</c2-tab>`)}
      ${items.map((_item, i) => html`<div id=${panelId(i)} class="category">${panels[i]}</div>`)}
    </c2-tabs>`
  },
}

const stepper: JsonFormRenderer = {
  name: 'stepper',
  tester: rankWith(2, and(uiTypeIs('Categorization'), optionIs('variant', 'stepper'))),
  render(ctx) {
    const host = ctx.host as HTMLElement & CategoryHost
    const items = categories(ctx)
    const current = Math.min(host.selectedCategory(ctx.id), items.length - 1)
    const panels = ctx.renderElements(items)
    const go = (index: number) => {
      // Moving forward shows the errors of the steps left behind and stops at the first step that has one.
      for (let i = current; i < index; i++) {
        if (!host.checkCategory(ctx.id, i)) {
          host.selectCategory(ctx.id, i)
          return
        }
      }
      host.selectCategory(ctx.id, index)
    }
    const status = (i: number) => (i === current ? 'current' : host.categoryHasErrors(ctx.id, i) ? 'error' : i < current ? 'success' : 'pending')
    return html`<div part=${ctx.parts('categorization')} class="categorization stepper">
      <c2-steps
        orientation="horizontal"
        interactive
        selected=${String(current)}
        .steps=${items.map((item, i) => ({ id: String(i), label: item.label || '', status: status(i) }))}
        @selection-change=${(event: CustomEvent<{ value: string }>) => go(Number(event.detail.value))}
      ></c2-steps>
      ${items.map((_item, i) => html`<div class="category" ?hidden=${i !== current}>${panels[i]}</div>`)}
      <div class="stepper-actions" part="stepper-actions">
        <c2-button type="button" class="previous" ?hidden=${current === 0} @click=${() => go(current - 1)}>${ctx.t('previous')}</c2-button>
        <c2-button type="button" ?hidden=${current >= items.length - 1} @click=${() => go(current + 1)}>${ctx.t('next')}</c2-button>
      </div>
    </div>`
  },
}

export const builtInRenderers: JsonFormRenderer[] = [
  text,
  textarea,
  password,
  dateRenderer('date'),
  dateRenderer('time'),
  dateRenderer('date-time'),
  number,
  slider,
  checkbox,
  toggle,
  select,
  radio,
  checkboxes,
  tags,
  object,
  array,
  vertical,
  horizontal,
  grid,
  groupLayout,
  label,
  tabs,
  stepper,
]

for (const renderer of builtInRenderers) registerRenderer(renderer)
