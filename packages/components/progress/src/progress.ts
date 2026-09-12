import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './progress.scss?inline'

/**
 * Linear progress bar. Without a `value` the indicator slides across the track indefinitely; with one it fills the
 * track from the start edge and animates between values. Text in the default slot labels the bar and doubles as its
 * accessible name, and `show-value` adds the percentage on the opposite side — override that text with the `value`
 * slot to count something other than percent. Track and indicator are two plain boxes, so height, radius, colours
 * and speed are all variables. Use `c2-spinner` when the wait has no natural width to fill.
 *
 * @tag c2-progress
 *
 * @slot - Label shown above the track (e.g. "Uploading files"). Also used as the accessible name.
 * @slot value - Replaces the percentage shown next to the label, for counts such as "3 of 5" or "1.2 of 4 MB".
 *
 * @cssproperty {pixel} [--c2-progress--height=8px] - Thickness of the track and the indicator.
 * @cssproperty {pixel} [--c2-progress--width=100%] - Width of the bar; the host is a block by default.
 * @cssproperty {border-radius} [--c2-progress--border-radius=999px] - Rounding of both the track and the indicator.
 * @cssproperty {color} [--c2-progress__track--background-color=#e4e4e7] - Colour of the unfilled track.
 * @cssproperty {color} [--c2-progress__indicator--background-color=#0265dc] - Colour of the filled part.
 * @cssproperty {time} [--c2-progress--animation-duration=1.4s] - One indeterminate cycle; the determinate fill takes half of it.
 * @cssproperty {pixel} [--c2-progress--gap=8px] - Space between the label row and the track.
 * @cssproperty {color} [--c2-progress__label--color=#71717a]
 * @cssproperty {font-size} [--c2-progress__label--font-size=14px]
 * @cssproperty {font-weight} --c2-progress__label--font-weight
 * @cssproperty {color} [--c2-progress__value--color=#18181b]
 * @cssproperty {font-size} [--c2-progress__value--font-size=14px]
 * @cssproperty {font-weight} [--c2-progress__value--font-weight=500]
 */
@customElement('c2-progress')
export class Progress extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Progress between `0` and `max`. Leave unset for an indeterminate bar. */
  @property({ type: Number }) value: number | undefined = undefined

  /** Value that fills the whole track. */
  @property({ type: Number }) max = 100

  /** Accessible name when nothing is slotted. Defaults to "Loading". */
  @property() label = ''

  /** Show the completed percentage beside the label. Always on when the `value` slot has content. */
  @property({ type: Boolean, attribute: 'show-value', reflect: true }) showValue = false

  @state() private hasLabel = false

  @state() private hasValueText = false

  /** Value that fills the track, guarding against a `max` of `0` or less. */
  private get effectiveMax(): number {
    return this.max > 0 ? this.max : 100
  }

  /** `value` clamped to `0`–`max`; `undefined` while indeterminate. Announced as-is, so it keeps the author's precision. */
  private get clampedValue(): number | undefined {
    if (this.value === undefined || Number.isNaN(this.value)) return undefined
    return Math.min(this.effectiveMax, Math.max(0, this.value))
  }

  /** Completed fraction, `0` to `1`; `undefined` while indeterminate. */
  get fraction(): number | undefined {
    const value = this.clampedValue
    return value === undefined ? undefined : value / this.effectiveMax
  }

  // `slotchange` fires on the first assignment too, so there is nothing to read in `firstUpdated`.
  private handleSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    const filled = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
    if (slot.name === 'value') this.hasValueText = filled
    else this.hasLabel = filled
  }

  override render() {
    const value = this.clampedValue
    const fraction = this.fraction
    const determinate = fraction !== undefined
    const percent = determinate ? Math.round(fraction * 100) : 0
    const showValue = this.showValue || this.hasValueText
    return html`
      <div class=${classMap({ 'c2-progress': true, 'is-determinate': determinate })}>
        <div class="c2-progress-header" part="header" ?hidden=${!this.hasLabel && !showValue}>
          <span id="label" class="c2-progress-label" part="label" ?hidden=${!this.hasLabel}>
            <slot @slotchange=${this.handleSlotChange}></slot>
          </span>
          <span class="c2-progress-value" part="value" ?hidden=${!showValue}>
            <slot name="value" @slotchange=${this.handleSlotChange}>${determinate ? `${percent}%` : nothing}</slot>
          </span>
        </div>
        <div
          class="c2-progress-track"
          part="track"
          role="progressbar"
          aria-label=${this.hasLabel ? nothing : ifDefined(this.label || 'Loading')}
          aria-labelledby=${this.hasLabel ? 'label' : nothing}
          aria-valuemin=${determinate ? '0' : nothing}
          aria-valuemax=${determinate ? String(this.effectiveMax) : nothing}
          aria-valuenow=${value !== undefined ? String(value) : nothing}
        >
          <div class="c2-progress-indicator" part="indicator" style=${determinate ? styleMap({ width: `${fraction * 100}%` }) : nothing}></div>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-progress': Progress
  }
}
