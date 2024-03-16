import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './list.scss?inline'
import { selectedItemValueContext } from '@c2n/list-item/list-item-context.js'
import { ListItem } from '@c2n/list-item'
import { provide } from '@lit/context'
import { arrayPropertyConverter } from '@c2n/wc-utils/lit-helper.js'

export interface SelectionChangeEventDetail {
  value: string[]
  data: unknown[]
}

/**
 * @tag c2-list
 *
 * @slot default - default slot which accept c2-list-item as chidren
 *
 * @cssproperty {pixel} [--c2-list--border-top-left-radius=initial] - <code>border-top-left-radius</code> value
 * @cssproperty {pixel} [--c2-list--border-top-right-radius=initial] - <code>border-top-right-radius</code> value
 * @cssproperty {pixel} [--c2-list--border-bottom-left-radius=initial] - <code>border-bottom-left-radius</code> value
 * @cssproperty {pixel} [--c2-list--border-bottom-right-radius=initial] - <code>border-bottom-right-radius</code> value
 *
 * @cssproperty {border} --c2-list--border-top - <code>border-top</code> value
 * @cssproperty {border} --c2-list--border-bottom - <code>border-bottom</code> value
 * @cssproperty {border} --c2-list--border-right - <code>border-right</code> value
 * @cssproperty {border} --c2-list--border-left - <code>border-left</code> value
 *
 * @cssproperty {color} [--c2-list--background=rgb(255, 255, 255)] - <code>background-color</code> value
 */
@customElement('c2-list')
export class List extends LitElement {
  static override styles = unsafeCSS(styles)

  @provide({ context: selectedItemValueContext })
  @property({
    converter: arrayPropertyConverter,
    reflect: true,
  })
  value: string[] = []

  data: unknown[] = []

  @property({ type: Boolean }) disabled: boolean = false
  @property({ type: Boolean }) multiple: boolean = false
  @property({ type: Boolean }) required: boolean = false

  @query('slot')
  private listItemSlot!: HTMLSlotElement

  private async handleSlotChange() {
    for (const slotItem of this.listItemSlot.assignedElements({ flatten: true })) {
      const listItem = slotItem instanceof ListItem ? slotItem : slotItem.firstChild
      if (listItem instanceof ListItem && !listItem.applyContext) {
        listItem.applyContext = true
      }
    }
  }

  private handleListItemClick(event: Event) {
    const target = event.target
    if (target instanceof ListItem) {
      this.updateValueAndData(target)
      this.dispatchSelectionChangeEvent()
    }
  }

  private updateValueAndData(target: ListItem) {
    const updatedValues = this.value.includes(target.value)
      ? this.value.filter((item) => item !== target.value)
      : this.multiple
        ? [...this.value, target.value]
        : [target.value]
    const updatedData = this.data.includes(target.data)
      ? this.data.filter((item) => item !== target.data)
      : this.multiple
        ? [...this.data, target.data]
        : [target.data]

    if (this.required && updatedValues.length == 0) {
      this.dispatchSelectionChangeEvent()
      return
    }
    this.value = updatedValues
    this.data = updatedData
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

  override render() {
    return html`<slot @slotchange=${this.handleSlotChange} @click=${this.handleListItemClick}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list': List
  }
}
