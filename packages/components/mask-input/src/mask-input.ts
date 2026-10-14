import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController, redispatchEvent } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { applyMask, defaultMaskTokens, maskTemplate, parseMask, type MaskPart, type MaskResult, type MaskToken } from './mask.js'
import { maskInputMessages } from './messages.js'
import styles from './mask-input.scss?inline'

export { applyMask, defaultMaskTokens, formatMask, maskTemplate, parseMask, unmask } from './mask.js'
export type { ApplyMaskOptions, MaskPart, MaskResult, MaskToken } from './mask.js'
export { maskInputMessages } from './messages.js'

export interface MaskInputCompleteDetail {
  /** The value, as `value` holds it. */
  value: string
  /** The value as displayed, literals included. */
  formattedValue: string
}

/** Events fired by {@link MaskInput}, keyed for `addEventListener`. */
export interface MaskInputEventMap {
  input: InputEvent
  change: Event
  complete: CustomEvent<MaskInputCompleteDetail>
}

export interface MaskInput {
  addEventListener: TypedAddEventListener<MaskInput, MaskInputEventMap>
  removeEventListener: TypedRemoveEventListener<MaskInput, MaskInputEventMap>
}

const digitsOnly = (parts: MaskPart[]) =>
  parts.some((part) => part.kind === 'slot') && parts.every((part) => part.kind !== 'slot' || part.token === defaultMaskTokens['9'])

/**
 * A text input that fits what is typed to a pattern: postcodes, IBANs, tax IDs, card expiry dates, licence plates. The
 * `mask` names what each position accepts: `9` a digit, `a` a letter, `A` a letter in upper case, `*` a letter or digit
 * and `X` a letter or digit in upper case; any other character is a literal the field inserts itself (`\` escapes a mask
 * character, and `?` makes the rest of the mask optional, for values of varying length). `tokens` adds characters of
 * your own from script.
 *
 * Characters a position does not accept are dropped, so typing, pasting a formatted or unformatted value and deleting
 * across a literal all work. While the field has focus or a value, the rest of the mask shows behind the text in
 * `slot-char`s, so the user sees what is left to type.
 *
 * `value` holds the typed characters only (`FR7630006000011234567890189`), or the formatted text with
 * `include-literals`; the form submits the same. The element is form-associated (`name`) and validates like an input:
 * `required`, and an incomplete value is invalid. `complete` fires when the last required position is filled.
 *
 * The host exposes its state as custom states: `:state(focus-within)`, `:state(complete)`, `:state(error)`,
 * `:state(disabled)` and `:state(read-only)`.
 *
 * @tag c2-mask-input
 *
 * @slot prefix-icon - Icon or short adornment text at the start of the field.
 * @slot suffix-icon - Icon or adornment at the end of the field.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are the plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched from the inner input after each edit; `value` is already updated.
 * @event {Event} change - Fired when an edited value is committed (blur or Enter), like an input's `change`.
 * @event {CustomEvent<MaskInputCompleteDetail>} complete - The user filled the last required position of the mask.
 *
 * @cssproperty {pixel} [--c2-mask-input--min-height=36px]
 * @cssproperty {padding} [--c2-mask-input--padding=6px 12px]
 * @cssproperty {pixel} [--c2-mask-input--gap=8px] - Space between the icons and the text.
 * @cssproperty {color} [--c2-mask-input--color=#18181b]
 * @cssproperty {color} [--c2-mask-input--background=#ffffff]
 * @cssproperty {border} [--c2-mask-input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-mask-input--border-radius=6px]
 * @cssproperty {font-size} [--c2-mask-input--font-size=14px]
 * @cssproperty {font-family} --c2-mask-input--font-family
 * @cssproperty {font-variant-numeric} [--c2-mask-input--font-variant-numeric=tabular-nums] - Keeps digits one width, so the mask hint does not shift while typing.
 * @cssproperty {letter-spacing} [--c2-mask-input--letter-spacing=normal]
 * @cssproperty {color} [--c2-mask-input__placeholder--color=#71717a]
 * @cssproperty {color} [--c2-mask-input__slot--color=#a1a1aa] - Colour of the rest of the mask shown behind the text.
 * @cssproperty {border} [--c2-mask-input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-mask-input__focus--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {color} --c2-mask-input__focus--background
 * @cssproperty {outline} [--c2-mask-input__focus--outline=none]
 * @cssproperty {border} [--c2-mask-input__error--border=1px solid #dc2626]
 * @cssproperty {border} [--c2-mask-input__read-only--border=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-mask-input__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-mask-input__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-mask-input__icon--size=16px]
 * @cssproperty {color} [--c2-mask-input__icon--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-mask-input__supporting-text--gap=4px] - Space between the field and the helper line.
 * @cssproperty {font-size} [--c2-mask-input__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-mask-input__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-mask-input__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-mask-input__supporting-text__error--color=#dc2626]
 */
@customElement('c2-mask-input')
export class MaskInput extends LitElement {
  static formAssociated = true

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  private readonly msg = new LocalizeController(this, maskInputMessages)

  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])

  /**
   * The pattern: `9` digit, `a` letter, `A` upper-case letter, `*` letter or digit, `X` upper-case letter or digit,
   * `\` escapes the next character, `?` makes the rest optional. Anything else is a literal. Empty, the field takes any
   * text, like a plain input.
   */
  @property({ type: String }) mask = ''

  /** Mask characters of your own, added to (and winning over) the built-in ones. */
  @property({ attribute: false }) tokens: Record<string, MaskToken> = {}

  /**
   * The typed characters, without the literals; with `include-literals`, the formatted text. Setting it fits the new
   * text to the mask. Setting the attribute after the user has typed no longer updates it, like a native input.
   */
  @property({ type: String }) value = ''

  /** `value` and the submitted form value include the mask's literals (`12/34` rather than `1234`). */
  @property({ type: Boolean, attribute: 'include-literals' }) includeLiterals = false

  /** Character shown in the positions still to fill. */
  @property({ attribute: 'slot-char' }) slotChar = '_'

  /** Form field name: the value is submitted with the form under this name. */
  @property({ type: String }) name = ''

  /** Text shown while the field is empty and does not have focus. */
  @property({ type: String }) placeholder = ''

  /** Accessible name of the field. Defaults to the placeholder. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Autofill hint, e.g. `postal-code`, `cc-exp` or `tel-national`. */
  @property({ type: String }) autocomplete = ''

  /** Virtual keyboard to show. When unset, `numeric` for a mask of digits only, otherwise `text`. */
  @property({ attribute: 'inputmode' }) override inputMode = ''

  /** The field must not be empty. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Disables the field. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The value can be selected and copied but not edited. */
  @property({ type: Boolean, reflect: true }) readOnly = false

  /** Marks the field invalid and shows `error-text` in place of `help`. */
  @property({ type: Boolean, reflect: true }) error = false

  /** Message shown while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''

  /** Helper text under the field. */
  @property({ type: String }) help = ''

  @state() private focused = false
  @state() private disabledByForm = false
  private dirty = false
  private customValidityMessage = ''
  private parts: MaskPart[] = []
  private result: MaskResult = applyMask('', [])
  private wasComplete = false
  /** The formatted text when the value was last committed: `change` fires when blur or Enter finds it different. */
  private committed = ''

  @query('.input') private readonly input?: HTMLInputElement | null
  @query('.slots') private readonly slots?: HTMLElement | null

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

  /** The value as displayed, literals included. */
  get formattedValue() {
    return this.result.formatted
  }

  /** The typed characters only, whatever `include-literals` says. */
  get rawValue() {
    return this.result.raw
  }

  /** Every required position of the mask is filled. */
  get complete() {
    return this.result.raw !== '' && this.result.complete
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    // After user input, the value attribute no longer drives the value (until reset), like a native <input>.
    if (name === 'value' && this.dirty) return
    super.attributeChangedCallback(name, oldValue, newValue)
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }

  override blur() {
    this.input?.blur()
  }

  /** Selects the whole text. */
  select() {
    this.input?.select()
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  /** Sets a custom validation message; an empty string clears it. */
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

  formResetCallback() {
    this.dirty = false
    this.value = this.getAttribute('value') ?? ''
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled
  }

  formStateRestoreCallback(restored: string | File | FormData | null) {
    if (typeof restored === 'string') this.value = restored
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('mask') || changed.has('tokens')) this.parts = parseMask(this.mask ?? '', this.tokens ?? {})
    if (changed.has('mask') || changed.has('tokens') || changed.has('value') || changed.has('includeLiterals')) {
      this.result = applyMask(String(this.value ?? ''), this.parts, { raw: !this.includeLiterals })
      const normalized = this.valueFrom(this.result)
      if (normalized !== this.value) this.value = normalized
      this.wasComplete = this.complete
    }
  }

  private valueFrom(result: MaskResult) {
    return this.includeLiterals ? result.formatted : result.raw
  }

  /** Offset in the formatted text of the `index`-th typed character, or the end. */
  private caretAt(result: MaskResult, index: number) {
    return index < result.positions.length ? result.positions[index] : result.formatted.length
  }

  /** Writes a new result to the inner input and the host, and puts the caret after `rawIndex` typed characters. */
  private commit(result: MaskResult, rawIndex: number, event: Event) {
    const input = this.input
    if (!input) return
    this.dirty = true
    this.result = result
    input.value = result.formatted
    const caret = this.caretAt(result, rawIndex)
    if (this.shadowRoot?.activeElement === input) input.setSelectionRange(caret, caret)
    this.value = this.valueFrom(result)
    this.requestUpdate()
    redispatchEvent(this, event)
    const complete = this.complete
    if (complete && !this.wasComplete) {
      this.dispatchEvent(
        new CustomEvent<MaskInputCompleteDetail>('complete', {
          detail: { value: this.value, formattedValue: result.formatted },
          bubbles: true,
          composed: true,
        }),
      )
    }
    this.wasComplete = complete
  }

  private handleBeforeInput(event: InputEvent) {
    const input = this.input
    if (!input || event.isComposing) return
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? start
    if (start !== end) return
    const backward = event.inputType === 'deleteContentBackward'
    const forward = event.inputType === 'deleteContentForward'
    if (!backward && !forward) return
    const { positions } = this.result
    const offset = backward ? start - 1 : start
    if (offset < 0 || positions.includes(offset)) return
    // The character to delete is a literal the field inserted: delete the typed character beyond it instead.
    let index = -1
    if (backward) {
      for (let i = positions.length - 1; i >= 0; i--) {
        if (positions[i] < offset) {
          index = i
          break
        }
      }
    } else index = positions.findIndex((position) => position > offset)
    event.preventDefault()
    if (index < 0) return
    const chars = [...this.result.raw]
    chars.splice(index, 1)
    this.commit(applyMask(chars.join(''), this.parts, { raw: true }), index, event)
  }

  private handleInput(event: InputEvent) {
    const input = event.target as HTMLInputElement
    if (event.isComposing) return
    const text = input.value
    const caret = input.selectionEnd ?? text.length
    const result = applyMask(text, this.parts)
    const before = [...applyMask(text.slice(0, caret), this.parts).raw].length
    this.commit(result, before, event)
  }

  private handleCompositionEnd(event: CompositionEvent) {
    const input = event.target as HTMLInputElement
    const result = applyMask(input.value, this.parts)
    const before = [...applyMask(input.value.slice(0, input.selectionEnd ?? input.value.length), this.parts).raw].length
    this.commit(result, before, new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertCompositionText', data: event.data }))
  }

  private handleFocus() {
    this.focused = true
    this.committed = this.result.formatted
  }

  private handleBlur() {
    this.focused = false
    this.commitChange()
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.isComposing) this.commitChange()
  }

  /**
   * Fires `change` when the value differs from the last committed one. The native event cannot be relied on: rewriting
   * the inner input's value on every edit makes Firefox drop it.
   */
  private commitChange() {
    if (this.result.formatted === this.committed) return
    this.committed = this.result.formatted
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private syncScroll() {
    if (this.slots && this.input) this.slots.scrollLeft = this.input.scrollLeft
  }

  private handleFieldClick(event: Event) {
    if (event.target === this.input || this.effectiveDisabled) return
    this.input?.focus()
  }

  protected override updated() {
    const states: Record<string, boolean> = {
      'focus-within': this.focused,
      complete: this.complete,
      error: this.error && !this.effectiveDisabled,
      disabled: this.effectiveDisabled,
      'read-only': this.readOnly,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
    this.syncFormState()
    this.syncScroll()
  }

  private syncFormState() {
    if (isServer) return
    this.internals.setFormValue(this.effectiveDisabled ? null : this.value, this.result.formatted)
    if (!this.input || this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    const incomplete = this.result.raw !== '' && !this.result.complete
    this.input.setCustomValidity(this.customValidityMessage || (incomplete ? this.msg.t('incomplete', this.template()) : ''))
    this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input)
  }

  private template() {
    return maskTemplate(this.parts, this.slotChar || '_')
  }

  private renderSupportingText() {
    const showError = this.error && !this.effectiveDisabled && !!this.errorText
    const message = showError ? this.errorText : this.help
    return html`<div class="supporting-text ${showError ? 'error' : ''}" id="help" ?hidden=${!message && !this.slotPresence.has('supporting-text')}>
      <slot name="supporting-text" @slotchange=${this.slotPresence.handleSlotChange}>${message}</slot>
    </div>`
  }

  override render() {
    const formatted = this.result.formatted
    const showSlots = (this.focused || formatted !== '') && !this.readOnly
    // While empty, the whole mask is the hint, leading literals included.
    const rest = showSlots ? maskTemplate(this.parts, this.slotChar || '_', formatted ? this.result.nextPart : 0) : ''
    const name = this.ariaLabel || this.placeholder || undefined
    const inputMode = this.inputMode || (digitsOnly(this.parts) ? 'numeric' : 'text')
    return html`<div class="field" @click=${this.handleFieldClick}>
        <slot name="prefix-icon" class="icon"></slot>
        <div class="control">
          <div class="slots" aria-hidden="true"><span class="typed">${formatted}</span>${rest}</div>
          <input
            class="input"
            type="text"
            aria-label=${ifDefined(name)}
            aria-describedby="format help"
            aria-invalid=${this.error ? 'true' : nothing}
            autocomplete=${ifDefined(this.autocomplete || undefined)}
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            inputmode=${inputMode}
            name=${ifDefined(this.name || undefined)}
            placeholder=${showSlots ? nothing : this.placeholder || nothing}
            ?required=${this.required}
            ?disabled=${this.effectiveDisabled}
            ?readonly=${this.readOnly}
            .value=${live(formatted)}
            @beforeinput=${this.handleBeforeInput}
            @input=${this.handleInput}
            @compositionend=${this.handleCompositionEnd}
            @keydown=${this.handleKeyDown}
            @scroll=${this.syncScroll}
            @keyup=${this.syncScroll}
            @focus=${this.handleFocus}
            @blur=${this.handleBlur}
          />
        </div>
        <slot name="suffix-icon" class="icon"></slot>
      </div>
      <span class="visually-hidden" id="format">${this.parts.length ? this.msg.t('format', this.template()) : nothing}</span>
      ${this.renderSupportingText()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-mask-input': MaskInput
  }
}
