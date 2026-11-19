import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './description-group.scss?inline'

/** Detail of the `collapsed-change` event of {@link DescriptionGroup}. */
export interface DescriptionGroupCollapsedChangeEventDetail {
  collapsed: boolean
}

/** Events fired by {@link DescriptionGroup}, keyed for `addEventListener`. */
export interface DescriptionGroupEventMap {
  'collapsed-change': CustomEvent<DescriptionGroupCollapsedChangeEventDetail>
}

export interface DescriptionGroup {
  addEventListener: TypedAddEventListener<DescriptionGroup, DescriptionGroupEventMap>
  removeEventListener: TypedRemoveEventListener<DescriptionGroup, DescriptionGroupEventMap>
}

/**
 * A titled section of a `c2-description-list`: its `c2-description-item` children sit under a heading, across the
 * full width of the list and in the list's own columns. Sections are how a record's properties are grouped
 * ("Contact", "Billing") and how a calculation breaks down into steps (earnings, deductions, taxes), each closed by a
 * `kind="subtotal"` item.
 *
 * `collapsible` makes the heading a disclosure button that closes and opens the section; the items sit in a native
 * `<details>`, so the browser's find-in-page still finds a closed section's text and opens it. `collapsed` closes it,
 * and follows the reader.
 *
 * @tag c2-description-group
 *
 * @slot - The `c2-description-item` pairs of the section.
 * @slot label - Heading content, used instead of the `label` attribute.
 * @slot actions - Controls at the end of the heading row, such as "Add property".
 *
 * @csspart heading - The heading row, containing the `label` and `actions` parts.
 * @csspart label - Heading containing the label slot (fallback: the `label` attribute); with `collapsible`, inside the disclosure button.
 * @csspart toggle - The disclosure button of a `collapsible` section, holding the chevron and the label.
 * @csspart actions - Wrapper of the actions slot at the end of the heading row, outside the disclosure button. Hidden while the slot is empty.
 * @csspart grid - Grid containing the default slot, the section's items, laid out with the list's column variables.
 *
 * @event {CustomEvent<DescriptionGroupCollapsedChangeEventDetail>} collapsed-change - The reader, or find-in-page, opened or closed a collapsible section. `detail.collapsed` is the new state. Does not bubble.
 *
 * @cssproperty {padding} [--c2-description-group__heading--padding=8px 0px]
 * @cssproperty {pixel} [--c2-description-group__heading--margin-bottom=8px]
 * @cssproperty {border} [--c2-description-group__heading--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-description-group__heading--color=#18181b]
 * @cssproperty {pixel} [--c2-description-group__heading--font-size=14px]
 * @cssproperty {font-weight} [--c2-description-group__heading--font-weight=600]
 * @cssproperty [--c2-description-group__heading__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-description-group__chevron--size=16px] - The open and closed mark of a collapsible section.
 */
@customElement('c2-description-group')
export class DescriptionGroup extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly slotPresence = new SlotPresenceController(this, ['actions'])
  #contentId = `c2-dg-${Math.random().toString(36).slice(2, 9)}`

  /** The heading. The `label` slot takes its place when it has content. */
  @property() label = ''

  /** The heading's level for assistive technology, 2 to 6. */
  @property({ type: Number }) level = 3

  /** The reader can close and open the section. */
  @property({ type: Boolean }) collapsible = false

  /** The section is closed. Only with `collapsible`; it follows the reader. */
  @property({ type: Boolean, reflect: true }) collapsed = false

  override connectedCallback() {
    super.connectedCallback()
    // Inside the list the section is one of its entries, with a heading and a list of its own.
    this.internals.role = 'listitem'
  }

  /** The list's value columns lay its items in one column; the section follows. */
  private get valueColumns(): boolean {
    const list = this.parentElement?.closest('c2-description-list') as { valueLabels?: string[] } | null
    return !!list?.valueLabels?.length
  }

  #setCollapsed(collapsed: boolean) {
    if (collapsed === this.collapsed) return
    this.collapsed = collapsed
    this.dispatchEvent(new CustomEvent<DescriptionGroupCollapsedChangeEventDetail>('collapsed-change', { detail: { collapsed } }))
  }

  /** The details element opened on its own: find-in-page found text in it. */
  #detailsToggle = (event: Event) => this.#setCollapsed(!(event.target as HTMLDetailsElement).open)

  override render() {
    const level = Math.min(6, Math.max(2, Math.round(this.level) || 3))
    const label = html`<slot name="label">${this.label || nothing}</slot>`
    const grid = html`<div class=${classMap({ grid: true, 'is-single': this.valueColumns })} part="grid" role="list"><slot></slot></div>`
    // The heading row stays outside the disclosure: a heading inside a button loses its role, and an action inside it
    // would be a button within a button.
    return html`<div class="heading" part="heading">
        <span class="label" part="label" role="heading" aria-level=${level}
          >${
            this.collapsible
              ? html`<button
                  class="toggle"
                  part="toggle"
                  type="button"
                  aria-expanded=${this.collapsed ? 'false' : 'true'}
                  aria-controls=${this.#contentId}
                  @click=${() => this.#setCollapsed(!this.collapsed)}
                >
                  <span class="chevron" aria-hidden="true"></span>${label}
                </button>`
              : label
          }</span
        >
        <span class="actions" part="actions" ?hidden=${!this.slotPresence.has('actions')}
          ><slot name="actions" @slotchange=${this.slotPresence.handleSlotChange}></slot
        ></span>
      </div>
      ${
        this.collapsible
          ? html`<details class="details" id=${this.#contentId} ?open=${!this.collapsed} @toggle=${this.#detailsToggle}>
              <summary hidden></summary>
              ${grid}
            </details>`
          : html`<div id=${this.#contentId}>${grid}</div>`
      }`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-description-group': DescriptionGroup
  }
}
