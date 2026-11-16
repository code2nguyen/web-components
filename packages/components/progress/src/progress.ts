import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { progressMessages } from './messages.js'
import styles from './progress.scss?inline'

export type ProgressVariant = 'linear' | 'circular'

/** Where a milestone stands: not reached yet, reached, or reached with a reward that waits to be claimed. */
export type ProgressMarkState = 'locked' | 'reached' | 'claimable'

/** A milestone on the track of a `c2-progress`: a tier, a threshold, a reward. */
export interface ProgressMark {
  /** Where the milestone sits, in the units of `value` and `max`. */
  value: number
  /** Name shown under the track at the milestone ("Free shipping", "Gold"). */
  label?: string
  /**
   * Overrides the state the value gives (`locked` before the milestone, `reached` from it on): set `claimable` on a
   * reached reward the user has not claimed yet.
   */
  state?: ProgressMarkState
}

/** What a `renderMark` function receives for each milestone. */
export interface ProgressMarkContext {
  mark: ProgressMark
  index: number
  state: ProgressMarkState
  /** Distance from the value to the milestone, `0` once the value reaches it; `undefined` while the bar is indeterminate. */
  remaining: number | undefined
}

/** Draws the label of one milestone: anything Lit can render. */
export type ProgressMarkRenderer = (context: ProgressMarkContext) => unknown

/** The first milestone ahead of the value, and the distance to it. */
export interface ProgressNextMark {
  mark: ProgressMark
  index: number
  remaining: number
}

/**
 * Progress indicator, drawn as a bar (`linear`, the default) or a ring (`circular`). Without a `value` the
 * indicator slides across the track indefinitely; with one it fills the track from the start edge and animates
 * between values. Text in the default slot labels the bar and doubles as its accessible name, and `show-value` adds the percentage on the opposite side — override that text with the `value`
 * slot to count something other than percent. Track and indicator are two plain boxes, so height, radius, colours
 * and speed are all variables. Use `c2-spinner` when the wait has no natural width to fill.
 *
 * The `circular` variant draws the same track and indicator as a ring `--c2-progress--size` across and
 * `--c2-progress--height` thick, starting at the top and filling clockwise. `show-value` (or the `value` slot) prints
 * the value in the middle of the ring and the label sits underneath; without a value the arc spins.
 *
 * `marks` puts milestones on a `linear` track (tiers, thresholds, rewards): a dot at each one's value, with its label
 * under the track. A milestone is `locked` until the value reaches it and `reached` from then on, unless its own
 * `state` says otherwise (`claimable` for a reward waiting to be claimed). Each one is announced with its state, a
 * locked one with the distance left to it, and `nextMark` hands that distance to the application's own label.
 *
 * @tag c2-progress
 *
 * @slot - Label shown above the track (e.g. "Uploading files"). Also used as the accessible name.
 * @slot value - Replaces the percentage shown next to the label, for counts such as "3 of 5" or "1.2 of 4 MB".
 *
 * @csspart header - Row containing the label and displayed value.
 * @csspart label - Container for the default label slot.
 * @csspart value - Text region containing the custom `value` slot or displayed-percentage fallback.
 * @csspart track - The full progress track (the ring's box in the `circular` variant).
 * @csspart indicator - The filled portion of the progress track (the arc in the `circular` variant).
 * @csspart unit - The `%` sign of the percentage in the middle of a `circular` ring.
 * @csspart marks - The milestone list laid over and under the track, drawn when `marks` is set.
 * @csspart mark - One milestone in the marks list: its dot and its label.
 * @csspart mark-dot - The dot on the track at a milestone's value.
 * @csspart mark-label - The label under the track at a milestone, or what `renderMark` returns for it.
 *
 * @cssproperty {pixel} [--c2-progress--height=8px] - Thickness of the track and the indicator (the ring's stroke in `circular`).
 * @cssproperty {pixel} [--c2-progress--size=64px] - Diameter of the `circular` ring.
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
 * @cssproperty {font-size} [--c2-progress__ring-value--font-size=16px] - Size of the value in the middle of a `circular` ring.
 * @cssproperty {string} [--c2-progress__indicator--stroke-linecap=round] - Ends of the `circular` arc: `round` or `butt`.
 * @cssproperty {pixel} [--c2-progress__mark--size=14px] - Diameter of a milestone's dot, centred on the track.
 * @cssproperty {pixel} [--c2-progress__mark--border-width=2px] - Ring round a milestone's dot that separates it from the track.
 * @cssproperty {color} [--c2-progress__mark--border-color=#ffffff] - Colour of the ring round a milestone's dot.
 * @cssproperty {color} [--c2-progress__mark--background-color=#a1a1aa] - Dot of a milestone not reached yet.
 * @cssproperty {color} [--c2-progress__mark__reached--background-color=#0265dc] - Dot of a reached milestone.
 * @cssproperty {color} [--c2-progress__mark__claimable--background-color=#16a34a] - Dot of a claimable milestone.
 * @cssproperty {shadow} [--c2-progress__mark__claimable--box-shadow=0 0 0 4px rgba(22, 163, 74, 0.24)] - Halo round a claimable milestone's dot.
 * @cssproperty {color} [--c2-progress__mark-label--color=#71717a] - Label of a milestone not reached yet.
 * @cssproperty {color} [--c2-progress__mark-label__reached--color=#18181b] - Label of a reached or claimable milestone.
 * @cssproperty {font-size} [--c2-progress__mark-label--font-size=12px]
 * @cssproperty {font-weight} --c2-progress__mark-label--font-weight
 * @cssproperty {pixel} [--c2-progress__mark-label--padding-top=6px] - Space between a milestone's dot and its label.
 */
@customElement('c2-progress')
export class Progress extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Progress between `0` and `max`. Leave unset for an indeterminate bar. */
  @property({ type: Number }) value: number | undefined = undefined

  /** `linear` draws a bar, `circular` a ring with the value in its middle. */
  @property({ reflect: true }) variant: ProgressVariant = 'linear'

  /** Value that fills the whole track. */
  @property({ type: Number }) max = 100

  /** Accessible name when nothing is slotted. Defaults to "Loading" in the nearest `lang` (English, or a language the app adds). */
  @property() label = ''

  private readonly msg = new LocalizeController(this, progressMessages)

  /** Show the completed percentage beside the label. Always on when the `value` slot has content. */
  @property({ type: Boolean, attribute: 'show-value', reflect: true }) showValue = false

  /**
   * Milestones on a `linear` track, as JSON in the attribute or an array in the property: `{ value, label?, state? }`
   * each, `value` in the units of the bar's `value`. The `circular` variant ignores them.
   */
  @property({ converter: jsonPropertyConverter }) marks?: ProgressMark[]

  /** Draws each milestone's label in place of its `label` text. The dot, its place and its announced state stay the component's. */
  @property({ attribute: false }) renderMark?: ProgressMarkRenderer

  private readonly slotPresence = new SlotPresenceController(this, ['', 'value'])

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

  /** First milestone ahead of the value, with the distance to it; `undefined` if none, or while indeterminate. */
  get nextMark(): ProgressNextMark | undefined {
    let next: ProgressNextMark | undefined
    this.markList.forEach((mark, index) => {
      const remaining = this.remaining(mark)
      if (remaining && (!next || mark.value < next.mark.value)) next = { mark, index, remaining }
    })
    return next
  }

  private get markList(): ProgressMark[] {
    return Array.isArray(this.marks) ? this.marks : []
  }

  private markState(mark: ProgressMark): ProgressMarkState {
    return mark.state ?? ((this.clampedValue ?? -Infinity) >= mark.value ? 'reached' : 'locked')
  }

  private remaining(mark: ProgressMark): number | undefined {
    const value = this.clampedValue
    return value === undefined ? undefined : Math.max(0, mark.value - value)
  }

  private number(value: number): string {
    try {
      return value.toLocaleString(this.msg.locale)
    } catch {
      return String(value)
    }
  }

  private renderMarks() {
    const max = this.effectiveMax
    return html`<ol class="c2-progress-marks" part="marks">
      ${this.markList.map((mark, index) => {
        const at = Math.min(1, Math.max(0, mark.value / max))
        const state = this.markState(mark)
        const remaining = this.remaining(mark)
        const value = this.number(mark.value)
        return html`<li
          class="c2-progress-mark is-${state} ${at < 0.1 ? 'is-start' : at > 0.9 ? 'is-end' : ''}"
          part="mark"
          style=${styleMap({ '--_at': String(at) })}
        >
          <span class="c2-progress-mark-dot" part="mark-dot"></span>
          <span class="c2-progress-mark-label" part="mark-label">${this.renderMark ? this.renderMark({ mark, index, state, remaining }) : mark.label}</span>
          <span class="c2-progress-sr"
            >${
              state !== 'locked'
                ? this.msg.t(state === 'reached' ? 'markReached' : 'markClaimable', value)
                : remaining
                  ? this.msg.t('markLocked', value, this.number(remaining))
                  : this.msg.t('markAhead', value)
            }</span
          >
        </li>`
      })}
    </ol>`
  }

  override render() {
    const value = this.clampedValue
    const fraction = this.fraction
    const determinate = fraction !== undefined
    const percent = determinate ? Math.round(fraction * 100) : 0
    const hasLabel = this.slotPresence.has()
    const showValue = this.showValue || this.slotPresence.has('value')
    if (this.variant === 'circular') return this.renderCircular(value, fraction, percent, hasLabel, showValue)
    const track = html`
      <div
        class="c2-progress-track"
        part="track"
        role="progressbar"
        aria-label=${hasLabel ? nothing : this.label || this.msg.t('loading')}
        aria-labelledby=${hasLabel ? 'label' : nothing}
        aria-valuemin=${determinate ? '0' : nothing}
        aria-valuemax=${determinate ? String(this.effectiveMax) : nothing}
        aria-valuenow=${value !== undefined ? String(value) : nothing}
      >
        <div class="c2-progress-indicator" part="indicator" style=${determinate ? styleMap({ width: `${fraction * 100}%` }) : nothing}></div>
      </div>
    `
    return html`
      <div class=${classMap({ 'c2-progress': true, 'is-determinate': determinate })}>
        <div class="c2-progress-header" part="header" ?hidden=${!hasLabel && !showValue}>
          <span id="label" class="c2-progress-label" part="label" ?hidden=${!hasLabel}>
            <slot @slotchange=${this.slotPresence.handleSlotChange}></slot>
          </span>
          <span class="c2-progress-value" part="value" ?hidden=${!showValue}>
            <slot name="value" @slotchange=${this.slotPresence.handleSlotChange}>${determinate ? `${percent}%` : nothing}</slot>
          </span>
        </div>
        ${this.markList.length ? html`<div class="c2-progress-rail">${track}${this.renderMarks()}</div>` : track}
      </div>
    `
  }

  private renderCircular(value: number | undefined, fraction: number | undefined, percent: number, hasLabel: boolean, showValue: boolean) {
    const determinate = fraction !== undefined
    return html`
      <div class=${classMap({ 'c2-progress': true, 'is-circular': true, 'is-determinate': determinate, 'is-empty': fraction === 0 })}>
        <div
          class="c2-progress-track"
          part="track"
          role="progressbar"
          aria-label=${hasLabel ? nothing : this.label || this.msg.t('loading')}
          aria-labelledby=${hasLabel ? 'label' : nothing}
          aria-valuemin=${determinate ? '0' : nothing}
          aria-valuemax=${determinate ? String(this.effectiveMax) : nothing}
          aria-valuenow=${value !== undefined ? String(value) : nothing}
        >
          <svg class="c2-progress-ring" aria-hidden="true" focusable="false">
            <circle class="c2-progress-ring-track"></circle>
            <circle class="c2-progress-indicator" part="indicator" style=${determinate ? styleMap({ '--_fraction': String(fraction) }) : nothing}></circle>
          </svg>
          <span class="c2-progress-value" part="value" ?hidden=${!showValue}>
            <slot name="value" @slotchange=${this.slotPresence.handleSlotChange}
              >${determinate ? html`${percent}<span class="c2-progress-unit" part="unit">%</span>` : nothing}</slot
            >
          </span>
        </div>
        <span id="label" class="c2-progress-label" part="label" ?hidden=${!hasLabel}>
          <slot @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-progress': Progress
  }
}
