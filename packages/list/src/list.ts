import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
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
 * @cssproperty {color} [--c2-list--background=rgb(255, 255, 255)]
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
 * @cssproperty {padding} [--c2-list--padding-top=4px]
 * @cssproperty {padding} [--c2-list--padding-bottom=4px]
 * @cssproperty {padding} [--c2-list--padding-right=0px]
 * @cssproperty {padding} [--c2-list--padding-left=0px]
 *
 * @cssproperty {pixel} --c2-list--max-height
 *
 * @slotcomponent c2-list-item
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

  private initPaddingClass() {
    const styleMap = this.computedStyleMap()
    const paddingTop0 = styleMap.get('padding-top')?.toString() == '0px' ? true : false
    const paddingBottom0 = styleMap.get('padding-bottom')?.toString() == '0px' ? true : false
    this.classList.toggle('padding-top-0', paddingTop0)
    this.classList.toggle('padding-bottom-0', paddingBottom0)
  }

  protected override firstUpdated(_changedProperties: PropertyValueMap<this>): void {
    super.firstUpdated(_changedProperties)
  }

  /**
   * private function used for demo project in some edge case need to refresh component
   */
  _initComponent() {
    this.initPaddingClass()
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
