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
 * @cssproperty {pixel} --c2-list-item--border-top-left-radius - <code>border-top-left-radius</code> value
 * @cssproperty {pixel} --c2-list-item--border-top-right-radius - <code>border-top-right-radius</code> value
 * @cssproperty {pixel} --c2-list-item--border-bottom-left-radius - <code>border-bottom-left-radius</code> value
 * @cssproperty {pixel} --c2-list-item--border-bottom-right-radius - <code>border-bottom-right-radius</code> value
 * 
 * @cssproperty {pixel} [--c2-list-item--padding-top=4px] - <code>padding-top</code> value
 * @cssproperty {pixel} [--c2-list-item--padding-right=8px] - <code>padding-right</code> value
 * @cssproperty {pixel} [--c2-list-item--padding-bottom=8px] - <code>padding-bottom</code> value
 * @cssproperty {pixel} [--c2-list-item--padding-left=4px] - <code>padding-left</code> value
 * 
 * @cssproperty {font-size} [--c2-list-item--font-size=14]
 * @cssproperty {font-weight} --c2-list-item--font-weight
 * @cssproperty {font-style} [--c2-list-item--font-style=normal]
 * @cssproperty {font-family} --c2-list-item--font-family
 * 
 * @cssproperty {border} [--c2-list-item--border-top=0px solid transparent] - <code>border-top</code> value
 * @cssproperty {border} [--c2-list-item--border-bottom=0px solid transparent] - <code>border-bottom</code> value
 * @cssproperty {border} [--c2-list-item--border-right=0px solid transparent] - <code>border-right</code> value
 * @cssproperty {border} [--c2-list-item--border-left=0px solid transparent] - <code>border-left</code> value
 * @cssproperty {color} [--c2-list-item--color=initial] - <code>color<code> value
 * @cssproperty {color} [--c2-list-item--background=transparent] - <code>background-color</code> value
 *
 * @cssproperty {border} --c2-list-item__hover--border-top - Hover <code>border-top</code> value
 * @cssproperty {border} --c2-list-item__hover--border-bottom - Hover <code>border-bottom</code> value
 * @cssproperty {border} --c2-list-item__hover--border-right - Hover <code>border-right</code> value
 * @cssproperty {border} --c2-list-item__hover--border-left - Hover <code>border-left</code> value
 * @cssproperty {color}  --c2-list-item__hover--color - Hover <code>color</code> value
 * @cssproperty {color} [--c2-list-item__hover--background=rgb(230, 230, 230)] - Hover <code>background-color</code> value
 * 
 * @cssproperty {border} --c2-list-item__selected--border-top - Selected <code>border-top</code> value
 * @cssproperty {border} --c2-list-item__selected--border-bottom - Selected <code>border-bottom</code> value
 * @cssproperty {border} --c2-list-item__selected--border-right - Selected <code>border-right</code> value
 * @cssproperty {border} --c2-list-item__selected--border-left - Selected <code>border-left</code> value
 * @cssproperty {color} --c2-list-item__selected--color - Selected <code>color</code> value
 * @cssproperty {color} [--c2-list-item__selected--background=rgb(230, 230, 230)] - Selected <code>background-color</code> value
 
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
