import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValueMap } from 'lit'
import { query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { selectMessages } from './messages'
import styles from './select.scss?inline'
import { classMap } from 'lit/directives/class-map.js'
import type { SelectionChangeEventDetail } from '@c2n/list'
import { ListItem } from '@c2n/list-item'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { SlotPresenceController, disabledByAncestor, isComposingKey, redispatchEvent } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'

import '@c2n/overlay'
import '@c2n/list'

/** Detail of the select's `search-change` event. */
export interface SelectSearchChangeEventDetail {
  /** The text in the search field. */
  query: string
}

/** Detail of the select's `create-option` event. */
export interface SelectCreateOptionEventDetail {
  /** The search text, trimmed: the label of the option to create. */
  label: string
}

/** Events fired by {@link Select}, keyed for `addEventListener`. */
export interface SelectEventMap {
  'selection-change': CustomEvent<SelectionChangeEventDetail>
  'search-change': CustomEvent<SelectSearchChangeEventDetail>
  'create-option': CustomEvent<SelectCreateOptionEventDetail>
  input: Event
  change: Event
}

export interface Select {
  addEventListener: TypedAddEventListener<Select, SelectEventMap>
  removeEventListener: TypedRemoveEventListener<Select, SelectEventMap>
}

/** Once per page: the cause is always the same, and one select with the problem usually means all of them. */
let warnedUnupgraded = false

/** Lower case without accents, so `cafe` finds `Café`. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim()

/** The `c2-list-item` a slotted element stands for: itself, or the row a framework island wraps. */
const rowOf = (element: Element): ListItem | undefined =>
  element instanceof ListItem ? element : element.firstElementChild instanceof ListItem ? element.firstElementChild : undefined

/**
 * A dropdown built from a trigger button and a `c2-list` of `c2-list-item` rows inside a `c2-overlay` popover. The
 * rows are the light-DOM children of the select, so they are themed with the `--c2-list-item--*` variables directly on
 * the select (or on a wrapper); the dropdown container is themed through the `--c2-select__list--*` variables and the
 * trigger through `--c2-select__button--*`. The select has no intrinsic width: give the host a `width` (or place it in
 * a grid/flex cell) and the trigger fills it.
 *
 * Keyboard: Enter, Space, ArrowDown or ArrowUp on the trigger opens the dropdown and moves focus to the selected
 * option (else the first). The list then takes arrows, Home/End and typeahead; Enter or Space picks. Picking (single
 * select) or Escape closes it and returns focus to the trigger; Tab leaves the select and closes the dropdown.
 *
 * Groups: `<h3>` (any heading level) and `<hr>` among the options are group headings and dividers; the list skips
 * them for selection and keyboard. They are styled by the `--c2-list__heading--*` and `--c2-list__divider--*`
 * variables, set on the select.
 *
 * Search: `searchable` puts a search field above the options. It takes focus when the dropdown opens and hides every
 * option whose text does not contain what was typed (case and accents ignored), and a group heading with nothing left
 * under it. ArrowDown moves to the first match, Enter picks it, ArrowUp from the first match returns to the field and
 * typing on an option goes on in the field. Hidden options are hidden by a style rule in the select's own shadow
 * root: nothing is written on them. The search runs only while the dropdown is open; closing it clears the text. Each
 * keystroke fires `search-change`: cancel it to filter yourself (replace the options with a server's answer, setting
 * `loading` meanwhile). `creatable` adds a "Create" row while no option's text equals the search; it fires
 * `create-option`, and the app adds the option and selects it. The `footer` slot below the options is the place for
 * the panel's actions (Clear, Apply), the app's own buttons.
 *
 * @tag c2-select
 *
 * @slot default - The options: `c2-list-item` elements, each with a `value`.
 * @slot button-prefix-icon - Icon shown at the start of the trigger: an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon`.
 * @slot button-suffix-icon - Icon shown at the end of the trigger. Defaults to a chevron that flips while open.
 * @slot button-content - Replaces the trigger text entirely (selected labels or placeholder) with custom markup.
 * @slot footer - Below the options, inside the dropdown: the panel's actions (a Clear and an Apply `c2-button`, a "Manage" link). Hidden when empty.
 * @slot empty - Replaces the "No matching options" message shown, with `searchable`, while no option matches.
 * @slot loading - Replaces the "Loading…" message shown while `loading` is set.
 *
 * @csspart panel - The dropdown's box around the search field, the options, the messages and the footer.
 * @csspart search - The search field shown with `searchable`.
 * @csspart footer - The wrapper of the `footer` slot.
 * @csspart empty - The wrapper of the `empty` slot.
 * @csspart loading - The wrapper of the `loading` slot.
 * @csspart create - The "Create" row shown with `creatable`.
 *
 * @event {CustomEvent<SelectionChangeEventDetail>} selection-change - Fired after the user picks an option. `detail.value` is the array of selected values (one entry unless `multiple`), `detail.data` the `data` of each selected row. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself rather than on an ancestor.
 * @event {Event} input - Fired with `selection-change`, after `value` is updated. Carries no detail: it exists so the select behaves like the other form controls, which is what `v-model`, `ngModel` and any generic form binding listen for.
 * @event {Event} change - Fired with `input`. A select commits on every pick, so the two always fire together.
 * @event {CustomEvent<SelectSearchChangeEventDetail>} search-change - Fired, with `searchable`, when the search text changes (and with an empty `detail.query` when closing clears it). Cancel it to filter the options yourself: the select then shows every option it holds. Does not bubble.
 * @event {CustomEvent<SelectCreateOptionEventDetail>} create-option - Fired when the "Create" row of a `creatable` select is chosen. `detail.label` is the trimmed search text; add the option and set `value`. Does not bubble.
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
 * @cssproperty {border} [--c2-select__button__error--border-top=1px solid #dc2626] - Shown while an enclosing `c2-form-field` shows an error.
 * @cssproperty {border} [--c2-select__button__error--border-right=1px solid #dc2626]
 * @cssproperty {border} [--c2-select__button__error--border-bottom=1px solid #dc2626]
 * @cssproperty {border} [--c2-select__button__error--border-left=1px solid #dc2626]
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
 * @cssproperty {padding} [--c2-select__search--padding=10px 12px]
 * @cssproperty {font-size} [--c2-select__search--font-size=14px]
 * @cssproperty {color} [--c2-select__search--color=#18181b]
 * @cssproperty {color} [--c2-select__search--background=transparent]
 * @cssproperty {border} [--c2-select__search--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-select__search__placeholder--color=#71717a]
 *
 * @cssproperty {padding} [--c2-select__status--padding=10px 12px] - Padding of the empty and loading messages.
 * @cssproperty {font-size} [--c2-select__status--font-size=14px]
 * @cssproperty {color} [--c2-select__status--color=#71717a]
 *
 * @cssproperty {padding} [--c2-select__create--padding=8px 10px]
 * @cssproperty {font-size} [--c2-select__create--font-size=14px]
 * @cssproperty {color} [--c2-select__create--color=#18181b]
 * @cssproperty {border-radius} [--c2-select__create--border-radius=6px]
 * @cssproperty {color} [--c2-select__create__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-select__create__focus--outline=2px solid rgba(71, 110, 249, 0.4)]
 *
 * @cssproperty {padding} [--c2-select__footer--padding=8px]
 * @cssproperty {pixel} [--c2-select__footer--gap=8px]
 * @cssproperty {justify-content} [--c2-select__footer--justify-content=flex-end]
 * @cssproperty {border} [--c2-select__footer--border-top=1px solid #e4e4e7]
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
  /** The built-in validation message in the nearest `lang` (English, or a language the app adds). */
  private readonly msg = new LocalizeController(this, selectMessages)
  private customValidityMessage = ''
  /** Label and description handed down by an enclosing `c2-form-field`. */
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
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

  /** Show a search field above the options that hides the options not matching it. See the class description. */
  @property({ type: Boolean }) searchable = false

  /** Placeholder of the search field. Empty: the translated "Search…". */
  @property({ attribute: 'search-placeholder' }) searchPlaceholder = ''

  /** With `searchable`, offer a "Create" row for search text no option equals; choosing it fires `create-option`. */
  @property({ type: Boolean }) creatable = false

  /** Show the loading message (the `loading` slot) above the options, while the app fetches them. */
  @property({ type: Boolean }) loading = false

  /** The search text, while the dropdown is open. */
  @state() private query = ''

  /** False while the app filters (it cancelled `search-change`): every option is then shown. */
  private localFilter = true

  /** Bumped when the options change, so the search runs again over the new ones. */
  @state() private rowsVersion = 0

  /** Options and headings the search hides; the visible count and whether one equals the search. */
  private hiddenRows = new Set<Element>()
  private matchCount = 0
  private exactMatch = false
  private filterSheet?: CSSStyleSheet
  private childObserver?: MutationObserver
  /** Each option's text folded for the search, kept until the text changes. */
  private folded = new WeakMap<ListItem, [string, string]>()

  private foldedText(row: ListItem): string {
    const text = row.displayText
    const cached = this.folded.get(row)
    if (cached?.[0] === text) return cached[1]
    const folded = fold(text)
    this.folded.set(row, [text, folded])
    return folded
  }

  private readonly slotPresence = new SlotPresenceController(this, ['footer'])

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
  @property({ type: String, reflect: true }) name = ''

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

  /** @internal */
  @query('#button', true) public button!: HTMLButtonElement
  /** @internal */
  @query('#menu-overlay', true) public menu!: HTMLElement
  /** @internal */
  @query('slot:not([name])', true) public listItemSlot?: HTMLSlotElement
  @query('#search') private searchInput?: HTMLInputElement
  @query('#create') private createButton?: HTMLButtonElement
  @query('#list') private list?: LitElement

  @state() private displayText = ''

  protected childItemsUpdated!: Promise<unknown[]>
  /** Times the display text was looked up again because a selected item had no label yet. */
  private displayRetries = 0

  /** The `data` of each selected row, in the order of `value`, as the last `selection-change` reported it. */
  data: unknown[] = []

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener('click', this.handleHostActivation)
    // A label may upgrade after this element does, so read it again once the current task has drained.
    queueMicrotask(() => this.isConnected && this.syncLabelText())
    if (!this.defaultValueCaptured) {
      this.defaultValue = arrayPropertyConverter.fromAttribute(this.getAttribute('value') ?? '')
      this.defaultValueCaptured = true
    }
  }

  override disconnectedCallback() {
    this.childObserver?.disconnect()
    this.removeEventListener('click', this.handleHostActivation)
    super.disconnectedCallback()
  }

  /** WebKit associates form labels but does not focus a form-associated custom element when its label activates it. */
  private handleHostActivation = (event: MouseEvent): void => {
    if (event.composedPath()[0] === this && !this.effectiveDisabled) this.button?.focus()
  }

  formResetCallback() {
    this.value = [...this.defaultValue]
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
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
        const listItem = rowOf(slotItem)
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
        const listItem = rowOf(slotItem)
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
    // Hydrated from server-rendered markup, the items may not have upgraded or rendered yet when this first runs,
    // and nothing else would call it again (hydration fires no slotchange): look again once they have.
    const missing = unupgraded > 0 || displayText.length < this.value.length
    if (missing && this.displayRetries < 3) {
      this.displayRetries += 1
      await customElements.whenDefined('c2-list-item')
      requestAnimationFrame(() => this.updateDisplayText())
    } else if (!missing) this.displayRetries = 0
  }

  private renderButtonContent() {
    const buttonContentClasses = {
      placeholder: !this.displayText,
    }
    // `nothing`, never '': a server render of an empty string leaves no text node between the part's markers, and the
    // hydrated part then writes the label into the closing marker comment, so the trigger stays empty.
    return html`<div class="button-content ${classMap(buttonContentClasses)}">${this.displayText || this.placeholder || nothing}</div>`
  }

  private renderButtonSuffixIcon() {
    return svg`<svg class="default-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>`
  }

  private handleSelectionChange(event: CustomEvent<SelectionChangeEventDetail>) {
    this.value = event.detail.value
    this.data = event.detail.data
    // The list puts its roving tabindex back on the option it last knew, which the search may hide, once it has
    // drawn the new value: follow the focused option again after that.
    const active = this.activeInTree
    if (this.hiddenRows.size && active instanceof ListItem) {
      this.updateComplete.then(() => this.list?.updateComplete).then(() => this.hiddenRows.size && this.rove(active))
    }
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
    // However it opened (a click, Enter, an arrow key, `open`), the list takes focus so its own keyboard handling —
    // arrows, Home/End, typeahead, Enter — picks an option. Only while the trigger still holds focus: an app that
    // opened the select from elsewhere keeps its focus.
    if (this.open && this.focusIsOnTrigger()) (this.searchable ? this.searchInput : this.focusedOption())?.focus()
    if (!this.open) this.setQuery('')
  }

  /** Stores the search text and asks the app, through `search-change`, whether the select filters it. */
  private setQuery(query: string) {
    if (this.searchInput) this.searchInput.value = query
    if (query === this.query) return
    this.query = query
    const event = new CustomEvent<SelectSearchChangeEventDetail>('search-change', { cancelable: true, detail: { query } })
    this.localFilter = this.dispatchEvent(event)
  }

  private handleSearchInput(event: Event) {
    // The field's own `input` would leave the shadow root as the select's: that event means "the value changed",
    // which is what `v-model` and a `ControlValueAccessor` listen for, and typing a search changes no value.
    event.stopPropagation()
    this.setQuery((event.target as HTMLInputElement).value)
  }

  /**
   * Moves focus to an option, and the list's roving tabindex with it: the list would otherwise keep it on an option
   * the search hid, which Shift+Tab from the footer could not reach.
   */
  private focusRow(next: HTMLElement) {
    if (next instanceof ListItem) this.rove(next)
    next.focus()
  }

  private rove(to: ListItem) {
    for (const row of this.visibleRows(true)) row.tabIndex = row === to ? 0 : -1
  }

  /** The options the search leaves visible and enabled, in order: where the keyboard may go. `all` keeps the hidden ones. */
  private visibleRows(all = false): ListItem[] {
    return (this.listItemSlot?.assignedElements({ flatten: true }) ?? [])
      .filter((element) => all || !this.hiddenRows.has(element))
      .map(rowOf)
      .filter((row): row is ListItem => !!row && (all || !row.disabled))
  }

  private handleSearchKeydown(event: KeyboardEvent) {
    if (isComposingKey(event)) return
    const first = this.visibleRows()[0]
    if (event.key === 'ArrowDown') {
      if (first) this.focusRow(first)
      else this.createButton?.focus()
    } else if (event.key === 'Enter') (first ?? this.createButton)?.click()
    else return
    event.preventDefault()
  }

  /**
   * With `searchable`, the keyboard on an option moves among the visible ones only (the list itself would land on a
   * hidden one), leaves for the search field above the first and the Create row below the last, and sends typing to
   * the search field. Runs in the capture phase, before the list's own handling.
   */
  private handleListKeydown = {
    capture: true,
    handleEvent: (event: KeyboardEvent) => {
      if (!this.searchable) return
      const rows = this.visibleRows()
      const index = rows.indexOf(event.target as ListItem)
      if (index < 0) return
      const typing = !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'Backspace' || (event.key.length === 1 && event.key !== ' '))
      let next: HTMLElement | undefined
      // The arrows, Home and End are taken whatever the modifiers: the list would move onto a hidden option.
      if (event.key === 'ArrowDown') next = rows[index + 1] ?? this.createButton ?? rows[index]
      else if (event.key === 'ArrowUp') next = rows[index - 1] ?? this.searchInput
      else if (event.key === 'Home') next = rows[0]
      else if (event.key === 'End') next = rows[rows.length - 1]
      else if (typing) {
        next = this.searchInput
        this.setQuery(event.key === 'Backspace' ? this.query.slice(0, -1) : this.query + event.key)
      }
      if (!next) return
      event.preventDefault()
      event.stopPropagation()
      this.focusRow(next)
    },
  }

  private handleCreateKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowUp') return
    event.preventDefault()
    const last = this.visibleRows().pop()
    if (last) this.focusRow(last)
    else this.searchInput?.focus()
  }

  private handleCreate() {
    const label = this.query.trim()
    this.dispatchEvent(new CustomEvent<SelectCreateOptionEventDetail>('create-option', { detail: { label } }))
    if (this.multiple) {
      this.setQuery('')
      this.searchInput?.focus()
    } else this.toggle(false)
  }

  /**
   * Works out which options the search hides, and hides them with a rule in the select's own shadow root, by position:
   * the options are the author's light DOM, and nothing is written on them. While there is search text, a heading with
   * no visible option left in its group hides, and so does every divider.
   */
  private filterRows() {
    // Only while open: closed, nothing is hidden and nothing needs counting. Opening runs it again.
    const elements = this.open ? (this.listItemSlot?.assignedElements({ flatten: true }) ?? []) : []
    const typed = fold(this.query)
    const query = this.searchable && this.localFilter ? typed : ''
    const hidden = new Set<Element>()
    let heading: Element | undefined
    let headingShown = false
    const closeGroup = () => query && heading && !headingShown && hidden.add(heading)
    this.matchCount = 0
    this.exactMatch = false
    for (const element of elements) {
      if (/^h[1-6]$/.test(element.localName) || element.localName === 'hr') {
        closeGroup()
        heading = element.localName === 'hr' ? undefined : element
        headingShown = false
        if (query && !heading) hidden.add(element)
        continue
      }
      const row = rowOf(element)
      if (!row) continue
      const text = this.foldedText(row)
      if (typed && text === typed) this.exactMatch = true
      if (text.includes(query)) {
        this.matchCount += 1
        headingShown = true
      } else hidden.add(element)
    }
    closeGroup()
    this.hiddenRows = hidden
    const position = new Map([...this.children].map((child, index) => [child, index + 1]))
    const selectors = [...hidden].filter((element) => position.has(element)).map((element) => `::slotted(:nth-child(${position.get(element)}))`)
    // The rule hides by position, so a child added or removed anywhere (a footer button, a `button-content` badge)
    // must run it again; the default slot's own `slotchange` does not see the named slots.
    if (selectors.length) {
      this.childObserver ??= new MutationObserver(() => (this.rowsVersion += 1))
      this.childObserver.observe(this, { childList: true })
    } else this.childObserver?.disconnect()
    // Re-sort the list's roving tabindex if the search hid the option holding it.
    const tabbed = this.visibleRows(true).find((row) => row.tabIndex === 0)
    const first = this.visibleRows()[0]
    if (first && [...hidden].some((element) => rowOf(element) === tabbed)) this.rove(first)
    if (!selectors.length && !this.filterSheet) return
    if (!this.filterSheet) {
      this.filterSheet = new CSSStyleSheet()
      this.shadowRoot!.adoptedStyleSheets = [...this.shadowRoot!.adoptedStyleSheets, this.filterSheet]
    }
    this.filterSheet.replaceSync(selectors.length ? `${selectors.join(',')}{display:none!important}` : '')
  }

  /**
   * Runs before the dropdown hides, while its rows can still hold focus. A row is light DOM slotted into the popover,
   * so the browser does not count it as inside the popover and does not hand focus back to the trigger: hiding the
   * focused row would drop focus to the body. Focus moves back to the trigger here instead. Focus that already left
   * (Tab, a click elsewhere) is not taken back.
   */
  private handleOverlayBeforeToggle(event: Event) {
    if ((event as ToggleEvent).newState !== 'closed' || !this.focusIsOnOption()) return
    // The row's focusout sees the trigger as outside the list; it must not hide the dropdown a second time.
    this.restoringFocus = true
    this.button.focus({ preventScroll: true })
    this.restoringFocus = false
    // Space picks on keydown, then its keyup lands on the trigger, which Firefox reads as a click that reopens the
    // dropdown. Swallow that one keyup; a key pressed on the trigger itself clears the guard.
    if (this.spacePressedInList) {
      this.button.addEventListener('keyup', this.swallowSpaceKeyup)
      this.button.addEventListener('keydown', this.clearSpaceGuard)
    }
    this.spacePressedInList = false
  }

  /** Whether the last key pressed in the list was Space, which is what arms the keyup guard above. */
  private spacePressedInList = false

  private handleOverlayKeydown(event: KeyboardEvent) {
    // A space typed in the search field is text, not a pick.
    this.spacePressedInList = event.key === ' ' && event.target !== this.searchInput
  }

  /** Set while a pointer is down on the trigger: that click toggles the dropdown itself, so focusout must not. */
  private pointerOnTrigger = false

  private handleTriggerPointerDown() {
    this.pointerOnTrigger = true
    window.addEventListener('pointerup', () => (this.pointerOnTrigger = false), { once: true })
  }

  private restoringFocus = false

  private swallowSpaceKeyup = (event: KeyboardEvent): void => {
    if (event.key === ' ') event.preventDefault()
    this.clearSpaceGuard()
  }

  private clearSpaceGuard = (): void => {
    this.button.removeEventListener('keyup', this.swallowSpaceKeyup)
    this.button.removeEventListener('keydown', this.clearSpaceGuard)
  }

  /** Closes the dropdown when focus moves from a row to something outside it: Tab and Shift+Tab out of the list. */
  private handleOverlayFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (this.restoringFocus || !next || this.menu.contains(next) || (next !== this && this.contains(next))) return
    // A press on the trigger moves focus to it before its click closes the dropdown: closing here would let that
    // click open it again.
    if (next === this.button && this.pointerOnTrigger) return
    this.toggle(false)
  }

  /** The element with focus in this select's tree: a light-DOM row, or the host itself when focus is on the trigger. */
  private get activeInTree(): Element | null {
    return (this.getRootNode() as Document | ShadowRoot).activeElement
  }

  private focusIsOnTrigger(): boolean {
    return this.activeInTree === this && this.shadowRoot?.activeElement === this.button
  }

  /** Focus is on a row or a footer control (light DOM), or on the search field or Create row (the dropdown's shadow DOM). */
  private focusIsOnOption(): boolean {
    const active = this.activeInTree
    if (active === this) return this.menu.contains(this.shadowRoot!.activeElement)
    return !!active && this.contains(active)
  }

  /**
   * The row holding the list's roving tabindex: the selected one, else the first enabled one. Falls back to picking it
   * here when the list has not given any row the tabindex yet (rows replaced just before opening).
   */
  private focusedOption(): ListItem | undefined {
    const rows = (this.listItemSlot?.assignedElements({ flatten: true }) ?? [])
      .map((slotItem) => (slotItem instanceof ListItem ? slotItem : slotItem.firstElementChild))
      .filter((row): row is ListItem => row instanceof ListItem)
    const enabled = rows.filter((row) => !row.disabled)
    return rows.find((row) => row.tabIndex === 0) ?? enabled.find((row) => this.value.includes(row.value)) ?? enabled[0]
  }

  protected override willUpdate(changedProperties: PropertyValueMap<this>): void {
    // Frameworks (and Astro islands) may set `value` as a `;`-separated string property instead of an attribute.
    if (changedProperties.has('value') && typeof this.value === 'string') {
      this.value = arrayPropertyConverter.fromAttribute(this.value)
    }
    const changed = changedProperties as Map<PropertyKey, unknown>
    if (
      this.hasUpdated &&
      (changed.has('query') || changed.has('rowsVersion') || changed.has('searchable') || changed.has('open')) &&
      (this.searchable || this.filterSheet)
    ) {
      this.filterRows()
    }
  }

  protected override updated(_changedProperties: PropertyValueMap<this>): void {
    if (this.field.invalid && !this.effectiveDisabled) this.internals.states.add('error')
    else this.internals.states.delete('error')
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
    const message = this.customValidityMessage || (missing ? this.msg.t('valueMissing') : '')
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
    if (this.searchable) this.rowsVersion += 1
  }

  private renderPanelTop() {
    const search = html`<input
      id="search"
      part="search"
      class="search"
      type="text"
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="go"
      aria-label=${this.msg.t('searchLabel')}
      aria-controls="list"
      placeholder=${this.searchPlaceholder || this.msg.t('searchPlaceholder')}
      @input=${this.handleSearchInput}
      @keydown=${this.handleSearchKeydown}
    />`
    return html`${this.searchable ? search : nothing}${
      this.loading ? html`<div class="status" part="loading" role="status"><slot name="loading">${this.msg.t('loading')}</slot></div>` : nothing
    }`
  }

  private renderPanelBottom() {
    const label = this.query.trim()
    const empty = this.searchable && !this.loading && this.matchCount === 0
    const create = this.searchable && this.creatable && !this.loading && label && !this.exactMatch
    return html`${empty ? html`<div class="status" part="empty" role="status"><slot name="empty">${this.msg.t('empty')}</slot></div>` : nothing}${
      create
        ? html`<button id="create" class="create" part="create" type="button" @click=${this.handleCreate} @keydown=${this.handleCreateKeydown}>
            ${this.msg.t('create', label)}
          </button>`
        : nothing
    }`
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
    return this.ariaLabel || this.labelText || this.field.label
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
        aria-describedby=${this.field.describedBy()}
        aria-invalid=${this.field.invalid ? 'true' : nothing}
        aria-haspopup="listbox"
        aria-expanded=${this.open ? 'true' : 'false'}
        id="button"
        popovertarget=${this.readonly || this.effectiveDisabled ? nothing : 'menu-overlay'}
        class="button"
        @blur=${this.onButtonBlur}
        @focus=${this.onButtonFocus}
        @pointerdown=${this.handleTriggerPointerDown}
        ?disabled=${this.effectiveDisabled}
      >
        <slot name="button-prefix-icon"></slot>
        <slot name="button-content">${this.renderButtonContent()}</slot>
        <slot name="button-suffix-icon">${this.renderButtonSuffixIcon()}</slot>
      </button>
      <c2-overlay
        id="menu-overlay"
        popover
        @beforetoggle=${this.handleOverlayBeforeToggle}
        @toggle=${this.handleOverlayToggle}
        @focusout=${this.handleOverlayFocusOut}
        @keydown=${this.handleOverlayKeydown}
        ?fit-anchor=${this.fitSize}
      >
        <div class=${classMap({ panel: true, boxed: this.searchable || this.loading || this.slotPresence.has('footer') })} part="panel">
          ${this.renderPanelTop()}
          <c2-list
            id="list"
            aria-labelledby="button"
            .value=${this.value}
            class="list"
            ?multiple=${this.multiple}
            @selection-change=${this.handleSelectionChange}
            @keydown=${this.handleListKeydown}
            ?required=${this.required}
          >
            <slot @slotchange=${this.handleSlotChange}></slot>
          </c2-list>
          ${this.renderPanelBottom()}
          <div class="footer" part="footer" ?hidden=${!this.slotPresence.has('footer')}>
            <slot name="footer" @slotchange=${this.slotPresence.handleSlotChange}></slot>
          </div>
        </div>
      </c2-overlay>
      ${this.field.renderDescription()}
    </div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-select': Select
  }
}
