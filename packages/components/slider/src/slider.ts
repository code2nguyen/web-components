import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { styleMap } from 'lit/directives/style-map.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import styles from './slider.scss?inline'

export type SliderOrientation = 'horizontal' | 'vertical'

const MAX_TICKS = 200

/**
 * Single-value slider built on a native `<input type="range">`, so dragging, keyboard steps (Arrow keys, Page Up/Down,
 * Home/End), RTL and the `slider` role come from the browser. The component draws the track, the filled part, the
 * thumb, optional step `ticks` and a value bubble (`show-value`) above the thumb, all themed through CSS variables.
 *
 * @tag c2-slider
 *
 * @event {Event} input - Re-dispatched from the inner input while the value changes (every step of a drag).
 * @event {Event} change - Re-dispatched from the inner input when the value is committed (pointer released, key released).
 *
 * @cssproperty {pixel} [--c2-slider__container--height=32px] - Height of the horizontal slider (width when vertical); the touch target.
 * @cssproperty {pixel} [--c2-slider__container--length=160px] - Length of a vertical slider. A horizontal one fills its width.
 * @cssproperty {opacity} [--c2-slider__container__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-slider__track--height=4px]
 * @cssproperty {border-radius} [--c2-slider__track--border-radius=999px]
 * @cssproperty {color} [--c2-slider__track--color=#e4e4e7]
 * @cssproperty {color} [--c2-slider__fill--color=#0265dc] - Filled part of the track, from the start to the thumb.
 *
 * @cssproperty {pixel} [--c2-slider__thumb--size=18px]
 * @cssproperty {border-radius} [--c2-slider__thumb--border-radius=999px]
 * @cssproperty {color} [--c2-slider__thumb--color=#ffffff]
 * @cssproperty {border} [--c2-slider__thumb--border=2px solid #0265dc]
 * @cssproperty {box-shadow} [--c2-slider__thumb--box-shadow=0 1px 3px rgba(0, 0, 0, 0.15)]
 * @cssproperty {box-shadow} [--c2-slider__thumb__hover--box-shadow=0 0 0 6px rgba(2, 101, 220, 0.12)] - Halo while hovering.
 * @cssproperty {box-shadow} [--c2-slider__thumb__active--box-shadow=0 0 0 8px rgba(2, 101, 220, 0.18)] - Halo while dragging.
 * @cssproperty {outline} [--c2-slider__thumb__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-slider__thumb__focus--outline-offset=2px]
 *
 * @cssproperty {pixel} [--c2-slider__tick--size=2px]
 * @cssproperty {color} [--c2-slider__tick--color=#a1a1aa] - Ticks on the unfilled part of the track.
 * @cssproperty {color} [--c2-slider__tick__filled--color=#ffffff] - Ticks on the filled part.
 *
 * @cssproperty {background} [--c2-slider__value--background=#18181b] - Value bubble above the thumb.
 * @cssproperty {color} [--c2-slider__value--color=#fafafa]
 * @cssproperty {font-size} [--c2-slider__value--font-size=12px]
 * @cssproperty {font-weight} [--c2-slider__value--font-weight=500]
 * @cssproperty {border-radius} [--c2-slider__value--border-radius=6px]
 * @cssproperty {padding} [--c2-slider__value--padding=4px 8px]
 * @cssproperty {pixel} [--c2-slider__value--offset=8px] - Gap between the thumb and the bubble.
 * @cssproperty {opacity} [--c2-slider__value--opacity=0] - Resting opacity of the bubble; it is fully visible while hovering, dragging or focused. `1` keeps it always on.
 */
@customElement('c2-slider')
export class Slider extends LitElement {
  static override styles = unsafeCSS(styles)

  @query('input') protected formElement!: HTMLInputElement

  /** Current value, clamped to `min`/`max` and snapped to `step` by the inner input. */
  @property({ type: Number, reflect: true }) value = 0

  @property({ type: Number }) min = 0

  @property({ type: Number }) max = 100

  /** Increment between values; also the distance between `ticks`. */
  @property({ type: Number }) step = 1

  /** Disables the control: no interaction, rendered dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Form field name forwarded to the inner input. */
  @property() name = ''

  /** Direction of the track. A vertical slider takes `--c2-slider__container--length` as its height. */
  @property({ reflect: true }) orientation: SliderOrientation = 'horizontal'

  /** Shows the value in a bubble above the thumb while hovering, dragging or focused. */
  @property({ type: Boolean, reflect: true, attribute: 'show-value' }) showValue = false

  /** Draws a mark on the track for every `step` between `min` and `max` (up to 200 marks). */
  @property({ type: Boolean, reflect: true }) ticks = false

  /** Formats the value for the bubble and `aria-valuetext`, e.g. `(v) => \`${v}%\``. Property only. */
  @property({ attribute: false }) formatValue: (value: number) => string = (value) => String(value)

  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  @property({ type: String, attribute: 'aria-labelledby' })
  ariaLabelledBy!: undefined | string

  override focus(options?: FocusOptions) {
    this.formElement?.focus(options)
  }

  /** Position of the value along the track, `0` at `min` and `1` at `max`. */
  get fraction(): number {
    const range = this.max - this.min
    if (range <= 0) return 0
    return Math.min(1, Math.max(0, (this.value - this.min) / range))
  }

  protected override update(changed: PropertyValues<this>) {
    if (changed.has('value') && this.formElement) this.formElement.value = String(this.value)
    super.update(changed)
  }

  private handleInput(event: Event) {
    this.value = Number(this.formElement.value)
    redispatchEvent(this, event)
  }

  private handleChange(event: Event) {
    this.value = Number(this.formElement.value)
    redispatchEvent(this, event)
  }

  private renderTicks() {
    if (!this.ticks || this.step <= 0) return nothing
    const count = Math.round((this.max - this.min) / this.step)
    if (count < 1 || count > MAX_TICKS) return nothing
    const marks = []
    for (let i = 0; i <= count; i++) {
      const fraction = i / count
      marks.push(
        html`<span
          class=${classMap({ 'c2-slider-tick': true, 'is-filled': fraction <= this.fraction })}
          style=${styleMap({ '--_p': String(fraction) })}
        ></span>`,
      )
    }
    return html`<div class="c2-slider-ticks" aria-hidden="true">${marks}</div>`
  }

  override render() {
    const formatted = this.formatValue(this.value)
    return html`
      <div class="c2-slider" style=${styleMap({ '--_p': String(this.fraction) })}>
        <div class="c2-slider-track" part="track">
          <div class="c2-slider-fill" part="fill"></div>
          ${this.renderTicks()}
          <div class="c2-slider-thumb" part="thumb">
            ${this.showValue ? html`<div class="c2-slider-value" part="value" aria-hidden="true">${formatted}</div>` : nothing}
          </div>
        </div>
        <input
          class="c2-slider-input"
          type="range"
          name=${ifDefined(this.name || undefined)}
          min=${this.min}
          max=${this.max}
          step=${this.step}
          .value=${String(this.value)}
          ?disabled=${this.disabled}
          aria-label=${ifDefined(this.ariaLabel)}
          aria-labelledby=${ifDefined(this.ariaLabelledBy)}
          aria-valuetext=${formatted}
          aria-orientation=${this.orientation}
          @input=${this.handleInput}
          @change=${this.handleChange}
        />
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-slider': Slider
  }
}
