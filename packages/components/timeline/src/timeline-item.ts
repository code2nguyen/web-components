import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import styles from './timeline-item.scss?inline'

/** What an entry means, drawn as the colour of its marker. */
export type TimelineItemTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

/** How a `c2-timeline` lays its entries out. */
export type TimelineLayout = 'stacked' | 'split'

/**
 * One entry of a `c2-timeline`: a marker on the rail, a label, a timestamp and any content below them. The
 * connector running down to the next entry is drawn by the entry itself and stops at the last one.
 *
 * Text can come from attributes for the common case (`label`, `timestamp`) or be replaced by slots when it needs
 * markup — a link in the label, a relative time element in the timestamp. The default slot is the entry's
 * content: a sentence, a card, a code block, anything.
 *
 * `datetime` gives the timestamp a machine-readable value, so it renders as a `<time datetime>` element.
 *
 * @tag c2-timeline-item
 *
 * @slot - The entry's content, below the label and timestamp.
 * @slot label - Replaces the `label` text.
 * @slot timestamp - Replaces the `timestamp` text.
 * @slot marker - An icon drawn inside the marker. Grow `--c2-timeline-item__marker--size` to make room for it.
 *
 * @csspart marker - The marker box on the rail, wrapping the assigned `marker` slot icon; empty, it draws a plain dot.
 * @csspart connector - The line from this entry's marker down to the next entry.
 * @csspart label - Container of the label text or `label` slot.
 * @csspart timestamp - Container of the timestamp text or `timestamp` slot.
 * @csspart content - Container of the default slot.
 *
 * @cssproperty {pixel} [--c2-timeline-item--gap=12px] - Space between the rail and the text, and between the timestamp column and the rail in the split layout.
 * @cssproperty {pixel} [--c2-timeline-item--padding-bottom=24px] - Space below an entry before the next one. The connector runs through it; the last entry drops it.
 * @cssproperty {pixel} [--c2-timeline-item__marker--size=12px]
 * @cssproperty {color} [--c2-timeline-item__marker--background=#ffffff]
 * @cssproperty {border} [--c2-timeline-item__marker--border=2px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-timeline-item__marker--border-radius=999px]
 * @cssproperty {color} [--c2-timeline-item__marker--color=#71717a] - Colour of an icon in the `marker` slot.
 * @cssproperty {color} [--c2-timeline-item__marker__primary--border-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-timeline-item__marker__primary--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-timeline-item__marker__success--border-color=#15803d]
 * @cssproperty {color} [--c2-timeline-item__marker__success--color=#15803d]
 * @cssproperty {color} [--c2-timeline-item__marker__warning--border-color=#a16207]
 * @cssproperty {color} [--c2-timeline-item__marker__warning--color=#a16207]
 * @cssproperty {color} [--c2-timeline-item__marker__danger--border-color=#dc2626]
 * @cssproperty {color} [--c2-timeline-item__marker__danger--color=#dc2626]
 * @cssproperty {pixel} [--c2-timeline-item__connector--width=2px]
 * @cssproperty {color} [--c2-timeline-item__connector--background=#e4e4e7]
 * @cssproperty {pixel} [--c2-timeline-item__connector--gap=4px] - Space between a marker and the connector below it.
 * @cssproperty {font-size} [--c2-timeline-item__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-timeline-item__label--font-weight=500]
 * @cssproperty {pixel} [--c2-timeline-item__label--line-height=20px] - Also centres the marker on the label's first line.
 * @cssproperty {color} [--c2-timeline-item__label--color=#18181b]
 * @cssproperty {font-size} [--c2-timeline-item__timestamp--font-size=12px]
 * @cssproperty {pixel} [--c2-timeline-item__timestamp--line-height=20px]
 * @cssproperty {color} [--c2-timeline-item__timestamp--color=#71717a]
 * @cssproperty {pixel} [--c2-timeline-item__timestamp__split--width=96px] - Width of the timestamp column in the split layout.
 * @cssproperty {font-size} [--c2-timeline-item__content--font-size=14px]
 * @cssproperty {color} [--c2-timeline-item__content--color=#71717a]
 * @cssproperty {pixel} [--c2-timeline-item__content--margin-top=4px]
 */
@customElement('c2-timeline-item')
export class TimelineItem extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Plain-text label. Use the `label` slot for markup. */
  @property() label = ''

  /** Plain-text timestamp, shown as written. Use the `timestamp` slot for markup. */
  @property() timestamp = ''

  /** Machine-readable date or time of the entry, e.g. `2026-09-29T14:30`. Rendered as the timestamp's `datetime`. */
  @property() datetime?: string

  /** What the entry means, drawn as the colour of its marker. */
  @property({ reflect: true }) tone: TimelineItemTone = 'neutral'

  /** Whether this is the last entry, so the connector stops here. Written by `c2-timeline`. */
  @property({ attribute: false }) last = false

  /** The layout of the timeline this entry belongs to. Written by `c2-timeline`. */
  @property({ attribute: false }) layout: TimelineLayout = 'stacked'

  @state() private slotted = { label: false, timestamp: false, content: false }

  override connectedCallback() {
    super.connectedCallback()
    this.setAttribute('role', 'listitem')
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    // Presentation hooks for the stylesheet only; neither is a public attribute.
    if (changed.has('last')) this.toggleAttribute('last', this.last)
    if (changed.has('layout')) this.toggleAttribute('split', this.layout === 'split')
  }

  private onSlotChange(key: keyof TimelineItem['slotted'], event: Event) {
    const slot = event.target as HTMLSlotElement
    const filled = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || !!node.textContent?.trim())
    if (this.slotted[key] !== filled) this.slotted = { ...this.slotted, [key]: filled }
  }

  override render() {
    const hasLabel = !!this.label || this.slotted.label
    const hasTimestamp = !!this.timestamp || this.slotted.timestamp
    const timestamp = html`<slot name="timestamp" @slotchange=${(event: Event) => this.onSlotChange('timestamp', event)}>${this.timestamp}</slot>`
    return html`
      <div class="rail" aria-hidden="true">
        <span class="marker" part="marker"><slot name="marker"></slot></span>
        <span class="connector" part="connector"></span>
      </div>
      <div class="label" part="label" ?hidden=${!hasLabel}>
        <slot name="label" @slotchange=${(event: Event) => this.onSlotChange('label', event)}>${this.label}</slot>
      </div>
      <div class="timestamp" part="timestamp" ?hidden=${!hasTimestamp}>
        ${this.datetime ? html`<time datetime=${this.datetime}>${timestamp}</time>` : timestamp}
      </div>
      <div class="content" part="content" ?hidden=${!this.slotted.content}>
        <slot @slotchange=${(event: Event) => this.onSlotChange('content', event)}></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-timeline-item': TimelineItem
  }
}
