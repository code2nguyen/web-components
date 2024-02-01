import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './list-item.scss?inline'
import { classMap } from 'lit/directives/class-map.js'
import { addClasses } from '@c2n/wc-utils/css-helper.js'

/**
 * ListItem component
 *
 * @slot
 * @csspart
 */
@customElement('c2-list-item')
export class ListItem extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true }) selected = false
  @property({ type: Boolean, reflect: true }) disabled = false
  @property() value = ''

  handleClick = () => {
    this.selected = !this.selected
    this.dispatchEvent(
      new CustomEvent('selected-change', {
        bubbles: true,
        composed: true,
        detail: this.selected ? this.value : false,
      }),
    )
  }

  override render() {
    const classes = {
      selected: this.selected,
      disabled: this.disabled,
    }
    addClasses(this, Object.keys(classes))

    return html`
      <div class="c2-list-item ${classMap(classes)}" @clicl="handleClick">
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list-item': ListItem
  }
}
