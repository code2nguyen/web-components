import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './expansion-panel.scss?inline'
/**
 * ExpansionPanel component
 *
 * @slot
 * @csspart
 */
@customElement('c2-expansion-panel')
export class ExpansionPanel extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true }) expanded = false

  @property({ type: Boolean, reflect: true, attribute: 'header-clickable' }) headerClickable = false

  protected renderDefaultIcon() {
    return html`<slot name="icon" @click=${this.handleIconClick}>
      <svg class="default-icon" viewBox="0 -960 960 960">
        <path
          d="M479.8-371.077q-5.662 0-10.423-2.115-4.762-2.116-8.992-6.346l-181.2-181.2q-5.954-5.954-5.839-11.608.115-5.654 6.5-12.039 6.385-6.384 11.654-6.384t11.654 6.384L480-406.539l177.846-177.846q5.615-5.615 11.269-5.5 5.654.116 12.039 6.5 6.385 6.385 6.385 11.654 0 5.27-6.724 11.936l-181.2 180.257q-4.63 4.23-9.392 6.346-4.761 2.115-10.423 2.115Z"
        />
      </svg>
    </slot>`
  }

  protected renderExpanedIcon() {
    return html`<slot name="expanded-icon" @click=${this.handleIconClick} @slotchange=${this.handleExpandedSlotSlotChange}></slot>`
  }

  protected renderIcon() {
    return html` ${this.renderExpanedIcon()} ${this.renderDefaultIcon()}`
  }

  private handleExpandedSlotSlotChange(e: Event) {
      const slotElement = e.target as HTMLSlotElement;
      const childNodes = slotElement.assignedNodes({ flatten: true })
      if (childNodes.length > 0) {
        slotElement.dataset.filled = 'filled'
      }
  }

  protected handleDetailsToggle(event: Event) {
    event.preventDefault()
    if (this.headerClickable) {
      this.expanded = !this.expanded        
    }    
  }

  protected handleIconClick(event: Event) {
    event.preventDefault()
    event.stopImmediatePropagation()
    this.expanded = !this.expanded    
  }

  override render() {
    return html`
      <details class="c2-expansion-panel" ?open=${this.expanded}>
        <summary @click=${this.handleDetailsToggle}>
          <div class="c2-expansion-panel-title">
            <slot name="title">${this.title}</slot>
            <div></div>
            ${this.renderIcon()}
          </div>
        </summary>
        <div class="c2-expansion-panel-content">
          <slot></slot>
        </div>
      </details>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-expansion-panel': ExpansionPanel
  }
}
