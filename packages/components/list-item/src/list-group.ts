import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './list-group.scss?inline'

/** Events fired by {@link ListGroup}, keyed for `addEventListener`. */
export interface ListGroupEventMap {
  toggle: ToggleEvent
}

/** Controls an author may put in the `suffix` slot (an add button, a menu trigger): their clicks are theirs. */
const INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'

export interface ListGroup {
  addEventListener: TypedAddEventListener<ListGroup, ListGroupEventMap>
  removeEventListener: TypedRemoveEventListener<ListGroup, ListGroupEventMap>
}

/**
 * A collapsible group of `c2-list-item` rows, for vertical application navigation. The header is a disclosure button
 * (`aria-expanded`) with the group's label, an optional icon and a count; the rows under it are hidden while the group
 * is closed. Groups nest: put a `c2-list-group` among the rows of another. Mark the row of the current route with
 * `current` on its `c2-list-item`.
 *
 * Use it in a `<nav>`, not inside a `c2-list`: a list is a listbox that selects values, while a navigation list is a set
 * of links.
 *
 * @tag c2-list-group
 *
 * @slot default - The group's rows: `c2-list-item` elements (usually with `href`) and nested `c2-list-group`s.
 * @slot label - The group's heading. Falls back to `label`.
 * @slot prefix-icon - Icon shown before the heading, sized by `--c2-list-group__icon--size`.
 * @slot suffix - Content after the heading, such as a count or a badge. It sits outside the disclosure button, so a
 *   control placed here (an add button, a menu trigger) keeps its own click and does not open or close the group.
 * @slot toggle-icon - Replaces the chevron. It turns to `--c2-list-group__toggle-icon__open--rotate` while open, and is
 *   mirrored in a right-to-left document.
 *
 * @csspart header - The header row: the disclosure button, the suffix and the chevron. Clicking anywhere on it toggles the group.
 * @csspart button - The disclosure button (`aria-expanded`), holding the icon and the heading. It takes the focus.
 * @csspart prefix-icon - The wrapper of the `prefix-icon` slot, hidden when the slot is empty.
 * @csspart label - The wrapper of the `label` slot.
 * @csspart suffix - The wrapper of the `suffix` slot, hidden when the slot is empty.
 * @csspart toggle-icon - The wrapper of the `toggle-icon` slot.
 * @csspart items - The wrapper of the rows (the default slot); `role="group"`, named by the heading.
 *
 * @event {ToggleEvent} toggle - Fired after the group opens or closes (`newState` is `open` or `closed`). Does not bubble.
 *
 * @cssproperty {pixel} [--c2-list-group__header--min-height=36px]
 * @cssproperty {pixel} [--c2-list-group__header--gap=8px] - Space between the icon, the heading, the suffix and the chevron.
 * @cssproperty {padding} [--c2-list-group__header--padding-top=6px]
 * @cssproperty {padding} [--c2-list-group__header--padding-right=10px]
 * @cssproperty {padding} [--c2-list-group__header--padding-bottom=6px]
 * @cssproperty {padding} [--c2-list-group__header--padding-left=10px]
 * @cssproperty {border-radius} [--c2-list-group__header--border-radius=6px]
 * @cssproperty {font-size} [--c2-list-group__header--font-size=14px]
 * @cssproperty {font-weight} [--c2-list-group__header--font-weight=500]
 * @cssproperty {font-family} --c2-list-group__header--font-family
 * @cssproperty {pixel} [--c2-list-group__header--line-height=20px]
 * @cssproperty {color} [--c2-list-group__header--color=#18181b]
 * @cssproperty {color} [--c2-list-group__header--background=transparent]
 * @cssproperty {color} --c2-list-group__header__hover--color
 * @cssproperty {color} [--c2-list-group__header__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-list-group__header__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-list-group__header__focus--outline-offset=-2px]
 *
 * @cssproperty {pixel} [--c2-list-group__icon--size=16px]
 * @cssproperty {color} --c2-list-group__icon--color - Defaults to the header text colour.
 *
 * @cssproperty {pixel} [--c2-list-group__toggle-icon--size=16px]
 * @cssproperty {color} [--c2-list-group__toggle-icon--color=#71717a]
 * @cssproperty {angle} [--c2-list-group__toggle-icon--rotate=0deg] - Chevron angle while closed.
 * @cssproperty {angle} [--c2-list-group__toggle-icon__open--rotate=90deg] - Chevron angle while open.
 * @cssproperty {time} [--c2-list-group__toggle-icon--transition-duration=150ms]
 *
 * @cssproperty {pixel} [--c2-list-group__items--padding-left=24px] - Indent of the rows under the header.
 * @cssproperty {pixel} [--c2-list-group__items--margin-left=0px] - Moves the rows (and their `border-left` guide line) to the right.
 * @cssproperty {border} --c2-list-group__items--border-left - A guide line along the rows, such as `1px solid #e4e4e7`.
 * @cssproperty {pixel} [--c2-list-group__items--gap=0px] - Space between the rows.
 * @cssproperty {pixel} [--c2-list-group__items--padding-top=0px]
 */
@customElement('c2-list-group')
export class ListGroup extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Whether the rows are shown. Toggled by the header; set it to open a group, such as the one holding the current route. */
  @property({ type: Boolean, reflect: true }) open = false

  /** The heading, used when the `label` slot is empty. */
  @property() label = ''

  private readonly slotPresence = new SlotPresenceController(this, ['prefix-icon', 'suffix'])

  /** Opens the group, or closes it when `force` is `false`. Without `force` it flips the state. */
  toggle(force?: boolean) {
    this.open = force ?? !this.open
  }

  private handleHeaderClick = (event: Event) => {
    // A control in the `suffix` slot owns its click; the rest of the row (the button, the count, the chevron) toggles.
    for (const node of event.composedPath()) {
      if (node === event.currentTarget) break
      if (node instanceof Element && node.getRootNode() !== this.shadowRoot && node.matches(INTERACTIVE)) return
    }
    this.toggle()
  }

  protected override updated(changedProperties: PropertyValueMap<this>): void {
    // Only report real changes, not the first render.
    if (changedProperties.has('open') && changedProperties.get('open') !== undefined) {
      const [oldState, newState] = this.open ? ['closed', 'open'] : ['open', 'closed']
      // `ToggleEvent` is missing before Safari 17; an `Event` carrying the same two fields stands in for it there.
      const event =
        typeof ToggleEvent === 'function' ? new ToggleEvent('toggle', { oldState, newState }) : Object.assign(new Event('toggle'), { oldState, newState })
      this.dispatchEvent(event)
    }
  }

  override render() {
    const slotChange = this.slotPresence.handleSlotChange
    return html`
      <div class="header" part="header" @click=${this.handleHeaderClick}>
        <button class="button" part="button" type="button" aria-expanded=${String(this.open)} aria-controls="items">
          <span class="prefix-icon" part="prefix-icon" ?hidden=${!this.slotPresence.has('prefix-icon')}
            ><slot name="prefix-icon" @slotchange=${slotChange}></slot
          ></span>
          <span class="label" part="label" id="label"><slot name="label">${this.label}</slot></span>
        </button>
        <span class="suffix" part="suffix" ?hidden=${!this.slotPresence.has('suffix')}><slot name="suffix" @slotchange=${slotChange}></slot></span>
        <span class="toggle-icon" part="toggle-icon" aria-hidden="true"
          ><slot name="toggle-icon"
            ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline></svg></slot
        ></span>
      </div>
      <div class="items" part="items" id="items" role="group" aria-labelledby="label" ?hidden=${!this.open}><slot></slot></div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list-group': ListGroup
  }
}
