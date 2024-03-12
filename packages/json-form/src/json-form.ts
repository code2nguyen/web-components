import { LitElement, html, TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import COMPONENT_REGISTRY from './component-registry'
import { JsonFormGroup, JsonFormItem, UIDefinition } from './types'
import { FORM_DATA_CHANGE, FORM_ITEM_DATA_CHANGE, isJsonFormGroup, isJsonFormItem, renderUI } from './utils'

interface RenderFormItemParams {
  formItem: JsonFormItem
  data?: unknown
  value?: unknown
  formItemId: string
  valuePath: string[]
  isWrapper: boolean
}

@customElement('c2-json-form')
export class JsonForm extends LitElement {
  @property({ attribute: false }) json: JsonFormGroup = {}
  private _formData: unknown = {}

  @property({ attribute: false })
  public get formData(): unknown {
    return this._formData
  }

  public set formData(value: unknown) {
    const oldVal = this._formData
    this._formData = value
    this.internalFormData = value || {}
    this.requestUpdate('formData', oldVal)
  }

  @state() internalFormData: unknown = {}

  protected override createRenderRoot() {
    return this
  }

  protected override firstUpdated(): void {
    this.addEventListener(FORM_ITEM_DATA_CHANGE, this.handleFormItemDataChange)
  }

  private renderFormItem({ formItem, data, value, formItemId, valuePath, isWrapper }: RenderFormItemParams): TemplateResult | undefined {
    let ui: UIDefinition | undefined = COMPONENT_REGISTRY.getDefaultUI(formItem.value.type)
    if (formItem.ui?.componentName) {
      ui = COMPONENT_REGISTRY.getUIDefinition(formItem.ui.componentName)
    }
    if (!ui) return undefined
    const renderFn = ui.render || renderUI

    if (formItem.ui?.enumData && !ui.slot) {
      const enumJsonUI = { ...formItem.ui, enumData: undefined }
      return html`${formItem.ui.enumData.map((enumItem) =>
        this.renderFormItem({ formItem: { ...formItem, ui: enumJsonUI }, data: enumItem, value, formItemId, valuePath, isWrapper }),
      )}`
    }

    const formItemRenderedComponent = renderFn({ ui, data, jsonUI: formItem.ui, value, formItem: formItemId, valuePath, isWrapper })

    let wrapperUI: UIDefinition | undefined = COMPONENT_REGISTRY.getDefaultWrapperUI()
    if (formItem.wrapperUI && formItem.wrapperUI.componentName) {
      wrapperUI = COMPONENT_REGISTRY.getUIDefinition(formItem.wrapperUI.componentName)
    }

    if (wrapperUI) {
      const renderFn = wrapperUI.render || renderUI
      return renderFn({
        ui: wrapperUI,
        value,
        data: formItem.wrapperUI?.data || data,
        jsonUI: formItem.wrapperUI,
        children: formItemRenderedComponent,
        formItem: formItemId,
        valuePath,
        isWrapper: true,
      })
    }

    return formItemRenderedComponent
  }

  private renderFormGround(formGroup: JsonFormGroup, groupData: unknown, valuePath: string[]): TemplateResult | undefined {
    let groupItemKeys = Object.keys(formGroup).filter((key) => key !== 'uiOrder')
    // Sort items
    if (formGroup.uiOrder) {
      groupItemKeys = groupItemKeys.sort((key1, key2) => {
        const key1Index = formGroup.uiOrder!.indexOf(key1)
        const key2Index = formGroup.uiOrder!.indexOf(key2)
        return key1Index - key2Index
      })
    }

    return html`${groupItemKeys.map((key) => {
      const formItem = formGroup[key]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = groupData ? (groupData as any)[key] : undefined
      const currentValuePath = [...valuePath, key]
      if (isJsonFormGroup(formItem)) {
        const children = this.renderFormGround(formItem, value, currentValuePath)

        let wrapperUI: UIDefinition | undefined = COMPONENT_REGISTRY.getDefaultWrapperUI()
        if (formItem.wrapperUI && formItem.wrapperUI.componentName) {
          wrapperUI = COMPONENT_REGISTRY.getUIDefinition(formItem.wrapperUI.componentName)
        }

        let ui: UIDefinition | undefined = COMPONENT_REGISTRY.getDefaultGroupUI()
        if (formItem.ui && formItem.ui.componentName) {
          ui = COMPONENT_REGISTRY.getUIDefinition(formItem.ui.componentName)
        }

        let uiRenderedComponent: TemplateResult | undefined = undefined
        if (ui) {
          const renderFn = ui.render || renderUI
          uiRenderedComponent = renderFn({
            ui,
            value,
            data: formItem.ui?.data,
            jsonUI: formItem.ui,
            children,
            formItem: key,
            valuePath: currentValuePath,
            isWrapper: false,
          })
        } else {
          uiRenderedComponent = children
        }
        if (wrapperUI) {
          const renderFn = wrapperUI.render || renderUI
          return renderFn({
            ui: wrapperUI,
            value,
            data: formItem.wrapperUI?.data,
            jsonUI: formItem.wrapperUI,
            children: uiRenderedComponent,
            formItem: key,
            valuePath: currentValuePath,
            isWrapper: true,
          })
        }
        return uiRenderedComponent
      } else if (isJsonFormItem(formItem)) {
        return this.renderFormItem({
          formItem,
          data: formItem.ui?.data,
          value,
          formItemId: key,
          valuePath: currentValuePath,
          isWrapper: false,
        })
      }
      return null
    })}`
  }

  private handleFormItemDataChange(event: Event) {
    const { value, valuePath } = (event as CustomEvent).detail as { value: unknown; valuePath: string[] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let jsonCursor = this.internalFormData as any
    for (let i = 0; i < valuePath.length - 1; i++) {
      const path = valuePath[i]
      if (!jsonCursor[path]) jsonCursor[path] = {}
      jsonCursor = jsonCursor[path]
    }
    const formItemId = valuePath[valuePath.length - 1]
    jsonCursor[formItemId] = value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.internalFormData = { ...(this.internalFormData as any) }
    this.dispatchFormDataChange()
  }

  private dispatchFormDataChange() {
    const event = new CustomEvent(FORM_DATA_CHANGE, {
      cancelable: true,
      bubbles: true,
      detail: this.internalFormData,
    })
    this.dispatchEvent(event)
  }
  override render() {
    return this.renderFormGround(this.json, this.internalFormData, [])
  }
}
