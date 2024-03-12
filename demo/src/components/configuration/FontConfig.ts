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
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        padding: 0px 8px;
      }

      .font-icon {
        padding-right: 4px;
      }

      #font-family {
        grid-column: 1 / -1;
      }
      #font-size {
      }
      #font-style {
      }
      #font-weight {
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

  private renderFontFamilyIcon() {
    return svg`<svg class="font-icon" slot="button-prefix-icon" width="17" height="12" viewBox="0 0 17 12" fill="none">
<path fill-rule="evenodd" clip-rule="evenodd" d="M0.982225 9.72104L5.25944 0L9.53662 9.72104H8.38747L6.92182 6.39007H3.59703L2.13138 9.72104H0.982225ZM5.25941 2.61187L4.05985 5.33819H6.45896L5.25941 2.61187ZM14.2005 4.46163V4.90398C13.7199 4.51802 13.1103 4.28632 12.4473 4.28632C10.9006 4.28632 9.64231 5.54466 9.64231 7.09133C9.64231 8.63801 10.9007 9.89634 12.4473 9.89634C13.1103 9.89634 13.7199 9.66465 14.2005 9.27869V9.72104H15.2523V4.46163H14.2005ZM12.4473 8.84447C11.4806 8.84447 10.6942 8.058 10.6942 7.09133C10.6942 6.12461 11.4806 5.3382 12.4473 5.3382C13.414 5.3382 14.2004 6.12467 14.2004 7.09133C14.2005 8.05803 13.414 8.84447 12.4473 8.84447ZM16.1289 10.9481H0V12H16.1289V10.9481Z" fill="currentColor" fill-opacity="0.8"/>
</svg>
`
  }

  private renderFontSizeIcon() {
    return html` <svg width="12.46" height="12" class="font-icon" slot="button-prefix-icon" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2.56781L10.0741 0L8.14829 2.56781H9.43219V5.13561H8.14829L10.0741 7.70342L12 5.13561H10.7161V2.56781H12ZM3.85171 1.2839L0 11.5551H1.37185L2.57551 8.34537H6.66025L7.86391 11.5551H9.23576L5.38405 1.2839H3.85171ZM3.05633 7.06147L4.61756 2.89841L6.17878 7.06147H3.05633Z"
        fill="currentColor"
        fill-opacity="0.6"
      />
    </svg>`
  }

  private renderFontStyleIcon() {
    return html`<svg width="17" height="12" class="font-icon" slot="button-prefix-icon" viewBox="0 0 17 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M0 12L5.722 0L11.444 12H9.90664L7.94591 7.88814H3.49805L1.53732 12H0ZM5.72196 3.22419L4.11721 6.58966H7.32671L5.72196 3.22419Z"
        fill="currentColor"
        fill-opacity="0.6"
      />
      <path d="M12.9 0H14.1V2.4H16.5V3.6H14.1V6H12.9V3.6H10.5V2.4H12.9V0Z" fill="currentColor" fill-opacity="0.6" />
    </svg> `
  }

  private renderFontWeightIcon() {
    return html` <svg class="font-icon" slot="button-prefix-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 3L11 2V3H14V2L15 3L14 4V3H11V4L10 3Z" fill="currentColor" fill-opacity="0.6" />
      <path
        d="M10 3L9.64645 2.64645L9.29289 3L9.64645 3.35355L10 3ZM11 2H11.5V0.792893L10.6464 1.64645L11 2ZM14 2L14.3536 1.64645L13.5 0.792893V2H14ZM15 3L15.3536 3.35355L15.7071 3L15.3536 2.64645L15 3ZM14 4H13.5V5.20711L14.3536 4.35355L14 4ZM11 4L10.6464 4.35355L11.5 5.20711V4H11ZM10.3536 3.35355L11.3536 2.35355L10.6464 1.64645L9.64645 2.64645L10.3536 3.35355ZM10.5 2V3H11.5V2H10.5ZM11 3.5H14V2.5H11V3.5ZM14.5 3V2H13.5V3H14.5ZM13.6464 2.35355L14.6464 3.35355L15.3536 2.64645L14.3536 1.64645L13.6464 2.35355ZM14.6464 2.64645L13.6464 3.64645L14.3536 4.35355L15.3536 3.35355L14.6464 2.64645ZM14.5 4V3H13.5V4H14.5ZM10.5 3V4H11.5V3H10.5ZM11.3536 3.64645L10.3536 2.64645L9.64645 3.35355L10.6464 4.35355L11.3536 3.64645Z"
        fill="currentColor"
        fill-opacity="0.6"
      />
      <path
        d="M5.722 0L0 12H1.53732L3.49805 7.88814H7.94591L9.90664 12H11.444L5.722 0ZM4.11721 6.58966L5.72196 3.22419L7.32671 6.58966H4.11721Z"
        fill="currentColor"
        fill-opacity="0.6"
      />
    </svg>`
  }

  render() {
    return html`<div class="font-config">
      ${this.fontPropertyNames.includes('font-family')
        ? html`<c2-select id="font-family" placeholder="font-family" @selection-change=${this.handleSelectionChange}>
            ${this.renderFontFamilyIcon()}
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
            ${this.renderFontSizeIcon()}

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
            ${this.renderFontStyleIcon()}

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
            ${this.renderFontWeightIcon()}
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
