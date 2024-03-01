import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './list.scss?inline'
import { selectedItemValueContext } from '@c2n/list-item/list-item-context.js'
import { ListItem } from '@c2n/list-item'
import { provide } from '@lit/context'

/**
 * @tag c2-list
 *
 * @slot default - default slot which accept c2-list-item as chidren
 *
 */
@customElement('c2-list')
export class List extends LitElement {
  static override styles = unsafeCSS(styles)

  @provide({ context: selectedItemValueContext })
  @property({
    converter: {
      toAttribute: (value: string[]) => {
        return Array.isArray(value) ? value.join(';') : ''
      },
      fromAttribute: (value: string) => {
        return value ? value.split(';') : []
      },
    },
    reflect: true,
  })
  value: string[] = []

  data: unknown[] = []

  @property({ type: Boolean }) disabled: boolean = false
  @property({ type: Boolean }) multiple: boolean = false

  @query('slot')
  private listItemSlot!: HTMLSlotElement

  private async handleSlotChange() {
    for (const slotItem of this.listItemSlot.assignedElements()) {
      const listItem = slotItem instanceof ListItem ? slotItem : slotItem.firstChild
      if (listItem instanceof ListItem && !listItem.applyContext) {
        listItem.applyContext = true
      }
    }
  }

  private handleListItemClick(event: Event) {
    const target = event.target
    if (target instanceof ListItem) {
      this.dispatchSelectionChangeEvent(target)
    }
  }

  private dispatchSelectionChangeEvent(target: ListItem) {
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

    const dispatched = this.dispatchEvent(
      new CustomEvent('selection-change', {
        bubbles: true,
        cancelable: true,
        detail: {
          value: updatedValues,
          data: updatedData,
        },
      }),
    )
    if (dispatched) {
      this.value = updatedValues
      this.data = updatedData
    }
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
