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
        justify-content: space-between;
      }
      .padding-wrapper {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 2px;
      }

      .padding-wrapper svg {
        width: 24px;
        height: 24px;
      }

      .padding-wrapper c2-text-field {
        width: 50px;

        --c2-text-field--padding-left: 0px;
        --c2-text-field--padding-right: 4px;
        --c2-text-field--padding-top: 4px;
        --c2-text-field--padding-bottom: 4px;
      }
      c2-text-field:hover {
        --c2-text-field--border-top: 1px solid rgb(213, 213, 213);
        --c2-text-field--border-right: 1px solid rgb(213, 213, 213);
        --c2-text-field--border-bottom: 1px solid rgb(213, 213, 213);
        --c2-text-field--border-left: 1px solid rgb(213, 213, 213);
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
      <div>${this.label}</div>
      <div class="padding-wrapper">
        <!-- top -->
        <c2-text-field id="0" .value=${this.paddingValues[0]} @change=${this.handlePaddingChange}>
          <svg viewBox="0 0 24 24" slot="prefix-icon">
            <path
              fill="#000"
              fill-opacity=".3"
              fill-rule="evenodd"
              stroke="none"
              d="M6 16.5V10h1v6.5c0 .276.224.5.5.5h9c.276 0 .5-.224.5-.5V10h1v6.5c0 .828-.672 1.5-1.5 1.5h-9c-.828 0-1.5-.672-1.5-1.5z"
            ></path>
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M6 6h12v1H6V6z"></path>
          </svg>
        </c2-text-field>

        <!-- right -->
        <c2-text-field id="1" .value=${this.paddingValues[1]} @change=${this.handlePaddingChange}>
          <svg viewBox="0 0 24 24" slot="prefix-icon">
            <path
              fill="#000"
              fill-opacity=".3"
              fill-rule="evenodd"
              stroke="none"
              d="M7.5 6H14v1H7.5c-.276 0-.5.224-.5.5v9c0 .276.224.5.5.5H14v1H7.5c-.828 0-1.5-.672-1.5-1.5v-9C6 6.672 6.672 6 7.5 6z"
            ></path>
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M18 6v12h-1V6h1z"></path>
          </svg>
        </c2-text-field>
        <!-- bottom -->
        <c2-text-field id="2" .value=${this.paddingValues[2]} @change=${this.handlePaddingChange}>
          <svg viewBox="0 0 24 24" slot="prefix-icon">
            <path
              fill="#000"
              fill-opacity=".3"
              fill-rule="evenodd"
              stroke="none"
              d="M18 7.5V14h-1V7.5c0-.276-.224-.5-.5-.5h-9c-.276 0-.5.224-.5.5V14H6V7.5C6 6.672 6.672 6 7.5 6h9c.828 0 1.5.672 1.5 1.5z"
            ></path>
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M18 18H6v-1h12v1z"></path>
          </svg>
        </c2-text-field>

        <!-- left -->
        <c2-text-field id="3" .value=${this.paddingValues[3]} @change=${this.handlePaddingChange}>
          <svg viewBox="0 0 24 24" slot="prefix-icon">
            <path
              fill="#000"
              fill-opacity=".3"
              fill-rule="evenodd"
              stroke="none"
              d="M16.5 18H10v-1h6.5c.276 0 .5-.224.5-.5v-9c0-.276-.224-.5-.5-.5H10V6h6.5c.828 0 1.5.672 1.5 1.5v9c0 .828-.672 1.5-1.5 1.5z"
            ></path>
            <path fill="#000" fill-opacity="1" fill-rule="evenodd" stroke="none" d="M6 18V6h1v12H6z"></path>
          </svg>
        </c2-text-field>
      </div>
    </div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-padding-config': PaddingConfig
  }
}
