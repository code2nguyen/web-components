import { TemplateResult } from 'lit'

export interface OptionsBase {
  [key: string]: boolean | number | string | object | unknown[] | null | undefined
}
export type AttributeValueType = boolean | number | string | object | unknown[]

export interface UIRenderParam {
  ui: UIDefinition
  value?: unknown
  data?: unknown
  jsonUI?: Omit<JsonUI, 'componentName'>
  children?: TemplateResult
  formItem: string
  valuePath: string[]
  isWrapper: boolean
}

export type Attributes = {
  [key: string]: AttributeValueType
}
export interface VariantUIDefinition {
  componentName: string
  attributes?: Attributes
  css?: string[] | string
  slot?: string
  dataAttribute?: string
  valueAttribute?: string
  getValueAttribute?: string
  valueChangeEvent?: string
  formItemIdAttribute?: string
  selectedCss?: string
  selectedAttribute?: string
}

export type CompareFn = (data: unknown, enumItem: unknown) => boolean

export interface UIDefinition {
  tagName?: string
  componentName: string
  attributes?: Attributes
  css?: string[] | string
  slot?: string
  variantComponents?: VariantUIDefinition[]
  dataAttribute?: string
  valueAttribute?: string
  getValueAttribute?: string
  valueChangeEvent?: string
  formItemIdAttribute?: string
  selectedCss?: string
  selectedAttribute?: string
  compare?: CompareFn
  render?: (opt: UIRenderParam) => TemplateResult | undefined
  load?: () => Promise<void>
  extractValueChangeData?: (event: Event) => unknown
}

export type LibDefinition = UIDefinition[]

export interface JsonUI {
  componentName: string
  attributes?: {
    [key: string]: AttributeValueType
  }
  css?: string[] | string
  enumData?: unknown[]
  enumCss?: string[] | string
  enumAttributes?: {
    [key: string]: AttributeValueType
  }
  data?: unknown
  slotBeforeChildren?: boolean
}

interface ValueType {
  type: string
  required?: boolean
  minProperties?: number
  maxProperties?: number
}

// ORDER decorator +
export interface JsonFormItem {
  value: ValueType
  wrapperUI?: JsonUI
  ui?: JsonUI
}

export interface JsonFormGroup extends Omit<JsonFormItem, 'value'> {
  [key: string]: JsonFormGroup | JsonFormItem | string[] | undefined | JsonUI
  uiOrder?: string[]
}

export interface ComponentRegistryConfig {
  formGroupComponent?: string
  wrapperComponent?: string
  componentValueTypeMapping: {
    [type: string]: string
  }
  defaultComponent?: string
  componentWrapper?: string
}
