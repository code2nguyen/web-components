import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
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
 * The host exposes what its timeline told it as custom states, never as attributes: `c2-timeline-item:state(last)`
 * on the last entry and `:state(split)` in a `layout="split"` timeline.
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

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

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

  /**
   * Whether the label, timestamp and content slots are filled. Read from the light DOM rather than from `slotchange`
   * alone: a server-rendered slot fires `slotchange` before the element hydrates, so an entry would keep its content
   * hidden.
   */
  private readonly slotPresence = new SlotPresenceController(this, ['label', 'timestamp', ''])

  override connectedCallback() {
    super.connectedCallback()
    this.internals.role = 'listitem'
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    // Presentation hooks for the stylesheet, as custom states rather than host attributes: the timeline sets both
    // while the page upgrades, so an attribute would make a server-rendered entry differ from the hydrated one.
    if (changed.has('last')) this.toggleState('last', this.last)
    if (changed.has('layout')) this.toggleState('split', this.layout === 'split')
  }

  private toggleState(name: string, on: boolean) {
    if (on) this.internals.states.add(name)
    else this.internals.states.delete(name)
  }

  override render() {
    const hasLabel = !!this.label || this.slotPresence.has('label')
    const hasTimestamp = !!this.timestamp || this.slotPresence.has('timestamp')
    const timestamp = html`<slot name="timestamp" @slotchange=${this.slotPresence.handleSlotChange}>${this.timestamp}</slot>`
    return html`
      <div class="rail" aria-hidden="true">
        <span class="marker" part="marker"><slot name="marker"></slot></span>
        <span class="connector" part="connector"></span>
      </div>
      <div class="label" part="label" ?hidden=${!hasLabel}>
        <slot name="label" @slotchange=${this.slotPresence.handleSlotChange}>${this.label}</slot>
      </div>
      <div class="timestamp" part="timestamp" ?hidden=${!hasTimestamp}>
        ${this.datetime ? html`<time datetime=${this.datetime}>${timestamp}</time>` : timestamp}
      </div>
      <div class="content" part="content" ?hidden=${!this.slotPresence.has('')}>
        <slot @slotchange=${this.slotPresence.handleSlotChange}></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-timeline-item': TimelineItem
  }
}
