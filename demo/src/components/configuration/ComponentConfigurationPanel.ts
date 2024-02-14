import { LitElement, html, css, nothing } from 'lit'
import { customElement } from 'lit/decorators.js'
import { StoreController } from '@nanostores/lit'

import { $configStore } from '../../store/config-store'
import './GenerateCodeBlock'

import '@c2n/details'
import './SizeConfig'

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

      c2-details:first-of-type {
        --c2-details-border-radius: 8px 8px 0px 0px;
      }
    `,
  ]

  private configStore = new StoreController(this, $configStore)

  renderGenerateCodeBlock(componentUID: string) {
    return html`<demo-generate-code-block .componentUID=${componentUID}></demo-generate-code-block>`
  }

  render() {
    const componentUID = this.configStore.value.targetUID
    if (!componentUID) return nothing

    return html`<div>
      <c2-details expanded>
        <div slot="title">Host</div>

        <demo-size-config></demo-size-config>
      </c2-details>

      <c2-details>
        <div slot="title">Attribute</div>
      </c2-details>
      <c2-details>
        <div slot="title">Css Variables</div>
      </c2-details>
    </div>`
  }
}
