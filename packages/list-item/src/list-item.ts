import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './list-item.scss?inline'

/**
 * @tag c2-list-item
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event {CustomEvent} selected-change - An Event emitted after selection state is changed
 *
 * @cssproperty {pixel} [--c2-list-item-border-radius=inherit] - <code>border-radius</code> value
 * @cssproperty {pixel} [--c2-list-item-padding=4px 8px 4px 8px] - <code>padding</code> value
 *
 * @cssproperty {border} [--c2-list-item-border-top=0px solid transparent] - <code>border-top</code> value
 * @cssproperty {border} [--c2-list-item-border-bottom=0px solid transparent] - <code>border-bottom</code> value
 * @cssproperty {border} [--c2-list-item-border-right=0px solid transparent] - <code>border-right</code> value
 * @cssproperty {border} [--c2-list-item-border-left=0px solid transparent] - <code>border-left</code> value
 * @cssproperty {color} [--c2-list-item-color=inherit] - <code>color<code> value
 * @cssproperty {color} [--c2-list-item-bg-color=transparent] - <code>background-color</code> value
 *
 * @cssproperty {hover - border} [--c2-list-item-hover-border-top=inherit] - Hover <code>border-top</code> value
 * @cssproperty {hover - border} [--c2-list-item-hover-border-bottom=inherit] - Hover <code>border-bottom</code> value
 * @cssproperty {hover - border} [--c2-list-item-hover-border-right=inherit] - Hover <code>border-right</code> value
 * @cssproperty {hover - border} [--c2-list-item-hover-border-left=inherit] - Hover <code>border-left</code> value
 * @cssproperty {hover - color} [--c2-list-item-hover-color=inherit] - Hover <code>color</code> value
 * @cssproperty {hover - color} [--c2-list-item-hover-bg-color=rgb(230, 230, 230)] - Hover <code>background-color</code> value
 * 
 * @cssproperty {selected - border} [--c2-list-item-selected-border-top=inherit] - Selected <code>border-top</code> value
 * @cssproperty {selected - border} [--c2-list-item-selected-border-bottom=inherit] - Selected <code>border-bottom</code> value
 * @cssproperty {selected - border} [--c2-list-item-selected-border-right=inherit] - Selected <code>border-right</code> value
 * @cssproperty {selected - border} [--c2-list-item-selected-border-left=inherit] - Selected <code>border-left</code> value
 * @cssproperty {selected - color} [--c2-list-item-selected-color=inherit] - Selected <code>color</code> value
 * @cssproperty {selected - color} [--c2-list-item-selected-bg-color=rgb(230, 230, 230)] - Selected <code>background-color</code> value
 
 */
@customElement('c2-list-item')
export class ListItem extends LitElement {
  static override styles = unsafeCSS(styles)

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

  private handleClick = () => {
    const eventResult = this.dispatchEvent(
      new CustomEvent('selected-change', {
        bubbles: true,
        composed: true,
        detail: {
          selected: !this.selected,
          value: this.value,
          data: this.data,
        },
      }),
    )
    if (eventResult) {
      this.selected = !this.selected
    }
  }

  /**
   * <code>data</code> property
   */
  @property({ attribute: false }) data?: unknown

  override render() {
    return html`
      <div class="c2-list-item" @click=${this.handleClick}>
        <slot></slot>
        git
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list-item': ListItem
  }
}
