import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './password-field.scss?inline'

/** Strength of a password, from 0 (too weak, or empty) to 4 (strong). */
export type PasswordStrength = 0 | 1 | 2 | 3 | 4

/** Ids of the built-in requirements. */
export type PasswordRequirementId = 'length' | 'lowercase' | 'uppercase' | 'number' | 'symbol'

/**
 * One line of the requirements checklist. A built-in `id` with no `test` or `pattern` keeps the built-in check, so
 * `{ id: 'number', label: 'Eine Ziffer' }` only translates the label.
 */
export interface PasswordRequirement {
  /** A built-in id, or any id of your own. */
  id?: PasswordRequirementId | (string & {})
  /** Text of the checklist line. Required for a requirement of your own. */
  label?: string
  /** Met when the password matches. A string is compiled with the `u` flag. */
  pattern?: RegExp | string
  /** Met when it returns `true`. Wins over `pattern`. */
  test?: (value: string) => boolean
}

/** A requirement as checked against the current value. */
export interface PasswordRequirementState {
  id: string
  label: string
  met: boolean
}

export interface PasswordFieldRevealChangeDetail {
  /** Whether the password is now shown in clear text. */
  revealed: boolean
}

export interface PasswordFieldStrengthChangeDetail {
  /** The new strength, 0 to 4. */
  score: PasswordStrength
  /** The `strength-labels` entry for that score. */
  label: string
}

/** Events fired by {@link PasswordField}, keyed for `addEventListener`. */
export interface PasswordFieldEventMap {
  input: InputEvent
  change: Event
  'reveal-change': CustomEvent<PasswordFieldRevealChangeDetail>
  'strength-change': CustomEvent<PasswordFieldStrengthChangeDetail>
}

export interface PasswordField {
  addEventListener: TypedAddEventListener<PasswordField, PasswordFieldEventMap>
  removeEventListener: TypedRemoveEventListener<PasswordField, PasswordFieldEventMap>
}

const DEFAULT_MIN_LENGTH = 8

const BUILT_IN: Record<PasswordRequirementId, { label: (minLength: number) => string; test: (value: string, minLength: number) => boolean }> = {
  length: { label: (min) => `At least ${min} characters`, test: (value, min) => [...value].length >= min },
  lowercase: { label: () => 'One lowercase letter', test: (value) => /\p{Ll}/u.test(value) },
  uppercase: { label: () => 'One uppercase letter', test: (value) => /\p{Lu}/u.test(value) },
  number: { label: () => 'One number', test: (value) => /\p{N}/u.test(value) },
  symbol: { label: () => 'One symbol', test: (value) => /[^\p{L}\p{N}\s]/u.test(value) },
}

const COMMON = new Set([
  'password',
  'password1',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  '11111111',
  'abc12345',
  'letmein1',
])

/**
 * The default strength estimate behind the meter: length and character variety (lowercase, uppercase, digits,
 * symbols), with common passwords and single repeated characters scored 0. It is a hint for the user, not a security
 * check; hand `scorer` a stronger estimator (zxcvbn, for instance) when the score matters.
 */
export function scorePassword(value: string): PasswordStrength {
  const length = [...value].length
  if (length === 0) return 0
  const lower = value.toLocaleLowerCase()
  if (COMMON.has(lower) || /^(.)\1*$/u.test(value)) return 0
  const variety = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}\s]/u].filter((pattern) => pattern.test(value)).length
  if ((length >= 12 && variety >= 4) || (length >= 16 && variety >= 3) || length >= 20) return 4
  if ((length >= 10 && variety >= 3) || (length >= 14 && variety >= 2)) return 3
  if (length >= 8 && variety >= 2) return 2
  if (length >= 8) return 1
  return 0
}

/**
 * A password input: the sign-in and sign-up field of Stripe, GitHub and Carbon. A toggle at the end of the field shows
 * the password in clear text and hides it again (`revealed`, `reveal-change`; `hide-toggle` removes it). For a new
 * password, `meter` adds a four-segment strength meter under the field and `requirements` a checklist that ticks
 * each rule as it is met: the built-in `length` (at least `minlength`, 8 by default), `lowercase`, `uppercase`,
 * `number` and `symbol`, separated by semicolons, or from script any {@link PasswordRequirement} of your own.
 * While Caps Lock is on and the password is hidden, a warning shows under the field.
 *
 * The element is form-associated (`name`), so it submits with its form, and validates like an input: `required`,
 * `minlength`, `maxlength`, and every requirement once something is typed. `input` and `change` are re-dispatched
 * from the inner input. The strength comes from {@link scorePassword} unless `scorer` replaces it; while a requirement
 * is unmet, it is capped at 1 (weak).
 *
 * The host exposes its state as custom states: `:state(focus-within)`, `:state(revealed)`, `:state(caps-lock)`,
 * `:state(error)`, `:state(disabled)`, `:state(requirements-met)` and, while a value is typed, `:state(strength-0)` to
 * `:state(strength-4)`.
 *
 * @tag c2-password-field
 *
 * @slot prefix-icon - Icon at the start of the field, e.g. a lock.
 * @slot show-icon - Replaces the eye shown while the password is hidden.
 * @slot hide-icon - Replaces the crossed-out eye shown while the password is revealed.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are the plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched from the inner input on every keystroke; `value` is already updated.
 * @event {Event} change - Re-dispatched from the inner input when the value is committed (blur or Enter).
 * @event {CustomEvent<PasswordFieldRevealChangeDetail>} reveal-change - The toggle showed or hid the password. Does not bubble.
 * @event {CustomEvent<PasswordFieldStrengthChangeDetail>} strength-change - The strength score changed while typing. Does not bubble.
 *
 * @cssproperty {pixel} [--c2-password-field--min-height=36px]
 * @cssproperty {padding} [--c2-password-field--padding=6px 6px 6px 12px]
 * @cssproperty {pixel} [--c2-password-field--gap=8px] - Space between the icons and the text.
 * @cssproperty {color} [--c2-password-field--color=#18181b]
 * @cssproperty {color} [--c2-password-field--background=#ffffff]
 * @cssproperty {border} [--c2-password-field--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-password-field--border-radius=6px]
 * @cssproperty {font-size} [--c2-password-field--font-size=14px]
 * @cssproperty {font-family} --c2-password-field--font-family
 * @cssproperty {color} [--c2-password-field__placeholder--color=#71717a]
 * @cssproperty {border} [--c2-password-field__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-password-field__focus--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {color} --c2-password-field__focus--background
 * @cssproperty {outline} [--c2-password-field__focus--outline=none]
 * @cssproperty {border} [--c2-password-field__error--border=1px solid #dc2626]
 * @cssproperty {opacity} [--c2-password-field__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-password-field__icon--size=16px]
 * @cssproperty {color} [--c2-password-field__icon--color=#71717a]
 * @cssproperty {pixel} [--c2-password-field__toggle--size=24px] - Hit area of the show/hide button.
 * @cssproperty {color} [--c2-password-field__toggle--color=#71717a]
 * @cssproperty {color} [--c2-password-field__toggle__hover--color=#18181b]
 * @cssproperty {color} [--c2-password-field__toggle__hover--background=#f4f4f5]
 * @cssproperty {border-radius} [--c2-password-field__toggle--border-radius=4px]
 * @cssproperty {outline} [--c2-password-field__toggle__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {pixel} [--c2-password-field__supporting-text--gap=6px] - Space between the field, the meter, the checklist and the helper line.
 * @cssproperty {font-size} [--c2-password-field__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-password-field__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-password-field__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-password-field__supporting-text__error--color=#dc2626]
 * @cssproperty {color} [--c2-password-field__caps-lock--color=#18181b] - Text of the Caps Lock warning.
 *
 * @cssproperty {pixel} [--c2-password-field__meter--height=4px]
 * @cssproperty {pixel} [--c2-password-field__meter--gap=4px] - Space between the four segments.
 * @cssproperty {border-radius} [--c2-password-field__meter--border-radius=999px]
 * @cssproperty {color} [--c2-password-field__meter--background=#e4e4e7] - Colour of an unfilled segment.
 * @cssproperty {color} [--c2-password-field__meter__weak--color=#dc2626] - Filled segments at strength 1.
 * @cssproperty {color} [--c2-password-field__meter__fair--color=#f59e0b] - Filled segments at strength 2.
 * @cssproperty {color} [--c2-password-field__meter__good--color=#65a30d] - Filled segments at strength 3.
 * @cssproperty {color} [--c2-password-field__meter__strong--color=#16a34a] - Filled segments at strength 4.
 * @cssproperty {color} [--c2-password-field__meter-label--color=#71717a]
 * @cssproperty {font-weight} [--c2-password-field__meter-label--font-weight=500]
 *
 * @cssproperty {pixel} [--c2-password-field__requirement--gap=6px] - Space between a requirement's mark and its text.
 * @cssproperty {pixel} [--c2-password-field__requirement--row-gap=2px] - Space between two requirements.
 * @cssproperty {color} [--c2-password-field__requirement--color=#71717a]
 * @cssproperty {color} [--c2-password-field__requirement__met--color=#18181b] - Text of a met requirement.
 * @cssproperty {color} [--c2-password-field__requirement-icon__met--color=#16a34a] - Tick of a met requirement.
 * @cssproperty {pixel} [--c2-password-field__requirement-icon--size=14px]
 */
@customElement('c2-password-field')
export class PasswordField extends LitElement {
  static formAssociated = true

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** The password. Setting the attribute after the user has typed no longer updates it, like a native input. */
  @property({ type: String }) value = ''

  /** Form field name: the password is submitted with the form under this name. */
  @property({ type: String }) name = ''

  /** Text shown while the field is empty. */
  @property({ type: String }) placeholder = ''

  /** Accessible name of the field. Defaults to the placeholder, then to "Password". */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Autofill hint: `current-password` for a sign-in form, `new-password` for sign-up and reset forms. */
  @property({ type: String }) autocomplete = 'current-password'

  /** The field must not be empty. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Minimum length in characters. Also the length the built-in `length` requirement asks for (8 when unset). */
  @property({ type: Number }) minLength = -1

  /** Maximum length in characters. */
  @property({ type: Number }) maxLength = -1

  /** Disables the field and its toggle. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows the password in clear text. The toggle flips it and fires `reveal-change`. */
  @property({ type: Boolean }) revealed = false

  /** Removes the show/hide toggle. */
  @property({ type: Boolean, attribute: 'hide-toggle' }) hideToggle = false

  /** Shows the strength meter under the field. */
  @property({ type: Boolean }) meter = false

  /**
   * Checklist shown under the field and checked as the user types: built-in ids (`length`, `lowercase`,
   * `uppercase`, `number`, `symbol`), separated by semicolons as an attribute, or {@link PasswordRequirement} objects
   * from script.
   */
  @property({ converter: arrayPropertyConverter }) requirements: (string | PasswordRequirement)[] = []

  /** Labels of the five strength scores, 0 to 4, separated by semicolons. */
  @property({ attribute: 'strength-labels', converter: arrayPropertyConverter }) strengthLabels: string[] = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']

  /** Replaces {@link scorePassword} as the strength estimate. Returns 0 to 4. */
  @property({ attribute: false }) scorer?: (value: string) => number

  /** Marks the field invalid and shows `error-text` in place of `help`. */
  @property({ type: Boolean, reflect: true }) error = false

  /** Message shown while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''

  /** Helper text under the field. */
  @property({ type: String }) help = ''

  /** Accessible name of the show/hide toggle. Its pressed state says whether the password is shown. */
  @property({ attribute: 'toggle-label' }) toggleLabel = 'Show password'

  /** Warning shown while Caps Lock is on. Empty turns the warning off. */
  @property({ attribute: 'caps-lock-text' }) capsLockText = 'Caps Lock is on'

  /** Message of the validity error while a requirement is unmet. */
  @property({ attribute: 'requirements-message' }) requirementsMessage = 'The password does not meet every requirement.'

  @state() private focused = false
  @state() private capsLock = false
  @state() private disabledByForm = false
  @state() private hasSupportingSlot = false
  private dirty = false
  private customValidityMessage = ''
  private lastScore: PasswordStrength | undefined

  @query('.input') private readonly input?: HTMLInputElement | null

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

  /** The current strength, 0 to 4. */
  get strength(): PasswordStrength {
    if (!this.value) return 0
    const raw = this.scorer ? this.scorer(this.value) : scorePassword(this.value)
    const score = Math.max(0, Math.min(4, Math.round(Number(raw) || 0))) as PasswordStrength
    return this.requirementStates.every((requirement) => requirement.met) ? score : (Math.min(score, 1) as PasswordStrength)
  }

  /** Each requirement with whether the current value meets it. */
  get requirementStates(): PasswordRequirementState[] {
    const list = Array.isArray(this.requirements) ? this.requirements : []
    const minLength = this.minLength > 0 ? this.minLength : DEFAULT_MIN_LENGTH
    const states: PasswordRequirementState[] = []
    list.forEach((entry, index) => {
      const requirement: PasswordRequirement = typeof entry === 'string' ? { id: entry.trim() } : entry
      if (!requirement) return
      const builtIn = requirement.id && requirement.id in BUILT_IN ? BUILT_IN[requirement.id as PasswordRequirementId] : undefined
      const label = requirement.label ?? builtIn?.label(minLength)
      if (!label) return
      let met: boolean
      if (requirement.test) met = !!requirement.test(this.value)
      else if (requirement.pattern !== undefined)
        met = (typeof requirement.pattern === 'string' ? new RegExp(requirement.pattern, 'u') : requirement.pattern).test(this.value)
      else met = builtIn ? builtIn.test(this.value, minLength) : false
      states.push({ id: requirement.id ?? `requirement-${index}`, label, met })
    })
    return states
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

  /** Selects the whole password. */
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
    this.revealed = false
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

  private toggleReveal() {
    if (this.effectiveDisabled) return
    this.revealed = !this.revealed
    this.dispatchEvent(new CustomEvent<PasswordFieldRevealChangeDetail>('reveal-change', { detail: { revealed: this.revealed } }))
    // Keep the caret where the user left it: the toggle took focus, so return it to the input.
    this.input?.focus()
  }

  private handleInput(event: Event) {
    this.dirty = true
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }

  private handleKey(event: KeyboardEvent) {
    if (typeof event.getModifierState === 'function') this.capsLock = event.getModifierState('CapsLock')
  }

  private handleFieldClick(event: Event) {
    if (event.target === this.input || this.effectiveDisabled) return
    if ((event.composedPath() as Element[]).some((node) => node instanceof HTMLElement && node.classList.contains('toggle'))) return
    this.input?.focus()
  }

  private handleSupportingSlotChange(event: Event) {
    this.hasSupportingSlot = (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).length > 0
  }

  protected override updated(changed: PropertyValues) {
    const value = this.value
    const score = this.strength
    const requirements = this.requirementStates
    const states: Record<string, boolean> = {
      'focus-within': this.focused,
      revealed: this.revealed,
      'caps-lock': this.capsLockShown,
      error: this.error && !this.effectiveDisabled,
      disabled: this.effectiveDisabled,
      'requirements-met': requirements.length > 0 && requirements.every((requirement) => requirement.met),
    }
    for (let level = 0; level <= 4; level++) states[`strength-${level}`] = !!value && score === level
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
    this.syncFormState()
    if (changed.has('value') && this.lastScore !== undefined && score !== this.lastScore) {
      this.dispatchEvent(new CustomEvent<PasswordFieldStrengthChangeDetail>('strength-change', { detail: { score, label: this.strengthLabel(score) } }))
    }
    this.lastScore = score
  }

  private syncFormState() {
    if (isServer) return
    this.internals.setFormValue(this.effectiveDisabled ? null : this.value, this.value)
    if (!this.input || this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    const unmet = !!this.value && this.requirementStates.some((requirement) => !requirement.met)
    this.input.setCustomValidity(this.customValidityMessage || (unmet ? this.requirementsMessage : ''))
    this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input)
  }

  private get capsLockShown() {
    return this.capsLock && this.focused && !this.revealed && !!this.capsLockText
  }

  private strengthLabel(score: PasswordStrength) {
    const labels = Array.isArray(this.strengthLabels) ? this.strengthLabels : []
    return labels[score] ?? ''
  }

  private renderToggle() {
    if (this.hideToggle) return nothing
    return html`<button
      class="toggle"
      type="button"
      aria-label=${this.toggleLabel}
      aria-pressed=${this.revealed ? 'true' : 'false'}
      ?disabled=${this.effectiveDisabled}
      @click=${this.toggleReveal}
    >
      ${
        this.revealed
          ? html`<slot name="hide-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
                <path d="m1 1 22 22"></path>
              </svg>
            </slot>`
          : html`<slot name="show-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </slot>`
      }
    </button>`
  }

  private renderMeter() {
    if (!this.meter) return nothing
    const score = this.value ? this.strength : 0
    const label = this.value ? this.strengthLabel(score) : ''
    const level = ['', 'weak', 'fair', 'good', 'strong'][score]
    return html`<div class="meter-row" id="meter">
      <div
        class="meter ${level}"
        role="meter"
        aria-label="Password strength"
        aria-valuemin="0"
        aria-valuemax="4"
        aria-valuenow=${score}
        aria-valuetext=${label || nothing}
      >
        ${[1, 2, 3, 4].map((segment) => html`<span class="segment ${segment <= score ? 'filled' : ''}"></span>`)}
      </div>
      <span class="meter-label" aria-live="polite">${label}</span>
    </div>`
  }

  private renderRequirements(requirements: PasswordRequirementState[]) {
    if (!requirements.length) return nothing
    return html`<ul class="requirements" id="requirements" aria-label="Password requirements">
      ${requirements.map(
        (requirement) =>
          html`<li class="requirement ${requirement.met ? 'met' : ''}" data-requirement=${requirement.id}>
            <span class="requirement-icon" aria-hidden="true">
              ${
                requirement.met
                  ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>`
                  : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <circle cx="12" cy="12" r="8"></circle>
                    </svg>`
              }
            </span>
            <span>${requirement.label}<span class="visually-hidden">${requirement.met ? ', met' : ', not met'}</span></span>
          </li>`,
      )}
    </ul>`
  }

  private renderSupportingText() {
    const showError = this.error && !this.effectiveDisabled && !!this.errorText
    const message = showError ? this.errorText : this.help
    return html`<div class="supporting-text ${showError ? 'error' : ''}" id="help" ?hidden=${!message && !this.hasSupportingSlot}>
      <slot name="supporting-text" @slotchange=${this.handleSupportingSlotChange}>${message}</slot>
    </div>`
  }

  override render() {
    const requirements = this.requirementStates
    const name = this.ariaLabel || this.placeholder || 'Password'
    const describedBy = [this.meter ? 'meter' : '', requirements.length ? 'requirements' : '', 'help', 'caps-lock'].filter(Boolean).join(' ')
    return html`<div class="field" @click=${this.handleFieldClick}>
        <slot name="prefix-icon" class="prefix"></slot>
        <input
          class="input"
          type=${this.revealed ? 'text' : 'password'}
          aria-label=${name}
          aria-describedby=${describedBy}
          aria-invalid=${this.error ? 'true' : nothing}
          autocomplete=${ifDefined(this.autocomplete || undefined)}
          autocapitalize="off"
          spellcheck="false"
          name=${ifDefined(this.name || undefined)}
          placeholder=${this.placeholder || nothing}
          minlength=${ifDefined(this.minLength > -1 ? this.minLength : undefined)}
          maxlength=${ifDefined(this.maxLength > -1 ? this.maxLength : undefined)}
          ?required=${this.required}
          ?disabled=${this.effectiveDisabled}
          .value=${live(this.value)}
          @input=${this.handleInput}
          @change=${(event: Event) => redispatchEvent(this, event)}
          @keydown=${this.handleKey}
          @keyup=${this.handleKey}
          @focus=${() => (this.focused = true)}
          @blur=${() => (this.focused = false)}
        />
        ${this.renderToggle()}
      </div>
      ${this.renderMeter()} ${this.renderRequirements(requirements)}
      <div class="caps-lock" id="caps-lock" role="status">${this.capsLockShown ? this.capsLockText : nothing}</div>
      ${this.renderSupportingText()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-password-field': PasswordField
  }
}
