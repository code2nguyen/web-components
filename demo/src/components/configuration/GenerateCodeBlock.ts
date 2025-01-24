import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { $configCodeStore } from '../../store/config-code-store.ts'
import { getInitialStyles } from '../../utils/dom.ts'
import { $configStore } from '../../store/config-store.ts'
import { StoreController } from '@nanostores/lit'

import '@c2n/code-viewer'

@customElement('demo-generate-code-block')
export class GenerateCodeBLock extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
      }
      .code-viewer {
        padding: 8px 16px;
      }
      .code-viewer {
        --c2-code-viewer--background-color: transparent;
      }
    `,
  ]

  private _componentUID = ''
  @property() set componentUID(value: string) {
    this._componentUID = value
    this.code = $configCodeStore.get()[this._componentUID]?.code
    this.lang = $configCodeStore.get()[this._componentUID]?.lang
  }

  get componentUID() {
    return this._componentUID
  }

  private configStore = new StoreController(this, $configStore)

  @state() code = ''
  @state() lang = ''

  generateCssCode() {
    const initialStyles = getInitialStyles(this.componentUID)
    const newCssProperties = this.configStore.value.configs
      .get(this.componentUID)
      ?.allCssProperties.filter((cssVariable) => {
        return initialStyles[cssVariable.cssVariable] !== cssVariable.value && cssVariable.value
      })
      .map((item) => `${item.cssVariable}: ${item.value}`)
    return newCssProperties && newCssProperties.length > 0 ? `:host {\n${newCssProperties.join(';\n') + ';'}\n}` : ''
  }

  render() {
    return html`<c2-code-viewer class="code-viewer" .code=${this.generateCssCode()} langage="css" wrap></c2-code-viewer>`
  }
}
