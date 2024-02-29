import { LitElement, html, unsafeCSS, isServer } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './tab.scss?inline'
import { selectedTabContext } from './tab-context'
import { consume } from '@lit/context'
/**
 * @tag c2-tabs
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-tab')
export class Tab extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) label = ''
  @property({ type: String }) for = ''
  @property({ type: Boolean, reflect: true }) disabled = false

  @consume({ context: selectedTabContext, subscribe: true })
  private selectedTab: string = ''

  constructor() {
    super()
    if (!isServer) {
      this.setAttribute('slot', 'tab')
      this.addEventListener('click', this.handleClick)
    }
  }

  private handleClick() {
    if (this.selectedTab !== this.for) {
      this.dispatchEvent(
        new CustomEvent('tab-change', {
          bubbles: true,
          cancelable: true,
          detail: this.for,
        }),
      )
    }
  }

  override render() {
    return html` <slot>${this.label}</slot> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tab': Tab
  }
}