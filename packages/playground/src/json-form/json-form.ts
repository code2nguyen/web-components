import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { ComponentInstanceState, FormState } from './form-state'
import type { FormConfig } from './form-config'
import type { Attribute, CustomElement } from 'custom-elements-manifest'
import { unsafeStatic } from 'lit/static-html.js'

@customElement('json-form')
export class JsonForm extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }
    `,
  ]

  @property({ attribute: false, type: Object }) config: FormConfig = { packages: [], layout: { tag: 'div', id: '' } }
  @property({ attribute: false, type: Object }) state: FormState = {}

  override render() {
    return html``
  }

  renderComponent(component: CustomElement, state: ComponentInstanceState): TemplateResult | null {
    const tag = component.tagName
    const attributes = component.attributes ?? []
    if (!tag) {
      return null
    }
    return html`${unsafeStatic(tag)} ${this.renderComponentAttribute(attributes, state)}> </${unsafeStatic(tag)}>`
  }

  renderComponentAttribute(attributes: Attribute[], state: ComponentInstanceState) {
    return attributes.map((attr) => {
      const type = attr.type?.text
      if (type === 'boolean') {
        return html`?${unsafeStatic(type)}=${state[type]}`
      } else if (type) {
        return html`${unsafeStatic(type)}=${state[type]}`
      }
      return null
    })
  }
}
