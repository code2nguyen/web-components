import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './list-item.scss?inline'
import { selectedItemValueContext } from './list-item-context'
import { ContextConsumer } from '@c2n/wc-utils/controllers/context-consumer.js'
import { redispatchEvent } from '@c2n/wc-utils/dom-helper.js'
/**
 * @tag c2-list-item
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event {CustomEvent} selected-change - An Event emitted after selection state is changed
 *
 * @cssproperty {pixel} --c2-list-item--border-top-left-radius 
 * @cssproperty {pixel} --c2-list-item--border-top-right-radius 
 * @cssproperty {pixel} --c2-list-item--border-bottom-left-radius
 * @cssproperty {pixel} --c2-list-item--border-bottom-right-radius
 * 
 * @cssproperty {pixel} [--c2-list-item--padding-top=4px]
 * @cssproperty {pixel} [--c2-list-item--padding-right=8px]
 * @cssproperty {pixel} [--c2-list-item--padding-bottom=8px]
 * @cssproperty {pixel} [--c2-list-item--padding-left=4px] 
 * 
 * @cssproperty {font-size} --c2-list-item--font-size
 * @cssproperty {font-weight} --c2-list-item--font-weight
 * @cssproperty {font-style} --c2-list-item--font-style
 * @cssproperty {font-family} --c2-list-item--font-family
 * 
 * @cssproperty {border} --c2-list-item--border-top
 * @cssproperty {border} --c2-list-item--border-bottom
 * @cssproperty {border} --c2-list-item--border-right
 * @cssproperty {border} --c2-list-item--border-left
 * 
 * @cssproperty {color} --c2-list-item--color
 * @cssproperty {color} --c2-list-item--background
 *
 * @cssproperty {border} --c2-list-item__hover--border-top
 * @cssproperty {border} --c2-list-item__hover--border-bottom
 * @cssproperty {border} --c2-list-item__hover--border-right
 * @cssproperty {border} --c2-list-item__hover--border-left
 * @cssproperty {color}  --c2-list-item__hover--color 
 * @cssproperty {color} [--c2-list-item__hover--background=rgb(230, 230, 230)]
 * 
 * @cssproperty {border} --c2-list-item__selected--border-top
 * @cssproperty {border} --c2-list-item__selected--border-bottom
 * @cssproperty {border} --c2-list-item__selected--border-right
 * @cssproperty {border} --c2-list-item__selected--border-left
 * @cssproperty {color} --c2-list-item__selected--color
 * @cssproperty {color} --c2-list-item__selected--background
 
 */
@customElement('c2-list-item')
export class ListItem extends LitElement {
  static override styles = unsafeCSS(styles)

  private contextConsumer = new ContextConsumer(this, {
    context: selectedItemValueContext,
    subscribe: true,
    callback: (value) => {
      this.selected = value ? value.includes(this.value) : false
    },
  })

  @property({ type: Boolean, reflect: true }) selected = false
  @property({ type: Boolean, reflect: true }) disabled = false
  @property() value = ''
  @property() label?: string
  @property({ attribute: false }) data?: unknown

  /**
   * Private property, it will use context value to setup selected state of component.
   */
  @property({ attribute: false }) applyContext = false

  @query('slot')
  private contentSlot!: HTMLSlotElement

  get displayText(): string {
    if (this.label !== undefined) return this.label

    return (
      (this.contentSlot
        .assignedNodes({ flatten: true })
        .flatMap((item) => (item as HTMLElement).innerText ?? (item as HTMLElement).textContent)
        .join(' ') ||
        this.contentSlot.innerText) ??
      this.contentSlot.textContent
    )
  }

  private handleClick = (event: Event) => {
    const dispatched = redispatchEvent(this, event)

    if (dispatched && this.applyContext == false) {
      this.selected = !this.selected
    }
  }

  protected override willUpdate(changedProperties: PropertyValueMap<this>): void {
    if (changedProperties.has('applyContext')) {
      if (this.applyContext) {
        this.contextConsumer.applyContext()
      } else if (this.applyContext == false) {
        this.contextConsumer.unApplyContext()
      }
    }
  }

  override render() {
    return html`
      <div class="c2-list-item" @click=${this.handleClick}>
        <slot>${this.label ?? this.value}</slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list-item': ListItem
  }
}
