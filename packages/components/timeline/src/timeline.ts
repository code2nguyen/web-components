import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TimelineItem, TimelineLayout } from './timeline-item.js'
import styles from './timeline.scss?inline'

import './timeline-item.js'

export type { TimelineItemTone, TimelineLayout } from './timeline-item.js'
export { TimelineItem } from './timeline-item.js'

/**
 * A vertical sequence of events: an order's history, a changelog, an activity feed, a project's milestones. Each
 * `c2-timeline-item` is a marker on a rail, a label, a timestamp and whatever content sits below them, and the rail
 * connects each entry to the next.
 *
 * `layout="stacked"` (the default) puts the timestamp under the label. `layout="split"` moves it into a column of
 * its own on the other side of the rail, which reads better when the dates are what the reader scans for.
 *
 * The timeline tells every entry which one is last, so the connector stops there — entries added or removed later
 * are picked up as they arrive. Entries need not be direct children: a wrapper element (or an Astro island) between
 * the timeline and its entries is looked through.
 *
 * Tone the marker with `tone` on an entry (`primary`, `success`, `warning`, `danger`), or put an icon in its
 * `marker` slot. Colour alone does not say what an entry means, so say it in the label too.
 *
 * @tag c2-timeline
 *
 * @slot - The `c2-timeline-item` entries, in order.
 *
 * @slotcomponent c2-timeline-item
 */
@customElement('c2-timeline')
export class Timeline extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Where each entry's timestamp goes: under its label, or in a column of its own before the rail. */
  @property({ reflect: true }) layout: TimelineLayout = 'stacked'

  /** Accessible name for the list. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Entries added, removed or rewrapped after the first render change which one is last. */
  private observer?: MutationObserver

  override connectedCallback() {
    super.connectedCallback()
    this.setAttribute('role', 'list')
    this.observer ??= new MutationObserver(() => this.syncItems())
    this.observer.observe(this, { subtree: true, childList: true })
  }

  override disconnectedCallback() {
    this.observer?.disconnect()
    super.disconnectedCallback()
  }

  protected override updated() {
    this.syncItems()
  }

  /** The entries of this timeline, looking through anything that is not one — but not into a nested timeline. */
  private static collectItems(root: ParentNode): TimelineItem[] {
    const found: TimelineItem[] = []
    for (const child of root.children) {
      if (child.tagName === 'C2-TIMELINE-ITEM') found.push(child as TimelineItem)
      else if (child.tagName !== 'C2-TIMELINE') found.push(...Timeline.collectItems(child))
    }
    return found
  }

  private syncItems() {
    const items = Timeline.collectItems(this)
    items.forEach((item, index) => {
      item.last = index === items.length - 1
      item.layout = this.layout
    })
  }

  override render() {
    return html`<slot @slotchange=${() => this.syncItems()}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-timeline': Timeline
  }
}
