import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import '@c2n/text-field'

@customElement('demo-border-radius-config')
export class BorderRadiusConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
      }

      .border-radius-config {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0px 8px;
      }

      .border-radius-wrapper {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .label {
        padding-left: 4px;
        font-weight: 300;
      }

      .border-radius-wrapper svg {
        width: 8px;
        height: 8px;
        padding: 0 8px;
      }

      .border-radius-wrapper c2-text-field {
        width: 60px;

        --c2-text-field--padding-left: 0px;
        --c2-text-field--padding-right: 4px;
        --c2-text-field--padding-top: 4px;
        --c2-text-field--padding-bottom: 4px;
      }

      c2-text-field:hover {
        --c2-text-field--border-top: 1px solid var(--border-color-default);
        --c2-text-field--border-right: 1px solid var(--border-color-default);
        --c2-text-field--border-bottom: 1px solid var(--border-color-default);
        --c2-text-field--border-left: 1px solid var(--border-color-default);
      }
    `,
  ]

  @property() label: string = 'border-radius'

  @property({ attribute: false }) name: string | string[] = ''

  private _value: string | string[] | undefined = ''

  public get value(): string | string[] | undefined {
    return this._value
  }

  @property({ attribute: false })
  public set value(value: string | string[] | undefined) {
    this._value = value
    if (value == undefined) {
      this.radiusValues = [0, 0, 0, 0]
      return
    }
    let arrValues = typeof value == 'string' ? value.split(' ').map((item) => item.trim()) : value
    if (arrValues.length == 1) {
      arrValues = [arrValues[0] ?? 0, arrValues[0] ?? 0, arrValues[0] ?? 0, arrValues[0] ?? 0]
    } else if (arrValues.length == 0) {
      arrValues = ['0', '0', '0', '0']
    }
    this.radiusValues = arrValues.map((item) => {
      item = item ? item.replace('px', '') : ''
      return isNaN(Number(item)) ? 0 : Number(item)
    })
  }

  @state() radiusValues: number[] = [0, 0, 0, 0]

  private handleRadiusChange(event: InputEvent) {
    const value = Number((event.target as HTMLInputElement).value)
    const index = Number((event.target as HTMLInputElement).id)
    this.radiusValues[index] = value
    this.dispathChangeEvent()
  }

  private dispathChangeEvent() {
    let detail: Record<string, string> = {}
    if (Array.isArray(this.name)) {
      detail = this.name.reduce(
        (result, item, index) => {
          result[item] = `${this.radiusValues[index]}px`
          return result
        },
        {} as Record<string, string>,
      )
    } else {
      detail = {
        [this.name]: this.radiusValues.join('px ') + 'px',
      }
    }
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        cancelable: true,
        detail,
      }),
    )
  }

  render() {
    return html`<div class="border-radius-config">
      <!-- <div class="label">${this.label}</div> -->
      <div class="border-radius-wrapper">
        <!-- top -->
        <c2-text-field id="0" .value=${this.radiusValues[0]} @input=${this.handleRadiusChange}>
          <svg slot="prefix-icon" viewBox="0 0 8 8">
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M0 4.5C0 2.015 2.015 0 4.5 0H8v1H4.5C2.567 1 1 2.567 1 4.5V8H0V4.5z"></path>
          </svg>
        </c2-text-field>

        <!-- right -->
        <c2-text-field id="1" .value=${this.radiusValues[1]} @input=${this.handleRadiusChange}>
          <svg slot="prefix-icon" viewBox="0 0 8 8">
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M8 4.5C8 2.015 5.985 0 3.5 0H0v1h3.5C5.433 1 7 2.567 7 4.5V8h1V4.5z"></path>
          </svg>
        </c2-text-field>
        <!-- bottom -->
        <c2-text-field id="2" .value=${this.radiusValues[2]} @input=${this.handleRadiusChange}>
          <svg slot="prefix-icon" viewBox="0 0 8 8">
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M8 3.5C8 5.985 5.985 8 3.5 8H0V7h3.5C5.433 7 7 5.433 7 3.5V0h1v3.5z"></path>
          </svg>
        </c2-text-field>

        <!-- left -->
        <c2-text-field id="3" .value=${this.radiusValues[3]} @input=${this.handleRadiusChange}>
          <svg slot="prefix-icon" viewBox="0 0 8 8">
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M0 3.5C0 5.985 2.015 8 4.5 8H8V7H4.5C2.567 7 1 5.433 1 3.5V0H0v3.5z"></path>
          </svg>
        </c2-text-field>
      </div>
    </div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-border-radius-config': BorderRadiusConfig
  }
}
