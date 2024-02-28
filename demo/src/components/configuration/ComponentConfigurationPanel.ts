import { LitElement, html, css, nothing } from 'lit'
import { customElement } from 'lit/decorators.js'
import { StoreController } from '@nanostores/lit'

import { $configStore } from '../../store/config-store'
import './GenerateCodeBlock'
import * as changeCase from 'change-case'
import type { Checkbox } from '@c2n/checkbox'

import '@c2n/details'
import '@c2n/label'
import '@c2n/checkbox'
import '@c2n/text-field'
import './SizeConfig'
import type { ManifestDeclarationItem } from '../../store/manifest-declaration-item'

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
        font-size: 0.8rem;
        // --c2-details-padding-top: 0px;
        --c2-details-border-top: none;
        --c2-details-hover-title-bg-color: transparent;
      }

      c2-details:not(.sub-details):first-of-type {
        --c2-details-border-radius: 8px 8px 0px 0px;
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

  generateBooleanInput(name: string, value: string) {
    return html` <div class="row">
      <c2-label for=${name}>${this.getSettingName(name)}</c2-label>
      <c2-checkbox @change=${this.handleCheckboxChange} id=${name} ?checked=${value !== 'false'}></c2-checked>
    </div>`
  }

  generateStringInput(name: string, value: string) {
    return html` <div class="row">
      <c2-label for=${name}>${this.getSettingName(name)}</c2-label>
      <c2-text-field @change=${this.handleTextInputChange} id=${name} .value=${value}></c2-text-field>
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

  private updateStore(updateValue: UpdateValue) {
    if (!$configStore.value) return
    const updateAttribute = $configStore.value.attributes.find((item) => item.name == updateValue.name)
    if (updateAttribute) {
      updateAttribute.value = updateValue.value
      $configStore.setKey('attributes', [...$configStore.value.attributes])
      return
    }

    const updateCssProperties = $configStore.value.cssProperties.find((item) => item.name == updateValue.name)
    if (updateCssProperties) {
      updateCssProperties.value = updateValue.value
      $configStore.setKey('cssProperties', [...$configStore.value.cssProperties])
      return
    }

    for (const state of Object.keys($configStore.value.stateCssProperties)) {
      const cssProperties = $configStore.value!.stateCssProperties![state]
      const updateCssProperties = cssProperties.find((item) => item.name == updateValue.name)
      if (updateCssProperties) {
        updateCssProperties.value = updateValue.value
        $configStore.setKey('stateCssProperties', { ...$configStore.value.stateCssProperties })
        return
      }
    }
  }

  private getSettingName(name: string) {
    const tagName = $configStore.value?.tagName ?? ''
    const states = this.configStore.value.stateCssProperties ? Object.keys(this.configStore.value.stateCssProperties) : []
    let settingName = name.replace(`--${tagName}`, '')
    states.forEach((state) => {
      settingName = settingName.replace(`-${changeCase.paramCase(state)}`, '')
    })
    return changeCase.capitalCase(settingName)
  }

  generateConfigItem(setting: ManifestDeclarationItem) {
    switch (setting.type?.text) {
      case 'boolean':
        return this.generateBooleanInput(setting.name, setting.value !== undefined ? setting.value : setting.default ?? 'false')
      default:
        return this.generateStringInput(setting.name, setting.value !== undefined ? setting.value : setting.default ?? '')
    }
  }

  renderCssProperties() {
    return this.configStore.value.cssProperties.length > 0
      ? html`<c2-details>
          <div slot="title" class="title">Css Variables</div>
          ${this.configStore.value.cssProperties.map((cssVariable) => {
            return this.generateConfigItem(cssVariable)
          })}
        </c2-details>`
      : nothing
  }

  renderStateCssProperties() {
    return this.configStore.value.stateCssProperties
      ? html`${Object.keys(this.configStore.value.stateCssProperties).map((state) => {
          return html` <c2-details>
            <div slot="title" class="title">${state} state</div>
            ${this.configStore.value.stateCssProperties![state]!.map((cssVariable) => {
              return this.generateConfigItem(cssVariable)
            })}
          </c2-details>`
        })} `
      : nothing
  }

  renderAttribues() {
    return this.configStore.value.attributes.length > 0
      ? html`<c2-details>
          <div slot="title" class="title">Attribute</div>
          ${this.configStore.value.attributes.map((attr) => {
            return this.generateConfigItem(attr)
          })}
        </c2-details>`
      : nothing
  }

  renderCode() {
    return html`
      <c2-details>
        <div slot="title" class="title">Code</div>
      </c2-details>
    `
  }
  render() {
    const componentUID = this.configStore.value.uid
    if (!componentUID || !this.configStore.value.showConfig) return nothing
    return html`<div>
      <c2-details>
        <div slot="title" class="title">Host</div>
        <demo-size-config
          .width=${this.configStore.value.host?.w}
          .height=${this.configStore.value.host?.h}
          @change=${this.handleSizeConfigChange}
        ></demo-size-config>
      </c2-details>
      ${this.renderAttribues()} ${this.renderCssProperties()} ${this.renderStateCssProperties()} ${this.renderCode()}
    </div>`
  }
}
