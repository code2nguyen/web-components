import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { ComponentCode } from '../../model/component-metadata'
import { $configCodeStore } from '../../store/config-code-store'

@customElement('demo-generate-code-block')
export class GenerateCodeBLock extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
      }
    `,
  ]

  private _componentUID = ''
  @property() set componentUID(value: string) {
    this._componentUID = value
    this.code = $configCodeStore.get()[this._componentUID].code
    this.lang = $configCodeStore.get()[this._componentUID].lang
  }

  get componentUID() {
    return this._componentUID
  }

  @state() code = ''
  @state() lang = ''

  render() {
    return html`${this.code}`
  }
}
