import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
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
  @property({ type: String }) color = '#FFFFFF'

  @query('.color-handle') colorHandle!: HTMLElement
  @query('.c2-color-area') rootElement!: HTMLElement

  @state()
  currentMousePosition: Point = { x: 0, y: 0 }

  get hexColor() {
    const s = this.currentMousePosition.x / this.rootElement.offsetWidth
    const v = 1 - this.currentMousePosition.y / this.rootElement.offsetHeight
    console.log({ h: this.hue, s, v })
    const tinyColor = new TinyColor({ h: this.hue, s, v })
    return tinyColor.toHexShortString()
  }

  private handleAreaPointerdown(event: PointerEvent): void {
    if (event.button !== 0) {
      return
    }
    this.currentMousePosition = this.getPointerPosition(event)
    document.addEventListener('pointermove', this.handleMouseMove, { passive: true })
    document.addEventListener('pointerup', this.handleMouseUp, { passive: true })
    document.addEventListener('pointercancel', this.handleMouseUp)

    this.dispatchChangeColor()
  }

  handleMouseMove = async (event: PointerEvent) => {
    this.currentMousePosition = this.getPointerPosition(event)
    this.dispatchChangeColor()
  }

  getPointerPosition(event: PointerEvent) {
    let x = event.pageX - this.rootElement.offsetLeft
    let y = event.pageY - this.rootElement.offsetTop
    x = Math.max(0, x)
    y = Math.max(0, y)
    x = Math.min(x, this.rootElement!.offsetWidth)
    y = Math.min(y, this.rootElement!.offsetHeight)
    return { x, y }
  }

  handleMouseUp = () => {
    document.removeEventListener('pointermove', this.handleMouseMove)
    document.removeEventListener('pointerup', this.handleMouseUp)
    document.removeEventListener('pointercancel', this.handleMouseUp)
  }

  private updateColorHandlePosition() {
    const handleWidth = this.colorHandle.offsetWidth
    const handleHeight = this.colorHandle.offsetHeight

    let x = this.currentMousePosition.x - handleWidth / 2
    let y = this.currentMousePosition.y - handleHeight / 2
    x = Math.max(0, Math.min(x, this.rootElement!.offsetWidth - handleWidth))
    y = Math.max(0, Math.min(y, this.rootElement!.offsetHeight - handleHeight))
    this.colorHandle.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0)`)
  }

  private updateHueFromHexColor() {
    const tinyColor = new TinyColor(this.color)
    if (tinyColor.isValid) {
      const { h, s, v } = tinyColor.toHsv()
      this.hue = h
      this.currentMousePosition = {
        x: s * this.rootElement.offsetWidth,
        y: (1 - v) * this.rootElement.offsetHeight,
      }
    }
  }

  protected override updated(_changedProperties: PropertyValueMap<this>): void {
    super.updated(_changedProperties)
    if (_changedProperties.has('currentMousePosition')) {
      this.updateColorHandlePosition()
    }
    if (_changedProperties.has('color')) {
      this.updateHueFromHexColor()
    }
  }

  dispatchChangeColor() {
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        cancelable: true,
        detail: this.color,
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
