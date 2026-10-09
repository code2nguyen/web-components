import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { ifDefined } from 'lit/directives/if-defined.js'
// Registers `c2-checkbox` so consumers of the group alone get the option element too (same pattern as radio-group).
import { Checkbox } from './checkbox'
import styles from './checkbox-group.scss?inline'

const CHECKBOX_TAG = 'c2-checkbox'
const GROUP_TAG = 'c2-checkbox-group'

export type CheckboxGroupOrientation = 'vertical' | 'horizontal'

/** Events fired by {@link CheckboxGroup}, keyed for `addEventListener`. */
export interface CheckboxGroupEventMap {
  input: Event
  change: CustomEvent<{ value: string[] }>
}

export interface CheckboxGroup {
  addEventListener: TypedAddEventListener<CheckboxGroup, CheckboxGroupEventMap>
  removeEventListener: TypedRemoveEventListener<CheckboxGroup, CheckboxGroupEventMap>
}

/**
 * Groups `c2-checkbox` options into one form control with one value array — the multi-select counterpart of
 * `c2-radio-group`. The group owns the `name` (every checked option is submitted under it), group-level `disabled`
 * and a `required` rule meaning "at least one". Options may sit anywhere inside the group, wrapped in other elements,
 * and each stays its own tab stop, as native checkboxes are. The `label` and `description` slots name the group for
 * assistive technology (`role="group"`).
 *
 * @tag c2-checkbox-group
 *
 * @slot - The `c2-checkbox` options, optionally inside wrapper elements. Give each a `value` and label text.
 * @slot label - Group heading, announced as the group's name.
 * @slot description - Supporting text under the heading.
 *
 * @event {Event} input - Fired when the user toggles an option, before `change`. Read the group's `value`.
 * @event {CustomEvent<{ value: string[] }>} change - Fired after the user toggles an option. `detail.value` is the new `value`. Not fired for programmatic changes.
 *
 * @cssproperty {pixel} [--c2-checkbox-group--gap=8px] - Space between options.
 * @cssproperty {align-items} [--c2-checkbox-group--align-items=flex-start] - `stretch` makes card-style options fill the width.
 * @cssproperty {pixel} [--c2-checkbox-group__header--gap=2px] - Space between the label and the description.
 * @cssproperty {pixel} [--c2-checkbox-group__header--margin-bottom=8px] - Space between the header and the options.
 * @cssproperty {color} [--c2-checkbox-group__label--color=#18181b]
 * @cssproperty {font-size} [--c2-checkbox-group__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-checkbox-group__label--font-weight=500]
 * @cssproperty {color} [--c2-checkbox-group__description--color=#71717a]
 * @cssproperty {font-size} [--c2-checkbox-group__description--font-size=12px]
 * @cssproperty {opacity} [--c2-checkbox-group__header__disabled--opacity=0.38]
 * @slotcomponent c2-checkbox
 */
@customElement(GROUP_TAG)
export class CheckboxGroup extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  @state() private disabledByForm = false
  private defaultValue: string[] | undefined
  /** Until the options have been read once, syncing would uncheck the pre-checked ones before they are adopted. */
  private adopted = false

  /**
   * `value` of every checked option, in document order. Setting it checks exactly the matching options. As an
   * attribute, the values are separated by `;` (`value="email;sms"`).
   */
  @property({ converter: arrayPropertyConverter }) value: string[] = []

  /** Form field name. Every checked option is submitted under it; leave the options themselves unnamed. */
  @property() name = ''

  /** Disables every option. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Requires at least one option to be checked for the form to be valid. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Lays the options out in a row instead of a column. */
  @property({ reflect: true }) orientation: CheckboxGroupOrientation = 'vertical'

  /** Accessible name of the group when its heading does not label it. */
  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  private readonly slotPresence = new SlotPresenceController(this, ['label', 'description'])

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('input', this.handleOptionInput)
      this.addEventListener('change', this.handleOptionChange)
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.hasAttribute('value')) this.defaultValue ??= [...this.value]
    void this.updateComplete.then(() => this.adoptCheckboxes())
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

  formResetCallback() {
    this.value = [...(this.defaultValue ?? [])]
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state !== 'string') return
    try {
      const restored: unknown = JSON.parse(state)
      if (Array.isArray(restored)) this.value = restored.map(String)
    } catch {
      // Not a state this element wrote; keep the current value.
    }
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

  /** The `c2-checkbox` elements of this group (nested groups keep their own), in DOM order. */
  get checkboxes(): Checkbox[] {
    return [...this.querySelectorAll<Checkbox>(CHECKBOX_TAG)].filter((checkbox) => checkbox.closest(GROUP_TAG) === this)
  }

  override willUpdate(changed: PropertyValues) {
    // `null` or a non-array from script would break every read below; treat it as "nothing checked".
    if (changed.has('value') && !Array.isArray(this.value)) this.value = []
  }

  override updated(changed: PropertyValues) {
    if (changed.has('value') || changed.has('disabled') || changed.has('disabledByForm')) this.syncCheckboxes()
    this.syncFormState()
  }

  private handleSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    if (slot.name === 'label' || slot.name === 'description') {
      this.slotPresence.handleSlotChange(event)
    } else {
      void this.adoptCheckboxes()
    }
  }

  /** Options may upgrade after the group; wait for them, then adopt pre-checked options when no value was given. */
  private async adoptCheckboxes() {
    await customElements.whenDefined(CHECKBOX_TAG)
    const checkboxes = this.checkboxes
    await Promise.all(checkboxes.map((checkbox) => checkbox.updateComplete))
    if (this.value.length === 0 && !this.hasAttribute('value')) {
      const checked = checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value)
      if (checked.length > 0) this.value = checked
    }
    this.defaultValue ??= [...this.value]
    this.adopted = true
    this.syncCheckboxes()
  }

  /** Mirrors `value` and the group's disabled state onto the options. */
  private syncCheckboxes() {
    if (!this.adopted) return
    const disabled = this.effectiveDisabled
    for (const checkbox of this.checkboxes) {
      checkbox.checked = this.value.includes(checkbox.value)
      checkbox.groupDisabled = disabled
    }
  }

  private syncFormState() {
    const entries = this.name && this.value.length > 0 ? new FormData() : null
    for (const value of entries ? this.value : []) entries?.append(this.name, value)
    this.internals.setFormValue(entries, JSON.stringify(this.value))
    const missing = this.required && this.value.length === 0
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? 'Please select at least one option.' : '')
    this.internals.setValidity(flags, message)
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private isOwnOption(target: EventTarget | null): target is Checkbox {
    return target !== this && target instanceof Checkbox && target.closest(GROUP_TAG) === this
  }

  // The group speaks for its options: their own `input` and `change` stop here and the group emits one of each,
  // carrying the group value, so a listener (or a framework's two-way binding) above it reads the array.
  private handleOptionInput = (event: Event) => {
    if (this.isOwnOption(event.target)) event.stopImmediatePropagation()
  }

  private handleOptionChange = (event: Event) => {
    if (!this.isOwnOption(event.target)) return
    event.stopImmediatePropagation()
    this.value = this.checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value)
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent('change', { detail: { value: [...this.value] }, bubbles: true, composed: true }))
  }

  override render() {
    const hasLabel = this.slotPresence.has('label')
    const hasDescription = this.slotPresence.has('description')
    return html`
      <div
        class="c2-checkbox-group"
        role="group"
        aria-label=${ifDefined(this.ariaLabel)}
        aria-labelledby=${hasLabel ? 'label' : nothing}
        aria-describedby=${hasDescription ? 'description' : nothing}
        aria-disabled=${this.effectiveDisabled ? 'true' : nothing}
      >
        <div class="c2-checkbox-group-header" ?hidden=${!hasLabel && !hasDescription}>
          <div id="label" class="c2-checkbox-group-label" ?hidden=${!hasLabel}><slot name="label" @slotchange=${this.handleSlotChange}></slot></div>
          <div id="description" class="c2-checkbox-group-description" ?hidden=${!hasDescription}>
            <slot name="description" @slotchange=${this.handleSlotChange}></slot>
          </div>
        </div>
        <div class="c2-checkbox-group-items"><slot @slotchange=${this.handleSlotChange}></slot></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-checkbox-group': CheckboxGroup
  }
}
