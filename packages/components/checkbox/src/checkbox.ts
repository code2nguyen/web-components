import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { classMap } from 'lit/directives/class-map.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { checkboxMessages } from './messages'
import styles from './checkbox.scss?inline'
import { disabledByAncestor, redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'

/** Events fired by {@link Checkbox}, keyed for `addEventListener`. */
export interface CheckboxEventMap {
  change: Event
}

export interface Checkbox {
  addEventListener: TypedAddEventListener<Checkbox, CheckboxEventMap>
  removeEventListener: TypedRemoveEventListener<Checkbox, CheckboxEventMap>
}

/** The default marks, drawn inside their slots when no mark of the author's is slotted. */
const CHECKMARK = html`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>`
const MIXEDMARK = html`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 13H5v-2h14v2z" /></svg>`

/**
 * A checkbox with native `<input type="checkbox">` behaviour. The visible box sits centred in a square touch target
 * (`state-layer--size`) that doubles as the hover layer; that layer is transparent unless a
 * `state-layer__hover__*--color` is set, so the default look is quiet. Text in the default slot becomes the
 * checkbox's label (clicking it toggles the box), with an optional `description` underneath; without either the
 * element is the bare box. Put several in a `c2-checkbox-group` for one value array.
 *
 * @tag c2-checkbox
 *
 * @slot - Label text beside the box. Clicking it toggles the checkbox, and it names the checkbox for assistive technology.
 * @slot description - Supporting text shown under the label.
 * @slot trailing - Content at the end of the row, such as an option's price (`+$1.50`) or a count. Part of the clickable label, so it is read with the checkbox's name. Give the checkbox the full width (`--c2-checkbox-group--align-items: stretch` in a group) to push it to the far edge.
 * @slot checkmark - Icon shown when checked: an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon`. Defaults to a check.
 * @slot mixedmark - Icon shown when indeterminate. Defaults to a dash.
 * @slot uncheckmark - Icon shown when unchecked. Empty by default.
 *
 * @event {Event} change - Re-dispatched from the inner input when the checked state changes.
 *
 * @csspart checkmark - Wrapper containing the `checkmark` slot or fallback mark while checked.
 * @csspart mixedmark - Wrapper containing the `mixedmark` slot or fallback mark while indeterminate.
 * @csspart uncheckmark - Wrapper containing the optional `uncheckmark` slot while unchecked.
 * @csspart field - The whole row (box, label, description, trailing): the clickable `<label>`, for a card-style option.
 * @csspart label - Region containing the default slot (the label text).
 * @csspart description - Region containing the `description` slot below the label.
 * @csspart trailing - Region at the end of the row containing the `trailing` slot, hidden while that slot is empty.
 *
 * @cssproperty {pixel} [--c2-checkbox__container--height=18px]
 * @cssproperty {pixel} [--c2-checkbox__container--width=18px]
 * @cssproperty {border-radius} [--c2-checkbox__container--border-top-left-radius=4px]
 * @cssproperty {border-radius} [--c2-checkbox__container--border-top-right-radius=4px]
 * @cssproperty {border-radius} [--c2-checkbox__container--border-bottom-left-radius=4px]
 * @cssproperty {border-radius} [--c2-checkbox__container--border-bottom-right-radius=4px]
 *
 * @cssproperty {border} [--c2-checkbox__container--border-top=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-checkbox__container--border-right=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-checkbox__container--border-bottom=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-checkbox__container--border-left=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-checkbox__container--background-color=transparent]
 *
 * @cssproperty {color} [--c2-checkbox__container__selected--background-color=#476ef9]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-top=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-right=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-bottom=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-left=0px solid transparent]
 *
 * @cssproperty {color} --c2-checkbox__container__selected__hover--background-color
 *
 * @cssproperty {outline} [--c2-checkbox__container__focus--outline=2px solid rgba(71, 110, 249, 0.4)]
 * @cssproperty {pixel} [--c2-checkbox__container__focus--outline-offset=2px]
 *
 * @cssproperty {opacity} [--c2-checkbox__container__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-checkbox__container__error--border-color=#dc2626] - Border of an unchecked box while an enclosing `c2-form-field` shows an error.
 *
 * @cssproperty {pixel} [--c2-checkbox__checkmark--size=12px]
 * @cssproperty {color} [--c2-checkbox__checkmark--color=#ffffff]
 *
 * @cssproperty {pixel} [--c2-checkbox__mixedmark--size=12px]
 * @cssproperty {color} [--c2-checkbox__mixedmark--color=#ffffff]
 *
 * @cssproperty {pixel} [--c2-checkbox__uncheckmark--size=12px]
 * @cssproperty {color} [--c2-checkbox__uncheckmark--color=#ffffff]
 *
 * @cssproperty {pixel} [--c2-checkbox__state-layer--size=32px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-bottom-right-radius=6px]
 * @cssproperty {color} --c2-checkbox__state-layer__hover__unselected--color
 * @cssproperty {color} --c2-checkbox__state-layer__hover__selected--color
 *
 * @cssproperty {pixel} [--c2-checkbox__field--gap=4px] - Space between the box's touch target and the label.
 * @cssproperty {padding} [--c2-checkbox__field--padding=0] - Padding of the whole row, for a card-style option.
 * @cssproperty {border} [--c2-checkbox__field--border=none] - Border around the whole row.
 * @cssproperty {border-radius} [--c2-checkbox__field--border-radius=0] - Corner radius of the whole row.
 * @cssproperty {color} [--c2-checkbox__field--background-color=transparent] - Background of the whole row.
 * @cssproperty {border} [--c2-checkbox__field__checked--border=none] - Border around the row while checked. Defaults to `--c2-checkbox__field--border`.
 * @cssproperty {color} [--c2-checkbox__field__checked--background-color=transparent] - Background of the row while checked. Defaults to `--c2-checkbox__field--background-color`.
 * @cssproperty {color} [--c2-checkbox__label--color=inherit]
 * @cssproperty {font-size} [--c2-checkbox__label--font-size=inherit]
 * @cssproperty {font-weight} [--c2-checkbox__label--font-weight=inherit]
 * @cssproperty {line-height} [--c2-checkbox__label--line-height=inherit]
 * @cssproperty {opacity} [--c2-checkbox__label__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-checkbox__description--color=#71717a]
 * @cssproperty {font-size} [--c2-checkbox__description--font-size=12px]
 * @cssproperty {line-height} [--c2-checkbox__description--line-height=1.4]
 * @cssproperty {color} [--c2-checkbox__trailing--color=#71717a] - Text colour of the `trailing` region (a price, a count).
 * @cssproperty {font-size} [--c2-checkbox__trailing--font-size=inherit]
 * @cssproperty {font-weight} [--c2-checkbox__trailing--font-weight=inherit]
 * @cssproperty {pixel} [--c2-checkbox__trailing--padding-inline-start=12px] - Space inside the `trailing` region before its content, added to `field--gap`.
 */
@customElement('c2-checkbox')
export class Checkbox extends LitElement {
  static formAssociated = true

  private readonly internals = this.attachInternals()
  /** The built-in validation message in the nearest `lang` (English, or a language the app adds). */
  private readonly msg = new LocalizeController(this, checkboxMessages)
  private customValidityMessage = ''
  @state() private disabledByForm = false

  @query('input') protected formElement!: HTMLInputElement

  /** Whether the checkbox is checked. */
  @property({ type: Boolean }) checked = false

  /** Shows the mixed state (neither checked nor unchecked), e.g. for a parent of a partially selected group. */
  @property({ type: Boolean, reflect: true }) indeterminate = false

  /** Disables the control: it no longer toggles and is rendered dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Form field name forwarded to the inner input. */
  @property({ type: String, reflect: true }) name = ''

  /** Value submitted while checked. */
  @property({ type: String }) value = 'on'

  /** Requires the checkbox to be checked for the form to be valid. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Accessible name used when no visible label names the checkbox. */
  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  /** Id of the element that labels the checkbox. */
  @property({ type: String, attribute: 'aria-labelledby' })
  ariaLabelledBy!: undefined | string

  /** Id of the element that describes the checkbox. */
  @property({ type: String, attribute: 'aria-describedby' })
  ariaDescribedBy!: undefined | string

  /**
   * Set by a containing `c2-checkbox-group` while it disables this option: the whole group is disabled, or its `max` is
   * reached and this option is unchecked. The checkbox's own `disabled` is kept.
   */
  @property({ type: Boolean, attribute: false }) groupDisabled = false

  private readonly slotPresence = new SlotPresenceController(this, ['', 'description', 'trailing'])
  /**
   * Which default marks have been needed yet. Each is drawn the first time its state is reached and kept after, so a
   * box that was never checked carries no SVG (most boxes on a page), while unchecking still fades the mark out.
   */
  private readonly drawnMarks = { check: false, mixed: false }
  /** Description handed down by an enclosing `c2-form-field`; the checkbox keeps its own text as its name. */
  private readonly field = new FieldContextConsumer(this, { kind: 'check', selfLabelled: true })

  constructor() {
    super()
    this.addEventListener('click', this.forwardHostClick)
  }

  /**
   * A click aimed at the host itself — `host.click()`, a native `<label for>` around or pointing at the element,
   * `c2-form-field`'s label — toggles like a click on the box. Clicks from inside the shadow root or on slotted content
   * already reach the inner input and are left alone.
   */
  private readonly forwardHostClick = (event: Event) => {
    if (event.composedPath()[0] !== this || !this.formElement) return
    this.formElement.click()
  }

  override connectedCallback() {
    super.connectedCallback()
    // A group's lock does not follow an option moved out of it.
    if (this.groupDisabled && !this.closest('c2-checkbox-group')) this.groupDisabled = false
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
    this.checked = this.hasAttribute('checked')
    this.indeterminate = false
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    this.checked = state === 'checked'
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.requestUpdate()
  }

  override render() {
    const ariaChecked = this.indeterminate ? 'mixed' : undefined
    const hasLabel = this.slotPresence.has('')
    const hasDescription = this.slotPresence.has('description')
    const hasTrailing = this.slotPresence.has('trailing')
    // The whole row is a <label>, so clicking the text toggles the inner input and names it. Both text regions are
    // hidden while their slots are empty, which leaves a bare checkbox exactly the size of its touch target.
    return html`
      <label
        part="field"
        class=${classMap({
          'c2-checkbox-field': true,
          'has-text': hasLabel || hasDescription || hasTrailing,
          'has-description': hasDescription,
          'has-trailing': hasTrailing,
        })}
      >
        <div class="c2-checkbox">
          <input
            class="c2-checkbox-input"
            type="checkbox"
            name="${ifDefined(this.name)}"
            aria-checked="${ifDefined(ariaChecked)}"
            aria-label="${ifDefined(this.ariaLabel || (!hasLabel && this.field.label) || undefined)}"
            aria-labelledby="${ifDefined(this.ariaLabelledBy)}"
            aria-describedby="${this.field.describedBy(this.ariaDescribedBy)}"
            aria-invalid="${this.field.invalid ? 'true' : nothing}"
            ?disabled="${this.effectiveDisabled}"
            ?required="${this.required}"
            .value="${this.value}"
            .indeterminate="${this.indeterminate}"
            ?checked="${this.checked}"
            @change="${this.handleChange}"
          />
          <div class="c2-checkbox__background">
            <!-- Each mark slot sits in its own positioned wrapper, so any slotted content (an inline SVG, a c2-feather-*
               icon, a c2-mat-icon, or a framework wrapper around them) is centred, sized and faded as one unit. -->
            <span class="c2-checkbox__mark c2-checkbox__mark--check" part="checkmark">
              <slot name="checkmark">${this.drawnMarks.check ? CHECKMARK : nothing}</slot>
            </span>
            <span class="c2-checkbox__mark c2-checkbox__mark--mixed" part="mixedmark">
              <slot name="mixedmark">${this.drawnMarks.mixed ? MIXEDMARK : nothing}</slot>
            </span>
            <span class="c2-checkbox__mark c2-checkbox__mark--uncheck" part="uncheckmark">
              <slot name="uncheckmark"></slot>
            </span>
          </div>
        </div>
        <span class="c2-checkbox-text" ?hidden=${!hasLabel && !hasDescription}>
          <span class="c2-checkbox-label" part="label" ?hidden=${!hasLabel}><slot @slotchange=${this.slotPresence.handleSlotChange}></slot></span>
          <span class="c2-checkbox-description" part="description" ?hidden=${!hasDescription}>
            <slot name="description" @slotchange=${this.slotPresence.handleSlotChange}></slot>
          </span>
        </span>
        <span class="c2-checkbox-trailing" part="trailing" ?hidden=${!hasTrailing}>
          <slot name="trailing" @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </span>
      </label>
      ${this.field.renderDescription()}
    `
  }

  override focus(options?: FocusOptions | undefined): void {
    this.formElement?.focus(options)
  }

  protected override willUpdate(changedProperties: PropertyValues) {
    super.willUpdate(changedProperties)
    // Before rendering, so the mark is in the template that shows the new state.
    if (changedProperties.has('checked')) this.drawnMarks.check ||= this.checked
    if (changedProperties.has('indeterminate')) this.drawnMarks.mixed ||= this.indeterminate
  }

  protected override update(changedProperties: PropertyValues) {
    if (changedProperties.has('checked') && this.formElement) {
      this.formElement.checked = this.checked
    }
    super.update(changedProperties)
  }

  protected override updated(_changedProperties: PropertyValues) {
    if (this.field.invalid && !this.effectiveDisabled) this.internals.states.add('error')
    else this.internals.states.delete('error')
    this.internals.setFormValue(this.checked ? this.value : null, this.checked ? 'checked' : 'unchecked')
    const missing = this.required && !this.checked
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? this.msg.t('valueMissing') : '')
    this.internals.setValidity(flags, message, this.formElement)
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm || this.groupDisabled
  }

  protected handleChange(event: Event) {
    this.checked = this.formElement.checked
    this.indeterminate = this.formElement.indeterminate
    redispatchEvent(this, event)
  }

  static override styles = unsafeCSS(styles)
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-checkbox': Checkbox
  }
}
