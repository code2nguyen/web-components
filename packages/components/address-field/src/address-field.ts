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
 * Changing country keeps the parts both formats share. Required parts and the postal-code pattern are checked when a
 * part is left and when the form is submitted; each part shows its own message, and the form does not submit while
 * one is wrong. With a `name`, the form receives `name[line1]`, `name[city]`, `name[postalCode]`… and `name[country]`.
 *
 * With a `provider`, the first line suggests addresses as it is typed, and picking one fills every part.
 * `@c2n/address-field/providers/google.js` and `/providers/mapbox.js` wrap Google Places and Mapbox, sending what is
 * typed to them; without a provider nothing leaves the page. `formatAddress()` prints a saved address in the country's
 * postal order.
 *
 * The parts are a group named by `label` (or the label of a `c2-form-field` around it), each part with its own label
 * and the browser's `autocomplete` token. Browsers do
 * not autofill fields inside a shadow root, which a provider makes up for.
 *
 * @tag c2-address-field
 *
 * @event {CustomEvent<AddressChangeEventDetail>} address-change - The address changed: `detail.value` and whether it is complete.
 * @event {Event} input - A part changed.
 * @event {Event} change - A part was committed, or a suggestion filled the address.
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

  /** The country to start with, when `value` has none. */
  @property() country = 'US'

  /** The countries offered, as ISO codes; every country with a format when empty. */
  @property({ converter: arrayPropertyConverter }) countries: string[] = []

  /** The form field name: the form receives `name[part]` for each part. */
  @property({ reflect: true }) name = ''

  /** The group's accessible name; "Address" by default. */
  @property() label = ''

  /** The address must be given; otherwise it may be left empty, but once started, the country's required parts are. */
  @property({ type: Boolean, reflect: true }) required = false

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
  private readonly field = new FieldContextConsumer(this, { kind: 'text', selfLabelled: true })
  private defaultValue: AddressValue | null = null
  private resolving: AbortController | null = null

  constructor() {
    super()
    this.addEventListener('invalid', () => (this.showAll = true))
  }

  /** The address, with every part as a string. */
  get address(): AddressValue {
    return normalize(this.value, this.country)
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
    this.value = { ...(this.defaultValue ?? normalize(null, this.country)) }
    this.touched = new Set()
    this.showAll = false
  }

  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.defaultValue ??= normalize(this.value, this.country)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') || changed.has('country')) {
      const next = normalize(this.value, this.country)
      if (JSON.stringify(next) !== JSON.stringify(this.value)) this.value = next
    }
  }

  protected override updated(): void {
    this.syncForm()
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
    const anchor = error ? (this.renderRoot.querySelector<HTMLElement>(`[data-part="${error.part}"]`) ?? undefined) : undefined
    if (!error) this.internals.setValidity({})
    else this.internals.setValidity(error.missing ? { valueMissing: true } : { patternMismatch: true }, error.message, anchor)
  }

  // ------------------------------------------------------------------------------------------------------- edits

  private set(part: AddressPart | 'country', text: string, commit = false): void {
    let next = { ...this.value, [part]: text }
    if (part === 'country') {
      // Keep what both formats share; a listed region does not carry to another country's list.
      const format = addressFormat(text)
      for (const key of PARTS) if (!format.rows.flat().includes(key)) next[key] = ''
      if (format.regions && !format.regions.some(([code]) => code === next.region)) next.region = ''
      if (!format.regions && addressFormat(this.value.country).regions) next.region = ''
      next = normalize(next)
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
    this.resolving?.abort()
    const controller = new AbortController()
    this.resolving = controller
    try {
      const found = await provider.resolve(item.id, { locale: this.msg.locale, signal: controller.signal })
      if (controller.signal.aborted) return
      const country = (found.country || this.value.country).toUpperCase()
      const next = normalize({ ...EMPTY, line2: this.value.line2, ...found, country }, country)
      next.region = regionCode(country, next.region)
      if (!next.line2) next.line2 = this.value.line2
      this.value = next
      this.touched = new Set()
      this.announcement = this.msg.t('filled')
      this.emit(true)
    } catch {
      // The typed text stays; the provider failed or the request was superseded.
    }
  }

  // ------------------------------------------------------------------------------------------------------ render

  private countryCodes(): string[] {
    const codes = (this.countries.length ? this.countries : Object.keys(ADDRESS_FORMATS)).map((code) => code.toUpperCase())
    if (this.value.country && !codes.includes(this.value.country)) codes.push(this.value.country)
    let names: Intl.DisplayNames | null = null
    try {
      names = new Intl.DisplayNames([this.msg.locale], { type: 'region' })
    } catch {
      names = null
    }
    const name = (code: string) => names?.of(code) ?? code
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
        .dataSource=${(query: string, signal: AbortSignal) =>
          this.provider ? this.provider.suggest(query, { country: this.value.country, locale: this.msg.locale, signal }) : []}
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
    return html`<c2-form-field class="part" label=${label} error-text=${error?.message ?? ''} necessity="none">${control}</c2-form-field>`
  }

  override render() {
    const format = addressFormat(this.value.country)
    const disabled = this.disabled || this.formDisabled
    return html`<div
        class="address"
        part="address"
        role="group"
        aria-label=${this.label || this.field.label || this.msg.t('addressGroup')}
        aria-describedby=${this.field.describedBy()}
      >
        <c2-form-field class="part" label=${this.msg.t('country')} necessity="none">
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
        </c2-form-field>
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
