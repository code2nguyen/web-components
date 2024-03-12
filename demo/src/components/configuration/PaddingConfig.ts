import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import '@c2n/text-field'

@customElement('demo-padding-config')
export class PaddingConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
      }

      .padding-config {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 0px 8px;
      }

      .padding-config svg {
        width: 12px;
        height: 12px;
        padding-left: 6px;
        padding-right: 6px;
      }

      .padding-config c2-text-field {
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
      .label {
        padding-left: 4px;
        font-weight: 300;
      }
    `,
  ]

  @property() label: string = 'padding'

  @property({ attribute: false }) name: string | string[] = ''

  private _value: string | string[] | undefined = ''

  public get value(): string | string[] | undefined {
    return this._value
  }

  @property({ attribute: false })
  public set value(value: string | string[] | undefined) {
    this._value = value
    if (value == undefined) {
      this.paddingValues = [0, 0, 0, 0]
      return
    }
    let arrValues = typeof value == 'string' ? value.split(' ').map((item) => item.trim()) : value
    if (arrValues.length == 1) {
      arrValues = [arrValues[0] ?? 0, arrValues[0] ?? 0, arrValues[0] ?? 0, arrValues[0] ?? 0]
    } else if (arrValues.length == 0) {
      arrValues = ['0', '0', '0', '0']
    }
    this.paddingValues = arrValues.map((item) => {
      item = item ? item.replace('px', '') : ''
      return Number(item)
    })
  }

  @state() paddingValues: number[] = [0, 0, 0, 0]

  handlePaddingChange(event: InputEvent) {
    const value = Number((event.target as HTMLInputElement).value)
    const index = Number((event.target as HTMLInputElement).id)
    this.paddingValues[index] = value
    this.dispathChangeEvent()
  }

  dispathChangeEvent() {
    let detail: Record<string, string> = {}
    if (Array.isArray(this.name)) {
      detail = this.name.reduce(
        (result, item, index) => {
          result[item] = `${this.paddingValues[index]}px`
          return result
        },
        {} as Record<string, string>,
      )
    } else {
      detail = {
        [this.name]: this.paddingValues.join('px ') + 'px',
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
    return html`<div class="padding-config">
      <!-- top -->
      <c2-text-field id="0" .value=${this.paddingValues[0]} @change=${this.handlePaddingChange}>
        <svg slot="prefix-icon" viewBox="0 0 12 12" fill="none">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M2 2L10 2L10 3L2 3L2 2Z" fill="black" />
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M12 2C12 0.895431 11.1046 -3.91405e-08 10 -8.74228e-08L2 -4.37114e-07C0.895431 -4.85396e-07 -3.91405e-08 0.89543 -8.74228e-08 2L-4.37114e-07 10C-4.85396e-07 11.1046 0.89543 12 2 12L10 12C11.1046 12 12 11.1046 12 10L12 2ZM11 3C11 1.89543 10.1046 1 9 1L3 1C1.89543 1 1 1.89543 1 3L1 9C1 10.1046 1.89543 11 3 11L9 11C10.1046 11 11 10.1046 11 9L11 3Z"
            fill="black"
            fill-opacity="0.5"
          />
        </svg>
      </c2-text-field>

      <!-- right -->
      <c2-text-field id="1" .value=${this.paddingValues[1]} @change=${this.handlePaddingChange}>
        <svg slot="prefix-icon" viewBox="0 0 12 12" fill="none">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M10 2L10 10L9 10L9 2L10 2Z" fill="black" />
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M10 12C11.1046 12 12 11.1046 12 10L12 2C12 0.895431 11.1046 -7.8281e-08 10 -1.74846e-07L2 -8.74228e-07C0.895432 -9.70792e-07 9.70792e-07 0.89543 8.74228e-07 2L1.74846e-07 10C7.8281e-08 11.1046 0.895431 12 2 12L10 12ZM9 11C10.1046 11 11 10.1046 11 9L11 3C11 1.89543 10.1046 1 9 1L3 0.999999C1.89543 0.999999 1 1.89543 1 3L1 9C1 10.1046 1.89543 11 3 11L9 11Z"
            fill="black"
            fill-opacity="0.5"
          />
        </svg>
      </c2-text-field>
      <!-- bottom -->
      <c2-text-field id="2" .value=${this.paddingValues[2]} @change=${this.handlePaddingChange}>
        <svg slot="prefix-icon" viewBox="0 0 12 12" fill="none">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M10 10L2 10L2 9L10 9L10 10Z" fill="black" />
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M-8.74228e-08 10C-3.91405e-08 11.1046 0.895431 12 2 12L10 12C11.1046 12 12 11.1046 12 10L12 2C12 0.89543 11.1046 -4.85396e-07 10 -4.37114e-07L2 -8.74228e-08C0.89543 -3.91405e-08 -4.85396e-07 0.895431 -4.37114e-07 2L-8.74228e-08 10ZM1 9C1 10.1046 1.89543 11 3 11L9 11C10.1046 11 11 10.1046 11 9L11 3C11 1.89543 10.1046 1 9 1L3 1C1.89543 1 1 1.89543 1 3L1 9Z"
            fill="black"
            fill-opacity="0.5"
          />
        </svg>
      </c2-text-field>

      <!-- left -->
      <c2-text-field id="3" .value=${this.paddingValues[3]} @change=${this.handlePaddingChange}>
        <svg slot="prefix-icon" viewBox="0 0 12 12" fill="none">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M2 10V2H3V10H2Z" fill="black" />
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M2 0C0.895431 0 0 0.895431 0 2V10C0 11.1046 0.895431 12 2 12H10C11.1046 12 12 11.1046 12 10V2C12 0.895431 11.1046 0 10 0H2ZM3 1C1.89543 1 1 1.89543 1 3V9C1 10.1046 1.89543 11 3 11H9C10.1046 11 11 10.1046 11 9V3C11 1.89543 10.1046 1 9 1H3Z"
            fill="black"
            fill-opacity="0.3"
          />
        </svg>
      </c2-text-field>
    </div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-padding-config': PaddingConfig
  }
}
