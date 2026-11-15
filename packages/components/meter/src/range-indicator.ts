import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import type { MeterTone } from './meter'
import { clamp, finite, numberFormat } from './meter-format'
import { rangeIndicatorMessages } from './range-indicator-messages'
import styles from './range-indicator.scss?inline'

/** One labelled stretch of a range indicator's scale: "Normal", "Prediabetes", a salary band's "Mid". */
export interface RangeIndicatorBand {
  /** Name shown under the band, beside the value while the value is in it, and announced with the value. */
  label: string
  /** Where the band starts, in scale units. Defaults to the end of the band before it, or `min` for the first. */
  from?: number
  /**
   * Where the band ends, in scale units, defaulting to `max`. A value equal to `to` belongs to the next band, so a
   * normal range of 70 to 99 is written `{ "from": 70, "to": 100 }`; the band that ends at `max` keeps `max`.
   */
  to?: number
  /** How good a value in this band is: colours the band and is exposed as `:state(<tone>)` while the value is in it. */
  tone?: MeterTone
  /** Fill colour, in place of the tone's. */
  color?: string
}

interface ResolvedBand {
  band: RangeIndicatorBand
  start: number
  end: number
  /** The next band starts where this one ends, so a gap separates them. */
  joined: boolean
}

const STATES = ['optimum', 'suboptimum', 'critical', 'below-scale', 'above-scale'] as const

/**
 * One value placed on a banded scale: a lab result against its reference ranges, a salary inside its pay band, a
 * PHQ-9 or BMI score against its categories. The bands are drawn side by side along a track with their labels under
 * them and the numbers where they meet; a pointer marks the value, and the label of the band it falls in shows beside
 * the value. A value outside `min`–`max` pins the pointer to that end as an arrow pointing off the scale, and still
 * counts in the first or last band.
 *
 * A band's `tone` (`optimum`, `suboptimum`, `critical`, as in `c2-meter`) colours it, and while the value is in it the
 * host matches `:state(<tone>)`; `:state(below-scale)` and `:state(above-scale)` say the value is off the scale.
 *
 * It is announced as a meter through its own semantics: its label as the name, and the shown value followed by the
 * band's label as the value.
 *
 * @tag c2-range-indicator
 *
 * @slot - Label shown above the scale; also the accessible name. Falls back to the `label` attribute.
 * @slot value - Replaces the value shown beside the label. Announced text still comes from `value-text`.
 *
 * @csspart header - Row holding the label, the value and the band label.
 * @csspart label - Container of the label.
 * @csspart value - Text region containing the custom `value` slot, or its fallback: `value-text` or the number.
 * @csspart status - Label of the band the value falls in, beside the value.
 * @csspart scale - The track and the pointer above it.
 * @csspart track - The whole scale from `min` to `max`, under the bands.
 * @csspart band - Each band on the track.
 * @csspart pointer - Mark at the value; an arrow at the end of the scale while the value is off it.
 * @csspart band-labels - Row of the bands' labels under the track.
 * @csspart band-label - One band's label, centred under its band.
 * @csspart ticks - Row of the numbers where bands start and end.
 * @csspart tick - One number on the scale.
 *
 * @cssproperty {pixel} [--c2-range-indicator--width=100%] - Width of the indicator; the host is a block.
 * @cssproperty {pixel} [--c2-range-indicator--gap=6px] - Space between the header, the scale and the rows under it.
 *
 * @cssproperty {pixel} [--c2-range-indicator__track--height=8px]
 * @cssproperty {border-radius} [--c2-range-indicator__track--border-radius=999px] - Rounds the ends of the scale.
 * @cssproperty {color} [--c2-range-indicator__track--background-color=#e4e4e7] - Colour of the scale where no band is, and of the gaps between bands.
 *
 * @cssproperty {pixel} [--c2-range-indicator__band--gap=2px] - Space between two bands that meet.
 * @cssproperty {color} [--c2-range-indicator__band--background-color=#a1a1aa] - Fill of a band without a tone.
 * @cssproperty {color} [--c2-range-indicator__band__optimum--background-color=#16a34a] - Fill of an optimum band.
 * @cssproperty {color} [--c2-range-indicator__band__suboptimum--background-color=#d97706] - Fill of a sub-optimum band.
 * @cssproperty {color} [--c2-range-indicator__band__critical--background-color=#dc2626] - Fill of a critical band.
 *
 * @cssproperty {color} [--c2-range-indicator__pointer--color=#18181b]
 * @cssproperty {pixel} [--c2-range-indicator__pointer--size=12px] - Width of the pointer; its height is three quarters of it.
 *
 * @cssproperty {pixel} [--c2-range-indicator__header--gap=6px] - Space between the label, the value and the band label.
 * @cssproperty {color} [--c2-range-indicator__label--color=#18181b]
 * @cssproperty {font-size} [--c2-range-indicator__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-range-indicator__label--font-weight=500]
 * @cssproperty {color} [--c2-range-indicator__value--color=#71717a]
 * @cssproperty {font-size} [--c2-range-indicator__value--font-size=14px]
 * @cssproperty {font-weight} [--c2-range-indicator__value--font-weight=400]
 * @cssproperty {color} [--c2-range-indicator__status--color=#18181b]
 * @cssproperty {font-size} [--c2-range-indicator__status--font-size=14px]
 * @cssproperty {font-weight} [--c2-range-indicator__status--font-weight=500]
 * @cssproperty {display} [--c2-range-indicator__status--display=inline] - `none` hides the band label beside the value; it is still announced.
 *
 * @cssproperty {display} [--c2-range-indicator__band-labels--display=block] - `none` hides the labels under the bands.
 * @cssproperty {color} [--c2-range-indicator__band-label--color=#18181b]
 * @cssproperty {display} [--c2-range-indicator__ticks--display=block] - `none` hides the numbers of the scale.
 * @cssproperty {color} [--c2-range-indicator__tick--color=#71717a]
 * @cssproperty {font-size} [--c2-range-indicator__tick--font-size=12px] - Size of the band labels and of the numbers.
 */
@customElement('c2-range-indicator')
export class RangeIndicator extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The value to place on the scale. Outside `min`–`max` the pointer stays at that end. */
  @property({ type: Number }) value = 0

  /** Start of the scale. */
  @property({ type: Number }) min = 0

  /** End of the scale. */
  @property({ type: Number }) max = 100

  /**
   * The bands, `{ label, from?, to?, tone?, color? }` in scale units, in order along the scale. Each starts where the
   * one before it ends unless it sets `from`; the scale shows its track where no band is. Accepts a JSON string as an
   * attribute.
   */
  @property({ converter: jsonPropertyConverter }) bands: RangeIndicatorBand[] = []

  /** Label when the default slot is empty. */
  @property() label = ''

  /** Words for the value ("112 mg/dL"), shown and announced in place of the number. */
  @property({ attribute: 'value-text' }) valueText = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, rangeIndicatorMessages)
  private readonly slotPresence = new SlotPresenceController(this, [''])
  /** Redraws when the label's text changes in place, which fires no `slotchange`, so the host's name follows it. */
  private readonly labelObserver = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => this.requestUpdate())

  constructor() {
    super()
    this.internals.role = 'meter'
  }

  /** Start and end of the scale, with a `max` below `min` treated as equal to it. */
  private get range(): [number, number] {
    const min = finite(this.min) ?? 0
    return [min, Math.max(min, finite(this.max) ?? 100)]
  }

  /** The bands placed on the scale, clamped to it; empty bands are left out. */
  private get resolved(): ResolvedBand[] {
    const [min, max] = this.range
    const list: ResolvedBand[] = []
    let previous = min
    for (const band of Array.isArray(this.bands) ? this.bands : []) {
      if (!band || typeof band !== 'object') continue
      const start = clamp(finite(band.from) ?? previous, min, max)
      const end = clamp(finite(band.to) ?? max, start, max)
      previous = end
      if (end > start) list.push({ band, start, end, joined: false })
    }
    list.forEach((item, index) => (item.joined = list[index + 1]?.start === item.end))
    return list
  }

  /** The band the value falls in, a value off the scale counting in the band at that end; undefined between bands. */
  get band(): RangeIndicatorBand | undefined {
    const [, max] = this.range
    const value = this.placed
    return this.resolved.find(({ start, end }) => value >= start && (value < end || end === max))?.band
  }

  /** The value on the scale: `value` clamped to `min`–`max`. */
  private get placed(): number {
    const [min, max] = this.range
    return clamp(finite(this.value) ?? min, min, max)
  }

  /** Which end of the scale the value is past, if any. */
  private get offScale(): 'below-scale' | 'above-scale' | undefined {
    const [min, max] = this.range
    const value = finite(this.value) ?? min
    return value < min ? 'below-scale' : value > max ? 'above-scale' : undefined
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.labelObserver?.observe(this, { childList: true, subtree: true, characterData: true })
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.labelObserver?.disconnect()
  }

  /** Text of the label children, read from the light DOM so a server-rendered label names the host too. */
  private get labelText(): string {
    return Array.from(this.childNodes)
      .filter((node) => !(node instanceof Element && node.hasAttribute('slot')))
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private format(value: number): string {
    return numberFormat(this.msg.locale).format(value)
  }

  protected override updated(_changed: PropertyValues<this>): void {
    const [min, max] = this.range
    const band = this.band
    const shown = this.valueText || this.format(finite(this.value) ?? min)
    const active = new Set<string | undefined>([band?.tone, this.offScale])
    for (const name of STATES) {
      if (active.has(name)) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
    this.internals.ariaLabel = this.labelText || this.label || this.msg.t('label')
    this.internals.ariaValueMin = String(min)
    this.internals.ariaValueMax = String(max)
    this.internals.ariaValueNow = String(this.placed)
    this.internals.ariaValueText = band?.label ? this.msg.t('valueInBand', shown, band.label) : shown
  }

  override render() {
    const [min, max] = this.range
    const span = max - min
    const at = (value: number) => (span > 0 ? ((value - min) / span) * 100 : 0)
    const bands = this.resolved
    const band = this.band
    const offScale = this.offScale
    const hasLabel = this.slotPresence.has('') || !!this.label
    // The numbers where bands start and end, inside the scale.
    const ticks = [...new Set(bands.flatMap(({ start, end }) => [start, end]))].filter((value) => value > min && value < max).sort((a, b) => a - b)
    return html`
      <div class="c2-range-indicator" aria-hidden="true">
        <div class="c2-range-indicator-header" part="header">
          <span class="c2-range-indicator-label" part="label" ?hidden=${!hasLabel}>
            <slot @slotchange=${this.slotPresence.handleSlotChange}>${this.label}</slot>
          </span>
          <span class="c2-range-indicator-value" part="value">
            <slot name="value">${this.valueText || this.format(finite(this.value) ?? min)}</slot>
          </span>
          ${band?.label ? html`<span class="c2-range-indicator-status" part="status">${band.label}</span>` : nothing}
        </div>
        <div class="c2-range-indicator-scale" part="scale">
          <div class="c2-range-indicator-track" part="track">
            ${bands.map(
              (item) =>
                html`<div
                  class=${classMap({ 'c2-range-indicator-band': true, [`is-${item.band.tone}`]: !!item.band.tone, 'is-joined': item.joined })}
                  part="band"
                  style=${styleMap({
                    insetInlineStart: `${at(item.start)}%`,
                    width: `${at(item.end) - at(item.start)}%`,
                    backgroundColor: item.band.color || undefined,
                  })}
                ></div>`,
            )}
          </div>
          <div
            class=${classMap({ 'c2-range-indicator-pointer': true, [`is-${offScale}`]: !!offScale })}
            part="pointer"
            style=${styleMap({ insetInlineStart: `${at(this.placed)}%` })}
          ></div>
        </div>
        <div class="c2-range-indicator-band-labels" part="band-labels" ?hidden=${bands.length === 0}>
          ${bands.map(
            (item) =>
              html`<span
                class="c2-range-indicator-band-label"
                part="band-label"
                style=${styleMap({ insetInlineStart: `${at(item.start)}%`, width: `${at(item.end) - at(item.start)}%` })}
                >${item.band.label}</span
              >`,
          )}
        </div>
        <div class="c2-range-indicator-ticks" part="ticks" ?hidden=${ticks.length === 0}>
          ${ticks.map(
            (value) =>
              html`<span class="c2-range-indicator-tick" part="tick" style=${styleMap({ insetInlineStart: `${at(value)}%` })}
                ><span>${this.format(value)}</span></span
              >`,
          )}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-range-indicator': RangeIndicator
  }
}
