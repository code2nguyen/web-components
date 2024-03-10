import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { TinyColor } from '@ctrl/tinycolor'

import styles from './color-select.scss?inline'

import '@c2n/overlay'
import '@c2n/color-area'
import '@c2n/select'
import '@c2n/text-field'
import '@c2n/color-slider'
import type { SelectionChangeEventDetail } from '@c2n/list'
import type { ColorArea } from '@c2n/color-area'
import type { ColorSlider } from '@c2n/color-slider'
export const extractHsvaRegExp = /(\d{1,3}\.?\d*?)/

export const extractHueAndSaturationRegExp = /^hs[v|l]a?\s?\((\d{1,3}\.?\d*?),?\s?(\d{1,3})/
/**
 * @tag c2-color-select
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-color-select')
export class ColorSelect extends LitElement {
  static override styles = unsafeCSS(styles)

  private _color: string = 'hsla(0, 100%, 100%, 1)'
  public get color(): string {
    return this._color
  }

  @property()
  public set color(value: string) {
    this._color = value
    this.extractHsvaFromColor()
  }

  @state() hue = 0
  @state() saturation = 1
  @state() value = 1
  @state() alpha = 1

  @state() inputType = 'HEX'

  @query('.color-area') colorArea!: ColorArea

  public get tinyColor(): TinyColor {
    return new TinyColor({ h: this.hue, s: this.saturation, v: this.value })
  }

  private renderInput() {
    if (this.inputType == 'HEX') {
      return html`<c2-text-field class="text-input" .value=${this.tinyColor.toHexString()}></c2-text-field>
        <c2-text-field class="number-input" .value=${this.toPercentage(this.tinyColor.getAlpha(), true)}> </c2-text-field> `
    } else if (this.inputType == 'RGB') {
      const rgb = this.tinyColor.toRgb()
      return html`<c2-text-field class="number-input" .value=${rgb.r}></c2-text-field>
        <c2-text-field class="number-input" .value=${rgb.g}></c2-text-field>
        <c2-text-field class="number-input" .value=${rgb.b}></c2-text-field>
        <c2-text-field class="number-input" .value=${this.toPercentage(rgb.a, true)}> </c2-text-field> `
    }
    const hsl = this.tinyColor.toHsl()
    return html`<c2-text-field class="number-input" .value=${this.hue}></c2-text-field>
      <c2-text-field class="number-input" .value=${this.toPercentage(hsl.s)}></c2-text-field>
      <c2-text-field class="number-input" .value="${this.toPercentage(hsl.l)}"></c2-text-field>
      <c2-text-field class="number-input" .value=${this.toPercentage(hsl.a, true)}></c2-text-field> `
  }

  private toPercentage(value: number, showSuffix: boolean = false) {
    return showSuffix ? `${Math.round(value * 100).toFixed()}%` : `${Math.round(value * 100).toFixed()}`
  }
  private handleInputTypeChange(event: CustomEvent<SelectionChangeEventDetail>) {
    this.inputType = event.detail.value[0]
  }

  private handleHueInput(event: InputEvent & { target: ColorSlider }) {
    this.hue = event.target.value
  }

  private extractHsvaFromColor() {
    if (this.color.startsWith('hs')) {
      // const values = extractHueAndSaturationRegExp.exec(this.col as string)
    }
  }

  private handleColorAreaChange(event: CustomEvent & { detail: { h: number; s: number; v: number } }) {
    const { h, s, v } = event.detail
    this.hue = h
    this.saturation = s
    this.value = v
  }

  override render() {
    const colorWithOutAlpha = this.tinyColor.clone()
    colorWithOutAlpha.setAlpha(1)

    return html`
      <div class="c2-color-select">
        <button class="presentation" popovertarget="menu-overlay">
          <div class="presentation-color-background"></div>
          <div class="presentation-hue" style=${`background-color: ${colorWithOutAlpha.toHexString()}`}></div>
          <div class="presentation-color" style=${`background-color: ${this.tinyColor.toString('rgb')}`}></div>
        </button>
        <c2-overlay id="menu-overlay" popover>
          <div class="popover">
            <div class="popover-container">
              <c2-color-area 
                class="color-area" 
                .hue=${this.hue} 
                .saturation=${this.saturation} 
                .value=${this.value}
                @change=${this.handleColorAreaChange}>
              </c2-color-area>
              <div class="color-area-placeholder"></div>
              <div class="color-config">
                <div class="color-sample" style="background-color: ${this.tinyColor.toHexString()}"></div>
                <c2-color-slider @input=${this.handleHueInput}></c2-color-slider>
                <c2-color-slider></c2-color-slider>
              </div>

              <div class="color-input-container">
                <c2-select value=${this.inputType} required @selection-change=${this.handleInputTypeChange}>
                  <c2-list-item value="HEX">HEX</c2-list-item>
                  <c2-list-item value="RGB">RGB</c2-list-item>
                  <c2-list-item value="HSL">HSL</c2-list-item>
                </c2-select>
                <div class="color-input-group">
                ${this.renderInput()}
                <div>
              </div>
            </div>
          </div>
        </c2-overlay>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-color-select': ColorSelect
  }
}
