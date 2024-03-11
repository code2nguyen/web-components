import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import '@c2n/text-field'
import './ColorConfig.ts'
import type { TextField } from '@c2n/text-field'

@customElement('demo-border-config')
export class ColorConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        --c2-text-field__svg-icon--size: 18px;
      }

      .border-config {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .border-wrapper {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .size-input {
        width: 50px;
        --c2-text-field--padding-left: 0px;
      }
      .prefix-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
      }
      c2-text-field:hover {
        --c2-text-field--border-top: 1px solid rgb(213, 213, 213);
        --c2-text-field--border-right: 1px solid rgb(213, 213, 213);
        --c2-text-field--border-bottom: 1px solid rgb(213, 213, 213);
        --c2-text-field--border-left: 1px solid rgb(213, 213, 213);
      }
    `,
  ]
  @property() label: string = 'border'
  @property({ attribute: false }) name: string = ''

  private _value: string = ''

  public get value(): string {
    return this._value
  }

  @property({ attribute: false })
  public set value(value: string) {
    this._value = value
    this.extractBorderValue()
  }

  @state() size = 0
  @state() color = 'transparent'

  private dispathChangeEvent() {
    let detail: Record<string, string> = {}
    detail = {
      [this.name]: `${this.size}px solid ${this.color || 'transparent'}`,
    }

    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        cancelable: true,
        detail,
      }),
    )
  }

  private extractBorderValue() {
    const values = this.value.split(' ')
    if (values.length == 3) {
      this.size = Number(values[0].replace('px', ''))
      this.color = values[2]
    } else {
      this.size = 0
      this.color = 'transparent'
    }
  }

  private handleSizeInputChange(event: Event & { target: TextField }) {
    this.size = Number(event.target.value)
    this.dispathChangeEvent()
  }

  private handleColorConfigChange(event: CustomEvent<Record<string, string>>) {
    this.color = event.detail.color
    this.dispathChangeEvent()
  }

  render() {
    return html`<div class="border-config">
        <div>${this.label}</div>
        <div class="border-wrapper"> 
          <c2-text-field class="size-input" .value=${this.size} @change=${this.handleSizeInputChange}>
            <div class="prefix-icon" slot="prefix-icon">
              <svg width="10" height="10"  viewBox="0 0 12 12">
                <path fill="currentColor" fill-opacity="1" fill-rule="nonzero" stroke="none" d="M0 0h12v1H0V0zm0 4h12v2H0V4zm12 5H0v3h12V9z"></path>
              </svg>
            </div>
          </c2-text-field>
          <demo-color-config .label=${''} .value=${this.color} .name=${'color'} @change=${this.handleColorConfigChange}></demo-color-config>
        </div>
      </div>
    </div>`
  }
}
