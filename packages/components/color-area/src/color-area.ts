import { LitElement, html, unsafeCSS } from 'lit'
import { query } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { colorAreaMessages } from './messages.js'
import styles from './color-area.scss?inline'
import { TinyColor } from '@ctrl/tinycolor'

export interface Point {
  x: number
  y: number
}

/** Events fired by {@link ColorArea}, keyed for `addEventListener`. */
export interface ColorAreaEventMap {
  change: CustomEvent<{ saturation: number; value: number }>
}

export interface ColorArea {
  addEventListener: TypedAddEventListener<ColorArea, ColorAreaEventMap>
  removeEventListener: TypedRemoveEventListener<ColorArea, ColorAreaEventMap>
}

/**
 * Two-dimensional saturation/value picker for a hue, with pointer and keyboard interaction.
 *
 * The thumb is the one tab stop, a `slider` whose value is the saturation and whose spoken text names both axes.
 * ← → change the saturation and ↑ ↓ the brightness by 1%, 10% with Shift; Page Up/Down change the brightness by 10%,
 * Home/End set the saturation to 0% or 100%. A drag keeps following the pointer outside the area until it is released.
 *
 * @tag c2-color-area
 *
 * @event {CustomEvent<{ saturation: number; value: number }>} change - Fired while the selected saturation or value changes.
 *
 * @cssproperty {pixel} [--c2-color-area--width=240px]
 * @cssproperty {pixel} [--c2-color-area--height=240px]
 * @cssproperty {pixel} [--c2-color-area__color-handle--size=12px]
 * @cssproperty {outline} [--c2-color-area__color-handle__focus--outline=2px solid #476ef9] - The ring around the thumb while it has keyboard focus.
 *
 * @cssproperty {border-radius} --c2-color-area--border-top-left-radius
 * @cssproperty {border-radius} --c2-color-area--border-top-right-radius
 * @cssproperty {border-radius} --c2-color-area--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-color-area--border-bottom-right-radius
 */
@customElement('c2-color-area')
export class ColorArea extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Hue of the colour plane in degrees. */
  @property({ type: Number }) hue = 0
  /** Selected saturation from 0 to 1. */
  @property({ type: Number }) saturation = 1
  /** Selected brightness value from 0 to 1. */
  @property({ type: Number }) value = 1

  public get tinyColor(): TinyColor {
    return new TinyColor({ h: this.hue, s: this.saturation, v: this.value })
  }

  @query('.color-handle', true) colorHandle?: HTMLElement
  @query('.gradient', true) private gradient?: HTMLElement
  @query('.c2-color-area', true) rootElement?: HTMLElement

  currentMousePosition: Point = { x: 0, y: 0 }

  /** The gradient's box while a drag is in progress: the pointer is measured against it. */
  private rootElementsRect?: DOMRect
  private readonly msg = new LocalizeController(this, colorAreaMessages)

  convertPositionToHslValues(position: Point) {
    const rect = this.rootElementsRect ?? this.gradient?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return
    this.saturation = position.x / rect.width
    this.value = 1 - position.y / rect.height
  }

  private handleAreaPointerdown(event: PointerEvent): void {
    if (event.button !== 0) {
      return
    }
    // Measured on the gradient, not the padded root around it, so the pointer and the thumb agree at the edges.
    this.rootElementsRect = this.gradient!.getBoundingClientRect()
    this.currentMousePosition = this.getPointerPosition(event)
    this.convertPositionToHslValues(this.currentMousePosition)

    // The drag follows this pointer wherever it goes until it is released, with no listener on the document.
    this.gradient?.setPointerCapture(event.pointerId)
    // The thumb takes focus, so the arrow keys continue from where the pointer put it (no ring: it is not keyboard focus).
    event.preventDefault()
    this.colorHandle?.focus({ preventScroll: true })

    this.dispatchChangeColor()
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.gradient?.hasPointerCapture(event.pointerId) || !this.rootElementsRect) return
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

  private handlePointerEnd = (event: PointerEvent) => {
    if (this.gradient?.hasPointerCapture(event.pointerId)) this.gradient.releasePointerCapture(event.pointerId)
    this.rootElementsRect = undefined
  }

  private handleKeydown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.01
    const clamp = (number: number) => Math.round(Math.min(1, Math.max(0, number)) * 1000) / 1000
    let saturation = this.saturation
    let value = this.value
    switch (event.key) {
      case 'ArrowLeft':
        saturation -= step
        break
      case 'ArrowRight':
        saturation += step
        break
      case 'ArrowUp':
        value += step
        break
      case 'ArrowDown':
        value -= step
        break
      case 'PageUp':
        value += 0.1
        break
      case 'PageDown':
        value -= 0.1
        break
      case 'Home':
        saturation = 0
        break
      case 'End':
        saturation = 1
        break
      default:
        return
    }
    event.preventDefault()
    saturation = clamp(saturation)
    value = clamp(value)
    if (saturation === this.saturation && value === this.value) return
    this.saturation = saturation
    this.value = value
    this.dispatchChangeColor()
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
        @pointermove=${this.handlePointerMove}
        @pointerup=${this.handlePointerEnd}
        @pointercancel=${this.handlePointerEnd}
        class="gradient"
        style="background:
                    linear-gradient(to top, black 0%, hsla(${this.hue}, 100%, 0.01%, 0) 100%),
                    linear-gradient(to right, white 0%, hsla(${this.hue}, 100%, 0.01%, 0) 100%), hsl(${this.hue}, 100%, 50%);"
      >
        <div
          class="color-handle"
          style=${styleMap({
            // Placed in percent of the gradient, so it needs no measurement: right before layout, in a hidden or
            // server-rendered element and after a resize.
            left: `${clamp01(this.saturation) * 100}%`,
            top: `${(1 - clamp01(this.value)) * 100}%`,
            backgroundColor: this.tinyColor.toRgbString(),
          })}"
        role="slider"
        tabindex="0"
        aria-label=${this.ariaLabel || this.msg.t('label')}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${Math.round(this.saturation * 100)}
        aria-valuetext=${this.msg.t('valueText', Math.round(this.saturation * 100), Math.round(this.value * 100))}
          @keydown=${this.handleKeydown}
        ></div>
      </div>
    </div> `
  }
}

function clamp01(number: number): number {
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-color-area': ColorArea
  }
}
