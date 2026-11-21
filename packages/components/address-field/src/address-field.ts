import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/form-field'
import '@c2n/text-field'
import '@c2n/select'
import '@c2n/list-item'
import '@c2n/autocomplete'
import { ADDRESS_FORMATS, addressFormat, regionCode, type AddressPart, type AddressValue } from './formats.js'
import type { AddressProvider, AddressSuggestion } from './provider.js'
import { addressFieldMessages } from './messages.js'
import styles from './address-field.scss?inline'

export * from './formats.js'
export * from './provider.js'

export interface AddressChangeEventDetail {
  value: AddressValue
  /** Whether every part the country needs is filled and valid. */
  complete: boolean
}

/** Events fired by {@link AddressField}, keyed for `addEventListener`. */
export interface AddressFieldEventMap {
  'address-change': CustomEvent<AddressChangeEventDetail>
  input: Event
  change: Event
}

export interface AddressField {
  addEventListener: TypedAddEventListener<AddressField, AddressFieldEventMap>
  removeEventListener: TypedRemoveEventListener<AddressField, AddressFieldEventMap>
}

const EMPTY: AddressValue = { line1: '', line2: '', city: '', district: '', region: '', postalCode: '', country: '' }
const PARTS: AddressPart[] = ['line1', 'line2', 'city', 'district', 'region', 'postalCode']
const AUTOCOMPLETE: Record<AddressPart, string> = {
  line1: 'address-line1',
  line2: 'address-line2',
  city: 'address-level2',
  district: 'address-level3',
  region: 'address-level1',
  postalCode: 'postal-code',
}

/** Moves an address to another country: keeps the parts both formats share, and a region only when the new format accepts it. */
function moveTo(value: AddressValue, from: string, to: string): AddressValue {
  const next: AddressValue = { ...value, country: to }
  const format = addressFormat(to)
  for (const key of PARTS) if (!format.rows.flat().includes(key)) next[key] = ''
  if (format.regions && !format.regions.some(([code]) => code === next.region)) next.region = ''
  if (!format.regions && addressFormat(from).regions) next.region = ''
  return next
}

/** An address value from anything an app may hand over: missing parts are empty strings. */
function normalize(value: Partial<AddressValue> | null | undefined, country = ''): AddressValue {
  const next = { ...EMPTY, ...(value && typeof value === 'object' ? value : {}) }
  for (const key of Object.keys(EMPTY) as (keyof AddressValue)[]) next[key] = typeof next[key] === 'string' ? next[key] : String(next[key] ?? '')
  next.country = (next.country || country).toUpperCase()
  return next
}

/**
 * A postal address input that shows the parts each country's format needs, in its order, with its labels: a ZIP code
 * and a state for the United States, a postcode and an optional county for the United Kingdom, postal code and
 * prefecture first for Japan. About 40 countries have a format of their own; any other gets a general one.
 *
 * The country picker lists the countries with a format (`countries` changes the list), named in the page's language.
 * With a single entry in `countries` (`countries="FR"`), the address is for that country only: there is no picker, and
 * a value naming another country is moved to it (keeping the parts both formats share), and a suggestion from another
 * country is not taken.
 * Changing country keeps the parts both formats share. Required parts and the postal-code pattern are checked when a
 * part is left and when the form is submitted; each part shows its own message, and the form does not submit while
 * one is wrong. With a `name`, the form receives `name[line1]`, `name[city]`, `name[postalCode]`… and `name[country]`.
 *
 * With a `provider`, the first line suggests addresses as it is typed, and picking one fills every part.
 * `googlePlacesProvider` and `mapboxSearchProvider`, exported with the element, wrap Google Places and Mapbox,
 * sending what is typed to them; without a provider nothing leaves the page. `formatAddress()` prints a saved address
 * in the country's postal order.
 *
 * The parts are a group named by `label` (or the label of a `c2-form-field` around it), each part with its own label
 * and the browser's `autocomplete` token. Browsers do
 * not autofill fields inside a shadow root, which a provider makes up for.
 *
 * @tag c2-address-field
 *
 * @event {CustomEvent<AddressChangeEventDetail>} address-change - The address changed: `detail.value` and whether it is complete.
 * @event {Event} input - A part changed.
 * @event {Event} change - A part was committed, a suggestion filled the address, or a change to `countries` moved a filled address to its one country.
 *
 * @csspart address - The grid of parts.
 * @csspart row - A row of parts.
 *
 * @cssproperty {length} [--c2-address-field--width=100%] - The field's width; its rows wrap to one part each when narrow.
 * @cssproperty {length} [--c2-address-field--gap=12px] - Space between parts on a row.
 * @cssproperty {length} [--c2-address-field--row-gap=12px] - Space between rows.
 * @cssproperty {length} [--c2-address-field__part--min-width=120px] - A row wraps when its parts would be narrower.
 */
@customElement('c2-address-field')
export class AddressField extends LitElement {
  static override styles = unsafeCSS(styles)
  static formAssociated = true

  /** The address. Set it as an object, or as JSON on the attribute. */
  @property({ converter: jsonPropertyConverter }) value: AddressValue = { ...EMPTY }

  /** The country to start with, when `value` has none. Ignored when `countries` holds a single code, which is then the country. */
  @property() country = 'US'

  /**
   * The countries offered, as ISO codes; every country with a format when empty. With one code, the field is fixed to
   * that country and shows no country picker.
   */
  @property({ converter: arrayPropertyConverter }) countries: string[] = []

  /** The form field name: the form receives `name[part]` for each part. */
  @property({ reflect: true }) name = ''

  /** The group's accessible name; "Address" by default, or "Address (France)" in a field fixed to one country. */
  @property() label = ''

  /** The address must be given; otherwise it may be left empty, but once started, the country's required parts are. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns every part off; a disabled address is not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** An address search service for the first line. */
  @property({ attribute: false }) provider: AddressProvider | undefined = undefined

  @state() private touched = new Set<AddressPart>()
  @state() private showAll = false
  @state() private formDisabled = false
  @state() private announcement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, addressFieldMessages)
  /** In a `c2-form-field`, its label names the group and its hint and error describe it. */
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  /** The value the element connected with: a reset moves it again to the country `countries` fixes then, if any. */
  private defaultValue: AddressValue | null = null
  /** Set when a change to `countries` moved the address, so the app hears of it once the update is done. */
  private movedByCountries = false
  /** One function for the autocomplete: a new one each render would cancel its request and reload it. */
  private readonly suggest = (query: string, signal: AbortSignal) =>
    this.provider ? this.provider.suggest(query, { country: this.value.country, locale: this.msg.locale, signal }) : []
  private resolving: AbortController | null = null
  /** The pick in progress: the suggestion's id and the text typed before it. */
  private picking: { id: string; typed: string } | null = null

  constructor() {
    super()
    this.addEventListener('invalid', () => (this.showAll = true))
  }

  /** The address, with every part as a string. */
  get address(): AddressValue {
    return this.normalized(this.value)
  }

  /** Whether every part the country needs is filled and valid. */
  get complete(): boolean {
    return !this.errors(true).length
  }

  get form(): HTMLFormElement | null {
    return this.internals.form
  }

  get validity(): ValidityState {
    return this.internals.validity
  }

  get validationMessage(): string {
    return this.internals.validationMessage
  }

  checkValidity(): boolean {
    return this.internals.checkValidity()
  }

  reportValidity(): boolean {
    this.showAll = true
    return this.internals.reportValidity()
  }

  formResetCallback(): void {
    this.value = this.normalized(this.defaultValue)
    this.touched = new Set()
    this.showAll = false
  }

  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  /** Back/forward cache and autofill restore: the state is the value as JSON, as `syncForm` stores it. */
  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state !== 'string' || !state) return
    try {
      this.value = this.normalized(JSON.parse(state) as Partial<AddressValue>)
    } catch {
      // Not state this element wrote: keep the current value.
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.defaultValue ??= normalize(this.value, this.country)
  }

  /** The one country the field is fixed to, when `countries` lists exactly one two-letter code; otherwise empty. */
  private get fixedCountry(): string {
    const codes = this.countryList()
    if (codes.length !== 1) return ''
    if (/^[A-Z]{2}$/.test(codes[0])) return codes[0]
    if (!this.warnedCode) {
      this.warnedCode = true
      console.warn(`c2-address-field: countries="${codes[0]}" is not a two-letter country code; separate codes with ";".`)
    }
    return ''
  }

  private warnedCode = false

  /** `countries` as upper-case codes, without blanks or repeats. */
  private countryList(): string[] {
    return [...new Set((this.countries ?? []).map((code) => String(code).trim().toUpperCase()).filter(Boolean))]
  }

  /**
   * A value as the field holds it: every part a string, the starting country when it has none, and in a field fixed to
   * one country, moved to it. Like a value with no country, one naming another is corrected without an event, as any
   * value set by code.
   */
  private normalized(value: Partial<AddressValue> | null | undefined): AddressValue {
    const fixed = this.fixedCountry
    const next = normalize(value, fixed || this.country)
    // Always moved, so a value with no country and one naming another both lose the parts the format has no field for.
    return fixed ? moveTo(next, next.country, fixed) : next
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') || changed.has('country') || changed.has('countries')) {
      const next = this.normalized(this.value)
      if (JSON.stringify(next) !== JSON.stringify(this.value)) {
        // The app set neither this value nor a new one: the field's own country list moved it, so it reports the edit.
        if (this.hasUpdated && changed.has('countries') && !changed.has('value') && next.country !== this.value.country) {
          // Checked against the new format, as when the user picks a country.
          this.touched = new Set()
          this.showAll = false
          // An empty field has nothing to report.
          this.movedByCountries = this.filled()
        }
        this.value = next
      }
    }
  }

  protected override updated(): void {
    this.syncForm()
    if (this.movedByCountries) {
      this.movedByCountries = false
      this.emit(true)
    }
  }

  // ----------------------------------------------------------------------------------------------------- validity

  private labelOf(part: AddressPart): string {
    const key = addressFormat(this.value.country).labels[part] ?? 'address'
    return this.msg.t(key)
  }

  private filled(): boolean {
    return PARTS.some((part) => this.value[part].trim())
  }

  /** The parts that are wrong, in the order shown. `all` checks every required part, touched or not. */
  private errors(all = false): { part: AddressPart; message: string; missing: boolean }[] {
    const format = addressFormat(this.value.country)
    const enforce = this.required || this.filled()
    const errors: { part: AddressPart; message: string; missing: boolean }[] = []
    for (const part of format.rows.flat()) {
      if (!all && !this.showAll && !this.touched.has(part)) continue
      const text = this.value[part].trim()
      if (!text && enforce && format.required.includes(part)) errors.push({ part, message: this.msg.t('required', this.labelOf(part)), missing: true })
      else if (text && part === 'postalCode' && format.postal && !format.postal.pattern.test(text)) {
        errors.push({ part, message: this.msg.t('postalInvalid', this.labelOf(part), format.postal.example), missing: false })
      }
    }
    return errors
  }

  private syncForm(): void {
    const format = addressFormat(this.value.country)
    if (!this.name || this.disabled || this.formDisabled || !this.filled()) this.internals.setFormValue(null)
    else {
      const data = new FormData()
      for (const part of format.rows.flat()) data.append(`${this.name}[${part}]`, this.value[part])
      data.append(`${this.name}[country]`, this.value.country)
      this.internals.setFormValue(data, JSON.stringify(this.value))
    }
    const [error] = this.errors(true)
    // The validation anchor is a plain element of ours, never a part's host: WebKit's own validation bubble (Linux) is
    // built in a shadow root it adds to the anchor, which on a component with a shadow root of its own blanks it.
    const anchor = error ? (this.renderRoot.querySelector<HTMLElement>(`[data-anchor="${error.part}"]`) ?? undefined) : undefined
    if (!error) this.internals.setValidity({})
    else this.internals.setValidity(error.missing ? { valueMissing: true } : { patternMismatch: true }, error.message, anchor)
  }

  // ------------------------------------------------------------------------------------------------------- edits

  private set(part: AddressPart | 'country', text: string, commit = false): void {
    let next = { ...this.value, [part]: text }
    if (part === 'country') {
      // Keep what both formats share; a listed region does not carry to another country's list.
      next = normalize(moveTo(this.value, this.value.country, text))
      this.touched = new Set()
    }
    this.value = next
    this.emit(commit || part === 'country' || part === 'region')
  }

  private emit(commit: boolean): void {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    if (commit) this.dispatchEvent(new Event('change', { bubbles: true }))
    this.dispatchEvent(
      new CustomEvent<AddressChangeEventDetail>('address-change', {
        detail: { value: { ...this.value }, complete: this.complete },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private touch(part: AddressPart): void {
    if (this.touched.has(part)) return
    this.touched = new Set([...this.touched, part])
  }

  /** Fills the address from a suggestion. */
  private async pick(item: AddressSuggestion): Promise<void> {
    const provider = this.provider
    if (!provider || !item?.id) return
    // The text typed before the pick: `suggestion-select` comes before the autocomplete writes the suggestion's id. While
    // an earlier pick is pending, the line holds that pick's id, so its typed text is the one to keep.
    const before = this.picking && this.value.line1 === this.picking.id ? this.picking.typed : this.value.line1
    const picking = { id: item.id, typed: before }
    this.picking = picking
    // The autocomplete wrote the suggestion's id on the line: put back what was typed, unless the user typed since.
    const restore = () => {
      if (this.value.line1 === item.id) this.set('line1', before)
    }
    this.resolving?.abort()
    const controller = new AbortController()
    this.resolving = controller
    try {
      // After the autocomplete has written the id, so a provider that throws at once is restored like one that rejects.
      await Promise.resolve()
      if (controller.signal.aborted) return
      const found = await provider.resolve(item.id, { locale: this.msg.locale, signal: controller.signal })
      if (controller.signal.aborted) return
      const country = (found.country || this.value.country).toUpperCase()
      // A field fixed to one country takes no address from another: the typed text stays, and the user is told why.
      const fixed = this.fixedCountry
      if (fixed && country !== fixed) {
        restore()
        // Cleared first, so the same text is read again for a second refusal; skipped if a newer pick took over.
        this.announcement = ''
        await this.updateComplete
        if (this.resolving === controller) this.announcement = this.msg.t('otherCountry', this.countryName(fixed))
        return
      }
      const next = normalize({ ...EMPTY, line2: this.value.line2, ...found, country }, country)
      next.region = regionCode(country, next.region)
      if (!next.line2) next.line2 = this.value.line2
      this.value = next
      this.touched = new Set()
      this.announcement = this.msg.t('filled')
      this.emit(true)
    } catch {
      // The provider failed or the request was superseded: the typed text stays.
      if (!controller.signal.aborted) restore()
    } finally {
      if (this.picking === picking) this.picking = null
    }
  }

  // ------------------------------------------------------------------------------------------------------ render

  private countryCodes(): string[] {
    const list = this.countryList()
    const codes = list.length ? list : Object.keys(ADDRESS_FORMATS)
    if (this.value.country && !codes.includes(this.value.country)) codes.push(this.value.country)
    let names: Intl.DisplayNames | null = null
    try {
      names = new Intl.DisplayNames([this.msg.locale], { type: 'region' })
    } catch {
      names = null
    }
    const name = (code: string) => {
      try {
        return names?.of(code) ?? code
      } catch {
        // Not a region code (a typo in `countries`): show it as written.
        return code
      }
    }
    return [...new Set(codes)].sort((a, b) => name(a).localeCompare(name(b), this.msg.locale))
  }

  private countryName(code: string): string {
    try {
      return new Intl.DisplayNames([this.msg.locale], { type: 'region' }).of(code) ?? code
    } catch {
      return code
    }
  }

  private renderPart(part: AddressPart) {
    const format = addressFormat(this.value.country)
    const required = format.required.includes(part)
    const label = required ? this.labelOf(part) : this.msg.t('optional', this.labelOf(part))
    const error = this.errors().find((entry) => entry.part === part)
    // Inside a c2-form-field that shows the message, the parts keep only the error look.
    const message = this.field.managed ? '' : (error?.message ?? '')
    const invalid = !!error || this.field.invalid
    const disabled = this.disabled || this.formDisabled
    const value = this.value[part]
    const stop = (event: Event) => event.stopPropagation()
    let control
    if (part === 'region' && format.regions) {
      control = html`<c2-select
        data-part=${part}
        placeholder=${this.msg.t('select')}
        .value=${value ? [value] : []}
        ?disabled=${disabled}
        @input=${stop}
        @change=${stop}
        @selection-change=${(event: CustomEvent<{ value: string[] }>) => {
          this.touch(part)
          this.set(part, event.detail.value[0] ?? '', true)
        }}
      >
        ${format.regions.map(([code, name]) => html`<c2-list-item value=${code}>${name}</c2-list-item>`)}
      </c2-select>`
    } else if (part === 'line1' && this.provider) {
      control = html`<c2-autocomplete
        data-part=${part}
        .value=${value}
        ?disabled=${disabled}
        item-key="id"
        label-field="label"
        description-field="description"
        min-query-length="3"
        .dataSource=${this.suggest}
        @input=${(event: Event) => {
          event.stopPropagation()
          this.set(part, (event.currentTarget as HTMLInputElement).value)
        }}
        @change=${stop}
        @focusout=${() => this.touch(part)}
        @suggestion-select=${(event: CustomEvent<{ item: AddressSuggestion }>) => this.pick(event.detail.item)}
      ></c2-autocomplete>`
    } else {
      control = html`<c2-text-field
        data-part=${part}
        .value=${value}
        autocomplete=${AUTOCOMPLETE[part]}
        ?error=${invalid}
        ?disabled=${disabled}
        @input=${(event: Event) => {
          event.stopPropagation()
          this.set(part, (event.currentTarget as HTMLInputElement).value)
        }}
        @change=${(event: Event) => {
          event.stopPropagation()
          this.emit(true)
        }}
        @focusout=${() => this.touch(part)}
      ></c2-text-field>`
    }
    return html`<c2-form-field class="part" label=${label} error-text=${message} necessity="none"
      >${control}<span class="anchor" data-anchor=${part}></span
    ></c2-form-field>`
  }

  private renderCountry(disabled: boolean) {
    return html`<c2-form-field class="part" label=${this.msg.t('country')} necessity="none">
      <c2-select
        data-part="country"
        .value=${[this.value.country]}
        ?disabled=${disabled}
        @input=${(event: Event) => event.stopPropagation()}
        @change=${(event: Event) => event.stopPropagation()}
        @selection-change=${(event: CustomEvent<{ value: string[] }>) => {
          const code = event.detail.value[0]
          if (code && code !== this.value.country) this.set('country', code, true)
        }}
      >
        ${this.countryCodes().map((code) => html`<c2-list-item value=${code}>${this.countryName(code)}</c2-list-item>`)}
      </c2-select>
    </c2-form-field>`
  }

  override render() {
    const format = addressFormat(this.value.country)
    const disabled = this.disabled || this.formDisabled
    return html`<div
        class="address"
        part="address"
        role="group"
        aria-label=${this.label || this.field.label || (this.fixedCountry ? this.msg.t('addressIn', this.countryName(this.fixedCountry)) : this.msg.t('addressGroup'))}
        aria-describedby=${this.field.describedBy()}
      >
        ${this.fixedCountry ? nothing : this.renderCountry(disabled)}
        ${format.rows.map((row) => html`<div class="row" part="row" style="--_parts: ${row.length}">${row.map((part) => this.renderPart(part))}</div>`)}
      </div>
      ${this.field.renderDescription()}
      <div class="announcement" role="status">${this.announcement || nothing}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-address-field': AddressField
  }
}
