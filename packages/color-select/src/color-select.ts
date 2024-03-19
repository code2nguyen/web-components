import { LitElement, html, nothing, unsafeCSS } from 'lit'
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
import type { TextField } from '@c2n/text-field'

export interface ColorSelectChangeEventDetail {
  h: number
  s: number
  v: number
  a: number
}
/**
 * @tag c2-color-select
 *
 * @event {CustomEvent} change
 *
 * @cssproperty {pixel} [--c2-color-select--width=16px]
 * @cssproperty {pixel} [--c2-color-select--height=16px]
 * @cssproperty {border-radius} [--c2-color-select--border-top-left-radius=1px]
 * @cssproperty {border-radius} [--c2-color-select--border-top-right-radius=1px]
 * @cssproperty {border-radius} [--c2-color-select--border-bottom-left-radius=1px]
 * @cssproperty {border-radius} [--c2-color-select--border-bottom-right-radius=1px]
 *
 * @cssproperty {border} --c2-color-select--border-top
 * @cssproperty {border} --c2-color-select--border-right
 * @cssproperty {border} --c2-color-select--border-bottom
 * @cssproperty {border} --c2-color-select--border-left
 *
 * @cssproperty {color} [--c2-color-select__popover--background-color=rgb(255, 255, 255)]
 * @cssproperty {pixel} [--c2-color-select__popover--gap=16px]
 * @cssproperty {padding} [--c2-color-select__popover--padding-top=0px]
 * @cssproperty {padding} [--c2-color-select__popover--padding-left=8px]
 * @cssproperty {padding} [--c2-color-select__popover--padding-right=8px]
 * @cssproperty {padding} [--c2-color-select__popover--padding-bottom=8px]
 *
 * @cssproperty {border} [--c2-color-select__popover--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-select__popover--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-select__popover--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-select__popover--border-left=1px solid rgb(177, 177, 177)]
 *
 * @cssproperty {border-radius} [--c2-color-select__popover--border-top-left-radius=4px]
 * @cssproperty {border-radius} [--c2-color-select__popover--border-top-right-radius=4px]
 * @cssproperty {border-radius} [--c2-color-select__popover--border-bottom-left-radius=4px]
 * @cssproperty {border-radius} [--c2-color-select__popover--border-bottom-right-radius=4px]
 *
 * @cssproperty {border} [--c2-color-select__color__sample--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-select__color__sample--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-select__color__sample--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-select__color__sample--border-left=1px solid rgb(177, 177, 177)]
 *
 * @cssproperty {pixel} [--c2-color-select__color__sample--size=48px]
 * @cssproperty {border-radius} [--c2-color-select__color__sample--border-radius=4px]
 *
 * @internalcomponent c2-color-area
 * @internalcomponent c2-color-slider
 * @internalcomponent c2-select
 * @internalcomponent c2-text-field
 * @internalcomponent c2-overlay
 *
 */
@customElement('c2-color-select')
export class ColorSelect extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String, reflect: true }) placement = 'bottom-start'

  private _color: string = '#000000'
  public get color(): string {
    return this._color
  }

  @property({ reflect: true })
  public set color(value: string) {
    if (this._color != value) {
      this._color = value
      this.extractHsvaFromColor()
    }
  }

  @state() hue = 0
  @state() saturation = 0
  @state() value = 0
  @state() alpha = 1

  @state() inputType = 'HEX'
  @state() open = false

  @query('.color-area') colorArea!: ColorArea

  public get tinyColor(): TinyColor {
    return new TinyColor({ h: this.hue, s: this.saturation, v: this.value, a: this.alpha })
  }

  private renderInput() {
    if (this.inputType == 'HEX') {
      return html`<c2-text-field class="text-input" .value=${this.tinyColor.toHexString()} @change=${this.handleHexInputChange}></c2-text-field>
        <c2-text-field class="number-input" .value=${this.toPercentage(this.alpha, true)} @change=${this.handleAlphaInputChange}> </c2-text-field> `
    } else if (this.inputType == 'RGB') {
      const rgb = this.tinyColor.toRgb()
      return html`<c2-text-field class="number-input" id="r" .value=${rgb.r} @change=${this.handleRgbInputChange}></c2-text-field>
        <c2-text-field class="number-input" id="g" .value=${rgb.g} @change=${this.handleRgbInputChange}></c2-text-field>
        <c2-text-field class="number-input" id="b" .value=${rgb.b} @change=${this.handleRgbInputChange}></c2-text-field>
        <c2-text-field class="number-input" .value=${this.toPercentage(this.alpha, true)} @change=${this.handleAlphaInputChange}> </c2-text-field> `
    }
    return html`<c2-text-field class="number-input" .value=${Math.round(this.hue)} @change=${this.handleHueInputChange}></c2-text-field>
      <c2-text-field class="number-input" .value=${this.toPercentage(this.saturation)} @change=${this.handleSaturationInputChange}></c2-text-field>
      <c2-text-field class="number-input" .value="${this.toPercentage(this.value)}" @change=${this.handleLightnessInputChange}></c2-text-field>
      <c2-text-field class="number-input" .value=${this.toPercentage(this.alpha, true)} @change=${this.handleAlphaInputChange}></c2-text-field> `
  }

  private toPercentage(value: number, showSuffix: boolean = false) {
    return showSuffix ? `${Math.round(value * 100).toFixed()}%` : `${Math.round(value * 100).toFixed()}`
  }

  private handleRgbInputChange(event: Event & { target: TextField }) {
    const value = Number(event.target.value)
    const id = event.target.id as 'r' | 'g' | 'b'
    if (value >= 0 && value <= 255) {
      const rgb = this.tinyColor.toRgb()
      rgb[id] = value
      const { h, s, v } = new TinyColor(rgb).toHsv()
      this.hue = h
      this.saturation = s
      this.value = v
      this.dispatchChangeEvent()
    }
  }

  private updateColor() {
    this._color = this.tinyColor.toRgbString()
    this.setAttribute('color', this._color)
  }

  private handleHueInputChange(event: Event & { target: TextField }) {
    const value = Number(event.target.value)
    if (value >= 0 && value <= 360) {
      this.hue = value
      this.dispatchChangeEvent()
    }
  }

  private handleSaturationInputChange(event: Event & { target: TextField }) {
    const value = Number(event.target.value)
    if (value >= 0 && value <= 100) {
      this.saturation = value / 100
      this.dispatchChangeEvent()
    }
  }

  private handleLightnessInputChange(event: Event & { target: TextField }) {
    const value = Number(event.target.value)
    if (value >= 0 && value <= 100) {
      this.value = value / 100
      this.dispatchChangeEvent()
    }
  }

  private handleHexInputChange(event: Event & { target: TextField }) {
    const value = event.target.value
    const tinyColor = new TinyColor(value)
    if (tinyColor.isValid) {
      const { h, s, v } = tinyColor.toHsv()
      this.hue = h
      this.saturation = s
      this.value = v
      this.dispatchChangeEvent()
    }
  }

  private handleAlphaInputChange(event: Event & { target: TextField }) {
    const value = Number(event.target.value.replace('%', ''))
    if (!isNaN(value) && value >= 0 && value <= 100) {
      this.alpha = value / 100
      this.dispatchChangeEvent()
    }
  }

  private handleInputTypeChange(event: CustomEvent<SelectionChangeEventDetail>) {
    this.inputType = event.detail.value[0]
  }

  private handleHueSliderChange(event: InputEvent & { target: ColorSlider }) {
    this.hue = event.target.value
    this.dispatchChangeEvent()
  }

  private handleAlphaSliderChange(event: InputEvent & { target: ColorSlider }) {
    this.alpha = event.target.value / 100
    this.dispatchChangeEvent()
  }

  private extractHsvaFromColor() {
    const { h, s, v, a } = new TinyColor(this.color).toHsv()
    this.hue = h
    this.saturation = s
    this.value = v
    this.alpha = a
  }

  private handleColorAreaChange(event: CustomEvent & { detail: { h: number; s: number; v: number } }) {
    const { h, s, v } = event.detail
    this.hue = h
    this.saturation = s
    this.value = v
    this.dispatchChangeEvent()
  }

  private handleOverlayToggle(event: Event) {
    const toggleEvent = event as ToggleEvent
    this.open = toggleEvent.newState == 'open'
  }

  dispatchChangeEvent() {
    this.updateColor()
    this.dispatchEvent(
      new CustomEvent<ColorSelectChangeEventDetail>('change', {
        cancelable: true,
        bubbles: true,
        detail: {
          h: this.hue,
          s: this.saturation,
          v: this.value,
          a: this.alpha,
        },
      }),
    )
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
        <c2-overlay id="menu-overlay" disabled-cross-axis popover @toggle=${this.handleOverlayToggle} .placement=${this.placement}>
          ${this.open
            ? html` <div class="popover">
                <div class="popover-container">
                  <c2-color-area class="color-area" .hue=${this.hue} .saturation=${this.saturation} .value=${this.value} @change=${this.handleColorAreaChange}>
                  </c2-color-area>
                  <div class="color-area-placeholder"></div>
                  <div class="color-config">
                    <div class="color-sample" style="background-color: ${this.tinyColor.toRgbString()}"></div>
                    <c2-color-slider @input=${this.handleHueSliderChange} .value=${this.hue}></c2-color-slider>
                    <c2-color-slider class="alpha-input" @input=${this.handleAlphaSliderChange} min="0" max="100" .value=${this.alpha * 100}>
                      <div
                        style="background-image: url(data:image/svg+xml;utf8,%3Csvg%20width%3D%226%22%20height%3D%226%22%20viewBox%3D%220%200%206%206%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M0%200H3V3H0V0Z%22%20fill%3D%22%23E1E1E1%22/%3E%3Cpath%20d%3D%22M3%200H6V3H3V0Z%22%20fill%3D%22white%22/%3E%3Cpath%20d%3D%22M3%203H6V6H3V3Z%22%20fill%3D%22%23E1E1E1%22/%3E%3Cpath%20d%3D%22M0%203H3V6H0V3Z%22%20fill%3D%22white%22/%3E%3C/svg%3E%0A),
                                  linear-gradient(to right, rgba(255 255 255) 0%, ${colorWithOutAlpha.toRgbString()} 100%);
                              background-blend-mode: multiply;"
                      ></div>
                    </c2-color-slider>
                  </div>
                  <div class="color-input-container">
                    <c2-select value=${this.inputType} required @selection-change=${this.handleInputTypeChange}>
                      <c2-list-item value="HEX">HEX</c2-list-item>
                      <c2-list-item value="RGB">RGB</c2-list-item>
                      <c2-list-item value="HSL">HSL</c2-list-item>
                    </c2-select>
                    <div class="color-input-group">${this.renderInput()}</div>
                  </div>
                </div>
              </div>`
            : nothing}
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
