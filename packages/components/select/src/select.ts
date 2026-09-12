import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import styles from './select.scss?inline'
import { classMap } from 'lit/directives/class-map.js'
import type { SelectionChangeEventDetail } from '@c2n/list'
import { ListItem } from '@c2n/list-item'
import { arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'

import '@c2n/overlay'
import '@c2n/list'

/**
 * A dropdown built from a trigger button and a `c2-list` of `c2-list-item` rows inside a `c2-overlay` popover. The
 * rows are the light-DOM children of the select, so they are themed with the `--c2-list-item--*` variables directly on
 * the select (or on a wrapper); the dropdown container is themed through the `--c2-select__list--*` variables and the
 * trigger through `--c2-select__button--*`. The select has no intrinsic width: give the host a `width` (or place it in
 * a grid/flex cell) and the trigger fills it.
 *
 * @tag c2-select
 *
 * @slot default - The options: `c2-list-item` elements, each with a `value`.
 * @slot button-prefix-icon - Icon shown at the start of the trigger: an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon`.
 * @slot button-suffix-icon - Icon shown at the end of the trigger. Defaults to a chevron that flips while open.
 * @slot button-content - Replaces the trigger text entirely (selected labels or placeholder) with custom markup.
 *
 * @event {CustomEvent<SelectionChangeEventDetail>} selection-change - Fired after the user picks an option. `detail.value` is the array of selected values (one entry unless `multiple`), `detail.data` the `data` of each selected row.
 *
 * @cssproperty {pixel} [--c2-select__button--min-height=36px]
 * @cssproperty {padding} [--c2-select__button--padding=6px 10px 6px 12px]
 * @cssproperty {pixel} [--c2-select__button--gap=8px] - Space between the icons and the text.
 * @cssproperty {color} [--c2-select__button--background=#ffffff]
 * @cssproperty {color} [--c2-select__button--color=#18181b]
 *
 * @cssproperty {font-size} [--c2-select__button--font-size=14px]
 * @cssproperty {font-weight} --c2-select__button--font-weight
 * @cssproperty {font-style} [--c2-select__button--font-style=normal]
 * @cssproperty {font-family} --c2-select__button--font-family
 *
 * @cssproperty {border-radius} [--c2-select__button--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-select__button--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-select__button--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-select__button--border-bottom-right-radius=6px]
 *
 * @cssproperty {border} [--c2-select__button--border-top=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-select__button--border-right=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-select__button--border-bottom=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-select__button--border-left=1px solid #bcbcc6]
 *
 * @cssproperty {border} [--c2-select__button__hover--border-top=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-select__button__hover--border-right=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-select__button__hover--border-bottom=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-select__button__hover--border-left=1px solid #a1a1aa]
 * @cssproperty {color} [--c2-select__button__hover--background=#fafafa]
 * @cssproperty {color} [--c2-select__button__hover--color=#18181b]
 *
 * @cssproperty {border} [--c2-select__button__open--border-top=1px solid #476ef9]
 * @cssproperty {border} [--c2-select__button__open--border-right=1px solid #476ef9]
 * @cssproperty {border} [--c2-select__button__open--border-bottom=1px solid #476ef9]
 * @cssproperty {border} [--c2-select__button__open--border-left=1px solid #476ef9]
 *
 * @cssproperty {outline} [--c2-select__button__focus--outline=2px solid rgba(71, 110, 249, 0.4)]
 * @cssproperty {pixel} [--c2-select__button__focus--outline-offset=1px]
 *
 * @cssproperty {opacity} [--c2-select__button__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-select__button__prefix-icon--width=16px]
 * @cssproperty {pixel} [--c2-select__button__prefix-icon--height=16px]
 * @cssproperty {color} --c2-select__button__prefix-icon--color - Defaults to the trigger text colour.
 *
 * @cssproperty {pixel} [--c2-select__button__suffix-icon--width=16px]
 * @cssproperty {pixel} [--c2-select__button__suffix-icon--height=16px]
 * @cssproperty {color} [--c2-select__button__suffix-icon--color=#71717a]
 *
 * @cssproperty {font-weight} --c2-select__placeholder--font-weight
 * @cssproperty {font-style} --c2-select__placeholder--font-style
 * @cssproperty {color} [--c2-select__placeholder--color=#71717a]
 * @cssproperty {opacity} [--c2-select__placeholder--opacity=1]
 *
 * @cssproperty {color} [--c2-select__list--background=#ffffff]
 * @cssproperty {border} [--c2-select__list--border-top=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-select__list--border-right=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-select__list--border-bottom=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-select__list--border-left=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-select__list--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-select__list--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-select__list--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-select__list--border-bottom-right-radius=8px]
 * @cssproperty {box-shadow} [--c2-select__list--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-select__list--padding-top=4px]
 * @cssproperty {padding} [--c2-select__list--padding-right=4px]
 * @cssproperty {padding} [--c2-select__list--padding-bottom=4px]
 * @cssproperty {padding} [--c2-select__list--padding-left=4px]
 * @cssproperty {pixel} [--c2-select__list--min-width=auto] - Floor for the dropdown's width; it is never narrower than the trigger.
 * @cssproperty {pixel} [--c2-select__list--max-height=280px] - The dropdown scrolls past this height.
 *
 * @internalcomponent c2-list
 * @internalcomponent c2-overlay
 *
 * @slotcomponent c2-list-item
 */
@customElement('c2-select')
export class Select extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Whether the dropdown is showing. Reflects the popover state; set it to open or close programmatically. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Shows the current value but never opens the dropdown. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Dims the trigger and ignores interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** True while the trigger has keyboard focus. */
  @property({ type: Boolean, reflect: true }) focused = false

  /** Make the dropdown exactly as wide as the trigger instead of at least as wide. */
  @property({ type: Boolean, attribute: 'fit-size' }) fitSize = false

  /** Text shown in the trigger while nothing is selected. */
  @property({ type: String }) placeholder = ''

  /** Accessible name of the trigger and option list. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Allow several options to be selected; the dropdown stays open after a pick and the trigger lists every label. */
  @property({ type: Boolean }) multiple: boolean = false

  /** Keep at least one option selected: picking the only selected option again does not clear it. */
  @property({ type: Boolean }) required: boolean = false

  /** Selected values. Written as `value="a;b"` in markup, read as `['a', 'b']` from the property. */
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
    if (this.readonly || this.disabled) {
      if (this.menu.matches(':popover-open')) this.menu.hidePopover()
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
    this.displayText = displayText.join(', ')
  }

  private renderButtonContent() {
    const buttonContentClasses = {
      placeholder: !this.displayText,
    }
    return html`<div class="button-content ${classMap(buttonContentClasses)}">${this.displayText || this.placeholder}</div>`
  }

  private renderButtonSuffixIcon() {
    return svg`<svg class="default-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>`
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

  protected override willUpdate(changedProperties: PropertyValueMap<this>): void {
    // Frameworks (and Astro islands) may set `value` as a `;`-separated string property instead of an attribute.
    if (changedProperties.has('value') && typeof this.value === 'string') {
      this.value = arrayPropertyConverter.fromAttribute(this.value)
    }
  }

  protected override updated(_changedProperties: PropertyValueMap<this>): void {
    if (_changedProperties.has('open') || _changedProperties.has('readonly') || _changedProperties.has('disabled')) {
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
        type="button"
        aria-label=${this.ariaLabel || nothing}
        aria-haspopup="listbox"
        aria-expanded=${this.open ? 'true' : 'false'}
        id="button"
        popovertarget=${this.readonly || this.disabled ? nothing : 'menu-overlay'}
        class="button"
        @blur=${this.onButtonBlur}
        @focus=${this.onButtonFocus}
        ?disabled=${this.disabled}
      >
        <slot name="button-prefix-icon"></slot>
        <slot name="button-content">${this.renderButtonContent()}</slot>
        <slot name="button-suffix-icon">${this.renderButtonSuffixIcon()}</slot>
      </button>
      <c2-overlay id="menu-overlay" popover @toggle=${this.handleOverlayToggle} ?fit-anchor=${this.fitSize}>
        <c2-list
          id="list"
          aria-labelledby="button"
          .value=${this.value}
          class="list"
          ?multiple=${this.multiple}
          @selection-change=${this.handleSelectionChange}
          ?required=${this.required}
        >
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
