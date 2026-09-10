import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import '@c2n/text-field'
import '@c2n/select'
import '@c2n/list-item'
import '@c2n/slider'
import type { TextField } from '@c2n/text-field'
import type { Slider } from '@c2n/slider'
import type { SelectionChangeEventDetail } from '@c2n/list'
import { LENGTH_UNITS, TIME_UNITS, formatLength, parseLength, roundTo } from '../../utils/css-value.ts'

export type LengthVariant = 'length' | 'unitless' | 'time' | 'opacity'

/**
 * Numeric control for every `pixel` / `number` / `time` / `opacity` style property.
 *
 * Two things the old shared text field could not do: keep a non-px unit (a `rem` or `%` value used to be parsed with
 * `Number(v.replace('px',''))` and written back as `NaNpx`) and offer the unit at all. `opacity` additionally gets a
 * slider, since 0-1 is unusable as free text.
 */
@customElement('demo-length-config')
export class LengthConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .length {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        min-width: 0;
      }
      c2-text-field {
        flex: none;
        width: 66px;
        --c2-text-field--font-family: var(--site-font-mono);
        --c2-text-field--font-size: 11.5px;
        --c2-text-field--padding-left: 8px;
        --c2-text-field--padding-right: 4px;
      }
      c2-text-field.raw {
        flex: 1;
        width: auto;
      }
      c2-select {
        flex: none;
        width: 62px;
        --c2-select__button--font-size: 11.5px;
        --c2-select__button--padding: 4px 2px 4px 8px;
      }
      c2-slider {
        flex: 1;
        min-width: 48px;
        --c2-slider__container--height: 22px;
        --c2-slider__track--height: 3px;
        --c2-slider__thumb--size: 12px;
        --c2-slider__thumb--border: 2px solid var(--site-color-primary);
        --c2-slider__fill--color: var(--site-color-primary);
      }
    `,
  ]

  @property({ attribute: false }) name = ''
  @property() variant: LengthVariant = 'length'

  @property({ attribute: false })
  set value(value: string) {
    this._value = (value ?? '').trim()
  }
  get value(): string {
    return this._value
  }
  @state() private _value = ''

  private get units(): readonly string[] {
    if (this.variant === 'time') return TIME_UNITS
    return LENGTH_UNITS
  }

  private emit(value: string) {
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: true, detail: { [this.name]: value } }))
  }

  private handleNumberInput(event: Event & { target: TextField }) {
    const raw = event.target.value.trim()
    if (!raw) return
    const typed = parseLength(raw)
    if (!typed) {
      // `calc(…)`, `auto`, `var(…)`: pass it through instead of coercing it to a number.
      this.emit(raw)
      return
    }
    const current = parseLength(this._value)
    const unit = typed.unit || current?.unit || this.defaultUnit()
    this.emit(formatLength({ value: typed.value, unit: this.variant === 'unitless' ? '' : unit }))
  }

  private defaultUnit(): string {
    if (this.variant === 'time') return 'ms'
    if (this.variant === 'unitless' || this.variant === 'opacity') return ''
    return 'px'
  }

  private handleUnitChange(event: CustomEvent<SelectionChangeEventDetail>) {
    const unit = event.detail.value[0] ?? ''
    const current = parseLength(this._value)
    this.emit(formatLength({ value: current?.value ?? 0, unit }))
  }

  private handleSliderInput(event: Event & { target: Slider }) {
    this.emit(String(roundTo(event.target.value / 100, 2)))
  }

  private renderOpacity(current: ReturnType<typeof parseLength>) {
    // A `%` opacity is legal CSS; normalise both spellings onto the 0-100 slider.
    const ratio = current ? (current.unit === '%' ? current.value : current.value * 100) : 100
    return html`
      <c2-slider
        min="0"
        max="100"
        step="1"
        aria-label="Opacity"
        .value=${Math.max(0, Math.min(100, Math.round(ratio)))}
        @input=${this.handleSliderInput}
      ></c2-slider>
      <c2-text-field spellcheck="false" .value=${this._value} @input=${this.handleNumberInput}></c2-text-field>
    `
  }

  render() {
    const current = parseLength(this._value)
    if (this.variant === 'opacity') {
      return html`<div class="length">${this.renderOpacity(current)}</div>`
    }
    if (!current) {
      // Not a plain number: edit the value as text so `calc()`, `auto` and `var()` survive.
      return html`<div class="length">
        <c2-text-field class="raw" spellcheck="false" placeholder="auto" .value=${this._value} @input=${this.handleNumberInput}></c2-text-field>
      </div>`
    }
    const showUnits = this.variant !== 'unitless'
    return html`<div class="length">
      <c2-text-field spellcheck="false" .value=${String(current.value)} @input=${this.handleNumberInput}></c2-text-field>
      ${
        showUnits
          ? html`<c2-select .value=${[current.unit]} required @selection-change=${this.handleUnitChange}>
              ${this.units.map((unit) => html`<c2-list-item value=${unit}>${unit || '—'}</c2-list-item>`)}
            </c2-select>`
          : ''
      }
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-length-config': LengthConfig
  }
}
