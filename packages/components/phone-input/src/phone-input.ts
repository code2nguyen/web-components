import { LitElement, html, isServer, nothing, unsafeCSS } from 'lit'
import { query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { resolveLocale } from '@c2n/core/locale-helper.js'
import '@c2n/overlay'
import {
  PHONE_COUNTRIES,
  detectCountry,
  digitsOf,
  flagEmoji,
  formatNational,
  formatSignificant,
  isPossibleNumber,
  phoneCountry,
  significantNumber,
  type PhoneCountry,
} from './countries.js'
import styles from './phone-input.scss?inline'

export type { PhoneCountry }
export { PHONE_COUNTRIES, phoneCountry }

export interface PhoneInputCountryChangeDetail {
  /** ISO 3166-1 alpha-2 code of the country now selected (`FR`). */
  country: string
  /** Its calling code without the plus (`33`). */
  dialCode: string
}

/** Events fired by {@link PhoneInput}, keyed for `addEventListener`. */
export interface PhoneInputEventMap {
  input: Event
  change: Event
  'country-change': CustomEvent<PhoneInputCountryChangeDetail>
}

export interface PhoneInput {
  addEventListener: TypedAddEventListener<PhoneInput, PhoneInputEventMap>
  removeEventListener: TypedRemoveEventListener<PhoneInput, PhoneInputEventMap>
}

/** Splits a country list written with semicolons, commas or spaces into upper-case ISO codes. */
function isoList(list: readonly string[] | string | null | undefined): string[] {
  const items = typeof list === 'string' ? [list] : Array.isArray(list) ? list : []
  return items
    .flatMap((item) => String(item).split(/[\s,;]+/))
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
}

/**
 * A phone number field: a country picker (flag and calling code) next to the national number, the sign-up field of
 * Stripe and Twilio. The value is the number in **E.164** (`+33612345678`), whatever the user typed: the national
 * number as written in the country (`06 12 34 56 78`, trunk prefix included), spaces, dashes or brackets. The field
 * groups the digits as the user types, in the country's usual layout.
 *
 * Typing or pasting a number that starts with `+` picks its country from the calling code (and the area code, for
 * codes several countries share, such as +1 or +44). Setting `value` does the same; a `value` without `+` is read as a
 * national number of the current country.
 *
 * `country` is the country selected when there is no value; without it, the region of `locale` (or the browser's
 * language) is used, then the United States. `countries` restricts the picker, `preferred-countries` lists a few at
 * the top. With a single country in `countries` the picker is replaced by a fixed flag and calling code, for a form
 * that only accepts numbers of one country; a `+` number of another country is then reported as invalid. Country names come from `Intl.DisplayNames` in `locale`.
 *
 * The element is form-associated: the E.164 value is submitted under `name`. `required` reports an empty field, and a
 * number whose length the country's numbering plan does not allow is reported as invalid (`validity.patternMismatch`);
 * `valid` tells the same from script. The host exposes `:state(open)`, `:state(invalid)` (a number was typed but is
 * not possible), `:state(focus-within)` and `:state(disabled)`.
 *
 * @tag c2-phone-input
 *
 * @slot chevron-icon - Replaces the chevron of the country button.
 * @slot search-icon - Replaces the magnifier of the country search field.
 *
 * @event {Event} input - Re-dispatched from the number field on every keystroke; also fired when a country is picked and the value changes.
 * @event {Event} change - Re-dispatched from the number field when the number is committed; also fired when a country is picked and the value changes.
 * @event {CustomEvent<PhoneInputCountryChangeDetail>} country-change - The selected country changed, from the picker or from a typed or pasted `+` prefix. Does not bubble; listen on the element.
 *
 * @cssproperty {pixel} [--c2-phone-input--min-height=36px]
 * @cssproperty {color} [--c2-phone-input--color=#18181b]
 * @cssproperty {color} [--c2-phone-input--background=#ffffff]
 * @cssproperty {border} [--c2-phone-input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-phone-input--border-radius=6px]
 * @cssproperty {font-size} [--c2-phone-input--font-size=14px]
 * @cssproperty {font-family} --c2-phone-input--font-family
 * @cssproperty {color} [--c2-phone-input__placeholder--color=#71717a]
 * @cssproperty {border} [--c2-phone-input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-phone-input__focus--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {color} --c2-phone-input__focus--background
 * @cssproperty {outline} [--c2-phone-input__focus--outline=none]
 * @cssproperty {border} [--c2-phone-input__invalid--border=1px solid #dc2626] - Border while the typed number is not possible for the country, once the field lost focus.
 * @cssproperty {opacity} [--c2-phone-input__disabled--opacity=0.38]
 *
 * @cssproperty {display} [--c2-phone-input__country--display=inline-flex] - `none` hides the country button, or the fixed prefix of a single allowed country, leaving only the number field.
 * @cssproperty {padding} [--c2-phone-input__country--padding=0 8px 0 10px]
 * @cssproperty {pixel} [--c2-phone-input__country--gap=6px] - Space between the flag, the calling code and the chevron.
 * @cssproperty {color} [--c2-phone-input__country--color=#18181b]
 * @cssproperty {color} [--c2-phone-input__country--background=transparent]
 * @cssproperty {color} [--c2-phone-input__country__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-phone-input__country__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Keyboard focus ring of the country button.
 * @cssproperty {border} [--c2-phone-input__divider--border=1px solid #e4e4e7] - Line between the country button and the number.
 * @cssproperty {pixel} [--c2-phone-input__flag--font-size=18px]
 * @cssproperty {display} [--c2-phone-input__flag--display=inline] - `none` hides the flags (where the platform does not draw flag emoji, for instance).
 * @cssproperty {color} [--c2-phone-input__dial-code--color=#52525b]
 * @cssproperty {pixel} [--c2-phone-input__icon--size=16px]
 * @cssproperty {color} [--c2-phone-input__icon--color=#71717a]
 *
 * @cssproperty {padding} [--c2-phone-input__input--padding=0 10px]
 *
 * @cssproperty {color} [--c2-phone-input__panel--background=#ffffff]
 * @cssproperty {border} [--c2-phone-input__panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-phone-input__panel--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-phone-input__panel--box-shadow=0 12px 32px rgba(24, 24, 27, 0.14)]
 * @cssproperty {pixel} [--c2-phone-input__panel--width=300px]
 * @cssproperty {pixel} [--c2-phone-input__panel--max-height=320px]
 * @cssproperty {padding} [--c2-phone-input__panel--padding=4px]
 * @cssproperty {pixel} [--c2-phone-input__panel--offset=6px] - Gap between the field and the panel.
 *
 * @cssproperty {padding} [--c2-phone-input__search--padding=6px 8px]
 * @cssproperty {border} [--c2-phone-input__search--border=1px solid #e4e4e7] - Line under the country search field.
 *
 * @cssproperty {pixel} [--c2-phone-input__option--min-height=32px]
 * @cssproperty {padding} [--c2-phone-input__option--padding=6px 8px]
 * @cssproperty {pixel} [--c2-phone-input__option--gap=8px]
 * @cssproperty {border-radius} [--c2-phone-input__option--border-radius=4px]
 * @cssproperty {color} [--c2-phone-input__option--color=#18181b]
 * @cssproperty {color} [--c2-phone-input__option-code--color=#52525b] - Calling code of each country in the list.
 * @cssproperty {color} [--c2-phone-input__option__active--background=#f4f4f5]
 * @cssproperty {font-weight} [--c2-phone-input__option__selected--font-weight=600]
 * @cssproperty {color} [--c2-phone-input__empty--color=#71717a] - The "No country found" line.
 */
@customElement('c2-phone-input')
export class PhoneInput extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /**
   * The number in E.164 (`+33612345678`), or an empty string. Setting a value with `+` picks its country; a value
   * without `+` is a national number of the current country. Setting the attribute after the user has typed no
   * longer updates it, like a native input.
   */
  @property({ type: String })
  get value(): string {
    if (this.assignedValue !== undefined) {
      const { country, digits } = this.parseValue(this.assignedValue)
      const significant = significantNumber(country, digits)
      return significant ? `+${country.dialCode}${significant}` : ''
    }
    const significant = this.significant
    return significant ? `+${this.currentCountry.dialCode}${significant}` : ''
  }
  set value(next: string | null | undefined) {
    // Read at the next update (or the next read), so a `country` set alongside in any order does not override it.
    this.assignedValue = next ?? ''
  }

  /** ISO 3166-1 alpha-2 code of the selected country (`FR`). Without it: the region of `locale`, then `US`. */
  @property({ type: String })
  get country(): string {
    return this.currentCountry.iso
  }
  set country(next: string | null | undefined) {
    this.countryIso = phoneCountry(next)?.iso
  }

  /** The countries the picker offers, as ISO codes. Empty offers all of them. As an attribute, separated by semicolons. */
  @property({ attribute: 'countries', converter: arrayPropertyConverter }) countries: string[] = []

  /** Countries listed first in the picker, in this order. As an attribute, separated by semicolons. */
  @property({ attribute: 'preferred-countries', converter: arrayPropertyConverter }) preferredCountries: string[] = []

  /** Locale of the country names, and of the default country. Defaults to the browser's language. */
  @property({ type: String }) locale = ''

  /** Text shown while the number is empty. Defaults to an example number of the selected country. */
  @property({ type: String }) placeholder = ''

  /** Accessible name of the number field. Defaults to "Phone number". */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Placeholder and accessible name of the country search field. */
  @property({ attribute: 'search-label' }) searchLabel = 'Search countries'

  /** Shown when no country matches the search. */
  @property({ attribute: 'empty-label' }) emptyLabel = 'No country found'

  /** Form field name: the E.164 number is submitted with the form under this name. */
  @property({ type: String }) name = ''

  /** An empty number makes the form invalid. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Disables the number field and the country picker. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The number can be selected and submitted but not edited; the country picker is disabled. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** The national number's digits as typed, trunk prefix included. */
  @state() private digits = ''
  /** What the number field shows while a `+` number is being typed whose calling code is not complete yet. */
  @state() private pendingText: string | undefined
  @state() private countryIso: string | undefined
  @state() private open = false
  @state() private search = ''
  @state() private activeIndex = 0
  @state() private focused = false
  @state() private touched = false
  @state() private disabledByForm = false
  private dirty = false
  private assignedValue: string | undefined
  private pendingCaret: number | undefined

  @query('.input') private readonly input?: HTMLInputElement | null
  @query('.country') private readonly countryButton?: HTMLButtonElement | null
  @query('.search-input') private readonly searchInput?: HTMLInputElement | null
  @query('.field') private readonly field?: HTMLElement | null

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

  /** The calling code of the selected country, without the plus (`33`). */
  get dialCode(): string {
    return this.currentCountry.dialCode
  }

  /** The national significant number: the digits after the calling code, without the trunk prefix. */
  get nationalNumber(): string {
    return this.significant
  }

  /** Whether the number is empty or has a length the selected country's numbering plan allows. */
  get valid(): boolean {
    return !this.significant || isPossibleNumber(this.currentCountry, this.significant)
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }

  override blur() {
    this.input?.blur()
  }

  /** Selects the whole number. */
  select() {
    this.input?.select()
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    // After user input, the value attribute no longer drives the value (until reset), like a native <input>.
    if (name === 'value' && this.dirty) return
    super.attributeChangedCallback(name, oldValue, newValue)
  }

  formResetCallback() {
    this.dirty = false
    this.touched = false
    this.pendingText = undefined
    this.countryIso = phoneCountry(this.getAttribute('country'))?.iso
    this.assignedValue = undefined
    this.applyValue(this.getAttribute('value') ?? '')
    this.requestUpdate()
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

  private get resolvedLocale() {
    return resolveLocale(this.locale || (isServer ? '' : document.documentElement.lang))
  }

  /** The countries the picker offers, in data order. */
  private get allowedCountries(): PhoneCountry[] {
    const allowed = isoList(this.countries)
    if (!allowed.length) return [...PHONE_COUNTRIES]
    const list = allowed.map((iso) => phoneCountry(iso)).filter((country): country is PhoneCountry => !!country)
    return list.length ? list : [...PHONE_COUNTRIES]
  }

  /** The selected country: the chosen one if allowed, else the locale's region, else the first allowed country. */
  private get currentCountry(): PhoneCountry {
    const allowed = this.allowedCountries
    const isAllowed = (country: PhoneCountry | undefined) => !!country && allowed.includes(country)
    const chosen = phoneCountry(this.countryIso)
    if (chosen && isAllowed(chosen)) return chosen
    let region: string | undefined
    try {
      region = new Intl.Locale(this.resolvedLocale).maximize().region
    } catch {
      region = undefined
    }
    const fromLocale = phoneCountry(region)
    if (fromLocale && isAllowed(fromLocale)) return fromLocale
    const us = phoneCountry('US')
    return isAllowed(us) ? us! : allowed[0]
  }

  private get significant(): string {
    return significantNumber(this.currentCountry, this.digits)
  }

  private regionNames: Intl.DisplayNames | undefined
  private regionNamesLocale = ''

  private countryName(country: PhoneCountry): string {
    const locale = this.resolvedLocale
    if (this.regionNamesLocale !== locale) {
      this.regionNamesLocale = locale
      try {
        this.regionNames = new Intl.DisplayNames([locale, 'en'], { type: 'region', fallback: 'code' })
      } catch {
        this.regionNames = undefined
      }
    }
    try {
      return this.regionNames?.of(country.iso) ?? country.iso
    } catch {
      return country.iso
    }
  }

  /** The picker's options: the preferred countries, then every allowed country by name, filtered by the search. */
  private get options(): { country: PhoneCountry; preferred: boolean }[] {
    const allowed = this.allowedCountries
    const preferred = isoList(this.preferredCountries)
      .map((iso) => phoneCountry(iso))
      .filter((country): country is PhoneCountry => !!country && allowed.includes(country))
    const collator = new Intl.Collator(this.resolvedLocale)
    const rest = allowed.filter((country) => !preferred.includes(country)).sort((a, b) => collator.compare(this.countryName(a), this.countryName(b)))
    const all = [...preferred.map((country) => ({ country, preferred: true })), ...rest.map((country) => ({ country, preferred: false }))]
    const query = this.search.trim().toLocaleLowerCase()
    if (!query) return all
    const digits = digitsOf(query)
    const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
    const folded = fold(query)
    // A search result list has no preferred section; names that start with the query come first ("ger": Germany
    // before Algeria), the rest keep their alphabetical order.
    const rank = (country: PhoneCountry) => {
      if (digits && /^\+?\d+$/.test(query)) return country.dialCode.startsWith(digits) ? 0 : -1
      if (country.iso.toLocaleLowerCase() === query) return 0
      const name = fold(this.countryName(country))
      if (name.startsWith(folded)) return 0
      if (name.split(/[\s-]+/).some((word) => word.startsWith(folded))) return 1
      return name.includes(folded) ? 2 : -1
    }
    return all
      .map((option) => ({ ...option, rank: rank(option.country) }))
      .filter((option) => option.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .map(({ country }) => ({ country, preferred: false }))
  }

  private flushValue() {
    if (this.assignedValue === undefined) return
    const text = this.assignedValue
    this.assignedValue = undefined
    this.applyValue(text)
  }

  /** The country and national digits a value stands for. */
  private parseValue(text: string): { country: PhoneCountry; digits: string } {
    const trimmed = text.trim()
    const current = this.currentCountry
    if (!trimmed.startsWith('+')) return { country: current, digits: digitsOf(trimmed) }
    const detected = detectCountry(digitsOf(trimmed), current)
    if (detected && this.allowedCountries.includes(detected.country)) return { country: detected.country, digits: detected.national }
    return { country: current, digits: '' }
  }

  /** Reads a value into the country and the national digits. */
  private applyValue(text: string) {
    this.pendingText = undefined
    const { country, digits } = this.parseValue(text)
    if (country !== this.currentCountry) this.countryIso = country.iso
    this.digits = digits
  }

  private setCountry(country: PhoneCountry, emit: boolean) {
    if (country === this.currentCountry && this.countryIso) return
    const changed = country !== this.currentCountry
    this.countryIso = country.iso
    if (changed && emit) {
      this.dispatchEvent(
        new CustomEvent<PhoneInputCountryChangeDetail>('country-change', {
          detail: { country: country.iso, dialCode: country.dialCode },
        }),
      )
    }
  }

  private handleInput(event: Event) {
    const input = event.target as HTMLInputElement
    const raw = input.value
    const caret = input.selectionStart ?? raw.length
    this.dirty = true
    this.assignedValue = undefined
    // Render even when the digits did not change (a letter was typed), so the field drops what is not a digit.
    this.requestUpdate()

    if (raw.trim().startsWith('+')) {
      const international = digitsOf(raw)
      const detected = detectCountry(international, this.currentCountry)
      if (detected && detected.national && this.allowedCountries.includes(detected.country)) {
        this.setCountry(detected.country, true)
        this.pendingText = undefined
        this.digits = detected.national
        this.pendingCaret = this.formatted.length
      } else {
        // Still typing the calling code: keep the text as it is, the value stays empty.
        this.pendingText = raw
        this.digits = ''
      }
      redispatchEvent(this, event)
      return
    }

    this.pendingText = undefined
    // Keep the caret after the same number of digits once the text is regrouped.
    const digitsBeforeCaret = digitsOf(raw.slice(0, caret)).length
    this.digits = digitsOf(raw)
    this.pendingCaret = this.caretAfterDigits(this.formatted, digitsBeforeCaret)
    redispatchEvent(this, event)
  }

  /** Deleting a space or bracket deletes the digit beside it, so the regrouping does not put the character back. */
  private handleBeforeInput(event: InputEvent) {
    const input = event.target as HTMLInputElement
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? 0
    if (start !== end || this.pendingText !== undefined) return
    const text = input.value
    let index = -1
    if (event.inputType === 'deleteContentBackward' && start > 0 && /\D/.test(text[start - 1])) {
      for (let i = start - 1; i >= 0; i--)
        if (/\d/.test(text[i])) {
          index = i
          break
        }
    } else if (event.inputType === 'deleteContentForward' && start < text.length && /\D/.test(text[start])) {
      for (let i = start; i < text.length; i++)
        if (/\d/.test(text[i])) {
          index = i
          break
        }
    } else {
      return
    }
    if (index < 0) return
    event.preventDefault()
    const digitsBefore = digitsOf(text.slice(0, index)).length
    this.dirty = true
    this.digits = this.digits.slice(0, digitsBefore) + this.digits.slice(digitsBefore + 1)
    this.pendingCaret = this.caretAfterDigits(this.formatted, digitsBefore)
    this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: event.inputType }))
  }

  private caretAfterDigits(text: string, count: number) {
    if (count <= 0) {
      const first = text.search(/\d/)
      return first < 0 ? 0 : first
    }
    let seen = 0
    for (let i = 0; i < text.length; i++) {
      if (/\d/.test(text[i]) && ++seen === count) return i + 1
    }
    return text.length
  }

  /** The number field's text. */
  private get formatted(): string {
    if (this.pendingText !== undefined) return this.pendingText
    return formatNational(this.currentCountry, this.digits)
  }

  private get exampleNumber(): string {
    const country = this.currentCountry
    return country.example ? formatSignificant(country, country.example) : ''
  }

  // Country picker.

  private openPicker() {
    if (this.effectiveDisabled || this.readonly || this.open || this.allowedCountries.length === 1) return
    this.search = ''
    const index = this.options.findIndex(({ country }) => country === this.currentCountry)
    this.activeIndex = Math.max(0, index)
    this.open = true
    this.updateComplete.then(() => {
      this.searchInput?.focus()
      this.scrollActiveIntoView()
    })
  }

  private closePicker(focusButton: boolean) {
    if (!this.open) return
    this.open = false
    if (focusButton) this.countryButton?.focus()
  }

  private pick(country: PhoneCountry) {
    const before = this.value
    this.dirty = true
    this.pendingText = undefined
    this.setCountry(country, true)
    this.open = false
    if (this.value !== before) {
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
    this.updateComplete.then(() => this.input?.focus())
  }

  private handleCountryClick() {
    if (this.open) this.closePicker(false)
    else this.openPicker()
  }

  private handleCountryKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      this.openPicker()
    }
  }

  private handleSearchInput(event: Event) {
    // The search text is not the element's value: keep its composed `input` inside the shadow root.
    event.stopPropagation()
    this.search = (event.target as HTMLInputElement).value
    this.activeIndex = 0
  }

  private handleSearchKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    const options = this.options
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        if (!options.length) return
        const step = event.key === 'ArrowDown' ? 1 : -1
        this.activeIndex = (this.activeIndex + step + options.length) % options.length
        this.updateComplete.then(() => this.scrollActiveIntoView())
        return
      }
      case 'Home':
      case 'End': {
        if (!options.length || this.search) return
        event.preventDefault()
        this.activeIndex = event.key === 'Home' ? 0 : options.length - 1
        this.updateComplete.then(() => this.scrollActiveIntoView())
        return
      }
      case 'Enter': {
        event.preventDefault()
        const option = options[this.activeIndex]
        if (option) this.pick(option.country)
        return
      }
      case 'Escape': {
        event.preventDefault()
        event.stopPropagation()
        this.closePicker(true)
        return
      }
      case 'Tab': {
        this.open = false
        return
      }
    }
  }

  private scrollActiveIntoView() {
    this.renderRoot.querySelector(`#country-${this.activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }

  private handleFocusin() {
    this.focused = true
  }

  private handleFocusout(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (next && this.renderRoot.contains(next)) return
    this.focused = false
    this.open = false
    if (this.digits || this.pendingText) this.touched = true
  }

  private handleFieldClick(event: Event) {
    if (event.target !== this.field || this.effectiveDisabled) return
    this.input?.focus()
  }

  protected override willUpdate() {
    this.flushValue()
  }

  protected override updated() {
    const invalid = !!this.significant && !this.valid
    const states: Record<string, boolean> = {
      open: this.open,
      invalid: invalid && this.touched,
      'focus-within': this.focused,
      disabled: this.effectiveDisabled,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }

    const value = this.value
    this.internals.setFormValue(this.effectiveDisabled || !value ? null : value, value)
    const anchor = this.input ?? undefined
    if (this.required && !value) {
      this.internals.setValidity({ valueMissing: true }, 'Please enter a phone number.', anchor)
    } else if (invalid || (this.pendingText !== undefined && digitsOf(this.pendingText))) {
      this.internals.setValidity({ patternMismatch: true }, `Please enter a valid phone number for ${this.countryName(this.currentCountry)}.`, anchor)
    } else {
      this.internals.setValidity({})
    }

    if (this.pendingCaret !== undefined && this.input) {
      const caret = Math.min(this.pendingCaret, this.input.value.length)
      if (this.input === this.shadowRoot?.activeElement) this.input.setSelectionRange(caret, caret)
    }
    this.pendingCaret = undefined
  }

  private renderPanel() {
    const options = this.options
    const current = this.currentCountry
    const firstRest = options.findIndex((option) => !option.preferred)
    return html`<c2-overlay popover="manual" placement="bottom-start" free-width .anchor=${this.field ?? undefined} .open=${this.open}>
      <div
        class="panel"
        @pointerdown=${(event: Event) => event.target !== this.searchInput && event.preventDefault()}
        @focusin=${this.handleFocusin}
        @focusout=${this.handleFocusout}
      >
        <div class="search">
          <span class="icon" aria-hidden="true">
            <slot name="search-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="m20 20-3.5-3.5"></path>
              </svg>
            </slot>
          </span>
          <input
            class="search-input"
            type="text"
            role="combobox"
            autocomplete="off"
            spellcheck="false"
            aria-label=${this.searchLabel}
            aria-autocomplete="list"
            aria-controls="countries"
            aria-expanded="true"
            aria-activedescendant=${ifDefined(options.length ? `country-${this.activeIndex}` : undefined)}
            placeholder=${this.searchLabel}
            .value=${live(this.search)}
            @input=${this.handleSearchInput}
            @change=${(event: Event) => event.stopPropagation()}
            @keydown=${this.handleSearchKeydown}
          />
        </div>
        <div id="countries" class="list" role="listbox" aria-label=${this.searchLabel}>
          ${
            options.length
              ? options.map(
                  ({ country }, index) =>
                    html`${index === firstRest && index > 0 ? html`<div class="separator" role="separator"></div>` : nothing}
                      <div
                        id=${`country-${index}`}
                        class="option"
                        role="option"
                        data-country=${country.iso}
                        aria-selected=${country === current ? 'true' : 'false'}
                        ?data-active=${index === this.activeIndex}
                        @pointerenter=${() => (this.activeIndex = index)}
                        @click=${() => this.pick(country)}
                      >
                        <span class="flag" aria-hidden="true">${flagEmoji(country.iso)}</span>
                        <span class="option-name">${this.countryName(country)}</span>
                        <span class="option-code">+${country.dialCode}</span>
                      </div>`,
                )
              : html`<div class="empty" role="presentation">${this.emptyLabel}</div>`
          }
        </div>
      </div>
    </c2-overlay>`
  }

  override render() {
    const country = this.currentCountry
    const disabled = this.effectiveDisabled
    const countryName = this.countryName(country)
    // A single allowed country is a fixed prefix: there is nothing to pick.
    const fixed = this.allowedCountries.length === 1
    return html`<div class="field" @click=${this.handleFieldClick} @focusin=${this.handleFocusin} @focusout=${this.handleFocusout}>
        ${
          fixed
            ? html`<span class="country" data-fixed>
                <span class="flag" aria-hidden="true">${flagEmoji(country.iso)}</span>
                <span class="dial-code" aria-hidden="true">+${country.dialCode}</span>
                <span id="country" class="visually-hidden">${`${countryName} (+${country.dialCode})`}</span>
              </span>`
            : html`<button
                class="country"
                type="button"
                aria-haspopup="listbox"
                aria-expanded=${this.open ? 'true' : 'false'}
                aria-label=${`Country: ${countryName} (+${country.dialCode})`}
                ?disabled=${disabled || this.readonly}
                @click=${this.handleCountryClick}
                @keydown=${this.handleCountryKeydown}
              >
                <span class="flag" aria-hidden="true">${flagEmoji(country.iso)}</span>
                <span class="dial-code" aria-hidden="true">+${country.dialCode}</span>
                <span class="icon chevron" aria-hidden="true">
                  <slot name="chevron-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="m6 9 6 6 6-6"></path>
                    </svg>
                  </slot>
                </span>
              </button>`
        }
        <input
          class="input"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          aria-label=${this.ariaLabel || 'Phone number'}
          aria-describedby=${ifDefined(fixed ? 'country' : undefined)}
          aria-invalid=${!!this.significant && !this.valid && this.touched ? 'true' : nothing}
          placeholder=${this.placeholder || this.exampleNumber || nothing}
          .value=${live(this.formatted)}
          ?disabled=${disabled}
          ?readonly=${this.readonly}
          ?required=${this.required}
          @beforeinput=${this.handleBeforeInput}
          @input=${this.handleInput}
          @change=${(event: Event) => redispatchEvent(this, event)}
        />
      </div>
      ${this.open ? this.renderPanel() : nothing}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-phone-input': PhoneInput
  }
}
