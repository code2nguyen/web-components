import { LitElement, html, isServer, nothing, unsafeCSS } from 'lit'
import { classMap } from 'lit/directives/class-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { resolveLocale } from '@c2n/core/locale-helper.js'
import { LocaleController } from '@c2n/core/localize.js'
import styles from './format-number.scss?inline'

/** What the number is: a plain `decimal`, an amount of `currency`, a `percent` of a ratio, a measure in a `unit`, or a size in `bytes`. */
export type FormatNumberType = 'decimal' | 'currency' | 'percent' | 'unit' | 'bytes'

/** `compact` shortens to "1.2K" or "1.2 thousand"; `scientific` and `engineering` write an exponent. */
export type FormatNumberNotation = 'standard' | 'scientific' | 'engineering' | 'compact'

export type FormatNumberCompactDisplay = 'short' | 'long'

/** How a currency is named: "$", "US$", "USD" or "US dollars". */
export type FormatNumberCurrencyDisplay = 'symbol' | 'narrowSymbol' | 'code' | 'name'

/** `accounting` writes a negative amount in parentheses where the locale does: "($1,234.00)". */
export type FormatNumberCurrencySign = 'standard' | 'accounting'

/** How a unit is named: "5 km/h", "5km/h" or "5 kilometers per hour". */
export type FormatNumberUnitDisplay = 'short' | 'narrow' | 'long'

/** When to show the sign: `exceptZero` and `always` add a "+", `negative` hides it on -0, `never` drops it. */
export type FormatNumberSignDisplay = 'auto' | 'never' | 'always' | 'exceptZero' | 'negative'

export interface FormatNumberOptions {
  locale?: string
  type?: FormatNumberType
  notation?: FormatNumberNotation
  compactDisplay?: FormatNumberCompactDisplay
  currency?: string
  currencyDisplay?: FormatNumberCurrencyDisplay
  currencySign?: FormatNumberCurrencySign
  /** A unit `Intl.NumberFormat` knows (`kilometer-per-hour`, `celsius`); for `bytes`, `byte` or `bit`. */
  unit?: string
  unitDisplay?: FormatNumberUnitDisplay
  signDisplay?: FormatNumberSignDisplay
  /** `false` drops the thousands separators. */
  useGrouping?: boolean
  /** `bytes` only: steps of 1024 instead of 1000, still labelled kB, MB… as Windows does. */
  binary?: boolean
  minimumIntegerDigits?: number
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  minimumSignificantDigits?: number
  maximumSignificantDigits?: number
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte']
const BIT_UNITS = ['bit', 'kilobit', 'megabit', 'gigabit', 'terabit', 'petabit']

/** Reads a number, or a numeric string such as `"1234.5"` or `"-1e6"`; anything else (blank, `"abc"`, `NaN`) is `undefined`. */
export function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(number) ? undefined : number
}

/** Scales a byte (or bit) count to the largest unit that keeps it at or above 1: `1536` is `1.5` `kilobyte`. */
export function scaleBytes(value: number, binary = false, maximumFractionDigits = 1): { value: number; index: number } {
  const base = binary ? 1024 : 1000
  const abs = Math.abs(value)
  if (!Number.isFinite(abs) || abs < base) return { value, index: 0 }
  let index = Math.min(Math.floor(Math.log(abs) / Math.log(base)), BYTE_UNITS.length - 1)
  // 999,999 bytes round to "1,000 kB": step up when rounding reaches the next unit.
  const round = (n: number) => Number(n.toFixed(Math.min(Math.max(maximumFractionDigits, 0), 20)))
  if (index < BYTE_UNITS.length - 1 && round(abs / base ** index) >= base) index += 1
  return { value: value / base ** index, index }
}

/** The `Intl.NumberFormatOptions` that `options` describe, with `value` already scaled for `bytes`. */
export function numberFormatOptions(value: number, options: FormatNumberOptions = {}): { value: number; options: Intl.NumberFormatOptions } {
  const { type = 'decimal' } = options
  const intl: Intl.NumberFormatOptions = {
    notation: options.notation,
    compactDisplay: options.compactDisplay,
    // TypeScript's lib predates `negative`, which every current engine supports.
    signDisplay: options.signDisplay as Intl.NumberFormatOptions['signDisplay'],
    useGrouping: options.useGrouping === false ? false : undefined,
    minimumIntegerDigits: options.minimumIntegerDigits,
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits,
    minimumSignificantDigits: options.minimumSignificantDigits,
    maximumSignificantDigits: options.maximumSignificantDigits,
  }
  if (type === 'currency') {
    Object.assign(intl, {
      style: 'currency',
      currency: options.currency || 'USD',
      currencyDisplay: options.currencyDisplay,
      currencySign: options.currencySign,
    })
  } else if (type === 'percent') {
    intl.style = 'percent'
  } else if (type === 'unit' && options.unit) {
    Object.assign(intl, { style: 'unit', unit: options.unit, unitDisplay: options.unitDisplay })
  } else if (type === 'bytes') {
    const fraction = options.maximumFractionDigits ?? (options.maximumSignificantDigits === undefined ? 1 : 20)
    const scaled = scaleBytes(value, options.binary, fraction)
    const units = options.unit === 'bit' ? BIT_UNITS : BYTE_UNITS
    Object.assign(intl, { style: 'unit', unit: units[scaled.index], unitDisplay: options.unitDisplay })
    // One decimal by default, never more than the value has: "1.5 kB", "2 MB", "512 byte".
    if (options.maximumFractionDigits === undefined && options.maximumSignificantDigits === undefined) {
      intl.maximumFractionDigits = Math.max(1, options.minimumFractionDigits ?? 0)
    }
    value = scaled.value
  }
  for (const key of Object.keys(intl) as (keyof Intl.NumberFormatOptions)[]) if (intl[key] === undefined) delete intl[key]
  return { value, options: intl }
}

/**
 * Formats `value` with `Intl.NumberFormat`: grouping and decimals of the locale, currency, percent, units, compact
 * notation, and byte sizes scaled to the largest unit that fits. An option the browser rejects (an unknown currency
 * code or unit) falls back to a plain decimal rather than throwing.
 */
export function formatNumber(value: number, options: FormatNumberOptions = {}): string {
  return formatNumberToParts(value, options)
    .map((part) => part.value)
    .join('')
}

/** {@link formatNumber}, split into the parts `Intl.NumberFormat#formatToParts` names: `integer`, `currency`, `unit`, `compact`… */
export function formatNumberToParts(value: number, options: FormatNumberOptions = {}): Intl.NumberFormatPart[] {
  const locale = resolveLocale(options.locale)
  try {
    const resolved = numberFormatOptions(value, options)
    return new Intl.NumberFormat(locale, resolved.options).formatToParts(resolved.value)
  } catch {
    try {
      return new Intl.NumberFormat(locale).formatToParts(value)
    } catch {
      // An invalid locale as well.
      return new Intl.NumberFormat('en-US').formatToParts(value)
    }
  }
}

// The parts that name what the number counts rather than its digits; they render in `part="unit"`.
const UNIT_PARTS = new Set<string>(['currency', 'unit', 'percentSign', 'compact'])

/**
 * A number formatted for its reader: grouping and decimals of the locale, an amount of money, a percentage, a measure,
 * a compact count ("1.2K") or a byte size ("1.5 MB"). The text comes from `Intl.NumberFormat` in the element's
 * `locale` (else the nearest `lang` attribute, which it follows as soon as it changes, else the browser's language), so
 * the same markup reads "1,234.5" in English and "1 234,5" in French.
 *
 * `value` takes a number, or a numeric string in markup. Until it holds a valid number the element shows its default
 * slot, for a fallback such as "—". The digits sit in a `<data>` element whose `value` is the raw number; a shortened
 * display (compact notation, a byte size) carries the full figure as its hover title. The currency symbol, unit,
 * percent sign and compact suffix are wrapped in `part="unit"`, so they can be set smaller or lighter than the digits,
 * and a negative or positive value takes its own colour, for profit and loss.
 *
 * @tag c2-format-number
 *
 * @slot - Fallback content shown while `value` is unset or not a number.
 *
 * @csspart number - The `<data>` element holding the formatted number, with the raw value as its `value`.
 * @csspart unit - Each currency symbol, unit name, percent sign or compact suffix ("K", "million") inside the number.
 *
 * @cssproperty {color} [--c2-format-number--color=inherit] - Colour of the number; inherits the surrounding text colour.
 * @cssproperty {font-size} [--c2-format-number--font-size=inherit] - Size of the number.
 * @cssproperty {font-weight} [--c2-format-number--font-weight=inherit] - Weight of the number.
 * @cssproperty {string} [--c2-format-number--font-variant-numeric=tabular-nums] - Digit style; tabular digits keep numbers aligned in a column.
 * @cssproperty {string} [--c2-format-number--white-space=nowrap] - Whether the number may wrap, for a long unit name.
 * @cssproperty {color} [--c2-format-number__negative--color=inherit] - Colour of a value below zero, such as a loss.
 * @cssproperty {color} [--c2-format-number__positive--color=inherit] - Colour of a value above zero, such as a gain.
 * @cssproperty {color} [--c2-format-number__unit--color=inherit] - Colour of the currency symbol, unit, percent sign or compact suffix.
 * @cssproperty {font-size} [--c2-format-number__unit--font-size=inherit] - Size of the currency symbol, unit, percent sign or compact suffix.
 * @cssproperty {font-weight} [--c2-format-number__unit--font-weight=inherit] - Weight of the currency symbol, unit, percent sign or compact suffix.
 */
@customElement('c2-format-number')
export class FormatNumber extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The number to format: a number from script, or a numeric string such as `1234.5` in markup. */
  @property() value: number | string | undefined = undefined

  /** `decimal`, `currency` (with `currency`), `percent` (0.25 reads "25%"), `unit` (with `unit`) or `bytes` (1536 reads "1.5 kB"). */
  @property() type: FormatNumberType = 'decimal'

  /** `standard`, `compact` ("1.2K"), `scientific` ("1.2E3") or `engineering`. */
  @property() notation: FormatNumberNotation = 'standard'

  /** Length of the compact suffix: `short` ("1.2K") or `long` ("1.2 thousand"). */
  @property({ attribute: 'compact-display' }) compactDisplay: FormatNumberCompactDisplay = 'short'

  /** ISO 4217 currency code for `type="currency"`, such as `EUR` or `JPY`; its own decimals are used. */
  @property() currency = 'USD'

  /** How the currency is named: `symbol` ("$"), `narrowSymbol`, `code` ("USD") or `name` ("US dollars"). */
  @property({ attribute: 'currency-display' }) currencyDisplay: FormatNumberCurrencyDisplay = 'symbol'

  /** `accounting` writes a negative amount in parentheses where the locale does. */
  @property({ attribute: 'currency-sign' }) currencySign: FormatNumberCurrencySign = 'standard'

  /** For `type="unit"`, a unit `Intl.NumberFormat` knows (`kilometer-per-hour`, `celsius`, `liter`); for `type="bytes"`, `byte` (default) or `bit`. */
  @property() unit = ''

  /** How the unit is named: `short` ("5 km/h"), `narrow` ("5km/h") or `long` ("5 kilometers per hour"). */
  @property({ attribute: 'unit-display' }) unitDisplay: FormatNumberUnitDisplay = 'short'

  /** When to show the sign: `auto`, `always`, `exceptZero` (a "+" on gains, none on zero), `negative` or `never`. */
  @property({ attribute: 'sign-display' }) signDisplay: FormatNumberSignDisplay = 'auto'

  /** Drop the thousands separators, for years, IDs and codes. */
  @property({ type: Boolean, attribute: 'no-grouping' }) noGrouping = false

  /** For `type="bytes"`, steps of 1024 instead of 1000, still labelled kB, MB… as Windows does. */
  @property({ type: Boolean }) binary = false

  /** Pad the integer part with leading zeros to this many digits (1–21). */
  @property({ type: Number, attribute: 'minimum-integer-digits' }) minimumIntegerDigits: number | undefined = undefined

  /** Fewest decimals to show (0–100); pads with zeros. */
  @property({ type: Number, attribute: 'minimum-fraction-digits' }) minimumFractionDigits: number | undefined = undefined

  /** Most decimals to show (0–100); rounds the rest. */
  @property({ type: Number, attribute: 'maximum-fraction-digits' }) maximumFractionDigits: number | undefined = undefined

  /** Fewest significant digits (1–21); takes precedence over the fraction digits. */
  @property({ type: Number, attribute: 'minimum-significant-digits' }) minimumSignificantDigits: number | undefined = undefined

  /** Most significant digits (1–21); takes precedence over the fraction digits. */
  @property({ type: Number, attribute: 'maximum-significant-digits' }) maximumSignificantDigits: number | undefined = undefined

  /** BCP 47 locale of the number. Empty uses the nearest `lang` attribute, then the browser's language. */
  @property() locale = ''

  /** `locale`, else the nearest `lang`, else the browser's language; a `lang` change redraws the number at once. */
  readonly #language = new LocaleController(this, () => this.locale)

  get #locale(): string {
    return isServer ? resolveLocale(this.locale) : this.#language.locale
  }

  /** The options this element's attributes describe, for {@link formatNumber}. */
  get formatOptions(): FormatNumberOptions {
    return {
      locale: this.#locale,
      type: this.type,
      notation: this.notation,
      compactDisplay: this.compactDisplay,
      currency: this.currency,
      currencyDisplay: this.currencyDisplay,
      currencySign: this.currencySign,
      unit: this.unit || undefined,
      unitDisplay: this.unitDisplay,
      signDisplay: this.signDisplay,
      useGrouping: !this.noGrouping,
      binary: this.binary,
      minimumIntegerDigits: digits(this.minimumIntegerDigits),
      minimumFractionDigits: digits(this.minimumFractionDigits),
      maximumFractionDigits: digits(this.maximumFractionDigits),
      minimumSignificantDigits: digits(this.minimumSignificantDigits),
      maximumSignificantDigits: digits(this.maximumSignificantDigits),
    }
  }

  override render() {
    const value = toNumber(this.value)
    if (value === undefined) return html`<slot></slot>`
    const options = this.formatOptions
    const parts = formatNumberToParts(value, options)
    // A shortened display carries the whole figure on hover: "1.2M" → "1,234,567", "1.5 MB" → "1,536,000 bytes".
    const title = options.notation === 'compact' || options.type === 'bytes' ? fullFigure(value, options) : undefined
    return html`<data part="number" class=${classMap({ negative: value < 0, positive: value > 0 })} value=${String(value)} title=${title ?? nothing}
      >${parts.map((part) => (UNIT_PARTS.has(part.type) ? html`<span part="unit">${part.value}</span>` : part.value))}</data
    >`
  }
}

/** An unset or non-numeric digit count (a removed attribute reads as `null`, a blank one as `NaN`) leaves the `Intl` default. */
function digits(value: number | null | undefined): number | undefined {
  return value === undefined || value === null || Number.isNaN(value) ? undefined : value
}

/** `value` in standard notation with every digit, a byte size counted in bytes (or bits) rather than scaled. */
function fullFigure(value: number, options: FormatNumberOptions): string {
  const bytes = options.type === 'bytes'
  return formatNumber(value, {
    locale: options.locale,
    type: bytes ? 'unit' : options.type,
    unit: bytes ? (options.unit === 'bit' ? 'bit' : 'byte') : options.unit,
    unitDisplay: bytes ? 'long' : options.unitDisplay,
    currency: options.currency,
    currencyDisplay: options.currencyDisplay,
    currencySign: options.currencySign,
    signDisplay: options.signDisplay,
    maximumFractionDigits: options.type === 'percent' ? 20 : undefined,
  })
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-format-number': FormatNumber
  }
}
