import { LitElement, html, isServer, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import './description-value.js'
import type { DescriptionValue } from './description-value.js'
import styles from './description-item.scss?inline'

export { DescriptionValue } from './description-value.js'

/**
 * One label and value pair of a `c2-description-list`. The label comes from the `label` attribute, or from the
 * `label` slot when it needs markup (an icon, a tooltip); the value is the item's content, which can be anything from
 * plain text to a badge, a link or an avatar. An item with no value shows `empty-text`, so a missing field reads as
 * "—" instead of an empty gap.
 *
 * An item can hold several values, one `c2-description-value` each: the price of a feature in each plan, a metric
 * this month and last. They line up in equal columns across the items of the list, and the list's `value-labels`
 * names those columns. The layout adapts on its own: when the label and the columns no longer fit on one line the
 * columns move under the label, and when the columns themselves no longer fit (each narrower than
 * `--c2-description-item__value-column--min-width`) the values stack, each with its column name as a caption.
 *
 * @tag c2-description-item
 *
 * @slot - The value, or several `c2-description-value` elements for one value per column.
 * @slot label - Label content, used instead of the `label` attribute.
 * @slot actions - Controls shown after the value, such as a copy or edit button.
 *
 * @csspart label - The label region (`term`). It wraps the label slot, whose fallback text is the `label` attribute.
 * @csspart value - The value region (`definition`) around the default slot. With `c2-description-value` children it is the row of value columns instead.
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
 * @cssproperty {pixel} [--c2-description-item__value-column--min-width=120px] - Narrowest a `c2-description-value` column gets before the values stack.
 * @cssproperty {pixel} [--c2-description-item__value-column--gap=16px] - Space between `c2-description-value` columns.
 * @cssproperty {pixel} [--c2-description-item__value-column--row-gap=6px] - Space between stacked `c2-description-value` rows.
 *
 * @cssproperty {color} [--c2-description-item__empty--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-description-item__actions--gap=4px]
 *
 * @slotcomponent c2-description-value
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

  /** How many `c2-description-value` children the item has; zero renders the default slot as one value. */
  @state() private valueCount = 0

  private readonly slotPresence = new SlotPresenceController(this, ['actions'])

  // A framework that rewrites the text of an existing node fires no slotchange, so watch the light DOM.
  private valueObserver?: MutationObserver

  // Whether the value columns wrapped is a layout fact, so it is read after layout rather than predicted in CSS.
  private groupObserver?: ResizeObserver
  private observedGroup: Element | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.internals.role = 'listitem'
    if (isServer) return
    if (this.hasUpdated || !this.shadowRoot?.hasChildNodes()) this.readContent()
    else void this.updateComplete.then(() => this.readContent())
    this.valueObserver ??= new MutationObserver(() => {
      this.readContent()
      this.syncValues()
    })
    this.valueObserver.observe(this, { childList: true, characterData: true, subtree: true })
    if (this.observedGroup) this.groupObserver?.observe(this.observedGroup)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.valueObserver?.disconnect()
    this.groupObserver?.disconnect()
  }

  protected override updated() {
    this.observeGroup()
    this.syncValues()
  }

  /** The item's values, looking through wrappers a framework puts around them (Astro islands, `display: contents` hosts), but not into a nested item. */
  private get values(): DescriptionValue[] {
    return [...this.querySelectorAll('c2-description-value')].filter((value) => value.parentElement?.closest('c2-description-item') === this)
  }

  private readContent() {
    this.hasValue = this.readHasValue()
    this.valueCount = this.values.length
  }

  /** Content of the default slot only: a label or an action in a named slot is not a value. */
  private readHasValue(): boolean {
    return [...this.childNodes].some((node) =>
      node instanceof Element ? !node.hasAttribute('slot') : node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    )
  }

  private observeGroup() {
    const group = this.valueCount ? this.renderRoot.querySelector('.value') : null
    if (group === this.observedGroup) return
    this.groupObserver?.disconnect()
    this.observedGroup = group
    if (!group) return
    this.groupObserver ??= new ResizeObserver(() => this.syncValues())
    this.groupObserver.observe(group)
  }

  /** Hands each value its column name, and tells it whether the columns wrapped onto rows of their own. */
  private syncValues() {
    const values = this.values
    if (!values.length) return
    const tops = values.map((value) => Math.round(value.getBoundingClientRect().top))
    const stacked = tops.some((top) => top !== tops[0])
    // `closest`, not `parentElement`: a framework may wrap the item in an element of its own.
    const labels = (this.parentElement?.closest('c2-description-list') as { valueLabels?: string[] } | null)?.valueLabels ?? []
    values.forEach((value, index) => {
      if (typeof value.applyLayout !== 'function') return
      void value.updateComplete.then(() => value.applyLayout(labels[index] ?? '', stacked))
    })
  }

  private handleValueSlotChange = () => {
    this.readContent()
  }

  override render() {
    const group = this.valueCount > 0
    const showEmpty = !group && !this.hasValue && this.emptyText !== ''
    return html`
      <div class="c2-description-item">
        <div class="label" part="label" role="term">
          <slot name="label">${this.label}</slot>
        </div>
        <div
          class=${classMap({ value: true, 'is-group': group })}
          part="value"
          role=${group ? 'none' : 'definition'}
          style=${styleMap({ '--_count': String(Math.max(this.valueCount, 1)) })}
        >
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
