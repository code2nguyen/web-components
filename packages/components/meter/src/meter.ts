import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { styleMap } from 'lit/directives/style-map.js'
import { meterMessages } from './messages'
import styles from './meter.scss?inline'

/** One part of a segmented meter: a storage category, a plan's quota line. */
export interface MeterSegment {
  /** Name shown in the legend and announced with the value. */
  label: string
  /** Amount this segment uses, in the meter's `min`–`max` units. */
  value: number
  /** Fill colour. Without one the segment takes the next `--c2-meter__segment-<n>--background-color`. */
  color?: string
}

/** How good the value is, from `low`, `high` and `optimum`, the way the native `<meter>` judges it. */
export type MeterTone = 'optimum' | 'suboptimum' | 'critical'

const TONES: readonly MeterTone[] = ['optimum', 'suboptimum', 'critical']

/**
 * A measurement inside a known range — storage used, a plan's quota, a password's strength — drawn as a bar with
 * its label and value above it. Unlike `c2-progress` it is not a task moving towards done: it has `min` and `max`, and
 * the native `<meter>` thresholds `low`, `high` and `optimum` judge the value as optimum, sub-optimum or critical,
 * which colours the bar (and is exposed as the `:state(optimum)`, `:state(suboptimum)` and `:state(critical)` custom
 * states for styling around it). Give it `segments` instead of a `value` to split the bar into parts, such as
 * photos, documents and mail in a storage quota, with a legend underneath.
 *
 * The value shows as a percentage of the range in the page's language; `value-text` replaces it with your own words
 * ("12.4 GB of 15 GB"), which are also what a screen reader announces, and the `value` slot replaces only what is
 * shown. A segmented meter shows and announces its total against `max`, and reads each segment out by name.
 *
 * @tag c2-meter
 *
 * @slot - Label shown above the bar; also the meter's accessible name. Falls back to the `label` attribute.
 * @slot value - Replaces the value shown beside the label. Announced text still comes from `value-text`.
 *
 * @csspart header - Row holding the label and the value.
 * @csspart label - Container of the label.
 * @csspart value - Text region containing the custom `value` slot, or its fallback: `value-text`, the segments' total or the percentage.
 * @csspart track - The bar's full range; carries `role="meter"`.
 * @csspart indicator - The filled part of a single-value meter.
 * @csspart segment - Each filled part of a segmented meter.
 * @csspart legend - List of the segments under the bar.
 * @csspart legend-item - One entry of the legend.
 * @csspart swatch - Colour mark of a legend entry.
 *
 * @cssproperty {pixel} [--c2-meter--width=100%] - Width of the meter; the host is a block.
 * @cssproperty {pixel} [--c2-meter--gap=8px] - Space between the header, the bar and the legend.
 * @cssproperty {time} [--c2-meter--transition-duration=300ms] - How long the bar takes to follow a new value.
 *
 * @cssproperty {pixel} [--c2-meter__track--height=8px]
 * @cssproperty {border-radius} [--c2-meter__track--border-radius=999px] - Rounds the track and the ends of the fill.
 * @cssproperty {color} [--c2-meter__track--background-color=#e4e4e7] - Colour of the unused range.
 *
 * @cssproperty {color} [--c2-meter__indicator--background-color=#0265dc] - Fill while the value is optimum (and always without thresholds).
 * @cssproperty {color} [--c2-meter__indicator__suboptimum--background-color=#d97706] - Fill while the value is sub-optimum.
 * @cssproperty {color} [--c2-meter__indicator__critical--background-color=#dc2626] - Fill while the value is critical.
 *
 * @cssproperty {pixel} [--c2-meter__segment--gap=2px] - Space between two segments.
 * @cssproperty {color} [--c2-meter__segment-1--background-color=#0265dc] - Fill of the 1st, 7th, 13th… segment without a `color`.
 * @cssproperty {color} [--c2-meter__segment-2--background-color=#0f766e]
 * @cssproperty {color} [--c2-meter__segment-3--background-color=#d97706]
 * @cssproperty {color} [--c2-meter__segment-4--background-color=#7c3aed]
 * @cssproperty {color} [--c2-meter__segment-5--background-color=#db2777]
 * @cssproperty {color} [--c2-meter__segment-6--background-color=#0891b2]
 *
 * @cssproperty {color} [--c2-meter__label--color=#18181b]
 * @cssproperty {font-size} [--c2-meter__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-meter__label--font-weight=500]
 * @cssproperty {color} [--c2-meter__value--color=#71717a]
 * @cssproperty {font-size} [--c2-meter__value--font-size=14px]
 * @cssproperty {font-weight} [--c2-meter__value--font-weight=400]
 * @cssproperty {display} [--c2-meter__value--display=inline] - `none` hides the shown value; it is still announced.
 *
 * @cssproperty {display} [--c2-meter__legend--display=flex] - `none` hides the legend of a segmented meter.
 * @cssproperty {pixel} [--c2-meter__legend--gap=4px 16px] - Row and column gap between legend entries.
 * @cssproperty {color} [--c2-meter__legend--color=#71717a] - Colour of a legend entry's label.
 * @cssproperty {font-size} [--c2-meter__legend--font-size=12px]
 * @cssproperty {color} [--c2-meter__legend-value--color=#18181b] - Colour of a legend entry's value.
 * @cssproperty {pixel} [--c2-meter__swatch--size=8px]
 * @cssproperty {border-radius} [--c2-meter__swatch--border-radius=999px]
 */
@customElement('c2-meter')
export class Meter extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The measurement, between `min` and `max`. Ignored when `segments` are set. */
  @property({ type: Number }) value = 0

  /** Lower end of the range. */
  @property({ type: Number }) min = 0

  /** Upper end of the range. */
  @property({ type: Number }) max = 100

  /** Upper end of the low region, as in the native `<meter>`. */
  @property({ type: Number }) low: number | undefined = undefined

  /** Lower end of the high region, as in the native `<meter>`. */
  @property({ type: Number }) high: number | undefined = undefined

  /**
   * The best value. Below `low` it makes low values optimum and high ones critical (a fuel gauge reads the other
   * way: `optimum` above `high`); between them the middle region is optimum and both ends sub-optimum.
   */
  @property({ type: Number }) optimum: number | undefined = undefined

  /** Parts of a segmented meter, `{ label, value, color? }`, in range units. Accepts a JSON string as an attribute. */
  @property({ converter: jsonPropertyConverter }) segments: MeterSegment[] = []

  /** Label when the default slot is empty. */
  @property() label = ''

  /** Words for the value ("12.4 GB of 15 GB"), shown and announced in place of the percentage or the total. */
  @property({ attribute: 'value-text' }) valueText = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, meterMessages)
  private readonly slotPresence = new SlotPresenceController(this, ['', 'value'])

  /** Lower and upper end of the range, with a `max` below `min` treated as equal to it. */
  private get range(): [number, number] {
    const min = Number.isFinite(this.min) ? this.min : 0
    const max = Number.isFinite(this.max) ? this.max : 100
    return [min, Math.max(min, max)]
  }

  private get segmented(): boolean {
    return Array.isArray(this.segments) && this.segments.length > 0
  }

  /** The value the bar and the tone use: `value`, or the segments' sum, clamped to the range. */
  get current(): number {
    const [min, max] = this.range
    const raw = this.segmented ? this.segments.reduce((sum, segment) => sum + positive(segment.value), min) : this.value
    return clamp(Number.isFinite(raw) ? raw : min, min, max)
  }

  /** How good the current value is, judged from `low`, `high` and `optimum` the way the native `<meter>` does. */
  get tone(): MeterTone {
    const [min, max] = this.range
    const low = clamp(this.low ?? min, min, max)
    const high = clamp(this.high ?? max, low, max)
    const optimum = clamp(this.optimum ?? (min + max) / 2, min, max)
    const value = this.current
    if (optimum < low) return value < low ? 'optimum' : value <= high ? 'suboptimum' : 'critical'
    if (optimum > high) return value > high ? 'optimum' : value >= low ? 'suboptimum' : 'critical'
    return value >= low && value <= high ? 'optimum' : 'suboptimum'
  }

  protected override updated(_changed: PropertyValues<this>): void {
    const tone = this.tone
    for (const state of TONES) {
      if (state === tone) this.internals.states.add(state)
      else this.internals.states.delete(state)
    }
  }

  private format(value: number, options?: Intl.NumberFormatOptions): string {
    try {
      return new Intl.NumberFormat(this.msg.locale, options).format(value)
    } catch {
      return new Intl.NumberFormat('en', options).format(value)
    }
  }

  /** The value as shown: `value-text`, the segments' total, or the percentage of the range. */
  private shownValue(): string {
    if (this.valueText) return this.valueText
    const [min, max] = this.range
    if (this.segmented) return this.msg.t('total', this.format(this.current), this.format(max))
    const fraction = max > min ? (this.current - min) / (max - min) : 0
    return this.format(fraction, { style: 'percent', maximumFractionDigits: 0 })
  }

  /** What a screen reader hears beyond the numbers: `value-text`, or each segment by name and the total. */
  private announcedValue(): string | undefined {
    if (this.valueText) return this.valueText
    if (!this.segmented) return undefined
    const parts = this.segments.map((segment) => this.msg.t('segment', segment.label, this.format(positive(segment.value))))
    return [...parts, this.shownValue()].join(', ')
  }

  override render() {
    const [min, max] = this.range
    const span = max - min
    const hasLabel = this.slotPresence.has('') || !!this.label
    const current = this.current
    const tone = this.tone
    return html`
      <div class="c2-meter">
        <div class="c2-meter-header" part="header">
          <span id="label" class="c2-meter-label" part="label" ?hidden=${!hasLabel}>
            <slot @slotchange=${this.slotPresence.handleSlotChange}>${this.label}</slot>
          </span>
          <span class="c2-meter-value" part="value" aria-hidden="true">
            <slot name="value" @slotchange=${this.slotPresence.handleSlotChange}>${this.shownValue()}</slot>
          </span>
        </div>
        <div
          class=${classMap({ 'c2-meter-track': true, [`is-${tone}`]: true })}
          part="track"
          role="meter"
          aria-labelledby=${hasLabel ? 'label' : nothing}
          aria-label=${hasLabel ? nothing : this.msg.t('label')}
          aria-valuemin=${String(min)}
          aria-valuemax=${String(max)}
          aria-valuenow=${String(current)}
          aria-valuetext=${ifDefined(this.announcedValue())}
        >
          ${this.segmented ? this.renderSegments(min, span) : this.renderIndicator(min, span)}
        </div>
        ${this.segmented ? this.renderLegend() : nothing}
      </div>
    `
  }

  private renderIndicator(min: number, span: number) {
    const width = span > 0 ? ((this.current - min) / span) * 100 : 0
    return html`<div class="c2-meter-indicator" part="indicator" style=${styleMap({ width: `${width}%` })}></div>`
  }

  private renderSegments(min: number, span: number) {
    // Each segment fills its share of the range; a sum past `max` is cut at the end of the track.
    let used = min
    return html`<div class="c2-meter-segments">
      ${this.segments.map((segment) => {
        const value = Math.min(positive(segment.value), min + span - used)
        used += value
        const width = span > 0 ? (value / span) * 100 : 0
        return html`<div
          class=${classMap({ 'c2-meter-segment': true, 'is-empty': width === 0 })}
          part="segment"
          style=${styleMap({ width: `${width}%`, backgroundColor: segment.color || undefined })}
        ></div>`
      })}
    </div>`
  }

  private renderLegend() {
    return html`<ul class="c2-meter-legend" part="legend" aria-hidden="true">
      ${this.segments.map(
        (segment) =>
          html`<li class="c2-meter-legend-item" part="legend-item">
            <span class="c2-meter-swatch" part="swatch" style=${styleMap({ backgroundColor: segment.color || undefined })}></span>
            <span class="c2-meter-legend-label">${segment.label}</span>
            <span class="c2-meter-legend-value">${this.format(positive(segment.value))}</span>
          </li>`,
      )}
    </ul>`
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-meter': Meter
  }
}
