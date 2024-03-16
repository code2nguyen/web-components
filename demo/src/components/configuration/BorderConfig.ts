import { LitElement, html, css, svg } from 'lit'
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
        flex-direction: column;
        gap: 4px;
        padding: 0px 8px;
      }

      .border-wrapper {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .label {
        padding-left: 4px;
        font-weight: 300;
      }

      .size-input {
        width: 60px;
        --c2-text-field--padding-left: 0px;
      }

      .prefix-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
      }

      c2-text-field:hover {
        --c2-text-field--border-top: 1px solid var(--border-color-default);
        --c2-text-field--border-right: 1px solid var(--border-color-default);
        --c2-text-field--border-bottom: 1px solid var(--border-color-default);
        --c2-text-field--border-left: 1px solid var(--border-color-default);
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
    const values = this.value.replace(/\s*,\s/g, ',').split(' ')
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

  private generateBorderIcon() {
    if (this.label.endsWith('top')) {
      return svg`<svg viewBox="0 0 24 24" slot="prefix-icon">
                <path
                  fill="#000"
                  fill-opacity=".3"
                  fill-rule="evenodd"
                  stroke="none"
                  d="M6 16.5V10h1v6.5c0 .276.224.5.5.5h9c.276 0 .5-.224.5-.5V10h1v6.5c0 .828-.672 1.5-1.5 1.5h-9c-.828 0-1.5-.672-1.5-1.5z"
                ></path>
                <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M6 6h12v1H6V6z"></path>
              </svg>`
    }
    if (this.label.endsWith('right')) {
      return svg`<svg viewBox="0 0 24 24" slot="prefix-icon">
            <path
              fill="#000"
              fill-opacity=".3"
              fill-rule="evenodd"
              stroke="none"
              d="M7.5 6H14v1H7.5c-.276 0-.5.224-.5.5v9c0 .276.224.5.5.5H14v1H7.5c-.828 0-1.5-.672-1.5-1.5v-9C6 6.672 6.672 6 7.5 6z"
            ></path>
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M18 6v12h-1V6h1z"></path>
          </svg>`
    }
    if (this.label.endsWith('bottom')) {
      return svg`<svg viewBox="0 0 24 24" slot="prefix-icon">
            <path
              fill="#000"
              fill-opacity=".3"
              fill-rule="evenodd"
              stroke="none"
              d="M18 7.5V14h-1V7.5c0-.276-.224-.5-.5-.5h-9c-.276 0-.5.224-.5.5V14H6V7.5C6 6.672 6.672 6 7.5 6h9c.828 0 1.5.672 1.5 1.5z"
            ></path>
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M18 18H6v-1h12v1z"></path>
          </svg>`
    }

    return svg`<svg viewBox="0 0 24 24" slot="prefix-icon">
            <path
              fill="#000"
              fill-opacity=".3"
              fill-rule="evenodd"
              stroke="none"
              d="M16.5 18H10v-1h6.5c.276 0 .5-.224.5-.5v-9c0-.276-.224-.5-.5-.5H10V6h6.5c.828 0 1.5.672 1.5 1.5v9c0 .828-.672 1.5-1.5 1.5z"
            ></path>
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M6 18V6h1v12H6z"></path>
          </svg>`
  }
  render() {
    return html`<div class="border-config">
        <!-- <div class="label">${this.label}</div> -->
        <div class="border-wrapper"> 
          <c2-text-field class="size-input" .value=${this.size} @change=${this.handleSizeInputChange}>
            <div class="prefix-icon" slot="prefix-icon">
              ${this.generateBorderIcon()}
            </div>
          </c2-text-field>
          <demo-color-config .label=${''} .value=${this.color} .name=${'color'} @change=${this.handleColorConfigChange}></demo-color-config>
        </div>
      </div>
    </div>`
  }
}
