import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './label.scss?inline'
/**
 * Label component
 *
 * @slot
 * @csspart
 */
@customElement('c2-label')
export class Label extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true })
  public disabled = false

  @property({ type: String })
  public for = ''

  @query('slot')
  public slotEl!: HTMLSlotElement

  protected override firstUpdated(changes: PropertyValues): void {
    super.firstUpdated(changes)
    this.addEventListener('click', this.handleClick)
  }

  private handleClick(event: Event): void {
    if (this.disabled || event.defaultPrevented) return
    const parent = this.getRootNode() as ShadowRoot
    let target = parent.querySelector(`#${this.for}`) as HTMLElement
    if (!target) {
      target = this.parentElement?.querySelector(`#${this.for}`) as HTMLElement
    }

    if (!target) {
      return
    }

    target.focus()
  }

  override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-label': Label
  }
}
