import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import styles from './single-select.scss?inline'

/**
 * @tag c2-single-select
 *
 * @slot
 * @csspart
 */
@customElement('c2-single-select')
export class SingleSelect extends LitElement {
  static override styles = unsafeCSS(styles)

  static instanceCount = 0

  @property({ type: String, reflect: true }) value = ''

  /**
   * <code>data</code> property
   */
  @property({ attribute: false }) data?: unknown

  @state() openMenu = false

  @state() inputText = ''

  constructor() {
    super()

    // this.addEventListener('toggle-open-menu', this.handleToggleOpenMenu)
  }

  handleToggleOpenMenu = () => {
    this.openMenu = !this.openMenu
  }

  handleSelect = (event: CustomEvent) => {
    // const processSelectItemEvent = createProcessSelectItemEvent(event.detail)
    // this.dispatchEvent(processSelectItemEvent)
    // this.value = processSelectItemEvent.detail
    // const processValueEvent = createProcessValueEvent(this.value)
    // this.dispatchEvent(processValueEvent)
    // this.inputText = processValueEvent.detail
    // this.dispatchEvent(createToggleMenuEvent())
  }

  protected renderInputIcon() {
    return html`<slot name="input-icon">
      <svg class="default-icon" viewBox="0 -960 960 960">
        <path
          d="M479.8-371.077q-5.662 0-10.423-2.115-4.762-2.116-8.992-6.346l-181.2-181.2q-5.954-5.954-5.839-11.608.115-5.654 6.5-12.039 6.385-6.384 11.654-6.384t11.654 6.384L480-406.539l177.846-177.846q5.615-5.615 11.269-5.5 5.654.116 12.039 6.5 6.385 6.385 6.385 11.654 0 5.27-6.724 11.936l-181.2 180.257q-4.63 4.23-9.392 6.346-4.761 2.115-10.423 2.115Z"
        />
      </svg>
    </slot>`
  }

  protected renderInputSlot() {
    return html`<slot name="input">
      <div class="default-input">
        <div>{{inputText}}</div>
        ${this.renderInputIcon()}
      </div>
    </slot> `
  }

  protected handleInputClick() {
    this.openMenu = true
  }

  override render() {
    return html`
      <div class="c2-single-select">
        <div class="input-container" popovertarget="single-select-menu" @click=${this.handleInputClick}>${this.renderInputSlot()}</div>
        <div class="menu-container" id="single-select-menu" @select-item=${this.handleSelect}>
          <slot name="menu"></slot>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-single-select': SingleSelect
  }
}
