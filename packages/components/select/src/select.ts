import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValueMap } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './select.scss?inline'
import { classMap } from 'lit/directives/class-map.js'
import type { SelectionChangeEventDetail } from '@c2n/list'
import { ListItem } from '@c2n/list-item'
import { arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'

import '@c2n/overlay'
import '@c2n/list'

/** Events fired by {@link Select}, keyed for `addEventListener`. */
export interface SelectEventMap {
  'selection-change': CustomEvent<SelectionChangeEventDetail>
  input: Event
  change: Event
}

export interface Select {
  addEventListener: TypedAddEventListener<Select, SelectEventMap>
  removeEventListener: TypedRemoveEventListener<Select, SelectEventMap>
}

/** Once per page: the cause is always the same, and one select with the problem usually means all of them. */
let warnedUnupgraded = false

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
 * @event {CustomEvent<SelectionChangeEventDetail>} selection-change - Fired after the user picks an option. `detail.value` is the array of selected values (one entry unless `multiple`), `detail.data` the `data` of each selected row. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself rather than on an ancestor.
 * @event {Event} input - Fired with `selection-change`, after `value` is updated. Carries no detail: it exists so the select behaves like the other form controls, which is what `v-model`, `ngModel` and any generic form binding listen for.
 * @event {Event} change - Fired with `input`. A select commits on every pick, so the two always fire together.
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
 * @cssproperty {pixel} [--c2-select__button__focus--outline-offset=0px] - Flush by default: `[open]` already turns the border accent, so an offset ring reads as a second border.
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
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  @state() private disabledByForm = false
  private defaultValue: string[] = []
  private defaultValueCaptured = false

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

  /**
   * Mirrors the host's `aria-labelledby` so the trigger re-renders when a label claims the element — a
   * `c2-label[for]` sets it after both have upgraded.
   */
  @property({ attribute: 'aria-labelledby' }) ariaLabelledByAttr: string | null = null

  /** Text of whatever labels the host, resolved once the DOM settles; see {@link triggerLabel}. */
  @state() private labelText = ''

  /** Allow several options to be selected; the dropdown stays open after a pick and the trigger lists every label. */
  @property({ type: Boolean }) multiple: boolean = false

  /** Keep at least one option selected: picking the only selected option again does not clear it. */
  @property({ type: Boolean }) required: boolean = false

  /** Name used when the select participates in a form. */
  @property({ type: String }) name = ''

  /** Selected values. Written as `value="a;b"` in markup, read as `['a', 'b']` from the property. */
  @property({
    converter: arrayPropertyConverter,
    reflect: true,
  })
  value: string[] = []

  /** Scalar convenience API for a single-select. Setting it replaces the current selection. */
  get selectedValue(): string {
    return this.value[0] ?? ''
  }

  set selectedValue(value: string) {
    this.value = value ? [value] : []
  }

  /** The containing form, when this control is associated with one. */
  get form() {
    return this.internals.form
  }

  /** Labels associated with this form control. */
  get labels() {
    return this.internals.labels
  }

  get validity() {
    return this.internals.validity
  }

  get validationMessage() {
    return this.internals.validationMessage
  }

  get willValidate() {
    return this.internals.willValidate
  }

  @query('#button', true) public button!: HTMLButtonElement
  @query('#menu-overlay', true) public menu!: HTMLElement
  @query('slot:not([name])', true) public listItemSlot?: HTMLSlotElement

  @state() private displayText = ''

  protected childItemsUpdated!: Promise<unknown[]>

  data: unknown[] = []

  override connectedCallback() {
    super.connectedCallback()
    // A label may upgrade after this element does, so read it again once the current task has drained.
    queueMicrotask(() => this.isConnected && this.syncLabelText())
    if (!this.defaultValueCaptured) {
      this.defaultValue = arrayPropertyConverter.fromAttribute(this.getAttribute('value') ?? '')
      this.defaultValueCaptured = true
    }
  }

  formResetCallback() {
    this.value = [...this.defaultValue]
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = arrayPropertyConverter.fromAttribute(state)
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

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
    if (this.readonly || this.effectiveDisabled) {
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
    let unupgraded = 0
    if (this.listItemSlot) {
      for (const slotItem of this.listItemSlot.assignedElements({ flatten: true })) {
        const listItem = slotItem instanceof ListItem ? slotItem : (slotItem.firstChild as ListItem)
        if (listItem instanceof ListItem) {
          if (this.value.includes(listItem.value)) displayText.push(listItem.displayText)
        } else if (slotItem.localName === 'c2-list-item' || slotItem.firstElementChild?.localName === 'c2-list-item') {
          // The tag is there but the class is not: a `c2-list-item` server-rendered without a client directive,
          // or one whose module was never imported. Reading it gives nothing, and the trigger renders empty —
          // which looks like a styling problem rather than the hydration one it is.
          unupgraded += 1
        }
      }
    }
    if (unupgraded > 0 && !warnedUnupgraded) {
      warnedUnupgraded = true
      console.warn(
        `<c2-select> has ${unupgraded} c2-list-item child(ren) that have not been upgraded, so it cannot read a label off them and its trigger will render empty. ` +
          `Import '@c2n/list-item' on the client, and make sure the options reach the DOM as plain tags rather than as server-rendered, never-hydrated elements.`,
      )
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

    // A form control is expected to fire `input`/`change` when its value changes, and every framework's two-way
    // binding is written against those names rather than a component-specific one. Firing them alongside
    // `selection-change` is what makes `v-model` and a `ControlValueAccessor` work with no adapter.
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
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
    if (_changedProperties.has('ariaLabelledByAttr')) this.syncLabelText()
    if (_changedProperties.has('open') || _changedProperties.has('readonly') || _changedProperties.has('disabled')) {
      this.toggle(this.open)
    }
    if (_changedProperties.has('value')) {
      this.updateDisplayText()
    }
    this.syncFormState()
  }

  private syncFormState() {
    if (this.multiple && this.name) {
      const formData = new FormData()
      for (const value of this.value) formData.append(this.name, value)
      this.internals.setFormValue(formData, this.value.join(';'))
    } else {
      this.internals.setFormValue(this.selectedValue || null, this.value.join(';'))
    }
    const missing = this.required && this.value.length === 0
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? 'Please select an option.' : '')
    this.internals.setValidity(flags, message, this.button)
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  protected override async getUpdateComplete(): Promise<boolean> {
    const complete = (await super.getUpdateComplete()) as boolean
    await this.childItemsUpdated
    return complete
  }

  private handleSlotChange() {
    this.updateDisplayText()
  }

  /**
   * The accessible name for the trigger.
   *
   * The focusable control is a `<button>` inside the shadow root, and neither of the two ways an author
   * names this element reaches it on its own: `aria-labelledby` on the host points at an id in the light DOM,
   * which ARIA cannot resolve across the shadow boundary, and a wrapping `<label>` names the host rather than
   * the button. So the label's *text* is copied onto the button instead.
   */
  private get triggerLabel(): string {
    return this.ariaLabel || this.labelText
  }

  /** Reads the text of whatever labels the host: `aria-labelledby` first, then any associated `<label>`. */
  private syncLabelText(): void {
    const root = this.getRootNode() as Document | ShadowRoot
    const ids = (this.ariaLabelledByAttr ?? '').split(/\s+/).filter(Boolean)
    const fromIds = ids.map((id) => root.getElementById?.(id)?.textContent?.trim()).filter(Boolean)
    const text =
      fromIds.length > 0
        ? fromIds.join(' ')
        : [...this.internals.labels]
            .map((label) => label.textContent?.trim())
            .filter(Boolean)
            .join(' ')
    this.labelText = text ?? ''
  }

  override render() {
    return html`<div class="c2-select">
      <button
        type="button"
        aria-label=${this.triggerLabel || nothing}
        aria-haspopup="listbox"
        aria-expanded=${this.open ? 'true' : 'false'}
        id="button"
        popovertarget=${this.readonly || this.effectiveDisabled ? nothing : 'menu-overlay'}
        class="button"
        @blur=${this.onButtonBlur}
        @focus=${this.onButtonFocus}
        ?disabled=${this.effectiveDisabled}
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
