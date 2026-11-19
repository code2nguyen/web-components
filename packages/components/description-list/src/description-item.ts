import { LitElement, html, isServer, nothing, unsafeCSS, type TemplateResult } from 'lit'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import './description-value.js'
import type { DescriptionValue } from './description-value.js'
import { toggleDescriptionState } from './custom-state.js'
import type { DescriptionEditor, DescriptionEditorContext } from './description-edit.js'
import { descriptionListMessages } from './messages.js'
import styles from './description-item.scss?inline'

export { DescriptionValue } from './description-value.js'
export type { DescriptionEditor } from './description-edit.js'

/** Detail of the `edit` event of {@link DescriptionItem}. */
export interface DescriptionItemEditEventDetail {
  /** The item's `name`, else its label. */
  name: string
  /** The value the reader committed. */
  value: string
  /** The value the editor started from. */
  previous: string
}

/** Events fired by {@link DescriptionItem}, keyed for `addEventListener`. */
export interface DescriptionItemEventMap {
  edit: CustomEvent<DescriptionItemEditEventDetail>
}

export interface DescriptionItem {
  addEventListener: TypedAddEventListener<DescriptionItem, DescriptionItemEventMap>
  removeEventListener: TypedRemoveEventListener<DescriptionItem, DescriptionItemEventMap>
}

/** How the values of an item with several are compared: the best `max` or `min` number, or what is `different` from the first column. */
export type DescriptionHighlight = '' | 'max' | 'min' | 'different' | 'none'

/** The comparison settings an item reads from its list. */
interface ListSettings {
  valueLabels?: string[]
  highlight?: DescriptionHighlight
  differencesOnly?: boolean
  selectedColumn?: number | null
}

/** The first number in a value's text, `1,240.50` included; NaN when there is none. */
const toNumber = (key: string) => parseFloat(/-?\d[\d,]*(\.\d+)?/.exec(key)?.[0].replace(/,/g, '') ?? '')

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
 * The item compares its values: while they are not all equal it carries the custom state `different`, which a page
 * can style (`c2-description-item:state(different)`), and the list's `differences-only` hides it while they are.
 * `highlight` picks the values to mark, overriding the list's.
 *
 * `kind="subtotal"` or `"total"` makes the item a line of a calculation: a rule above it and a heavier weight, so a
 * breakdown (a fee, a tax, a pay stub) reads down to its result. Group the steps in `c2-description-group` sections.
 *
 * An item with an `editor` is a property the reader can change, as a record's sidebar in a CRM: an edit button
 * beside the value (and a click on the value) swaps it for a field of that type, loaded the first time an item is
 * edited, so a read-only list never ships it. Enter or leaving the field commits and fires `edit` with the new value;
 * Escape cancels. The item does not change its own content: the page writes the new value, or ignores the event to
 * refuse it.
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
 * @csspart edit-button - The button that edits the value of an item with an `editor`.
 * @csspart editor - The field that stands in for the value while it is edited.
 *
 * @event {CustomEvent<DescriptionItemEditEventDetail>} edit - The reader changed the value and committed it. Bubbles. `detail.name` is the item's `name` (else its label). The page writes the value into the item's content.
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
 * @cssproperty {border} [--c2-description-item__subtotal--border-top=1px solid #e4e4e7] - The rule above a `kind="subtotal"` item.
 * @cssproperty {padding} [--c2-description-item__subtotal--padding-top=8px]
 * @cssproperty {font-weight} [--c2-description-item__subtotal--font-weight=600]
 * @cssproperty {border} [--c2-description-item__total--border-top=2px solid #18181b] - The rule above a `kind="total"` item.
 * @cssproperty {padding} [--c2-description-item__total--padding-top=8px]
 * @cssproperty {font-weight} [--c2-description-item__total--font-weight=700]
 * @cssproperty {pixel} [--c2-description-item__total--font-size=16px] - The value of a total.
 *
 * @cssproperty {pixel} [--c2-description-item__edit-button--size=24px] - Width and height of the edit button.
 * @cssproperty {color} [--c2-description-item__edit-button--color=#71717a]
 * @cssproperty {color} [--c2-description-item__edit-button__hover--background-color=#f4f4f5]
 * @cssproperty [--c2-description-item__edit-button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border} [--c2-description-item__editor--border=1px solid #a1a1aa]
 * @cssproperty {border-radius} [--c2-description-item__editor--border-radius=6px]
 * @cssproperty {padding} [--c2-description-item__editor--padding=4px 8px]
 * @cssproperty {color} [--c2-description-item__editor--background-color=#ffffff]
 * @cssproperty [--c2-description-item__editor__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
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

  /** Overrides the list's `highlight` for this item, such as `min` for a price in a list that highlights `max`. `none` marks nothing. */
  @property() highlight: DescriptionHighlight = ''

  /** The item's role in a calculation: a `subtotal` or the `total`, drawn with a rule above and a heavier weight. */
  @property() kind: '' | 'subtotal' | 'total' = ''

  /** Makes the value editable with a field of this type; unset, the item is read-only and loads no editor. */
  @property() editor?: DescriptionEditor

  /** Names the item in the `edit` event (not `key`, which React and Vue keep for themselves); the label when empty. */
  @property() name = ''

  /** The value the editor starts from, when the content is not it (a formatted amount, a badge); the content's text by default. */
  @property({ attribute: 'edit-value' }) editValue?: string

  /** The choices of a `select` editor. An array, or `;`-separated in the attribute. */
  @property({ converter: arrayPropertyConverter }) options: string[] = []

  /** The value is being edited. */
  @state() private editing = false

  private readonly msg = new LocalizeController(this, descriptionListMessages)
  #renderEditor?: (context: DescriptionEditorContext) => TemplateResult

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
  private syncFrame = 0

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
    cancelAnimationFrame(this.syncFrame)
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
      node instanceof Element ? (node.getAttribute('slot') ?? '') === '' : node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    )
  }

  private observeGroup() {
    const group = this.valueCount ? this.renderRoot.querySelector('.value') : null
    if (group === this.observedGroup) return
    this.groupObserver?.disconnect()
    this.observedGroup = group
    if (!group) return
    // Showing the captions resizes the row being observed, so apply it on the next frame rather than inside the
    // callback, which the browser reports as a ResizeObserver loop.
    this.groupObserver ??= new ResizeObserver(() => {
      cancelAnimationFrame(this.syncFrame)
      this.syncFrame = requestAnimationFrame(() => this.syncValues())
    })
    this.groupObserver.observe(group)
  }

  /**
   * Hands each value its column name, tells it whether the columns wrapped onto rows of their own and whether it is
   * highlighted or in the selected column, and marks the item as `different` (or filtered out) from its values.
   */
  private syncValues() {
    const values = this.values
    // `closest`, not `parentElement`: a framework may wrap the item in an element of its own.
    const list = (this.parentElement?.closest('c2-description-list') ?? {}) as ListSettings
    const keys = values.map((value) => (value.value ?? value.textContent ?? '').replace(/\s+/g, ' ').trim())
    const different = new Set(keys).size > 1
    toggleDescriptionState(this.internals, 'different', different)
    toggleDescriptionState(this.internals, 'filtered', !!list.differencesOnly && values.length > 1 && !different)
    if (!values.length) return
    const tops = values.map((value) => Math.round(value.getBoundingClientRect().top))
    const stacked = tops.some((top) => top !== tops[0])
    const labels = list.valueLabels ?? []
    const mode = this.highlight || list.highlight
    let marked = keys.map(() => false)
    if (different && mode === 'different') marked = keys.map((key) => key !== keys[0])
    else if (different && (mode === 'max' || mode === 'min')) {
      const numbers = keys.map(toNumber)
      const best = Math[mode](...numbers.filter((number) => !Number.isNaN(number)))
      marked = numbers.map((number) => number === best)
    }
    values.forEach((value, index) => {
      if (typeof value.applyLayout !== 'function') return
      void value.updateComplete.then(() => value.applyLayout(labels[index] ?? '', stacked, marked[index], list.selectedColumn === index))
    })
  }

  private handleValueSlotChange = () => {
    this.readContent()
  }

  /** The label as text, for the edit button and the field's name. */
  private get labelText(): string {
    // The server sees no children: the attribute is all it has.
    const slotted = isServer ? [] : [...this.children].filter((child) => child.getAttribute('slot') === 'label')
    return (
      slotted
        .map((child) => child.textContent ?? '')
        .join(' ')
        .trim() || this.label
    ).replace(/\s+/g, ' ')
  }

  /** The value's text: what the editor starts from when `edit-value` is unset. */
  private get valueText(): string {
    // Text and unslotted elements only: a framework's marker comments are not part of the value.
    const nodes = [...this.childNodes].filter((node) => (node instanceof Element ? (node.getAttribute('slot') ?? '') === '' : node.nodeType === Node.TEXT_NODE))
    return nodes
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  }

  constructor() {
    super()
    // On the host: a click on the value's own text targets the host, so it never enters the shadow tree.
    this.addEventListener('click', this.#clickValue)
  }

  /** A click on the value edits it; one on the label, an action, a link in the value or the field itself does not. */
  #clickValue = (event: MouseEvent) => {
    if (!this.editor || this.editing || event.defaultPrevented) return
    // The end of a drag that selected the value, to copy it, is not a request to edit.
    if (!(getSelection()?.isCollapsed ?? true)) return
    for (const target of event.composedPath()) {
      if (target === this) break
      if (!(target instanceof Element)) continue
      if (target.matches('a, button, input, select, textarea, [slot="label"], [slot="actions"], .label, .actions')) return
    }
    void this.edit()
  }

  /** Swaps the value for its editor, loading the editor the first time; does nothing without an `editor`. */
  async edit(): Promise<void> {
    if (!this.editor || this.editing) return
    this.#renderEditor ??= (await import('./description-edit.js')).renderEditor
    this.editing = true
    await this.updateComplete
    const field = this.renderRoot.querySelector<HTMLInputElement>('.editor')
    field?.focus()
    // Typing replaces the value, as in a sheet; the arrow keys keep it to change a part.
    if (field && 'select' in field && field.type !== 'date') field.select()
  }

  #finish(value: string | undefined, previous: string) {
    // Enter and Escape leave the focus in the field; a click elsewhere has already moved it, and it stays there.
    const hadFocus = !!this.renderRoot.querySelector('.editor')?.matches(':focus')
    this.editing = false
    if (value !== undefined && value !== previous) {
      this.dispatchEvent(
        new CustomEvent<DescriptionItemEditEventDetail>('edit', {
          detail: { name: this.name || this.labelText, value, previous },
          bubbles: true,
          composed: true,
        }),
      )
    }
    // The button stands where the field was, so the focus goes back to it.
    if (hadFocus) void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.edit-button')?.focus())
  }

  private renderEditing() {
    const previous = this.editValue ?? this.valueText
    return this.#renderEditor!({
      type: this.editor ?? 'text',
      value: previous,
      options: this.options ?? [],
      label: this.labelText,
      commit: (value) => this.#finish(value, previous),
      cancel: () => this.#finish(undefined, previous),
    })
  }

  private renderEditButton() {
    if (!this.editor || this.editing) return nothing
    const name = this.msg.t('edit', this.labelText)
    return html`<button class="edit-button" part="edit-button" type="button" aria-label=${name} title=${name} @click=${() => void this.edit()}>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>`
  }

  override render() {
    const group = this.valueCount > 0
    const showEmpty = !group && !this.hasValue && this.emptyText !== ''
    const editing = this.editing && !!this.#renderEditor
    return html`
      <div
        class=${classMap({ 'c2-description-item': true, [`is-${this.kind}`]: this.kind === 'subtotal' || this.kind === 'total', 'is-editable': !!this.editor })}
      >
        <div class="label" part="label" role="term">
          <slot name="label">${this.label}</slot>
        </div>
        <div
          class=${classMap({ value: true, 'is-group': group })}
          part="value"
          role=${group ? 'none' : 'definition'}
          style=${styleMap({ '--_count': String(Math.max(this.valueCount, 1)) })}
        >
          ${editing ? this.renderEditing() : nothing}
          <span class="content" ?hidden=${editing}
            ><slot @slotchange=${this.handleValueSlotChange}></slot><span class="empty" part="empty" ?hidden=${!showEmpty}>${this.emptyText}</span></span
          >
        </div>
        <div class="actions" part="actions" ?hidden=${!this.slotPresence.has('actions') && (!this.editor || editing)}>
          ${this.renderEditButton()}
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
