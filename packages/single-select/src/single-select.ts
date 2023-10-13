import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import styles from './single-select.scss?inline'

function createProcessSelectItemEvent(menuItem: any) {
  return new CustomEvent('process-select-item', {
    bubbles: true,
    composed: true,
    detail: menuItem,
  })
}

function createProcessValueEvent(value: any) {
  return new CustomEvent('process-value', {
    bubbles: true,
    composed: true,
    detail: value,
  })
}

function createChangeEvent(value: any) {
  return new CustomEvent('change', {
    bubbles: true,
    composed: true,
    detail: value,
  })
}

function createToggleMenuEvent() {
  return new Event('toggleMenu', {
    bubbles: true,
    composed: true,
  })
}

/**
 * SingleSelect component
 *
 * @slot
 * @csspart
 */
@customElement('c2-single-select')
export class SingleSelect extends LitElement {
  static override styles = unsafeCSS(styles)

  private _value: any = null

  get value() {
    return this._value
  }

  private set value(val: any) {
    this._value = val
    this.dispatchEvent(createChangeEvent(val))
  }

  @state() openMenu = false
  @state() inputText = ''

  constructor() {
    super()

    this.addEventListener('toggle-open-menu', this.handleToggleOpenMenu)
  }

  handleToggleOpenMenu = () => {
    this.openMenu = !this.openMenu
  }

  handleSelect = (event: CustomEvent) => {
    const processSelectItemEvent = createProcessSelectItemEvent(event.detail)
    this.dispatchEvent(processSelectItemEvent)
    this.value = processSelectItemEvent.detail

    const processValueEvent = createProcessValueEvent(this.value)
    this.dispatchEvent(processValueEvent)
    this.inputText = processValueEvent.detail

    this.dispatchEvent(createToggleMenuEvent())
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
        <div class="input-container" @click=${this.handleInputClick}>${this.renderInputSlot()}</div>
        <div class="menu-container" @select-item=${this.handleSelect}>
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
