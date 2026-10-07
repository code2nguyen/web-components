import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import './description-item.js'
import styles from './description-list.scss?inline'

export { DescriptionItem } from './description-item.js'

/**
 * Read-only key/value pairs for a detail page: the Descriptions of antd and the DescriptionList of Polaris. Each
 * `c2-description-item` child is one pair. The items flow into as many columns as fit, up to
 * `--c2-description-list__grid--columns`, each at least `--c2-description-list__grid--min-column-width` wide, so the
 * same markup is three columns on a wide page and one on a phone without a media query. An item spans the full row
 * with `--c2-description-item--grid-column: 1 / -1`.
 *
 * Whether a label sits above its value or beside it is CSS too: `--c2-description-item__label--width` set to a
 * length puts the label beside the value, and the value still wraps under it when the item is narrower than the
 * label plus `--c2-description-item__value--min-width`. Set the item variables on the list and every item inherits them.
 *
 * The list is exposed as a `list` and every item as a `listitem` holding a `term` and its `definition`.
 *
 * ```html
 * <c2-description-list aria-label="Customer">
 *   <c2-description-item label="Name">Ada Lovelace</c2-description-item>
 *   <c2-description-item label="Email">ada@example.com</c2-description-item>
 *   <c2-description-item label="Plan">Business</c2-description-item>
 * </c2-description-list>
 * ```
 *
 * @tag c2-description-list
 *
 * @slot - The `c2-description-item` pairs.
 * @slot heading - Title shown above the pairs, such as `<h3>Billing details</h3>`.
 * @slot actions - Controls shown at the end of the header row, such as an Edit button.
 *
 * @csspart header - The header row above the grid. It contains the heading slot and, at its end, the actions slot; hidden while both slots are empty.
 * @csspart grid - The grid the items are laid out in.
 *
 * @cssproperty {number} [--c2-description-list__grid--columns=3] - Most columns the items flow into.
 * @cssproperty {pixel} [--c2-description-list__grid--min-column-width=200px] - Narrowest a column gets before the items wrap to fewer columns.
 * @cssproperty {pixel} [--c2-description-list__grid--column-gap=24px]
 * @cssproperty {pixel} [--c2-description-list__grid--row-gap=16px]
 *
 * @cssproperty {padding} [--c2-description-list__container--padding=0px]
 * @cssproperty {border} [--c2-description-list__container--border=none]
 * @cssproperty {border-radius} [--c2-description-list__container--border-radius=0px]
 * @cssproperty {color} [--c2-description-list__container--background-color=transparent]
 * @cssproperty {font-family} [--c2-description-list__container--font-family=inherit]
 *
 * @cssproperty {pixel} [--c2-description-list__header--gap=12px] - Space between the heading and the actions.
 * @cssproperty {pixel} [--c2-description-list__header--margin-bottom=16px] - Space between the header and the pairs.
 * @cssproperty {padding} [--c2-description-list__header--padding=0px]
 * @cssproperty {border} [--c2-description-list__header--border-bottom=none]
 * @cssproperty {color} [--c2-description-list__header--color=#18181b]
 * @cssproperty {pixel} [--c2-description-list__header--font-size=16px]
 * @cssproperty {font-weight} [--c2-description-list__header--font-weight=600]
 *
 * @slotcomponent c2-description-item
 */
@customElement('c2-description-list')
export class DescriptionList extends LitElement {
  static override styles = unsafeCSS(styles)

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  private readonly slotPresence = new SlotPresenceController(this, ['heading', 'actions'])

  override connectedCallback() {
    super.connectedCallback()
    this.internals.role = 'list'
  }

  override render() {
    const hasHeader = this.slotPresence.has('heading') || this.slotPresence.has('actions')
    return html`
      <div class="c2-description-list">
        <div class=${classMap({ header: true, 'has-actions': this.slotPresence.has('actions') })} part="header" ?hidden=${!hasHeader}>
          <div class="heading"><slot name="heading" @slotchange=${this.slotPresence.handleSlotChange}></slot></div>
          <div class="actions"><slot name="actions" @slotchange=${this.slotPresence.handleSlotChange}></slot></div>
        </div>
        <div class="grid" part="grid"><slot></slot></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-description-list': DescriptionList
  }
}
