/** How a locale writes an amount of a currency: separators, minor-unit digits and where the symbol goes. */
export interface MoneyFormat {
  /** Decimal separator (`.` in `en-US`, `,` in `de-DE`). */
  decimal: string
  /** Grouping separator (`,` in `en-US`, `.` in `de-DE`, a narrow no-break space in `fr-FR`). */
  group: string
  /** Digits after the decimal separator: 2 for USD, 0 for JPY, 3 for KWD. */
  fractionDigits: number
  /** The currency as the locale writes it next to an amount (`$`, `€`, `CA$`, `USD`). */
  symbol: string
  /** Whether the symbol comes before the number in this locale. */
  symbolFirst: boolean
}

/** What a typed or pasted text means: a sign, integer digits and fraction digits. */
export interface ParsedAmount {
  negative: boolean
  integer: string
  fraction: string
  /** The text holds a decimal separator, so the fraction is being typed even while it is empty. */
  hasDecimal: boolean
}

export type CurrencyDisplay = 'symbol' | 'narrowSymbol' | 'code'

const formats = new Map<string, MoneyFormat>()

/** Upper-cased ISO 4217 code, or `USD` for anything `Intl` does not accept as a currency. */
export function normalizeCurrency(currency: string | null | undefined): string {
  const code = String(currency ?? '')
    .trim()
    .toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return 'USD'
  return code
}

/** The separators, minor-unit digits and symbol `locale` uses for `currency`; cached per combination. */
export function moneyFormat(locale: string, currency: string, display: CurrencyDisplay = 'symbol'): MoneyFormat {
  const key = `${locale}|${currency}|${display}`
  const cached = formats.get(key)
  if (cached) return cached
  let formatter: Intl.NumberFormat
  try {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: display, numberingSystem: 'latn' } as Intl.NumberFormatOptions)
  } catch {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencyDisplay: display })
  }
  const parts = formatter.formatToParts(1234567.5)
  const find = (type: string) => parts.find((part) => part.type === type)?.value
  const currencyIndex = parts.findIndex((part) => part.type === 'currency')
  const integerIndex = parts.findIndex((part) => part.type === 'integer')
  const format: MoneyFormat = {
    decimal: find('decimal') ?? '.',
    group: find('group') ?? ',',
    fractionDigits: formatter.resolvedOptions().maximumFractionDigits ?? 2,
    symbol: find('currency') ?? currency,
    symbolFirst: currencyIndex < integerIndex,
  }
  formats.set(key, format)
  return format
}

/** The localized name of a currency (`US dollars`… `Euro`), or the code where `Intl.DisplayNames` is missing. */
export function currencyName(locale: string, currency: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(currency) ?? currency
  } catch {
    return currency
  }
}

const isDigit = (char: string) => char >= '0' && char <= '9'

/**
 * The character a text uses as its decimal separator, or `''` when it has none. When both `.` and `,` appear, the
 * last one is the decimal separator (`1,234.56` and `1.234,56` both read as 1234.56, whatever the locale). A single
 * kind is the decimal separator unless it is the locale's grouping separator, so `12.5` typed in `fr-FR` (where `.`
 * is not used) still reads as 12.5, while `1.234` in `de-DE` is one thousand two hundred thirty-four.
 */
export function decimalCharOf(text: string, format: MoneyFormat): string {
  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) return lastDot > lastComma ? '.' : ','
  if (format.decimal !== '.' && format.decimal !== ',' && text.includes(format.decimal)) return format.decimal
  const single = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : ''
  if (!single) return ''
  if (single === format.decimal) return single
  return single === format.group ? '' : single
}

/**
 * Reads the amount in a typed or pasted text. Grouping separators, spaces and currency symbols are ignored; the
 * first decimal separator starts the fraction, which is cut at the currency's minor-unit digits; leading zeros are
 * dropped. `decimalChar` is the separator {@link decimalCharOf} found in the whole text, so a prefix of the text
 * (the part before the caret) reads the same way the whole does.
 */
export function parseAmount(text: string, format: MoneyFormat, allowNegative: boolean, decimalChar = decimalCharOf(text, format)): ParsedAmount {
  let negative = false
  let integer = ''
  let fraction = ''
  let hasDecimal = false
  for (const char of text) {
    if (isDigit(char)) {
      if (hasDecimal) {
        if (fraction.length < format.fractionDigits) fraction += char
      } else integer += char
    } else if (decimalChar && char === decimalChar && format.fractionDigits > 0 && !hasDecimal) {
      hasDecimal = true
    } else if ((char === '-' || char === '−') && allowNegative) {
      negative = true
    }
  }
  integer = integer.replace(/^0+(?=\d)/, '')
  return { negative, integer, fraction, hasDecimal }
}

/** Groups the integer digits the way the locale does (`1234567` → `1,234,567`). */
function groupDigits(integer: string, format: MoneyFormat): string {
  let out = ''
  for (let index = 0; index < integer.length; index++) {
    if (index > 0 && (integer.length - index) % 3 === 0) out += format.group
    out += integer[index]
  }
  return out
}

/** Writes a parsed amount back as the field shows it while typing: grouped, the fraction as typed so far. */
export function formatParsed(amount: ParsedAmount, format: MoneyFormat): string {
  if (!amount.integer && !amount.hasDecimal) return amount.negative ? '-' : ''
  const integer = groupDigits(amount.integer || '0', format)
  return `${amount.negative ? '-' : ''}${integer}${amount.hasDecimal ? format.decimal + amount.fraction : ''}`
}

/** Minor units (`'1050'`) of a parsed amount, or `''` when it holds no digit. */
export function minorUnitsOf(amount: ParsedAmount, format: MoneyFormat): string {
  if (!amount.integer && !amount.fraction) return ''
  const digits = `${amount.integer}${amount.fraction.padEnd(format.fractionDigits, '0')}`.replace(/^0+(?=\d)/, '')
  return digits === '0' || !amount.negative ? digits : `-${digits}`
}

/** A minor-unit string cleaned up: an optional minus and digits, leading zeros dropped; anything else is `''`. */
export function normalizeMinorUnits(value: unknown): string {
  if (typeof value === 'number') value = Number.isFinite(value) ? String(Math.trunc(value)) : ''
  if (typeof value === 'bigint') value = String(value)
  const text = String(value ?? '').trim()
  const match = /^(-?)0*(\d+)$/.exec(text)
  if (!match) return ''
  return match[2] === '0' ? '0' : `${match[1]}${match[2]}`
}

/** Splits minor units into a parsed amount with the full fraction (`'1050'`, 2 digits → `10` and `50`). */
export function amountOfMinorUnits(value: string, format: MoneyFormat): ParsedAmount {
  const negative = value.startsWith('-')
  const digits = (negative ? value.slice(1) : value).padStart(format.fractionDigits + 1, '0')
  const cut = digits.length - format.fractionDigits
  return { negative, integer: digits.slice(0, cut), fraction: digits.slice(cut), hasDecimal: format.fractionDigits > 0 }
}

/** The text a committed value shows: grouped, with every minor-unit digit (`'1050'` → `10.50`). */
export function formatMinorUnits(value: string, format: MoneyFormat): string {
  return value ? formatParsed(amountOfMinorUnits(value, format), format) : ''
}

/**
 * How many meaningful characters (minus, digits, decimal separator) the formatted text holds for `prefix`, the part
 * of a typed text before the caret. The minus always leads the formatted text, so it counts whenever the whole amount
 * is negative, wherever it was typed.
 */
export function caretCount(prefix: ParsedAmount, negative: boolean): number {
  const integer = prefix.integer || (prefix.hasDecimal ? '0' : '')
  return (negative ? 1 : 0) + integer.length + (prefix.hasDecimal ? 1 + prefix.fraction.length : 0)
}

/** The caret offset in a formatted `text` just after its `count`-th meaningful character. */
export function caretAfter(text: string, count: number, decimal: string): number {
  if (count <= 0) return 0
  let seen = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (isDigit(char) || char === decimal || char === '-') seen++
    if (seen === count) return index + 1
  }
  return text.length
}

/** Compares two minor-unit strings numerically without going through floating point. */
export function compareMinorUnits(a: string, b: string): number {
  const left = BigInt(a)
  const right = BigInt(b)
  return left < right ? -1 : left > right ? 1 : 0
}
