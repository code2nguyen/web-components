import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './color-area.scss?inline'
import { TinyColor } from '@ctrl/tinycolor'

export interface Point {
  x: number
  y: number
}

/**
 * @tag c2-color-area
 *
 * @event {CustomEvent} change
 * @cssproperty {pixel} [--c2-color-area--width=240px]
 * @cssproperty {pixel} [--c2-color-area--height=240px]
 * @cssproperty {pixel} [--c2-color-area__color-handle--size=12px]
 */
@customElement('c2-color-area')
export class ColorArea extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Number }) hue = 0
  @property({ type: Number }) saturation = 1
  @property({ type: Number }) value = 1

  public get tinyColor(): TinyColor {
    return new TinyColor({ h: this.hue, s: this.saturation, v: this.value })
  }

  @query('.color-handle', true) colorHandle?: HTMLElement
  @query('.c2-color-area', true) rootElement?: HTMLElement

  currentMousePosition: Point = { x: 0, y: 0 }

  private rootElementsRect?: DOMRect
  private colorHandleRect?: DOMRect

  convertPositionToHslValues(position: Point) {
    if (!this.rootElement) {
      return
    }
    if (!this.rootElementsRect) {
      this.rootElementsRect = this.rootElement.getBoundingClientRect()
    }
    this.saturation = position.x / this.rootElementsRect.width
    this.value = 1 - position.y / this.rootElementsRect.height
  }

  private convertValueToPosition() {
    if (!this.rootElementsRect) {
      this.rootElementsRect = this.rootElement!.getBoundingClientRect()
    }
    this.currentMousePosition = {
      x: this.saturation * this.rootElementsRect.width,
      y: (1 - this.value) * this.rootElementsRect.height,
    }
  }

  private handleAreaPointerdown(event: PointerEvent): void {
    if (event.button !== 0) {
      return
    }
    this.rootElementsRect = this.rootElement!.getBoundingClientRect()
    this.colorHandleRect = this.colorHandle!.getBoundingClientRect()
    this.currentMousePosition = this.getPointerPosition(event)
    this.convertPositionToHslValues(this.currentMousePosition)

    document.addEventListener('pointermove', this.handleMouseMove, { passive: true })
    document.addEventListener('pointerup', this.handleMouseUp, { passive: true })
    document.addEventListener('pointercancel', this.handleMouseUp)

    this.dispatchChangeColor()
  }

  handleMouseMove = async (event: PointerEvent) => {
    this.currentMousePosition = this.getPointerPosition(event)
    this.convertPositionToHslValues(this.currentMousePosition)
    this.dispatchChangeColor()
  }

  getPointerPosition(event: PointerEvent) {
    let x = event.clientX - this.rootElementsRect!.left
    let y = event.clientY - this.rootElementsRect!.top
    x = Math.max(0, Math.min(x, this.rootElementsRect!.width))
    y = Math.max(0, Math.min(y, this.rootElementsRect!.height))
    return { x, y }
  }

  handleMouseUp = () => {
    document.removeEventListener('pointermove', this.handleMouseMove)
    document.removeEventListener('pointerup', this.handleMouseUp)
    document.removeEventListener('pointercancel', this.handleMouseUp)
    this.rootElementsRect = undefined
  }

  private updateColorHandlePosition() {
    if (!this.colorHandle) return
    if (!this.colorHandleRect) {
      this.colorHandleRect = this.colorHandle.getBoundingClientRect()
    }
    const handleWidth = this.colorHandleRect.width
    const handleHeight = this.colorHandleRect.height
    let x = this.currentMousePosition.x - handleWidth / 2
    let y = this.currentMousePosition.y - handleHeight / 2
    x = Math.max(0, Math.min(x, this.rootElementsRect!.width - handleWidth))
    y = Math.max(0, Math.min(y, this.rootElementsRect!.height - handleHeight))
    this.colorHandle.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0)`)
    this.colorHandle.style.setProperty('background-color', this.tinyColor.toRgbString())
  }

  protected override updated(_changedProperties: PropertyValueMap<this>): void {
    super.updated(_changedProperties)
    this.convertValueToPosition()
    this.updateColorHandlePosition()
  }

  dispatchChangeColor() {
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        cancelable: true,
        detail: {
          h: this.hue,
          s: this.saturation,
          v: this.value,
        },
      }),
    )
  }
  override render() {
    return html`<div class="c2-color-area">
      <div
        @pointerdown=${this.handleAreaPointerdown}
        class="gradient"
        style="background:
                    linear-gradient(to top, black 0%, hsla(${this.hue}, 100%, 0.01%, 0) 100%),
                    linear-gradient(to right, white 0%, hsla(${this.hue}, 100%, 0.01%, 0) 100%), hsl(${this.hue}, 100%, 50%);"
      ></div>
      <div class="color-handle"></div>
    </div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-color-area': ColorArea
  }
}
