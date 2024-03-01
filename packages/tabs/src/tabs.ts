import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import styles from './tabs.scss?inline'
import { selectedTabContext } from './tab-context'
import { provide } from '@lit/context'
import { classMap } from 'lit/directives/class-map.js'

/**
 * @tag c2-tabs
 *
 *
 * @event
 * @cssproperty
 */
@customElement('c2-tabs')
export class Tabs extends LitElement {
  static override styles = unsafeCSS(styles)

  private _selectedTab = ''

  get selectedTab() {
    return this._selectedTab
  }
  @provide({ context: selectedTabContext })
  @property({ type: String, attribute: 'selected-tab' })
  set selectedTab(value: string) {
    this._selectedTab = value
    this.updateTabContentSlot()
  }

  @query('slot[name="tab"]')
  private tabsSlot!: HTMLSlotElement

  @query('slot[name="tab-content"]')
  private selectedSlot!: HTMLSlotElement

  @state()
  private selectionIndicatorStyle = ''

  private handleTabChange(event: CustomEvent) {
    this.selectedTab = event.detail
    this.updateTabContentSlot()
    this.updateSelectionIndicator(event.target as HTMLElement)
  }

  private updateTabContentSlot() {
    this.selectedSlot?.assignedElements()[0]?.removeAttribute('slot')

    for (const child of this.children) {
      if (child.id == this.selectedTab) {
        child.setAttribute('slot', 'tab-content')
      }
    }
  }

  private updateSelectionIndicator(tab: HTMLElement) {
    const tabClienRect = tab.getBoundingClientRect()
    this.selectionIndicatorStyle = `transform: translateX(${tab.offsetLeft - this.offsetLeft}px) scaleX(${tabClienRect.width});`
    for (const el of this.tabsSlot.assignedElements()) {
      if (el == tab) {
        el.setAttribute('selected', '')
      } else {
        el.removeAttribute('selected')
      }
    }
  }

  private firstPosition = true
  private async handleTabSlotChange() {
    if (this.firstPosition) {
      for (const tab of this.tabsSlot.assignedElements()) {
        if (tab.getAttribute('for') == this.selectedTab) {
          this.updateSelectionIndicator(tab as HTMLElement)
          await this.updateComplete
          this.firstPosition = false
          break
        }
      }
    }
  }

  override render() {
    return html`
      <div class="c2-tabs">
        <div class="c2-tabs-header" @tab-change=${this.handleTabChange}>
          <slot name="tab" @slotchange=${this.handleTabSlotChange}></slot>
          <div class="selection-indicator ${classMap({ 'first-position': this.firstPosition })}" style=${this.selectionIndicatorStyle}></div>
        </div>
        <slot name="tab-content"></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tabs': Tabs
  }
}
