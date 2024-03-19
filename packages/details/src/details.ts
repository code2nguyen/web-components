import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './details.scss?inline'

/**
 * @tag c2-details
 *
 * @cssproperty {border} [--c2-details--border-top=1px solid rgb(230, 230, 230)]
 * @cssproperty {border} [--c2-details--border-right=1px solid rgb(230, 230, 230)]
 * @cssproperty {border} [--c2-details--border-bottom=1px solid rgb(230, 230, 230)]
 * @cssproperty {border} [--c2-details--border-left=1px solid rgb(230, 230, 230)]
 * 
 * @cssproperty {border-radius} [--c2-details--border-top=left-radius=0px]
 * @cssproperty {border-radius} [--c2-details--border-top=right-radius=0px]
 * @cssproperty {border-radius} [--c2-details--border-bottom=left-radius=0px]
 * @cssproperty {border-radius} [--c2-details--border-bottom=right-radius=0px]
 * 
 * @cssproperty {box-shadow} --c2-details--box-shadow
 *
 * @cssproperty {padding} [--c2-details__header--padding-top=16px]
 * @cssproperty {padding} [--c2-details__header--padding-right=16px]
 * @cssproperty {padding} [--c2-details__header--padding-bottom=16px]
 * @cssproperty {padding} [--c2-details__header--padding-left=16px]
 * 
 * @cssproperty {background} --c2-details__header--background
 * @cssproperty {pixel} [--c2-details__header--gap=16px]
 * @cssproperty {flex-direction-row} [--c2-details__header--flex-direction=row]
 * 
 * @cssproperty {pixel} [--c2-details__header__ison--width=24px]
 * @cssproperty {pixel} [--c2-details__header__ison--height=24px]
 * @cssproperty {pixel} [--c2-details__header__ison--rotage=180deg]
 * 
 * @cssproperty {background} [--c2-details__header__hover--background=rgb(230, 230, 230)]
 * 
 * @cssproperty {padding} [--c2-details__content--padding-top=0px]
 * @cssproperty {padding} --c2-details__content--padding-right
 * @cssproperty {padding} --c2-details__content--padding-bottom
 * @cssproperty {padding} --c2-details__content--padding-left
 */
@customElement('c2-details')
export class Details extends LitElement {
  static override styles = unsafeCSS(styles)

  @query('details') protected detailsElement!: HTMLDetailsElement

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
    this.expanded = this.detailsElement.open
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
    'c2-details': Details
  }
}
