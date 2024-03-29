import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './expansion-panel.scss?inline'

/**
 * @tag c2-expansion-panel
 *
 * @cssproperty {border} [--c2-expansion-panel--border-top=1px solid rgb(230, 230, 230)]
 * @cssproperty {border} [--c2-expansion-panel--border-right=1px solid rgb(230, 230, 230)]
 * @cssproperty {border} [--c2-expansion-panel--border-bottom=1px solid rgb(230, 230, 230)]
 * @cssproperty {border} [--c2-expansion-panel--border-left=1px solid rgb(230, 230, 230)]
 *
 * @cssproperty {border-radius} [--c2-expansion-panel--border-top-left-radius=0px]
 * @cssproperty {border-radius} [--c2-expansion-panel--border-top-right-radius=0px]
 * @cssproperty {border-radius} [--c2-expansion-panel--border-bottom-left-radius=0px]
 * @cssproperty {border-radius} [--c2-expansion-panel--border-bottom-right-radius=0px]
 *
 * @cssproperty {box-shadow} --c2-expansion-panel--box-shadow
 * @cssproperty {pixel} --c2-expansion-panel__header--gap
 *
 * @cssproperty {padding} [--c2-expansion-panel__header--padding-top=16px]
 * @cssproperty {padding} [--c2-expansion-panel__header--padding-right=16px]
 * @cssproperty {padding} [--c2-expansion-panel__header--padding-bottom=16px]
 * @cssproperty {padding} [--c2-expansion-panel__header--padding-left=16px]
 *
 * @cssproperty {background} --c2-expansion-panel__header__title--background
 * @cssproperty {pixel} [--c2-expansion-panel__header__title--gap=16px]
 * @cssproperty {flex-direction-row} [--c2-expansion-panel__header__title--flex-direction=row]
 * @cssproperty {border} [--c2-expansion-panel__header__title--border-bottom=0px solid transparent]
 *
 * @cssproperty {pixel} [--c2-expansion-panel__header__title__icon--width=24px]
 * @cssproperty {pixel} [--c2-expansion-panel__header__title__icon--height=24px]
 * @cssproperty {pixel} [--c2-expansion-panel__header__title__icon--rotage=180deg]
 * @cssproperty {color} --c2-expansion-panel__header__title__icon--color
 *
 * @cssproperty {background} [--c2-expansion-panel__header__title__hover--background=rgb(230, 230, 230)]
 *
 * @cssproperty {padding} [--c2-expansion-panel__content--padding-top=8px]
 * @cssproperty {padding} --c2-expansion-panel__content--padding-right
 * @cssproperty {padding} --c2-expansion-panel__content--padding-bottom
 * @cssproperty {padding} --c2-expansion-panel__content--padding-left
 */
@customElement('c2-expansion-panel')
export class ExpansionPanel extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true }) expanded = false

  @property({ type: Boolean, reflect: true, attribute: 'title-not-clickable' }) titleNotClickable = false

  @query('.c2-expansion-panel-content') contentElement?: HTMLElement
  @query('.c2-expansion-panel-content__detect-height') contentHeightDetectElement?: HTMLElement

  protected renderDefaultIcon() {
    return html`<slot name="icon" @click=${this.handleIconClick}>
      <svg class="default-icon" fill="currentColor" viewBox="0 -960 960 960">
        <path
          d="M479.8-371.077q-5.662 0-10.423-2.115-4.762-2.116-8.992-6.346l-181.2-181.2q-5.954-5.954-5.839-11.608.115-5.654 6.5-12.039 6.385-6.384 11.654-6.384t11.654 6.384L480-406.539l177.846-177.846q5.615-5.615 11.269-5.5 5.654.116 12.039 6.5 6.385 6.385 6.385 11.654 0 5.27-6.724 11.936l-181.2 180.257q-4.63 4.23-9.392 6.346-4.761 2.115-10.423 2.115Z"
        />
      </svg>
    </slot>`
  }

  protected renderExpanedIcon() {
    return html`<slot name="expanded-icon" @click=${this.handleIconClick} @slotchange=${this.addFilledData}></slot>`
  }

  protected renderIcon() {
    return html` ${this.renderExpanedIcon()} ${this.renderDefaultIcon()}`
  }

  private addFilledData(e: Event) {
    const slotElement = e.target as HTMLSlotElement
    const childNodes = slotElement.assignedNodes({ flatten: true })
    if (childNodes.length > 0) {
      slotElement.dataset.filled = 'filled'
      if (slotElement.parentElement) {
        slotElement.parentElement.dataset.filled = 'filled'
      }
    }
  }

  protected handleTitleToggle() {
    if (this.titleNotClickable) {
      return
    }
    this.toggleExpand()
  }

  protected handleIconClick(event: Event) {
    event.stopImmediatePropagation()
    this.toggleExpand()
  }

  private toggleExpand() {
    this.expanded = !this.expanded
    // Try to add animation, but it hurts the performance. So remove it for now.
    // if (this.contentElement && this.contentHeightDetectElement) {
    //   this.style.setProperty('--c2-expansion-panel-content-height', `${this.contentHeightDetectElement.clientHeight}px`)

    //   if (this.expanded) {
    //     this.contentHeightDetectElement.children[0].setAttribute('name', 'internalSlot')
    //     this.contentElement.children[0].removeAttribute('name')
    //     // this.contentElement.classList.add('expanding')
    //   } else {
    //     // this.contentElement.classList.add('collapsing')
    //     this.contentElement.children[0].setAttribute('name', 'internalSlot')
    //     this.contentHeightDetectElement.children[0].removeAttribute('name')
    //   }
    // }
  }

  override render() {
    return html`
      <div class="c2-expansion-panel">
        <div class="c2-expansion-panel-header">
          <div class="c2-expansion-panel-header-title" @click=${this.handleTitleToggle}>
            <div class="c2-expansion-panel-header-title-content">
              <slot name="title">${this.title}</slot>
            </div>
            ${this.renderIcon()}
          </div>
          <div class="c2-expansion-panel-header-content">
            <slot name="header-content" @slotchange=${this.addFilledData}></slot>
          </div>
        </div>
        <div class="c2-expansion-panel-content">
          <slot></slot>
          <!-- <slot name="internalSlot"></slot> -->
        </div>
      </div>
      <!-- <div class="c2-expansion-panel-content__detect-height">
        <slot></slot>
      </div> -->
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-expansion-panel': ExpansionPanel
  }
}
