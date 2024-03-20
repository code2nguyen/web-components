import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import styles from './tabs.scss?inline'
import { selectedTabContext } from './tab-context'
import { provide } from '@lit/context'
import { classMap } from 'lit/directives/class-map.js'

/**
 * @tag c2-tabs
 *
 *
 * @cssproperty {box-shadow} [--c2-tabs--box-shadow=inset 0px -2px 0px 0px rgb(230, 230, 230)]
 * @cssproperty {justify-content} [--c2-tabs--justify-content=flex-center]
 * @cssproperty {background-color} --c2-tabs--background-color
 * @cssproperty {pixel} --c2-tabs--height
 *
 * @cssproperty {font-weight} --c2-tabs--font-weight
 * @cssproperty {font-size} --c2-tabs--font-size
 * @cssproperty {font-style} --c2-tabs--font-style
 * @cssproperty {font-family} --c2-tabs--font-family
 *
 * @cssproperty {color} [--c2-tabs__indicator--color=rgb(109, 109, 109)]
 * @cssproperty {border-radius} --c2-tabs__indicator--border-radius
 * @cssproperty {pixel} [--c2-tabs__indicator--height=2px]
 *
 * @cssproperty {padding} [--c2-tabs__tab--padding-top=8px]
 * @cssproperty {padding} [--c2-tabs__tab--padding-right=16px]
 * @cssproperty {padding} [--c2-tabs__tab--padding-bottom=8px]
 * @cssproperty {padding} [--c2-tabs__tab--padding-left=16px]
 *
 * @cssproperty {color} --c2-tabs__tab--color
 * @cssproperty {background-color} --c2-tabs__tab--background-color
 *
 * @cssproperty {border-radius} --c2-tabs__tab--border-top-left-radius
 * @cssproperty {border-radius} --c2-tabs__tab--border-top-right-radius
 * @cssproperty {border-radius} --c2-tabs__tab--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-tabs__tab--border-bottom-right-radius
 *
 * @cssproperty {color} --c2-tabs__tab__hover--color
 * @cssproperty {background-color} --c2-tabs__tab__hover--background-color
 *
 * @cssproperty {color} --c2-tabs__tab__selected--color
 * @cssproperty {background-color} --c2-tabs__tab__selected--background-color
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

  protected override firstUpdated(_changedProperties: PropertyValueMap<this>): void {
    super.firstUpdated(_changedProperties)
    // this.updateSelectionIndicator()
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
