import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import { StoreController } from '@nanostores/lit'
import { classMap } from 'lit/directives/class-map.js'
import { $configStore } from '../../store/config-store'
import './GenerateCodeBlock'
import * as changeCase from 'change-case'
import type { Checkbox } from '@c2n/checkbox'

import '@c2n/details'
import '@c2n/label'
import '@c2n/checkbox'
import '@c2n/text-field'
import './SizeConfig'
import './PaddingConfig'
import './BorderRadiusConfig'

import type { AttributeDeclarationItem, CSSDeclarationItem, ComponentManifests, GroupedCssVariables } from '../../store/manifest-declaration-item'
import { flatGroupCssProperties, groupCssProperties } from '../../utils/manifest-utils'
import { BORDER_RADIUS_ORDER, PADDING_ORDER } from '../../utils/dom'

interface UpdateValue {
  name: string
  value: string
}

@customElement('demo-component-configuration-panel')
export class ComponentConfigurationPanel extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        font-size: 0.7rem;
        --c2-details--border-top: none;

        --c2-details__header--padding-top: 12px;
        --c2-details__header--padding-right: 12px;
        --c2-details__header--padding-bottom: 12px;
        --c2-details__header--padding-left: 12px;
        --c2-details__header--flex-direction: row-reverse;
        --c2-details__header__icon--rotate: 90deg;
        --c2-details__header--gap: 8px;
        --c2-details__header__icon--width: 12px;
        --c2-details__header__icon--height: 12px;
        --c2-details__header__hover--background-color: transparent;

        --c2-text-field--font-size: 0.7rem;
        --c2-text-field--padding-top: 6px;
        --c2-text-field--padding-bottom: 6px;
      }

      c2-text-field.number {
        width: 80px;
      }

      c2-details:not(.sub-details):first-of-type {
        --c2-details--border-radius: 8px 8px 0px 0px;
      }

      c2-details:not(.sub-details):last-of-type {
        --c2-details--border-radius: 0px 0px 8px 8px;
      }

      c2-details.sub-details {
        --c2-details--border-bottom: none;
        --c2-details--border-top: none;
        --c2-details__content--padding-left: 12px;
        --c2-details__content--padding-right: 12px;
        --c2-details__content--padding-bottom: 0px;
      }

      c2-details:has(> .sub-details) {
        --c2-details__content--padding-left: 0px;
        --c2-details__content--padding-right: 0px;
      }

      .css-input-group-content {
        padding-top: 4px;
        padding-bottom: 4px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .title {
        font-weight: 500;
      }
      c2-label {
        font-weight: 300;
      }
    `,
  ]

  private configStore = new StoreController(this, $configStore)

  renderGenerateCodeBlock(componentUID: string) {
    return html`<demo-generate-code-block .componentUID=${componentUID}></demo-generate-code-block>`
  }

  handleSizeConfigChange(event: CustomEvent) {
    console.log(event)
    $configStore.setKey('host', event.detail)
  }

  generateBooleanInput(label: string, name: string, value: string) {
    return html` <div class="row">
      <c2-label for=${name}>${label}</c2-label>
      <c2-checkbox @change=${this.handleCheckboxChange} id=${name} ?checked=${value !== 'false'}></c2-checked>
    </div>`
  }

  generateStringInput(label: string, name: string, value: string, type: string) {
    const classes = {
      number: type == 'pixel' || type == 'number',
    }
    return html` <div class="row">
      <c2-label for=${name}>${label}</c2-label>
      <c2-text-field class=${classMap(classes)} @change=${this.handleTextInputChange} id=${name} .value=${value}></c2-text-field>
    </div>`
  }

  handleCheckboxChange(event: Event) {
    const target = event.target as Checkbox

    if (!$configStore.value) return
    const updatedValue: UpdateValue = {
      name: target.id,
      value: target.checked ? 'true' : 'false',
    }
    this.updateStore(updatedValue)
  }

  handleTextInputChange(event: Event) {
    const target = event.target as HTMLElement & { value: string }
    if (!$configStore.value) return
    const updatedValue: UpdateValue = {
      name: target.id,
      value: target.value,
    }
    this.updateStore(updatedValue)
  }

  handleCustomConfigChange(event: CustomEvent) {
    const detail = event.detail as Record<string, string>
    if (!$configStore.value) return

    for (const [key, value] of Object.entries(detail)) {
      const updatedValue: UpdateValue = {
        name: key,
        value: value,
      }
      this.updateStore(updatedValue)
    }
  }

  private updateStore(updateValue: UpdateValue) {
    if (!$configStore.value) return
    const updateAttribute = $configStore.value.attributes.find((item) => item.name == updateValue.name)
    if (updateAttribute) {
      updateAttribute.value = updateValue.value
      $configStore.setKey('attributes', [...$configStore.value.attributes])
      return
    }

    const updateCssProperties = $configStore.value.cssProperties.find((item) => item.cssVariable == updateValue.name)
    if (updateCssProperties) {
      updateCssProperties.value = updateValue.value
      $configStore.setKey('cssProperties', [...$configStore.value.cssProperties])
      return
    }
  }

  // private getSettingName(name: string) {
  //   const tagName = $configStore.value?.tagName ?? ''
  //   const states = this.configStore.value.stateCssProperties ? Object.keys(this.configStore.value.stateCssProperties) : []
  //   let settingName = name.replace(`--${tagName}`, '')
  //   states.forEach((state) => {
  //     settingName = settingName.replace(`-${changeCase.paramCase(state)}`, '')
  //   })
  //   return changeCase.capitalCase(settingName)
  // }

  generateAttributeInput(attr: AttributeDeclarationItem) {
    const value = this.getValueOrDefaultValue(attr)

    switch (attr.type) {
      case 'boolean':
        return this.generateBooleanInput(attr.name, attr.name, value)
      default:
        return this.generateStringInput(attr.name, attr.name, value, attr.type)
    }
  }

  getValueOrDefaultValue(item: CSSDeclarationItem | AttributeDeclarationItem) {
    return item.value !== undefined ? item.value : item.default ?? (item.type == 'boolean' ? 'false' : '')
  }

  generateCssVariableInput(cssDeclaration: CSSDeclarationItem) {
    const value = this.getValueOrDefaultValue(cssDeclaration)
    switch (cssDeclaration.type) {
      case 'pixel':
        return this.generateStringInput(cssDeclaration.property, cssDeclaration.cssVariable, value, cssDeclaration.type)
      default:
        return this.generateStringInput(cssDeclaration.property, cssDeclaration.cssVariable, value, cssDeclaration.type)
    }
  }

  renderPaddingConfig(cssProperties: CSSDeclarationItem[], result: TemplateResult[]) {
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
            ? this.getValueOrDefaultValue(paddingVariables[0])
            : paddingVariables.map((i) => this.getValueOrDefaultValue(i))}
          @change=${this.handleCustomConfigChange}
        ></demo-padding-config>
      `)
      cssProperties = cssProperties.filter((item) => !paddingVariables.includes(item))
    }

    return cssProperties
  }

  renderBorderRadiusConfig(cssProperties: CSSDeclarationItem[], result: TemplateResult[]) {
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
            ? this.getValueOrDefaultValue(borderRadiusVariables[0])
            : borderRadiusVariables.map((i) => this.getValueOrDefaultValue(i))}
          @change=${this.handleCustomConfigChange}
        ></demo-border-radius-config>
      `)
      cssProperties = cssProperties.filter((item) => !borderRadiusVariables.includes(item))
    }

    return cssProperties
  }

  renderElementCssPropertiesContent(cssProperties: CSSDeclarationItem[]) {
    const result: TemplateResult[] = []
    cssProperties = this.renderPaddingConfig(cssProperties, result)
    cssProperties = this.renderBorderRadiusConfig(cssProperties, result)

    return [
      ...result,
      ...cssProperties.map((cssVar) => {
        return this.generateCssVariableInput(cssVar)
      }),
    ]
  }

  renderCssProperties() {
    const groupedCssVariables = flatGroupCssProperties(groupCssProperties(this.configStore.value.cssProperties))

    return groupedCssVariables.length > 0
      ? html`<c2-details>
          <div slot="title" class="title">CSS Variables</div>
          <svg slot="icon" fill="currentColor" slot viewBox="0 0 256 256">
            <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
          </svg>
          ${groupedCssVariables.map((groupCssVariables) => {
            return html`<c2-details class="sub-details">
              <div slot="title" class="title">${groupCssVariables.groups.join(' > ')}</div>
              <svg slot="icon" fill="currentColor" slot viewBox="0 0 256 256">
                <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
              </svg>
              <div class="css-input-group-content">
                ${this.renderElementCssPropertiesContent(groupCssVariables.cssProperties)}
              <div>
            </c2-details>`
          })}
        </c2-details>`
      : nothing
  }

  renderAttribues() {
    return this.configStore.value.attributes.length > 0
      ? html`<c2-details>
          <div slot="title" class="title">Attributes</div>
          <svg slot="icon" fill="currentColor" slot viewBox="0 0 256 256">
            <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
          </svg>
          ${this.configStore.value.attributes.map((attr) => {
            return this.generateAttributeInput(attr)
          })}
        </c2-details>`
      : nothing
  }

  renderCode() {
    return html`
      <c2-details>
        <div slot="title" class="title">Code</div>
        <svg slot="icon" fill="currentColor" slot viewBox="0 0 256 256">
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
        </svg>
      </c2-details>
    `
  }
  render() {
    const componentUID = this.configStore.value.uid
    if (!componentUID || !this.configStore.value.showConfig) return nothing
    return html`<div>
      <c2-details>
        <div slot="title" class="title">Host</div>
        <svg slot="icon" fill="currentColor" slot viewBox="0 0 256 256">
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
        </svg>

        <demo-size-config
          .width=${this.configStore.value.host?.w}
          .height=${this.configStore.value.host?.h}
          @change=${this.handleSizeConfigChange}
        ></demo-size-config>
      </c2-details>
      ${this.renderAttribues()} ${this.renderCssProperties()} ${this.renderCode()}
    </div>`
  }
}
