import { LitElement, html, nothing, svg, unsafeCSS } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { imageCompareMessages } from './messages.js'
import styles from './image-compare.scss?inline'

export { imageCompareMessages } from './messages.js'

export type ImageCompareOrientation = 'horizontal' | 'vertical'

/** Events fired by {@link ImageCompare}, keyed for `addEventListener`. */
export interface ImageCompareEventMap {
  input: Event
  change: Event
}

export interface ImageCompare {
  addEventListener: TypedAddEventListener<ImageCompare, ImageCompareEventMap>
  removeEventListener: TypedRemoveEventListener<ImageCompare, ImageCompareEventMap>
}

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50)
const round = (value: number) => Math.round(value * 10) / 10

/**
 * A before/after slider: two layers on top of each other, the after layer cut at a divider the reader drags, as in a
 * retouched photo, a redesign or two map layers.
 *
 * The `before` and `after` slots take any element: an `<img>`, a `c2-image`, a `<canvas>`, a map. The before layer
 * sets the size; the after layer is laid over it and clipped to the divider, so the reader sees the before layer on
 * the left (on top with `orientation="vertical"`) and the after layer past the divider. `position` is the share of the
 * before layer shown, from 0 to 100 (default 50).
 *
 * Drag the handle, or press anywhere on the images, to move the divider; with `hover`, it follows the pointer without a
 * press. `before-label` and `after-label` draw chips in the corners; each belongs to its layer, so the divider cuts it
 * as it passes over. `input`
 * fires while the divider moves and `change` once it settles (on release, or after a key); read `position`.
 *
 * The handle is a `slider`. Its name is `label`, else "Compare: …" built from the layers' alternative text. The arrow
 * keys move it 1% in the direction pressed, Page Up and Page Down 10%, Home and End to the edges.
 *
 * @tag c2-image-compare
 *
 * @slot before - The layer shown before the divider: on the left, or on top when vertical. It sets the component's size.
 * @slot after - The layer shown past the divider, laid over the before layer.
 * @slot handle - Replaces the grip drawn in the handle.
 *
 * @csspart frame - The box holding both layers.
 * @csspart divider - The line between the layers.
 * @csspart handle - The grip on the divider, the slider the keyboard moves.
 * @csspart label - Each corner chip.
 *
 * @event input - While the divider moves, by pointer or key. Read `position`.
 * @event change - When the divider settles: on release, or after a key.
 *
 * @cssproperty {length} [--c2-image-compare--border-radius=8px] - Corner radius of the frame.
 * @cssproperty {string} [--c2-image-compare--aspect-ratio=auto] - The frame's aspect ratio; `auto` lets the before layer set it.
 * @cssproperty {color} [--c2-image-compare--background=#f4f4f5] - Behind the layers, while they load.
 * @cssproperty {pixel} [--c2-image-compare__divider--width=2px] - Thickness of the divider line.
 * @cssproperty {color} [--c2-image-compare__divider--color=#ffffff] - Colour of the divider line.
 * @cssproperty {shadow} [--c2-image-compare__divider--box-shadow=0 0 0 1px rgba(0, 0, 0, 0.25)] - Edge of the divider line, so it reads on light images.
 * @cssproperty {pixel} [--c2-image-compare__handle--size=40px] - Diameter of the handle.
 * @cssproperty {color} [--c2-image-compare__handle--background=#ffffff] - Fill of the handle.
 * @cssproperty {color} [--c2-image-compare__handle--color=#18181b] - The grip arrows.
 * @cssproperty {border} [--c2-image-compare__handle--border=0 solid transparent] - Border of the handle.
 * @cssproperty {shadow} [--c2-image-compare__handle--box-shadow=0 2px 8px rgba(0, 0, 0, 0.25)] - Shadow of the handle.
 * @cssproperty {outline} [--c2-image-compare__handle__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the handle.
 * @cssproperty {pixel} [--c2-image-compare__handle__focus--outline-offset=2px] - Gap between the handle and its focus ring.
 * @cssproperty {color} [--c2-image-compare__label--background=rgba(24, 24, 27, 0.6)] - Fill of the corner chips.
 * @cssproperty {color} [--c2-image-compare__label--color=#ffffff] - Text of the corner chips.
 * @cssproperty {length} [--c2-image-compare__label--font-size=12px] - Text size of the corner chips.
 * @cssproperty {number} [--c2-image-compare__label--font-weight=600] - Text weight of the corner chips.
 * @cssproperty {length} [--c2-image-compare__label--padding=4px 10px] - Inner spacing of the corner chips.
 * @cssproperty {length} [--c2-image-compare__label--border-radius=999px] - Corner radius of the chips.
 * @cssproperty {pixel} [--c2-image-compare__label--offset=12px] - Distance of the chips from the frame's edges.
 */
@customElement('c2-image-compare')
export class ImageCompare extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The share of the before layer shown, from 0 to 100. */
  @property({ type: Number }) position = 50

  /** `horizontal` puts the before layer on the left; `vertical` puts it on top. */
  @property({ type: String }) orientation: ImageCompareOrientation = 'horizontal'

  /** The divider follows the pointer without a press. */
  @property({ type: Boolean }) hover = false

  /** Text of the chip in the before layer's corner. */
  @property({ type: String, attribute: 'before-label' }) beforeLabel = ''

  /** Text of the chip in the after layer's corner. */
  @property({ type: String, attribute: 'after-label' }) afterLabel = ''

  /** The handle's accessible name. Without it the name is built from the layers' alternative text. */
  @property({ type: String }) label = ''

  @state() private dragging = false
  /** Set while `hover` moved the divider since the pointer came in, so leaving fires one `change`. */
  private hoverMoved = false
  @state() private beforeName = ''
  @state() private afterName = ''

  @query('.frame') private frame?: HTMLElement
  @query('.handle') private handle?: HTMLElement

  private readonly msg = new LocalizeController(this, imageCompareMessages)

  /** Moves focus to the handle. */
  override focus(options?: FocusOptions): void {
    this.handle?.focus(options)
  }

  private get vertical(): boolean {
    return this.orientation === 'vertical'
  }

  /** Sets the position and fires `input` (and `change` when it settles at once), unless it did not move. */
  private moveTo(value: number, settle: boolean): void {
    const next = round(clamp(value))
    if (next === this.position) {
      if (settle) this.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    this.position = next
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    if (settle) this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /** The position under the pointer, measured only while the reader moves it. */
  private positionAt(event: PointerEvent): number {
    const box = this.frame!.getBoundingClientRect()
    const share = this.vertical ? (event.clientY - box.top) / box.height : (event.clientX - box.left) / box.width
    return share * 100
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.frame) return
    event.preventDefault()
    this.frame.setPointerCapture(event.pointerId)
    this.dragging = true
    this.handle?.focus({ preventScroll: true })
    this.moveTo(this.positionAt(event), false)
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.dragging) this.moveTo(this.positionAt(event), false)
    else if (this.hover && event.pointerType !== 'touch') {
      const before = this.position
      this.moveTo(this.positionAt(event), false)
      if (this.position !== before) this.hoverMoved = true
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.dragging) return
    this.dragging = false
    if (this.frame?.hasPointerCapture(event.pointerId)) this.frame.releasePointerCapture(event.pointerId)
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private onPointerLeave(): void {
    if (this.hover && !this.dragging && this.hoverMoved) {
      this.hoverMoved = false
      this.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    const back = ['ArrowLeft', 'ArrowUp'].includes(event.key)
    const forward = ['ArrowRight', 'ArrowDown'].includes(event.key)
    let next: number | null = null
    if (back || forward) next = this.position + (back ? -1 : 1)
    else if (event.key === 'PageUp' || event.key === 'PageDown') next = this.position + (event.key === 'PageUp' ? -10 : 10)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 100
    if (next === null) return
    event.preventDefault()
    this.moveTo(next, true)
  }

  /** The alternative text of a slotted layer: an image's `alt`, else its `aria-label`, else a nested image's `alt`. */
  private nameOf(slot: HTMLSlotElement): string {
    for (const element of slot.assignedElements({ flatten: true })) {
      const text = element.getAttribute('alt') || element.getAttribute('aria-label') || element.querySelector('img[alt]')?.getAttribute('alt')
      if (text?.trim()) return text.trim()
    }
    return ''
  }

  private onSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    if (slot.name === 'before') this.beforeName = this.nameOf(slot)
    else this.afterName = this.nameOf(slot)
  }

  private get accessibleName(): string {
    if (this.label) return this.label
    if (this.beforeName && this.afterName) return this.msg.t('compareNamed', this.beforeName, this.afterName)
    return this.msg.t('compare')
  }

  private renderGrip() {
    const arrows = this.vertical ? svg`<path d="M7 9.5 12 4.5 17 9.5M7 14.5 12 19.5 17 14.5" />` : svg`<path d="M9.5 7 4.5 12 9.5 17M14.5 7 19.5 12 14.5 17" />`
    return html`<svg class="grip" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${arrows}</svg>`
  }

  override render() {
    const position = clamp(this.position)
    const percent = new Intl.NumberFormat(this.msg.locale, { style: 'percent', maximumFractionDigits: 0 })
    const before = percent.format(position / 100)
    const after = percent.format((100 - position) / 100)
    return html`<div
      class=${classMap({ frame: true, vertical: this.vertical, dragging: this.dragging, hover: this.hover })}
      part="frame"
      style=${styleMap({ '--_position': `${position}%` })}
      @pointerdown=${this.onPointerDown}
      @pointermove=${this.onPointerMove}
      @pointerup=${this.onPointerUp}
      @pointercancel=${this.onPointerUp}
      @pointerleave=${this.onPointerLeave}
    >
      <div class="layer before"><slot name="before" @slotchange=${this.onSlotChange}></slot></div>
      <div class="layer after"><slot name="after" @slotchange=${this.onSlotChange}></slot></div>
      ${
        this.beforeLabel
          ? html`<div class="chips before-chips" aria-hidden="true"><span class="label before-label" part="label">${this.beforeLabel}</span></div>`
          : nothing
      }
      ${
        this.afterLabel
          ? html`<div class="chips after-chips" aria-hidden="true"><span class="label after-label" part="label">${this.afterLabel}</span></div>`
          : nothing
      }
      <div class="divider" part="divider">
        <div
          class="handle"
          part="handle"
          role="slider"
          tabindex="0"
          aria-label=${this.accessibleName}
          aria-orientation=${this.vertical ? 'vertical' : 'horizontal'}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${Math.round(position)}
          aria-valuetext=${this.msg.t('value', before, after)}
          @keydown=${this.onKeyDown}
        >
          <slot name="handle">${this.renderGrip()}</slot>
        </div>
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-image-compare': ImageCompare
  }
}
