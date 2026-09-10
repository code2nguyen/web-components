import { LitElement, html, isServer, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
// Registers `c2-button`, the usual item element.
import '@c2n/button'
import styles from './button-group.scss?inline'

export type ButtonGroupSelection = 'none' | 'single' | 'multiple'
export type ButtonGroupOrientation = 'horizontal' | 'vertical'

const GROUP_DISABLED = 'data-c2-button-group-disabled'

/**
 * Attaches related buttons into one control: shared borders, outside corners only, a divider between items. Children
 * are `c2-button` or `c2-icon-button` elements (any element works for layout). With `selection="single"` the group is
 * a segmented control that keeps one item pressed; with `selection="multiple"` each item toggles independently. The
 * pressed items carry `selected` (and `aria-pressed`), the group reports them in `value` and fires `change`.
 *
 * @tag c2-button-group
 *
 * @slot - The buttons, in order.
 *
 * @event {CustomEvent<{ value: string }>} change - Fired after the user changes the selection. `detail.value` is the new `value`. Not fired for programmatic changes.
 *
 * @cssproperty {pixel} [--c2-button-group--gap=0px] - Space between items. Zero attaches them; a positive gap separates them into individually rounded buttons.
 * @cssproperty {border-radius} [--c2-button-group--border-radius=6px] - Outside corner radius. With a positive gap, applies to every item.
 * @cssproperty {border} [--c2-button-group--border=1px solid transparent] - Border applied to every item, e.g. `1px solid #d4d4d8` for an outlined group.
 * @cssproperty {pixel} [--c2-button-group__divider--width=1px] - Width of the line between attached items; also how much their borders overlap.
 * @cssproperty {color} [--c2-button-group__divider--color=rgba(255, 255, 255, 0.35)] - Colour of the line between attached items. Match the border colour for outlined groups, `transparent` for none.
 * @cssproperty {flex} [--c2-button-group__item--flex=0 0 auto] - `1 1 0` makes every item grow to the same width.
 * @slotcomponent c2-button
 * @slotcomponent c2-icon-button
 */
@customElement('c2-button-group')
export class ButtonGroup extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `none` (default) for plain attached buttons, `single` for one pressed item, `multiple` for independent toggles. */
  @property({ reflect: true }) selection: ButtonGroupSelection = 'none'

  /** `value` of the pressed item; comma-separated values with `selection="multiple"`. Items without a `value` attribute use their index. */
  @property({ reflect: true }) value = ''

  /** Disables every item. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Stacks the items vertically. */
  @property({ reflect: true }) orientation: ButtonGroupOrientation = 'horizontal'

  /** Accessible name of the group. */
  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  private observer?: MutationObserver

  constructor() {
    super()
    if (!isServer) this.addEventListener('click', this.handleClick)
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group')
    if (!isServer) {
      this.observer ??= new MutationObserver(() => this.syncItems())
      this.observer.observe(this, { childList: true })
      this.syncItems()
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.observer?.disconnect()
  }

  /** The item elements, in order. */
  get items(): HTMLElement[] {
    return [...this.children].filter((child): child is HTMLElement => child instanceof HTMLElement)
  }

  /** Values of the pressed items. */
  get selectedValues(): string[] {
    return this.value ? this.value.split(',').filter(Boolean) : []
  }

  private itemValue(item: HTMLElement, index: number): string {
    return item.getAttribute('value') ?? String(index)
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('value') || changed.has('selection') || changed.has('disabled')) this.syncItems()
  }

  /** Mirrors `value`, `selection` and `disabled` onto the items. */
  private syncItems() {
    const items = this.items
    const selectable = this.selection !== 'none'
    const selected = new Set(this.selectedValues)
    items.forEach((item, index) => {
      if (selectable) item.setAttribute('toggle', '')
      else item.removeAttribute('toggle')
      if (selectable && selected.has(this.itemValue(item, index))) item.setAttribute('selected', '')
      else item.removeAttribute('selected')

      if (this.disabled) {
        if (!item.hasAttribute('disabled')) {
          item.setAttribute('disabled', '')
          item.setAttribute(GROUP_DISABLED, '')
        }
      } else if (item.hasAttribute(GROUP_DISABLED)) {
        item.removeAttribute('disabled')
        item.removeAttribute(GROUP_DISABLED)
      }
    })
  }

  private handleClick = (event: Event) => {
    if (this.selection === 'none' || this.disabled) return
    const items = this.items
    const item = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.parentElement === this)
    if (!item || item.hasAttribute('disabled')) return
    const value = this.itemValue(item, items.indexOf(item))
    let next: string
    if (this.selection === 'single') {
      if (this.value === value) return
      next = value
    } else {
      const values = this.selectedValues
      next = values.includes(value) ? values.filter((entry) => entry !== value).join(',') : [...values, value].join(',')
    }
    this.value = next
    this.dispatchEvent(new CustomEvent('change', { detail: { value: next }, bubbles: true, composed: true }))
  }

  override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-button-group': ButtonGroup
  }
}
