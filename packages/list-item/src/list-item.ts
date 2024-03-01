import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property } from 'lit/decorators.js'
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
 * @cssproperty {pixel} [--c2-list-item-border-top-left-radius=inherit] - <code>border-top-left-radius</code> value
 * @cssproperty {pixel} [--c2-list-item-border-top-right-radius=inherit] - <code>border-top-right-radius</code> value
 * @cssproperty {pixel} [--c2-list-item-border-bottom-left-radius=inherit] - <code>border-bottom-left-radius</code> value
 * @cssproperty {pixel} [--c2-list-item-border-bottom-right-radius=inherit] - <code>border-bottom-right-radius</code> value
 * 
 * @cssproperty {pixel} [--c2-list-item-padding=4px 8px 4px 8px] - <code>padding</code> value
 *
 * @cssproperty {border} [--c2-list-item-border-top=0px solid transparent] - <code>border-top</code> value
 * @cssproperty {border} [--c2-list-item-border-bottom=0px solid transparent] - <code>border-bottom</code> value
 * @cssproperty {border} [--c2-list-item-border-right=0px solid transparent] - <code>border-right</code> value
 * @cssproperty {border} [--c2-list-item-border-left=0px solid transparent] - <code>border-left</code> value
 * @cssproperty {color} [--c2-list-item-color=inherit] - <code>color<code> value
 * @cssproperty {color} [--c2-list-item-background=transparent] - <code>background-color</code> value
 *
 * @cssproperty {hover - border} [--c2-list-item-hover-border-top=inherit] - Hover <code>border-top</code> value
 * @cssproperty {hover - border} [--c2-list-item-hover-border-bottom=inherit] - Hover <code>border-bottom</code> value
 * @cssproperty {hover - border} [--c2-list-item-hover-border-right=inherit] - Hover <code>border-right</code> value
 * @cssproperty {hover - border} [--c2-list-item-hover-border-left=inherit] - Hover <code>border-left</code> value
 * @cssproperty {hover - color} [--c2-list-item-hover-color=inherit] - Hover <code>color</code> value
 * @cssproperty {hover - color} [--c2-list-item-hover-background=rgb(230, 230, 230)] - Hover <code>background-color</code> value
 * 
 * @cssproperty {selected - border} [--c2-list-item-selected-border-top=inherit] - Selected <code>border-top</code> value
 * @cssproperty {selected - border} [--c2-list-item-selected-border-bottom=inherit] - Selected <code>border-bottom</code> value
 * @cssproperty {selected - border} [--c2-list-item-selected-border-right=inherit] - Selected <code>border-right</code> value
 * @cssproperty {selected - border} [--c2-list-item-selected-border-left=inherit] - Selected <code>border-left</code> value
 * @cssproperty {selected - color} [--c2-list-item-selected-color=inherit] - Selected <code>color</code> value
 * @cssproperty {selected - color} [--c2-list-item-selected-background=rgb(230, 230, 230)] - Selected <code>background-color</code> value
 
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

  /**
   * If <code>true</code>, the component is selected
   */

  @property({ type: Boolean, reflect: true }) selected = false

  /**
   * If <code>true</code>, the component is disabled
   */
  @property({ type: Boolean, reflect: true }) disabled = false

  /**
   * The value dispatch on selecting item
   */
  @property() value = ''

  /**
   * <code>data</code> property
   */
  @property({ attribute: false }) data?: unknown

  @property({ attribute: false }) applyContext = false

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
        <slot>${this.value}</slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list-item': ListItem
  }
}
