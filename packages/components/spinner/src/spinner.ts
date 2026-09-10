import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './spinner.scss?inline'

/** Radius of the ring in the 48-unit view box; the circumference drives the dash lengths. */
const RADIUS = 20
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Circular progress indicator. Without a `value` it spins indeterminately; with one it draws the completed arc of a
 * ring and animates between values. Text in the default slot sits beside it (or below, via a variable) and names the
 * indicator for assistive technology, as does the `label` attribute. Everything is one SVG ring, so size, thickness,
 * colours and speed are variables.
 *
 * @tag c2-spinner
 *
 * @slot - Optional text shown next to the ring (e.g. "Loading…"). Also used as the accessible name.
 *
 * @cssproperty {pixel} [--c2-spinner--size=24px] - Diameter of the ring.
 * @cssproperty {pixel} [--c2-spinner--stroke-width=4px] - Thickness of the ring, in the ring's 48-unit box; it scales with the size.
 * @cssproperty {stroke-linecap} [--c2-spinner--stroke-linecap=round] - `butt` for square arc ends.
 * @cssproperty {color} [--c2-spinner--color=#0265dc] - Colour of the moving arc.
 * @cssproperty {color} [--c2-spinner__track--color=#e4e4e7] - Colour of the full ring behind the arc; `transparent` hides it.
 * @cssproperty {time} [--c2-spinner--animation-duration=1.4s] - One indeterminate cycle; also the determinate transition length divided by two.
 * @cssproperty {pixel} [--c2-spinner--gap=8px] - Space between the ring and the text.
 * @cssproperty {flex-direction} [--c2-spinner--flex-direction=row] - `column` puts the text under the ring.
 * @cssproperty {color} [--c2-spinner__label--color=#71717a]
 * @cssproperty {font-size} [--c2-spinner__label--font-size=14px]
 * @cssproperty {font-weight} --c2-spinner__label--font-weight
 */
@customElement('c2-spinner')
export class Spinner extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Progress between `0` and `max`. Leave unset for an indeterminate spinner. */
  @property({ type: Number }) value: number | undefined = undefined

  /** Value that fills the whole ring. */
  @property({ type: Number }) max = 100

  /** Accessible name when nothing is slotted. Defaults to "Loading". */
  @property() label = ''

  @state() private hasText = false

  /** Completed fraction, `0` to `1`; `undefined` while indeterminate. */
  get fraction(): number | undefined {
    if (this.value === undefined || Number.isNaN(this.value)) return undefined
    const max = this.max > 0 ? this.max : 100
    return Math.min(1, Math.max(0, this.value / max))
  }

  override firstUpdated() {
    const slot = this.renderRoot.querySelector('slot')
    if (slot) this.updateText(slot)
  }

  private handleSlotChange(event: Event) {
    this.updateText(event.target as HTMLSlotElement)
  }

  private updateText(slot: HTMLSlotElement) {
    this.hasText = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
  }

  override render() {
    const fraction = this.fraction
    const determinate = fraction !== undefined
    const arcStyle = determinate ? styleMap({ strokeDasharray: `${CIRCUMFERENCE}`, strokeDashoffset: `${CIRCUMFERENCE * (1 - fraction)}` }) : nothing
    return html`
      <div
        class=${classMap({ 'c2-spinner': true, 'is-determinate': determinate, 'has-text': this.hasText })}
        role="progressbar"
        aria-label=${this.hasText ? nothing : ifDefined(this.label || 'Loading')}
        aria-labelledby=${this.hasText ? 'label' : nothing}
        aria-valuemin=${determinate ? '0' : nothing}
        aria-valuemax=${determinate ? String(this.max) : nothing}
        aria-valuenow=${determinate ? String(this.value) : nothing}
      >
        <svg class="c2-spinner-ring" part="ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <circle class="c2-spinner-track" part="track" cx="24" cy="24" r=${RADIUS}></circle>
          <circle class="c2-spinner-arc" part="arc" cx="24" cy="24" r=${RADIUS} style=${arcStyle}></circle>
        </svg>
        <span id="label" class="c2-spinner-label" part="label" ?hidden=${!this.hasText}><slot @slotchange=${this.handleSlotChange}></slot></span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-spinner': Spinner
  }
}
