import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './select.scss?inline'
import { classMap } from 'lit/directives/class-map.js'
import '@c2n/overlay'
import '@c2n/list'
/**
 * @tag c2-select
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-select')
export class Select extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true })
  public open = false

  @property({ type: Boolean, reflect: true })
  public readonly = false

  @property({ type: Boolean, reflect: true })
  public disabled = false

  @property({ type: String })
  public value = ''

  @property({ type: String })
  public placeholder = ''

  @property({ type: Boolean, reflect: true })
  public focused = false

  @query('#button')
  public button!: HTMLButtonElement

  public onButtonBlur(): void {
    this.focused = false
    this.button.removeEventListener('keydown', this.onKeydown)
  }

  protected onKeydown = (event: KeyboardEvent): void => {
    this.focused = true
    if (event.code !== 'ArrowDown' && event.code !== 'ArrowUp') {
      return
    }
    event.preventDefault()
    this.toggle(true)
  }

  public toggle(target?: boolean): void {
    if (this.readonly) {
      return
    }
    this.open = typeof target !== 'undefined' ? target : !this.open
  }

  protected onButtonClick(): void {
    this.toggle()
  }

  public onButtonFocus(): void {
    this.button.addEventListener('keydown', this.onKeydown)
  }

  public close(): void {
    if (this.readonly) {
      return
    }
    this.open = false
  }

  private renderButtonContent() {
    const buttonContentClasses = {
      placeholder: !this.value,
    }
    return html`<div class=${classMap(buttonContentClasses)}>${this.value}</div>`
  }

  override render() {
    return html`
      <div class="c2-select">
        <button
          aria-haspopup="true"
          aria-expanded=${this.open ? 'true' : 'false'}
          aria-labelledby="button icon label"
          id="button"
          popovertarget="menu-overlay"
          class="button"
          @blur=${this.onButtonBlur}
          @click=${this.onButtonClick}
          @focus=${this.onButtonFocus}
          ?disabled=${this.disabled}
          tabindex="-1"
        >
          <slot name="button-content">${this.renderButtonContent()}</slot>
        </button>
        <c2-overlay id="menu-overlay" popover>
          <c2-list id="list" class="list" applyContext> <slot></slot> </c2-list>
        </c2-overlay>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-select': Select
  }
}
