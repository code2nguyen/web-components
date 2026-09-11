import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './list.scss?inline'
import { selectedItemValueContext } from '@c2n/list-item/list-item-context.js'
import { ListItem } from '@c2n/list-item'
import { provide } from '@lit/context'
import { arrayPropertyConverter } from '@c2n/core/lit-helper.js'

export interface SelectionChangeEventDetail {
  value: string[]
  data: unknown[]
}

/**
 * A vertical list of `c2-list-item` rows with single or multiple selection. The list owns the selection: it reads the
 * `value` of the clicked row, updates its own `value` (a `;`-separated list in the attribute, an array in the property)
 * and pushes the selected state down to every row through context, so rows never need a `selected` attribute of
 * their own when they live inside a list.
 *
 * Keyboard: the list is a `listbox` with a roving `tabindex`. Arrow Up/Down move between enabled rows, Home/End jump to
 * the first/last, Enter and Space select the focused row, and typing letters jumps to the next row starting with them.
 *
 * Besides rows, the default slot accepts `<hr>` dividers and `<h1>`–`<h6>` group headings; both are styled by the
 * `__divider` and `__heading` tokens and skipped by selection and keyboard.
 *
 * @tag c2-list
 *
 * @slot default - The rows: `c2-list-item` elements (or wrappers whose first child is a `c2-list-item`), plus `<hr>` dividers and heading elements.
 *
 * @event {CustomEvent<SelectionChangeEventDetail>} selection-change - Fired after the user changes the selection. `detail.value` is the array of selected values, `detail.data` the matching `data` of each row.
 *
 * @cssproperty {color} [--c2-list--background=#ffffff]
 * @cssproperty {pixel} --c2-list--gap
 *
 * @cssproperty {border-radius} --c2-list--border-top-left-radius
 * @cssproperty {border-radius} --c2-list--border-top-right-radius
 * @cssproperty {border-radius} --c2-list--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-list--border-bottom-right-radius
 *
 * @cssproperty {border} --c2-list--border-top
 * @cssproperty {border} --c2-list--border-bottom
 * @cssproperty {border} --c2-list--border-right
 * @cssproperty {border} --c2-list--border-left
 *
 * @cssproperty {box-shadow} --c2-list--box-shadow
 *
 * @cssproperty {padding} [--c2-list--padding-top=4px]
 * @cssproperty {padding} [--c2-list--padding-bottom=4px]
 * @cssproperty {padding} [--c2-list--padding-right=4px]
 * @cssproperty {padding} [--c2-list--padding-left=4px]
 *
 * @cssproperty {pixel} --c2-list--max-height - Scrolls when the rows are taller than this.
 *
 * @cssproperty {color} [--c2-list__divider--color=#e4e4e7]
 * @cssproperty {margin} [--c2-list__divider--margin=4px 0]
 *
 * @cssproperty {color} [--c2-list__heading--color=#71717a]
 * @cssproperty {font-size} [--c2-list__heading--font-size=11px]
 * @cssproperty {font-weight} [--c2-list__heading--font-weight=600]
 * @cssproperty {letter-spacing} [--c2-list__heading--letter-spacing=0.06em]
 * @cssproperty {text-transform} [--c2-list__heading--text-transform=uppercase]
 * @cssproperty {padding} [--c2-list__heading--padding-top=10px]
 * @cssproperty {padding} [--c2-list__heading--padding-right=10px]
 * @cssproperty {padding} [--c2-list__heading--padding-bottom=4px]
 * @cssproperty {padding} [--c2-list__heading--padding-left=10px]
 *
 * @slotcomponent c2-list-item
 */
@customElement('c2-list')
export class List extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Selected values. Written as `value="a;b"` in markup, read as `['a', 'b']` from the property. */
  @provide({ context: selectedItemValueContext })
  @property({
    converter: arrayPropertyConverter,
    reflect: true,
  })
  value: string[] = []

  /** The `data` of every selected row, in `value` order. Not an attribute. */
  data: unknown[] = []

  /** Dims the whole list and ignores clicks and keyboard. */
  @property({ type: Boolean, reflect: true }) disabled: boolean = false

  /** Allow several rows to be selected; clicking a selected row deselects it. */
  @property({ type: Boolean }) multiple: boolean = false

  /** Keep at least one row selected: clicking the only selected row does nothing. */
  @property({ type: Boolean }) required: boolean = false

  @query('slot')
  private listItemSlot!: HTMLSlotElement

  /** The row that currently holds the roving tabindex. */
  private focusedItem: ListItem | undefined = undefined

  private typeahead = ''
  private typeaheadTimer: ReturnType<typeof setTimeout> | undefined

  /** Slotted rows, in DOM order (dividers and headings excluded). */
  get items(): ListItem[] {
    return (this.listItemSlot?.assignedElements({ flatten: true }) ?? [])
      .map((slotItem) => (slotItem instanceof ListItem ? slotItem : slotItem.firstChild))
      .filter((item): item is ListItem => item instanceof ListItem)
  }

  private get enabledItems(): ListItem[] {
    return this.items.filter((item) => !item.disabled)
  }

  private handleSlotChange() {
    for (const listItem of this.items) {
      if (!listItem.applyContext) {
        listItem.applyContext = true
      }
    }
    this.syncRows()
  }

  /**
   * Mirrors the selection onto the rows: `data`, the roving tabindex, and `joined-before` / `joined-after` on adjacent
   * selected rows so `c2-list-item` can square the corners between them and a run of selected rows reads as one block.
   */
  private syncRows() {
    const items = this.items
    if (items.length === 0) return

    this.data = this.value.map((value) => items.find((item) => item.value === value)?.data)

    items.forEach((item, index) => {
      const selected = this.value.includes(item.value)
      item.toggleAttribute('joined-before', selected && index > 0 && this.value.includes(items[index - 1].value))
      item.toggleAttribute('joined-after', selected && index < items.length - 1 && this.value.includes(items[index + 1].value))
    })

    const enabled = this.enabledItems
    if (!this.focusedItem || !enabled.includes(this.focusedItem)) {
      this.focusedItem = enabled.find((item) => this.value.includes(item.value)) ?? enabled[0]
    }
    for (const item of items) item.tabIndex = item === this.focusedItem && !this.disabled ? 0 : -1
  }

  private setFocusedItem(item: ListItem, focus = true) {
    this.focusedItem = item
    for (const other of this.items) other.tabIndex = other === item ? 0 : -1
    if (focus) item.focus()
  }

  private handleListItemClick(event: Event) {
    if (this.disabled) return
    const target = event.target
    if (target instanceof ListItem && !target.disabled) {
      this.setFocusedItem(target, false)
      this.select(target.value)
    }
  }

  /** Applies a user selection of `value` (toggle in `multiple` mode) and fires `selection-change`. */
  private select(value: string) {
    const wasSelected = this.value.includes(value)
    const updatedValues = wasSelected ? this.value.filter((v) => v !== value) : this.multiple ? [...this.value, value] : [value]

    if (this.required && updatedValues.length === 0) {
      this.dispatchSelectionChangeEvent()
      return
    }
    this.value = updatedValues
    this.syncRows()
    this.dispatchSelectionChangeEvent()
  }

  private handleKeydown(event: KeyboardEvent) {
    if (this.disabled) return
    const enabled = this.enabledItems
    if (enabled.length === 0) return
    const current = event.target instanceof ListItem ? event.target : this.focusedItem
    const index = current ? enabled.indexOf(current) : -1

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.setFocusedItem(enabled[Math.min(index + 1, enabled.length - 1)])
        return
      case 'ArrowUp':
        event.preventDefault()
        this.setFocusedItem(enabled[Math.max(index - 1, 0)])
        return
      case 'Home':
        event.preventDefault()
        this.setFocusedItem(enabled[0])
        return
      case 'End':
        event.preventDefault()
        this.setFocusedItem(enabled[enabled.length - 1])
        return
      case 'Enter':
      case ' ':
        if (current) {
          event.preventDefault()
          if (current.href) current.renderRoot.querySelector('a')?.click()
          else this.select(current.value)
        }
        return
    }

    // Typeahead: letters jump to the next row whose text starts with what was typed.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      clearTimeout(this.typeaheadTimer)
      this.typeahead += event.key.toLowerCase()
      this.typeaheadTimer = setTimeout(() => (this.typeahead = ''), 600)
      const start = this.typeahead.length === 1 ? index + 1 : index
      const ordered = [...enabled.slice(Math.max(start, 0)), ...enabled.slice(0, Math.max(start, 0))]
      const match = ordered.find((item) => item.displayText.trim().toLowerCase().startsWith(this.typeahead))
      if (match) this.setFocusedItem(match)
    }
  }

  private dispatchSelectionChangeEvent() {
    this.dispatchEvent(
      new CustomEvent<SelectionChangeEventDetail>('selection-change', {
        bubbles: true,
        cancelable: true,
        detail: {
          value: this.value,
          data: this.data,
        },
      }),
    )
  }

  /** Flush lists (no vertical padding) let the first and last rows take the list's corner radius. */
  private syncPaddingClasses() {
    const style = getComputedStyle(this)
    this.classList.toggle('padding-top-0', style.paddingTop === '0px')
    this.classList.toggle('padding-bottom-0', style.paddingBottom === '0px')
  }

  protected override willUpdate(changedProperties: PropertyValueMap<this>): void {
    // Frameworks (and Astro islands) may set `value` as a `;`-separated string property instead of an attribute.
    if (changedProperties.has('value') && typeof this.value === 'string') {
      this.value = arrayPropertyConverter.fromAttribute(this.value)
    }
  }

  protected override updated(changedProperties: PropertyValueMap<this>): void {
    if (changedProperties.has('value') || changedProperties.has('disabled')) {
      this.syncRows()
    }
    this.setAttribute('role', 'listbox')
    this.setAttribute('aria-multiselectable', String(this.multiple))
    if (this.disabled) this.setAttribute('aria-disabled', 'true')
    else this.removeAttribute('aria-disabled')
    this.syncPaddingClasses()
  }

  /**
   * private function used for demo project in some edge case need to refresh component
   */
  _initComponent() {
    this.syncPaddingClasses()
  }

  override render() {
    return html`<slot @slotchange=${this.handleSlotChange} @click=${this.handleListItemClick} @keydown=${this.handleKeydown}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list': List
  }
}
