import { LitElement, html, css, nothing, svg } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import '@c2n/select'
import '@c2n/text-field'
import { FONT_PROPERTY } from '../../utils/dom.ts'

@customElement('demo-font-config')
export class FontConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
      }
      .font-config {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0px 8px;
        flex-wrap: wrap;
        align-content: center;

        --c2-select__button--font-size: 10px;
        --c2-select__default-icon--size: 12px;
        --c2-select__button--padding: 8px 8px 8px 8px;
        --c2-select__button__hover--background: transparent;
        --c2-select__button--background: transparent;
        --c2-list-item--font-size: 10px;

        --c2-select__button--border-top: 1px solid transparent;
        --c2-select__button--border-right: 1px solid transparent;
        --c2-select__button--border-bottom: 1px solid transparent;
        --c2-select__button--border-left: 1px solid transparent;
      }

      .typo-icon {
        padding-top: 6px;
        padding-left: 7px;
      }

      #font-family {
        width: 215px;
      }
      #font-size {
        width: 80px;
      }
      #font-style {
        width: 110px;
      }
      #font-weight {
        width: 95px;
      }

      .font-anonymous-pro {
        font-family: 'Anonymous Pro', monospace;
      }
      .font-caveat {
        font-family: 'Caveat Variable', cursive;
      }
      .font-crimson-text {
        font-family: 'Crimson Text', serif;
      }
      .font-ibm-plex-mono {
        font-family: 'IBM Plex Mono', monospace;
      }
      .font-inter {
        font-family: 'Inter Variable', sans-serif;
      }
      .font-pacifico {
        font-family: 'Pacifico', cursive;
      }
      .font-playfair-display {
        font-family: 'Playfair Display Variable', serif;
      }
      .font-roboto {
        font-family: 'Roboto', sans-serif;
      }
      .font-roboto-mono {
        font-family: 'Roboto Mono Variable', monospace;
      }
      .font-source-serif-pro {
        font-family: 'Source Serif Pro', serif;
      }
    `,
  ]

  private _names: string[] = []
  public get names(): string[] {
    return this._names
  }

  @property({ attribute: false })
  public set names(value: string[]) {
    this._names = value

    this.fontPropertyNames = value.map((cssVariableName) => {
      const fontProperty = FONT_PROPERTY.find((item) => cssVariableName.includes(item)) ?? ''
      return fontProperty
    })
  }
  @property({ attribute: false }) values: string[] = []

  @state()
  private fontPropertyNames: string[] = []

  private handleSelectionChange(event: CustomEvent) {
    const selectEl = event.target as HTMLElement
    const value = event.detail.value.length > 0 ? event.detail.value[0] : null
    if (selectEl.id == 'font-family') {
      if (value) {
        selectEl.style.setProperty('--c2-select__button--font-family', value)
      } else {
        selectEl.style.removeProperty('--c2-select__button--font-family')
      }
    }
    const valueIndex = this.fontPropertyNames.indexOf(selectEl.id)
    this.values[valueIndex] = value
    this.dispathChangeEvent()
  }

  dispathChangeEvent() {
    const detail: Record<string, string> = this.fontPropertyNames.reduce(
      (result, name, index) => {
        const cssVariableName = this.names[index]
        result[cssVariableName] = this.values[index]
        return result
      },
      {} as Record<string, string>,
    )
    console.log(detail)
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        cancelable: true,
        detail,
      }),
    )
  }

  private renderTypoIcon() {
    return svg`<svg class="typo-icon" width="12" height="14" viewBox="0 0 18 20" fill="none">
<path d="M8 20V14H10V16H18V18H10V20H8ZM0 18V16H6V18H0ZM3.425 12H5.5L6.6 8.925H11.425L12.5 12H14.575L10.075 0H7.925L3.425 12ZM7.2 7.2L8.95 2.225H9.05L10.8 7.2H7.2Z" fill="currentColor" fill-opacity="0.8"/>
</svg>
`
  }

  render() {
    return html`<div class="font-config">
      <div>${this.renderTypoIcon()}</div>
      ${this.fontPropertyNames.includes('font-family')
        ? html`<c2-select id="font-family" placeholder="font-family" @selection-change=${this.handleSelectionChange}>
            <c2-list-item value="Anonymous Pro" class="font-anonymous-pro">Anonymous Pro</c2-list-item>
            <c2-list-item value="Caveat Variable" class="font-caveat">Caveat</c2-list-item>
            <c2-list-item value="Crimson Text" class="font-crimson-text">Crimson Text</c2-list-item>
            <c2-list-item value="IMB Plex Mono" class="font-ibm-plex-mono">IBM Plex Mono</c2-list-item>
            <c2-list-item value="Inter Variable" class="font-inter">Inter</c2-list-item>
            <c2-list-item value="Pacifico" class="font-pacifico">Pacifico</c2-list-item>
            <c2-list-item value="Playfair Display Variable" class="font-playfair-display">Playfair Display</c2-list-item>
            <c2-list-item value="Roboto" class="font-roboto">Roboto</c2-list-item>
            <c2-list-item value="Roboto Mono Variable" class="font-roboto-mono">Roboto Mono</c2-list-item>
            <c2-list-item value="Source Serif Pro" class="font-source-serif-pro ">Source Serif Pro</c2-list-item>
          </c2-select>`
        : nothing}
      ${this.fontPropertyNames.includes('font-size')
        ? html`<c2-select
            .value=${[this.values[this.fontPropertyNames.indexOf('font-size')]]}
            id="font-size"
            placeholder="font-size"
            @selection-change=${this.handleSelectionChange}
          >
            <c2-list-item value="10px">10</c2-list-item>
            <c2-list-item value="11px">11</c2-list-item>
            <c2-list-item value="12px">12</c2-list-item>
            <c2-list-item value="13px">13</c2-list-item>
            <c2-list-item value="14px">14</c2-list-item>
            <c2-list-item value="16px">16</c2-list-item>
            <c2-list-item value="20px">20</c2-list-item>
            <c2-list-item value="24px">24</c2-list-item>
            <c2-list-item value="32px">32</c2-list-item>
            <c2-list-item value="36px">36</c2-list-item>
            <c2-list-item value="40px">40</c2-list-item>
            <c2-list-item value="48px">48</c2-list-item>
            <c2-list-item value="64px">64</c2-list-item>
            <c2-list-item value="96px">96</c2-list-item>
            <c2-list-item value="128px">128</c2-list-item>
          </c2-select>`
        : nothing}
      ${this.fontPropertyNames.includes('font-style')
        ? html`<c2-select id="font-style" placeholder="font-style" @selection-change=${this.handleSelectionChange}>
            <c2-list-item value="normal">Normal</c2-list-item>
            <c2-list-item value="italic">Italic</c2-list-item>
            <c2-list-item value="oblique 10deg">Oblique 10deg</c2-list-item>
            <c2-list-item value="oblique 15deg">Oblique 15deg</c2-list-item>
            <c2-list-item value="oblique 20deg">Oblique 20deg</c2-list-item>
            <c2-list-item value="oblique 30deg">Oblique 30deg</c2-list-item>
            <c2-list-item value="oblique 40deg">Oblique 40deg</c2-list-item>
            <c2-list-item value="oblique 45deg">Oblique 45deg</c2-list-item>
            <c2-list-item value="oblique 50deg">Oblique 50deg</c2-list-item>
            <c2-list-item value="oblique 60deg">Oblique 60deg</c2-list-item>
            <c2-list-item value="oblique 70deg">Oblique 70deg</c2-list-item>
          </c2-select>`
        : nothing}
      ${this.fontPropertyNames.includes('font-weight')
        ? html`<c2-select id="font-weight" placeholder="font-weight" @selection-change=${this.handleSelectionChange}>
            <c2-list-item value="normal">Normal</c2-list-item>
            <c2-list-item value="bold">Bold</c2-list-item>
            <c2-list-item value="lighter">Lighter</c2-list-item>
            <c2-list-item value="bolder">Bolder</c2-list-item>
            <c2-list-item value="100">100</c2-list-item>
            <c2-list-item value="300">300</c2-list-item>
            <c2-list-item value="400">400</c2-list-item>
            <c2-list-item value="500">500</c2-list-item>
            <c2-list-item value="600">600</c2-list-item>
            <c2-list-item value="700">700</c2-list-item>
            <c2-list-item value="900">900</c2-list-item>
          </c2-select>`
        : nothing}
    </div>`
  }
}
