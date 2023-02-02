import { unsafeStatic } from 'lit/static-html.js'
import type { JsonFormGroup, JsonFormItem, UIDefinition, JsonUI, UIRenderParam, VariantUIDefinition, CompareFn } from './types'
import { html, type TemplateResult } from 'lit'
import { ifDefined } from 'lit/directives/if-defined.js'
import { bindMap, dynamicHtml, ObjectMap } from './dynamic-html'
import COMPONENT_REGISTRY from './component-registry'

type UnionGroupPropertyTypes = JsonFormGroup | JsonFormItem | UIDefinition | string[] | undefined | JsonUI

export const FORM_ITEM_DATA_CHANGE = 'formItemDataChange'

export function isUIDefinition(item: UnionGroupPropertyTypes): item is UIDefinition {
  return !!(item as UIDefinition).componentName
}

export function isJsonFormItem(item: UnionGroupPropertyTypes): item is JsonFormItem {
  return !!(item as JsonFormItem).value
}

export function isJsonFormGroup(item: UnionGroupPropertyTypes): item is JsonFormGroup {
  return !isUIDefinition(item) && !isJsonFormItem(item)
}

export function defaultExtractValueChangeData(event: Event): unknown {
  if (event instanceof CustomEvent) {
    return event.detail
  }
  return null
}

export function handleFormItemValueChange(renderOps: UIRenderParam) {
  const extractValueFn = renderOps.ui.extractValueChangeData ?? defaultExtractValueChangeData
  return function (event: Event) {
    let value: unknown = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = event.target as any
    if (renderOps.ui.getValueAttribute) {
      value = target[renderOps.ui.getValueAttribute] ?? target.getAttribute(renderOps.ui.getValueAttribute)
    } else if (renderOps.ui.selectedAttribute) {
      value = target[renderOps.ui.selectedAttribute] ?? !!target.getAttribute(renderOps.ui.selectedAttribute)
    } else if (renderOps.ui.selectedCss) {
      value = target.classList.contains(renderOps.ui.selectedCss)
    } else {
      value = extractValueFn(event)
    }

    event.target?.dispatchEvent(
      new CustomEvent(FORM_ITEM_DATA_CHANGE, {
        bubbles: true,
        cancelable: true,
        detail: {
          value,
          valuePath: renderOps.valuePath,
        },
      })
    )
  }
}

export function compareWrapper(data: unknown, value: unknown, compare: CompareFn) {
  if (data === null || typeof data === 'undefined') {
    if (value === null || typeof value === 'undefined') return false
  }
  return compare(data, value)
}

export function renderUI({ ui, data, value, jsonUI, children, formItem, valuePath, isWrapper }: UIRenderParam): TemplateResult | undefined {
  if (!ui.tagName) return undefined
  if (ui.tagName === 'simpleText') {
    return data ? html`${data}` : undefined
  }

  const compare = ui.compare || defaultCompare
  let slotChildren: TemplateResult | undefined = undefined
  const mergedAttributes = mergeObject(ui.attributes, jsonUI?.attributes)
  let cssStr = mergeCss(ui.css, jsonUI?.css)
  const dynamicBind: ObjectMap[] = Object.keys(mergedAttributes).map((key) => ({
    key,
    value: mergedAttributes[key],
    type: 'attribute',
  }))
  if (ui.valueAttribute) {
    dynamicBind.push({
      key: ui.valueAttribute,
      value: ifDefined(value),
      type: 'attribute',
    })
  }

  if (!isWrapper && ui.valueChangeEvent) {
    dynamicBind.push({
      key: ui.valueChangeEvent,
      value: handleFormItemValueChange({ ui, data, value, jsonUI, children, formItem, valuePath, isWrapper }),
      type: 'event',
    })
  }

  if (ui.dataAttribute) {
    dynamicBind.push({
      key: ui.dataAttribute,
      value: ifDefined(data),
      type: 'attribute',
    })
  }

  if (ui.selectedAttribute) {
    dynamicBind.push({
      key: ui.selectedAttribute,
      value: compareWrapper(data, value, compare),
      type: 'attribute',
    })
  }

  if (ui.formItemIdAttribute) {
    dynamicBind.push({
      key: ui.formItemIdAttribute,
      value: formItem,
      type: 'attribute',
    })
  }

  if (ui.selectedCss && compareWrapper(data, value, compare)) {
    cssStr = cssStr ? cssStr + ' ' + ui.selectedCss : ui.selectedCss
  }

  if (ui.slot) {
    const slotUI = COMPONENT_REGISTRY.getUIDefinition(ui.slot)
    if (slotUI) {
      if (jsonUI?.enumData) {
        slotChildren = html`${jsonUI.enumData.map((enumItem) => renderUI({ ui: slotUI, data: enumItem, value, formItem, valuePath, isWrapper }))}`
      } else {
        slotChildren = renderUI({ ui: slotUI, data, value, formItem, valuePath, isWrapper })
      }
    }
  }

  return dynamicHtml`<${unsafeStatic(ui.tagName)} data-form-item-id=${valuePath.join('_$_')}
    ${bindMap(dynamicBind)} 
    class=${ifDefined(cssStr)}>  
    ${jsonUI?.slotBeforeChildren ? [slotChildren, children] : [children, slotChildren]}
  </${unsafeStatic(ui.tagName)}>`
}

function defaultCompare(a: unknown, b: unknown) {
  return a === b
}

export function mergeObject<T>(obj1: T | undefined | null, obj2: T | undefined | null): T {
  if (typeof obj1 === 'undefined' || obj1 === null) return obj2 || ({} as T)
  if (typeof obj2 === 'undefined' || obj2 === null) return obj1 || ({} as T)
  return { ...obj1, ...obj2 }
}

export function mergeCss(css1: string[] | string | undefined, css2: string[] | string | undefined): string | undefined {
  return (
    [css1, css2]
      .flatMap((cls) => cls)
      .filter((cls) => !!cls)
      .join(' ') || undefined
  )
}

export function mergeVariantUI(variantUI: VariantUIDefinition, ui: UIDefinition): UIDefinition {
  const result = { ...ui, ...variantUI }
  result.attributes = mergeObject(ui.attributes, variantUI.attributes)
  result.css = mergeCss(ui.css, variantUI.css)

  return result
}
