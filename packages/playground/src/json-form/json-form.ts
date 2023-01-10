import type { JSONSchema7Definition } from 'json-schema'
import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'

export interface JSONFormData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}
@customElement('json-form')
export class JsonForm extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }
    `,
  ]

  @property({ attribute: false, type: Object }) schema: JSONSchema7Definition = {}
  @property({ attribute: false, type: Object }) data: JSONFormData = {}

  override render() {
    return html``
  }
}
