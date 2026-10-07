import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './menu-row.scss?inline'

/**
 * A row of small choices inside a `c2-menu`: colour swatches, shapes, icons. Its `c2-menu-item` children sit side by
 * side and show only their `prefix-icon`; the label (`label`, or the slotted text) becomes their accessible name, and a
 * checked one is ringed instead of ticked.
 *
 * The menu treats the row as one line: ArrowLeft and ArrowRight move along it, ArrowUp and ArrowDown leave it for the
 * line above or below. Its items take part in the menu's radio groups, typeahead and `menu-select` like any row, and do
 * not reserve the check-mark column of the menu's other rows.
 *
 * @tag c2-menu-row
 *
 * Name the row with an `aria-label`, such as "Colour".
 *
 * @slot default - The `c2-menu-item` choices, each with its look in `prefix-icon`.
 *
 * @cssproperty {pixel} [--c2-menu-row--gap=4px] - Space between two choices.
 * @cssproperty {padding} [--c2-menu-row--padding=2px 4px 6px] - Space around the choices.
 */
@customElement('c2-menu-row')
export class MenuRow extends LitElement {
  static override styles = unsafeCSS(styles)

  // Semantics on ElementInternals, so the row never writes attributes on itself.
  private readonly internals = this.attachInternals()

  override connectedCallback() {
    super.connectedCallback()
    this.internals.role = 'group'
  }

  override render() {
    return html`<div class="row"><slot></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-menu-row': MenuRow
  }
}
