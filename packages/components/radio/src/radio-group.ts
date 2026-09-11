import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { provide } from '@lit/context'
import { radioGroupContext, type RadioGroupContext } from './radio-context'
// Registers `c2-radio` so consumers of the group alone get the option element too (same pattern as tabs → tab).
import { Radio } from './radio'
import styles from './radio-group.scss?inline'

const RADIO_TAG = 'c2-radio'

export type RadioGroupOrientation = 'vertical' | 'horizontal'

/**
 * Groups `c2-radio` options into one control: a single `value`, one `name` for every option, group-level `disabled`,
 * and keyboard behaviour that matches native radios across the shadow boundary (Arrow keys move and select, only the
 * selected option is a tab stop). Radios may sit anywhere inside the group, wrapped in other elements. The `label`
 * and `description` slots name the group for assistive technology (`role="radiogroup"`).
 *
 * @tag c2-radio-group
 *
 * @slot - The `c2-radio` options, optionally inside wrapper elements.
 * @slot label - Group heading, announced as the group's name.
 * @slot description - Supporting text under the heading.
 *
 * @event {CustomEvent<{ value: string }>} change - Fired after the user selects another option. `detail.value` is the new `value`. Not fired for programmatic changes.
 *
 * @cssproperty {pixel} [--c2-radio-group--gap=8px] - Space between options.
 * @cssproperty {align-items} [--c2-radio-group--align-items=flex-start] - `stretch` makes card-style options fill the width.
 * @cssproperty {pixel} [--c2-radio-group__header--gap=2px] - Space between the label and the description.
 * @cssproperty {pixel} [--c2-radio-group__header--margin-bottom=8px] - Space between the header and the options.
 * @cssproperty {color} [--c2-radio-group__label--color=#18181b]
 * @cssproperty {font-size} [--c2-radio-group__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-radio-group__label--font-weight=500]
 * @cssproperty {color} [--c2-radio-group__description--color=#71717a]
 * @cssproperty {font-size} [--c2-radio-group__description--font-size=12px]
 * @cssproperty {opacity} [--c2-radio-group__header__disabled--opacity=0.38]
 * @slotcomponent c2-radio
 */
@customElement('c2-radio-group')
export class RadioGroup extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `value` of the checked option; empty when none is checked. Setting it checks the matching option. */
  @property({ reflect: true }) value = ''

  /** Form field name applied to every option. */
  @property() name = ''

  /** Disables every option. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Lays the options out in a row instead of a column. */
  @property({ reflect: true }) orientation: RadioGroupOrientation = 'vertical'

  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  @state() private hasLabel = false
  @state() private hasDescription = false

  @provide({ context: radioGroupContext })
  protected context: RadioGroupContext = this.createContext()

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('change', this.handleRadioChange)
      this.addEventListener('keydown', this.handleKeydown)
    }
  }

  /** The `c2-radio` elements of this group (nested groups keep their own), in DOM order. */
  get radios(): Radio[] {
    return [...this.querySelectorAll<Radio>(RADIO_TAG)].filter((radio) => radio.closest('c2-radio-group') === this)
  }

  private createContext(): RadioGroupContext {
    return { name: this.name, disabled: this.disabled, checkedChanged: (radio) => this.handleCheckedChanged(radio) }
  }

  /** `slotchange` does not fire for server-rendered slots, so read them once after the first render. */
  override firstUpdated() {
    for (const slot of this.renderRoot.querySelectorAll('slot')) this.updateSlot(slot)
  }

  override willUpdate(changed: PropertyValues<this>) {
    // Context consumers only re-render when the provided value is a new object.
    if (changed.has('name') || changed.has('disabled')) this.context = this.createContext()
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('value') || changed.has('disabled')) this.syncRadios()
  }

  private handleSlotChange(event: Event) {
    this.updateSlot(event.target as HTMLSlotElement)
  }

  private updateSlot(slot: HTMLSlotElement) {
    if (slot.name === 'label' || slot.name === 'description') {
      const filled = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
      if (slot.name === 'label') this.hasLabel = filled
      else this.hasDescription = filled
    } else {
      this.adoptRadios()
    }
  }

  /** Options may upgrade after the group; wait for them, then adopt a pre-checked option as the group value. */
  private async adoptRadios() {
    await customElements.whenDefined(RADIO_TAG)
    const radios = this.radios
    await Promise.all(radios.map((radio) => radio.updateComplete))
    if (!this.value) {
      const checked = radios.find((radio) => radio.checked)
      if (checked) this.value = checked.value
    }
    this.syncRadios()
  }

  /** Called through the context when an option's `checked` changed (user or code). */
  private handleCheckedChanged(radio: Radio) {
    if (radio.checked) {
      if (this.value !== radio.value) this.value = radio.value
      else this.syncRadios()
    } else if (this.value === radio.value && !this.radios.some((other) => other.checked)) {
      this.value = ''
    }
  }

  /** Mirrors `value` onto the options and keeps exactly one of them in the tab order. */
  private syncRadios() {
    const radios = this.radios
    if (radios.length === 0) return
    const checked = this.value ? radios.find((radio) => radio.value === this.value) : undefined
    const focusable = checked && !checked.disabled ? checked : radios.find((radio) => !radio.disabled)
    for (const radio of radios) {
      radio.checked = radio === checked
      radio.tabbable = radio === focusable
    }
  }

  private select(radio: Radio) {
    if (this.value === radio.value) return
    this.value = radio.value
    this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value }, bubbles: true, composed: true }))
  }

  private handleRadioChange = (event: Event) => {
    const radio = event.target
    if (radio === this || !(radio instanceof Radio) || radio.closest('c2-radio-group') !== this) return
    // The group speaks for its options: swallow the option's event and emit one `change` with the group value.
    event.stopImmediatePropagation()
    this.select(radio)
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (this.disabled) return
    const radios = this.radios.filter((radio) => !radio.disabled)
    const current = radios.indexOf(event.target as Radio)
    if (current === -1) return

    const rtl = getComputedStyle(this).direction === 'rtl'
    let next: number
    switch (event.key) {
      case 'ArrowDown':
        next = current + 1
        break
      case 'ArrowUp':
        next = current - 1
        break
      case 'ArrowRight':
        next = rtl ? current - 1 : current + 1
        break
      case 'ArrowLeft':
        next = rtl ? current + 1 : current - 1
        break
      default:
        return
    }
    event.preventDefault()
    const radio = radios[(next + radios.length) % radios.length]
    radio.focus()
    this.select(radio)
  }

  override render() {
    return html`
      <div
        class="c2-radio-group"
        role="radiogroup"
        aria-label=${ifDefined(this.ariaLabel)}
        aria-labelledby=${this.hasLabel ? 'label' : nothing}
        aria-describedby=${this.hasDescription ? 'description' : nothing}
        aria-disabled=${this.disabled ? 'true' : nothing}
        aria-orientation=${this.orientation}
      >
        <div class="c2-radio-group-header" ?hidden=${!this.hasLabel && !this.hasDescription}>
          <div id="label" class="c2-radio-group-label" ?hidden=${!this.hasLabel}><slot name="label" @slotchange=${this.handleSlotChange}></slot></div>
          <div id="description" class="c2-radio-group-description" ?hidden=${!this.hasDescription}>
            <slot name="description" @slotchange=${this.handleSlotChange}></slot>
          </div>
        </div>
        <div class="c2-radio-group-items"><slot @slotchange=${this.handleSlotChange}></slot></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-radio-group': RadioGroup
  }
}
