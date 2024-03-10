import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './color-slider.scss?inline'
import { redispatchEvent } from '@c2n/wc-utils/dom-helper.js'

/**
 * @tag c2-color-slider
 *
 * @event {CustomEvent} input
 *
 * @cssproperty {border-radius} [--c2-color-slider--border-radius=8px]
 * @cssproperty {pixel} [--c2-color-slider--width=160px]
 * @cssproperty {pixel} [--c2-color-slider--height=12px]
 * @cssproperty {pixel} [--c2-color-slider__color-handle--size=12px]
 *
 */
@customElement('c2-color-slider')
export class ColorSlider extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Number }) value: number = 0

  @query('.color-handle') colorHandle!: HTMLElement
  @query('.input-slider') inputSlider!: HTMLElement

  private handleInput(event: Event & { target: HTMLInputElement }): void {
    this.value = event.target.valueAsNumber
    redispatchEvent(this, event)
  }

  private updateColorHandlePosition() {
    const handleWidth = this.colorHandle.offsetWidth
    let position = (this.inputSlider.offsetWidth / 360) * this.value
    const delta = handleWidth / (this.inputSlider.offsetWidth / position)
    position = position - delta
    position = Math.max(0, position)
    position = Math.min(position, this.inputSlider.offsetWidth - handleWidth)
    this.colorHandle.style.setProperty('transform', `translate(${position}px, -50%)`)
  }

  protected override updated(_changedProperties: PropertyValueMap<this>): void {
    super.updated(_changedProperties)
    if (_changedProperties.has('value')) {
      this.updateColorHandlePosition()
    }
  }

  override render() {
    return html`
      <div class="c2-color-slider">
        <input type="range" class="input-slider" min="0" max="360" step="1" .value=${String(this.value)} @input=${this.handleInput} />
        <div class="gradient"></div>
        <div class="color-handle"></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-color-slider': ColorSlider
  }
}
