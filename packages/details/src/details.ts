import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './details.scss?inline'
/**
 * Details component
 *
 * @slot
 * @csspart
 */
@customElement('c2-details')
export class DetailsComponent extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true }) expanded = false

  protected renderDefaultIcon() {
    return html`<slot name="icon">
      <svg class="default-icon" viewBox="0 -960 960 960">
        <path
          d="M479.8-371.077q-5.662 0-10.423-2.115-4.762-2.116-8.992-6.346l-181.2-181.2q-5.954-5.954-5.839-11.608.115-5.654 6.5-12.039 6.385-6.384 11.654-6.384t11.654 6.384L480-406.539l177.846-177.846q5.615-5.615 11.269-5.5 5.654.116 12.039 6.5 6.385 6.385 6.385 11.654 0 5.27-6.724 11.936l-181.2 180.257q-4.63 4.23-9.392 6.346-4.761 2.115-10.423 2.115Z"
        />
      </svg>
    </slot>`
  }

  protected renderExpanedIcon() {
    return html`<slot name="expanded-icon" @slotchange=${this.handleExpandedSlotSlotChange}></slot>`
  }

  protected renderIcon() {
    return html` ${this.renderExpanedIcon()} ${this.renderDefaultIcon()}`
  }

  private handleExpandedSlotSlotChange(e: Event) {
    const slotElement = e.target as HTMLSlotElement
    const childNodes = slotElement.assignedNodes({ flatten: true })
    if (childNodes.length > 0) {
      slotElement.dataset.filled = 'filled'
    }
  }

  private handleDetailsToggle() {
    this.expanded = !this.expanded
  }

  override render() {
    return html`
      <details class="c2-details" ?open=${this.expanded} @toggle=${this.handleDetailsToggle}>
        <summary>
          <div class="c2-details-summary-content">
            <slot name="title">${this.title}</slot>
          </div>
          ${this.renderIcon()}
        </summary>
        <div class="c2-details-content">
          <slot></slot>
        </div>
      </details>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-details': DetailsComponent
  }
}
