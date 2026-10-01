import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './kanban-column.scss?inline'

/** Internal protocol event: tells the parent board that a column's id, label or limit changed. Not public API. */
export const KANBAN_COLUMN_CHANGE_EVENT = 'c2-kanban-column-change'

/**
 * One column of a `c2-kanban` board. The column renders its own header (status dot, label, card count and an
 * optional soft limit) and the hint shown while it holds no card; the board renders the cards under it. Cards are not
 * children of the column: they are direct children of the board and name their column with `data-column`.
 *
 * @tag c2-kanban-column
 *
 * @slot actions - Controls placed at the end of the header, such as an add button or a menu trigger.
 * @slot empty - Content shown while the column holds no card. Defaults to "No cards".
 *
 * @csspart header - Row holding the dot, the label, the count and the actions.
 * @csspart dot - Status dot before the label.
 * @csspart label - Column name.
 * @csspart count - Card count, followed by the limit when one is set.
 * @csspart empty - Component-owned region wrapping the `empty` slot or its "No cards" fallback, shown while the column holds no card; styles placement, not assigned content.
 *
 * @cssproperty {padding} [--c2-kanban-column__header--padding=4px 6px] - Header padding.
 * @cssproperty {length} [--c2-kanban-column__header--gap=8px] - Space between the header's parts.
 * @cssproperty {length} [--c2-kanban-column__dot--size=8px] - Status dot diameter. `0px` hides it.
 * @cssproperty {color} [--c2-kanban-column__dot--background-color=#a1a1aa] - Status dot colour.
 * @cssproperty {color} [--c2-kanban-column__label--color=#18181b] - Label colour.
 * @cssproperty {font-size} [--c2-kanban-column__label--font-size=14px] - Label font size.
 * @cssproperty {font-weight} [--c2-kanban-column__label--font-weight=600] - Label font weight.
 * @cssproperty {color} [--c2-kanban-column__count--color=#71717a] - Count text colour.
 * @cssproperty {color} [--c2-kanban-column__count--background-color=#ffffff] - Count pill background.
 * @cssproperty {font-size} [--c2-kanban-column__count--font-size=12px] - Count font size.
 * @cssproperty {border-radius} [--c2-kanban-column__count--border-radius=999px] - Count pill radius.
 * @cssproperty {padding} [--c2-kanban-column__count--padding=0 7px] - Count pill padding.
 * @cssproperty {color} [--c2-kanban-column__count__over--color=#dc2626] - Count text colour while the column holds more cards than its limit.
 * @cssproperty {color} [--c2-kanban-column__count__over--background-color=#fef2f2] - Count pill background while over the limit.
 * @cssproperty {border} [--c2-kanban-column__empty--border=1px dashed #bcbcc6] - Border of the empty hint.
 * @cssproperty {border-radius} [--c2-kanban-column__empty--border-radius=6px] - Radius of the empty hint.
 * @cssproperty {padding} [--c2-kanban-column__empty--padding=16px 8px] - Padding of the empty hint.
 * @cssproperty {length} [--c2-kanban-column__empty--margin-top=8px] - Space between the header and the empty hint.
 * @cssproperty {color} [--c2-kanban-column__empty--color=#71717a] - Text colour of the empty hint.
 * @cssproperty {color} [--c2-kanban-column__empty--background-color=#ffffff] - Background of the empty hint.
 * @cssproperty {font-size} [--c2-kanban-column__empty--font-size=14px] - Font size of the empty hint.
 */
@customElement('c2-kanban-column')
export class KanbanColumn extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Identifier the cards of this column carry in `data-column`, and that `card-move` reports. */
  @property({ type: String, attribute: 'column-id' }) columnId = ''

  /** Column name shown in the header and used as the accessible name of its card list. */
  @property({ type: String }) label = ''

  /** Soft work-in-progress limit. Over it the count turns to the over colour; cards can still be dropped. `0` means none. */
  @property({ type: Number }) limit = 0

  /** Number of cards the board currently shows in this column. Set by the parent `c2-kanban`; read-only for applications. */
  @state() cardCount = 0

  /** Whether the column holds more cards than its `limit`. */
  get overLimit(): boolean {
    return this.limit > 0 && this.cardCount > this.limit
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('columnId') || changed.has('label') || changed.has('limit')) {
      this.dispatchEvent(new CustomEvent(KANBAN_COLUMN_CHANGE_EVENT, { bubbles: true }))
    }
  }

  protected override render(): TemplateResult {
    const over = this.overLimit
    return html`
      <div part="header" class="header">
        <span part="dot" class="dot"></span>
        <span part="label" class="label">${this.label}</span>
        <span part="count" class=${classMap({ count: true, 'count--over': over })}>
          ${this.cardCount}${this.limit > 0 ? html`<span class="limit"> / ${this.limit}</span>` : nothing}
        </span>
        <span class="spacer"></span>
        <slot name="actions"></slot>
      </div>
      <div part="empty" class="empty" ?hidden=${this.cardCount > 0}>
        <slot name="empty">No cards</slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-kanban-column': KanbanColumn
  }
}
