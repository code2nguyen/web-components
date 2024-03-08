import { LitElement, html, svg, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import styles from './select.scss?inline'
import { classMap } from 'lit/directives/class-map.js'
import type { SelectionChangeEventDetail } from '@c2n/list'
import { ListItem } from '@c2n/list-item'
import { arrayPropertyConverter } from '@c2n/wc-utils/lit-helper.js'
import { redispatchEvent } from '@c2n/wc-utils/dom-helper.js'

import '@c2n/overlay'
import '@c2n/list'

/**
 * @tag c2-select
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty {pixel} [--c2-select__default-icon--size=24px] - Default icon size
 * @cssproperty {padding} [--c2-select__button--padding=4px 8px 4px 8px] - Button padding
 * @cssproperty {background} [--c2-select__button--background=rgb(253, 253, 253)]
 * @cssproperty {color} [--c2-select__button--color=initial]
 * @cssproperty {pixel} [--c2-select__button--gap=4px]
 *
 * @cssproperty {font-size} [--c2-select__button--font-size=14px]
 * @cssproperty {font-weight} --c2-select__button--font-weight
 * @cssproperty {font-style} [--c2-select__button--font-style=normal]
 * @cssproperty {font-family} --c2-select__button--font-family
 *
 * @cssproperty {pixel} [--c2-select__button--border-top-left-radius=4px]
 * @cssproperty {pixel} [--c2-select__button--border-top-right-radius=4px]
 * @cssproperty {pixel} [--c2-select__button--border-bottom-left-radius=4px]
 * @cssproperty {pixel} [--c2-select__button--border-bottom-right-radius=4px]
 *
 * @cssproperty {border} [--c2-select__button--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-select__button--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-select__button--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-select__button--border-left=1px solid rgb(177, 177, 177)]
 *
 * @cssproperty {border} [--c2-select__button__hover--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-select__button__hover--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-select__button__hover--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-select__button__hover--border-left=1px solid rgb(177, 177, 177)]
 * @cssproperty {background} [--c2-select__button__hover--background=rgb(253, 253, 253)]
 * @cssproperty {color} [--c2-select__button__hover--color=initial]

 * @cssproperty {number} --c2-select__placeholder--font-weight
 * @cssproperty {font-style} --c2-select__placeholder--font-style
 * @cssproperty {color} --c2-select__placeholder--color
 * @cssproperty {number} --c2-select__placeholder--opacity
 *
 */
@customElement('c2-select')
export class Select extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true }) open = false
  @property({ type: Boolean, reflect: true }) readonly = false
  @property({ type: Boolean, reflect: true }) disabled = false
  @property({ type: Boolean, reflect: true }) focused = false
  @property({ type: Boolean }) fitTarget = false
  @property({ type: String }) placeholder = ''
  @property({ type: Boolean }) multiple: boolean = false

  /**
   * The value separated by <code>;</code>
   */
  @property({
    converter: arrayPropertyConverter,
    reflect: true,
  })
  value: string[] = []

  @query('#button', true) public button!: HTMLButtonElement
  @query('#menu-overlay', true) public menu!: HTMLElement
  @query('slot:not([name])', true) public listItemSlot?: HTMLSlotElement

  @state() private displayText = ''

  protected childItemsUpdated!: Promise<unknown[]>

  data: unknown[] = []

  private onButtonBlur(): void {
    this.focused = false
    this.button.removeEventListener('keydown', this.onKeydown)
  }

  private onKeydown = (event: KeyboardEvent): void => {
    this.focused = true
    if (event.code !== 'ArrowDown' && event.code !== 'ArrowUp') {
      return
    }
    event.preventDefault()
    this.toggle(true)
  }

  public toggle(value?: boolean): void {
    if (this.readonly) {
      return
    }

    if (typeof value == 'undefined') {
      this.menu.togglePopover()
      return
    }

    if (value && !this.menu.matches(':popover-open')) {
      return this.menu.showPopover()
    }

    if (value == false && this.menu.matches(':popover-open')) {
      return this.menu.hidePopover()
    }
  }

  private onButtonFocus(): void {
    this.button.addEventListener('keydown', this.onKeydown)
  }

  private prepareGetDisplayText() {
    const updates: Promise<unknown>[] = [new Promise((res) => requestAnimationFrame(() => res(true)))]
    if (this.listItemSlot) {
      for (const slotItem of this.listItemSlot.assignedElements({ flatten: true })) {
        const listItem = slotItem instanceof ListItem ? slotItem : (slotItem.firstChild as ListItem)
        if (listItem instanceof ListItem && this.value.includes(listItem.value)) {
          updates.push(listItem.updateComplete)
        }
      }
    }
    this.childItemsUpdated = Promise.all(updates)
  }

  private async updateDisplayText() {
    this.prepareGetDisplayText()
    await this.updateComplete
    const displayText: string[] = []
    if (this.listItemSlot) {
      for (const slotItem of this.listItemSlot.assignedElements({ flatten: true })) {
        const listItem = slotItem instanceof ListItem ? slotItem : (slotItem.firstChild as ListItem)
        if (listItem instanceof ListItem && this.value.includes(listItem.value)) {
          displayText.push(listItem.displayText)
        }
      }
    }
    this.displayText = displayText.join(' ')
  }

  private renderButtonContent() {
    const buttonContentClasses = {
      placeholder: !this.displayText,
    }
    return html`<div class="button-content ${classMap(buttonContentClasses)}">${this.displayText || this.placeholder}</div>`
  }

  private renderButtonIcon() {
    return svg`<svg class="default-icon" viewBox="0 -960 960 960">
      <path
        d="M479.8-371.077q-5.662 0-10.423-2.115-4.762-2.116-8.992-6.346l-181.2-181.2q-5.954-5.954-5.839-11.608.115-5.654 6.5-12.039 6.385-6.384 11.654-6.384t11.654 6.384L480-406.539l177.846-177.846q5.615-5.615 11.269-5.5 5.654.116 12.039 6.5 6.385 6.385 6.385 11.654 0 5.27-6.724 11.936l-181.2 180.257q-4.63 4.23-9.392 6.346-4.761 2.115-10.423 2.115Z"
      />
    </svg>`
  }

  private handleSelectionChange(event: CustomEvent<SelectionChangeEventDetail>) {
    this.value = event.detail.value
    this.data = event.detail.data
    if (!this.multiple) {
      this.toggle(false)
    }

    redispatchEvent(this, event)
  }

  private handleOverlayToggle(event: Event) {
    const toggleEvent = event as ToggleEvent
    this.open = toggleEvent.newState == 'open'
  }

  protected override updated(_changedProperties: PropertyValueMap<this>): void {
    if (_changedProperties.has('open')) {
      this.toggle(this.open)
    }
    if (_changedProperties.has('value')) {
      this.updateDisplayText()
    }
  }

  protected override async getUpdateComplete(): Promise<boolean> {
    const complete = (await super.getUpdateComplete()) as boolean
    await this.childItemsUpdated
    return complete
  }

  private handleSlotChange() {
    this.updateDisplayText()
  }

  override render() {
    return html`<div class="c2-select">
      <button
        aria-haspopup="true"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-labelledby="button icon label"
        id="button"
        popovertarget="menu-overlay"
        class="button"
        @blur=${this.onButtonBlur}
        @focus=${this.onButtonFocus}
        ?disabled=${this.disabled}
        tabindex="-1"
      >
        <slot name="button-content">${this.renderButtonContent()}</slot>
        <slot name="button-icon">${this.renderButtonIcon()}</slot>
      </button>
      <c2-overlay id="menu-overlay" popover @toggle=${this.handleOverlayToggle} ?fittarget=${this.fitTarget}>
        <c2-list id="list" .value=${this.value} class="list" ?multiple=${this.multiple} @selection-change=${this.handleSelectionChange}>
          <slot @slotchange=${this.handleSlotChange}></slot>
        </c2-list>
      </c2-overlay>
    </div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-select': Select
  }
}
