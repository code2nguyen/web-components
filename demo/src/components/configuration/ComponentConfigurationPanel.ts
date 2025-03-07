import { LitElement, html, css, nothing, type TemplateResult, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import { StoreController } from '@nanostores/lit'
import { classMap } from 'lit/directives/class-map.js'
import { $configStore } from '../../store/config-store.ts'
import type { Checkbox } from '@c2n/checkbox'

import styles from './ComponentConfigurationPanel.scss?inline'

import './GenerateCodeBlock'
import '@c2n/details'
import '@c2n/label'
import '@c2n/checkbox'
import '@c2n/select'
import '@c2n/text-field'
import '@c2n/icon-button'
import '@c2n/tabs/tab.js'
import '@c2n/tabs'

import './SizeConfig'
import './PaddingConfig'
import './BorderRadiusConfig'
import './FontConfig'
import './ColorConfig'
import './BorderConfig'

import type { AttributeDeclarationItem, CSSDeclarationItem } from '../../store/manifest-declaration-item.ts'
import { flatGroupCssProperties, groupCssProperties } from '../../utils/manifest-utils.ts'
import { BORDER_ORDER, BORDER_RADIUS_ORDER, FONT_PROPERTY, PADDING_ORDER } from '../../utils/dom.ts'
import type { Select } from '@c2n/select'
import type { ExtraComponentConfigState } from '../../model/component-config-state.ts'

interface UpdateValue {
  name: string
  value: string
}

@customElement('demo-component-configuration-panel')
export class ComponentConfigurationPanel extends LitElement {
  static override styles = unsafeCSS(styles)

  private configStore = new StoreController(this, $configStore)

  private generateBooleanInput(label: string, name: string, value: string) {
    return html` <div class="row">
      <c2-label class="property-name" for=${name}>${label}</c2-label>
      <c2-checkbox @change=${this.handleCheckboxChange} id=${name} ?checked=${value !== 'false'}></c2-checked>
    </div>`
  }

  private generateColorConfig(label: string, name: string, value: string) {
    return html`<demo-color-config .label=${label} .name=${name} .value=${value} @change=${this.handleCustomConfigChange}></demo-color-config>`
  }

  private generateBorderConfig(label: string, name: string, value: string) {
    return html`<demo-border-config .label=${label} .name=${name} .value=${value} @change=${this.handleCustomConfigChange}></demo-border-config>`
  }

  private generateStringInput(label: string, name: string, value: string, type: string) {
    const classes = {
      number: type == 'pixel' || type == 'number',
    }
    return html` <div class="row">
      <c2-label class="property-name" for=${name}>${label}</c2-label>
      <c2-text-field .placeholder=${label} class=${classMap(classes)} @input=${this.handleTextInputChange} id=${name} .value=${value}></c2-text-field>
    </div>`
  }

  private handleCheckboxChange(event: Event) {
    const target = event.target as Checkbox
    const updatedValue: UpdateValue = {
      name: target.id,
      value: target.checked ? 'true' : 'false',
    }
    this.updateStore(updatedValue)
  }

  private handleTextInputChange(event: Event) {
    const target = event.target as HTMLElement & { value: string }
    const updatedValue: UpdateValue = {
      name: target.id,
      value: target.value,
    }
    this.updateStore(updatedValue)
  }

  private handleCustomConfigChange(event: CustomEvent) {
    const detail = event.detail as Record<string, string>
    for (const [key, value] of Object.entries(detail)) {
      if (key.startsWith('hideValue')) {
        const hideValues = this.componentConfig!.hideValues ?? {}
        hideValues[key.replace('hideValue', '')] = value
        this.updateComponentConfig('hideValues', hideValues)
      } else {
        const updatedValue: UpdateValue = {
          name: key,
          value: value,
        }
        this.updateStore(updatedValue)
      }
    }
  }

  private handleSelectComponentChange(event: Event & { target: Select }) {
    $configStore.setKey('currentComponentTag', event.target.value[0])
  }

  private handleCloseClick() {
    $configStore.setKey('showConfig', false)
    $configStore.setKey('uid', '')
  }

  private updateStore(updateValue: UpdateValue) {
    if (!$configStore.value) return
    const updateAttribute = this.componentConfig?.attributes.find((item) => item.name == updateValue.name)
    if (updateAttribute) {
      updateAttribute.value = updateValue.value
      this.updateComponentConfig('attributes', [...this.componentConfig!.attributes])
      return
    }

    const updateCssProperties = this.componentConfig?.allCssProperties.find((item) => item.cssVariable == updateValue.name)
    if (updateCssProperties) {
      updateCssProperties.value = updateValue.value
      const optimizedCssProperties = this.optimizeCssVariables([...this.componentConfig!.allCssProperties])
      this.updateComponentConfig('allCssProperties', optimizedCssProperties)
      return
    }
  }
  private updateComponentConfig(key: keyof ExtraComponentConfigState, value: ExtraComponentConfigState[keyof ExtraComponentConfigState]) {
    if (!$configStore.get().uid || !$configStore.get().configs || !this.componentConfig) return
    const new_configs = new Map($configStore.value.configs)
    const newComponentConfig: ExtraComponentConfigState = { ...this.componentConfig }
    newComponentConfig[key] = value as never
    new_configs.set($configStore.get().uid!, newComponentConfig)
    $configStore.setKey('configs', new_configs)
  }

  private generateAttributeInput(attr: AttributeDeclarationItem) {
    const value = this.getAttributeValue(attr.name)
    switch (attr.type) {
      case 'boolean':
        return this.generateBooleanInput(attr.name, attr.name, value)
      default:
        return this.generateStringInput(attr.name, attr.name, value, attr.type)
    }
  }

  private getCssVariableValue(name: string): string {
    const cssVariable = this.componentConfig?.allCssProperties.find((item) => item.cssVariable == name)
    if (!cssVariable) return ''

    if (cssVariable.value !== undefined) {
      return cssVariable.value
    }

    if (cssVariable.default?.startsWith('--')) {
      return this.getCssVariableValue(cssVariable.default)
    }

    return cssVariable.default ?? ''
  }

  private getAttributeValue(name: string) {
    const attr = this.componentConfig?.attributes.find((item) => item.name == name)
    if (!attr) return ''
    return attr.value !== undefined ? attr.value : (attr.default ?? (attr.type == 'boolean' ? 'false' : ''))
  }

  private generateCssVariableInput(cssDeclaration: CSSDeclarationItem) {
    const value = this.getCssVariableValue(cssDeclaration.cssVariable)
    switch (cssDeclaration.type) {
      case 'pixel':
        return this.generateStringInput(cssDeclaration.property, cssDeclaration.cssVariable, value, cssDeclaration.type)
      case 'background':
      case 'background-color':
      case 'color':
        return this.generateColorConfig(cssDeclaration.property, cssDeclaration.cssVariable, value)
      case 'border':
        return this.generateBorderConfig(cssDeclaration.property, cssDeclaration.cssVariable, value)
      default:
        return this.generateStringInput(cssDeclaration.property, cssDeclaration.cssVariable, value, cssDeclaration.type)
    }
  }

  private renderPaddingConfig(cssProperties: CSSDeclarationItem[], result: TemplateResult[]) {
    const paddingVariables = cssProperties
      .filter((item) => {
        return item.type == 'padding' || item.property.startsWith('padding')
      })
      .sort((a, b) => {
        const aOrder = PADDING_ORDER.indexOf(a.property)
        const bOrder = PADDING_ORDER.indexOf(b.property)
        return aOrder - bOrder
      })

    if (paddingVariables.length > 0) {
      result.push(html`
        <demo-padding-config
          .name=${paddingVariables.length == 1 ? paddingVariables[0].cssVariable : paddingVariables.map((i) => i.cssVariable)}
          .value=${paddingVariables.length == 1
            ? this.getCssVariableValue(paddingVariables[0].cssVariable)
            : paddingVariables.map((i) => this.getCssVariableValue(i.cssVariable))}
          @change=${this.handleCustomConfigChange}
        ></demo-padding-config>
      `)
      cssProperties = cssProperties.filter((item) => !paddingVariables.includes(item))
    }

    return cssProperties
  }

  private renderBorderRadiusConfig(cssProperties: CSSDeclarationItem[], result: TemplateResult[]) {
    const borderRadiusVariables = cssProperties
      .filter((item) => {
        return item.type == 'border-radius' || BORDER_RADIUS_ORDER.includes(item.property)
      })
      .sort((a, b) => {
        const aOrder = BORDER_RADIUS_ORDER.indexOf(a.property)
        const bOrder = BORDER_RADIUS_ORDER.indexOf(b.property)
        return aOrder - bOrder
      })

    if (borderRadiusVariables.length > 0) {
      result.push(html`
        <demo-border-radius-config
          .name=${borderRadiusVariables.length == 1 ? borderRadiusVariables[0].cssVariable : borderRadiusVariables.map((i) => i.cssVariable)}
          .value=${borderRadiusVariables.length == 1
            ? this.getCssVariableValue(borderRadiusVariables[0].cssVariable)
            : borderRadiusVariables.map((i) => this.getCssVariableValue(i.cssVariable))}
          @change=${this.handleCustomConfigChange}
        ></demo-border-radius-config>
      `)
      cssProperties = cssProperties.filter((item) => !borderRadiusVariables.includes(item))
    }

    return cssProperties
  }

  private renderFontConfig(cssProperties: CSSDeclarationItem[], result: TemplateResult[]) {
    const fontVariables = cssProperties.filter((item) => {
      return FONT_PROPERTY.includes(item.property)
    })
    if (fontVariables.length > 0) {
      result.push(html`
        <demo-font-config
          .names=${fontVariables.map((i) => i.cssVariable)}
          .values=${fontVariables.map((i) => this.getCssVariableValue(i.cssVariable))}
          @change=${this.handleCustomConfigChange}
        ></demo-font-config>
      `)
      cssProperties = cssProperties.filter((item) => !fontVariables.includes(item))
    }

    return cssProperties
  }

  private renderBorderConfig(cssProperties: CSSDeclarationItem[], result: TemplateResult[]) {
    const borderVariables = cssProperties.filter((item) => {
      return BORDER_ORDER.includes(item.property)
    })
    if (borderVariables.length > 0) {
      result.push(
        ...borderVariables.map((cssVar) => {
          return this.generateCssVariableInput(cssVar)
        }),
      )
      cssProperties = cssProperties.filter((item) => !borderVariables.includes(item))
    }

    return cssProperties
  }

  private renderElementCssPropertiesContent(cssProperties: CSSDeclarationItem[]) {
    const result: TemplateResult[] = []

    cssProperties = this.renderPaddingConfig(cssProperties, result)
    cssProperties = this.renderBorderRadiusConfig(cssProperties, result)

    cssProperties = this.renderBorderConfig(cssProperties, result)
    cssProperties = this.renderFontConfig(cssProperties, result)

    return [
      ...result,
      ...cssProperties.map((cssVar) => {
        return this.generateCssVariableInput(cssVar)
      }),
    ]
  }

  private renderCssProperties() {
    if (this.componentConfig == null) return nothing
    const cssComponentTag = this.configStore.value.currentComponentTag
    const cssProperties = this.componentConfig.allCssProperties.filter((item) => {
      return item.cssVariable.startsWith(`--${cssComponentTag}--`) || item.cssVariable.startsWith(`--${cssComponentTag}__`)
    })
    const groupedCssVariables = flatGroupCssProperties(groupCssProperties(cssProperties))
    return html`<div class="config-content-group">
      <div class="row">
        <c2-label for="component-select">Component</c2-label>
        <c2-select id="component-select" value=${cssComponentTag} required @selection-change=${this.handleSelectComponentChange}>
          <c2-list-item value=${this.componentConfig.tagName} class="level-0">${this.componentConfig.tagName}</c2-list-item>
          ${this.componentConfig.internalComponents.map((tag) => {
            return html`<c2-list-item value=${tag} class="level-1">${tag}</c2-list-item>`
          })}
          ${this.componentConfig.slotComponents.map((tag) => {
            return html`<c2-list-item value=${tag}>${tag}</c2-list-item>`
          })}
        </c2-select>
      </div>
      ${groupedCssVariables.map((groupCssVariables) => {
        return html`<c2-details>
              <div slot="title" class="title">${groupCssVariables.groups.join(' > ')}</div>
              <svg slot="icon" fill="currentColor" slot viewBox="0 0 256 256">
                <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
              </svg>
              <div class="config-content-group-css">
                ${this.renderElementCssPropertiesContent(groupCssVariables.cssProperties)}
              <div>
            </c2-details>`
      })}
    </div>`
  }

  private get componentConfig(): ExtraComponentConfigState | null | undefined {
    return this.configStore.value.uid && this.configStore.value.configs ? this.configStore.value.configs.get(this.configStore.value.uid) : null
  }

  private renderAttributes() {
    return this.componentConfig && this.componentConfig.attributes.length > 0
      ? html` <div class="config-content-group">
          ${this.componentConfig.attributes.map((attr) => {
            return this.generateAttributeInput(attr)
          })}
        </div>`
      : nothing
  }

  private renderCode() {
    return html`<demo-generate-code-block .componentUID=${this.configStore.value.uid!}></demo-generate-code-block> `
  }

  private optimizeCssVariables(cssProperties: CSSDeclarationItem[]) {
    cssProperties.forEach((cssProperty) => {
      if (cssProperty.value && cssProperty.default?.startsWith('--')) {
        const fallbackValue = this.getCssVariableValue(cssProperty.default)
        if (cssProperty.value == fallbackValue) {
          cssProperty.value = undefined
        }
      }
    })
    return cssProperties
  }

  render() {
    const componentUID = this.configStore.value.uid
    if (!componentUID || !this.configStore.value.showConfig) return nothing
    return html`<div>
      <div class="header">
        <c2-tabs selected-tab="CSS">
          <c2-tab label="CSS" for="CSS"></c2-tab>
          <c2-tab label="Attributes" for="Attributes"></c2-tab>
          <c2-tab label="Code" for="Code"></c2-tab>
          <div id="CSS">${this.renderCssProperties()}</div>
          <div id="Attributes">${this.renderAttributes()}</div>
          <div id="Code">${this.renderCode()}</div>
        </c2-tabs>
        <c2-icon-button class="close-button" @click=${this.handleCloseClick}>
          <svg fill="currentColor" viewBox="0 0 256 256">
            <path
              d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"
            ></path>
          </svg>
        </c2-icon-button>
      </div>
    </div>`
  }
}
