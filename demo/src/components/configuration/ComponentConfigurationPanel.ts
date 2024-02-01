import { LitElement, html, css, nothing } from 'lit'
import { customElement } from 'lit/decorators.js'
import { StoreController } from '@nanostores/lit'

import { $configStore } from '../../store/config-store'
import './GenerateCodeBlock'

@customElement('demo-component-configuration-panel')
export class ComponentConfigurationPanel extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
      }
    `,
  ]

  private configStore = new StoreController(this, $configStore)

  renderGenerateCodeBlock(componentUID: string) {
    return html`<demo-generate-code-block .componentUID=${componentUID}></demo-generate-code-block>`
  }

  render() {
    const componentUID = this.configStore.value.targetUID
    return componentUID ? html`${this.renderGenerateCodeBlock(componentUID)}` : nothing
  }
}
