import { LitElement, html, nothing, unsafeCSS, type PropertyValueMap } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './color-slider.scss?inline'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import { TinyColor } from '@ctrl/tinycolor'
/**
 * @tag c2-color-slider
 *
 * @event {CustomEvent} input
 *
 *
 * @cssproperty {border-radius} [--c2-color-slider--border-radius=8px]
 *
 * @cssproperty {border-radius} [--c2-color-slider--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-color-slider--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-color-slider--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-color-slider--border-bottom-right-radius=8px]
 *
 * @cssproperty {border} [--c2-color-slider--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-slider--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-slider--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-color-slider--borde-leftr=1px solid rgb(177, 177, 177)]
 *
 * @cssproperty {pixel} [--c2-color-slider--width=160px]
 * @cssproperty {pixel} [--c2-color-slider--height=12px]
 *
 * @cssproperty {pixel} [--c2-color-slider__color-handle--width=12px]
 * @cssproperty {pixel} [--c2-color-slider__color-handle--height=12px]
 * @cssproperty {border-radius} [--c2-color-slider__color-handle--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-color-slider__color-handle--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-color-slider__color-handle--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-color-slider__color-handle--border-bottom-right-radius=6px]
 *
 * @cssproperty {color} --c2-color-slider__color-handle--background-color
 *
 */
@customElement('c2-color-slider')
export class ColorSlider extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Number, reflect: true }) value: number = 0
  @property({ type: Number, reflect: true }) min: number = 0
  @property({ type: Number, reflect: true }) max: number = 360

  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  @query('.color-handle') colorHandle!: HTMLElement
  @query('.input-slider') inputSlider!: HTMLElement

  private colorHandleRect?: DOMRect
  private inputSliderRect?: DOMRect
  private resizeObserver?: ResizeObserver

  constructor() {
    super()
    if (!isServer) {
      this.resizeObserver = new ResizeObserver(() => {
        this.colorHandleRect = undefined
        this.inputSliderRect = undefined
        this.updateColorHandlePosition()
      })
    }
  }
  private handleInput(event: Event & { target: HTMLInputElement }): void {
    this.value = event.target.valueAsNumber
    redispatchEvent(this, event)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.resizeObserver?.observe(this)
  }

  override disconnectedCallback(): void {
    this.resizeObserver?.unobserve(this)
    super.disconnectedCallback()
  }

  private updateColorHandlePosition() {
    if (!this.colorHandleRect) {
      this.colorHandleRect = this.colorHandle.getBoundingClientRect()
    }
    if (!this.inputSliderRect) {
      this.inputSliderRect = this.inputSlider.getBoundingClientRect()
    }
    const handleWidth = this.colorHandleRect.width
    const range = this.max - this.min
    const fraction = range > 0 ? Math.min(1, Math.max(0, (this.value - this.min) / range)) : 0
    let position = (this.inputSliderRect.width - handleWidth) * fraction
    position = Math.max(0, position)
    position = Math.min(position, this.inputSliderRect.width - handleWidth)
    this.colorHandle.style.setProperty('transform', `translate(${position}px, -50%)`)
  }

  protected override updated(_changedProperties: PropertyValueMap<this>): void {
    super.updated(_changedProperties)
    if (_changedProperties.has('value')) {
      this.updateColorHandlePosition()
    }
  }

  override render() {
    const tinyColor = new TinyColor({ h: this.value, s: 1, v: 1, a: 1 })
    return html`
      <div class="c2-color-slider">
        <input
          aria-label=${this.ariaLabel || nothing}
          type="range"
          class="input-slider"
          min=${this.min}
          max=${this.max}
          step="1"
          .value=${String(this.value)}
          @input=${this.handleInput}
        />
        <div class="gradient">
          <slot></slot>
        </div>
        <div class="color-handle" style="background-color: var(--c2-color-slider__color-handle--background-color, ${tinyColor.toHexString()});"></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-color-slider': ColorSlider
  }
}
