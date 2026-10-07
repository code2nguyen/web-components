import { LitElement, html, isServer, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { state } from 'lit/decorators.js'
import styles from './description-item.scss?inline'

/**
 * One label and value pair of a `c2-description-list`. The label comes from the `label` attribute, or from the
 * `label` slot when it needs markup (an icon, a tooltip); the value is the item's content, which can be anything from
 * plain text to a badge, a link or an avatar. An item with no value shows `empty-text`, so a missing field reads as
 * "—" instead of an empty gap.
 *
 * @tag c2-description-item
 *
 * @slot - The value.
 * @slot label - Label content, used instead of the `label` attribute.
 * @slot actions - Controls shown after the value, such as a copy or edit button.
 *
 * @csspart label - The label region (`term`). It wraps the label slot, whose fallback text is the `label` attribute.
 * @csspart value - The value (`definition`), holding the default slot.
 * @csspart empty - The `empty-text` shown while the value is empty.
 * @csspart actions - The wrapper around the actions slot, after the value. Hidden while the slot is empty.
 *
 * @cssproperty [--c2-description-item--grid-column=auto] - Column placement in the list's grid. `1 / -1` spans the full row.
 *
 * @cssproperty {padding} [--c2-description-item__container--padding=0px]
 * @cssproperty {pixel} [--c2-description-item__container--column-gap=16px] - Space between the label and the value when they sit side by side.
 * @cssproperty {pixel} [--c2-description-item__container--row-gap=4px] - Space between the label and the value when the value sits under it.
 * @cssproperty {border} [--c2-description-item__container--border-bottom=none] - Divider under each item.
 * @cssproperty {color} [--c2-description-item__container--background-color=transparent]
 *
 * @cssproperty {pixel} [--c2-description-item__label--width=100%] - A length such as `160px` puts the label beside the value; `100%` puts it above.
 * @cssproperty {color} [--c2-description-item__label--color=#71717a]
 * @cssproperty {pixel} [--c2-description-item__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-description-item__label--font-weight=400]
 * @cssproperty [--c2-description-item__label--line-height=20px]
 *
 * @cssproperty {pixel} [--c2-description-item__value--min-width=0px] - Narrowest the value gets beside its label before it wraps under it.
 * @cssproperty {color} [--c2-description-item__value--color=#18181b]
 * @cssproperty {pixel} [--c2-description-item__value--font-size=14px]
 * @cssproperty {font-weight} [--c2-description-item__value--font-weight=500]
 * @cssproperty [--c2-description-item__value--line-height=20px]
 * @cssproperty [--c2-description-item__value--overflow-wrap=anywhere] - How a long unbroken value (an ID, a URL) wraps.
 *
 * @cssproperty {color} [--c2-description-item__empty--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-description-item__actions--gap=4px]
 */
@customElement('c2-description-item')
export class DescriptionItem extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** The label. The `label` slot takes its place when it has content. */
  @property() label = ''

  /** Text shown while the value is empty. An empty string shows nothing. */
  @property({ attribute: 'empty-text' }) emptyText = '—'

  /**
   * Whether the default slot holds an element or non-blank text. The server cannot see the light DOM, so it renders
   * every item as filled; a client that adopts that server markup keeps the same value until hydration is done, then
   * reads the real one, or Lit reports a hydration mismatch.
   */
  @state() private hasValue = true

  private readonly slotPresence = new SlotPresenceController(this, ['actions'])

  // A framework that rewrites the text of an existing node fires no slotchange, so watch the light DOM.
  private valueObserver?: MutationObserver

  override connectedCallback() {
    super.connectedCallback()
    this.internals.role = 'listitem'
    if (isServer) return
    if (this.hasUpdated || !this.shadowRoot?.hasChildNodes()) this.hasValue = this.readHasValue()
    else void this.updateComplete.then(() => (this.hasValue = this.readHasValue()))
    this.valueObserver ??= new MutationObserver(() => (this.hasValue = this.readHasValue()))
    this.valueObserver.observe(this, { childList: true, characterData: true, subtree: true })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.valueObserver?.disconnect()
  }

  /** Content of the default slot only: a label or an action in a named slot is not a value. */
  private readHasValue(): boolean {
    return [...this.childNodes].some((node) =>
      node instanceof Element ? !node.hasAttribute('slot') : node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    )
  }

  private handleValueSlotChange = () => {
    this.hasValue = this.readHasValue()
  }

  override render() {
    const showEmpty = !this.hasValue && this.emptyText !== ''
    return html`
      <div class="c2-description-item">
        <div class="label" part="label" role="term">
          <slot name="label">${this.label}</slot>
        </div>
        <div class="value" part="value" role="definition">
          <slot @slotchange=${this.handleValueSlotChange}></slot>
          <span class="empty" part="empty" ?hidden=${!showEmpty}>${this.emptyText}</span>
        </div>
        <div class="actions" part="actions" ?hidden=${!this.slotPresence.has('actions')}>
          <slot name="actions" @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-description-item': DescriptionItem
  }
}
