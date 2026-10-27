import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { distributionBarMessages } from './messages'
import styles from './distribution-bar.scss?inline'

/** One part of the breakdown: a language in a repository, a browser in an issue's events, a status in a project. */
export interface DistributionItem {
  /** Name shown in the legend and the tooltip, and announced with the share. */
  label: string
  /** The part's size. Its share is `value` over the sum of every item's value; zero or less leaves it out. */
  value: number
  /** Fill colour. Without one the item takes the next of the eight `--c2-distribution-bar__segment-<n>--color`. */
  color?: string
  /** What `item-click` hands back for the item. Defaults to the label. */
  key?: string
}

/** One part as the bar draws it: an item, or the "Other" part that `max-items` folds the smallest into. */
export interface DistributionPart {
  key: string
  label: string
  value: number
  /** `value` over the total, from 0 to 1. */
  share: number
  color?: string
  /** Position among the drawn parts, which picks its palette colour. */
  index: number
  /** Whether this is the "Other" part, which sums the items past `max-items`. */
  other: boolean
  /** The items an "Other" part sums; empty for an ordinary part. */
  items: DistributionItem[]
}

/** Detail of `item-click`. */
export type DistributionItemClickDetail = DistributionPart

/** Events fired by `c2-distribution-bar`, keyed for `addEventListener`. */
export interface DistributionBarEventMap {
  'item-click': CustomEvent<DistributionItemClickDetail>
}

export interface DistributionBar {
  addEventListener: TypedAddEventListener<DistributionBar, DistributionBarEventMap>
  removeEventListener: TypedRemoveEventListener<DistributionBar, DistributionBarEventMap>
}

/** Every palette slot the stylesheet colours; the ninth part takes the first colour again. */
const PALETTE_SIZE = 8

/**
 * Splits a breakdown into parts: items with no positive value are left out, `sort` orders them, and when `maxItems`
 * is above zero and there are more, the smallest are folded into one "Other" part, so `maxItems` parts are drawn (at
 * least two: one kept part and "Other").
 */
export function distributionParts(
  items: readonly DistributionItem[],
  options: { sort?: 'none' | 'descending'; maxItems?: number; otherLabel?: string } = {},
): DistributionPart[] {
  const kept = items.filter((item) => item && typeof item.value === 'number' && Number.isFinite(item.value) && item.value > 0)
  const total = kept.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return []
  const ordered = options.sort === 'descending' ? [...kept].sort((a, b) => b.value - a.value) : kept
  // Folding into "Other" needs room for one kept part beside it, so a limit below two acts as two.
  const asked = Math.max(0, Math.trunc(options.maxItems ?? 0))
  const limit = asked > 0 ? Math.max(2, asked) : 0
  let shown = ordered
  let folded: DistributionItem[] = []
  if (limit > 0 && ordered.length > limit) {
    // The smallest go into "Other" whatever the order the rest are drawn in.
    const bySize = [...ordered].sort((a, b) => b.value - a.value)
    const keep = new Set(bySize.slice(0, limit - 1))
    shown = ordered.filter((item) => keep.has(item))
    folded = ordered.filter((item) => !keep.has(item))
  }
  const parts: DistributionPart[] = shown.map((item, index) => ({
    key: item.key ?? item.label,
    label: item.label,
    value: item.value,
    share: item.value / total,
    color: item.color,
    index,
    other: false,
    items: [],
  }))
  if (folded.length > 0) {
    const value = folded.reduce((sum, item) => sum + item.value, 0)
    parts.push({ key: '__other', label: options.otherLabel ?? 'Other', value, share: value / total, index: parts.length, other: true, items: folded })
  }
  return parts
}

/**
 * One 100% stacked bar that splits a whole into its parts, with a legend underneath: the languages of a repository,
 * the browsers behind an issue, the statuses of a project's tasks. Each item's segment is as wide as its share of the
 * total, and the legend lists the items with their shares (or values, or both, with `legend-content`). Hovering a
 * segment or a legend entry brings that part forward, dims the others and shows its share in a bubble over the bar.
 *
 * Unlike `c2-meter` it measures nothing against a range: the parts always fill the bar. Tiny parts keep a sliver of
 * `--c2-distribution-bar__segment--min-width` so they stay visible, and `max-items` folds the smallest into an "Other"
 * part when there are too many to tell apart.
 *
 * With `interactive`, each legend entry is a button and each segment clickable, and both fire `item-click`, the way a
 * tag breakdown filters an issue list by the value clicked.
 *
 * The bar is one image to a screen reader, named by the label and every part's share. In interactive mode the
 * legend's buttons carry that instead.
 *
 * @tag c2-distribution-bar
 *
 * @slot - Label shown above the bar; also its accessible name. Falls back to the `label` attribute.
 * @slot header-end - Content at the end of the label row, such as a total or a link.
 *
 * @event {CustomEvent<DistributionItemClickDetail>} item-click - Fired with `interactive` when a segment or a legend entry is activated. `detail` is the part: its `key`, `label`, `value` and `share`, and for "Other" the `items` it sums. Does not bubble.
 *
 * @csspart header - Row holding the label and the `header-end` slot.
 * @csspart label - Container of the label.
 * @csspart bar - The bar; carries `role="img"` unless `interactive`.
 * @csspart segment - Each part's segment of the bar.
 * @csspart tooltip - Bubble over the bar naming the hovered part.
 * @csspart legend - List of the parts under the bar.
 * @csspart legend-item - One entry of the legend; a button with `interactive`.
 * @csspart swatch - Colour mark of a legend entry.
 *
 * @cssproperty {pixel} [--c2-distribution-bar--width=100%] - Width of the bar; the host is a block.
 * @cssproperty {pixel} [--c2-distribution-bar--gap=8px] - Space between the header, the bar and the legend.
 * @cssproperty {time} [--c2-distribution-bar--transition-duration=150ms] - How long dimming and resizing take.
 *
 * @cssproperty {pixel} [--c2-distribution-bar__bar--height=8px]
 * @cssproperty {border-radius} [--c2-distribution-bar__bar--border-radius=999px] - Rounds the ends of the bar.
 * @cssproperty {color} [--c2-distribution-bar__bar--background-color=#e4e4e7] - Colour of the empty bar, when nothing has a value.
 *
 * @cssproperty {pixel} [--c2-distribution-bar__segment--gap=2px] - Space between two segments.
 * @cssproperty {pixel} [--c2-distribution-bar__segment--min-width=2px] - Narrowest a segment gets, so a tiny share stays visible.
 * @cssproperty {opacity} [--c2-distribution-bar__segment__dimmed--opacity=0.35] - Opacity of the other parts while one is hovered or focused.
 * @cssproperty {color} [--c2-distribution-bar__segment-1--color=#0265dc] - Fill of the 1st, 9th, 17th… part without a `color`. The eight follow the theme's chart series.
 * @cssproperty {color} [--c2-distribution-bar__segment-2--color=#ea580c]
 * @cssproperty {color} [--c2-distribution-bar__segment-3--color=#0f766e]
 * @cssproperty {color} [--c2-distribution-bar__segment-4--color=#db2777]
 * @cssproperty {color} [--c2-distribution-bar__segment-5--color=#a16207]
 * @cssproperty {color} [--c2-distribution-bar__segment-6--color=#7c3aed]
 * @cssproperty {color} [--c2-distribution-bar__segment-7--color=#0891b2]
 * @cssproperty {color} [--c2-distribution-bar__segment-8--color=#52525b]
 * @cssproperty {color} [--c2-distribution-bar__other--color=#a1a1aa] - Fill of the "Other" part.
 *
 * @cssproperty {color} [--c2-distribution-bar__label--color=#18181b]
 * @cssproperty {font-size} [--c2-distribution-bar__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-distribution-bar__label--font-weight=600]
 *
 * @cssproperty {display} [--c2-distribution-bar__legend--display=flex] - `none` hides the legend; the bar still names every part to a screen reader.
 * @cssproperty {pixel} [--c2-distribution-bar__legend--row-gap=4px] - Space between two rows of legend entries.
 * @cssproperty {pixel} [--c2-distribution-bar__legend--column-gap=16px] - Space between two legend entries on a row.
 * @cssproperty {color} [--c2-distribution-bar__legend--color=#18181b] - Colour of a legend entry's label.
 * @cssproperty {font-size} [--c2-distribution-bar__legend--font-size=12px]
 * @cssproperty {color} [--c2-distribution-bar__legend-value--color=#71717a] - Colour of a legend entry's share or value.
 * @cssproperty {pixel} [--c2-distribution-bar__swatch--size=8px]
 * @cssproperty {border-radius} [--c2-distribution-bar__swatch--border-radius=999px]
 * @cssproperty {outline} [--c2-distribution-bar__legend-item__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of an interactive legend entry.
 * @cssproperty {border-radius} [--c2-distribution-bar__legend-item--border-radius=4px] - Corners of the focus ring and hover fill of an interactive legend entry.
 * @cssproperty {color} [--c2-distribution-bar__legend-item__hover--background-color=#f4f4f5] - Fill behind an interactive legend entry under the pointer.
 *
 * @cssproperty {color} [--c2-distribution-bar__tooltip--background-color=#18181b]
 * @cssproperty {color} [--c2-distribution-bar__tooltip--color=#fafafa]
 * @cssproperty {font-size} [--c2-distribution-bar__tooltip--font-size=12px]
 * @cssproperty {padding} [--c2-distribution-bar__tooltip--padding=4px 8px]
 * @cssproperty {border-radius} [--c2-distribution-bar__tooltip--border-radius=6px]
 * @cssproperty {box-shadow} [--c2-distribution-bar__tooltip--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {display} [--c2-distribution-bar__tooltip--display=block] - `none` turns the hover bubble off; the hovered part is still brought forward.
 */
@customElement('c2-distribution-bar')
export class DistributionBar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The breakdown, `{ label, value, color?, key? }` in any unit. Accepts a JSON string as an attribute. */
  @property({ converter: jsonPropertyConverter }) items: DistributionItem[] = []

  /** Label when the default slot is empty. */
  @property() label = ''

  /** Orders the parts largest first; `none` (the default) keeps the order given. */
  @property() sort: 'none' | 'descending' = 'none'

  /** Most parts drawn; past it, the smallest items are summed into one "Other" part. `0` (the default) draws every item. */
  @property({ type: Number, attribute: 'max-items' }) maxItems = 0

  /** What each legend entry shows after its label: its `percent` share (the default), its `value`, or `both`. */
  @property({ attribute: 'legend-content' }) legendContent: 'percent' | 'value' | 'both' = 'percent'

  /** Most decimal places of a share. A share too small to show at it reads "<0.1%". */
  @property({ type: Number }) precision = 1

  /** Makes the legend entries buttons and the segments clickable, both firing `item-click`. */
  @property({ type: Boolean }) interactive = false

  /** The part brought forward by the pointer or the keyboard, by key. */
  @state() private active: string | null = null

  private readonly msg = new LocalizeController(this, distributionBarMessages)
  private readonly slotPresence = new SlotPresenceController(this, ['', 'header-end'])

  /** The parts as drawn: items with a value, sorted and folded as asked. */
  get parts(): DistributionPart[] {
    return distributionParts(Array.isArray(this.items) ? this.items : [], { sort: this.sort, maxItems: this.maxItems, otherLabel: this.msg.t('other') })
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('active') || changed.has('items')) this.placeTooltip()
  }

  /** A share as text: a percentage in the page's language, at `precision` places, or "<0.1%" for a sliver. */
  private formatShare(share: number): string {
    const digits = Math.max(0, Math.min(20, Math.trunc(Number.isFinite(this.precision) ? this.precision : 1)))
    const format = numberFormat(this.msg.locale, { style: 'percent', maximumFractionDigits: digits })
    const smallest = 10 ** -(digits + 2)
    if (share > 0 && share < smallest) return this.msg.t('below', format.format(smallest))
    return format.format(share)
  }

  private formatValue(value: number): string {
    return numberFormat(this.msg.locale, { maximumFractionDigits: 2 }).format(value)
  }

  private legendText(part: DistributionPart): string {
    if (this.legendContent === 'value') return this.formatValue(part.value)
    if (this.legendContent === 'both') return this.msg.t('both', this.formatShare(part.share), this.formatValue(part.value))
    return this.formatShare(part.share)
  }

  override render() {
    const parts = this.parts
    const hasLabel = this.slotPresence.has('') || !!this.label
    const summary = parts.length > 0 ? parts.map((part) => this.msg.t('part', part.label, this.formatShare(part.share))).join(', ') : this.msg.t('empty')
    const active = parts.find((part) => part.key === this.active)
    return html`
      <div class="header" part="header" ?hidden=${!hasLabel && !this.slotPresence.has('header-end')}>
        <span id="label" class="label" part="label" ?hidden=${!hasLabel}><slot @slotchange=${this.slotPresence.handleSlotChange}>${this.label}</slot></span>
        <span class="header-end"><slot name="header-end" @slotchange=${this.slotPresence.handleSlotChange}></slot></span>
      </div>
      <div class="track">
        <div
          class=${classMap({ bar: true, 'is-empty': parts.length === 0, 'has-active': !!active, 'is-interactive': this.interactive })}
          part="bar"
          role=${this.interactive ? nothing : 'img'}
          aria-labelledby=${this.interactive || !hasLabel ? nothing : 'label parts'}
          aria-label=${this.interactive || hasLabel ? nothing : this.msg.t('summary', this.msg.t('label'), summary)}
          aria-hidden=${this.interactive ? 'true' : nothing}
          @pointerleave=${this.clearActive}
        >
          ${parts.map(
            (part) =>
              html`<div
                class=${classMap({ segment: true, 'is-active': part.key === this.active, 'is-other': part.other })}
                part="segment"
                data-key=${part.key}
                data-slot=${String((part.index % PALETTE_SIZE) + 1)}
                style=${styleMap({ flexGrow: String(part.value), backgroundColor: part.color || undefined })}
                @pointerenter=${() => this.setActive(part.key)}
                @click=${() => this.activate(part)}
              ></div>`,
          )}
        </div>
        <!-- The bar's name is the label followed by this: the browser joins them, so a slotted label names it too, also as
          rendered by a server, which cannot read slotted text. -->
        <span id="parts" hidden>${summary}</span>
        <div class="tooltip" part="tooltip" aria-hidden="true" ?hidden=${!active}>
          ${active ? html`<span class="tooltip-label">${active.label}</span> <span class="tooltip-value">${this.msg.t('both', this.formatShare(active.share), this.formatValue(active.value))}</span>` : nothing}
        </div>
      </div>
      ${this.renderLegend(parts, hasLabel)}
    `
  }

  private renderLegend(parts: DistributionPart[], hasLabel: boolean) {
    if (parts.length === 0) return html`<p class="legend legend--empty" part="legend" aria-hidden="true">${this.msg.t('empty')}</p>`
    const entry = (part: DistributionPart) => html`
      <span
        class="swatch"
        part="swatch"
        data-slot=${String((part.index % PALETTE_SIZE) + 1)}
        style=${styleMap({ backgroundColor: part.color || undefined })}
      ></span>
      <span class="legend-label">${part.label}</span>
      <span class="legend-value">${this.legendText(part)}</span>
    `
    if (!this.interactive) {
      return html`<ul class="legend" part="legend" aria-hidden="true">
        ${parts.map(
          (part) =>
            html`<li
              class=${classMap({ 'legend-item': true, 'is-active': part.key === this.active, 'is-other': part.other })}
              part="legend-item"
              @pointerenter=${() => this.setActive(part.key)}
              @pointerleave=${this.clearActive}
            >
              ${entry(part)}
            </li>`,
        )}
      </ul>`
    }
    return html`<ul class="legend" part="legend" aria-labelledby=${hasLabel ? 'label' : nothing} aria-label=${hasLabel ? nothing : this.msg.t('label')}>
      ${parts.map(
        (part) =>
          html`<li class="legend-row">
            <button
              type="button"
              class=${classMap({ 'legend-item': true, 'is-active': part.key === this.active, 'is-other': part.other })}
              part="legend-item"
              aria-label=${this.msg.t('part', part.label, this.legendText(part))}
              @pointerenter=${() => this.setActive(part.key)}
              @pointerleave=${this.clearActive}
              @focus=${() => this.setActive(part.key)}
              @blur=${this.clearActive}
              @click=${() => this.activate(part)}
            >
              ${entry(part)}
            </button>
          </li>`,
      )}
    </ul>`
  }

  private setActive(key: string): void {
    this.active = key
  }

  private clearActive = (): void => {
    this.active = null
  }

  private activate(part: DistributionPart): void {
    if (!this.interactive) return
    this.dispatchEvent(new CustomEvent<DistributionItemClickDetail>('item-click', { detail: { ...part, items: [...part.items] } }))
  }

  /** Puts the bubble over the middle of the active segment, kept inside the bar by sliding it along with the segment. */
  private placeTooltip(): void {
    const tooltip = this.renderRoot.querySelector<HTMLElement>('.tooltip')
    const bar = this.renderRoot.querySelector<HTMLElement>('.bar')
    if (!tooltip || !bar || this.active === null) return
    const segment = [...bar.querySelectorAll<HTMLElement>('.segment')].find((element) => element.dataset.key === this.active)
    if (!segment || bar.clientWidth === 0) return
    const centre = segment.offsetLeft + segment.offsetWidth / 2
    const fraction = Math.min(1, Math.max(0, centre / bar.clientWidth))
    tooltip.style.left = `${centre}px`
    // The bubble's own point under the segment moves from its left edge to its right edge across the bar.
    tooltip.style.transform = `translateX(${-fraction * 100}%)`
  }
}

/** One `Intl.NumberFormat` per locale and options, shared by every bar and every render. */
const formats = new Map<string, Intl.NumberFormat>()

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formats.get(key)
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, options)
    } catch {
      // An invalid `lang` falls back to English rather than breaking the render.
      format = new Intl.NumberFormat('en', options)
    }
    formats.set(key, format)
  }
  return format
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-distribution-bar': DistributionBar
  }
}
