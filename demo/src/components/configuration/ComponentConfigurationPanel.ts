import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import { StoreController } from '@nanostores/lit'
import { classMap } from 'lit/directives/class-map.js'
import { $configStore } from '../../store/config-store.ts'
import './GenerateCodeBlock'
import type { Checkbox } from '@c2n/checkbox'

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
        font-size: 12px;
        --c2-details--border-bottom: 1px solid var(--border-color);
        --c2-details--border-top: none;
        --c2-details--border-left: none;
        --c2-details--border-right: none;

        --c2-details__header--padding-top: 16px;
        --c2-details__header--padding-right: 16px;
        --c2-details__header--padding-bottom: 16px;
        --c2-details__header--padding-left: 16px;
        --c2-details__header--flex-direction: row-reverse;
        --c2-details__header__icon--rotate: 90deg;
        --c2-details__header--gap: 8px;
        --c2-details__header__icon--width: 12px;
        --c2-details__header__icon--height: 12px;
        --c2-details__header__hover--background-color: transparent;

        --c2-text-field--font-size: 10px;
        --c2-text-field--padding-top: 6px;
        --c2-text-field--padding-bottom: 6px;

        --c2-checkbox__touchable--size: 24px;
        --c2-checkbox__state-layer--size: 32px;
        --c2-checkbox__container--height: 16px;
        --c2-checkbox__container--width: 16px;
        --c2-checkbox__state-layer__hover__selected--color: var(--logo-color-1);
        --c2-checkbox__state-layer__hover__unselected--color: var(--logo-color-1);

        --c2-select__button--font-size: 10px;
        --c2-select__button__suffix-icon--size: 12px;
        --c2-select__button__prefix-icon--size: 12px;

        --c2-select__button--padding: 8px 8px 8px 8px;
        --c2-select__button__hover--background: transparent;
        --c2-select__button--background: transparent;
        --c2-list-item--font-size: 10px;

        --c2-select__button--border-top: 1px solid transparent;
        --c2-select__button--border-right: 1px solid transparent;
        --c2-select__button--border-bottom: 1px solid transparent;
        --c2-select__button--border-left: 1px solid transparent;

        --c2-text-field--background: transparent;
        --c2-text-field--border-top: 1px solid transparent;
        --c2-text-field--border-right: 1px solid transparent;
        --c2-text-field--border-bottom: 1px solid transparent;
        --c2-text-field--border-left: 1px solid transparent;

        --c2-text-field__focus--border-top: 1px solid var(--logo-color-1);
        --c2-text-field__focus--border-right: 1px solid var(--logo-color-1);
        --c2-text-field__focus--border-bottom: 1px solid var(--logo-color-1);
        --c2-text-field__focus--border-left: 1px solid var(--logo-color-1);

        --c2-icon-button__icon--size: 12px;
        --c2-icon-button__state-layer--size: 24px;
        --c2-tabs__tab--padding: 16px;
        --c2-tabs__indicator--height: 2px;
        --c2-tabs--box-shadow: inset 0px -2px 0px 0px rgb(230 230 230);
        --c2-tabs__indicator--color: var(--logo-color-1);
      }

      c2-text-field:hover {
        --c2-text-field--border-top: 1px solid var(--border-color-default);
        --c2-text-field--border-right: 1px solid var(--border-color-default);
        --c2-text-field--border-bottom: 1px solid var(--border-color-default);
        --c2-text-field--border-left: 1px solid var(--border-color-default);
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

      .config-content-group {
        display: flex;
        flex-direction: column;
      }

      .config-content-group > .row {
        border-bottom: 1px solid var(--border-color);
        padding: 12px 16px 12px 20px;
      }

      .config-content-group-css {
        padding-top: 4px;
        padding-bottom: 4px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0px 8px 0px 12px;
      }
      .title {
        font-weight: 500;
      }
      c2-label {
        font-weight: 300;
      }
      .property-name {
      }
      .header {
        position: relative;
      }
      .close-button {
        position: absolute;
        top: 11px;
        right: 8px;
      }
      #component-select {
        width: 160px;
      }
      .level-1 {
        --c2-list-item--padding-left: 16px;
      }
    `,
  ]

  private configStore = new StoreController(this, $configStore)

  private renderGenerateCodeBlock(componentUID: string) {
    return html`<demo-generate-code-block .componentUID=${componentUID}></demo-generate-code-block>`
  }

  private handleSizeConfigChange(event: CustomEvent) {
    console.log(event)
    $configStore.setKey('host', event.detail)
  }

  private generateBooleanInput(label: string, name: string, value: string) {
    return html` <div class="row">
      <c2-label class="property-name" for=${name}>${label}</c2-label>
      <c2-checkbox @change=${this.handleCheckboxChange} id=${name} ?checked=${value !== 'false'}></c2-checked>
    </div>`
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
            ? this.getValueOrDefaultValue(paddingVariables[0])
            : paddingVariables.map((i) => this.getValueOrDefaultValue(i))}
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
            ? this.getValueOrDefaultValue(borderRadiusVariables[0])
            : borderRadiusVariables.map((i) => this.getValueOrDefaultValue(i))}
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
          .values=${fontVariables.map((i) => this.getValueOrDefaultValue(i))}
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
      <c2-text-field .placeholder=${label} class=${classMap(classes)} @change=${this.handleTextInputChange} id=${name} .value=${value}></c2-text-field>
    </div>`
  }

  private handleCheckboxChange(event: Event) {
    const target = event.target as Checkbox

    if (!$configStore.value) return
    const updatedValue: UpdateValue = {
      name: target.id,
      value: target.checked ? 'true' : 'false',
    }
    this.updateStore(updatedValue)
  }

  private handleTextInputChange(event: Event) {
    const target = event.target as HTMLElement & { value: string }
    if (!$configStore.value) return
    const updatedValue: UpdateValue = {
      name: target.id,
      value: target.value,
    }
    this.updateStore(updatedValue)
  }

  private handleCustomConfigChange(event: CustomEvent) {
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

    const updateCssProperties = $configStore.value.allCssProperties.find((item) => item.cssVariable == updateValue.name)
    if (updateCssProperties) {
      updateCssProperties.value = updateValue.value
      $configStore.setKey('allCssProperties', [...$configStore.value.allCssProperties])
      return
    }
  }

  private generateAttributeInput(attr: AttributeDeclarationItem) {
    const value = this.getValueOrDefaultValue(attr)

    switch (attr.type) {
      case 'boolean':
        return this.generateBooleanInput(attr.name, attr.name, value)
      default:
        return this.generateStringInput(attr.name, attr.name, value, attr.type)
    }
  }

  private getValueOrDefaultValue(item: CSSDeclarationItem | AttributeDeclarationItem) {
    return item.value !== undefined ? item.value : item.default ?? (item.type == 'boolean' ? 'false' : '')
  }

  private generateCssVariableInput(cssDeclaration: CSSDeclarationItem) {
    const value = this.getValueOrDefaultValue(cssDeclaration)
    switch (cssDeclaration.type) {
      case 'pixel':
        return this.generateStringInput(cssDeclaration.property, cssDeclaration.cssVariable, value, cssDeclaration.type)
      case 'color':
        return this.generateColorConfig(cssDeclaration.property, cssDeclaration.cssVariable, value)
      case 'border':
        return this.generateBorderConfig(cssDeclaration.property, cssDeclaration.cssVariable, value)
      default:
        return this.generateStringInput(cssDeclaration.property, cssDeclaration.cssVariable, value, cssDeclaration.type)
    }
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

  private handleCssComponentChange(event: Event & { target: Select }) {
    $configStore.setKey('cssComponentTag', event.target.value[0])
  }

  private renderCssProperties() {
    const componentManifest = this.configStore.value
    const cssComponentTag = this.configStore.value.cssComponentTag
    const cssProperties = componentManifest.allCssProperties.filter((item) => {
      return item.cssVariable.startsWith(`--${cssComponentTag}--`) || item.cssVariable.startsWith(`--${cssComponentTag}__`)
    })
    const groupedCssVariables = flatGroupCssProperties(groupCssProperties(cssProperties))
    return html`<div class="config-content-group">
      <div class="row">
        <c2-label for="component-select">Component</c2-label>
        <c2-select id="component-select" value=${cssComponentTag} required @selection-change=${this.handleCssComponentChange}>
          <c2-list-item value=${componentManifest.tagName} class="level-0">${componentManifest.tagName}</c2-list-item>
          ${componentManifest.internalComponents.map((tag) => {
            return html`<c2-list-item value=${tag} class="level-1">${tag}</c2-list-item>`
          })}
          ${componentManifest.slotComponents.map((tag) => {
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

  private renderAttribues() {
    return this.configStore.value.attributes.length > 0
      ? html` <div class="config-content-group">
          ${this.configStore.value.attributes.map((attr) => {
            return this.generateAttributeInput(attr)
          })}
        </div>`
      : nothing
  }

  private renderCode() {
    return html`
      <c2-details>
        <div slot="title" class="title">Code</div>
        <svg slot="icon" fill="currentColor" slot viewBox="0 0 256 256">
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
        </svg>
      </c2-details>
    `
  }

  private handleCloseClick() {
    $configStore.setKey('showConfig', false)
    $configStore.setKey('uid', '')
  }

  render() {
    const componentUID = this.configStore.value.uid
    if (!componentUID || !this.configStore.value.showConfig) return nothing
    return html`<div>
      <div class="header">
        <c2-tabs selected-tab="CSS">
          <c2-tab label="CSS" for="CSS"></c2-tab>
          <c2-tab label="Attributes" for="Attributes"></c2-tab>
          <c2-tab label="Children" for="Children"></c2-tab>
          <c2-tab label="Code" for="Code"></c2-tab>
          <div id="CSS">${this.renderCssProperties()}</div>
          <div id="Attributes">${this.renderAttribues()}</div>
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
