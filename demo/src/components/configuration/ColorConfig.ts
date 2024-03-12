import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { TinyColor } from '@ctrl/tinycolor'
import type { ColorSelectChangeEventDetail } from '@c2n/color-select'

import '@c2n/text-field'
import '@c2n/color-select'
import '@c2n/checkbox'
import type { Checkbox } from '@c2n/checkbox'
import type { TextField } from '@c2n/text-field'

@customElement('demo-color-config')
export class ColorConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        --c2-color-select--width: 14px;
        --c2-color-select--height: 14px;

        --c2-checkbox__uncheckmark--color: var(--primary-text-color);
        --c2-checkbox__checkmark--color: var(--primary-text-color);
        --c2-checkbox__container--border: none;
        --c2-checkbox__container__selected--color: transparent;
        --c2-checkbox__touchable--size: 16px;
        --c2-checkbox__container--height: 16px;
        --c2-checkbox__checkmark--size: 16px;
        --c2-checkbox__uncheckmark--size: 16px;

        --c2-text-field--border-top: 1px solid transparent;
        --c2-text-field--border-right: 1px solid transparent;
        --c2-text-field--border-bottom: 1px solid transparent;
        --c2-text-field--border-left: 1px solid transparent;

        --c2-text-field__focus--border-top: 1px solid rgb(2, 101, 220);
        --c2-text-field__focus--border-right: 1px solid rgb(2, 101, 220);
        --c2-text-field__focus--border-bottom: 1px solid rgb(2, 101, 220);
        --c2-text-field__focus--border-left: 1px solid rgb(2, 101, 220);
      }

      .color-config {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        padding: 0px 8px;
      }

      .color-wrapper {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .color-input-group {
        display: flex;
        align-items: center;
        position: relative;
      }
      .color-input-group.disabled {
        --c2-text-field--color: #b3b3b3;
      }

      .color-input-group:hover {
        --c2-text-field--border-top: 1px solid var(--border-color-default);
        --c2-text-field--border-right: 1px solid var(--border-color-default);
        --c2-text-field--border-bottom: 1px solid var(--border-color-default);
        --c2-text-field--border-left: 1px solid var(--border-color-default);
      }
      .color-select {
        position: absolute;
        top: 50%;
        left: 8px;
        transform: translateY(-50%);
        z-index: 1;
      }

      .color-input-group > .color-input {
        --c2-text-field--padding-left: 24px;
        width: 90px;
      }
      .color-input-group > .alpha-input {
        width: 55px;
      }

      c2-text-field + c2-text-field {
        --c2-text-field--border-top-left-radius: 0px;
        --c2-text-field--border-bottom-left-radius: 0px;
      }
      c2-text-field:has(+ c2-text-field) {
        --c2-text-field--border-right: none;
        --c2-text-field__focus--border-right: none;
        --c2-text-field--border-top-right-radius: 0px;
        --c2-text-field--border-bottom-right-radius: 0px;
      }
      c2-text-field.focus-within + c2-text-field {
        --c2-text-field--border-left: var(--c2-text-field__focus--border-left, 1px solid #{variables.$color-blue});
      }
      .label {
        padding-left: 4px;
        font-weight: 300;
      }
    `,
  ]
  @property() label: string = 'color'
  @property({ attribute: false }) name: string = ''

  private _value: string = ''

  public get value(): string {
    return this._value
  }

  @property({ attribute: false })
  public set value(value: string) {
    this._value = value
    this.extractHsvaFromColor()
  }

  @state() show = true
  @state() h = 0
  @state() s = 1
  @state() v = 0
  @state() a = 1

  public get tinyColor(): TinyColor {
    return new TinyColor({ h: this.h, s: this.s, v: this.v, a: this.a })
  }

  private dispathChangeEvent() {
    let detail: Record<string, string> = {}
    if (this.show) {
      const tinyColor = this.tinyColor
      detail = {
        [this.name]: tinyColor.toRgbString(),
      }
    } else {
      detail = {
        [this.name]: '',
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

  private handleColorSelectChange(event: CustomEvent<ColorSelectChangeEventDetail>) {
    this.h = event.detail.h
    this.s = event.detail.s
    this.v = event.detail.v
    this.a = event.detail.a
    this.show = true
    this.dispathChangeEvent()
  }

  private extractHsvaFromColor() {
    const tinyColor = new TinyColor(this.value)
    if (tinyColor.isValid) {
      const { h, s, v, a } = tinyColor.toHsv()
      this.h = h
      this.s = s
      this.v = v
      this.a = a
    } else {
      this.show = false
    }
  }
  handleShowOptionChange(event: Event) {
    this.show = (event.target as Checkbox).checked
    this.dispathChangeEvent()
  }

  handleColorInputChange(event: Event & { target: TextField }) {
    const value = event.target.value
    const tinyColor = new TinyColor(value)
    if (tinyColor.isValid) {
      const { h, s, v, a } = tinyColor.toHsv()
      this.h = h
      this.s = s
      this.v = v
      this.a = a
      this.dispathChangeEvent()
      this.show = true
    }
  }

  handleAlphaInputChange(event: Event & { target: TextField }) {
    const value = Number(event.target.value.replace('%', ''))
    if (value >= 0 && value <= 100) {
      this.a = value / 100
      this.dispathChangeEvent()
      this.show = true
    }
  }

  render() {
    return html`<div class="color-config">
        ${this.label ? html`<div class="label">${this.label}</div>` : nothing}
        <div class="color-wrapper"> 
          <div class="color-input-group ${!this.show ? 'disabled' : ''}" >         
            <c2-color-select class="color-select" placement="bottom-end" .hue=${this.h} .saturation=${this.s} .value=${this.v} .alpha=${this.a} @change=${this.handleColorSelectChange}> </c2-color-select>
            <c2-text-field class="color-input" .value=${this.tinyColor.isValid ? this.tinyColor.toHexString() : this.value} @change=${this.handleColorInputChange}></c2-text-field>
            <c2-text-field class="alpha-input" .value=${this.a * 100 + '%'} @change=${this.handleAlphaInputChange}></c2-text-field>
          </div>
          <c2-checkbox class="show-option" .checked=${this.show} @change=${this.handleShowOptionChange}>
            <svg slot="checkmark" fill="currentColor" fill="#000000" viewBox="0 0 256 256"><path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"></path></svg>
            <svg slot="uncheckmark" fill="currentColor" width="16" height="16" fill="#000000" viewBox="0 0 256 256"><path d="M228,175a8,8,0,0,1-10.92-3l-19-33.2A123.23,123.23,0,0,1,162,155.46l5.87,35.22a8,8,0,0,1-6.58,9.21A8.4,8.4,0,0,1,160,200a8,8,0,0,1-7.88-6.69l-5.77-34.58a133.06,133.06,0,0,1-36.68,0l-5.77,34.58A8,8,0,0,1,96,200a8.4,8.4,0,0,1-1.32-.11,8,8,0,0,1-6.58-9.21L94,155.46a123.23,123.23,0,0,1-36.06-16.69L39,172A8,8,0,1,1,25.06,164l20-35a153.47,153.47,0,0,1-19.3-20A8,8,0,1,1,38.22,99c16.6,20.54,45.64,45,89.78,45s73.18-24.49,89.78-45A8,8,0,1,1,230.22,109a153.47,153.47,0,0,1-19.3,20l20,35A8,8,0,0,1,228,175Z"></path></svg>
          </c2-checkbox>
        </div>
      </div>
    </div>`
  }
}
