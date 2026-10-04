import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import styles from './kanban-column.scss?inline'

/** Internal protocol event: tells the parent board that a column's id, label or limit changed. Not public API. */
export const KANBAN_COLUMN_CHANGE_EVENT = 'c2-kanban-column-change'

/** One card as the board hands it to a column. Internal protocol between `c2-kanban` and `c2-kanban-column`. */
export interface KanbanCardView {
  key: string
  /** What `renderItem` returned, or the default title and description. */
  content: unknown
  /** Stands in for the card being dragged: the gap where it will land. */
  placeholder?: boolean
  /** Picked up with the keyboard. */
  picked?: boolean
  /** The board's one tab stop. */
  tabbable?: boolean
  /** Height of the placeholder: the dragged card's height. */
  height?: number
}

let instanceCount = 0

/**
 * One column of a `c2-kanban` board: a header, the column's cards and a footer. The board decides which cards a column
 * shows and handles moving them; the column only lays them out. The header shows the label and the card count (with
 * the soft `limit`) unless the `header` slot replaces it.
 *
 * @tag c2-kanban-column
 *
 * @slot header - Replaces the default header (label, count and limit) above the cards.
 * @slot footer - Content below the cards, such as an add-card control or a summary.
 * @slot empty - Content shown while the column holds no card. Defaults to "No cards".
 *
 * @csspart column - Box of the column: header, cards and footer.
 * @csspart header - Component-owned region wrapping the `header` slot or its default label and count; styles placement, not assigned content.
 * @csspart label - Column name in the default header.
 * @csspart count - Card count in the default header, followed by the limit when one is set.
 * @csspart cards - List of the column's cards.
 * @csspart card - Box around one card's rendered content; carries the focus ring and the drag lift.
 * @csspart placeholder - Gap marking where a dragged card will land.
 * @csspart empty - Component-owned region wrapping the `empty` slot or its "No cards" fallback, shown while the column holds no card; styles placement, not assigned content.
 * @csspart footer - Component-owned region wrapping the `footer` slot below the cards; styles placement, not assigned content.
 *
 * @cssproperty {length} [--c2-kanban-column--width=272px] - Column width.
 * @cssproperty {length} [--c2-kanban-column--max-height=none] - Maximum column height. Pair it with `--c2-kanban-column__cards--overflow-y: auto` so a long card list scrolls.
 * @cssproperty {padding} [--c2-kanban-column--padding=8px] - Column padding.
 * @cssproperty {length} [--c2-kanban-column--gap=8px] - Space between the header, the cards and the footer.
 * @cssproperty {color} [--c2-kanban-column--background-color=#f4f4f5] - Column background.
 * @cssproperty {border} [--c2-kanban-column--border=1px solid transparent] - Column border.
 * @cssproperty {border-radius} [--c2-kanban-column--border-radius=8px] - Column radius.
 * @cssproperty {color} [--c2-kanban-column__target--border-color=rgb(2, 101, 220)] - Border colour while a dragged card is over the column.
 * @cssproperty {color} [--c2-kanban-column__target--background-color=#edf1fe] - Background while a dragged card is over the column.
 * @cssproperty {color} [--c2-kanban-column__over--border-color=#dc2626] - Border colour while the column holds more cards than its limit.
 * @cssproperty {padding} [--c2-kanban-column__header--padding=4px 6px] - Header padding.
 * @cssproperty {length} [--c2-kanban-column__header--gap=8px] - Space between the label and the count.
 * @cssproperty {color} [--c2-kanban-column__label--color=#18181b] - Label colour.
 * @cssproperty {font-size} [--c2-kanban-column__label--font-size=14px] - Label font size.
 * @cssproperty {font-weight} [--c2-kanban-column__label--font-weight=600] - Label font weight.
 * @cssproperty {color} [--c2-kanban-column__count--color=#71717a] - Count text colour.
 * @cssproperty {color} [--c2-kanban-column__count--background-color=#ffffff] - Count pill background.
 * @cssproperty {font-size} [--c2-kanban-column__count--font-size=12px] - Count font size.
 * @cssproperty {border-radius} [--c2-kanban-column__count--border-radius=999px] - Count pill radius.
 * @cssproperty {padding} [--c2-kanban-column__count--padding=0 7px] - Count pill padding.
 * @cssproperty {color} [--c2-kanban-column__count__over--color=#dc2626] - Count text colour over the limit.
 * @cssproperty {color} [--c2-kanban-column__count__over--background-color=#fef2f2] - Count pill background over the limit.
 * @cssproperty {length} [--c2-kanban-column__cards--gap=8px] - Space between cards.
 * @cssproperty {string} [--c2-kanban-column__cards--overflow-y=visible] - Vertical overflow of the card list; `auto` scrolls it inside a column with a max height (and clips the cards' shadows).
 * @cssproperty {color} [--c2-kanban-column__card--background-color=#ffffff] - Card background.
 * @cssproperty {border} [--c2-kanban-column__card--border=1px solid #e4e4e7] - Card border.
 * @cssproperty {border-radius} [--c2-kanban-column__card--border-radius=6px] - Card radius.
 * @cssproperty {padding} [--c2-kanban-column__card--padding=10px 12px] - Card padding.
 * @cssproperty {box-shadow} [--c2-kanban-column__card--box-shadow=none] - Card shadow at rest.
 * @cssproperty {color} [--c2-kanban-column__card--color=#18181b] - Card text colour.
 * @cssproperty {font-size} [--c2-kanban-column__card--font-size=14px] - Card font size.
 * @cssproperty {color} [--c2-kanban-column__card__hover--border-color=#a1a1aa] - Card border colour on hover, when cards can move.
 * @cssproperty {outline} [--c2-kanban-column__card__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Keyboard focus ring.
 * @cssproperty {length} [--c2-kanban-column__card__focus--outline-offset=2px] - Keyboard focus ring offset.
 * @cssproperty {outline} [--c2-kanban-column__card__picked--outline=2px solid rgb(2, 101, 220)] - Outline of a card picked up with the keyboard.
 * @cssproperty {box-shadow} [--c2-kanban-column__card__picked--box-shadow=0 12px 28px rgba(15, 23, 42, 0.24)] - Shadow of a picked-up or dragged card.
 * @cssproperty {transform} [--c2-kanban-column__card__dragging--transform=rotate(2deg)] - Tilt of a card while it follows the pointer.
 * @cssproperty {number} [--c2-kanban-column__card__dragging--opacity=0.94] - Opacity of a card while it follows the pointer.
 * @cssproperty {font-weight} [--c2-kanban-column__title--font-weight=500] - Weight of the default renderer's title.
 * @cssproperty {color} [--c2-kanban-column__description--color=#71717a] - Colour of the default renderer's description.
 * @cssproperty {font-size} [--c2-kanban-column__description--font-size=12px] - Font size of the default renderer's description.
 * @cssproperty {border} [--c2-kanban-column__placeholder--border=2px dashed rgb(2, 101, 220)] - Border of the drop gap.
 * @cssproperty {color} [--c2-kanban-column__placeholder--background-color=rgba(2, 101, 220, 0.08)] - Background of the drop gap.
 * @cssproperty {border} [--c2-kanban-column__empty--border=1px dashed #bcbcc6] - Border of the empty hint.
 * @cssproperty {border-radius} [--c2-kanban-column__empty--border-radius=6px] - Radius of the empty hint.
 * @cssproperty {padding} [--c2-kanban-column__empty--padding=16px 8px] - Padding of the empty hint.
 * @cssproperty {color} [--c2-kanban-column__empty--color=#71717a] - Text colour of the empty hint.
 * @cssproperty {color} [--c2-kanban-column__empty--background-color=#ffffff] - Background of the empty hint.
 * @cssproperty {font-size} [--c2-kanban-column__empty--font-size=14px] - Font size of the empty hint.
 */
@customElement('c2-kanban-column')
export class KanbanColumn extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Identifier the column's items carry in their column field, and that `card-move` reports. */
  @property({ type: String, attribute: 'column-id' }) columnId = ''

  /** Column name, shown in the default header and used as the accessible name of its card list. */
  @property({ type: String }) label = ''

  /** Soft work-in-progress limit. Over it the count and the border take the over colour; cards can still be dropped. `0` means none. */
  @property({ type: Number }) limit = 0

  /**
   * Cards the board shows in this column. Set by the parent `c2-kanban`.
   * @internal
   */
  @state() cards: readonly KanbanCardView[] = []

  /**
   * Card following the pointer, rendered by the column it was picked up from. Set by the parent `c2-kanban`.
   * @internal
   */
  @state() dragged: KanbanCardView | null = null

  /**
   * Whether a dragged card is over this column. Set by the parent `c2-kanban`.
   * @internal
   */
  @state() target = false

  /**
   * Whether cards can move. Set by the parent `c2-kanban`.
   * @internal
   */
  @state() editable = false

  private readonly slotPresence = new SlotPresenceController(this, ['footer'])
  private readonly instructionsId = `c2-kanban-column-instructions-${++instanceCount}`

  /** Number of cards the column currently shows, counting the gap of a card being dragged into it. */
  get cardCount(): number {
    return this.cards.length
  }

  /** Whether the column holds more cards than its `limit`. */
  get overLimit(): boolean {
    return this.limit > 0 && this.cardCount > this.limit
  }

  /**
   * The column's card list, which the board measures and scrolls.
   * @internal
   */
  get cardsElement(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.cards') ?? null
  }

  /**
   * The element following the pointer while a card from this column is dragged.
   * @internal
   */
  get draggedElement(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.card--dragging') ?? null
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('columnId') || changed.has('label') || changed.has('limit')) {
      this.dispatchEvent(new CustomEvent(KANBAN_COLUMN_CHANGE_EVENT, { bubbles: true }))
    }
  }

  protected override render(): TemplateResult {
    const count = this.cardCount
    const over = this.overLimit
    return html`
      <div part="column" class=${classMap({ column: true, 'column--target': this.target, 'column--over': over })}>
        <div part="header" class="header">
          <slot name="header">
            <span part="label" class="label">${this.label}</span>
            <span part="count" class=${classMap({ count: true, 'count--over': over })}>
              ${count}${this.limit > 0 ? html`<span class="limit"> / ${this.limit}</span>` : nothing}
            </span>
          </slot>
        </div>
        ${
          this.editable
            ? html`<p id=${this.instructionsId} class="visually-hidden">
                Press Space to pick up a card. Use the arrow keys, Home or End to move it; Space drops it and Escape cancels.
              </p>`
            : nothing
        }
        <div part="cards" class="cards" role="list" aria-label=${this.label || this.columnId}>
          ${repeat(
            this.cards,
            (card) => card.key,
            (card, index) => (card.placeholder ? this.renderPlaceholder(card) : this.renderCard(card, index, count)),
          )}
        </div>
        <div part="empty" class="empty" ?hidden=${count > 0}><slot name="empty">No cards</slot></div>
        <div part="footer" class="footer" ?hidden=${!this.slotPresence.has('footer')}>
          <slot name="footer" @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </div>
      </div>
      ${this.dragged ? html`<div part="card" class="card card--dragging" aria-hidden="true">${this.dragged.content}</div>` : nothing}
    `
  }

  private renderCard(card: KanbanCardView, index: number, count: number): TemplateResult {
    return html`
      <div
        part="card"
        class=${classMap({ card: true, 'card--movable': this.editable, 'card--picked': !!card.picked })}
        data-key=${card.key}
        role="listitem"
        aria-posinset=${index + 1}
        aria-setsize=${count}
        aria-describedby=${this.editable ? this.instructionsId : nothing}
        tabindex=${this.editable ? (card.tabbable ? 0 : -1) : nothing}
      >
        ${card.content}
      </div>
    `
  }

  private renderPlaceholder(card: KanbanCardView): TemplateResult {
    return html`<div part="placeholder" class="placeholder" style=${styleMap({ height: card.height ? `${card.height}px` : null })} aria-hidden="true"></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-kanban-column': KanbanColumn
  }
}
